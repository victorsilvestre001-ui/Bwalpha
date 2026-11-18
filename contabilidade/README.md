# Site da contabilidade (V&J Assessoria Contábil)

Site completo do escritório: menu, apresentação, **abertura, alteração e baixa de CNPJ** (blocos com ilustrações), serviços, como funciona, planos mensais, contador virtual, sobre, dúvidas frequentes, contato e rodapé. As seções e ilustrações aparecem com animação conforme a pessoa rola a página (desligada para quem pede menos movimento no sistema).

Arquivos da página: `public/index.html` (conteúdo), `public/estilo.css` (visual), `public/app.js` (consulta, chat, formulários e animações), `public/img/*.svg` (ilustrações).

No topo do site fica a consulta grátis por CNPJ. A pessoa digita o CNPJ e o site mostra:

1. **Dados da empresa na Receita** — situação (ativa, inapta, suspensa, baixada), regime (MEI, Simples, Presumido/Real), atividade, abertura.
2. **O que ela precisa fazer para ficar em dia** — pendências urgentes (CNPJ inapto, exclusão do Simples, desenquadramento do MEI), itens para verificar (dívida ativa, certidões) e obrigações de rotina do regime.
3. **Quanto custa resolver cada item com o escritório** — preço, prazo, desconto de pacote, e botão "Quero resolver" que salva o contato e abre o WhatsApp com o orçamento pronto.
4. **Contador virtual com IA (Claude)** — chat que já conhece os dados e o diagnóstico da empresa consultada e responde dúvidas na hora, em linguagem simples, sempre citando os preços da tabela. A resposta aparece aos poucos, enquanto é escrita.
5. **Painel do escritório** em `/admin` — lista de contatos, totais de orçamentos, botão de WhatsApp para cada cliente e exportação para planilha (CSV).

## Rodar

```bash
cd contabilidade
npm install
npm start            # http://localhost:3100
npm test
```

Variáveis de ambiente (veja `.env.example`):

- `ANTHROPIC_API_KEY` — liga o contador virtual. Sem ela o site funciona normalmente, só sem o chat.
- `ADMIN_SENHA` — senha do painel `/admin`.
- `ARQ_CONTATOS` — onde gravar os contatos (na hospedagem, aponte para um volume persistente).

`DEMO=1 npm start` responde qualquer CNPJ com uma empresa de exemplo (útil sem internet).
Os CNPJs `11.222.333/0001-81` e `12.345.678/0001-95` são sempre de demonstração.

## Configurar o escritório

Tudo em **`precos.json`** (vale na hora, sem reiniciar):

- `escritorio.nome`, `whatsapp` (só números, com 55 + DDD), `email`, `cidade`, `cnpj`
- `escritorio.corPrincipal` (azul-marinho), `corDestaque` (dourado), `logoUrl` (endereço da imagem do logo) e `fundacao` (ano mostrado em "Sobre")
- `servicos.mensal_*.itens` — o que aparece em cada plano mensal; `destaque: true` marca o plano "Mais escolhido"
- `escritorio.descontoPacotePct`
- `servicos.*.valor` / `prazo` / `nome` — o preço de cada assunto

Os contatos de quem clicou em "Quero resolver" ficam em `contatos.jsonl` (um por linha) e aparecem no painel `/admin`.

## Contador virtual (IA)

`assistente.js` monta, no servidor, o contexto da empresa (dados da Receita + diagnóstico + preços) e chama o Claude com streaming. O navegador só manda as perguntas; ele não consegue alterar os dados nem os preços que a IA vê. Limites: 8 perguntas por minuto por IP, 20 mensagens por conversa, 2.000 caracteres por mensagem.

## De onde vêm os dados

- Cadastro: APIs públicas e gratuitas da base da Receita (BrasilAPI, com CNPJ.ws de reserva).
- **Valores exatos de débitos** (Receita, PGFN, FGTS, estado, prefeitura) **não são públicos**: só com acesso ao e-CAC por procuração/certificado digital. Por isso o site mostra o que é provável pela situação cadastral e vende o "levantamento completo" como primeiro passo. Para automatizar isso no futuro, dá para plugar uma API paga de certidões/débitos em `consulta.js`.
- As regras ficam em `diagnostico.js` — cada item aponta para um serviço do `precos.json`.

Aceita CNPJ alfanumérico (novo formato da Receita).

## Simulador de impostos (`/planejamento`)

Página guiada em 3 passos (atividade → números → resultado) que compara Simples Nacional, Lucro Presumido e Lucro Real e mostra o cenário de 2027 com a Reforma Tributária (CBS no lugar de PIS/Cofins, Simples "por dentro" × regime híbrido). Também abre direto do diagnóstico do CNPJ (`/planejamento?cnpj=...`).

Todas as alíquotas e tabelas estão em **`public/tributos.js` → `REGRAS`**, com a lei de origem. Quando a lei mudar, atualize só esse bloco e o campo `atualizadoEm`. Fontes usadas (nov/2026):

- Simples Nacional: LC 123/2006 (com LC 155/2016); transporte de cargas no Anexo III trocando ISS pelo ICMS do Anexo I (art. 18, §5-E)
- Lucro Presumido: Lei 9.249/1995 (8% IRPJ e 12% CSLL para transporte de cargas); LC 224/2025 (+10% na presunção sobre a receita acima de R$ 5 mi)
- Desoneração da folha do transporte rodoviário de cargas: Lei 14.973/2024 (2026: 0,9% da receita + 10% da folha; 2027: 0,6% + 15%; fim em 2028)
- ICMS/SP: crédito outorgado de 20% para transporte (RICMS/SP, Anexo III, art. 11), não vale para o Simples
- Reforma: LC 214/2025. A alíquota de referência da CBS para 2027 ainda não é oficial; o simulador usa 8,8% como estimativa
- MEI: R$ 81 mil em 2026; MEI caminhoneiro R$ 251,6 mil; LC 238/2026 eleva o MEI para R$ 110 mil (2027) e R$ 140 mil (2028), a confirmar no texto oficial

