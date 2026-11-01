// Sinal do OTC M1 pelo estudo dos candles (pedido do dono em 01/11: "gere o sinal toda vez que clicar em
// analisar, como se você estivesse operando de 1 em 1 minuto com todo o teste que você tem").
//
// Monta, com o histórico de candles da corretora (otc_candles), uma tabela de "o que veio depois" para cada
// combinação de 2 ou 3 características do candle (as mesmas do minerador: cores, corpo, pavios, RSI, média,
// horário...). No clique, descreve o candle atual e escolhe a direção que mais aconteceu nas situações
// iguais. Como escolher "a melhor entre muitas" engana (em candles aleatórios acha 60%+), o acerto mostrado
// no painel é o medido operando, sem ver o resultado, os 25% finais do histórico com a tabela dos 75% iniciais.
// Liga/desliga: OTC_ESTATISTICO (padrão ligado; '0' volta para a leitura técnica antiga).
const pool = require('./db');
const { descreve, prep } = require('./mineradorBacktest');

const M1 = 60_000;
const DIAS = Number(process.env.OTC_ESTAT_DIAS) || 45;
const REFAZ_MS = 6 * 3600_000;
const tabelas = {}; // ativo -> { at, tab: Map(chave -> [n, altas]), prova: { forte: [n, acertos], fraco: [n, acertos] } }
const montando = {};

function combos(keys, k) {
    const out = [];
    const rec = (s, cur) => { if (cur.length === k) return out.push(cur.slice()); for (let j = s; j < keys.length; j++) { cur.push(keys[j]); rec(j + 1, cur); cur.pop(); } };
    rec(0, []);
    return out;
}
let GRUPOS = null;
const grupos = (f) => (GRUPOS ||= (() => { const ks = Object.keys(f).filter((k) => k !== 'ativo'); return [...combos(ks, 2), ...combos(ks, 3)]; })());
const chave = (g, f) => g.map((k) => `${k}=${f[k]}`).join(' & ');

// A situação em palavras (para o cliente ler no painel).
const NOMES = {
    cor: (v) => `candle atual ${v === 'V' ? 'verde' : v === 'R' ? 'vermelho' : 'sem corpo'}`,
    cores3: (v) => `últimas 3 velas ${[...v].map((x) => (x === 'V' ? 'verde' : x === 'R' ? 'vermelha' : 'doji')).join(', ')}`,
    corpo: (v) => `corpo ${v}`,
    pavio_cima: (v) => `pavio de cima ${v}`,
    pavio_baixo: (v) => `pavio de baixo ${v}`,
    fechou: (v) => `fechou ${v.replace('_', ' ')} da vela`,
    sequencia: (v) => `${v} velas seguidas da mesma cor`,
    z_media: (v) => (v === '0' ? 'preço perto da média' : `preço ${v.startsWith('-') ? 'abaixo' : 'acima'} da média (${v})`),
    rsi: (v) => `RSI ${v}`,
    tendencia: (v) => `tendência de ${v}`,
    hora: (v) => `${(Number(v) + 21) % 24}h de Brasília`,
    minuto: (v) => `minuto ${v} do bloco de 5`,
    dia: (v) => ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][Number(v)] || `dia ${v}`,
    vs_anterior: (v) => (v === 'acima_max' ? 'fechou acima da máxima anterior' : v === 'abaixo_min' ? 'fechou abaixo da mínima anterior' : 'dentro da vela anterior'),
};
const emPalavras = (k) => k.split(' & ').map((p) => { const [a, b] = p.split('='); return NOMES[a] ? NOMES[a](b) : p; }).join(', ');

