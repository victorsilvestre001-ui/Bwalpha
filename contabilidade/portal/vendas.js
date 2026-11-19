// NF-e (modelo 55, venda) e NFC-e (modelo 65, cupom) pela API da Focus NFe (doc.focusnfe.com.br).
//   NF-e : POST /v2/nfe?ref=REF (assíncrona: 202 processando, 201 autorizada) · GET /v2/nfe/REF · DELETE /v2/nfe/REF
//   NFC-e: POST /v2/nfce?ref=REF (síncrona) · GET /v2/nfce/REF · DELETE /v2/nfce/REF
// Autenticação Basic (token da Focus, senha vazia). A empresa precisa estar cadastrada na Focus com
// certificado, inscrição estadual e, para NFC-e, o CSC da SEFAZ.
// Variáveis: FOCUS_NFE_TOKEN (produção) e FOCUS_NFE_TOKEN_HOMOLOGACAO (homologação; se faltar, usa o de produção).
// Primeira versão: empresas do Simples Nacional e MEI (ICMS por CSOSN).

const HOST = { producao: 'https://api.focusnfe.com.br', homologacao: 'https://homologacao.focusnfe.com.br' };
const tokenDe = (amb) => (amb === 'homologacao' ? process.env.FOCUS_NFE_TOKEN_HOMOLOGACAO || process.env.FOCUS_NFE_TOKEN : process.env.FOCUS_NFE_TOKEN);
const ativo = () => !!process.env.FOCUS_NFE_TOKEN;

const transportePadrao = async (url, opcoes) => {
  const r = await fetch(url, { ...opcoes, signal: AbortSignal.timeout(60000) });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};
let transporte = transportePadrao;

class ErroVenda extends Error {}

