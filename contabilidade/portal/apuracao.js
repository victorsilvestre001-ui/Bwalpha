// Apuração mensal do DAS (Simples Nacional) de cada empresa, a partir das notas:
//  - notas baixadas pelo certificado (NFS-e, NF-e, NFC-e, CT-e emitidas pela empresa)
//  - notas emitidas pelo próprio site (aba Notas fiscais)
// Regras: LC 123/2006, art. 18; Res. CGSN 140/2018, art. 22 (início de atividade).
// O contador confere e aprova; o DAS oficial sai do PGDAS-D (manual ou Integra Contador).
const db = require('./db');
const captura = require('./captura');
const { vencimentoDas, hojeSP } = require('./agenda');
const { aliquotaEfetiva, REGRAS } = require('../public/tributos');

const raiz = (c) => String(c || '').replace(/\D/g, '').slice(0, 8);
const r2 = (v) => Math.round(v * 100) / 100;
const compDe = (d) => String(d || '').slice(0, 7);
const anterior = (comp, n = 1) => { const d = new Date(Date.UTC(+comp.slice(0, 4), +comp.slice(5, 7) - 1 - n, 1)); return d.toISOString().slice(0, 7); };
const ROTULO = { servicos: 'Serviços (NFS-e)', mercadorias: 'Vendas de mercadorias (NF-e/NFC-e)', transporte: 'Fretes (CT-e)' };

// Anexo padrão de cada tipo de receita; o contador pode trocar em fiscal.anexos
function anexosDa(u) {
  const c = String((u.empresa && u.empresa.cnae) || '').replace(/\D/g, '');
  const div = Number(c.slice(0, 2));
  const industria = div >= 10 && div <= 32; // a divisão 33 (manutenção e instalação) é serviço
  return { servicos: 'III', mercadorias: industria ? 'II' : 'I', transporte: 'III', ...((u.fiscal && u.fiscal.anexos) || {}) };
}

// Receita por competência e por tipo, sem notas canceladas e sem repetição
function receitas(u) {
  const empresa = raiz(u.cnpj);
  const { notas, canceladas } = captura.notasDe(u.id);
  const canc = new Set(canceladas);
  const meses = {};
  const vistos = new Set();
  const soma = (comp, tipo, valor, ref) => {
    const m = meses[comp] || (meses[comp] = { servicos: 0, mercadorias: 0, transporte: 0, notas: [] });
    m[tipo] += valor;
    m.notas.push(ref);
  };
  for (const n of notas) {
    if (n.emit !== empresa || !n.saida || canc.has(n.chave) || !/^\d{4}-\d{2}$/.test(n.mes)) continue;
    const tipo = n.tipo === 'nfse' ? 'servicos' : n.tipo === 'cte' ? 'transporte' : 'mercadorias';
    const numero = n.tipo === 'nfse' ? String(n.chave).split('-')[1] : null;
    if (numero) vistos.add(numero);
    soma(n.mes, tipo, n.valor, { origem: 'certificado', tipo: n.tipo, numero, valor: n.valor, tomador: n.dest });
  }
  // Notas de serviço emitidas pelo site e ainda não baixadas pelo certificado
  for (const n of db.lista('notas', (x) => x.usuarioId === u.id && x.status === 'emitida')) {
    if (n.numero && vistos.has(String(n.numero))) continue;
    soma(compDe(n.emitidaEm || n.enviadaEm), 'servicos', Number(n.valor) || 0, { origem: 'site', tipo: 'nfse', numero: n.numero || null, valor: Number(n.valor) || 0, tomador: raiz(n.tomador && n.tomador.cnpj) });
  }
  return meses;
}

const totalMes = (m) => (m ? m.servicos + m.mercadorias + m.transporte : 0);

// RBT12 da competência: 12 meses anteriores, ou a regra de início de atividade
function rbt12(comp, meses, abertura) {
  const inicio = compDe(abertura);
  if (inicio && comp === inicio) return { valor: totalMes(meses[comp]) * 12, regra: 'Primeiro mês de atividade: receita do mês × 12' };
  if (inicio && comp > inicio && comp <= anterior(inicio, -11)) {
    const ant = [];
    for (let c = inicio; c < comp; c = anterior(c, -1)) ant.push(totalMes(meses[c]));
    const media = ant.reduce((t, v) => t + v, 0) / ant.length;
    return { valor: media * 12, regra: `Início de atividade: média dos ${ant.length} mês(es) anteriores × 12` };
  }
  let s = 0;
  let faltando = 0;
  for (let i = 1; i <= 12; i++) {
    const c = anterior(comp, i);
    if (!meses[c] && (!inicio || c >= inicio)) faltando++;
    s += totalMes(meses[c]);
  }
  return { valor: s, regra: 'Soma dos 12 meses anteriores', incompleto: faltando > 0 };
}

