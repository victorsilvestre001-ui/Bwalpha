// Análises novas em modo teste escondido, nos candles reais da Exnova (otc_candles). A cada candle
// fechado, cada análise grava a previsão para o próximo candle e, quando ele fecha, o resultado.
// Nada aparece para o cliente. O resumo sai nos logs a cada hora como SCORE_SHADOW_RESUMO.
// Desliga com SCORE_SHADOW=0.
//   score_m5      Score TradeOn (regressão logística) em M5, pesos do estudo de 03/10.
//   rejeicao_m5   Reversão com rejeição: preço 2 desvios fora da média + pavio devolvendo.
// Testes de 06/10 (pedido do dono: medir e ir melhorando a análise sem mexer no robô):
//   robo_m5       a regra exata do robô demo (Score top 5% + técnico Alta + rejeição + fora de notícia),
//                 em todos os candles, para ter amostra grande em vez de 2 entradas por dia.
//   rigida_m5     robo_m5 + só Londres/NY (7h–17h UTC) + último candle fechado a favor da entrada.
//   exnova_m5     Score com pesos retreinados só nos candles reais da Exnova (nunca vê o futuro).
//   tecnico_m5    sinal técnico do painel com confiança Alta, sozinho (o que o cliente recebe).
//   min_*         regras achadas pelo minerador (mineradorBacktest.js) no mercado real M5, que passaram
//                 em estudo, confirmação e prova lá; aqui são conferidas no preço da Exnova.
// Esses quatro também são refeitos uma vez no histórico guardado (origem = 'historico').
const pool = require('./db');
const { series, features, predict, samples, trainLogistic } = require('./scoreBacktest');

const PAIRS = ['EURUSD', 'XAUUSD', 'EURJPY'];
// Pesos aprendidos no estudo de 03/10 (M5, ~8 mil candles por ativo). Ordem = FEATURE_NAMES + bias.
const W5 = {
    EURUSD: [-0.046, -0.031, -0.046, 0.063, -0.021, 0.088, 0.074, 0.106, -0.063, 0.006, -0.118, 0.074, 0.079, 0.026, -0.039, -0.013, 0.062],
    XAUUSD: [-0.008, -0.043, -0.005, -0.054, 0.063, 0.171, -0.003, -0.071, -0.043, -0.004, -0.189, 0.04, 0.037, -0.004, 0.08, -0.075, 0.044],
    EURJPY: [-0.037, -0.063, -0.007, -0.036, 0.002, 0.077, 0.051, 0.033, -0.022, 0.017, -0.053, 0.007, -0.002, -0.027, 0.015, 0.105, 0.105],
};

// Cada análise devolve a probabilidade de alta do próximo candle, ou null quando não entra.
const TESTS = {
    score_m5: { min: 5, prob: (pair, c, S, i) => predict(W5[pair], features(c, S, i)) },
    rejeicao_m5: {
        min: 5,
        prob: (pair, c, S, i) => {
            const x = features(c, S, i); // x[4] = desvios da média de 20, x[6] = rejeição
            if (x[4] <= -2 && x[6] > 0.3) return 1;
            if (x[4] >= 2 && x[6] < -0.3) return 0;
            return null;
        },
    },
};

let ready = null, lastSummary = 0;
const done = {}; // `${teste}:${ativo}` → último candle já processado

function ensureTable() {
    ready ||= pool.query(`CREATE TABLE IF NOT EXISTS shadow_tests (
        estrategia TEXT NOT NULL,
        pair TEXT NOT NULL,
        candle_time TIMESTAMPTZ NOT NULL,
        prob REAL NOT NULL,
        direction TEXT NOT NULL,
        result TEXT,
        PRIMARY KEY (estrategia, pair, candle_time))`)
        .then(() => pool.query(`ALTER TABLE shadow_tests ADD COLUMN IF NOT EXISTS origem TEXT DEFAULT 'ao_vivo'`));
    return ready;
}

