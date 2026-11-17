// Rotas da análise de recuperação por arquivos (XML/ZIP das notas de venda).
// O acumulado de cada análise fica em DADOS_DIR/analises/<id>.json; no banco só o resumo.
const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const auth = require('./auth');
const ax = require('./analise-xml');
const { DADOS_DIR } = require('../pgfn/formato');

const PASTA = path.join(DADOS_DIR, 'analises');
const LIMITE = 60 * 1024 * 1024;
// O navegador junta vários XMLs pequenos numa só requisição, separados por esta marca
const SEP = '\n<!--VJ-SEP-->\n';
const arq = (id) => path.join(PASTA, `${id.replace(/[^\w-]/g, '')}.json`);
const leAcc = (id) => { try { return JSON.parse(fs.readFileSync(arq(id), 'utf8')); } catch { return ax.novoAcumulador(); } };
const gravaAcc = (id, acc) => { fs.mkdirSync(PASTA, { recursive: true }); fs.writeFileSync(arq(id) + '.tmp', JSON.stringify(acc)); fs.renameSync(arq(id) + '.tmp', arq(id)); };
const regimeDo = (u) => (u.empresa && u.empresa.regime && /presumido/i.test(u.empresa.regime) ? 'presumido' : 'simples');

function resumoPublico(a) {
  return { id: a.id, status: a.status, criadoEm: a.criadoEm, concluidaEm: a.concluidaEm, arquivos: a.arquivos || [], relatorio: a.relatorio || null, observacao: a.observacao || '' };
}

function portal() {
  const r = express.Router();
  const minha = (req, res) => {
    const a = db.acha('analises', (x) => x.id === req.params.id && x.usuarioId === req.usuario.id);
    if (!a) res.status(404).json({ erro: 'Análise não encontrada.' });
    return a;
  };

  r.get('/', auth.exigePlano, (req, res) => {
    res.json({ analises: db.lista('analises', (a) => a.usuarioId === req.usuario.id).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)).map(resumoPublico) });
  });
  r.post('/', auth.exigePlano, (req, res) => {
    const aberta = db.acha('analises', (a) => a.usuarioId === req.usuario.id && a.status === 'rascunho');
    if (aberta) return res.json({ analise: resumoPublico(aberta) });
    res.json({ analise: resumoPublico(db.insere('analises', { usuarioId: req.usuario.id, status: 'rascunho', arquivos: [] })) });
  });
  r.get('/:id', auth.exigePlano, (req, res) => {
    const a = minha(req, res);
    if (a) res.json({ analise: resumoPublico(a) });
  });

  // Um arquivo por requisição (.xml ou .zip), corpo cru
  r.post('/:id/arquivos', auth.exigePlano, express.raw({ type: () => true, limit: LIMITE }), async (req, res) => {
    const a = minha(req, res);
    if (!a) return;
    if (a.status !== 'rascunho') return res.status(409).json({ erro: 'Esta análise já foi enviada para o contador. Comece uma nova.' });
    let nome = String(req.get('x-nome-arquivo') || 'arquivo');
    try { nome = decodeURIComponent(nome); } catch { /* mantém como veio */ }
    nome = nome.slice(0, 120);
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!buf.length) return res.status(400).json({ erro: 'Arquivo vazio.' });
    if ((a.arquivos || []).length >= 500) return res.status(400).json({ erro: 'Limite de 500 arquivos por análise. Junte as notas em arquivos .zip.' });
    const acc = leAcc(a.id);
    const antes = acc.contagem.notas;
    const cada = (_, texto) => { acc.contagem.arquivos++; ax.acumula(acc, ax.lerXml(texto), req.usuario.cnpj); };
    try {
      if (buf[0] === 0x50 && buf[1] === 0x4b) await ax.lerZip(buf, cada);
      else if (/^\s*(<\?xml|<)/.test(buf.slice(0, 200).toString('utf8').replace(/^﻿/, ''))) buf.toString('utf8').split(SEP).forEach((t) => t.trim() && cada(nome, t));
      else return res.status(400).json({ erro: `"${nome}" não é XML nem ZIP. Envie os arquivos XML das notas (ou um .zip com eles).` });
    } catch {
      return res.status(400).json({ erro: `Não conseguimos abrir "${nome}". Confira se o arquivo .zip não está corrompido.` });
    }
    gravaAcc(a.id, acc);
    const relatorio = ax.relatorio(acc, { regime: regimeDo(req.usuario) });
    const arquivos = [...(a.arquivos || []), { nome, bytes: buf.length, notas: acc.contagem.notas - antes, em: new Date().toISOString() }];
    const nova = db.atualiza('analises', a.id, { arquivos, relatorio });
    res.json({ analise: resumoPublico(nova), notasNovas: acc.contagem.notas - antes });
  });

  // Envia para o contador revisar
  r.post('/:id/concluir', auth.exigePlano, (req, res) => {
    const a = minha(req, res);
    if (!a) return;
    if (!a.relatorio || !a.relatorio.notas) return res.status(400).json({ erro: 'Envie ao menos um arquivo com notas de venda antes de concluir.' });
    const nova = db.atualiza('analises', a.id, { status: 'em_revisao', concluidaEm: new Date().toISOString() });
    const u = req.usuario;
    const alerta = { em: new Date().toISOString(), texto: `Análise de recuperação enviada ao contador: ${a.relatorio.notas} notas, potencial estimado de ${a.relatorio.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.` };
    db.atualiza('usuarios', u.id, { alertas: [alerta, ...(u.alertas || [])].slice(0, 30) });
    res.json({ analise: resumoPublico(nova) });
  });
  r.delete('/:id', auth.exigePlano, (req, res) => {
    const a = minha(req, res);
    if (!a) return;
    if (a.status !== 'rascunho') return res.status(409).json({ erro: 'Só dá para apagar uma análise que ainda não foi enviada.' });
    db.remove('analises', (x) => x.id === a.id);
    fs.rm(arq(a.id), { force: true }, () => {});
    res.json({ ok: true });
  });
  return r;
}

