// Estudo de padrões de candles: para cada padrão (cor, tamanho e pavio dos últimos candles +
// tendência), conta no histórico para onde o candle seguinte foi. No sinal, o padrão que está se
// formando agora é procurado nessa tabela.

// Tamanho do corpo em relação à média dos últimos 20: p = pequeno, n = normal, g = grande.
function sizeOf(c, avg) {
    const b = Math.abs(c.close - c.open);
    if (!(avg > 0)) return 'n';
    return b < 0.5 * avg ? 'p' : b < 1.5 * avg ? 'n' : 'g';
}
const colorOf = (c) => (c.close > c.open ? 'A' : c.close < c.open ? 'B' : 'D'); // alta/baixa/doji
// Pavio dominante: s = rejeição em cima (pavio superior grande), i = embaixo, - = nenhum.
function wickOf(c) {
    const range = c.high - c.low;
    if (!(range > 0)) return '-';
    const up = c.high - Math.max(c.open, c.close);
    const dn = Math.min(c.open, c.close) - c.low;
    if (up >= 0.45 * range && up > dn * 1.5) return 's';
    if (dn >= 0.45 * range && dn > up * 1.5) return 'i';
    return '-';
}
function ema(values, period) {
    const k = 2 / (period + 1);
    let e = values[0];
    for (let i = 1; i < values.length; i++) e = values[i] * k + e * (1 - k);
    return e;
}

// Variantes de chave (qual combinação de informações define o "padrão").
const KEYS = {
    // últimos 2 fechados + o atual: cor e tamanho
    c3: (closed, f, avg) => [...closed.slice(-2), f].map((c) => colorOf(c) + sizeOf(c, avg)).join('.'),
    // o mesmo + tendência (acima/abaixo da média de 20)
    c3t: (closed, f, avg) => KEYS.c3(closed, f, avg) + '|' + (f.close >= ema(closed.slice(-40).map((c) => c.close), 20) ? 'up' : 'dn'),
    // atual com pavio + último fechado + tendência
    fw: (closed, f, avg) => `${colorOf(closed[closed.length - 1])}${sizeOf(closed[closed.length - 1], avg)}.${colorOf(f)}${sizeOf(f, avg)}${wickOf(f)}|`
        + (f.close >= ema(closed.slice(-40).map((c) => c.close), 20) ? 'up' : 'dn'),
    // últimos 3 fechados + atual com pavio (mais detalhado, precisa de mais dados)
    c4w: (closed, f, avg) => [...closed.slice(-3), f].map((c) => colorOf(c) + sizeOf(c, avg) + wickOf(c)).join('.'),
};

function keyFor(variant, closed, forming) {
    const recent = closed.slice(-20);
    const avg = recent.reduce((a, c) => a + Math.abs(c.close - c.open), 0) / Math.max(recent.length, 1);
    return KEYS[variant](closed, forming, avg);
}

// Monta a tabela: chave -> { a: próximos de alta, b: próximos de baixa }.
// `candles` em ordem; usa candles contínuos (sem buraco) de 1 minuto.
function buildTable(candles, variant, tfMs = 60_000, from = 0, to = candles.length) {
    const table = new Map();
    for (let k = Math.max(from, 41); k < to - 1; k++) {
        const f = candles[k], next = candles[k + 1];
        if (next.time - f.time !== tfMs || f.time - candles[k - 41].time !== 41 * tfMs) continue;
        if (next.close === next.open) continue;
        const key = keyFor(variant, candles.slice(k - 41, k), f);
        const e = table.get(key) || { a: 0, b: 0 };
        if (next.close > next.open) e.a++; else e.b++;
        table.set(key, e);
    }
    return table;
}

// Direção que o padrão indica, se a amostra for suficiente e a vantagem clara.
function lookup(table, key, minN = 40, minWr = 0.58) {
    const e = table && table.get(key);
    if (!e) return null;
    const n = e.a + e.b;
    if (n < minN) return null;
    const wr = Math.max(e.a, e.b) / n;
    if (wr < minWr) return null;
    return { direction: e.a > e.b ? 'COMPRA' : 'VENDA', n, wr: +(wr * 100).toFixed(1), key };
}

module.exports = { keyFor, buildTable, lookup, KEYS };
