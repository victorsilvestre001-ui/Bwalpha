const technicalCache = {};
const TIMEFRAME_MINUTES = { M1: 1, M5: 5 };

async function getTechnicalSignal(pairLabel, timeframeLabel) {
    // Alinha o cache com o início da vela atual (candle), não com um tempo fixo.
    // Assim cada vela nova (M1 = a cada 1 min, M5 = a cada 5 min) gera um cálculo
    // fresco de verdade, e cliques dentro da mesma vela reaproveitam o resultado.
    const intervalMs = TIMEFRAME_MINUTES[timeframeLabel] * 60 * 1000;
    const candleBucket = Math.floor(Date.now() / intervalMs);
    const cacheKey = `${pairLabel}_${timeframeLabel}_${candleBucket}`;

    const cached = technicalCache[cacheKey];
    if (cached) return cached;

    const closes = await fetchIntradayCloses(pairLabel, timeframeLabel);
    if (!closes || closes.length < 30) return null;

    const ema9Series = emaSeries(closes, 9);
    const ema21Series = emaSeries(closes, 21);
    const ema9 = ema9Series[ema9Series.length - 1];
    const ema21 = ema21Series[ema21Series.length - 1];
    const rsiVal = rsiLast(closes, 14);
    const macdHist = macdHistogramLast(closes);

    let bullVotes = 0, bearVotes = 0;
    if (ema9 != null && ema21 != null) {
        if (ema9 > ema21) bullVotes += 1; else bearVotes += 1;
    }
    if (macdHist != null) {
        if (macdHist > 0) bullVotes += 1; else bearVotes += 1;
    }
    if (rsiVal != null) {
        if (rsiVal < 30) bullVotes += 1;
        else if (rsiVal > 70) bearVotes += 1;
        else if (rsiVal >= 50) bullVotes += 0.5;
        else bearVotes += 0.5;
    }

    const direction = bullVotes >= bearVotes ? 'COMPRA' : 'VENDA';
    const diff = Math.abs(bullVotes - bearVotes);
    const confidence = diff >= 2 ? 'Alta' : diff >= 1 ? 'Média' : 'Baixa';

    const result = {
        pair: pairLabel,
        timeframe: timeframeLabel,
        price: closes[closes.length - 1],
        ema9,
        ema21,
        rsi: rsiVal,
        macdHistogram: macdHist,
        direction,
        confidence,
    };

    technicalCache[cacheKey] = result;

    // Limpeza simples: mantém só as últimas ~20 velas em cache por par+timeframe
    const prefix = `${pairLabel}_${timeframeLabel}_`;
    const keys = Object.keys(technicalCache).filter((k) => k.startsWith(prefix));
    if (keys.length > 20) {
        keys.sort();
        delete technicalCache[keys[0]];
    }

    return result;
