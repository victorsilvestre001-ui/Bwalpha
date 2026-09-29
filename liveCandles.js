// Candle M1 ao vivo montado a partir do streaming de preços da Twelve Data (WebSocket).
// A API REST só entrega candles já fechados, e a leitura do M1 precisa do candle que está
// se formando. Aqui cada tick de preço atualiza abertura/máxima/mínima/fechamento do minuto.
// No plano grátis o WebSocket é de teste (poucos símbolos); no Pro vale para todos.
const WebSocket = require('ws');

const WS_URL = process.env.TD_WS_URL || 'wss://ws.twelvedata.com/v1/quotes/price';
const M1_MS = 60_000;

const candles = {};   // símbolo -> { time, open, high, low, close, ticks, firstTickAt }
const history = {};   // símbolo -> candles M1 já fechados, montados pelo streaming (últimos 120)
const status = { connected: false, subscribed: [], failed: [], lastTickAt: null };
let ws = null;
let heartbeat = null;
let retryMs = 5_000;

function onTick(symbol, price, tsMs) {
    if (!Number.isFinite(price)) return;
    const minute = Math.floor(tsMs / M1_MS) * M1_MS;
    const c = candles[symbol];
    if (c && c.time > minute) return; // tick atrasado de um minuto que já virou
    if (!c || c.time !== minute) {
        // Guarda o minuto que fechou (se o streaming acompanhou desde o começo dele).
        if (c && process.env.LIVE_TICKS_LOG === '1') {
            console.log(`Ticks ${symbol} ${new Date(c.time).toISOString().slice(11, 16)}: ${c.ticks} ticks, primeiro aos ${Math.round((c.firstTickAt - c.time) / 1000)}s`);
        }
        if (c && (c.prev || c.firstTickAt - c.time <= 5_000)) {
            const h = (history[symbol] ||= []);
            h.push({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close });
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
    // O streaming manda ~30 preços por minuto; com menos de 8 (ex.: logo após reiniciar o servidor)
    // a máxima/mínima do candle ficam imprecisas.
    if (!coveredFromStart || c.ticks < 8 || nowMs - status.lastTickAt > 15_000) return null;
    return { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, ticks: c.ticks };
}

// Auditoria da fonte: a cada 30 min compara os candles montados ao vivo com os candles oficiais
// da API REST (mesmo minuto) e registra quantos têm a mesma direção. Liga com FEED_AUDIT=1.
// `fetchRest(symbolLabel)` devolve os últimos candles M1 da API REST.
function startFeedAudit(pairs, fetchRest) {
    if (process.env.FEED_AUDIT !== '1') return;
    const run = async () => {
        for (const { label, td } of pairs) {
            try {
                const rest = await fetchRest(label);
                if (!rest) continue;
                const byTime = new Map(rest.map((c) => [c.time, c]));
                let n = 0, same = 0, diffSum = 0;
                for (const c of history[td] || []) {
                    const r = byTime.get(c.time);
                    if (!r) continue;
                    const dl = Math.sign(c.close - c.open), dr = Math.sign(r.close - r.open);
                    if (dl === 0 || dr === 0) continue;
                    n++;
                    if (dl === dr) same++;
                    diffSum += Math.abs(c.close - r.close);
                }
                if (n) console.log(`AUDITORIA fonte ${label}: ${same}/${n} candles com a mesma direção (${Math.round(same / n * 100)}%), diferença média no fechamento ${(diffSum / n).toPrecision(3)}`);
            } catch (err) {
                console.error(`AUDITORIA fonte ${label}: erro`, err.message);
            }
        }
    };
    setTimeout(run, 20 * 60_000);
    setInterval(run, 30 * 60_000);
}

// Candles fechados montados pelo streaming, para cobrir os minutos que a API REST ainda não entregou.
function getLiveClosed(symbol) {
    return (history[symbol] || []).slice();
}

module.exports = { connect, getLiveM1, getLiveClosed, startFeedAudit, status };
