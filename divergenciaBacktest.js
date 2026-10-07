// Divergência Exnova x mercado real (pedido do dono em 07/10: "algo novo, candle por candle").
// A Exnova tem cotação própria. Ideia: quando ela "descola" do preço real (Twelve Data) no mesmo
// candle M5, o candle seguinte dela tende a voltar na direção do real? E quando as cores dos dois
// candles discordam, vale seguir o mercado real?
// O descolamento é medido sem o desvio fixo entre as duas fontes: diferença de fechamento menos a
// média dessa diferença nos 20 candles anteriores, dividida pelo ATR da Exnova.
// Testes (acerto no candle seguinte da Exnova, entrada na abertura dele):
//   volta_k     |desvio| ≥ k ATR → aposta na volta para o lado do preço real (k = 0,2 / 0,4 / 0,7)
//   segue_k     o contrário (a Exnova continua se afastando)
//   cor_real    as cores dos candles discordam (corpos ≥ 0,2 ATR) → segue a cor do mercado real
//   movimento_real  o mercado real andou ≥ 0,5 ATR a mais que a Exnova no candle → segue o real
// Metade antiga / metade nova do período, para ver se repete. BACKTEST_SOURCE=divergencia; logs DIV_*.

function agrega(m1, min) {
    const tf = min * 60_000, out = [];
    for (const c of m1) {
        const b = Math.floor(c.time / tf) * tf, last = out[out.length - 1];
        if (last && last.time === b) { last.high = Math.max(last.high, c.high); last.low = Math.min(last.low, c.low); last.close = c.close; last.n++; }
        else out.push({ time: b, open: c.open, high: c.high, low: c.low, close: c.close, n: 1 });
    }
    return out.filter((c) => c.n === min);
}

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

const acc = (l) => (l.length ? [l.length, +(100 * l.filter(Boolean).length / l.length).toFixed(1)] : [0, null]);

async function runDivergencia(pool, deps) {
    const TF = 300_000;
    for (const pair of ['EURUSD', 'EURJPY', 'XAUUSD']) {
        const { rows } = await pool.query('SELECT time, open, high, low, close FROM otc_candles WHERE active = $1 ORDER BY time', [pair]);
        const ex = agrega(rows.slice(0, -1).map((r) => ({ time: new Date(r.time).getTime(), open: +r.open, high: +r.high, low: +r.low, close: +r.close })), 5);
        let td = [];
        try { td = await deps.fetchLongHistory(pair, 'M5', 2); } catch (err) { console.error(`DIV_ERR TD ${pair}:`, err.message); }
        const tdMap = new Map(td.map((x) => [x.time, x]));
        const atr = atrSerie(ex);
        const diffs = ex.map((x) => { const r = tdMap.get(x.time); return r ? x.close - r.close : null; });
        const amostras = [];
        for (let i = 21; i < ex.length - 1; i++) {
            const x = ex[i], r = tdMap.get(x.time), nx = ex[i + 1];
            if (!r || nx.time !== x.time + TF || nx.close === nx.open || !deps.isMarketOpen(new Date(nx.time))) continue;
            const prev = diffs.slice(i - 20, i).filter((v) => v != null);
            if (prev.length < 15) continue;
            const media = prev.reduce((s, v) => s + v, 0) / prev.length;
            const desvio = (diffs[i] - media) / atr[i]; // > 0: Exnova acima do real
            const sobe = nx.close > nx.open;
            const corpoEx = (x.close - x.open) / atr[i], corpoReal = (r.close - r.open) / atr[i];
            amostras.push({ t: x.time, desvio, sobe, corpoEx, corpoReal });
        }
        if (!amostras.length) { console.log(`DIV_RESULT ${pair} sem dados em comum (exnova=${ex.length} real=${td.length})`); continue; }
        const corte = amostras[Math.floor(amostras.length / 2)].t;
        const testes = {};
        const add = (nome, s, previsto) => {
            const ok = previsto === s.sobe;
            ((testes[nome] ||= { a: [], b: [] })[s.t < corte ? 'a' : 'b']).push(ok);
        };
        for (const s of amostras) {
            for (const k of [0.2, 0.4, 0.7]) {
                if (Math.abs(s.desvio) >= k) { add(`volta_${k}`, s, s.desvio < 0); add(`segue_${k}`, s, s.desvio > 0); }
            }
            if (Math.abs(s.corpoEx) >= 0.2 && Math.abs(s.corpoReal) >= 0.2 && Math.sign(s.corpoEx) !== Math.sign(s.corpoReal)) add('cor_real', s, s.corpoReal > 0);
            if (Math.abs(s.corpoReal - s.corpoEx) >= 0.5) add('movimento_real', s, s.corpoReal - s.corpoEx > 0);
        }
        // [casos, acerto %] na metade antiga e na metade nova.
        const out = Object.fromEntries(Object.entries(testes).map(([n, v]) => [n, { antiga: acc(v.a), nova: acc(v.b), total: acc([...v.a, ...v.b]) }]));
        console.log(`DIV_RESULT ${pair} candles_comuns=${amostras.length} de=${new Date(amostras[0].t).toISOString().slice(0, 16)} ${JSON.stringify(out)}`);
    }
}

module.exports = { runDivergencia };
