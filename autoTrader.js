// Robô de teste na conta DEMO (saldo de treino) da Exnova. Pedido do dono em 06/10:
// no máximo 2 entradas por dia (horário de Brasília), só quando todas as análises concordam
// com confiança muito alta. O saldo real só é usado com AUTO_REAL=1 (ver abaixo); se o saldo de treino
// não for encontrado, não abre nada. Liga com AUTO_TRADE=1 (usa EXNOVA_EMAIL/EXNOVA_PASSWORD, a mesma conta do coletor).
//
// Regra de entrada, na abertura de cada candle M5 (candles reais da Exnova, otc_candles):
//   1. Score M5 entre os 5% mais confiantes dos últimos dias daquele ativo;
//   2. sinal técnico M5 do painel para o mesmo lado, com confiança Alta;
//   3. Reversão com rejeição sem apontar para o lado contrário;
//   4. fora do horário de notícia dos EUA.
// Regras do minerador (pedido do dono em 06/10, "regra 1 e regra 2"), entram também, sem filtro de notícia
// (foram validadas assim no mercado real M5). Horários em UTC; troca com AUTO_REGRAS (vazio desliga):
//   min_h11_rompe  11h UTC (08h Brasília): cores vermelho-verde-verde e o último fechou acima da máxima do anterior → COMPRA
//   min_h14_rompe  14h UTC (11h Brasília): 1º candle verde depois de vermelho fechando acima da máxima do anterior → COMPRA
// Cada uma só entra com a sua confirmação (ver REGRAS). O Score antigo fica desligado (AUTO_SCORE=1 religa).
// Expiração: fim do candle M5 (5 min). Tudo fica gravado na tabela auto_trades.
//
// Conta REAL (pedido do dono em 08/10): desligada por padrão. Com AUTO_REAL=1 e AUTO_REAL_VALOR (até 200),
// as primeiras entradas do dia do robô de treino são repetidas no saldo real, com travas:
//   no máximo AUTO_REAL_MAX_DIA (padrão 3, teto 5) entradas reais por dia de Brasília;
//   para no dia ao chegar a AUTO_REAL_STOP_ERROS erros (padrão 2);
//   só abre uma nova real quando a anterior já fechou.
// O resultado vem da própria corretora (aviso de opção fechada). Para desligar: AUTO_REAL=0.
const WebSocket = require('ws');
const pool = require('./db');
const { series, features, predict } = require('./scoreBacktest');

const AUTH_URL = process.env.EXNOVA_AUTH_URL || 'https://auth.trade.exnova.com/api/v2/login';
const WS_URL = process.env.EXNOVA_WS_URL || 'wss://ws.trade.exnova.com/echo/websocket';
const PAIRS = ['EURUSD', 'EURJPY', 'XAUUSD'];
// Ids para OPERAR (instrumentos "-op" da lista da Exnova). Os ids 1/4/74 servem só para os candles:
// com eles a corretora respondeu "asset is not available" (06/10). Troca com AUTO_ACTIVE_IDS="EURUSD:1861,...".
const TRADE_IDS = Object.fromEntries((process.env.AUTO_ACTIVE_IDS || 'EURUSD:1861,EURJPY:1864,XAUUSD:1912')
    .split(',').map((x) => x.trim().split(':')).filter(([n, id]) => n && id).map(([n, id]) => [n.toUpperCase(), Number(id)]));
