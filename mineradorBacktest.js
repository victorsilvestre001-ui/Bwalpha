// Minerador de padrões (pedido do dono em 06/10: "olhar candle por candle e achar algo de 60%").
// Descreve cada candle fechado com características simples (cor, corpo, pavios, onde fechou, cores
// anteriores, distância da média, RSI, tendência, horário, minuto, dia, ativo) e testa todas as
// combinações de 2 e 3 características como regra para a cor do candle seguinte.
//
// Para não confundir sorte com padrão:
//   - o histórico é dividido no tempo em estudo (50%), confirmação (25%) e prova (25%);
//   - a regra precisa de ≥ 60% no estudo (n ≥ 60) e ≥ 58% na confirmação (n ≥ 30), na mesma direção;
//   - a mesma busca roda de novo com os resultados embaralhados (controle): o número de regras que
//     "passam" no controle mostra quantas passariam por puro acaso.
// Roda com RUN_BACKTEST=1 e BACKTEST_SOURCE=minerador; resultado nos logs (MIN_*).

function prep(c) {
    const n = c.length, atr = new Array(n), e20 = new Array(n), e50 = new Array(n), rsi = new Array(n);
    let a = 0, x20 = c[0].close, x50 = c[0].close, ag = 0, al = 0;
    for (let i = 0; i < n; i++) {
        const tr = i ? Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close)) : c[i].high - c[i].low;
        a = i ? (a * 13 + tr) / 14 : tr; atr[i] = a || 1e-9;
        x20 = i ? c[i].close * (2 / 21) + x20 * (19 / 21) : x20; e20[i] = x20;
        x50 = i ? c[i].close * (2 / 51) + x50 * (49 / 51) : x50; e50[i] = x50;
        const d = i ? c[i].close - c[i - 1].close : 0;
        ag = (ag * 13 + Math.max(d, 0)) / 14; al = (al * 13 + Math.max(-d, 0)) / 14;
        rsi[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    }
    return { atr, e20, e50, rsi };
}

const cor = (x) => (x.close > x.open ? 'V' : x.close < x.open ? 'R' : 'D');
const faixa = (v, cortes, nomes) => { for (let k = 0; k < cortes.length; k++) if (v < cortes[k]) return nomes[k]; return nomes[nomes.length - 1]; };

// Características do candle i (já fechado). Todas usam só o passado.
function descreve(c, i, P, pair, tfMs) {
    const x = c[i], r = (x.high - x.low) || 1e-12, b = x.close - x.open;
    const up = x.high - Math.max(x.open, x.close), lo = Math.min(x.open, x.close) - x.low;
    let s = 0, q = 0; for (let k = i - 19; k <= i; k++) { s += c[k].close; q += c[k].close * c[k].close; }
    const m = s / 20, sd = Math.sqrt(Math.max(q / 20 - m * m, 1e-18)) || 1e-9, z = (x.close - m) / sd;
    let seq = 1; for (let k = i - 1; k > i - 8 && cor(c[k]) === cor(x) && cor(x) !== 'D'; k--) seq++;
    const d = new Date(c[i + 1].time);
    return {
        ativo: pair,
        cor: cor(x),
        cores3: cor(c[i - 2]) + cor(c[i - 1]) + cor(x),
        corpo: faixa(Math.abs(b) / P.atr[i], [0.2, 0.6, 1.2], ['mini', 'pequeno', 'medio', 'grande']),
        pavio_cima: faixa(up / r, [0.01, 0.2, 0.5], ['zero', 'curto', 'medio', 'longo']),
        pavio_baixo: faixa(lo / r, [0.01, 0.2, 0.5], ['zero', 'curto', 'medio', 'longo']),
        fechou: faixa((x.close - x.low) / r, [0.2, 0.8], ['embaixo', 'meio', 'em_cima']),
        sequencia: seq >= 4 ? '4+' : String(seq),
        z_media: faixa(z, [-2, -1, 1, 2], ['-2', '-1', '0', '+1', '+2']),
        rsi: faixa(P.rsi[i], [25, 40, 60, 75], ['<25', '25-40', '40-60', '60-75', '>75']),
        tendencia: P.e20[i] > P.e50[i] ? 'alta' : 'baixa',
        hora: String(d.getUTCHours()),
        minuto: tfMs === 60_000 ? String(d.getUTCMinutes() % 5) : String(d.getUTCMinutes() % 15),
        dia: String(d.getUTCDay()),
        vs_anterior: x.close > c[i - 1].high ? 'acima_max' : x.close < c[i - 1].low ? 'abaixo_min' : 'dentro',
    };
}

function amostras(c, pair, tfMs, isOpen) {
    const P = prep(c), out = [];
    for (let i = 60; i < c.length - 1; i++) {
        if (c[i + 1].time - c[i].time !== tfMs || c[i].time - c[i - 20].time !== 20 * tfMs) continue;
        if (isOpen && !isOpen(new Date(c[i + 1].time))) continue;
        if (c[i + 1].close === c[i + 1].open) continue;
        out.push({ t: c[i].time, f: descreve(c, i, P, pair, tfMs), y: c[i + 1].close > c[i + 1].open ? 1 : 0 });
    }
    return out;
}