async function focus(amb, caminho, { method = 'GET', body } = {}) {
  const tk = tokenDe(amb);
  if (!tk) throw new ErroVenda('Falta o token da Focus NFe (FOCUS_NFE_TOKEN no Railway).');
  const r = await transporte(`${HOST[amb]}/v2${caminho}`, {
    method,
    headers: { Authorization: `Basic ${Buffer.from(`${tk}:`).toString('base64')}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = r.json || {};
  if (r.status >= 400) {
    const msg = j.mensagem || (j.erros || []).map((e) => e.mensagem).join('; ') || j.mensagem_sefaz || `Focus respondeu ${r.status}`;
    throw new ErroVenda(msg);
  }
  return { status: r.status, ...j };
}

const r2 = (v) => Math.round(Number(v || 0) * 100) / 100;
const dec = (v, c = 2) => Number(Number(v || 0).toFixed(c));
const agoraSP = () => `${new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 19)}-03:00`;
const so = (v) => String(v || '').replace(/\D/g, '');

// Produto cadastrado -> item da nota. CFOP: venda dentro do estado 5102; fora, troca o 1º dígito por 6.
function item(p, i, { interestadual = false } = {}) {
  const cfop = String(p.cfop || '5102');
  const q = Number(p.quantidade) || 1;
  const v = r2(p.valor);
  return {
    numero_item: i + 1,
    codigo_produto: String(p.codigo || i + 1).slice(0, 60),
    descricao: String(p.descricao).slice(0, 120),
    cfop: interestadual && cfop[0] === '5' ? `6${cfop.slice(1)}` : cfop,
    codigo_ncm: so(p.ncm),
    unidade_comercial: (p.unidade || 'UN').toUpperCase().slice(0, 6),
    quantidade_comercial: dec(q, 4),
    valor_unitario_comercial: dec(v, 4),
    unidade_tributavel: (p.unidade || 'UN').toUpperCase().slice(0, 6),
    quantidade_tributavel: dec(q, 4),
    valor_unitario_tributavel: dec(v, 4),
    valor_bruto: r2(q * v),
    icms_origem: Number(p.origem || 0),
    icms_situacao_tributaria: String(p.csosn || '102'),
    pis_situacao_tributaria: String(p.pisCst || '49'),
    cofins_situacao_tributaria: String(p.pisCst || '49'),
  };
}

// Monta o corpo da nota. venda: { modelo: 'nfe'|'nfce', itens:[{...produto, quantidade, valor}], pagamento, destinatario }
function corpo(venda, emitente) {
  const ufEmit = String((emitente.empresa && emitente.empresa.uf) || '').toUpperCase();
  const d = venda.destinatario || {};
  const ufDest = String(d.uf || ufEmit).toUpperCase();
  const interestadual = venda.modelo === 'nfe' && !!d.uf && ufDest !== ufEmit;
  const itens = venda.itens.map((p, i) => item(p, i, { interestadual }));
  const total = r2(itens.reduce((t, x) => t + x.valor_bruto, 0));
  const pagamento = [{ forma_pagamento: String(venda.pagamento || '01').padStart(2, '0'), valor_pagamento: total }];
  if (venda.modelo === 'nfce') {
    const c = { cnpj_emitente: emitente.cnpj, data_emissao: agoraSP(), natureza_operacao: 'Venda ao consumidor', presenca_comprador: 1, modalidade_frete: 9, local_destino: 1, items: itens, formas_pagamento: pagamento };
    if (so(d.documento).length === 11) c.cpf_destinatario = so(d.documento);
    else if (so(d.documento).length === 14) c.cnpj_destinatario = so(d.documento);
    if (d.nome) c.nome_destinatario = String(d.nome).slice(0, 60);
    return { corpo: c, total };
  }
  const doc = so(d.documento);
  if (doc.length !== 11 && doc.length !== 14) throw new ErroVenda('Na NF-e informe o CPF ou CNPJ do cliente.');
  const e = d.endereco || {};
  if (!e.logradouro || !e.codigoMunicipio || !e.cep) throw new ErroVenda('Na NF-e o endereço do cliente é obrigatório (CEP e número).');
  const contribuinte = doc.length === 14 && so(d.ie).length > 0;
  const c = {
    natureza_operacao: 'Venda de mercadoria', data_emissao: agoraSP(), tipo_documento: 1, finalidade_emissao: 1,
    cnpj_emitente: emitente.cnpj, local_destino: interestadual ? 2 : 1, consumidor_final: contribuinte ? 0 : 1, presenca_comprador: Number(venda.presenca || 1), modalidade_frete: 9,
    nome_destinatario: String(d.nome || '').slice(0, 60), [doc.length === 14 ? 'cnpj_destinatario' : 'cpf_destinatario']: doc,
    indicador_inscricao_estadual_destinatario: contribuinte ? 1 : 9, ...(contribuinte ? { inscricao_estadual_destinatario: so(d.ie) } : {}),
    logradouro_destinatario: e.logradouro, numero_destinatario: e.numero || 'S/N', bairro_destinatario: e.bairro || '', municipio_destinatario: e.municipio || '', uf_destinatario: ufDest, cep_destinatario: so(e.cep),
    items: itens, formas_pagamento: pagamento, valor_produtos: total, valor_total: total,
  };
  return { corpo: c, total };
}

// Converte a resposta da Focus nos campos guardados no site (links completos para DANFE e XML)
function resultado(r, amb) {
  const url = (p) => (p ? (/^https?:/.test(p) ? p : `${HOST[amb]}${p}`) : '');
  const st = r.status === 'autorizado' ? 'emitida' : r.status === 'cancelado' ? 'cancelada' : r.status === 'erro_autorizacao' || r.status === 'denegado' ? 'erro' : 'processando';
  return {
    status: st, numero: r.numero || '', serie: r.serie || '', chave: r.chave_nfe || '', danfe: url(r.caminho_danfe), xml: url(r.caminho_xml_nota_fiscal), qrcode: r.qrcode_url || '',
    erro: st === 'erro' ? (r.mensagem_sefaz || (r.erros || []).map((x) => x.mensagem).join('; ') || 'Rejeitada pela SEFAZ') : '',
  };
}

async function emite(venda, emitente, amb) {
  const { corpo: c } = corpo(venda, emitente);
  const r = await focus(amb, `/${venda.modelo}?ref=${encodeURIComponent(venda.id)}`, { method: 'POST', body: c });
  return resultado(r, amb);
}
async function consulta(venda, amb) { return resultado(await focus(amb, `/${venda.modelo}/${encodeURIComponent(venda.id)}`), amb); }
async function cancela(venda, justificativa, amb) {
  const j = String(justificativa || '').trim();
  if (j.length < 15) throw new ErroVenda('Explique o motivo do cancelamento (mínimo 15 caracteres).');
  const r = await focus(amb, `/${venda.modelo}/${encodeURIComponent(venda.id)}`, { method: 'DELETE', body: { justificativa: j.slice(0, 255) } });
  if (r.status !== 'cancelado') throw new ErroVenda(r.mensagem_sefaz || 'Não foi possível cancelar.');
  return { status: 'cancelada' };
}

module.exports = { ativo, emite, consulta, cancela, corpo, item, ErroVenda, _setTransporte: (f) => { transporte = f || transportePadrao; } };
