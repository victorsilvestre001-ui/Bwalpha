// NF-e (modelo 55, venda) e NFC-e (modelo 65, cupom) pela API da Focus NFe (doc.focusnfe.com.br).
//   NF-e : POST /v2/nfe?ref=REF (assíncrona: 202 processando, 201 autorizada) · GET /v2/nfe/REF · DELETE /v2/nfe/REF
//   NFC-e: POST /v2/nfce?ref=REF (síncrona) · GET /v2/nfce/REF · DELETE /v2/nfce/REF
// Autenticação Basic (token da Focus, senha vazia). A empresa precisa estar cadastrada na Focus com
// certificado, inscrição estadual e, para NFC-e, o CSC da SEFAZ.
// Variáveis: FOCUS_NFE_TOKEN (produção) e FOCUS_NFE_TOKEN_HOMOLOGACAO (homologação; se faltar, usa o de produção).
// Primeira versão: empresas do Simples Nacional e MEI (ICMS por CSOSN).

const HOST = { producao: 'https://api.focusnfe.com.br', homologacao: 'https://homologacao.focusnfe.com.br' };
const tokenGeral = (amb) => (amb === 'homologacao' ? process.env.FOCUS_NFE_TOKEN_HOMOLOGACAO || process.env.FOCUS_NFE_TOKEN : process.env.FOCUS_NFE_TOKEN);
// Empresa cadastrada pelo painel: usa os tokens que a Focus devolveu para ela (guardados cifrados).
const tokenDe = (amb, emitente) => {
  const f = emitente && emitente.fiscal && emitente.fiscal.focus;
  const proprio = f && f.tokens && f.tokens[amb] ? require('./certificado').abreSelo(f.tokens[amb]) : '';
  return proprio || tokenGeral(amb);
};
const ativo = () => !!process.env.FOCUS_NFE_TOKEN;

const transportePadrao = async (url, opcoes) => {
  const r = await fetch(url, { ...opcoes, signal: AbortSignal.timeout(60000) });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};
let transporte = transportePadrao;

class ErroVenda extends Error {}

