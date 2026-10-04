# Ligas de Palpites — especificação de produto (v0.1)

Plataforma em que os jogadores não apostam contra a casa: competem entre si em ligas.
Cada entrada recebe uma banca virtual de R$1.000, faz palpites simulados com odds reais
de mercado e é ranqueada por um Skill Score. Os melhores colocados recebem prêmios em dinheiro.

Arquivos desta pasta:

| Arquivo | O que é |
|---|---|
| `README.md` | Este documento: decisões, fluxo, mecânica, matemática, arquitetura, copy e riscos |
| `schema_ligas.sql` | Schema PostgreSQL (19 tabelas, schema `ligas`). Validado em Postgres 16 |
| `prizeModel.js` | Calculadora de taxa retida e premiação: `node docs/ligas/prizeModel.js 100 10 0.15` |

---

## 0. O que muda em relação ao briefing

Há seis pontos do briefing que não se sustentam como estão. Os quatro primeiros mudam o produto.

1. **"100% vai para o prêmio" e "15% de rentabilidade" não cabem juntos.** A receita da taxa
   de processamento é negativa: o Pix *custa* ao operador, ele não lucra com isso. Para a
   plataforma ficar com 15% líquidos, ela precisa reter **17% da arrecadação**, de forma
   declarada como taxa de serviço (seção 4). Com os mesmos números, o prêmio fica em 83%.
2. **Prêmio como % do pool → prêmio fixo garantido.** A Lei 14.790/2023 só deixa o *fantasy
   sport* fora do regime de apostas se o prêmio for definido antes, sem depender do número
   de participantes nem do valor arrecadado. Cada liga publica um prêmio fixo e um mínimo de
   participantes. Se não fechar o mínimo, a liga é cancelada e todos são reembolsados. Isso
   ajuda no enquadramento legal, mas não o resolve (risco nº 1).
3. **"Trading de apostas" não pode ser o posicionamento.** As regras de publicidade da SPA/MF
   (Portaria 1.231/2024) e do CONAR proíbem apresentar aposta como investimento,
   fonte de renda ou alternativa financeira. "Trader esportivo" é exatamente isso. O
   posicionamento passa a ser **competição de estratégia/leitura de jogo** (seção 6).
4. **Stripe/PayPal → Pix.** No Brasil a entrada é por Pix. Para apostas, cartão de crédito é
   vedado e o Pix tem de vir de conta do mesmo CPF do jogador. O repositório já integra Asaas
   (`asaas.js`). Usar **carteira interna**: o jogador deposita, e as entradas são debitadas da
   carteira. Cobrar um Pix de R$10 a cada liga gasta a margem em tarifa.
5. **Margem de 5% em liga grátis não gera receita.** Ninguém paga, então não há o que reter.
   Nas ligas grátis a margem só deixa o jogo mais difícil. A receita delas vem do patrocínio
   e da conversão para ligas pagas.
6. **O conluio perigoso não é copiar a mesma estratégia.** Dois jogadores com palpites
   idênticos terminam com a mesma banca, e isso não aumenta a chance de nenhum dos dois.
   O que aumenta é **apostar em lados opostos** com várias contas: uma delas sempre termina lá
   em cima. A detecção prioriza palpites opostos e múltiplas contas (seção 5.5).

---

## 1. Fluxo do usuário

```
Landing ──► Cadastro leve ──► Liga grátis ──► KYC + depósito ──► Liga paga ──► Palpites
                                                                                │
           Saque Pix ◄── Prêmio liberado ◄── Revisão antifraude ◄── Fim da liga ◄┘
```

