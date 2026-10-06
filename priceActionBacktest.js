// Estudo de price action (pedido do dono em 06/10): mede, um por um, os padrões clássicos de leitura
// de candle nos candles reais e diz quais têm vantagem de verdade. Cada padrão dá uma direção para a
// entrada na abertura do candle seguinte; o acerto é medido com expiração de 1 e de 3 candles.
// Os dados são divididos no tempo: 60% "estudo" e 40% "prova". Só vira candidato o padrão que passa
// de 55% nos dois trechos com amostra boa na prova (ou fica abaixo de 45% nos dois: aí vale o contrário).
// Fontes: Exnova M1 e M5 (otc_candles, candles reais da corretora) e Twelve Data M5 (histórico longo;
// o M1 da Twelve Data fica de fora porque tinha vazamento de dados).
// Roda com RUN_BACKTEST=1 e BACKTEST_SOURCE=priceaction; o resultado vai para os logs (PA_*).

function prep(c) {
    const n = c.length, tr = new Array(n), atr = new Array(n), e20 = new Array(n), e50 = new Array(n);
    let a = 0, x20 = c[0].close, x50 = c[0].close;
    for (let i = 0; i < n; i++) {
        tr[i] = i ? Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close)) : c[i].high - c[i].low;
        a = i ? (a * 13 + tr[i]) / 14 : tr[i];
        atr[i] = a || 1e-9;
        x20 = i ? c[i].close * (2 / 21) + x20 * (19 / 21) : x20;
        x50 = i ? c[i].close * (2 / 51) + x50 * (49 / 51) : x50;
        e20[i] = x20; e50[i] = x50;
    }
    return { atr, e20, e50 };
}

const body = (x) => x.close - x.open;
const range = (x) => (x.high - x.low) || 1e-12;
const upW = (x) => x.high - Math.max(x.open, x.close);
const loW = (x) => Math.min(x.open, x.close) - x.low;
function minLow(c, a, b) { let m = Infinity; for (let k = a; k <= b; k++) m = Math.min(m, c[k].low); return m; }
function maxHigh(c, a, b) { let m = -Infinity; for (let k = a; k <= b; k++) m = Math.max(m, c[k].high); return m; }

// Níveis de suporte/resistência: fundos/topos de fractal (2 candles de cada lado) nos últimos 100,
// tocados pelo menos 2 vezes (tolerância de 0,25 ATR).
function niveis(c, i, atr) {
    const tol = 0.25 * atr, lows = [], highs = [];
    for (let k = i - 100; k <= i - 3; k++) {
        if (k < 2) continue;
        if (c[k].low < c[k - 1].low && c[k].low < c[k - 2].low && c[k].low <= c[k + 1].low && c[k].low <= c[k + 2].low) lows.push(c[k].low);
        if (c[k].high > c[k - 1].high && c[k].high > c[k - 2].high && c[k].high >= c[k + 1].high && c[k].high >= c[k + 2].high) highs.push(c[k].high);
    }
    const fortes = (arr) => arr.filter((v) => arr.filter((w) => Math.abs(w - v) <= tol).length >= 2);
    return { sup: fortes(lows), res: fortes(highs), tol };
}

