// NFS-e Nacional pela API da Focus NFe (doc.focusnfe.com.br, "NFSe Nacional").
//   POST   /v2/nfsen?ref=REF   emite (assíncrono: devolve processando_autorizacao)
//   GET    /v2/nfsen/REF       consulta (autorizado | erro_autorizacao | cancelado)
//   DELETE /v2/nfsen/REF       cancela ({ justificativa })
// Autenticação HTTP Basic: usuário = token da Focus, senha vazia.
// Variáveis: FOCUS_NFE_TOKEN e FOCUS_NFE_AMBIENTE=homologacao (padrão: produção).
// Sem o token, a nota confirmada vai para a fila da equipe no /admin, que emite e anexa o PDF.

const BASE = () => (process.env.FOCUS_NFE_AMBIENTE === 'homologacao' ? 'https://homologacao.focusnfe.com.br/v2' : 'https://api.focusnfe.com.br/v2');
const ativo = () => !!process.env.FOCUS_NFE_TOKEN;

async function focus(caminho, { method = 'GET', body } = {}) {
  const auth = Buffer.from(`${process.env.FOCUS_NFE_TOKEN}:`).toString('base64');
  const res = await fetch(`${BASE()}${caminho}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 202) throw new Error(data.mensagem || (data.erros || []).map((e) => e.mensagem).join('; ') || `Focus respondeu ${res.status}`);
  return data;
}

// Situação no Simples para o campo codigo_opcao_simples_nacional (1 não optante, 2 MEI, 3 ME/EPP)
function opcaoSimples(empresa) {
  if (!empresa) return 1;
  if (empresa.mei) return 2;
  return empresa.simples ? 3 : 1;
}

// Corpo da DPS a partir da nota do portal e da configuração fiscal do prestador
function corpoDps(nota, prestador) {
  const f = prestador.fiscal || {};
  const agora = new Date();
  const local = new Date(agora.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 19) + '-0300';
  const corpo = {
    data_emissao: local,
    data_competencia: local.slice(0, 10),
    serie_dps: Number(f.serieDps || 1),
    numero_dps: nota.numeroDps,
    emitente_dps: 1, // 1 = o próprio prestador emite
    codigo_municipio_emissora: Number(f.codigoMunicipio),
    cnpj_prestador: prestador.cnpj,
    codigo_opcao_simples_nacional: opcaoSimples(prestador.empresa),
    regime_especial_tributacao: Number(f.regimeEspecial || 0),
    codigo_municipio_prestacao: String(f.codigoMunicipio),
    codigo_tributacao_nacional_iss: f.codigoServico,
    descricao_servico: nota.descricao,
    valor_servico: Number(nota.valor.toFixed(2)),
    tributacao_iss: 1, // 1 = operação tributável
  };
  if (nota.tomador.cnpj) corpo.cnpj_tomador = nota.tomador.cnpj;
  else if (nota.tomador.cpf) corpo.cpf_tomador = nota.tomador.cpf;
  return corpo;
}

function configFiscalCompleta(u) {
  const f = u.fiscal || {};
  return !!(f.codigoMunicipio && f.codigoServico);
}

async function emite(nota, prestador) {
  const r = await focus(`/nfsen?ref=${encodeURIComponent(nota.id)}`, { method: 'POST', body: corpoDps(nota, prestador) });
  return { status: r.status === 'processando_autorizacao' ? 'processando' : r.status };
}

// Converte a resposta da consulta para os campos que o portal guarda
async function consulta(nota) {
  const r = await focus(`/nfsen/${encodeURIComponent(nota.id)}`);
  if (r.status === 'autorizado') {
    return { status: 'emitida', numero: r.numero, codigoVerificacao: r.codigo_verificacao, pdf: r.url_danfse, linkConsulta: r.url, emitidaEm: r.data_emissao };
  }
  if (r.status === 'erro_autorizacao') return { status: 'erro', erro: (r.erros || []).map((e) => e.mensagem).join('; ') };
  if (r.status === 'cancelado') return { status: 'cancelada' };
  return { status: 'processando' };
}

async function cancela(nota, justificativa) {
  const r = await focus(`/nfsen/${encodeURIComponent(nota.id)}`, { method: 'DELETE', body: { justificativa } });
  if (r.status !== 'cancelado') throw new Error((r.erros || []).map((e) => e.mensagem).join('; ') || 'Não foi possível cancelar');
  return { status: 'cancelada' };
}

module.exports = { ativo, emite, consulta, cancela, corpoDps, configFiscalCompleta, opcaoSimples };
