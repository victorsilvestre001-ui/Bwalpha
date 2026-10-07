const express = require('express');
const pool = require('./db');
const { authMiddleware } = require('./authMiddleware');
const { fetchIntradayCandles, TIMEFRAME_MINUTES } = require('./marketRoutes');

const router = express.Router();

// Resultado de cada análise: olha o candle de entrada (abre em entry_time e fecha em
// expiry_time). COMPRA ganha se fechou acima da abertura; VENDA se fechou abaixo.
// Candle praticamente parado (diferença menor que ~0,15 pip no EURUSD) conta como empate:
// nessa faixa o preço de cada corretora varia e o WIN/RED dela pode ser o oposto do nosso.
const DRAW_TOLERANCE = Number(process.env.DRAW_TOLERANCE || 1.5e-5);
function judge(direction, open, close) {
    open = Number(open); close = Number(close);
    if (Math.abs(close - open) <= Math.abs(open) * DRAW_TOLERANCE) return 'draw';
    const up = close > open;
    return (direction === 'COMPRA') === up ? 'win' : 'loss';
}

const MAX_CANDLES = 5000;

// Candles M1 da corretora gravados pelo coletor da Exnova (exnovaCollector.js). No M5 junta 5 de M1.
// JUDGE_SOURCE=twelve volta a conferir só pela fonte de dados.
async function brokerCandles(pair, timeframe, fromMs) {
    if (process.env.JUDGE_SOURCE === 'twelve') return null;
    try {
        const { rows } = await pool.query(
            `SELECT time, open, high, low, close FROM otc_candles WHERE active = $1 AND time >= $2 ORDER BY time`,
            [pair, new Date(fromMs - 5 * 60_000)]);
        if (!rows.length) return null;
        const m1 = rows.map((r) => ({ time: new Date(r.time).getTime(), open: +r.open, high: +r.high, low: +r.low, close: +r.close }));
        const tfMs = TIMEFRAME_MINUTES[timeframe] * 60_000;
        if (tfMs === 60_000) return new Map(m1.map((c) => [c.time, c]));
        const out = new Map();
        const byTime = new Map(m1.map((c) => [c.time, c]));
        for (const c of m1) {
            if (c.time % tfMs !== 0) continue;
            const parts = [];
            for (let t = c.time; t < c.time + tfMs; t += 60_000) if (byTime.has(t)) parts.push(byTime.get(t));
            if (parts.length !== tfMs / 60_000) continue; // falta minuto: usa a fonte de dados
            out.set(c.time, { time: c.time, open: parts[0].open, close: parts[parts.length - 1].close });
        }
        return out;
    } catch (err) {
        return null; // tabela ainda não existe (coletor desligado)
    }
} // limite de uma chamada da Twelve Data
let resolving = null;
let lastResolve = 0;

