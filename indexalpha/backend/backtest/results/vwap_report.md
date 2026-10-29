# Backtest de VWAP no índice

Gerado em 29/10/2026 12:59 · 59 pregões (2026-08-04 a 2026-10-27) · candles de 5 min.

**Premissas:** BOVA11 em pontos de índice no lugar do WIN (R$ 0.20/ponto/contrato) · VWAP ancorada no pregão,
com o volume financeiro real do BOVA11 · bandas = desvio padrão
ponderado por volume · decisão no fechamento e execução na abertura seguinte · custo de 10 pts por operação
· entradas só entre 10:30 e 16:30 · zera no fim do dia.

Ordenado pelo resultado total. "1a/2a metade" = soma de pontos na primeira e na segunda metade das operações:
uma configuração confiável precisa ser positiva nas duas.

| configuracao | operacoes | por_dia | acerto_pct | total_pts | media_pts | profit_factor | max_dd_pts | 1a_metade | 2a_metade |
|---|---|---|---|---|---|---|---|---|---|
| Rompimento banda 2σ (stop VWAP, alvo 2R) | 63 | 1.1 | 44.4 | 3571 | 56.7 | 1.15 | 7139 | 5990 | -2419 |
| Pullback na VWAP, tendência de 12 candles | 47 | 0.8 | 46.8 | 1856 | 39.5 | 1.14 | 8445 | 3595 | -1740 |
| Cruzamento confirmado (0,5σ) | 141 | 2.4 | 29.1 | 1673 | 11.9 | 1.05 | 9403 | 2677 | -1004 |
| Rompimento banda 1σ (stop VWAP, alvo 2R) | 137 | 2.3 | 38.0 | 1561 | 11.4 | 1.04 | 11486 | 4586 | -3025 |
| Index_Score + VWAP como filtro de lado | 131 | 2.2 | 38.9 | 546 | 4.2 | 1.01 | 16428 | 6436 | -5890 |
| Cruzamento da VWAP | 122 | 2.1 | 22.1 | 379 | 3.1 | 1.02 | 5261 | 353 | 26 |
| Reversão banda 1,5σ → VWAP | 143 | 2.4 | 37.1 | -333 | -2.3 | 0.99 | 5731 | -3050 | 2717 |
| Index_Score sem VWAP (referência) | 153 | 2.6 | 39.2 | -632 | -4.1 | 0.99 | 15268 | 7297 | -7929 |
| Pullback na VWAP, tendência de 6 candles | 63 | 1.1 | 41.3 | -1197 | -19.0 | 0.93 | 9455 | 469 | -1667 |
| Reversão banda 2,5σ → VWAP | 46 | 0.8 | 21.7 | -1605 | -34.9 | 0.83 | 4096 | -1798 | 193 |
| Reversão banda 2σ → VWAP | 96 | 1.6 | 26.0 | -7076 | -73.7 | 0.68 | 7102 | -2665 | -4411 |
| Reversão banda 1σ → VWAP | 174 | 2.9 | 33.9 | -12048 | -69.2 | 0.68 | 12048 | -5220 | -6828 |