function aliquota(anexo, rbt) {
  // Sem receita anterior, vale a alíquota nominal da 1ª faixa
  return rbt > 0 ? aliquotaEfetiva(anexo, rbt) : REGRAS.simples.anexos[anexo][0][1];
}

// Calcula uma competência; `ajuste` traz o que o contador corrigiu (RBT12, receita extra, anexos)
function calcula(u, comp, meses, ajuste = {}) {
  const anexos = { ...anexosDa(u), ...(ajuste.anexos || {}) };
  const m = meses[comp] || { servicos: 0, mercadorias: 0, transporte: 0, notas: [] };
  const rb = ajuste.rbt12 != null ? { valor: Number(ajuste.rbt12), regra: 'Informado pelo contador' } : rbt12(comp, meses, u.empresa && u.empresa.abertura);
  const partes = ['servicos', 'mercadorias', 'transporte'].map((tipo) => {
    const receita = r2(m[tipo] + Number((ajuste.extra || {})[tipo] || 0));
    const al = aliquota(anexos[tipo], rb.valor);
    return { tipo, rotulo: ROTULO[tipo], anexo: anexos[tipo], receita, aliquota: al, valor: r2(receita * al) };
  }).filter((p) => p.receita > 0);
  const receita = r2(partes.reduce((t, p) => t + p.receita, 0));
  const avisos = [];
  if (rb.valor > REGRAS.simples.sublimiteIcmsIss) avisos.push('RBT12 acima do sublimite de R$ 3,6 milhões: ICMS e ISS passam a ser pagos fora do DAS.');
  if (!u.empresa || !u.empresa.abertura) avisos.push('Data de abertura desconhecida: confira o RBT12.');
  if (rb.incompleto) avisos.push('Há meses dos últimos 12 sem notas baixadas: confira o RBT12 com o extrato do PGDAS-D.');
  if (partes.some((p) => p.tipo === 'servicos')) avisos.push('Confira se algum tomador reteve o ISS: essa receita é declarada "com retenção" e o DAS diminui.');
  return {
    competencia: comp, receita, partes, rbt12: r2(rb.valor), regraRbt12: rb.regra,
    valor: r2(partes.reduce((t, p) => t + p.valor, 0)), vencimento: vencimentoDas(comp),
    notas: m.notas, avisos, semMovimento: receita === 0,
  };
}

// Competências a mostrar: da abertura (ou da 1ª nota) até o mês passado, as últimas `quantas`
function competencias(u, meses, quantas = 6) {
  const atual = hojeSP().slice(0, 7);
  const ultima = anterior(atual);
  const primeira = [compDe(u.empresa && u.empresa.abertura), ...Object.keys(meses)].filter(Boolean).sort()[0] || ultima;
  const lista = [];
  for (let c = ultima; c >= primeira && lista.length < quantas; c = anterior(c)) lista.push(c);
  return lista;
}

// Junta o cálculo com o que já foi registrado (aprovação, DAS anexado, pagamento)
function painel(u, { quantas = 6 } = {}) {
  const meses = receitas(u);
  // Meses antes da primeira nota que temos (e depois da abertura) podem ter tido faturamento
  // que o sistema não viu: não dá para afirmar "sem movimento"
  const primeiraNota = Object.keys(meses).sort()[0];
  const abertura = compDe(u.empresa && u.empresa.abertura);
  return competencias(u, meses, quantas).map((comp) => {
    const semDados = !meses[comp] && (!primeiraNota || comp < primeiraNota) && comp !== abertura;
    const reg = db.acha('apuracoes', (a) => a.usuarioId === u.id && a.competencia === comp);
    // Depois de aprovada, vale o que o contador aprovou
    const calc = reg && reg.status !== 'calculada' && reg.aprovado ? reg.aprovado : calcula(u, comp, meses, (reg && reg.ajuste) || {});
    return { ...calc, semDados: semDados && (!reg || !reg.ajuste), id: reg ? reg.id : null, status: reg ? reg.status : 'calculada', ajuste: (reg && reg.ajuste) || null, das: (reg && reg.das) || null, aprovadoEm: reg && reg.aprovadoEm, pagoEm: reg && reg.pagoEm, conferencia: (reg && reg.conferencia) || null };
  });
}

function registro(u, comp) {
  return db.acha('apuracoes', (a) => a.usuarioId === u.id && a.competencia === comp) || db.insere('apuracoes', { usuarioId: u.id, competencia: comp, status: 'calculada' });
}

module.exports = { painel, calcula, receitas, registro, anexosDa };
