// Filtro de notícia: o acerto (e o tamanho do erro) muda perto de notícias fortes? Usa o Score M5
// (pesos aprendidos nos primeiros 60% do histórico, acerto medido nos 40% finais) e separa cada
// candle em três grupos:
//   noticia  até 15 min antes e 30 min depois de um evento de impacto alto do calendário (economic_events)
//   horario  horários fixos de divulgação dos EUA (12:25–13:00, 13:55–14:30 e 17:55–18:30 UTC, dias úteis)
//   normal   o resto
// Roda com RUN_BACKTEST=1 e BACKTEST_SOURCE=noticia; o resultado vai para os logs (NOTICIA_*).
const { samples, trainLogistic, predict } = require('./scoreBacktest');

const CUR = { EURUSD: ['USD', 'EUR', 'US', 'EU', 'EMU', 'DE'], EURJPY: ['EUR', 'JPY', 'EU', 'EMU', 'DE', 'JP'], XAUUSD: ['USD', 'US'] };

function inSlot(ms) {
    const d = new Date(ms), wd = d.getUTCDay(), m = d.getUTCHours() * 60 + d.getUTCMinutes();
    if (wd === 0 || wd === 6) return false;
    return (m >= 745 && m < 780) || (m >= 835 && m < 870) || (m >= 1075 && m < 1110);
}

function acc(list) {
    const n = list.length, w = list.filter(Boolean).length;
    return n ? [n, +(w / n * 100).toFixed(1), +(196 * Math.sqrt((w / n) * (1 - w / n) / n)).toFixed(1)] : [0, null, null];
}

async function runNoticia(pool, deps) {
    let events = [];
    try {
        const { rows } = await pool.query(`SELECT event_name, country, impact, event_time FROM economic_events
            WHERE event_time > NOW() - INTERVAL '120 days' AND event_time < NOW()`);
        const impacts = {};
        for (const r of rows) impacts[r.impact] = (impacts[r.impact] || 0) + 1;
        events = rows.filter((r) => /high|alto|3/i.test(String(r.impact)));
        console.log(`NOTICIA_EVENTOS total=${rows.length} impactos=${JSON.stringify(impacts)} altos=${events.length} exemplo=${JSON.stringify(events.slice(0, 3).map((e) => [e.event_name, e.country, new Date(e.event_time).toISOString()]))}`);
    } catch (err) {
        console.error('NOTICIA_EVENTOS erro:', err.message);
    }
    for (const pair of ['EURUSD', 'EURJPY', 'XAUUSD']) {
        const c = (await deps.fetchLongHistory(pair, 'M5', 4)).filter((x) => deps.isMarketOpen(new Date(x.time)));
        const evTimes = events.filter((e) => CUR[pair].includes(String(e.country).toUpperCase())).map((e) => new Date(e.event_time).getTime());
        const nearNews = (t) => evTimes.some((et) => t >= et - 15 * 60_000 && t <= et + 30 * 60_000);
        const rows = samples(c, 300_000, null);
        const byTime = new Map(c.map((x, i) => [x.time, i]));
        const cut = Math.floor(rows.length * 0.6);
        const w = trainLogistic(rows.slice(0, cut).map((r) => r.x), rows.slice(0, cut).map((r) => r.y));
        const test = rows.slice(cut).map((r) => {
            const p = predict(w, r.x), i = byTime.get(r.t), nx = c[i + 1];
            // Tamanho do candle alvo em relação à média dos 20 anteriores (erro "grande" = candle grande).
            let avg = 0; for (let k = i - 19; k <= i; k++) avg += Math.abs(c[k].close - c[k].open); avg /= 20;
            const tTarget = nx.time;
            const grupo = nearNews(tTarget) ? 'noticia' : inSlot(tTarget) ? 'horario' : 'normal';
            return { p, conf: Math.abs(p - 0.5), ok: (p > 0.5 ? 1 : 0) === r.y, tam: Math.abs(nx.close - nx.open) / (avg || 1e-9), grupo };
        });
        const thr = [...test].sort((a, b) => b.conf - a.conf)[Math.floor(test.length * 0.25)]?.conf ?? 0;
        const rep = {};
        for (const g of ['normal', 'horario', 'noticia']) {
            const list = test.filter((x) => x.grupo === g);
            const top = list.filter((x) => x.conf >= thr);
            const erros = list.filter((x) => !x.ok);
            rep[g] = {
                todos: acc(list.map((x) => x.ok)),
                top25: acc(top.map((x) => x.ok)),
                tamanho_medio_candle: list.length ? +(list.reduce((s, x) => s + x.tam, 0) / list.length).toFixed(2) : null,
                tamanho_medio_erro: erros.length ? +(erros.reduce((s, x) => s + x.tam, 0) / erros.length).toFixed(2) : null,
            };
        }
        // Cada acerto: [amostras, acerto %, margem ±%]; tamanho em múltiplos do candle médio.
        console.log(`NOTICIA_RESULT ${pair} M5 teste=${test.length} de=${new Date(rows[cut].t).toISOString()} ${JSON.stringify(rep)}`);
    }
    if (deps.computeM1Signal) await runNoticiaM1(pool, deps, events);
}

