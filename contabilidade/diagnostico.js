// Transforma os dados públicos da empresa em uma lista do que ela precisa fazer,
// cada item ligado a um serviço (e preço) do escritório em precos.json.
//
// gravidade: 'urgente'  -> bloqueia a empresa ou gera multa já
//            'atencao'  -> provável pendência, precisa confirmar
//            'rotina'   -> obrigação recorrente para não voltar a dever
//            'ok'       -> conferido e sem pendência (sem serviço)

const LINKS = {
  cndFederal: 'https://servicos.receitafederal.gov.br/servico/certidoes/#/home',
  crfFgts: 'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf',
  cndt: 'https://cndt-certidao.tst.jus.br/inicio.faces',
  listaDevedores: 'https://www.listadevedores.pgfn.gov.br/',
  regularize: 'https://www.regularize.pgfn.gov.br/',
  pgmei: 'https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/pgmei.app/Identificacao',
  dasnSimei: 'https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/dasnsimei.app/Identificacao',
};

function brl(v) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// "2026_trimestre_02" -> "2º trimestre de 2026"
function trimestre(t) {
  const m = /^(\d{4})_trimestre_0?(\d)$/.exec(t || '');
  return m ? `${m[2]}º trimestre de ${m[1]}` : t;
}

function anoDe(data) {
  return data ? Number(String(data).slice(0, 4)) : null;
}

