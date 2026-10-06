// Robô de teste na conta DEMO (saldo de treino) da Exnova. Pedido do dono em 06/10:
// no máximo 2 entradas por dia (horário de Brasília), só quando todas as análises concordam
// com confiança muito alta. Nunca opera no saldo real: se o saldo de treino não for encontrado,
// não abre nada. Liga com AUTO_TRADE=1 (usa EXNOVA_EMAIL/EXNOVA_PASSWORD, a mesma conta do coletor).
//
// Regra de entrada, na abertura de cada candle M5 (candles reais da Exnova, otc_candles):
//   1. Score M5 entre os 5% mais confiantes dos últimos dias daquele ativo;
//   2. sinal técnico M5 do painel para o mesmo lado, com confiança Alta;
//   3. Reversão com rejeição sem apontar para o lado contrário;
//   4. fora do horário de notícia dos EUA.
// Expiração: fim do candle M5 (5 min). Tudo fica gravado na tabela auto_trades.
const WebSocket = require('ws');
const pool = require('./db');
const { series, features, predict } = require('./scoreBacktest');

const AUTH_URL = process.env.EXNOVA_AUTH_URL || 'https://auth.trade.exnova.com/api/v2/login';
const WS_URL = process.env.EXNOVA_WS_URL || 'wss://ws.trade.exnova.com/echo/websocket';
const PAIRS = ['EURUSD', 'EURJPY', 'XAUUSD'];
const DEFAULT_IDS = { EURUSD: 1, EURJPY: 4, XAUUSD: 74 };
const TF = 300_000;
const MAX_POR_DIA = Math.min(2, parseInt(process.env.AUTO_MAX_DIA, 10) || 2);
const VALOR = Number(process.env.AUTO_VALOR) || 5;
const PCT_TOPO = 0.05; // 5% leituras mais confiantes

const st = { ws: null, ready: false, practiceId: null, reqId: 1, lastBucket: 0, thr: {}, thrAt: 0, pending: new Map() };

const brDay = (ms) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 10);

async function ensureTable() {
    await pool.query(`CREATE TABLE IF NOT EXISTS auto_trades (
        id SERIAL PRIMARY KEY,
        dia DATE NOT NULL,
        pair TEXT NOT NULL,
        candle_time TIMESTAMPTZ NOT NULL,
        direction TEXT NOT NULL,
        prob REAL,
        detalhes JSONB,
        valor NUMERIC,
        ordem_id TEXT,
        status TEXT,
        result TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW())`);
}

function send(name, msg) {
    const request_id = String(st.reqId++);
    st.ws.send(JSON.stringify({ name, request_id, msg }));
    return request_id;
}

async function login() {
    const res = await fetch(AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: process.env.EXNOVA_EMAIL, password: process.env.EXNOVA_PASSWORD }),
        signal: AbortSignal.timeout(20_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ssid) throw new Error(`login recusado (status ${res.status})`);
    return data.ssid;
}

async function connect() {
    let ssid;
    try { ssid = await login(); } catch (err) {
        console.error('ROBO_DEMO: falha no login:', err.message);
        return setTimeout(connect, 5 * 60_000);
    }
    const ws = new WebSocket(WS_URL);
    st.ws = ws;
    ws.on('open', () => send('ssid', ssid));
    ws.on('message', (raw) => {
        let m; try { m = JSON.parse(raw.toString()); } catch { return; }
        if (m.name === 'profile') {
            send('sendMessage', { name: 'get-balances', version: '1.0', body: { types_ids: [1, 4, 2] } });
        } else if (m.name === 'balances' && Array.isArray(m.msg)) {
            // type 4 = saldo de treino. Sem ele, o robô não opera.
            const demo = m.msg.find((b) => Number(b.type) === 4);
            st.practiceId = demo ? Number(demo.id) : null;
            st.ready = !!demo;
            console.log(demo
                ? `ROBO_DEMO: conectado ao saldo de TREINO (saldo ${demo.amount} ${demo.currency || ''})`
                : 'ROBO_DEMO: saldo de treino não encontrado; o robô NÃO vai operar');
        } else if (m.name === 'heartbeat') {
            send('heartbeat', { userTime: Date.now(), heartbeatTime: m.msg });
        } else if (/option/i.test(m.name || '') && !st.pending.has(m.request_id)) {
            // Diagnóstico: avisos da corretora sobre opções (abertura/fechamento).
            console.log(`ROBO_DEMO: ${m.name} ${JSON.stringify(m.msg).slice(0, 300)}`);
        } else if (m.request_id && st.pending.has(m.request_id)) {
            // Resposta ao pedido de abertura.
            const id = st.pending.get(m.request_id);
            st.pending.delete(m.request_id);
            const ok = m.status == null || m.status === 2000 || m.msg?.id;
            const ordem = m.msg?.id != null ? String(m.msg.id) : null;
            console.log(`ROBO_DEMO: resposta da ordem #${id}: ${m.name} status=${m.status ?? '-'} ${JSON.stringify(m.msg).slice(0, 300)}`);
            pool.query('UPDATE auto_trades SET status = $2, ordem_id = $3 WHERE id = $1',
                [id, ok && ordem ? 'aberta' : `recusada: ${String(m.msg?.message || m.status || m.name).slice(0, 80)}`, ordem]).catch(() => {});
        }
    });
    ws.on('close', () => { st.ready = false; setTimeout(connect, 60_000); });
    ws.on('error', (err) => console.error('ROBO_DEMO: erro na conexão:', err.message));
}

