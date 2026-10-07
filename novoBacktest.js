// Estudos novos na cotação própria da Exnova (pedido do dono em 07/10: "sair do padrão").
//
// 1) Relógio do candle (entrada no meio do M5): na Exnova o resultado compara o preço da expiração
//    com o preço NA HORA DA COMPRA. Então: se no minuto k (1 a 4) do candle M5 o preço já andou
//    ≥ x ATR(M1) desde a abertura, comprar/vender na direção do movimento com expiração no fim do
//    M5 ganha mais do que perde? (e o contrário, devolver?). Entrada = fechamento do minuto k.
//
// 2) Memória da Exnova (Markov): o próximo candle depende da sequência das últimas 5 cores?
//    Aprende a % de alta de cada sequência (32 combinações, também por minuto do bloco no M1) na
//    1ª metade e aposta só nas sequências com ≥ 30 casos e ≥ 58% para um lado; mede na 2ª metade.
//    Controle: a mesma coisa com os resultados embaralhados.
//
// Candles reais da Exnova (otc_candles). BACKTEST_SOURCE=novo; logs NOVO_*.

const acc = (l) => (l.length ? [l.length, +(100 * l.filter(Boolean).length / l.length).toFixed(1)] : [0, null]);

function atrSerie(c) {
    const out = new Array(c.length);
    let a = 0;
    for (let i = 0; i < c.length; i++) {
        const tr = i ? Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close)) : c[i].high - c[i].low;
        a = i ? (a * 13 + tr) / 14 : tr;
        out[i] = a || 1e-9;
    }
    return out;
}

function agrega(m1, min) {
    const tf = min * 60_000, out = [];
    for (const c of m1) {
        const b = Math.floor(c.time / tf) * tf, last = out[out.length - 1];
        if (last && last.time === b) { last.high = Math.max(last.high, c.high); last.low = Math.min(last.low, c.low); last.close = c.close; last.n++; }
        else out.push({ time: b, open: c.open, high: c.high, low: c.low, close: c.close, n: 1 });
    }
    return out.filter((c) => c.n === min);
}

function embaralha(a) {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
    return b;
}

function relogio(m1, isOpen) {
    const atr = atrSerie(m1), idx = new Map(m1.map((x, i) => [x.time, i])), res = {};
    const corte = m1[Math.floor(m1.length / 2)]?.time ?? 0;
    for (let i = 20; i < m1.length; i++) {
        const t = m1[i].time;
        if (t % 300_000 !== 0 || !isOpen(new Date(t))) continue; // início de bloco M5
        const mins = [0, 1, 2, 3, 4].map((k) => idx.get(t + k * 60_000));
        if (mins.some((v) => v == null)) continue;
        const abre = m1[mins[0]].open, fim = m1[mins[4]].close;
        for (let k = 1; k <= 3; k++) {
            const j = mins[k - 1], entrada = m1[j].close, mov = (entrada - abre) / atr[j];
            if (fim === entrada) continue;
            for (const th of [1, 2, 3]) {
                if (Math.abs(mov) < th) continue;
                const segue = Math.sign(fim - entrada) === Math.sign(mov);
                const b = (res[`min${k}_${th}atr`] ||= { a: [], b: [] });
                b[t < corte ? 'a' : 'b'].push(segue);
            }
        }
    }
    // % em que o movimento CONTINUOU até o fim do M5 (abaixo de 50% = devolver é melhor).
    return Object.fromEntries(Object.entries(res).map(([k, v]) => [k, { antiga: acc(v.a), nova: acc(v.b) }]));
}

