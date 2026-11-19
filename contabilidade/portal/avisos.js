// Avisos automáticos ao cliente pelo WhatsApp (modelos aprovados na Meta).
// Cada tipo usa um modelo próprio, configurado por variável de ambiente; tudo fica registrado em 'envios'.
const db = require('./db');
const canais = require('./canais');

// Modelos que precisam ser cadastrados na Meta (WhatsApp Manager > Modelos de mensagem), categoria "Utilidade".
// O texto aqui é a sugestão para cadastrar; {{n}} são as variáveis, na ordem enviada.
const MODELOS = {
  guia: {
    variavel: 'WHATSAPP_TPL_GUIA', nome: 'guia_imposto', cabecalho: 'Documento (PDF)',
    texto: 'Olá, {{1}}! Segue a guia {{2}} no valor de {{3}}, com vencimento em {{4}}. Qualquer dúvida, é só responder esta mensagem. V&J Assessoria Contábil',
  },
  nota: {
    variavel: 'WHATSAPP_TPL_NOTA', nome: 'nota_emitida', cabecalho: 'Documento (PDF)',
    texto: 'Olá, {{1}}! Sua nota fiscal nº {{2}} para {{3}}, no valor de {{4}}, foi emitida. O PDF segue anexo. V&J Assessoria Contábil',
  },
  lembrete: {
    variavel: 'WHATSAPP_TPL_LEMBRETE', nome: 'lembrete_vencimento', cabecalho: 'Documento (PDF)',
    texto: 'Olá, {{1}}! Lembrete: a guia {{2}} de {{3}} vence em {{4}}. Se já pagou, desconsidere. V&J Assessoria Contábil',
  },
};

const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const nomeDe = (u) => (u.empresa && (u.empresa.nomeFantasia || u.empresa.razaoSocial)) || u.nome || 'cliente';
const numeroDe = (u) => (u.fiscal && u.fiscal.whatsapp) || u.telefone || '';
const ligado = (u) => !(u.fiscal && u.fiscal.avisosWhatsapp === false);

function situacao() {
  return {
    ativo: canais.whatsappBase(),
    modelos: Object.entries(MODELOS).map(([tipo, m]) => ({ tipo, variavel: m.variavel, nome: m.nome, cabecalho: m.cabecalho, texto: m.texto, configurado: !!process.env[m.variavel] })),
  };
}

// Envia e registra. `chave` evita mandar o mesmo aviso duas vezes (ex.: lembrete do mesmo dia).
async function envia(u, tipo, { variaveis, documento, chave, descricao }) {
  if (!u || !ligado(u)) return { ok: false, erro: 'avisos por WhatsApp desligados para esta empresa' };
  if (chave && db.acha('envios', (x) => x.chave === chave && x.ok)) return { ok: true, repetido: true };
  const numero = numeroDe(u);
  const r = await canais.enviaModelo({ numero, modelo: process.env[MODELOS[tipo].variavel], variaveis, documento }).catch((err) => ({ ok: false, erro: err.message }));
  db.insere('envios', { usuarioId: u.id, tipo, canal: 'whatsapp', para: String(numero).replace(/\D/g, '').replace(/^(\d{2})(\d+)(\d{4})$/, '$1•••••$3'), descricao: descricao || '', ok: !!r.ok, erro: r.erro || '', chave: chave || null, em: new Date().toISOString() });
  return r;
}

const guia = (u, { descricao, valor, vencimento, link, chave }) => envia(u, 'guia', { variaveis: [nomeDe(u), descricao, brl(valor), dataBr(vencimento)], documento: link && { link, nome: `${descricao}.pdf` }, chave, descricao: `Guia ${descricao}` });
const nota = (u, n) => envia(u, 'nota', { variaveis: [nomeDe(u), n.numero || '-', (n.tomador && n.tomador.nome) || '-', brl(n.valor)], documento: n.pdf && { link: n.pdf, nome: `NFS-e ${n.numero || ''}.pdf` }, chave: `nota-${n.id}`, descricao: `NFS-e ${n.numero || ''}` });
const lembrete = (u, { descricao, valor, vencimento, link, chave }) => envia(u, 'lembrete', { variaveis: [nomeDe(u), descricao, brl(valor), dataBr(vencimento)], documento: link && { link, nome: `${descricao}.pdf` }, chave, descricao: `Lembrete ${descricao}` });

module.exports = { MODELOS, situacao, envia, guia, nota, lembrete, numeroDe };
