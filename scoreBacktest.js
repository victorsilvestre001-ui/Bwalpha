// Score TradeOn: estudo de uma análise nova para os sinais, nos candles reais guardados (otc_candles).
// Monta indicadores de tendência, força, esticada, rejeição e volatilidade no candle que acabou de
// fechar e tenta prever a cor do próximo. Os pesos são aprendidos só nos primeiros 60% dos dados
// (regressão logística) e o acerto é medido nos 40% seguintes, que o modelo nunca viu.
// Roda no servidor com RUN_BACKTEST=1 e BACKTEST_SOURCE=score; o resultado vai para os logs.

const SESS = ['asia', 'londres', 'londres_ny', 'ny'];
function sessionOf(ms) {
    const h = new Date(ms).getUTCHours();
    if (h >= 12 && h < 16) return 'londres_ny';
    if (h >= 7 && h < 12) return 'londres';
    if (h >= 16 && h < 21) return 'ny';
    return 'asia';
}

// Séries de indicadores calculadas uma vez para todo o histórico (cada valor usa só o passado).
function series(c) {
    const n = c.length, close = c.map((x) => x.close);
    const ema = (p) => { const k = 2 / (p + 1), out = new Array(n); let e = close[0]; for (let i = 0; i < n; i++) { e = i ? close[i] * k + e * (1 - k) : e; out[i] = e; } return out; };
    const e9 = ema(9), e21 = ema(21), e12 = ema(12), e26 = ema(26);
    const macd = e12.map((v, i) => v - e26[i]);
    const sig = new Array(n); { const k = 2 / 10; let e = macd[0]; for (let i = 0; i < n; i++) { e = i ? macd[i] * k + e * (1 - k) : e; sig[i] = e; } }
    const tr = c.map((x, i) => (i ? Math.max(x.high - x.low, Math.abs(x.high - c[i - 1].close), Math.abs(x.low - c[i - 1].close)) : x.high - x.low));
    const rma = (arr, p) => { const out = new Array(n); let a = arr[0]; for (let i = 0; i < n; i++) { a = i ? (a * (p - 1) + arr[i]) / p : a; out[i] = a; } return out; };
    const atr14 = rma(tr, 14), atr50 = rma(tr, 50);
    const gain = close.map((v, i) => (i ? Math.max(0, v - close[i - 1]) : 0)), loss = close.map((v, i) => (i ? Math.max(0, close[i - 1] - v) : 0));
    const ag = rma(gain, 14), al = rma(loss, 14);
    const rsi = ag.map((g, i) => (al[i] === 0 ? 100 : 100 - 100 / (1 + g / al[i])));
    return { e9, e21, macdH: macd.map((v, i) => v - sig[i]), atr14, atr50, rsi };
}

function features(c, S, i) {
    const x = c[i], atr = S.atr14[i] || 1e-9;
    let sum = 0, sq = 0;
    for (let j = i - 19; j <= i; j++) { sum += c[j].close; sq += c[j].close * c[j].close; }
    const mean = sum / 20, sd = Math.sqrt(Math.max(sq / 20 - mean * mean, 1e-18)) || 1e-9;
    const range = (x.high - x.low) || 1e-9;
    const lowWick = Math.min(x.open, x.close) - x.low, upWick = x.high - Math.max(x.open, x.close);
    let streak = 0; const col = (k) => Math.sign(c[k].close - c[k].open);
    const c0 = col(i);
    if (c0) for (let k = i; k > i - 8 && col(k) === c0; k--) streak += c0;
    const clip = (v, m = 4) => Math.max(-m, Math.min(m, v));
    const z = clip((x.close - mean) / sd);
    const volReg = clip(atr / (S.atr50[i] || atr) - 1, 2);
    const f = [
        clip((S.e9[i] - S.e21[i]) / atr),            // tendência curta
        clip((S.e21[i] - S.e21[i - 5]) / atr),       // inclinação da média lenta
        (S.rsi[i] - 50) / 50,                        // força (RSI)
        clip(S.macdH[i] / atr),                      // ritmo (MACD)
        z,                                           // esticada (Bollinger em desvios)
        clip((x.close - x.open) / atr),              // corpo do último candle
        (lowWick - upWick) / range,                  // rejeição (pavio de baixo − pavio de cima)
        streak / 8,                                  // sequência de candles da mesma cor
        clip((x.close - c[i - 3].close) / atr),      // movimento dos últimos 3
        clip((x.close - c[i - 10].close) / atr),     // movimento dos últimos 10
        volReg,                                      // volatilidade acima/abaixo do normal
        z * volReg,                                  // esticada com volatilidade alta
    ];
    const s = sessionOf(x.time);
    for (const name of SESS) f.push(s === name ? 1 : 0);
    return f;
}
const FEATURE_NAMES = ['tend_ema9_21', 'incl_ema21', 'rsi', 'macd', 'z_bollinger', 'corpo', 'rejeicao', 'sequencia', 'mov3', 'mov10', 'volatilidade', 'z_x_vol', ...SESS.map((s) => `sess_${s}`)];

