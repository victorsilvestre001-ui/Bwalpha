// Teste do indicador "bwalpha" do dono (script Lua da IQ Option) com a configuração da tela dele (13/10):
//   Ma Fast 10 · Ma Value open · Ma Slow 40 · Signal 34 · padrão dos 5 candles como sinal principal (mínimo 5 a favor)
//   · sensibilidade das bandas/estocástico pela volatilidade · Suporte/Resistência 15 candles.
// Cada sinal entra no candle seguinte (o cruzamento usa a abertura do candle, que já é conhecida quando ele abre)
// e expira no fim dele; com gale, entra de novo na mesma direção nos candles seguintes (valores 1 / 2,2 / 4,84;
// payout 84%). Candles M1 e M5 da Exnova; só horário operável (EUR até 15h30 de Brasília).
// Mostra cada parte separada (padrão de 5, cruzamento, alerta) e o "sinal principal" (padrão de 5 e, sem ele,
// cruzamento ou alerta), em 3 fases cronológicas, com o lucro do ciclo; controle: direção sorteada.
// BACKTEST_SOURCE=bwalpha; logs BW_*.
const MIN = 60_000;
const PAY = 0.84, V = [1, 2.2, 4.84];
const pct = (w, n) => (n ? +(100 * w / n).toFixed(1) : null);
const brt = (t) => { const d = new Date(t - 3 * 3600_000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const operavel = (pair, t) => pair === 'XAUUSD' || (brt(t) >= 22 * 60 || brt(t) < 15 * 60 + 30);
const OPTS = { maFast: 10, maSlow: 40, signalPeriod: 34, periodoSR: 15 };
const MIN_A_FAVOR = 5;

function ciclo(rs, gales) {
    let gasto = 0;
    for (let k = 0; k <= gales; k++) {
        if (!rs[k]) return [false, -gasto];
        if (rs[k] > 0) return [true, V[k] * PAY - gasto];
        gasto += V[k];
    }
    return [false, -gasto];
}
function resumo(l) {
    const ts = l.map((x) => x.t).sort((a, b) => a - b), q1 = ts[Math.floor(ts.length * 0.4)], q2 = ts[Math.floor(ts.length * 0.7)];
    const fase = (x) => (x.t < q1 ? 0 : x.t < q2 ? 1 : 2);
    return Object.fromEntries([0, 1, 2].map((g) => {
        const rs = l.map((x) => ({ f: fase(x), c: ciclo(x.rs, g) }));
        const w = rs.filter((x) => x.c[0]).length, lucro = rs.reduce((a, x) => a + x.c[1], 0);
        const fases = [0, 1, 2].map((f) => { const a = rs.filter((x) => x.f === f); return [a.length, pct(a.filter((x) => x.c[0]).length, a.length), +a.reduce((s, x) => s + x.c[1], 0).toFixed(1)]; });
        return [g === 0 ? 'sem_gale' : `gale${g}`, { acerto: pct(w, rs.length), lucro_unidades: +lucro.toFixed(1), red_completo: rs.length - w, fases_casos_acerto_lucro: fases }];
    }));
}

async function runBwalpha(pool) {
    const { getBwalphaIndicator, getChinesaStrategySignal } = require('./marketRoutes');
    const sinais = {}; // nome -> [{t, rs}]
    for (const pair of ['EURUSD', 'EURJPY', 'XAUUSD']) {
        const { rows } = await pool.query('SELECT time, open, high, low, close FROM otc_candles WHERE active = $1 ORDER BY time', [pair]);
        const m1 = rows.slice(0, -1).map((r) => ({ time: new Date(r.time).getTime(), open: +r.open, high: +r.high, low: +r.low, close: +r.close }));
        for (const [tf, tfMs] of [['M1', MIN], ['M5', 5 * MIN]]) {
            let c = m1;
            if (tfMs > MIN) {
                const out = [];
                for (const x of m1) {
                    const b = Math.floor(x.time / tfMs) * tfMs, l = out[out.length - 1];
                    if (l && l.time === b) { l.high = Math.max(l.high, x.high); l.low = Math.min(l.low, x.low); l.close = x.close; l.n++; }
                    else out.push({ time: b, open: x.open, high: x.high, low: x.low, close: x.close, n: 1 });
                }
                c = out.filter((x) => x.n === tfMs / MIN);
            }
            console.log(`BW_DADOS ${pair} ${tf} candles=${c.length}`);
            const ultimo = {};
            for (let k = 120; k < c.length - 3; k++) {
                const atual = c[k];
                if (atual.time - c[k - 120].time !== 120 * tfMs || !operavel(pair, atual.time)) continue;
                // Resultado do candle de entrada e dos 2 seguintes (gale), em relação à direção.
                const seguintes = [0, 1, 2].map((j) => { const x = c[k + j]; return x && x.time === atual.time + j * tfMs ? x : null; });
                const rs = (s) => seguintes.map((x) => (!x || x.close === x.open ? 0 : Math.sign(x.close - x.open) * s));
                const fechados = c.slice(k - 120, k);
                const chinesa = getChinesaStrategySignal(fechados, MIN_A_FAVOR);
                const bw = getBwalphaIndicator(fechados, { open: atual.open, time: atual.time }, chinesa, OPTS);
                const dir = (v) => (v === 'COMPRA' || v === 'CALL' ? 1 : v === 'VENDA' || v === 'PUT' ? -1 : 0);
                const partes = { padrao5: dir(chinesa?.direction), cruzamento: dir(bw.cruzamento), alerta: dir(bw.alerta) };
                const principal = partes.padrao5 || partes.cruzamento || partes.alerta;
                const add = (nome, s) => {
                    // Um ciclo por vez: não abre outro enquanto o anterior (com até 2 gales) não terminou.
                    const base = `${nome}|${tf}|${pair}`;
                    if (!s || (ultimo[base] != null && atual.time - ultimo[base] < 3 * tfMs)) return;
                    ultimo[base] = atual.time;
                    for (const chave of [base, `${nome}|${tf}|TODOS`]) (sinais[chave] ||= []).push({ t: atual.time, rs: rs(s) });
                };
                for (const [nome, s] of Object.entries(partes)) add(nome, s);
                add('principal', principal);
                // Controle: mesma entrada do sinal principal, direção sorteada.
                if (principal) add('controle_aleatorio', Math.random() < 0.5 ? 1 : -1);
            }
        }
    }
    for (const [k, l] of Object.entries(sinais).sort()) console.log(`BW_RESULT ${k} casos=${l.length} ${JSON.stringify(resumo(l))}`);
}

module.exports = { runBwalpha };
