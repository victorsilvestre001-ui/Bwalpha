# Backtest da Teoria de Dow (topos e fundos)

Gerado em 29/10/2026 14:44 · 59 pregões (2026-08-04 a 2026-10-27).

**Instrumento:** BOVA11 em pontos de índice (R$ 0.20/ponto no WIN), com volume real do ETF.
**Regras:** topo/fundo = pivô de N candles (só usado depois de confirmado) · alta = 2 topos e 2 fundos subindo ·
continuação = rompe o último topo a favor da tendência · reversão = primeiro topo mais alto numa baixa (e o espelho) ·
stop no último fundo/topo, movido a cada novo fundo mais alto/topo mais baixo · volume confirma = candle do rompimento
com volume > 1.2× a média de 20 · custo de 10 pts · entradas 10:30–16:30 · zera no fim do dia.

| configuracao | operacoes | por_dia | acerto_pct | total_pts | profit_factor | max_dd_pts | 1a_metade | 2a_metade | semanas_pos | sem_top5 |
|---|---|---|---|---|---|---|---|---|---|---|
| 5min · pivô 3 · reversão | 66 | 1.1 | 51.5 | 10087 | 1.84 | 3264 | 9551 | 536 | 4/12 | 979 |
| 5min · pivô 2 · reversão | 76 | 1.3 | 50.0 | 8533 | 1.62 | 4699 | 6557 | 1976 | 7/12 | 246 |
| 5min · pivô 5 · reversão | 49 | 0.8 | 46.9 | 7403 | 1.65 | 2458 | 2179 | 5224 | 7/12 | -3958 |
| 15min · pivô 2 · reversão | 30 | 0.5 | 56.7 | 5280 | 1.72 | 2067 | 1745 | 3535 | 7/12 | -4374 |
| 5min · pivô 2 · reversão · volume confirma | 26 | 0.4 | 46.2 | 4056 | 2.21 | 1259 | 1427 | 2629 | 8/12 | -1610 |
| 5min · pivô 3 · reversão · volume confirma | 17 | 0.3 | 47.1 | -52 | 0.99 | 2087 | 784 | -836 | 6/12 | -3467 |
| 5min · pivô 5 · reversão · volume confirma | 16 | 0.3 | 50.0 | -77 | 0.98 | 2954 | 1380 | -1456 | 4/12 | -4524 |
| 5min · pivô 5 · continuação | 36 | 0.6 | 47.2 | -118 | 0.99 | 3609 | -126 | 8 | 6/12 | -6467 |
| 15min · pivô 2 · reversão · volume confirma | 9 | 0.2 | 44.4 | -608 | 0.85 | 2035 | -253 | -355 | 3/12 | -4048 |
| 5min · pivô 3 · continuação · volume confirma | 31 | 0.5 | 38.7 | -1811 | 0.8 | 4297 | 226 | -2038 | 4/12 | -7254 |
| 15min · pivô 2 · continuação · volume confirma | 10 | 0.2 | 30.0 | -2381 | 0.55 | 3910 | -397 | -1984 | 2/12 | -5070 |
| 15min · pivô 5 · continuação | 15 | 0.3 | 53.3 | -2415 | 0.6 | 3387 | -3010 | 595 | 3/12 | -5895 |
| 15min · pivô 2 · continuação | 24 | 0.4 | 41.7 | -3049 | 0.69 | 5686 | 1671 | -4720 | 5/12 | -9288 |
| 5min · pivô 2 · continuação · volume confirma | 41 | 0.7 | 31.7 | -3643 | 0.67 | 3955 | -717 | -2927 | 3/12 | -9288 |
| 5min · pivô 3 · continuação | 63 | 1.1 | 41.3 | -3941 | 0.81 | 7915 | -224 | -3717 | 5/12 | -12812 |
| 5min · pivô 2 · continuação | 98 | 1.7 | 36.7 | -4545 | 0.83 | 12026 | 5386 | -9931 | 5/12 | -13632 |
| 15min · pivô 5 · reversão | 11 | 0.2 | 36.4 | -4713 | 0.34 | 5516 | 508 | -5221 | 4/12 | -7030 |
| 5min · pivô 5 · continuação · volume confirma | 16 | 0.3 | 18.8 | -4868 | 0.24 | 5611 | -2087 | -2781 | 3/12 | -6124 |
| 15min · pivô 5 · continuação · volume confirma | 8 | 0.1 | 25.0 | -4905 | 0.07 | 5251 | -2732 | -2173 | 2/12 | -4032 |
| 15min · pivô 3 · reversão | 22 | 0.4 | 40.9 | -5037 | 0.51 | 7178 | -1506 | -3531 | 3/12 | -9534 |
| 15min · pivô 5 · reversão · volume confirma | 3 | 0.1 | 0.0 | -5771 | 0.0 | 5771 | -396 | -5374 | 0/12 | 0 |
| 15min · pivô 3 · continuação | 24 | 0.4 | 54.2 | -5905 | 0.5 | 9509 | -2129 | -3776 | 6/12 | -11042 |
| 15min · pivô 3 · continuação · volume confirma | 13 | 0.2 | 38.5 | -5932 | 0.34 | 8204 | 429 | -6361 | 4/12 | -9038 |
| 15min · pivô 3 · reversão · volume confirma | 7 | 0.1 | 14.3 | -6625 | 0.09 | 6625 | -477 | -6148 | 0/12 | -5102 |
