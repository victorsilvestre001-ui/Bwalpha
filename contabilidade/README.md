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
