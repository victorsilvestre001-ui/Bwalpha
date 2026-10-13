// Devolução vela a vela (pedido do dono em 13/10: "toda vez que faz a entrada da retração, como é o outro candle?").
// Refaz todas as entradas da Devolução nos candles M1 da Exnova (2º minuto do M5 andou ≥ 2,5 ATR → entra contra no
// fechamento dele, expira no fim do M5 = 3 min) e olha o que as velas seguintes fizeram, sempre em relação à aposta:
//   - acerto se a expiração fosse em 1, 2, 3, 4 ou 5 min;
//   - a 1ª vela depois da entrada: a favor ou contra, e de que tamanho; o acerto em 3 min depois de cada caso;
//   - até onde o preço foi a favor (melhor ponto) e contra (pior ponto) nos 3 min, e em que minuto foi o melhor;
//   - variações de entrada: esperar a 1ª vela (entrar só se ela vier a favor, ou só se vier contra) e expirar no fim do M5.
// Sai para todas as entradas e só para as que passam no filtro do robô (ponta da hora + esticada + volatilidade normal),
// separado em metade antiga e nova para ver se repete. BACKTEST_SOURCE=devolve2; logs DV2_*.
const MIN = 60_000;
const pct = (w, n) => (n ? +(100 * w / n).toFixed(1) : null);

async function runDevolve2(pool) {
    const { carrega, descreve } = require('./comparaBacktest');
    const D = await carrega(pool);
    const casos = [];
    for (const pair of Object.keys(D)) {
        const { m1, atr, idx } = D[pair];
        for (let i = 0; i < m1.length - 7; i++) {
            const a = m1[i], t = a.time;
            if (t % 300_000 !== 0) continue;
            const b = m1[i + 1];
            if (!b || b.time !== t + MIN) continue;
            const mov = (b.close - a.open) / (atr[i + 1] || 1e-9);
            if (Math.abs(mov) < 2.5) continue;
            const s = mov > 0 ? -1 : 1, P = b.close, A = atr[i + 1];
            const prox = [];
            for (let k = 1; k <= 5; k++) { const j = idx.get(t + (1 + k) * MIN); prox.push(j == null ? null : m1[j]); }
            if (prox.some((c) => !c)) continue;
            const f = descreve(D, pair, t + 2 * MIN, s);
            if (!f) continue;
            const res = prox.map((c) => Math.sign((c.close - P) * s)); // +1 ganhou, -1 perdeu, 0 empate
            const c1 = prox[0], corpo1 = (c1.close - c1.open) * s / A;
            let melhor = 0, pior = 0, minMelhor = 0;
            prox.slice(0, 3).forEach((c, k) => {
                const fav = (s > 0 ? c.high - P : P - c.low) / A, con = (s > 0 ? P - c.low : c.high - P) / A;
                if (fav > melhor) { melhor = fav; minMelhor = k + 1; }
                pior = Math.max(pior, con);
            });
            // Entrada atrasada: no fechamento da 1ª vela, expira no fim do M5 (2 min depois).
            const atrasada = Math.sign((prox[2].close - c1.close) * s);
            casos.push({
                pair, t, res, corpo1, melhor, pior, minMelhor, atrasada,
                filtro: f.posicao_hora === 'na_ponta_contra' && f.dist_media20 === 'muito_contra' && f.volatilidade === 'normal',
                periodo: f.periodo,
            });
        }
    }
    casos.sort((p, q) => p.t - q.t);
    const meio = casos.length ? casos[Math.floor(casos.length / 2)].t : 0;
    const taxa = (l, fn) => { const v = l.map(fn).filter((x) => x !== 0); return [v.length, pct(v.filter((x) => x > 0).length, v.length)]; };
    const media = (l, fn) => (l.length ? +(l.reduce((x, c) => x + fn(c), 0) / l.length).toFixed(2) : null);
    const relatorio = (nome, l) => {
        if (!l.length) return console.log(`DV2_${nome} sem casos`);
        const metades = { antiga: l.filter((c) => c.t < meio), nova: l.filter((c) => c.t >= meio) };
        const bloco = (x) => ({
            casos: x.length,
            expira: Object.fromEntries([1, 2, 3, 4, 5].map((k) => [`${k}min`, taxa(x, (c) => c.res[k - 1])])),
            vela1: {
                a_favor: x.filter((c) => c.corpo1 > 0).length, contra: x.filter((c) => c.corpo1 < 0).length,
                acerto3min_se_vela1_a_favor: taxa(x.filter((c) => c.corpo1 > 0), (c) => c.res[2]),
                acerto3min_se_vela1_contra: taxa(x.filter((c) => c.corpo1 < 0), (c) => c.res[2]),
                acerto3min_se_vela1_contra_forte: taxa(x.filter((c) => c.corpo1 <= -0.5), (c) => c.res[2]),
            },
            esperar_vela1: {
                entra_se_a_favor: taxa(x.filter((c) => c.corpo1 > 0), (c) => c.atrasada),
                entra_se_contra: taxa(x.filter((c) => c.corpo1 < 0), (c) => c.atrasada),
            },
            atr_medio: { melhor_a_favor: media(x, (c) => c.melhor), pior_contra: media(x, (c) => c.pior) },
            minuto_do_melhor_ponto: Object.fromEntries([1, 2, 3].map((k) => [k, pct(x.filter((c) => c.minMelhor === k).length, x.length)])),
            por_periodo: Object.fromEntries(['asia', 'londres', 'ny', 'tarde'].map((p) => [p, taxa(x.filter((c) => c.periodo === p), (c) => c.res[2])])),
        });
        console.log(`DV2_${nome} ${JSON.stringify({ total: bloco(l), antiga: bloco(metades.antiga), nova: bloco(metades.nova) })}`);
    };
    console.log(`DV2_DADOS casos=${casos.length} de=${casos[0] ? new Date(casos[0].t).toISOString().slice(0, 10) : '-'}`);
    for (const pair of [null, ...Object.keys(D)]) {
        const l = pair ? casos.filter((c) => c.pair === pair) : casos;
        relatorio(`TODAS${pair ? '_' + pair : ''}`, l);
        relatorio(`FILTRO${pair ? '_' + pair : ''}`, l.filter((c) => c.filtro));
    }
}

module.exports = { runDevolve2 };
