// Estudo do OTC da Exnova (pedido do dono em 09/10): as estratégias do robô funcionam no OTC? E existe algum
// padrão próprio do OTC (o preço do OTC é gerado pela corretora, pode ter "manias" que o mercado real não tem)?
// Usa os candles M1 dos ativos -OTC que o coletor grava em otc_candles.
// Parte 1 (OTC_ESTRATEGIA): devolução, relógio 15 e pico, com e sem os filtros de 09/10, metade antiga/nova.
// Parte 2 (OTC_PADRAO): busca de padrões candle a candle. Período dividido em 3: estudo (primeiros 40%),
//   confirmação (40–70%) e prova (últimos 30%). Só sai como achado o que tiver ≥ 58% no estudo E na
//   confirmação, com casos suficientes; a prova é o teste final, que ninguém "viu" antes.
//   Alvos: cor do próximo candle M1 (expiração 1 min) e preço 3 min depois (expiração 3 min).
// BACKTEST_SOURCE=otc2; logs OTC_*.
const MIN = 60_000;
const faixa = (v, cortes, nomes) => { const i = cortes.findIndex((c) => v < c); return nomes[i === -1 ? nomes.length - 1 : i]; };
const pct = (w, n) => (n ? +(100 * w / n).toFixed(1) : null);

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

// Parte 1: as estratégias do robô, recalculadas no OTC.
function estrategias(m1, atr, e20) {
    const idx = new Map(m1.map((x, i) => [x.time, i]));
    const res = {};
    const add = (nome, t, win) => (res[nome] ||= []).push({ t, win });
    const filtroDev = (i, s) => {
        if (i < 60) return false;
        const h = m1.slice(i - 59, i + 1), hi = Math.max(...h.map((c) => c.high)), lo = Math.min(...h.map((c) => c.low));
        const pos = (m1[i].close - lo) / ((hi - lo) || 1e-9);
        return (s > 0 ? pos : 1 - pos) < 0.15 && (m1[i].close - e20[i]) / atr[i] * s < -2;
    };
    const filtroPico = (i, s) => {
        if (i < 60) return false;
        const x = m1[i], pav = s > 0 ? Math.min(x.open, x.close) - x.low : x.high - Math.max(x.open, x.close);
        return pav / ((x.high - x.low) || 1e-9) >= 0.4 || Math.abs((x.close - m1[i - 59].open) / atr[i]) < 4;
    };
    for (let i = 1; i < m1.length; i++) {
        const t = m1[i].time;
        // Devolução: fim do 2º minuto do bloco M5.
        if (t % 300_000 === 60_000) {
            const a = m1[i - 1], b = m1[i], fim = m1[idx.get(t + 180_000)];
            if (a && a.time === t - MIN && fim) {
                const mov = (b.close - a.open) / atr[i], s = mov > 0 ? -1 : 1;
                if (Math.abs(mov) >= 2 && fim.close !== b.close) {
                    const win = (fim.close - b.close) * s > 0;
                    add('devolve_m5', t, win);
                    if (Math.abs(mov) >= 2.5 && filtroDev(i, s)) add('devolve_m5_filtrada', t, win);
                }
            }
        }
        // Relógio 15: fim do 8º minuto do bloco de 15.
        if (t % 900_000 === 420_000) {
            const ini = m1[idx.get(t - 420_000)], fim = m1[idx.get(t + 420_000)];
            if (ini && fim) {
                const mov = (m1[i].close - ini.open) / atr[i];
                if (Math.abs(mov) >= 2 && fim.close !== m1[i].close) add('relogio15_segue', t, (fim.close - m1[i].close) * Math.sign(mov) > 0);
            }
        }
        // Pico: minuto com faixa ≥ 3 ATR do anterior → contra, 3 min.
        const x = m1[i], fim = m1[idx.get(t + 180_000)];
        if (fim && x.close !== x.open && (x.high - x.low) >= 3 * atr[i - 1] && fim.close !== x.close) {
            const s = x.close > x.open ? -1 : 1, win = (fim.close - x.close) * s > 0;
            add('pico_volta', t, win);
            if (filtroPico(i, s)) add('pico_volta_filtrada', t, win);
        }
    }
    return res;
}

// Parte 2: características do candle i (fechado) para prever o que vem depois.
function caracteristicas(m1, atr, i) {
    const cor = (c) => (c.close > c.open ? 'V' : c.close < c.open ? 'R' : 'D');
    const x = m1[i], a = atr[i];
    let seq = 1;
    while (seq < 6 && i - seq >= 0 && cor(m1[i - seq]) === cor(x)) seq++;
    const h15 = m1.slice(i - 14, i + 1), hi = Math.max(...h15.map((c) => c.high)), lo = Math.min(...h15.map((c) => c.low));
    const corpo = Math.abs(x.close - x.open), faixaX = (x.high - x.low) || 1e-9;
    const ps = x.high - Math.max(x.open, x.close), pi = Math.min(x.open, x.close) - x.low;
    return {
        cores3: cor(m1[i - 2]) + cor(m1[i - 1]) + cor(x),
        sequencia: cor(x) + Math.min(seq, 5),
        corpo: cor(x) + '_' + faixa(corpo / a, [0.3, 0.8, 1.5], ['mini', 'pequeno', 'medio', 'grande']),
        pavio: ps > 2 * pi && ps / faixaX > 0.3 ? 'cima' : pi > 2 * ps && pi / faixaX > 0.3 ? 'baixo' : 'sem',
        minuto_m5: String(((x.time / MIN) + 1) % 5), // posição do PRÓXIMO candle dentro do M5
        hora: String(new Date(x.time).getUTCHours()).padStart(2, '0'),
        posicao15: faixa((x.close - lo) / ((hi - lo) || 1e-9), [0.1, 0.4, 0.6, 0.9], ['fundo', 'baixo', 'meio', 'alto', 'topo']),
        mov5: faixa((x.close - m1[i - 4].open) / a, [-2, -0.5, 0.5, 2], ['caiu_forte', 'caiu', 'parado', 'subiu', 'subiu_forte']),
    };
}

