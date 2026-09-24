const express = require('express');
const pool = require('./db');
const { authMiddleware } = require('./authMiddleware');
const { fetchIntradayCandles, TIMEFRAME_MINUTES } = require('./marketRoutes');

const router = express.Router();

// Resultado de cada análise: olha o candle de entrada (abre em entry_time e fecha em
// expiry_time). COMPRA ganha se fechou acima da abertura; VENDA se fechou abaixo.
function judge(direction, open, close) {
    if (close === open) return 'draw';
    const up = close > open;
    return (direction === 'COMPRA') === up ? 'win' : 'loss';
}

const MAX_CANDLES = 5000; // limite de uma chamada da Twelve Data
let resolving = null;
let lastResolve = 0;

async function resolvePendingAnalyses() {
    if (resolving) return resolving;
    resolving = (async () => {
        try {
            const { rows } = await pool.query(
                `SELECT id, pair, timeframe, direction, entry_time, expiry_time
                 FROM analyses
                 WHERE result IS NULL AND expiry_time < NOW() - INTERVAL '5 seconds'
                 ORDER BY entry_time ASC
                 LIMIT 300`
            );
            if (rows.length === 0) return;

            // Uma chamada de candles por ativo + timeframe, cobrindo desde a análise mais antiga.
            const groups = {};
            for (const r of rows) (groups[`${r.pair}|${r.timeframe}`] ||= []).push(r);

            for (const [key, items] of Object.entries(groups)) {
                const [pair, timeframe] = key.split('|');
                const tfMs = TIMEFRAME_MINUTES[timeframe] * 60 * 1000;
                const oldest = Math.min(...items.map((i) => new Date(i.entry_time).getTime()));
                const needed = Math.min(MAX_CANDLES, Math.ceil((Date.now() - oldest) / tfMs) + 5);

                let candles = null;
                try {
                    candles = await fetchIntradayCandles(pair, timeframe, needed);
                } catch (err) {
                    console.error(`Erro ao buscar candles para conferir ${key}:`, err.message);
                }
                if (!candles) continue;

                const byTime = new Map(candles.map((c) => [c.time, c]));
                const firstTime = candles.length ? candles[0].time : Infinity;

                for (const a of items) {
                    const entryMs = new Date(a.entry_time).getTime();
                    const c = byTime.get(entryMs);
                    if (c) {
                        await pool.query(
                            `UPDATE analyses SET open_price = $1, close_price = $2, result = $3, resolved_at = NOW() WHERE id = $4`,
                            [c.open, c.close, judge(a.direction, c.open, c.close), a.id]
                        );
                    } else if (entryMs < firstTime || Date.now() - entryMs > 24 * 60 * 60 * 1000) {
                        // Candle fora do alcance ou inexistente (mercado fechado): não dá para conferir.
                        await pool.query(`UPDATE analyses SET result = 'unknown', resolved_at = NOW() WHERE id = $1`, [a.id]);
                    }
                    // Senão, o candle ainda não apareceu na fonte de dados: tenta de novo depois.
                }
            }
        } catch (err) {
            console.error('Erro ao conferir análises pendentes:', err.message);
        } finally {
            lastResolve = Date.now();
            resolving = null;
        }
    })();
    return resolving;
}

const FILTERS = {
    win: `AND result = 'win'`,
    loss: `AND result = 'loss'`,
    pending: `AND result IS NULL`,
    decided: `AND result IN ('win', 'loss')`,
    all: '',
};

router.get('/', authMiddleware, async (req, res) => {
    const filter = FILTERS[req.query.status] !== undefined ? req.query.status : 'all';
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 300);
    try {
        // Confere pendentes antes de responder (no máximo a cada 15s por servidor).
        if (Date.now() - lastResolve > 15_000) await resolvePendingAnalyses();

        const [list, stats] = await Promise.all([
            pool.query(
                `SELECT id, pair, timeframe, direction, confidence, requested_at, entry_time, expiry_time,
                        open_price, close_price, result
                 FROM analyses
                 WHERE user_id = $1 ${FILTERS[filter]}
                 ORDER BY requested_at DESC
                 LIMIT $2`,
                [req.user.id, limit]
            ),
            pool.query(
                `SELECT COUNT(*)::int AS total,
                        COUNT(*) FILTER (WHERE result = 'win')::int AS wins,
                        COUNT(*) FILTER (WHERE result = 'loss')::int AS losses,
                        COUNT(*) FILTER (WHERE result = 'draw')::int AS draws,
                        COUNT(*) FILTER (WHERE result IS NULL)::int AS pending
                 FROM analyses WHERE user_id = $1`,
                [req.user.id]
            ),
        ]);

        const s = stats.rows[0];
        const decided = s.wins + s.losses;
        res.json({
            stats: { ...s, winRate: decided > 0 ? s.wins / decided : null },
            items: list.rows.map((r) => ({
                ...r,
                open_price: r.open_price != null ? Number(r.open_price) : null,
                close_price: r.close_price != null ? Number(r.close_price) : null,
            })),
        });
    } catch (err) {
        console.error('Erro ao listar análises:', err.message);
        res.status(500).json({ error: 'Erro ao buscar o histórico de análises' });
    }
});

module.exports = { router, resolvePendingAnalyses, judge };
