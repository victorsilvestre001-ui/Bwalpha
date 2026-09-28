// TESTE: coleta de candles M1 do OTC da Exnova, só para backtest (nada aparece para os clientes).
// Usa a mesma conexão do app da corretora (não é API oficial; pode mudar sem aviso).
// Liga com EXNOVA_COLLECT=1 + EXNOVA_EMAIL + EXNOVA_PASSWORD (use uma conta só para isso).
// EXNOVA_ACTIVES = nomes dos ativos, ex.: "EURUSD-OTC,GBPUSD-OTC" (padrão: EURUSD-OTC).
const WebSocket = require('ws');
const pool = require('./db');

const AUTH_URL = process.env.EXNOVA_AUTH_URL || 'https://auth.trade.exnova.com/api/v2/login';
const WS_URL = process.env.EXNOVA_WS_URL || 'wss://ws.trade.exnova.com/echo/websocket';

const state = { connected: false, actives: {}, saved: 0, lastCandleAt: null };
let retryMs = 30_000;
let reqId = 1;

async function ensureTable() {
    await pool.query(`CREATE TABLE IF NOT EXISTS otc_candles (
        active VARCHAR(40) NOT NULL,
        time TIMESTAMPTZ NOT NULL,
        open NUMERIC NOT NULL, high NUMERIC NOT NULL, low NUMERIC NOT NULL, close NUMERIC NOT NULL,
        PRIMARY KEY (active, time)
    )`);
}

async function login() {
    const res = await fetch(AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: process.env.EXNOVA_EMAIL, password: process.env.EXNOVA_PASSWORD }),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ssid) throw new Error(`login recusado (status ${res.status}${data.code ? `, ${data.code}` : ''})`);
    return data.ssid;
}

function send(ws, name, msg) {
    ws.send(JSON.stringify({ name, request_id: String(reqId++), msg }));
}

// Procura os ids dos ativos pelo nome nos dados de inicialização (binárias/turbo/digitais).
function findActives(init, wanted) {
    const found = {};
    const walk = (node) => {
        if (!node || typeof node !== 'object') return;
        if (node.name && node.id != null && typeof node.name === 'string') {
            const name = node.name.replace(/^front\./, '').toUpperCase();
            if (wanted.includes(name) && !found[name]) found[name] = Number(node.id);
        }
        for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v);
    };
    walk(init);
    return found;
}

async function saveCandle(active, c) {
    const t = new Date(Number(c.from) * 1000);
    await pool.query(
        `INSERT INTO otc_candles (active, time, open, high, low, close) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (active, time) DO UPDATE SET high = EXCLUDED.high, low = EXCLUDED.low, close = EXCLUDED.close`,
        [active, t, c.open, c.max, c.min, c.close]
    );
    state.lastCandleAt = Date.now();
}

async function connect() {
    const wanted = (process.env.EXNOVA_ACTIVES || 'EURUSD-OTC').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    let ssid;
    try {
        ssid = await login();
    } catch (err) {
        console.error('Exnova OTC: falha no login:', err.message);
        return setTimeout(connect, Math.min((retryMs *= 2), 30 * 60_000));
    }
    const ws = new WebSocket(WS_URL);
    const byId = {};
    ws.on('open', () => {
        state.connected = true;
        retryMs = 30_000;
        send(ws, 'ssid', ssid);
        send(ws, 'sendMessage', { name: 'get-initialization-data', version: '3.0', body: {} });
    });
    ws.on('message', async (raw) => {
        let m;
        try { m = JSON.parse(raw.toString()); } catch { return; }
        if (m.name === 'initialization-data') {
            const ids = findActives(m.msg, wanted);
            state.actives = ids;
            console.log(`Exnova OTC: ativos encontrados ${JSON.stringify(ids)} (pedidos: ${wanted.join(',')})`);
            for (const [name, id] of Object.entries(ids)) {
                byId[id] = name;
                send(ws, 'subscribeMessage', { name: 'candle-generated', params: { routingFilters: { active_id: id, size: 60 } } });
            }
        } else if (m.name === 'candle-generated' && m.msg && byId[m.msg.active_id] && m.msg.size === 60) {
            try {
                await saveCandle(byId[m.msg.active_id], m.msg);
                state.saved++;
                if (state.saved === 1 || state.saved % 500 === 0) console.log(`Exnova OTC: ${state.saved} atualizações de candle gravadas`);
            } catch (err) {
                console.error('Exnova OTC: erro ao gravar candle:', err.message);
            }
        } else if (m.name === 'heartbeat') {
            send(ws, 'heartbeat', { userTime: Date.now(), heartbeatTime: m.msg });
        }
    });
    ws.on('close', (code) => {
        state.connected = false;
        console.log(`Exnova OTC: conexão fechada (${code}), reconectando`);
        setTimeout(connect, retryMs);
    });
    ws.on('error', (err) => console.error('Exnova OTC: erro na conexão:', err.message));
}

async function start() {
    if (process.env.EXNOVA_COLLECT !== '1') return;
    if (!process.env.EXNOVA_EMAIL || !process.env.EXNOVA_PASSWORD) {
        console.error('Exnova OTC: faltam EXNOVA_EMAIL/EXNOVA_PASSWORD.');
        return;
    }
    try {
        await ensureTable();
    } catch (err) {
        return console.error('Exnova OTC: erro ao criar a tabela:', err.message);
    }
    connect();
}

module.exports = { start, state };