| # | Etapa | O que acontece | Regras e controles |
|---|---|---|---|
| 1 | **Landing** | Vê ligas abertas, prêmios garantidos e ranking ao vivo de uma liga em andamento | Selo +18 e link de jogo responsável no topo |
| 2 | **Cadastro leve** | E-mail, senha, apelido público, CPF e data de nascimento | CPF validado e checado para maioridade. 1 conta por CPF. Fingerprint do dispositivo gravado |
| 3 | **Liga grátis (onboarding)** | Entra direto em uma liga grátis de 24h e recebe um tutorial de 3 passos: escolher jogo, escolher stake, ver ranking | Mesmas regras das pagas. Mostra o Skill Score sendo calculado |
| 4 | **KYC completo** | Selfie com prova de vida e checagem de PEP e sanções. Pedido só antes do 1º depósito | Aprovação automática em ~1 min. Casos duvidosos vão para revisão manual |
| 5 | **Depósito** | Pix para a carteira. Pacotes sugeridos: R$20, R$50, R$100 | O CPF do pagador precisa ser o do titular, senão o valor é estornado. Limites diários e mensais definidos pelo usuário |
| 6 | **Escolher liga** | Filtra por esporte, duração (24h/7d/30d), entrada (R$10/50/100) e formato (padrão ou knockout) | Mostra prêmio garantido, tabela de premiação, mínimo e máximo de participantes e regras |
| 7 | **Entrar** | Confirma a entrada (débito da carteira ou cupom) e recebe a banca virtual de R$1.000 | 1 entrada por CPF por liga. Até o início, pode desistir com reembolso integral |
| 8 | **Palpitar** | Monta simples ou múltiplas (até 5 pernas) nos jogos elegíveis da liga | Stake ≤ 10% da banca atual. Odd total ≤ 25. Sem duas pernas do mesmo jogo. Fecha 1 min antes do início do jogo |
| 9 | **Acompanhar** | Saldo, palpites abertos, posição e Skill Score ao vivo (WebSocket) | Notificação push quando um palpite liquida ou quando muda de faixa de premiação |
| 10 | **Fim da liga** | Liquida o último jogo, congela o ranking e publica o resultado | Só entram jogos que terminam antes do fim da liga |
| 11 | **Revisão** | Os premiados ficam em `held` por até 48h para revisão antifraude | Sinais graves suspendem só aquele prêmio. Os outros são pagos |
| 12 | **Resgate** | O prêmio cai na carteira e o saque é por Pix para chave do mesmo CPF | Retenção de IR quando aplicável. Comprovante no histórico |

Pontos de retenção: ao terminar a liga, oferecer a próxima liga do mesmo tipo já com a data;
resumo semanal com o CLV do jogador (seção 3.3); convite para a guilda do Discord ou Telegram.

---

## 2. Mecânica das ligas

| Parâmetro | Valor padrão | Por quê |
|---|---|---|
| Banca inicial | R$1.000 virtuais | Número redondo, fácil de ler como % |
| Stake máximo | 10% da banca **atual** | Força gestão de banca e impede "tudo ou nada" |
| Stake mínimo | R$1 virtual | Abaixo disso a entrada está quebrada (knockout) |
| Odd máxima por palpite | 25,00 | Corta "bilhete de loteria". Sem isso, a melhor estratégia num prêmio concentrado é a variância máxima |
| Pernas por múltipla | até 5, de jogos diferentes | Duas pernas do mesmo jogo são correlacionadas e a múltipla ficaria mal precificada |
| Mercados (MVP) | 1X2, total de gols/pontos, ambas marcam | Só pré-jogo. Ao vivo fica para v2, por causa da latência |
| Jogos elegíveis | Começam depois da abertura e terminam antes do fim da liga | Todo palpite está liquidado quando o ranking fecha |
| Jogo adiado ou cancelado | Perna anulada (odd 1,00). Simples devolve o stake | Padrão de mercado |
| Formatos | **Padrão**: quebrou, fica em último por ordem de quebra. **Knockout**: quebrou, sai | Knockout combina com ligas de 7d e 30d |
| Desistência | Reembolso integral até o início. Depois, sem reembolso | — |

---

## 3. Modelo matemático