function diagnostico(emp, hoje = new Date()) {
  const itens = [];
  const add = (item) => itens.push(item);
  const ano = hoje.getFullYear();
  const situacao = emp.situacao || '';

  // 1) Situação do CNPJ
  if (situacao === 'INAPTA') {
    const omissao = /OMISS/i.test(emp.motivoSituacao);
    add({
      gravidade: 'urgente', servico: 'regularizar_inapto',
      titulo: 'CNPJ INAPTO na Receita Federal',
      explicacao: (omissao
        ? 'A Receita marcou a empresa como inapta por deixar de entregar declarações. '
        : `Motivo informado: ${emp.motivoSituacao || 'não informado'}. `)
        + 'Com o CNPJ inapto a empresa não consegue emitir nota fiscal, os documentos podem ser considerados inidôneos e as dívidas podem cair no CPF dos sócios.',
    });
    if (omissao) {
      add({
        gravidade: 'urgente', servico: 'declaracoes_atraso',
        titulo: 'Declarações omitidas',
        explicacao: 'Para reativar é preciso entregar todas as declarações em atraso (ex.: DEFIS/PGDAS-D, DCTFWeb, ECF) e pagar as multas por atraso.',
      });
    }
  } else if (situacao === 'SUSPENSA') {
    add({
      gravidade: 'urgente', servico: 'regularizar_suspenso',
      titulo: 'CNPJ SUSPENSO',
      explicacao: `Motivo: ${emp.motivoSituacao || 'não informado'}. A empresa fica impedida de operar normalmente até corrigir a pendência cadastral.`,
    });
  } else if (situacao === 'BAIXADA' || situacao === 'NULA') {
    add({
      gravidade: 'atencao', servico: 'diagnostico_completo',
      titulo: `Empresa ${situacao.toLowerCase()}`,
      explicacao: 'O CNPJ está encerrado, mas débitos de antes da baixa continuam existindo e podem ser cobrados dos sócios. Vale levantar se ficou algo para trás.',
    });
  }

  const ativa = situacao === 'ATIVA';
  const regime = emp.mei ? 'MEI' : emp.simples ? 'Simples Nacional' : 'Lucro Presumido / Real';

  // 2) Saída do MEI / Simples
  // Saída do MEI há mais de um ano: a migração para ME normalmente já foi feita, não é alerta.
  const umAno = 365 * 24 * 60 * 60 * 1000;
  const dataEm = (d) => new Date(`${String(d).slice(0, 10)}T00:00:00`);
  if (emp.dataExclusaoMei && !emp.mei && hoje - dataEm(emp.dataExclusaoMei) <= umAno) {
    add({
      gravidade: 'urgente', servico: 'migracao_mei_me',
      titulo: 'Desenquadrada do MEI',
      explicacao: `A empresa deixou de ser MEI em ${formataData(emp.dataExclusaoMei)}. A partir daí ela tem obrigações de Microempresa (contador, declarações mensais), e quem continua pagando só o DAS-MEI acumula dívida.`,
    });
  }
  if (emp.simples && emp.dataExclusaoSimples && dataEm(emp.dataExclusaoSimples) > hoje) {
    add({
      gravidade: 'urgente', servico: 'parcelamento',
      titulo: 'Exclusão do Simples Nacional agendada',
      explicacao: `A Receita informa que a empresa sai do Simples em ${formataData(emp.dataExclusaoSimples)}. Isso costuma vir de um termo de exclusão por débitos ou pendências. Regularizando dentro do prazo do termo, a empresa continua no Simples e não passa a pagar mais imposto.`,
    });
    add({
      gravidade: 'atencao', servico: 'diagnostico_completo',
      titulo: 'Conferir o termo de exclusão',
      explicacao: 'O termo de exclusão fica na caixa postal do Simples Nacional (DTE-SN). Ele diz o motivo e o prazo para regularizar.',
    });
  }
  if (emp.dataExclusaoSimples && !emp.simples) {
    add({
      gravidade: 'urgente', servico: 'reopcao_simples',
      titulo: 'Excluída do Simples Nacional',
      explicacao: `A empresa saiu do Simples em ${formataData(emp.dataExclusaoSimples)} (normalmente por débitos). Hoje paga impostos pelo regime mais caro. Dá para quitar ou parcelar os débitos e pedir a volta ao Simples em janeiro.`,
    });
    add({
      gravidade: 'atencao', servico: 'parcelamento',
      titulo: 'Débitos do Simples Nacional',
      explicacao: 'Quem é excluído do Simples quase sempre tem DAS em aberto. O parcelamento tira a empresa da lista de devedores e libera as certidões.',
    });
  }

  // 3) Dívida ativa da União (dados abertos da PGFN) e débitos que só aparecem no e-CAC
  if (situacao !== 'NULA') {
    const d = emp.pgfn;
    const fonte = d ? ` (dados abertos da PGFN, ${trimestre(d.trimestre)})` : '';
    if (d && d.emCobranca > 0) {
      add({
        gravidade: 'urgente', servico: 'transacao_pgfn',
        titulo: `Dívida ativa na União: ${brl(d.emCobranca)} em cobrança`,
        explicacao: `${d.inscricoes} inscrição(ões) em dívida ativa${d.tipos.length ? ` (${d.tipos.join(', ')})` : ''}${d.ajuizadas ? `, ${d.ajuizadas} já cobrada(s) na Justiça` : ''}${fonte}. Dívida ativa bloqueia certidões e pode levar a penhora de contas. Os editais de transação da PGFN costumam dar grandes descontos em juros e multas e parcelar em muitas vezes.`,
        link: LINKS.regularize,
      });
    } else if (d && d.total > 0) {
      add({
        gravidade: 'atencao', servico: 'certidoes',
        titulo: `Dívida ativa regularizada: ${brl(d.total)}`,
        explicacao: `A empresa tem dívida ativa na União, mas parcelada, garantida ou suspensa${fonte}. Com as parcelas em dia dá para emitir certidão positiva com efeito de negativa.`,
        link: LINKS.regularize,
      });
    } else if (d) {
      add({
        gravidade: 'ok', servico: null,
        titulo: 'Nenhuma dívida ativa na União',
        explicacao: `O CNPJ não aparece na dívida ativa de tributos federais, INSS e FGTS${fonte}.`,
      });
    }
    add({
      gravidade: 'atencao', servico: 'diagnostico_completo',
      titulo: d ? 'Débitos na Receita, no estado e na prefeitura' : 'Dívida ativa e débitos em aberto',
      explicacao: d
        ? 'Débitos ainda não enviados para dívida ativa, impostos estaduais e municipais só aparecem com acesso ao e-CAC e aos portais do estado e da prefeitura, por procuração.'
        : 'Os valores exatos (Receita, PGFN, FGTS, estado e prefeitura) só aparecem com acesso ao e-CAC por procuração. Você mesmo pode conferir se o CNPJ está na lista pública de devedores da PGFN.',
      link: d ? undefined : LINKS.listaDevedores,
    });
    if (!d) {
      add({
        gravidade: 'atencao', servico: 'transacao_pgfn',
        titulo: 'Negociação de dívida ativa com desconto',
        explicacao: 'Se houver dívida ativa na PGFN, os editais de transação costumam dar grandes descontos em juros e multas e parcelar em muitas vezes.',
        link: LINKS.regularize,
      });
    }
    add({
      gravidade: 'atencao', servico: 'certidoes',
      titulo: 'Certidões negativas',
      explicacao: 'Sem as certidões (federal, FGTS e trabalhista) a empresa não participa de licitação, não pega empréstimo e trava contratos.',
      link: LINKS.cndFederal,
    });
  }

  // 4) Obrigações do regime
  if (ativa && emp.mei) {
    add({
      gravidade: 'atencao', servico: 'das_mei_atraso',
      titulo: 'DAS-MEI mensal',
      explicacao: 'Guia mensal com vencimento todo dia 20. Guias atrasadas viram dívida ativa e podem cancelar o CNPJ.',
      link: LINKS.pgmei,
    });
    const abertura = anoDe(emp.abertura);
    if (abertura && abertura < ano) {
      add({
        gravidade: 'atencao', servico: 'dasn_simei',
        titulo: `Declaração anual do MEI (DASN-SIMEI) de ${ano - 1}`,
        explicacao: 'Prazo até 31 de maio. Quem não entrega paga multa e, depois de dois anos sem declarar, pode ter o CNPJ cancelado.',
        link: LINKS.dasnSimei,
      });
    }
    add({
      gravidade: 'rotina', servico: 'mensal_mei',
      titulo: 'Limite de faturamento do MEI',
      explicacao: 'O MEI tem limite anual de faturamento. Passou do limite, a empresa precisa migrar para ME e pagar a diferença de impostos.',
    });
  } else if (ativa && emp.simples) {
    add({
      gravidade: 'rotina', servico: 'mensal_simples',
      titulo: 'PGDAS-D e DAS mensal',
      explicacao: 'Apuração mensal do Simples com vencimento dia 20. Atrasos levam à exclusão do Simples.',
    });
    add({
      gravidade: 'rotina', servico: 'defis',
      titulo: `DEFIS de ${ano - 1}`,
      explicacao: 'Declaração anual do Simples Nacional, prazo até 31 de março.',
    });
    add({
      gravidade: 'rotina', servico: 'mensal_simples',
      titulo: 'DCTFWeb, eSocial e FGTS Digital',
      explicacao: 'Obrigatórios para quem tem funcionário ou paga pró-labore.',
      link: LINKS.crfFgts,
    });
  } else if (ativa) {
    add({
      gravidade: 'rotina', servico: 'mensal_presumido',
      titulo: 'Obrigações do Lucro Presumido / Real',
      explicacao: 'DCTFWeb, EFD-Contribuições, EFD-Reinf, eSocial, ECD e ECF (anuais), além de ICMS/ISS conforme a atividade. Cada uma tem multa própria se atrasar.',
    });
    add({
      gravidade: 'rotina', servico: 'mensal_presumido',
      titulo: 'Avaliar se o Simples Nacional sai mais barato',
      explicacao: 'Dependendo do faturamento e da atividade, mudar de regime pode reduzir bastante os impostos.',
    });
  }

  return { regime, itens };
}

