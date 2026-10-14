// Diagnóstico da seta do bwalpha (14/10): imprime as velas M5 da Exnova de uma janela (VELAS_DE / VELAS_ATE em ISO)
// com as leituras do script do dono em cada vela, para comparar com os prints dele e achar a regra da seta.
// BACKTEST_SOURCE=velas; logs VELAS_*.
async function runVelas(pool) {
    const { getBwalphaIndicator, getChinesaStrategySignal } = require('./marketRoutes');
    const de = Date.parse(process.env.VELAS_DE || '2026-10-13T23:30:00Z'), ate = Date.parse(process.env.VELAS_ATE || '2026-10-14T01:30:00Z');
    for (const pair of ['XAUUSD', 'EURJPY']) {
        const { rows } = await pool.query('SELECT time, open, high, low, close FROM otc_candles WHERE active = $1 AND time >= $2 AND time < $3 ORDER BY time',
            [pair, new Date(de - 200 * 300_000), new Date(ate)]);
        const out = [];
        for (const r of rows) {
            const t = new Date(r.time).getTime(), b = Math.floor(t / 300_000) * 300_000, l = out[out.length - 1];
            if (l && l.time === b) { l.high = Math.max(l.high, +r.high); l.low = Math.min(l.low, +r.low); l.close = +r.close; l.n++; }
            else out.push({ time: b, open: +r.open, high: +r.high, low: +r.low, close: +r.close, n: 1 });
        }
        for (let k = 100; k < out.length; k++) {
            const c = out[k];
            if (c.time < de) continue;
            const fechados = out.slice(Math.max(0, k - 120), k);
            const bw = getBwalphaIndicator(fechados, { time: c.time, open: c.open }, getChinesaStrategySignal(fechados, 5), { maFast: 10, maSlow: 40, signalPeriod: 34, periodoSR: 15 });
            const cin = (m) => getChinesaStrategySignal(fechados, m)?.direction || '-';
            const cores = fechados.slice(-5).map((x) => (x.close > x.open ? 'V' : x.close < x.open ? 'R' : 'D')).join('');
            const hora = new Date(c.time - 3 * 3600_000).toISOString().slice(11, 16);
            console.log(`VELAS ${pair} ${hora} o=${c.open} c=${c.close} cor=${c.close > c.open ? 'V' : 'R'} n=${c.n} | ant5=${cores} var5=${(fechados.at(-1).close - fechados.at(-5).close).toFixed(3)} pad5_min1=${cin(1)} min2=${cin(2)} min3=${cin(3)} min5=${cin(5)} | cruz=${bw.cruzamento || '-'} b1=${bw.buffer1?.toFixed(4)} b2=${bw.buffer2?.toFixed(4)} alerta=${bw.alerta || '-'}`);
        }
    }
}
module.exports = { runVelas };