const TF = 300_000;
const MAX_POR_DIA = Math.min(10, parseInt(process.env.AUTO_MAX_DIA, 10) || 2); // padrão 2; o dono pediu 5 em 07/10 (teto 10)
const VALOR = Number(process.env.AUTO_VALOR) || 5;
const VALOR_REAL = Number(process.env.AUTO_REAL_VALOR) || 0;
const REAL = process.env.AUTO_REAL === '1' && VALOR_REAL > 0 && VALOR_REAL <= 200;
const REAL_MAX_DIA = Math.min(5, parseInt(process.env.AUTO_REAL_MAX_DIA, 10) || 3);
const REAL_STOP_ERROS = parseInt(process.env.AUTO_REAL_STOP_ERROS, 10) || 2;
const PCT_TOPO = 0.05; // 5% leituras mais confiantes
const REGRAS = {
    // Confirmações (estudo de 06/10 no mercado real M5): regra 1 sobe de 67% para 72,5% com tendência de
    // alta (média 20 acima da 50); regra 2 sobe de 66% para 70% com o preço não esticado acima da média.
    min_h11_rompe: { se: { cores3: 'RVV', hora: '11', vs_anterior: 'acima_max' }, lado: 'COMPRA', confirma: (f) => f.tendencia === 'alta' },
    min_h14_rompe: { se: { sequencia: '1', hora: '14', vs_anterior: 'acima_max' }, lado: 'COMPRA', confirma: (f) => ['0', '-1', '-2'].includes(f.z_media) },
};
const REGRAS_ATIVAS = (process.env.AUTO_REGRAS ?? 'min_h11_rompe,min_h14_rompe').split(',').map((x) => x.trim()).filter((x) => REGRAS[x]);

const st = { ws: null, ready: false, practiceId: null, reqId: 1, lastBucket: 0, lastMin: 0, thr: {}, thrAt: 0, pending: new Map() };

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
    await pool.query(`ALTER TABLE auto_trades ADD COLUMN IF NOT EXISTS conta TEXT DEFAULT 'treino'`);
}

// Duas sessões na Exnova: a de treino (st, conta EXNOVA_EMAIL, saldo tipo 4) e, com AUTO_REAL=1, a real
// (sr, conta EXNOVA_REAL_EMAIL/EXNOVA_REAL_PASSWORD, saldo tipo 1). Cada uma com sua conexão.
const sr = { tag: 'ROBO_REAL', tipoSaldo: 1, nome: 'REAL', email: 'EXNOVA_REAL_EMAIL', senha: 'EXNOVA_REAL_PASSWORD', ws: null, ready: false, balanceId: null, reqId: 1, pending: new Map() };
Object.assign(st, { tag: 'ROBO_DEMO', tipoSaldo: 4, nome: 'TREINO', email: 'EXNOVA_EMAIL', senha: 'EXNOVA_PASSWORD' });

function send(name, msg, s = st) {
    const request_id = String(s.reqId++);
    s.ws.send(JSON.stringify({ name, request_id, msg }));
    return request_id;
}

async function login(s) {
    const res = await fetch(AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: process.env[s.email], password: process.env[s.senha] }),
        signal: AbortSignal.timeout(20_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ssid) throw new Error(`login recusado (status ${res.status})`);
    return data.ssid;
}