### 3.1 Odds justas e margem

Para cada mercado, o sistema coleta as odds de todas as casas do agregador e exige pelo menos
3 casas (abaixo disso o mercado fica fechado).

1. **Consenso**: mediana das odds de cada seleção. A mediana resiste a uma casa fora da curva.
2. **Retirar a margem (de-vig multiplicativo)**:
   `q_i = 1 / o_i`, `S = Σ q_i`, `p_i = q_i / S` (probabilidade justa).
   Na v2, usar o método de Shin, que corrige melhor o viés favorito–azarão.
3. **Odd oferecida**: `o_i* = 1 / (p_i × (1 + m))`, com `m = 2%` nas ligas pagas.
4. **Múltipla**: produto das odds oferecidas das pernas.

Exemplo, Flamengo × Palmeiras, mediana de mercado 2,10 / 3,30 / 3,60:

| | Casa | Empate | Fora | Soma |
|---|---|---|---|---|
| Implícita `1/o` | 47,62% | 30,30% | 27,78% | 105,70% |
| Justa `p` | 45,05% | 28,67% | 26,28% | 100% |
| Odd justa | 2,22 | 3,49 | 3,81 | |
| Oferecida (m = 2%) | **2,18** | **3,42** | **3,73** | 102% |

Como ninguém aposta contra a casa, a margem não é receita. Ela é um **parâmetro de
dificuldade**: com 2%, o jogador médio perde ~2% por palpite, e a diferença no ranking vem de
quem escolhe palpites com valor. Margem zero também funciona, mas 2% diferencia melhor quem
tem habilidade de quem tem sorte.

### 3.2 Skill Score

A fórmula do briefing, `(saldo final / inicial) × consistência`, é mantida, com "consistência"
definida de forma verificável:

```
SkillScore = 1000 × R × A × D

R = banca final / banca inicial                     (retorno)
A = min(1, n / n_min)                               (atividade; n = palpites liquidados, n_min = 10)
D = 1 − 0,5 × MDD                                   (MDD = maior queda desde o pico, de 0 a 1)
Desempate: 1º CLV médio ponderado por stake; 2º quem chegou primeiro ao score final
```

Por que cada termo:

- **R** é o que o jogador entende ("dobrei a banca").
- **A** impede ganhar com 2 palpites de sorte. Em 24h, `n_min = 10`. Em 7d, `n_min = 25`.
- **D** pune a montanha-russa. Em liga com prêmio concentrado, a estratégia ótima sem esse
  termo é maximizar a variância: apostar o máximo em odds altas e torcer. O fator D
  devolve a vantagem para quem cresce sem quedas grandes.
- Sharpe e Sortino foram descartados: com 10–30 palpites a estimativa de desvio é instável, e
  o jogador não consegue prever o próprio score.

| Jogador | R | n | MDD | A | D | Skill Score |
|---|---|---|---|---|---|---|
| A: crescimento constante | 1,42 | 25 | 18% | 1,00 | 0,91 | **1.292** |
| B: dois palpites altos | 1,60 | 8 | 55% | 0,80 | 0,725 | **928** |
| C: conservador | 1,12 | 30 | 6% | 1,00 | 0,97 | **1.086** |

B teve o maior retorno e fica em último entre os três. Esse é o comportamento desejado.

### 3.3 CLV (Closing Line Value): a métrica de habilidade de verdade

`CLV = odd tomada / odd justa de fechamento − 1`. Quem pega sistematicamente odds melhores
que as de fechamento tem habilidade, independentemente de o palpite ter ganhado. O CLV entra
como desempate e como métrica principal do plano Pro. Fica fora do score na v1 porque o
jogador não consegue verificá-lo sozinho. Coluna: `bets.clv_bps`.

### 3.4 Distribuição de prêmios: 100 jogadores × R$10, margem de 15%

Premissas (troque pelas do contrato com o PSP):

