// Agenda fiscal dos próximos dias conforme o regime (MEI, Simples ou Presumido/Real).
// Regras gerais de vencimento (feriados nacionais incluídos; feriados municipais não): guias do Simples/MEI vencem dia 20
// e passam para o próximo dia útil; DARF e FGTS vencem dia 20 (PIS/Cofins dia 25) e antecipam
// para o dia útil anterior. Valores das guias não são públicos: a agenda mostra o que vence e quando.

const DIA = 24 * 60 * 60 * 1000;

// Data "de hoje" no fuso de Brasília, como AAAA-MM-DD
function hojeSP(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}

const dataUTC = (a, m, d) => new Date(Date.UTC(a, m, d));
const iso = (d) => d.toISOString().slice(0, 10);

// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher)
function pascoa(a) {
  const b = a % 19; const c = Math.floor(a / 100); const d = a % 100;
  const e = Math.floor(c / 4); const f = c % 4; const g = Math.floor((c + 8) / 25); const h = Math.floor((c - g + 1) / 3);
  const i = (19 * b + c - e - h + 15) % 30; const k = Math.floor(d / 4); const l = d % 4;
  const m = (32 + 2 * f + 2 * k - i - l) % 7; const n = Math.floor((b + 11 * i + 22 * m) / 451);
  const mes = Math.floor((i + m - 7 * n + 114) / 31); const dia = ((i + m - 7 * n + 114) % 31) + 1;
  return dataUTC(a, mes - 1, dia);
}

// Feriados nacionais e dias sem expediente bancário (Carnaval, Sexta-feira Santa, Corpus Christi)
const cacheFeriados = {};
function feriados(a) {
  if (!cacheFeriados[a]) {
    const p = pascoa(a).getTime();
    const moveis = [-48, -47, -2, 60].map((d) => iso(new Date(p + d * DIA)));
    const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'].map((md) => `${a}-${md}`);
    cacheFeriados[a] = new Set([...fixos, ...moveis]);
  }
  return cacheFeriados[a];
}

const util = (d) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !feriados(d.getUTCFullYear()).has(iso(d));

function ajusta(d, sentido) {
  const r = new Date(d);
  while (!util(r)) r.setUTCDate(r.getUTCDate() + sentido);
  return r;
}

function ultimoUtil(a, m) {
  return ajusta(dataUTC(a, m + 1, 0), -1);
}

function quintoUtil(a, m) {
  let d = dataUTC(a, m, 1);
  let n = util(d) ? 1 : 0;
  while (n < 5) { d = new Date(d.getTime() + DIA); if (util(d)) n++; }
  return d;
}

// Lista de obrigações de um mês para o perfil da empresa
function doMes(a, m, perfil) {
  const ev = [];
  const add = (data, titulo, detalhe) => ev.push({ data: iso(data), titulo, detalhe });
  const ref = new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' });
  if (perfil.regime === 'mei') {
    add(ajusta(dataUTC(a, m, 20), 1), 'DAS-MEI', `Guia mensal do MEI (competência de ${ref}).`);
    if (m === 4) add(ajusta(dataUTC(a, 4, 31), 1), 'Declaração anual do MEI (DASN-SIMEI)', 'Declaração do faturamento do ano passado.');
  } else if (perfil.regime === 'simples') {
    add(ajusta(dataUTC(a, m, 20), 1), 'DAS do Simples Nacional', `Guia mensal do Simples (competência de ${ref}).`);
    if (m === 2) add(ajusta(dataUTC(a, 2, 31), 1), 'DEFIS', 'Declaração anual do Simples Nacional.');
  } else {
    add(ajusta(dataUTC(a, m, 25), -1), 'PIS e Cofins', `Competência de ${ref}.`);
    if ([0, 3, 6, 9].includes(m)) add(ultimoUtil(a, m), 'IRPJ e CSLL do trimestre', 'Cota única ou 1ª cota do trimestre anterior.');
    if (m === 5) add(ultimoUtil(a, 5), 'ECD (escrituração contábil digital)', 'Entrega anual.');
    if (m === 6) add(ultimoUtil(a, 6), 'ECF (escrituração contábil fiscal)', 'Entrega anual.');
  }
  if (perfil.funcionarios) {
    add(quintoUtil(a, m), 'Pagamento dos salários', 'Prazo legal: até o 5º dia útil.');
    add(ajusta(dataUTC(a, m, 20), -1), 'FGTS Digital', 'Guia do FGTS da folha do mês anterior.');
    add(ajusta(dataUTC(a, m, 20), -1), 'INSS da folha (DCTFWeb)', perfil.regime === 'normal' ? 'Contribuições previdenciárias da folha.' : 'INSS descontado dos funcionários.');
  }
  return ev;
}

// Obrigações de hoje até `dias` à frente, em ordem de data
function proximas(perfil, { dias = 10, hoje = hojeSP() } = {}) {
  const [a, m] = hoje.split('-').map(Number);
  const limite = iso(new Date(Date.parse(hoje) + dias * DIA));
  const meses = [[a, m - 1], [m === 12 ? a + 1 : a, m % 12]];
  return meses.flatMap(([ano, mes]) => doMes(ano, mes, perfil))
    .filter((e) => e.data >= hoje && e.data <= limite)
    .map((e) => ({ ...e, emDias: Math.round((Date.parse(e.data) - Date.parse(hoje)) / DIA) }))
    .sort((x, y) => x.data.localeCompare(y.data));
}

module.exports = { proximas, hojeSP, doMes };