function formataData(d) {
  if (!d) return '';
  const [a, m, dia] = String(d).slice(0, 10).split('-');
  return `${dia}/${m}/${a}`;
}

// Junta o diagnóstico com a tabela de preços e monta o orçamento.
function orcamento(itens, tabela) {
  const { servicos, escritorio } = tabela;
  const comPreco = itens.map((i) => ({ ...i, preco: servicos[i.servico] ? { id: i.servico, ...servicos[i.servico] } : null }));

  // Cada serviço entra uma vez só no orçamento, mesmo que resolva vários itens.
  const unicos = new Map();
  for (const i of comPreco) if (i.preco && !unicos.has(i.preco.id)) unicos.set(i.preco.id, i.preco);
  const lista = [...unicos.values()];
  const avulsos = lista.filter((s) => !s.mensal);
  const mensais = lista.filter((s) => s.mensal);

  const totalAvulso = avulsos.reduce((t, s) => t + s.valor, 0);
  const desconto = Math.round(totalAvulso * (escritorio.descontoPacotePct || 0)) / 100;
  return {
    itens: comPreco,
    servicos: avulsos,
    mensalidade: mensais[0] || null,
    totalAvulso,
    descontoPct: escritorio.descontoPacotePct || 0,
    totalPacote: totalAvulso - desconto,
  };
}

module.exports = { diagnostico, orcamento, formataData };
