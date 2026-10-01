// Estratégias só do Ouro (XAUUSD) no M1, escolhidas no backtest com candles reais da Exnova
// (29/09–01/10, ~1.960 candles): a regra geral deu 49% no Ouro, estas deram ~61–62%.
// Ordem de prioridade (a mais estável primeiro). Desliga com OURO_ESTRATEGIAS=0.
const opp = (d) => (d === 'COMPRA' ? 'VENDA' : d === 'VENDA' ? 'COMPRA' : null);
const color = (c) => (c.close > c.open ? 'COMPRA' : c.close < c.open ? 'VENDA' : null);

// 1) Rejeição de pavio a favor da tendência (pa_rejeicao_pavio_tendencia: 135 casos, 61,5%):
// o candle atual tem pavio >= 60% do tamanho rejeitando um lado, e a direção bate com a EMA9×EMA21.
function rejeicaoPavioTendencia(forming, technical) {
    const r = (forming.high - forming.low) || 1e-9;
    const dn = Math.min(forming.open, forming.close) - forming.low;
    const up = forming.high - Math.max(forming.open, forming.close);
    const d = dn >= r * 0.6 ? 'COMPRA' : up >= r * 0.6 ? 'VENDA' : null;
    const { ema9, ema21 } = technical || {};
    if (!d || ema9 == null || ema21 == null) return null;
    return (d === 'COMPRA' ? ema9 > ema21 : ema9 < ema21) ? d : null;
}

// 2) Lateralização + esticada que rompe a faixa -> contra (lat_contra_L5_f2_e15_rompe: 95 casos, 62,1%).
function lateralEsticadaContra(closed, f, L = 5, faixa = 2, estica = 1.5) {
    if (closed.length < L + 20) return null;
    const base = closed.slice(-(L + 20), -L);
    const avgRange = base.reduce((a, c) => a + (c.high - c.low), 0) / base.length;
    const avgBody = base.reduce((a, c) => a + Math.abs(c.close - c.open), 0) / base.length;
    if (!(avgRange > 0) || !(avgBody > 0)) return null;
    const lat = closed.slice(-L);
    const hi = Math.max(...lat.map((c) => c.high)), lo = Math.min(...lat.map((c) => c.low));
    if (hi - lo > faixa * avgRange) return null;
    const body = f.close - f.open;
    if (Math.abs(body) < estica * avgBody) return null;
    if (!(body > 0 ? f.close > hi : f.close < lo)) return null;
    return opp(body > 0 ? 'COMPRA' : 'VENDA');
}

// 3) Movimento forte + candle de correção com pavio -> retoma o movimento (corr_retoma_T4_m2_qq: 61 casos, 62,3%).
function correcaoRetoma(closed, f, T = 4, m = 2) {
    if (closed.length < T + 20) return null;
    const base = closed.slice(-(T + 20), -T);
    const avgRange = base.reduce((a, c) => a + (c.high - c.low), 0) / base.length;
    if (!(avgRange > 0)) return null;
    const mov = closed.slice(-T);
    const saldo = mov[mov.length - 1].close - mov[0].open;
    if (Math.abs(saldo) < m * avgRange) return null;
    const trend = saldo > 0 ? 'COMPRA' : 'VENDA';
    if (mov.filter((c) => color(c) === trend).length < Math.ceil(T * 0.6)) return null;
    if (color(f) !== opp(trend)) return null;
    const range = f.high - f.low;
    if (!(range > 0)) return null;
    const up = f.high - Math.max(f.open, f.close), dn = Math.min(f.open, f.close) - f.low;
    if (Math.max(up, dn) < 0.3 * range) return null;
    return trend;
}

function sinalOuro(closed, forming, technical) {
    if (process.env.OURO_ESTRATEGIAS === '0') return null;
    const r = rejeicaoPavioTendencia(forming, technical);
    if (r) return { direction: r, leitura: 'ouro_rejeicao_pavio' };
    const l = lateralEsticadaContra(closed, forming);
    if (l) return { direction: l, leitura: 'ouro_lateral_contra' };
    const c = correcaoRetoma(closed, forming);
    if (c) return { direction: c, leitura: 'ouro_correcao_retoma' };
    return null;
}

module.exports = { sinalOuro, rejeicaoPavioTendencia, lateralEsticadaContra, correcaoRetoma };
