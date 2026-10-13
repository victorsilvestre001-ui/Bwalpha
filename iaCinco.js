// IA dos próximos 5 candles (pedido do dono em 13/10: "acertar alta ou baixa para os próximos 5 candles no M1").
// Modelo de árvores de decisão em sequência (gradient boosting, feito aqui mesmo, sem biblioteca) que olha, a cada
// minuto fechado, dezenas de informações juntas e dá a chance de o preço estar MAIS ALTO daqui a 5 minutos:
//   - movimento de 1, 3, 5, 15, 30, 60 e 240 min (em ATR) do próprio ativo e dos outros dois;
//   - distância das médias 20/50/200, RSI, posição na faixa de 15/60/240 min, corpo e pavios das 3 últimas velas;
//   - volatilidade de agora x do último dia, sequência de cores, hora do dia e minuto da hora;
//   - humor dos traders (fração comprando) e a mudança dele em 5 min.
// Teste honesto: treina só com os primeiros 60% dos dias e mede nos 40% seguintes, que o modelo nunca viu
// (confirmação 60–80%, prova 80–100%). Conta as entradas sem sobreposição (uma a cada 5 min no máximo) e só
// no horário operável. Mostra o acerto em todas e só nas de maior confiança (10%, 5%, 2%).
// Controle: o mesmo treino com o resultado embaralhado (deve dar ~50%).
// BACKTEST_SOURCE=ia5; logs IA5_*.
const MIN = 60_000;
const PAIRS = ['EURUSD', 'EURJPY', 'XAUUSD'];
const OP_IDS = { EURUSD: 1861, EURJPY: 1864, XAUUSD: 1912 };
const H = 5;
const pct = (w, n) => (n ? +(100 * w / n).toFixed(1) : null);
const pausa = () => new Promise((r) => setImmediate(r));

function operavel(pair, t) {
    if (pair === 'XAUUSD') return true;
    const d = new Date(t - 3 * 3600_000), m = d.getUTCHours() * 60 + d.getUTCMinutes();
    return m >= 22 * 60 || m < 15 * 60 + 30;
}

async function carrega(pool) {
    const { prep } = require('./mineradorBacktest');
    const D = {};
    for (const pair of PAIRS) {
        const { rows } = await pool.query('SELECT time, open, high, low, close FROM otc_candles WHERE active = $1 ORDER BY time', [pair]);
        const m1 = rows.slice(0, -1).map((r) => ({ time: new Date(r.time).getTime(), open: +r.open, high: +r.high, low: +r.low, close: +r.close }));
        const P = prep(m1);
        // Média de 200.
        const e200 = []; let e = m1[0]?.close; for (const c of m1) { e = c.close * (2 / 201) + e * (199 / 201); e200.push(e); }
        const { rows: hum } = await pool.query(`SELECT at, valor FROM exnova_extras WHERE tipo = 'humor' AND active_id = $1 AND COALESCE(dados->>'instrument', '') <> 'binary-option' ORDER BY at`, [OP_IDS[pair]]);
        const hs = hum.map((h) => [new Date(h.at).getTime(), Number(h.valor) > 1 ? Number(h.valor) / 100 : Number(h.valor)]);
        D[pair] = { m1, ...P, e200, idx: new Map(m1.map((c, i) => [c.time, i])), hs };
    }
    return D;
}

