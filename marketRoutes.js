const express = require('express');
const { authMiddleware, requireVip } = require('./authMiddleware');
const pool = require('./db');

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

async function fetchIntradayCandles(pairLabel, timeframeLabel, outputsize = 100) {
    const pair = SIGNAL_PAIRS[pairLabel];
    const interval = SIGNAL_INTERVALS[timeframeLabel];
    if (TD_KEY()) return fetchTwelveDataCandles(pair, interval, outputsize);
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
        direction,
        confidence,
    };
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
    const result = { pair: pairLabel, timeframe: timeframeLabel, ...computeTechnicalSignal(candles, forming) };

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

router.post('/signal', authMiddleware, requireVip, async (req, res) => {
    const { pair, timeframe } = req.body;
    if (!SIGNAL_PAIRS[pair] || !SIGNAL_INTERVALS[timeframe]) {
        return res.status(400).json({ error: 'Par ou timeframe inválido. Use EURUSD/EURJPY/XAUUSD e M1/M5.' });
    }
    if (!isMarketOpen()) {
        return res.status(409).json({ error: 'Mercado fechado no momento. Os ativos abrem de domingo às 22h até sexta às 22h (horário UTC).', marketClosed: true });
    }
    try {
        const result = await getTechnicalSignal(pair, timeframe);
        if (!result) {
            return res.status(502).json({ error: 'Não foi possível calcular o sinal agora. Tente novamente.' });
        }
        const requestedAt = Date.now();
        const { entry, expiry } = computeEntry(timeframe, requestedAt);
        let analysisId = null;
        try {
            const saved = await pool.query(
                `INSERT INTO analyses (user_id, pair, timeframe, direction, confidence, requested_at, entry_time, expiry_time)
                 VALUES ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0), to_timestamp($7 / 1000.0), to_timestamp($8 / 1000.0))
                 RETURNING id`,
                [req.user.id, pair, timeframe, result.direction, result.confidence, requestedAt, entry, expiry]
            );
            analysisId = saved.rows[0].id;
        } catch (err) {
            // O histórico não pode impedir o sinal de ser entregue.
            console.error('Erro ao salvar análise no histórico:', err.message);
        }
        res.json({ ...result, analysisId, requestedAt, entry, expiry });
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
    computeTechnicalSignal, fetchTwelveDataCandles, SIGNAL_PAIRS, SIGNAL_INTERVALS, isMarketOpen,
    emaSeries, rsiLast, macdHistogramLast, detectCandlePatterns, getChinesaStrategySignal, getBwalphaIndicator,
};