function admin() {
  const r = express.Router();
  r.get('/', (req, res) => {
    const nomes = Object.fromEntries(db.lista('usuarios').map((u) => [u.id, { nome: u.empresa ? u.empresa.razaoSocial : u.nome, cnpj: u.cnpj, telefone: u.telefone }]));
    res.json({ analises: db.lista('analises', (a) => a.status !== 'rascunho').sort((a, b) => (b.concluidaEm || '').localeCompare(a.concluidaEm || '')).map((a) => ({ ...resumoPublico(a), cliente: nomes[a.usuarioId] })) });
  });
  r.post('/:id/revisar', express.json(), (req, res) => {
    const a = db.acha('analises', (x) => x.id === req.params.id);
    if (!a) return res.status(404).json({ erro: 'Análise não encontrada.' });
    const status = ['revisada', 'em_revisao', 'em_recuperacao', 'sem_credito'].includes(req.body.status) ? req.body.status : 'revisada';
    const nova = db.atualiza('analises', a.id, { status, observacao: String(req.body.observacao || '').slice(0, 2000) });
    const u = db.acha('usuarios', (x) => x.id === a.usuarioId);
    if (u) db.atualiza('usuarios', u.id, { alertas: [{ em: new Date().toISOString(), texto: `O contador revisou sua análise de recuperação: ${({ revisada: 'revisada', em_revisao: 'em revisão', em_recuperacao: 'pedido de recuperação em andamento', sem_credito: 'sem crédito a recuperar' })[status]}.` }, ...(u.alertas || [])].slice(0, 30) });
    res.json({ analise: resumoPublico(nova) });
  });
  return r;
}

module.exports = { portal, admin };
