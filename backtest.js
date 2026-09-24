// Backtest dos sinais: reproduz o que o /signal faria em cada candle do passado e confere
// o candle de entrada, igual ao histórico de WIN/RED. Roda no servidor (RUN_BACKTEST=1)
// e escreve o resultado nos logs, porque a Twelve Data só é acessível de lá.
const pool = require('./db');
const {
    computeTechnicalSignal, fetchTwelveDataCandles, SIGNAL_PAIRS, SIGNAL_INTERVALS, TIMEFRAME_MINUTES, isMarketOpen,
} = require('./marketRoutes');

const WINDOW = 99; // o /signal usa 100 candles: 99 fechados + 1 em formação
const TD_BASE = 'https://api.twelvedata.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Busca várias páginas de 5000 candles (limite da Twelve Data), da mais recente para trás.
async function fetchLongHistory(pairLabel, timeframe, pages) {
    const pair = SIGNAL_PAIRS[pairLabel];
    const interval = SIGNAL_INTERVALS[timeframe];
    let all = [];
    let endDate = null;
    for (let p = 0; p < pages; p++) {
        let candles;
        if (endDate == null) {
            candles = await fetchTwelveDataCandles(pair, interval, 5000);
        } else {
            const url = `${TD_BASE}/time_series?symbol=${encodeURIComponent(pair.td)}&interval=${interval}&outputsize=5000&timezone=UTC&end_date=${encodeURIComponent(endDate)}&apikey=${process.env.TWELVE_DATA_API_KEY}`;
            const data = await (await fetch(url)).json();
            candles = data?.status === 'ok' && Array.isArray(data.values)
                ? data.values.slice().reverse().map((v) => ({
                    time: Date.parse(`${v.datetime.replace(' ', 'T')}Z`),
                    open: +v.open, high: +v.high, low: +v.low, close: +v.close,
                }))
                : null;
        }
        await sleep(9000); // plano grátis: 8 chamadas por minuto
        if (!candles || candles.length === 0) break;
        all = [...candles, ...all];
        endDate = new Date(candles[0].time - 1000).toISOString().slice(0, 19).replace('T', ' ');
    }
    const seen = new Set();
    return all.filter((c) => (seen.has(c.time) ? false : seen.add(c.time))).sort((a, b) => a.time - b.time);
}

function votes(s) {
    let bull = 0, bear = 0;
    if (s.ema9 != null && s.ema21 != null) (s.ema9 > s.ema21 ? bull++ : bear++);
    if (s.macdHistogram != null) (s.macdHistogram > 0 ? bull++ : bear++);
    if (s.rsi != null) {
        if (s.rsi < 30) bull += 1; else if (s.rsi > 70) bear += 1;
        else if (s.rsi >= 50) bull += 0.5; else bear += 0.5;
    }
    return { bull, bear };
}

const opp = (d) => (d === 'COMPRA' ? 'VENDA' : d === 'VENDA' ? 'COMPRA' : null);
const color = (c) => (c.close > c.open ? 'COMPRA' : c.close < c.open ? 'VENDA' : null);

