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
        if (lado && (!(ate > mb) || ladoAtual !== lado)) { ate = mb + 15 * MIN; ladoAtual = lado; eventos.push({ t: mb, lado }); }
    }
    return { eventos, res };
}

// Junta os ativos em ordem de tempo e aplica as regras do robô. Cada seta nova abre um ciclo; uma seta nova do mesmo
// ativo no bloco de um gale cancela esse gale (o ciclo termina ali). Empate devolve o valor e encerra o ciclo.
// O limite conta os WINs já fechados antes da seta (um ciclo de outro ativo ainda aberto não bloqueia).
// maxCiclos: no máximo N ciclos (setas) por dia, ganhando ou perdendo (0 = sem esse limite).
function simula(ativos, limiteWins, maxCiclos = 0) {
    const ops = [];
    for (const [pair, { eventos, res }] of Object.entries(ativos)) {
        const seta = new Set(eventos.map((e) => e.t));
        for (const e of eventos) ops.push({ pair, t: e.t, lado: e.lado, seta, res });
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
    }
}

module.exports = { runRobo, simula, setasDoAtivo, diaRobo };
