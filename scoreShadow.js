// Análises novas em modo teste escondido, nos candles reais da Exnova (otc_candles). A cada candle
// fechado, cada análise grava a previsão para o próximo candle e, quando ele fecha, o resultado.
// Nada aparece para o cliente. O resumo sai nos logs a cada hora como SCORE_SHADOW_RESUMO.
// Desliga com SCORE_SHADOW=0.
//   score_m5      Score TradeOn (regressão logística) em M5, pesos do estudo de 03/10.
//   rejeicao_m5   Reversão com rejeição: preço 2 desvios fora da média + pavio devolvendo.
const pool = require('./db');
const { series, features, predict } = require('./scoreBacktest');

const PAIRS = ['EURUSD', 'XAUUSD', 'EURJPY'];
// Pesos aprendidos no estudo de 03/10 (M5, ~8 mil candles por ativo). Ordem = FEATURE_NAMES + bias.
const W5 = {
    EURUSD: [-0.046, -0.031, -0.046, 0.063, -0.021, 0.088, 0.074, 0.106, -0.063, 0.006, -0.118, 0.074, 0.079, 0.026, -0.039, -0.013, 0.062],
    XAUUSD: [-0.008, -0.043, -0.005, -0.054, 0.063, 0.171, -0.003, -0.071, -0.043, -0.004, -0.189, 0.04, 0.037, -0.004, 0.08, -0.075, 0.044],
    EURJPY: [-0.037, -0.063, -0.007, -0.036, 0.002, 0.077, 0.051, 0.033, -0.022, 0.017, -0.053, 0.007, -0.002, -0.027, 0.015, 0.105, 0.105],
};

// Cada análise devolve a probabilidade de alta do próximo candle, ou null quando não entra.
const TESTS = {
    score_m5: { min: 5, prob: (pair, c, S, i) => predict(W5[pair], features(c, S, i)) },
    rejeicao_m5: {
        min: 5,
        prob: (pair, c, S, i) => {
            const x = features(c, S, i); // x[4] = desvios da média de 20, x[6] = rejeição
            if (x[4] <= -2 && x[6] > 0.3) return 1;
            if (x[4] >= 2 && x[6] < -0.3) return 0;
            return null;
        },
    },
};

let ready = null, lastSummary = 0;
const done = {}; // `${teste}:${ativo}` → último candle já processado

function ensureTable() {
    ready ||= pool.query(`CREATE TABLE IF NOT EXISTS shadow_tests (
        estrategia TEXT NOT NULL,
        pair TEXT NOT NULL,
        candle_time TIMESTAMPTZ NOT NULL,
        prob REAL NOT NULL,
        direction TEXT NOT NULL,
        result TEXT,
        PRIMARY KEY (estrategia, pair, candle_time))`);
    return ready;
}

function aggregate(m1, min) {
    const tf = min * 60_000, out = [];
    for (const c of m1) {
        const b = Math.floor(c.time / tf) * tf, last = out[out.length - 1];
        if (last && last.time === b) { last.high = Math.max(last.high, c.high); last.low = Math.min(last.low, c.low); last.close = c.close; last.n++; }
        else out.push({ time: b, open: c.open, high: c.high, low: c.low, close: c.close, n: 1 });
    }
    // Só candles completos e já fechados.
    return out.filter((c) => c.n === min && c.time + tf <= Date.now());
}

async function m1Candles(pair, hours) {
    const { rows } = await pool.query(
        `SELECT time, open, high, low, close FROM otc_candles WHERE active = $1 AND time > NOW() - ($2::int * INTERVAL '1 hour') ORDER BY time`, [pair, hours]);
    return rows.map((r) => ({ time: new Date(r.time).getTime(), open: +r.open, high: +r.high, low: +r.low, close: +r.close }));
}

async function tick() {
    const now = Date.now();
    const pending = [];
    for (const [name, t] of Object.entries(TESTS)) {
        const tf = t.min * 60_000, bucket = Math.floor(now / tf) * tf;
        for (const pair of PAIRS) if (done[`${name}:${pair}`] !== bucket) pending.push([name, t, pair, tf, bucket]);
    }
    if (!pending.length) return;
    await ensureTable();
    const cache = {};
    for (const [name, t, pair, tf, bucket] of pending) {
        const key = `${pair}:${t.min}`;
        if (!cache[key]) cache[key] = aggregate(await m1Candles(pair, Math.ceil(t.min * 70 / 60) + 2), t.min);
        const c = cache[key];
        if (c.length < 62) continue;
        // Resultado das previsões cujo candle alvo já fechou.
        const byTime = new Map(c.map((x) => [x.time, x]));
        const { rows: pend } = await pool.query('SELECT candle_time FROM shadow_tests WHERE estrategia = $1 AND pair = $2 AND result IS NULL', [name, pair]);
        for (const r of pend) {
            const tt = new Date(r.candle_time).getTime(), alvo = byTime.get(tt);
            if (alvo) {
                await pool.query(
                    `UPDATE shadow_tests SET result = CASE WHEN $4 THEN 'draw' WHEN (direction = 'COMPRA') = $5 THEN 'win' ELSE 'loss' END
                     WHERE estrategia = $1 AND pair = $2 AND candle_time = $3`,
                    [name, pair, r.candle_time, alvo.close === alvo.open, alvo.close > alvo.open]);
            } else if (now - tt > 6 * 3600_000) {
                await pool.query("UPDATE shadow_tests SET result = 'sem_dados' WHERE estrategia = $1 AND pair = $2 AND candle_time = $3", [name, pair, r.candle_time]);
            }
        }
        // Previsão para o candle atual, só se o último fechado for o anterior e a série for contínua.
        const i = c.length - 1, last = c[i];
        if (last.time + tf !== bucket || last.time - c[i - 60].time !== 60 * tf) continue;
        const p = t.prob(pair, c, series(c), i);
        if (p != null) {
            await pool.query(
                `INSERT INTO shadow_tests (estrategia, pair, candle_time, prob, direction) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
                [name, pair, new Date(bucket), p, p > 0.5 ? 'COMPRA' : 'VENDA']);
        }
        done[`${name}:${pair}`] = bucket;
    }
    if (now - lastSummary > 3600_000) { lastSummary = now; await summary(); }
}

// [estratégia, ativo, amostras, acerto %, amostras top 25%, acerto top 25%]
async function summary() {
    const { rows } = await pool.query(`
        WITH s AS (
            SELECT estrategia, pair, result,
                   NTILE(4) OVER (PARTITION BY estrategia, pair ORDER BY ABS(prob - 0.5) DESC) AS q
            FROM shadow_tests WHERE result IN ('win', 'loss'))
        SELECT estrategia, pair, COUNT(*)::int AS n, ROUND(100.0 * AVG((result = 'win')::int), 1) AS acerto,
               COUNT(*) FILTER (WHERE q = 1)::int AS n_top25,
               ROUND(100.0 * AVG((result = 'win')::int) FILTER (WHERE q = 1), 1) AS acerto_top25
        FROM s GROUP BY 1, 2 ORDER BY 1, 2`);
    console.log('SCORE_SHADOW_RESUMO ' + JSON.stringify(rows.map((r) => Object.values(r))));
}

function start() {
    if (process.env.SCORE_SHADOW === '0') return;
    setInterval(() => tick().catch((err) => console.error('SCORE_SHADOW erro:', err.message)), 20_000);
}

module.exports = { start, summary, TESTS };
