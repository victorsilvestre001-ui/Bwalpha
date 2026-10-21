// Contador virtual com IA: responde perguntas do cliente sobre a empresa que ele
// acabou de consultar, usando só os dados da Receita, o diagnóstico e a tabela de
// preços do escritório. O contexto é montado no servidor (nunca vem do navegador).

const Anthropic = require('@anthropic-ai/sdk');
const { formataData } = require('./diagnostico');

const MODELO = 'claude-opus-5-5';
const client = new Anthropic(); // usa ANTHROPIC_API_KEY

const MAX_MENSAGENS = 20;
const MAX_CARACTERES = 2000;

function ativo() {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

function brl(v) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Instruções fixas primeiro (ficam em cache); os dados da empresa vêm depois.
function instrucoes(escritorio) {
  return `Você é o contador virtual do escritório "${escritorio.nome}", atendendo pelo site.
A pessoa acabou de consultar o CNPJ de uma empresa. Abaixo estão os dados públicos da Receita, o diagnóstico automático e a tabela de preços do escritório.

Como responder:
- Português do Brasil, simples, sem juridiquês. Frases curtas. No máximo 3 parágrafos curtos ou uma lista curta.
- Use só os dados fornecidos e conhecimento geral de contabilidade e legislação brasileira. Nunca invente valores de dívida, multas exatas ou datas que não estão nos dados: valores exatos só saem do levantamento completo (acesso ao e-CAC por procuração).
- Quando falar de um serviço, cite o preço e o prazo da tabela do escritório. Não ofereça descontos nem preços diferentes da tabela.
- Quando fizer sentido, convide a pessoa a marcar os itens na tela e clicar em "Quero resolver" para falar com a equipe no WhatsApp.
- Se a pergunta não tiver relação com a empresa, contabilidade ou os serviços, diga com educação que só pode ajudar com esses assuntos.
- Para decisões com risco (encerrar empresa, mudar de regime, processos), explique os caminhos e recomende conversar com um contador da equipe.`;
}

function contexto(empresa, orcamento) {
  const e = empresa;
  const linhas = [
    `Razão social: ${e.razaoSocial}${e.nomeFantasia ? ` (${e.nomeFantasia})` : ''}`,
    `CNPJ: ${e.cnpjFormatado}`,
    `Situação cadastral: ${e.situacao}${e.dataSituacao ? ` desde ${formataData(e.dataSituacao)}` : ''}${e.motivoSituacao ? ` — motivo: ${e.motivoSituacao}` : ''}`,
    `Regime: ${e.regime}`,
    `Abertura: ${formataData(e.abertura)} | Porte: ${e.porte} | Natureza: ${e.naturezaJuridica}`,
    `Atividade principal: ${e.cnae} ${e.atividade}`,
    `Cidade: ${e.municipio}/${e.uf} | Capital social: ${brl(e.capitalSocial || 0)}`,
  ];
  if (e.dataExclusaoSimples) linhas.push(`Excluída do Simples em ${formataData(e.dataExclusaoSimples)}`);
  if (e.dataExclusaoMei) linhas.push(`Desenquadrada do MEI em ${formataData(e.dataExclusaoMei)}`);
  if (e.socios && e.socios.length) linhas.push(`Sócios: ${e.socios.map((s) => `${s.nome} (${s.qualificacao})`).join('; ')}`);

  const itens = orcamento.itens.map((i) => `- [${i.gravidade}] ${i.titulo}: ${i.explicacao}`
    + (i.preco ? ` → serviço: ${i.preco.nome}, ${brl(i.preco.valor)}${i.preco.mensal ? '/mês' : ''}${i.preco.prazo ? `, prazo ${i.preco.prazo}` : ''}` : ''));

  return `<empresa>\n${linhas.join('\n')}\n</empresa>\n\n<diagnostico>\n${itens.join('\n')}\n</diagnostico>\n\n`
    + `<pacote>Todos os serviços avulsos: ${brl(orcamento.totalAvulso)}; no pacote com ${orcamento.descontoPct}% de desconto: ${brl(orcamento.totalPacote)}.`
    + `${orcamento.mensalidade ? ` Acompanhamento recomendado: ${orcamento.mensalidade.nome}, ${brl(orcamento.mensalidade.valor)}/mês.` : ''}</pacote>`;
}

// Aceita só {role, content: string} alternando user/assistant, começando e terminando em user.
function limpaMensagens(mensagens) {
  if (!Array.isArray(mensagens) || !mensagens.length) return null;
  const ult = mensagens.slice(-MAX_MENSAGENS);
  while (ult.length && ult[0].role !== 'user') ult.shift();
  const limpas = ult.map((m) => ({
    role: m && m.role === 'assistant' ? 'assistant' : 'user',
    content: String((m && m.content) || '').slice(0, MAX_CARACTERES).trim(),
  })).filter((m) => m.content);
  if (!limpas.length || limpas[limpas.length - 1].role !== 'user') return null;
  return limpas;
}

// Transmite a resposta aos poucos: onTexto é chamado a cada pedaço de texto.
async function responde({ empresa, orcamento, escritorio, mensagens }, onTexto) {
  const stream = client.beta.messages.stream({
    model: MODELO,
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system: [
      { type: 'text', text: instrucoes(escritorio), cache_control: { type: 'ephemeral' } },
      { type: 'text', text: contexto(empresa, orcamento) },
    ],
    messages: mensagens,
  });

  for await (const ev of stream) {
    if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') onTexto(ev.delta.text);
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === 'refusal') {
    onTexto('Não consigo ajudar com essa pergunta. Posso explicar a situação da empresa ou os serviços para regularizá-la.');
  }
}

module.exports = { ativo, responde, limpaMensagens, contexto, Anthropic };