function markov(c, tfMs, comMinuto) {
    const cor = (x) => (x.close > x.open ? 'V' : x.close < x.open ? 'R' : null), S = [];
    for (let i = 5; i < c.length - 1; i++) {
        if (c[i + 1].time - c[i - 4].time !== 5 * tfMs) continue;
        const seq = [c[i - 4], c[i - 3], c[i - 2], c[i - 1], c[i]].map(cor);
        const prox = cor(c[i + 1]);
        if (seq.includes(null) || !prox) continue;
        const chave = seq.join('') + (comMinuto ? `@${new Date(c[i + 1].time).getUTCMinutes() % 5}` : '');
        S.push({ t: c[i].time, chave, y: prox === 'V' });
    }
    if (S.length < 500) return null;
    const corte = S[Math.floor(S.length / 2)].t;
    const rodar = (ys) => {
        const est = {};
        S.forEach((s, j) => { if (s.t < corte) { const e = (est[s.chave] ||= [0, 0]); e[0]++; if (ys[j]) e[1]++; } });
        const regra = {};
        for (const [k, [n, u]] of Object.entries(est)) if (n >= 30 && Math.abs(u / n - 0.5) >= 0.08) regra[k] = u / n > 0.5;
        const ok = [];
        S.forEach((s, j) => { if (s.t >= corte && s.chave in regra) ok.push(regra[s.chave] === ys[j]); });
        return { sequencias: Object.keys(regra).length, prova: acc(ok), regra };
    };
    const real = rodar(S.map((s) => s.y));
    const ctrl = [1, 2, 3].map(() => rodar(embaralha(S.map((s) => s.y))).prova);
    return { amostras: S.length, sequencias_escolhidas: real.sequencias, prova: real.prova, controle_embaralhado: ctrl, exemplos: Object.entries(real.regra).slice(0, 8).map(([k, v]) => `${k}→${v ? 'COMPRA' : 'VENDA'}`) };
}

// ---- Segunda rodada (07/10) ----
// Cada teste devolve listas de acerto por metade (antiga/nova). "segue" = o movimento continuou.
function rodada2(m1, isOpen, outros) {
    const atr = atrSerie(m1), idx = new Map(m1.map((x, i) => [x.time, i])), res = {};
    const corte = m1[Math.floor(m1.length / 2)]?.time ?? 0;
    const add = (nome, t, ok) => ((res[nome] ||= { a: [], b: [] })[t < corte ? 'a' : 'b']).push(ok);
    for (let i = 20; i < m1.length - 3; i++) {
        const x = m1[i], t = x.time;
        if (!isOpen(new Date(t))) continue;
        const cont3 = m1[i + 3].time === t + 180_000, cont1 = m1[i + 1].time === t + 60_000;
        // Relógio de 15 min: no minuto k do bloco, movimento ≥ th ATR desde a abertura → segue até o fim?
        if (t % 900_000 === 0) {
            const mins = Array.from({ length: 15 }, (_, k) => idx.get(t + k * 60_000));
            if (mins.every((v) => v != null)) {
                const abre = m1[mins[0]].open, fim = m1[mins[14]].close;
                for (const k of [3, 5, 8, 10]) {
                    const j = mins[k - 1], entrada = m1[j].close, mov = (entrada - abre) / atr[j];
                    for (const th of [2, 3, 4]) if (Math.abs(mov) >= th && fim !== entrada) add(`relogio15_min${k}_${th}atr_segue`, t, Math.sign(fim - entrada) === Math.sign(mov));
                }
            }
        }
        // Pico relâmpago: faixa do minuto ≥ 3 ATR → em 3 min o preço segue a cor do pico?
        if (cont3 && (x.high - x.low) >= 3 * atr[i - 1] && x.close !== x.open && m1[i + 3].close !== x.close) {
            add('pico_3min_segue', t, Math.sign(m1[i + 3].close - x.close) === Math.sign(x.close - x.open));
        }
        // Preço congelado: minuto sem movimento nenhum → cor do próximo minuto igual à do minuto antes do congelamento?
        if (cont1 && x.high === x.low) {
            const ant = m1[i - 1], nx = m1[i + 1];
            if (ant.close !== ant.open && nx.close !== nx.open) add('congelado_proximo_segue_anterior', t, (nx.close > nx.open) === (ant.close > ant.open));
            const n2 = m1[i + 2];
            if (n2 && n2.time === t + 120_000 && n2.close !== x.close) add('congelado_2min_sobe', t, n2.close > x.close);
        }
        // Calmaria (10 min com faixa < 2 ATR) e rompimento neste minuto → segue por 3 min?
        if (cont3 && m1[i - 10] && t - m1[i - 10].time === 600_000) {
            let hi = -Infinity, lo = Infinity;
            for (let k = i - 10; k < i; k++) { hi = Math.max(hi, m1[k].high); lo = Math.min(lo, m1[k].low); }
            if (hi - lo < 2 * atr[i - 1] && (x.close > hi || x.close < lo) && m1[i + 3].close !== x.close) {
                add('calmaria_rompe_3min_segue', t, (m1[i + 3].close > x.close) === (x.close > hi));
            }
        }
        // Choque do dólar (só para EURUSD/XAUUSD): os dois andaram ≥ 1,5 ATR no mesmo minuto para o mesmo lado.
        if (outros && cont3) {
            const o = outros.idx.get(t);
            if (o != null) {
                const y = outros.m1[o], ca = (x.close - x.open) / atr[i], cb = (y.close - y.open) / outros.atr[o];
                if (Math.abs(ca) >= 1.5 && Math.abs(cb) >= 1.5 && Math.sign(ca) === Math.sign(cb)) {
                    if (m1[i + 1].close !== m1[i + 1].open) add('choque_dolar_proximo_segue', t, (m1[i + 1].close > m1[i + 1].open) === (ca > 0));
                    if (m1[i + 3].close !== x.close) add('choque_dolar_3min_segue', t, Math.sign(m1[i + 3].close - x.close) === Math.sign(ca));
                }
            }
        }
    }
    return Object.fromEntries(Object.entries(res).map(([k, v]) => [k, { antiga: acc(v.a), nova: acc(v.b) }]));
}

