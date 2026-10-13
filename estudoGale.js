// Gale nas estratégias ativas do robô (pedido do dono em 13/10: "testa nas outras estratégias que já estão ativas").
// Refaz cada estratégia com as MESMAS regras e filtros do robô em ~3 meses de M1 (Twelve Data) e mede o acerto e o
// lucro sem gale, com gale 1 e com gale 2. Gale = entra de novo na mesma direção, com a mesma duração, logo depois
// da expiração anterior (valores 1 / 2,2 / 4,84; payout 84%; empate encerra o ciclo sem ganho).
//   devolucao   2º minuto do M5 andou ≥ 2,5 ATR → contra até o fim do M5 (3 min); filtros do robô (ponta da hora,
//               esticada da média 20, volatilidade normal); EURUSD/EURJPY; 14h–15h30 de Brasília (e o dia todo, para comparar).
//   pico        minuto com faixa ≥ 3 ATR → contra em 3 min; filtro (pavio ≥ 40% ou hora lateral); 14h–15h30 (e o dia todo).
//   regra1/2    regras do minerador no M5 (Estratégias 1 e 2), COMPRA no candle M5 seguinte.
// BACKTEST_SOURCE=gale; logs GALE_*.
const MIN = 60_000, M5 = 300_000;
const PAY = 0.84, V = [1, 2.2, 4.84];
const pct = (w, n) => (n ? +(100 * w / n).toFixed(1) : null);
const brt = (t) => { const d = new Date(t - 3 * 3600_000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const tarde = (t) => { const m = brt(t); return m >= 14 * 60 && m < 15 * 60 + 30; };
const operavelEur = (t) => { const m = brt(t); return m >= 22 * 60 || m < 15 * 60 + 30; };

function ciclo(rs, gales) {
    let gasto = 0;
    for (let k = 0; k <= gales; k++) {
        const r = rs[k];
        if (!r) return [false, -gasto];
        if (r > 0) return [true, V[k] * PAY - gasto];
        gasto += V[k];
    }
    return [false, -gasto];
}
function resumo(lista) {
    return Object.fromEntries([0, 1, 2].map((g) => {
        const rs = lista.map((rs3) => ciclo(rs3, g)), w = rs.filter((x) => x[0]).length;
        return [g === 0 ? 'sem_gale' : `gale${g}`, { acerto: pct(w, rs.length), lucro_unidades: +rs.reduce((a, x) => a + x[1], 0).toFixed(1), red_completo: rs.length - w }];
    }));
}

async function runGale(pool, { fetchLongHistory }) {
    const paginas = Number(process.env.HOR_PAGINAS) || 25;
    // GALE_FONTE=exnova usa os candles da própria corretora (otc_candles), em vez da Twelve Data.
    if (process.env.GALE_FONTE === 'exnova') {
        fetchLongHistory = async (pair) => {
            const { rows } = await pool.query('SELECT time, open, high, low, close FROM otc_candles WHERE active = $1 ORDER BY time', [pair]);
            return rows.slice(0, -1).map((r) => ({ time: new Date(r.time).getTime(), open: +r.open, high: +r.high, low: +r.low, close: +r.close }));
        };
    }
    console.log(`GALE_FONTE ${process.env.GALE_FONTE || 'twelve'}`);
    const minerador = require('./mineradorBacktest');
    const casos = {}; // nome -> [[r1, r2, r3], ...] (+1 ganhou, -1 perdeu, 0 empate/sem dado)
    const add = (nome, rs) => (casos[nome] ||= []).push(rs);
    for (const pair of ['EURUSD', 'EURJPY', 'XAUUSD']) {
        let m1;
        try { m1 = await fetchLongHistory(pair, 'M1', paginas); } catch (err) { console.log(`GALE_ERRO ${pair} ${err.message}`); continue; }
        if (!m1 || m1.length < 5000) { console.log(`GALE_DADOS ${pair} poucos candles`); continue; }
        const P = minerador.prep(m1), { atr, e20 } = P;
        const idx = new Map(m1.map((c, i) => [c.time, i]));
        const close = (t) => { const j = idx.get(t - MIN); return j == null ? null : m1[j].close; }; // preço no instante t (fechamento do minuto anterior)
        // Resultado de uma janela [ini, fim] na direção s.
        const janela = (ini, fim, s) => { const a = close(ini), b = close(fim); return a == null || b == null || a === b ? 0 : Math.sign((b - a) * s); };
        const tres = (ini, dur, s) => [0, 1, 2].map((k) => janela(ini + k * dur, ini + (k + 1) * dur, s));
        console.log(`GALE_DADOS ${pair} candles=${m1.length} de=${new Date(m1[0].time).toISOString().slice(0, 10)} ate=${new Date(m1.at(-1).time).toISOString().slice(0, 10)}`);
        for (let i = 1500; i < m1.length - 20; i++) {
            const x = m1[i], t = x.time + MIN; // agora = fechamento do candle i
            if (pair !== 'XAUUSD' && !operavelEur(t)) continue;
            const a = atr[i] || 1e-9;
            const hora = Array.from({ length: 60 }, (_, k) => m1[i - 59 + k]);
            if (hora[0].time !== x.time - 59 * MIN) continue;
            // Volatilidade de agora x mediana do último dia (como o robô).
            let viz = null;
            const volNormal = () => { viz ||= atr.slice(i - 1440, i).slice().sort((p, q) => p - q); const r = a / viz[720]; return r >= 0.8 && r < 1.3; };
            if (pair !== 'XAUUSD') {
                // Devolução: agora é o fim do 2º minuto do bloco de 5.
                if (t % M5 === 2 * MIN) {
                    const ini = m1[i - 1];
                    if (ini.time === x.time - MIN) {
                        const mov = (x.close - ini.open) / a, s = mov > 0 ? -1 : 1;
                        if (Math.abs(mov) >= 2.5) {
                            const hi = Math.max(...hora.map((c) => c.high)), lo = Math.min(...hora.map((c) => c.low)), pos = (x.close - lo) / ((hi - lo) || 1e-9);
                            const filtro = (s > 0 ? pos : 1 - pos) < 0.15 && (x.close - e20[i]) / a * s < -2 && volNormal();
                            const rs = tres(t, 3 * MIN, s);
                            add('devolucao_sem_filtro_dia_todo', rs);
                            if (filtro) { add('devolucao_robo_dia_todo', rs); if (tarde(t)) add('devolucao_robo_14h_15h30', rs); }
                        }
                    }
                }
                // Pico: o minuto que acabou de fechar.
                const ant = m1[i - 1];
                if (x.close !== x.open && (x.high - x.low) >= 3 * (atr[i - 1] || Infinity)) {
                    const s = x.close > x.open ? -1 : 1;
                    const pavio = s > 0 ? Math.min(x.open, x.close) - x.low : x.high - Math.max(x.open, x.close);
                    const lateral = Math.abs((x.close - hora[0].open) / a) < 4;
                    const rs = tres(t, 3 * MIN, s);
                    add('pico_sem_filtro_dia_todo', rs);
                    if (pavio / ((x.high - x.low) || 1e-9) >= 0.4 || lateral) { add('pico_robo_dia_todo', rs); if (tarde(t)) add('pico_robo_14h_15h30', rs); }
                }
            }
        }
        // Horários fixos do robô (entrada no início da faixa, 5 min).
        for (const [p, h, lado] of [['XAUUSD', '06:25', -1], ['XAUUSD', '15:50', 1], ['XAUUSD', '22:05', 1], ['EURJPY', '11:45', 1], ['XAUUSD', '01:15', -1], ['XAUUSD', '07:20', 1], ['EURUSD', '11:10', 1]]) {
            if (p !== pair) continue;
            const [hh, mm] = h.split(':').map(Number);
            for (const c of m1) {
                const t = c.time;
                if (brt(t) !== hh * 60 + mm) continue;
                const dia = new Date(t - 3 * 3600_000).getUTCDay();
                if (dia === 0 || dia === 6) continue;
                add(`horario_${p}_${h}`, tres(t, 5 * MIN, lado));
                add('horarios_todos', tres(t, 5 * MIN, lado));
            }
        }
        // Regras 1 e 2 (M5): cada candle M5 fechado; COMPRA no candle M5 seguinte.
        const c5 = [];
        for (const c of m1) {
            const b = Math.floor(c.time / M5) * M5, l = c5[c5.length - 1];
            if (l && l.time === b) { l.high = Math.max(l.high, c.high); l.low = Math.min(l.low, c.low); l.close = c.close; l.n++; }
            else c5.push({ time: b, open: c.open, high: c.high, low: c.low, close: c.close, n: 1 });
        }
        const m5 = c5.filter((c) => c.n === 5), P5 = minerador.prep(m5);
        const REGRAS = {
            regra1: { se: { cores3: 'RVV', hora: '11', vs_anterior: 'acima_max' }, ok: (f) => f.tendencia === 'alta' },
            regra2: { se: { sequencia: '1', hora: '14', vs_anterior: 'acima_max' }, ok: (f) => ['0', '-1', '-2'].includes(f.z_media) },
        };
        for (let i = 60; i < m5.length - 4; i++) {
            const prox = m5[i].time + M5;
            if (pair !== 'XAUUSD' && !operavelEur(prox)) continue;
            const f = minerador.descreve(m5, i, P5, pair, M5);
            for (const [nome, r] of Object.entries(REGRAS)) {
                if (!Object.entries(r.se).every(([k, v]) => f[k] === v) || !r.ok(f)) continue;
                // Resultado = cor de cada candle M5 seguinte (como o robô confere).
                const rs = [1, 2, 3].map((k) => { const c = m5[i + k]; return c && c.time === m5[i].time + k * M5 && c.close !== c.open ? (c.close > c.open ? 1 : -1) : 0; });
                add(nome, rs);
            }
        }
    }
    for (const [nome, l] of Object.entries(casos)) console.log(`GALE_RESULT ${nome} casos=${l.length} ${JSON.stringify(resumo(l))}`);
    // Referência: direção aleatória nas mesmas entradas da Devolução sem filtro (o que o gale dá sem vantagem).
    const ref = (casos.devolucao_sem_filtro_dia_todo || []).map((rs) => (Math.random() < 0.5 ? rs : rs.map((x) => -x)));
    console.log(`GALE_ALEATORIO casos=${ref.length} ${JSON.stringify(resumo(ref))}`);
}

module.exports = { runGale };
