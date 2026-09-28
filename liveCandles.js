// Candle M1 ao vivo montado a partir do streaming de preços da Twelve Data (WebSocket).
// A API REST só entrega candles já fechados, e a leitura do M1 precisa do candle que está
// se formando. Aqui cada tick de preço atualiza abertura/máxima/mínima/fechamento do minuto.
// No plano grátis o WebSocket é de teste (poucos símbolos); no Pro vale para todos.
const WebSocket = require('ws');

const WS_URL = process.env.TD_WS_URL || 'wss://ws.twelvedata.com/v1/quotes/price';
const M1_MS = 60_000;

const candles = {};   // símbolo -> { time, open, high, low, close, ticks, firstTickAt }
const status = { connected: false, subscribed: [], failed: [], lastTickAt: null };
let ws = null;
let heartbeat = null;
let retryMs = 5_000;

function onTick(symbol, price, tsMs) {
    if (!Number.isFinite(price)) return;
    const minute = Math.floor(tsMs / M1_MS) * M1_MS;
    const c = candles[symbol];
    if (!c || c.time !== minute) {
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

function connect(symbols) {
    const key = process.env.TWELVE_DATA_API_KEY;
    if (!key || process.env.TD_WEBSOCKET === '0') return;
    ws = new WebSocket(`${WS_URL}?apikey=${key}`);
    ws.on('open', () => {
        status.connected = true;
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
            onTick(msg.symbol, Number(msg.price), Number(msg.timestamp) * 1000 || Date.now());
        } else if (msg.event === 'subscribe-status') {
            status.subscribed = (msg.success || []).map((s) => s.symbol);
            status.failed = (msg.fails || []).map((s) => s.symbol);
            console.log(`Twelve Data WebSocket: ok=${status.subscribed.join(',') || '-'} falhou=${status.failed.join(',') || '-'} ${msg.message || ''}`);
        }
    });
    ws.on('close', () => {
        status.connected = false;
        clearInterval(heartbeat);
        setTimeout(() => connect(symbols), retryMs);
        retryMs = Math.min(retryMs * 2, 5 * 60_000);
    });
    ws.on('error', (err) => console.error('Twelve Data WebSocket erro:', err.message));
}

// Candle do minuto atual, só se o streaming acompanhou o minuto desde o começo
// (senão a abertura/máxima/mínima estariam incompletas).
function getLiveM1(symbol, bucketStart, nowMs = Date.now()) {
    const c = candles[symbol];
    if (!c || c.time !== bucketStart) return null;
    const coveredFromStart = c.prev || c.firstTickAt - bucketStart <= 5_000;
    if (!coveredFromStart || nowMs - status.lastTickAt > 15_000) return null;
    return { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, ticks: c.ticks };
}

module.exports = { connect, getLiveM1, status };