// ---- Testes de 06/10 ----
const TF = 300_000;
// Regras do minerador (06/10). Horários em UTC (21h UTC = 18h de Brasília; 15h UTC = 12h).
const REGRAS_MIN = [
    { id: 'min_h21_mini', se: { corpo: 'mini', hora: '21', minuto: '5' }, dir: 1 },
    { id: 'min_h21_baixa', se: { tendencia: 'baixa', hora: '21', minuto: '5' }, dir: 1 },
    { id: 'min_h21_pavio', se: { pavio_cima: 'longo', z_media: '0', hora: '21' }, dir: 1 },
    { id: 'min_h15_rompe', se: { sequencia: '2', hora: '15', vs_anterior: 'abaixo_min' }, dir: 0 },
    { id: 'min_h14_rompe', se: { sequencia: '1', hora: '14', vs_anterior: 'acima_max' }, dir: 1 },
    { id: 'min_h11_rompe', se: { cores3: 'RVV', hora: '11', vs_anterior: 'acima_max' }, dir: 1 },
    { id: 'min_vrr_forte', se: { cores3: 'VRR', corpo: 'grande', pavio_cima: 'zero' }, dir: 0 },
];
// Testes de fluxo (07/10, para melhorar o M5 do site):
//   intra_m5   os 5 candles de 1 min dentro do M5 que fechou: movimento forte (≥ 0,5 ATR), último minuto a favor
//              e os 2 últimos minutos com ≥ 40% do movimento (acelerando no fim) → segue a direção.
//   correl_m5  o ativo e o "parceiro" (EURUSD↔Ouro pelo dólar, EURJPY↔EURUSD pelo euro) fecharam o M5 fortes
//              (≥ 0,3 ATR) para o mesmo lado → segue a direção.
//   lag_m5     o parceiro andou forte (≥ 0,8 ATR) e o ativo quase não andou (< 0,2 ATR) → o ativo vai atrás.
// Acerto bem abaixo de 50% num deles quer dizer que o contrário funciona.
const FLUXO = ['intra_m5', 'correl_m5', 'lag_m5'];
const PARCEIRO = { EURUSD: 'XAUUSD', XAUUSD: 'EURUSD', EURJPY: 'EURUSD' };
const NOVOS = ['robo_m5', 'rigida_m5', 'exnova_m5', 'tecnico_m5', ...REGRAS_MIN.map((r) => r.id), ...FLUXO];
const minerador = require('./mineradorBacktest');
const JANELA_CORTE = 1152; // 96 h de candles M5, igual ao robô
const novo = { done: {}, wEx: {}, wExAt: 0 };

async function m5Historico(pair, dias) {
    return aggregate(await m1Candles(pair, dias * 24), 5);
}

// Confiança do Score (pesos do estudo) em cada candle, para o corte dos 5% mais fortes.
function confSerie(pair, c, S) {
    return c.map((x, i) => (i >= 60 && x.time - c[i - 60].time === 60 * TF ? Math.abs(predict(W5[pair], features(c, S, i)) - 0.5) : null));
}

function corteTopo(confs, i) {
    const prev = confs.slice(Math.max(0, i - JANELA_CORTE), i).filter((v) => v != null);
    if (prev.length < 500) return null;
    prev.sort((a, b) => b - a);
    return prev[Math.floor(prev.length * 0.05)];
}

// Pesos treinados só com candles cujo alvo fechou antes de `ate` (sem ver o futuro).
function pesosExnova(c, ate) {
    const rows = samples(c, TF, null).filter((r) => r.t + 2 * TF <= ate);
    return rows.length >= 800 ? trainLogistic(rows.map((r) => r.x), rows.map((r) => r.y)) : null;
}

