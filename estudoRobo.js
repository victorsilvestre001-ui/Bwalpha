// Teste do robô como está hoje (pedido do dono em 15/10: "últimos 3 meses, 3 entradas por dia, dá lucro ou prejuízo?").
// Simula a seta do bwalpha no M5 (cruzamento sma(open,10) - sma(open,40) x wma(34), igual ao autoTrader) no Ouro e no
// EURJPY, com as regras atuais:
//   - entra na abertura da vela M5 em que saiu a seta, expira no fim dela (US$500);
//   - RED → gale na vela seguinte (1.100) e depois (2.420), a não ser que saia seta nova: aí o gale é cancelado e
//     vale a seta nova (como fazGale);
//   - um ciclo por vez por ativo; EURJPY só no horário do euro (22h até 15h30 de Brasília);
//   - o "dia" começa às 22h de Brasília e, com 3 ciclos ganhos no dia, não abre sinal novo até as 22h seguintes
//     (os gales de um ciclo em andamento continuam).
// Mostra também sem o limite de 3 WINs, por mês, o pior dia, a maior queda e os dias com RED completo.
// Fontes: ROBO_FONTE=twelve (Twelve Data, ~3 meses), exnova (corretora, desde 29/09) ou ambos (padrão).
// BACKTEST_SOURCE=robo; logs ROBO_*.
const MIN = 60_000, M5 = 5 * MIN, H = 3600_000, DIA = 24 * H;
const VALOR = Number(process.env.ROBO_VALOR) || 500, MULT = [1, 2.2, 4.84];
const PAYOUT = { XAUUSD: 0.83, EURJPY: 0.84 };
const OPTS = { maFast: 10, maSlow: 40, signalPeriod: 34, periodoSR: 15 };
const brtMin = (t) => { const d = new Date(t - 3 * H); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const euroOk = (t) => { const m = brtMin(t); return m >= 22 * 60 || m < 15 * 60 + 30; };
// Dia do robô: começa às 22h de Brasília (01:00 UTC). Rótulo = data de Brasília do dia seguinte às 22h.
const diaRobo = (t) => new Date(Math.floor((t - 3 * H + 2 * H) / DIA) * DIA).toISOString().slice(0, 10);

// Gera, por ativo, a lista de blocos M5 com seta e o resultado de cada vela M5 (+1 subiu, -1 caiu, 0 igual/sem dado).
function setasDoAtivo(pair, m1, getBwalphaIndicator) {
    const porMin = new Map(m1.map((c) => [c.time, c]));
    const vela5 = (ini) => {
        const p = [0, 1, 2, 3, 4].map((k) => porMin.get(ini + k * MIN));
        if (!p.every(Boolean)) return null;
        return { time: ini, open: p[0].open, high: Math.max(...p.map((c) => c.high)), low: Math.min(...p.map((c) => c.low)), close: p[4].close };
    };
    const blocos = [...new Set(m1.map((c) => Math.floor(c.time / M5) * M5))].sort((a, b) => a - b);
    const velas = new Map();
    for (const b of blocos) { const v = vela5(b); if (v) velas.set(b, v); }
    const lista = [...velas.values()];
    const pos = new Map(lista.map((v, i) => [v.time, i]));
    // Resultado de operar o bloco b: preço de entrada = fechamento do minuto anterior; saída = fechamento do 5º minuto.
    const res = (b) => {
        const a = porMin.get(b - MIN), z = porMin.get(b + 4 * MIN);
        return !a || !z || a.close === z.close ? 0 : Math.sign(z.close - a.close);
    };
    const eventos = []; // { t, lado } por bloco com seta nova
    let ate = 0, ladoAtual = null;
    for (const v of lista) {
        const mb = v.time + M5;
        const i = pos.get(v.time);
        if (i < 80) continue;
        const fechadas = lista.slice(Math.max(0, i - 99), i + 1);
        const ultimo = porMin.get(mb - MIN);
        if (!ultimo || (pair === 'EURJPY' && !euroOk(mb))) continue;
        const bw = getBwalphaIndicator(fechadas, { time: mb, open: ultimo.close }, null, OPTS);
        const lado = bw.cruzamento === 'CALL' ? 1 : bw.cruzamento === 'PUT' ? -1 : 0;
        if (lado && (!(ate > mb) || ladoAtual !== lado)) {
            ate = mb + 15 * MIN; ladoAtual = lado;
            // Leituras para os filtros da "armadilha" (print do dono em 15/10: COMPRA logo depois de uma VENDA, abaixo da
            // média e depois de uma vela vermelha forte): tendência pela média de 40 fechamentos M5, seta contrária nos
            // últimos 30 min e corpo da última vela contra a seta comparado à média dos 20 corpos anteriores.
            const ult40 = fechadas.slice(-40), media = ult40.reduce((a, c) => a + c.close, 0) / ult40.length;
            const corpos = fechadas.slice(-21, -1).map((c) => Math.abs(c.close - c.open)), mc = corpos.reduce((a, x) => a + x, 0) / (corpos.length || 1);
            const u = fechadas.at(-1), contraCorpo = (u.close - u.open) * -lado;
            const ant = eventos.at(-1);
            // Leituras extras para o estudo dos sinais (BACKTEST_SOURCE=sinais, pedido de 21/10).
            const tr = fechadas.slice(1).map((c, k) => Math.max(c.high, fechadas[k].close) - Math.min(c.low, fechadas[k].close));
            const atr14 = tr.slice(-14).reduce((a, x) => a + x, 0) / 14;
            const trOrd = tr.slice().sort((a, b) => a - b), atrMed = trOrd[Math.floor(trOrd.length / 2)] || atr14;
            const fech = fechadas.map((c) => c.close);
            let g = 0, d = 0;
            for (let k = fech.length - 14; k < fech.length; k++) { const ch = fech[k] - fech[k - 1]; if (ch > 0) g += ch; else d -= ch; }
            const rsi = d === 0 ? 100 : 100 - 100 / (1 + g / d);
            const mov6 = (ultimo.close - fechadas.at(-7).close) / (atr14 || 1e-9) * lado; // quanto andou a favor nas últimas 6 velas
            eventos.push({ t: mb, lado,
                aFavorMedia: (ultimo.close - media) * lado > 0,
                contrariaRecente: !!ant && ant.lado !== lado && mb - ant.t <= 30 * MIN,
                velaContraForte: contraCorpo > 0 && contraCorpo >= 1.5 * mc,
                minDesdeAnterior: ant ? (mb - ant.t) / MIN : null,
                volRel: atr14 / (atrMed || 1e-9), rsi, mov6,
                distMedia: (ultimo.close - media) / (atr14 || 1e-9) * lado });
        }
    }
    return { eventos, res };
}

// Junta os ativos em ordem de tempo e aplica as regras do robô. Cada seta nova abre um ciclo; uma seta nova do mesmo
// ativo no bloco de um gale cancela esse gale (o ciclo termina ali). Empate devolve o valor e encerra o ciclo.
// O limite conta os WINs já fechados antes da seta (um ciclo de outro ativo ainda aberto não bloqueia).
// maxCiclos: no máximo N ciclos (setas) por dia, ganhando ou perdendo (0 = sem esse limite).
function simula(ativos, limiteWins, maxCiclos = 0, filtro = null) {
    const ops = [];
    for (const [pair, { eventos, res }] of Object.entries(ativos)) {
        const seta = new Set(eventos.map((e) => e.t));
        // A seta filtrada não entra, mas continua cancelando o gale de um ciclo em andamento (seta continua no conjunto).
        for (const e of eventos) if (!filtro || filtro(e)) ops.push({ pair, t: e.t, lado: e.lado, seta, res });
    }
    ops.sort((a, b) => a.t - b.t);
    const dias = {}, ciclos = [], winsEm = {}; // winsEm[dia] = horários em que os ciclos ganharam
    for (const o of ops) {
        const dia = diaRobo(o.t);
        if (limiteWins && (winsEm[dia] || []).filter((x) => x <= o.t).length >= limiteWins) continue;
        if (maxCiclos && (dias[dia] || []).length >= maxCiclos) continue;
        let lucro = 0, ganhou = false, cancelado = false, g = 0;
        for (; g <= 2; g++) {
            const b = o.t + g * M5;
            if (g > 0 && o.seta.has(b)) { cancelado = true; break; }
            const r = o.res(b) * o.lado, v = VALOR * MULT[g];
            if (r > 0) { lucro += v * PAYOUT[o.pair]; ganhou = true; break; }
            if (r === 0) break; // empate: devolve e encerra
            lucro -= v;
        }
        if (ganhou) (winsEm[dia] ||= []).push(o.t + (g + 1) * M5);
        (dias[dia] ||= []).push(lucro);
        ciclos.push({ dia, pair: o.pair, lucro, ganhou, g, cancelado, redCompleto: !ganhou && !cancelado && g > 2 });
    }
    return { dias, ciclos };
}

function resumo(nome, { dias, ciclos }) {
    const ds = Object.keys(dias).sort();
    let saldo = 0, pico = 0, queda = 0;
    const porDia = ds.map((d) => { const l = dias[d].reduce((a, x) => a + x, 0); saldo += l; pico = Math.max(pico, saldo); queda = Math.max(queda, pico - saldo); return [d, +l.toFixed(0)]; });
    const total = ciclos.reduce((a, c) => a + c.lucro, 0);
    const meses = {};
    for (const [d, l] of porDia) { const m = d.slice(0, 7); meses[m] = (meses[m] || 0) + l; }
    const pior = porDia.slice().sort((a, b) => a[1] - b[1]).slice(0, 5);
    console.log(`ROBO_RESUMO ${nome} ${JSON.stringify({
        dias: ds.length, de: ds[0], ate: ds.at(-1), ciclos: ciclos.length, wins: ciclos.filter((c) => c.ganhou).length,
        win_1a: ciclos.filter((c) => c.ganhou && c.g === 0).length, win_gale1: ciclos.filter((c) => c.ganhou && c.g === 1).length, win_gale2: ciclos.filter((c) => c.ganhou && c.g === 2).length,
        red_completo: ciclos.filter((c) => c.redCompleto).length, cancelados_no_prejuizo: ciclos.filter((c) => c.cancelado && c.lucro < 0).length,
        lucro_total: +total.toFixed(0), dias_positivos: porDia.filter((x) => x[1] > 0).length, dias_negativos: porDia.filter((x) => x[1] < 0).length,
        maior_queda: +queda.toFixed(0), meses: Object.fromEntries(Object.entries(meses).map(([m, l]) => [m, +l.toFixed(0)])), piores_dias: pior,
        por_ativo: Object.fromEntries(['XAUUSD', 'EURJPY'].map((p) => { const c = ciclos.filter((x) => x.pair === p); return [p, { ciclos: c.length, lucro: +c.reduce((a, x) => a + x.lucro, 0).toFixed(0), red_completo: c.filter((x) => x.redCompleto).length }]; }))
    })}`);
    console.log(`ROBO_DIAS ${nome} ${porDia.map(([d, l]) => `${d.slice(5)}:${l}`).join(' ')}`);
}

async function runRobo(pool, { fetchLongHistory }) {
    const { getBwalphaIndicator } = require('./marketRoutes');
    const fontes = process.env.ROBO_FONTE === 'twelve' ? ['twelve'] : process.env.ROBO_FONTE === 'exnova' ? ['exnova'] : ['twelve', 'exnova'];
    for (const fonte of fontes) {
        const ativos = {};
        for (const pair of ['XAUUSD', 'EURJPY']) {
            let m1;
            try {
                if (fonte === 'exnova') {
                    const { rows } = await pool.query('SELECT time, open, high, low, close FROM otc_candles WHERE active = $1 ORDER BY time', [pair]);
                    m1 = rows.slice(0, -1).map((r) => ({ time: new Date(r.time).getTime(), open: +r.open, high: +r.high, low: +r.low, close: +r.close }));
                } else {
                    m1 = await fetchLongHistory(pair, 'M1', Number(process.env.HOR_PAGINAS) || 25);
                }
            } catch (err) { console.log(`ROBO_ERRO ${fonte} ${pair} ${err.message}`); continue; }
            if (!m1?.length) { console.log(`ROBO_DADOS ${fonte} ${pair} sem candles`); continue; }
            console.log(`ROBO_DADOS ${fonte} ${pair} candles=${m1.length} de=${new Date(m1[0].time).toISOString().slice(0, 10)} ate=${new Date(m1.at(-1).time).toISOString().slice(0, 10)}`);
            ativos[pair] = setasDoAtivo(pair, m1, getBwalphaIndicator);
            console.log(`ROBO_SETAS ${fonte} ${pair} ${ativos[pair].eventos.length}`);
        }
        // ROBO_CENARIOS="wins3,wins1,ciclo1,livre" escolhe os cenários (padrão: limite de 3 WINs e sem limite).
        const cen = (process.env.ROBO_CENARIOS || 'wins3,livre').split(',');
        const v = `v${VALOR}`;
        if (cen.includes('wins3')) resumo(`${fonte}|${v}|limite3`, simula(ativos, 3));
        if (cen.includes('wins1')) resumo(`${fonte}|${v}|limite1win`, simula(ativos, 1));
        if (cen.includes('ciclo1')) resumo(`${fonte}|${v}|1ciclo`, simula(ativos, 0, 1));
        if (cen.includes('livre')) resumo(`${fonte}|${v}|sem_limite`, simula(ativos, 0));
        // ROBO_FILTROS=1: cada filtro da armadilha com o limite de 3 WINs e com o de 1 WIN.
        if (process.env.ROBO_FILTROS === '1') {
            const F = {
                media: (e) => e.aFavorMedia,
                sem_contraria: (e) => !e.contrariaRecente,
                sem_vela_forte: (e) => !e.velaContraForte,
                media_e_sem_contraria: (e) => e.aFavorMedia && !e.contrariaRecente,
                todos: (e) => e.aFavorMedia && !e.contrariaRecente && !e.velaContraForte
            };
            for (const [nome, f] of Object.entries(F)) {
                resumo(`${fonte}|${v}|limite3|${nome}`, simula(ativos, 3, 0, f));
                resumo(`${fonte}|${v}|limite1win|${nome}`, simula(ativos, 1, 0, f));
            }
        }
    }
}

// Estudo dos sinais (pedido do dono em 21/10, "melhora a análise desses sinais agora que tem bastante dias"):
// para cada seta, o resultado da 1ª entrada e do ciclo (gale 2, cancelado por seta nova, como o robô) e as leituras do
// momento. Mostra o acerto por faixa de cada leitura, separado em duas metades no tempo: só vale um filtro que melhora
// nas duas. BACKTEST_SOURCE=sinais; ROBO_FONTE como no runRobo (padrão: os dois); logs SINAIS_*.
function resultadoDoEvento(e, seta, res, pair) {
    let lucro = 0, ganhou = false, g = 0;
    for (; g <= 2; g++) {
        const b = e.t + g * M5;
        if (g > 0 && seta.has(b)) break;
        const r = res(b) * e.lado, v = MULT[g];
        if (r > 0) { lucro += v * PAYOUT[pair]; ganhou = true; break; }
        if (r === 0) break;
        lucro -= v;
    }
    return { primeira: res(e.t) * e.lado > 0, ganhou, lucro, redCompleto: !ganhou && g > 2 };
}
const FAIXAS = {
    ativo: (e) => e.pair,
    lado: (e) => (e.lado > 0 ? 'COMPRA' : 'VENDA'),
    sessao_brt: (e) => { const h = Math.floor(brtMin(e.t) / 60); return h >= 22 || h < 4 ? '22h-04h' : h < 9 ? '04h-09h' : h < 13 ? '09h-13h' : h < 18 ? '13h-18h' : '18h-22h'; },
    a_favor_media: (e) => (e.aFavorMedia ? 'sim' : 'nao'),
    seta_contraria_30min: (e) => (e.contrariaRecente ? 'sim' : 'nao'),
    vela_forte_contra: (e) => (e.velaContraForte ? 'sim' : 'nao'),
    min_desde_seta_anterior: (e) => (e.minDesdeAnterior == null ? '?' : e.minDesdeAnterior <= 30 ? '<=30' : e.minDesdeAnterior <= 120 ? '35-120' : '>120'),
    volatilidade: (e) => (e.volRel < 0.8 ? 'baixa' : e.volRel < 1.3 ? 'normal' : 'alta'),
    rsi_a_favor: (e) => { const r = e.lado > 0 ? e.rsi : 100 - e.rsi; return r < 40 ? '<40' : r < 60 ? '40-60' : '>=60'; },
    andou_6velas: (e) => (e.mov6 < -1 ? 'contra' : e.mov6 > 1 ? 'a_favor' : 'parado'),
    dist_media_atr: (e) => (e.distMedia < -1 ? '<-1' : e.distMedia < 0 ? '-1..0' : e.distMedia < 1 ? '0..1' : '>1'),
};
async function runSinais(pool, { fetchLongHistory }) {
    const { getBwalphaIndicator } = require('./marketRoutes');
    const fontes = process.env.ROBO_FONTE === 'twelve' ? ['twelve'] : process.env.ROBO_FONTE === 'exnova' ? ['exnova'] : ['exnova', 'twelve'];
    for (const fonte of fontes) {
        const todos = [];
        for (const pair of ['XAUUSD', 'EURJPY']) {
            let m1;
            try {
                if (fonte === 'exnova') {
                    const { rows } = await pool.query('SELECT time, open, high, low, close FROM otc_candles WHERE active = $1 ORDER BY time', [pair]);
                    m1 = rows.slice(0, -1).map((r) => ({ time: new Date(r.time).getTime(), open: +r.open, high: +r.high, low: +r.low, close: +r.close }));
                } else m1 = await fetchLongHistory(pair, 'M1', Number(process.env.HOR_PAGINAS) || 25);
            } catch (err) { console.log(`SINAIS_ERRO ${fonte} ${pair} ${err.message}`); continue; }
            if (!m1?.length) continue;
            const { eventos, res } = setasDoAtivo(pair, m1, getBwalphaIndicator);
            const seta = new Set(eventos.map((e) => e.t));
            for (const e of eventos) todos.push({ ...e, pair, ...resultadoDoEvento(e, seta, res, pair) });
        }
        if (!todos.length) continue;
        todos.sort((a, b) => a.t - b.t);
        const corte = todos[Math.floor(todos.length / 2)].t;
        const resume = (l) => ({ n: l.length, acerto_1a: l.length ? +(100 * l.filter((x) => x.primeira).length / l.length).toFixed(1) : null,
            ciclo: l.length ? +(100 * l.filter((x) => x.ganhou).length / l.length).toFixed(1) : null,
            red_completo: l.filter((x) => x.redCompleto).length, lucro_unid: +l.reduce((a, x) => a + x.lucro, 0).toFixed(1) });
        console.log(`SINAIS_TOTAL ${fonte} de=${new Date(todos[0].t).toISOString().slice(0, 10)} ate=${new Date(todos.at(-1).t).toISOString().slice(0, 10)} ${JSON.stringify({ tudo: resume(todos), metade1: resume(todos.filter((x) => x.t < corte)), metade2: resume(todos.filter((x) => x.t >= corte)) })}`);
        for (const [nome, f] of Object.entries(FAIXAS)) {
            const grupos = {};
            for (const e of todos) ((grupos[f(e)] ||= { m1: [], m2: [] })[e.t < corte ? 'm1' : 'm2']).push(e);
            const out = Object.fromEntries(Object.entries(grupos).map(([k, g]) => [k, { m1: resume(g.m1), m2: resume(g.m2) }]));
            console.log(`SINAIS_FAIXA ${fonte} ${nome} ${JSON.stringify(out)}`);
        }
    }
}

module.exports = { runSinais, runRobo, simula, setasDoAtivo, diaRobo };
