// Plano da Reforma Tributária gerado só com os dados públicos do CNPJ:
// atividade (CNAE), regime atual, porte e datas de exclusão do Simples/MEI.
// Fontes e datas conferidas em nov/2026 (ver README). Onde as fontes divergem, o texto
// pede para confirmar o prazo oficial em vez de cravar uma data.

const { setorPorCnae, REGRAS } = require('./public/tributos');

const cnaeNum = (c) => String(c || '').replace(/\D/g, '');
const div = (c) => Number(cnaeNum(c).slice(0, 2));
const pct = (v) => `${(v * 100).toFixed(1).replace('.', ',')}%`;

// Quanto da receita costuma vir de outras empresas (que aproveitam crédito de IBS/CBS)
function perfilClientes(cnae, setor) {
  const d = div(cnae);
  if (setor === 'transporte' || setor === 'industria' || d === 46) return 'empresas';
  if (d === 47 || d === 56 || d === 96 || d === 93 || d === 55) return 'consumidores';
  if ([62, 63, 69, 70, 71, 72, 73, 74, 77, 78, 80, 81, 82, 43, 42, 41].includes(d)) return 'empresas';
  return 'misto';
}

// Reduções de alíquota da LC 214/2025 (arts. 127 e 128) que a atividade pode ter
function reducao(cnae) {
  const d = div(cnae);
  if (d === 86) return { pct: 60, texto: 'Serviços de saúde podem ter redução de 60% no IBS e na CBS (LC 214/2025, art. 128 e Anexo III), conforme o serviço prestado.' };
  if (d === 85) return { pct: 60, texto: 'Serviços de educação podem ter redução de 60% no IBS e na CBS (LC 214/2025, art. 128 e Anexo II), conforme o curso.' };
  if ([69, 71, 75].includes(d) || /^7319|^7490/.test(cnaeNum(cnae))) {
    return { pct: 30, texto: 'Profissões regulamentadas (contador, advogado, engenheiro, arquiteto, veterinário e outras) podem ter redução de 30% (LC 214/2025, art. 127). Exige sócios habilitados e fiscalizados pelo conselho profissional.' };
  }
  return null;
}