// Cada estratégia recebe o contexto do momento do pedido e devolve COMPRA, VENDA ou null (sem entrada).
const STRATEGIES = {
    atual: ({ sig }) => sig.direction,
    atual_so_alta: ({ sig }) => (sig.confidence === 'Alta' ? sig.direction : null),
    atual_invertido: ({ sig }) => opp(sig.direction),
    chinesa: ({ sig, closed }) => {
        const c = closed.slice(-5);
        const bull = c.filter((x) => x.close > x.open).length, bear = c.filter((x) => x.close < x.open).length;
        const v = c[4].close - c[0].close;
        return v > 0 && bull >= 2 ? 'COMPRA' : v < 0 && bear >= 2 ? 'VENDA' : null;
    },
    tendencia_ema: ({ sig }) => (sig.ema9 == null ? null : sig.ema9 > sig.ema21 ? 'COMPRA' : 'VENDA'),
    ultimo_candle: ({ closed }) => color(closed[closed.length - 1]),
    contra_ultimo_candle: ({ closed }) => opp(color(closed[closed.length - 1])),
    candle_em_formacao: ({ formingNow }) => color(formingNow),
    contra_candle_em_formacao: ({ formingNow }) => opp(color(formingNow)),
    rsi_extremo_reversao: ({ sig }) => (sig.rsi == null ? null : sig.rsi < 30 ? 'COMPRA' : sig.rsi > 70 ? 'VENDA' : null),
    rsi_extremo_20_80: ({ sig }) => (sig.rsi == null ? null : sig.rsi < 20 ? 'COMPRA' : sig.rsi > 80 ? 'VENDA' : null),
    bwalpha_alerta: ({ sig }) => (sig.bwalpha?.alerta === 'CALL' ? 'COMPRA' : sig.bwalpha?.alerta === 'PUT' ? 'VENDA' : null),
    bwalpha_cruzamento: ({ sig }) => (sig.bwalpha?.cruzamento === 'CALL' ? 'COMPRA' : sig.bwalpha?.cruzamento === 'PUT' ? 'VENDA' : null),
    exaustao_3_iguais: ({ closed }) => {
        const l = closed.slice(-3).map(color);
        return l.every((x) => x === 'COMPRA') ? 'VENDA' : l.every((x) => x === 'VENDA') ? 'COMPRA' : null;
    },
    exaustao_4_iguais: ({ closed }) => {
        const l = closed.slice(-4).map(color);
        return l.every((x) => x === 'COMPRA') ? 'VENDA' : l.every((x) => x === 'VENDA') ? 'COMPRA' : null;
    },
    tendencia_pullback: ({ sig, closed }) => {
        if (sig.ema9 == null) return null;
        const last = color(closed[closed.length - 1]);
        if (sig.ema9 > sig.ema21 && last === 'VENDA') return 'COMPRA';
        if (sig.ema9 < sig.ema21 && last === 'COMPRA') return 'VENDA';
        return null;
    },
    confluencia_forte: ({ sig }) => {
        const { bull, bear } = votes(sig);
        return bull - bear >= 2 ? 'COMPRA' : bear - bull >= 2 ? 'VENDA' : null;
    },
    momentum_consenso: (ctx) => {
        const a = STRATEGIES.ultimo_candle(ctx), b = STRATEGIES.chinesa(ctx), c = STRATEGIES.confluencia_forte(ctx);
        return a && a === b && a === c ? a : null;
    },
    momentum_ultimo_e_chinesa: (ctx) => {
        const a = STRATEGIES.ultimo_candle(ctx), b = STRATEGIES.chinesa(ctx);
        return a && a === b ? a : null;
    },
    reversao_rsi_ou_banda: ({ sig, closed }) => {
        const c = closed[closed.length - 1].close, b = sig.bwalpha || {};
        if (sig.rsi != null && sig.rsi < 30 && b.bandaInferior != null && c < b.bandaInferior) return 'COMPRA';
        if (sig.rsi != null && sig.rsi > 70 && b.bandaSuperior != null && c > b.bandaSuperior) return 'VENDA';
        return null;
    },
    formacao_corpo_30: ({ formingNow }) => {
        const r = formingNow.high - formingNow.low;
        return r > 0 && Math.abs(formingNow.close - formingNow.open) / r >= 0.3 ? color(formingNow) : null;
    },
    formacao_corpo_50: ({ formingNow }) => {
        const r = formingNow.high - formingNow.low;
        return r > 0 && Math.abs(formingNow.close - formingNow.open) / r >= 0.5 ? color(formingNow) : null;
    },
    formacao_corpo_maior_media: ({ formingNow, closed }) => {
        const avg = closed.slice(-20).reduce((a, c) => a + Math.abs(c.close - c.open), 0) / 20;
        return Math.abs(formingNow.close - formingNow.open) >= avg ? color(formingNow) : null;
    },
    formacao_e_chinesa: (ctx) => {
        const a = color(ctx.formingNow), b = STRATEGIES.chinesa(ctx);
        return a && a === b ? a : null;
    },
    formacao_e_ultimo: (ctx) => {
        const a = color(ctx.formingNow), b = STRATEGIES.ultimo_candle(ctx);
        return a && a === b ? a : null;
    },
    formacao_contra_ultimo: (ctx) => {
        const a = color(ctx.formingNow), b = STRATEGIES.ultimo_candle(ctx);
        return a && b && a !== b ? a : null;
    },
    banda_reversao: ({ sig, closed }) => {
        const c = closed[closed.length - 1].close;
        if (sig.bwalpha?.bandaInferior != null && c < sig.bwalpha.bandaInferior) return 'COMPRA';
        if (sig.bwalpha?.bandaSuperior != null && c > sig.bwalpha.bandaSuperior) return 'VENDA';
        return null;
    },
};

function session(ms) {
    const h = new Date(ms).getUTCHours();
    if (h >= 12 && h < 16) return 'londres_ny';
    if (h >= 7 && h < 12) return 'londres';
    if (h >= 16 && h < 21) return 'ny';
    return 'asia';
}