É uma estimativa: ICMS e ISS variam por estado, cidade e produto, e benefícios fiscais e substituição tributária não estão no cálculo.

## Área do Cliente (`/area`) — login, plano pago, notas e orçamentos

- **Conta**: cadastro com nome, CNPJ, e-mail, WhatsApp e senha (scrypt). Sessão em cookie httpOnly. Dados em `DADOS_DIR/portal.json` (`portal/db.js`).
- **Planos** (`precos.json` → `planosPortal`): Essencial e Completo. Sem plano ativo as ferramentas respondem 402 e a tela mostra os planos.
- **Pagamento**: assinatura mensal no Asaas (`portal/pagamentos.js`) com `ASAAS_API_KEY` e webhook em `/api/asaas/webhook` (token em `ASAAS_WEBHOOK_TOKEN`, eventos de pagamento). Cada pagamento libera 35 dias. Sem a chave, o pedido fica registrado e a equipe libera em `/admin` (botão "+30 dias").
- **Minha empresa**: diagnóstico, plano da Reforma e o "agente": o CNPJ é reconsultado a cada 24 h e mudanças viram alertas (situação, novos itens urgentes, dívida ativa).
- **Notas fiscais (NFS-e Nacional)**: o assinante informa CNPJ/CPF do cliente, descrição e valor → rascunho com os dados do tomador puxados pelo CNPJ → confirma → emissão. Com `FOCUS_NFE_TOKEN` (e `FOCUS_NFE_AMBIENTE=homologacao` para testes) a nota vai direto para a API da Focus NFe (`POST /v2/nfsen`, consulta e cancelamento em `portal/notas.js`), o que exige a empresa cadastrada na Focus com certificado A1 e a configuração fiscal (código IBGE do município e código de tributação nacional). Sem o token, a nota entra na **fila da equipe** no `/admin`, que emite e anexa número e PDF.
- **NFS-e Nacional direto na Receita** (`portal/nfse-nacional.js`): com `NFSE_NACIONAL=1`, a empresa que tem o certificado A1 conectado e os "Dados da nota" preenchidos no `/admin` emite sem intermediário. O site monta a DPS (leiaute v1.01), assina com o A1 (XMLDSig, C14N, RSA-SHA256), envia por TLS mútuo para a Sefin Nacional (`POST /nfse`), guarda o XML e o PDF (DANFSe do ADN) no volume e cria o link público `/nf/<token>` para enviar ao tomador. Sem resposta da Receita, a nota fica "processando" e é conferida pela DPS (`GET /dps/{id}`). Cancelamento pelo evento 101101. `NFSE_AMBIENTE=homologacao` usa a produção restrita para testes. A numeração da DPS (série e próximo número) é a do `/admin`: use uma série só do site para não colidir com notas feitas no Emissor Nacional pela web.
- **Orçamentos**: CNPJ do cliente, itens, valores, desconto, prazo, pagamento e escopo (com botão de IA se houver `ANTHROPIC_API_KEY`) → página pública `/o/<token>` pronta para imprimir/PDF e aprovar pelo WhatsApp.
- Testes: `npm test` (inclui `teste-portal.js`, ponta a ponta).

## Resumo diário (relacionamento com o cliente)

Todo dia útil, a partir de `RESUMO_HORA` (padrão 7h, horário de Brasília), cada assinante ativo recebe um resumo (`portal/resumo.js`):
agenda de impostos dos próximos 10 dias conforme o regime e se tem funcionários (`portal/agenda.js`, com feriados nacionais),
orçamentos aguardando aprovação (com os que vencem logo em destaque), respostas de clientes, notas emitidas, alertas da empresa e uma dica da Reforma.

- **E-mail**: Resend (`RESEND_API_KEY` e `EMAIL_FROM` com domínio verificado no Resend).
- **WhatsApp**: API oficial do WhatsApp Business (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_TEMPLATE`, `WHATSAPP_TEMPLATE_LANG`). Mensagem iniciada pela empresa precisa de modelo aprovado pela Meta (categoria Utilidade). Texto do modelo completo (6 variáveis):

  ```
  Bom dia, {{1}}! ☀️ Seu resumo de hoje na V&J Assessoria Contábil:

  📅 *Impostos e prazos:* {{2}}

  📝 *Orçamentos:* {{3}}

  🔔 *Novidades:* {{4}}

  💡 *Dica da Reforma:* {{5}}

  Veja tudo na sua Área do Cliente: {{6}}
  ```

  Com `WHATSAPP_FORMATO=curto`, usa um modelo de 3 variáveis (nome, resumo em uma linha, link).
- **Dono do site**: conta com `papel: dono` (definido no `/admin`) tem acesso total sem mensalidade e entra no `/admin` pelo próprio login.
- `SITE_URL`: endereço usado nos links (padrão: o domínio do Railway).
- O cliente liga/desliga e escolhe os canais em **Minha conta**; o mesmo resumo aparece no topo de **Minha empresa**.
- No `/admin`, cada assinante tem **Ver resumo do dia** (prévia do e-mail) e **Enviar resumo agora**.
- Orçamentos agora têm situação (aguardando/aprovado/recusado). O cliente aprova ou recusa na própria página do orçamento e o assinante recebe um alerta.
