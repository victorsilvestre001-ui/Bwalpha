# B3 Event Trader — Event-Driven Trading com NLP/LLM

Pipeline assíncrono que monitora comunicados oficiais (Fatos Relevantes, Comunicados
ao Mercado, releases) de empresas da B3, classifica o impacto com um LLM e gera
sinais de trading executáveis, com alerta em Telegram/Discord, paper trading e
backtest.

> ⚠️ **Os dados incluídos são simulados.** Comunicados, preços e resultados do
> backtest são sintéticos e servem para exercitar a mecânica, não para provar alpha.
> Nada aqui é recomendação de investimento.

## Arquitetura

```
           ┌────────────── Ingestão ──────────────┐   ┌──────── IA ────────┐   ┌─ Estratégia ─┐   ┌──── Execução ────┐
 CVM/B3 ─▶ │ EventSource ─┐                       │   │ cache (hash_id)    │   │ Regra 3 SHORT│   │ AlertDispatcher  │
 Reuters ▶ │ EventSource ─┼▶ EventMonitor ─▶ Queue ┼─▶ │ LLMProvider (JSON) ├─▶ │ Regra 1 M&A  ├─▶ │  Telegram/Discord│
 Fila/JSON▶│ EventSource ─┘  (polling+dedupe)     │   │ validação+retry    │   │ Regra 2 DY   │   │ BrokerInterface  │
           └──────────────────────────────────────┘   └────────────────────┘   └──────────────┘   │  Paper / IBKR    │
                                                  N workers asyncio em paralelo                    └──────────────────┘
```

```
event_trader/
├── main.py                    # demo ponta a ponta (ingestão → IA → sinal → alerta → paper)
├── run_backtest.py            # backtest + relatório (Win Rate, Profit Factor, Sharpe)
├── pyproject.toml
├── data/
│   ├── sample_events.json     # feed "CVM" simulado para o main.py
│   ├── historical_events.csv  # eventos históricos simulados (gerados)
│   ├── event_meta.csv         # vol implícita / DY point-in-time por evento
│   └── historical_prices.csv  # OHLC diário simulado
├── src/
│   ├── config.py              # Settings a partir de env vars (12-factor)
│   ├── logging_setup.py       # loguru, texto ou JSON estruturado
│   ├── models.py              # RawEvent, EventClassification, TradingSignal, MarketSnapshot
│   ├── pipeline.py            # orquestrador producer/consumer
│   ├── ingest/
│   │   ├── sources.py         # EventSource, QueueEventSource, JsonFileEventSource, HttpJsonEventSource, CVM
│   │   └── monitor.py         # EventMonitor (polling concorrente, backoff, dedupe)
│   ├── ai/
│   │   ├── prompts.py         # SYSTEM_PROMPT + JSON Schema + montagem da mensagem
│   │   ├── providers.py       # LLMProvider: Anthropic, OpenAI, Mock (heurístico offline)
│   │   ├── cache.py           # LRU+TTL, persistência, single-flight
│   │   └── classifier.py      # EventClassifier (timeout, retry, validação)
│   ├── strategy/
│   │   ├── market_data.py     # MarketDataProvider + ATR (Wilder)
│   │   └── signals.py         # TradingSignalGenerator (Regras 1–3)
│   ├── execution/
│   │   ├── alerts.py          # AlertDispatcher + canais (console, Telegram MarkdownV2, Discord)
│   │   └── broker.py          # BrokerInterface, PaperBroker (DataFrame), esqueleto IBKR
│   └── backtest/
│       ├── engine.py          # simulação sem look-ahead (entrada no gap, SL/TP intrabar)
│       ├── metrics.py         # métricas e relatório
│       └── sample_data.py     # gerador de dados simulados
└── tests/                     # 50 testes (pytest + pytest-asyncio)
```

## Como rodar

```bash
cd event_trader
pip install -e ".[dev]"              # + ".[anthropic]" e/ou ".[openai]" para LLM real

python main.py                       # usa LLM real se houver ANTHROPIC_API_KEY/OPENAI_API_KEY, senão mock
LLM_PROVIDER=mock python main.py     # força o classificador heurístico (offline, sem custo)
python run_backtest.py               # backtest com o mock sobre os dados simulados
python run_backtest.py --provider anthropic --holding-days 3
python -m pytest
```

