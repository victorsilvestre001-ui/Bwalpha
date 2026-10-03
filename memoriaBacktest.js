// "Memória do mercado": procura no passado os momentos mais parecidos com o de agora e olha o que
// o candle seguinte fez neles (vizinhos mais próximos). O desenho de cada momento junta os últimos
// candles do próprio ativo e o que os outros dois ativos fizeram ao mesmo tempo (EUR em comum no
// EURUSD/EURJPY, dólar no Ouro). Teste honesto: cada momento só procura no que veio antes dele,
// e o acerto é medido nos 40% finais. Roda com RUN_BACKTEST=1 e BACKTEST_SOURCE=memoria.

const PAIRS = ['EURUSD', 'EURJPY', 'XAUUSD'];
const LOOK = 8; // candles do desenho

function atrSeries(c, p = 14) {
    const out = new Array(c.length); let a = c[0].high - c[0].low;
    for (let i = 0; i < c.length; i++) {
        const tr = i ? Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close)) : c[i].high - c[i].low;
        a = i ? (a * (p - 1) + tr) / p : tr; out[i] = a || 1e-9;
    }
    return out;
}

// Desenho do momento i: retornos, corpos e pavios dos últimos LOOK candles em unidades de ATR.
function shape(c, atr, i) {
    const v = [], a = atr[i];
    for (let k = i - LOOK + 1; k <= i; k++) {
        const x = c[k];
        v.push((x.close - c[k - 1].close) / a, (x.high - Math.max(x.open, x.close)) / a, (Math.min(x.open, x.close) - x.low) / a);
    }
    return v.map((z) => Math.max(-4, Math.min(4, z)));
}

// Os outros ativos: retorno dos últimos 1 e 3 candles em ATR de cada um.
function cross(c, atr, i) {
    return [(c[i].close - c[i - 1].close) / atr[i], (c[i].close - c[i - 3].close) / atr[i]].map((z) => Math.max(-4, Math.min(4, z)));
}

function acc(list) {
    const n = list.length, w = list.filter(Boolean).length;
    return n ? [n, +(w / n * 100).toFixed(1), +(196 * Math.sqrt((w / n) * (1 - w / n) / n)).toFixed(1)] : [0, null, null];
}

// series: { EURUSD: candles[], ... } com os mesmos horários; tfMs para checar continuidade.
async function study(label, series, tfMs, { K = 50, crossWeight = 1 } = {}) {
    const times = series[PAIRS[0]].map((x) => x.time).filter((t) => PAIRS.every((p) => series[p].byTime.has(t)));
    const al = Object.fromEntries(PAIRS.map((p) => [p, times.map((t) => series[p].byTime.get(t))]));
    const atr = Object.fromEntries(PAIRS.map((p) => [p, atrSeries(al[p])]));
    for (const target of PAIRS) {
        const others = PAIRS.filter((p) => p !== target);
        const rows = [];
        for (let i = LOOK + 15; i < times.length - 1; i++) {
            if (times[i + 1] - times[i] !== tfMs || times[i] - times[i - LOOK - 3] !== (LOOK + 3) * tfMs) continue;
            const nx = al[target][i + 1];
            if (nx.close === nx.open) continue;
            const own = shape(al[target], atr[target], i);
            const cr = others.flatMap((p) => cross(al[p], atr[p], i)).map((z) => z * crossWeight);
            rows.push({ own, cr, y: nx.close > nx.open ? 1 : 0, t: times[i] });
        }
        if (rows.length < 1500) { console.log(`MEMORIA_SKIP ${label} ${target} amostras=${rows.length}`); continue; }
        const start = Math.floor(rows.length * 0.6);
        const out = { so_ativo: [], com_outros: [] };
        for (let j = start; j < rows.length; j++) {
            // Devolve a vez ao servidor a cada momento testado (não trava os pedidos dos clientes).
            if (j % 5 === 0) await new Promise((r) => setImmediate(r));
            const q = rows[j];
            for (const mode of Object.keys(out)) {
                // Distância para todos os momentos anteriores (só o passado).
                const d = new Float64Array(j);
                for (let h = 0; h < j; h++) {
                    const r = rows[h]; let s = 0;
                    for (let m = 0; m < q.own.length; m++) { const e = q.own[m] - r.own[m]; s += e * e; }
                    if (mode === 'com_outros') for (let m = 0; m < q.cr.length; m++) { const e = q.cr[m] - r.cr[m]; s += e * e; }
                    d[h] = s;
                }
                // Os K mais próximos sem ordenar tudo (lista curta ordenada).
                const idx = [];
                for (let h = 0; h < j; h++) {
                    if (idx.length === K && d[h] >= d[idx[K - 1]]) continue;
                    let pos = idx.length < K ? idx.length : K - 1;
                    while (pos > 0 && d[idx[pos - 1]] > d[h]) pos--;
                    idx.splice(pos, 0, h);
                    if (idx.length > K) idx.pop();
                }
                const up = idx.reduce((s, h) => s + rows[h].y, 0) / K;
                out[mode].push({ up, conf: Math.abs(up - 0.5), y: q.y });
            }
        }
        const rep = {};
        for (const [mode, list] of Object.entries(out)) {
            const sorted = [...list].sort((a, b) => b.conf - a.conf), r = {};
            for (const pct of [100, 50, 25, 10]) {
                const top = sorted.slice(0, Math.max(1, Math.floor(sorted.length * pct / 100)));
                r[`top${pct}`] = acc(top.map((x) => (x.up > 0.5 ? 1 : 0) === x.y));
            }
            // Estabilidade do top 25% em cada metade do teste.
            const thr = sorted[Math.floor(sorted.length * 0.25)]?.conf ?? 0, half = Math.floor(list.length / 2);
            r.estab_top25 = [list.slice(0, half), list.slice(half)].map((part) => acc(part.filter((x) => x.conf >= thr).map((x) => (x.up > 0.5 ? 1 : 0) === x.y))[1]);
            rep[mode] = r;
        }
        console.log(`MEMORIA_RESULT ${label} ${target} amostras=${rows.length} teste=${rows.length - start} de=${new Date(rows[start].t).toISOString()} K=${K} ${JSON.stringify(rep)}`);
    }
}

async function runMemoria(deps) {
    const tfs = (process.env.MEMORIA_TF || 'M5').split(',');
    for (const tf of tfs) {
        const series = {};
        for (const p of PAIRS) {
            const c = await deps.fetchLongHistory(p, tf, parseInt(process.env.MEMORIA_PAGES, 10) || 2);
            const open = c.filter((x) => deps.isMarketOpen(new Date(x.time)));
            open.byTime = new Map(open.map((x) => [x.time, x]));
            series[p] = open;
            console.log(`MEMORIA_DADOS ${p} ${tf} candles=${open.length} de=${open[0] && new Date(open[0].time).toISOString()}`);
        }
        const ms = (tf === 'M1' ? 1 : 5) * 60_000;
        for (const K of [30, 100]) {
            try { await study(`${tf}`, series, ms, { K }); } catch (err) { console.error(`MEMORIA_ERR ${tf}:`, err.message); }
        }
    }
}

module.exports = { runMemoria, study };