| Item | Valor |
|---|---|
| Arrecadado | 100 × R$10 = **R$1.000** |
| Custo do Pix de entrada | 0,99% → R$9,90 |
| Custo de saque dos premiados | 10 × R$1,00 → R$10,00 |
| Taxa retida | **17% = R$170** (arredondada para cima em pontos inteiros) |
| **Margem líquida** | R$170 − R$19,90 = **R$150,10 (15,0%)** |
| **Prêmio garantido** | **R$830** (RTP de 83%) |

Distribuição para o top 10% (10 premiados). Curva de potência `pᵢ ∝ 1/i^α` com piso de 1,5×
a entrada e α calibrado para o 1º ficar com ~25%. Valores em múltiplos de R$5:

| Posição | Prêmio | % do prêmio | × entrada | Acumulado |
|---|---|---|---|---|
| 1º | **R$205** | 24,7% | 20,5× | 24,7% |
| 2º | R$125 | 15,1% | 12,5× | 39,8% |
| 3º | R$95 | 11,4% | 9,5× | 51,2% |
| 4º | R$80 | 9,6% | 8,0× | 60,8% |
| 5º | R$65 | 7,8% | 6,5× | 68,7% |
| 6º | R$60 | 7,2% | 6,0× | 75,9% |
| 7º | R$55 | 6,6% | 5,5× | 82,5% |
| 8º | R$50 | 6,0% | 5,0× | 88,6% |
| 9º | R$50 | 6,0% | 5,0× | 94,6% |
| 10º | R$45 | 5,4% | 4,5× | 100% |
| **Total** | **R$830** | | | |

Por que esta curva e não "1º leva 20%, 2º 10%…":

- **O 10º recebe 4,5× a entrada.** Quem entra no top 10 sente que ganhou, e isso traz o
  jogador de volta. O piso de 1,5× garante isso em qualquer tamanho de liga.
- **O 1º recebe 20× a entrada**, o que dá uma manchete ("R$10 viraram R$205") sem
  esvaziar os outros prêmios.
- **Equilíbrio para o jogador habilidoso**: o prêmio médio no top 10 é R$83. Para empatar, ele
  precisa terminar no top 10 em 12% das ligas (`10 / 83`), contra 10% de um jogador aleatório.
  A vantagem exigida é pequena, mas uma liga de 24h ainda é dominada pela variância. Por isso as ligas de 7d e 30d devem ser
  o "produto de habilidade", e as de 24h, a porta de entrada.

**Sensibilidade** (mesma margem de 15%):

| Cenário | Taxa retida | Prêmio | Observação |
|---|---|---|---|
| Base, como fantasy | 17% | R$830 | Tabela acima |
| Como aposta licenciada (12% de imposto sobre GGR) | 20% | R$800 | `T × 1000 − 19,90 − 0,12 × T × 1000 = 150` → T = 19,3%, arredondado para 20% |
| 30 jogadores (mínimo da liga) | 17% | R$249 | Top 3: R$104 / R$80 / R$65 |
| 1.000 jogadores | 17% | R$8.300 | Top 100. O 1º leva R$2.085 (208×) e o 100º leva R$20 |

O que não entra nos 15%: impostos sobre a receita (PIS, Cofins, ISS), custos fixos, CAC e
o custo da API de odds. Isso é **margem de contribuição por liga**, não lucro líquido.

**Overlay (risco de prêmio garantido):** se a liga fechar com 60 jogadores, ela arrecada
R$600 e paga R$830 → prejuízo de R$230. Regras: `min_entries` = 70% de `max_entries`
cancela a liga; o prêmio das ligas novas é calibrado com a média das últimas 4 edições; um
patrocinador pode cobrir o overlay em troca de visibilidade ("Prêmio turbinado por X").

---

## 4. Modelo de negócio (revisado)