Variáveis principais: `LLM_PROVIDER` (`auto|anthropic|openai|mock`), `ANTHROPIC_MODEL`
(padrão `claude-opus-5-5`), `ANTHROPIC_EFFORT` (padrão `low`), `ANTHROPIC_FALLBACKS`,
`OPENAI_MODEL`, `POLL_INTERVAL_S` (padrão 15), `LLM_CACHE_PATH`, `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_CHAT_ID`, `DISCORD_WEBHOOK_URL`, `LOG_JSON=1`.

## Decisões de engenharia

| Requisito | Como foi atendido |
|---|---|
| Latência | `asyncio` ponta a ponta; cada fonte tem seu loop de polling; N workers consomem a fila; classificação LLM e snapshot de mercado rodam em `gather`; alerta e ordem saem em paralelo; `effort=low` no Claude. |
| Robustez | Falha de uma fonte → backoff exponencial com jitter só naquela fonte. Erros do LLM são classificados em recuperáveis (429/5xx/timeout/JSON inválido) e não recuperáveis (401/400/recusa). `EventPipeline.process` nunca levanta: o erro vai em `PipelineResult.error`. Uma regra com bug não gera ordem. |
| Cache | Chave = SHA-256 de ticker+headline+corpo normalizados (sem timestamp: o mesmo FR vindo de CVM e Reuters é classificado uma vez). LRU+TTL, snapshot atômico em disco e *single-flight* para duplicatas simultâneas. Falhas nunca são cacheadas. |
| Abstração | `EventSource`, `LLMProvider`, `MarketDataProvider`, `BrokerInterface`, `AlertChannel` são ABCs. Trocar Anthropic↔OpenAI ou Paper↔IBKR é uma linha. |
| Paridade live/backtest | O backtest usa as mesmas classes `EventClassifier` e `TradingSignalGenerator`; as regras são funções puras. |

### Regras de sinal (`src/strategy/signals.py`)

Avaliadas por prioridade (risco primeiro):

1. **R3 — SHORT**: `is_material` e `sentiment < -0.5` → SELL. Stop = 2σ diário da vol
   implícita (`IV/√252`) se houver; senão 1,5×ATR. Alvo = 2R.
2. **R1 — M&A**: `M&A` e `sentiment > 0.5` → BUY. Com preço de oferta, **alvo = 85% do
   preço de oferta** (os 15% são o desconto de risco de não conclusão) e stop limitado ao
   upside; se o papel já negocia acima desse alvo → HOLD (`R1_MA_NO_SPREAD`). Sem preço de
   oferta → alvo de momentum (3×ATR).
3. **R2 — Capital allocation**: `CAPITAL_ALLOCATION` e `sentiment > 0.7` → BUY. Se o
   comunicado traz dividendo por ação e há DY histórico, compara o yield implícito com o
   DY médio; sem gap → HOLD. O alvo ATR é o piso, estendido pelo gap.

Filtros finais: confiança mínima (0,35) e reward/risk mínimo (1,0) → senão HOLD.
`confidence = |sentiment| × peso(magnitude)`, com bônus para eventos materiais. É uma
heurística: calibre com o backtest real.

### Backtest (`src/backtest/engine.py`)

- Snapshot (preço, ATR) usa **só barras anteriores** à entrada (sem look-ahead).
- Entrada na **abertura** do primeiro pregão após o evento (eventos antes das 10h entram
  na abertura do mesmo dia).
- O alvo absoluto vem do sinal; **se o gap de abertura já passou do alvo, o trade é
  descartado** (`GAP_THROUGH_TARGET`). O stop é relativo à entrada.
- Stop e alvo no mesmo candle → assume o stop (conservador). Saída por tempo após
  `--holding-days`. Custos round-trip em bps.
- Sharpe: P&L de cada trade (10% do patrimônio por trade) realizado na data de saída,
  série diária anualizada por √252.

## Lógica do prompt (`src/ai/prompts.py`)

O system prompt foi montado para maximizar acurácia e consistência da extração,
não para "soar inteligente". Cada bloco existe por um motivo:

1. **Papel + tarefa + consumidor.** "Analista sell-side de event-driven cobrindo a B3"
   ativa o vocabulário certo (OPA, JCP, CADE, data-com). Dizer que a saída é consumida
   por código desestimula prosa e hedging.