function toM5(m1) {
    const out = [];
    for (const c of m1) {
        const b = Math.floor(c.time / TF) * TF, last = out[out.length - 1];
        if (last && last.time === b) { last.high = Math.max(last.high, c.high); last.low = Math.min(last.low, c.low); last.close = c.close; last.n++; }
        else out.push({ time: b, open: c.open, high: c.high, low: c.low, close: c.close, n: 1 });
    }
    return out.filter((c) => c.n === 5 && c.time + TF <= Date.now());
}

async function m5(pair, hours) {
    const { rows } = await pool.query(
        `SELECT time, open, high, low, close FROM otc_candles WHERE active = $1 AND time > NOW() - ($2::int * INTERVAL '1 hour') ORDER BY time`, [pair, hours]);
    return toM5(rows.map((r) => ({ time: new Date(r.time).getTime(), open: +r.open, high: +r.high, low: +r.low, close: +r.close })));
}

// Corte do "muito alta": confiança do Score no percentil 95 dos últimos dias, por ativo.
async function updateThresholds() {
    const { W5 } = require('./scoreShadow');
    for (const pair of PAIRS) {
        const c = await m5(pair, 96);
        if (c.length < 200) continue;
        const S = series(c), confs = [];
        for (let i = 60; i < c.length; i++) {
            if (c[i].time - c[i - 60].time !== 60 * TF) continue;
            confs.push(Math.abs(predict(W5[pair], features(c, S, i)) - 0.5));
        }
        if (confs.length < 200) continue;
        confs.sort((a, b) => b - a);
        st.thr[pair] = confs[Math.floor(confs.length * PCT_TOPO)];
    }
    st.thrAt = Date.now();
    console.log(`ROBO_DEMO: cortes de confiança ${JSON.stringify(st.thr)}`);
}

async function evaluate(pair, bucket) {
    const { W5 } = require('./scoreShadow');
    const { computeTechnicalSignal } = require('./marketRoutes');
    const c = await m5(pair, 14);
    if (c.length < 100) return null;
    const i = c.length - 1, last = c[i];
    if (last.time + TF !== bucket || last.time - c[i - 60].time !== 60 * TF) return null;
    const x = features(c, series(c), i);
    const p = predict(W5[pair], x), conf = Math.abs(p - 0.5);
    const lado = p > 0.5 ? 'COMPRA' : 'VENDA';
    if (st.thr[pair] == null || conf < st.thr[pair]) return null;
    const closed = c.slice(-99);
    const forming = { time: bucket, open: last.close, high: last.close, low: last.close, close: last.close };
    const tec = computeTechnicalSignal(closed, forming);
    if (tec?.direction !== lado || tec?.confidence !== 'Alta') return null;
    const rej = x[4] <= -2 && x[6] > 0.3 ? 'COMPRA' : x[4] >= 2 && x[6] < -0.3 ? 'VENDA' : null;
    if (rej && rej !== lado) return null;
    return { pair, lado, p, conf, detalhes: { score: +p.toFixed(4), corte: +st.thr[pair].toFixed(4), tecnico: tec.confidence, rejeicao: rej } };
}

