// Resumo diário de cada assinante: agenda de impostos, orçamentos pendentes, notas, alertas
// e uma dica da Reforma. Vai por e-mail (completo) e WhatsApp (curto, com link para a Área).
const db = require('./db');
const auth = require('./auth');
const canais = require('./canais');
const { proximas, hojeSP } = require('./agenda');

const DIA = 24 * 60 * 60 * 1000;
const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dataBr = (iso) => iso.split('-').reverse().join('/');
const quando = (n) => (n === 0 ? 'hoje' : n === 1 ? 'amanhã' : `em ${n} dias`);

function perfilFiscal(u) {
  const e = u.empresa || {};
  return { regime: e.mei ? 'mei' : e.simples ? 'simples' : 'normal', funcionarios: !!(u.preferencias && u.preferencias.funcionarios) };
}

function venceEm(o, hoje) {
  const fim = new Date(Date.parse(o.criadoEm) + o.validadeDias * DIA).toISOString().slice(0, 10);
  return { fim, dias: Math.round((Date.parse(fim) - Date.parse(hoje)) / DIA) };
}

function monta(u, { hoje = hojeSP() } = {}) {
  const desde = u.ultimoResumoEm || new Date(Date.now() - DIA).toISOString();
  const agenda = proximas(perfilFiscal(u), { hoje });
  const orcs = db.lista('orcamentos', (o) => o.usuarioId === u.id);
  const pendentes = orcs.filter((o) => (o.status || 'aguardando') === 'aguardando').map((o) => ({ ...o, validade: venceEm(o, hoje) })).filter((o) => o.validade.dias >= 0)
    .sort((a, b) => a.validade.dias - b.validade.dias);
  const respondidos = orcs.filter((o) => o.respondidoEm && o.respondidoEm > desde);
  const notas = db.lista('notas', (n) => n.usuarioId === u.id && n.emitidaEm && n.emitidaEm > desde);
  const alertas = (u.alertas || []).filter((a) => a.em > desde);
  const acoes = (u.analise && u.analise.reforma && u.analise.reforma.acoes) || [];
  const dia = Math.floor(Date.parse(hoje) / DIA);
  const dica = acoes.length ? acoes[dia % acoes.length] : null;
  return { hoje, agenda, pendentes, respondidos, notas, alertas, dica, valorPendente: pendentes.reduce((t, o) => t + o.total, 0) };
}

// Uma linha para o WhatsApp (variáveis de modelo não aceitam quebra de linha)
function linhaCurta(r) {
  const partes = [];
  if (r.agenda.length) partes.push(`${r.agenda.length} vencimento(s) nos próximos dias, o primeiro ${quando(r.agenda[0].emDias)}: ${r.agenda[0].titulo}`);
  if (r.pendentes.length) partes.push(`${r.pendentes.length} orçamento(s) aguardando aprovação (${brl(r.valorPendente)})`);
  if (r.respondidos.length) partes.push(`${r.respondidos.length} orçamento(s) respondido(s) pelo cliente`);
  if (r.notas.length) partes.push(`${r.notas.length} nota(s) emitida(s)`);
  if (r.alertas.length) partes.push(`${r.alertas.length} alerta(s) novo(s) da empresa`);
  return partes.length ? partes.join('; ') : 'nenhum vencimento ou pendência para os próximos dias';
}

