// Revisão da Devolução M5 (pedido do dono em 08/10, depois de 5 erros seguidos à tarde): onde ela erra?
// Refaz todos os casos no histórico de candles M1 da Exnova (otc_candles) e quebra o acerto por
// características do momento da entrada, para achar um filtro que corte os erros.
// Caso: no fim do 2º minuto do bloco M5, o preço andou ≥ 2 ATR(M1) desde a abertura → aposta CONTRA,
// resultado no fechamento do 5º minuto (igual ao robô). Empate fica de fora.
// Cada característica sai com [casos, acerto %] na metade antiga, na nova e no total, para ver se repete.
// Também lista as entradas reais do robô (auto_trades) e cruza com as características.
// BACKTEST_SOURCE=devolve; logs DEV_*.
const PAIRS = ['EURUSD', 'EURJPY', 'XAUUSD'];
const MIN = 60_000, TF = 300_000;

const acc = (l) => (l.length ? [l.length, +(100 * l.filter(Boolean).length / l.length).toFixed(1)] : [0, null]);
const faixa = (v, cortes, nomes) => nomes[cortes.findIndex((c) => v < c) === -1 ? nomes.length - 1 : cortes.findIndex((c) => v < c)];

function m5De(m1) {
    const out = [];
    for (const c of m1) {
        const b = Math.floor(c.time / TF) * TF, last = out[out.length - 1];
        if (last && last.time === b) { last.high = Math.max(last.high, c.high); last.low = Math.min(last.low, c.low); last.close = c.close; last.n++; }
        else out.push({ time: b, open: c.open, high: c.high, low: c.low, close: c.close, n: 1 });
    }
    return out.filter((c) => c.n === 5);
}

// Características do caso. sinal = +1 quando o movimento foi de alta (a aposta é de VENDA).
function caracteristicas(pair, t, mins, atr, m5, iM5, atrMed) {
    const [a, b] = mins;
    const mov = (b.close - a.open) / atr, s = Math.sign(mov);
    const hBr = new Date(t - 3 * 3600_000).getUTCHours();
    const hUtc = new Date(t).getUTCHours();
    const f = {
        par: pair,
        hora_br: String(hBr).padStart(2, '0'),
        periodo: hUtc < 7 ? 'asia' : hUtc < 12 ? 'londres' : hUtc < 17 ? 'ny' : 'tarde',
        forca: faixa(Math.abs(mov), [2.5, 3, 4], ['2-2.5', '2.5-3', '3-4', '4+']),
        lado: s > 0 ? 'subiu(vende)' : 'caiu(compra)',
        // Os dois minutos foram na mesma direção do movimento, ou um deles foi contra?
        minutos: Math.sign(a.close - a.open) === s && Math.sign(b.close - b.open) === s ? 'os_dois_a_favor' : 'um_contra',
        // Quanto do movimento veio no 2º minuto.
        peso_2min: faixa(Math.abs((b.close - b.open) / (b.close - a.open || 1e-9)), [0.4, 0.7], ['pouco', 'metade', 'quase_tudo']),
        // O 2º minuto já fechou longe da ponta (pavio devolvendo)?
        pavio_ponta: (() => {
            const ponta = s > 0 ? Math.max(a.high, b.high) : Math.min(a.low, b.low);
            const r = Math.abs(ponta - b.close) / (Math.abs(ponta - a.open) || 1e-9);
            return faixa(r, [0.1, 0.3], ['fechou_na_ponta', 'pouco_pavio', 'ja_devolvendo']);
        })(),
        // Volatilidade do momento (ATR do M1 x mediana do dia anterior).
        volatilidade: faixa(atr / (atrMed || atr), [0.8, 1.3, 2], ['baixa', 'normal', 'alta', 'muito_alta']),
    };
    // Tendência no M5 (últimos 12 candles fechados antes do bloco) e posição na faixa da última hora.
    if (iM5 >= 12) {
        const ant = m5.slice(iM5 - 12, iM5);
        const incl = (ant[11].close - ant[0].open) / atr;
        f.tendencia_m5 = Math.abs(incl) < 3 ? 'lateral' : Math.sign(incl) === s ? 'a_favor_do_mov' : 'contra_o_mov';
        const hi = Math.max(...ant.map((x) => x.high)), lo = Math.min(...ant.map((x) => x.low));
        f.rompe_hora = s > 0 ? (b.close > hi ? 'rompeu_maxima' : 'dentro') : (b.close < lo ? 'rompeu_minima' : 'dentro');
        const p = ant[11];
        f.candle_ant = Math.sign(p.close - p.open) === s ? 'mesma_cor' : 'cor_oposta';
    }
    return f;
}

