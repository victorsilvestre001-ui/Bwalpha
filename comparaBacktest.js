// Comparação WIN x RED (pedido do dono em 09/10): "o padrão que deu red seguiu esse e o que deu win seguiu esse".
// Para cada entrada (as do robô em auto_trades e as do teste sombra das estratégias de minuto), descreve o
// momento da entrada com os candles M1 da Exnova e compara as características das que acertaram com as das
// que erraram. As do robô são poucas (servem de exemplo); as do teste sombra são centenas (servem de prova),
// e saem separadas em metade antiga/nova para ver se a diferença se repete.
// Todas as características são relativas à APOSTA: "a_favor" = no mesmo sentido da entrada, "contra" = oposto.
// BACKTEST_SOURCE=compara; logs CMP_*.
const PAIRS = ['EURUSD', 'EURJPY', 'XAUUSD'];
const MIN = 60_000;
const ESTRATEGIAS = ['devolve_m5', 'relogio15_segue', 'pico_volta'];

const faixa = (v, cortes, nomes) => { const i = cortes.findIndex((c) => v < c); return nomes[i === -1 ? nomes.length - 1 : i]; };
const lado = (x, s) => (Math.abs(x) < 1e-12 ? 'zero' : Math.sign(x) === s ? 'a_favor' : 'contra');

async function carrega(pool) {
    const d = {};
    for (const pair of PAIRS) {
        const { rows } = await pool.query('SELECT time, open, high, low, close FROM otc_candles WHERE active = $1 ORDER BY time', [pair]);
        const m1 = rows.map((r) => ({ time: new Date(r.time).getTime(), open: +r.open, high: +r.high, low: +r.low, close: +r.close }));
        const P = require('./mineradorBacktest').prep(m1);
        d[pair] = { m1, atr: P.atr, e20: P.e20, idx: new Map(m1.map((x, i) => [x.time, i])) };
    }
    return d;
}

// Momento da entrada E (início do minuto em que a ordem abre; o último candle fechado é E - 1 min).
// s = +1 aposta de alta (COMPRA), -1 aposta de baixa (VENDA).
function descreve(D, pair, E, s) {
    const { m1, atr, e20, idx } = D[pair];
    const i = idx.get(E - MIN);
    if (i == null || i < 1440) return null;
    const a = atr[i], x = m1[i];
    const janela = (n) => m1.slice(i - n + 1, i + 1);
    const mov = (n) => (x.close - m1[i - n + 1].open) / a;
    const h60 = janela(60), hi = Math.max(...h60.map((c) => c.high)), lo = Math.min(...h60.map((c) => c.low));
    const pos = (x.close - lo) / ((hi - lo) || 1e-9); // 0 = fundo da hora, 1 = topo
    const viz = atr.slice(i - 1440, i).sort((p, q) => p - q);
    const corpo = x.close - x.open, faixaUlt = x.high - x.low || 1e-9;
    const pavioAFavor = s > 0 ? (Math.min(x.open, x.close) - x.low) : (x.high - Math.max(x.open, x.close));
    const hUtc = new Date(E).getUTCHours();
    return {
        par: pair,
        periodo: hUtc < 7 ? 'asia' : hUtc < 12 ? 'londres' : hUtc < 17 ? 'ny' : 'tarde',
        dia: ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'][new Date(E - 3 * 3600_000).getUTCDay()],
        // Para onde o preço andou antes da entrada, em relação à aposta.
        ultimo_min: lado(corpo, s) + '_' + faixa(Math.abs(corpo) / a, [0.5, 1.5], ['pequeno', 'medio', 'grande']),
        mov_5min: lado(mov(5), s) + (Math.abs(mov(5)) >= 2 ? '_forte' : '_fraco'),
        mov_15min: lado(mov(15), s) + (Math.abs(mov(15)) >= 3 ? '_forte' : '_fraco'),
        tendencia_1h: Math.abs(mov(60)) < 4 ? 'lateral' : lado(mov(60), s),
        // Onde está o preço na faixa da última hora: "na_ponta_contra" = no extremo oposto à aposta
        // (ex.: compra com o preço no fundo da hora).
        posicao_hora: faixa(s > 0 ? pos : 1 - pos, [0.15, 0.4, 0.6, 0.85], ['na_ponta_contra', 'lado_contra', 'meio', 'lado_a_favor', 'na_ponta_a_favor']),
        dist_media20: (() => { const z = (x.close - e20[i]) / a * s; return faixa(z, [-2, -0.5, 0.5, 2], ['muito_contra', 'contra', 'na_media', 'a_favor', 'muito_a_favor']); })(),
        pavio_rejeicao: faixa(pavioAFavor / faixaUlt, [0.15, 0.4], ['sem', 'pouco', 'forte']),
        volatilidade: faixa(a / (viz[Math.floor(viz.length / 2)] || a), [0.8, 1.3, 2], ['baixa', 'normal', 'alta', 'muito_alta']),
    };
}