| Fonte | Como funciona | Comentário |
|---|---|---|
| **Taxa de serviço** | 17% de cada entrada paga, mostrada antes da compra | É a receita principal. "Taxa de processamento" não paga a operação |
| **Ligas patrocinadas** | A marca paga por liga: nome, banner, brinde e cobertura de overlay | Melhor produto para ligas grátis. Prêmio em produto ou dinheiro pago pela marca |
| **Plano Pro** (R$19,90/mês) | CLV, histórico por mercado, simulador de banca, comparação com o top 10 | Não pode dar vantagem de informação desigual dentro da liga. Só análise do próprio histórico e de dados públicos |
| ~~Margem em liga grátis~~ | — | Removida: não gera receita (item 5 da seção 0) |

---

## 5. Arquitetura técnica

O repositório já roda Node/Express, `pg`, `ws`, Next.js e Asaas. Reaproveitar tudo. Go só
vale se a liquidação passar de dezenas de milhares de palpites por minuto, o que está longe do MVP.

```
 Agregador de odds ──► [odds-ingestor] ──► Redis (hash por mercado, TTL 120s)
 (The Odds API etc.)       │ de-vig + margem     │ pub/sub "odds:{evento}"
                           ▼                     ▼
                      Postgres  ◄──────── [API Express] ◄──► Next.js
                      (odds_snapshots)       │ palpites (transação + FOR UPDATE)
                                             ▼
 Fontes de resultado ──► [settlement-worker] ──► Postgres (bets, entries)
 (2 fontes independentes)     │                       │
                              ▼                       ▼
                     Redis ZSET "rank:{liga}" ──► [ws-gateway] ──► navegador
```

### 5.1 Ingestão de odds
- Polling adaptativo para economizar créditos da API: a cada 10 min quando o jogo começa em
  mais de 24h, a cada 2 min entre 24h e 2h antes, e a cada 30–60 s nas 2 horas finais.
- Grava em Redis (`odds:{market_id}` → seleções, odds justas, `updated_at`) e um snapshot por
  mudança em `odds_snapshots`. A última odd antes do início vira `closing_odds`.
- **Movimento brusco**: se a odd justa de uma seleção mudar mais de 8% em menos de 2 min, o mercado é
  suspenso por 2 min. Movimento assim costuma vir de escalação ou lesão, e é nessas horas que a odd do cache fica velha e explorável.

### 5.2 Aceitação do palpite (uma transação)
1. `SELECT … FROM league_entries WHERE id = $1 FOR UPDATE` (trava a banca).
2. Valida: liga `running`, jogo elegível, mercado `open`, odd no Redis com menos de 60 s e
   igual à que o cliente viu (senão devolve a nova odd para confirmar), stake ≤ 10%, odd total ≤ 25.
3. Debita `bankroll_cents`, soma em `exposure_cents`, grava `bets` e `bet_legs`.

### 5.3 Liquidação
- Resultado só vale quando **2 fontes concordam** (`result_confirmed_at`). Se divergirem, vai para revisão manual.
- Para cada evento confirmado, `idx_legs_event` encontra todas as pernas. Cada palpite é liquidado em transação
  própria, idempotente (`WHERE status = 'open'`). O worker atualiza a banca, o pico, o MDD, `n` e o CLV, e recalcula o Skill Score.
- `ZADD rank:{liga} score entry_id` e publica `league:{id}` no Redis. O ws-gateway repassa só para quem
  está inscrito naquela liga (diff de posições, não o ranking inteiro).
- **Reliquidação**: se uma fonte corrigir o placar, o worker reverte e reaplica o palpite. Até a publicação final do
  ranking isso é automático. Depois, só manual e com registro.

### 5.4 Fim da liga
`running → settling` (espera o último jogo) `→ finished`. O ranking final é gravado em
`final_rank`, e os prêmios saem da tabela `league_prize_tiers` (fixa) para `payouts` com status `held`. Depois da revisão,
o status passa a `credited` e o valor entra na carteira.

