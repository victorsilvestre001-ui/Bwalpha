const express = require('express');
const rateLimit = require('express-rate-limit');
const { authMiddleware, currentPlan, isVipPlan } = require('./authMiddleware');
const pool = require('./db');
const { getLiveM1, getLiveClosed, status: liveStatus } = require('./liveCandles');

const router = express.Router();
const AV_BASE = 'https://www.alphavantage.co/query';
const KEY = () => process.env.ALPHA_VANTAGE_API_KEY;

// Twelve Data: usada para candles intraday (M1/M5) e para o ouro (XAUUSD).
// O FX_INTRADAY da Alpha Vantage é exclusivo do plano pago e não cobre XAU.
const TD_BASE = 'https://api.twelvedata.com';
const TD_KEY = () => process.env.TWELVE_DATA_API_KEY;

// `td` é o símbolo no formato da Twelve Data.
const PAIRS = [
    { from: 'EUR', to: 'USD', label: 'EURUSD', td: 'EUR/USD' },
    { from: 'EUR', to: 'JPY', label: 'EURJPY', td: 'EUR/JPY' },
    { from: 'XAU', to: 'USD', label: 'XAUUSD', td: 'XAU/USD' },
];

let quotesCache = { data: null, updatedAt: 0 };
const QUOTES_TTL_MS = 6 * 60 * 60 * 1000;

async function fetchTwelveDataQuote(pair) {
    const url = `${TD_BASE}/price?symbol=${encodeURIComponent(pair.td)}&apikey=${TD_KEY()}`;
    const res = await fetch(url);
    const data = await res.json();
    const rate = parseFloat(data?.price);
    if (!Number.isFinite(rate)) return { label: pair.label, error: true };
    return { label: pair.label, rate, updated_at: new Date().toISOString() };
}

