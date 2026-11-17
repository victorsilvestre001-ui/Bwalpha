// Análise de recuperação de tributos a partir dos XMLs de NF-e/NFC-e de venda.
// Encontra (1) receita de produtos monofásicos de PIS/Cofins e (2) receita com ICMS já
// recolhido por substituição tributária, e calcula mês a mês o que pode ter sido pago a mais
// no DAS se essas receitas não foram separadas no PGDAS-D (LC 123/2006, art. 18, §4-A).
// É uma análise PRELIMINAR: o contador confere com os extratos do PGDAS-D antes de pedir.

const { XMLParser } = require('fast-xml-parser');
const yauzl = require('yauzl');
const { aliquotaEfetiva, REGRAS } = require('../public/tributos');

// NCMs monofásicos (prefixos). Fontes: Lei 10.147/2000 (medicamentos e perfumaria; a 33.06
// saiu com a Lei 12.839/2013), Lei 10.485/2002 (autopeças: núcleo), Lei 10.833/2003 e
// 13.097/2015 (bebidas frias), Lei 9.718/1998 (combustíveis). Exceções "Ex" da TIPI não
// aparecem no XML: o contador confere os casos de fronteira.
const MONOFASICOS = [
  { prefixos: ['3003', '3004'], categoria: 'Medicamentos', base: 'Lei 10.147/2000, art. 1º, I', excecoes: ['30039056', '30049046'] },
  { prefixos: ['3303', '3304', '3305', '3307', '34011190', '34012010', '96032100'], categoria: 'Perfumaria, cosméticos e higiene', base: 'Lei 10.147/2000, art. 1º, II' },
  { prefixos: ['2201', '2202', '2203'], categoria: 'Bebidas frias (água, refrigerante, cerveja)', base: 'Lei 13.097/2015 (bebidas frias)' },
  { prefixos: ['27101259', '27101921', '27111910', '22071010', '22072010'], categoria: 'Combustíveis', base: 'Lei 9.718/1998, arts. 4º e 5º' },
  { prefixos: ['4011', '4013', '8708'], categoria: 'Autopeças e pneus', base: 'Lei 10.485/2002 (arts. 3º e 5º e anexos)' },
];
const CATEGORIA_CST04 = { categoria: 'Outros itens marcados como monofásicos na nota (CST 04)', base: 'Conferir na lei do produto (ex.: Anexos da Lei 10.485/2002)' };

// CFOPs de venda (5.1xx, 5.4xx, 6.1xx, 6.4xx e 7.1xx). Devoluções, remessas e transferências ficam de fora.
const ehVenda = (cfop) => /^[567](1|4)0[0-9]$|^[567]1[0-9][0-9]$/.test(String(cfop)) && !/^[56]9/.test(String(cfop));

