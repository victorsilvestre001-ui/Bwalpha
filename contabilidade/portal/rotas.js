// Área do Cliente: cadastro/login, assinatura, painel da empresa, notas fiscais e orçamentos.
const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const auth = require('./auth');
const pagamentos = require('./pagamentos');
const notas = require('./notas');
const cnpjUtil = require('../cnpj');
const resumo = require('./resumo');
const canais = require('./canais');
const analises = require('./analises');
const certificado = require('./certificado');
const captura = require('./captura');
const apuracao = require('./apuracao');
const nacional = require('./nfse-nacional');
const integra = require('./integra');
const servicos = require('./servicos');
const obraUtil = require('./obra');
const avisos = require('./avisos');
const vendas = require('./vendas');
const ncmUtil = require('./ncm');
const obrigacoes = require('./obrigacoes');
const fs = require('fs');
const path = require('path');
const { DADOS_DIR } = require('../pgfn/formato');

const DIA = 24 * 60 * 60 * 1000;
const txt = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const dinheiro = (v) => Math.round(Number(v) * 100) / 100;

module.exports = function rotasPortal({ analisa, buscaEmpresa, tabelaPrecos, assistente, site }) {
  const r = express.Router();
  r.use(auth.leCookies);
  const limiteLogin = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, message: { erro: 'Muitas tentativas. Espere alguns minutos.' } });
  const planos = () => tabelaPrecos().planosPortal || [];
  const planoDo = (u) => {
    if (auth.ehDono(u)) return { id: 'dono', nome: 'Dono do site (acesso total)', valor: 0, notasMes: 100000, recursos: [] };
    return planos().find((p) => p.id === u.planoId) || planos()[0];
  };

  // Guarda um retrato da empresa e gera alertas quando algo muda (o "agente" de cada cliente)
  async function atualizaAnalise(u, forcar = false) {
    if (!forcar && u.analise && Date.now() - Date.parse(u.analise.em) < DIA) return u;
    let a;
    try { a = await analisa(u.cnpj); } catch { return u; }
    const urgentes = a.orcamento.itens.filter((i) => i.gravidade === 'urgente').map((i) => i.titulo);
    const novos = [];
    if (u.analise) {
      const antes = new Set(u.analise.urgentes || []);
      urgentes.filter((t) => !antes.has(t)).forEach((t) => novos.push({ em: new Date().toISOString(), texto: `Novo alerta: ${t}` }));
      if (u.analise.situacao !== a.empresa.situacao) novos.push({ em: new Date().toISOString(), texto: `A situação do CNPJ mudou de ${u.analise.situacao} para ${a.empresa.situacao}.` });
      const dividaAntes = u.analise.dividaAtiva || 0;
      const dividaAgora = (a.empresa.pgfn && a.empresa.pgfn.emCobranca) || 0;
      if (dividaAgora > dividaAntes) novos.push({ em: new Date().toISOString(), texto: `A dívida ativa em cobrança subiu para ${dividaAgora.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.` });
    }
    return db.atualiza('usuarios', u.id, {
      empresa: { razaoSocial: a.empresa.razaoSocial, nomeFantasia: a.empresa.nomeFantasia, regime: a.empresa.regime, situacao: a.empresa.situacao, municipio: a.empresa.municipio, uf: a.empresa.uf, cnae: a.empresa.cnae, atividade: a.empresa.atividade, simples: a.empresa.simples, mei: a.empresa.mei, abertura: a.empresa.abertura },
      analise: { em: new Date().toISOString(), urgentes, situacao: a.empresa.situacao, dividaAtiva: (a.empresa.pgfn && a.empresa.pgfn.emCobranca) || 0, itens: a.orcamento.itens.map(({ gravidade, titulo, explicacao, link }) => ({ gravidade, titulo, explicacao, link })), reforma: a.reforma },
      alertas: [...novos, ...(u.alertas || [])].slice(0, 30),
    });
  }

  // ---------- Conta ----------
  r.get('/planos', (req, res) => res.json({ planos: planos(), pagamentoOnline: pagamentos.ativo() }));

  r.post('/cadastro', limiteLogin, async (req, res) => {
    const nome = txt(req.body.nome, 120);
    const email = txt(req.body.email, 160).toLowerCase();
    const senha = String(req.body.senha || '');
    const cnpj = cnpjUtil.limpa(req.body.cnpj);
    if (!nome || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ erro: 'Informe nome e um e-mail válido.' });
    if (senha.length < 8) return res.status(400).json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' });
    if (!cnpjUtil.valido(cnpj)) return res.status(400).json({ erro: 'CNPJ inválido.' });
    if (db.acha('usuarios', (u) => u.email === email)) return res.status(409).json({ erro: 'Já existe uma conta com este e-mail. Faça login.' });
    let u = db.insere('usuarios', { nome, email, senha: auth.hashSenha(senha), cnpj, telefone: txt(req.body.telefone, 20).replace(/\D/g, ''), proximoDps: 1, alertas: [] });
    u = await atualizaAnalise(u, true);
    auth.criaSessao(res, u.id);
    res.json({ usuario: auth.publico(u) });
  });

  r.post('/login', limiteLogin, (req, res) => {
    const email = txt(req.body.email, 160).toLowerCase();
    const u = db.acha('usuarios', (x) => x.email === email);
    if (!u || !auth.confereSenha(String(req.body.senha || ''), u.senha)) return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    if (u.ativo === false) return res.status(403).json({ erro: 'Este acesso foi desativado. Fale com o responsável pelo escritório.' });
    auth.criaSessao(res, u.id);
    res.json({ usuario: auth.publico(u) });
  });

  r.post('/sair', (req, res) => { auth.encerraSessao(req, res); res.json({ ok: true }); });

  r.get('/eu', auth.exigeLogin, (req, res) => res.json({ usuario: auth.publico(req.usuario), plano: planoDo(req.usuario), focusAtivo: notas.ativo(), ia: assistente.ativo(), exigeObra: obraUtil.exige(req.usuario.fiscal && req.usuario.fiscal.codigoServico) }));
  r.get('/cep/:cep', auth.exigeLogin, async (req, res) => {
    const c = await obraUtil.buscaCep(req.params.cep);
    if (!c) return res.status(404).json({ erro: 'CEP não encontrado.' });
    res.json(c);
  });

  r.post('/assinar', auth.exigeLogin, async (req, res) => {
    const plano = planos().find((p) => p.id === req.body.planoId);
    if (!plano) return res.status(400).json({ erro: 'Plano inválido.' });
    if (!pagamentos.ativo()) {
      db.atualiza('usuarios', req.usuario.id, { planoId: plano.id, pedidoPlanoEm: new Date().toISOString() });
      return res.json({ semPagamentoOnline: true });
    }
    try {
      res.json({ link: await pagamentos.linkAssinatura(req.usuario, plano) });
    } catch (err) {
      console.error('[portal] assinatura:', err.message);
      res.status(502).json({ erro: 'Não foi possível gerar a cobrança agora. Tente de novo ou fale conosco no WhatsApp.' });
    }
  });

  // ---------- Painel da empresa (assinantes) ----------
  r.get('/painel', auth.exigePlano, async (req, res) => {
    const u = await atualizaAnalise(req.usuario, req.query.atualizar === '1');
    res.json({ empresa: u.empresa, analise: u.analise, alertas: u.alertas || [] });
  });

  // Configuração fiscal da empresa (vai em todas as notas). Usada pelo /admin e, por compatibilidade, pelo cliente.
  // A emissão automática (desligada | homologacao | producao) só o contador muda, pelo /admin.
  function salvaFiscal(u, body, res, { contador = false } = {}) {
    const f = {
      ...(u.fiscal || {}),
      codigoMunicipio: txt(body.codigoMunicipio, 7).replace(/\D/g, ''),
      codigoServico: txt(body.codigoServico, 9).replace(/\D/g, ''),
      serieDps: Number(body.serieDps) || 1,
      regimeEspecial: Number(body.regimeEspecial) || 0,
    };
    if (body.aliquotaSN !== undefined && body.aliquotaSN !== '') {
      const a = Math.round(Number(String(body.aliquotaSN).replace(',', '.')) * 100) / 100;
      if (!(a > 0 && a < 100)) return res.status(400).json({ erro: 'Alíquota do Simples: informe o percentual, ex.: 6 ou 11,2.' });
      f.aliquotaSN = a;
    }
    // Avisos ao cliente pelo WhatsApp: número (com DDD) e liga/desliga
    if (body.whatsapp !== undefined) {
      const w = String(body.whatsapp || '').replace(/\D/g, '');
      if (w && (w.length < 10 || w.length > 13)) return res.status(400).json({ erro: 'WhatsApp: informe DDD + número.' });
      if (w) f.whatsapp = w; else delete f.whatsapp;
    }
    if (body.avisosWhatsapp !== undefined) f.avisosWhatsapp = body.avisosWhatsapp !== false;
    // Reforma tributária: quando mandar o grupo IBS/CBS e o código da operação (cIndOp)
    if (body.ibscbs !== undefined) {
      if (!['auto', 'sempre', 'nunca'].includes(body.ibscbs)) return res.status(400).json({ erro: 'IBS/CBS na nota: use auto, sempre ou nunca.' });
      f.ibscbs = body.ibscbs;
    }
    if (body.codigoNbs !== undefined) {
      const n = String(body.codigoNbs || '').replace(/\D/g, '');
      if (n && n.length !== 9) return res.status(400).json({ erro: 'O código NBS tem 9 dígitos (ex.: 1.1502.10.00).' });
      if (n) f.codigoNbs = n; else delete f.codigoNbs;
    }
    // cClassTrib (6 dígitos); o CST são os 3 primeiros dígitos dele
    if (body.cClassTrib !== undefined) {
      const c = String(body.cClassTrib || '').replace(/\D/g, '');
      if (c && c.length !== 6) return res.status(400).json({ erro: 'cClassTrib tem 6 dígitos.' });
      if (c && c !== '000001') { f.cClassTrib = c; f.cstIbsCbs = c.slice(0, 3); } else { delete f.cClassTrib; delete f.cstIbsCbs; }
    }
    if (body.cIndOp !== undefined) {
      const c = String(body.cIndOp || '').replace(/\D/g, '');
      if (c && c.length !== 6) return res.status(400).json({ erro: 'Código da operação (cIndOp) tem 6 dígitos.' });
      if (c) f.cIndOp = c; else delete f.cIndOp;
    }
    // Empresa fora do Simples: % aproximado dos tributos federais e municipais que sai na nota
    for (const campo of ['pTribFed', 'pTribMun']) {
      if (body[campo] === undefined || body[campo] === '') continue;
      const a = Math.round(Number(String(body[campo]).replace(',', '.')) * 100) / 100;
      if (!(a >= 0 && a < 100)) return res.status(400).json({ erro: 'Tributos aproximados: informe o percentual, ex.: 11,33 ou 5.' });
      f[campo] = a;
    }
    if (contador && body.emissao !== undefined) {
      if (!['desligada', 'homologacao', 'producao'].includes(body.emissao)) return res.status(400).json({ erro: 'Emissão automática: use desligada, homologacao ou producao.' });
      f.emissao = body.emissao;
    }
    if (f.codigoMunicipio.length !== 7) return res.status(400).json({ erro: 'O código do município (IBGE) tem 7 dígitos.' });
    if (f.codigoServico.length !== 6) return res.status(400).json({ erro: 'O código de tributação nacional do serviço tem 6 dígitos (ex.: 010701).' });
    const patch = { fiscal: f };
    if (body.proximoDps) patch.proximoDps = Math.max(1, Number(body.proximoDps) || 1);
    res.json({ usuario: auth.publico(db.atualiza('usuarios', u.id, patch)) });
  }
  r.put('/fiscal', auth.exigePlano, (req, res) => salvaFiscal(req.usuario, req.body || {}, res));

  // ---------- Resumo diário e preferências ----------
  r.get('/resumo', auth.exigePlano, (req, res) => {
    const u = req.usuario;
    res.json({ resumo: resumo.monta(u), linha: resumo.linhaCurta(resumo.monta(u)), historico: u.resumos || [], preferencias: u.preferencias || {}, canais: { email: canais.emailAtivo(), whatsapp: canais.whatsappAtivo() } });
  });

  r.put('/preferencias', auth.exigeLogin, (req, res) => {
    const b = req.body || {};
    const preferencias = { resumo: b.resumo !== false, resumoEmail: b.resumoEmail !== false, resumoWhatsapp: b.resumoWhatsapp !== false, funcionarios: !!b.funcionarios };
    const patch = { preferencias };
    if (b.telefone !== undefined) patch.telefone = txt(b.telefone, 20).replace(/\D/g, '');
    res.json({ usuario: auth.publico(db.atualiza('usuarios', req.usuario.id, patch)) });
  });

  // ---------- Notas fiscais ----------
  // Nota recusada não fica no sistema: o motivo volta para a tela na hora e o registro some
  // (ela nunca existiu na Receita). Também limpa as recusadas que ficaram de antes.
  function descarta(n, dados) {
    db.remove('notas', (x) => x.id === n.id);
    console.warn('[notas] recusada e descartada', n.id, String(dados.erro || '').slice(0, 160));
    return { ...n, ...dados, status: 'erro', descartada: true };
  }
  try { db.remove('notas', (x) => x.status === 'erro'); } catch (err) { console.warn('[notas] limpeza', err.message); }
  const minhasNotas = (u) => db.lista('notas', (n) => n.usuarioId === u.id).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  const usadasNoMes = (u) => {
    const mes = new Date().toISOString().slice(0, 7);
    return minhasNotas(u).filter((n) => n.enviadaEm && n.enviadaEm.startsWith(mes) && n.status !== 'erro' && !n.teste).length;
  };

  async function atualizaProcessando(u) {
    for (const n of minhasNotas(u).filter((x) => x.status === 'processando')) {
      try {
        if (n.via === 'nacional') await retomaNacional(u, n);
        else if (notas.ativo()) { const c = await notas.consulta(n); if (c.status === 'erro') descarta(n, c); else db.atualiza('notas', n.id, c); }
      } catch (err) { console.warn('[notas] consulta', n.id, err.message); }
    }
  }

  // ---------- NFS-e Nacional (direto na Receita, com o certificado A1 da empresa) ----------
  const PASTA_NFSE = path.join(DADOS_DIR, 'nfse');
  const arqNota = (n, ext) => path.join(PASTA_NFSE, `${String(n.id).replace(/[^\w-]/g, '')}.${ext}`);
  // Ambiente de emissão da empresa: o escolhido no /admin ou, sem escolha, o padrão das variáveis
  const ambienteDe = (u) => (u.fiscal && u.fiscal.emissao) || (nacional.ligado() ? (nacional.homologacao() ? 'homologacao' : 'producao') : 'desligada');
  const opcoesAmb = (amb) => ({ homolog: amb === 'homologacao' });
  const usaNacional = (u) => ambienteDe(u) !== 'desligada' && certificado.ativo() && notas.configFiscalCompleta(u) && !!certificado.carrega(u.id);

  // Guarda XML e PDF da nota e cria o link público do PDF (para o cliente mandar ao tomador)
  async function guardaArquivosNacional(u, n, r, cert) {
    fs.mkdirSync(PASTA_NFSE, { recursive: true });
    if (r.nfseXml) { try { fs.writeFileSync(arqNota(n, 'xml'), nacional.desgz64(r.nfseXml)); } catch (err) { console.warn('[nfse] xml', err.message); } }
    const token = n.token || crypto.randomBytes(12).toString('base64url');
    let pdf = '';
    try {
      fs.writeFileSync(arqNota(n, 'pdf'), await nacional.danfse(r.chaveAcesso, cert, opcoesAmb(n.ambiente)));
      pdf = `${site}/nf/${token}`;
    } catch (err) {
      console.warn('[nfse] danfse', n.id, err.message);
      pdf = `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${r.chaveAcesso}`;
    }
    const { nfseXml, ...resto } = r;
    const salva = db.atualiza('notas', n.id, { ...resto, token, pdf });
    if (salva.status === 'emitida' && !salva.teste) {
      await entregaNota(u, salva).catch((err) => console.warn('[nfse] entrega', err.message));
      await avisos.nota(u, salva).catch((err) => console.warn('[nfse] whatsapp', err.message));
    }
    return db.acha('notas', (x) => x.id === n.id);
  }

  // Assim que a nota sai, manda por e-mail (PDF e XML anexos) para o escritório, a empresa e o tomador
  async function entregaNota(u, n) {
    const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const escritorio = (tabelaPrecos().escritorio || {});
    const para = [...new Set([process.env.NOTAS_EMAIL || escritorio.email, u.email, n.tomador && n.tomador.email].filter((e) => e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))];
    if (!para.length) return;
    if (!canais.emailAtivo()) { db.atualiza('notas', n.id, { entrega: { ok: false, erro: 'e-mail não configurado', em: new Date().toISOString() } }); return; }
    const anexos = [];
    try { anexos.push({ nome: `NFS-e ${n.numero || n.id}.pdf`, conteudo: fs.readFileSync(arqNota(n, 'pdf')) }); } catch { /* sem PDF: vai o link */ }
    try { anexos.push({ nome: `NFS-e ${n.numero || n.id}.xml`, conteudo: fs.readFileSync(arqNota(n, 'xml')) }); } catch { /* sem XML */ }
    const prestador = (u.empresa && u.empresa.razaoSocial) || u.nome;
    const html = `<p>Nota fiscal de serviço emitida.</p>
      <p><b>Número:</b> ${esc(n.numero || '—')}<br><b>Prestador:</b> ${esc(prestador)}<br><b>Tomador:</b> ${esc(n.tomador.nome)}<br><b>Valor:</b> ${brl(n.valor)}<br><b>Serviço:</b> ${esc(n.descricao)}</p>
      <p>${n.pdf ? `<a href="${esc(n.pdf)}">Abrir a nota (PDF)</a>` : ''}${n.chaveAcesso ? `<br><small>Chave de acesso: ${esc(n.chaveAcesso)}</small>` : ''}</p>
      <p>${esc(escritorio.nome || 'V&J Assessoria Contábil')}</p>`;
    const r = await canais.enviaEmail({ para, assunto: `NFS-e ${n.numero ? 'nº ' + n.numero + ' ' : ''}emitida · ${prestador} → ${n.tomador.nome} · ${brl(n.valor)}`, html, anexos });
    db.atualiza('notas', n.id, { entrega: { ok: r.ok, para, erro: r.erro || '', em: new Date().toISOString() } });
  }

  async function emiteNacional(u, n, agora) {
    const numeroDps = u.proximoDps || 1;
    db.atualiza('usuarios', u.id, { proximoDps: numeroDps + 1 });
    const cert = certificado.carrega(u.id);
    const ambiente = ambienteDe(u);
    const base = { via: 'nacional', ambiente, numeroDps, enviadaEm: agora, idDps: nacional.idDps({ codigoMunicipio: u.fiscal.codigoMunicipio, cnpj: u.cnpj, serie: Number(u.fiscal.serieDps || 1), numero: numeroDps }) };
    db.atualiza('notas', n.id, { ...base, status: 'processando' });
    try {
      const r = await nacional.emite({ ...n, numeroDps }, u, cert, opcoesAmb(ambiente));
      return guardaArquivosNacional(u, { ...n, ...base }, r, cert);
    } catch (err) {
      // Sem resposta da Receita: fica "processando" e é conferida pela DPS na próxima abertura
      // Só fica "processando" quando a nota pode ter chegado na Receita (queda de rede, timeout, 5xx).
      // Problema do nosso lado (certificado, montagem da nota) vira erro na hora, com o motivo.
      const rede = /^E[A-Z_]+$/.test(err.code || '') && !/^ERR_/.test(err.code || '') || /ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EPIPE/.test(err.message);
      const semResposta = err instanceof nacional.ErroNfse ? (err.semResposta || err.status >= 500) : (rede || /timeout|socket hang up/i.test(err.message));
      if (semResposta) return db.atualiza('notas', n.id, { ...base, status: 'processando', erro: '' });
      console.warn('[nfse] emissão', n.id, err.message);
      const motivo = err instanceof nacional.ErroNfse ? err.message : /unsupported|pkcs12|pfx|mac verify/i.test(err.message) ? 'O certificado da empresa não pôde ser usado na conexão com a Receita. Envie o certificado A1 de novo na Configuração.' : `Não foi possível montar a nota: ${err.message}`;
      return descarta(n, { ...base, erro: motivo });
    }
  }

  async function retomaNacional(u, n) {
    const cert = certificado.carrega(u.id);
    if (!cert || !n.idDps) return;
    const achou = await nacional.consultaDps(n.idDps, cert, opcoesAmb(n.ambiente));
    if (achou) await guardaArquivosNacional(u, n, { status: 'emitida', chaveAcesso: achou.chaveAcesso, emitidaEm: new Date().toISOString() }, cert);
    else if (Date.now() - Date.parse(n.enviadaEm) > 30 * 60 * 1000) descarta(n, { erro: 'A Receita não confirmou a emissão.' });
  }

  // PDF do DAS anexado pelo escritório (link com token, para o cliente baixar)
  function enviaPdfDas(req, res) {
    const token = String(req.params.token || '').replace(/[^\w-]/g, '');
    const arq = path.join(DADOS_DIR, 'das', `${token}.pdf`);
    if (!token || !fs.existsSync(arq)) return res.status(404).send('Guia não encontrada.');
    res.type('application/pdf').set('Content-Disposition', 'inline; filename="DAS.pdf"').sendFile(arq);
  }

  // PDF da nota por link público (com token), para enviar ao tomador
  function enviaPdfNota(req, res) {
    const n = db.acha('notas', (x) => x.token && x.token === req.params.token);
    if (!n || !fs.existsSync(arqNota(n, 'pdf'))) return res.status(404).send('Nota não encontrada.');
    res.type('application/pdf').set('Content-Disposition', `inline; filename="NFS-e-${n.numero || n.id}.pdf"`).sendFile(arqNota(n, 'pdf'));
  }

  // Clientes (tomadores) para quem a empresa já emitiu, do mais recente para o mais antigo, sem repetir
  function tomadoresFrequentes(u) {
    const vistos = new Map();
    for (const n of minhasNotas(u).filter((x) => x.status !== 'rascunho')) {
      const doc = n.tomador.cnpj || n.tomador.cpf;
      if (!doc) continue;
      const t = vistos.get(doc) || { documento: doc, nome: n.tomador.nome, email: n.tomador.email || '', ultimaDescricao: n.descricao, ultimoValor: n.valor, notas: 0 };
      t.notas += 1;
      vistos.set(doc, t);
    }
    return [...vistos.values()].slice(0, 12);
  }

  r.get('/notas', auth.exigePlano, async (req, res) => {
    await atualizaProcessando(req.usuario);
    const plano = planoDo(req.usuario);
    res.json({ notas: minhasNotas(req.usuario), usadas: usadasNoMes(req.usuario), limite: plano.notasMes || 0, fiscalOk: notas.configFiscalCompleta(req.usuario), focusAtivo: notas.ativo(), tomadores: tomadoresFrequentes(req.usuario) });
  });

  // Nome do cliente na hora em que o CNPJ é digitado (antes de gerar o rascunho)
  const limiteTomador = rateLimit({ windowMs: 60 * 1000, limit: 30, message: { erro: 'Muitas consultas seguidas. Espere um minuto.' } });
  r.get('/tomador/:doc', auth.exigePlano, limiteTomador, async (req, res) => {
    const doc = String(req.params.doc || '').replace(/\D/g, '');
    if (doc.length !== 14 || !cnpjUtil.valido(doc)) return res.status(400).json({ erro: 'CNPJ inválido. Confira os números.' });
    const e = await buscaEmpresa(doc).catch(() => null);
    if (!e) return res.status(404).json({ erro: 'CNPJ não encontrado na Receita.' });
    res.json({ cnpj: doc, nome: e.razaoSocial, fantasia: e.nomeFantasia || '', municipio: e.municipio || '', uf: e.uf || '', situacao: e.situacao || '' });
  });

  // ---- Regras comuns (cliente na Área do Cliente e contador no painel do escritório) ----
  // Rascunho a partir de CNPJ/CPF, descrição e valor, com os dados do tomador já preenchidos.
  // Devolve { nota } ou { status, erro }.
  async function criaRascunho(u, body) {
    const doc = String(body.documento || '').replace(/\D/g, '');
    const descricao = txt(body.descricao, 2000);
    const valor = dinheiro(body.valor);
    if (!descricao || !(valor > 0)) return { status: 400, erro: 'Informe a descrição do serviço e o valor.' };
    const tomador = { email: txt(body.email, 160) };
    if (doc.length === 14) {
      if (!cnpjUtil.valido(doc)) return { status: 400, erro: 'CNPJ do cliente inválido.' };
      const e = await buscaEmpresa(doc).catch(() => null);
      Object.assign(tomador, { cnpj: doc, nome: e ? e.razaoSocial : txt(body.nome, 160), municipio: e && e.municipio, uf: e && e.uf });
      // Endereço e telefone do cadastro da Receita, para a nota sair completa
      const end = await obraUtil.completaEndereco(e && e.endereco ? { ...e.endereco, codigoMunicipio: e.endereco.codigoMunicipio || e.codigoIbge } : null);
      if (end) tomador.endereco = end;
      if (e && /^\d{10,11}$/.test(e.telefone || '')) tomador.telefone = e.telefone;
    } else if (doc.length === 11) {
      Object.assign(tomador, { cpf: doc, nome: txt(body.nome, 160) || 'Consumidor' });
      // CPF: endereço opcional, digitado na tela (CEP e número)
      if (body.endereco && String(body.endereco.cep || '').replace(/\D/g, '')) {
        const end = await obraUtil.completaEndereco(body.endereco);
        if (!end) return { status: 400, erro: 'Não achamos o endereço do cliente por este CEP. Confira o CEP ou deixe em branco.' };
        Object.assign(tomador, { endereco: end, municipio: end.municipio || '', uf: end.uf || '' });
      }
    } else {
      return { status: 400, erro: 'Informe o CNPJ (14 dígitos) ou CPF (11 dígitos) do cliente.' };
    }
    // Empresa de obra: a nota precisa do endereço (ou CNO) da obra
    let obra = null;
    if (obraUtil.exige(u.fiscal && u.fiscal.codigoServico)) {
      const r = await obraUtil.normaliza(body.obra);
      if (r.erro) return { status: 400, erro: r.erro };
      obra = r.obra;
    }
    return { nota: db.insere('notas', { usuarioId: u.id, status: 'rascunho', tomador, descricao, valor, ...(obra ? { obra } : {}), ...(body.pedidoPor ? { pedidoPor: body.pedidoPor } : {}) }) };
  }

  // Envia um rascunho: direto na Receita (NFS-e Nacional), pela Focus ou para a fila da equipe
  async function enviaNota(u, n) {
    const agora = new Date().toISOString();
    if (usaNacional(u)) return emiteNacional(u, n, agora);
    if (notas.ativo() && notas.configFiscalCompleta(u)) {
      const numeroDps = u.proximoDps || 1;
      db.atualiza('usuarios', u.id, { proximoDps: numeroDps + 1 });
      try {
        const r2 = await notas.emite({ ...n, numeroDps }, u);
        if (r2.status === 'erro') return descarta(n, { ...r2, numeroDps, enviadaEm: agora });
        return db.atualiza('notas', n.id, { ...r2, numeroDps, enviadaEm: agora });
      } catch (err) {
        return descarta(n, { erro: err.message, numeroDps, enviadaEm: agora });
      }
    }
    // Sem integração ativa: entra na fila da equipe V&J, que emite e anexa o PDF
    return db.atualiza('notas', n.id, { status: 'fila', enviadaEm: agora });
  }

  // Cancela uma nota emitida. Devolve { nota } ou { status, erro }.
  async function cancelaNota(u, n, justificativa) {
    if (!n || n.status !== 'emitida') return { status: 404, erro: 'Nota emitida não encontrada.' };
    const j = txt(justificativa, 255);
    if (j.length < 15) return { status: 400, erro: 'Explique o motivo do cancelamento (mínimo 15 caracteres).' };
    if (n.via === 'nacional' && n.chaveAcesso) {
      const cert = certificado.carrega(u.id);
      if (!cert) return { status: 409, erro: 'O certificado da empresa não está conectado.' };
      try { return { nota: db.atualiza('notas', n.id, { ...(await nacional.cancela(n, u, j, cert, opcoesAmb(n.ambiente))), cancelamentoPedido: j }) }; } catch (err) {
        // E0840: a nota já foi cancelada na Receita (ex.: direto no Emissor Nacional). Só acerta aqui.
        if (/E0840/.test(err.message)) return { nota: db.atualiza('notas', n.id, { status: 'cancelada', canceladaEm: new Date().toISOString(), cancelamentoPedido: j, obsCancelamento: 'Já estava cancelada na Receita' }) };
        return { status: 502, erro: err.message };
      }
    }
    if (!notas.ativo()) return { nota: db.atualiza('notas', n.id, { cancelamentoPedido: j }) };
    try { return { nota: db.atualiza('notas', n.id, await notas.cancela(n, j)) }; } catch (err) { return { status: 502, erro: err.message }; }
  }
  const responde2 = (res, r) => (r.erro ? res.status(r.status || 400).json({ erro: r.erro }) : res.json(r));

  // Passo 1: só CNPJ (ou CPF), descrição e valor -> rascunho com os dados do tomador já preenchidos
  r.post('/notas', auth.exigePlano, async (req, res) => {
    const plano = planoDo(req.usuario);
    if (!plano.notasMes) return res.status(402).json({ erro: `A emissão de notas faz parte do plano ${planos().find((p) => p.notasMes)?.nome || 'Completo'}.` });
    responde2(res, await criaRascunho(req.usuario, req.body || {}));
  });

  // Passo 2: o assinante confere e confirma; só então a nota é enviada
  r.post('/notas/:id/emitir', auth.exigePlano, async (req, res) => {
    const n = db.acha('notas', (x) => x.id === req.params.id && x.usuarioId === req.usuario.id);
    if (!n || n.status !== 'rascunho') return res.status(404).json({ erro: 'Rascunho não encontrado.' });
    const plano = planoDo(req.usuario);
    if (usadasNoMes(req.usuario) >= (plano.notasMes || 0)) return res.status(402).json({ erro: `Você já usou as ${plano.notasMes} notas do mês. Fale conosco para ampliar.` });
    res.json({ nota: await enviaNota(req.usuario, n) });
  });

  r.delete('/notas/:id', auth.exigePlano, (req, res) => {
    db.remove('notas', (x) => x.id === req.params.id && x.usuarioId === req.usuario.id && x.status === 'rascunho');
    res.json({ ok: true });
  });

  r.post('/notas/:id/cancelar', auth.exigePlano, async (req, res) => {
    const n = db.acha('notas', (x) => x.id === req.params.id && x.usuarioId === req.usuario.id);
    responde2(res, await cancelaNota(req.usuario, n, req.body && req.body.justificativa));
  });

  // ---------- Orçamentos ----------
  r.get('/orcamentos', auth.exigePlano, (req, res) => {
    res.json({ orcamentos: db.lista('orcamentos', (o) => o.usuarioId === req.usuario.id).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)) });
  });

  r.post('/orcamentos', auth.exigePlano, async (req, res) => {
    const doc = String(req.body.documento || '').replace(/\D/g, '');
    const itens = (Array.isArray(req.body.itens) ? req.body.itens : []).slice(0, 50)
      .map((i) => ({ descricao: txt(i.descricao, 500), quantidade: Math.max(0, Number(i.quantidade) || 1), valor: dinheiro(i.valor) }))
      .filter((i) => i.descricao && i.valor >= 0);
    if (!itens.length) return res.status(400).json({ erro: 'Adicione pelo menos um item com descrição e valor.' });
    let cliente = { nome: txt(req.body.nomeCliente, 160), email: txt(req.body.emailCliente, 160) };
    if (doc.length === 14) {
      if (!cnpjUtil.valido(doc)) return res.status(400).json({ erro: 'CNPJ do cliente inválido.' });
      const e = await buscaEmpresa(doc).catch(() => null);
      cliente = { ...cliente, cnpj: doc, nome: (e && e.razaoSocial) || cliente.nome, fantasia: e && e.nomeFantasia, municipio: e && e.municipio, uf: e && e.uf };
    } else if (doc.length === 11) cliente.cpf = doc;
    if (!cliente.nome) return res.status(400).json({ erro: 'Informe o CNPJ ou o nome do cliente.' });
    const subtotal = dinheiro(itens.reduce((t, i) => t + i.quantidade * i.valor, 0));
    const desconto = Math.min(subtotal, Math.max(0, dinheiro(req.body.desconto || 0)));
    const numero = db.lista('orcamentos', (o) => o.usuarioId === req.usuario.id).length + 1;
    const o = db.insere('orcamentos', {
      usuarioId: req.usuario.id, numero, token: crypto.randomBytes(12).toString('base64url'), cliente, itens,
      titulo: txt(req.body.titulo, 160), escopo: txt(req.body.escopo, 6000), subtotal, desconto, total: dinheiro(subtotal - desconto),
      validadeDias: Math.min(180, Math.max(1, Number(req.body.validadeDias) || 15)), prazo: txt(req.body.prazo, 200),
      pagamento: txt(req.body.pagamento, 300), observacoes: txt(req.body.observacoes, 2000), status: 'aguardando',
    });
    res.json({ orcamento: o });
  });

  // Texto de escopo detalhado gerado pela IA a partir dos itens (opcional)
  r.post('/orcamentos/escopo', auth.exigePlano, async (req, res) => {
    if (!assistente.ativo()) return res.status(503).json({ erro: 'A IA ainda não está ativada.' });
    const itens = (Array.isArray(req.body.itens) ? req.body.itens : []).slice(0, 30).map((i) => `- ${txt(i.descricao, 300)} (${Number(i.quantidade) || 1} x R$ ${Number(i.valor) || 0})`).join('\n');
    const u = req.usuario;
    try {
      const texto = await assistente.textoUnico(`Escreva o escopo de um orçamento profissional da empresa "${u.empresa ? u.empresa.razaoSocial : ''}" (${u.empresa ? u.empresa.atividade : ''}) para o cliente "${txt(req.body.cliente, 160)}". Título: ${txt(req.body.titulo, 160)}.\nItens:\n${itens}\n\nEm português do Brasil, em 1 a 3 parágrafos curtos e uma lista do que está incluso. Não invente valores, prazos ou garantias que não foram informados. Responda só com o texto do escopo.`);
      res.json({ escopo: texto });
    } catch (err) {
      console.error('[portal] escopo IA:', err.message);
      res.status(502).json({ erro: 'Não foi possível gerar o texto agora.' });
    }
  });

  r.patch('/orcamentos/:id', auth.exigePlano, (req, res) => {
    const o = db.acha('orcamentos', (x) => x.id === req.params.id && x.usuarioId === req.usuario.id);
    if (!o) return res.status(404).json({ erro: 'Orçamento não encontrado.' });
    const status = ['aguardando', 'aprovado', 'recusado'].includes(req.body.status) ? req.body.status : null;
    if (!status) return res.status(400).json({ erro: 'Situação inválida.' });
    res.json({ orcamento: db.atualiza('orcamentos', o.id, { status, respondidoEm: status === 'aguardando' ? null : new Date().toISOString(), respondidoPor: 'empresa' }) });
  });

  r.delete('/orcamentos/:id', auth.exigePlano, (req, res) => {
    db.remove('orcamentos', (o) => o.id === req.params.id && o.usuarioId === req.usuario.id);
    res.json({ ok: true });
  });

  // Página pública do orçamento (link enviado ao cliente)
  const publico = express.Router();
  publico.get('/:token', (req, res) => {
    const o = db.acha('orcamentos', (x) => x.token === req.params.token);
    if (!o) return res.status(404).json({ erro: 'Orçamento não encontrado.' });
    const u = db.acha('usuarios', (x) => x.id === o.usuarioId) || {};
    const { usuarioId, token, ...dados } = o;
    res.json({ orcamento: dados, emissor: { nome: u.empresa ? u.empresa.razaoSocial : u.nome, fantasia: u.empresa && u.empresa.nomeFantasia, cnpj: u.cnpj, email: u.email, telefone: u.telefone, cidade: u.empresa ? `${u.empresa.municipio}/${u.empresa.uf}` : '' } });
  });

  // O cliente aprova ou recusa pela página do orçamento; o assinante recebe um alerta
  publico.post('/:token/resposta', express.json(), (req, res) => {
    const o = db.acha('orcamentos', (x) => x.token === req.params.token);
    if (!o) return res.status(404).json({ erro: 'Orçamento não encontrado.' });
    if (o.status && o.status !== 'aguardando') return res.status(409).json({ erro: `Este orçamento já foi ${o.status}.` });
    const acao = req.body.acao === 'aprovar' ? 'aprovado' : req.body.acao === 'recusar' ? 'recusado' : null;
    if (!acao) return res.status(400).json({ erro: 'Resposta inválida.' });
    const nome = txt(req.body.nome, 120);
    db.atualiza('orcamentos', o.id, { status: acao, respondidoEm: new Date().toISOString(), respondidoPor: nome || 'cliente', motivoRecusa: acao === 'recusado' ? txt(req.body.motivo, 500) : undefined });
    const dono = db.acha('usuarios', (u) => u.id === o.usuarioId);
    if (dono) {
      const alerta = { em: new Date().toISOString(), texto: `${o.cliente.nome}${nome ? ` (${nome})` : ''} ${acao === 'aprovado' ? 'APROVOU' : 'recusou'} o orçamento nº ${String(o.numero).padStart(4, '0')} de ${o.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.` };
      db.atualiza('usuarios', dono.id, { alertas: [alerta, ...(dono.alertas || [])].slice(0, 30) });
    }
    res.json({ ok: true, status: acao });
  });

  // ---------- Admin (senha do painel) ----------
  const admin = express.Router();

  // ---------- Equipe do escritório (dono e funcionários) ----------
  const soGestor = (req, res, next) => (req.acesso && req.acesso.gestor ? next() : res.status(403).json({ erro: 'Só o responsável pelo escritório pode fazer isso.' }));
  const daEquipe = (u) => u.papel === 'dono' || u.papel === 'equipe';
  const membro = (u) => ({ id: u.id, nome: u.nome, email: u.email, papel: u.papel, ativo: u.ativo !== false, trocarSenha: !!u.trocarSenha, criadoEm: u.criadoEm, ultimoAcesso: u.ultimoAcesso || null, carteiraPrivada: !!u.carteiraPrivada, privadas: db.lista('usuarios', (x) => x.privadaDe === u.id).length });
  // Senha provisória: mostrada uma vez para o responsável, a pessoa troca no primeiro acesso
  const senhaProvisoria = () => {
    const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
    return Array.from(crypto.randomBytes(10), (b) => letras[b % letras.length]).join('');
  };
  admin.get('/equipe/eu', (req, res) => {
    const u = req.acesso && req.acesso.usuario;
    if (u) db.atualiza('usuarios', u.id, { ultimoAcesso: new Date().toISOString() });
    res.json({ usuario: u ? membro(u) : null, gestor: !!(req.acesso && req.acesso.gestor) });
  });
  // Empresas da carteira (as mesmas do painel) e quem cuida de cada uma
  // Para o responsável: só as empresas que não são privadas de um funcionário
  const carteiraEmpresas = () => db.lista('usuarios', (u) => u.cnpj && !auth.ehDono(u) && !u.privadaDe);
  const empresasDoMembro = (id) => carteiraEmpresas().filter((u) => (u.responsaveis || []).includes(id)).map((u) => u.id);
  // Passa empresas para a carteira privada do funcionário (somem da visão do responsável)
  function tornaPrivadas(membroId, ids) {
    for (const id of (Array.isArray(ids) ? ids : []).map(String)) {
      const u = db.acha('usuarios', (x) => x.id === id && x.cnpj && !auth.ehDono(x));
      if (u) db.atualiza('usuarios', u.id, { privadaDe: membroId, responsaveis: [...new Set([...(u.responsaveis || []), membroId])] });
    }
  }
  function defineCarteira(membroId, ids) {
    const quer = new Set((Array.isArray(ids) ? ids : []).map(String));
    for (const u of carteiraEmpresas()) {
      const atual = u.responsaveis || [];
      const tem = atual.includes(membroId);
      if (quer.has(u.id) && !tem) db.atualiza('usuarios', u.id, { responsaveis: [...atual, membroId] });
      if (!quer.has(u.id) && tem) db.atualiza('usuarios', u.id, { responsaveis: atual.filter((x) => x !== membroId) });
    }
  }
  admin.get('/equipe', soGestor, (req, res) => {
    res.json({
      equipe: db.lista('usuarios', daEquipe).map((u) => ({ ...membro(u), empresas: empresasDoMembro(u.id) })).sort((a, b) => (a.papel === b.papel ? a.nome.localeCompare(b.nome) : a.papel === 'dono' ? -1 : 1)),
      empresas: carteiraEmpresas().map((u) => ({ id: u.id, nome: (u.empresa && u.empresa.razaoSocial) || u.nome, cnpj: u.cnpj })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    });
  });
  admin.post('/equipe', soGestor, express.json(), (req, res) => {
    const nome = txt(req.body.nome, 120);
    const email = txt(req.body.email, 160).toLowerCase();
    const papel = req.body.papel === 'dono' ? 'dono' : 'equipe';
    if (!nome || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ erro: 'Informe o nome e um e-mail válido.' });
    if (db.acha('usuarios', (u) => u.email === email)) return res.status(409).json({ erro: 'Já existe um acesso com este e-mail.' });
    const senha = senhaProvisoria();
    const u = db.insere('usuarios', { nome, email, papel, senha: auth.hashSenha(senha), ativo: true, trocarSenha: true, alertas: [] });
    if (req.body.empresas) defineCarteira(u.id, req.body.empresas);
    res.json({ membro: { ...membro(u), empresas: empresasDoMembro(u.id) }, senhaProvisoria: senha });
  });
  const achaMembro = (req, res) => {
    const u = db.acha('usuarios', (x) => x.id === req.params.id && daEquipe(x));
    if (!u) res.status(404).json({ erro: 'Pessoa não encontrada na equipe.' });
    return u;
  };
  const outrosDonosAtivos = (id) => db.lista('usuarios', (x) => x.papel === 'dono' && x.ativo !== false && x.id !== id).length;
  admin.post('/equipe/:id/senha', soGestor, (req, res) => {
    const u = achaMembro(req, res);
    if (!u) return;
    const senha = senhaProvisoria();
    db.atualiza('usuarios', u.id, { senha: auth.hashSenha(senha), trocarSenha: true });
    db.remove('sessoes', (s) => s.usuarioId === u.id);
    res.json({ membro: membro(db.acha('usuarios', (x) => x.id === u.id)), senhaProvisoria: senha });
  });
  admin.post('/equipe/:id', soGestor, express.json(), (req, res) => {
    const u = achaMembro(req, res);
    if (!u) return;
    const patch = {};
    if (req.body.nome !== undefined) patch.nome = txt(req.body.nome, 120) || u.nome;
    if (req.body.papel !== undefined) patch.papel = req.body.papel === 'dono' ? 'dono' : 'equipe';
    if (req.body.ativo !== undefined) patch.ativo = req.body.ativo !== false;
    if (req.body.carteiraPrivada !== undefined) {
      patch.carteiraPrivada = req.body.carteiraPrivada === true;
      // Desligou: as empresas privadas dele voltam a aparecer para o responsável
      if (!patch.carteiraPrivada) for (const e of db.lista('usuarios', (x) => x.privadaDe === u.id)) db.atualiza('usuarios', e.id, { privadaDe: null });
    }
    if (Array.isArray(req.body.privadas)) tornaPrivadas(u.id, req.body.privadas);
    const viraFuncionario = patch.papel === 'equipe' && u.papel === 'dono';
    if ((patch.ativo === false || viraFuncionario) && u.papel === 'dono' && !outrosDonosAtivos(u.id)) return res.status(409).json({ erro: 'O escritório precisa de pelo menos um responsável ativo.' });
    const salvo = db.atualiza('usuarios', u.id, patch);
    if (patch.ativo === false) db.remove('sessoes', (s) => s.usuarioId === u.id);
    if (req.body.empresas !== undefined) defineCarteira(u.id, req.body.empresas);
    res.json({ membro: { ...membro(salvo), empresas: empresasDoMembro(u.id) } });
  });
  admin.post('/equipe-minha-senha', express.json(), (req, res) => {
    const u = req.acesso && req.acesso.usuario;
    if (!u) return res.status(400).json({ erro: 'Entre com seu e-mail para trocar a sua senha.' });
    const nova = String(req.body.nova || '');
    if (!auth.confereSenha(String(req.body.atual || ''), u.senha)) return res.status(401).json({ erro: 'A senha atual não confere.' });
    if (nova.length < 8) return res.status(400).json({ erro: 'A nova senha precisa ter pelo menos 8 caracteres.' });
    db.atualiza('usuarios', u.id, { senha: auth.hashSenha(nova), trocarSenha: false });
    res.json({ ok: true });
  });

  // ---------- Carteira de cada funcionário ----------
  // O responsável vê todas as empresas; o funcionário só as que foram passadas para ele
  // Carteira privada: empresa com privadaDe só aparece para aquele funcionário (o responsável não vê)
  const restrito = (req) => (req.acesso && !req.acesso.gestor && req.acesso.usuario ? req.acesso.usuario.id : null);
  const naCarteira = (req) => {
    const m = restrito(req);
    const eu = req.acesso && req.acesso.usuario ? req.acesso.usuario.id : null;
    return (u) => (m ? (u.responsaveis || []).includes(m) : !u.privadaDe || u.privadaDe === eu);
  };
  admin.use((req, res, next) => {
    const m = restrito(req);
    const p = req.path;
    if (m && (/^\/analises/.test(p) || /^\/escritorio\/integra\/certificado/.test(p) || /^\/assinantes\/[^/]+\/(liberar|papel)/.test(p))) return res.status(403).json({ erro: 'Só o responsável pelo escritório pode fazer isso.' });
    let alvo = null;
    let x = p.match(/^\/(?:assinantes|empresas|apuracoes|escritorio\/empresas)\/([^/]+)/);
    if (x) alvo = x[1];
    else if ((x = p.match(/^\/notas\/([^/]+)/))) { const n = db.acha('notas', (y) => y.id === x[1]); alvo = n ? n.usuarioId : '-'; }
    if (alvo) {
      const u = db.acha('usuarios', (y) => y.id === alvo);
      if (!u || !naCarteira(req)(u)) return res.status(404).json({ erro: 'Empresa não encontrada.' });
    }
    next();
  });
  const nomesEquipe = () => Object.fromEntries(db.lista('usuarios', daEquipe).map((m) => [m.id, m.nome]));

  admin.use('/analises', analises.admin());
  admin.get('/assinantes', (req, res) => {
    // Último teste de emissão (homologação) de cada empresa, para conferir a nota gerada
    const testes = {};
    for (const n of db.lista('notas', (x) => x.teste)) if (!testes[n.usuarioId] || (n.enviadaEm || '') > (testes[n.usuarioId].enviadaEm || '')) testes[n.usuarioId] = n;
    const resumoTeste = (n) => n && { status: n.status, numero: n.numero || '', chaveAcesso: n.chaveAcesso || '', pdf: n.pdf || '', erro: n.erro || '', enviadaEm: n.enviadaEm };
    res.json({ assinantes: db.lista('usuarios', naCarteira(req)).map((u) => ({ ...auth.publico(u), analise: undefined, ultimoTeste: resumoTeste(testes[u.id]) })).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)) });
  });
  admin.post('/assinantes/:id/papel', soGestor, express.json(), (req, res) => {
    const u = db.acha('usuarios', (x) => x.id === req.params.id);
    if (!u) return res.status(404).json({ erro: 'Conta não encontrada.' });
    const papel = req.body.papel === 'dono' ? 'dono' : 'cliente';
    res.json({ usuario: auth.publico(db.atualiza('usuarios', u.id, { papel })) });
  });
  admin.post('/assinantes/:id/liberar', express.json(), (req, res) => {
    const u = db.acha('usuarios', (x) => x.id === req.params.id);
    if (!u) return res.status(404).json({ erro: 'Conta não encontrada.' });
    const dias = Math.min(400, Math.max(-1, Number(req.body.dias) || 30));
    const patch = dias < 0 ? { planoAte: new Date().toISOString() } : { planoAte: pagamentos.estende(u, dias) };
    if (req.body.planoId) patch.planoId = req.body.planoId;
    res.json({ usuario: auth.publico(db.atualiza('usuarios', u.id, patch)) });
  });
  admin.get('/assinantes/:id/resumo', (req, res) => {
    const u = db.acha('usuarios', (x) => x.id === req.params.id);
    if (!u) return res.status(404).send('Conta não encontrada');
    res.type('html').send(resumo.html(u, resumo.monta(u), site));
  });
  admin.post('/assinantes/:id/resumo', async (req, res) => {
    const u = db.acha('usuarios', (x) => x.id === req.params.id);
    if (!u) return res.status(404).json({ erro: 'Conta não encontrada.' });
    const { resultado } = await resumo.envia(u, { site });
    res.json({ resultado });
  });
  admin.post('/empresas', express.json(), async (req, res) => {
    const cnpj = cnpjUtil.limpa(req.body.cnpj);
    if (!cnpjUtil.valido(cnpj)) return res.status(400).json({ erro: 'CNPJ inválido.' });
    const existe = db.acha('usuarios', (x) => x.cnpj === cnpj);
    if (existe) return res.status(409).json({ erro: 'Esta empresa já está na carteira.', id: existe.id });
    let u = await criaEmpresaCarteira(cnpj, { nome: txt(req.body.nome, 120), telefone: txt(req.body.telefone, 20).replace(/\D/g, '') });
    // Empresa cadastrada pelo funcionário já entra na carteira dele
    if (restrito(req)) {
      const quem = db.acha('usuarios', (x) => x.id === restrito(req));
      u = db.atualiza('usuarios', u.id, { responsaveis: [restrito(req)], ...(quem && quem.carteiraPrivada ? { privadaDe: quem.id } : {}) });
    }
    // Já traz os códigos de emissão (município IBGE, código do serviço pelo CNAE e alíquota do Simples)
    const r = await preencheFiscal(u).catch(() => ({ usuario: u, preenchidos: [] }));
    res.json({ usuario: auth.publico(r.usuario), preenchidos: r.preenchidos, servico: r.servico || null });
  });
  const empresaDe = (req, res) => {
    const u = db.acha('usuarios', (x) => x.id === req.params.id);
    if (!u) res.status(404).json({ erro: 'Empresa não encontrada.' });
    return u;
  };
  admin.post('/assinantes/:id/fiscal', express.json(), (req, res) => { const u = empresaDe(req, res); if (u) salvaFiscal(u, req.body || {}, res, { contador: true }); });
  // ---------- Painel do escritório (/escritorio): empresas -> notas fiscais e PGDAS-D ----------
  function resumoEmpresa(u) {
    const c = u.certificado || {};
    const mes = new Date().toISOString().slice(0, 7);
    const doMes = db.lista('notas', (n) => n.usuarioId === u.id && !n.teste && n.status !== 'rascunho' && (n.enviadaEm || '').startsWith(mes));
    const ultimoTeste = db.lista('notas', (n) => n.usuarioId === u.id && n.teste).sort((a, b) => (b.enviadaEm || '').localeCompare(a.enviadaEm || ''))[0];
    let das = null;
    if (doSimples(u)) { try { das = apuracao.painel(u, { quantas: 1 })[0] || null; } catch { das = null; } }
    return {
      id: u.id, nome: (u.empresa && u.empresa.razaoSocial) || u.nome, fantasia: (u.empresa && u.empresa.nomeFantasia) || '', cnpj: u.cnpj,
      municipio: (u.empresa && u.empresa.municipio) || '', uf: (u.empresa && u.empresa.uf) || '', telefone: u.telefone || '', email: u.email || '',
      regime: u.empresa ? (u.empresa.mei ? 'MEI' : u.empresa.simples ? 'Simples Nacional' : (u.empresa.regime || 'Outro')) : '—',
      situacao: (u.empresa && u.empresa.situacao) || '', gerenciado: !!u.gerenciado, dono: auth.ehDono(u),
      certificado: c.ativo ? { ativo: true, validoAte: c.validoAte, titular: c.titular } : { ativo: false },
      fiscal: u.fiscal || {}, proximoDps: u.proximoDps || 1, emissao: ambienteDe(u), fiscalOk: notas.configFiscalCompleta(u), exigeObra: obraUtil.exige(u.fiscal && u.fiscal.codigoServico),
      notasMes: { quantidade: doMes.filter((n) => n.status !== 'erro').length, valor: doMes.filter((n) => ['emitida', 'fila', 'processando'].includes(n.status)).reduce((t, n) => t + n.valor, 0) },
      pendentes: db.lista('notas', (n) => n.usuarioId === u.id && ['fila', 'erro'].includes(n.status) && !n.teste).length,
      das: das && { competencia: das.competencia, valor: das.das ? das.das.valor : das.valor, status: das.status, vencimento: (das.das && das.das.vencimento) || das.vencimento },
      ultimoTeste: ultimoTeste && { status: ultimoTeste.status, numero: ultimoTeste.numero || '', chaveAcesso: ultimoTeste.chaveAcesso || '', pdf: ultimoTeste.pdf || '', erro: ultimoTeste.erro || '', enviadaEm: ultimoTeste.enviadaEm },
      situacaoFiscal: u.situacaoFiscal ? { em: u.situacaoFiscal.em, regular: u.situacaoFiscal.regular, pendencias: (u.situacaoFiscal.pendencias || []).length, erro: u.situacaoFiscal.erro || '' } : null,
      parcelamentoAtivo: !!(u.parcelamento && u.parcelamento.ativo),
    };
  }
  const empresasEscritorio = () => db.lista('usuarios', (u) => u.cnpj && !auth.ehDono(u));
  admin.get('/escritorio/empresas', (req, res) => {
    const nomes = nomesEquipe();
    const ver = naCarteira(req);
    res.json({ empresas: empresasEscritorio().filter(ver).map((u) => ({ ...resumoEmpresa(u), equipe: (u.responsaveis || []).filter((id) => nomes[id]).map((id) => ({ id, nome: nomes[id] })) })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) });
  });
  admin.get('/escritorio/empresas/:id', async (req, res) => {
    let u = empresaDe(req, res);
    if (!u) return;
    await atualizaProcessando(u).catch(() => {});
    u = await garanteAbertura(db.acha('usuarios', (x) => x.id === u.id));
    const lista = minhasNotas(u).filter((n) => n.status !== 'rascunho' && !n.teste);
    res.json({
      empresa: resumoEmpresa(u), notas: lista, tomadores: tomadoresFrequentes(u), clientes: clientesDa(u),
      apuracao: doSimples(u) ? { anexos: apuracao.anexosDa(u), meses: apuracao.painel(u, { quantas: 12 }) } : null,
    });
  });
  admin.get('/escritorio/tomador/:doc', async (req, res) => {
    const doc = String(req.params.doc || '').replace(/\D/g, '');
    if (doc.length !== 14 || !cnpjUtil.valido(doc)) return res.status(400).json({ erro: 'CNPJ inválido. Confira os números.' });
    const e = await buscaEmpresa(doc).catch(() => null);
    if (!e) return res.status(404).json({ erro: 'CNPJ não encontrado na Receita.' });
    res.json({ cnpj: doc, nome: e.razaoSocial, fantasia: e.nomeFantasia || '', municipio: e.municipio || '', uf: e.uf || '', situacao: e.situacao || '' });
  });
  // ---- Códigos de emissão a partir do CNPJ (município IBGE, código do serviço, alíquota do Simples) ----
  const cacheIbge = {};
  async function codigoIbgeDe(emp) {
    if (emp && /^\d{7}$/.test(String(emp.codigoIbge || ''))) return String(emp.codigoIbge);
    if (!emp || !emp.uf || !emp.municipio) return '';
    const sem = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z ]/g, '').trim();
    try {
      if (!cacheIbge[emp.uf]) cacheIbge[emp.uf] = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${emp.uf}/municipios`, { signal: AbortSignal.timeout(10000) }).then((r) => r.json());
      const m = cacheIbge[emp.uf].find((x) => sem(x.nome) === sem(emp.municipio));
      return m ? String(m.id) : '';
    } catch { return ''; }
  }
  async function preencheFiscal(u, { forcar = false } = {}) {
    let emp = null;
    try { emp = await buscaEmpresa(u.cnpj); } catch { /* usa o que já temos */ }
    const base = emp || u.empresa || {};
    const f = { ...(u.fiscal || {}) };
    const preenchidos = [];
    const ibge = await codigoIbgeDe(base);
    if (ibge && (forcar || !f.codigoMunicipio)) { f.codigoMunicipio = ibge; preenchidos.push('município'); }
    const sug = servicos.sugereServico(base.cnae || (u.empresa && u.empresa.cnae), base.cnaesSecundarios || []);
    if (sug && (forcar || !f.codigoServico)) { f.codigoServico = sug.codigo; preenchidos.push('código do serviço'); }
    if (forcar || !f.aliquotaSN) {
      const anexo = apuracao.anexosDa(u).servicos;
      let al = servicos.aliquotaInicial(anexo);
      try { const ult = apuracao.painel(u, { quantas: 3 }).find((m) => m.partes.length); if (ult) al = Math.round(ult.partes[0].aliquota * 10000) / 100; } catch { /* sem faturamento */ }
      f.aliquotaSN = al; preenchidos.push('alíquota do Simples');
    }
    if (!f.serieDps) f.serieDps = 900;
    const patch = { fiscal: f, ...(emp ? { empresa: { ...(u.empresa || {}), codigoIbge: ibge || (u.empresa && u.empresa.codigoIbge) || '', cnae: emp.cnae, atividade: emp.atividade, municipio: emp.municipio, uf: emp.uf } } : {}) };
    const novo = db.atualiza('usuarios', u.id, patch);
    return { usuario: novo, preenchidos, servico: sug, atividade: base.atividade || '', cnae: base.cnae || '' };
  }
  admin.post('/escritorio/empresas/:id/preencher', async (req, res) => {
    const u = empresaDe(req, res);
    if (!u) return;
    const r = await preencheFiscal(u, { forcar: true });
    res.json({ fiscal: r.usuario.fiscal, preenchidos: r.preenchidos, servico: r.servico, atividade: r.atividade, cnae: r.cnae });
  });
  // Reforma: NBS possíveis, cIndOp e cClassTrib sugeridos para um código de serviço (Anexo VIII)
  admin.get('/escritorio/rtc/:codigo', (req, res) => {
    const r = servicos.rtcDoServico(req.params.codigo);
    res.json({ nbs: (r && r.nbs) || [], indOp: servicos.indOpServico(req.params.codigo), cClassTribSugerido: (r && r.cClassTrib) || '000001' });
  });
  // Endereço da obra pelo CEP (para a tela de emissão)
  const respondeCep = async (req, res) => {
    const r = await obraUtil.buscaCep(req.params.cep);
    if (!r) return res.status(404).json({ erro: 'CEP não encontrado.' });
    res.json(r);
  };
  admin.get('/escritorio/cep/:cep', respondeCep);
  admin.get('/escritorio/servicos', (req, res) => res.json({ servicos: servicos.buscaServicos(String(req.query.q || '').slice(0, 80)) }));

  // ---- Clientes (tomadores) de cada empresa ----
  // Cadastro próprio + os que já receberam nota (entram como "das notas" até serem salvos)
  function clientesDa(u) {
    const salvos = db.lista('tomadores', (t) => t.usuarioId === u.id);
    const notasDa = minhasNotas(u).filter((n) => n.status !== 'rascunho' && !n.teste);
    const estat = {};
    for (const n of notasDa) {
      const d = n.tomador.cnpj || n.tomador.cpf;
      if (!d) continue;
      const e = estat[d] || (estat[d] = { quantidade: 0, total: 0, ultima: null, nome: n.tomador.nome, email: n.tomador.email || '', municipio: n.tomador.municipio || '', uf: n.tomador.uf || '', descricao: n.descricao, valor: n.valor });
      if (n.status !== 'erro' && n.status !== 'cancelada') { e.quantidade += 1; e.total += n.valor; }
      if (!e.ultima || n.enviadaEm > e.ultima) e.ultima = n.enviadaEm;
    }
    const lista = salvos.map((t) => ({ ...t, salvo: true, notas: estat[t.documento] || { quantidade: 0, total: 0, ultima: null } }));
    for (const [d, e] of Object.entries(estat)) {
      if (salvos.some((t) => t.documento === d)) continue;
      lista.push({ id: `nota-${d}`, documento: d, nome: e.nome, email: e.email, municipio: e.municipio, uf: e.uf, descricaoPadrao: e.descricao, valorPadrao: e.valor, salvo: false, notas: { quantidade: e.quantidade, total: e.total, ultima: e.ultima } });
    }
    return lista.sort((a, b) => (b.notas.ultima || '').localeCompare(a.notas.ultima || '') || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  }
  async function dadosCliente(body) {
    const documento = String(body.documento || '').replace(/\D/g, '');
    if (documento.length === 14 && !cnpjUtil.valido(documento)) return { erro: 'CNPJ inválido.' };
    if (documento.length !== 14 && documento.length !== 11) return { erro: 'Informe o CNPJ (14 dígitos) ou CPF (11 dígitos).' };
    let receita = null;
    if (documento.length === 14) receita = await buscaEmpresa(documento).catch(() => null);
    const nome = txt(body.nome, 160) || (receita && receita.razaoSocial) || '';
    if (!nome) return { erro: 'Informe o nome do cliente.' };
    const email = txt(body.email, 160);
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { erro: 'E-mail inválido.' };
    return {
      dados: {
        documento, nome, fantasia: txt(body.fantasia, 160) || (receita && receita.nomeFantasia) || '', email, telefone: txt(body.telefone, 20).replace(/\D/g, ''),
        municipio: (receita && receita.municipio) || txt(body.municipio, 80), uf: (receita && receita.uf) || txt(body.uf, 2).toUpperCase(),
        descricaoPadrao: txt(body.descricaoPadrao, 2000), valorPadrao: body.valorPadrao ? dinheiro(String(body.valorPadrao).replace(/\./g, '').replace(',', '.')) || 0 : 0, observacoes: txt(body.observacoes, 500),
      },
    };
  }
  admin.get('/escritorio/empresas/:id/clientes', (req, res) => { const u = empresaDe(req, res); if (u) res.json({ clientes: clientesDa(u) }); });
  admin.post('/escritorio/empresas/:id/clientes', express.json(), async (req, res) => {
    const u = empresaDe(req, res);
    if (!u) return;
    const r = await dadosCliente(req.body || {});
    if (r.erro) return res.status(400).json({ erro: r.erro });
    if (db.acha('tomadores', (t) => t.usuarioId === u.id && t.documento === r.dados.documento)) return res.status(409).json({ erro: 'Este cliente já está cadastrado nesta empresa.' });
    res.json({ cliente: db.insere('tomadores', { usuarioId: u.id, ...r.dados }) });
  });
  admin.put('/escritorio/empresas/:id/clientes/:cid', express.json(), async (req, res) => {
    const u = empresaDe(req, res);
    if (!u) return;
    const t = db.acha('tomadores', (x) => x.id === req.params.cid && x.usuarioId === u.id);
    if (!t) return res.status(404).json({ erro: 'Cliente não encontrado.' });
    const r = await dadosCliente({ ...req.body, documento: t.documento });
    if (r.erro) return res.status(400).json({ erro: r.erro });
    res.json({ cliente: db.atualiza('tomadores', t.id, r.dados) });
  });
  admin.delete('/escritorio/empresas/:id/clientes/:cid', (req, res) => {
    const u = empresaDe(req, res);
    if (!u) return;
    db.remove('tomadores', (x) => x.id === req.params.cid && x.usuarioId === u.id);
    res.json({ ok: true });
  });

  admin.post('/escritorio/empresas/:id/notas', express.json(), async (req, res) => {
    const u = empresaDe(req, res);
    if (!u) return;
    const r = await criaRascunho(u, { ...(req.body || {}), pedidoPor: 'escritorio' });
    // "Salvar este cliente": entra no cadastro de clientes da empresa
    if (r.nota && req.body && req.body.salvarCliente) {
      const t = r.nota.tomador;
      const documento = t.cnpj || t.cpf;
      if (!db.acha('tomadores', (x) => x.usuarioId === u.id && x.documento === documento)) {
        db.insere('tomadores', { usuarioId: u.id, documento, nome: t.nome, fantasia: '', email: t.email || '', telefone: '', municipio: t.municipio || '', uf: t.uf || '', descricaoPadrao: r.nota.descricao, valorPadrao: r.nota.valor, observacoes: '' });
      }
    }
    responde2(res, r);
  });
  const notaDaEmpresa = (req, res) => {
    const u = empresaDe(req, res);
    if (!u) return [];
    const n = db.acha('notas', (x) => x.id === req.params.nid && x.usuarioId === u.id);
    if (!n) { res.status(404).json({ erro: 'Nota não encontrada.' }); return []; }
    return [u, n];
  };
  admin.post('/escritorio/empresas/:id/notas/:nid/emitir', async (req, res) => {
    const [u, n] = notaDaEmpresa(req, res);
    if (!u) return;
    if (n.status !== 'rascunho') return res.status(409).json({ erro: 'Esta nota já foi enviada.' });
    res.json({ nota: await enviaNota(u, n) });
  });
  admin.delete('/escritorio/empresas/:id/notas/:nid', (req, res) => {
    const [u, n] = notaDaEmpresa(req, res);
    if (!u) return;
    if (n.status === 'rascunho') db.remove('notas', (x) => x.id === n.id);
    res.json({ ok: true });
  });
  admin.post('/escritorio/empresas/:id/notas/:nid/cancelar', express.json(), async (req, res) => {
    const [u, n] = notaDaEmpresa(req, res);
    if (u) responde2(res, await cancelaNota(u, n, req.body && req.body.justificativa));
  });

  // Nota de R$ 1,00 na produção restrita (homologação), com o certificado já conectado, para conferir a integração
  admin.post('/assinantes/:id/nota-teste', async (req, res) => {
    const u = empresaDe(req, res);
    if (!u) return;
    if (ambienteDe(u) !== 'homologacao') return res.status(409).json({ erro: 'Coloque a emissão automática desta empresa em "homologacao" antes de testar.' });
    if (!notas.configFiscalCompleta(u)) return res.status(409).json({ erro: 'Preencha os Dados da nota (município e código do serviço).' });
    if (!certificado.carrega(u.id)) return res.status(409).json({ erro: 'Conecte o certificado A1 desta empresa primeiro.' });
    const tomador = { cnpj: '43403653000124', nome: 'V&J ASSESSORIA ADMINISTRATIVA LTDA' };
    const n = db.insere('notas', { usuarioId: u.id, status: 'rascunho', tomador, descricao: 'Nota de teste da integração com a NFS-e Nacional (homologação, sem valor fiscal)', valor: 1, teste: true });
    res.json({ nota: await emiteNacional(u, n, new Date().toISOString()) });
  });
  admin.post('/assinantes/:id/certificado', express.json({ limit: '100kb' }), (req, res) => { const u = empresaDe(req, res); if (u) responde(res, conectaCert(u, req, 'contador')); });
  admin.get('/assinantes/:id/notas-capturadas', (req, res) => { const u = empresaDe(req, res); if (u) res.json(captura.notasDe(u.id)); });
  admin.post('/assinantes/:id/certificado/buscar', async (req, res) => { const u = empresaDe(req, res); if (u) responde(res, await buscaCert(u)); });
  admin.delete('/assinantes/:id/certificado', (req, res) => { const u = empresaDe(req, res); if (u) responde(res, desconectaCert(u)); });
  admin.delete('/empresas/:id', (req, res) => {
    const u = empresaDe(req, res);
    if (!u) return;
    if (!u.gerenciado) return res.status(400).json({ erro: 'Só dá para remover empresas cadastradas pela carteira (sem login próprio).' });
    desconectaCert(u);
    db.remove('usuarios', (x) => x.id === u.id);
    res.json({ ok: true });
  });

  // ---------- Apuração do DAS (Simples Nacional) ----------
  const nomeComp = (c) => `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+c.slice(5, 7) - 1]}/${c.slice(0, 4)}`;
  const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  async function garanteAbertura(u) {
    if (u.empresa && u.empresa.abertura) return u;
    try {
      const emp = await buscaEmpresa(u.cnpj);
      if (emp && emp.abertura) return db.atualiza('usuarios', u.id, { empresa: { ...(u.empresa || {}), abertura: emp.abertura, cnae: (u.empresa && u.empresa.cnae) || emp.cnae } });
    } catch { /* segue sem a data */ }
    return u;
  }
  const doSimples = (u) => u.cnpj && !auth.ehDono(u) && (u.gerenciado || !u.empresa || u.empresa.simples !== false) && !(u.empresa && u.empresa.mei);
  admin.get('/apuracoes', async (req, res) => {
    const empresas = [];
    const ver = naCarteira(req);
    for (let u of db.lista('usuarios', (x) => doSimples(x) && ver(x))) {
      u = await garanteAbertura(u);
      empresas.push({ id: u.id, nome: (u.empresa && u.empresa.razaoSocial) || u.nome, cnpj: u.cnpj, abertura: u.empresa && u.empresa.abertura, anexos: apuracao.anexosDa(u), meses: apuracao.painel(u, { quantas: 4 }) });
    }
    res.json({ empresas, integra: false });
  });
  const alvoApu = (req, res) => {
    const u = db.acha('usuarios', (x) => x.id === req.params.id);
    if (!u) { res.status(404).json({ erro: 'Empresa não encontrada.' }); return null; }
    if (!/^\d{4}-\d{2}$/.test(req.params.comp)) { res.status(400).json({ erro: 'Competência inválida.' }); return null; }
    return u;
  };
  const linhaDe = (u, comp) => apuracao.painel(u, { quantas: 60 }).find((l) => l.competencia === comp);
  admin.post('/apuracoes/:id/:comp/ajuste', express.json(), (req, res) => {
    const u = alvoApu(req, res);
    if (!u) return;
    const reg = apuracao.registro(u, req.params.comp);
    if (!['calculada', 'aprovada'].includes(reg.status)) return res.status(409).json({ erro: 'O DAS desta competência já foi gerado. Para mudar, registre a retificação no PGDAS-D.' });
    const num = (v) => (v === '' || v == null ? undefined : Math.max(0, Number(String(v).replace(/\./g, '').replace(',', '.')) || 0));
    const ajuste = {};
    if (num(req.body.rbt12) !== undefined) ajuste.rbt12 = num(req.body.rbt12);
    const extra = {};
    for (const t of ['servicos', 'mercadorias', 'transporte']) if (num((req.body.extra || {})[t])) extra[t] = num(req.body.extra[t]);
    if (Object.keys(extra).length) ajuste.extra = extra;
    const anexos = {};
    for (const [t, a] of Object.entries(req.body.anexos || {})) if (['servicos', 'mercadorias', 'transporte'].includes(t) && ['I', 'II', 'III', 'IV', 'V'].includes(a)) anexos[t] = a;
    if (Object.keys(anexos).length) ajuste.anexos = anexos;
    db.atualiza('apuracoes', reg.id, { ajuste, status: 'calculada', aprovado: null });
    res.json({ linha: linhaDe(u, req.params.comp) });
  });
  admin.post('/apuracoes/:id/:comp/aprovar', (req, res) => {
    const u = alvoApu(req, res);
    if (!u) return;
    const reg = apuracao.registro(u, req.params.comp);
    if (reg.status !== 'calculada') return res.status(409).json({ erro: 'Esta competência já foi aprovada.' });
    const calc = apuracao.calcula(u, req.params.comp, apuracao.receitas(u), reg.ajuste || {});
    db.atualiza('apuracoes', reg.id, { status: 'aprovada', aprovado: calc, aprovadoEm: new Date().toISOString() });
    res.json({ linha: linhaDe(u, req.params.comp) });
  });
  // ---- Integra Contador: puxa a guia do DAS direto da Receita ----
  admin.get('/escritorio/integra', (req, res) => res.json(integra.situacao()));
  admin.post('/escritorio/integra/certificado', express.json({ limit: '100kb' }), (req, res) => {
    try {
      const pfx = Buffer.from(String(req.body.pfx || ''), 'base64');
      const info = certificado.le(pfx, String(req.body.senha || ''));
      const cnpj = String(process.env.INTEGRA_CNPJ || '24961340000147');
      if (!info.cnpj || info.cnpj.slice(0, 8) !== cnpj.slice(0, 8)) return res.status(400).json({ erro: `Este certificado é do CNPJ ${info.cnpj || '(sem CNPJ)'}; o contratante do Integra Contador é ${cnpj}.` });
      if (Date.parse(info.validoAte) < Date.now()) return res.status(400).json({ erro: 'Este certificado está vencido.' });
      certificado.guarda(integra.ID_CERT, pfx, String(req.body.senha || ''));
      res.json({ ...integra.situacao(), titular: info.titular, validoAte: info.validoAte });
    } catch (err) { res.status(400).json({ erro: err.message }); }
  });
  // e-CPF do procurador (quem tem procuração das empresas no e-CAC): assina o termo e libera o acesso
  // às empresas que não deram procuração ao CNPJ do escritório
  admin.post('/escritorio/integra/procurador', soGestor, express.json({ limit: '100kb' }), async (req, res) => {
    let info;
    const pfx = Buffer.from(String(req.body.pfx || ''), 'base64');
    const senha = String(req.body.senha || '');
    try { info = certificado.le(pfx, senha); } catch (err) { return res.status(400).json({ erro: err.message }); }
    if (!/^\d{11}$/.test(info.cpf || '')) return res.status(400).json({ erro: 'Este não é um e-CPF. Envie o certificado A1 (.pfx) da pessoa que tem as procurações.' });
    if (Date.parse(info.validoAte) < Date.now()) return res.status(400).json({ erro: 'Este certificado está vencido.' });
    certificado.guarda(integra.ID_PROC, pfx, senha);
    let teste = null;
    if (integra.situacao().ativo) {
      try { const t = await integra.tokenProcurador({ forcar: true }); teste = { ok: true, expira: t.expiraIso }; } catch (err) { teste = { ok: false, erro: err.message }; }
    }
    res.json({ ...integra.situacao(), teste });
  });
  admin.delete('/escritorio/integra/procurador', soGestor, (req, res) => {
    certificado.apaga(integra.ID_PROC);
    res.json(integra.situacao());
  });
  // Puxar guia: gera o DAS na Receita (vencido: já com multa e juros até hoje), guarda o PDF e manda ao cliente
  admin.post('/apuracoes/:id/:comp/puxar', async (req, res) => {
    const u = alvoApu(req, res);
    if (!u) return;
    if (!integra.situacao().ativo) return res.status(409).json({ erro: 'O Integra Contador ainda não está ligado: faltam as chaves do SERPRO e o e-CNPJ do escritório.' });
    let reg = apuracao.registro(u, req.params.comp);
    if (['paga', 'entregue'].includes(reg.status)) return res.status(409).json({ erro: 'Esta competência já foi concluída.' });
    const vencOriginal = (reg.aprovado && reg.aprovado.vencimento) || apuracao.calcula(u, req.params.comp, apuracao.receitas(u), reg.ajuste || {}).vencimento;
    const hojeBr = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    let g;
    try { g = await integra.geraDas(u.cnpj, req.params.comp, { vencido: vencOriginal < hojeBr }); } catch (err) { return res.status(502).json({ erro: err.message }); }
    if (reg.status === 'calculada') reg = db.atualiza('apuracoes', reg.id, { status: 'aprovada', aprovado: apuracao.calcula(u, req.params.comp, apuracao.receitas(u), reg.ajuste || {}), aprovadoEm: new Date().toISOString() });
    const tokenDas = (reg.das && reg.das.token) || crypto.randomBytes(12).toString('base64url');
    fs.mkdirSync(path.join(DADOS_DIR, 'das'), { recursive: true });
    fs.writeFileSync(path.join(DADOS_DIR, 'das', `${tokenDas}.pdf`), g.pdf);
    const das = { pdf: `${site}/das/${tokenDas}`, token: tokenDas, linhaDigitavel: '', valor: g.valor || (reg.aprovado && reg.aprovado.valor) || 0, vencimento: g.pagarAte || g.vencimento || vencOriginal, principal: g.principal, multa: g.multa, juros: g.juros, numeroDocumento: g.numeroDocumento, origem: 'integra', em: new Date().toISOString() };
    db.atualiza('apuracoes', reg.id, { status: 'das_disponivel', das });
    const alerta = { em: new Date().toISOString(), texto: `Seu DAS de ${nomeComp(req.params.comp)} está disponível: ${brl(das.valor)}${g.multa || g.juros ? ' (com multa e juros)' : ''}, pague até ${das.vencimento.split('-').reverse().join('/')}. Veja em Minha empresa › Seu DAS.` };
    db.atualiza('usuarios', u.id, { alertas: [alerta, ...(u.alertas || [])].slice(0, 30) });
    // E-mail ao cliente com a guia anexa (quando o e-mail estiver configurado)
    let envio = { ok: false, erro: 'e-mail não configurado' };
    if (canais.emailAtivo() && u.email) {
      envio = await canais.enviaEmail({ para: u.email, assunto: `DAS ${nomeComp(req.params.comp)} · ${brl(das.valor)} · pague até ${das.vencimento.split('-').reverse().join('/')}`, html: `<p>Segue a guia do DAS de <b>${nomeComp(req.params.comp)}</b> de ${(u.empresa && u.empresa.razaoSocial) || u.nome}.</p><p><b>Valor:</b> ${brl(das.valor)}${g.multa || g.juros ? ` (principal ${brl(g.principal)} + multa ${brl(g.multa)} + juros ${brl(g.juros)})` : ''}<br><b>Pagar até:</b> ${das.vencimento.split('-').reverse().join('/')}</p><p><a href="${das.pdf}">Abrir a guia (PDF)</a></p>`, anexos: [{ nome: `DAS ${req.params.comp}.pdf`, conteudo: g.pdf }] }).catch((err) => ({ ok: false, erro: err.message }));
    }
    // WhatsApp do cliente com a guia anexa (quando o WhatsApp estiver configurado)
    const whats = await avisos.guia(u, { descricao: `DAS ${nomeComp(req.params.comp)}`, valor: das.valor, vencimento: das.vencimento, link: das.pdf, chave: `das-${u.id}-${req.params.comp}-${das.vencimento}` });
    res.json({ linha: linhaDe(u, req.params.comp), das, envio, whatsapp: whats, telefone: u.telefone || '' });
  });

  // Conferir com a Receita: o que foi declarado no PGDAS-D x o faturamento das notas
  // 1 consulta por ano (declarou? DAS pago?) + 1 por mês declarado (valores lidos do PDF da declaração)
  // Movimento de todas as empresas do Simples: uma consulta por ano (CONSDECLARACAO13) diz se o
  // mês foi declarado e se gerou DAS. Declarado sem DAS = sem movimento; com DAS = com movimento.
  admin.post('/escritorio/movimento', async (req, res) => {
    if (!integra.situacao().ativo) return res.status(409).json({ erro: 'O Integra Contador ainda não está ligado.' });
    const qtd = Math.min(24, Math.max(1, Number(req.query.meses) || 12));
    const atual = new Date().toISOString().slice(0, 7);
    const comps = [];
    for (let i = 1; i <= qtd; i++) { const d = new Date(Date.UTC(+atual.slice(0, 4), +atual.slice(5, 7) - 1 - i, 1)); comps.push(d.toISOString().slice(0, 7)); }
    const anos = [...new Set(comps.map((c) => c.slice(0, 4)))];
    const ver = naCarteira(req);
    const empresas = [];
    let consultas = 0;
    for (const u of db.lista('usuarios', (x) => doSimples(x) && ver(x))) {
      const abertura = String((u.empresa && u.empresa.abertura) || '').slice(0, 7);
      const linha = { id: u.id, nome: (u.empresa && u.empresa.razaoSocial) || u.nome, cnpj: u.cnpj, meses: [] };
      try {
        const porMes = {};
        for (const ano of anos) { consultas++; Object.assign(porMes, await integra.declaracoesDoAno(u.cnpj, ano)); }
        for (const c of comps) {
          const p = porMes[c];
          const antesAbertura = abertura && c < abertura;
          const situacao = antesAbertura ? 'antes_abertura' : !p || !p.declarada ? 'nao_declarada' : p.das.length ? 'com_movimento' : 'sem_movimento';
          linha.meses.push({ competencia: c, situacao, retificada: !!(p && p.retificada), das: p ? p.das.length : 0, dasPago: !!(p && p.dasPago) });
          // Grava o que a Receita disse, para o calendário de obrigações mostrar certo
          if (situacao !== 'antes_abertura') {
            const reg = apuracao.registro(u, c);
            const conferencia = { ...(reg.conferencia || {}), em: new Date().toISOString(), declarada: situacao !== 'nao_declarada', dasPago: !!(p && p.dasPago), situacao: situacao === 'nao_declarada' ? 'sem_declaracao' : situacao === 'sem_movimento' ? 'ok' : (reg.conferencia && reg.conferencia.situacao) || 'sem_leitura', ...(situacao === 'sem_movimento' ? { receitaDeclarada: 0 } : {}) };
            const patch = { conferencia };
            if (p && p.dasPago && reg.status !== 'paga') patch.status = 'paga';
            else if (situacao === 'sem_movimento' && ['calculada', 'aprovada'].includes(reg.status)) patch.status = 'entregue';
            db.atualiza('apuracoes', reg.id, patch);
          }
        }
      } catch (err) { linha.erro = err.message; }
      empresas.push(linha);
    }
    res.json({ competencias: comps, empresas: empresas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), consultas });
  });

  // Opção pelo regime de apuração do ano (exigida antes de entregar o PGDAS-D do ano, MSG_ISN_013)
  admin.post('/escritorio/empresas/:id/regime', express.json(), async (req, res) => {
    const u = empresaDe(req, res);
    if (!u) return;
    if (!integra.situacao().ativo) return res.status(409).json({ erro: 'O Integra Contador ainda não está ligado.' });
    const ano = Number(req.body.ano);
    if (!(ano >= 2018 && ano <= 2100)) return res.status(400).json({ erro: 'Informe o ano da opção.' });
    const regime = req.body.regime === 'CAIXA' ? 'CAIXA' : 'COMPETENCIA';
    try {
      const r = await integra.opcaoRegime(u.cnpj, ano, regime);
      const regimes = { ...((u.fiscal && u.fiscal.regimes) || {}), [ano]: r.regime };
      db.atualiza('usuarios', u.id, { fiscal: { ...(u.fiscal || {}), regimes } });
      res.json({ regime: r.regime, ano, jaFeita: !!r.jaFeita, mensagens: r.mensagens });
    } catch (err) { res.status(502).json({ erro: `A Receita não aceitou a opção: ${err.message}` }); }
  });

  // DEFIS do ano para empresa sem movimento (o CPF dos sócios vai só para a Receita, não fica guardado)
  admin.post('/escritorio/empresas/:id/defis', express.json(), async (req, res) => {
    const u = empresaDe(req, res);
    if (!u) return;
    if (!integra.situacao().ativo) return res.status(409).json({ erro: 'O Integra Contador ainda não está ligado.' });
    const ano = Number(req.body.ano);
    if (!(ano >= 2018 && ano < new Date().getFullYear() + 1)) return res.status(400).json({ erro: 'Informe o ano-calendário da DEFIS.' });
    try {
      const r = await integra.entregaDefis(u.cnpj, ano, { socios: Array.isArray(req.body.socios) ? req.body.socios : [], saldoCaixaInicial: req.body.saldoCaixaInicial, saldoCaixaFinal: req.body.saldoCaixaFinal });
      fs.mkdirSync(path.join(DADOS_DIR, 'das'), { recursive: true });
      const guarda = (buf) => { if (!buf) return ''; const t = crypto.randomBytes(12).toString('base64url'); fs.writeFileSync(path.join(DADOS_DIR, 'das', `${t}.pdf`), buf); return `${site}/das/${t}`; };
      const info = { idDefis: r.idDefis, em: new Date().toISOString(), declaracao: guarda(r.declaracao), recibo: guarda(r.recibo), mensagens: r.mensagens };
      db.atualiza('usuarios', u.id, { fiscal: { ...(u.fiscal || {}), defis: { ...((u.fiscal && u.fiscal.defis) || {}), [ano]: info } } });
      res.json({ defis: info });
    } catch (err) { res.status(502).json({ erro: `A Receita não aceitou a DEFIS: ${err.message}` }); }
  });

  // ---------- Situação fiscal (SITFIS) ----------
  const guardaPdf = (buf) => { if (!buf) return ''; fs.mkdirSync(path.join(DADOS_DIR, 'das'), { recursive: true }); const t = crypto.randomBytes(12).toString('base64url'); fs.writeFileSync(path.join(DADOS_DIR, 'das', `${t}.pdf`), buf); return `${site}/das/${t}`; };
  const semProcuracao = (msg) => /AcessoNegado|procura[cç][aã]o|n[aã]o tem pr/i.test(String(msg || ''));
  async function atualizaSituacao(u) {
    try {
      const r = await integra.situacaoFiscal(u.cnpj);
      const sf = { em: new Date().toISOString(), regular: r.regular, pendencias: r.pendencias, pdf: guardaPdf(r.pdf) };
      db.atualiza('usuarios', u.id, { situacaoFiscal: sf });
      return sf;
    } catch (err) {
      const sf = { em: new Date().toISOString(), erro: semProcuracao(err.message) ? 'Sem procuração para a VIMARI no e-CAC.' : err.message, semProcuracao: semProcuracao(err.message) };
      db.atualiza('usuarios', u.id, { situacaoFiscal: { ...(u.situacaoFiscal || {}), ...sf } });
      return sf;
    }
  }
  admin.post('/escritorio/empresas/:id/situacao', async (req, res) => {
    const u = empresaDe(req, res);
    if (!u) return;
    if (!integra.situacao().ativo) return res.status(409).json({ erro: 'O Integra Contador ainda não está ligado.' });
    res.json({ situacaoFiscal: await atualizaSituacao(u) });
  });

  // ---------- Parcelamentos (PARCSN / PARCMEI) ----------
  async function atualizaParcelamento(u) {
    const mei = !!(u.empresa && u.empresa.mei);
    const r = await integra.parcelamentos(u.cnpj, { mei });
    const ativo = r.pedidos.some((x) => /deferido|ativo|em parcelamento|consolidado/i.test(x.situacao)) && r.parcelas.length > 0;
    const p = { ...(u.parcelamento || {}), em: new Date().toISOString(), modalidade: r.modalidade, pedidos: r.pedidos, parcelas: r.parcelas, ativo, guias: (u.parcelamento && u.parcelamento.guias) || {} };
    db.atualiza('usuarios', u.id, { parcelamento: p });
    return p;
  }
  async function geraGuiaParcela(u, parcela) {
    const mei = !!(u.empresa && u.empresa.mei);
    const pdf = await integra.dasParcela(u.cnpj, parcela, { mei });
    const atual = db.acha('usuarios', (x) => x.id === u.id);
    const p = atual.parcelamento || { guias: {} };
    const info = (p.parcelas || []).find((x) => x.parcela === parcela);
    const [a, m] = parcela.split('-').map(Number);
    const venc = obrigacoes.daEmpresa({ ...atual, parcelamento: { ...p, ativo: true } }, { de: parcela, ate: parcela }).find((x) => x.chave === 'parcela-parcelamento');
    const guia = { pdf: guardaPdf(pdf), valor: info ? info.valor : null, vencimento: venc ? venc.data : `${a}-${String(m).padStart(2, '0')}-28`, em: new Date().toISOString() };
    db.atualiza('usuarios', u.id, { parcelamento: { ...p, guias: { ...(p.guias || {}), [parcela]: guia } } });
    const whatsapp = await avisos.guia(atual, { descricao: `parcela ${parcela.split('-').reverse().join('/')} do parcelamento`, valor: guia.valor, vencimento: guia.vencimento, link: guia.pdf, chave: `parc-${u.id}-${parcela}` });
    return { guia, whatsapp };
  }
  admin.get('/escritorio/empresas/:id/parcelamentos', async (req, res) => {
    const u = empresaDe(req, res);
    if (!u) return;
    if (req.query.atualizar !== '1' && u.parcelamento) return res.json({ parcelamento: u.parcelamento });
    if (!integra.situacao().ativo) return res.status(409).json({ erro: 'O Integra Contador ainda não está ligado.' });
    try { res.json({ parcelamento: await atualizaParcelamento(u) }); } catch (err) { res.status(502).json({ erro: semProcuracao(err.message) ? 'Sem procuração para a VIMARI no e-CAC.' : err.message }); }
  });
  admin.post('/escritorio/empresas/:id/parcelamentos/:parcela/das', async (req, res) => {
    const u = empresaDe(req, res);
    if (!u) return;
    if (!/^\d{4}-\d{2}$/.test(req.params.parcela)) return res.status(400).json({ erro: 'Parcela inválida (AAAA-MM).' });
    if (!integra.situacao().ativo) return res.status(409).json({ erro: 'O Integra Contador ainda não está ligado.' });
    try { res.json(await geraGuiaParcela(u, req.params.parcela)); } catch (err) { res.status(502).json({ erro: err.message }); }
  });

  // ---------- Calendário de obrigações ----------
  const janela = (q) => {
    const hoje = new Date().toISOString().slice(0, 7);
    const mes = (n) => { const d = new Date(Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 7); };
    return { de: /^\d{4}-\d{2}$/.test(q.de || '') ? q.de : mes(-2), ate: /^\d{4}-\d{2}$/.test(q.ate || '') ? q.ate : mes(1) };
  };
  admin.get('/escritorio/obrigacoes', (req, res) => {
    const j = janela(req.query);
    const ver = naCarteira(req);
    const itens = [];
    for (const u of empresasEscritorio().filter(ver)) {
      const nome = (u.empresa && u.empresa.razaoSocial) || u.nome;
      for (const it of obrigacoes.daEmpresa(u, j)) itens.push({ ...it, empresa: nome });
    }
    itens.sort((a, b) => a.data.localeCompare(b.data) || a.empresa.localeCompare(b.empresa, 'pt-BR'));
    const conta = (s) => itens.filter((x) => x.status === s).length;
    const empresas = [...new Map(itens.map((x) => [x.empresaId, { id: x.empresaId, nome: x.empresa }])).values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    res.json({ ...j, itens, empresas, tipos: obrigacoes.TIPOS, resumo: { atrasadas: conta('atrasada'), pendentes: conta('pendente'), guias: conta('guia'), ok: conta('ok'), conferir: conta('conferir') } });
  });
  admin.get('/escritorio/empresas/:id/obrigacoes', (req, res) => {
    const u = empresaDe(req, res);
    if (!u) return;
    // Certidões: o pedido em aberto e a mais recente de cada tipo já emitida
    const pedidos = db.lista('certidoes', (x) => x.empresaId === u.id).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
    const ultimas = {};
    for (const p of pedidos) for (const [k, v] of Object.entries(p.itens || {})) if (!ultimas[k] && ['emitida', 'positiva'].includes(v.status)) ultimas[k] = v;
    res.json({ itens: obrigacoes.daEmpresa(u, janela(req.query)), situacaoFiscal: u.situacaoFiscal || null, parcelamento: u.parcelamento || null, certidoes: { pedido: pedidos.find((x) => x.status !== 'concluido') || null, ultimas } });
  });
  admin.post('/escritorio/empresas/:id/obrigacoes', express.json(), (req, res) => {
    const u = empresaDe(req, res);
    if (!u) return;
    const chave = txt(req.body.chave, 60);
    const ref = txt(req.body.ref, 7);
    if (!chave || !/^\d{4}-\d{2}$/.test(ref)) return res.status(400).json({ erro: 'Obrigação inválida.' });
    obrigacoes.marca(u, chave, ref, req.body.feito !== false);
    res.json({ ok: true });
  });

  // ---------- Vendas: NF-e e NFC-e pela Focus ----------
  const ambVendas = (u) => (u.fiscal && u.fiscal.vendasAmbiente === 'producao' ? 'producao' : 'homologacao');
  const simplesOuMei = (u) => !!(u.empresa && (u.empresa.mei || u.empresa.simples !== false));
  const prodPublico = (p) => ({ id: p.id, codigo: p.codigo, descricao: p.descricao, ncm: p.ncm, unidade: p.unidade, valor: p.valor, cfop: p.cfop, csosn: p.csosn, origem: p.origem, pisCst: p.pisCst, conferir: !!p.conferir });
  function validaProduto(b) {
    const p = {
      codigo: txt(b.codigo, 60), descricao: txt(b.descricao, 120), ncm: String(b.ncm || '').replace(/\D/g, ''), unidade: txt(b.unidade || 'UN', 6).toUpperCase(),
      valor: dinheiro(String(b.valor || '').replace(/\./g, '').replace(',', '.')), cfop: String(b.cfop || '5102').replace(/\D/g, ''), csosn: String(b.csosn || '102').replace(/\D/g, ''),
      origem: Number(b.origem || 0), pisCst: String(b.pisCst || '49').replace(/\D/g, ''),
    };
    if (!p.descricao) return { erro: 'Informe a descrição do produto.' };
    if (p.ncm.length !== 8) return { erro: 'O NCM tem 8 dígitos (ex.: 8714.10.00).' };
    if (!/^[1-7]\d{3}$/.test(p.cfop)) return { erro: 'CFOP inválido (ex.: 5102 venda, 5405 venda com ST).' };
    if (!/^\d{3}$/.test(p.csosn)) return { erro: 'CSOSN tem 3 dígitos (102 sem ST, 500 com ST já recolhida).' };
    if (!(p.origem >= 0 && p.origem <= 8)) return { erro: 'Origem da mercadoria vai de 0 a 8.' };
    return { produto: p };
  }
  async function atualizaVendasProcessando(u) {
    for (const v of db.lista('vendas', (x) => x.usuarioId === u.id && x.status === 'processando')) {
      try { db.atualiza('vendas', v.id, await vendas.consulta(v, v.ambiente, u)); } catch (err) { console.warn('[vendas] consulta', v.id, err.message); }
    }
  }
  admin.get('/escritorio/empresas/:id/vendas', async (req, res) => {
    const u = empresaDe(req, res);
    if (!u) return;
    if (vendas.ativo()) await atualizaVendasProcessando(u);
    res.json({
      config: { focus: vendas.ativo(), ambiente: ambVendas(u), simples: simplesOuMei(u), uf: (u.empresa && u.empresa.uf) || '', empresaFocus: focusPublico(u) },
      produtos: db.lista('produtos', (p) => p.usuarioId === u.id).sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR')).map(prodPublico),
      vendas: db.lista('vendas', (v) => v.usuarioId === u.id).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)).slice(0, 60),
    });
  });
  // ---- Cupom fiscal: empresas prontas para emitir e cadastro na Focus ----
  const focusPublico = (u) => {
    const f = (u.fiscal && u.fiscal.focus) || null;
    return f ? { configurada: true, ie: f.ie || '', producao: !!f.cscProducao, homologacao: !!f.cscHomologacao, idTokenProducao: f.idTokenProducao || '', idTokenHomologacao: f.idTokenHomologacao || '', certificadoValidoAte: f.certificadoValidoAte || '', em: f.em, por: f.por || '' } : { configurada: false };
  };
  admin.get('/escritorio/cupom', (req, res) => {
    const ver = naCarteira(req);
    const mes = new Date().toISOString().slice(0, 7);
    const empresas = empresasEscritorio().filter(ver).map((u) => {
      const doMes = db.lista('vendas', (v) => v.usuarioId === u.id && v.status === 'emitida' && v.ambiente === 'producao' && (v.criadoEm || '').startsWith(mes));
      return {
        id: u.id, nome: (u.empresa && u.empresa.razaoSocial) || u.nome, cnpj: u.cnpj, uf: (u.empresa && u.empresa.uf) || '', simples: simplesOuMei(u),
        certificado: !!(u.certificado && u.certificado.ativo), ambiente: ambVendas(u), focus: focusPublico(u),
        mes: { quantidade: doMes.length, total: Math.round(doMes.reduce((t, v) => t + v.total, 0) * 100) / 100 },
      };
    }).sort((a, b) => Number(b.focus.configurada) - Number(a.focus.configurada) || a.nome.localeCompare(b.nome, 'pt-BR'));
    res.json({ focus: vendas.ativo(), empresas });
  });
  admin.post('/escritorio/empresas/:id/focus', express.json(), async (req, res) => {
    const u = empresaDe(req, res);
    if (!u) return;
    if (!vendas.ativo()) return res.status(409).json({ erro: 'Falta o token master da Focus NFe no Railway (FOCUS_NFE_TOKEN).' });
    if (!simplesOuMei(u)) return res.status(409).json({ erro: 'Nesta versão o cupom fiscal é para empresas do Simples Nacional e MEI.' });
    const b = req.body || {};
    const antes = (u.fiscal && u.fiscal.focus) || {};
    const so = (v) => String(v || '').replace(/\D/g, '');
    const dados = {
      ie: so(b.ie) || antes.ie || '',
      cscProducao: txt(b.cscProducao, 60), idTokenProducao: so(b.idTokenProducao) || antes.idTokenProducao || '',
      cscHomologacao: txt(b.cscHomologacao, 60), idTokenHomologacao: so(b.idTokenHomologacao) || antes.idTokenHomologacao || '',
    };
    if (!dados.ie) return res.status(400).json({ erro: 'Informe a inscrição estadual da empresa.' });
    if (dados.cscProducao && !dados.idTokenProducao) return res.status(400).json({ erro: 'Informe o ID do token (CSC) de produção.' });
    if (dados.cscHomologacao && !dados.idTokenHomologacao) return res.status(400).json({ erro: 'Informe o ID do token (CSC) de homologação.' });
    let cert = null;
    if (b.enviarCertificado) {
      cert = certificado.carrega(u.id);
      if (!cert) return res.status(409).json({ erro: 'Esta empresa não tem certificado A1 conectado no painel. Conecte em Configurações ou desmarque o envio.' });
    } else if (!antes.id) return res.status(400).json({ erro: 'Na primeira configuração o certificado A1 vai para a Focus (ela assina os cupons).' });
    try {
      const r = await vendas.cadastraEmpresa(u, dados, cert);
      const tokens = { ...(antes.tokens || {}) };
      if (r.tokenProducao) tokens.producao = certificado.sela(r.tokenProducao);
      if (r.tokenHomologacao) tokens.homologacao = certificado.sela(r.tokenHomologacao);
      const focus = {
        id: r.id, ie: dados.ie, idTokenProducao: dados.idTokenProducao, idTokenHomologacao: dados.idTokenHomologacao,
        cscProducao: !!(dados.cscProducao || antes.cscProducao), cscHomologacao: !!(dados.cscHomologacao || antes.cscHomologacao),
        certificadoValidoAte: r.certificadoValidoAte || antes.certificadoValidoAte || '', tokens,
        em: new Date().toISOString(), por: req.acesso && req.acesso.usuario ? req.acesso.usuario.nome : 'Escritório',
      };
      const nu = db.atualiza('usuarios', u.id, { fiscal: { ...(u.fiscal || {}), focus } });
      res.json({ focus: focusPublico(nu) });
    } catch (err) { res.status(400).json({ erro: `A Focus recusou: ${err.message}` }); }
  });
  // Ambiente da emissão de vendas: homologação (teste, sem valor fiscal) ou produção
  admin.post('/escritorio/empresas/:id/vendas/ambiente', express.json(), (req, res) => {
    const u = empresaDe(req, res);
    if (!u) return;
    const amb = req.body.ambiente === 'producao' ? 'producao' : 'homologacao';
    db.atualiza('usuarios', u.id, { fiscal: { ...(u.fiscal || {}), vendasAmbiente: amb } });
    res.json({ ambiente: amb });
  });
  admin.post('/escritorio/empresas/:id/produtos', express.json(), (req, res) => {
    const u = empresaDe(req, res);
    if (!u) return;
    const r = validaProduto(req.body || {});
    if (r.erro) return res.status(400).json({ erro: r.erro });
    res.json({ produto: prodPublico(db.insere('produtos', { usuarioId: u.id, ...r.produto })) });
  });
  admin.put('/escritorio/empresas/:id/produtos/:pid', express.json(), (req, res) => {
    const u = empresaDe(req, res);
    if (!u) return;
    const p = db.acha('produtos', (x) => x.id === req.params.pid && x.usuarioId === u.id);
    if (!p) return res.status(404).json({ erro: 'Produto não encontrado.' });
    const r = validaProduto(req.body || {});
    if (r.erro) return res.status(400).json({ erro: r.erro });
    res.json({ produto: prodPublico(db.atualiza('produtos', p.id, { ...r.produto, conferir: false })) });
  });
  admin.delete('/escritorio/empresas/:id/produtos/:pid', (req, res) => {
    const u = empresaDe(req, res);
    if (!u) return;
    db.remove('produtos', (x) => x.id === req.params.pid && x.usuarioId === u.id);
    res.json({ ok: true });
  });
  // Emissão de venda (painel do escritório e Área do Cliente). Item: { produtoId } de produto cadastrado
  // ou { descricao, ncm } de produto novo (é cadastrado na hora com a sugestão fiscal e fica "conferir").
  // Devolve { venda } ou { status, erro }.
  async function emiteVenda(u, body, quem, { espera = true } = {}) {
    if (!vendas.ativo()) return { status: 409, erro: 'A emissão de NF-e/NFC-e ainda não está ligada: falta o token da Focus NFe no Railway.' };
    if (!simplesOuMei(u)) return { status: 409, erro: 'Nesta primeira versão a emissão de NF-e/NFC-e é para empresas do Simples Nacional e MEI.' };
    // Remessa para conserto: NF-e com os itens copiados da NF de compra (não entram no cadastro de produtos)
    const remessa = body.operacao === 'conserto';
    const modelo = remessa || body.modelo === 'nfe' ? 'nfe' : 'nfce';
    const itensPedido = Array.isArray(body.itens) ? body.itens.slice(0, 100) : [];
    const itens = [];
    const so = (v) => String(v || '').replace(/\D/g, '');
    const numBr = (v) => Number(String(v ?? '').trim().replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
    let extrasRemessa = {};
    if (remessa) {
      const chave = so(body.referenciada);
      if (chave.length !== 44) return { status: 400, erro: 'Informe a chave de acesso da NF de compra (44 números).' };
      if (so(body.destinatario && body.destinatario.documento).length !== 14 || !so(body.destinatario && body.destinatario.ie)) return { status: 400, erro: 'Na remessa para conserto informe o CNPJ e a inscrição estadual de quem vendeu (o mesmo da NF de compra).' };
      const t = body.transporte || {};
      const v = t.volumes || {};
      const modalidade = ['0', '1', '2', '3', '4', '9'].includes(String(t.modalidade ?? '9')) ? String(t.modalidade ?? '9') : '9';
      extrasRemessa = {
        operacao: 'conserto', referenciada: chave,
        transporte: {
          modalidade, cnpj: so(t.cnpj), nome: txt(t.nome, 60), ie: so(t.ie), endereco: txt(t.endereco, 60), municipio: txt(t.municipio, 60), uf: txt(t.uf, 2).toUpperCase(),
          volumes: { quantidade: Math.max(0, Math.round(numBr(v.quantidade) || 0)), especie: txt(v.especie, 60), marca: txt(v.marca, 60), numeracao: txt(v.numeracao, 60), pesoBruto: numBr(v.pesoBruto) || 0, pesoLiquido: numBr(v.pesoLiquido) || 0 },
        },
        informacoes: txt(body.informacoes, 2000),
      };
      for (const it of itensPedido) {
        const ncm = so(it.ncm);
        const q = numBr(it.quantidade || '1');
        const valor = dinheiro(numBr(it.valor));
        if (!txt(it.descricao, 120)) return { status: 400, erro: 'Cada item precisa da descrição igual à da NF de compra.' };
        if (ncm.length !== 8) return { status: 400, erro: `NCM de "${txt(it.descricao, 60)}" precisa ter 8 números.` };
        if (!(q > 0) || !(valor > 0)) return { status: 400, erro: `Informe a quantidade e o valor unitário de "${txt(it.descricao, 60)}" (igual ao da NF de compra).` };
        itens.push({ codigo: txt(it.codigo, 60), descricao: txt(it.descricao, 120), ncm, unidade: txt(it.unidade || 'UN', 6).toUpperCase(), quantidade: q, valor, cfop: '5915', csosn: '400', pisCst: '49', origem: Number(it.origem || 0) });
      }
    }
    for (const it of remessa ? [] : itensPedido) {
      let p = it.produtoId ? db.acha('produtos', (x) => x.id === it.produtoId && x.usuarioId === u.id) : null;
      if (!p && it.descricao) {
        const ncmNovo = String(it.ncm || '').replace(/\D/g, '');
        if (ncmNovo.length !== 8) return { status: 400, erro: `Escolha o tipo (NCM) de "${txt(it.descricao, 60)}".` };
        p = db.acha('produtos', (x) => x.usuarioId === u.id && ncmUtil.semAcento(x.descricao) === ncmUtil.semAcento(txt(it.descricao, 120)))
          || db.insere('produtos', { usuarioId: u.id, descricao: txt(it.descricao, 120), ncm: ncmNovo, ...ncmUtil.sugestaoFiscal(ncmNovo, { uf: (u.empresa && u.empresa.uf) || 'SP' }), valor: 0, conferir: true, criadoPor: quem });
      }
      const q = Number(String(it.quantidade || '1').replace(',', '.'));
      if (!p || !(q > 0)) return { status: 400, erro: 'Item inválido: escolha o produto e a quantidade.' };
      const valor = it.valor !== undefined && it.valor !== '' ? dinheiro(String(it.valor).replace(/\./g, '').replace(',', '.')) : p.valor;
      if (!(valor > 0)) return { status: 400, erro: `Informe o preço de ${p.descricao}.` };
      if (!p.valor) db.atualiza('produtos', p.id, { valor }); // guarda o primeiro preço usado
      itens.push({ ...prodPublico(p), quantidade: q, valor });
    }
    if (!itens.length) return { status: 400, erro: 'Adicione ao menos um produto.' };
    // Cliente: obrigatório na NF-e (com endereço); no cupom, CPF/CNPJ é opcional
    const b = body.destinatario || {};
    const doc = String(b.documento || '').replace(/\D/g, '');
    const destinatario = { documento: doc, nome: txt(b.nome, 60), ie: String(b.ie || '').replace(/\D/g, '') };
    if (doc.length === 14) {
      const emp = await buscaEmpresa(doc).catch(() => null);
      if (emp) { destinatario.nome = destinatario.nome || emp.razaoSocial; destinatario.uf = emp.uf; }
      const end = await obraUtil.completaEndereco(emp && emp.endereco ? { ...emp.endereco, codigoMunicipio: emp.endereco.codigoMunicipio || emp.codigoIbge } : null);
      if (end) destinatario.endereco = end;
    }
    if (b.cep) {
      const end = await obraUtil.completaEndereco({ cep: b.cep, numero: b.numero, complemento: b.complemento });
      if (end) { destinatario.endereco = end; destinatario.uf = end.uf || destinatario.uf; }
    }
    if (destinatario.endereco && !destinatario.endereco.municipio) {
      const c = await obraUtil.buscaCep(destinatario.endereco.cep).catch(() => null);
      if (c) { destinatario.endereco.municipio = c.municipio; destinatario.uf = destinatario.uf || c.uf; }
    }
    const ambiente = ambVendas(u);
    let venda = db.insere('vendas', { usuarioId: u.id, modelo, ambiente, status: 'processando', itens, destinatario, ...extrasRemessa, pagamento: remessa ? '90' : String(body.pagamento || '01'), total: Math.round(itens.reduce((t, i) => t + i.quantidade * i.valor, 0) * 100) / 100, pedidoPor: quem });
    try {
      venda = db.atualiza('vendas', venda.id, await vendas.emite(venda, u, ambiente));
      // NF-e é assíncrona: confere algumas vezes antes de responder
      for (let i = 0; i < 4 && venda.status === 'processando'; i++) {
        await new Promise((ok) => setTimeout(ok, espera ? 2000 : 0));
        venda = db.atualiza('vendas', venda.id, await vendas.consulta(venda, ambiente, u));
      }
    } catch (err) {
      db.remove('vendas', (x) => x.id === venda.id);
      return { status: 400, erro: err.message };
    }
    if (venda.status === 'erro') { db.remove('vendas', (x) => x.id === venda.id); return { status: 400, erro: `A SEFAZ recusou: ${venda.erro}` }; }
    if (venda.status === 'emitida' && ambiente === 'producao' && !remessa) avisos.nota(u, { id: venda.id, numero: venda.numero, tomador: { nome: destinatario.nome || 'consumidor' }, valor: venda.total, pdf: venda.danfe }).catch(() => {});
    return { venda };
  }
  // Sugestões para o campo "produto": primeiro os produtos da empresa, depois o que outras empresas já
  // cadastraram (nome + NCM) e por fim a tabela oficial de NCM
  function sugestoesProduto(u, q) {
    const nq = ncmUtil.semAcento(q).trim();
    if (nq.length < 2) return [];
    const casa = (d) => nq.split(/\s+/).every((p) => ncmUtil.semAcento(d).includes(p));
    const meus = db.lista('produtos', (p) => p.usuarioId === u.id && casa(p.descricao)).slice(0, 5).map((p) => ({ tipo: 'meu', ...prodPublico(p) }));
    const vistos = new Set(meus.map((p) => p.ncm + ncmUtil.semAcento(p.descricao)));
    const outros = [];
    for (const p of db.lista('produtos', (x) => x.usuarioId !== u.id && casa(x.descricao))) {
      const k = p.ncm + ncmUtil.semAcento(p.descricao);
      if (!vistos.has(k) && outros.length < 3) { vistos.add(k); outros.push({ tipo: 'catalogo', descricao: p.descricao, ncm: p.ncm, ncmDescricao: ncmUtil.descricaoDe(p.ncm) }); }
    }
    const oficiais = ncmUtil.busca(q, 6).map((x) => ({ tipo: 'ncm', ncm: x.ncm, ncmDescricao: x.descricao, sugestao: ncmUtil.sugestaoFiscal(x.ncm, { uf: (u.empresa && u.empresa.uf) || 'SP' }) }));
    return [...meus, ...outros, ...oficiais];
  }
  admin.get('/escritorio/empresas/:id/produtos/sugestoes', (req, res) => {
    const u = empresaDe(req, res);
    if (!u) return;
    res.json({ sugestoes: sugestoesProduto(u, String(req.query.q || '').slice(0, 80)) });
  });
  admin.post('/escritorio/empresas/:id/vendas', express.json(), async (req, res) => {
    const u = empresaDe(req, res);
    if (!u) return;
    responde2(res, await emiteVenda(u, req.body || {}, req.acesso && req.acesso.usuario ? req.acesso.usuario.nome : 'Escritório', { espera: req.query.espera !== '0' }));
  });
  // Área do Cliente: cupom fiscal rápido (digita o produto, escolhe o tipo sugerido, informa o valor)
  r.get('/vendas', auth.exigePlano, async (req, res) => {
    const u = req.usuario;
    if (vendas.ativo()) await atualizaVendasProcessando(u);
    res.json({
      config: { focus: vendas.ativo(), ambiente: ambVendas(u), simples: simplesOuMei(u) },
      produtos: db.lista('produtos', (p) => p.usuarioId === u.id).sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR')).map(prodPublico),
      vendas: db.lista('vendas', (v) => v.usuarioId === u.id).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)).slice(0, 30),
    });
  });
  r.get('/produtos/sugestoes', auth.exigePlano, (req, res) => res.json({ sugestoes: sugestoesProduto(req.usuario, String(req.query.q || '').slice(0, 80)) }));
  r.post('/vendas', auth.exigePlano, async (req, res) => {
    responde2(res, await emiteVenda(req.usuario, req.body || {}, 'Cliente', { espera: req.query.espera !== '0' }));
  });
  // Cupom pronto para a impressora térmica (80 mm ou 58 mm), já chamando a impressão
  async function enviaImpressao(res, u, vid, largura) {
    const v = db.acha('vendas', (x) => x.id === vid && x.usuarioId === u.id);
    if (!v) return res.status(404).type('text').send('Cupom não encontrado.');
    const nonce = crypto.randomBytes(12).toString('base64');
    try {
      const html = await vendas.cupomParaImprimir(v, { largura: Number(largura) === 58 ? 58 : 80, nonce });
      // Só o nosso script (com nonce) roda: o HTML vem da Focus, mas é servido do nosso domínio
      res.set('Content-Security-Policy', `default-src 'none'; img-src * data: blob:; style-src 'unsafe-inline' *; font-src * data:; script-src 'nonce-${nonce}'; frame-ancestors 'self'`);
      res.type('html').send(html);
    } catch (err) { res.status(502).type('text').send(err.message); }
  }
  r.get('/vendas/:vid/imprimir', auth.exigePlano, (req, res) => enviaImpressao(res, req.usuario, req.params.vid, req.query.largura));
  admin.get('/escritorio/empresas/:id/vendas/:vid/imprimir', (req, res) => {
    const u = empresaDe(req, res);
    if (u) enviaImpressao(res, u, req.params.vid, req.query.largura);
  });
  admin.post('/escritorio/empresas/:id/vendas/:vid/cancelar', express.json(), async (req, res) => {
    const u = empresaDe(req, res);
    if (!u) return;
    const v = db.acha('vendas', (x) => x.id === req.params.vid && x.usuarioId === u.id);
    if (!v || v.status !== 'emitida') return res.status(404).json({ erro: 'Nota emitida não encontrada.' });
    try { res.json({ venda: db.atualiza('vendas', v.id, { ...(await vendas.cancela(v, req.body.justificativa, v.ambiente, u)), canceladaEm: new Date().toISOString() }) }); } catch (err) { res.status(400).json({ erro: err.message }); }
  });

  // ---------- Fila de certidões ----------
  // Qualquer pessoa da equipe pede; a tarefa agendada no computador do responsável tira pelo Chrome
  // (federal e FGTS sozinha; as com captcha/login ficam "esperando o responsável") e devolve os PDFs aqui.
  const TIPOS_CERT = { federal: 'Federal (Receita/PGFN)', estadual: 'Estadual', municipal: 'Municipal', fgts: 'FGTS (CRF)', trabalhista: 'Trabalhista (CNDT)' };
  const resumoPedido = (p) => ({ ...p, itens: Object.fromEntries(Object.entries(p.itens || {}).map(([k, v]) => [k, v])) });
  admin.post('/escritorio/empresas/:id/certidoes/pedido', (req, res) => {
    const u = empresaDe(req, res);
    if (!u) return;
    const aberto = db.acha('certidoes', (x) => x.empresaId === u.id && x.status !== 'concluido');
    if (aberto) return res.json({ pedido: resumoPedido(aberto), jaExistia: true });
    const quem = req.acesso && req.acesso.usuario;
    const e = u.empresa || {};
    const p = db.insere('certidoes', {
      empresaId: u.id, empresa: e.razaoSocial || u.nome, cnpj: u.cnpj, municipio: e.municipio || '', uf: e.uf || '',
      pedidoPor: quem ? quem.nome : 'Escritório', pedidoPorId: quem ? quem.id : null, status: 'pendente',
      itens: Object.fromEntries(Object.keys(TIPOS_CERT).map((k) => [k, { status: 'pendente' }])),
    });
    res.json({ pedido: resumoPedido(p) });
  });
  // Lista da fila: só o responsável (a tarefa usa o login dele); vê inclusive empresas de carteira privada
  admin.get('/escritorio/certidoes/pedidos', soGestor, (req, res) => {
    const st = String(req.query.status || '');
    res.json({ tipos: TIPOS_CERT, pedidos: db.lista('certidoes', (x) => !st || x.status === st || (st === 'abertos' && x.status !== 'concluido')).sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)).map(resumoPedido) });
  });
  // Atualiza um pedido: situação de cada certidão, validade e o PDF (base64)
  admin.post('/escritorio/certidoes/pedidos/:pid', soGestor, (req, res) => {
    const p = db.acha('certidoes', (x) => x.id === req.params.pid);
    if (!p) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    const itens = { ...(p.itens || {}) };
    for (const [tipo, v] of Object.entries(req.body.itens || {})) {
      if (!TIPOS_CERT[tipo] || !v) continue;
      const atual = { ...(itens[tipo] || {}) };
      if (['pendente', 'emitida', 'positiva', 'aguardando', 'indisponivel'].includes(v.status)) atual.status = v.status;
      if (/^\d{4}-\d{2}-\d{2}$/.test(v.validade || '')) atual.validade = v.validade;
      if (v.tipoCertidao) atual.tipoCertidao = txt(v.tipoCertidao, 80);
      if (v.obs !== undefined) atual.obs = txt(v.obs, 300);
      if (v.pdf) {
        const buf = Buffer.from(String(v.pdf), 'base64');
        if (buf.slice(0, 4).toString() !== '%PDF') return res.status(400).json({ erro: `O arquivo da certidão ${tipo} não é um PDF.` });
        atual.pdf = guardaPdf(buf);
      }
      atual.em = new Date().toISOString();
      itens[tipo] = atual;
    }
    const abertos = Object.values(itens).filter((x) => ['pendente', 'aguardando'].includes(x.status)).length;
    const status = req.body.status === 'concluido' || !abertos ? 'concluido' : Object.values(itens).some((x) => x.status === 'aguardando') ? 'aguardando' : 'em_andamento';
    res.json({ pedido: resumoPedido(db.atualiza('certidoes', p.id, { itens, status })) });
  });

  // ---------- WhatsApp: situação, envios e teste ----------
  admin.get('/escritorio/whatsapp', soGestor, (req, res) => {
    const nomes = Object.fromEntries(db.lista('usuarios', (u) => u.cnpj).map((u) => [u.id, (u.empresa && u.empresa.razaoSocial) || u.nome]));
    res.json({ ...avisos.situacao(), envios: db.lista('envios').slice(-100).reverse().map((e) => ({ ...e, empresa: nomes[e.usuarioId] || '' })) });
  });
  admin.post('/escritorio/whatsapp/teste', soGestor, express.json(), async (req, res) => {
    const numero = String(req.body.numero || '').replace(/\D/g, '');
    if (numero.length < 10) return res.status(400).json({ erro: 'Informe DDD + número.' });
    const falso = { id: 'teste', nome: 'Teste', fiscal: { whatsapp: numero }, empresa: { nomeFantasia: 'V&J (teste)' } };
    res.json(await avisos.lembrete(falso, { descricao: 'DAS de teste', valor: 0, vencimento: new Date().toISOString().slice(0, 10) }));
  });

  admin.post('/escritorio/empresas/:id/conferir', async (req, res) => {
    const u = empresaDe(req, res);
    if (!u) return;
    if (!integra.situacao().ativo) return res.status(409).json({ erro: 'O Integra Contador ainda não está ligado.' });
    if (!doSimples(u)) return res.status(409).json({ erro: 'Esta empresa não está no Simples Nacional.' });
    const meses = apuracao.painel(u, { quantas: Math.min(24, Number(req.query.meses) || 12) });
    const anos = [...new Set(meses.map((m) => m.competencia.slice(0, 4)))];
    const porMes = {};
    try { for (const ano of anos) Object.assign(porMes, await integra.declaracoesDoAno(u.cnpj, ano)); } catch (err) { return res.status(502).json({ erro: err.message }); }
    const resultado = [];
    for (const m of meses) {
      const info = porMes[m.competencia] || { declarada: false, das: [], dasPago: false };
      let decl = null;
      if (info.declarada) { try { decl = await integra.declaracaoDoMes(u.cnpj, m.competencia); } catch (err) { decl = { erro: err.message }; } }
      const receitaDecl = decl && decl.receita != null ? decl.receita : null;
      const diferenca = receitaDecl == null ? null : Math.round((m.receita - receitaDecl) * 100) / 100;
      let situacao = 'ok';
      if (!info.declarada) situacao = m.receita > 0 ? 'nao_declarada' : 'sem_declaracao';
      else if (diferenca != null && Math.abs(diferenca) >= 0.01) situacao = 'divergente';
      else if (receitaDecl == null) situacao = 'sem_leitura';
      const conferencia = {
        em: new Date().toISOString(), situacao, declarada: info.declarada, retificada: !!info.retificada, numero: (decl && decl.numero) || (info.ultima && info.ultima.numero) || '',
        receitaDeclarada: receitaDecl, debitoDeclarado: decl && decl.debito != null ? decl.debito : null, receitaNotas: m.receita, diferenca, dasPago: info.dasPago, malha: (info.ultima && info.ultima.malha) || '',
      };
      const reg = apuracao.registro(u, m.competencia);
      const patch = { conferencia };
      // A Receita já resolve alguns casos: DAS pago -> paga; declarado zerado e sem notas -> entregue
      if (info.dasPago && reg.status !== 'paga') patch.status = 'paga';
      else if (situacao === 'ok' && receitaDecl === 0 && m.receita === 0 && ['calculada', 'aprovada'].includes(reg.status)) patch.status = 'entregue';
      db.atualiza('apuracoes', reg.id, patch);
      resultado.push({ competencia: m.competencia, ...conferencia, ...(decl && decl.amostra && req.query.diagnostico === '1' ? { amostra: decl.amostra } : {}) });
    }
    const problemas = resultado.filter((r) => ['divergente', 'nao_declarada'].includes(r.situacao));
    if (problemas.length) {
      const alerta = { em: new Date().toISOString(), texto: `Conferência com a Receita: ${problemas.length} mês(es) com o PGDAS-D diferente das notas (${problemas.map((p) => nomeComp(p.competencia)).join(', ')}).` };
      db.atualiza('usuarios', u.id, { alertasEscritorio: [alerta, ...((u.alertasEscritorio) || [])].slice(0, 30) });
    }
    res.json({ resultado, problemas: problemas.length, consultas: anos.length + resultado.filter((r) => r.declarada).length });
  });

  // Mês sem faturamento: declaração zerada, sem guia
  admin.post('/apuracoes/:id/:comp/zerada', async (req, res) => {
    const u = alvoApu(req, res);
    if (!u) return;
    const reg = apuracao.registro(u, req.params.comp);
    // "Entregue" marcado só no site (sem recibo da Receita) ainda pode ser transmitido pelo Integra;
    // se já houver declaração na Receita, ela mesma recusa (não duplica)
    const soMarcada = reg.status === 'entregue' && !(reg.entrega && reg.entrega.idDeclaracao) && integra.situacao().ativo && req.query.local !== '1';
    if (!['calculada', 'aprovada'].includes(reg.status) && !soMarcada) return res.status(409).json({ erro: 'Esta competência já foi concluída.' });
    const calc = reg.aprovado || apuracao.calcula(u, req.params.comp, apuracao.receitas(u), reg.ajuste || {});
    if (calc.valor > 0) return res.status(409).json({ erro: 'Esta competência tem DAS a pagar: use "Gerar guia".' });
    // Com o Integra ligado, transmite o PGDAS-D zerado na Receita (?validar=1 só confere, sem gravar)
    let entrega = null;
    if (integra.situacao().ativo && req.query.local !== '1') {
      try {
        const r = await integra.entregaSemMovimento(u.cnpj, req.params.comp, { transmitir: req.query.validar !== '1' });
        if (r.validado) return res.json({ validado: true, mensagens: r.mensagens, valoresDevidos: r.valoresDevidos });
        fs.mkdirSync(path.join(DADOS_DIR, 'das'), { recursive: true });
        const guarda = (buf) => { if (!buf) return ''; const t = crypto.randomBytes(12).toString('base64url'); fs.writeFileSync(path.join(DADOS_DIR, 'das', `${t}.pdf`), buf); return `${site}/das/${t}`; };
        entrega = {
          idDeclaracao: r.idDeclaracao, transmitidaEm: r.transmitidaEm, mensagens: r.mensagens,
          declaracao: guarda(r.declaracao), recibo: guarda(r.recibo),
          multa: r.multa ? { ...r.multa, notificacao: guarda(r.notificacaoMaed), darf: guarda(r.darfMaed) } : null,
        };
      } catch (err) { return res.status(502).json({ erro: `A Receita não aceitou a declaração: ${err.message}` }); }
    }
    db.atualiza('apuracoes', reg.id, { status: 'entregue', aprovado: calc, aprovadoEm: reg.aprovadoEm || new Date().toISOString(), entregueEm: new Date().toISOString(), ...(entrega ? { entrega } : {}) });
    res.json({ linha: linhaDe(u, req.params.comp), entrega });
  });
  admin.post('/apuracoes/:id/:comp/das', express.json({ limit: '4mb' }), async (req, res) => {
    const u = alvoApu(req, res);
    if (!u) return;
    let reg = apuracao.registro(u, req.params.comp);
    // Gerar guia num passo só: aprova o cálculo (se ainda não aprovado) e anexa a guia
    if (reg.status === 'calculada') {
      const calc = apuracao.calcula(u, req.params.comp, apuracao.receitas(u), reg.ajuste || {});
      reg = db.atualiza('apuracoes', reg.id, { status: 'aprovada', aprovado: calc, aprovadoEm: new Date().toISOString() });
    }
    let pdf = txt(req.body.pdf, 600);
    if (pdf && !/^https:\/\//.test(pdf)) return res.status(400).json({ erro: 'O link do PDF precisa começar com https://' });
    // PDF do DAS enviado do computador: guardado no volume e servido por link com token
    if (req.body.pdfArquivo) {
      const buf = Buffer.from(String(req.body.pdfArquivo), 'base64');
      if (buf.subarray(0, 4).toString() !== '%PDF') return res.status(400).json({ erro: 'O arquivo precisa ser o PDF do DAS.' });
      const token = (reg.das && reg.das.token) || crypto.randomBytes(12).toString('base64url');
      fs.mkdirSync(path.join(DADOS_DIR, 'das'), { recursive: true });
      fs.writeFileSync(path.join(DADOS_DIR, 'das', `${token}.pdf`), buf);
      pdf = `${site}/das/${token}`;
      req.body.token = token;
    }
    const linhaDigitavel = txt(req.body.linhaDigitavel, 80).replace(/[^\d]/g, '');
    if (!pdf && !linhaDigitavel) return res.status(400).json({ erro: 'Informe o link do PDF ou a linha digitável do DAS.' });
    const valor = Number(String(req.body.valor || '').replace(/\./g, '').replace(',', '.')) || (reg.aprovado && reg.aprovado.valor) || 0;
    const vencimento = /^\d{4}-\d{2}-\d{2}$/.test(req.body.vencimento || '') ? req.body.vencimento : reg.aprovado && reg.aprovado.vencimento;
    db.atualiza('apuracoes', reg.id, { status: 'das_disponivel', das: { pdf, linhaDigitavel, valor, vencimento, em: new Date().toISOString(), ...(req.body.token ? { token: req.body.token } : {}) } });
    const alerta = { em: new Date().toISOString(), texto: `Seu DAS de ${nomeComp(req.params.comp)} está disponível: ${brl(valor)}, vence em ${vencimento ? vencimento.split('-').reverse().join('/') : '—'}. Veja em Minha empresa › Seu DAS.` };
    db.atualiza('usuarios', u.id, { alertas: [alerta, ...(u.alertas || [])].slice(0, 30) });
    const whats = pdf ? await avisos.guia(u, { descricao: `DAS ${nomeComp(req.params.comp)}`, valor, vencimento, link: pdf, chave: `das-${u.id}-${req.params.comp}-${vencimento}` }) : null;
    res.json({ linha: linhaDe(u, req.params.comp), whatsapp: whats });
  });
  admin.post('/apuracoes/:id/:comp/pago', (req, res) => {
    const u = alvoApu(req, res);
    if (!u) return;
    const reg = apuracao.registro(u, req.params.comp);
    if (reg.status !== 'das_disponivel') return res.status(409).json({ erro: 'Anexe o DAS antes de marcar como pago.' });
    db.atualiza('apuracoes', reg.id, { status: 'paga', pagoEm: new Date().toISOString() });
    res.json({ linha: linhaDe(u, req.params.comp) });
  });
  admin.post('/apuracoes/:id/:comp/gerar', (req, res) => res.status(503).json({ erro: 'A geração automática do DAS precisa da Integra Contador (Serpro). Enquanto isso, gere no Portal do Simples e use "Anexar DAS".' }));

  admin.get('/notas', (req, res) => {
    const nomes = Object.fromEntries(db.lista('usuarios').map((u) => [u.id, { nome: u.empresa ? u.empresa.razaoSocial : u.nome, cnpj: u.cnpj, fiscal: u.fiscal }]));
    const ver = naCarteira(req);
    const permitidas = new Set(db.lista('usuarios', ver).map((u) => u.id));
    res.json({ notas: db.lista('notas', (n) => n.status !== 'rascunho' && !n.teste && permitidas.has(n.usuarioId)).sort((a, b) => (b.enviadaEm || '').localeCompare(a.enviadaEm || '')).map((n) => ({ ...n, prestador: nomes[n.usuarioId] })) });
  });
  admin.post('/notas/:id/anexar', express.json(), (req, res) => {
    const n = db.acha('notas', (x) => x.id === req.params.id);
    if (!n) return res.status(404).json({ erro: 'Nota não encontrada.' });
    const pdf = txt(req.body.pdf, 600);
    if (pdf && !/^https:\/\//.test(pdf)) return res.status(400).json({ erro: 'O link do PDF precisa começar com https://' });
    const emitida = db.atualiza('notas', n.id, { status: 'emitida', numero: txt(req.body.numero, 30), pdf, emitidaEm: new Date().toISOString() });
    const dono = db.acha('usuarios', (x) => x.id === emitida.usuarioId);
    if (dono) {
      entregaNota(dono, emitida).catch((err) => console.warn('[nfse] entrega', err.message));
      avisos.nota(dono, emitida).catch((err) => console.warn('[nfse] whatsapp', err.message));
    }
    res.json({ nota: emitida });
  });

  // Carteira do contador: empresas de clientes sem login próprio
  async function criaEmpresaCarteira(cnpj, { nome = '', telefone = '' } = {}) {
    let emp = null;
    try { emp = await buscaEmpresa(cnpj); } catch { /* cadastra só com o CNPJ */ }
    return db.insere('usuarios', {
      nome: nome || (emp && (emp.nomeFantasia || emp.razaoSocial)) || cnpj, cnpj, gerenciado: true, telefone, alertas: [],
      empresa: emp ? { razaoSocial: emp.razaoSocial, nomeFantasia: emp.nomeFantasia, regime: emp.regime, situacao: emp.situacao, municipio: emp.municipio, uf: emp.uf, cnae: emp.cnae, atividade: emp.atividade, simples: emp.simples, mei: emp.mei, abertura: emp.abertura } : null,
    });
  }

  // ---------- Certificado digital A1: busca automática das notas ----------
  // Usado pelo próprio cliente (Área do Cliente) e pelo contador dono do site (/admin), para
  // qualquer empresa da carteira. "quem" registra quem autorizou o uso.
  const statusCert = (u) => ({ disponivel: certificado.ativo(), ...(u.certificado && u.certificado.ativo ? u.certificado : { ativo: false }) });
  function conectaCert(alvo, req, quem) {
    if (!certificado.ativo()) return [503, { erro: 'A conexão do certificado ainda não foi ativada no servidor.' }];
    if (req.body.autorizo !== true) return [400, { erro: 'Marque a autorização para continuar.' }];
    const pfx = Buffer.from(txt(req.body.pfx, 70000), 'base64');
    const senha = String(req.body.senha || '').slice(0, 200);
    if (pfx.length < 500) return [400, { erro: 'Escolha o arquivo do certificado (.pfx ou .p12).' }];
    let info;
    try { info = certificado.confere(pfx, senha, alvo.cnpj); } catch (err) {
      return [400, { erro: err instanceof certificado.ErroCertificado ? err.message : 'Não foi possível ler o certificado.' }];
    }
    certificado.guarda(alvo.id, pfx, senha);
    const u = db.atualiza('usuarios', alvo.id, { certificado: { ativo: true, ...info, conectadoEm: new Date().toISOString(), autorizacao: { em: new Date().toISOString(), ip: req.ip, por: quem } } });
    captura.rodaUsuario(u).catch((err) => console.error('[captura]', err.message));
    return [200, { certificado: statusCert(u) }];
  }
  async function buscaCert(alvo) {
    const c = alvo.certificado;
    if (!c || !c.ativo) return [400, { erro: 'Conecte o certificado primeiro.' }];
    if (c.ultimaBusca && Date.now() - Date.parse(c.ultimaBusca) < 60 * 60 * 1000) return [429, { erro: 'A Receita só permite uma nova busca a cada 1 hora. A próxima busca automática já está agendada.' }];
    const resultado = await captura.rodaUsuario(alvo);
    return [200, { resultado, certificado: statusCert(db.acha('usuarios', (x) => x.id === alvo.id)) }];
  }
  function desconectaCert(alvo) {
    certificado.apaga(alvo.id);
    captura.apaga(alvo.id);
    return [200, { certificado: statusCert(db.atualiza('usuarios', alvo.id, { certificado: { ativo: false, desconectadoEm: new Date().toISOString() } })) }];
  }
  const responde = (res, [status, corpo]) => res.status(status).json(corpo);

  r.get('/certificado', auth.exigePlano, (req, res) => res.json({ certificado: statusCert(req.usuario) }));
  r.post('/certificado', auth.exigePlano, async (req, res) => {
    // O contador (dono) que envia o certificado de OUTRA empresa: vai para a carteira dele
    if (auth.ehDono(req.usuario) && req.body.autorizo === true && certificado.ativo()) {
      let info = null;
      try { info = certificado.le(Buffer.from(txt(req.body.pfx, 70000), 'base64'), String(req.body.senha || '').slice(0, 200)); } catch { /* conectaCert explica o erro */ }
      if (info && info.cnpj && info.cnpj.slice(0, 8) !== String(req.usuario.cnpj).slice(0, 8)) {
        const alvo = db.acha('usuarios', (x) => x.cnpj === info.cnpj) || await criaEmpresaCarteira(info.cnpj);
        const [status, corpo] = conectaCert(alvo, req, 'contador');
        const atual = db.acha('usuarios', (x) => x.id === alvo.id);
        return res.status(status).json({ ...corpo, carteira: status === 200 ? { id: alvo.id, nome: (atual.empresa && atual.empresa.razaoSocial) || atual.nome, cnpj: atual.cnpj } : undefined });
      }
    }
    responde(res, conectaCert(req.usuario, req, 'cliente'));
  });
  r.post('/certificado/buscar', auth.exigePlano, async (req, res) => responde(res, await buscaCert(req.usuario)));
  r.delete('/certificado', auth.exigePlano, (req, res) => responde(res, desconectaCert(req.usuario)));
  // O contador (dono) pode ver as notas de qualquer empresa da carteira: ?empresa=<id>
  r.get('/notas-capturadas', auth.exigePlano, (req, res) => {
    const id = req.query.empresa && auth.ehDono(req.usuario) ? String(req.query.empresa) : req.usuario.id;
    res.json(captura.notasDe(id));
  });

  // DAS do cliente: estimativa do mês e guias liberadas pelo contador
  r.get('/das', auth.exigePlano, (req, res) => res.json({ meses: apuracao.painel(req.usuario, { quantas: 6 }).map(({ ajuste, ...l }) => l) }));
  r.use('/analises', analises.portal());
  // ---------- Rotinas automáticas (uma vez por dia) ----------
  // Situação fiscal mensal, guia da parcela do mês e lembretes de vencimento pelo WhatsApp.
  const DIA_MS = 24 * 60 * 60 * 1000;
  const velho = (iso, dias) => !iso || Date.now() - Date.parse(iso) > dias * DIA_MS;
  async function rotinas({ hoje = require('./agenda').hojeSP() } = {}) {
    const feito = { situacao: 0, parcelas: 0, lembretes: 0 };
    const ativo = integra.situacao().ativo;
    for (const u of empresasEscritorio()) {
      if (ativo) {
        const sf = u.situacaoFiscal;
        if (velho(sf && sf.em, 30)) { await atualizaSituacao(u); feito.situacao++; }
        const p = u.parcelamento;
        if (p && p.ativo) {
          try {
            const atual = velho(p.em, 25) ? await atualizaParcelamento(u) : p;
            const mes = hoje.slice(0, 7);
            if (atual.ativo && (atual.parcelas || []).some((x) => x.parcela === mes) && !(atual.guias || {})[mes]) { await geraGuiaParcela(u, mes); feito.parcelas++; }
          } catch (err) { console.warn('[rotinas] parcela', u.id, err.message); }
        }
      }
      // Lembretes: 3 dias antes e no dia do vencimento, para guias ainda não pagas
      const emDias = (d) => Math.round((Date.parse(d) - Date.parse(hoje)) / DIA_MS);
      for (const reg of db.lista('apuracoes', (a) => a.usuarioId === u.id && a.status === 'das_disponivel' && a.das && a.das.vencimento)) {
        const n = emDias(reg.das.vencimento);
        if (n === 3 || n === 0) { const r = await avisos.lembrete(u, { descricao: `DAS ${nomeComp(reg.competencia)}`, valor: reg.das.valor, vencimento: reg.das.vencimento, link: reg.das.pdf, chave: `lemb-${reg.id}-${hoje}` }); if (r.ok && !r.repetido) feito.lembretes++; }
      }
      for (const [parcela, g] of Object.entries((u.parcelamento && u.parcelamento.guias) || {})) {
        const n = g.vencimento ? emDias(g.vencimento) : -1;
        if (n === 3 || n === 0) { const r = await avisos.lembrete(u, { descricao: `parcela ${parcela.split('-').reverse().join('/')}`, valor: g.valor, vencimento: g.vencimento, link: g.pdf, chave: `lemb-parc-${u.id}-${parcela}-${hoje}` }); if (r.ok && !r.repetido) feito.lembretes++; }
      }
    }
    return feito;
  }
  admin.post('/escritorio/rotinas', soGestor, async (req, res) => res.json(await rotinas()));

  return { portal: r, publico, admin, enviaPdfNota, enviaPdfDas, rotinas };
};
