// Estudos extras de 10/10 (pedido do dono: "tem mais opções para ver?"). Roda tudo de uma vez:
//   1. OTC com expirações de 5 e 15 min (otcEstudo.runOtc2, já com os alvos novos).
//   2. Pancada de notícia no mercado aberto: minuto com faixa ≥ 2 ou 3 ATR(M1) dentro dos horários de notícia
//      dos EUA (horarioNoticiaEUA) → contra ou a favor em 3, 5 e 15 min; o mesmo fora do horário, para comparar.
//   3. Divergência Exnova x mercado real (divergenciaBacktest, agora também com desvio ≥ 1,0 ATR).
// BACKTEST_SOURCE=extra; logs NOT_* (notícia), OTC_* e DIV_*.
const MIN = 60_000;
const pct = (w, n) => (n ? +(100 * w / n).toFixed(1) : null);

async function noticiaPico(pool) {
    const { horarioNoticiaEUA } = require('./marketRoutes');
    const atrSerie = (c) => { const o = []; let a = 0; for (let i = 0; i < c.length; i++) { const tr = i ? Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close)) : c[i].high - c[i].low; a = i ? (a * 13 + tr) / 14 : tr; o[i] = a || 1e-9; } return o; };
    for (const pair of ['EURUSD', 'EURJPY', 'XAUUSD']) {
        const { rows } = await pool.query('SELECT time, open, high, low, close FROM otc_candles WHERE active = $1 ORDER BY time', [pair]);
        const m1 = rows.slice(0, -1).map((r) => ({ time: new Date(r.time).getTime(), open: +r.open, high: +r.high, low: +r.low, close: +r.close }));
        const atr = atrSerie(m1), meio = m1[Math.floor(m1.length / 2)]?.time;
        const res = {};
        const add = (k, t, win) => { const o = (res[k] ||= [[0, 0], [0, 0]]); const h = o[t < meio ? 0 : 1]; h[0]++; if (win) h[1]++; };
        for (let i = 15; i < m1.length - 15; i++) {
            const x = m1[i], faixa = (x.high - x.low) / atr[i - 1];
            if (faixa < 2 || x.close === x.open) continue;
            const grupo = horarioNoticiaEUA(x.time) ? 'noticia' : 'fora';
            const s = Math.sign(x.close - x.open);
            for (const n of [3, 5, 15]) {
                const f = m1[i + n];
                if (!f || f.time !== x.time + n * MIN || f.close === x.close) continue;
                const voltou = Math.sign(f.close - x.close) === -s;
                for (const k of [2, 3]) if (faixa >= k) { add(`${grupo}_${k}atr_volta_${n}min`, x.time, voltou); add(`${grupo}_${k}atr_segue_${n}min`, x.time, !voltou); }
            }
        }
        // [casos, acerto %] na metade antiga e na nova
        console.log(`NOT_RESULT ${pair} ${JSON.stringify(Object.fromEntries(Object.entries(res).sort().map(([k, o]) => [k, { antiga: [o[0][0], pct(o[0][1], o[0][0])], nova: [o[1][0], pct(o[1][1], o[1][0])] }])))}`);
    }
}

async function runExtra(pool, deps) {
    try { await require('./otcEstudo').runOtc2(pool); } catch (err) { console.error('EXTRA_ERR OTC:', err.message); }
    try { await noticiaPico(pool); } catch (err) { console.error('EXTRA_ERR NOTICIA:', err.message); }
    try { await require('./divergenciaBacktest').runDivergencia(pool, deps); } catch (err) { console.error('EXTRA_ERR DIV:', err.message); }
}

module.exports = { runExtra };
