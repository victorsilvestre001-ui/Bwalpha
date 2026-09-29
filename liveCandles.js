// Candle M1 ao vivo montado a partir do streaming de preços (WebSocket).
// A API REST só entrega candles já fechados, e a leitura do M1 precisa do candle que está
// se formando. Aqui cada tick de preço atualiza abertura/máxima/mínima/fechamento do minuto.
// Fontes: Twelve Data (padrão; no plano grátis só alguns símbolos) e Finnhub (preços da OANDA,
// em teste). LIVE_SOURCE=finnhub faz os sinais usarem a Finnhub.
const WebSocket = require('ws');

const WS_URL = process.env.TD_WS_URL || 'wss://ws.twelvedata.com/v1/quotes/price';
const FINNHUB_WS_URL = process.env.FINNHUB_WS_URL || 'wss://ws.finnhub.io';
const M1_MS = 60_000;

// Um "store" por fonte: candle do minuto atual + histórico de minutos fechados.
function makeStore(name) {
    const candles = {};   // símbolo -> { time, open, high, low, close, ticks, firstTickAt, prev }
    const history = {};   // símbolo -> candles M1 já fechados (últimos 120)
    const status = { name, connected: false, subscribed: [], failed: [], lastTickAt: null };

    function onTick(symbol, price, tsMs) {
        if (!Number.isFinite(price)) return;
        const minute = Math.floor(tsMs / M1_MS) * M1_MS;
        const c = candles[symbol];
        if (c && c.time > minute) return; // tick atrasado de um minuto que já virou
        if (!c || c.time !== minute) {
            if (c && process.env.LIVE_TICKS_LOG === '1') {
                console.log(`Ticks ${name} ${symbol} ${new Date(c.time).toISOString().slice(11, 16)}: ${c.ticks} ticks, primeiro aos ${Math.round((c.firstTickAt - c.time) / 1000)}s`);
            }
            // Guarda o minuto que fechou (se o streaming acompanhou desde o começo dele).
            if (c && (c.prev || c.firstTickAt - c.time <= 5_000)) {
                const h = (history[symbol] ||= []);
                h.push({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, ticks: c.ticks });
                if (h.length > 120) h.shift();
            }
            // Abre o minuto no fechamento do anterior (se for o minuto seguinte), como no gráfico.
            const open = c && c.time === minute - M1_MS ? c.close : price;
            candles[symbol] = {
                time: minute, open, high: Math.max(open, price), low: Math.min(open, price), close: price,
                ticks: 1, firstTickAt: tsMs, prev: c && c.time === minute - M1_MS ? c : null,
            };
        } else {
            c.high = Math.max(c.high, price);
            c.low = Math.min(c.low, price);
            c.close = price;
            c.ticks++;
        }
        status.lastTickAt = Date.now();
    }

    // Candle do minuto atual, só se o streaming acompanhou o minuto desde o começo
    // (senão a abertura/máxima/mínima estariam incompletas) e com preços suficientes.
    function getLiveM1(symbol, bucketStart, nowMs = Date.now()) {
        const c = candles[symbol];
        if (!c || c.time !== bucketStart) return null;
        const coveredFromStart = c.prev || c.firstTickAt - bucketStart <= 5_000;
        if (!coveredFromStart || c.ticks < 8 || nowMs - status.lastTickAt > 15_000) return null;
        return { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, ticks: c.ticks };
    }

    const getLiveClosed = (symbol) => (history[symbol] || []).slice();
    return { onTick, getLiveM1, getLiveClosed, history, status };
}

const td = makeStore('twelvedata');
const finnhub = makeStore('finnhub');

// ---- Twelve Data ----
function connect(symbols) {
    const key = process.env.TWELVE_DATA_API_KEY;
    if (!key || process.env.TD_WEBSOCKET === '0') return;
    let heartbeat = null;
    let retryMs = 5_000;
    const open = () => {
        const ws = new WebSocket(`${WS_URL}?apikey=${key}`);
        ws.on('open', () => {
            td.status.connected = true;
            retryMs = 5_000;
            ws.send(JSON.stringify({ action: 'subscribe', params: { symbols: symbols.join(',') } }));
            clearInterval(heartbeat);
            heartbeat = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ action: 'heartbeat' }));
            }, 10_000);
        });
        ws.on('message', (raw) => {
            let msg;
            try { msg = JSON.parse(raw.toString()); } catch { return; }
            if (msg.event === 'price') {
                td.onTick(msg.symbol, Number(msg.price), Number(msg.timestamp) * 1000 || Date.now());
            } else if (msg.event === 'subscribe-status') {
                td.status.subscribed = (msg.success || []).map((s) => s.symbol);
                td.status.failed = (msg.fails || []).map((s) => s.symbol);
                console.log(`Twelve Data WebSocket: ok=${td.status.subscribed.join(',') || '-'} falhou=${td.status.failed.join(',') || '-'} ${msg.message || ''}`);
            }
        });
        ws.on('close', () => {
            td.status.connected = false;
            clearInterval(heartbeat);
            setTimeout(open, retryMs);
            retryMs = Math.min(retryMs * 2, 5 * 60_000);
        });
        ws.on('error', (err) => console.error('Twelve Data WebSocket erro:', err.message));
    };
    open();
}

