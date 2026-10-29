# IndexAlpha Engine

Gera sinais de trading para o mini-índice (WIN) e o Ibovespa a partir do desempenho
ponderado dos 20 ativos de maior peso (os "Pilares"), do fluxo estrangeiro e da
volatilidade. Uma camada de IA (Claude) explica cada sinal numa tese curta.

> Demonstração educacional com **dados simulados**. Não é recomendação de investimento.

## Arquitetura

```
indexalpha/
├── backend/                       Python 3.10+ · FastAPI · asyncio
│   ├── app/
│   │   ├── engine/
│   │   │   ├── weights.py         WEIGHTS (20 pilares) e setores
│   │   │   ├── index_engine.py    IndexEngine: Z-Score por ativo e Index_Score
│   │   │   └── signals.py         generate_signal, filtro de volatilidade, stop/alvo por ATR
│   │   ├── data/
│   │   │   └── market_simulator.py  MarketSimulator: modelo de fatores (petróleo, minério, juros, dólar)
│   │   ├── ai/
│   │   │   └── contextual_ai.py   ContextualAI: tese + alerta de risco via Claude (com modo por regras)
│   │   ├── service.py             Loop de 5 s: simulador → engine → sinal → IA → histórico/P&L
│   │   └── api/server.py          GET /api/snapshot · POST /api/thesis/refresh · GET /api/health
│   └── tests/test_engine.py
└── frontend/                      React 18 · TypeScript · Tailwind · Vite
    └── src/
        ├── components/
        │   ├── HeaderStatus.tsx         Index_Score, ação, confiança, sparkline, WIN/fluxo/vol
        │   ├── PillarHeatmap.tsx        20 cards, tamanho = peso, cor = Z-Score
        │   ├── AIThesisCard.tsx         Tese da IA + alerta de risco
        │   ├── TradeExecutionPanel.tsx  Entrada, stop, alvo, R$ por contrato
        │   └── SignalHistoryTable.tsx   Últimos 10 sinais com P&L simulado
        ├── themes/
        │   ├── market/                  Tema "Mercado" (padrão): plataforma de trading com candles e mapa de calor
        │   ├── mission/                 Tema "Missão": telemetria estilo lançamento espacial
        │   └── HackerDashboard.tsx      Tema "Terminal": CRT, chuva Matrix, glitch
        ├── hooks/useMarketFeed.ts       Atualiza o snapshot a cada 5 s
        └── types.ts                     Contrato tipado da API
```

A interface tem três temas, alternados pelo botão no canto inferior direito ou por `?theme=market` / `?theme=mission` / `?theme=terminal` na URL:

- **Mercado:** fita de cotações rolando, gráfico de candles do WIN (volume, preço ao vivo, crosshair, marcadores de entrada, stop/alvo da posição e Index_Score em painel inferior), mapa de calor estilo Finviz por setor, lista de ativos com mini-gráficos, boleta sugerida, análise da IA em formato de research e tabela de operações.
- **Missão:** campo de estrelas e limbo da Terra, medidores circulares de telemetria, trajetória do score com zonas de BUY/SELL, constelação orbital dos 20 pilares, votação GO/NO-GO das condições de entrada, régua da posição em voo e contagem regressiva na abertura.
- **Terminal:** visual hacker com CRT, chuva Matrix, glitch na troca de sinal, números "decodificando" e `event.log` ao vivo.

Ambos respeitam `prefers-reduced-motion`.

Fluxo a cada tick (5 s):

1. `MarketSimulator.tick()` gera preço, média de 20 períodos e desvio de cada pilar, além de fluxo estrangeiro, volatilidade implícita e ATR.
2. `IndexEngine.compute()` calcula `z_i = (preço − média20) / desvio20` e `raw = Σ wᵢ·zᵢ`, e devolve `Index_Score = tanh(raw)` e os 3 maiores drivers por |wᵢ·zᵢ|.
3. `generate_signal(index_score, foreign_flow, vix_level, atr_pct)`:
   - **BUY** se `score > 0,5` e `fluxo > 0`; **SELL** se `score < −0,5` e `fluxo < 0`; senão **HOLD**.
   - Confiança: 50% no limiar, chegando a 100% com |score| = 1. **Filtro de volatilidade**: com vol implícita acima de 25%, a confiança cai pela metade.
   - Stop = 1,5 × ATR e alvo = 3 × ATR (risco/retorno de 1 : 2).
4. `ContextualAI` só é chamado quando a ação ou os top drivers mudam, ou a cada 60 s, em segundo plano, para não travar o loop.
5. O serviço abre uma operação simulada na transição para BUY/SELL e a encerra no stop, no alvo ou numa reversão. O P&L é contado em pontos e em R$ (R$ 0,20 por ponto por contrato).

## Como rodar

