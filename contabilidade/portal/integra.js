// Integra Contador (SERPRO): DAS do Simples direto da Receita, sem anexar nada.
// Documentação: https://apicenter.estaleiro.serpro.gov.br/documentacao/api-integra-contador/
//   Autenticação: POST https://autenticacao.sapi.serpro.gov.br/authenticate (Basic key:secret, role-type TERCEIROS,
//   TLS com o e-CNPJ do contratante) -> access_token + jwt_token
//   Emitir DAS:   POST {gateway}/Emitir  idSistema PGDASD, idServico GERARDAS12, dados { periodoApuracao, dataConsolidacao? }
// Variáveis: INTEGRA_CONSUMER_KEY, INTEGRA_CONSUMER_SECRET, INTEGRA_CNPJ (contratante; padrão VIMARI) e
// INTEGRA_TRIAL=1 (API de demonstração, sem custo, com dados fictícios).
// O e-CNPJ do contratante é enviado pelo painel do escritório e guardado cifrado (certificado.js, id "integra-contratante").
const https = require('https');
const certificado = require('./certificado');

const ID_CERT = 'integra-contratante';
const TRIAL_TOKEN = '06aef429-a981-3ec5-a1f8-71d38d86481e'; // token público da demonstração
const trial = () => process.env.INTEGRA_TRIAL === '1';
const cnpjContratante = () => String(process.env.INTEGRA_CNPJ || '24961340000147').replace(/\D/g, '');
const GATEWAY = () => (trial() ? 'https://gateway.apiserpro.serpro.gov.br/integra-contador-trial/v1' : 'https://gateway.apiserpro.serpro.gov.br/integra-contador/v1');

function situacao() {
  if (trial()) return { ativo: true, modo: 'demonstracao', contratante: cnpjContratante() };
  const chaves = !!(process.env.INTEGRA_CONSUMER_KEY && process.env.INTEGRA_CONSUMER_SECRET);
  const cert = !!certificado.carrega(ID_CERT);
  return { ativo: chaves && cert, modo: 'producao', contratante: cnpjContratante(), chaves, certificado: cert };
}

class ErroIntegra extends Error {
  constructor(msg, status) { super(msg); this.status = status; }
}