// ---- Finnhub (preços da OANDA) ----
// `map`: símbolo Finnhub -> símbolo usado no site, ex.: { 'OANDA:EUR_USD': 'EUR/USD' }.
function connectFinnhub(map) {
    const key = process.env.FINNHUB_API_KEY;
    if (!key || process.env.FINNHUB_WEBSOCKET === '0') return;
    let retryMs = 5_000;
    let firstTicks = 0;
    const open = () => {
        const ws = new WebSocket(`${FINNHUB_WS_URL}?token=${key}`);
        ws.on('open', () => {
            finnhub.status.connected = true;
            retryMs = 5_000;
            for (const sym of Object.keys(map)) ws.send(JSON.stringify({ type: 'subscribe', symbol: sym }));
            console.log(`Finnhub WebSocket: conectado, assinando ${Object.keys(map).join(',')}`);
        });
        ws.on('message', (raw) => {
            let msg;
            try { msg = JSON.parse(raw.toString()); } catch { return; }
            if (msg.type === 'trade' && Array.isArray(msg.data)) {
                for (const t of msg.data) {
                    const sym = map[t.s];
                    if (!sym) continue;
                    finnhub.onTick(sym, Number(t.p), Number(t.t) || Date.now());
                    if (firstTicks < 3) { firstTicks++; console.log(`Finnhub: preço ${t.s} ${t.p} em ${new Date(Number(t.t)).toISOString()}`); }
                }
            } else if (msg.type === 'error') {
                console.error('Finnhub WebSocket erro:', msg.msg);
            }
        });
        ws.on('close', (code) => {
            finnhub.status.connected = false;
            console.log(`Finnhub WebSocket: fechado (${code}), reconectando`);
            setTimeout(open, retryMs);
            retryMs = Math.min(retryMs * 2, 5 * 60_000);
        });
        ws.on('error', (err) => console.error('Finnhub WebSocket erro:', err.message));
    };
    open();
}

// Fonte usada nos sinais: Twelve Data (padrão) ou Finnhub (LIVE_SOURCE=finnhub).
const active = () => (process.env.LIVE_SOURCE === 'finnhub' ? finnhub : td);
const getLiveM1 = (symbol, bucketStart, nowMs) => active().getLiveM1(symbol, bucketStart, nowMs);
const getLiveClosed = (symbol) => active().getLiveClosed(symbol);

// Auditoria: a cada 30 min compara, minuto a minuto, a direção dos candles de cada fonte ao vivo
// com os candles oficiais da API REST e entre si. Liga com FEED_AUDIT=1.
function startFeedAudit(pairs, fetchRest) {
    if (process.env.FEED_AUDIT !== '1') return;
    const compare = (a, b) => {
        const byTime = new Map(b.map((c) => [c.time, c]));
        let n = 0, same = 0;
        for (const c of a) {
            const r = byTime.get(c.time);
            if (!r) continue;
            const d1 = Math.sign(c.close - c.open), d2 = Math.sign(r.close - r.open);
            if (d1 === 0 || d2 === 0) continue;
            n++;
            if (d1 === d2) same++;
        }
        return n ? `${same}/${n} (${Math.round(same / n * 100)}%)` : 'sem dados';
    };
    const run = async () => {
        for (const { label, td: sym } of pairs) {
            try {
                const rest = (await fetchRest(label)) || [];
                const tdLive = td.getLiveClosed(sym), fhLive = finnhub.getLiveClosed(sym);
                const ticks = fhLive.length ? Math.round(fhLive.reduce((s, c) => s + (c.ticks || 0), 0) / fhLive.length) : 0;
                console.log(`AUDITORIA fonte ${label}: twelve_ao_vivo×oficial ${compare(tdLive, rest)} | finnhub×oficial ${compare(fhLive, rest)} | finnhub×twelve_ao_vivo ${compare(fhLive, tdLive)} | finnhub ~${ticks} preços/min`);
            } catch (err) {
                console.error(`AUDITORIA fonte ${label}: erro`, err.message);
            }
        }
    };
    setTimeout(run, 20 * 60_000);
    setInterval(run, 30 * 60_000);
}

module.exports = { connect, connectFinnhub, getLiveM1, getLiveClosed, startFeedAudit, status: td.status, stores: { td, finnhub } };
