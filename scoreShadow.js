// Score TradeOn em modo teste escondido: a cada candle M5 fechado (candles reais da Exnova),
// grava a previsão do Score para o próximo candle e, quando ele fecha, o resultado. Nada aparece
// para o cliente. O resumo (acerto geral e dos 25% mais confiantes) sai nos logs a cada hora
// como SCORE_SHADOW_RESUMO. Desliga com SCORE_SHADOW=0.
const pool = require('./db');
const { series, features, predict, toM5 } = require('./scoreBacktest');

// Pesos aprendidos no estudo de 03/10 (M5, ~8 mil candles por ativo). Ordem = FEATURE_NAMES + bias.
const W = {
    EURUSD: [-0.046, -0.031, -0.046, 0.063, -0.021, 0.088, 0.074, 0.106, -0.063, 0.006, -0.118, 0.074, 0.079, 0.026, -0.039, -0.013, 0.062],
    XAUUSD: [-0.008, -0.043, -0.005, -0.054, 0.063, 0.171, -0.003, -0.071, -0.043, -0.004, -0.189, 0.04, 0.037, -0.004, 0.08, -0.075, 0.044],
    EURJPY: [-0.037, -0.063, -0.007, -0.036, 0.002, 0.077, 0.051, 0.033, -0.022, 0.017, -0.053, 0.007, -0.002, -0.027, 0.015, 0.105, 0.105],
};
const TF = 300_000;
let ready = null, lastSummary = 0;
const done = {}; // último candle previsto por ativo

function ensureTable() {
    ready ||= pool.query(`CREATE TABLE IF NOT EXISTS score_shadow (
        pair TEXT NOT NULL,
        candle_time TIMESTAMPTZ NOT NULL,
        prob REAL NOT NULL,
        direction TEXT NOT NULL,
        result TEXT,
        PRIMARY KEY (pair, candle_time))`);
    return ready;
}

async function m5Candles(pair) {
    const { rows } = await pool.query(
        `SELECT time, open, high, low, close FROM otc_candles WHERE active = $1 AND time > NOW() - INTERVAL '12 hours' ORDER BY time`, [pair]);
    const m1 = rows.map((r) => ({ time: new Date(r.time).getTime(), open: +r.open, high: +r.high, low: +r.low, close: +r.close }));
    // Só candles M5 completos e já fechados.
    return toM5(m1).filter((c) => c.time + TF <= Date.now());
}

async function tick() {
    const bucket = Math.floor(Date.now() / TF) * TF;
    if (Object.keys(W).every((p) => done[p] === bucket)) return;
    await ensureTable();
    for (const pair of Object.keys(W)) {
        if (done[pair] === bucket) continue;
        const c = await m5Candles(pair);
        if (c.length < 62) continue;
        // Resultado das previsões cujo candle alvo já fechou.
        const byTime = new Map(c.map((x) => [x.time, x]));
        const { rows: pend } = await pool.query('SELECT candle_time FROM score_shadow WHERE pair = $1 AND result IS NULL', [pair]);
        for (const r of pend) {
            const t = new Date(r.candle_time).getTime(), alvo = byTime.get(t);
            if (alvo) {
                const res = alvo.close === alvo.open ? 'draw' : null;
                await pool.query(
                    `UPDATE score_shadow SET result = COALESCE($3, CASE WHEN (direction = 'COMPRA') = $4 THEN 'win' ELSE 'loss' END)
                     WHERE pair = $1 AND candle_time = $2`, [pair, r.candle_time, res, alvo.close > alvo.open]);
            } else if (Date.now() - t > 3 * 3600_000) {
                await pool.query("UPDATE score_shadow SET result = 'sem_dados' WHERE pair = $1 AND candle_time = $2", [pair, r.candle_time]);
            }
        }
        // Previsão para o próximo candle, só se o último fechado for o candle anterior a este e a série for contínua.
        const i = c.length - 1, last = c[i];
        if (last.time + TF !== bucket || last.time - c[i - 60].time !== 60 * TF) continue;
        const p = predict(W[pair], features(c, series(c), i));
        await pool.query(
            `INSERT INTO score_shadow (pair, candle_time, prob, direction) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
            [pair, new Date(bucket), p, p > 0.5 ? 'COMPRA' : 'VENDA']);
        done[pair] = bucket;
    }
    if (Date.now() - lastSummary > 3600_000) { lastSummary = Date.now(); await summary(); }
}

async function summary() {
    const { rows } = await pool.query(`
        WITH s AS (
            SELECT pair, result, ABS(prob - 0.5) AS conf,
                   NTILE(4) OVER (PARTITION BY pair ORDER BY ABS(prob - 0.5) DESC) AS q
            FROM score_shadow WHERE result IN ('win', 'loss'))
        SELECT pair,
               COUNT(*)::int AS n, ROUND(100.0 * AVG((result = 'win')::int), 1) AS acerto,
               COUNT(*) FILTER (WHERE q = 1)::int AS n_top25,
               ROUND(100.0 * AVG((result = 'win')::int) FILTER (WHERE q = 1), 1) AS acerto_top25
        FROM s GROUP BY pair ORDER BY pair`);
    console.log('SCORE_SHADOW_RESUMO ' + JSON.stringify(rows));
}

function start() {
    if (process.env.SCORE_SHADOW === '0') return;
    setInterval(() => tick().catch((err) => console.error('SCORE_SHADOW erro:', err.message)), 20_000);
}

module.exports = { start, summary };