// Regressão logística simples com L2, gradiente em lote (dados pequenos o bastante).
function trainLogistic(X, y, { iters = 300, lr = 0.5, l2 = 1e-3 } = {}) {
    const d = X[0].length, w = new Array(d + 1).fill(0), n = X.length;
    for (let it = 0; it < iters; it++) {
        const g = new Array(d + 1).fill(0);
        for (let r = 0; r < n; r++) {
            let z = w[d]; const xr = X[r];
            for (let j = 0; j < d; j++) z += w[j] * xr[j];
            const e = 1 / (1 + Math.exp(-z)) - y[r];
            for (let j = 0; j < d; j++) g[j] += e * xr[j];
            g[d] += e;
        }
        for (let j = 0; j < d; j++) w[j] -= lr * (g[j] / n + l2 * w[j]);
        w[d] -= lr * g[d] / n;
    }
    return w;
}
const predict = (w, x) => { let z = w[w.length - 1]; for (let j = 0; j < x.length; j++) z += w[j] * x[j]; return 1 / (1 + Math.exp(-z)); };

function acc(list) {
    const n = list.length, w = list.filter(Boolean).length;
    return n ? [n, +(w / n * 100).toFixed(1), +(196 * Math.sqrt((w / n) * (1 - w / n) / n)).toFixed(1)] : [0, null, null];
}

function toM5(m1) {
    const out = [];
    for (const c of m1) {
        const b = Math.floor(c.time / 300_000) * 300_000, last = out[out.length - 1];
        if (last && last.time === b) { last.high = Math.max(last.high, c.high); last.low = Math.min(last.low, c.low); last.close = c.close; last.n++; }
        else out.push({ time: b, open: c.open, high: c.high, low: c.low, close: c.close, n: 1 });
    }
    return out.filter((c) => c.n === 5);
}

// Monta as amostras: candle i fechado → cor do candle i+1. Só sequências contínuas, sem doji no alvo.
function samples(c, tfMs, baseline) {
    const S = series(c), rows = [];
    for (let i = 60; i < c.length - 1; i++) {
        if (c[i + 1].time - c[i].time !== tfMs || c[i].time - c[i - 60].time !== 60 * tfMs) continue;
        if (c[i + 1].close === c[i + 1].open) continue;
        const up = c[i + 1].close > c[i + 1].open;
        rows.push({ x: features(c, S, i), y: up ? 1 : 0, t: c[i].time, base: baseline ? baseline(c, i) : null });
    }
    return rows;
}

// Regras simples e explicáveis, testadas no mesmo trecho de teste (para comparar com o modelo).
const RULES = {
    seguir_tendencia: (x) => (x[0] > 0.3 ? 1 : x[0] < -0.3 ? 0 : null),
    reversao_z2: (x) => (x[4] <= -2 ? 1 : x[4] >= 2 ? 0 : null),
    reversao_z25_rejeicao: (x) => (x[4] <= -2 && x[6] > 0.3 ? 1 : x[4] >= 2 && x[6] < -0.3 ? 0 : null),
    sequencia4_inverte: (x) => (x[7] >= 0.5 ? 0 : x[7] <= -0.5 ? 1 : null),
    rsi_extremo_inverte: (x) => (x[2] <= -0.5 ? 1 : x[2] >= 0.5 ? 0 : null),
    pullback_na_tendencia: (x) => (x[0] > 0.5 && x[4] < -1 && x[6] > 0.2 ? 1 : x[0] < -0.5 && x[4] > 1 && x[6] < -0.2 ? 0 : null),
};