async function connect(s = st) {
    let ssid;
    try { ssid = await login(s); } catch (err) {
        console.error(`${s.tag}: falha no login:`, err.message);
        return setTimeout(() => connect(s), 5 * 60_000);
    }
    const ws = new WebSocket(WS_URL);
    s.ws = ws;
    const tx = (name, msg) => send(name, msg, s);
    ws.on('open', () => tx('ssid', ssid));
    ws.on('message', (raw) => {
        let m; try { m = JSON.parse(raw.toString()); } catch { return; }
        if (m.name === 'profile') {
            tx('sendMessage', { name: 'get-balances', version: '1.0', body: { types_ids: [1, 4, 2] } });
        } else if (m.name === 'balances' && Array.isArray(m.msg)) {
            // Treino: type 4 (sem ele o robô não opera). Real: type 1.
            const bal = m.msg.find((b) => Number(b.type) === s.tipoSaldo);
            s.balanceId = bal ? Number(bal.id) : null;
            if (s === st) st.practiceId = s.balanceId;
            s.ready = !!bal;
            if (s.balanceCheck) {
                // Conferência periódica: o saldo pode mudar também por operações manuais do dono.
                s.balanceCheck = false;
                if (bal) console.log(`${s.tag}: saldo ${s === st ? 'de treino' : 'real'} agora ${bal.amount} ${bal.currency || ''}`);
                return;
            }
            console.log(bal
                ? `${s.tag}: conectado ao saldo ${s.nome} (saldo ${bal.amount} ${bal.currency || ''})${s === sr ? `; ${REAL_MAX_DIA} entradas de ${VALOR_REAL} por dia, para com ${REAL_STOP_ERROS} erros` : ''}`
                : `${s.tag}: saldo ${s.nome} não encontrado; NÃO vai operar nele`);
            // Ordem de teste (pedido do dono em 06/10), só para ver se a corretora aceita o código do
            // ativo: AUTO_TESTE_AGORA=XAUUSD (ou outro par). Valor mínimo, 1 vez por processo, no treino.
            const testPair = (process.env.AUTO_TESTE_AGORA || '').toUpperCase();
            if (s === st && bal && TRADE_IDS[testPair] && !st.testDone) {
                st.testDone = true;
                const req = tx('sendMessage', {
                    name: 'binary-options.open-option', version: '1.0',
                    body: {
                        user_balance_id: st.practiceId, active_id: TRADE_IDS[testPair], option_type_id: 3, direction: 'call',
                        expired: Math.floor(Date.now() / 60_000) * 60 + 120, price: 1,
                    },
                });
                st.pending.set(req, 0);
                console.log(`ROBO_DEMO: ordem de TESTE enviada ${testPair} (id ${TRADE_IDS[testPair]}, treino, valor 1)`);
            }
        } else if (m.name === 'heartbeat') {
            tx('heartbeat', { userTime: Date.now(), heartbeatTime: m.msg });
        } else if (/option/i.test(m.name || '') && !s.pending.has(m.request_id)) {
            // Diagnóstico: avisos da corretora sobre opções (abertura/fechamento).
            console.log(`${s.tag}: ${m.name} ${JSON.stringify(m.msg).slice(0, 300)}`);
            // Resultado oficial da corretora: win / loose / equal.
            const res = { win: 'acerto', loose: 'erro', equal: 'empate' }[m.msg?.result];
            if (m.name === 'option-changed' && res && m.msg.option_id != null) {
                pool.query(`UPDATE auto_trades SET result = $2 WHERE ordem_id = $1 AND (result IS NULL OR result <> $2) RETURNING id, pair, direction`,
                    [String(m.msg.option_id), res]).then(({ rows }) => rows.forEach((r) =>
                    console.log(`${s.tag}: resultado #${r.id} ${r.pair} ${r.direction} (corretora): ${res}`))).catch(() => {});
            }
        } else if (m.request_id && s.pending.has(m.request_id)) {
            // Resposta ao pedido de abertura.
            const id = s.pending.get(m.request_id);
            s.pending.delete(m.request_id);
            const ok = m.status == null || m.status === 2000 || m.msg?.id;
            const ordem = m.msg?.id != null ? String(m.msg.id) : null;
            // Ativo indisponível na Exnova (acontece à tarde/noite com os "-op"): pausa esse ativo por 30 min.
            if (s === st && !(ok && ordem) && /not available/i.test(m.msg?.message || '')) {
                const pair = st.pairDaOrdem?.get(id);
                if (pair) { (st.indisponivel ||= {})[pair] = Date.now() + 30 * 60_000; console.log(`ROBO_DEMO: ${pair} indisponível na corretora, pausado por 30 min`); }
            }
            console.log(`${s.tag}: resposta da ordem #${id}: ${m.name} status=${m.status ?? '-'} ${JSON.stringify(m.msg).slice(0, 300)}`);
            pool.query('UPDATE auto_trades SET status = $2, ordem_id = $3 WHERE id = $1',
                [id, ok && ordem ? 'aberta' : `recusada: ${String(m.msg?.message || m.status || m.name).slice(0, 80)}`, ordem]).catch(() => {});
        }
    });
    ws.on('close', () => { s.ready = false; setTimeout(() => connect(s), 60_000); });
    ws.on('error', (err) => console.error(`${s.tag}: erro na conexão:`, err.message));
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

async function evaluate(pair, bucket, noticia) {
    const { W5 } = require('./scoreShadow');
    const { computeTechnicalSignal } = require('./marketRoutes');
    const c = await m5(pair, 14);
    if (c.length < 100) return null;
    const i = c.length - 1, last = c[i];
    if (last.time + TF !== bucket || last.time - c[i - 60].time !== 60 * TF) return null;
    // Regras do minerador primeiro (têm prioridade sobre o Score).
    if (REGRAS_ATIVAS.length) {
        const minerador = require('./mineradorBacktest');
        const f = minerador.descreve(c, i, minerador.prep(c), pair, TF);
        for (const nome of REGRAS_ATIVAS) {
            const r = REGRAS[nome];
            const base = Object.entries(r.se).every(([k, v]) => f[k] === v);
            if (base && r.confirma && !r.confirma(f)) {
                console.log(`ROBO_DEMO: ${pair} ${nome} apareceu, mas sem confirmação (tendência=${f.tendencia}, z_media=${f.z_media}); não entra`);
            }
            if (base && (!r.confirma || r.confirma(f))) {
                return { pair, lado: r.lado, p: r.lado === 'COMPRA' ? 1 : 0, conf: 1, detalhes: { regra: nome } };
            }
        }
    }
    // Score antigo: desligado desde 06/10 (o dono quer só as regras). Religa com AUTO_SCORE=1.
    if (noticia || process.env.AUTO_SCORE !== '1') return null;
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
    // Ordem recusada pela corretora não tem resultado (não foi operada).
    await pool.query(`UPDATE auto_trades SET result = 'recusada' WHERE result IS NULL AND status LIKE 'recusada%'`);
    // A conta real usa só o resultado da corretora (não entra aqui).
    const { rows } = await pool.query(`SELECT id, pair, candle_time, direction, detalhes FROM auto_trades WHERE result IS NULL AND status = 'aberta' AND COALESCE(conta, 'treino') = 'treino' AND candle_time < NOW() - INTERVAL '3 minutes'`);
    for (const r of rows) {
        const t = new Date(r.candle_time).getTime();
        if (r.detalhes?.expira) {
            // Estratégias de minuto: resultado = preço no fim da expiração x preço da entrada (candles M1 da Exnova).
            const exp = r.detalhes.expira;
            if (Date.now() < exp + 60_000) continue;
            const { rows: f } = await pool.query('SELECT close FROM otc_candles WHERE active = $1 AND time = $2', [r.pair, new Date(exp - 60_000)]);
            if (!f.length) { if (Date.now() - exp > 3 * 3600_000) await pool.query("UPDATE auto_trades SET result = 'sem_dados' WHERE id = $1", [r.id]); continue; }
            const fim = +f[0].close, ent = r.detalhes.entrada;
            const res = fim === ent ? 'empate' : (r.direction === 'COMPRA') === (fim > ent) ? 'acerto' : 'erro';
            await pool.query('UPDATE auto_trades SET result = $2 WHERE id = $1', [r.id, res]);
            console.log(`ROBO_DEMO: resultado #${r.id} ${r.pair} ${r.direction} (${r.detalhes.estrategia}): ${res}`);
            continue;
        }
        if (Date.now() - t < 6 * 60_000) continue;
        const c = (await m5(r.pair, 6)).find((x) => x.time === t);
        if (!c) { if (Date.now() - t > 3 * 3600_000) await pool.query("UPDATE auto_trades SET result = 'sem_dados' WHERE id = $1", [r.id]); continue; }
        const res = c.close === c.open ? 'empate' : (r.direction === 'COMPRA') === (c.close > c.open) ? 'acerto' : 'erro';
        await pool.query('UPDATE auto_trades SET result = $2 WHERE id = $1', [r.id, res]);
        console.log(`ROBO_DEMO: resultado #${r.id} ${r.pair} ${r.direction}: ${res}`);
    }
}

// Estratégias novas (pedido do dono em 07/10), avaliadas no início de cada minuto nos candles M1 da Exnova:
//   devolve_m5      2º minuto do M5 andou ≥ 2 ATR(M1) → CONTRA, expira no fim do M5 (3 min). 3 ativos.
//   relogio15_segue 8º minuto do bloco de 15 min andou ≥ 2 ATR(M1) → A FAVOR, expira no fim do bloco (7 min). EURUSD.
//   pico_volta      minuto com faixa ≥ 3 ATR(M1) → CONTRA a cor dele, expira em 3 min. EURUSD.
// Dividem o mesmo limite de entradas por dia com as regras 1 e 2. Liga/desliga com AUTO_NOVAS (padrão ligado).
const NOVAS_ATIVOS = { devolve_m5: ['EURUSD', 'EURJPY', 'XAUUSD'], relogio15_segue: ['EURUSD'], pico_volta: ['EURUSD', 'EURJPY'] };
// Filtro de horário (estudo de 07/10, por período do dia em UTC: asia 0–7h, londres 7–12h, ny 12–17h, tarde 17–24h):
//   relógio de 15 min só na madrugada (asia) · pico relâmpago só à tarde · devolução sem Ouro na madrugada e sem EURJPY em Londres.
// Relógio de 15 min só no EURUSD: expira em 7 min (opção binária) e o Ouro-op não tem binária na Exnova (07/10).
const periodo = (t) => { const h = new Date(t).getUTCHours(); return h < 7 ? 'asia' : h < 12 ? 'londres' : h < 17 ? 'ny' : 'tarde'; };
const HORARIO_OK = {
    relogio15_segue: (pair, t) => periodo(t) === 'asia',
    pico_volta: (pair, t) => periodo(t) === 'tarde',
    devolve_m5: (pair, t) => !(pair === 'XAUUSD' && periodo(t) === 'asia') && !(pair === 'EURJPY' && periodo(t) === 'londres'),
};
const liberada = (nome, pair, t) => NOVAS_ATIVOS[nome].includes(pair) && (process.env.AUTO_FILTRO_HORARIO === '0' || HORARIO_OK[nome](pair, t));

async function m1Recentes(pair) {
    const { rows } = await pool.query(
        `SELECT time, open, high, low, close FROM otc_candles WHERE active = $1 AND time > NOW() - INTERVAL '4 hours' ORDER BY time`, [pair]);
    const m1 = rows.map((r) => ({ time: new Date(r.time).getTime(), open: +r.open, high: +r.high, low: +r.low, close: +r.close }));
    const atr = require('./mineradorBacktest').prep(m1).atr;
    return new Map(m1.map((x, i) => [x.time, { ...x, atr: atr[i] }]));
}

function avaliaNovas(pair, m, mb) {
    const out = [];
    const get = (t) => m.get(t);
    // Devolução no meio do M5: agora é o início do 3º minuto do bloco.
    if (mb % 300_000 === 120_000) {
        const t = mb - 120_000, a = get(t), b = get(t + 60_000);
        if (a && b && liberada('devolve_m5', pair, t)) {
            const mov = (b.close - a.open) / (b.atr || 1e-9);
            if (Math.abs(mov) >= 2) out.push({ estrategia: 'devolve_m5', lado: mov > 0 ? 'VENDA' : 'COMPRA', entrada: b.close, expira: t + 300_000, forca: Math.abs(mov) });
        }
    }
    // Relógio de 15 min: agora é o início do 9º minuto do bloco.
    if (mb % 900_000 === 480_000) {
        const t = mb - 480_000, mins = Array.from({ length: 8 }, (_, k) => get(t + k * 60_000));
        if (mins.every(Boolean) && liberada('relogio15_segue', pair, t)) {
            const mov = (mins[7].close - mins[0].open) / (mins[7].atr || 1e-9);
            if (Math.abs(mov) >= 2) out.push({ estrategia: 'relogio15_segue', lado: mov > 0 ? 'COMPRA' : 'VENDA', entrada: mins[7].close, expira: t + 900_000, forca: Math.abs(mov) });
        }
    }
    // Pico relâmpago: o minuto que acabou de fechar.
    if (liberada('pico_volta', pair, mb - 60_000)) {
        const x = get(mb - 60_000), ant = get(mb - 120_000);
        if (x && ant && x.close !== x.open && (x.high - x.low) >= 3 * (ant.atr || Infinity)) {
            out.push({ estrategia: 'pico_volta', lado: x.close > x.open ? 'VENDA' : 'COMPRA', entrada: x.close, expira: mb + 180_000, forca: (x.high - x.low) / ant.atr });
        }
    }
    return out;
}

// Horário em que a Exnova deixa operar EURUSD/EURJPY ("-op"): segundo o dono, só até 15h30 de Brasília.
// AUTO_HORARIO_EURO="HH:MM-HH:MM" (Brasília), padrão 00:00-15:30. O Ouro segue sem limite.
function ativoAberto(pair, ms) {
    if (pair === 'XAUUSD') return true;
    const [ini, fim] = (process.env.AUTO_HORARIO_EURO || '00:00-15:30').split('-').map((x) => { const [h, m] = x.split(':').map(Number); return h * 60 + (m || 0); });
    const d = new Date(ms - 3 * 3600_000), min = d.getUTCHours() * 60 + d.getUTCMinutes();
    return ini <= fim ? min >= ini && min < fim : min >= ini || min < fim;
}

// AUTO_RESET_DESDE (data ISO): o limite do dia passa a contar só as entradas depois dela ("começa de novo").
async function podeEntrar(now) {
    const desde = Date.parse(process.env.AUTO_RESET_DESDE || '');
    const { rows } = await pool.query(`SELECT COUNT(*) FILTER (WHERE status NOT LIKE 'recusada%')::int AS ok, COUNT(*)::int AS total
        FROM auto_trades WHERE dia = $1 AND created_at >= $2 AND COALESCE(conta, 'treino') = 'treino'`, [brDay(now), new Date(Number.isFinite(desde) ? desde : 0)]);
    return rows[0].ok < MAX_POR_DIA && rows[0].total < MAX_POR_DIA + 4;
}

// Travas da conta real: limite do dia, parada por erros e nenhuma real ainda aberta.
async function podeReal(now) {
    if (!REAL || !sr.ready || !sr.balanceId) return false;
    const { rows } = await pool.query(`SELECT
            COUNT(*) FILTER (WHERE status NOT LIKE 'recusada%')::int AS ok,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE result = 'erro')::int AS erros,
            COUNT(*) FILTER (WHERE result IS NULL AND status NOT LIKE 'recusada%' AND created_at > NOW() - INTERVAL '30 minutes')::int AS abertas
        FROM auto_trades WHERE dia = $1 AND conta = 'real'`, [brDay(now)]);
    const r = rows[0];
    return r.ok < REAL_MAX_DIA && r.total < REAL_MAX_DIA + 3 && r.erros < REAL_STOP_ERROS && r.abertas === 0;
}

// Payout atual do ativo (último registro do coletor, até 30 min atrás), no tipo de opção que vai ser usado.
async function payoutAtual(pair, tipo) {
    const { rows } = await pool.query(`SELECT valor FROM exnova_extras WHERE tipo = 'payout' AND active_id = $1 AND dados->>'tipo' ILIKE $2
        AND at > NOW() - INTERVAL '30 minutes' ORDER BY at DESC LIMIT 1`, [TRADE_IDS[pair], tipo === 1 ? '%binary%' : '%turbo%']);
    return rows.length ? Number(rows[0].valor) : null;
}

async function abrir(pair, lado, candleTime, expiraMs, prob, detalhes) {
    const now = Date.now();
    // Pedido do dono em 08/10: com payout de 89% ou mais, não opera (treino nem real). AUTO_PAYOUT_MAX muda o corte.
    const corte = Number(process.env.AUTO_PAYOUT_MAX) || 89;
    const payout = await payoutAtual(pair, expiraMs - now > 5.5 * 60_000 ? 1 : 3).catch(() => null);
    if (payout != null && payout >= corte) {
        console.log(`ROBO_DEMO: ${pair} ${lado} (${detalhes.estrategia || detalhes.regra || 'score'}) não entra: payout ${payout}% (corte ${corte}%)`);
        return;
    }
    if (payout != null) detalhes = { ...detalhes, payout };
    const { rows: ins } = await pool.query(
        `INSERT INTO auto_trades (dia, pair, candle_time, direction, prob, detalhes, valor, status) VALUES ($1, $2, $3, $4, $5, $6, $7, 'enviando') RETURNING id`,
        [brDay(now), pair, new Date(candleTime), lado, prob, detalhes, VALOR]);
    const id = ins[0].id;
    if (!st.ready || !st.practiceId) return;
    // Até 5 min: opção turbo (tipo 3). Mais longa (relógio de 15 min, expira no fim do bloco): binária (tipo 1).
    const tipo = expiraMs - now > 5.5 * 60_000 ? 1 : 3;
    const ordem = (s, valor) => send('sendMessage', {
        name: 'binary-options.open-option', version: '1.0',
        body: {
            user_balance_id: s.balanceId, active_id: TRADE_IDS[pair], option_type_id: tipo,
            direction: lado === 'COMPRA' ? 'call' : 'put', expired: Math.floor(expiraMs / 1000), price: valor,
        },
    }, s);
    st.pending.set(ordem(st, VALOR), id);
    (st.pairDaOrdem ||= new Map()).set(id, pair);
    console.log(`ROBO_DEMO: entrada #${id} ${pair} ${lado} (treino, ${VALOR}) ${JSON.stringify(detalhes)}`);
    // Mesma entrada no saldo real, se as travas deixarem.
    if (!(await podeReal(now).catch(() => false))) return;
    const { rows: insR } = await pool.query(
        `INSERT INTO auto_trades (dia, pair, candle_time, direction, prob, detalhes, valor, status, conta) VALUES ($1, $2, $3, $4, $5, $6, $7, 'enviando', 'real') RETURNING id`,
        [brDay(now), pair, new Date(candleTime), lado, prob, { ...detalhes, treino_id: id }, VALOR_REAL]);
    sr.pending.set(ordem(sr, VALOR_REAL), insR[0].id);
    console.log(`ROBO_REAL: entrada #${insR[0].id} ${pair} ${lado} (REAL, ${VALOR_REAL}) ${JSON.stringify(detalhes)}`);
}

async function tickNovas(now) {
    const { isMarketOpen } = require('./marketRoutes');
    const mb = Math.floor(now / 60_000) * 60_000;
    if (process.env.AUTO_NOVAS === '0' || mb === st.lastMin || now - mb > 20_000) return;
    st.lastMin = mb;
    if (!st.ready || !isMarketOpen(new Date(mb)) || !(await podeEntrar(now))) return;
    const cands = [];
    for (const pair of PAIRS) {
        if ((st.indisponivel?.[pair] || 0) > now || !ativoAberto(pair, now)) continue;
        try {
            const m = await m1Recentes(pair);
            for (const e of avaliaNovas(pair, m, mb)) cands.push({ pair, ...e });
        } catch (err) { console.error(`ROBO_DEMO: erro nas estratégias novas ${pair}:`, err.message); }
    }
    if (!cands.length) return;
    const e = cands.sort((a, b) => b.forca - a.forca)[0];
    await abrir(e.pair, e.lado, mb, e.expira, e.lado === 'COMPRA' ? 1 : 0,
        { estrategia: e.estrategia, entrada: e.entrada, expira: e.expira, forca: +e.forca.toFixed(2) });
}

async function tick() {
    const { isMarketOpen, horarioNoticiaEUA } = require('./marketRoutes');
    await resolveResults();
    const now = Date.now(), bucket = Math.floor(now / TF) * TF;
    // As regras 1 e 2 (início do M5) vêm primeiro; depois as estratégias de minuto.
    try { await tickRegras(now, bucket, isMarketOpen, horarioNoticiaEUA); } finally {
        await tickNovas(now).catch((err) => console.error('ROBO_DEMO novas erro:', err.message));
    }
}

async function tickRegras(now, bucket, isMarketOpen, horarioNoticiaEUA) {
    // Só nos primeiros 20 s do candle, uma vez por candle.
    if (bucket === st.lastBucket || now - bucket > 20_000) return;
    st.lastBucket = bucket;
    if (!st.ready || !isMarketOpen(new Date(bucket)) || !isMarketOpen(new Date(bucket + TF))) return;
    const noticia = horarioNoticiaEUA(bucket);
    // Conta só as entradas aceitas; ordens recusadas pela corretora não gastam a vez, mas no máximo (limite + 4) tentativas por dia.
    if (!(await podeEntrar(now))) return;
    if (process.env.AUTO_SCORE === '1' && now - st.thrAt > 6 * 3600_000) await updateThresholds();
    const cands = [];
    for (const pair of PAIRS) {
        if ((st.indisponivel?.[pair] || 0) > now || !ativoAberto(pair, now)) continue;
        try { const e = await evaluate(pair, bucket, noticia); if (e) cands.push(e); } catch (err) { console.error(`ROBO_DEMO: erro avaliando ${pair}:`, err.message); }
    }
    if (!cands.length) return;
    const best = cands.sort((a, b) => b.conf - a.conf)[0];
    await abrir(best.pair, best.lado, bucket, bucket + TF, best.p, best.detalhes);
}

// Diagnóstico (AUTO_DIAG_DIA=AAAA-MM-DD): refaz as regras em cada candle M5 do dia e diz nos logs onde a
// regra apareceu e se a confirmação passou. Só lê, não opera.
async function diagnostico() {
    const dia = process.env.AUTO_DIAG_DIA;
    if (!dia) return;
    const minerador = require('./mineradorBacktest');
    for (const pair of PAIRS) {
        const c = await m5(pair, 48), P = minerador.prep(c);
        for (let i = 60; i < c.length; i++) {
            if (new Date(c[i].time + TF).toISOString().slice(0, 10) !== dia) continue;
            const f = minerador.descreve(c, i, P, pair, TF);
            const todasHoras = process.env.AUTO_DIAG_TODAS_HORAS === '1';
            for (const [nome, r] of Object.entries(REGRAS)) {
                if (!Object.entries(r.se).every(([k, v]) => (todasHoras && k === 'hora') || f[k] === v)) continue;
                const alvo = c[i + 1];
                const res = alvo ? (alvo.close > alvo.open ? 'subiu' : alvo.close < alvo.open ? 'caiu' : 'empate') : '?';
                console.log(`ROBO_DIAG ${pair} entrada ${new Date(c[i].time + TF).toISOString().slice(11, 16)} UTC ${nome} confirmacao=${r.confirma(f) ? 'SIM' : 'NAO'} (tendencia=${f.tendencia}, z=${f.z_media}) candle seguinte ${res}`);
            }
        }
    }
}

async function start() {
    diagnostico().catch((err) => console.error('ROBO_DIAG erro:', err.message));
    if (process.env.AUTO_TRADE !== '1') return;
    if (!process.env.EXNOVA_EMAIL || !process.env.EXNOVA_PASSWORD) return console.error('ROBO_DEMO: faltam EXNOVA_EMAIL/EXNOVA_PASSWORD.');
    try { await ensureTable(); } catch (err) { return console.error('ROBO_DEMO: erro ao criar a tabela:', err.message); }
    console.log(`ROBO_DEMO: ligado (máx. ${MAX_POR_DIA} entradas por dia, valor ${VALOR}, ${REAL ? `REAL ligado (${REAL_MAX_DIA}x ${VALOR_REAL}/dia, para com ${REAL_STOP_ERROS} erros)` : 'só saldo de treino'}, regras extras: ${REGRAS_ATIVAS.join(',') || 'nenhuma'}, novas: ${process.env.AUTO_NOVAS === '0' ? 'desligadas' : Object.keys(NOVAS_ATIVOS).join(',')})`);
    connect(st);
    if (REAL) {
        if (process.env.EXNOVA_REAL_EMAIL && process.env.EXNOVA_REAL_PASSWORD) connect(sr);
        else console.error('ROBO_REAL: faltam EXNOVA_REAL_EMAIL/EXNOVA_REAL_PASSWORD; nada será operado no real.');
    }
    setInterval(() => tick().catch((err) => console.error('ROBO_DEMO erro:', err.message)), 5_000);
    // A cada 30 min confere os saldos (aparecem nos logs para o relatório diário).
    setInterval(() => {
        for (const s of [st, sr]) {
            if (!s.ready || !s.ws) continue;
            s.balanceCheck = true;
            try { send('sendMessage', { name: 'get-balances', version: '1.0', body: { types_ids: [1, 4, 2] } }, s); } catch { s.balanceCheck = false; }
        }
    }, 30 * 60_000);
}

module.exports = { start, evaluate, avaliaNovas, st };
