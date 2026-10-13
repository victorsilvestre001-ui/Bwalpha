// Estudo de horário com ~3 meses de M1 (pedido do dono em 13/10: "algo novo, que não seja popular").
// Fonte: Twelve Data (histórico longo; a Exnova só tem ~2 semanas gravadas). Duas frentes:
//  1) Fixings: momentos em que bancos/fundos são obrigados a negociar a taxa de referência.
//       Londres 16:00 (WM/Reuters), BCE 14:15 (Frankfurt), corte de opções de Nova York 10:00 e Tóquio 09:55.
//     Hipóteses: o movimento dos 30 min antes continua até o fixing; depois do fixing o preço devolve (5, 15, 30 min).
//  2) Varredura do dia: cada faixa de 5 min (horário de Brasília) tem tendência fixa de subir ou cair?
//     A direção é escolhida na fase de estudo e precisa se repetir na confirmação e na prova.
// Fases cronológicas: estudo 40% / confirmação 30% / prova 30% dos dias. Aprovada: ≥ 57% em cada fase, n ≥ 60 e z ≥ 3.
// Controle: a mesma busca com os resultados embaralhados. Só horário operável (EUR até 15h30 de Brasília).
// BACKTEST_SOURCE=horario; HOR_PAGINAS = páginas de 5000 min por ativo (padrão 25 ≈ 3 meses); logs HOR_*.
const MIN = 60_000;
const PAIRS = ['EURUSD', 'EURJPY', 'XAUUSD'];
const pct = (w, n) => (n ? +(100 * w / n).toFixed(1) : null);

