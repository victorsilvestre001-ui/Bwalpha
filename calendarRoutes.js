const express = require('express');
const pool = require('./db');
const { authMiddleware } = require('./authMiddleware');

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM economic_events 
             WHERE event_time >= NOW() 
             ORDER BY event_time ASC LIMIT 30`
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar calendário econômico' });
    }
});

router.post('/sync', async (req, res) => {
    const secret = req.headers['x-webhook-secret'];
    if (secret !== process.env.WEBHOOK_SECRET) {
        return res.status(401).json({ error: 'Não autorizado' });
    }

    const events = req.body.events;

    if (!Array.isArray(events)) {
        return res.status(400).json({ error: 'Formato inválido, esperado array de eventos' });
    }

    try {
        for (const ev of events) {
            await pool.query(
                `INSERT INTO economic_events (event_name, country, impact, event_time, forecast, previous, actual)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [ev.event_name, ev.country, ev.impact, ev.event_time, ev.forecast, ev.previous, ev.actual]
            );
        }
        res.json({ inserted: events.length });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao sincronizar eventos' });
    }
});

module.exports = router;