function html(u, r, site) {
  const nome = String(u.nome || '').split(/\s+/)[0];
  const sec = (titulo, corpo) => `<h3 style="color:#0b2545;font-size:16px;margin:24px 0 8px">${titulo}</h3>${corpo}`;
  const lista = (itens) => `<ul style="padding-left:18px;margin:0">${itens.map((i) => `<li style="margin:6px 0">${i}</li>`).join('')}</ul>`;
  const dataExtenso = new Date(`${r.hoje}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', timeZone: 'UTC' });
  let corpo = `<p style="margin:0 0 6px">Bom dia, <b>${esc(nome)}</b>! Aqui está o resumo de <b>${esc(dataExtenso)}</b> da ${esc(u.empresa ? u.empresa.razaoSocial : 'sua empresa')}.</p>`;
  corpo += sec('📅 Impostos e prazos dos próximos dias', r.agenda.length
    ? lista(r.agenda.map((e) => `<b>${dataBr(e.data)}</b> (${quando(e.emDias)}): ${esc(e.titulo)} <span style="color:#5d6b7c">— ${esc(e.detalhe)}</span>`))
    : '<p style="margin:0;color:#5d6b7c">Nada vence nos próximos 10 dias.</p>');
  if (r.pendentes.length) {
    corpo += sec(`📝 Orçamentos aguardando aprovação (${brl(r.valorPendente)})`, lista(r.pendentes.map((o) => `Nº ${String(o.numero).padStart(4, '0')} · ${esc(o.cliente.nome)} · <b>${brl(o.total)}</b> · ${o.validade.dias <= 2 ? '<b style="color:#c0392b">' : ''}vence ${quando(o.validade.dias)}${o.validade.dias <= 2 ? '</b>' : ''} — <a href="${site}/o/${o.token}">ver</a>`))
      + '<p style="margin:8px 0 0;color:#5d6b7c">Dica: mande uma mensagem para quem ainda não respondeu. Orçamento lembrado fecha mais.</p>');
  }
  if (r.respondidos.length) corpo += sec('✅ Respostas de clientes', lista(r.respondidos.map((o) => `${esc(o.cliente.nome)} <b>${o.status === 'aprovado' ? 'aprovou' : 'recusou'}</b> o orçamento nº ${String(o.numero).padStart(4, '0')} (${brl(o.total)})`)));
  if (r.notas.length) corpo += sec('🧾 Notas emitidas', lista(r.notas.map((n) => `${esc(n.tomador.nome)} · ${brl(n.valor)}${n.numero ? ` · nº ${esc(n.numero)}` : ''}${n.pdf ? ` — <a href="${esc(n.pdf)}">PDF</a>` : ''}`)));
  if (r.alertas.length) corpo += sec('🔔 Alertas da sua empresa', lista(r.alertas.map((a) => esc(a.texto))));
  if (r.dica) corpo += sec('💡 Reforma Tributária: dica do dia', `<p style="margin:0"><b>${esc(r.dica.titulo)}</b> (${esc(r.dica.quando)}): ${esc(r.dica.texto)}</p>`);
  corpo += `<p style="margin:28px 0 0"><a href="${site}/area" style="background:#0b2545;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold">Abrir minha Área do Cliente</a></p>`;
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1b2533;line-height:1.55">
    <div style="background:#0b2545;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0"><b style="font-size:18px">V&amp;J Assessoria Contábil</b><br><span style="color:#c9a227;font-size:13px">Seu resumo do dia</span></div>
    <div style="border:1px solid #e3e8ef;border-top:0;padding:22px;border-radius:0 0 12px 12px">${corpo}</div>
    <p style="font-size:12px;color:#5d6b7c;text-align:center">Para parar de receber, desative o resumo diário em Minha conta na Área do Cliente.</p></div>`;
}

async function envia(u, { site, hoje = hojeSP() } = {}) {
  const r = monta(u, { hoje });
  const pref = u.preferencias || {};
  const resultado = { email: null, whatsapp: null };
  if (pref.resumoEmail !== false && u.email) resultado.email = await canais.enviaEmail({ para: u.email, assunto: `Seu resumo do dia · ${dataBr(hoje)}`, html: html(u, r, site) }).catch((e) => ({ ok: false, erro: e.message }));
  if (pref.resumoWhatsapp !== false && u.telefone) {
    resultado.whatsapp = await canais.enviaWhatsapp({ numero: u.telefone, variaveis: [String(u.nome || '').split(/\s+/)[0] || 'cliente', linhaCurta(r), `${site}/area`] }).catch((e) => ({ ok: false, erro: e.message }));
  }
  db.atualiza('usuarios', u.id, {
    ultimoResumoEm: new Date().toISOString(), ultimoResumoDia: hoje,
    resumos: [{ dia: hoje, linha: linhaCurta(r), resultado }, ...(u.resumos || [])].slice(0, 14),
  });
  return { resumo: r, resultado };
}

// Roda a cada poucos minutos: em dia útil, a partir de RESUMO_HORA (padrão 7h de Brasília),
// manda um resumo por assinante que ainda não recebeu hoje.
function agenda({ site }) {
  const hora = Number(process.env.RESUMO_HORA || 7);
  const tick = async () => {
    const agora = new Date();
    const hoje = hojeSP(agora);
    const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(agora));
    const diaSemana = new Date(`${hoje}T12:00:00Z`).getUTCDay();
    if (h < hora || diaSemana === 0 || diaSemana === 6) return;
    if (!canais.emailAtivo() && !canais.whatsappAtivo()) return;
    for (const u of db.lista('usuarios', (x) => auth.planoAtivo(x) && x.ultimoResumoDia !== hoje && !(x.preferencias && x.preferencias.resumo === false))) {
      try { await envia(u, { site, hoje }); } catch (err) { console.error('[resumo]', u.email, err.message); }
    }
  };
  setInterval(() => tick().catch((e) => console.error('[resumo]', e.message)), 10 * 60 * 1000);
}

module.exports = { monta, html, linhaCurta, envia, agenda, perfilFiscal };
