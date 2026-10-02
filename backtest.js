// Backtest dos sinais: reproduz o que o /signal faria em cada candle do passado e confere
// o candle de entrada, igual ao histórico de WIN/RED. Roda no servidor (RUN_BACKTEST=1)
// e escreve o resultado nos logs, porque a Twelve Data só é acessível de lá.
const pool = require('./db');
const {
    computeTechnicalSignal, computeCandleFollowSignal, computeM1Signal, detectPinBar, applyRitmo, computePressao, applyPressao, applyChinesa, fetchTwelveDataCandles, SIGNAL_PAIRS, SIGNAL_INTERVALS, TIMEFRAME_MINUTES, isMarketOpen,
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
    // Regra que está em produção no M1 (mesma função da rota /signal).
    producao_m1: ({ closed, formingNow }) => computeCandleFollowSignal(closed, formingNow).direction,
    producao_m1_sempre: ({ sig, closed, formingNow }) => computeM1Signal(closed, formingNow, sig).direction,
    // Tamanho mínimo do candle atual (corpo em relação à média dos últimos 20): candle
    // minúsculo é ruído. Testa vários limites: só entra quando o corpo >= k × média.
    ...Object.fromEntries([0.3, 0.5, 0.7, 1.0, 1.3].map((k) => [`tamanho_${String(k).replace('.', '')}_m1`, ({ sig, closed, formingNow }) => {
        const recent = closed.slice(-20);
        const avg = recent.reduce((a, c) => a + Math.abs(c.close - c.open), 0) / Math.max(recent.length, 1);
        if (!(avg > 0) || Math.abs(formingNow.close - formingNow.open) < k * avg) return null;
        return computeM1Signal(closed, formingNow, sig).direction;
    }])),
    // Estratégia Chinesa como confirmação: acerto quando concorda x quando discorda do M1.
    chinesa_concorda_m1: ({ sig, closed, formingNow }) => {
        const r = applyChinesa(computeM1Signal(closed, formingNow, sig), closed, formingNow);
        return r.chinesa?.concorda ? r.direction : null;
    },
    chinesa_discorda_m1: ({ sig, closed, formingNow }) => {
        const r = applyChinesa(computeM1Signal(closed, formingNow, sig), closed, formingNow);
        return r.chinesa && !r.chinesa.concorda ? r.direction : null;
    },
    chinesa_neutra_m1: ({ sig, closed, formingNow }) => {
        const r = applyChinesa(computeM1Signal(closed, formingNow, sig), closed, formingNow);
        return r.chinesa ? null : r.direction;
    },
    // O que dá para fazer sem o candle em formação: lê o último candle FECHADO e entra no
    // candle seguinte ao atual (uma vela de atraso), que é o que a fonte grátis permite.
    atraso1_m1: ({ sig, closed }) => computeM1Signal(closed.slice(0, -1), closed[closed.length - 1], sig).direction,
    atraso1_m1_forte: ({ sig, closed }) => {
        const r = computeM1Signal(closed.slice(0, -1), closed[closed.length - 1], sig);
        return r.leitura === 'forte' ? r.direction : null;
    },
    // Ritmo do dia: mesma regra, ajustada pelo acerto dela nos candles recentes.
    ritmo_m1: ({ sig, closed, formingNow }) => applyRitmo(closed, 'M1', computeM1Signal(closed, formingNow, sig)).direction,
    ritmo_m1_sem_baixa: ({ sig, closed, formingNow }) => {
        const r = applyRitmo(closed, 'M1', computeM1Signal(closed, formingNow, sig));
        return r.confidence === 'Baixa' ? null : r.direction;
    },
    // Pressão compradora x vendedora: descarta o sinal quando a pressão forte está contra ele.
    // Pressão a favor: quando a pressão forte está contra a leitura, o sinal segue a pressão.
    pressao_m1: ({ sig, closed, formingNow }) => applyPressao(computeM1Signal(closed, formingNow, sig), computePressao(closed, formingNow)).direction,
    // Só as entradas confirmadas pela pressão (confiança Alta).
    pressao_m1_alta: ({ sig, closed, formingNow }) => {
        const r = applyPressao(computeM1Signal(closed, formingNow, sig), computePressao(closed, formingNow));
        return r.confidence === 'Alta' ? r.direction : null;
    },
    // Comparação: descartar o sinal em vez de virar.
    pressao_pula_m1: ({ sig, closed, formingNow }) => {
        const base = computeM1Signal(closed, formingNow, sig);
        return applyPressao(base, computePressao(closed, formingNow)).direction === base.direction ? base.direction : null;
    },
    pressao_m5: ({ sig, closed }) => applyPressao(sig, computePressao(closed, null)).direction,
    ritmo_m5: ({ sig, closed }) => applyRitmo(closed, 'M5', sig).direction,
    ritmo_m5_sem_baixa: ({ sig, closed }) => {
        const r = applyRitmo(closed, 'M5', sig);
        return r.confidence === 'Baixa' ? null : r.direction;
    },
    producao_m1_alta: ({ closed, formingNow }) => {
        const r = computeCandleFollowSignal(closed, formingNow);
        return r.confidence === 'Alta' ? r.direction : null;
    },
    // Candle atual fraco (o que a regra de produção não aceita): qual lado acerta mais?
    fraco_segue: ({ closed, formingNow }) => {
        const r = computeCandleFollowSignal(closed, formingNow);
        return r.direction ? null : color(formingNow);
    },
    fraco_contra: ({ closed, formingNow }) => {
        const r = computeCandleFollowSignal(closed, formingNow);
        return r.direction ? null : opp(color(formingNow));
    },
    fraco_pavio: ({ closed, formingNow }) => {
        // Segue o lado com mais pavio rejeitado: pavio de cima maior -> VENDA.
        const r = computeCandleFollowSignal(closed, formingNow);
        if (r.direction) return null;
        const up = formingNow.high - Math.max(formingNow.open, formingNow.close);
        const dn = Math.min(formingNow.open, formingNow.close) - formingNow.low;
        return up > dn ? 'VENDA' : dn > up ? 'COMPRA' : null;
    },
    // Pin bar no candle atual: produção vai contra o pavio; aqui também o lado do pavio.
    pin_invertido_m1: ({ formingNow }) => { const p = detectPinBar(formingNow); return p ? opp(p) : null; },
    pin_segue_m1: ({ formingNow }) => detectPinBar(formingNow),
    forte_m1: ({ closed, formingNow }) => (detectPinBar(formingNow) ? null : computeCandleFollowSignal(closed, formingNow).direction),
    fraco_indicadores: ({ sig, closed, formingNow }) => (!detectPinBar(formingNow) && computeCandleFollowSignal(closed, formingNow).direction ? null : sig.indicadores.direcao),
    fraco_indicadores_fortes: ({ sig, closed, formingNow }) => (!detectPinBar(formingNow) && computeCandleFollowSignal(closed, formingNow).direction ? null
        : sig.indicadores.confianca !== 'Baixa' ? sig.indicadores.direcao : null),
    fraco_pressao_ou_indicadores: ({ sig, closed, formingNow }) => {
        if (!detectPinBar(formingNow) && computeCandleFollowSignal(closed, formingNow).direction) return null;
        const pr = computePressao(closed, formingNow);
        return pr && pr.lado ? pr.lado : sig.indicadores.direcao;
    },
    fraco_pressao: ({ closed, formingNow }) => {
        if (!detectPinBar(formingNow) && computeCandleFollowSignal(closed, formingNow).direction) return null;
        const pr = computePressao(closed, formingNow);
        return pr && pr.lado ? pr.lado : null;
    },
    forte_concorda_indicadores_m1: ({ sig, closed, formingNow }) => {
        const d = detectPinBar(formingNow) ? null : computeCandleFollowSignal(closed, formingNow).direction;
        return d && d === sig.indicadores.direcao ? d : null;
    },
    forte_discorda_indicadores_m1: ({ sig, closed, formingNow }) => {
        const d = detectPinBar(formingNow) ? null : computeCandleFollowSignal(closed, formingNow).direction;
        return d && d !== sig.indicadores.direcao ? d : null;
    },
    fraco_chinesa: (ctx) => (computeCandleFollowSignal(ctx.closed, ctx.formingNow).direction ? null : STRATEGIES.chinesa(ctx)),
    fraco_tecnico: ({ closed, formingNow }) => {
        if (computeCandleFollowSignal(closed, formingNow).direction) return null;
        return computeTechnicalSignal(closed, formingNow).direction;
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

// Estratégia "lateralização + esticada": os últimos L candles andam de lado (a faixa total é
// pequena), aí o candle atual dá uma esticada (corpo grande, rompendo a faixa) e a entrada é
// CONTRA ele no próximo candle. Também mede o "segue" (a favor da esticada) para comparar.
// Nome: lat_{contra|segue}_L{5|8}_f{faixa}_e{esticada}{_rompe}_m1.
function lateralStretch(closed, f, { L, faixa, estica, rompe }) {
    if (closed.length < L + 20) return null;
    const base = closed.slice(-(L + 20), -L);
    const avgRange = base.reduce((a, c) => a + (c.high - c.low), 0) / base.length;
    const avgBody = base.reduce((a, c) => a + Math.abs(c.close - c.open), 0) / base.length;
    if (!(avgRange > 0) || !(avgBody > 0)) return null;
    const lat = closed.slice(-L);
    const hi = Math.max(...lat.map((c) => c.high)), lo = Math.min(...lat.map((c) => c.low));
    if (hi - lo > faixa * avgRange) return null; // não está lateral
    const body = f.close - f.open;
    if (Math.abs(body) < estica * avgBody) return null; // sem esticada
    if (rompe && !(body > 0 ? f.close > hi : f.close < lo)) return null; // não rompeu a faixa
    return body > 0 ? 'COMPRA' : 'VENDA';
}
// Estratégia "queda/alta forte + candle de correção com pavio": os últimos T candles fecharam um
// movimento forte (saldo >= m × tamanho médio, maioria na mesma cor); o candle atual é de correção
// (cor contrária) e deixou pavio. corr_segue = próximo candle na direção da correção (reversão);
// corr_retoma = próximo candle volta para a direção do movimento. Pavio: inf = do lado do
// movimento (ex.: embaixo numa queda, rejeitou a mínima), sup = do outro lado, qq = qualquer.
function correcaoComPavio(closed, f, { T, m, pavio }) {
    if (closed.length < T + 20) return null;
    const base = closed.slice(-(T + 20), -T);
    const avgRange = base.reduce((a, c) => a + (c.high - c.low), 0) / base.length;
    if (!(avgRange > 0)) return null;
    const mov = closed.slice(-T);
    const saldo = mov[mov.length - 1].close - mov[0].open;
    if (Math.abs(saldo) < m * avgRange) return null;
    const trend = saldo > 0 ? 'COMPRA' : 'VENDA';
    if (mov.filter((c) => color(c) === trend).length < Math.ceil(T * 0.6)) return null;
    if (color(f) !== opp(trend)) return null; // o atual não é de correção
    const range = f.high - f.low;
    if (!(range > 0)) return null;
    const up = f.high - Math.max(f.open, f.close), dn = Math.min(f.open, f.close) - f.low;
    const ladoMov = trend === 'VENDA' ? dn : up, ladoOposto = trend === 'VENDA' ? up : dn;
    if (pavio === 'inf' && ladoMov < 0.3 * range) return null;
    if (pavio === 'sup' && ladoOposto < 0.3 * range) return null;
    if (pavio === 'qq' && Math.max(up, dn) < 0.3 * range) return null;
    return trend;
}
for (const T of [4, 6]) {
    for (const m of [2, 3]) {
        for (const pavio of ['inf', 'sup', 'qq']) {
            const tag = `T${T}_m${m}_${pavio}_m1`;
            const opts = { T, m, pavio };
            STRATEGIES[`corr_segue_${tag}`] = ({ closed, formingNow }) => opp(correcaoComPavio(closed, formingNow, opts));
            STRATEGIES[`corr_retoma_${tag}`] = ({ closed, formingNow }) => correcaoComPavio(closed, formingNow, opts);
        }
    }
}
for (const L of [5, 8]) {
    for (const faixa of [2, 3]) {
        for (const estica of [1.5, 2, 3]) {
            for (const rompe of [false, true]) {
                const tag = `L${L}_f${faixa}_e${String(estica).replace('.', '')}${rompe ? '_rompe' : ''}_m1`;
                const opts = { L, faixa, estica, rompe };
                STRATEGIES[`lat_contra_${tag}`] = ({ closed, formingNow }) => opp(lateralStretch(closed, formingNow, opts));
                STRATEGIES[`lat_segue_${tag}`] = ({ closed, formingNow }) => lateralStretch(closed, formingNow, opts);
            }
        }
    }
}

// ---- Price action: cada padrão sozinho, lido no fim do candle (como o M1 de produção) ----
// O candle "em formação" (quase fechado) é o candle do padrão; o alvo é o candle seguinte.
const body = (c) => Math.abs(c.close - c.open);
const range = (c) => (c.high - c.low) || 1e-9;
const upW = (c) => c.high - Math.max(c.open, c.close);
const dnW = (c) => Math.min(c.open, c.close) - c.low;
const bull = (c) => c.close > c.open;
const bear = (c) => c.close < c.open;

const PATTERNS = {
    engolfo: (c1, c2, c3) => (bear(c2) && bull(c3) && c3.open <= c2.close && c3.close >= c2.open ? 'COMPRA'
        : bull(c2) && bear(c3) && c3.open >= c2.close && c3.close <= c2.open ? 'VENDA' : null),
    outside_bar: (c1, c2, c3) => (c3.high > c2.high && c3.low < c2.low ? color(c3) : null),
    marubozu: (c1, c2, c3) => (body(c3) / range(c3) > 0.9 ? color(c3) : null),
    pin_bar: (c1, c2, c3) => {
        const b = body(c3), r = range(c3);
        if (dnW(c3) >= b * 2 && dnW(c3) >= r * 0.5 && upW(c3) <= b * 0.6) return 'COMPRA';
        if (upW(c3) >= b * 2 && upW(c3) >= r * 0.5 && dnW(c3) <= b * 0.6) return 'VENDA';
        return null;
    },
    rejeicao_pavio: (c1, c2, c3) => {
        const r = range(c3);
        if (dnW(c3) >= r * 0.6) return 'COMPRA';
        if (upW(c3) >= r * 0.6) return 'VENDA';
        return null;
    },
    estrela: (c1, c2, c3) => {
        const big = (c) => body(c) / range(c) > 0.6, small = (c) => body(c) / range(c) < 0.35;
        if (big(c1) && bear(c1) && small(c2) && big(c3) && bull(c3) && c3.close > (c1.open + c1.close) / 2) return 'COMPRA';
        if (big(c1) && bull(c1) && small(c2) && big(c3) && bear(c3) && c3.close < (c1.open + c1.close) / 2) return 'VENDA';
        return null;
    },
    tres_soldados: (c1, c2, c3) => {
        const strong = (c) => body(c) / range(c) > 0.5;
        if ([c1, c2, c3].every((c) => bull(c) && strong(c)) && c2.close > c1.close && c3.close > c2.close) return 'COMPRA';
        if ([c1, c2, c3].every((c) => bear(c) && strong(c)) && c2.close < c1.close && c3.close < c2.close) return 'VENDA';
        return null;
    },
};

// Contextos: onde o padrão aparece.
const CONTEXTS = {
    livre: () => true,
    // Varreu a mínima/máxima dos últimos 30 candles (toque em suporte/resistência) na direção oposta ao sinal.
    sr30: (d, c3, closed) => {
        const prev = closed.slice(-30);
        return d === 'COMPRA' ? c3.low <= Math.min(...prev.map((c) => c.low)) : c3.high >= Math.max(...prev.map((c) => c.high));
    },
    // A favor da tendência (EMA9 x EMA21 dos candles fechados).
    tendencia: (d, c3, closed, sig) => sig.ema9 != null && (d === 'COMPRA' ? sig.ema9 > sig.ema21 : sig.ema9 < sig.ema21),
    // Contra a tendência (reversão).
    contra_tendencia: (d, c3, closed, sig) => sig.ema9 != null && (d === 'COMPRA' ? sig.ema9 < sig.ema21 : sig.ema9 > sig.ema21),
    // RSI esticado a favor da reversão.
    rsi: (d, c3, closed, sig) => sig.rsi != null && (d === 'COMPRA' ? sig.rsi < 35 : sig.rsi > 65),
};

for (const [pname, pfn] of Object.entries(PATTERNS)) {
    for (const [cname, cfn] of Object.entries(CONTEXTS)) {
        const detect = ({ sig, closed, formingNow }) => {
            const n = closed.length;
            const d = pfn(closed[n - 2], closed[n - 1], formingNow);
            return d && cfn(d, formingNow, closed, sig) ? d : null;
        };
        STRATEGIES[`pa_${pname}_${cname}`] = detect;
        STRATEGIES[`pa_${pname}_${cname}_inv`] = (ctx) => opp(detect(ctx));
    }
}

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

function runOn(candles, timeframe, opts = {}) {
    const runFilter = opts.filter || new RegExp(process.env.BACKTEST_FILTER || '^(producao|atual$)');
    const tf = TIMEFRAME_MINUTES[timeframe] * 60 * 1000;
    const res = Object.fromEntries(Object.keys(STRATEGIES).map((k) => [k, { all: [], h1: [], h2: [], sess: {} }]));
    let evaluated = 0;
    const half = Math.floor(candles.length / 2);
    for (let k = WINDOW; k < candles.length - 1; k++) {
        const forming = candles[k], target = candles[k + 1];
        // Só conta sequências contínuas (sem buraco de fim de semana ou falha de dados).
        if (target.time - forming.time !== tf || forming.time - candles[k - WINDOW].time !== WINDOW * tf) continue;
        // Fim de semana: a fonte gera candles artificiais com o mercado fechado; o /signal nem responde.
        // (O OTC funciona 24h, inclusive no fim de semana.)
        if (!opts.anyTime && (!isMarketOpen(new Date(target.time)) || !isMarketOpen(new Date(candles[k - WINDOW].time)))) continue;
        const closed = candles.slice(k - WINDOW, k);
        // No momento do pedido o candle em formação só tem a abertura (o indicador usa só o open).
        const formingOpen = { time: forming.time, open: forming.open, high: forming.open, low: forming.open, close: forming.open };
        const sig = computeTechnicalSignal(closed, formingOpen);
        // Leitura "meio candle": o que o candle em formação mostra na metade do tempo não existe
        // nos dados; aproxima com o candle inteiro só para a estratégia experimental dele.
        // Com as fotos do candle ao vivo (BACKTEST_SOURCE=snap), a leitura usa o candle como ele
        // estava no segundo do pedido; sem foto daquele minuto, o minuto fica de fora.
        const formingNow = opts.snaps ? opts.snaps.get(forming.time) : forming;
        if (!formingNow) continue;
        const ctx = { sig, closed, formingNow };
        evaluated++;
        const outcome = target.close === target.open ? 'draw' : null;
        for (const [name, fn] of Object.entries(STRATEGIES)) {
            // Só roda o que vai para o relatório (as de "ritmo" são pesadas) e no timeframe certo.
            if (!runFilter.test(name) || (/_m1/.test(name) && timeframe !== 'M1') || (/_m5/.test(name) && timeframe !== 'M5')) continue;
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
        // Detalhe dos sinais recentes: leitura, segundo do candle em que foi pedido e preços.
        const det = await pool.query(`
            SELECT id, pair, timeframe AS tf, direction AS dir, confidence AS conf, leitura,
                   to_char(requested_at AT TIME ZONE 'UTC', 'MM-DD HH24:MI:SS') AS pedido,
                   to_char(entry_time AT TIME ZONE 'UTC', 'HH24:MI') AS entrada,
                   open_price AS o, close_price AS c, result
            FROM analyses WHERE requested_at > NOW() - INTERVAL '4 days' ORDER BY id`);
        for (let i = 0; i < det.rows.length; i += 25) {
            console.log('BACKTEST_DET ' + JSON.stringify(det.rows.slice(i, i + 25).map((r) => Object.values(r))));
        }
    } catch (err) {
        console.error('BACKTEST_DB erro:', err.message);
    }
}

// OTC (Exnova): usa os candles gravados pelo coletor. Ordena pelo PIOR acerto entre as duas
// metades dos dados, para só aparecer padrão que se repete (e não o que acertou por sorte).
async function runOtc() {
    const { rows: actives } = await pool.query('SELECT active, COUNT(*)::int AS n FROM otc_candles GROUP BY active ORDER BY active');
    // Por padrão testa todas as estratégias, menos as de "ritmo" (pesadas).
    const filter = new RegExp(process.env.BACKTEST_OTC_FILTER || '^(?!ritmo|pressao_ritmo)');
    const minN = parseInt(process.env.BACKTEST_MIN_N, 10) || 100;
    for (const { active, n } of actives) {
        const { rows } = await pool.query(
            'SELECT time, open, high, low, close FROM otc_candles WHERE active = $1 ORDER BY time', [active]);
        // Descarta o último candle (pode ainda estar em formação).
        const candles = rows.slice(0, -1).map((r) => ({
            time: new Date(r.time).getTime(), open: +r.open, high: +r.high, low: +r.low, close: +r.close,
        }));
        const { evaluated, out } = runOn(candles, 'M1', { anyTime: true, filter });
        console.log(`BACKTEST_OTC ${active} candles=${n} de=${rows[0] && new Date(rows[0].time).toISOString()} avaliados=${evaluated}`);
        const ranked = Object.entries(out)
            .filter(([name, r]) => filter.test(name) && r.n >= minN && r.metade1 != null && r.metade2 != null)
            .map(([name, r]) => [name, r.n, r.wr, r.metade1, r.metade2, r.cobertura, Math.min(r.metade1, r.metade2)])
            .sort((a, b) => b[6] - a[6]);
        const top = parseInt(process.env.BACKTEST_TOP, 10) || 25;
        // [estratégia, amostras, acerto %, 1ª metade, 2ª metade, cobertura %, pior metade]
        console.log(`BACKTEST_OTC_TOP ${active} ${JSON.stringify(ranked.slice(0, top))}`);
        const base = out.producao_m1_sempre;
        if (base) console.log(`BACKTEST_OTC_BASE ${active} producao_m1_sempre ${JSON.stringify([base.n, base.wr, base.metade1, base.metade2])}`);
    }
}

// Backtest com as fotos do candle ao vivo (m1Snapshots.js) e os candles oficiais (fechados e alvo).
async function runSnap() {
    const filter = new RegExp(process.env.BACKTEST_SNAP_FILTER || '^(producao_m1|fraco_|pin_|forte_|chinesa|ultimo_candle|contra_ultimo|tendencia_ema|pressao_m1$|atual$)');
    const minN = parseInt(process.env.BACKTEST_MIN_N, 10) || 30;
    const pages = parseInt(process.env.BACKTEST_M1_PAGES, 10) || 2;
    for (const pair of (process.env.BACKTEST_PAIRS || 'EURUSD,XAUUSD').split(',')) {
        const { rows } = await pool.query('SELECT time, open, high, low, close FROM m1_snapshots WHERE pair = $1 ORDER BY time', [pair]);
        const snaps = new Map(rows.map((r) => [new Date(r.time).getTime(), { time: new Date(r.time).getTime(), open: +r.open, high: +r.high, low: +r.low, close: +r.close }]));
        const candles = await fetchLongHistory(pair, 'M1', pages);
        const { evaluated, out } = runOn(candles, 'M1', { filter, snaps });
        console.log(`BACKTEST_SNAP ${pair} fotos=${rows.length} de=${rows[0] && new Date(rows[0].time).toISOString()} avaliados=${evaluated}`);
        const ranked = Object.entries(out)
            .filter(([name, r]) => filter.test(name) && r.n >= minN)
            .map(([name, r]) => [name, r.n, r.wr, r.metade1, r.metade2, r.cobertura])
            .sort((a, b) => b[2] - a[2]);
        // [estratégia, amostras, acerto %, 1ª metade, 2ª metade, cobertura %]
        console.log(`BACKTEST_SNAP_TOP ${pair} ${JSON.stringify(ranked)}`);
        // Estudo de padrões com as fotos: tabela montada só com candles de antes da 1ª foto.
        try {
            const P = require('./patterns');
            const firstSnap = rows.length ? new Date(rows[0].time).getTime() : Infinity;
            const cutIdx = candles.findIndex((c) => c.time >= firstSnap);
            const trainEnd = cutIdx < 0 ? candles.length : cutIdx;
            for (const [minN, minWr] of [[30, 0.62], [30, 0.58], [60, 0.62]]) {
                const table = P.buildTable(candles, 'fw', 60_000, 0, trainEnd);
                const hit = [], combo = [], base = [];
                for (let k = Math.max(trainEnd, WINDOW); k < candles.length - 1; k++) {
                    const snap = snaps.get(candles[k].time), next = candles[k + 1];
                    if (!snap || next.time - candles[k].time !== 60_000 || next.close === next.open) continue;
                    const closed = candles.slice(k - WINDOW, k);
                    const up = next.close > next.open;
                    const prod = computeM1Signal(closed, snap, computeTechnicalSignal(closed, snap)).direction;
                    const r = P.lookup(table, P.keyFor('fw', closed, snap), minN, minWr);
                    base.push((prod === 'COMPRA') === up);
                    if (r) hit.push((r.direction === 'COMPRA') === up);
                    combo.push(((r ? r.direction : prod) === 'COMPRA') === up);
                }
                const acc = (l) => (l.length ? +(l.filter(Boolean).length / l.length * 100).toFixed(1) : null);
                console.log(`BACKTEST_SNAP_PADRAO ${pair} fw minN=${minN} minWr=${minWr} regra=${base.length}/${acc(base)}% padrao=${hit.length}/${acc(hit)}% padrao_senao_regra=${combo.length}/${acc(combo)}%`);
            }
        } catch (err) {
            console.error('BACKTEST_SNAP_PADRAO erro', err.message);
        }
    }
}

// Estudo de padrões (patterns.js): monta a tabela com os primeiros 70% dos candles e testa nos
// últimos 30% (dias que o estudo não viu). Compara com a regra atual do M1 no mesmo período.
async function runPadroes() {
    const P = require('./patterns');
    const pages = parseInt(process.env.BACKTEST_M1_PAGES, 10) || 4;
    const pairs = (process.env.BACKTEST_PAIRS || 'EURUSD,XAUUSD,EURJPY').split(',');
    for (const pair of pairs) {
        const candles = (await fetchLongHistory(pair, 'M1', pages)).filter((c) => isMarketOpen(new Date(c.time)));
        const cut = Math.floor(candles.length * 0.7);
        console.log(`BACKTEST_PADROES ${pair} candles=${candles.length} de=${candles[0] && new Date(candles[0].time).toISOString()} teste_desde=${candles[cut] && new Date(candles[cut].time).toISOString()}`);
        // Alvos do período de teste + a regra atual.
        const tests = [];
        for (let k = Math.max(cut, WINDOW); k < candles.length - 1; k++) {
            const f = candles[k], next = candles[k + 1];
            if (next.time - f.time !== 60_000 || f.time - candles[k - WINDOW].time !== WINDOW * 60_000 || next.close === next.open) continue;
            const closed = candles.slice(k - WINDOW, k);
            const up = next.close > next.open;
            const prod = computeM1Signal(closed, f, computeTechnicalSignal(closed, f)).direction;
            tests.push({ closed, f, up, prod });
        }
        const acc = (list) => (list.length ? +(list.filter((x) => x).length / list.length * 100).toFixed(1) : null);
        const prodRes = tests.map((t) => (t.prod === 'COMPRA') === t.up);
        console.log(`BACKTEST_PADROES_BASE ${pair} regra_atual n=${tests.length} acerto=${acc(prodRes)}%`);
        const rows = [];
        for (const variant of Object.keys(P.KEYS)) {
            const table = P.buildTable(candles, variant, 60_000, 0, cut);
            const keys = tests.map((t) => P.keyFor(variant, t.closed, t.f));
            for (const minN of [30, 60, 120]) {
                for (const minWr of [0.55, 0.58, 0.62]) {
                    const hit = [], combo = [], agree = [];
                    tests.forEach((t, i) => {
                        const r = P.lookup(table, keys[i], minN, minWr);
                        if (r) hit.push((r.direction === 'COMPRA') === t.up);
                        const d = r ? r.direction : t.prod;
                        combo.push((d === 'COMPRA') === t.up);
                        if (r && r.direction === t.prod) agree.push((t.prod === 'COMPRA') === t.up);
                    });
                    rows.push([variant, minN, minWr, hit.length, acc(hit), +(hit.length / Math.max(tests.length, 1) * 100).toFixed(1), acc(combo), agree.length, acc(agree), table.size]);
                }
            }
        }
        rows.sort((a, b) => (b[4] ?? 0) - (a[4] ?? 0));
        // [chave, minN, minAcerto, n_padrao, acerto_padrao%, cobertura%, acerto_padrao_senao_regra%, n_concordam, acerto_concordam%, padroes_na_tabela]
        console.log(`BACKTEST_PADROES_TOP ${pair} ${JSON.stringify(rows)}`);
    }
}

// Estudo por horário (pedido do dono): nos horários de pouco fluxo, ir CONTRA os indicadores dá mais
// acerto que seguir? Usa os candles reais da Exnova guardados (otc_candles, ativos EURUSD/XAUUSD/EURJPY).
// Para cada minuto: indicadores com 99 fechados + o candle atual; resultado = cor do candle seguinte.
async function runHorario() {
    const pairs = (process.env.BACKTEST_PAIRS || 'EURUSD,XAUUSD,EURJPY').split(',');
    const total = {};
    const add = (b, h, key, ok) => { b[h] ||= { n: 0, seg: 0, prod: 0 }; if (key === 'n') b[h].n++; else if (ok) b[h][key]++; };
    for (const pair of pairs) {
        const { rows } = await pool.query('SELECT time, open, high, low, close FROM otc_candles WHERE active = $1 ORDER BY time', [pair]);
        const candles = rows.slice(0, -1).map((r) => ({ time: new Date(r.time).getTime(), open: +r.open, high: +r.high, low: +r.low, close: +r.close }));
        const byHour = {};
        for (let k = WINDOW; k < candles.length - 1; k++) {
            const cur = candles[k], next = candles[k + 1];
            if (next.time - cur.time !== 60_000 || cur.time - candles[k - WINDOW].time !== WINDOW * 60_000) continue;
            if (next.close === next.open) continue;
            const closed = candles.slice(k - WINDOW, k);
            const tech = computeTechnicalSignal(closed, cur);
            const ind = tech.indicadores?.direcao;
            if (ind !== 'COMPRA' && ind !== 'VENDA') continue;
            const up = next.close > next.open;
            const prod = computeM1Signal(closed, cur, tech).direction;
            const h = new Date(cur.time).getUTCHours();
            for (const b of [byHour, total]) {
                add(b, h, 'n');
                add(b, h, 'seg', (ind === 'COMPRA') === up);
                add(b, h, 'prod', prod === 'COMPRA' || prod === 'VENDA' ? (prod === 'COMPRA') === up : false);
            }
        }
        const fmt = (b) => Object.keys(b).sort((a, c) => a - c).map((h) => [+h, b[h].n, +(b[h].seg / b[h].n * 100).toFixed(1), +((b[h].n - b[h].seg) / b[h].n * 100).toFixed(1), +(b[h].prod / b[h].n * 100).toFixed(1)]);
        // [hora UTC, amostras, seguir indicadores %, contra indicadores %, sinal atual %]
        console.log(`BACKTEST_HORARIO ${pair} candles=${candles.length} de=${candles[0] && new Date(candles[0].time).toISOString()} ${JSON.stringify(fmt(byHour))}`);
    }
    const fmtT = Object.keys(total).sort((a, c) => a - c).map((h) => [+h, total[h].n, +(total[h].seg / total[h].n * 100).toFixed(1), +((total[h].n - total[h].seg) / total[h].n * 100).toFixed(1), +(total[h].prod / total[h].n * 100).toFixed(1)]);
    console.log(`BACKTEST_HORARIO TOTAL ${JSON.stringify(fmtT)}`);
}

// Estudo do Ouro: as regras de produção (ouro.js) e variações, nos candles reais da Exnova,
// com acerto por metade do período e por sessão. Também o resultado real dos sinais ouro_*.
async function runOuro() {
    const O = require('./ouro');
    const { rows } = await pool.query("SELECT time, open, high, low, close FROM otc_candles WHERE active = 'XAUUSD' ORDER BY time");
    const candles = rows.slice(0, -1).map((r) => ({ time: new Date(r.time).getTime(), open: +r.open, high: +r.high, low: +r.low, close: +r.close }));
    const res = {};
    const sess = (t) => { const h = new Date(t).getUTCHours(); return h < 7 ? 'asia' : h < 12 ? 'londres' : h < 21 ? 'ny' : 'noite'; };
    const tests = [];
    for (let k = WINDOW; k < candles.length - 1; k++) {
        const cur = candles[k], next = candles[k + 1];
        if (next.time - cur.time !== 60_000 || cur.time - candles[k - WINDOW].time !== WINDOW * 60_000 || next.close === next.open) continue;
        tests.push(k);
    }
    const half = tests[Math.floor(tests.length / 2)];
    const rej = (f, th) => { const r = (f.high - f.low) || 1e-9, dn = Math.min(f.open, f.close) - f.low, up = f.high - Math.max(f.open, f.close); return dn >= r * th ? 'COMPRA' : up >= r * th ? 'VENDA' : null; };
    for (const k of tests) {
        const closed = candles.slice(k - WINDOW, k), f = candles[k], up = candles[k + 1].close > candles[k + 1].open;
        const sig = computeTechnicalSignal(closed, f);
        const trendUp = sig.ema9 != null && sig.ema21 != null ? sig.ema9 > sig.ema21 : null;
        const V = {};
        for (const th of [0.5, 0.6, 0.7]) {
            const d = rej(f, th);
            if (d && trendUp != null) {
                const a = (d === 'COMPRA') === trendUp;
                V[`rej${th}_tendencia`] = a ? d : null;
                V[`rej${th}_contra_tend_inv`] = a ? null : opp(d);
                V[`rej${th}_contra_tend`] = a ? null : d;
            }
            V[`rej${th}_livre`] = d;
        }
        for (const L of [4, 5, 6, 8]) for (const faixa of [1.5, 2, 2.5]) for (const estica of [1.2, 1.5, 2]) {
            V[`lat_L${L}_f${faixa}_e${estica}`] = O.lateralEsticadaContra(closed, f, L, faixa, estica);
        }
        for (const T of [3, 4, 5, 6]) for (const m of [1.5, 2, 2.5]) V[`corr_T${T}_m${m}`] = O.correcaoRetoma(closed, f, T, m);
        // Estratégias novas candidatas (estudo, nada disso vai para produção sem aprovação).
        const cor = (c) => (c.close > c.open ? 'COMPRA' : c.close < c.open ? 'VENDA' : null);
        const body = (c) => Math.abs(c.close - c.open);
        const last20 = closed.slice(-20), avgBody = last20.reduce((s, c) => s + body(c), 0) / last20.length || 1e-9;
        const rng = (f.high - f.low) || 1e-9, pos = (f.close - f.low) / rng;
        V.base_segue_cor = cor(f);
        V.base_contra_cor = opp(cor(f));
        for (const km of [1.5, 2, 2.5]) {
            const forte = body(f) >= avgBody * km;
            const d = forte && pos >= 0.75 && cor(f) === 'COMPRA' ? 'COMPRA' : forte && pos <= 0.25 && cor(f) === 'VENDA' ? 'VENDA' : null;
            V[`mom_k${km}_segue`] = d;
            V[`mom_k${km}_contra`] = opp(d);
            if (d && trendUp != null) V[`mom_k${km}_tend`] = (d === 'COMPRA') === trendUp ? d : null;
        }
        for (const n of [3, 4, 5]) {
            const seq = [...closed.slice(-(n - 1)), f].map(cor);
            const d = seq.every((c) => c && c === seq[0]) ? seq[0] : null;
            V[`seq${n}_contra`] = opp(d);
            V[`seq${n}_segue`] = d;
        }
        if (sig.rsi != null) {
            for (const [hi, lo] of [[70, 30], [75, 25], [80, 20]]) {
                const d = sig.rsi >= hi ? 'VENDA' : sig.rsi <= lo ? 'COMPRA' : null;
                V[`rsi${hi}_reversao`] = d;
                V[`rsi${hi}_segue`] = opp(d);
            }
        }
        const pv = closed[closed.length - 1];
        if (pv && cor(pv) && cor(f) && cor(pv) !== cor(f) && body(f) > body(pv)
            && Math.max(f.open, f.close) >= Math.max(pv.open, pv.close) && Math.min(f.open, f.close) <= Math.min(pv.open, pv.close)) {
            V.engolfo_segue = cor(f);
            V.engolfo_contra = opp(cor(f));
            if (trendUp != null) V.engolfo_tend = (cor(f) === 'COMPRA') === trendUp ? cor(f) : null;
        }
        for (const N of [10, 20]) {
            const w = closed.slice(-N), hh = Math.max(...w.map((c) => c.high)), ll = Math.min(...w.map((c) => c.low));
            const d = f.close > hh ? 'COMPRA' : f.close < ll ? 'VENDA' : null;
            V[`rompe${N}_segue`] = d;
            V[`rompe${N}_falso`] = opp(d);
            // Pavio passou da máxima/mínima mas fechou de volta dentro: falso rompimento.
            const fk = f.high > hh && f.close < hh ? 'VENDA' : f.low < ll && f.close > ll ? 'COMPRA' : null;
            V[`rompe${N}_pavio_volta`] = fk;
        }
        for (const step of [5, 10]) {
            const lvl = Math.round(f.close / step) * step;
            const toca = f.low <= lvl && f.high >= lvl;
            if (toca) {
                V[`redondo${step}_rejeita`] = f.close > lvl && f.open > lvl ? 'COMPRA' : f.close < lvl && f.open < lvl ? 'VENDA' : null;
                V[`redondo${step}_rompe`] = f.open < lvl && f.close > lvl ? 'COMPRA' : f.open > lvl && f.close < lvl ? 'VENDA' : null;
            }
        }
        // Indicador "bwalpha" do usuário (Lua da corretora), com a configuração enviada por ele.
        {
            const all = [...closed, f];
            const n = all.length - 1; // índice do candle atual (f)
            // Padrão dos 5 candles: olha os 5 fechados ANTES do atual ([1]..[5]).
            const five = all.slice(n - 5, n);
            const bulls = five.filter((c) => c.close > c.open).length, bears = five.filter((c) => c.close < c.open).length;
            const varia = five[4].close - five[0].close;
            for (const m of [2, 3, 4, 5]) {
                V[`bw_padrao5_min${m}`] = varia > 0 && bulls >= m ? 'COMPRA' : varia < 0 && bears >= m ? 'VENDA' : null;
                V[`bw_padrao5_min${m}_contra`] = opp(V[`bw_padrao5_min${m}`]);
            }
            // Cruzamento: buffer1 = open - SMA(open,10); buffer2 = WMA(buffer1,10).
            const sma = (arr, p, i) => { let s = 0; for (let j = i - p + 1; j <= i; j++) s += arr[j]; return s / p; };
            for (const fonte of ['open', 'close']) for (const slow of [10, 20, 34]) for (const sp of [2, 5, 10]) {
                const src = all.map((c) => c[fonte]);
                const b1 = (i) => src[i] - sma(src, slow, i);
                const wma = (i) => { let s = 0, w = 0; for (let j = 0; j < sp; j++) { s += b1(i - j) * (sp - j); w += sp - j; } return s / w; };
                const up = b1(n) > wma(n) && b1(n - 1) < wma(n - 1), dn = b1(n) < wma(n) && b1(n - 1) > wma(n - 1);
                const d = up ? 'COMPRA' : dn ? 'VENDA' : null;
                V[`bwx_${fonte}_${slow}_${sp}_segue`] = d;
                V[`bwx_${fonte}_${slow}_${sp}_contra`] = opp(d);
                if (d && trendUp != null) V[`bwx_${fonte}_${slow}_${sp}_contra_tend`] = (opp(d) === 'COMPRA') === trendUp ? opp(d) : null;
            }
            // Alerta: bandas (SMA10 ± k·desvio10, k pela volatilidade) + estocástico(5) nos extremos.
            const closes = all.map((c) => c.close), m10 = sma(closes, 10, n);
            const sd = Math.sqrt(closes.slice(n - 9, n + 1).reduce((s, x) => s + (x - m10) ** 2, 0) / 10);
            const rg = all.map((c) => c.high - c.low), rc = sma(rg, 5, n), rl = sma(rg, 20, n);
            const volA = rc > rl * 1.2, volB = rc < rl * 0.8;
            const kB = volA ? 2.0 : volB ? 1.3 : 1.6, lo = volA ? 10 : volB ? 20 : 15, hi = 100 - lo;
            const w5 = all.slice(n - 4, n + 1), hh = Math.max(...w5.map((c) => c.high)), ll = Math.min(...w5.map((c) => c.low));
            const sto = hh > ll ? ((f.close - ll) / (hh - ll)) * 100 : 50;
            V.bw_alerta = f.close <= m10 - sd * kB && sto <= lo ? 'COMPRA' : f.close >= m10 + sd * kB && sto >= hi ? 'VENDA' : null;
            V.bw_alerta_contra = opp(V.bw_alerta);
            V.bw_alerta_sem_londres = sess(f.time) !== 'londres' ? V.bw_alerta : null;
        }
        const prod = O.sinalOuro(closed, f, sig, f.time);
        V.producao_ouro = prod && prod.direction;
        V.pipeline_atual_sem_ouro = computeM1Signal(closed, f, sig).direction;
        V.pipeline_com_ouro = (prod && prod.direction) || V.pipeline_atual_sem_ouro;
        for (const [name, d] of Object.entries(V)) {
            if (d !== 'COMPRA' && d !== 'VENDA') continue;
            const ok = (d === 'COMPRA') === up;
            const b = (res[name] ||= { n: 0, w: 0, h1: [0, 0], h2: [0, 0], s: {} });
            b.n++; if (ok) b.w++;
            const h = k < half ? b.h1 : b.h2; h[0]++; if (ok) h[1]++;
            const ss = (b.s[sess(f.time)] ||= [0, 0]); ss[0]++; if (ok) ss[1]++;
        }
    }
    const pct = (a) => (a[0] ? +(a[1] / a[0] * 100).toFixed(1) : null);
    const out = Object.entries(res).filter(([, b]) => b.n >= 30)
        .map(([name, b]) => [name, b.n, +(b.w / b.n * 100).toFixed(1), pct(b.h1), pct(b.h2), Object.fromEntries(Object.entries(b.s).map(([k, v]) => [k, [v[0], pct(v)]]))])
        .sort((a, b) => Math.min(b[3] ?? 0, b[4] ?? 0) - Math.min(a[3] ?? 0, a[4] ?? 0));
    console.log(`BACKTEST_OURO candles=${candles.length} de=${candles[0] && new Date(candles[0].time).toISOString()} testes=${tests.length}`);
    for (let i = 0; i < out.length; i += 20) console.log('BACKTEST_OURO_TOP ' + JSON.stringify(out.slice(i, i + 20)));
    const live = await pool.query(`SELECT leitura, COUNT(*) FILTER (WHERE result='win')::int w, COUNT(*) FILTER (WHERE result='loss')::int l, COUNT(*) FILTER (WHERE result='draw')::int d
        FROM analyses WHERE pair='XAUUSD' AND timeframe='M1' AND requested_at > NOW() - INTERVAL '3 days' GROUP BY 1 ORDER BY 1`);
    console.log('BACKTEST_OURO_REAL ' + JSON.stringify(live.rows));
}

async function run() {
    console.log('BACKTEST_START');
    if (process.env.BACKTEST_SOURCE === 'ouro') {
        try { await runOuro(); } catch (err) { console.error('BACKTEST_ERR OURO:', err.message); }
        console.log('BACKTEST_END');
        return;
    }
    if (process.env.BACKTEST_SOURCE === 'horario') {
        try { await runHorario(); } catch (err) { console.error('BACKTEST_ERR HORARIO:', err.message); }
        console.log('BACKTEST_END');
        return;
    }
    if (process.env.BACKTEST_SOURCE === 'padroes') {
        try { await runPadroes(); } catch (err) { console.error('BACKTEST_ERR PADROES:', err.message); }
        console.log('BACKTEST_END');
        return;
    }
    if (process.env.BACKTEST_SOURCE === 'lateral') {
        // Estratégia lateralização + esticada: OTC (Exnova), fotos do candle ao vivo e histórico M1.
        process.env.BACKTEST_OTC_FILTER ||= '^(lat_|corr_)';
        process.env.BACKTEST_SNAP_FILTER ||= '^(lat_|corr_|producao_m1_sempre)';
        process.env.BACKTEST_FILTER ||= '^(lat_|corr_|producao_m1_sempre)';
        try { await runOtc(); } catch (err) { console.error('BACKTEST_ERR OTC:', err.message); }
        try { await runSnap(); } catch (err) { console.error('BACKTEST_ERR SNAP:', err.message); }
    }
    if (process.env.BACKTEST_SOURCE === 'snap') {
        try { await runSnap(); } catch (err) { console.error('BACKTEST_ERR SNAP:', err.message); }
        console.log('BACKTEST_END');
        return;
    }
    if (process.env.BACKTEST_SOURCE === 'otc') {
        try { await runOtc(); } catch (err) { console.error('BACKTEST_ERR OTC:', err.message); }
        console.log('BACKTEST_END');
        return;
    }
    if (process.env.BACKTEST_SOURCE !== 'lateral') await dbStats();
    if (process.env.BACKTEST_ONLY_DB === '1') { console.log('BACKTEST_END'); return; }
    const plan = [['M1', parseInt(process.env.BACKTEST_M1_PAGES, 10) || 3], ['M5', parseInt(process.env.BACKTEST_M5_PAGES, 10) || 2]];
    for (const pair of Object.keys(SIGNAL_PAIRS)) {
        for (const [tf, pages] of plan) {
            try {
                const candles = await fetchLongHistory(pair, tf, pages);
                const first = candles[0] && new Date(candles[0].time).toISOString();
                const last = candles.length && new Date(candles[candles.length - 1].time).toISOString();
                const { evaluated, out } = runOn(candles, tf);
                console.log(`BACKTEST_RESULT ${pair} ${tf} candles=${candles.length} de=${first} ate=${last} avaliados=${evaluated}`);
                const filter = new RegExp(process.env.BACKTEST_FILTER || '^(producao|atual$)');
                // Resumo compacto: [estratégia, amostras, acerto %, acerto 1ª metade, acerto 2ª metade, cobertura %]
                const rows = Object.entries(out)
                    .filter(([name, r]) => filter.test(name) && r.n >= (parseInt(process.env.BACKTEST_MIN_N, 10) || 100))
                    .sort((a, b) => b[1].wr - a[1].wr)
                    .map(([name, r]) => [name, r.n, r.wr, r.metade1, r.metade2, r.cobertura]);
                const top = parseInt(process.env.BACKTEST_TOP, 10) || 30;
                console.log(`BACKTEST_TOP ${pair} ${tf} ${JSON.stringify(rows.slice(0, top))}`);
                for (const name of ['producao_m1', 'producao_m1_sempre', 'fraco_contra']) {
                    const r = out[name];
                    if (r) console.log(`BACKTEST_BASE ${pair} ${tf} ${name} ${JSON.stringify([r.n, r.wr, r.metade1, r.metade2, r.cobertura])}`);
                }
            } catch (err) {
                console.error(`BACKTEST_ERR ${pair} ${tf}:`, err.message);
            }
        }
    }
    console.log('BACKTEST_END');
}

module.exports = { run, runOn, STRATEGIES };