// Cada padrão devolve 1 (COMPRA), 0 (VENDA) ou null (não há padrão no candle i, já fechado).
const PADROES = {
    engolfo: (c, i, P) => {
        const a = c[i - 1], b = c[i];
        if (Math.abs(body(b)) < 0.5 * P.atr[i] || Math.sign(body(a)) === Math.sign(body(b)) || !body(a)) return null;
        const engole = Math.max(b.open, b.close) >= Math.max(a.open, a.close) && Math.min(b.open, b.close) <= Math.min(a.open, a.close);
        return engole ? (body(b) > 0 ? 1 : 0) : null;
    },
    engolfo_no_extremo: (c, i, P) => {
        const d = PADROES.engolfo(c, i, P);
        if (d === 1 && c[i].low <= minLow(c, i - 20, i - 1)) return 1;
        if (d === 0 && c[i].high >= maxHigh(c, i - 20, i - 1)) return 0;
        return null;
    },
    pin_bar: (c, i) => {
        const x = c[i], r = range(x);
        if (Math.abs(body(x)) > 0.3 * r) return null;
        if (loW(x) >= 0.6 * r) return 1;
        if (upW(x) >= 0.6 * r) return 0;
        return null;
    },
    pin_bar_no_extremo: (c, i, P) => {
        const d = PADROES.pin_bar(c, i, P);
        if (d === 1 && c[i].low <= minLow(c, i - 20, i - 1)) return 1;
        if (d === 0 && c[i].high >= maxHigh(c, i - 20, i - 1)) return 0;
        return null;
    },
    falso_rompimento: (c, i) => {
        const lo = minLow(c, i - 20, i - 1), hi = maxHigh(c, i - 20, i - 1), x = c[i];
        if (x.low < lo && x.close > lo) return 1;
        if (x.high > hi && x.close < hi) return 0;
        return null;
    },
    rompimento: (c, i) => {
        const lo = minLow(c, i - 20, i - 1), hi = maxHigh(c, i - 20, i - 1), x = c[i];
        if (x.close > hi) return 1;
        if (x.close < lo) return 0;
        return null;
    },
    inside_bar_rompe: (c, i) => {
        const m = c[i - 2], ib = c[i - 1], x = c[i];
        if (!(ib.high <= m.high && ib.low >= m.low)) return null;
        if (x.close > m.high) return 1;
        if (x.close < m.low) return 0;
        return null;
    },
    pullback_media20: (c, i, P) => {
        const x = c[i], up = P.e20[i] > P.e50[i] && P.e20[i] > P.e20[i - 5], dn = P.e20[i] < P.e50[i] && P.e20[i] < P.e20[i - 5];
        if (up && x.low <= P.e20[i] && x.close > P.e20[i] && body(x) > 0) return 1;
        if (dn && x.high >= P.e20[i] && x.close < P.e20[i] && body(x) < 0) return 0;
        return null;
    },
    vela_de_forca: (c, i, P) => {
        const b = body(c[i]);
        return Math.abs(b) >= 2 * P.atr[i] ? (b > 0 ? 1 : 0) : null;
    },
    tres_soldados: (c, i, P) => {
        const s = [c[i - 2], c[i - 1], c[i]];
        if (s.every((x) => body(x) > 0.3 * P.atr[i]) && s[1].close > s[0].close && s[2].close > s[1].close) return 1;
        if (s.every((x) => body(x) < -0.3 * P.atr[i]) && s[1].close < s[0].close && s[2].close < s[1].close) return 0;
        return null;
    },
    doji_apos_tendencia: (c, i, P) => {
        const x = c[i];
        if (Math.abs(body(x)) > 0.1 * range(x)) return null;
        const mov = c[i - 1].close - c[i - 6].close;
        if (mov >= 2 * P.atr[i]) return 0;
        if (mov <= -2 * P.atr[i]) return 1;
        return null;
    },
    toque_suporte_resistencia: (c, i, P) => {
        const x = c[i], { sup, res, tol } = niveis(c, i, P.atr[i]);
        if (sup.some((v) => x.low <= v + tol && x.low >= v - 2 * tol && x.close > v) && loW(x) > upW(x) && body(x) >= 0) return 1;
        if (res.some((v) => x.high >= v - tol && x.high <= v + 2 * tol && x.close < v) && upW(x) > loW(x) && body(x) <= 0) return 0;
        return null;
    },
    rompe_suporte_resistencia: (c, i, P) => {
        const x = c[i], { sup, res } = niveis(c, i, P.atr[i]);
        if (res.some((v) => c[i - 1].close <= v && x.close > v) && body(x) > 0.5 * P.atr[i]) return 1;
        if (sup.some((v) => c[i - 1].close >= v && x.close < v) && body(x) < -0.5 * P.atr[i]) return 0;
        return null;
    },
};

function sessao(ms) {
    const h = new Date(ms).getUTCHours();
    return h >= 12 && h < 16 ? 'londres_ny' : h >= 7 && h < 12 ? 'londres' : h >= 16 && h < 21 ? 'ny' : 'asia';
}

function acc(list) {
    const n = list.length, w = list.filter(Boolean).length;
    return n ? [n, +(w / n * 100).toFixed(1)] : [0, null];
}

// Gera as entradas de cada padrão num conjunto de candles contínuos de um ativo.
function entradas(c, tfMs, isOpen) {
    const P = prep(c), out = [];
    for (let i = 101; i < c.length - 3; i++) {
        // Exige continuidade: 100 candles antes e 3 depois, sem buracos.
        if (c[i].time - c[i - 100].time !== 100 * tfMs || c[i + 3].time - c[i].time !== 3 * tfMs) continue;
        if (isOpen && !isOpen(new Date(c[i + 1].time))) continue;
        const ent = c[i + 1].open;
        for (const [nome, f] of Object.entries(PADROES)) {
            const d = f(c, i, P);
            if (d == null) continue;
            const r1 = c[i + 1].close === c[i + 1].open ? null : (c[i + 1].close > c[i + 1].open) === (d === 1);
            const r3 = c[i + 3].close === ent ? null : (c[i + 3].close > ent) === (d === 1);
            out.push({ nome, t: c[i].time, r1, r3, sess: sessao(c[i + 1].time) });
        }
    }
    return out;
}