2. **Ponto de vista explícito do acionista do `<ticker>`.** O erro mais comum em
   classificação de M&A é ler o tom geral: uma aquisição é boa para a empresa vendida e
   frequentemente ruim para a compradora. Fixar a perspectiva remove essa ambiguidade.

3. **Surpresa > tom.** Fatos Relevantes são escritos em linguagem protocolar
   ("a Companhia informa..."). Sem essa instrução, o modelo confunde formalidade com
   neutralidade e, pior, trata dividendos dentro da política como positivos. O que move
   preço é o desvio em relação ao esperado.

4. **Definições operacionais e regra de desempate por categoria.** Listar exemplos
   concretos da B3 (ANEEL, ANP, OPA, cisão, auto de infração) transforma categorias
   vagas em fronteiras testáveis. A regra "classifique pelo evento que mais altera o
   fluxo de caixa; OPA é sempre M&A" resolve os casos mistos (ex.: OPA anunciada junto
   com troca de conselho).

5. **Rubrica numérica ancorada para `sentiment_score`.** Pedir "um float de -1 a 1"
   sem âncoras gera scores colados em ±0,8 e pouca variância entre execuções. Faixas com
   exemplos típicos calibram a escala — e os limiares das regras (0,5 / 0,7 / -0,5)
   ficam alinhados às faixas do prompt.

6. **`magnitude` e `is_material` com critérios quantitativos** (% do valor de mercado,
   movimento > 5% no pregão seguinte), ligados entre si ("em regra exige HIGH"). Isso
   evita a contradição clássica `is_material=true` com `magnitude=LOW`.

7. **Campos extras para as regras**: `offer_price` e `dividend_per_share`. As Regras 1 e
   2 precisam de números, e a instrução "use null se não aparece; não invente" mais o
   tipo `number|null` no schema reduzem alucinação de preço.

8. **`actionable_thesis` com formato causal** ("o que mudou → efeito no caixa/risco →
   direção") e limite de tamanho: fica auditável no alerta e legível no Telegram.

9. **Defesa contra prompt injection.** O texto do comunicado é dado não confiável: vai
   entre `<document>` e o prompt manda ignorar instruções dentro dele; o código escapa
   `</document>` para o texto não "sair" da área de dados. Ticker, horário e fonte vão
   em tags separadas, fora do documento.

10. **Estrutura garantida pelo provider, não pelo texto.** O JSON Schema (`enum`,
    `required`, `additionalProperties: false`) é enviado como Structured Output
    (`output_config.format` no Claude, `response_format` strict na OpenAI), então a
    saída é JSON válido no schema. Mesmo assim, `EventClassification.from_llm_json`
    revalida tipos, faixas e enums — defesa em profundidade para trocar de provider.

11. **Estabilidade para cache e latência.** O system prompt é estático (sem datas ou
    IDs) e tudo o que varia vai na mensagem do usuário. Isso permite cache de prompt
    no provider (prefixo idêntico entre chamadas). Observação: o prompt atual tem
    ~1,5 mil tokens; abaixo do mínimo cacheável do modelo, o cache simplesmente não
    é ativado, sem erro.

12. **Raciocínio curto antes de responder.** O passo "identifique: afetado, evento,
    surpresa, ordem de grandeza" estrutura a análise sem pedir que ela seja impressa
    (a saída é só JSON). Com Claude, o raciocínio é feito pelo próprio thinking
    adaptativo, controlado por `effort` (padrão `low` para classificação).

## Pontos de extensão para produção

- **Fonte real**: `build_cvm_source(url, token)` em `src/ingest/sources.py`; ajuste o
  `parse_cvm_ipe` ao formato do seu provedor (RAD/ENET via vendor, B3, Refinitiv).
- **Market data**: implemente `MarketDataProvider.get_snapshot` sobre seu feed.
- **Corretora**: `IBKRBroker` documenta o caminho com bracket orders (stop e alvo no
  servidor da corretora).
- **Cache distribuído**: reimplemente `ClassificationCache` sobre Redis.
- **Calibração**: rode `run_backtest.py --provider anthropic` sobre eventos reais
  rotulados antes de confiar nos limiares.