function requisicao({ url, method = 'POST', headers = {}, body, pfx, senha }) {
  return new Promise((resolve, reject) => {
    const dados = body == null ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
    const h = { ...headers };
    if (dados) h['Content-Length'] = dados.length;
    const req = https.request(url, { method, headers: h, pfx, passphrase: senha, timeout: 60000 }, (res) => {
      const partes = [];
      res.on('data', (c) => partes.push(c));
      res.on('end', () => {
        const txt = Buffer.concat(partes).toString('utf8');
        let json = null;
        try { json = txt ? JSON.parse(txt) : null; } catch { json = { bruto: txt.slice(0, 500) }; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('timeout', () => req.destroy(new ErroIntegra('O SERPRO não respondeu a tempo. Tente de novo.')));
    req.on('error', reject);
    if (dados) req.write(dados);
    req.end();
  });
}
let transporte = requisicao; // trocado nos testes

let token = null;
async function autentica() {
  if (trial()) return { access: TRIAL_TOKEN, jwt: null };
  if (token && token.expira > Date.now()) return token;
  const cert = certificado.carrega(ID_CERT);
  if (!cert) throw new ErroIntegra('Envie o e-CNPJ do escritório (contratante do Integra Contador) no painel.');
  if (!process.env.INTEGRA_CONSUMER_KEY || !process.env.INTEGRA_CONSUMER_SECRET) throw new ErroIntegra('Faltam as chaves do Integra Contador (INTEGRA_CONSUMER_KEY e INTEGRA_CONSUMER_SECRET no Railway).');
  const basic = Buffer.from(`${process.env.INTEGRA_CONSUMER_KEY}:${process.env.INTEGRA_CONSUMER_SECRET}`).toString('base64');
  const r = await transporte({
    url: 'https://autenticacao.sapi.serpro.gov.br/authenticate',
    headers: { Authorization: `Basic ${basic}`, 'role-type': 'TERCEIROS', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials', pfx: cert.pfx, senha: cert.senha,
  });
  if (r.status !== 200 || !r.json || !r.json.access_token) throw new ErroIntegra(`Não autenticou no SERPRO (${r.status}). Confira as chaves e o certificado do escritório.`, r.status);
  token = { access: r.json.access_token, jwt: r.json.jwt_token, expira: Date.now() + (Number(r.json.expires_in || 1800) - 60) * 1000 };
  return token;
}

const mensagens = (j) => ((j && j.mensagens) || []).map((m) => [m.codigo, m.texto].filter(Boolean).join(' ')).join(' | ');

async function chama(verbo, cnpjContribuinte, idServico, dados) {
  const t = await autentica();
  const contr = trial() ? '00000000000100' : cnpjContratante();
  const body = {
    contratante: { numero: contr, tipo: 2 }, autorPedidoDados: { numero: contr, tipo: 2 },
    contribuinte: { numero: trial() ? '00000000000100' : cnpjContribuinte, tipo: 2 },
    pedidoDados: { idSistema: 'PGDASD', idServico, versaoSistema: '1.0', dados: JSON.stringify(dados) },
  };
  const headers = { Authorization: `Bearer ${t.access}`, 'Content-Type': 'application/json', accept: 'text/plain' };
  if (t.jwt) headers.jwt_token = t.jwt;
  let r;
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    r = await transporte({ url: `${GATEWAY()}/${verbo}`, headers, body });
    if (r.status === 401 && !trial()) { token = null; const t2 = await autentica(); headers.Authorization = `Bearer ${t2.access}`; if (t2.jwt) headers.jwt_token = t2.jwt; continue; }
    if (r.status === 429 || r.status >= 500) { await new Promise((ok) => setTimeout(ok, 1500 * tentativa)); continue; }
    break;
  }
  const j = r.json || {};
  if (r.status !== 200 || (j.status && j.status !== 200)) throw new ErroIntegra(mensagens(j) || `O SERPRO respondeu ${r.status}.`, r.status);
  let lista = j.dados;
  if (typeof lista === 'string') { try { lista = JSON.parse(lista); } catch { lista = null; } }
  return { dados: lista, mensagens: mensagens(j) };
}

const aaaammdd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
const isoDe = (s) => (/^\d{8}$/.test(String(s || '')) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null);

// Gera o DAS de uma competência (AAAA-MM). Vencido: consolida multa e juros até `pagarAte` (padrão: hoje).
// Devolve { pdf (Buffer), valor, principal, multa, juros, vencimento, pagarAte, numeroDocumento }.
async function geraDas(cnpj, competencia, { vencido = false, pagarAte } = {}) {
  const dados = { periodoApuracao: competencia.replace('-', '') };
  if (vencido) dados.dataConsolidacao = pagarAte ? pagarAte.replace(/-/g, '') : aaaammdd(new Date(Date.now() - 3 * 3600 * 1000));
  const { dados: lista } = await chama('Emitir', cnpj, 'GERARDAS12', dados);
  const das = Array.isArray(lista) ? lista[0] : lista;
  if (!das || !das.pdf) throw new ErroIntegra('O SERPRO não devolveu o PDF do DAS. Confira se o PGDAS-D desta competência já foi transmitido.');
  const det = das.detalhamentoDas || {};
  const v = det.valores || {};
  return {
    pdf: Buffer.from(das.pdf, 'base64'), valor: Number(v.total) || 0, principal: Number(v.principal) || 0, multa: Number(v.multa) || 0, juros: Number(v.juros) || 0,
    vencimento: isoDe(det.dataVencimento), pagarAte: isoDe(det.dataLimiteAcolhimento) || isoDe(dados.dataConsolidacao), numeroDocumento: det.numeroDocumento || '',
  };
}

module.exports = { situacao, geraDas, ID_CERT, trial, ErroIntegra, _setTransporte: (t) => { transporte = t || requisicao; token = null; } };