// Leituras dos testes novos no candle i fechado, para o candle seguinte. Valor = probabilidade de alta.
function leituras(pair, c, S, confs, i, wEx, Pm) {
    const { isMarketOpen, horarioNoticiaEUA, computeTechnicalSignal } = require('./marketRoutes');
    const b = c[i].time + TF, out = {};
    if (i < 98 || c[i].time - c[i - 60].time !== 60 * TF) return out;
    if (!isMarketOpen(new Date(b)) || !isMarketOpen(new Date(b + TF))) return out;
    if (Pm) {
        const f = minerador.descreve(c, i, Pm, pair, TF);
        for (const r of REGRAS_MIN) if (Object.entries(r.se).every(([k, v]) => f[k] === v)) out[r.id] = r.dir;
    }
    const x = features(c, S, i);
    if (wEx) out.exnova_m5 = predict(wEx, x);
    if (horarioNoticiaEUA(b)) return out;
    const last = c[i];
    const tec = computeTechnicalSignal(c.slice(i - 98, i + 1), { time: b, open: last.close, high: last.close, low: last.close, close: last.close });
    if (tec?.confidence === 'Alta' && (tec.direction === 'COMPRA' || tec.direction === 'VENDA')) out.tecnico_m5 = tec.direction === 'COMPRA' ? 1 : 0;
    const p = predict(W5[pair], x), lado = p > 0.5 ? 'COMPRA' : 'VENDA', thr = corteTopo(confs, i);
    if (thr == null || Math.abs(p - 0.5) < thr || tec?.direction !== lado || tec?.confidence !== 'Alta') return out;
    const rej = x[4] <= -2 && x[6] > 0.3 ? 'COMPRA' : x[4] >= 2 && x[6] < -0.3 ? 'VENDA' : null;
    if (rej && rej !== lado) return out;
    out.robo_m5 = p;
    const h = new Date(b).getUTCHours();
    const velaAFavor = lado === 'COMPRA' ? last.close > last.open : last.close < last.open;
    if (h >= 7 && h < 17 && velaAFavor) out.rigida_m5 = p;
    return out;
}

// Monta, para os 3 ativos, os candles M5 (com ATR) e os M1 por horário.
async function dadosFluxo(horas) {
    const d = {};
    for (const pair of PAIRS) {
        const m1 = await m1Candles(pair, horas);
        const c = aggregate(m1, 5), atr = minerador.prep(c).atr;
        d[pair] = { c, atr, idx: new Map(c.map((x, i) => [x.time, i])), m1: new Map(m1.map((x) => [x.time, x])) };
    }
    return d;
}

// Leituras de fluxo no candle M5 fechado que começa em t, para o candle seguinte. 1 = COMPRA, 0 = VENDA.
function leiturasFluxo(pair, d, t) {
    const { isMarketOpen } = require('./marketRoutes');
    const me = d[pair], i = me.idx.get(t), out = {};
    if (i == null || i < 20) return out;
    const b = t + TF;
    if (!isMarketOpen(new Date(b)) || !isMarketOpen(new Date(b + TF))) return out;
    const x = me.c[i], atr = me.atr[i], corpo = (x.close - x.open) / atr;
    const mins = [0, 1, 2, 3, 4].map((k) => me.m1.get(t + k * 60_000));
    if (mins.every(Boolean)) {
        const mov = mins[4].close - mins[0].open, fim = mins[4].close - mins[3].open, ult = mins[4].close - mins[4].open;
        if (Math.abs(mov) >= 0.5 * atr && Math.sign(ult) === Math.sign(mov) && fim / mov >= 0.4) out.intra_m5 = mov > 0 ? 1 : 0;
    }
    const par = d[PARCEIRO[pair]], j = par?.idx.get(t);
    if (j != null) {
        const y = par.c[j], corpoPar = (y.close - y.open) / par.atr[j];
        if (Math.abs(corpo) >= 0.3 && Math.abs(corpoPar) >= 0.3 && Math.sign(corpo) === Math.sign(corpoPar)) out.correl_m5 = corpo > 0 ? 1 : 0;
        if (Math.abs(corpoPar) >= 0.8 && Math.abs(corpo) < 0.2) out.lag_m5 = corpoPar > 0 ? 1 : 0;
    }
    return out;
}

