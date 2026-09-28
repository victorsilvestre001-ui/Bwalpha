// Pagamento do VIP pelo Asaas (Pix, boleto e cartão na mesma fatura) + webhook que libera o VIP.
// Variáveis: ASAAS_API_KEY, ASAAS_WEBHOOK_TOKEN, ASAAS_VIP_VALUE (padrão 197),
// ASAAS_ENV=sandbox para testes (padrão: produção).
const express = require('express');
const pool = require('./db');
const { secureCompare } = require('./secureCompare');

const router = express.Router();
const BASE = () => (process.env.ASAAS_ENV === 'sandbox' ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3');

async function asaas(path, { method = 'GET', body } = {}) {
    const res = await fetch(`${BASE()}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'TradeOnAI',
            access_token: process.env.ASAAS_API_KEY,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const msg = (data.errors || []).map((e) => e.description).join('; ') || `status ${res.status}`;
        throw new Error(`Asaas ${method} ${path}: ${msg}`);
    }
    return data;
}

// Cliente no Asaas (um por conta do site; o id fica guardado em users.asaas_customer_id).
async function ensureCustomer(user) {
    if (user.asaas_customer_id) return user.asaas_customer_id;
    const found = await asaas(`/customers?externalReference=${encodeURIComponent(String(user.id))}`);
    let id = found.data?.[0]?.id;
    if (!id) {
        const created = await asaas('/customers', {
            method: 'POST',
            body: { name: user.name || user.email, email: user.email, cpfCnpj: user.cpf, externalReference: String(user.id), notificationDisabled: true },
        });
        id = created.id;
    }
    await pool.query('UPDATE users SET asaas_customer_id = $1 WHERE id = $2', [id, user.id]);
    return id;
}

// Cria a cobrança do VIP e devolve o link da fatura (o cliente escolhe Pix, boleto ou cartão).
async function createVipCheckout(userId) {
    const { rows } = await pool.query('SELECT id, name, email, cpf, asaas_customer_id FROM users WHERE id = $1', [userId]);
    const user = rows[0];
    if (!user) throw Object.assign(new Error('Conta não encontrada'), { status: 404 });
    if (!user.cpf) throw Object.assign(new Error('Cadastre seu CPF no Perfil para continuar o pagamento.'), { status: 400 });
    const customer = await ensureCustomer(user);
    // Reaproveita uma cobrança ainda em aberto, para não criar uma nova a cada clique.
    const pending = await asaas(`/payments?customer=${customer}&status=PENDING&externalReference=${encodeURIComponent(`vip:${user.id}`)}`);
    if (pending.data?.[0]?.invoiceUrl) return pending.data[0].invoiceUrl;
    const due = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const payment = await asaas('/payments', {
        method: 'POST',
        body: {
            customer,
            billingType: 'UNDEFINED', // Pix, boleto ou cartão: o cliente escolhe na fatura
            value: Number(process.env.ASAAS_VIP_VALUE || 197),
            dueDate: due,
            description: 'TradeOn AI VIP – acesso completo (pagamento único)',
            externalReference: `vip:${user.id}`,
        },
    });
    return payment.invoiceUrl;
}

async function setVip(userId, active) {
    const r = await pool.query(
        `UPDATE users SET plan = $1, subscription_status = $2, payment_provider = 'asaas'
         WHERE id = $3 AND plan <> 'owner' RETURNING id`,
        [active ? 'vip' : 'free', active ? 'active' : 'refunded', userId]
    );
    return r.rowCount;
}

const PAID = new Set(['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED']);
const REVOKED = new Set(['PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE']);

// Webhook: o Asaas manda o token configurado no cabeçalho "asaas-access-token".
router.post('/', express.json({ limit: '200kb' }), async (req, res) => {
    const token = process.env.ASAAS_WEBHOOK_TOKEN;
    if (!token || !secureCompare(String(req.headers['asaas-access-token'] || ''), token)) {
        console.error('Webhook Asaas com token inválido.');
        return res.status(401).json({ error: 'Token inválido' });
    }
    const { event, payment } = req.body || {};
    const ref = String(payment?.externalReference || '');
    const userId = ref.startsWith('vip:') ? ref.slice(4) : null;
    console.log(`Asaas: evento=${event} cobrança=${payment?.id} forma=${payment?.billingType} conta=${userId}`);
    try {
        if (userId && PAID.has(event)) {
            const n = await setVip(userId, true);
            console.log(`Asaas: conta ${userId} VIP ✅ (${n})`);
        } else if (userId && REVOKED.has(event)) {
            await setVip(userId, false);
            console.log(`Asaas: ${event}, VIP removido da conta ${userId}`);
        }
        res.json({ received: true });
    } catch (err) {
        console.error('Erro ao processar webhook Asaas:', err.message);
        res.status(500).json({ error: 'Erro ao processar evento' });
    }
});

module.exports = { router, createVipCheckout };
