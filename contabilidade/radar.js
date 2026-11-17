// Radar de Economia: oportunidades LEGAIS de pagar menos ou recuperar imposto pago a mais,
// apontadas só pelo CNPJ (atividade, regime e estado). É uma triagem: o valor exato sai
// da análise das notas fiscais e declarações, revisada por um contador.
//
// seguranca: 'consolidado' = lei expressa ou decisão final de tribunal superior
//            'boa'         = entendimento majoritário, com cuidados de enquadramento
// chance:    'alta'  = a atividade quase sempre tem o caso
//            'media' = depende de detalhes que só aparecem nas notas/declarações

const cnaeNum = (c) => String(c || '').replace(/\D/g, '');
const comeca = (c, ...prefixos) => prefixos.some((p) => cnaeNum(c).startsWith(p));

const OPORTUNIDADES = {
  monofasico: {
    titulo: 'PIS e Cofins pagos em dobro sobre produtos monofásicos',
    resumo: 'Em medicamentos, cosméticos, autopeças, bebidas frias e combustíveis, o PIS e a Cofins já são pagos pela indústria ou importador. No Simples, essa parte da receita deve ser separada no cálculo do DAS. Quando não é separada, a empresa paga esses tributos de novo.',
    quemTem: 'Farmácias, drogarias, perfumarias, lojas de cosméticos, autopeças, distribuidoras de bebidas, conveniências e postos no Simples Nacional.',
    quantoRende: 'O PIS e a Cofins são uma parte do DAS. Sobre as vendas desses produtos, essa parte pode ser recuperada dos últimos 5 anos, com correção pela Selic.',
    baseLegal: 'LC 123/2006, art. 18, §4-A; Leis 10.147/2000 (medicamentos e cosméticos), 10.485/2002 (autopeças), 13.097/2015 (bebidas frias) e legislação dos combustíveis.',
    seguranca: 'consolidado',
    documentos: ['XML das notas de venda (NF-e/NFC-e) dos últimos 5 anos', 'Extratos do PGDAS-D do período'],
  },
  icmsSt: {
    titulo: 'ICMS por substituição tributária cobrado de novo no DAS',
    resumo: 'Quando o ICMS de um produto já foi recolhido antes, pelo fornecedor (substituição tributária), a revenda deve ser separada no DAS. Sem essa separação, a empresa paga o ICMS duas vezes.',
    quemTem: 'Comércio no Simples que revende produtos com ICMS-ST (bebidas, autopeças, materiais de construção, eletrônicos, cosméticos, entre outros).',
    quantoRende: 'A parte do ICMS do DAS sobre as vendas com ST, dos últimos 5 anos.',
    baseLegal: 'LC 123/2006, art. 18, §4-A, I e §14; regras de ST de cada estado.',
    seguranca: 'consolidado',
    documentos: ['XML das notas de compra e de venda', 'Extratos do PGDAS-D'],
  },
  fatorR: {
    titulo: 'Fator R: sair do Anexo V (15,5%) para o Anexo III (6%)',
    resumo: 'Para várias atividades de serviço, o Simples cobra pelo Anexo V, bem mais caro. Se a folha de pagamento, incluindo o pró-labore, for de pelo menos 28% do faturamento dos últimos 12 meses, a empresa passa para o Anexo III.',
    quemTem: 'Prestadores de serviço no Simples (tecnologia, engenharia, arquitetura, design, publicidade, consultoria, clínicas e outros).',
    quantoRende: 'Na primeira faixa, a alíquota cai de 15,5% para 6%. Ajustar o pró-labore costuma sair muito mais barato do que a diferença de imposto.',
    baseLegal: 'LC 123/2006, art. 18, §5-J e §5-M.',
    seguranca: 'consolidado',
    documentos: ['Faturamento dos últimos 12 meses', 'Folha de pagamento e pró-labore'],
  },
  icmsBasePis: {
    titulo: 'ICMS dentro da base do PIS e da Cofins',
    resumo: 'O STF decidiu que o ICMS não faz parte da base de cálculo do PIS e da Cofins. Quem ainda calcula com o ICMS incluso paga a mais e pode recuperar.',
    quemTem: 'Comércio e indústria no Lucro Presumido ou no Lucro Real.',
    quantoRende: 'PIS e Cofins sobre o ICMS destacado nas vendas, dos últimos 5 anos (respeitando o marco de 15/03/2017 fixado pelo STF).',
    baseLegal: 'STF, RE 574.706 (Tema 69), com modulação de efeitos.',
    seguranca: 'consolidado',
    documentos: ['XML das notas de venda', 'Apurações de PIS/Cofins (EFD-Contribuições)'],
  },
  equiparacaoHospitalar: {
    titulo: 'Equiparação hospitalar: presunção de 8% em vez de 32%',
    resumo: 'Clínicas que prestam serviços hospitalares, de auxílio diagnóstico ou procedimentos conforme as normas da Anvisa podem calcular o IRPJ sobre 8% do faturamento (e a CSLL sobre 12%) no Lucro Presumido, em vez de 32%.',
    quemTem: 'Clínicas médicas, de imagem, laboratórios e serviços de saúde no Lucro Presumido, organizados como sociedade empresária.',
    quantoRende: 'A base do IRPJ cai para 1/4. Pode haver valores a recuperar dos últimos 5 anos.',
    baseLegal: 'Lei 9.249/1995, art. 15, §1º, III, "a"; entendimento do STJ (REsp 1.116.399).',
    seguranca: 'boa',
    documentos: ['Contrato social', 'Alvará e licença sanitária', 'Descrição dos serviços e notas emitidas'],
  },
  insumos: {
    titulo: 'Créditos de PIS e Cofins sobre insumos (Lucro Real)',
    resumo: 'No Lucro Real, gastos essenciais para a atividade geram crédito de PIS/Cofins. O STJ ampliou o conceito de insumo, e muita empresa aproveita menos crédito do que poderia.',
    quemTem: 'Empresas no Lucro Real. Na transportadora, por exemplo: diesel, pneus, peças, manutenção e rastreamento.',
    quantoRende: '9,25% sobre os insumos que não foram creditados, dos últimos 5 anos.',
    baseLegal: 'Leis 10.637/2002 e 10.833/2003; STJ, REsp 1.221.170 (essencialidade e relevância).',
    seguranca: 'boa',
    documentos: ['Notas de compra', 'EFD-Contribuições'],
  },
  creditoOutorgadoSP: {
    titulo: 'Crédito outorgado de 20% do ICMS no frete (SP)',
    resumo: 'Transportadoras em São Paulo, fora do Simples, podem abater 20% do ICMS devido no frete. Muitas não usam ou usam errado.',
    quemTem: 'Transporte de cargas no Lucro Presumido ou no Lucro Real, com frete iniciado em SP.',
    quantoRende: '20% do ICMS do frete, cerca de 2,4 pontos percentuais sobre o valor do frete interestadual.',
    baseLegal: 'RICMS/SP, Anexo III, art. 11.',
    seguranca: 'consolidado',
    documentos: ['CT-e emitidos', 'Apuração do ICMS (SPED Fiscal)'],
  },
  issFixo: {
    titulo: 'ISS fixo para sociedade de profissionais',
    resumo: 'Em muitas cidades, sociedades de profissionais (contadores, advogados, médicos, engenheiros) podem pagar o ISS por um valor fixo por profissional, e não um percentual do faturamento.',
    quemTem: 'Sociedades uniprofissionais, em municípios que adotam o regime.',
    quantoRende: 'Depende da cidade. Para quem fatura bem, o valor fixo costuma sair bem abaixo dos 2% a 5% sobre o faturamento.',
    baseLegal: 'Decreto-Lei 406/1968, art. 9º, §§1º e 3º, e lei do município.',
    seguranca: 'boa',
    documentos: ['Contrato social', 'Registro dos sócios no conselho profissional'],
  },
  reforma: {
    titulo: 'Crédito amplo da CBS/IBS a partir de 2027',
    resumo: 'Com a Reforma, quase tudo que a empresa compra com nota passa a gerar crédito. Quem organiza fornecedores, cadastros e contratos antes de 2027 paga menos.',
    quemTem: 'Todas as empresas, principalmente as que vendem para outras empresas.',
    quantoRende: 'Varia com o volume de compras com nota e com a escolha do regime (no Simples: dentro ou fora do DAS).',
    baseLegal: 'LC 214/2025.',
    seguranca: 'consolidado',
    documentos: ['Lista de fornecedores e compras', 'Contratos de longo prazo'],
  },
};