const fmt = {};
function local(t, tz) {
    fmt[tz] ||= new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
    const p = Object.fromEntries(fmt[tz].formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return { hm: Number(p.hour) * 60 + Number(p.minute), wd: p.weekday };
}
const brt = (t) => { const d = new Date(t - 3 * 3600_000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
function operavel(pair, t) {
    if (pair === 'XAUUSD') return true;
    const m = brt(t);
    return m >= 22 * 60 || m < 15 * 60 + 30;
}
const FIXINGS = [
    ['londres16', 'Europe/London', 16 * 60],
    ['bce1415', 'Europe/Berlin', 14 * 60 + 15],
    ['ny_corte10', 'America/New_York', 10 * 60],
    ['toquio0955', 'Asia/Tokyo', 9 * 60 + 55],
];

function avalia(l, minFase = 0.57) {
    const ts = l.map((s) => s.t).sort((p, q) => p - q), q1 = ts[Math.floor(ts.length * 0.4)], q2 = ts[Math.floor(ts.length * 0.7)];
    const f = [[0, 0], [0, 0], [0, 0]];
    for (const s of l) { const ph = s.t < q1 ? 0 : s.t < q2 ? 1 : 2; f[ph][0]++; if (s.win) f[ph][1]++; }
    const W = l.filter((s) => s.win).length, n = l.length, z = n ? (W / n - 0.5) / Math.sqrt(0.25 / n) : 0;
    return {
        n, acerto: pct(W, n), z: +z.toFixed(2),
        estudo: [f[0][0], pct(f[0][1], f[0][0])], confirmacao: [f[1][0], pct(f[1][1], f[1][0])], prova: [f[2][0], pct(f[2][1], f[2][0])],
        aprovada: n >= 60 && f.every(([c, w]) => c >= 15 && w / c >= minFase) && z >= 3,
    };
}

async function runHorario(pool, { fetchLongHistory }) {
    const paginas = Number(process.env.HOR_PAGINAS) || 25;
    const { prep } = require('./mineradorBacktest');
    const hip = {};            // nome -> [{t, win}]
    const slots = {};          // pair|HH:MM -> [{t, up}]
    for (const pair of PAIRS) {
        let m1;
        try { m1 = await fetchLongHistory(pair, 'M1', paginas); } catch (err) { console.log(`HOR_ERRO ${pair} ${err.message}`); continue; }
        if (!m1 || m1.length < 20000) { console.log(`HOR_DADOS ${pair} poucos candles (${m1?.length || 0})`); continue; }
        const { atr } = prep(m1);
        const idx = new Map(m1.map((c, i) => [c.time, i]));
        const dias = new Set(m1.map((c) => Math.floor(c.time / 86400_000))).size;
        console.log(`HOR_DADOS ${pair} candles=${m1.length} dias=${dias} de=${new Date(m1[0].time).toISOString().slice(0, 10)} ate=${new Date(m1.at(-1).time).toISOString().slice(0, 10)}`);
        // Resultado entre dois instantes (fechamento do candle i → fechamento do candle j), em relação à aposta.
        const res = (i, n) => { const j = idx.get(m1[i].time + n * MIN); return j == null ? 0 : Math.sign(m1[j].close - m1[i].close); };
        const add = (nome, i, previsto, horiz) => {
            if (!previsto || !operavel(pair, m1[i].time + MIN)) return;
            for (const h of horiz) { const r = res(i, h); if (r) (hip[`${nome}_${h}min|${pair}`] ||= []).push({ t: m1[i].time, win: r === previsto }); }
        };
        for (let i = 40; i < m1.length - 31; i++) {
            const t = m1[i].time + MIN; // instante logo após o fechamento do candle i
            // 1) Fixings (só nos minutos que podem ser fixing ou 5 min antes; fusos inteiros e de meia hora).
            const mu = new Date(t).getUTCMinutes();
            if ([50, 55, 0, 10, 15, 20, 25, 30, 45].includes(mu)) for (const [nome, tz, hm] of FIXINGS) {
                const L = local(t, tz);
                if (L.wd === 'Sat' || L.wd === 'Sun') continue;
                const a = atr[i] || 1e-9;
                const ini30 = idx.get(t - 30 * MIN - MIN);
                if (L.hm === hm - 5 && ini30 != null) {
                    // 5 min antes do fixing: o movimento dos 25 min anteriores continua até o fixing?
                    const mov = (m1[i].close - m1[ini30].close) / a;
                    add(`${nome}_antes_segue`, i, Math.sign(mov), [5]);
                    if (Math.abs(mov) >= 3) add(`${nome}_antes_segue_forte`, i, Math.sign(mov), [5]);
                }
                if (L.hm === hm && ini30 != null) {
                    // No fixing: o movimento dos 30 min antes devolve depois?
                    const mov = (m1[i].close - m1[ini30].close) / a;
                    add(`${nome}_depois_volta`, i, -Math.sign(mov), [5, 15, 30]);
                    if (Math.abs(mov) >= 3) add(`${nome}_depois_volta_forte`, i, -Math.sign(mov), [5, 15, 30]);
                }
            }
            // 2) Faixas de 5 min do dia (entrada no início da faixa, resultado 5 min depois).
            if (t % 300_000 === 0 && operavel(pair, t)) {
                const r = res(i, 5);
                if (r) {
                    // Resultados das janelas seguintes (para o gale: mesma direção nos 5 e 10 min depois).
                    const j5 = idx.get(t + 4 * MIN), j10 = idx.get(t + 9 * MIN);
                    const r2 = j5 != null ? res(j5, 5) : 0, r3 = j10 != null ? res(j10, 5) : 0;
                    const m = brt(t);
                    (slots[`${pair}|${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`] ||= []).push({ t, up: r > 0, r1: r, r2, r3 });
                }
            }
        }
    }
    // Fixings: avaliação direta.
    const linhas = Object.entries(hip).map(([k, l]) => ({ sinal: k, ...avalia(l) })).sort((p, q) => q.z - p.z);
    for (const r of linhas) console.log(`HOR_FIX ${JSON.stringify(r)}`);
    // Faixas do dia: direção escolhida no estudo (40% mais antigo), medida em confirmação + prova.
    const escolhe = (l) => {
        const ts = l.map((s) => s.t).sort((p, q) => p - q), q1 = ts[Math.floor(ts.length * 0.4)];
        const est = l.filter((s) => s.t < q1), up = est.filter((s) => s.up).length;
        const dir = up * 2 >= est.length ? 1 : -1;
        return { dir, lista: l.map((s) => ({ t: s.t, win: (s.up ? 1 : -1) === dir })) };
    };
    const varre = (fonte) => Object.entries(fonte).map(([k, l]) => { const { dir, lista } = escolhe(l); return { faixa: k, lado: dir > 0 ? 'COMPRA' : 'VENDA', ...avalia(lista) }; });
    const faixas = varre(slots).sort((p, q) => q.z - p.z);
    for (const r of faixas.slice(0, 25)) console.log(`HOR_FAIXA ${JSON.stringify(r)}`);
    // Controle embaralhado (as duas frentes).
    const acaso = [];
    for (let r = 0; r < 5; r++) {
        let c = 0;
        for (const l of Object.values(hip)) { const w = l.map((s) => s.win).sort(() => Math.random() - 0.5); if (avalia(l.map((s, j) => ({ t: s.t, win: w[j] }))).aprovada) c++; }
        const emb = Object.fromEntries(Object.entries(slots).map(([k, l]) => { const u = l.map((s) => s.up).sort(() => Math.random() - 0.5); return [k, l.map((s, j) => ({ t: s.t, up: u[j] }))]; }));
        c += varre(emb).filter((x) => x.aprovada).length;
        acaso.push(c);
    }
    const aprov = [...linhas.filter((x) => x.aprovada), ...faixas.filter((x) => x.aprovada)];
    console.log(`HOR_RESUMO fixings=${linhas.length} faixas=${faixas.length} aprovadas=${aprov.length} por_acaso=${JSON.stringify(acaso)}`);
    console.log(`HOR_APROVADAS ${JSON.stringify(aprov)}`);
    // Gale (13/10): se a entrada perde, entra de novo na mesma direção nas janelas de 5 min seguintes.
    // Valores: entrada 1; gale 1 = 2,2; gale 2 = 4,84 (recupera a perda com payout 84%). Empate na janela = devolve, conta como perda do ciclo? Não: repete o mesmo valor na janela seguinte (como na corretora, o empate devolve o dinheiro).
    const PAY = 0.84, V = [1, 2.2, 4.84];
    const ciclo = (s, dir, gales) => {
        // Retorna [acertou?, lucro em unidades da 1ª entrada].
        let gasto = 0;
        const rs = [s.r1, s.r2, s.r3];
        for (let k = 0; k <= gales; k++) {
            const r = rs[k];
            if (!r) return [false, -gasto]; // sem dado/empate: para o ciclo
            if (r === dir) return [true, V[k] * PAY - gasto];
            gasto += V[k];
        }
        return [false, -gasto];
    };
    const resumoGale = (l, dir) => Object.fromEntries([0, 1, 2].map((g) => {
        const rs = l.map((s) => ciclo(s, dir, g)), w = rs.filter((x) => x[0]).length;
        return [g === 0 ? 'sem_gale' : `gale${g}`, { acerto: pct(w, rs.length), lucro_unidades: +rs.reduce((a, x) => a + x[1], 0).toFixed(1), ciclos: rs.length, perdas_totais: rs.length - w }];
    }));
    const lista = (process.env.HOR_GALE || 'XAUUSD|06:25|VENDA,XAUUSD|15:50|COMPRA,XAUUSD|22:05|COMPRA,EURJPY|11:45|COMPRA,XAUUSD|01:15|VENDA,XAUUSD|07:20|COMPRA,EURUSD|11:10|COMPRA')
        .split(',').map((x) => x.split('|'));
    let todos = [];
    for (const [p, h, lado] of lista) {
        const l = slots[`${p}|${h}`] || [], dir = lado === 'COMPRA' ? 1 : -1;
        todos = todos.concat(l.map((s) => ({ ...s, dir })));
        console.log(`HOR_GALE ${p} ${h} ${lado} ${JSON.stringify(resumoGale(l, dir))}`);
    }
    const tot = Object.fromEntries([0, 1, 2].map((g) => { const rs = todos.map((s) => ciclo(s, s.dir, g)), w = rs.filter((x) => x[0]).length; return [g === 0 ? 'sem_gale' : `gale${g}`, { acerto: pct(w, rs.length), lucro_unidades: +rs.reduce((a, x) => a + x[1], 0).toFixed(1), ciclos: rs.length }]; }));
    console.log(`HOR_GALE_TOTAL ${JSON.stringify(tot)}`);
    // Referência: as mesmas contas em TODAS as faixas do dia com direção aleatória (o que o gale dá sem nenhuma vantagem).
    const ref = [];
    for (const l of Object.values(slots)) for (const s of l) ref.push({ ...s, dir: Math.random() < 0.5 ? 1 : -1 });
    const refR = Object.fromEntries([0, 1, 2].map((g) => { const rs = ref.map((s) => ciclo(s, s.dir, g)), w = rs.filter((x) => x[0]).length; return [g === 0 ? 'sem_gale' : `gale${g}`, { acerto: pct(w, rs.length), lucro_por_100_ciclos: +(100 * rs.reduce((a, x) => a + x[1], 0) / rs.length).toFixed(1) }]; }));
    console.log(`HOR_GALE_ALEATORIO ${JSON.stringify(refR)}`);
}

module.exports = { runHorario };