async function fetchQuote(pair) {
    // A Alpha Vantage não tem cotação de XAU; com a chave da Twelve Data, usa ela para tudo.
    if (TD_KEY()) return fetchTwelveDataQuote(pair);
    if (pair.from === 'XAU') return { label: pair.label, error: true };
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

// ---- Sinal técnico (EMA9/EMA21 + RSI14 + MACD) para EURUSD/EURJPY/XAUUSD em M1/M5 ----

const SIGNAL_PAIRS = Object.fromEntries(PAIRS.map((p) => [p.label, p]));
const SIGNAL_INTERVALS = { M1: '1min', M5: '5min' };

// Forex opera 24h de segunda a sexta. Fecha sexta 22h UTC, reabre domingo 22h UTC.
function isMarketOpen(date = new Date()) {
    const day = date.getUTCDay(); // 0=domingo, 5=sexta, 6=sábado
    const hour = date.getUTCHours();

    if (day === 6) return false; // sábado inteiro fechado
    if (day === 0 && hour < 22) return false; // domingo antes das 22h UTC fechado
    if (day === 5 && hour >= 22) return false; // sexta a partir das 22h UTC fechado

    return true;
}

function emaSeries(values, period) {
    const k = 2 / (period + 1);
    const result = new Array(values.length).fill(null);
    if (values.length < period) return result;
    let sum = 0;
    for (let i = 0; i < period; i++) sum += values[i];
    let prev = sum / period;
    result[period - 1] = prev;
    for (let i = period; i < values.length; i++) {
        prev = values[i] * k + prev * (1 - k);
        result[i] = prev;
    }
    return result;
}

function rsiLast(values, period = 14) {
    if (values.length < period + 1) return null;
    let avgGain = 0, avgLoss = 0;
    for (let i = 1; i <= period; i++) {
        const diff = values[i] - values[i - 1];
        if (diff > 0) avgGain += diff; else avgLoss -= diff;
    }
    avgGain /= period;
    avgLoss /= period;
    for (let i = period + 1; i < values.length; i++) {
        const diff = values[i] - values[i - 1];
        const gain = diff > 0 ? diff : 0;
        const loss = diff < 0 ? -diff : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
}

function macdHistogramLast(values) {
    const ema12 = emaSeries(values, 12);
    const ema26 = emaSeries(values, 26);
    const macdSeries = values.map((_, i) =>
        ema12[i] != null && ema26[i] != null ? ema12[i] - ema26[i] : null
    );
    const macdValid = macdSeries.filter((v) => v != null);
    if (macdValid.length < 9) return null;
    const signalSeries = emaSeries(macdValid, 9);
    const lastMacd = macdValid[macdValid.length - 1];
    const lastSignal = signalSeries[signalSeries.length - 1];
    if (lastSignal == null) return null;
    return lastMacd - lastSignal;
}

async function fetchTwelveDataCandles(pair, interval, outputsize = 100) {
    const url = `${TD_BASE}/time_series?symbol=${encodeURIComponent(pair.td)}&interval=${interval}&outputsize=${outputsize}&timezone=UTC&apikey=${TD_KEY()}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data?.status !== 'ok' || !Array.isArray(data.values)) {
        console.error(`Twelve Data sem candles para ${pair.td} (${interval}):`, data?.message || data?.status);
        return null;
    }
    // A Twelve Data devolve do mais recente para o mais antigo; o resto do código espera o contrário.
    return data.values
        .slice()
        .reverse()
        .map((v) => ({
            time: Date.parse(`${v.datetime.replace(' ', 'T')}Z`),
            open: parseFloat(v.open),
            high: parseFloat(v.high),
            low: parseFloat(v.low),
            close: parseFloat(v.close),
        }));
}

// Reserva: candles da corretora (Exnova) gravados pelo coletor em otc_candles. Usada quando a
// Twelve Data falha (ex.: limite diário de créditos acabou). M5/M15 são montados juntando os M1.
async function fetchExnovaCandles(pairLabel, timeframeLabel, outputsize = 100) {
    if (process.env.EXNOVA_FALLBACK === '0') return null;
    const tfMin = TIMEFRAME_MINUTES[timeframeLabel];
    if (!tfMin) return null;
    try {
        const { rows } = await pool.query(
            `SELECT time, open, high, low, close FROM otc_candles
             WHERE active = $1 AND time > NOW() - ($2::int * INTERVAL '1 minute') ORDER BY time`,
            [pairLabel, Math.min(outputsize, 5000) * tfMin + tfMin]);
        const m1 = rows.map((r) => ({ time: new Date(r.time).getTime(), open: +r.open, high: +r.high, low: +r.low, close: +r.close }));
        if (tfMin === 1) return m1.length ? m1.slice(-outputsize) : null;
        const tfMs = tfMin * 60_000, out = [];
        for (const c of m1) {
            const b = Math.floor(c.time / tfMs) * tfMs;
            const last = out[out.length - 1];
            if (last && last.time === b) {
                last.high = Math.max(last.high, c.high); last.low = Math.min(last.low, c.low); last.close = c.close;
            } else out.push({ time: b, open: c.open, high: c.high, low: c.low, close: c.close });
        }
        return out.length ? out.slice(-outputsize) : null;
    } catch {
        return null;
    }
}

const exnovaFallbackLog = {};
async function fetchIntradayCandles(pairLabel, timeframeLabel, outputsize = 100) {
    const pair = SIGNAL_PAIRS[pairLabel];
    const interval = SIGNAL_INTERVALS[timeframeLabel];
    if (TD_KEY()) {
        const td = await fetchTwelveDataCandles(pair, interval, outputsize).catch(() => null);
        if (td && td.length >= Math.min(40, outputsize)) return td;
        const ex = await fetchExnovaCandles(pairLabel, timeframeLabel, outputsize);
        if (ex && ex.length >= Math.min(40, outputsize)) {
            const k = `${pairLabel}_${timeframeLabel}`;
            if (!(Date.now() - (exnovaFallbackLog[k] || 0) < 10 * 60_000)) {
                exnovaFallbackLog[k] = Date.now();
                console.log(`Candles ${pairLabel} ${timeframeLabel}: Twelve Data indisponível, usando os da Exnova (${ex.length})`);
            }
            return ex;
        }
        return td;
    }
    if (pair.from === 'XAU') {
        console.error('XAUUSD precisa da variável TWELVE_DATA_API_KEY configurada.');
        return null;
    }
    const url = `${AV_BASE}?function=FX_INTRADAY&from_symbol=${pair.from}&to_symbol=${pair.to}&interval=${interval}&outputsize=compact&apikey=${KEY()}`;
    const res = await fetch(url);
    const data = await res.json();
    const series = data[`Time Series FX (${interval})`];
    if (!series) return null;
    const dates = Object.keys(series).sort();
    return dates.map((d) => ({
        time: Date.parse(`${d.replace(' ', 'T')}Z`),
        open: parseFloat(series[d]['1. open']),
        high: parseFloat(series[d]['2. high']),
        low: parseFloat(series[d]['3. low']),
        close: parseFloat(series[d]['4. close']),
    }));
}

// ---- Leitura de padrões de candle (Engolfo, Pin Bar, Inside/Outside Bar, Marubozu,
// Doji, Hammer, Shooting Star, Morning Star, Evening Star) ----

function candleBody(c) { return Math.abs(c.close - c.open); }
function candleRange(c) { return c.high - c.low || 1e-9; }
function upperWick(c) { return c.high - Math.max(c.open, c.close); }
function lowerWick(c) { return Math.min(c.open, c.close) - c.low; }
function isBullCandle(c) { return c.close > c.open; }
function isBearCandle(c) { return c.close < c.open; }
function shortTrend(closes) {
    const n = closes.length;
    if (n < 6) return 'flat';
    const recent = (closes[n - 1] + closes[n - 2] + closes[n - 3]) / 3;
    const prior = (closes[n - 6] + closes[n - 5] + closes[n - 4]) / 3;
    if (recent > prior * 1.0002) return 'up';
    if (recent < prior * 0.9998) return 'down';
    return 'flat';
}

function detectCandlePatterns(candles) {
    const n = candles.length;
    const patterns = [];
    let bullVotes = 0;
    let bearVotes = 0;
    if (n < 3) return { patterns, bullVotes, bearVotes };

    const c1 = candles[n - 3];
    const c2 = candles[n - 2];
    const c3 = candles[n - 1];
    const trend = shortTrend(candles.slice(0, -1).map((c) => c.close));

    // Engolfo (Engulfing)
    if (isBearCandle(c2) && isBullCandle(c3) && c3.open <= c2.close && c3.close >= c2.open) {
        patterns.push('Engolfo de Alta');
        bullVotes += 1;
    } else if (isBullCandle(c2) && isBearCandle(c3) && c3.open >= c2.close && c3.close <= c2.open) {
        patterns.push('Engolfo de Baixa');
        bearVotes += 1;
    }

    // Outside Bar
    if (c3.high > c2.high && c3.low < c2.low) {
        if (isBullCandle(c3)) {
            patterns.push('Outside Bar de Alta');
            bullVotes += 1;
        } else {
            patterns.push('Outside Bar de Baixa');
            bearVotes += 1;
        }
    }

    // Inside Bar (consolidação — informativo, sem voto direcional)
    if (c3.high <= c2.high && c3.low >= c2.low) {
        patterns.push('Inside Bar (consolidação)');
    }

    const bodyRatio3 = candleBody(c3) / candleRange(c3);

    // Marubozu
    if (bodyRatio3 > 0.9) {
        if (isBullCandle(c3)) {
            patterns.push('Marubozu de Alta');
            bullVotes += 1;
        } else {
            patterns.push('Marubozu de Baixa');
            bearVotes += 1;
        }
    }

    // Doji (indecisão — informativo, sem voto direcional)
    if (bodyRatio3 < 0.1) {
        patterns.push('Doji (indecisão)');
    }

    // Pin Bar / Hammer / Shooting Star
    const upper3 = upperWick(c3);
    const lower3 = lowerWick(c3);
    const body3 = candleBody(c3);
    if (lower3 >= body3 * 2 && lower3 >= candleRange(c3) * 0.5 && upper3 <= body3 * 0.6) {
        if (trend === 'down') {
            patterns.push('Hammer (reversão de alta)');
            bullVotes += 1;
        } else {
            patterns.push('Pin Bar de Alta');
            bullVotes += 0.5;
        }
    } else if (upper3 >= body3 * 2 && upper3 >= candleRange(c3) * 0.5 && lower3 <= body3 * 0.6) {
        if (trend === 'up') {
            patterns.push('Shooting Star (reversão de baixa)');
            bearVotes += 1;
        } else {
            patterns.push('Pin Bar de Baixa');
            bearVotes += 0.5;
        }
    }

    // Morning Star / Evening Star (padrão de 3 velas)
    const isBigBody = (c) => candleBody(c) / candleRange(c) > 0.6;
    const isSmallBody = (c) => candleBody(c) / candleRange(c) < 0.35;
    if (isBigBody(c1) && isBearCandle(c1) && isSmallBody(c2) && isBigBody(c3) && isBullCandle(c3) && c3.close > (c1.open + c1.close) / 2) {
        patterns.push('Morning Star (reversão de alta)');
        bullVotes += 1;
    }
    if (isBigBody(c1) && isBullCandle(c1) && isSmallBody(c2) && isBigBody(c3) && isBearCandle(c3) && c3.close < (c1.open + c1.close) / 2) {
        patterns.push('Evening Star (reversão de baixa)');
        bearVotes += 1;
    }

    return { patterns, bullVotes, bearVotes };
}

// ---- "Estratégia Chinesa": leitura do padrão dos últimos 5 candles fechados ----
// Baseado no indicador Lua enviado pelo Victor (ESTRATEGIA CHINESA v3, parte 1B).
// candles[] vem em ordem crescente (mais antigo primeiro, mais recente por último).
function getChinesaStrategySignal(candles, minCandlesConfirmacao = 2) {
    const n = candles.length;
    if (n < 20) return null;

    // c1 = candle mais recente fechado, até c5 = quinto candle fechado antes dele
    // (equivalente aos índices [1]..[5] do script original em Lua/PineScript-like)
    const c1 = candles[n - 1];
    const c2 = candles[n - 2];
    const c3 = candles[n - 3];
    const c4 = candles[n - 4];
    const c5 = candles[n - 5];
    const last5 = [c1, c2, c3, c4, c5];

    const bullCount5 = last5.filter((c) => c.close > c.open).length;
    const bearCount5 = last5.filter((c) => c.close < c.open).length;
    const variacao5 = c1.close - c5.close;

    const padraoAlta = variacao5 > 0 && bullCount5 >= minCandlesConfirmacao;
    const padraoBaixa = variacao5 < 0 && bearCount5 >= minCandlesConfirmacao;

    // Volatilidade: amplitude média dos últimos 5 candles vs. média de 20 candles
    const range = (c) => c.high - c.low;
    const last20 = candles.slice(n - 20, n);
    const rangeCurto = last5.reduce((s, c) => s + range(c), 0) / 5;
    const rangeLongo = last20.reduce((s, c) => s + range(c), 0) / 20;
    const volatilidadeAlta = rangeCurto > rangeLongo * 1.2;
    const volatilidadeBaixa = rangeCurto < rangeLongo * 0.8;

    let direction = null;
    if (padraoAlta) direction = 'COMPRA';
    else if (padraoBaixa) direction = 'VENDA';

    return {
        direction,
        bullCount5,
        bearCount5,
        variacao5,
        volatilidadeAlta,
        volatilidadeBaixa,
    };
}

// ---- Indicador "bwalpha" (script Lua do Victor para IQ Option), partes 1, 2 e 3 ----
// A parte 1B (padrão dos 5 candles) é a getChinesaStrategySignal acima.

function smaAt(values, period, end) {
    if (end + 1 < period) return null;
    let sum = 0;
    for (let i = end - period + 1; i <= end; i++) sum += values[i];
    return sum / period;
}

function wmaAt(values, period, end) {
    if (end + 1 < period) return null;
    let num = 0, den = 0;
    for (let k = 0; k < period; k++) {
        const w = period - k; // peso maior para o valor mais recente
        num += values[end - k] * w;
        den += w;
    }
    return num / den;
}

function stdevAt(values, period, end) {
    const mean = smaAt(values, period, end);
    if (mean == null) return null;
    let sq = 0;
    for (let i = end - period + 1; i <= end; i++) sq += (values[i] - mean) ** 2;
    return Math.sqrt(sq / period);
}

// closed = só candles fechados (mais antigo primeiro); forming = candle atual (pode ser null).
function getBwalphaIndicator(closed, forming, chinesa, opts = {}) {
    const { maFast = 1, maSlow = 34, signalPeriod = 2, periodoSR = 15 } = opts;

    // PARTE 1: buffer1 = sma(open, fast) - sma(open, slow); buffer2 = wma(buffer1, signal).
    // Usa o "open", que já é conhecido quando o candle abre — por isso inclui o candle atual.
    const bars = forming ? [...closed, forming] : closed;
    const opens = bars.map((c) => c.open);
    const buffer1 = opens.map((_, i) => {
        const f = smaAt(opens, maFast, i);
        const sl = smaAt(opens, maSlow, i);
        return f == null || sl == null ? null : f - sl;
    });
    const b2At = (i) => {
        if (i + 1 < signalPeriod) return null;
        const win = buffer1.slice(i - signalPeriod + 1, i + 1);
        if (win.some((v) => v == null)) return null;
        return wmaAt(win, signalPeriod, signalPeriod - 1);
    };
    const last = bars.length - 1;
    const b1 = buffer1[last], b1p = buffer1[last - 1];
    const b2 = b2At(last), b2p = b2At(last - 1);
    let cruzamento = null;
    if ([b1, b1p, b2, b2p].every((v) => v != null)) {
        if (b1 > b2 && b1p < b2p) cruzamento = 'CALL';
        else if (b1 < b2 && b1p > b2p) cruzamento = 'PUT';
    }

    // PARTE 2: bandas (sma10 ± stdev10 × fator) + estocástico(5,1), adaptados à volatilidade.
    const closes = closed.map((c) => c.close);
    const n = closed.length - 1;
    let fatorBanda = 1.6, limiteInferior = 15, limiteSuperior = 85;
    if (chinesa?.volatilidadeAlta) { fatorBanda = 2.0; limiteInferior = 10; limiteSuperior = 90; }
    else if (chinesa?.volatilidadeBaixa) { fatorBanda = 1.3; limiteInferior = 20; limiteSuperior = 80; }

    const media = smaAt(closes, 10, n);
    const desvio = stdevAt(closes, 10, n);
    const bandaSuperior = media != null ? media + desvio * fatorBanda : null;
    const bandaInferior = media != null ? media - desvio * fatorBanda : null;

    const last5 = closed.slice(-5);
    const hh = Math.max(...last5.map((c) => c.high));
    const ll = Math.min(...last5.map((c) => c.low));
    const estocastico = hh > ll ? ((closes[n] - ll) / (hh - ll)) * 100 : 50;

    let alerta = null;
    if (bandaInferior != null && closes[n] <= bandaInferior && estocastico <= limiteInferior) alerta = 'CALL';
    else if (bandaSuperior != null && closes[n] >= bandaSuperior && estocastico >= limiteSuperior) alerta = 'PUT';

    // PARTE 3: suporte/resistência dinâmicos (mínima/máxima dos últimos N candles).
    const lastSR = closed.slice(-periodoSR);
    const resistencia = Math.max(...lastSR.map((c) => c.high));
    const suporte = Math.min(...lastSR.map((c) => c.low));

    return {
        cruzamento,
        buffer1: b1,
        buffer2: b2,
        alerta,
        estocastico,
        limiteInferior,
        limiteSuperior,
        bandaSuperior,
        bandaInferior,
        fatorBanda,
        suporte,
        resistencia,
    };
}

// Remove o candle que ainda está se formando (se houver), para que as leituras usem
// só candles fechados — igual aos índices [1]..[5] do script original.
function splitFormingCandle(candles, intervalMs, now = Date.now()) {
    const lastCandle = candles[candles.length - 1];
    if (lastCandle && Number.isFinite(lastCandle.time) && lastCandle.time + intervalMs > now) {
        return { closed: candles.slice(0, -1), forming: lastCandle };
    }
    return { closed: candles, forming: null };
}

// Cálculo do sinal a partir dos candles fechados (+ o candle em formação, se houver).
// Função pura: usada pela rota de sinal e pelo backtest, para que os dois nunca divirjam.
function computeTechnicalSignal(candles, forming) {
    const closes = candles.map((c) => c.close);

    const ema9Series = emaSeries(closes, 9);
    const ema21Series = emaSeries(closes, 21);
    const ema9 = ema9Series[ema9Series.length - 1];
    const ema21 = ema21Series[ema21Series.length - 1];
    const rsiVal = rsiLast(closes, 14);
    const macdHist = macdHistogramLast(closes);
    const { patterns, bullVotes: patternBull, bearVotes: patternBear } = detectCandlePatterns(candles);

    let bullVotes = 0, bearVotes = 0;
    if (ema9 != null && ema21 != null) {
        if (ema9 > ema21) bullVotes += 1; else bearVotes += 1;
    }
    if (macdHist != null) {
        if (macdHist > 0) bullVotes += 1; else bearVotes += 1;
    }
    if (rsiVal != null) {
        if (rsiVal < 30) bullVotes += 1;
        else if (rsiVal > 70) bearVotes += 1;
        else if (rsiVal >= 50) bullVotes += 0.5;
        else bearVotes += 0.5;
    }
    bullVotes += patternBull;
    bearVotes += patternBear;

    const chinesa = getChinesaStrategySignal(candles);
    const bwalpha = getBwalphaIndicator(candles, forming, chinesa);
    if (bwalpha.cruzamento === 'CALL') bullVotes += 1;
    if (bwalpha.cruzamento === 'PUT') bearVotes += 1;
    if (bwalpha.alerta === 'CALL') bullVotes += 1;
    if (bwalpha.alerta === 'PUT') bearVotes += 1;

    const confluenceDirection = bullVotes >= bearVotes ? 'COMPRA' : 'VENDA';
    const diff = Math.abs(bullVotes - bearVotes);
    const confluenceConfidence = diff >= 2 ? 'Alta' : diff >= 1 ? 'Média' : 'Baixa';

    // "Estratégia Chinesa": o padrão dos últimos 5 candles decide a direção
    // sempre que estiver claro. Os indicadores (EMA/RSI/MACD/padrões de candle)
    // só servem de desempate quando os 5 candles não mostram um padrão nítido.

    let direction;
    let confidence;
    if (chinesa && chinesa.direction) {
        direction = chinesa.direction;
        // Se os indicadores tradicionais concordam com o padrão dos 5 candles,
        // a confiança sobe; se discordam, a confiança cai (nunca some o sinal).
        confidence = direction === confluenceDirection
            ? (confluenceConfidence === 'Baixa' ? 'Média' : 'Alta')
            : 'Baixa';
    } else {
        direction = confluenceDirection;
        confidence = confluenceConfidence;
    }

    return {
        price: (forming || candles[candles.length - 1]).close,
        ema9,
        ema21,
        rsi: rsiVal,
        macdHistogram: macdHist,
        candlePatterns: patterns,
        chinesa5Candles: chinesa
            ? {
                bullCount: chinesa.bullCount5,
                bearCount: chinesa.bearCount5,
                variacao: chinesa.variacao5,
                volatilidadeAlta: chinesa.volatilidadeAlta,
                volatilidadeBaixa: chinesa.volatilidadeBaixa,
              }
            : null,
        bwalpha,
        // Votação só dos indicadores (EMA 9/21, MACD, RSI, padrões de candle e BwAlpha).
        indicadores: { direcao: confluenceDirection, compra: bullVotes, venda: bearVotes, confianca: confluenceConfidence },
        direction,
        confidence,
    };
}

// ---- Sinal M1 "fim do candle" ----
// O backtest (backtest.js) mostrou que, no M1, a melhor leitura é a do candle em formação
// perto do fechamento: quando ele tem corpo forte, o candle seguinte tende a seguir a mesma
// direção. Candle indeciso (doji, muito pavio) não gera entrada.
const M1_MS = 60_000;
const M1_RELEASE_BEFORE_CLOSE_MS = 13_000; // o app pede o sinal 13s antes do candle fechar
const M1_MIN_ELAPSED_MS = 30_000;          // antes disso o candle atual ainda diz pouco
const M1_MIN_ENTRY_LEAD_MS = 4_000;
const M1_MIN_BODY_RATIO = 0.5;

function computeCandleFollowSignal(closed, forming) {
    const range = forming.high - forming.low;
    const body = Math.abs(forming.close - forming.open);
    if (!(range > 0) || body === 0) {
        return { direction: null, reason: 'O candle atual está sem direção (doji). Melhor esperar o próximo.' };
    }
    const bodyRatio = body / range;
    if (bodyRatio < M1_MIN_BODY_RATIO) {
        return { direction: null, bodyRatio, reason: 'O candle atual está indeciso (corpo pequeno e muito pavio). Melhor esperar o próximo.' };
    }
    const recent = closed.slice(-20);
    const avgBody = recent.reduce((a, c) => a + Math.abs(c.close - c.open), 0) / Math.max(recent.length, 1);
    return {
        direction: forming.close > forming.open ? 'COMPRA' : 'VENDA',
        // Corpo acima da média dos últimos 20 candles foi o recorte mais assertivo no backtest.
        confidence: body >= avgBody ? 'Alta' : 'Média',
        bodyRatio,
        bodyVsAvg: avgBody > 0 ? body / avgBody : null,
    };
}

// Versão "sempre COMPRA ou VENDA": candle forte -> segue; candle fraco -> contra
// (no backtest, seguir o candle fraco acertou só 20-39%, e ir contra acertou 61-80%);
// doji -> usa a leitura técnica, com confiança baixa.
// Pin bar no candle atual (pavio longo >= 2x o corpo e >= 50% do candle, pavio oposto curto).
// Devolve o lado do pavio: pavio longo embaixo = 'COMPRA', em cima = 'VENDA'.
function detectPinBar(c) {
    const range = c.high - c.low;
    if (!(range > 0)) return null;
    const body = Math.abs(c.close - c.open);
    const up = c.high - Math.max(c.open, c.close);
    const dn = Math.min(c.open, c.close) - c.low;
    if (dn >= body * 2 && dn >= range * 0.5 && up <= body * 0.6) return 'COMPRA';
    if (up >= body * 2 && up >= range * 0.5 && dn <= body * 0.6) return 'VENDA';
    return null;
}

// Pin bar invertido: no backtest do M1 o candle seguinte foi quase sempre para o lado oposto
// ao pin bar. Experimental (o backtest lê o candle já fechado; aqui ele é lido ~13s antes),
// por isso sai com confiança Média e fica marcado para medir o acerto real no painel do dono.
// Desliga com M1_PINBAR_INVERTIDO=0.
const PINBAR_INVERTIDO = process.env.M1_PINBAR_INVERTIDO !== '0';

// Candle atual sem força clara (fraco, pin bar ou doji): a direção vem dos indicadores
// (EMA 9/21, MACD, RSI, padrões de candle e BwAlpha), para o sinal bater com o que eles mostram.
// Nos sinais reais essas leituras do candle ficaram perto de 50%. Desliga com M1_FRACO_INDICADORES=0.
const FRACO_INDICADORES = () => process.env.M1_FRACO_INDICADORES !== '0';

function computeM1Signal(closed, forming, technical) {
    const follow0 = computeCandleFollowSignal(closed, forming);
    if (FRACO_INDICADORES() && technical && technical.indicadores && !(follow0.direction && !detectPinBar(forming))) {
        const ind = technical.indicadores;
        // Pressão forte (compradores ou vendedores claramente no controle nos últimos candles) vem
        // primeiro: os indicadores (médias, MACD, RSI) atrasam e, logo depois de uma queda ou alta
        // rápida, ainda apontam para o lado antigo. Sem pressão clara, vale a votação dos indicadores.
        const pr = computePressao(closed, forming);
        if (pr && pr.lado) {
            return { direction: pr.lado, confidence: pr.lado === ind.direcao ? 'Média' : 'Baixa', bodyRatio: follow0.bodyRatio ?? null, leitura: 'pressao' };
        }
        return { direction: ind.direcao, confidence: ind.confianca === 'Alta' ? 'Média' : 'Baixa', bodyRatio: follow0.bodyRatio ?? null, leitura: 'indicadores' };
    }
    if (PINBAR_INVERTIDO) {
        const pin = detectPinBar(forming);
        if (pin) return { direction: pin === 'COMPRA' ? 'VENDA' : 'COMPRA', confidence: 'Média', leitura: 'pinbar_invertido' };
    }
    const follow = computeCandleFollowSignal(closed, forming);
    if (follow.direction) return { ...follow, leitura: 'forte' };
    const body = forming.close - forming.open;
    if (body !== 0) {
        return { direction: body > 0 ? 'VENDA' : 'COMPRA', confidence: 'Média', bodyRatio: follow.bodyRatio ?? null, leitura: 'fraco' };
    }
    return { direction: technical.direction, confidence: 'Baixa', leitura: 'doji' };
}

// ---- Ritmo do dia ----
// Antes de entregar o sinal, confere como a mesma regra teria se saído nos candles mais
// recentes do próprio ativo (o "ritmo" do mercado agora). Se o mercado está andando contra
// a leitura, o sinal é invertido; se está indeciso, a confiança cai; se está a favor, sobe.
// Liga com RITMO_DIA=1.
const RITMO_DIA = () => process.env.RITMO_DIA === '1';
const RITMO_JANELA = { M1: 60, M5: 36 };
const RITMO_MIN_AMOSTRAS = 10;
const RITMO_INVERTE = 0.40;   // acerto recente <= 40%: o mercado está fazendo o contrário
const RITMO_FRACO = 0.52;     // abaixo disso: sinal sai com confiança Baixa
const RITMO_FORTE = 0.68;     // acima disso: confiança sobe para Alta

const oppDir = (d) => (d === 'COMPRA' ? 'VENDA' : d === 'VENDA' ? 'COMPRA' : null);

// Acerto recente da regra: M1 = mesma leitura (forte/fraco/pinbar); M5 = sinal técnico.
function ritmoStats(closed, timeframe, leitura) {
    const janela = RITMO_JANELA[timeframe] || 40;
    const start = Math.max(timeframe === 'M1' ? 21 : 50, closed.length - 1 - janela);
    let w = 0, l = 0, wAll = 0, lAll = 0;
    for (let i = start; i < closed.length - 1; i++) {
        const target = closed[i + 1];
        if (target.close === target.open) continue;
        let dir, lei = null;
        if (timeframe === 'M1') {
            const r = computeM1Signal(closed.slice(0, i), closed[i], { direction: null });
            dir = r.direction; lei = r.leitura;
        } else {
            dir = computeTechnicalSignal(closed.slice(0, i), null).direction;
        }
        if (!dir) continue;
        const win = (dir === 'COMPRA') === (target.close > target.open);
        if (win) wAll++; else lAll++;
        if (timeframe !== 'M1' || lei === leitura) { if (win) w++; else l++; }
    }
    // Poucas amostras da mesma leitura: usa o acerto geral da regra.
    if (w + l >= RITMO_MIN_AMOSTRAS) return { n: w + l, wr: w / (w + l) };
    if (wAll + lAll >= RITMO_MIN_AMOSTRAS * 2) return { n: wAll + lAll, wr: wAll / (wAll + lAll) };
    return null;
}

function applyRitmo(closed, timeframe, sig) {
    if (!sig?.direction) return sig;
    const st = ritmoStats(closed, timeframe, sig.leitura);
    if (!st) return sig;
    const ritmo = { amostras: st.n, acertoRecente: Math.round(st.wr * 100) };
    if (st.wr <= RITMO_INVERTE) {
        return { ...sig, direction: oppDir(sig.direction), confidence: 'Média', leitura: `${sig.leitura || 'tecnico'}_ritmo_inv`, ritmo: { ...ritmo, acao: 'invertido' } };
    }
    if (st.wr < RITMO_FRACO) return { ...sig, confidence: 'Baixa', ritmo: { ...ritmo, acao: 'confianca_baixa' } };
    if (st.wr >= RITMO_FORTE && sig.confidence !== 'Alta') return { ...sig, confidence: 'Alta', ritmo: { ...ritmo, acao: 'confianca_alta' } };
    return { ...sig, ritmo: { ...ritmo, acao: 'mantido' } };
}

// ---- Pressão compradora x vendedora ----
// Mede quem está no controle agora: o saldo dos corpos dos últimos 3 candles + o atual
// (em relação ao tamanho médio dos candles) e onde o candle atual está fechando dentro
// do próprio range (perto da máxima = comprador empurrando; perto da mínima = vendedor).
// Resultado de -1 (vendedor total) a +1 (comprador total).
const PRESSAO_FORTE = 0.4;
const PRESSAO_FILTRO = () => process.env.PRESSAO_FILTRO !== '0';

function computePressao(closed, forming) {
    const recent = closed.slice(-20);
    const avgRange = recent.reduce((a, c) => a + (c.high - c.low), 0) / Math.max(recent.length, 1);
    if (!(avgRange > 0)) return null;
    const last = [...closed.slice(-3), ...(forming ? [forming] : [])];
    const saldo = last.reduce((a, c) => a + (c.close - c.open), 0) / avgRange;
    const atual = forming || closed[closed.length - 1];
    const range = atual.high - atual.low;
    const fechamento = range > 0 ? ((atual.close - atual.low) - (atual.high - atual.close)) / range : 0;
    const score = Math.max(-1, Math.min(1, 0.6 * Math.max(-1, Math.min(1, saldo / 2)) + 0.4 * fechamento));
    return {
        score: +score.toFixed(2),
        compradora: Math.round((score + 1) * 50),
        vendedora: 100 - Math.round((score + 1) * 50),
        lado: score >= PRESSAO_FORTE ? 'COMPRA' : score <= -PRESSAO_FORTE ? 'VENDA' : null,
    };
}

// Mercado lateral: os últimos 10 candles fechados ficaram numa faixa estreita (máxima - mínima até
// 3× o tamanho médio de um candle nos 30 anteriores) e quase sem saldo (fechamento perto da abertura).
function isLateral(closed, n = 10) {
    if (closed.length < n + 30) return false;
    const base = closed.slice(-(n + 30), -n);
    const avg = base.reduce((a, c) => a + (c.high - c.low), 0) / base.length;
    if (!(avg > 0)) return false;
    const lat = closed.slice(-n);
    const faixa = Math.max(...lat.map((c) => c.high)) - Math.min(...lat.map((c) => c.low));
    const saldo = Math.abs(lat[lat.length - 1].close - lat[0].open);
    return faixa <= 3 * avg && saldo <= avg;
}

// Volatilidade agora: tamanho médio (máxima - mínima) dos últimos 5 candles fechados em relação
// ao tamanho típico (mediana) dos últimos 60. Só informativo: não muda a direção do sinal.
function computeVolatilidade(closed) {
    const ranges = closed.slice(-60).map((c) => c.high - c.low).filter((r) => r > 0);
    if (ranges.length < 20) return null;
    const sorted = [...ranges].sort((a, b) => a - b);
    const tipico = sorted[Math.floor(sorted.length / 2)];
    const agora = ranges.slice(-5).reduce((a, r) => a + r, 0) / 5;
    if (!(tipico > 0)) return null;
    const ratio = agora / tipico;
    const nivel = ratio < 0.6 ? 'baixa' : ratio < 1.4 ? 'normal' : ratio < 2.5 ? 'alta' : 'extrema';
    const TXT = {
        baixa: ['Mercado lento', 'Candles pequenos: o preço está andando pouco. Os sinais ficam menos confiáveis, opere com cautela.'],
        normal: ['Volatilidade boa para operar', 'O mercado está se movendo num ritmo normal.'],
        alta: ['Mercado volátil', 'Movimentos fortes agora: bom momento para operar, mas use gestão e uma entrada menor.'],
        extrema: ['Volatilidade extrema', 'Movimento muito acima do normal (possível notícia). Risco alto: cuidado ao operar.'],
    };
    return { nivel, ratio: +ratio.toFixed(2), titulo: TXT[nivel][0], texto: TXT[nivel][1] };
}

// Pressão forte manda: se a leitura do candle deu o lado contrário (ex.: VENDA com os
// compradores empurrando), o sinal vai a favor da pressão.
// Pressão forte a favor da leitura confirma a entrada: confiança Alta.
function applyPressao(sig, pressao) {
    if (!sig?.direction || !pressao?.lado) return sig;
    if (pressao.lado === sig.direction) return { ...sig, confidence: 'Alta' };
    return { ...sig, direction: pressao.lado, confidence: 'Média', leitura: `${sig.leitura || 'tecnico'}_pressao` };
}

// ---- Estratégia Chinesa como confirmação do M1 ----
// Padrão dos últimos 5 candles (contando o atual). Não muda a direção: se concorda com a
// leitura do candle, a confiança vira Alta; se discorda, vira Baixa. Desliga com CHINESA_M1=0.
const CHINESA_M1 = () => process.env.CHINESA_M1 !== '0';

function applyChinesa(sig, closed, forming) {
    if (!sig?.direction) return sig;
    const ch = getChinesaStrategySignal(forming ? [...closed, forming] : closed);
    if (!ch?.direction) return { ...sig, chinesa: null };
    const concorda = ch.direction === sig.direction;
    return { ...sig, confidence: concorda ? 'Alta' : 'Baixa', chinesa: { direction: ch.direction, concorda } };
}

const m1Cache = {};

async function getM1Signal(pairLabel, nowMs = Date.now()) {
    const bucketStart = Math.floor(nowMs / M1_MS) * M1_MS;
    const cached = m1Cache[pairLabel];
    // Vários usuários pedem o sinal no mesmo instante do candle: reaproveita por 3s.
    if (cached && cached.bucketStart === bucketStart && nowMs - cached.at < 3000) return cached.result;

    const allCandles = await fetchIntradayCandles(pairLabel, 'M1');
    if (!allCandles || allCandles.length < 40) return null;
    let { closed, forming } = splitFormingCandle(allCandles, M1_MS, nowMs);
    // Sempre prefere o candle montado pelo streaming (WebSocket): quando a API REST traz o candle
    // em formação, ele costuma estar incompleto (às vezes só com a abertura).
    const live = getLiveM1(SIGNAL_PAIRS[pairLabel].td, bucketStart, nowMs);
    if (live) {
        forming = live;
        closed = closed.filter((c) => c.time < bucketStart);
    }
    const liveSource = forming && forming.source ? forming.source : undefined;
    // Candle da corretora: os fechados também vêm dela (mesmo gráfico do cliente), se o histórico
    // dela estiver completo até o minuto anterior; senão fica o da fonte de dados + complemento.
    if (liveSource === 'exnova') {
        const ex = getLiveClosed(SIGNAL_PAIRS[pairLabel].td, 'exnova').filter((c) => c.time < bucketStart);
        // Maior trecho contínuo (até 99 candles) terminando no minuto anterior.
        let tail = [];
        if (ex.length && ex[ex.length - 1].time === bucketStart - M1_MS) {
            tail = [ex[ex.length - 1]];
            for (let i = ex.length - 2; i >= 0 && tail.length < 99 && tail[0].time - ex[i].time === M1_MS; i--) tail.unshift(ex[i]);
        }
        if (tail.length >= 60) {
            const firstEx = tail[0].time;
            closed = [...closed.filter((c) => c.time < firstEx), ...tail].slice(-99);
        }
    }
    // A API REST às vezes entrega os candles fechados com alguns minutos de atraso: completa
    // os minutos que faltam com os montados pelo streaming, para a leitura não usar o passado.
    if (closed.length) {
        const lastRest = closed[closed.length - 1].time;
        const extra = getLiveClosed(SIGNAL_PAIRS[pairLabel].td, liveSource).filter((c) => c.time > lastRest && c.time < bucketStart);
        if (extra.length) closed = [...closed, ...extra];
    }
    const lastClosedTime = closed.length ? closed[closed.length - 1].time : 0;
    const atrasoMin = Math.round((bucketStart - M1_MS - lastClosedTime) / M1_MS);
    if (forming && forming.time === bucketStart && atrasoMin > 0) {
        // Ainda faltam candles recentes: a leitura seria feita com o gráfico "velho".
        console.log(`M1 ${pairLabel}: candles fechados atrasados ${atrasoMin} min (ultimo=${new Date(lastClosedTime).toISOString()})`);
        const result = { pair: pairLabel, timeframe: 'M1', noEntry: true, reason: 'Os dados deste ativo estão chegando atrasados agora. Tente de novo em instantes.' };
        m1Cache[pairLabel] = { bucketStart, at: nowMs, result };
        return result;
    }
    if (!forming || forming.time !== bucketStart) {
        const last = allCandles[allCandles.length - 1];
        console.log(`M1 sem candle atual ${pairLabel}: ultimo=${new Date(last.time).toISOString()} candle_atual=${new Date(bucketStart).toISOString()} websocket=${JSON.stringify(liveStatus)}`);
        if (process.env.M1_EXIGIR_AO_VIVO === '1') {
            // Sem o candle ao vivo a leitura vira cara ou coroa: melhor não dar entrada.
            const result = { pair: pairLabel, timeframe: 'M1', noEntry: true, reason: 'Os dados ao vivo deste ativo estão indisponíveis agora. Tente outro ativo ou aguarde um instante.' };
            m1Cache[pairLabel] = { bucketStart, at: nowMs, result };
            return result;
        }
        // Candle atual ainda não chegou da fonte: usa a leitura técnica dos candles fechados.
        const technical = computeTechnicalSignal(closed, null);
        const result = { ...technical, pair: pairLabel, timeframe: 'M1', confidence: 'Baixa', leitura: 'sem_candle_atual' };
        m1Cache[pairLabel] = { bucketStart, at: nowMs, result };
        return result;
    }
    // Indicadores seguem calculados (inclusive o BwAlpha), mas a decisão do M1 é a leitura do candle atual.
    const technical = computeTechnicalSignal(closed, forming);
    let m1 = computeM1Signal(closed, forming, technical);
    // Ouro: estratégias próprias (ouro.js). Quando uma aparece, ela decide o sinal no fim.
    const ouro = pairLabel === 'XAU/USD' || pairLabel === 'XAUUSD' ? require('./ouro').sinalOuro(closed, forming, technical) : null;
    // Tamanho mínimo: o corpo do candle atual precisa ser pelo menos M1_MIN_BODY_VS_AVG × a média
    // dos corpos dos últimos 20 candles (backtest: 1,0× levou o EURUSD de ~71% para ~75%).
    const minBody = Number(process.env.M1_MIN_BODY_VS_AVG ?? 1.0);
    if (minBody > 0) {
        const recent = closed.slice(-20);
        const avgBody = recent.reduce((a, c) => a + Math.abs(c.close - c.open), 0) / Math.max(recent.length, 1);
        const body = Math.abs(forming.close - forming.open);
        if (avgBody > 0 && body < minBody * avgBody && !ouro) {
            const result = { pair: pairLabel, timeframe: 'M1', noEntry: true, reason: 'O candle atual está sem força (movimento pequeno). Melhor esperar o próximo.' };
            console.log(`M1 ${pairLabel} sem entrada: candle pequeno (corpo ${(body / avgBody).toFixed(2)}× a média) atual=[${forming.open}/${forming.high}/${forming.low}/${forming.close}]`);
            m1Cache[pairLabel] = { bucketStart, at: nowMs, result };
            return result;
        }
    }
    if (m1.leitura === 'doji' && !ouro && process.env.M1_DOJI_SINAL !== '1') {
        // Candle sem corpo: não há leitura de força, seria cara ou coroa. Melhor esperar.
        const result = { pair: pairLabel, timeframe: 'M1', noEntry: true, reason: 'O candle atual está sem direção (doji). Melhor esperar o próximo.' };
        console.log(`M1 ${pairLabel} sem entrada: doji atual=[${forming.open}/${forming.high}/${forming.low}/${forming.close}]`);
        m1Cache[pairLabel] = { bucketStart, at: nowMs, result };
        return result;
    }
    // Sinais reais desde a troca para o candle ao vivo (28-29/09): no EURUSD a leitura "forte"
    // acertou 86% (31/36), já "fraco" 36% e "pinbar_invertido" 44%. Nos pares listados em
    // M1_SO_FORTE_PARES só a leitura "forte" dá entrada (vazio desliga).
    const soForte = (process.env.M1_SO_FORTE_PARES ?? 'EURUSD,EURJPY').split(',').map((x) => x.trim()).filter(Boolean);
    if (soForte.includes(pairLabel) && m1.leitura !== 'forte' && !ouro) {
        const result = { pair: pairLabel, timeframe: 'M1', noEntry: true, reason: 'O candle atual não tem uma direção clara de força. Melhor esperar o próximo.' };
        console.log(`M1 ${pairLabel} sem entrada: leitura ${m1.leitura} (só forte) atual=[${forming.open}/${forming.high}/${forming.low}/${forming.close}]`);
        m1Cache[pairLabel] = { bucketStart, at: nowMs, result };
        return result;
    }
    if (RITMO_DIA()) m1 = applyRitmo(closed, 'M1', m1);
    if (CHINESA_M1()) m1 = applyChinesa(m1, closed, forming);
    // Candle forte: a confiança também olha os indicadores. Chinesa e indicadores a favor -> Alta;
    // os dois contra -> Baixa; divididos -> Média.
    if (m1.leitura === 'forte' && technical.indicadores && FRACO_INDICADORES()) {
        const indOk = technical.indicadores.direcao === m1.direction;
        const chOk = m1.chinesa ? m1.chinesa.concorda : null;
        const a = [indOk, chOk].filter((x) => x !== null);
        const pro = a.filter(Boolean).length;
        m1 = { ...m1, confidence: pro === a.length ? 'Alta' : pro === 0 ? 'Baixa' : 'Média', indicadoresConfirmam: indOk };
    }
    const pressao = computePressao(closed, forming);
    if (PRESSAO_FILTRO()) m1 = applyPressao(m1, pressao);
    // Mercado lateral junto com as outras leituras: a lateralização não vira o sinal sozinha.
    // Só vale quando o candle/pressão (m1) já aponta contra os indicadores: aí o sinal segue e fica
    // marcado 'lateral_confirma' para medir. Se m1 concorda com os indicadores, fica como está.
    // (O teste de ir contra sempre deu 5 WIN x 10 RED em 30/09.) Desliga com LATERAL_CONTRA=0.
    if (process.env.LATERAL_CONTRA !== '0' && technical.indicadores && isLateral(closed)) {
        const contra = technical.indicadores.direcao === 'COMPRA' ? 'VENDA' : 'COMPRA';
        if (m1.direction === contra) m1 = { ...m1, leitura: 'lateral_confirma' };
    }
    if (ouro) m1 = { ...m1, direction: ouro.direction, confidence: 'Média', leitura: ouro.leitura };
    const result = {
        ...technical,
        pair: pairLabel,
        timeframe: 'M1',
        price: forming.close,
        direction: m1.direction,
        confidence: m1.confidence,
        leitura: m1.leitura,
        ritmo: m1.ritmo || null,
        chinesaConfirma: m1.chinesa || null,
        pressao,
        volatilidade: computeVolatilidade(closed),
        candleAtual: { bodyRatio: m1.bodyRatio ?? null, bodyVsAvg: m1.bodyVsAvg ?? null },
    };
    const fmt = (c) => `${new Date(c.time).toISOString().slice(11, 16)} ${c.open}/${c.high}/${c.low}/${c.close}`;
    console.log(`M1 ${pairLabel} ${result.direction} ${result.confidence} leitura=${result.leitura} fonte=${forming.source || 'rest'} ticks=${forming.ticks ?? '-'} atual=[${fmt(forming)}] fechados=[${closed.slice(-3).map(fmt).join(' | ')}]`);
    m1Cache[pairLabel] = { bucketStart, at: nowMs, result };
    return result;
}

const technicalCache = {};
const TIMEFRAME_MINUTES = { M1: 1, M5: 5 };

async function getTechnicalSignal(pairLabel, timeframeLabel) {
    // Alinha o cache com o início da vela atual (candle), não com um tempo fixo.
    // Assim cada vela nova (M1 = a cada 1 min, M5 = a cada 5 min) gera um cálculo
    // fresco de verdade, e cliques dentro da mesma vela reaproveitam o resultado.
    const intervalMs = TIMEFRAME_MINUTES[timeframeLabel] * 60 * 1000;
    const candleBucket = Math.floor(Date.now() / intervalMs);
    const cacheKey = `${pairLabel}_${timeframeLabel}_${candleBucket}`;

    const cached = technicalCache[cacheKey];
    if (cached) return cached;

    const allCandles = await fetchIntradayCandles(pairLabel, timeframeLabel);
    if (!allCandles || allCandles.length < 40) return null;
    const { closed: candles, forming } = splitFormingCandle(allCandles, intervalMs);
    let result = { pair: pairLabel, timeframe: timeframeLabel, ...computeTechnicalSignal(candles, forming) };
    if (RITMO_DIA()) result = applyRitmo(candles, timeframeLabel, result);
    result.pressao = computePressao(candles, forming);
    result.volatilidade = computeVolatilidade(candles);
    if (PRESSAO_FILTRO()) result = applyPressao(result, result.pressao);

    technicalCache[cacheKey] = result;

    // Limpeza simples: mantém só as últimas ~20 velas em cache por par+timeframe
    const prefix = `${pairLabel}_${timeframeLabel}_`;
    const keys = Object.keys(technicalCache).filter((k) => k.startsWith(prefix));
    if (keys.length > 20) {
        keys.sort();
        delete technicalCache[keys[0]];
    }

    return result;
}

router.get('/quotes', authMiddleware, async (req, res) => {
    try {
        res.json(await getQuotes());
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar cotações' });
    }
});

// Endpoint público (sem login) para o ticker de cotações da página inicial
router.get('/public-quotes', async (req, res) => {
    try {
        res.json(await getQuotes());
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar cotações' });
    }
});

// Horário do servidor (UTC em ms) para o site corrigir o relógio do aparelho do usuário,
// que pode estar adiantado ou atrasado em relação ao horário da corretora.
// Candles para o gráfico do painel: os mesmos da Exnova que a IA lê (inclui o candle em formação).
const chartCache = {};
// Mercado fechado: últimos candles gravados, sem limite de tempo, agrupados no timeframe pedido.
async function lastStoredCandles(pairLabel, tfMin, n) {
    const { rows } = await pool.query(
        `SELECT time, open, high, low, close FROM otc_candles WHERE active = $1 ORDER BY time DESC LIMIT $2`,
        [pairLabel, n * tfMin + tfMin]);
    const out = [];
    for (const r of rows.reverse()) {
        const t = new Date(r.time).getTime(), b = Math.floor(t / (tfMin * 60_000)) * tfMin * 60_000, last = out[out.length - 1];
        if (last && last.time === b) {
            last.high = Math.max(last.high, +r.high); last.low = Math.min(last.low, +r.low); last.close = +r.close;
        } else out.push({ time: b, open: +r.open, high: +r.high, low: +r.low, close: +r.close });
    }
    return out.length ? out.slice(-n) : null;
}

router.get('/candles', authMiddleware, async (req, res) => {
    const pair = String(req.query.pair || 'EURUSD').toUpperCase();
    const tf = req.query.tf === 'M5' ? 'M5' : 'M1';
    if (!SIGNAL_PAIRS[pair]) return res.status(400).json({ error: 'Par inválido' });
    const key = `${pair}:${tf}`, now = Date.now();
    if (chartCache[key] && now - chartCache[key].at < 1000) return res.json(chartCache[key].body);
    const n = tf === 'M5' ? 120 : 150;
    let candles = await fetchExnovaCandles(pair, tf, n);
    if (!candles || candles.length < 20) candles = (await lastStoredCandles(pair, tf === 'M5' ? 5 : 1, n).catch(() => null)) || candles;
    if (!candles || !candles.length) return res.status(503).json({ error: 'Gráfico indisponível no momento' });
    const body = { pair, tf, source: 'exnova', candles: candles.map((c) => ({ time: Math.floor(c.time / 1000), open: c.open, high: c.high, low: c.low, close: c.close })) };
    chartCache[key] = { at: now, body };
    res.json(body);
});

// Gráfico da página inicial (sem login): os mesmos candles da Exnova do painel, só M5, com cache.
const publicChartCache = {};
router.get('/public-candles', async (req, res) => {
    const pair = String(req.query.pair || 'XAUUSD').toUpperCase();
    if (!SIGNAL_PAIRS[pair]) return res.status(400).json({ error: 'Par inválido' });
    const now = Date.now(), hit = publicChartCache[pair];
    if (hit && now - hit.at < 5000) return res.json(hit.body);
    try {
        let candles = await fetchExnovaCandles(pair, 'M5', 90);
        // Mercado fechado (fim de semana): mostra os últimos candles gravados em vez de erro.
        if (!candles || candles.length < 20) candles = (await lastStoredCandles(pair, 5, 90)) || candles;
        if (!candles || !candles.length) return res.status(503).json({ error: 'Gráfico indisponível no momento' });
        const body = { pair, tf: 'M5', candles: candles.map((c) => ({ time: Math.floor(c.time / 1000), open: c.open, high: c.high, low: c.low, close: c.close })) };
        publicChartCache[pair] = { at: now, body };
        res.json(body);
    } catch (err) {
        console.error('Erro no gráfico público:', err.message);
        res.status(503).json({ error: 'Gráfico indisponível no momento' });
    }
});

// Números da página inicial, direto do banco (com cache de 1 min). community soma os cadastros do
// outro app do dono (CELEBRA_EXTRA_CADASTROS), a mesma conta usada na comemoração.
let publicStatsCache = null;
router.get('/public-stats', async (req, res) => {
    if (publicStatsCache && Date.now() - publicStatsCache.at < 60_000) return res.json(publicStatsCache.body);
    try {
        const { rows } = await pool.query(`SELECT
            (SELECT COUNT(*)::int FROM users WHERE plan <> 'owner') AS users,
            (SELECT COUNT(*)::int FROM analyses) AS analyses,
            (SELECT MIN(created_at) FROM users) AS since`);
        const r = rows[0];
        const body = {
            community: r.users + (parseInt(process.env.CELEBRA_EXTRA_CADASTROS || '0', 10) || 0),
            analyses: r.analyses,
            daysOnline: r.since ? Math.max(1, Math.ceil((Date.now() - new Date(r.since).getTime()) / 86_400_000)) : null,
        };
        publicStatsCache = { at: Date.now(), body };
        res.json(body);
    } catch (err) {
        console.error('Erro nos números públicos:', err.message);
        res.status(500).json({ error: 'Indisponível' });
    }
});

router.get('/time', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ now: Date.now() });
});

router.get('/status', (req, res) => {
    res.json({ open: isMarketOpen() });
});

// Entrada = abertura do próximo candle; se faltar menos de 10s, vai para o seguinte
// (mesma regra do painel). Calculado no servidor, que tem o relógio certo.
const MIN_ENTRY_LEAD_MS = 10_000;
function computeEntry(timeframeLabel, fromMs = Date.now()) {
    const tf = TIMEFRAME_MINUTES[timeframeLabel] * 60 * 1000;
    let entry = Math.ceil((fromMs + 1) / tf) * tf;
    if (entry - fromMs < MIN_ENTRY_LEAD_MS) entry += tf;
    return { entry, expiry: entry + tf };
}

// Cada sinal consome cotas da API de mercado: no máximo 12 por minuto por conta.
const signalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 12,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `signal:${req.user.id}`,
    message: { error: 'Muitas análises seguidas. Aguarde um minuto.' },
});

// Plano free: sinais grátis só no primeiro dia de uso (o dia, em Brasília, do primeiro sinal).
// Conta só os sinais com entrada, que são os salvos no histórico.
// Quantidade pela variável FREE_TRIAL_SIGNALS no Railway (padrão: 0 = sinais só no VIP).
const FREE_TRIAL_SIGNALS = Math.max(0, parseInt(process.env.FREE_TRIAL_SIGNALS ?? '0', 10) || 0);

// Plano free diário: FREE_DAILY_SIGNALS análises por dia (em Brasília) para toda conta sem VIP.
// Padrão 1. Com 0, volta ao teste grátis do primeiro dia acima.
const FREE_DAILY_SIGNALS = Math.max(0, parseInt(process.env.FREE_DAILY_SIGNALS ?? '1', 10) || 0);

async function freeTrialStatus(userId) {
    if (FREE_DAILY_SIGNALS > 0) {
        const { rows } = await pool.query(
            `SELECT COUNT(*)::int AS used FROM analyses
             WHERE user_id = $1
               AND (requested_at AT TIME ZONE 'America/Sao_Paulo')::date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date`,
            [userId]
        );
        const { used } = rows[0];
        return { used, remaining: Math.max(0, FREE_DAILY_SIGNALS - used), expired: false, daily: true, limit: FREE_DAILY_SIGNALS };
    }
    const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS used,
                BOOL_OR((requested_at AT TIME ZONE 'America/Sao_Paulo')::date
                        < (NOW() AT TIME ZONE 'America/Sao_Paulo')::date) AS started_before_today
         FROM analyses WHERE user_id = $1`,
        [userId]
    );
    const { used, started_before_today: expired } = rows[0];
    return { used, remaining: expired ? 0 : Math.max(0, FREE_TRIAL_SIGNALS - used), expired: !!expired, daily: false, limit: FREE_TRIAL_SIGNALS };
}

async function signalQuota(userId) {
    const plan = await currentPlan(userId);
    if (isVipPlan(plan)) return { vip: true };
    const trial = await freeTrialStatus(userId);
    // O teste grátis é um por CPF: conta antiga sem CPF precisa cadastrar antes de usar.
    const { rows } = await pool.query('SELECT cpf FROM users WHERE id = $1', [userId]);
    const cpfRequired = !rows[0]?.cpf;
    return { vip: false, limit: trial.limit, used: Math.min(trial.used, trial.limit), remaining: trial.remaining, started: trial.used > 0, expired: trial.expired, daily: trial.daily, cpfRequired };
}

router.get('/signal-quota', authMiddleware, async (req, res) => {
    try {
        res.json(await signalQuota(req.user.id));
    } catch (err) {
        console.error('Erro ao consultar sinais grátis:', err.message);
        res.status(500).json({ error: 'Erro ao consultar seus sinais' });
    }
});

async function requireSignalAccess(req, res, next) {
    try {
        const quota = await signalQuota(req.user.id);
        if (!quota.vip && quota.remaining <= 0) {
            return res.status(403).json({
                error: quota.daily
                    ? `Você já usou ${quota.limit === 1 ? 'sua análise grátis' : `suas ${quota.limit} análises grátis`} de hoje. Volte amanhã ou ative o VIP para análises ilimitadas.`
                    : FREE_TRIAL_SIGNALS > 0
                    ? `Seu teste grátis de ${FREE_TRIAL_SIGNALS} sinais já foi usado. Assine o VIP para sinais ilimitados.`
                    : 'Os sinais da IA são exclusivos do VIP. Ative o VIP para liberar.',
                vipRequired: true,
                freeLimitReached: true,
            });
        }
        if (!quota.vip && quota.cpfRequired) {
            return res.status(403).json({ error: 'Cadastre seu CPF para liberar os sinais grátis.', cpfRequired: true });
        }
        req.signalQuota = quota;
        next();
    } catch (err) {
        console.error('Erro ao verificar plano:', err.message);
        res.status(500).json({ error: 'Erro ao verificar seu plano' });
    }
}

// Filtro de notícia (M5): nos horários em que os EUA divulgam dados (8:30, 10:00 e 14:00 de Nova York,
// ~9h30, 11h e 15h de Brasília) o M5 acertou menos e os candles ficaram maiores no backtest de 03/10.
// Nesses minutos o M5 não dá entrada. Usa o horário de Nova York para acompanhar o horário de verão.
// Desliga com FILTRO_NOTICIA_M5=0.
const NY_FMT = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' });
function horarioNoticiaEUA(ms) {
    const parts = Object.fromEntries(NY_FMT.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
    if (parts.weekday === 'Sat' || parts.weekday === 'Sun') return false;
    const m = parseInt(parts.hour, 10) * 60 + parseInt(parts.minute, 10);
    return (m >= 505 && m < 540) || (m >= 595 && m < 630) || (m >= 835 && m < 870);
}

// Ajustes de 07/10 (placar real dos sinais: M1 55%; EURJPY 48%; "confiança" Alta 54,7% x Baixa 56,6%):
//  - SINAL_PAUSADOS (ex.: "EURJPY"; vazio = nenhum): ativos sem sinal até voltarem a mostrar acerto;
//  - a "confiança" na tela vira o acerto histórico real daquele ativo/tempo (acertoHistorico);
//  - M1 também respeita o horário de notícias dos EUA (FILTRO_NOTICIA_M1=0 desliga);
//  - M5 só dá entrada nas regras 1 e 2 (08h e 11h de Brasília, com confirmação), as mesmas do robô.
const PAUSADOS = new Set((process.env.SINAL_PAUSADOS || '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean));
const acertoCache = { at: 0, map: {} };
async function acertoHistorico(pair, timeframe) {
    if (Date.now() - acertoCache.at > 30 * 60_000) {
        try {
            const { rows } = await pool.query(`SELECT pair, timeframe, COUNT(*) FILTER (WHERE result = 'win')::int AS w,
                COUNT(*) FILTER (WHERE result IN ('win', 'loss'))::int AS n FROM analyses GROUP BY 1, 2`);
            acertoCache.map = Object.fromEntries(rows.map((r) => [`${r.pair}:${r.timeframe}`, r]));
            acertoCache.at = Date.now();
        } catch (err) {
            console.error('acertoHistorico erro:', err.message);
        }
    }
    const r = acertoCache.map[`${pair}:${timeframe}`];
    return r && r.n >= 30 ? { pct: Math.round((100 * r.w) / r.n), n: r.n } : null;
}

// M5 pelas regras 1 e 2 (mineradorBacktest/autoTrader): olha o último candle M5 fechado da Exnova antes da entrada.
const REGRAS_M5 = {
    regra1: { se: { cores3: 'RVV', hora: '11', vs_anterior: 'acima_max' }, confirma: (f) => f.tendencia === 'alta', lado: 'COMPRA' },
    regra2: { se: { sequencia: '1', hora: '14', vs_anterior: 'acima_max' }, confirma: (f) => ['0', '-1', '-2'].includes(f.z_media), lado: 'COMPRA' },
};
async function sinalRegrasM5(pair, entry) {
    // O padrão é lido no candle M5 que fecha na hora da entrada (o candle atual), perto do fechamento:
    // a partir de 4 min dele (dados M1 da Exnova, que o coletor atualiza ao vivo).
    const TF = 300_000;
    const { rows } = await pool.query(
        `SELECT time, open, high, low, close FROM otc_candles WHERE active = $1 AND time > NOW() - INTERVAL '14 hours' ORDER BY time`, [pair]);
    const m5 = [];
    for (const r of rows) {
        const t = new Date(r.time).getTime(), b = Math.floor(t / TF) * TF, last = m5[m5.length - 1];
        if (last && last.time === b) { last.high = Math.max(last.high, +r.high); last.low = Math.min(last.low, +r.low); last.close = +r.close; last.n++; }
        else m5.push({ time: b, open: +r.open, high: +r.high, low: +r.low, close: +r.close, n: 1 });
    }
    const atual = m5[m5.length - 1];
    if (!atual || atual.time + TF !== entry) return { semDados: true };
    if (Date.now() - atual.time < 240_000) return { cedo: true, liberaEm: atual.time + 240_000 };
    const c = [...m5.slice(0, -1).filter((x) => x.n === 5), atual];
    const i = c.length - 1;
    if (i < 60) return { semDados: true };
    const minerador = require('./mineradorBacktest');
    const f = minerador.descreve(c, i, minerador.prep(c), pair, TF);
    for (const [nome, r] of Object.entries(REGRAS_M5)) {
        if (Object.entries(r.se).every(([k, v]) => f[k] === v) && r.confirma(f)) return { direction: r.lado, confidence: 'Alta', leitura: nome };
    }
    return null;
}

router.post('/signal', authMiddleware, requireSignalAccess, signalLimiter, async (req, res) => {
    const { pair, timeframe } = req.body;
    if (!SIGNAL_PAIRS[pair] || !SIGNAL_INTERVALS[timeframe]) {
        return res.status(400).json({ error: 'Par ou timeframe inválido. Use EURUSD/EURJPY/XAUUSD e M1/M5.' });
    }
    if (!isMarketOpen()) {
        return res.status(409).json({ error: 'Mercado fechado no momento. Os ativos abrem de domingo às 22h até sexta às 22h (horário UTC).', marketClosed: true });
    }
    if (PAUSADOS.has(pair)) {
        return res.json({
            pair, timeframe, noEntry: true, requestedAt: Date.now(), entry: null, expiry: null, analysisId: null,
            reason: `${pair} está em pausa: no nosso histórico ele acertou menos da metade das leituras. Use EURUSD ou Ouro por enquanto.`,
        });
    }
    try {
        const requestedAt = Date.now();
        let result, entry, expiry;
        if (timeframe === 'M1') {
            const bucketStart = Math.floor(requestedAt / M1_MS) * M1_MS;
            const elapsed = requestedAt - bucketStart;
            if (elapsed < M1_MIN_ELAPSED_MS) {
                return res.status(425).json({
                    error: 'Ainda é cedo para ler este candle. O sinal sai perto do fechamento.',
                    tooEarly: true,
                    releaseAt: bucketStart + M1_MS - M1_RELEASE_BEFORE_CLOSE_MS,
                });
            }
            entry = bucketStart + M1_MS;
            expiry = entry + M1_MS;
            if (process.env.FILTRO_NOTICIA_M1 !== '0' && horarioNoticiaEUA(entry)) {
                return res.json({
                    pair, timeframe, noEntry: true, requestedAt, entry: null, expiry: null, analysisId: null,
                    reason: 'Horário de notícias dos EUA: o mercado costuma ficar instável agora. A leitura volta em alguns minutos.',
                });
            }
            result = await getM1Signal(pair, requestedAt);
            if (result && entry - Date.now() < M1_MIN_ENTRY_LEAD_MS) {
                // Não dá tempo de entrar neste candle: a entrada vai para o seguinte, com confiança baixa.
                entry += M1_MS;
                expiry += M1_MS;
                result = { ...result, confidence: 'Baixa' };
            }
        } else {
            ({ entry, expiry } = computeEntry(timeframe, requestedAt));
            if (process.env.FILTRO_NOTICIA_M5 !== '0' && horarioNoticiaEUA(entry)) {
                return res.json({
                    pair, timeframe, noEntry: true, requestedAt, entry: null, expiry: null, analysisId: null,
                    reason: 'Horário de notícias dos EUA: o mercado costuma ficar instável agora. No M5 a leitura volta em alguns minutos.',
                });
            }
            if (timeframe === 'M5' && process.env.M5_REGRAS !== '0') {
                result = await sinalRegrasM5(pair, entry);
                if (!result || result.cedo || result.semDados) {
                    const reason = result?.cedo
                        ? 'No M5 o padrão é conferido perto do fechamento do candle. Peça de novo a partir de 4 minutos do candle atual.'
                        : 'No M5 a IA só entra quando aparece um dos padrões que mais acertaram, perto das 08h e das 11h de Brasília. Agora não há padrão: tente o M1 ou volte nesses horários.';
                    return res.json({ pair, timeframe, noEntry: true, requestedAt, entry: null, expiry: null, analysisId: null, reason });
                }
            } else {
                result = await getTechnicalSignal(pair, timeframe);
            }
        }
        if (!result) {
            return res.status(502).json({ error: 'Não foi possível calcular o sinal agora. Tente novamente.' });
        }
        if (result.noEntry) {
            // Sem entrada não vai para o histórico: não há operação para conferir.
            return res.json({ ...result, requestedAt, entry: null, expiry: null, analysisId: null });
        }
        let analysisId = null;
        try {
            const saved = await pool.query(
                `INSERT INTO analyses (user_id, pair, timeframe, direction, confidence, requested_at, entry_time, expiry_time, leitura)
                 VALUES ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0), to_timestamp($7 / 1000.0), to_timestamp($8 / 1000.0), $9)
                 RETURNING id`,
                [req.user.id, pair, timeframe, result.direction, result.confidence, requestedAt, entry, expiry, result.leitura || null]
            );
            analysisId = saved.rows[0].id;
        } catch (err) {
            // O histórico não pode impedir o sinal de ser entregue.
            console.error('Erro ao salvar análise no histórico:', err.message);
        }
        const quota = req.signalQuota;
        const freeRemaining = quota.vip ? null : Math.max(0, quota.remaining - (analysisId ? 1 : 0));
        res.json({ ...result, acertoHistorico: await acertoHistorico(pair, timeframe), analysisId, requestedAt, entry, expiry, freeRemaining });
    } catch (err) {
        console.error('Erro ao gerar sinal técnico:', err.message);
        res.status(500).json({ error: 'Erro ao gerar sinal técnico' });
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

module.exports = {
    router, getQuotes, getIndicators, getEconomicSnapshot, getNews, getHistory, fetchIntradayCandles, TIMEFRAME_MINUTES,
    computeTechnicalSignal, computeCandleFollowSignal, computeM1Signal, getM1Signal, horarioNoticiaEUA, fetchTwelveDataCandles, SIGNAL_PAIRS, SIGNAL_INTERVALS, isMarketOpen,
    emaSeries, rsiLast, macdHistogramLast, detectCandlePatterns, detectPinBar, getChinesaStrategySignal, getBwalphaIndicator, applyRitmo, computePressao, applyPressao, applyChinesa, computeVolatilidade, isLateral,
};