async function backfillFluxo() {
    const { rows } = await pool.query(`SELECT 1 FROM shadow_tests WHERE origem = 'historico' AND estrategia = ANY($1) LIMIT 1`, [FLUXO]);
    if (rows.length) return;
    const d = await dadosFluxo(30 * 24);
    for (const pair of PAIRS) {
        const { c } = d[pair], cont = {};
        for (let i = 20; i < c.length - 1; i++) {
            const alvo = c[i + 1];
            if (alvo.time !== c[i].time + TF) continue;
            for (const [name, p] of Object.entries(leiturasFluxo(pair, d, c[i].time))) {
                const dir = p > 0.5 ? 'COMPRA' : 'VENDA';
                await pool.query(
                    `INSERT INTO shadow_tests (estrategia, pair, candle_time, prob, direction, result, origem) VALUES ($1, $2, $3, $4, $5, $6, 'historico') ON CONFLICT DO NOTHING`,
                    [name, pair, new Date(alvo.time), p, dir, resultado(dir, alvo)]);
                cont[name] = (cont[name] || 0) + 1;
            }
        }
        console.log(`SCORE_SHADOW_HISTORICO_FLUXO ${pair} ${JSON.stringify(cont)}`);
    }
}

// Ao vivo: uma vez por candle M5, depois que o anterior fechou nos 3 ativos (até 1 min de espera).
async function tickFluxo(now) {
    const bucket = Math.floor(now / TF) * TF;
    if (novo.fluxoDone === bucket) return;
    const d = await dadosFluxo(10);
    const prontos = PAIRS.every((p) => d[p].idx.has(bucket - TF));
    if (!prontos && now - bucket < 60_000) return;
    novo.fluxoDone = bucket;
    for (const pair of PAIRS) {
        for (const [name, p] of Object.entries(leiturasFluxo(pair, d, bucket - TF))) {
            await pool.query(
                `INSERT INTO shadow_tests (estrategia, pair, candle_time, prob, direction, origem) VALUES ($1, $2, $3, $4, $5, 'ao_vivo') ON CONFLICT DO NOTHING`,
                [name, pair, new Date(bucket), p, p > 0.5 ? 'COMPRA' : 'VENDA']);
        }
    }
}

const resultado = (dir, alvo) => (alvo.close === alvo.open ? 'draw' : (dir === 'COMPRA') === (alvo.close > alvo.open) ? 'win' : 'loss');

// Refaz os testes novos em todo o histórico guardado, uma vez (se ainda não houver linhas 'historico').
async function backfill() {
    const { rows } = await pool.query(`SELECT DISTINCT estrategia FROM shadow_tests WHERE origem = 'historico'`);
    const feitos = new Set(rows.map((r) => r.estrategia));
    // Só refaz o histórico se alguma regra nova ainda não tem (ON CONFLICT mantém as que já existem).
    if (!REGRAS_MIN.some((r) => !feitos.has(r.id)) && feitos.has('robo_m5')) return;
    for (const pair of PAIRS) {
        const c = await m5Historico(pair, 30), S = series(c), confs = confSerie(pair, c, S), Pm = minerador.prep(c);
        const pesosDia = {};
        const cont = {};
        for (let i = 98; i < c.length - 1; i++) {
            const alvo = c[i + 1];
            if (alvo.time !== c[i].time + TF) continue;
            const dia = Math.floor(alvo.time / 86_400_000) * 86_400_000;
            if (!(dia in pesosDia)) pesosDia[dia] = pesosExnova(c, dia);
            for (const [name, p] of Object.entries(leituras(pair, c, S, confs, i, pesosDia[dia], Pm))) {
                const dir = p > 0.5 ? 'COMPRA' : 'VENDA';
                await pool.query(
                    `INSERT INTO shadow_tests (estrategia, pair, candle_time, prob, direction, result, origem) VALUES ($1, $2, $3, $4, $5, $6, 'historico') ON CONFLICT DO NOTHING`,
                    [name, pair, new Date(alvo.time), p, dir, resultado(dir, alvo)]);
                cont[name] = (cont[name] || 0) + 1;
            }
        }
        console.log(`SCORE_SHADOW_HISTORICO ${pair} candles=${c.length} de=${c[0] && new Date(c[0].time).toISOString()} ${JSON.stringify(cont)}`);
    }
}