async function resolveResults() {
    const { rows } = await pool.query(`SELECT id, pair, candle_time, direction FROM auto_trades WHERE result IS NULL AND candle_time < NOW() - INTERVAL '6 minutes'`);
    for (const r of rows) {
        const t = new Date(r.candle_time).getTime();
        const c = (await m5(r.pair, 6)).find((x) => x.time === t);
        if (!c) { if (Date.now() - t > 3 * 3600_000) await pool.query("UPDATE auto_trades SET result = 'sem_dados' WHERE id = $1", [r.id]); continue; }
        const res = c.close === c.open ? 'empate' : (r.direction === 'COMPRA') === (c.close > c.open) ? 'acerto' : 'erro';
        await pool.query('UPDATE auto_trades SET result = $2 WHERE id = $1', [r.id, res]);
        console.log(`ROBO_DEMO: resultado #${r.id} ${r.pair} ${r.direction}: ${res}`);
    }
}

async function tick() {
    const { isMarketOpen, horarioNoticiaEUA } = require('./marketRoutes');
    await resolveResults();
    const now = Date.now(), bucket = Math.floor(now / TF) * TF;
    // Só nos primeiros 20 s do candle, uma vez por candle.
    if (bucket === st.lastBucket || now - bucket > 20_000) return;
    st.lastBucket = bucket;
    if (!st.ready || !isMarketOpen(new Date(bucket)) || !isMarketOpen(new Date(bucket + TF))) return;
    if (horarioNoticiaEUA(bucket)) return;
    // Conta só as entradas aceitas; ordens recusadas pela corretora não gastam a vez, mas no máximo 4 tentativas por dia.
    const { rows } = await pool.query(`SELECT COUNT(*) FILTER (WHERE status NOT LIKE 'recusada%')::int AS ok, COUNT(*)::int AS total
        FROM auto_trades WHERE dia = $1`, [brDay(now)]);
    if (rows[0].ok >= MAX_POR_DIA || rows[0].total >= 4) return;
    if (now - st.thrAt > 6 * 3600_000) await updateThresholds();
    const cands = [];
    for (const pair of PAIRS) {
        try { const e = await evaluate(pair, bucket); if (e) cands.push(e); } catch (err) { console.error(`ROBO_DEMO: erro avaliando ${pair}:`, err.message); }
    }
    if (!cands.length) return;
    const best = cands.sort((a, b) => b.conf - a.conf)[0];
    const ids = { ...DEFAULT_IDS, ...(require('./exnovaCollector').state.actives || {}) };
    const { rows: ins } = await pool.query(
        `INSERT INTO auto_trades (dia, pair, candle_time, direction, prob, detalhes, valor, status) VALUES ($1, $2, $3, $4, $5, $6, $7, 'enviando') RETURNING id`,
        [brDay(now), best.pair, new Date(bucket), best.lado, best.p, best.detalhes, VALOR]);
    const id = ins[0].id;
    if (!st.ready || !st.practiceId) return;
    const req = send('sendMessage', {
        name: 'binary-options.open-option', version: '1.0',
        body: {
            user_balance_id: st.practiceId, active_id: ids[best.pair], option_type_id: 3,
            direction: best.lado === 'COMPRA' ? 'call' : 'put', expired: Math.floor((bucket + TF) / 1000), price: VALOR,
        },
    });
    st.pending.set(req, id);
    console.log(`ROBO_DEMO: entrada #${id} ${best.pair} ${best.lado} (treino, ${VALOR}) ${JSON.stringify(best.detalhes)}`);
}

async function start() {
    if (process.env.AUTO_TRADE !== '1') return;
    if (!process.env.EXNOVA_EMAIL || !process.env.EXNOVA_PASSWORD) return console.error('ROBO_DEMO: faltam EXNOVA_EMAIL/EXNOVA_PASSWORD.');
    try { await ensureTable(); } catch (err) { return console.error('ROBO_DEMO: erro ao criar a tabela:', err.message); }
    console.log(`ROBO_DEMO: ligado (máx. ${MAX_POR_DIA} entradas por dia, valor ${VALOR}, só saldo de treino)`);
    connect();
    setInterval(() => tick().catch((err) => console.error('ROBO_DEMO erro:', err.message)), 5_000);
}

module.exports = { start, evaluate, st };