```bash
# Backend
cd indexalpha/backend
pip install -r requirements.txt
export ANTHROPIC_API_KEY=...        # opcional; sem ela a tese é gerada por regras
uvicorn app.api.server:app --reload --port 8000

# Frontend (dev, com proxy para :8000)
cd indexalpha/frontend
npm install
npm run dev                         # http://localhost:5173
```

Para servir tudo numa porta só, rode `npm run build`. O FastAPI passa a servir `frontend/dist` em `http://localhost:8000`.

Testes: `cd indexalpha/backend && python -m pytest`.

### Backtest com dados reais

`cd indexalpha/backend && python -m backtest.run_backtest` baixa candles de 5 min dos 20 pilares, do Ibovespa e do dólar (Yahoo Finance, últimos ~60 pregões), roda o motor sem olhar o futuro e grava `backtest/results/report.md` com o resultado por variante, a estabilidade nas duas metades do período e o poder de previsão do score. Os dados ficam em cache em `backtest/data/` (`--refresh` baixa de novo). `python -m backtest.vwap_backtest` testa configurações de VWAP no índice (cruzamento, reversão e rompimento das bandas, pullback e VWAP como filtro do Index_Score) e grava `backtest/results/vwap_report.md`. `python -m backtest.rsi_backtest` faz o mesmo para o RSI (reversão 30/70, 20/80, RSI 2, filtro de VWAP, momentum na linha 50 e RSI confirmando o cruzamento da VWAP) e grava `backtest/results/rsi_report.md`.

### Variáveis de ambiente

| Variável | Padrão | Efeito |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Credencial da API Anthropic. Sem ela, a tese usa regras determinísticas. |
| `INDEXALPHA_MODEL` | `claude-opus-5-5` | Modelo usado na tese. |
| `INDEXALPHA_AI` | `on` | `off` desliga o LLM (útil para demos offline e testes). |

A chamada usa o SDK assíncrono (`AsyncAnthropic`) com saída estruturada em JSON (`thesis_text`, `risk_warning`), esforço `low` (a tese é curta e recorrente) e fallback de recusa no servidor (`fallbacks: "default"`). Se a API falhar, o card mostra a tese por regras e o painel indica "modo regras".

### Plugando dados reais

Troque o `MarketSimulator` por um provedor que entregue, para cada pilar, um `AssetQuote(ticker, price, sma20, std20, change_pct)`, e informe o fluxo estrangeiro, a volatilidade e o ATR do WIN. O `IndexEngine` e o `generate_signal` não mudam. Mantenha `WEIGHTS` em `engine/weights.py` alinhado à carteira teórica vigente da B3. Os pesos atuais são aproximações ilustrativas.

## Lógica quant: por que o Z-Score ponderado supera a média simples

1. **Representa o índice de fato.** O Ibovespa é uma média ponderada: PETR4, VALE3 e ITUB4 movem o índice muito mais que TAEE11. Numa média simples, cada ativo vale 1/20, e um movimento forte num ativo de 1,5% de peso pesa tanto quanto um em PETR4. Ponderar por `wᵢ` faz o score medir o que o índice (e o WIN) vai sentir.

2. **Põe todos os ativos na mesma régua.** Uma alta de 1% em VALE3 (volátil) é ruído. A mesma alta em ABEV3 (pouco volátil) é um desvio relevante. A média de retornos trata as duas igual. O Z-Score divide pelo desvio padrão de cada ativo, então cada termo responde à pergunta "quantos desvios este ativo está fora do seu normal?". Sem isso, os ativos mais voláteis dominariam o sinal.

3. **Ancora no contexto recente.** O Z-Score compara o preço à média de 20 períodos, não ao fechamento anterior. Assim, ele mede a força do movimento atual em relação ao regime recente e capta momentum ou esticamento, em vez de reagir a ruído tick a tick.

4. **Robustez.** Cada Z-Score é limitado a ±4, para que um gap ou leilão num único ativo não sequestre o índice. O `tanh` final leva o score para (−1, +1) com saturação suave, o que torna os limiares de ±0,5 estáveis e interpretáveis. Se faltar algum ativo, os pesos são renormalizados para o score não ser puxado para zero.

5. **Explicabilidade.** Como `raw = Σ wᵢ·zᵢ` é uma soma, a contribuição `wᵢ·zᵢ` de cada pilar é exata. É isso que alimenta os "Top Drivers" e a tese da IA: dá para dizer quais ativos sustentaram o sinal e quanto cada um pesou.

**Limitações:** pesos e correlações mudam com o tempo. Ativos muito correlacionados (PETR3/PETR4, bancos) concentram risco num único fator. E o Z-Score assume que o desvio recente é um bom estimador da volatilidade. Antes de usar em produção, faça backtest com dados reais da B3, considere custos e slippage e recalibre os limiares.