// Atividades de serviço do Simples sujeitas ao Fator R (as mais comuns)
const FATOR_R = ['62', '6311', '6319', '7020', '711', '7120', '7319', '7410', '7420', '7490', '8630', '8640', '8650', '8660', '8690', '7500', '8599'];

function radar(emp) {
  const c = emp.cnae;
  const simples = !!emp.simples && !emp.mei;
  const normal = !emp.simples && !emp.mei;
  const achados = [];
  const add = (id, chance, motivo) => achados.push({ id, chance, motivo, ...OPORTUNIDADES[id] });

  if (simples) {
    if (comeca(c, '4771', '4772')) add('monofasico', 'alta', 'Farmácias e perfumarias vendem principalmente medicamentos e cosméticos monofásicos.');
    else if (comeca(c, '4530', '4731', '4732', '4723', '4635')) add('monofasico', 'alta', 'Autopeças, combustíveis e bebidas frias estão entre os produtos monofásicos.');
    else if (comeca(c, '4729', '4712', '4711', '4789', '4744')) add('monofasico', 'media', 'Mercados, conveniências e lojas costumam vender parte dos produtos com tributação monofásica.');
    if (comeca(c, '45', '46', '47')) add('icmsSt', comeca(c, '4530', '4723', '4635', '4744', '4731') ? 'alta' : 'media', 'Revendas costumam comprar produtos com ICMS já recolhido por substituição tributária.');
    if (comeca(c, ...FATOR_R)) add('fatorR', 'alta', 'Sua atividade pode cair no Anexo V. Com folha a partir de 28% do faturamento, vai para o Anexo III.');
  }
  if (normal) {
    if (comeca(c, '45', '46', '47') || (Number(cnaeNum(c).slice(0, 2)) >= 10 && Number(cnaeNum(c).slice(0, 2)) <= 33)) add('icmsBasePis', 'media', 'Comércio e indústria fora do Simples pagam PIS/Cofins e ICMS sobre as mesmas vendas.');
    if (comeca(c, '8610', '8630', '8640')) add('equiparacaoHospitalar', 'media', 'Sua atividade é da área da saúde, que pode ter direito à presunção reduzida.');
    if (comeca(c, '4930')) {
      add('insumos', 'media', 'Transporte tem gastos altos com diesel, pneus e peças, que geram crédito no Lucro Real.');
      if (emp.uf === 'SP') add('creditoOutorgadoSP', 'media', 'Transportadora em SP fora do Simples.');
    }
  }
  if (!emp.mei && comeca(c, '6920', '6911', '8630', '7111', '7112')) add('issFixo', 'media', 'Sua atividade é de profissão regulamentada, que pode ter ISS fixo, dependendo da cidade.');
  add('reforma', 'media', 'Vale para todas as empresas a partir de 2027.');
  return achados;
}

module.exports = { radar, OPORTUNIDADES };