function classifica(ncm, cstPis) {
  const n = String(ncm || '');
  for (const g of MONOFASICOS) {
    if ((g.excecoes || []).some((e) => n.startsWith(e))) continue;
    if (g.prefixos.some((p) => n.startsWith(p))) return g;
  }
  if (String(cstPis) === '04') return CATEGORIA_CST04;
  return null;
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', removeNSPrefix: true, parseTagValue: false, isArray: (nome) => nome === 'det' });

const num = (v) => Number(String(v || '0').replace(',', '.')) || 0;

// Primeiro grupo de imposto encontrado (ICMS00, ICMSSN102, PISAliq, PISOutr…)
function grupo(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const k = Object.keys(obj).find((x) => typeof obj[x] === 'object');
  return k ? obj[k] : obj;
}

// Lê um XML. Devolve { tipo: 'nfe', ... } para notas, { tipo: 'cancelamento', chave } para
// eventos de cancelamento, ou null quando não é documento fiscal reconhecido.
function lerXml(texto) {
  let x;
  try { x = parser.parse(texto); } catch { return null; }
  const ev = x.procEventoNFe || x.eventoNFe;
  if (ev) {
    const inf = (ev.evento || ev).infEvento || {};
    return String(inf.tpEvento) === '110111' ? { tipo: 'cancelamento', chave: String(inf.chNFe || '') } : null;
  }
  const nfe = (x.nfeProc && x.nfeProc.NFe) || x.NFe;
  const inf = nfe && nfe.infNFe;
  if (!inf) return null;
  const ide = inf.ide || {};
  const itens = (inf.det || []).map((d) => {
    const p = d.prod || {};
    const imp = d.imposto || {};
    const icms = grupo(imp.ICMS);
    const pis = grupo(imp.PIS);
    const valor = num(p.vProd) - num(p.vDesc) + num(p.vOutro) + num(p.vFrete) + num(p.vSeg);
    return {
      ncm: String(p.NCM || ''), cfop: String(p.CFOP || ''), descricao: String(p.xProd || '').slice(0, 80), valor,
      cstPis: String(pis.CST || ''), st: ['500'].includes(String(icms.CSOSN || '')) || ['60'].includes(String(icms.CST || '')),
    };
  });
  return {
    tipo: 'nfe',
    chave: String(inf['@Id'] || '').replace(/^NFe/, ''),
    cnpjEmitente: String((inf.emit && inf.emit.CNPJ) || ''),
    saida: String(ide.tpNF) === '1',
    normal: !ide.finNFe || String(ide.finNFe) === '1',
    modelo: String(ide.mod || ''),
    data: String(ide.dhEmi || ide.dEmi || '').slice(0, 10),
    itens,
  };
}

// Abre um .zip (em memória) e chama `cada(nome, texto)` para cada XML dentro dele
function lerZip(buffer, cada) {
  return new Promise((ok, falha) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err) return falha(err);
      zip.on('error', falha);
      zip.on('end', ok);
      zip.on('entry', (e) => {
        if (!/\.xml$/i.test(e.fileName) || e.uncompressedSize > 5 * 1024 * 1024) return zip.readEntry();
        zip.openReadStream(e, (err2, st) => {
          if (err2) return falha(err2);
          const partes = [];
          st.on('data', (c) => partes.push(c));
          st.on('end', () => { cada(e.fileName, Buffer.concat(partes).toString('utf8')); zip.readEntry(); });
        });
      });
      zip.readEntry();
    });
  });
}

// ---------- Acumulador (guardado entre os envios de arquivos) ----------
// Cada nota fica guardada com o que somou (sem dados do comprador), para que um
// cancelamento recebido depois possa ser descontado.
function novoAcumulador() {
  return { notas: {}, produtos: {}, canceladas: [], contagem: { arquivos: 0, notas: 0, ignoradasEntrada: 0, ignoradasOutroCnpj: 0, ignoradasNaoVenda: 0, duplicadas: 0, invalidos: 0 } };
}

function acumula(acc, doc, cnpjEmpresa) {
  const c = acc.contagem;
  if (!doc) { c.invalidos++; return; }
  if (doc.tipo === 'cancelamento') { if (doc.chave && !acc.canceladas.includes(doc.chave)) acc.canceladas.push(doc.chave); return; }
  if (!doc.chave || !/^\d{4}-\d{2}/.test(doc.data)) { c.invalidos++; return; }
  if (acc.notas[doc.chave]) { c.duplicadas++; return; }
  if (doc.cnpjEmitente && cnpjEmpresa && doc.cnpjEmitente.slice(0, 8) !== cnpjEmpresa.slice(0, 8)) { c.ignoradasOutroCnpj++; return; }
  if (!doc.saida) { c.ignoradasEntrada++; return; }
  if (!doc.normal) { c.ignoradasNaoVenda++; return; }
  c.notas++;
  const n = { mes: doc.data.slice(0, 7), total: 0, mono: {}, st: 0, prods: {} };
  for (const it of doc.itens) {
    if (!ehVenda(it.cfop)) continue;
    n.total += it.valor;
    const g = classifica(it.ncm, it.cstPis);
    if (g) {
      n.mono[g.categoria] = (n.mono[g.categoria] || 0) + it.valor;
      const k = `${it.ncm}|${it.descricao}`;
      if (!acc.produtos[k]) acc.produtos[k] = { ncm: it.ncm, descricao: it.descricao, categoria: g.categoria };
      n.prods[k] = (n.prods[k] || 0) + it.valor;
    }
    if (it.st) n.st += it.valor;
  }
  acc.notas[doc.chave] = n;
}

// Soma as notas por mês, sem as canceladas
function porMes(acc) {
  const canc = new Set(acc.canceladas);
  const meses = {};
  const prods = {};
  let canceladas = 0;
  for (const [chave, n] of Object.entries(acc.notas)) {
    if (canc.has(chave)) { canceladas++; continue; }
    const m = meses[n.mes] || (meses[n.mes] = { total: 0, mono: {}, st: 0, notas: 0 });
    m.notas++;
    m.total += n.total;
    m.st += n.st;
    for (const [k, v] of Object.entries(n.mono)) m.mono[k] = (m.mono[k] || 0) + v;
    for (const [k, v] of Object.entries(n.prods)) prods[k] = (prods[k] || 0) + v;
  }
  return { meses, prods, canceladas };
}

