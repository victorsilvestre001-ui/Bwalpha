# Consulta de Empresa (site da contabilidade)

A pessoa digita o CNPJ e o site mostra:

1. **Dados da empresa na Receita** — situação (ativa, inapta, suspensa, baixada), regime (MEI, Simples, Presumido/Real), atividade, abertura.
2. **O que ela precisa fazer para ficar em dia** — pendências urgentes (CNPJ inapto, exclusão do Simples, desenquadramento do MEI), itens para verificar (dívida ativa, certidões) e obrigações de rotina do regime.
3. **Quanto custa resolver cada item com o escritório** — preço, prazo, desconto de pacote, e botão "Quero resolver" que salva o contato e abre o WhatsApp com o orçamento pronto.

## Rodar

```bash
cd contabilidade
npm install
npm start            # http://localhost:3100
npm test
```

`DEMO=1 npm start` responde qualquer CNPJ com uma empresa de exemplo (útil sem internet).
Os CNPJs `11.222.333/0001-81` e `12.345.678/0001-95` são sempre de demonstração.

## Configurar o escritório

Tudo em **`precos.json`** (vale na hora, sem reiniciar):

- `escritorio.nome`, `escritorio.whatsapp` (só números, com 55 + DDD), `escritorio.descontoPacotePct`
- `servicos.*.valor` / `prazo` / `nome` — o preço de cada assunto

Os contatos de quem clicou em "Quero resolver" ficam em `contatos.jsonl` (um por linha).

## De onde vêm os dados

- Cadastro: APIs públicas e gratuitas da base da Receita (BrasilAPI, com CNPJ.ws de reserva).
- **Valores exatos de débitos** (Receita, PGFN, FGTS, estado, prefeitura) **não são públicos**: só com acesso ao e-CAC por procuração/certificado digital. Por isso o site mostra o que é provável pela situação cadastral e vende o "levantamento completo" como primeiro passo. Para automatizar isso no futuro, dá para plugar uma API paga de certidões/débitos em `consulta.js`.
- As regras ficam em `diagnostico.js` — cada item aponta para um serviço do `precos.json`.

Aceita CNPJ alfanumérico (novo formato da Receita).
