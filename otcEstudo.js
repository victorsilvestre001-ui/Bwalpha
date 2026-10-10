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
// Alvos (expirações) da busca de padrões; 5 e 15 min entraram em 10/10.
const ALVOS = (process.env.OTC_ALVOS || 'prox_1min,em_3min,em_5min,em_15min').split(',');
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
        for (let i = 20; i < m1.length - 15; i++) {
            if (m1[i + 3].time !== m1[i].time + 3 * MIN) continue;
            const prox = m1[i + 1], f = caracteristicas(m1, atr, i);
            const fase = m1[i].time < c1 ? 0 : m1[i].time < c2 ? 1 : 2;
            amostras.push({ t: m1[i].time, f, fase, alvo: { prox_1min: prox.close === prox.open ? null : prox.close > prox.open, em_3min: m1[i + 3].close === m1[i].close ? null : m1[i + 3].close > m1[i].close,
                em_5min: m1[i + 5].time !== m1[i].time + 5 * MIN || m1[i + 5].close === m1[i].close ? null : m1[i + 5].close > m1[i].close,
                em_15min: m1[i + 15].time !== m1[i].time + 15 * MIN || m1[i + 15].close === m1[i].close ? null : m1[i + 15].close > m1[i].close } });
        }
        const chaves = Object.keys(amostras[0].f);
        const grupos = chaves.map((k) => [k]);
        for (let x = 0; x < chaves.length; x++) for (let y = x + 1; y < chaves.length; y++) grupos.push([chaves[x], chaves[y]]);
        // Busca: direção decidida no estudo; precisa repetir na confirmação e na prova, com casos suficientes.
        const busca = (alvoDe) => {
            const out = [];
            for (const alvo of ALVOS) for (const g of grupos) {
                const cont = {};
                amostras.forEach((s, j) => {
                    // Sem sobreposição: expiração de N min só conta 1 caso a cada N min (senão os casos se repetem).
                    const passo = { em_5min: 5, em_15min: 15 }[alvo];
                    if (passo && (s.t / MIN) % passo !== 0) return;
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
            const emb = Object.fromEntries(ALVOS.map((a) => [a, amostras.map((s) => s.alvo[a]).sort(() => Math.random() - 0.5)]));
            acaso.push(busca((s, j, alvo) => emb[alvo][j]).length);
        }
        console.log(`OTC_PADRAO ${active} achados=${achados.length} por_acaso_media=${(acaso.reduce((x, y) => x + y, 0) / acaso.length).toFixed(1)} (${acaso.join(',')})`);
        console.log(`OTC_PADRAO_LISTA ${active} ${JSON.stringify(achados.slice(0, 30))}`);
    }
}

module.exports = { runOtc2 };

// Rodada 2 do OTC (09/10, "identifique algo no OTC"): hipóteses próprias de preço gerado pela corretora.
//   humor      % de traders comprando (traders-mood da Exnova) → o preço vai CONTRA a maioria? (1, 3 e 5 min)
//   sequencia  depois de N candles da mesma cor (4 a 8), o próximo inverte?
//   eco        o candle de agora repete a cor de N minutos atrás (ciclos de 5, 15, 30, 60 min)?
//   cruzado    o candle do outro ativo OTC que acabou de fechar antecipa o próximo deste?
//   doji       depois de um candle sem corpo, o que vem?
//   grande     candle ≥ 1,5 / 2 / 3 ATR → volta no próximo (1 min) ou em 3 min?
// Cada hipótese sai com acerto no estudo (40%), confirmação (30%) e prova (30%) + controle embaralhado.
// BACKTEST_SOURCE=otc3; logs OTC3_*.
async function runOtc3(pool) {
    const { rows: ativos } = await pool.query(`SELECT DISTINCT active FROM otc_candles WHERE active LIKE '%-OTC' ORDER BY active`);
    const dados = {};
    for (const { active } of ativos) {
        const { rows } = await pool.query('SELECT time, open, high, low, close FROM otc_candles WHERE active = $1 ORDER BY time', [active]);
        const m1 = rows.slice(0, -1).map((r) => ({ time: new Date(r.time).getTime(), open: +r.open, high: +r.high, low: +r.low, close: +r.close }));
        dados[active] = { m1, atr: atrSerie(m1), idx: new Map(m1.map((x, i) => [x.time, i])) };
    }
    // Ids da Exnova para o humor: os que o coletor usa (EXNOVA_ACTIVE_IDS) ou os conhecidos.
    const ids = Object.fromEntries((process.env.EXNOVA_ACTIVE_IDS || 'EURUSD-OTC:76,XAUUSD-OTC:1857').split(',').map((x) => x.split(':')).map(([n, id]) => [n, Number(id)]));
    const cor = (c) => (c.close > c.open ? 1 : c.close < c.open ? -1 : 0);
    for (const active of Object.keys(dados)) {
        const { m1, atr, idx } = dados[active];
        if (m1.length < 3000) continue;
        const hip = {}; // nome -> [{t, win}]
        const add = (nome, t, previsto, real) => { if (real !== 0 && previsto !== 0) (hip[nome] ||= []).push({ t, win: previsto === real }); };
        const fut = (i, n) => { const j = m1[i + n]; return j && j.time === m1[i].time + n * MIN ? Math.sign(j.close - m1[i].close) : 0; };
        const outro = Object.keys(dados).find((a) => a !== active);
        for (let i = 61; i < m1.length - 5; i++) {
            const x = m1[i], t = x.time, prox = m1[i + 1];
            if (!prox || prox.time !== t + MIN) continue;
            const r1 = cor(prox), r3 = fut(i, 3);
            let seq = 1;
            while (seq < 9 && cor(m1[i - seq]) === cor(x) && cor(x) !== 0) seq++;
            for (const n of [4, 5, 6, 7, 8]) if (seq === n) add(`sequencia_${n}_inverte`, t, -cor(x), r1);
            for (const n of [5, 15, 30, 60]) { const a = m1[i + 1 - n]; if (a && a.time === t + MIN - n * MIN) add(`eco_${n}min`, t, cor(a), r1); }
            if (cor(x) === 0) { add('doji_segue_anterior', t, cor(m1[i - 1]), r1); }
            const tam = (x.high - x.low) / atr[i - 1];
            for (const k of [1.5, 2, 3]) if (tam >= k && cor(x) !== 0) { add(`grande_${k}_volta_1min`, t, -cor(x), r1); add(`grande_${k}_volta_3min`, t, -cor(x), r3); }
            if (outro) { const o = dados[outro], j = o.idx.get(t); if (j != null) { add('cruzado_segue', t, cor(o.m1[j]), r1); add('cruzado_contra', t, -cor(o.m1[j]), r1); } }
        }
        // Humor: valor = fração comprando (0–1); usa o último registro até o fechamento do candle.
        const id = ids[active];
        if (id) {
            const { rows: hum } = await pool.query(`SELECT at, valor FROM exnova_extras WHERE tipo = 'humor' AND active_id = $1 ORDER BY at`, [id]);
            const hs = hum.map((h) => [new Date(h.at).getTime(), Number(h.valor)]);
            const vals = hs.map((h) => h[1]).sort((a, b) => a - b);
            console.log(`OTC3_HUMOR_DADOS ${active} registros=${hs.length} de=${hs[0] ? new Date(hs[0][0]).toISOString().slice(0, 16) : '-'} quantis=${JSON.stringify([0.05, 0.25, 0.5, 0.75, 0.95].map((q) => vals[Math.floor(q * (vals.length - 1))]))}`);
            let k = 0;
            for (let i = 0; i < m1.length - 5 && hs.length; i++) {
                const fim = m1[i].time + MIN;
                while (k + 1 < hs.length && hs[k + 1][0] <= fim) k++;
                if (hs[k][0] > fim || fim - hs[k][0] > 2 * MIN) continue;
                const v = hs[k][1], maioria = v > 0.5 ? 1 : v < 0.5 ? -1 : 0;
                const forte = Math.abs(v - 0.5) >= 0.2 ? 'forte' : 'leve';
                const r1 = m1[i + 1]?.time === fim ? cor(m1[i + 1]) : 0;
                add(`humor_contra_${forte}_1min`, m1[i].time, -maioria, r1);
                add(`humor_contra_${forte}_3min`, m1[i].time, -maioria, fut(i, 3));
                add(`humor_contra_${forte}_5min`, m1[i].time, -maioria, fut(i, 5));
            }
        }
        const res = {};
        for (const [nome, l] of Object.entries(hip)) {
            // Fases pelos próprios casos da hipótese (o humor só existe desde 07/10).
            const ts = l.map((s) => s.t).sort((a, b) => a - b), q1 = ts[Math.floor(ts.length * 0.4)], q2 = ts[Math.floor(ts.length * 0.7)];
            const f = [[0, 0], [0, 0], [0, 0]];
            for (const s of l) { const p = s.t < q1 ? 0 : s.t < q2 ? 1 : 2; f[p][0]++; if (s.win) f[p][1]++; }
            // [casos, acerto %] em estudo, confirmação, prova e total
            res[nome] = { estudo: [f[0][0], pct(f[0][1], f[0][0])], confirmacao: [f[1][0], pct(f[1][1], f[1][0])], prova: [f[2][0], pct(f[2][1], f[2][0])], total: [l.length, pct(l.filter((s) => s.win).length, l.length)] };
        }
        console.log(`OTC3_RESULT ${active} ${JSON.stringify(res)}`);
    }
}

module.exports.runOtc3 = runOtc3;
