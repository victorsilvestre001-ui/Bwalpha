const express = require('express');
const pool = require('./db');
const { authMiddleware, requirePaidPlan } = require('./authMiddleware');

const router = express.Router();

router.post('/webhook', async (req, res) => {
    const secret = req.headers['x-webhook-secret'];
    if (secret !== process.env.WEBHOOK_SECRET) {
        return res.status(401).json({ error: 'Não autorizado' });
    }

    const { pair, direction, entry_price, stop_loss, take_profit, source } = req.body;

    if (!pair || !direction) {
        return res.status(400).json({ error: 'pair e direction são obrigatórios' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO signals (pair, direction, entry_price, stop_loss, take_profit, source)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [pair, direction, entry_price, stop_loss, take_profit, source || 'bwalpha']
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao registrar sinal' });
    }
});

router.get('/', authMiddleware, requirePaidPlan, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM signals ORDER BY created_at DESC LIMIT 50'
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar sinais' });
    }
});

router.get('/stats', authMiddleware, async (req, res) => {
    try {
        const totals = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE status != 'open') AS total_fechados,
                COUNT(*) FILTER (WHERE status = 'win') AS total_wins,
                COUNT(*) FILTER (WHERE status = 'loss') AS total_losses,
                ROUND(
                    100.0 * COUNT(*) FILTER (WHERE status = 'win') /
                    NULLIF(COUNT(*) FILTER (WHERE status != 'open'), 0), 2
                ) AS win_rate,
                COALESCE(SUM(result_pips), 0) AS total_pips
            FROM signals
        `);

        res.json(totals.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao calcular estatísticas' });
    }
});

router.patch('/:id/close', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const { status, result_pips } = req.body;

    try {
        const result = await pool.query(
            `UPDATE signals SET status = $1, result_pips = $2, closed_at = NOW()
             WHERE id = $3 RETURNING *`,
            [status, result_pips, id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao atualizar sinal' });
    }
});

module.exports = router;
