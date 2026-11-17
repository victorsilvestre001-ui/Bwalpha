// Assinatura mensal do portal pelo Asaas (Pix, boleto ou cartão na mesma fatura).
// Variáveis: ASAAS_API_KEY, ASAAS_WEBHOOK_TOKEN, ASAAS_ENV=sandbox para testes (padrão: produção).
// Sem ASAAS_API_KEY o portal funciona, e a liberação do plano é feita pelo painel /admin.
const express = require('express');
const crypto = require('crypto');
const db = require('./db');

const BASE = () => (process.env.ASAAS_ENV === 'sandbox' ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3');
const ativo = () => !!process.env.ASAAS_API_KEY;
const DIAS_POR_PAGAMENTO = 35; // um mês + folga para a próxima cobrança compensar

async function asaas(caminho, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE()}${caminho}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'VJContabil', access_token: process.env.ASAAS_API_KEY },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data.errors || []).map((e) => e.description).join('; ') || `status ${res.status}`;
    throw new Error(`Asaas ${method} ${caminho}: ${msg}`);
  }
  return data;
}

async function clienteAsaas(u) {
  if (u.asaasClienteId) return u.asaasClienteId;
  const c = await asaas('/customers', {
    method: 'POST',
    body: { name: u.empresa ? u.empresa.razaoSocial : u.nome, email: u.email, cpfCnpj: u.cnpj, mobilePhone: u.telefone, externalReference: u.id, notificationDisabled: false },
  });
  db.atualiza('usuarios', u.id, { asaasClienteId: c.id });
  return c.id;
}

// Cria (ou reaproveita) a assinatura e devolve o link da fatura atual
async function linkAssinatura(u, plano) {
  const customer = await clienteAsaas(u);
  let assinaturaId = u.asaasAssinaturaId;
  if (!assinaturaId || u.planoId !== plano.id) {
    const hoje = new Date().toISOString().slice(0, 10);
    const a = await asaas('/subscriptions', {
      method: 'POST',
      body: { customer, billingType: 'UNDEFINED', value: plano.valor, nextDueDate: hoje, cycle: 'MONTHLY', description: `Área do Cliente V&J – plano ${plano.nome}`, externalReference: `portal:${u.id}:${plano.id}` },
    });
    assinaturaId = a.id;
    db.atualiza('usuarios', u.id, { asaasAssinaturaId: assinaturaId, planoId: plano.id });
  }
  const pagamentos = await asaas(`/subscriptions/${assinaturaId}/payments`);
  const aberto = (pagamentos.data || []).find((p) => ['PENDING', 'OVERDUE'].includes(p.status)) || (pagamentos.data || [])[0];
  return aberto && aberto.invoiceUrl;
}

function estende(u, dias) {
  const base = u.planoAte && new Date(u.planoAte) > new Date() ? new Date(u.planoAte) : new Date();
  return new Date(base.getTime() + dias * 24 * 60 * 60 * 1000).toISOString();
}

const PAGO = new Set(['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED']);
const router = express.Router();
router.post('/', express.json(), (req, res) => {
  const recebido = String(req.get('asaas-access-token') || '');
  const esperado = String(process.env.ASAAS_WEBHOOK_TOKEN || '');
  const igual = recebido.length === esperado.length && esperado && crypto.timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado));
  if (!igual) return res.status(401).end();
  const { event, payment } = req.body || {};
  const u = payment && db.acha('usuarios', (x) => x.asaasAssinaturaId && x.asaasAssinaturaId === payment.subscription);
  if (u && PAGO.has(event) && !(u.pagamentosAsaas || []).includes(payment.id)) {
    db.atualiza('usuarios', u.id, { planoAte: estende(u, DIAS_POR_PAGAMENTO), pagamentosAsaas: [...(u.pagamentosAsaas || []), payment.id].slice(-24) });
    console.log('[asaas] plano liberado para', u.email);
  } else if (u && (event === 'PAYMENT_REFUNDED' || event === 'PAYMENT_CHARGEBACK_REQUESTED')) {
    db.atualiza('usuarios', u.id, { planoAte: new Date().toISOString() });
  }
  res.json({ ok: true });
});

module.exports = { router, linkAssinatura, ativo, estende };
