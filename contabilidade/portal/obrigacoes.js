// Calendário de obrigações do escritório: o que vence para cada empresa e a situação de cada uma.
// O status vem do que o site já sabe (apuração do DAS, DEFIS entregue, guia de parcelamento) ou
// de uma marcação manual do escritório (coleção 'obrigacoes').
const db = require('./db');
const agenda = require('./agenda');

const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const mesAnt = (a, m) => (m === 0 ? [a - 1, 11] : [a, m - 1]);
const comp = (a, m) => `${a}-${String(m + 1).padStart(2, '0')}`; // m 0-based

function regimeDe(u) {
  const e = u.empresa || {};
  if (e.mei) return 'mei';
  if (e.simples === false && !u.gerenciado) return 'normal';
  if (e.simples === false) return 'normal';
  return 'simples';
}

// Último dia útil do mês (vencimento da parcela do parcelamento do Simples)
function ultimoUtil(a, m) {
  const ev = agenda.doMes(a, m, { regime: 'normal' }).find((x) => /IRPJ/.test(x.titulo));
  if (ev) return ev.data;
  const d = new Date(Date.UTC(a, m + 1, 0));
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Obrigações de uma empresa nos meses [de, ate] (AAAA-MM), com status
function daEmpresa(u, { de, ate, hoje = agenda.hojeSP() }) {
  const perfil = { regime: regimeDe(u), funcionarios: !!(u.preferencias && u.preferencias.funcionarios) };
  const lista = [];
  let [a, m] = de.split('-').map(Number); m -= 1;
  const [af, mf] = ate.split('-').map(Number);
  const manuais = db.lista('obrigacoes', (x) => x.usuarioId === u.id);
  while (a < af || (a === af && m <= mf - 1)) {
    const ref = comp(a, m);
    for (const ev of agenda.doMes(a, m, perfil)) {
      const item = { empresaId: u.id, data: ev.data, titulo: ev.titulo, detalhe: ev.detalhe, chave: slug(ev.titulo), ref, status: 'pendente', automatico: false };
      // DAS do Simples: competência = mês anterior ao vencimento
      if (/^DAS do Simples/.test(ev.titulo)) {
        const [ac, mc] = mesAnt(a, m);
        const c = comp(ac, mc);
        item.competencia = c;
        const reg = db.acha('apuracoes', (x) => x.usuarioId === u.id && x.competencia === c);
        const conf = reg && reg.conferencia;
        item.automatico = true;
        if (reg && ['paga', 'entregue'].includes(reg.status)) item.status = 'ok';
        else if (conf && (conf.dasPago || (conf.situacao === 'ok' && conf.receitaDeclarada === 0))) item.status = 'ok';
        else if (reg && reg.status === 'das_disponivel') { item.status = 'guia'; item.valor = reg.das && reg.das.valor; item.link = reg.das && reg.das.pdf; }
        // Sem nenhum registro do mês (nem apuração, nem conferência da Receita): não dá para afirmar atraso
        else if (!reg || (reg.status === 'calculada' && !conf && !reg.aprovado)) item.status = 'conferir';
      }
      if (ev.titulo === 'DEFIS') {
        item.automatico = true;
        const d = u.fiscal && u.fiscal.defis && u.fiscal.defis[a - 1];
        if (d) { item.status = 'ok'; item.link = d.recibo; }
      }
      lista.push(item);
    }
    // Parcela do parcelamento (vence no último dia útil do mês)
    const p = u.parcelamento;
    // Só as parcelas que a Receita lista em aberto ou que já têm guia gerada
    const guiaMes = p && (p.guias || {})[ref];
    const parcMes = p && (p.parcelas || []).find((x) => x.parcela === ref);
    if (p && p.ativo && (guiaMes || parcMes)) {
      const guia = guiaMes;
      const parc = parcMes;
      lista.push({ empresaId: u.id, data: ultimoUtil(a, m), titulo: `Parcela do parcelamento (${p.modalidade === 'PARCMEI' ? 'MEI' : 'Simples'})`, detalhe: `Parcela de ${ref}.`, chave: 'parcela-parcelamento', ref, automatico: true,
        status: guia ? 'guia' : 'pendente', valor: (guia && guia.valor) || (parc && parc.valor) || null, link: guia && guia.pdf });
    }
    m += 1; if (m > 11) { m = 0; a += 1; }
  }
  for (const it of lista) {
    const man = manuais.find((x) => x.chave === it.chave && x.ref === it.ref);
    if (man && man.feito) { it.status = 'ok'; it.manual = true; }
    if (['pendente', 'guia'].includes(it.status) && it.data < hoje) it.status = 'atrasada';
    it.tipo = tipoDe(it.titulo);
  }
  return lista.sort((x, y) => x.data.localeCompare(y.data));
}

// Tipo da guia/obrigação, para filtrar na tela
const TIPOS = { das: 'DAS (Simples e MEI)', parcela: 'Parcelamentos', declaracao: 'Declarações (DEFIS, DASN)', folha: 'Folha, FGTS e INSS', federais: 'Tributos federais (fora do Simples)' };
function tipoDe(titulo) {
  if (/^DAS/.test(titulo)) return 'das';
  if (/Parcela/.test(titulo)) return 'parcela';
  if (/DEFIS|DASN|ECD|ECF/.test(titulo)) return 'declaracao';
  if (/sal[aá]rio|FGTS|INSS/i.test(titulo)) return 'folha';
  return 'federais';
}

function marca(u, chave, ref, feito) {
  const ja = db.acha('obrigacoes', (x) => x.usuarioId === u.id && x.chave === chave && x.ref === ref);
  if (ja) return db.atualiza('obrigacoes', ja.id, { feito: !!feito, em: new Date().toISOString() });
  return db.insere('obrigacoes', { usuarioId: u.id, chave, ref, feito: !!feito, em: new Date().toISOString() });
}

module.exports = { daEmpresa, marca, regimeDe, slug, TIPOS, tipoDe };