function amostras(D) {
    const out = [];
    for (const pair of PAIRS) {
        const { m1, atr, e20, e50, rsi, e200, hs } = D[pair];
        let k = 0;
        const humor = (t) => { while (k + 1 < hs.length && hs[k + 1][0] <= t) k++; return hs.length && hs[k][0] <= t && t - hs[k][0] <= 2 * MIN ? hs[k][1] : NaN; };
        const humAnt = new Map();
        for (let i = 1440; i < m1.length - H; i++) {
            const x = m1[i], t = x.time, a = atr[i];
            if (m1[i + H].time !== t + H * MIN || t - m1[i - 240].time !== 240 * MIN) continue;
            const fim = m1[i + H].close;
            if (fim === x.close) continue;
            const mov = (n) => (x.close - m1[i - n].close) / a;
            const pos = (n) => { let hi = -Infinity, lo = Infinity; for (let j = i - n + 1; j <= i; j++) { hi = Math.max(hi, m1[j].high); lo = Math.min(lo, m1[j].low); } return (x.close - lo) / ((hi - lo) || 1e-12); };
            const vela = (j) => { const c = m1[j], r = (c.high - c.low) || 1e-12; return [(c.close - c.open) / a, (c.high - Math.max(c.open, c.close)) / r, (Math.min(c.open, c.close) - c.low) / r]; };
            let seq = 0; const s0 = Math.sign(x.close - x.open); for (let j = i; j > i - 10 && Math.sign(m1[j].close - m1[j].open) === s0 && s0; j--) seq += s0;
            let soma = 0; for (let j = i - 1440; j < i; j++) soma += atr[j];
            const outros = [];
            for (const o of PAIRS) {
                if (o === pair) continue;
                const Do = D[o], j = Do.idx.get(t);
                const ok = j != null && j >= 60;
                for (const n of [1, 5, 15, 60]) outros.push(ok && Do.m1[j - n] ? (Do.m1[j].close - Do.m1[j - n].close) / Do.atr[j] : NaN);
            }
            const hNow = humor(t + MIN);
            humAnt.set(t, hNow);
            const h5 = humAnt.get(t - 5 * MIN);
            const d = new Date(t + MIN);
            out.push({
                pair, t, up: fim > x.close ? 1 : 0, ok: operavel(pair, t + MIN),
                f: [
                    PAIRS.indexOf(pair),
                    mov(1), mov(3), mov(5), mov(15), mov(30), mov(60), mov(240),
                    (x.close - e20[i]) / a, (x.close - e50[i]) / a, (x.close - e200[i]) / a, rsi[i],
                    pos(15), pos(60), pos(240),
                    ...vela(i), ...vela(i - 1), ...vela(i - 2),
                    a / (soma / 1440), seq,
                    d.getUTCHours(), d.getUTCMinutes() % 15, d.getUTCMinutes(),
                    hNow, Number.isFinite(hNow) && Number.isFinite(h5) ? hNow - h5 : NaN,
                    ...outros,
                ],
            });
        }
    }
    return out.sort((p, q) => p.t - q.t);
}

// Gradient boosting com histogramas (32 faixas por informação), perda logística.
function binariza(X, nb = 32) {
    const nf = X[0].length, cortes = [];
    for (let f = 0; f < nf; f++) {
        const v = X.map((r) => r[f]).filter(Number.isFinite).sort((p, q) => p - q);
        const c = [];
        for (let b = 1; b < nb; b++) c.push(v[Math.floor(b * (v.length - 1) / nb)]);
        cortes.push([...new Set(c)]);
    }
    const bin = (f, x) => { if (!Number.isFinite(x)) return 0; const c = cortes[f]; let lo = 0, hi = c.length; while (lo < hi) { const m = (lo + hi) >> 1; if (x <= c[m]) hi = m; else lo = m + 1; } return lo + 1; };
    return { bin, nf };
}