// ---------- Relatório ----------
const DIA = 24 * 60 * 60 * 1000;
function faixaI(rbt12) {
  const t = REGRAS.simples.anexos.I;
  for (let i = 0; i < t.length; i++) if (rbt12 <= t[i][0]) return i;
  return t.length - 1;
}

function relatorio(acc, { regime = 'simples', hoje = new Date() } = {}) {
  const { meses: porM, prods, canceladas } = porMes(acc);
  const limite = new Date(hoje.getTime() - 5 * 365.25 * DIA).toISOString().slice(0, 7);
  const meses = Object.keys(porM).sort();
  const part = REGRAS.simples.partilha.I;
  const linhas = [];
  let totalPis = 0;
  let totalIcms = 0;
  for (const mes of meses) {
    const m = porM[mes];
    const mono = Object.values(m.mono).reduce((t, v) => t + v, 0);
    // RBT12: receita dos 12 meses anteriores enviados; com menos meses, anualiza a média
    const anteriores = meses.filter((x) => x < mes).slice(-12);
    const base = anteriores.length ? anteriores.reduce((t, x) => t + porM[x].total, 0) : m.total;
    const rbt12 = anteriores.length >= 12 ? base : (base / Math.max(1, anteriores.length || 1)) * 12;
    let pis = 0;
    let icms = 0;
    let aliq = 0;
    if (regime === 'simples') {
      aliq = aliquotaEfetiva('I', rbt12);
      const f = faixaI(rbt12);
      pis = mono * aliq * (part.pis[f] + part.cofins[f]);
      icms = m.st * aliq * part.icms[f];
    } else {
      pis = mono * REGRAS.presumido.pisCofins; // cumulativo 3,65% (no Lucro Real seria 9,25%)
    }
    const dentroPrazo = mes >= limite;
    if (dentroPrazo) { totalPis += pis; totalIcms += icms; }
    linhas.push({ mes, receita: m.total, monofasica: mono, comSt: m.st, aliquotaEfetiva: aliq, pisCofins: pis, icms, notas: m.notas, dentroPrazo });
  }
  const categorias = {};
  for (const m of Object.values(porM)) for (const [k, v] of Object.entries(m.mono)) categorias[k] = (categorias[k] || 0) + v;
  const produtos = Object.entries(prods).map(([k, valor]) => ({ ...acc.produtos[k], valor })).sort((a, b) => b.valor - a.valor).slice(0, 25);
  const receita = linhas.reduce((t, l) => t + l.receita, 0);
  const avisos = [];
  const c = acc.contagem;
  if (c.ignoradasEntrada) avisos.push(`${c.ignoradasEntrada} nota(s) de entrada (compras) foram ignoradas: para esta análise só valem as vendas.`);
  if (c.ignoradasOutroCnpj) avisos.push(`${c.ignoradasOutroCnpj} nota(s) emitidas por outra empresa foram ignoradas.`);
  if (c.duplicadas) avisos.push(`${c.duplicadas} nota(s) repetidas foram contadas uma vez só.`);
  if (c.invalidos) avisos.push(`${c.invalidos} arquivo(s) não eram notas fiscais eletrônicas (NF-e/NFC-e) e foram ignorados.`);
  if (canceladas) avisos.push(`${canceladas} nota(s) canceladas foram descontadas do cálculo.`);
  if (linhas.some((l) => !l.dentroPrazo)) avisos.push('Meses com mais de 5 anos aparecem na tabela, mas não entram no total: já prescreveram.');
  if (meses.length && meses.length < 12) avisos.push('Menos de 12 meses enviados: a faixa do Simples foi estimada a partir da média dos meses recebidos.');
  return {
    regime, periodo: meses.length ? { de: meses[0], ate: meses[meses.length - 1] } : null,
    notas: c.notas - canceladas, receita, receitaMonofasica: Object.values(categorias).reduce((t, v) => t + v, 0), receitaSt: linhas.reduce((t, l) => t + l.comSt, 0),
    pisCofins: totalPis, icms: totalIcms, total: totalPis + totalIcms,
    categorias, produtos, linhas, avisos,
    bases: MONOFASICOS.map((g) => ({ categoria: g.categoria, base: g.base })),
  };
}