function stats(list) {
    const w = list.filter((r) => r === 'win').length, l = list.filter((r) => r === 'loss').length;
    const n = w + l;
    return { n, wr: n ? +(w / n * 100).toFixed(1) : null, ci: n ? +(196 * Math.sqrt((w / n) * (1 - w / n) / n)).toFixed(1) : null };
}

function runOn(candles, timeframe) {
    const tf = TIMEFRAME_MINUTES[timeframe] * 60 * 1000;
    const res = Object.fromEntries(Object.keys(STRATEGIES).map((k) => [k, { all: [], h1: [], h2: [], sess: {} }]));
    let evaluated = 0;
    const half = Math.floor(candles.length / 2);
    for (let k = WINDOW; k < candles.length - 1; k++) {
        const forming = candles[k], target = candles[k + 1];
        // Só conta sequências contínuas (sem buraco de fim de semana ou falha de dados).
        if (target.time - forming.time !== tf || forming.time - candles[k - WINDOW].time !== WINDOW * tf) continue;
        // Fim de semana: a fonte gera candles artificiais com o mercado fechado; o /signal nem responde.
        if (!isMarketOpen(new Date(target.time)) || !isMarketOpen(new Date(candles[k - WINDOW].time))) continue;
        const closed = candles.slice(k - WINDOW, k);
        // No momento do pedido o candle em formação só tem a abertura (o indicador usa só o open).
        const formingOpen = { time: forming.time, open: forming.open, high: forming.open, low: forming.open, close: forming.open };
        const sig = computeTechnicalSignal(closed, formingOpen);
        // Leitura "meio candle": o que o candle em formação mostra na metade do tempo não existe
        // nos dados; aproxima com o candle inteiro só para a estratégia experimental dele.
        const ctx = { sig, closed, formingNow: forming };
        evaluated++;
        const outcome = target.close === target.open ? 'draw' : null;
        for (const [name, fn] of Object.entries(STRATEGIES)) {
            const d = fn(ctx);
            if (!d || outcome) continue;
            const r = (d === 'COMPRA') === (target.close > target.open) ? 'win' : 'loss';
            const b = res[name];
            b.all.push(r);
            (k < half ? b.h1 : b.h2).push(r);
            (b.sess[session(target.time)] ||= []).push(r);
        }
    }
    const out = {};
    for (const [name, b] of Object.entries(res)) {
        out[name] = {
            ...stats(b.all),
            cobertura: +(b.all.length / Math.max(evaluated, 1) * 100).toFixed(0),
            metade1: stats(b.h1).wr,
            metade2: stats(b.h2).wr,
            sessoes: Object.fromEntries(Object.entries(b.sess).map(([s, l]) => [s, stats(l)])),
        };
    }
    return { evaluated, out };
}

async function dbStats() {
    try {
        const { rows } = await pool.query(`
            SELECT pair, timeframe, confidence, direction,
                   COUNT(*) FILTER (WHERE result = 'win')::int AS wins,
                   COUNT(*) FILTER (WHERE result = 'loss')::int AS losses,
                   COUNT(*) FILTER (WHERE result = 'draw')::int AS draws,
                   COUNT(*) FILTER (WHERE result IS NULL OR result = 'unknown')::int AS other
            FROM analyses GROUP BY 1,2,3,4 ORDER BY 1,2,3,4`);
        console.log('BACKTEST_DB ' + JSON.stringify(rows));
    } catch (err) {
        console.error('BACKTEST_DB erro:', err.message);
    }
}

async function run() {
    console.log('BACKTEST_START');
    await dbStats();
    const plan = [['M1', 3], ['M5', 2]];
    for (const pair of Object.keys(SIGNAL_PAIRS)) {
        for (const [tf, pages] of plan) {
            try {
                const candles = await fetchLongHistory(pair, tf, pages);
                const first = candles[0] && new Date(candles[0].time).toISOString();
                const last = candles.length && new Date(candles[candles.length - 1].time).toISOString();
                const { evaluated, out } = runOn(candles, tf);
                console.log(`BACKTEST_RESULT ${pair} ${tf} candles=${candles.length} de=${first} ate=${last} avaliados=${evaluated}`);
                for (const [name, r] of Object.entries(out)) {
                    console.log(`BACKTEST_ROW ${pair} ${tf} ${name} ${JSON.stringify(r)}`);
                }
            } catch (err) {
                console.error(`BACKTEST_ERR ${pair} ${tf}:`, err.message);
            }
        }
    }
    console.log('BACKTEST_END');
}

module.exports = { run, runOn, STRATEGIES };
