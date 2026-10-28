# Backtest IndexAlpha · dados reais da B3

Gerado em 28/10/2026 03:07 · 60 pregões (2026-08-03 a 2026-10-27) · candles de 5 min (Yahoo Finance).

**Premissas:** Ibovespa à vista como substituto do WIN (R$ 0.20/ponto/contrato) · sinal no fechamento, execução na abertura do candle seguinte · stop 1.5×ATR e alvo 3.0×ATR · custo de 10 pontos por operação · posição zerada no fim do dia · janela de 20 candles reiniciando a cada pregão.
**Fluxo estrangeiro:** como não existe ao vivo, usa o dólar como substituto (real se valorizando = fluxo positivo).
**Volatilidade:** volatilidade realizada do Ibovespa (anualizada), no lugar da implícita.
**Ativos sem dados:** nenhum · tickers atualizados: ELET3→AXIA3, JBSS3→JBSS32.

## Resultado por variante

| variante | operacoes | acerto_pct | total_pts | media_pts | profit_factor | max_drawdown_pts | total_brl_1_contrato |
|---|---|---|---|---|---|---|---|
| Pilares + fluxo (dólar), limiar 0,5 | 208 | 39.4 | 4681.0 | 22.5 | 1.12 | 8036.0 | 936.18 |
| Pilares sem fluxo, limiar 0,5 | 243 | 39.5 | 8087.0 | 33.3 | 1.19 | 7869.0 | 1617.42 |
| Pilares + fluxo, limiar 0,3 | 244 | 39.8 | 3562.0 | 14.6 | 1.08 | 9065.0 | 712.45 |
| Pilares + fluxo, limiar 0,7 | 157 | 38.9 | -190.0 | -1.2 | 0.99 | 11176.0 | -37.96 |
| Só o Ibovespa (sem pilares), limiar 0,5 | 316 | 36.7 | 3733.0 | 11.8 | 1.07 | 10868.0 | 746.65 |
| Pilares + fluxo, operando ao CONTRÁRIO | 239 | 39.7 | 1848.0 | 7.7 | 1.04 | 11066.0 | 369.67 |

## Variante principal nas duas metades do período

| periodo | operacoes | acerto_pct | total_pts | media_pts | profit_factor | max_drawdown_pts | total_brl_1_contrato |
|---|---|---|---|---|---|---|---|
| 2026-08-03 a 2026-09-14 | 94 | 41.5 | 6823.0 | 72.6 | 1.54 | 3150.0 | 1364.52 |
| 2026-09-15 a 2026-10-27 | 114 | 37.7 | -2142.0 | -18.8 | 0.92 | 8036.0 | -428.34 |

Saídas da variante principal: stop 100, alvo 57, fim do dia 29, reversão 22.

## O score antecipa o índice?

Correlação entre o score e o retorno do Ibovespa nos próximos minutos, e acerto da direção quando |score| > 0,5.

**Score dos pilares**

| minutos | correlacao | acerto_direcao_score_forte_pct | amostras_score_forte |
|---|---|---|---|
| 5 | 0.059 | 53.0 | 1820 |
| 15 | 0.047 | 51.2 | 1762 |
| 30 | 0.012 | 51.5 | 1677 |
| 60 | 0.012 | 52.2 | 1517 |

**Só o Ibovespa (comparação)**

| minutos | correlacao | acerto_direcao_score_forte_pct | amostras_score_forte |
|---|---|---|---|
| 5 | 0.015 | 50.6 | 2857 |
| 15 | 0.013 | 50.3 | 2766 |
| 30 | -0.011 | 50.8 | 2626 |
| 60 | -0.005 | 51.7 | 2361 |

Correlação entre o score dos pilares e o Z-Score do próprio Ibovespa: **0.92**.