// Limite inferior de Wilson (95%): o acerto "garantido" levando em conta o tamanho da amostra.
function wilson(w, n) {
    if (!n) return 0;
    const z = 1.96, p = w / n, d = 1 + z * z / n;
    return (p + z * z / (2 * n) - z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
}

// Escolhe a direção para a descrição f do candle, usando só as contagens da tabela [n, altas].
function escolhe(tab, f) {
    let forte = null, reserva = null;
    for (const g of grupos(f)) {
        const k = chave(g, f), v = tab.get(k);
        if (!v || v[0] < 100) continue;
        const [n, u] = v, alta = u * 2 >= n, w = alta ? u : n - u, lb = wilson(w, n);
        if (!reserva || lb > reserva.lb) reserva = { k, alta, w, n, lb };
        if (w / n >= 0.56 && (!forte || lb > forte.lb)) forte = { k, alta, w, n, lb };
    }
    return forte ? { ...forte, forte: true } : reserva && { ...reserva, forte: false };
}

function conta(tab, S) {
    for (const s of S) for (const g of grupos(s.f)) {
        const k = chave(g, s.f);
        let v = tab.get(k);
        if (!v) tab.set(k, (v = [0, 0]));
        v[0]++; v[1] += s.y;
    }
}

async function monta(ativo) {
    const { rows } = await pool.query(
        `SELECT time, open, high, low, close FROM otc_candles WHERE active = $1 AND time > NOW() - ($2::int * INTERVAL '1 day') ORDER BY time`,
        [ativo, DIAS]);
    const c = rows.slice(0, -1).map((r) => ({ time: new Date(r.time).getTime(), open: +r.open, high: +r.high, low: +r.low, close: +r.close }));
    if (c.length < 5000) { console.log(`OTC_ESTAT ${ativo}: poucos candles (${c.length})`); return null; }
    const P = prep(c), S = [];
    for (let i = 60; i < c.length - 1; i++) {
        if (c[i + 1].time - c[i].time !== M1 || c[i].time - c[i - 20].time !== 20 * M1) continue;
        if (c[i + 1].close === c[i + 1].open) continue;
        S.push({ t: c[i].time, f: descreve(c, i, P, ativo, M1), y: c[i + 1].close > c[i + 1].open ? 1 : 0 });
    }
    // Prova honesta: monta a tabela só com os primeiros 75% e "opera" os 25% finais sem ver o resultado.
    // O acerto de cada tipo de sinal (com padrão / sem padrão) que aparece no painel vem daqui.
    const corte = Math.floor(S.length * 0.75), tab = new Map();
    for (let a = 0; a < corte; a += 300) { conta(tab, S.slice(a, Math.min(a + 300, corte))); await new Promise((r) => setImmediate(r)); }
    const prova = { forte: [0, 0], fraco: [0, 0] };
    for (let idx = corte; idx < S.length; idx++) {
        if (idx % 300 === 0) await new Promise((r) => setImmediate(r));
        const e = escolhe(tab, S[idx].f);
        if (!e) continue;
        const b = prova[e.forte ? 'forte' : 'fraco'];
        b[0]++; b[1] += (e.alta ? 1 : 0) === S[idx].y ? 1 : 0;
    }
    // Para o sinal ao vivo a tabela usa tudo.
    for (let a = corte; a < S.length; a += 300) { conta(tab, S.slice(a, Math.min(a + 300, S.length))); await new Promise((r) => setImmediate(r)); }
    const pc = (b) => (b[0] ? +(100 * b[1] / b[0]).toFixed(1) : null);
    console.log(`OTC_ESTAT ${ativo}: ${S.length} candles, ${tab.size} situações; prova nos últimos 25% (desde ${new Date(S[corte].t).toISOString().slice(0, 16)}): com padrão ${pc(prova.forte)}% de ${prova.forte[0]}, sem padrão ${pc(prova.fraco)}% de ${prova.fraco[0]}`);
    return { at: Date.now(), tab, prova };
}

function garante(ativo) {
    const t = tabelas[ativo];
    if ((!t || Date.now() - t.at > REFAZ_MS) && !montando[ativo]) {
        montando[ativo] = monta(ativo)
            .then((r) => { if (r) tabelas[ativo] = r; else if (!t) tabelas[ativo] = { at: Date.now(), tab: null }; })
            .catch((err) => console.error(`OTC_ESTAT ${ativo} erro:`, err.message))
            .finally(() => { montando[ativo] = null; });
    }
    return tabelas[ativo]?.tab ? tabelas[ativo] : null;
}

// Sinal do próximo candle. `candles` = M1 da corretora terminando no candle atual (quase fechado).
function decide(t, candles, ativo) {
    const c = candles, i = c.length - 1;
    if (i < 60 || c[i].time - c[i - 20].time !== 20 * M1) return null;
    const e = escolhe(t.tab, descreve(c, i, prep(c), ativo, M1));
    if (!e) return null;
    const [n, w] = t.prova[e.forte ? 'forte' : 'fraco'];
    const pct = n ? Math.round((100 * w) / n) : null;
    // Confiança pelo acerto real medido na prova (dias que a tabela não tinha visto).
    const confidence = pct != null && n >= 200 && pct >= 58 ? 'Alta' : pct != null && n >= 200 && pct >= 54 ? 'Média' : 'Baixa';
    const sit = emPalavras(e.k);
    const explicacao = e.forte
        ? `Situação parecida com padrão: ${sit}. Nesses casos o candle seguinte foi para esse lado ${Math.round((100 * e.w) / e.n)}% das ${e.n} vezes; testado em dias que o estudo não tinha visto, esse tipo de sinal acertou ${pct}% (${n} sinais).`
        : `Sem padrão forte agora (${sit}). Testado em dias que o estudo não tinha visto, esse tipo de sinal acertou ${pct}% (${n} sinais), perto de cara ou coroa.`;
    return {
        direction: e.alta ? 'COMPRA' : 'VENDA', confidence, leitura: e.forte ? 'estat_otc' : 'estat_otc_fraco',
        historico: { pct, n, regra: e.k, situacao: { pct: Math.round((100 * e.w) / e.n), n: e.n } },
        explicacao, price: c[i].close,
    };
}

async function sinalOtcM1(ativo, buscaCandles) {
    if (process.env.OTC_ESTATISTICO === '0') return null;
    const t = garante(ativo);
    if (!t) return null; // tabela ainda montando: o painel usa a leitura técnica antiga
    const candles = await buscaCandles(ativo, 'M1', 120);
    if (!candles || candles.length < 61) return null;
    const out = decide(t, candles, ativo);
    if (out) console.log(`OTC_ESTAT sinal ${ativo} ${out.direction} ${out.confidence} ${out.historico.pct}%/${out.historico.n} ${out.historico.regra}`);
    return out && { pair: ativo, timeframe: 'M1', ...out };
}

// Já deixa as tabelas prontas depois que o servidor sobe.
function preparar(ativos) {
    if (process.env.OTC_ESTATISTICO === '0') return;
    // Um ativo por vez, para não pesar no servidor.
    setTimeout(async () => { for (const a of ativos) { garante(a); await montando[a]; } }, 60_000).unref?.();
}

module.exports = { sinalOtcM1, preparar, decide };
