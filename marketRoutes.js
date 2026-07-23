const express = require('express');
const { authMiddleware } = require('./authMiddleware');

const router = express.Router();

const PAIRS = [
    { from: 'EUR', to: 'USD', label: 'EURUSD' },
    { from: 'EUR', to: 'JPY', label: 'EURJPY' },
    { from: 'GBP', to: 'USD', label: 'GBPUSD' },
    { from: 'XAU', to: 'USD', label: 'XAUUSD' },
];

// Cache em memória — evita estourar o limite de requisições da Alpha Vantage
// (free tier: 5 req/min, 25/dia). Atualiza no máximo 1x por minuto.
let cache = { data: null, updatedAt: 0 };
const CACHE_TTL_MS = 60 * 1000;

async function fetchQuote(pair) {
    const url = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${pair.from}&to_currency=${pair.to}&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    const rateData = data['Realtime Currency Exchange Rate'];

    if (!rateData) {
        return { label: pair.label, error: true };
    }

    return {
        label: pair.label,
        rate: parseFloat(rateData['5. Exchange Rate']),
        bid: parseFloat(rateData['8. Bid Price']),
        ask: parseFloat(rateData['9. Ask Price']),
        updated_at: rateData['6. Last Refreshed'],
    };
}

async function getQuotes() {
    const isStale = Date.now() - cache.updatedAt > CACHE_TTL_MS;

    if (!cache.data || isStale) {
        try {
            // Sequencial (não paralelo) pra não estourar rate limit da API
            const results = [];
            for (const pair of PAIRS) {
                const quote = await fetchQuote(pair);
                results.push(quote);
            }
            cache = { data: results, updatedAt: Date.now() };
        } catch (err) {
            console.error('Erro ao buscar cotações:', err.message);
            // Se falhar, mantém o cache antigo (se existir) em vez de quebrar
        }
    }

    return cache.data || [];
}

router.get('/quotes', authMiddleware, async (req, res) => {
    try {
        const quotes = await getQuotes();
        res.json(quotes);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar cotações' });
    }
});

module.exports = { router, getQuotes };