function planoReforma(emp) {
  const setor = setorPorCnae(emp.cnae) || 'servicos';
  const clientes = perfilClientes(emp.cnae, setor);
  const red = reducao(emp.cnae);
  const regime = emp.mei ? 'mei' : emp.simples ? 'simples' : 'normal';
  const hoje = new Date();
  const saiDoSimples = emp.simples && emp.dataExclusaoSimples && new Date(`${String(emp.dataExclusaoSimples).slice(0, 10)}T00:00:00`) > hoje;
  const cbs = REGRAS.reforma.cbs2027;
  const acoes = [];
  const add = (quando, titulo, texto, extra = {}) => acoes.push({ quando, titulo, texto, ...extra });

  // Impacto geral
  let impacto;
  if (saiDoSimples) impacto = { nivel: 'alto', texto: `A empresa sai do Simples em ${String(emp.dataExclusaoSimples).slice(0, 10).split('-').reverse().join('/')} e entra direto no sistema novo, já com a CBS de 2027. É o caso que mais exige preparação.` };
  else if (regime === 'normal' && setor === 'servicos' && !red) impacto = { nivel: 'alto', texto: `Serviços fora do Simples costumam ter pouco crédito para descontar. Trocar PIS/Cofins (3,65% no Presumido) pela CBS (cerca de ${pct(cbs)}) pode aumentar o imposto.` };
  else if (regime === 'simples' && clientes === 'empresas') impacto = { nivel: 'medio', texto: 'Seus clientes são empresas e vão comparar o crédito de imposto que cada fornecedor gera. Ficar no Simples continua possível, mas a escolha entre recolher IBS/CBS dentro ou fora do DAS afeta seu preço.' };
  else if (regime === 'normal') impacto = { nivel: 'medio', texto: 'A CBS substitui PIS/Cofins em 2027 com crédito amplo. Para quem tem muitos custos com nota, pode até reduzir o imposto. Para isso, notas, cadastros e contratos precisam estar ajustados.' };
  else impacto = { nivel: 'baixo', texto: 'Para quem vende principalmente para consumidor final no Simples ou MEI, o impacto direto é menor: o imposto segue dentro do DAS. A atenção fica nas notas fiscais e nos prazos.' };

  // Notas fiscais
  if (regime === 'normal') {
    add('Já em vigor', 'Notas com IBS e CBS destacados', `Desde ago/2026, NF-e, NFC-e${setor === 'transporte' ? ', CT-e e MDF-e' : ''} sem os grupos de IBS/CBS e o código cClassTrib passam a ser rejeitadas. Para a NFS-e, a obrigação começou em out/2026. Confira se o emissor de notas já está atualizado.`, { servico: 'diagnostico_completo' });
  } else {
    add('Até jan/2027', 'Notas fiscais no padrão novo', `${regime === 'mei' ? 'O MEI já emite NFS-e pelo Emissor Nacional desde 2023. ' : 'A NFS-e Nacional passa a ser obrigatória para o Simples (as fontes citam de set a nov/2026: confirme a data do seu município). '}Para optantes do Simples e MEI, os campos de IBS/CBS nas notas ficam obrigatórios a partir de janeiro de 2027.`);
  }

  // Regime
  if (saiDoSimples) {
    add('Urgente', 'Exclusão do Simples marcada', 'Regularizando dentro do prazo do termo de exclusão, a empresa continua no Simples. Se sair, em 2027 passa a pagar IRPJ, CSLL, CBS e, depois, IBS pelas regras gerais. Faça a simulação já pensando nesse cenário.', { servico: 'parcelamento' });
  }
  if (regime === 'mei') {
    add('2027', 'Novo limite do MEI', `A LC 238/2026 eleva o limite do MEI para R$ 110 mil em 2027 e R$ 140 mil em 2028 (hoje é R$ 81 mil${setor === 'transporte' ? '; o MEI caminhoneiro tem limite próprio de R$ 251,6 mil' : ''}). Pode ser possível continuar como MEI faturando mais.`);
    if (clientes === 'empresas') add('2027', 'Crédito para seus clientes', 'Empresas que contratam MEI recebem pouco crédito de IBS/CBS. Se você vende muito para empresas, avalie com a gente se vale migrar para ME com o regime híbrido.', { servico: 'migracao_mei_me' });
  }
  if (regime === 'simples' && !saiDoSimples) {
    add('Por semestre, a partir de 2027', 'IBS e CBS dentro ou fora do DAS?', clientes === 'empresas'
      ? 'Seus clientes são principalmente empresas: o regime híbrido (IBS/CBS fora do DAS) dá a eles crédito cheio e pode deixar seu preço mais competitivo, mas aumenta o seu imposto e as obrigações. A escolha é semestral: o prazo para o 1º semestre de 2027 terminou em out/2026, então prepare a decisão para o 2º semestre.'
      : 'Vendendo mais para consumidor final, manter IBS/CBS dentro do DAS tende a ser o mais simples e barato. A escolha é semestral: reavalie se passar a vender mais para empresas.', { servico: 'diagnostico_completo', simulador: true });
  }
  if (regime === 'normal') {
    add('Jan/2027', `PIS e Cofins viram CBS (cerca de ${pct(cbs)})`, 'Revise preços e contratos de longo prazo (inclua cláusula de reequilíbrio pelo novo imposto), cadastre produtos e serviços com o cClassTrib e mapeie os créditos de cada compra. O pagamento dividido (split payment) começa de forma facultativa.', { servico: 'diagnostico_completo' });
    add('2026', 'Presumido ou Real?', 'Com a CBS não cumulativa e o aumento da presunção do Presumido acima de R$ 5 milhões (LC 224/2025), o Lucro Real pode passar a valer a pena. Refaça a conta antes de jan/2027.', { simulador: true });
  }

  // Setor
  if (setor === 'transporte') {
    add('2027', 'Crédito do diesel e dos fretes', 'Diesel, pneus e peças geram crédito de CBS. Quem contrata caminhoneiro autônomo (TAC) pode ter crédito presumido, desde que ele esteja no RNTRC e emita documento fiscal (LC 214/2025, art. 169). Organize as notas de abastecimento e manutenção.');
    if (regime === 'normal') add('2025–2028', 'Fim da desoneração da folha', 'O transporte de cargas está saindo da desoneração aos poucos: em 2026 são 0,9% sobre a receita + 10% sobre a folha; em 2027, 0,6% + 15%; em 2028 volta a 20% sobre a folha.');
  } else if (setor === 'comercio') {
    add('2026–2027', 'Cadastro de produtos', 'Cada produto precisa de NCM correto e do cClassTrib. Itens da cesta básica nacional têm alíquota zero, e alguns alimentos e produtos têm redução. Um cadastro errado faz pagar imposto a mais ou leva a autuação.');
  } else if (setor === 'industria') {
    add('2027', 'IPI zerado e Imposto Seletivo', 'Em 2027 o IPI é zerado para a maioria dos produtos (exceto os que concorrem com a Zona Franca de Manaus), e o Imposto Seletivo passa a valer para itens como bebidas, cigarros e veículos. Revise a formação de preço.');
  } else {
    add('2029–2033', 'ISS vira IBS', 'O ISS vai sendo trocado pelo IBS de 2029 a 2033, e o imposto passa a ser cobrado no local do cliente (destino). Contratos longos devem prever essa mudança.');
  }
  if (red) add('Agora', `Redução de ${red.pct}% no seu setor`, red.texto);

  add('2029–2033', 'Transição final', 'ICMS e ISS diminuem a cada ano enquanto o IBS sobe. Em 2033 restam só CBS, IBS e Imposto Seletivo. Os benefícios fiscais de ICMS também vão acabando.');

  const ordem = ['Urgente', 'Já em vigor', 'Agora', '2026', 'Até jan/2027', 'Jan/2027', 'Por semestre, a partir de 2027', '2027', '2026–2027', '2025–2028', '2029–2033'];
  acoes.sort((a, b) => ordem.indexOf(a.quando) - ordem.indexOf(b.quando));

  const nomes = { mei: 'MEI', simples: 'Simples Nacional', normal: 'Lucro Presumido ou Real' };
  const textoClientes = { empresas: 'vende principalmente para outras empresas', consumidores: 'vende principalmente para consumidor final', misto: 'vende para empresas e consumidores' };
  return {
    setor, clientes, reducao: red, impacto, acoes,
    resumo: `Pela atividade (${emp.atividade || 'não informada'}), a empresa ${textoClientes[clientes]} e hoje está no ${nomes[regime]}.`,
  };
}

module.exports = { planoReforma, perfilClientes, reducao };
