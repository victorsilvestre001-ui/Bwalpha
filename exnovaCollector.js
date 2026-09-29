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
        signal: AbortSignal.timeout(20_000),
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

// Pares do mercado aberto que também alimentam a leitura do sinal (LIVE_SOURCE=exnova).
const LIVE_SYMBOLS = { EURUSD: 'EUR/USD', EURJPY: 'EUR/JPY', XAUUSD: 'XAU/USD' };
function feedLive(active, c) {
    const sym = LIVE_SYMBOLS[active];
    if (!sym) return;
    require('./liveCandles').stores.exnova.onCandle(sym, {
        time: Number(c.from) * 1000, open: Number(c.open), high: Number(c.max), low: Number(c.min), close: Number(c.close),
    });
}

async function seedLive() {
    for (const [active, sym] of Object.entries(LIVE_SYMBOLS)) {
        try {
            const { rows } = await pool.query(
                `SELECT time, open, high, low, close FROM otc_candles WHERE active = $1 AND time > NOW() - INTERVAL '3 hours' ORDER BY time`, [active]);
            // O último pode ser o minuto atual (ainda aberto): fica de fora.
            const cur = Math.floor(Date.now() / 60_000) * 60_000;
            require('./liveCandles').stores.exnova.seed(sym, rows
                .map((r) => ({ time: new Date(r.time).getTime(), open: +r.open, high: +r.high, low: +r.low, close: +r.close }))
                .filter((c) => c.time < cur));
        } catch (err) {
            console.error('Exnova: erro ao carregar candles para a leitura', err.message);
        }
    }
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
    // Além dos OTC, grava os pares do mercado aberto que o site analisa: o histórico confere o
    // WIN/RED por eles (analysesRoutes.js). EXNOVA_JUDGE_ACTIVES="" desliga.
    const judge = (process.env.EXNOVA_JUDGE_ACTIVES ?? 'EURUSD,EURJPY,XAUUSD').split(',');
    const wanted = [...new Set([...(process.env.EXNOVA_ACTIVES || 'EURUSD-OTC').split(','), ...judge]
        .map((s) => s.trim().toUpperCase()).filter(Boolean))];
    let ssid;
    try {
        ssid = await login();
    } catch (err) {
        console.error('Exnova OTC: falha no login:', err.message);
        return setTimeout(connect, Math.min((retryMs *= 2), 30 * 60_000));
    }
    console.log('Exnova OTC: login ok, conectando ao servidor de cotações');
    const ws = new WebSocket(WS_URL);
    const byId = {};
    const seen = new Set();
    ws.on('open', () => {
        console.log('Exnova OTC: conexão aberta');
        state.connected = true;
        retryMs = 30_000;
        send(ws, 'ssid', ssid);
    });
    const subscribe = (ids) => {
        for (const [name, id] of Object.entries(ids)) {
            if (byId[id]) continue;
            byId[id] = name;
            send(ws, 'subscribeMessage', { name: 'candle-generated', params: { routingFilters: { active_id: id, size: 60 } } });
        }
        state.actives = { ...state.actives, ...ids };
    };
    // Se a lista de ativos não vier, usa os ids conhecidos (mesma plataforma da IQ Option).
    // EXNOVA_ACTIVE_IDS permite trocar, ex.: "EURUSD-OTC:76,GBPUSD-OTC:81".
    const fallback = setTimeout(() => {
        if (Object.keys(byId).length) return;
        const known = Object.fromEntries((process.env.EXNOVA_ACTIVE_IDS || 'EURUSD-OTC:76').split(',')
            .map((s) => s.trim().split(':')).filter(([n, id]) => n && id).map(([n, id]) => [n.toUpperCase(), Number(id)]));
        console.log(`Exnova OTC: lista de ativos não veio, assinando ids conhecidos ${JSON.stringify(known)}`);
        subscribe(known);
    }, 15_000);
    ws.on('message', async (raw) => {
        let m;
        try { m = JSON.parse(raw.toString()); } catch { return; }
        // Diagnóstico: registra cada tipo de mensagem recebida uma vez.
        if (m.name && !seen.has(m.name) && seen.size < 30) {
            seen.add(m.name);
            console.log(`Exnova OTC: mensagem "${m.name}"${m.status ? ` status=${m.status}` : ''}`);
        }
        if (m.name === 'profile') {
            // Autenticado: pede a lista de ativos.
            send(ws, 'sendMessage', { name: 'get-initialization-data', version: '3.0', body: {} });
        } else if (m.name === 'initialization-data') {
            const ids = findActives(m.msg, wanted);
            console.log(`Exnova OTC: ativos encontrados ${JSON.stringify(ids)} (pedidos: ${wanted.join(',')})`);
            // Pedidos sem id na lista: mostra nomes parecidos e usa os ids conhecidos da plataforma
            // (EXNOVA_ACTIVE_IDS, ex.: "EURUSD:1,EURJPY:4,XAUUSD:74"); o 1º candle de cada um vai
            // para o log para conferir pelo preço que é o ativo certo.
            const missing = wanted.filter((n) => !ids[n]);
            if (missing.length) {
                const names = new Set();
                const walk = (node) => {
                    if (!node || typeof node !== 'object') return;
                    if (typeof node.name === 'string' && node.id != null && missing.some((w) => node.name.toUpperCase().includes(w.replace(/-OTC$/, '').slice(0, 6)))) {
                        names.add(`${node.name}:${node.id}`);
                    }
                    for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v);
                };
                walk(m.msg);
                console.log(`Exnova OTC: sem id para ${missing.join(',')}; nomes parecidos: ${[...names].slice(0, 30).join(' ') || '-'}`);
                const known = Object.fromEntries((process.env.EXNOVA_ACTIVE_IDS || 'EURUSD:1,EURJPY:4,XAUUSD:74').split(',')
                    .map((x) => x.trim().split(':')).filter(([n, id]) => n && id && missing.includes(n.toUpperCase()))
                    .map(([n, id]) => [n.toUpperCase(), Number(id)]));
                Object.assign(ids, known);
            }
            if (Object.keys(ids).length) { clearTimeout(fallback); subscribe(ids); }
        } else if (m.name === 'candle-generated' && m.msg && byId[m.msg.active_id] && m.msg.size === 60) {
            if (!state.firstLogged?.[m.msg.active_id]) (state.firstLogged ||= {})[m.msg.active_id] = true, console.log(`Exnova OTC: primeiro candle ${byId[m.msg.active_id]} ${JSON.stringify({ from: m.msg.from, open: m.msg.open, close: m.msg.close, min: m.msg.min, max: m.msg.max })}`);
            try {
                feedLive(byId[m.msg.active_id], m.msg);
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
        clearTimeout(fallback);
        state.connected = false;
        console.log(`Exnova OTC: conexão fechada (${code}), reconectando`);
        setTimeout(connect, retryMs);
    });
    ws.on('error', (err) => console.error('Exnova OTC: erro na conexão:', err.message));
}

async function start() {
    if (process.env.EXNOVA_COLLECT !== '1') return;
    console.log('Exnova OTC: coletor ligado, fazendo login');
    if (!process.env.EXNOVA_EMAIL || !process.env.EXNOVA_PASSWORD) {
        console.error('Exnova OTC: faltam EXNOVA_EMAIL/EXNOVA_PASSWORD.');
        return;
    }
    try {
        await ensureTable();
    } catch (err) {
        return console.error('Exnova OTC: erro ao criar a tabela:', err.message);
    }
    await seedLive();
    connect();
}

module.exports = { start, state };
