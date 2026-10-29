# Backtest de RSI no índice

Gerado em 29/10/2026 12:47 · 60 pregões (2026-08-03 a 2026-10-27) · candles de 5 min.

**Premissas:** Ibovespa à vista no lugar do WIN (R$ 0.20/ponto/contrato) · RSI de Wilder · decisão no
fechamento e execução na abertura seguinte · stop de 2×ATR(14) · custo de 10 pts por operação ·
entradas entre 10:30 e 16:30 · zera no fim do dia.

Colunas de robustez: positiva nas duas metades, semanas positivas e resultado **sem os 5 maiores ganhos**
(quanto sobra se os melhores dias não se repetirem).

| configuracao | operacoes | acerto_pct | total_pts | profit_factor | max_dd_pts | 1a_metade | 2a_metade | semanas_pos | sem_top5 |
|---|---|---|---|---|---|---|---|---|---|
| Cruzamento da VWAP (referência) | 129 | 29.5 | 16643 | 1.94 | 3734 | 6778 | 9864 | 9/12 | 2531 |
| Momentum RSI 9 cruzando 50 | 276 | 27.9 | 10711 | 1.35 | 4439 | 7488 | 3223 | 7/12 | -2067 |
| Cruzamento da VWAP + RSI 9 > 50 | 118 | 25.4 | 10338 | 1.67 | 2613 | 4388 | 5950 | 8/12 | -1299 |
| Momentum RSI 21 cruzando 50 | 181 | 26.5 | 10009 | 1.47 | 4306 | 5097 | 4912 | 8/12 | -1171 |
| Reversão RSI 9 (30/70) → sai no 50 | 151 | 62.3 | 9277 | 1.44 | 3245 | 3233 | 6045 | 8/12 | 1831 |
| Reversão RSI 14 (30/70) → sai no 50 | 73 | 58.9 | 8775 | 1.64 | 2810 | 5189 | 3586 | 8/12 | 2349 |
| Momentum RSI 14 cruzando 50 | 240 | 26.7 | 8154 | 1.29 | 3473 | 2806 | 5349 | 5/12 | -4304 |
| Cruzamento da VWAP + RSI 14 > 55 | 71 | 19.7 | 1418 | 1.12 | 4271 | 968 | 451 | 6/12 | -7775 |
| Reversão RSI 7 (25/75) a favor da VWAP | 14 | 50.0 | 280 | 1.14 | 1505 | -805 | 1085 | 3/12 | -1955 |
| Reversão RSI 7 (25/75) → sai no 50 | 147 | 59.2 | -406 | 0.98 | 4618 | -2267 | 1861 | 7/12 | -6436 |
| Reversão RSI 14 (20/80) → sai no 50 | 17 | 29.4 | -555 | 0.91 | 3211 | -831 | 276 | 4/12 | -6406 |
| Cruzamento da VWAP + RSI 14 > 50 | 110 | 19.1 | -1134 | 0.93 | 4382 | -1238 | 104 | 3/12 | -10054 |
| Reversão RSI 14 (30/70) a favor da VWAP | 4 | 50.0 | -1813 | 0.53 | 3820 | -2175 | 362 | 2/12 | 0 |
| Reversão RSI 2 (10/90) a favor da VWAP | 116 | 54.3 | -4659 | 0.57 | 5654 | 89 | -4748 | 5/12 | -6309 |
| Momentum RSI 14 (60/40) → sai no 50 | 148 | 34.5 | -7335 | 0.79 | 11015 | 1520 | -8855 | 5/12 | -17598 |
| Reversão RSI 2 (5/95) → sai no 50 | 270 | 51.9 | -12144 | 0.6 | 14822 | -7735 | -4409 | 2/12 | -15769 |
| Reversão RSI 2 (10/90) → sai no 50 | 412 | 52.2 | -15758 | 0.61 | 17785 | -10304 | -5454 | 3/12 | -18651 |
