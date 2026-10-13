// Estudo profundo (pedido do dono em 13/10: "descobrir uma análise nova" para substituir a regra 2).
// Hipóteses que ainda não tinham sido testadas no mercado aberto (EURUSD, EURJPY, XAUUSD, candles M1 da Exnova):
//   humor      % de traders comprando nos ativos "-op" (traders-mood): a favor/contra a maioria, extremos e viradas.
//   redondo    preço tocando um número redondo (EURUSD 0,0010/0,0050 · EURJPY 0,10/0,50 · Ouro 1/5):
//              rejeição (tocou e fechou do lado de antes → contra) ou rompimento (fechou do outro lado → a favor).
//   dia        toque na máxima/mínima do dia anterior (rejeita x rompe).
//   compressao 15 min com faixa estreita e depois um candle forte (≥ 1,5 ATR) → segue o rompimento?
//   virada     movimento forte dos minutos :55–:59 → volta na virada da hora?
//   aceleracao 3 candles da mesma cor, cada um maior que o anterior → continua ou cansa?
// Entrada no fechamento do candle do sinal; resultado = preço 1, 3 ou 5 min depois (empate fica de fora).
// Casos do mesmo sinal não se sobrepõem (espera a expiração antes de contar outro). Só horário operável
// (EUR: 22h–15h30 de Brasília; Ouro: sempre).
// Validação: fases cronológicas estudo 40% / confirmação 30% / prova 30%. Aprovada só se tiver ≥ 60 casos,
// ≥ 55% em cada fase e z ≥ 2,5 no total (bem acima dos 54,3% que empatam com payout de 84%).
// Controle: a mesma aprovação com os resultados embaralhados (5 vezes) mostra quantas "passam" por acaso.
// BACKTEST_SOURCE=profundo; logs PROF_*.
const MIN = 60_000;
const PAIRS = ['EURUSD', 'EURJPY', 'XAUUSD'];
const OP_IDS = { EURUSD: 1861, EURJPY: 1864, XAUUSD: 1912 };
const PASSO = { EURUSD: [0.001, 0.005], EURJPY: [0.1, 0.5], XAUUSD: [1, 5] };
const HORIZ = [1, 3, 5];
const pct = (w, n) => (n ? +(100 * w / n).toFixed(1) : null);
const cor = (c) => (c.close > c.open ? 1 : c.close < c.open ? -1 : 0);

// PROF_JANELA="HH:MM-HH:MM" (Brasília) limita o estudo a uma janela do dia (13/10: "estratégia para operar de manhã").
const JANELA = (() => { const j = process.env.PROF_JANELA; if (!j) return null; const [a, b] = j.split('-').map((x) => { const [h, m] = x.split(':').map(Number); return h * 60 + (m || 0); }); return [a, b]; })();
function operavel(pair, t) {
    const d = new Date(t - 3 * 3600_000), m = d.getUTCHours() * 60 + d.getUTCMinutes();
    if (JANELA && !(m >= JANELA[0] && m < JANELA[1])) return false;
    if (pair === 'XAUUSD') return true;
    return m >= 22 * 60 || m < 15 * 60 + 30;
}

// Faixas de preço que cruzam um múltiplo de `passo` (o nível redondo entre low e high).
function nivelDentro(lo, hi, passo) {
    const n = Math.ceil(lo / passo - 1e-9) * passo;
    return n <= hi + 1e-12 ? n : null;
}