async function focus(amb, caminho, { method = 'GET', body, emitente, host } = {}) {
  const tk = tokenDe(amb, emitente);
  if (!tk) throw new ErroVenda('Falta o token da Focus NFe (FOCUS_NFE_TOKEN no Railway).');
  const r = await transporte(`${host || HOST[amb]}/v2${caminho}`, {
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
  // Remessa para conserto: sem pagamento, contribuinte, referencia a NF de compra, com transportadora e volumes
  const remessa = venda.operacao === 'conserto';
  const t = venda.transporte || {};
  const vol = t.volumes || {};
  const c = {
    natureza_operacao: remessa ? 'Remessa de mercadoria ou bem para conserto ou reparo' : 'Venda de mercadoria', data_emissao: agoraSP(), tipo_documento: 1, finalidade_emissao: 1,
    cnpj_emitente: emitente.cnpj, local_destino: interestadual ? 2 : 1, consumidor_final: contribuinte ? 0 : 1, presenca_comprador: remessa ? 9 : Number(venda.presenca || 1),
    modalidade_frete: t.modalidade !== undefined && t.modalidade !== '' ? Number(t.modalidade) : 9,
    nome_destinatario: String(d.nome || '').slice(0, 60), [doc.length === 14 ? 'cnpj_destinatario' : 'cpf_destinatario']: doc,
    indicador_inscricao_estadual_destinatario: contribuinte ? 1 : 9, ...(contribuinte ? { inscricao_estadual_destinatario: so(d.ie) } : {}),
    logradouro_destinatario: e.logradouro, numero_destinatario: e.numero || 'S/N', bairro_destinatario: e.bairro || '', municipio_destinatario: e.municipio || '', uf_destinatario: ufDest, cep_destinatario: so(e.cep),
    items: itens, formas_pagamento: remessa ? [{ forma_pagamento: '90', valor_pagamento: 0 }] : pagamento, valor_produtos: total, valor_total: total,
  };
  if (venda.referenciada) c.notas_referenciadas = [{ chave_nfe: so(venda.referenciada) }];
  if (so(t.cnpj).length === 14 || so(t.cnpj).length === 11) {
    Object.assign(c, {
      [so(t.cnpj).length === 14 ? 'cnpj_transportador' : 'cpf_transportador']: so(t.cnpj), nome_transportador: String(t.nome || '').slice(0, 60),
      ...(so(t.ie) ? { inscricao_estadual_transportador: so(t.ie) } : {}), ...(t.endereco ? { endereco_transportador: String(t.endereco).slice(0, 60) } : {}),
      ...(t.municipio ? { municipio_transportador: String(t.municipio).slice(0, 60) } : {}), ...(t.uf ? { uf_transportador: String(t.uf).toUpperCase().slice(0, 2) } : {}),
    });
  }
  if (Number(vol.quantidade) > 0 || Number(vol.pesoBruto) > 0) {
    c.volumes = [{
      quantidade: Number(vol.quantidade) || 1, ...(vol.especie ? { especie: String(vol.especie).slice(0, 60) } : {}), ...(vol.marca ? { marca: String(vol.marca).slice(0, 60) } : {}),
      ...(vol.numeracao ? { numero: String(vol.numeracao).slice(0, 60) } : {}), ...(Number(vol.pesoBruto) > 0 ? { peso_bruto: dec(vol.pesoBruto, 3) } : {}), ...(Number(vol.pesoLiquido) > 0 ? { peso_liquido: dec(vol.pesoLiquido, 3) } : {}),
    }];
  }
  if (venda.informacoes) c.informacoes_adicionais_contribuinte = String(venda.informacoes).slice(0, 2000);
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
  const r = await focus(amb, `/${venda.modelo}?ref=${encodeURIComponent(venda.id)}`, { method: 'POST', body: c, emitente });
  return resultado(r, amb);
}
async function consulta(venda, amb, emitente) { return resultado(await focus(amb, `/${venda.modelo}/${encodeURIComponent(venda.id)}`, { emitente }), amb); }
async function cancela(venda, justificativa, amb, emitente) {
  const j = String(justificativa || '').trim();
  if (j.length < 15) throw new ErroVenda('Explique o motivo do cancelamento (mínimo 15 caracteres).');
  const r = await focus(amb, `/${venda.modelo}/${encodeURIComponent(venda.id)}`, { method: 'DELETE', body: { justificativa: j.slice(0, 255) }, emitente });
  if (r.status !== 'cancelado') throw new ErroVenda(r.mensagem_sefaz || 'Não foi possível cancelar.');
  return { status: 'cancelada' };
}

// Cadastro da empresa na Focus (API de Empresas: só produção, token master do escritório).
// dados: { ie, cscProducao, idTokenProducao, cscHomologacao, idTokenHomologacao }; cert: { pfx, senha } ou null.
async function cadastraEmpresa(u, dados, cert) {
  const e = u.empresa || {};
  const end = e.endereco || {};
  if (!(end.logradouro || e.logradouro) || !(end.cep || e.cep)) throw new ErroVenda('O endereço da empresa está incompleto (rua e CEP). Atualize os dados do CNPJ da empresa e tente de novo.');
  const num = (v) => (so(v) ? Number(so(v)) : undefined);
  const corpoEmp = {
    nome: e.razaoSocial || u.nome, nome_fantasia: e.nomeFantasia || undefined, cnpj: so(u.cnpj),
    inscricao_estadual: num(dados.ie), regime_tributario: e.mei ? 4 : 1,
    email: u.email || undefined, telefone: so(u.telefone) || undefined,
    logradouro: end.logradouro || e.logradouro, numero: end.numero || e.numero || 'SN', complemento: end.complemento || e.complemento || undefined,
    bairro: end.bairro || e.bairro, cep: num(end.cep || e.cep), municipio: end.municipio || e.municipio, uf: end.uf || e.uf,
    habilita_nfe: true, habilita_nfce: true, enviar_email_destinatario: false, discrimina_impostos: true,
    ...(dados.cscProducao ? { csc_nfce_producao: dados.cscProducao, id_token_nfce_producao: num(dados.idTokenProducao) } : {}),
    ...(dados.cscHomologacao ? { csc_nfce_homologacao: dados.cscHomologacao, id_token_nfce_homologacao: num(dados.idTokenHomologacao) } : {}),
    ...(cert ? { arquivo_certificado_base64: Buffer.from(cert.pfx).toString('base64'), senha_certificado: cert.senha } : {}),
  };
  Object.keys(corpoEmp).forEach((k) => corpoEmp[k] === undefined && delete corpoEmp[k]);
  const atual = u.fiscal && u.fiscal.focus && u.fiscal.focus.id;
  const r = await focus('producao', atual ? `/empresas/${atual}` : '/empresas', { method: atual ? 'PUT' : 'POST', body: corpoEmp, host: HOST.producao });
  return { id: r.id || atual, tokenProducao: r.token_producao || '', tokenHomologacao: r.token_homologacao || '', certificadoValidoAte: r.certificado_valido_ate || '' };
}

// Página para imprimir o cupom na impressora térmica: busca o DANFE NFC-e oficial (HTML da Focus),
// ajusta para bobina de 80 mm (ou 58 mm) e chama a impressão sozinha. Só aceita links da própria Focus.
const buscaHtmlPadrao = async (url) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new ErroVenda(`A Focus não devolveu o cupom (${r.status}).`);
  return r.text();
};
let buscaHtml = buscaHtmlPadrao;
function paginaImpressao(html, url, { largura = 80, nonce = '' } = {}) {
  const origem = new URL(url).origin;
  const mm = largura === 58 ? 58 : 80;
  const extra = `<base href="${origem}/"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
@page { size: ${mm}mm auto; margin: 2mm; }
html, body { background: #fff; }
body { width: ${mm - 4}mm; margin: 0 auto !important; }
img, table { max-width: 100% !important; }
.vj-barra { position: sticky; top: 0; display: flex; gap: 8px; justify-content: center; padding: 10px; background: #0b2545; font: 14px system-ui, sans-serif; }
.vj-barra button { font: inherit; padding: 8px 14px; border-radius: 8px; border: 0; cursor: pointer; }
.vj-barra .vj-imp { background: #c9a227; color: #0b2545; font-weight: 700; }
@media print { .vj-barra { display: none !important; } }
</style>`;
  const barra = `<div class="vj-barra"><button class="vj-imp" id="vjImp">Imprimir de novo</button><button id="vjFecha">Fechar</button></div>
<script nonce="${nonce}">
document.getElementById('vjImp').onclick = function () { window.print(); };
document.getElementById('vjFecha').onclick = function () { window.close(); };
window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 300); });
</script>`;
  let h = String(html || '');
  h = /<head[^>]*>/i.test(h) ? h.replace(/<head[^>]*>/i, (m) => `${m}${extra}`) : `<!doctype html><html><head>${extra}</head><body>${h}</body></html>`;
  h = /<body[^>]*>/i.test(h) ? h.replace(/<body[^>]*>/i, (m) => `${m}${barra}`) : `${h}${barra}`;
  return h;
}
async function cupomParaImprimir(venda, opcoes = {}) {
  const url = String(venda.danfe || '');
  if (!Object.values(HOST).some((h) => url.startsWith(`${h}/`))) throw new ErroVenda('Este cupom ainda não tem o arquivo para imprimir.');
  return paginaImpressao(await buscaHtml(url), url, opcoes);
}

module.exports = {
  ativo, cadastraEmpresa, emite, consulta, cancela, corpo, item, cupomParaImprimir, paginaImpressao, ErroVenda,
  _setTransporte: (f) => { transporte = f || transportePadrao; },
  _setBuscaHtml: (f) => { buscaHtml = f || buscaHtmlPadrao; },
};