async function tickNovos(now) {
    const bucket = Math.floor(now / TF) * TF;
    if (now - novo.wExAt > 6 * 3600_000) { novo.wExAt = now; novo.recarregar = true; }
    for (const pair of PAIRS) {
        if (novo.done[pair] === bucket) continue;
        const c = await m5Historico(pair, 30);
        if (c.length < 200) continue;
        if (novo.recarregar || !(pair in novo.wEx)) novo.wEx[pair] = pesosExnova(c, now);
        const byTime = new Map(c.map((x) => [x.time, x]));
        const { rows: pend } = await pool.query('SELECT estrategia, candle_time, direction FROM shadow_tests WHERE estrategia = ANY($1) AND pair = $2 AND result IS NULL', [NOVOS, pair]);
        for (const r of pend) {
            const tt = new Date(r.candle_time).getTime(), alvo = byTime.get(tt);
            if (alvo) await pool.query('UPDATE shadow_tests SET result = $4 WHERE estrategia = $1 AND pair = $2 AND candle_time = $3', [r.estrategia, pair, r.candle_time, resultado(r.direction, alvo)]);
            else if (now - tt > 6 * 3600_000) await pool.query("UPDATE shadow_tests SET result = 'sem_dados' WHERE estrategia = $1 AND pair = $2 AND candle_time = $3", [r.estrategia, pair, r.candle_time]);
        }
        const i = c.length - 1;
        // O coletor pode atrasar uns segundos: tenta de novo no próximo tick até 1 min depois da abertura.
        if (c[i].time + TF !== bucket && now - bucket < 60_000) continue;
        if (c[i].time + TF === bucket) {
            const S = series(c);
            for (const [name, p] of Object.entries(leituras(pair, c, S, confSerie(pair, c, S), i, novo.wEx[pair], minerador.prep(c)))) {
                await pool.query(
                    `INSERT INTO shadow_tests (estrategia, pair, candle_time, prob, direction, origem) VALUES ($1, $2, $3, $4, $5, 'ao_vivo') ON CONFLICT DO NOTHING`,
                    [name, pair, new Date(bucket), p, p > 0.5 ? 'COMPRA' : 'VENDA']);
            }
        }
        novo.done[pair] = bucket;
    }
    novo.recarregar = false;
}

function aggregate(m1, min) {
    const tf = min * 60_000, out = [];
    for (const c of m1) {
        const b = Math.floor(c.time / tf) * tf, last = out[out.length - 1];
        if (last && last.time === b) { last.high = Math.max(last.high, c.high); last.low = Math.min(last.low, c.low); last.close = c.close; last.n++; }
        else out.push({ time: b, open: c.open, high: c.high, low: c.low, close: c.close, n: 1 });
    }
    // Só candles completos e já fechados.
    return out.filter((c) => c.n === min && c.time + tf <= Date.now());
}

async function m1Candles(pair, hours) {
    const { rows } = await pool.query(
        `SELECT time, open, high, low, close FROM otc_candles WHERE active = $1 AND time > NOW() - ($2::int * INTERVAL '1 hour') ORDER BY time`, [pair, hours]);
    return rows.map((r) => ({ time: new Date(r.time).getTime(), open: +r.open, high: +r.high, low: +r.low, close: +r.close }));
}

