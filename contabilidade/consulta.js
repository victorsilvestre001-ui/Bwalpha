// Busca os dados públicos do CNPJ (Receita Federal) em APIs gratuitas e devolve
// tudo num formato único, não importa de qual fonte veio.

const { limpa } = require('./cnpj');

const TIMEOUT_MS = 10000;

async function getJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`${url} respondeu ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

function simNao(v) {
  if (typeof v === 'boolean') return v;
  return String(v || '').toLowerCase().startsWith('s');
}

function deBrasilApi(d) {
  return {
    cnpj: d.cnpj,
    razaoSocial: d.razao_social,
    nomeFantasia: d.nome_fantasia || '',
    situacao: (d.descricao_situacao_cadastral || '').toUpperCase(),
    dataSituacao: d.data_situacao_cadastral || null,
    motivoSituacao: d.descricao_motivo_situacao_cadastral || '',
    abertura: d.data_inicio_atividade || null,
    cnae: d.cnae_fiscal ? String(d.cnae_fiscal) : '',
    atividade: d.cnae_fiscal_descricao || '',
    naturezaJuridica: d.natureza_juridica || '',
    porte: d.porte || '',
    capitalSocial: Number(d.capital_social) || 0,
    uf: d.uf || '',
    municipio: d.municipio || '',
    simples: !!d.opcao_pelo_simples,
    dataExclusaoSimples: d.data_exclusao_do_simples || null,
    mei: !!d.opcao_pelo_mei,
    dataExclusaoMei: d.data_exclusao_do_mei || null,
    socios: (d.qsa || []).map((s) => ({ nome: s.nome_socio, qualificacao: s.qualificacao_socio })),
    fonte: 'BrasilAPI',
  };
}

function dePublicaCnpjWs(d) {
  const e = d.estabelecimento || {};
  const s = d.simples || {};
  return {
    cnpj: e.cnpj || '',
    razaoSocial: d.razao_social,
    nomeFantasia: e.nome_fantasia || '',
    situacao: (e.situacao_cadastral || '').toUpperCase(),
    dataSituacao: e.data_situacao_cadastral || null,
    motivoSituacao: (e.motivo_situacao_cadastral && e.motivo_situacao_cadastral.descricao) || '',
    abertura: e.data_inicio_atividade || null,
    cnae: (e.atividade_principal && e.atividade_principal.id) || '',
    atividade: (e.atividade_principal && e.atividade_principal.descricao) || '',
    naturezaJuridica: (d.natureza_juridica && d.natureza_juridica.descricao) || '',
    porte: (d.porte && d.porte.descricao) || '',
    capitalSocial: Number(d.capital_social) || 0,
    uf: (e.estado && e.estado.sigla) || '',
    municipio: (e.cidade && e.cidade.nome) || '',
    simples: simNao(s.simples),
    dataExclusaoSimples: s.data_exclusao_simples || null,
    mei: simNao(s.mei),
    dataExclusaoMei: s.data_exclusao_mei || null,
    socios: (d.socios || []).map((x) => ({ nome: x.nome, qualificacao: x.qualificacao_socio && x.qualificacao_socio.descricao })),
    fonte: 'CNPJ.ws',
  };
}

// Empresas de exemplo para testar a tela sem internet (DEMO=1 ou CNPJ de demonstração).
const DEMOS = {
  '11222333000181': {
    cnpj: '11222333000181', razaoSocial: 'PADARIA PAO QUENTE LTDA', nomeFantasia: 'PÃO QUENTE',
    situacao: 'INAPTA', dataSituacao: '2025-03-12', motivoSituacao: 'OMISSAO DE DECLARACOES',
    abertura: '2017-05-02', cnae: '1091102', atividade: 'Fabricação de produtos de padaria e confeitaria com predominância de produção própria',
    naturezaJuridica: '206-2 - Sociedade Empresária Limitada', porte: 'MICRO EMPRESA', capitalSocial: 50000,
    uf: 'SP', municipio: 'CAMPINAS', simples: false, dataExclusaoSimples: '2025-01-01', mei: false, dataExclusaoMei: null,
    socios: [{ nome: 'JOAO DA SILVA', qualificacao: 'Sócio-Administrador' }], fonte: 'Demonstração',
  },
  '12345678000195': {
    cnpj: '12345678000195', razaoSocial: 'MARIA SOUZA 12345678900', nomeFantasia: 'MARIA DOCES',
    situacao: 'ATIVA', dataSituacao: '2021-08-10', motivoSituacao: '',
    abertura: '2021-08-10', cnae: '5620104', atividade: 'Fornecimento de alimentos preparados preponderantemente para consumo domiciliar',
    naturezaJuridica: '213-5 - Empresário (Individual)', porte: 'MICRO EMPRESA', capitalSocial: 5000,
    uf: 'MG', municipio: 'BELO HORIZONTE', simples: true, dataExclusaoSimples: null, mei: true, dataExclusaoMei: null,
    socios: [], fonte: 'Demonstração',
  },
};

async function buscaEmpresa(cnpj) {
  const c = limpa(cnpj);
  if (DEMOS[c]) return DEMOS[c];
  if (process.env.DEMO === '1') return { ...DEMOS['11222333000181'], cnpj: c };

  const erros = [];
  const fontes = [
    [`https://brasilapi.com.br/api/cnpj/v1/${c}`, deBrasilApi],
    [`https://publica.cnpj.ws/cnpj/${c}`, dePublicaCnpjWs],
  ];
  for (const [url, normaliza] of fontes) {
    try {
      const d = await getJson(url);
      if (d === null) return null;
      return normaliza(d);
    } catch (err) {
      console.warn('[consulta] fonte falhou:', err.message);
      erros.push(err.message);
    }
  }
  throw new Error(`Não foi possível consultar o CNPJ agora (${erros.join('; ')})`);
}

module.exports = { buscaEmpresa, DEMOS };