async function runProfundo(pool) {
    const { prep } = require('./mineradorBacktest');
    const todas = {}; // nome -> [{t, win}]
    for (const pair of PAIRS) {
        const { rows } = await pool.query('SELECT time, open, high, low, close FROM otc_candles WHERE active = $1 ORDER BY time', [pair]);
        const m1 = rows.slice(0, -1).map((r) => ({ time: new Date(r.time).getTime(), open: +r.open, high: +r.high, low: +r.low, close: +r.close }));
        if (m1.length < 5000) { console.log(`PROF_DADOS ${pair} poucos candles (${m1.length})`); continue; }
        const { atr } = prep(m1);
        console.log(`PROF_DADOS ${pair} candles=${m1.length} de=${new Date(m1[0].time).toISOString().slice(0, 10)} ate=${new Date(m1.at(-1).time).toISOString().slice(0, 10)}`);
        const fut = (i, n) => { const j = m1[i + n]; return j && j.time === m1[i].time + n * MIN ? Math.sign(j.close - m1[i].close) : 0; };
        const ultimo = {};
        const add = (nome, i, previsto) => {
            if (!previsto || !operavel(pair, m1[i].time + MIN)) return;
            for (const h of HORIZ) {
                const k = `${nome}_${h}min|${pair}`;
                if (ultimo[k] != null && m1[i].time - ultimo[k] < h * MIN) continue;
                const r = fut(i, h);
                if (!r) continue;
                ultimo[k] = m1[i].time;
                (todas[k] ||= []).push({ t: m1[i].time, win: r === previsto });
            }
        };
        // Máx/mín do dia anterior (dia UTC).
        const diaDe = (t) => Math.floor(t / 86400_000);
        const extremos = new Map();
        for (const c of m1) { const d = diaDe(c.time), e = extremos.get(d); if (!e) extremos.set(d, { hi: c.high, lo: c.low }); else { e.hi = Math.max(e.hi, c.high); e.lo = Math.min(e.lo, c.low); } }
        const dias = [...extremos.keys()].sort((a, b) => a - b);
        const anterior = new Map(dias.map((d, k) => [d, k ? extremos.get(dias[k - 1]) : null]));

        for (let i = 20; i < m1.length - 6; i++) {
            const x = m1[i], p = m1[i - 1], a = atr[i - 1];
            if (!a || x.time - m1[i - 15].time !== 15 * MIN) continue;
            const cx = cor(x);
            // Números redondos: o candle atravessou um nível.
            PASSO[pair].forEach((passo, n) => {
                const nome = n === 0 ? 'redondo_menor' : 'redondo_maior';
                const lv = nivelDentro(x.low, x.high, passo);
                if (lv == null) return;
                const deBaixo = p.close < lv, deCima = p.close > lv;
                if (deBaixo && x.close < lv) add(`${nome}_rejeita`, i, -1);
                if (deCima && x.close > lv) add(`${nome}_rejeita`, i, 1);
                if (deBaixo && x.close > lv) add(`${nome}_rompe`, i, 1);
                if (deCima && x.close < lv) add(`${nome}_rompe`, i, -1);
            });
            // Máx/mín do dia anterior.
            const ant = anterior.get(diaDe(x.time));
            if (ant) {
                if (x.high >= ant.hi && p.high < ant.hi) add(x.close < ant.hi ? 'dia_max_rejeita' : 'dia_max_rompe', i, x.close < ant.hi ? -1 : 1);
                if (x.low <= ant.lo && p.low > ant.lo) add(x.close > ant.lo ? 'dia_min_rejeita' : 'dia_min_rompe', i, x.close > ant.lo ? 1 : -1);
            }
            // Compressão: 15 min antes com faixa total < 2 ATR, e agora um candle ≥ 1,5 ATR.
            const jan = m1.slice(i - 15, i);
            const faixa = Math.max(...jan.map((c) => c.high)) - Math.min(...jan.map((c) => c.low));
            if (faixa < 2 * a && Math.abs(x.close - x.open) >= 1.5 * a) { add('compressao_segue', i, cx); add('compressao_volta', i, -cx); }
            // Virada da hora: x é o candle :59; movimento de :55 a :59 ≥ 2 ATR.
            if (new Date(x.time).getUTCMinutes() === 59 && x.time - m1[i - 4].time === 4 * MIN) {
                const mov = (x.close - m1[i - 4].open) / a;
                if (Math.abs(mov) >= 2) { add('virada_hora_volta', i, -Math.sign(mov)); add('virada_hora_segue', i, Math.sign(mov)); }
            }
            // Aceleração: 3 candles da mesma cor, corpos crescentes.
            const c2 = m1[i - 2], b2 = Math.abs(c2.close - c2.open), b1 = Math.abs(p.close - p.open), b0 = Math.abs(x.close - x.open);
            if (cx && cor(p) === cx && cor(c2) === cx && b0 > b1 && b1 > b2 && b0 >= a) { add('aceleracao_segue', i, cx); add('aceleracao_cansa', i, -cx); }
            // 13/10 (janela da manhã): as estratégias de minuto já conhecidas, para ver como vão só nesse horário.
            if (x.time % 300_000 === 60_000) { const mv = (x.close - p.open) / a; if (Math.abs(mv) >= 2.5) add('devolucao', i, -Math.sign(mv)); }
            if (cx && (x.high - x.low) >= 3 * a) add('pico_volta', i, -cx);
            // Sequência de cores: N velas iguais → inverte ou segue.
            let seq = 1; while (seq < 8 && cor(m1[i - seq]) === cx && cx) seq++;
            if (seq >= 4 && seq <= 7) { add(`sequencia${seq}_inverte`, i, -cx); add(`sequencia${seq}_segue`, i, cx); }
            // Esticada na hora: movimento de 60 min ≥ 4 ATR → volta ou segue.
            const m60 = (x.close - m1[i - 15].close) / a; // 15 min (a janela que temos garantida acima)
            if (Math.abs(m60) >= 4) { add('esticada15_volta', i, -Math.sign(m60)); add('esticada15_segue', i, Math.sign(m60)); }
            // 13/10: estratégias populares de opções binárias, nos quadrantes de 5 min (minuto do quadrante = q, 0 a 4).
            const q = Math.floor((x.time % 300_000) / MIN);
            const cores = (ini, n) => Array.from({ length: n }, (_, k) => cor(m1[i - (q - ini) + k] || x));
            const soma = (l) => l.reduce((a2, b2) => a2 + b2, 0);
            if (q === 4 && x.time - m1[i - 4].time === 4 * MIN) {
                const tres = soma(cores(2, 3)), cinco = soma(cores(0, 5));
                if (tres) { add('mhi1_minoria', i, -Math.sign(tres)); add('mhi1_maioria', i, Math.sign(tres)); }
                if (cinco) { add('milhao_maioria', i, Math.sign(cinco)); add('milhao_minoria', i, -Math.sign(cinco)); }
            }
            // MHI 2 e 3: mesmas 3 velas do quadrante anterior, entrando na 2ª ou 3ª vela do novo quadrante.
            for (const [nome, qq] of [['mhi2', 0], ['mhi3', 1]]) {
                if (q === qq && x.time - m1[i - qq - 3].time === (qq + 3) * MIN) {
                    const tres = soma([1, 2, 3].map((k) => cor(m1[i - qq - k])));
                    if (tres) { add(`${nome}_minoria`, i, -Math.sign(tres)); add(`${nome}_maioria`, i, Math.sign(tres)); }
                }
            }
            // Torres Gêmeas: a 5ª vela repete a cor da 1ª (entra no fechamento da 4ª).
            if (q === 3 && x.time - m1[i - 3].time === 3 * MIN) add('torres_gemeas', i, cor(m1[i - 3]));
            // Padrão 23: a 2ª vela repete a cor da 1ª (entra no fechamento da 1ª).
            if (q === 0) add('padrao23', i, cx);
            // Abertura de Londres (04h de Brasília) e de Nova York (09h30 de Brasília): direção dos 15 primeiros minutos.
            for (const [nome, hm] of [['abertura_londres', 4 * 60], ['abertura_ny', 9 * 60 + 30]]) {
                const d = new Date(x.time + MIN - 3 * 3600_000), mm = d.getUTCHours() * 60 + d.getUTCMinutes();
                if (mm === hm + 15) { const mv = Math.sign(x.close - m1[i - 14].open); add(`${nome}_segue`, i, mv); add(`${nome}_volta`, i, -mv); }
            }
        }

        // Humor dos traders no ativo de operar ("-op"): valor = fração comprando.
        const { rows: hum } = await pool.query(`SELECT at, valor, dados->>'instrument' AS inst FROM exnova_extras WHERE tipo = 'humor' AND active_id = $1 ORDER BY at`, [OP_IDS[pair]]);
        const hs = hum.filter((h) => h.inst !== 'binary-option').map((h) => [new Date(h.at).getTime(), Number(h.valor) > 1 ? Number(h.valor) / 100 : Number(h.valor)]).filter((h) => Number.isFinite(h[1]));
        const vals = hs.map((h) => h[1]).sort((p, q) => p - q);
        console.log(`PROF_HUMOR ${pair} registros=${hs.length} de=${hs[0] ? new Date(hs[0][0]).toISOString().slice(0, 16) : '-'} quantis=${JSON.stringify([0.05, 0.25, 0.5, 0.75, 0.95].map((q) => vals[Math.floor(q * (vals.length - 1))]))}`);
        if (hs.length > 500) {
            let k = 0;
            const valorEm = (t) => { while (k + 1 < hs.length && hs[k + 1][0] <= t) k++; return hs[k][0] <= t && t - hs[k][0] <= 2 * MIN ? hs[k][1] : null; };
            const serie = new Map();
            for (let i = 0; i < m1.length - 6; i++) { const v = valorEm(m1[i].time + MIN); if (v != null) serie.set(i, v); }
            for (const [i, v] of serie) {
                const maioria = v > 0.5 ? 1 : v < 0.5 ? -1 : 0, dist = Math.abs(v - 0.5);
                if (dist >= 0.3) { add('humor_extremo80_contra', i, -maioria); add('humor_extremo80_segue', i, maioria); }
                else if (dist >= 0.2) { add('humor_extremo70_contra', i, -maioria); add('humor_extremo70_segue', i, maioria); }
                const v5 = serie.get(i - 5);
                if (v5 != null && Math.abs(v - v5) >= 0.1) { const s = Math.sign(v - v5); add('humor_virada_segue', i, s); add('humor_virada_contra', i, -s); }
                // Preço e humor em lados opostos: preço subiu 5 min e a maioria foi para venda (ou o contrário).
                if (atr[i] && i >= 5) {
                    const mov = (m1[i].close - m1[i - 5].close) / atr[i];
                    if (Math.abs(mov) >= 1.5 && maioria && Math.sign(mov) !== maioria && dist >= 0.15) add('humor_diverge_segue_preco', i, Math.sign(mov));
                }
            }
        }
    }

    // Avaliação + controle embaralhado.
    const avalia = (l) => {
        const ts = l.map((s) => s.t).sort((p, q) => p - q), q1 = ts[Math.floor(ts.length * 0.4)], q2 = ts[Math.floor(ts.length * 0.7)];
        const f = [[0, 0], [0, 0], [0, 0]];
        for (const s of l) { const ph = s.t < q1 ? 0 : s.t < q2 ? 1 : 2; f[ph][0]++; if (s.win) f[ph][1]++; }
        const W = l.filter((s) => s.win).length, n = l.length, z = n ? (W / n - 0.5) / Math.sqrt(0.25 / n) : 0;
        const fases = f.map(([c, w]) => pct(w, c));
        const aprovada = n >= 60 && f.every(([c, w]) => c >= 15 && w / c >= 0.55) && z >= 2.5;
        return { n, acerto: pct(W, n), z: +z.toFixed(2), estudo: [f[0][0], fases[0]], confirmacao: [f[1][0], fases[1]], prova: [f[2][0], fases[2]], aprovada };
    };
    const linhas = Object.entries(todas).map(([k, l]) => ({ sinal: k, ...avalia(l) })).sort((p, q) => q.z - p.z);
    for (const r of linhas) console.log(`PROF_RESULT ${JSON.stringify(r)}`);
    const aprovadas = linhas.filter((r) => r.aprovada);
    const acaso = [];
    for (let r = 0; r < 5; r++) {
        let c = 0;
        for (const l of Object.values(todas)) {
            const res = l.map((s) => s.win).sort(() => Math.random() - 0.5);
            if (avalia(l.map((s, j) => ({ t: s.t, win: res[j] }))).aprovada) c++;
        }
        acaso.push(c);
    }
    console.log(`PROF_RESUMO hipoteses=${linhas.length} aprovadas=${aprovadas.length} por_acaso=${JSON.stringify(acaso)}`);
    console.log(`PROF_APROVADAS ${JSON.stringify(aprovadas)}`);
}

module.exports = { runProfundo };