function combos(keys, k) {
    const out = [];
    const rec = (start, cur) => { if (cur.length === k) return out.push(cur.slice()); for (let j = start; j < keys.length; j++) { cur.push(keys[j]); rec(j + 1, cur); cur.pop(); } };
    rec(0, []);
    return out;
}

async function busca(S, ys) {
    const keys = Object.keys(S[0].f), grupos = [...combos(keys, 2), ...combos(keys, 3)];
    const ts = S.map((s) => s.t).sort((a, b) => a - b);
    const c1 = ts[Math.floor(ts.length * 0.5)], c2 = ts[Math.floor(ts.length * 0.75)];
    const tab = new Map(); // regra → [n,up] por trecho
    for (let idx = 0; idx < S.length; idx++) {
        // Devolve a vez ao servidor de tempos em tempos (o site e o robô continuam respondendo).
        if (idx % 500 === 0) await new Promise((r) => setImmediate(r));
        const s = S[idx];
        const parte = s.t < c1 ? 0 : s.t < c2 ? 1 : 2, y = ys[idx];
        for (const g of grupos) {
            const chave = g.map((k) => `${k}=${s.f[k]}`).join(' & ');
            let v = tab.get(chave);
            if (!v) tab.set(chave, (v = [0, 0, 0, 0, 0, 0]));
            v[parte * 2]++; v[parte * 2 + 1] += y;
        }
    }
    const passam = [];
    for (const [regra, v] of tab) {
        const [n0, u0, n1, u1, n2, u2] = v;
        if (n0 < 60 || n1 < 30) continue;
        const p0 = u0 / n0, p1 = u1 / n1;
        const dir = p0 >= 0.6 ? 1 : p0 <= 0.4 ? 0 : null;
        if (dir == null) continue;
        const a1 = dir ? p1 : 1 - p1;
        if (a1 < 0.58) continue;
        passam.push({
            regra, entrada: dir ? 'COMPRA' : 'VENDA',
            estudo: [n0, +((dir ? p0 : 1 - p0) * 100).toFixed(1)],
            confirmacao: [n1, +(a1 * 100).toFixed(1)],
            prova: [n2, n2 ? +(((dir ? u2 / n2 : 1 - u2 / n2)) * 100).toFixed(1) : null],
        });
    }
    return { regras: tab.size, passam, corte: [c1, c2] };
}

function embaralha(ys) {
    const a = ys.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
}

async function relatorio(nome, S) {
    if (S.length < 2000) return console.log(`MIN_RESULT ${nome} poucos dados (${S.length})`);
    const real = await busca(S, S.map((s) => s.y));
    const ctrl = await busca(S, embaralha(S.map((s) => s.y)));
    const provaOk = real.passam.filter((r) => r.prova[0] >= 20 && r.prova[1] >= 58);
    const provaOkCtrl = ctrl.passam.filter((r) => r.prova[0] >= 20 && r.prova[1] >= 58);
    console.log(`MIN_RESUMO ${nome} amostras=${S.length} regras_testadas=${real.regras} passam_estudo_e_confirmacao=${real.passam.length} (controle embaralhado: ${ctrl.passam.length}) passam_tambem_na_prova=${provaOk.length} (controle: ${provaOkCtrl.length}) cortes=${real.corte.map((t) => new Date(t).toISOString().slice(0, 16)).join(',')}`);
    const top = real.passam.sort((a, b) => (b.prova[1] ?? 0) - (a.prova[1] ?? 0)).slice(0, 25);
    for (const r of top) console.log(`MIN_REGRA ${nome} ${JSON.stringify(r)}`);
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

async function runMinerador(pool, deps) {
    const PAIRS = ['EURUSD', 'EURJPY', 'XAUUSD'];
    const exM1 = [], exM5 = [], tdM5 = [];
    for (const pair of PAIRS) {
        const { rows } = await pool.query('SELECT time, open, high, low, close FROM otc_candles WHERE active = $1 ORDER BY time', [pair]);
        const m1 = rows.slice(0, -1).map((r) => ({ time: new Date(r.time).getTime(), open: +r.open, high: +r.high, low: +r.low, close: +r.close }));
        exM1.push(...amostras(m1, pair, 60_000, deps.isMarketOpen));
        exM5.push(...amostras(agrega(m1, 5), pair, 300_000, deps.isMarketOpen));
        if (process.env.MIN_TD !== '0') {
            try {
                const td = (await deps.fetchLongHistory(pair, 'M5', parseInt(process.env.PA_TD_PAGES, 10) || 4)).filter((x) => deps.isMarketOpen(new Date(x.time)));
                tdM5.push(...amostras(td, pair, 300_000, null));
            } catch (err) { console.error(`MIN_ERR TD ${pair}:`, err.message); }
        }
    }
    await relatorio('exnova_M1', exM1);
    await relatorio('exnova_M5', exM5);
    await relatorio('mercado_real_M5', tdM5);
}

module.exports = { runMinerador, amostras, busca, descreve };
