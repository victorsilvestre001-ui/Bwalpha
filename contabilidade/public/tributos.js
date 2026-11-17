// Simulador de regimes tributários (estimativa). Funciona no navegador e no Node (testes).
//
// TODAS as alíquotas e tabelas ficam em REGRAS, com a lei de origem. Quando a lei mudar,
// atualize só este bloco. Valores conferidos em nov/2026; ver README para as fontes.
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.Tributos = fabrica();
}(typeof self !== 'undefined' ? self : this, function () {
  const REGRAS = {
    atualizadoEm: '2026-11',

    // Simples Nacional — LC 123/2006 com LC 155/2016. [limite, alíquota nominal, parcela a deduzir]
    simples: {
      limite: 4800000,
      sublimiteIcmsIss: 3600000,
      anexos: {
        I:   [[180000, .04, 0], [360000, .073, 5940], [720000, .095, 13860], [1800000, .107, 22500], [3600000, .143, 87300], [4800000, .19, 378000]],
        II:  [[180000, .045, 0], [360000, .078, 5940], [720000, .10, 13860], [1800000, .112, 22500], [3600000, .147, 85500], [4800000, .30, 720000]],
        III: [[180000, .06, 0], [360000, .112, 9360], [720000, .135, 17640], [1800000, .16, 35640], [3600000, .21, 125640], [4800000, .33, 648000]],
        V:   [[180000, .155, 0], [360000, .18, 4500], [720000, .195, 9900], [1800000, .205, 17100], [3600000, .23, 62100], [4800000, .305, 540000]],
      },
      // Partilha por faixa (participação de cada tributo dentro do DAS)
      partilha: {
        I:   { icms: [.34, .34, .335, .335, .335, 0], pis: [.0276, .0276, .0276, .0276, .0276, .0613], cofins: [.1274, .1274, .1274, .1274, .1274, .2827] },
        II:  { pis: [.0249, .0249, .0249, .0249, .0249, .0454], cofins: [.1151, .1151, .1151, .1151, .1151, .2096] },
        III: { iss: [.335, .32, .325, .325, .335, 0], pis: [.0278, .0305, .0296, .0296, .0278, .0347], cofins: [.1282, .1405, .1364, .1364, .1282, .1603] },
        V:   { pis: [.0305, .0305, .0323, .0341, .0394, .0356], cofins: [.141, .141, .1492, .1574, .1815, .1644] },
      },
      fatorR: 0.28, // folha/faturamento >= 28% leva serviços do Anexo V para o III
    },

    // Lucro Presumido — Lei 9.249/1995; LC 224/2025 (+10% na presunção sobre a receita acima de R$ 5 mi, desde 2026)
    presumido: {
      presuncao: {
        transporte: { irpj: .08, csll: .12 },
        comercio: { irpj: .08, csll: .12 },
        industria: { irpj: .08, csll: .12 },
        servicos: { irpj: .32, csll: .32 },
      },
      acrescimoAcimaDe: 5000000,
      acrescimo: 0.10,
      pisCofins: 0.0365, // cumulativo
    },
    irpj: { aliquota: .15, adicional: .10, isencaoAdicionalAno: 240000 },
    csll: .09,
    real: { pisCofins: 0.0925 }, // não cumulativo, com crédito sobre insumos

    // Encargos sobre a folha fora do Simples
    folha: {
      cppPatronal: .20,
      ratTerceiros: .088,        // RAT/FAP médio (~3%) + terceiros (~5,8%): varia por empresa
      // Transporte rodoviário de cargas: reoneração gradual (Lei 14.973/2024)
      cprbTransporte: { 2026: { receita: .009, folha: .10 }, 2027: { receita: .006, folha: .15 }, 2028: null },
    },

    icms: {
      freteInterestadual: .12,
      creditoOutorgadoSP: .20, // RICMS/SP, Anexo III, art. 11 (não vale para o Simples)
      mercadoriaPadrao: .18,
    },
    issPadrao: .05,

    mei: { limite2026: 81000, limiteCaminhoneiro: 251600, limite2027: 110000, limite2028: 140000 },

    // Reforma Tributária — LC 214/2025. A alíquota de referência da CBS de 2027 ainda não foi
    // fixada oficialmente: 8,8% é estimativa de mercado e deve ser revista quando sair.
    reforma: {
      cbs2027: .088,
      ibs2027: .001,
      cronograma: [
        ['2026', 'Ano de teste: CBS 0,9% e IBS 0,1% informados na nota, compensados com PIS/Cofins. Na prática, sem custo extra.'],
        ['2027', 'A CBS substitui PIS e Cofins. Começa a escolha do Simples: IBS/CBS dentro do DAS ou no regime regular (híbrido).'],
        ['2029–2032', 'ICMS e ISS vão diminuindo aos poucos e o IBS vai aumentando.'],
        ['2033', 'Sistema novo completo: só CBS, IBS e Imposto Seletivo.'],
      ],
    },
  };

  const SETORES = {
    transporte: 'Transporte de cargas',
    comercio: 'Comércio',
    industria: 'Indústria',
    servicos: 'Serviços',
  };

  function setorPorCnae(cnae) {
    const c = String(cnae || '').replace(/\D/g, '');
    if (/^4930/.test(c)) return 'transporte';
    const div = Number(c.slice(0, 2));
    if (div >= 10 && div <= 33) return 'industria';
    if (div >= 45 && div <= 47) return 'comercio';
    return c ? 'servicos' : null;
  }

  function faixa(anexo, rbt12) {
    const t = REGRAS.simples.anexos[anexo];
    for (let i = 0; i < t.length; i++) if (rbt12 <= t[i][0]) return i;
    return t.length - 1;
  }

  function aliquotaEfetiva(anexo, rbt12) {
    if (rbt12 <= 0) return 0;
    const i = faixa(anexo, rbt12);
    const [, nom, pd] = REGRAS.simples.anexos[anexo][i];
    return Math.max(0, (rbt12 * nom - pd) / rbt12);
  }

  function irpjCsll(base, baseCsll) {
    const { aliquota, adicional, isencaoAdicionalAno } = REGRAS.irpj;
    const irpj = Math.max(0, base) * aliquota + Math.max(0, base - isencaoAdicionalAno) * adicional;
    const csll = Math.max(0, baseCsll) * REGRAS.csll;
    return { irpj, csll };
  }

  // Encargos da folha fora do Simples. No transporte de cargas, usa a desoneração quando ela sai mais barata.
  function encargosFolha(e, ano) {
    const f = REGRAS.folha;
    const normal = (e.folha + e.prolabore) * f.cppPatronal + e.folha * f.ratTerceiros;
    const cprb = e.setor === 'transporte' && f.cprbTransporte[ano];
    if (cprb) {
      const desonerado = e.faturamento * cprb.receita + (e.folha + e.prolabore) * cprb.folha + e.folha * f.ratTerceiros;
      if (desonerado < normal) return { valor: desonerado, nota: `com a desoneração da folha de ${ano} (${(cprb.receita * 100).toFixed(1).replace('.', ',')}% sobre o faturamento + ${cprb.folha * 100}% sobre a folha)` };
    }
    return { valor: normal, nota: '20% de INSS patronal sobre folha e pró-labore, mais RAT e terceiros (cerca de 8,8%) sobre a folha' };
  }

  // ICMS e ISS fora do Simples
  function icmsIss(e) {
    if (e.setor === 'transporte') {
      const inter = e.faturamento * e.intermunicipal;
      const muni = e.faturamento - inter;
      const aliq = REGRAS.icms.freteInterestadual * (e.uf === 'SP' ? 1 - REGRAS.icms.creditoOutorgadoSP : 1);
      return { icms: inter * aliq, iss: muni * REGRAS.issPadrao, nota: e.uf === 'SP' ? 'ICMS do frete de 12% com crédito outorgado de 20% de SP (9,6% efetivo)' : 'ICMS do frete de 12%' };
    }
    if (e.setor === 'servicos') return { icms: 0, iss: e.faturamento * REGRAS.issPadrao, nota: 'ISS de 5% (varia de 2% a 5% conforme a cidade)' };
    const icms = Math.max(0, e.faturamento - e.insumos) * REGRAS.icms.mercadoriaPadrao;
    return { icms, iss: 0, nota: 'ICMS de 18% sobre o valor agregado (vendas menos compras), estimativa' };
  }

  function simples(e) {
    const s = REGRAS.simples;
    if (e.faturamento > s.limite) return { regime: 'simples', nome: 'Simples Nacional', possivel: false, motivo: 'Faturamento acima de R$ 4,8 milhões por ano.' };
    let anexo;
    let nota;
    if (e.setor === 'comercio') anexo = 'I';
    else if (e.setor === 'industria') anexo = 'II';
    else if (e.setor === 'transporte') { anexo = 'III'; nota = 'Transporte de cargas: Anexo III, trocando o ISS pelo ICMS no frete entre cidades e estados'; }
    else {
      const r = e.faturamento ? (e.folha + e.prolabore) / e.faturamento : 0;
      anexo = r >= s.fatorR ? 'III' : 'V';
      nota = `Fator R de ${(r * 100).toFixed(0)}%: ${anexo === 'III' ? 'serviço fica no Anexo III, mais barato' : 'serviço fica no Anexo V. Com folha + pró-labore de 28% do faturamento, cairia no Anexo III'}`;
    }
    const i = faixa(anexo, e.faturamento);
    const efIII = aliquotaEfetiva(anexo, e.faturamento);
    let taxa = efIII;
    const part = s.partilha[anexo];
    let pisCofinsDas = efIII * (part.pis[i] + part.cofins[i]);
    if (e.setor === 'transporte') {
      const efI = aliquotaEfetiva('I', e.faturamento);
      const inter = efIII * (1 - s.partilha.III.iss[i]) + efI * s.partilha.I.icms[i];
      taxa = e.intermunicipal * inter + (1 - e.intermunicipal) * efIII;
    }
    let total = e.faturamento * taxa;
    const avisos = [];
    if (e.faturamento > s.sublimiteIcmsIss) {
      // Acima do sublimite, ICMS e ISS saem do DAS e são pagos pelas regras normais
      const fora = icmsIss({ ...e, uf: '' });
      total += fora.icms + fora.iss;
      avisos.push('Acima de R$ 3,6 milhões, ICMS e ISS são pagos fora do Simples.');
    }
    return {
      regime: 'simples', nome: 'Simples Nacional', possivel: true, total, anexo,
      detalhes: [[`DAS (Anexo ${anexo})`, total]],
      explicacao: `Uma guia só (DAS) com todos os impostos, inclusive o INSS patronal da folha. ${nota ? nota + '.' : ''}`.trim(),
      avisos, pisCofinsDas: e.faturamento * pisCofinsDas,
    };
  }

  function presumido(e, ano = 2026) {
    const p = REGRAS.presumido;
    const pr = p.presuncao[e.setor];
    const acima = Math.max(0, e.faturamento - p.acrescimoAcimaDe);
    const base = (perc) => e.faturamento * perc + acima * perc * p.acrescimo;
    const { irpj, csll } = irpjCsll(base(pr.irpj), base(pr.csll));
    const pis = e.faturamento * p.pisCofins;
    const loc = icmsIss(e);
    const enc = encargosFolha(e, ano);
    const total = irpj + csll + pis + loc.icms + loc.iss + enc.valor;
    const avisos = [];
    if (acima) avisos.push('Receita acima de R$ 5 milhões tem presunção 10% maior (LC 224/2025).');
    return {
      regime: 'presumido', nome: 'Lucro Presumido', possivel: e.faturamento <= 78000000, total,
      detalhes: [['IRPJ', irpj], ['CSLL', csll], ['PIS + Cofins (3,65%)', pis], ['ICMS', loc.icms], ['ISS', loc.iss], ['INSS sobre a folha', enc.valor]].filter((d) => d[1] > 0.5),
      explicacao: `A Receita presume um lucro (${pr.irpj * 100}% do faturamento para o IRPJ e ${pr.csll * 100}% para a CSLL) e cobra imposto sobre ele, tenha lucro ou não. ${loc.nota}; folha ${enc.nota}.`,
      avisos,
    };
  }

  function real(e, ano = 2026) {
    const r = REGRAS.real;
    const pisCofins = Math.max(0, (e.faturamento - e.insumos) * r.pisCofins);
    const loc = icmsIss(e);
    const enc = encargosFolha(e, ano);
    const lucro = e.faturamento - pisCofins - loc.icms - loc.iss - enc.valor - e.folha - e.prolabore - e.insumos - e.outras;
    const { irpj, csll } = irpjCsll(lucro, lucro);
    const total = irpj + csll + pisCofins + loc.icms + loc.iss + enc.valor;
    return {
      regime: 'real', nome: 'Lucro Real', possivel: true, total, lucro,
      detalhes: [['IRPJ', irpj], ['CSLL', csll], ['PIS + Cofins (9,25% com créditos)', pisCofins], ['ICMS', loc.icms], ['ISS', loc.iss], ['INSS sobre a folha', enc.valor]].filter((d) => d[1] > 0.5),
      explicacao: `Paga IRPJ e CSLL sobre o lucro de verdade (estimado em ${brl(lucro)} por ano) e PIS/Cofins de 9,25%, descontando créditos sobre ${e.setor === 'transporte' ? 'diesel, pneus, peças e manutenção' : 'compras e insumos'}. Exige contabilidade completa.`,
      avisos: lucro < 0 ? ['Pelos números informados a empresa teria prejuízo, então não pagaria IRPJ e CSLL.'] : [],
    };
  }

  // 2027: CBS no lugar de PIS/Cofins. Compara o Simples "por dentro" com o regime híbrido.
  function reforma2027(e, base) {
    const cbs = REGRAS.reforma.cbs2027;
    const s = base.simples;
    const r = { cbs };
    if (s.possivel) {
      const credito = Math.max(0, e.faturamento - e.insumos) * cbs;
      r.simplesDentro = { total: s.total, creditoCliente: s.pisCofinsDas };
      r.simplesHibrido = { total: s.total - s.pisCofinsDas + credito, creditoCliente: e.faturamento * cbs };
    }
    const p = presumido(e, 2027);
    const pisVelho = e.faturamento * REGRAS.presumido.pisCofins;
    r.presumido = { total: p.total - pisVelho + Math.max(0, e.faturamento - e.insumos) * cbs };
    const rl = real(e, 2027);
    const pisReal = Math.max(0, (e.faturamento - e.insumos) * REGRAS.real.pisCofins);
    r.real = { total: rl.total - pisReal + Math.max(0, e.faturamento - e.insumos) * cbs };
    return r;
  }

  function brl(v) {
    return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  }

  // e: { setor, faturamento, folha, prolabore, insumos, outras, intermunicipal (0..1), b2b (0..1), uf }
  function simula(entrada) {
    const e = {
      setor: entrada.setor || 'servicos', faturamento: +entrada.faturamento || 0, folha: +entrada.folha || 0,
      prolabore: +entrada.prolabore || 0, insumos: +entrada.insumos || 0, outras: +entrada.outras || 0,
      intermunicipal: entrada.intermunicipal == null ? 1 : +entrada.intermunicipal, b2b: entrada.b2b == null ? 1 : +entrada.b2b,
      uf: entrada.uf || 'SP',
    };
    const base = { simples: simples(e), presumido: presumido(e), real: real(e) };
    const opcoes = Object.values(base).filter((o) => o.possivel).sort((a, b) => a.total - b.total);
    opcoes.forEach((o) => { o.percentual = e.faturamento ? o.total / e.faturamento : 0; });
    const melhor = opcoes[0];
    const segunda = opcoes[1];
    const mei = {
      limite: e.setor === 'transporte' ? REGRAS.mei.limiteCaminhoneiro : REGRAS.mei.limite2026,
    };
    mei.cabe = e.faturamento <= mei.limite;
    const ref = reforma2027(e, base);

    // Recomendação para 2027: com clientes empresas, o crédito da CBS vira argumento de venda
    let conselho2027 = '';
    if (ref.simplesDentro && melhor.regime === 'simples') {
      const custoExtra = ref.simplesHibrido.total - ref.simplesDentro.total;
      const ganhoCliente = ref.simplesHibrido.creditoCliente - ref.simplesDentro.creditoCliente;
      if (e.b2b >= 0.5 && ganhoCliente > custoExtra) {
        conselho2027 = `Como ${Math.round(e.b2b * 100)}% dos seus clientes são empresas, vale avaliar o regime híbrido: você pagaria ${brl(Math.abs(custoExtra))} ${custoExtra >= 0 ? 'a mais' : 'a menos'} por ano, mas seus clientes passariam a abater ${brl(ganhoCliente)} a mais em crédito. Isso deixa seu frete mais competitivo contra quem está no regime normal.`;
      } else {
        conselho2027 = 'Com clientes que são, em sua maioria, consumidores finais, ficar com IBS e CBS dentro do DAS tende a ser o mais simples e barato.';
      }
    } else if (melhor.regime !== 'simples') {
      conselho2027 = `Em 2027 a CBS (cerca de ${(REGRAS.reforma.cbs2027 * 100).toFixed(1).replace('.', ',')}%) substitui PIS e Cofins com direito a crédito sobre ${e.setor === 'transporte' ? 'diesel, pneus e peças' : 'compras e insumos'}. Isso favorece o Lucro Real e empresas com muitos custos que geram crédito.`;
    }
    return { entrada: e, opcoes, melhor, segunda, economia: segunda ? segunda.total - melhor.total : 0, impossiveis: Object.values(base).filter((o) => !o.possivel), mei, reforma: ref, conselho2027 };
  }

  return { REGRAS, SETORES, setorPorCnae, aliquotaEfetiva, simula, brl };
}));
