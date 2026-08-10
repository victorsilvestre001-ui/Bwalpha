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

// ---- Sincronização automática com a Financial Modeling Prep (fonte real do
// calendário econômico). Roda periodicamente a partir do server.js. Busca
// eventos dos próximos 7 dias para as economias relevantes aos pares
// negociados (EURUSD, EURJPY) e substitui os eventos futuros já salvos pelos
// mais recentes da FMP. ----

const RELEVANT_COUNTRIES = ['US', 'EU', 'JP', 'DE', 'FR', 'IT', 'ES'];
const FMP_CALENDAR_URL = 'https://financialmodelingprep.com/api/v3/economic_calendar';

// Eventos que a FMP às vezes não marca com "impact" explícito, mas que o
// mercado de fato trata como alto impacto — usado como reforço/fallback.
const HIGH_IMPACT_KEYWORDS = [
    'non farm payroll', 'nonfarm payroll', 'interest rate decision', 'fomc',
    'cpi', 'gdp', 'unemployment rate', 'ecb', 'boj', 'fed', 'inflation rate',
    'retail sales', 'pmi',
];

function mapImpact(ev) {
    const raw = String(ev.impact || '').toLowerCase();
    if (raw === 'high') return 'high';
    if (raw === 'medium' || raw === 'moderate') return 'medium';
    if (raw === 'low') return 'low';

    // Sem campo de impacto vindo da API: usa palavras-chave como fallback.
    const name = String(ev.event || '').toLowerCase();
    if (HIGH_IMPACT_KEYWORDS.some((kw) => name.includes(kw))) return 'high';
    return 'medium';
}

async function syncEconomicCalendar() {
    if (!process.env.FMP_API_KEY) {
        console.error('FMP_API_KEY não configurada — sync do calendário econômico pulado.');
        return;
    }

    try {
        const today = new Date();
        const from = today.toISOString().slice(0, 10);
        const future = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
        const to = future.toISOString().slice(0, 10);

        const url = `${FMP_CALENDAR_URL}?from=${from}&to=${to}&apikey=${process.env.FMP_API_KEY}`;
        const res = await fetch(url);

        if (!res.ok) {
            const errText = await res.text();
            console.error(`Erro ao buscar calendário da FMP (status ${res.status}):`, errText);
            return;
        }

        const data = await res.json();

        if (!Array.isArray(data)) {
            console.error('Resposta inesperada da FMP ao buscar calendário econômico:', JSON.stringify(data).slice(0, 300));
            return;
        }

        const events = data.filter((ev) =>
            RELEVANT_COUNTRIES.includes(String(ev.country).toUpperCase())
        );

        if (events.length === 0) {
            console.log('Nenhum evento econômico relevante retornado pela FMP nesta sincronização.');
            return;
        }

        // Remove eventos futuros antigos antes de inserir os atualizados, para
        // evitar duplicatas e refletir revisões (forecast/actual mudam com o tempo).
        await pool.query(`DELETE FROM economic_events WHERE event_time >= NOW()`);

        let inserted = 0;
        for (const ev of events) {
            const eventTime = new Date(String(ev.date).replace(' ', 'T') + 'Z');
            if (Number.isNaN(eventTime.getTime())) continue;

            await pool.query(
                `INSERT INTO economic_events (event_name, country, impact, event_time, forecast, previous, actual)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    ev.event,
                    ev.country,
                    mapImpact(ev),
                    eventTime,
                    ev.estimate != null ? String(ev.estimate) : null,
                    ev.previous != null ? String(ev.previous) : null,
                    ev.actual != null ? String(ev.actual) : null,
                ]
            );
            inserted += 1;
        }

        console.log(`Calendário econômico sincronizado via FMP: ${inserted} eventos.`);
    } catch (err) {
        console.error('Erro ao sincronizar calendário econômico com a FMP:', err.message);
    }
}

module.exports = { router, syncEconomicCalendar };