### 5.5 Antifraude

| Ameaça | Sinal | Ação |
|---|---|---|
| **Multicontas** | Mesmo dispositivo, IP residencial compartilhado, IP de datacenter ou VPN, chave Pix ou conta bancária repetida | CPF único + selfie. Pix só do titular. Grafo de vínculos entre contas: componente com 2 ou mais contas na mesma liga gera sinal |
| **Palpites opostos (hedge)** | Duas entradas da mesma liga, em lados opostos do mesmo jogo, em até 10 min e com stakes parecidos. Taxa de oposição = pares opostos / jogos em comum | Taxa acima de 50% com 5 ou mais jogos em comum e qualquer vínculo entre as contas → desclassificação |
| **Palpites espelhados** | Jaccard ponderado por stake entre os conjuntos de seleções, mais o tempo entre os palpites (cópia em segundos) | Sozinho não é fraude: seguir um tipster público é legítimo. Só pesa somado a sinais de vínculo |
| **Bots** | Intervalos entre ações com variância muito baixa, palpite segundos depois de cada mudança de odd, sessão sem eventos de interface | Rate limit por conta, captcha em anomalia, palpites só via API autenticada da sessão web |
| **Odd velha** | Palpites concentrados em odds que se moveram mais de 5% logo depois | Limite de idade da odd, suspensão em movimento brusco (5.1), CLV anômalo vai para revisão |

Toda decisão fica em `fraud_signals` com evidência em JSON. O prêmio fica em `held` até a revisão.

---

## 6. Copy da landing page

> Posicionamento: competição de estratégia e leitura de jogo. Não usa "lucro", "renda",
> "investimento" nem "trader". Cada promessa é verificável.

**Hero**

> # Sua leitura de jogo contra a de todo mundo.
> Ligas de palpites com banca virtual de R$1.000. Todo mundo começa igual, joga com as mesmas
> odds de mercado, e o ranking premia quem administra melhor a banca, não quem dá sorte uma vez.
>
> **[ Jogar a liga grátis desta semana ]**  ·  Prêmio garantido divulgado antes de cada liga
>
> <small>+18 · Jogue com responsabilidade · Regras completas</small>

**Como funciona**

1. **Escolha sua liga.** Brasileirão, Champions, NBA ou CS2. Ligas de 24h, 7 ou 30 dias, grátis ou com entrada a partir de R$10.
2. **Receba R$1.000 virtuais.** É a sua banca na liga. Ninguém deposita mais, ninguém recompra.
3. **Monte seus palpites.** Simples ou múltiplas, com até 10% da banca em cada um. As odds são a média do mercado.
4. **Suba no ranking.** O Skill Score mede retorno, constância e atividade e é atualizado a cada jogo encerrado.
5. **Receba via Pix.** Os primeiros colocados levam o prêmio anunciado, que cai na carteira e sai por Pix.

**Por que é diferente**

- **Você joga contra pessoas, não contra a casa.** A plataforma não ganha quando você perde. A taxa de serviço aparece antes de você entrar.
- **Prêmio fixo, anunciado antes.** Você sabe quanto vale cada posição antes de entrar.
- **Sorte não basta.** Um palpite de odd 20 não ganha a liga sozinho: o score pune quedas bruscas e exige um mínimo de palpites.
- **Ranking ao vivo.** Saldo e posição se atualizam quando cada jogo termina.
- **Mostre o que você sabe.** Seu histórico mostra se você pega odds melhores que as de fechamento, a métrica que separa leitura de jogo de sorte.

**Prova social / guildas**

> Entre numa guilda no Discord ou no Telegram, troque leitura de jogo com quem entende do assunto e dispute as ligas de guilda.

**CTA final**