// ---------- Resumo de qualquer nota (para o simulador de regime) ----------
// Aceita NF-e/NFC-e, CT-e e NFS-e (padrão Nacional e o ABRASF usado pelas prefeituras).
// Devolve só o necessário: valor, mês, raiz do CNPJ do emitente e do destinatário
// (nada de CPF de pessoa física).
function procura(obj, nomes, prof = 0) {
  if (!obj || typeof obj !== 'object' || prof > 12) return undefined;
  for (const n of nomes) if (obj[n] !== undefined && typeof obj[n] !== 'object') return obj[n];
  for (const v of Object.values(obj)) {
    const achou = procura(v, nomes, prof + 1);
    if (achou !== undefined) return achou;
  }
  return undefined;
}
const sub = (obj, nomes, prof = 0) => {
  if (!obj || typeof obj !== 'object' || prof > 12) return undefined;
  for (const n of nomes) if (obj[n] && typeof obj[n] === 'object') return obj[n];
  for (const v of Object.values(obj)) { const a = sub(v, nomes, prof + 1); if (a) return a; }
  return undefined;
};
const raiz = (c) => (String(c || '').replace(/\D/g, '').length === 14 ? String(c).replace(/\D/g, '').slice(0, 8) : '');

function resumoNota(texto) {
  let x;
  try { x = parser.parse(texto); } catch { return null; }
  if (x.procEventoNFe || x.eventoNFe || x.procEventoCTe) {
    const doc = lerXml(texto);
    return doc && doc.tipo === 'cancelamento' ? doc : null;
  }
  const nfe = lerXml(texto);
  if (nfe && nfe.tipo === 'nfe') {
    const inf = ((x.nfeProc && x.nfeProc.NFe) || x.NFe).infNFe;
    const valor = nfe.itens.filter((i) => ehVenda(i.cfop)).reduce((t, i) => t + i.valor, 0);
    return { tipo: nfe.modelo === '65' ? 'nfce' : 'nfe', chave: nfe.chave, mes: nfe.data.slice(0, 7), emit: raiz(nfe.cnpjEmitente), dest: raiz(inf.dest && inf.dest.CNPJ), saida: nfe.saida && nfe.normal, valor };
  }
  const cte = (x.cteProc && x.cteProc.CTe) || x.CTe;
  if (cte && cte.infCte) {
    const i = cte.infCte;
    const toma = String((i.ide && (i.ide.toma3 || i.ide.toma4 || {}).toma) || '0');
    const quem = { 0: i.rem, 1: i.exped, 2: i.receb, 3: i.dest }[toma] || i.ide.toma4 || {};
    return { tipo: 'cte', chave: String(i['@Id'] || '').replace(/^CTe/, ''), mes: String((i.ide && i.ide.dhEmi) || '').slice(0, 7), emit: raiz(i.emit && i.emit.CNPJ), dest: raiz(quem.CNPJ), saida: String(i.ide && i.ide.tpCTe) !== '2', valor: num(i.vPrest && i.vPrest.vTPrest) };
  }
  // NFS-e: padrão Nacional (DPS) ou ABRASF
  const ehNfse = x.NFSe || x.CompNfse || x.Nfse || sub(x, ['CompNfse', 'InfNfse', 'infNFSe']);
  if (!ehNfse) return null;
  const prest = sub(x, ['prest', 'PrestadorServico', 'Prestador', 'IdentificacaoPrestador', 'emit']);
  const toma = sub(x, ['toma', 'TomadorServico', 'Tomador', 'IdentificacaoTomador']);
  const valor = num(procura(x, ['vServ', 'ValorServicos']));
  const data = String(procura(x, ['dhEmi', 'DataEmissao', 'Competencia', 'dCompet', 'dhProc']) || '');
  const numero = String(procura(x, ['nNFSe', 'Numero']) || '');
  const emit = raiz(procura(prest, ['CNPJ', 'Cnpj']));
  if (!valor || !/^\d{4}-\d{2}/.test(data)) return null;
  const cancelada = /cancel/i.test(String(procura(x, ['NfseCancelamento', 'cStat']) || '')) || !!sub(x, ['NfseCancelamento']);
  return { tipo: 'nfse', chave: `S${emit}-${numero}-${data.slice(0, 10)}`, mes: data.slice(0, 7), emit, dest: raiz(procura(toma, ['CNPJ', 'Cnpj'])), saida: !cancelada, valor };
}

module.exports = { resumoNota, lerXml, lerZip, novoAcumulador, acumula, relatorio, classifica, MONOFASICOS, ehVenda };