async function tick() {
    const now = Date.now();
    const pending = [];
    for (const [name, t] of Object.entries(TESTS)) {
        const tf = t.min * 60_000, bucket = Math.floor(now / tf) * tf;
        for (const pair of PAIRS) if (done[`${name}:${pair}`] !== bucket) pending.push([name, t, pair, tf, bucket]);
    }
    await ensureTable();
    await tickNovos(now);
    await tickFluxo(now).catch((err) => console.error('SCORE_SHADOW fluxo erro:', err.message));
    if (!pending.length) return;
    const cache = {};
    for (const [name, t, pair, tf, bucket] of pending) {
        const key = `${pair}:${t.min}`;
        if (!cache[key]) cache[key] = aggregate(await m1Candles(pair, Math.ceil(t.min * 70 / 60) + 2), t.min);
        const c = cache[key];
        if (c.length < 62) continue;
        // Resultado das previsões cujo candle alvo já fechou.
        const byTime = new Map(c.map((x) => [x.time, x]));
        const { rows: pend } = await pool.query('SELECT candle_time FROM shadow_tests WHERE estrategia = $1 AND pair = $2 AND result IS NULL', [name, pair]);
        for (const r of pend) {
            const tt = new Date(r.candle_time).getTime(), alvo = byTime.get(tt);
            if (alvo) {
                await pool.query(
                    `UPDATE shadow_tests SET result = CASE WHEN $4 THEN 'draw' WHEN (direction = 'COMPRA') = $5 THEN 'win' ELSE 'loss' END
                     WHERE estrategia = $1 AND pair = $2 AND candle_time = $3`,
                    [name, pair, r.candle_time, alvo.close === alvo.open, alvo.close > alvo.open]);
            } else if (now - tt > 6 * 3600_000) {
                await pool.query("UPDATE shadow_tests SET result = 'sem_dados' WHERE estrategia = $1 AND pair = $2 AND candle_time = $3", [name, pair, r.candle_time]);
            }
        }
        // Previsão para o candle atual, só se o último fechado for o anterior e a série for contínua.
        const i = c.length - 1, last = c[i];
        if (last.time + tf !== bucket || last.time - c[i - 60].time !== 60 * tf) continue;
        const p = t.prob(pair, c, series(c), i);
        if (p != null) {
            await pool.query(
                `INSERT INTO shadow_tests (estrategia, pair, candle_time, prob, direction) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
                [name, pair, new Date(bucket), p, p > 0.5 ? 'COMPRA' : 'VENDA']);
        }
        done[`${name}:${pair}`] = bucket;
    }
    if (now - lastSummary > 3600_000) { lastSummary = now; await summary(); }
}

// [estratégia, origem, ativo, amostras, acerto %, amostras top 25%, acerto top 25%]; ativo 'TODOS' = soma.
async function summary() {
    const { rows } = await pool.query(`
        WITH s AS (
            SELECT estrategia, COALESCE(origem, 'ao_vivo') AS origem, pair, result,
                   NTILE(4) OVER (PARTITION BY estrategia, COALESCE(origem, 'ao_vivo'), pair ORDER BY ABS(prob - 0.5) DESC) AS q
            FROM shadow_tests WHERE result IN ('win', 'loss'))
        SELECT estrategia, origem, COALESCE(pair, 'TODOS') AS pair, COUNT(*)::int AS n, ROUND(100.0 * AVG((result = 'win')::int), 1) AS acerto,
               COUNT(*) FILTER (WHERE q = 1)::int AS n_top25,
               ROUND(100.0 * AVG((result = 'win')::int) FILTER (WHERE q = 1), 1) AS acerto_top25
        FROM s GROUP BY GROUPING SETS ((estrategia, origem, pair), (estrategia, origem)) ORDER BY 1, 2, 3`);
    console.log('SCORE_SHADOW_RESUMO ' + JSON.stringify(rows.map((r) => Object.values(r))));
}

function start() {
    if (process.env.SCORE_SHADOW === '0') return;
    setTimeout(() => ensureTable().then(backfill).then(backfillFluxo).then(summary)
        .catch((err) => console.error('SCORE_SHADOW_HISTORICO erro:', err.message)), 60_000);
    setInterval(() => tick().catch((err) => console.error('SCORE_SHADOW erro:', err.message)), 20_000);
}

module.exports = { start, summary, TESTS, W5, leituras, leiturasFluxo, confSerie, pesosExnova };