> ## A próxima liga começa sábado, 16h.
> Entre grátis, aprenda o Skill Score e só depois decida se quer disputar uma liga com prêmio em dinheiro.
> **[ Criar conta grátis ]**
>
> <small>Proibido para menores de 18 anos. Defina limites de depósito no seu perfil.
> Precisa de ajuda? Autoexclusão disponível a qualquer momento.</small>

**Convites:** "Convide um amigo: quando ele terminar a primeira liga, vocês dois ganham entrada
numa liga patrocinada." O prêmio do convite é entrada em liga **grátis/patrocinada**, não um
cupom de liga paga, para não ser lido como bônus de aposta (risco 2).

---

## 7. Os 5 maiores riscos

| # | Risco | Tipo | Impacto | Mitigação |
|---|---|---|---|---|
| 1 | **Ser enquadrado como aposta de quota fixa sem outorga.** Os palpites usam odds de mercado sobre resultados de partidas isoladas. Isso se parece mais com aposta (com stake simulado) do que com fantasy, e a lei exclui do fantasy as disputas cujo resultado venha de uma única equipe ou atleta. Operar aposta sem outorga da SPA/MF leva a bloqueio do site e do PSP, multa e responsabilização dos sócios | Regulatório | Crítico | **(a)** Parecer jurídico especializado **antes** de cobrar a primeira entrada. **(b)** Lançar com ligas grátis e patrocinadas para validar o produto enquanto isso. **(c)** Para entrada paga, escolher um caminho: parceria ou white-label com operador licenciado (mais seguro), ou adequação ao fantasy (prêmio fixo, já feito; pontuação por desempenho agregado de vários jogos; nunca um palpite isolado decidindo a liga) |
| 2 | **Publicidade e jogo responsável.** Proibição de tratar aposta como investimento ou renda, regras para influenciadores, bônus restritos para operadores licenciados, e exigência de autoexclusão e limites | Regulatório | Alto | Posicionamento da seção 6. Selo +18 e autoexclusão desde o MVP (`users.status`, `user_limits`). Convite vira entrada em liga grátis. Revisão jurídica de todo criativo e roteiro de afiliado |
| 3 | **Pagamentos, PLD e LGPD.** PSPs podem recusar ou bloquear contas de jogos. Obrigação de reportar operações suspeitas ao COAF. Selfie e biometria são dados sensíveis pela LGPD | Regulatório + operacional | Alto | PSP que aceite o segmento por contrato, com um segundo PSP de reserva. Pix só do CPF titular (`payer_cpf`). Política de PLD com limites e alertas. Consentimento específico para biometria, retenção mínima e DPO nomeado |
| 4 | **Dados de odds e resultados.** Licença de uso comercial da API, latência e odd velha, resultado errado liquidando palpites, custo de créditos subindo com o número de ligas | Técnico | Alto | Confirmar nos termos da API o direito de exibição comercial. Odds com validade de 60 s e suspensão em movimento brusco. Resultado validado por 2 fontes. Rotina de reliquidação. Orçamento de créditos com polling adaptativo |
| 5 | **Integridade da competição.** Multicontas, palpites opostos, bots e conluio de guildas. Um único caso público mina a confiança no prêmio | Técnico + reputacional | Alto | Controles da seção 5.5. Prêmio retido 48h para revisão. 1 entrada por CPF. Regras públicas de desclassificação. Auditoria de amostras de ligas grandes |

---

## 8. Próximos passos sugeridos

1. Parecer jurídico sobre o enquadramento (risco 1). Isso decide se e como as ligas pagas existem.
2. MVP só com ligas grátis e patrocinadas: cadastro, liga de 24h, palpites pré-jogo de futebol, ranking ao vivo.
3. Validar com dados reais se o Skill Score separa jogadores. Teste: a correlação entre o score de uma liga e o da liga seguinte do mesmo jogador precisa ser positiva e estável. Sem isso, o produto é sorteio e não competição de habilidade.
4. Só então: carteira, KYC completo e ligas pagas pelo caminho escolhido no item 1.