// M1: (1) os sinais reais que os clientes pediram (tabela analyses), por grupo de horário;
// (2) o sinal de produção refeito nos candles M1 reais da Exnova (otc_candles), por grupo.
async function runNoticiaM1(pool, deps, events) {
    const grupoDe = (pair, t) => {
        const ev = events.filter((e) => CUR[pair]?.includes(String(e.country).toUpperCase())).map((e) => new Date(e.event_time).getTime());
        return ev.some((et) => t >= et - 15 * 60_000 && t <= et + 30 * 60_000) ? 'noticia' : inSlot(t) ? 'horario' : 'normal';
    };
    try {
        const { rows } = await pool.query(`SELECT pair, timeframe, entry_time, result FROM analyses WHERE result IN ('win', 'loss')`);
        const rep = {};
        for (const r of rows) {
            const pair = String(r.pair).replace('/', '');
            const k = `${r.timeframe} ${grupoDe(pair, new Date(r.entry_time).getTime())}`;
            (rep[k] ||= []).push(r.result === 'win');
        }
        console.log(`NOTICIA_SINAIS_REAIS ${JSON.stringify(Object.fromEntries(Object.entries(rep).map(([k, l]) => [k, acc(l)])))}`);
    } catch (err) {
        console.error('NOTICIA_SINAIS_REAIS erro:', err.message);
    }
    for (const pair of ['EURUSD', 'EURJPY', 'XAUUSD']) {
        const { rows } = await pool.query('SELECT time, open, high, low, close FROM otc_candles WHERE active = $1 ORDER BY time', [pair]);
        const c = rows.slice(0, -1).map((r) => ({ time: new Date(r.time).getTime(), open: +r.open, high: +r.high, low: +r.low, close: +r.close }));
        const rep = {};
        for (let i = 100; i < c.length - 1; i++) {
            const nx = c[i + 1];
            if (nx.time - c[i].time !== 60_000 || c[i].time - c[i - 99].time !== 99 * 60_000 || nx.close === nx.open) continue;
            if (!deps.isMarketOpen(new Date(nx.time))) continue;
            const closed = c.slice(i - 99, i);
            let d = null;
            try { d = deps.computeM1Signal(closed, c[i], deps.computeTechnicalSignal(closed, c[i])).direction; } catch { d = null; }
            if (d !== 'COMPRA' && d !== 'VENDA') continue;
            let avg = 0; for (let k = i - 19; k <= i; k++) avg += Math.abs(c[k].close - c[k].open); avg /= 20;
            const g = grupoDe(pair, nx.time), ok = (d === 'COMPRA') === (nx.close > nx.open);
            const b = (rep[g] ||= { l: [], tamErro: [] });
            b.l.push(ok);
            if (!ok) b.tamErro.push(Math.abs(nx.close - nx.open) / (avg || 1e-9));
        }
        const out = Object.fromEntries(Object.entries(rep).map(([g, b]) => [g, { acerto: acc(b.l), tamanho_medio_erro: b.tamErro.length ? +(b.tamErro.reduce((s, x) => s + x, 0) / b.tamErro.length).toFixed(2) : null }]));
        console.log(`NOTICIA_M1_EXNOVA ${pair} candles=${c.length} de=${c[0] && new Date(c[0].time).toISOString()} ${JSON.stringify(out)}`);
    }
}

module.exports = { runNoticia, runNoticiaM1 };