function study(label, c, tfMs, baseline) {
    const rows = samples(c, tfMs, baseline);
    if (rows.length < 500) { console.log(`SCORE_SKIP ${label} amostras=${rows.length}`); return null; }
    const cut = Math.floor(rows.length * 0.6), train = rows.slice(0, cut), test = rows.slice(cut);
    const w = trainLogistic(train.map((r) => r.x), train.map((r) => r.y));
    const scored = test.map((r) => ({ ...r, p: predict(w, r.x) })).map((r) => ({ ...r, conf: Math.abs(r.p - 0.5) }));
    const sorted = [...scored].sort((a, b) => b.conf - a.conf);
    const cov = {};
    for (const pct of [100, 50, 25, 10, 5]) {
        const top = sorted.slice(0, Math.max(1, Math.floor(sorted.length * pct / 100)));
        cov[`top${pct}`] = acc(top.map((r) => (r.p > 0.5 ? 1 : 0) === r.y));
    }
    // Estabilidade: o mesmo corte (top 25%) em cada metade do teste.
    const half = Math.floor(scored.length / 2), thr25 = sorted[Math.floor(sorted.length * 0.25)]?.conf ?? 0;
    const stab = [scored.slice(0, half), scored.slice(half)].map((part) => acc(part.filter((r) => r.conf >= thr25).map((r) => (r.p > 0.5 ? 1 : 0) === r.y))[1]);
    const rules = {};
    for (const [name, fn] of Object.entries(RULES)) {
        const hits = []; for (const r of test) { const d = fn(r.x); if (d != null) hits.push(d === r.y); }
        rules[name] = acc(hits);
    }
    const baseHits = test.filter((r) => r.base === 'COMPRA' || r.base === 'VENDA').map((r) => (r.base === 'COMPRA' ? 1 : 0) === r.y);
    const upRate = +(test.filter((r) => r.y === 1).length / test.length * 100).toFixed(1);
    console.log(`SCORE_RESULT ${label} amostras=${rows.length} treino=${train.length} teste=${test.length} de=${new Date(test[0].t).toISOString()} ate=${new Date(test[test.length - 1].t).toISOString()} altas_no_teste=${upRate}%`);
    // Cada valor: [amostras, acerto %, margem ±%]
    console.log(`SCORE_MODELO ${label} ${JSON.stringify(cov)} estab_top25=${JSON.stringify(stab)}`);
    console.log(`SCORE_REGRAS ${label} ${JSON.stringify(rules)}`);
    console.log(`SCORE_PRODUCAO ${label} ${JSON.stringify(acc(baseHits))}`);
    console.log(`SCORE_PESOS ${label} ${JSON.stringify(Object.fromEntries(FEATURE_NAMES.map((n, j) => [n, +w[j].toFixed(3)]).concat([['bias', +w[w.length - 1].toFixed(3)]])))}`);
    return { rows, w };
}

async function runScore(pool, deps) {
    const { computeTechnicalSignal, computeM1Signal } = deps;
    const pairs = (process.env.BACKTEST_PAIRS || 'EURUSD,EURJPY,XAUUSD').split(',');
    // Sinal de produção (aproximado) com a mesma informação: 99 candles fechados + o candle i completo.
    const base = (c, i) => {
        try {
            const closed = c.slice(i - 99 < 0 ? 0 : i - 99, i), f = c[i];
            return computeM1Signal(closed, f, computeTechnicalSignal(closed, f)).direction;
        } catch { return null; }
    };
    // SCORE_FONTE=td: histórico longo da Twelve Data (semanas), em vez dos poucos dias do coletor.
    if (process.env.SCORE_FONTE === 'td') {
        for (const pair of pairs) {
            for (const [tf, pages, ms] of [['M1', 4, 60_000], ['M5', 4, 300_000]]) {
                try {
                    const c = await deps.fetchLongHistory(pair, tf, pages);
                    console.log(`SCORE_DADOS ${pair} ${tf} td candles=${c.length} de=${c[0] && new Date(c[0].time).toISOString()}`);
                    study(`${pair} ${tf} td`, c.filter((x) => deps.isMarketOpen(new Date(x.time))), ms, tf === 'M1' ? base : null);
                } catch (err) { console.error(`SCORE_ERR ${pair} ${tf} td:`, err.message); }
            }
        }
        return;
    }
    for (const pair of pairs) {
        const { rows } = await pool.query('SELECT time, open, high, low, close FROM otc_candles WHERE active = $1 ORDER BY time', [pair]);
        const m1 = rows.slice(0, -1).map((r) => ({ time: new Date(r.time).getTime(), open: +r.open, high: +r.high, low: +r.low, close: +r.close }));
        console.log(`SCORE_DADOS ${pair} candles_m1=${m1.length} de=${m1[0] && new Date(m1[0].time).toISOString()}`);
        try { study(`${pair} M1`, m1, 60_000, base); } catch (err) { console.error(`SCORE_ERR ${pair} M1:`, err.message); }
        try { study(`${pair} M5`, toM5(m1), 300_000, null); } catch (err) { console.error(`SCORE_ERR ${pair} M5:`, err.message); }
    }
}

module.exports = { runScore, study, samples, series, features, trainLogistic, predict, FEATURE_NAMES, toM5 };