const pct = (w, n) => (n ? +(100 * w / n).toFixed(1) : null);

function compara(lista, nome, dividir) {
    if (!lista.length) return console.log(`CMP_${nome} sem casos`);
    const corte = dividir ? lista.slice().sort((p, q) => p.t - q.t)[Math.floor(lista.length / 2)].t : Infinity;
    const W = lista.filter((s) => s.win).length;
    console.log(`CMP_${nome}_GERAL casos=${lista.length} acertos=${W} (${pct(W, lista.length)}%)`);
    const chaves = Object.keys(lista[0].f);
    const destaques = [];
    for (const k of chaves) {
        const g = {};
        for (const s of lista) {
            const v = s.f[k], o = (g[v] ||= { win: 0, red: 0, a: [0, 0], b: [0, 0] });
            s.win ? o.win++ : o.red++;
            const h = s.t < corte ? o.a : o.b; h[0]++; if (s.win) h[1]++;
        }
        // Cada valor: quantos WIN, quantos RED, acerto %, e (no teste sombra) acerto na metade antiga/nova.
        const out = Object.fromEntries(Object.entries(g).sort().map(([v, o]) => [v, dividir
            ? { win: o.win, red: o.red, acerto: pct(o.win, o.win + o.red), antiga: pct(o.a[1], o.a[0]), nova: pct(o.b[1], o.b[0]) }
            : { win: o.win, red: o.red, acerto: pct(o.win, o.win + o.red) }]));
        console.log(`CMP_${nome} ${k} ${JSON.stringify(out)}`);
        if (dividir) for (const [v, o] of Object.entries(g)) {
            if (o.a[0] < 25 || o.b[0] < 25) continue;
            const ra = o.a[1] / o.a[0], rb = o.b[1] / o.b[0], geral = W / lista.length;
            // Repete nas duas metades e se afasta da média em pelo menos 5 pontos.
            if ((ra - geral >= 0.05 && rb - geral >= 0.05) || (geral - ra >= 0.05 && geral - rb >= 0.05)) {
                destaques.push({ caracteristica: `${k}=${v}`, casos: o.win + o.red, acerto: pct(o.win, o.win + o.red), antiga: pct(o.a[1], o.a[0]), nova: pct(o.b[1], o.b[0]) });
            }
        }
    }
    if (dividir) console.log(`CMP_${nome}_DESTAQUES ${JSON.stringify(destaques.sort((p, q) => q.acerto - p.acerto))}`);
}

async function runCompara(pool) {
    const D = await carrega(pool);
    // 1) Entradas do robô (só treino, para não contar a mesma entrada duas vezes).
    const { rows: tr } = await pool.query(`SELECT id, pair, created_at, direction, result, detalhes FROM auto_trades
        WHERE COALESCE(conta, 'treino') = 'treino' AND result IN ('acerto', 'erro') ORDER BY id`);
    const robo = [];
    for (const r of tr) {
        const E = Math.floor(new Date(r.created_at).getTime() / MIN) * MIN;
        const s = r.direction === 'COMPRA' ? 1 : -1;
        const f = descreve(D, r.pair, E, s);
        if (!f) continue;
        const est = r.detalhes?.estrategia || r.detalhes?.regra || 'score';
        robo.push({ t: E, win: r.result === 'acerto', f: { estrategia: est, ...f } });
        console.log(`CMP_ROBO_ENTRADA #${r.id} ${new Date(E - 3 * 3600_000).toISOString().slice(5, 16)} ${r.pair} ${r.direction} ${est} ${r.result} ${JSON.stringify(f)}`);
    }
    compara(robo, 'ROBO', false);
    // 2) Teste sombra das estratégias de minuto (bem mais casos), uma a uma.
    for (const est of ESTRATEGIAS) {
        const { rows } = await pool.query(`SELECT pair, candle_time, direction, result FROM shadow_tests WHERE estrategia = $1 AND result IN ('win', 'loss')`, [est]);
        const lista = [];
        for (const r of rows) {
            const E = new Date(r.candle_time).getTime();
            const f = descreve(D, r.pair, E, r.direction === 'COMPRA' ? 1 : -1);
            if (f) lista.push({ t: E, win: r.result === 'win', f });
        }
        compara(lista, `SOMBRA_${est}`, true);
    }
}

module.exports = { runCompara, descreve };