async function resolvePendingAnalyses() {
    if (resolving) return resolving;
    resolving = (async () => {
        try {
            // Pendentes + reconferência: resultados gravados logo após a expiração (antes do
            // candle estar fechado na fonte de dados) são conferidos de novo com o candle final.
            const { rows } = await pool.query(
                `SELECT id, pair, timeframe, direction, entry_time, expiry_time, result
                 FROM analyses
                 WHERE (result IS NULL AND expiry_time < NOW() - INTERVAL '5 seconds')
                    OR (result IN ('win', 'loss', 'draw')
                        AND resolved_at < expiry_time + INTERVAL '60 seconds'
                        AND expiry_time > NOW() - INTERVAL '48 hours'
                        AND expiry_time < NOW() - INTERVAL '2 minutes')
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
                // Candles da corretora (Exnova, coletados em otc_candles com o nome do ativo): quando
                // existe o candle da corretora, o WIN/RED segue ele, que é o que o cliente vê no gráfico.
                const broker = await brokerCandles(pair, timeframe, oldest);
                const firstTime = candles.length ? candles[0].time : Infinity;

                for (const a of items) {
                    const entryMs = new Date(a.entry_time).getTime();
                    const b = broker && broker.get(entryMs);
                    const bClosed = b && Date.now() - new Date(a.expiry_time).getTime() > 20_000;
                    const c = bClosed ? b : byTime.get(entryMs);
                    // O candle de entrada só está fechado de verdade quando o seguinte já existe na
                    // fonte (ou 3 min depois da expiração). Antes disso o "fechamento" pode ser um
                    // preço de alguns segundos antes do fim e trocar WIN por RED.
                    const closed = bClosed || byTime.has(entryMs + tfMs) || Date.now() - new Date(a.expiry_time).getTime() > 3 * 60 * 1000;
                    if (c && closed) {
                        const result = judge(a.direction, c.open, c.close);
                        if (a.result && a.result !== result) {
                            console.log(`Análise ${a.id} reconferida: ${a.result} -> ${result} (${pair} ${timeframe}${bClosed ? ', corretora' : ''})`);
                        }
                        await pool.query(
                            `UPDATE analyses SET open_price = $1, close_price = $2, result = $3, resolved_at = NOW() WHERE id = $4`,
                            [c.open, c.close, result, a.id]
                        );
                    } else if (!a.result && (entryMs < firstTime || Date.now() - entryMs > 24 * 60 * 60 * 1000)) {
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
    decided: `AND result IN ('win', 'loss', 'draw')`,
    all: '',
};

// Recomeço do histórico: com HISTORY_RESET_AT (data ISO), o histórico e a taxa de acerto
// mostram só os sinais a partir dela. Os antigos seguem no banco (o teste grátis não zera).
// Por conta: users.history_reset_at (definido via HISTORY_RESET_USERS em userLookup.js) recomeça
// só o histórico daquela pessoa; vale a data mais recente entre as duas.
function historyStart(userResetAt) {
    const t = Date.parse(process.env.HISTORY_RESET_AT || '');
    const g = Number.isFinite(t) ? t : 0, u = userResetAt ? new Date(userResetAt).getTime() : 0;
    return new Date(Math.max(g, u));
}

async function userHistoryStart(userId) {
    try {
        const { rows } = await pool.query('SELECT history_reset_at FROM users WHERE id = $1', [userId]);
        return historyStart(rows[0]?.history_reset_at);
    } catch {
        return historyStart(); // coluna ainda não existe
    }
}

router.get('/', authMiddleware, async (req, res) => {
    const filter = FILTERS[req.query.status] !== undefined ? req.query.status : 'all';
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 300);
    try {
        // Confere pendentes antes de responder (no máximo a cada 15s por servidor).
        if (Date.now() - lastResolve > 15_000) await resolvePendingAnalyses();
        const desde = await userHistoryStart(req.user.id);

        const [list, stats] = await Promise.all([
            pool.query(
                `SELECT id, pair, timeframe, direction, confidence, requested_at, entry_time, expiry_time,
                        open_price, close_price, result
                 FROM analyses
                 WHERE user_id = $1 AND requested_at >= $3 ${FILTERS[filter]}
                 ORDER BY requested_at DESC
                 LIMIT $2`,
                [req.user.id, limit, desde]
            ),
            pool.query(
                `SELECT COUNT(*)::int AS total,
                        COUNT(*) FILTER (WHERE result = 'win')::int AS wins,
                        COUNT(*) FILTER (WHERE result = 'loss')::int AS losses,
                        COUNT(*) FILTER (WHERE result = 'draw')::int AS draws,
                        COUNT(*) FILTER (WHERE result IS NULL)::int AS pending
                 FROM analyses WHERE user_id = $1 AND requested_at >= $2`,
                [req.user.id, desde]
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

// Reaplica a regra de empate aos sinais já conferidos nas últimas 48h (usa os preços gravados).
async function rejudgeRecent() {
    try {
        const { rows } = await pool.query(
            `SELECT id, direction, open_price, close_price, result FROM analyses
             WHERE result IN ('win', 'loss') AND open_price IS NOT NULL AND close_price IS NOT NULL
               AND expiry_time > NOW() - INTERVAL '48 hours'`);
        let changed = 0;
        for (const a of rows) {
            const r = judge(a.direction, a.open_price, a.close_price);
            if (r !== a.result) {
                await pool.query('UPDATE analyses SET result = $1 WHERE id = $2', [r, a.id]);
                changed++;
            }
        }
        if (changed) console.log(`Regra de empate: ${changed} sinal(is) das últimas 48h reconferido(s)`);
    } catch (err) {
        console.error('Erro ao reconferir empates:', err.message);
    }
}
setTimeout(rejudgeRecent, 10_000);

module.exports = { router, resolvePendingAnalyses, judge };