async function runDevolve(pool, deps) {
    const amostras = [];
    for (const pair of PAIRS) {
        const { rows } = await pool.query('SELECT time, open, high, low, close FROM otc_candles WHERE active = $1 ORDER BY time', [pair]);
        const m1 = rows.slice(0, -1).map((r) => ({ time: new Date(r.time).getTime(), open: +r.open, high: +r.high, low: +r.low, close: +r.close }));
        const atr = require('./mineradorBacktest').prep(m1).atr;
        const byT = new Map(m1.map((x, i) => [x.time, { ...x, atr: atr[i], i }]));
        const m5 = m5De(m1), idx5 = new Map(m5.map((x, i) => [x.time, i]));
        for (const blk of m5) {
            const t = blk.time;
            const mins = [0, 1, 2, 3, 4].map((k) => byT.get(t + k * MIN));
            if (mins.some((x) => !x) || !deps.isMarketOpen(new Date(t + 120_000))) continue;
            const a = mins[1].atr, mov = (mins[1].close - mins[0].open) / a;
            if (Math.abs(mov) < 2) continue;
            const ent = mins[1].close, fim = mins[4].close;
            if (fim === ent) continue;
            const win = mov > 0 ? fim < ent : fim > ent;
            // ATR mediano das 24h anteriores (só a cada caso, barato o suficiente).
            const i = mins[1].i, ini = Math.max(0, i - 1440);
            const viz = atr.slice(ini, i).filter(Boolean).sort((x, y) => x - y);
            const f = caracteristicas(pair, t, mins, a, m5, idx5.get(t), viz[Math.floor(viz.length / 2)]);
            amostras.push({ t, pair, win, f });
        }
    }
    amostras.sort((x, y) => x.t - y.t);
    if (!amostras.length) return console.log('DEV_RESULT sem casos');
    const corte = amostras[Math.floor(amostras.length / 2)].t;
    const tab = (lista) => ({ antiga: acc(lista.filter((s) => s.t < corte).map((s) => s.win)), nova: acc(lista.filter((s) => s.t >= corte).map((s) => s.win)), total: acc(lista.map((s) => s.win)) });
    console.log(`DEV_GERAL de=${new Date(amostras[0].t).toISOString().slice(0, 16)} corte=${new Date(corte).toISOString().slice(0, 16)} ${JSON.stringify(tab(amostras))}`);
    // Últimos 3 dias à parte (o "agora").
    const recente = amostras.filter((s) => s.t > Date.now() - 3 * 86_400_000);
    console.log(`DEV_RECENTE_3D ${JSON.stringify(acc(recente.map((s) => s.win)))}`);
    const chaves = [...new Set(amostras.flatMap((s) => Object.keys(s.f)))];
    for (const k of chaves) {
        const grupos = {};
        for (const s of amostras) if (s.f[k] != null) (grupos[s.f[k]] ||= []).push(s);
        console.log(`DEV_POR ${k} ${JSON.stringify(Object.fromEntries(Object.entries(grupos).sort().map(([v, l]) => [v, tab(l)])))}`);
    }
    // Combinações de 2 características que repetem nas duas metades (≥ 15 casos em cada, ≥ 58% nas duas) ou
    // que derrubam o acerto (≤ 45% nas duas): os candidatos a filtro.
    const bons = [], ruins = [];
    for (let x = 0; x < chaves.length; x++) for (let y = x + 1; y < chaves.length; y++) {
        const grupos = {};
        for (const s of amostras) {
            const v1 = s.f[chaves[x]], v2 = s.f[chaves[y]];
            if (v1 != null && v2 != null) (grupos[`${chaves[x]}=${v1}&${chaves[y]}=${v2}`] ||= []).push(s);
        }
        for (const [nome, l] of Object.entries(grupos)) {
            const r = tab(l);
            if (r.antiga[0] < 15 || r.nova[0] < 15) continue;
            if (r.antiga[1] >= 58 && r.nova[1] >= 58) bons.push([nome, r]);
            if (r.antiga[1] <= 45 && r.nova[1] <= 45) ruins.push([nome, r]);
        }
    }
    bons.sort((p, q) => q[1].total[1] - p[1].total[1]);
    ruins.sort((p, q) => p[1].total[1] - q[1].total[1]);
    console.log(`DEV_COMBO_BONS ${JSON.stringify(bons.slice(0, 25))}`);
    console.log(`DEV_COMBO_RUINS ${JSON.stringify(ruins.slice(0, 25))}`);
    // Entradas de verdade do robô na Devolução, com as características do momento.
    const { rows: tr } = await pool.query(`SELECT id, pair, created_at, direction, result, COALESCE(conta, 'treino') AS conta, detalhes
        FROM auto_trades WHERE detalhes->>'estrategia' = 'devolve_m5' AND result IN ('acerto', 'erro') ORDER BY id`);
    const porT = new Map(amostras.map((s) => [`${s.pair}:${s.t}`, s]));
    for (const r of tr) {
        const t = Math.floor(new Date(r.created_at).getTime() / TF) * TF;
        const s = porT.get(`${r.pair}:${t}`);
        console.log(`DEV_ROBO #${r.id} ${r.conta} ${r.pair} ${new Date(new Date(r.created_at).getTime() - 3 * 3600_000).toISOString().slice(5, 16)} ${r.direction} ${r.result} ${s ? JSON.stringify(s.f) : 'sem_caso'}`);
    }
}

module.exports = { runDevolve };