async function runOtc2(pool) {
    const { rows: ativos } = await pool.query(`SELECT active, COUNT(*)::int AS n FROM otc_candles WHERE active LIKE '%-OTC' GROUP BY active ORDER BY active`);
    if (!ativos.length) return console.log('OTC_RESULT nenhum ativo OTC gravado');
    for (const { active, n } of ativos) {
        const { rows } = await pool.query('SELECT time, open, high, low, close FROM otc_candles WHERE active = $1 ORDER BY time', [active]);
        const m1 = rows.slice(0, -1).map((r) => ({ time: new Date(r.time).getTime(), open: +r.open, high: +r.high, low: +r.low, close: +r.close }));
        if (m1.length < 3000) { console.log(`OTC_RESULT ${active} poucos candles (${m1.length})`); continue; }
        const atr = atrSerie(m1), e20 = require('./mineradorBacktest').prep(m1).e20;
        console.log(`OTC_ATIVO ${active} candles=${n} de=${new Date(m1[0].time).toISOString().slice(0, 16)} ate=${new Date(m1[m1.length - 1].time).toISOString().slice(0, 16)}`);
        // Parte 1.
        const est = estrategias(m1, atr, e20);
        const meio = m1[Math.floor(m1.length / 2)].time;
        const tab = (l) => [l.length, pct(l.filter((s) => s.win).length, l.length), pct(l.filter((s) => s.t < meio && s.win).length, l.filter((s) => s.t < meio).length), pct(l.filter((s) => s.t >= meio && s.win).length, l.filter((s) => s.t >= meio).length)];
        // [casos, acerto %, metade antiga, metade nova]
        console.log(`OTC_ESTRATEGIA ${active} ${JSON.stringify(Object.fromEntries(Object.entries(est).map(([k, l]) => [k, tab(l)])))}`);
        // Parte 2.
        const c1 = m1[Math.floor(m1.length * 0.4)].time, c2 = m1[Math.floor(m1.length * 0.7)].time;
        const amostras = [];
        for (let i = 20; i < m1.length - 3; i++) {
            if (m1[i + 3].time !== m1[i].time + 3 * MIN) continue;
            const prox = m1[i + 1], f = caracteristicas(m1, atr, i);
            const fase = m1[i].time < c1 ? 0 : m1[i].time < c2 ? 1 : 2;
            amostras.push({ f, fase, alvo: { prox_1min: prox.close === prox.open ? null : prox.close > prox.open, em_3min: m1[i + 3].close === m1[i].close ? null : m1[i + 3].close > m1[i].close } });
        }
        const chaves = Object.keys(amostras[0].f);
        const grupos = chaves.map((k) => [k]);
        for (let x = 0; x < chaves.length; x++) for (let y = x + 1; y < chaves.length; y++) grupos.push([chaves[x], chaves[y]]);
        // Busca: direção decidida no estudo; precisa repetir na confirmação e na prova, com casos suficientes.
        const busca = (alvoDe) => {
            const out = [];
            for (const alvo of ['prox_1min', 'em_3min']) for (const g of grupos) {
                const cont = {};
                amostras.forEach((s, j) => {
                    const r = alvoDe(s, j, alvo); if (r == null) return;
                    const o = (cont[g.map((k) => `${k}=${s.f[k]}`).join('&')] ||= [[0, 0], [0, 0], [0, 0]]);
                    o[s.fase][0]++; if (r) o[s.fase][1]++;
                });
                for (const [key, o] of Object.entries(cont)) {
                    if (o[0][0] < 80 || o[1][0] < 50 || o[2][0] < 40) continue;
                    const sobe = o[0][1] / o[0][0] >= 0.5, acc = (f) => (sobe ? f[1] : f[0] - f[1]) / f[0];
                    if (acc(o[0]) >= 0.58 && acc(o[1]) >= 0.57 && acc(o[2]) >= 0.57) {
                        out.push({ alvo, padrao: key, aposta: sobe ? 'COMPRA' : 'VENDA', estudo: [o[0][0], pct(acc(o[0]) * 100, 100)], confirmacao: [o[1][0], pct(acc(o[1]) * 100, 100)], prova: [o[2][0], pct(acc(o[2]) * 100, 100)] });
                    }
                }
            }
            return out;
        };
        const achados = busca((s, j, alvo) => s.alvo[alvo]).sort((p, q) => q.prova[1] - p.prova[1]);
        // Controle: mesma busca 5 vezes com os resultados embaralhados (quantos "achados" aparecem por puro acaso).
        const acaso = [];
        for (let r = 0; r < 5; r++) {
            const emb = { prox_1min: amostras.map((s) => s.alvo.prox_1min).sort(() => Math.random() - 0.5), em_3min: amostras.map((s) => s.alvo.em_3min).sort(() => Math.random() - 0.5) };
            acaso.push(busca((s, j, alvo) => emb[alvo][j]).length);
        }
        console.log(`OTC_PADRAO ${active} achados=${achados.length} por_acaso_media=${(acaso.reduce((x, y) => x + y, 0) / acaso.length).toFixed(1)} (${acaso.join(',')})`);
        console.log(`OTC_PADRAO_LISTA ${active} ${JSON.stringify(achados.slice(0, 30))}`);
    }
}

module.exports = { runOtc2 };