function relatorio(fonte, tf, porAtivo) {
    const todos = Object.values(porAtivo).flat();
    if (!todos.length) return console.log(`PA_RESULT ${fonte} ${tf} sem dados`);
    const ts = todos.map((e) => e.t).sort((a, b) => a - b), corte = ts[Math.floor(ts.length * 0.6)];
    const linhas = [];
    for (const nome of Object.keys(PADROES)) {
        const es = todos.filter((e) => e.nome === nome);
        const parte = (l, k) => acc(l.map((e) => e[k]).filter((v) => v != null));
        const estudo = es.filter((e) => e.t < corte), prova = es.filter((e) => e.t >= corte);
        const linha = {
            padrao: nome,
            exp1: { estudo: parte(estudo, 'r1'), prova: parte(prova, 'r1') },
            exp3: { estudo: parte(estudo, 'r3'), prova: parte(prova, 'r3') },
            ativos: Object.fromEntries(Object.entries(porAtivo).map(([p, l]) => [p, parte(l.filter((e) => e.nome === nome), 'r1')])),
            sessoes: Object.fromEntries(['asia', 'londres', 'londres_ny', 'ny'].map((s) => [s, parte(es.filter((e) => e.sess === s), 'r1')])),
        };
        for (const k of ['exp1', 'exp3']) {
            const [, ae] = linha[k].estudo, [np, ap] = linha[k].prova;
            if (np >= 80 && ae >= 55 && ap >= 55) linha[`candidato_${k}`] = 'segue o padrão';
            if (np >= 80 && ae <= 45 && ap <= 45) linha[`candidato_${k}`] = 'fazer o contrário';
        }
        linhas.push(linha);
    }
    // [n, acerto %]; estudo = primeiros 60% no tempo, prova = 40% finais.
    for (const l of linhas) console.log(`PA_RESULT ${fonte} ${tf} de=${new Date(ts[0]).toISOString().slice(0, 10)} corte=${new Date(corte).toISOString().slice(0, 10)} ${JSON.stringify(l)}`);
    const cand = linhas.filter((l) => l.candidato_exp1 || l.candidato_exp3).map((l) => [l.padrao, l.candidato_exp1 || '-', l.candidato_exp3 || '-']);
    console.log(`PA_CANDIDATOS ${fonte} ${tf} ${JSON.stringify(cand)}`);
}

function agrega(m1, min) {
    const tf = min * 60_000, out = [];
    for (const c of m1) {
        const b = Math.floor(c.time / tf) * tf, last = out[out.length - 1];
        if (last && last.time === b) { last.high = Math.max(last.high, c.high); last.low = Math.min(last.low, c.low); last.close = c.close; last.n++; }
        else out.push({ time: b, open: c.open, high: c.high, low: c.low, close: c.close, n: 1 });
    }
    return out.filter((c) => c.n === min);
}

async function runPriceAction(pool, deps) {
    const PAIRS = ['EURUSD', 'EURJPY', 'XAUUSD'];
    const exM1 = {}, exM5 = {}, tdM5 = {};
    for (const pair of PAIRS) {
        const { rows } = await pool.query('SELECT time, open, high, low, close FROM otc_candles WHERE active = $1 ORDER BY time', [pair]);
        const m1 = rows.slice(0, -1).map((r) => ({ time: new Date(r.time).getTime(), open: +r.open, high: +r.high, low: +r.low, close: +r.close }));
        exM1[pair] = entradas(m1, 60_000, deps.isMarketOpen);
        exM5[pair] = entradas(agrega(m1, 5), 300_000, deps.isMarketOpen);
        try {
            const td = (await deps.fetchLongHistory(pair, 'M5', parseInt(process.env.PA_TD_PAGES, 10) || 4)).filter((x) => deps.isMarketOpen(new Date(x.time)));
            tdM5[pair] = entradas(td, 300_000, null);
        } catch (err) {
            console.error(`PA_ERR TD ${pair}:`, err.message);
        }
        console.log(`PA_DADOS ${pair} exnova_m1=${m1.length} entradas_m1=${exM1[pair].length} entradas_m5=${exM5[pair].length} entradas_td_m5=${(tdM5[pair] || []).length}`);
    }
    relatorio('exnova', 'M1', exM1);
    relatorio('exnova', 'M5', exM5);
    relatorio('twelvedata', 'M5', tdM5);
}

module.exports = { runPriceAction, PADROES, entradas };