async function treina(X, y, { arvores = 150, prof = 3, taxa = 0.08, minFolha = 200 } = {}) {
    const { bin, nf } = binariza(X);
    const B = X.map((r) => Uint8Array.from(r.map((v, f) => bin(f, v))));
    const n = y.length, F = new Float64Array(n), modelo = [];
    for (let k = 0; k < arvores; k++) {
        const g = new Float64Array(n), h = new Float64Array(n);
        for (let i = 0; i < n; i++) { const p = 1 / (1 + Math.exp(-F[i])); g[i] = p - y[i]; h[i] = Math.max(p * (1 - p), 1e-6); }
        const cresce = (ids, d) => {
            let G = 0, Hs = 0; for (const i of ids) { G += g[i]; Hs += h[i]; }
            const folha = { v: -G / (Hs + 1) * taxa };
            if (d >= prof || ids.length < 2 * minFolha) return folha;
            let melhor = null;
            for (let f = 0; f < nf; f++) {
                const gb = new Float64Array(34), hb = new Float64Array(34), cb = new Int32Array(34);
                for (const i of ids) { const b = B[i][f]; gb[b] += g[i]; hb[b] += h[i]; cb[b]++; }
                let gl = 0, hl = 0, cl = 0;
                for (let b = 0; b < 33; b++) {
                    gl += gb[b]; hl += hb[b]; cl += cb[b];
                    if (cl < minFolha || ids.length - cl < minFolha) continue;
                    const gr = G - gl, hr = Hs - hl, ganho = gl * gl / (hl + 1) + gr * gr / (hr + 1) - G * G / (Hs + 1);
                    if (!melhor || ganho > melhor.ganho) melhor = { ganho, f, b };
                }
            }
            if (!melhor || melhor.ganho <= 0) return folha;
            const esq = [], dir = [];
            for (const i of ids) (B[i][melhor.f] <= melhor.b ? esq : dir).push(i);
            return { f: melhor.f, b: melhor.b, e: cresce(esq, d + 1), d: cresce(dir, d + 1) };
        };
        const arv = cresce(Array.from({ length: n }, (_, i) => i), 0);
        const prev = (no, r) => (no.f == null ? no.v : prev(r[no.f] <= no.b ? no.e : no.d, r));
        for (let i = 0; i < n; i++) F[i] += prev(arv, B[i]);
        modelo.push(arv);
        await pausa(); // não trava o servidor (o robô continua rodando)
    }
    return (r) => { const b = Uint8Array.from(r.map((v, f) => bin(f, v))); let s = 0; for (const a of modelo) { let no = a; while (no.f != null) no = b[no.f] <= no.b ? no.e : no.d; s += no.v; } return 1 / (1 + Math.exp(-s)); };
}

// Acerto nas entradas sem sobreposição: por ativo, no máximo uma a cada 5 min, só acima do corte de confiança.
function mede(lista, corte) {
    const ultimo = {}; let n = 0, w = 0;
    for (const s of lista) {
        if (!s.ok || Math.abs(s.p - 0.5) < corte) continue;
        if (ultimo[s.pair] != null && s.t - ultimo[s.pair] < H * MIN) continue;
        ultimo[s.pair] = s.t; n++; if ((s.p > 0.5 ? 1 : 0) === s.up) w++;
    }
    return [n, pct(w, n)];
}

async function runIa5(pool) {
    const D = await carrega(pool);
    const S = amostras(D);
    console.log(`IA5_DADOS amostras=${S.length} de=${new Date(S[0].t).toISOString().slice(0, 10)} ate=${new Date(S.at(-1).t).toISOString().slice(0, 10)} subidas=${pct(S.filter((s) => s.up).length, S.length)}%`);
    const c1 = S[Math.floor(S.length * 0.6)].t, c2 = S[Math.floor(S.length * 0.8)].t;
    const treino = S.filter((s) => s.t < c1 - H * MIN), conf = S.filter((s) => s.t >= c1 && s.t < c2), prova = S.filter((s) => s.t >= c2);
    for (const [nome, embaralha] of [['IA', false], ['CONTROLE', true]]) {
        const y = treino.map((s) => s.up);
        if (embaralha) y.sort(() => Math.random() - 0.5);
        const modelo = await treina(treino.map((s) => s.f), y);
        for (const s of [...conf, ...prova]) s.p = modelo(s.f);
        // Cortes de confiança tirados da confirmação (para não escolher olhando a prova).
        const dist = conf.map((s) => Math.abs(s.p - 0.5)).sort((p, q) => q - p);
        const res = {};
        for (const topo of [1, 0.1, 0.05, 0.02]) {
            const corte = topo === 1 ? 0 : dist[Math.floor(dist.length * topo)];
            res[topo === 1 ? 'todas' : `top${topo * 100}%`] = { confirmacao: mede(conf, corte), prova: mede(prova, corte) };
            if (topo !== 1) for (const pair of PAIRS) res[`top${topo * 100}%_${pair}`] = { confirmacao: mede(conf.filter((s) => s.pair === pair), corte), prova: mede(prova.filter((s) => s.pair === pair), corte) };
        }
        console.log(`IA5_${nome} ${JSON.stringify(res)}`);
    }
}

module.exports = { runIa5 };
