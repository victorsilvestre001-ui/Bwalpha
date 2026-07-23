const express = require('express');
const { authMiddleware } = require('./authMiddleware');

const router = express.Router();
const AV_BASE = 'https://www.alphavantage.co/query';
const KEY = () => process.env.ALPHA_VANTAGE_API_KEY;

// ============================================================
// IMPORTANTE: o plano gratuito da Alpha Vantage permite só
// 25 requisições por DIA (não por minuto) no total, somando
// todas as funções abaixo. Por isso os caches aqui são de
// HORAS, não segundos — é o único jeito de caber no limite
// gratuito com várias features ativas ao mesmo tempo.
// ============================================================

const PAIRS = [
    { from: 'EUR', to: 'USD', label: 'EURUSD' },
    { from: 'EUR', to: 'JPY', label: 'EURJPY' },
    { from: 'XAU', to: 'USD', label: 'XAUUSD' },
];

// ---------- Cotações (cache: 6h) ----------
let quotesCache = { data: null, updatedAt: 0 };
const QUOTES_TTL_MS = 6 * 60 * 60 * 1000;

async function fetchQuote(pair) {
    const url = `${AV_BASE}?function=CURRENCY_EXCHANGE_RATE&from_currency=${pair.from}&to_currency=${pair.to}&apikey=${KEY()}`;
    const res = await fetch(url);
    const data = await res.json();
    const rateData = data['Realtime Currency Exchange Rate'];
    if (!rateData) return { label: pair.label, error: true };
    return {
        label: pair.label,
        rate: parseFloat(rateData['5. Exchange Rate']),
        bid: parseFloat(rateData['8. Bid Price']),
        ask: parseFloat(rateData['9. Ask Price']),
        updated_at: rateData['6. Last Refreshed'],
    };
}

async function getQuotes() {
    const isStale = Date.now() - quotesCache.updatedAt > QUOTES_TTL_MS;
    if (!quotesCache.data || isStale) {
        try {
            const results = [];
            for (const pair of PAIRS) results.push(await fetchQuote(pair));
            quotesCache = { data: results, updatedAt: Date.now() };
        } catch (err) {
            console.error('Erro ao buscar cotações:', err.message);
        }
    }
    return quotesCache.data || [];
}

// ---------- Indicadores técnicos (cache: 12h) — RSI do EURUSD ----------
let indicatorsCache = { data: null, updatedAt: 0 };
const INDICATORS_TTL_MS = 12 * 60 * 60 * 1000;

async function getIndicators() {
    const isStale = Date.now() - indicatorsCache.updatedAt > INDICATORS_TTL_MS;
    if (!indicatorsCache.data || isStale) {
        try {
            const url = `${AV_BASE}?function=RSI&symbol=EURUSD&interval=daily&time_period=14&series_type=close&apikey=${KEY()}`;
            const res = await fetch(url);
            const data = await res.json();
            const series = data['Technical Analysis: RSI'];
            if (series) {
                const dates = Object.keys(series).sort().reverse();
                const latestDate = dates[0];
                indicatorsCache = {
                    data: {
                        pair: 'EURUSD',
                        rsi: parseFloat(series[latestDate]['RSI']),
                        date: latestDate,
                    },
                    updatedAt: Date.now(),
                };
            }
        } catch (err) {
            console.error('Erro ao buscar indicadores:', err.message);
        }
    }
    return indicatorsCache.data || null;
}

// ---------- Snapshot macroeconômico (cache: 24h) ----------
let econCache = { data: null, updatedAt: 0 };
const ECON_TTL_MS = 24 * 60 * 60 * 1000;

async function fetchEconSeries(functionName) {
    const url = `${AV_BASE}?function=${functionName}&apikey=${KEY()}`;
    const res = await fetch(url);
    const data = await res.json();
    const series = data.data;
    if (!series || !series.length) return null;
    return { date: series[0].date, value: series[0].value };
}

async function getEconomicSnapshot() {
    const isStale = Date.now() - econCache.updatedAt > ECON_TTL_MS;
    if (!econCache.data || isStale) {
        try {
            const [cpi, fedRate, unemployment] = await Promise.all([
                fetchEconSeries('CPI'),
                fetchEconSeries('FEDERAL_FUNDS_RATE'),
                fetchEconSeries('UNEMPLOYMENT'),
            ]);
            econCache = {
                data: { cpi, fedRate, unemployment },
                updatedAt: Date.now(),
            };
        } catch (err) {
            console.error('Erro ao buscar dados macro:', err.message);
        }
    }
    return econCache.data || null;
}

// ---------- Notícias e sentimento (cache: 6h) ----------
let newsCache = { data: null, updatedAt: 0 };
const NEWS_TTL_MS = 6 * 60 * 60 * 1000;

async function getNews() {
    const isStale = Date.now() - newsCache.updatedAt > NEWS_TTL_MS;
    if (!newsCache.data || isStale) {
        try {
            const url = `${AV_BASE}?function=NEWS_SENTIMENT&topics=forex&limit=10&apikey=${KEY()}`;
            const res = await fetch(url);
            const data = await res.json();
            const feed = data.feed || [];
            newsCache = {
                data: feed.slice(0, 8).map((item) => ({
                    title: item.title,
                    url: item.url,
                    source: item.source,
                    sentiment: item.overall_sentiment_label,
                    time_published: item.time_published,
                })),
                updatedAt: Date.now(),
            };
        } catch (err) {
            console.error('Erro ao buscar notícias:', err.message);
        }
    }
    return newsCache.data || [];
}

// ---------- Histórico de preços (cache: 24h) — EURUSD diário ----------
let historyCache = { data: null, updatedAt: 0 };
const HISTORY_TTL_MS = 24 * 60 * 60 * 1000;

async function getHistory() {
    const isStale = Date.now() - historyCache.updatedAt > HISTORY_TTL_MS;
    if (!historyCache.data || isStale) {
        try {
            const url = `${AV_BASE}?function=FX_DAILY&from_symbol=EUR&to_symbol=USD&outputsize=compact&apikey=${KEY()}`;
            const res = await fetch(url);
            const data = await res.json();
            const series = data['Time Series FX (Daily)'];
            if (series) {
                const dates = Object.keys(series).sort().slice(-30);
                historyCache = {
                    data: dates.map((date) => ({
                        date,
                        close: parseFloat(series[date]['4. close']),
                    })),
                    updatedAt: Date.now(),
                };
            }
        } catch (err) {
            console.error('Erro ao buscar histórico:', err.message);
        }
    }
    return historyCache.data || [];
}

// ---------- Rotas ----------
router.get('/quotes', authMiddleware, async (req, res) => {
    try {
        res.json(await getQuotes());
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar cotações' });
    }
});

router.get('/indicators', authMiddleware, async (req, res) => {
    try {
        res.json(await getIndicators());
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar indicadores' });
    }
});

router.get('/economic-snapshot', authMiddleware, async (req, res) => {
    try {
        res.json(await getEconomicSnapshot());
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar dados macro' });
    }
});

router.get('/news', authMiddleware, async (req, res) => {
    try {
        res.json(await getNews());
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar notícias' });
    }
});

router.get('/history', authMiddleware, async (req, res) => {
    try {
        res.json(await getHistory());
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar histórico' });
    }
});

module.exports = { router, getQuotes, getIndicators, getEconomicSnapshot, getNews, getHistory };
