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

async function chama(verbo, cnpjContribuinte, idServico, dados, idSistema = 'PGDASD', versaoSistema = '1.0') {
  const t = await autentica();
  const contr = trial() ? '00000000000100' : cnpjContratante();
  const body = {
    contratante: { numero: contr, tipo: 2 }, autorPedidoDados: { numero: contr, tipo: 2 },
    contribuinte: { numero: trial() ? '00000000000100' : cnpjContribuinte, tipo: 2 },
    // Serviços sem parâmetro (SITFIS, pedidos de parcelamento) recebem dados vazio ("")
    pedidoDados: { idSistema, idServico, versaoSistema, dados: dados === '' ? '' : JSON.stringify(dados) },
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
const isoDe = (v) => { const s = String(v || ''); return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null; };

// Gera o DAS de uma competência (AAAA-MM). Vencido: consolida multa e juros até `pagarAte` (padrão: hoje).
// Devolve { pdf (Buffer), valor, principal, multa, juros, vencimento, pagarAte, numeroDocumento }.
async function geraDas(cnpj, competencia, { vencido = false, pagarAte } = {}) {
  const dados = { periodoApuracao: competencia.replace('-', '') };
  // A Receita exige data de consolidação DEPOIS de hoje (MSG_ISN_002): padrão = amanhã (horário de Brasília)
  if (vencido) {
    const amanha = aaaammdd(new Date(Date.now() - 3 * 3600 * 1000 + 24 * 3600 * 1000));
    const pedida = pagarAte ? pagarAte.replace(/-/g, '') : '';
    dados.dataConsolidacao = pedida && pedida >= amanha ? pedida : amanha;
  }
  const { dados: lista, mensagens: msgs } = await chama('Emitir', cnpj, 'GERARDAS12', dados);
  const das = Array.isArray(lista) ? lista[0] : lista;
  if (!das || !das.pdf) throw new ErroIntegra(`A Receita não gerou o DAS${msgs ? `: ${msgs}` : '. Confira se o PGDAS-D desta competência já foi transmitido.'}`);
  const det = das.detalhamentoDas || {};
  const v = det.valores || {};
  return {
    pdf: Buffer.from(das.pdf, 'base64'), valor: Number(v.total) || 0, principal: Number(v.principal) || 0, multa: Number(v.multa) || 0, juros: Number(v.juros) || 0,
    vencimento: isoDe(det.dataVencimento), pagarAte: isoDe(det.dataLimiteAcolhimento) || isoDe(dados.dataConsolidacao), numeroDocumento: det.numeroDocumento || '',
  };
}

// Entrega o PGDAS-D de um mês SEM MOVIMENTO (TRANSDECLARACAO11, verbo Declarar).
// Receita 0, estabelecimento sem atividades e sem comparação de valores (não há imposto).
// transmitir=false só valida (a Receita confere e devolve sem gravar).
// Devolve { idDeclaracao, transmitidaEm, mensagens, multa (MAED) e os PDFs }.
async function entregaSemMovimento(cnpj, competencia, { transmitir = true } = {}) {
  const pa = Number(competencia.replace('-', ''));
  const dados = {
    cnpjCompleto: cnpj, pa, indicadorTransmissao: !!transmitir, indicadorComparacao: false,
    declaracao: {
      tipoDeclaracao: 1, receitaPaCompetenciaInterno: 0, receitaPaCompetenciaExterno: 0,
      estabelecimentos: [{ cnpjCompleto: cnpj }],
      // A partir de 11/2026 a Receita exige a folha do mês (zero, sem empregados)
      ...(pa >= 202611 ? { folhasSalario: [{ pa, valor: 0 }] } : {}),
    },
  };
  const { dados: lista, mensagens: msgs } = await chama('Declarar', cnpj, 'TRANSDECLARACAO11', dados);
  const d = Array.isArray(lista) ? lista[0] : lista;
  if (!transmitir) return { validado: true, mensagens: msgs, valoresDevidos: (d && d.valoresDevidos) || [] };
  if (!d || !d.idDeclaracao) throw new ErroIntegra(`A Receita não confirmou a entrega${msgs ? `: ${msgs}` : '.'}`);
  const pdf = (b) => (b ? Buffer.from(b, 'base64') : null);
  const maed = d.detalhamentoDarfMaed || null;
  return {
    idDeclaracao: d.idDeclaracao, transmitidaEm: d.dataHoraTransmissao || '', mensagens: msgs,
    declaracao: pdf(d.declaracao), recibo: pdf(d.recibo), notificacaoMaed: pdf(d.notificacaoMaed), darfMaed: pdf(d.darf),
    multa: maed && maed.valores ? { total: Number(maed.valores.total) || 0, vencimento: isoDe(maed.dataVencimento), numeroDocumento: maed.numeroDocumento || '' } : null,
  };
}

// Opção pelo regime de apuração do ano (REGIMEAPURACAO / EFETUAROPCAOREGIME101). Irretratável no ano.
// A Receita exige que o texto (COMPETENCIA/CAIXA) combine com o código; se o código não bater,
// ela recusa (MSG_ISN_053) e tentamos o outro — nunca grava o regime errado.
async function opcaoRegime(cnpj, ano, regime = 'COMPETENCIA') {
  const descritivo = regime === 'CAIXA' ? 'CAIXA' : 'COMPETENCIA';
  const tentativas = descritivo === 'COMPETENCIA' ? [0, 1] : [1, 0];
  let ultimoErro;
  for (const tipoRegime of tentativas) {
    try {
      const { dados, mensagens: msgs } = await chama('Declarar', cnpj, 'EFETUAROPCAOREGIME101', { anoOpcao: Number(ano), tipoRegime, descritivoRegime: descritivo, deAcordoResolucao: true }, 'REGIMEAPURACAO');
      const d = Array.isArray(dados) ? dados[0] : dados;
      return { regime: (d && d.regimeEscolhido) || descritivo, ano: Number(ano), em: d && d.dataHoraOpcao ? String(d.dataHoraOpcao) : '', demonstrativo: d && d.demonstrativoPdf ? Buffer.from(d.demonstrativoPdf, 'base64') : null, mensagens: msgs };
    } catch (err) {
      ultimoErro = err;
      if (/MSG_ISN_052/.test(err.message)) return { regime: descritivo, ano: Number(ano), jaFeita: true, mensagens: err.message };
      if (!/MSG_ISN_053|MSG_ISN_060/.test(err.message)) throw err;
    }
  }
  throw ultimoErro;
}

// DEFIS do ano (DEFIS / TRANSDECLARACAO141) de empresa sem movimento: tudo zerado, com os sócios
// (CPF e % do capital, soma 100%). Devolve { idDefis, declaracao, recibo, mensagens }.
async function entregaDefis(cnpj, ano, { socios = [], saldoCaixaInicial = 0, saldoCaixaFinal = 0, empregadosInicio = 0, empregadosFim = 0 } = {}) {
  const lista = socios.map((s) => ({ cpf: String(s.cpf || '').replace(/\D/g, ''), rendimentosIsentos: 0, rendimentosTributaveis: 0, participacaoCapitalSocial: Number(s.participacao), irRetidoFonte: 0 }));
  if (!lista.length || lista.some((s) => s.cpf.length !== 11)) throw new ErroIntegra('Informe o CPF (11 dígitos) de cada sócio.');
  const soma = Math.round(lista.reduce((t, s) => t + s.participacaoCapitalSocial, 0) * 100) / 100;
  if (soma !== 100) throw new ErroIntegra(`A participação dos sócios precisa somar 100% (está ${soma}%).`);
  const dados = {
    ano: Number(ano),
    empresa: {
      ganhoCapital: 0, qtdEmpregadoInicial: Number(empregadosInicio) || 0, qtdEmpregadoFinal: Number(empregadosFim) || 0, receitaExportacaoDireta: 0, ganhoRendaVariavel: 0,
      socios: lista,
      estabelecimentos: [{
        cnpjCompleto: cnpj, estoqueInicial: 0, estoqueFinal: 0, saldoCaixaInicial: Number(saldoCaixaInicial) || 0, saldoCaixaFinal: Number(saldoCaixaFinal) || 0,
        aquisicoesMercadoInterno: 0, importacoes: 0, totalEntradasPorTransferencia: 0, totalSaidasPorTransferencia: 0, totalDevolucoesVendas: 0, totalEntradas: 0, totalDevolucoesCompras: 0, totalDespesas: 0,
      }],
    },
  };
  const { dados: d0, mensagens: msgs } = await chama('Declarar', cnpj, 'TRANSDECLARACAO141', dados, 'DEFIS');
  const d = Array.isArray(d0) ? d0[0] : d0;
  if (!d || !d.idDefis) throw new ErroIntegra(`A Receita não confirmou a DEFIS${msgs ? `: ${msgs}` : '.'}`);
  return { idDefis: d.idDefis, declaracao: d.declaracaoPdf ? Buffer.from(d.declaracaoPdf, 'base64') : null, recibo: d.reciboPdf ? Buffer.from(d.reciboPdf, 'base64') : null, mensagens: msgs };
}

// ---------- Situação fiscal (SITFIS) ----------
// 1) Apoiar SOLICITARPROTOCOLO91 -> protocolo e tempo de espera; 2) Emitir RELATORIOSITFIS92 -> PDF.
// Enquanto o relatório processa, a Receita responde 202/204 com novo tempo de espera.
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
let esperaSitfis = espera; // trocável nos testes

// Lê do PDF as pendências (débitos, omissões, PGFN) para o resumo do painel
function resumoSitfis(texto) {
  const t = String(texto || '').replace(/\r/g, '');
  const pendencias = [...new Set([...t.matchAll(/Pend[eê]ncia\s*-\s*([^\n]{3,120})/gi)].map((m) => m[1].trim()))];
  const semPendencia = /N[aã]o foram detectadas pend[eê]ncias/i.test(t) && !pendencias.length;
  return { regular: semPendencia || !pendencias.length, pendencias };
}

async function situacaoFiscal(cnpj) {
  const { dados: d1 } = await chama('Apoiar', cnpj, 'SOLICITARPROTOCOLO91', '', 'SITFIS', '2.0');
  const p = Array.isArray(d1) ? d1[0] : d1;
  const protocolo = p && p.protocoloRelatorio;
  if (!protocolo) throw new ErroIntegra('A Receita não devolveu o protocolo do relatório de situação fiscal.');
  let aguardar = Math.min(Math.max(Number(p.tempoEspera) || 4000, 1000), 30000);
  for (let tentativa = 1; tentativa <= 8; tentativa++) {
    await esperaSitfis(aguardar);
    try {
      const { dados: d2 } = await chama('Emitir', cnpj, 'RELATORIOSITFIS92', { protocoloRelatorio: protocolo }, 'SITFIS', '2.0');
      const r = Array.isArray(d2) ? d2[0] : d2;
      if (r && r.pdf) {
        const pdf = Buffer.from(r.pdf, 'base64');
        let texto = '';
        try { texto = (await require('pdf-parse/lib/pdf-parse.js')(pdf)).text; } catch { /* sem texto */ }
        return { pdf, ...resumoSitfis(texto) };
      }
      aguardar = Math.min(Math.max(Number(r && r.tempoEspera) || 4000, 1000), 30000);
    } catch (err) {
      if (![202, 204].includes(err.status) && !/SC02|processamento/i.test(err.message)) throw err;
    }
  }
  throw new ErroIntegra('O relatório de situação fiscal ainda está em processamento na Receita. Tente de novo em alguns minutos.');
}

// ---------- Parcelamentos do Simples (PARCSN) e do MEI (PARCMEI) ----------
const SERV_PARC = { PARCSN: { pedidos: 'PEDIDOSPARC163', parcelas: 'PARCELASPARAGERAR162', das: 'GERARDAS161' }, PARCMEI: { pedidos: 'PEDIDOSPARC203', parcelas: 'PARCELASPARAGERAR202', das: 'GERARDAS201' } };
async function parcelamentos(cnpj, { mei = false } = {}) {
  const sis = mei ? 'PARCMEI' : 'PARCSN';
  const { dados: dp } = await chama('Consultar', cnpj, SERV_PARC[sis].pedidos, '', sis);
  const pedidos = ((dp && dp.parcelamentos) || []).map((x) => ({ numero: x.numero, pedidoEm: isoDe(x.dataDoPedido), situacao: x.situacao || '', situacaoEm: isoDe(x.dataDaSituacao) }));
  let parcelas = [];
  if (pedidos.some((x) => /deferido|ativo|em parcelamento|consolidado/i.test(x.situacao))) {
    try {
      const { dados: dl } = await chama('Consultar', cnpj, SERV_PARC[sis].parcelas, '', sis);
      parcelas = ((dl && dl.listaParcela) || []).map((x) => ({ parcela: `${String(x.parcela).slice(0, 4)}-${String(x.parcela).slice(4, 6)}`, valor: Number(x.valor) || 0 }));
    } catch (err) { if (!/MSG|n[aã]o h[aá]/i.test(err.message)) throw err; }
  }
  return { modalidade: sis, pedidos, parcelas };
}
async function dasParcela(cnpj, parcela, { mei = false } = {}) {
  const sis = mei ? 'PARCMEI' : 'PARCSN';
  const { dados: d, mensagens: msgs } = await chama('Emitir', cnpj, SERV_PARC[sis].das, { parcelaParaEmitir: Number(String(parcela).replace('-', '')) }, sis);
  const r = Array.isArray(d) ? d[0] : d;
  if (!r || !r.docArrecadacaoPdfB64) throw new ErroIntegra(`A Receita não gerou o DAS da parcela${msgs ? `: ${msgs}` : '.'}`);
  return Buffer.from(r.docArrecadacaoPdfB64, 'base64');
}

// ---------- Conferência: o que foi declarado no PGDAS-D ----------
const dinheiroBr = (s) => Number(String(s || '0').replace(/\./g, '').replace(',', '.')) || 0;

// Lista do ano (CONSDECLARACAO13): por competência, se declarou, a última declaração e os DAS (pago ou não)
async function declaracoesDoAno(cnpj, ano) {
  const { dados } = await chama('Consultar', cnpj, 'CONSDECLARACAO13', { anoCalendario: String(ano) });
  const porMes = {};
  for (const p of (dados && dados.periodos) || []) {
    const comp = `${String(p.periodoApuracao).slice(0, 4)}-${String(p.periodoApuracao).slice(4, 6)}`;
    const decls = (p.operacoes || []).filter((o) => o.indiceDeclaracao);
    const das = (p.operacoes || []).filter((o) => o.indiceDas).map((o) => ({ numero: o.indiceDas.numeroDas, emitidoEm: o.indiceDas.datahoraEmissaoDas, pago: !!o.indiceDas.dasPago }));
    const ultima = decls[decls.length - 1];
    porMes[comp] = {
      declarada: decls.length > 0, retificada: decls.length > 1,
      ultima: ultima ? { tipo: ultima.tipoOperacao, numero: ultima.indiceDeclaracao.numeroDeclaracao, transmitidaEm: ultima.indiceDeclaracao.dataHoraTransmissao, malha: ultima.indiceDeclaracao.malha || '' } : null,
      das, dasPago: das.some((d) => d.pago),
    };
  }
  return porMes;
}

// Lê do PDF da declaração a receita do período (RPA) e o débito declarado
async function lePdfDeclaracao(buf) {
  const pdf = require('pdf-parse/lib/pdf-parse.js');
  const { text } = await pdf(buf);
  const t = text.replace(/\r/g, '');
  // Valores podem vir separados por espaço ("36.500,00 0,00 36.500,00") ou colados ("36.500,000,0036.500,00")
  const V = '(\\d{1,3}(?:\\.\\d{3})*,\\d{2})';
  const rpa = t.match(new RegExp(`Receita Bruta do PA \\(RPA\\) - Compet[eê]ncia\\s*${V}\\s*${V}\\s*${V}`));
  const receitaTxt = rpa ? rpa[3] : null;
  // Débito declarado: no resumo vem logo depois da receita auferida ("36.500,00 2.190,00")
  let debito = null;
  const resumo = t.slice(Math.max(0, t.search(/Resumo da Declara[cç][aã]o/)));
  if (receitaTxt) {
    const m = resumo.match(new RegExp(`${receitaTxt.replace(/\./g, '\\.')}\\s*${V}`));
    if (m) debito = dinheiroBr(m[1]);
  }
  return {
    receita: receitaTxt ? dinheiroBr(receitaTxt) : null,
    debito,
    tipo: /Declara[cç][aã]o Retificadora/i.test(t) ? 'Retificadora' : 'Original',
  };
}

// Última declaração do mês (CONSULTIMADECREC14): número + valores lidos do PDF
async function declaracaoDoMes(cnpj, competencia) {
  const { dados } = await chama('Consultar', cnpj, 'CONSULTIMADECREC14', { periodoApuracao: competencia.replace('-', '') });
  if (!dados || !dados.declaracao || !dados.declaracao.pdf) return null;
  const buf = Buffer.from(dados.declaracao.pdf, 'base64');
  const lido = await lePdfDeclaracao(buf).catch((err) => ({ receita: null, debito: null, tipo: '', erro: err.message }));
  // Quando não dá para ler os valores, devolve um trecho do texto (só ao escritório) para ajustar a leitura
  if (lido.receita == null) {
    try { const pdf = require('pdf-parse/lib/pdf-parse.js'); const { text } = await pdf(buf); lido.amostra = text.replace(/\s+\n/g, '\n').slice(0, 3000); } catch (err) { lido.amostra = `erro ao ler o PDF: ${err.message}`; }
  }
  return { numero: dados.numeroDeclaracao || '', ...lido };
}

module.exports = { situacao, geraDas, entregaSemMovimento, opcaoRegime, entregaDefis, situacaoFiscal, resumoSitfis, parcelamentos, dasParcela, _setEspera: (f) => { esperaSitfis = f || espera; }, declaracoesDoAno, declaracaoDoMes, lePdfDeclaracao, ID_CERT, trial, ErroIntegra, _setTransporte: (t) => { transporte = t || requisicao; token = null; } };
