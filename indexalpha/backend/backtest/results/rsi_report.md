# Backtest de RSI no índice

Gerado em 29/10/2026 12:59 · 59 pregões (2026-08-04 a 2026-10-27) · candles de 5 min.

**Premissas:** BOVA11 em pontos de índice no lugar do WIN (R$ 0.20/ponto/contrato; o ^BVSP calculado
tem autocorrelação artificial que distorce o resultado) · RSI de Wilder · decisão no
fechamento e execução na abertura seguinte · stop de 2×ATR(14) · custo de 10 pts por operação ·
entradas entre 10:30 e 16:30 · zera no fim do dia.

Colunas de robustez: positiva nas duas metades, semanas positivas e resultado **sem os 5 maiores ganhos**
(quanto sobra se os melhores dias não se repetirem).

| configuracao | operacoes | acerto_pct | total_pts | profit_factor | max_dd_pts | 1a_metade | 2a_metade | semanas_pos | sem_top5 |
|---|---|---|---|---|---|---|---|---|---|
| Momentum RSI 9 cruzando 50 | 257 | 29.6 | 10879 | 1.39 | 3751 | 1754 | 9125 | 8/12 | -1099 |
| Momentum RSI 21 cruzando 50 | 171 | 25.7 | 8397 | 1.38 | 3240 | 3147 | 5250 | 6/12 | -3502 |
| Reversão RSI 14 (30/70) → sai no 50 | 65 | 63.1 | 7670 | 1.56 | 3421 | 2433 | 5237 | 9/12 | 765 |
| Momentum RSI 14 cruzando 50 | 221 | 26.7 | 6142 | 1.22 | 3988 | 109 | 6033 | 5/12 | -5492 |
| Reversão RSI 9 (30/70) → sai no 50 | 139 | 63.3 | 2383 | 1.1 | 5011 | -1388 | 3771 | 4/12 | -4554 |
| Cruzamento da VWAP (referência) | 116 | 23.3 | 2098 | 1.1 | 5091 | -928 | 3026 | 6/12 | -9287 |
| Reversão RSI 7 (25/75) a favor da VWAP | 19 | 47.4 | 1090 | 1.32 | 1932 | -562 | 1652 | 5/12 | -2845 |
| Cruzamento da VWAP + RSI 9 > 50 | 104 | 21.2 | -1661 | 0.91 | 5190 | -2223 | 562 | 4/12 | -11929 |
| Reversão RSI 14 (30/70) a favor da VWAP | 4 | 50.0 | -1882 | 0.62 | 4973 | -2406 | 524 | 2/12 | 0 |
| Reversão RSI 2 (10/90) a favor da VWAP | 128 | 57.0 | -2564 | 0.72 | 4071 | -525 | -2039 | 3/12 | -4171 |
| Reversão RSI 14 (20/80) → sai no 50 | 15 | 26.7 | -2647 | 0.64 | 5393 | -2587 | -60 | 3/12 | -7258 |
| Reversão RSI 7 (25/75) → sai no 50 | 133 | 59.4 | -3229 | 0.87 | 7846 | -5958 | 2729 | 5/12 | -9533 |
| Cruzamento da VWAP + RSI 14 > 55 | 71 | 19.7 | -4081 | 0.72 | 5988 | -3450 | -631 | 4/12 | -12755 |
| Cruzamento da VWAP + RSI 14 > 50 | 100 | 18.0 | -5807 | 0.69 | 7955 | -5063 | -745 | 2/12 | -14877 |
| Reversão RSI 2 (5/95) → sai no 50 | 255 | 58.0 | -5906 | 0.76 | 9351 | -5131 | -775 | 4/12 | -9415 |
| Reversão RSI 2 (10/90) → sai no 50 | 408 | 57.1 | -12387 | 0.68 | 15632 | -8989 | -3398 | 4/12 | -15478 |
| Momentum RSI 14 (60/40) → sai no 50 | 144 | 33.3 | -12405 | 0.69 | 16210 | -287 | -12118 | 5/12 | -21798 |