async function runNovo2(pool, deps) {
    const dados = {};
    for (const pair of ['EURUSD', 'EURJPY', 'XAUUSD']) {
        const { rows } = await pool.query('SELECT time, open, high, low, close FROM otc_candles WHERE active = $1 ORDER BY time', [pair]);
        const m1 = rows.slice(0, -1).map((r) => ({ time: new Date(r.time).getTime(), open: +r.open, high: +r.high, low: +r.low, close: +r.close }));
        dados[pair] = { m1, atr: atrSerie(m1), idx: new Map(m1.map((x, i) => [x.time, i])) };
    }
    const parceiro = { EURUSD: 'XAUUSD', XAUUSD: 'EURUSD' };
    for (const pair of Object.keys(dados)) {
        console.log(`NOVO2 ${pair} ${JSON.stringify(rodada2(dados[pair].m1, deps.isMarketOpen, dados[parceiro[pair]]))}`);
    }
}

async function runNovo(pool, deps) {
    if (process.env.NOVO_RODADA === '2') return runNovo2(pool, deps);
    for (const pair of ['EURUSD', 'EURJPY', 'XAUUSD']) {
        const { rows } = await pool.query('SELECT time, open, high, low, close FROM otc_candles WHERE active = $1 ORDER BY time', [pair]);
        const m1 = rows.slice(0, -1).map((r) => ({ time: new Date(r.time).getTime(), open: +r.open, high: +r.high, low: +r.low, close: +r.close }));
        console.log(`NOVO_RELOGIO ${pair} m1=${m1.length} ${JSON.stringify(relogio(m1, deps.isMarketOpen))}`);
        console.log(`NOVO_MEMORIA ${pair} M1 ${JSON.stringify(markov(m1, 60_000, false))}`);
        console.log(`NOVO_MEMORIA ${pair} M1+minuto ${JSON.stringify(markov(m1, 60_000, true))}`);
        console.log(`NOVO_MEMORIA ${pair} M5 ${JSON.stringify(markov(agrega(m1, 5), 300_000, false))}`);
    }
}

module.exports = { runNovo, relogio, markov, rodada2 };
