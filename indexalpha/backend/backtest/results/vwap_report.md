# Backtest de VWAP no índice

Gerado em 29/10/2026 12:42 · 60 pregões (2026-08-03 a 2026-10-27) · candles de 5 min.

**Premissas:** Ibovespa à vista no lugar do WIN (R$ 0.20/ponto/contrato) · VWAP ancorada no pregão,
com volume = volume financeiro somado dos 20 pilares (o Yahoo não traz volume do índice) · bandas = desvio padrão
ponderado por volume · decisão no fechamento e execução na abertura seguinte · custo de 10 pts por operação
· entradas só entre 10:30 e 16:30 · zera no fim do dia.

Ordenado pelo resultado total. "1a/2a metade" = soma de pontos na primeira e na segunda metade das operações:
uma configuração confiável precisa ser positiva nas duas.

| configuracao | operacoes | por_dia | acerto_pct | total_pts | media_pts | profit_factor | max_dd_pts | 1a_metade | 2a_metade |
|---|---|---|---|---|---|---|---|---|---|
| Cruzamento da VWAP | 132 | 2.2 | 28.0 | 14313 | 108.4 | 1.78 | 4325 | 5422 | 8891 |
| Cruzamento confirmado (0,5σ) | 149 | 2.5 | 28.9 | 6373 | 42.8 | 1.19 | 11090 | 6085 | 288 |
| Reversão banda 2,5σ → VWAP | 31 | 0.5 | 35.5 | 3369 | 108.7 | 1.63 | 1602 | -386 | 3755 |
| Rompimento banda 1σ (stop VWAP, alvo 2R) | 117 | 1.9 | 47.9 | 2687 | 23.0 | 1.09 | 8815 | 9069 | -6382 |
| Index_Score + VWAP como filtro de lado | 150 | 2.5 | 40.0 | 46 | 0.3 | 1.0 | 13448 | 7172 | -7126 |
| Pullback na VWAP, tendência de 12 candles | 43 | 0.7 | 41.9 | -2169 | -50.4 | 0.84 | 7089 | -3031 | 862 |
| Reversão banda 1,5σ → VWAP | 136 | 2.3 | 33.1 | -2188 | -16.1 | 0.92 | 5691 | -3765 | 1578 |
| Index_Score sem VWAP (referência) | 189 | 3.1 | 37.6 | -2221 | -11.8 | 0.95 | 13311 | 5901 | -8123 |
| Rompimento banda 2σ (stop VWAP, alvo 2R) | 63 | 1.1 | 44.4 | -2408 | -38.2 | 0.89 | 7114 | 3217 | -5626 |
| Reversão banda 2σ → VWAP | 84 | 1.4 | 29.8 | -2420 | -28.8 | 0.86 | 6162 | -4294 | 1874 |
| Reversão banda 1σ → VWAP | 153 | 2.5 | 35.9 | -2440 | -15.9 | 0.92 | 6938 | -3816 | 1376 |
| Pullback na VWAP, tendência de 6 candles | 55 | 0.9 | 34.5 | -6936 | -126.1 | 0.65 | 11814 | -5758 | -1178 |
