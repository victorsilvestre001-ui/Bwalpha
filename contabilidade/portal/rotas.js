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
    auth.criaSessao(res, u.id);
    res.json({ usuario: auth.publico(u) });
  });

  r.post('/sair', (req, res) => { auth.encerraSessao(req, res); res.json({ ok: true }); });

  r.get('/eu', auth.exigeLogin, (req, res) => res.json({ usuario: auth.publico(req.usuario), plano: planoDo(req.usuario), focusAtivo: notas.ativo(), ia: assistente.ativo() }));

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

  r.put('/fiscal', auth.exigePlano, (req, res) => {
    const f = {
      codigoMunicipio: txt(req.body.codigoMunicipio, 7).replace(/\D/g, ''),
      codigoServico: txt(req.body.codigoServico, 9).replace(/\D/g, ''),
      serieDps: Number(req.body.serieDps) || 1,
      regimeEspecial: Number(req.body.regimeEspecial) || 0,
    };
    if (f.codigoMunicipio.length !== 7) return res.status(400).json({ erro: 'O código do município (IBGE) tem 7 dígitos.' });
    if (f.codigoServico.length !== 6) return res.status(400).json({ erro: 'O código de tributação nacional do serviço tem 6 dígitos (ex.: 010701).' });
    const patch = { fiscal: f };
    if (req.body.proximoDps) patch.proximoDps = Math.max(1, Number(req.body.proximoDps) || 1);
    const u = db.atualiza('usuarios', req.usuario.id, patch);
    res.json({ usuario: auth.publico(u) });
  });

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
  const minhasNotas = (u) => db.lista('notas', (n) => n.usuarioId === u.id).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  const usadasNoMes = (u) => {
    const mes = new Date().toISOString().slice(0, 7);
    return minhasNotas(u).filter((n) => n.enviadaEm && n.enviadaEm.startsWith(mes) && n.status !== 'erro').length;
  };

  async function atualizaProcessando(u) {
    if (!notas.ativo()) return;
    for (const n of minhasNotas(u).filter((x) => x.status === 'processando')) {
      try { db.atualiza('notas', n.id, await notas.consulta(n)); } catch (err) { console.warn('[notas] consulta', n.id, err.message); }
    }
  }

  r.get('/notas', auth.exigePlano, async (req, res) => {
    await atualizaProcessando(req.usuario);
    const plano = planoDo(req.usuario);
    res.json({ notas: minhasNotas(req.usuario), usadas: usadasNoMes(req.usuario), limite: plano.notasMes || 0, fiscalOk: notas.configFiscalCompleta(req.usuario), focusAtivo: notas.ativo() });
  });

  // Passo 1: só CNPJ (ou CPF), descrição e valor -> rascunho com os dados do tomador já preenchidos
  r.post('/notas', auth.exigePlano, async (req, res) => {
    const plano = planoDo(req.usuario);
    if (!plano.notasMes) return res.status(402).json({ erro: `A emissão de notas faz parte do plano ${planos().find((p) => p.notasMes)?.nome || 'Completo'}.` });
    const doc = String(req.body.documento || '').replace(/\D/g, '');
    const descricao = txt(req.body.descricao, 2000);
    const valor = dinheiro(req.body.valor);
    if (!descricao || !(valor > 0)) return res.status(400).json({ erro: 'Informe a descrição do serviço e o valor.' });
    const tomador = { email: txt(req.body.email, 160) };
    if (doc.length === 14) {
      if (!cnpjUtil.valido(doc)) return res.status(400).json({ erro: 'CNPJ do cliente inválido.' });
      const e = await buscaEmpresa(doc).catch(() => null);
      Object.assign(tomador, { cnpj: doc, nome: e ? e.razaoSocial : txt(req.body.nome, 160), municipio: e && e.municipio, uf: e && e.uf });
    } else if (doc.length === 11) {
      Object.assign(tomador, { cpf: doc, nome: txt(req.body.nome, 160) || 'Consumidor' });
    } else {
      return res.status(400).json({ erro: 'Informe o CNPJ (14 dígitos) ou CPF (11 dígitos) do cliente.' });
    }
    const n = db.insere('notas', { usuarioId: req.usuario.id, status: 'rascunho', tomador, descricao, valor });
    res.json({ nota: n });
  });

  // Passo 2: o assinante confere e confirma; só então a nota é enviada
  r.post('/notas/:id/emitir', auth.exigePlano, async (req, res) => {
    const n = db.acha('notas', (x) => x.id === req.params.id && x.usuarioId === req.usuario.id);
    if (!n || n.status !== 'rascunho') return res.status(404).json({ erro: 'Rascunho não encontrado.' });
    const plano = planoDo(req.usuario);
    if (usadasNoMes(req.usuario) >= (plano.notasMes || 0)) return res.status(402).json({ erro: `Você já usou as ${plano.notasMes} notas do mês. Fale conosco para ampliar.` });
    const u = req.usuario;
    const agora = new Date().toISOString();
    if (notas.ativo() && notas.configFiscalCompleta(u)) {
      const numeroDps = u.proximoDps || 1;
      db.atualiza('usuarios', u.id, { proximoDps: numeroDps + 1 });
      try {
        const r2 = await notas.emite({ ...n, numeroDps }, u);
        return res.json({ nota: db.atualiza('notas', n.id, { ...r2, numeroDps, enviadaEm: agora }) });
      } catch (err) {
        return res.json({ nota: db.atualiza('notas', n.id, { status: 'erro', erro: err.message, numeroDps, enviadaEm: agora }) });
      }
    }
    // Sem integração ativa: entra na fila da equipe V&J, que emite e anexa o PDF pelo /admin
    res.json({ nota: db.atualiza('notas', n.id, { status: 'fila', enviadaEm: agora }) });
  });

  r.delete('/notas/:id', auth.exigePlano, (req, res) => {
    db.remove('notas', (x) => x.id === req.params.id && x.usuarioId === req.usuario.id && x.status === 'rascunho');
    res.json({ ok: true });
  });

  r.post('/notas/:id/cancelar', auth.exigePlano, async (req, res) => {
    const n = db.acha('notas', (x) => x.id === req.params.id && x.usuarioId === req.usuario.id);
    if (!n || n.status !== 'emitida') return res.status(404).json({ erro: 'Nota emitida não encontrada.' });
    const justificativa = txt(req.body.justificativa, 255);
    if (justificativa.length < 15) return res.status(400).json({ erro: 'Explique o motivo do cancelamento (mínimo 15 caracteres).' });
    if (!notas.ativo()) return res.json({ nota: db.atualiza('notas', n.id, { cancelamentoPedido: justificativa }) });
    try {
      res.json({ nota: db.atualiza('notas', n.id, await notas.cancela(n, justificativa)) });
    } catch (err) {
      res.status(502).json({ erro: err.message });
    }
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
  admin.use('/analises', analises.admin());
  admin.get('/assinantes', (req, res) => {
    res.json({ assinantes: db.lista('usuarios').map((u) => ({ ...auth.publico(u), analise: undefined })).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)) });
  });
  admin.post('/assinantes/:id/papel', express.json(), (req, res) => {
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
    const u = await criaEmpresaCarteira(cnpj, { nome: txt(req.body.nome, 120), telefone: txt(req.body.telefone, 20).replace(/\D/g, '') });
    res.json({ usuario: auth.publico(u) });
  });
  const empresaDe = (req, res) => {
    const u = db.acha('usuarios', (x) => x.id === req.params.id);
    if (!u) res.status(404).json({ erro: 'Empresa não encontrada.' });
    return u;
  };
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
    for (let u of db.lista('usuarios', doSimples)) {
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
  admin.post('/apuracoes/:id/:comp/das', express.json(), (req, res) => {
    const u = alvoApu(req, res);
    if (!u) return;
    const reg = apuracao.registro(u, req.params.comp);
    if (reg.status === 'calculada') return res.status(409).json({ erro: 'Aprove a apuração antes de anexar o DAS.' });
    const pdf = txt(req.body.pdf, 600);
    if (pdf && !/^https:\/\//.test(pdf)) return res.status(400).json({ erro: 'O link do PDF precisa começar com https://' });
    const linhaDigitavel = txt(req.body.linhaDigitavel, 80).replace(/[^\d]/g, '');
    if (!pdf && !linhaDigitavel) return res.status(400).json({ erro: 'Informe o link do PDF ou a linha digitável do DAS.' });
    const valor = Number(String(req.body.valor || '').replace(/\./g, '').replace(',', '.')) || (reg.aprovado && reg.aprovado.valor) || 0;
    const vencimento = /^\d{4}-\d{2}-\d{2}$/.test(req.body.vencimento || '') ? req.body.vencimento : reg.aprovado && reg.aprovado.vencimento;
    db.atualiza('apuracoes', reg.id, { status: 'das_disponivel', das: { pdf, linhaDigitavel, valor, vencimento, em: new Date().toISOString() } });
    const alerta = { em: new Date().toISOString(), texto: `Seu DAS de ${nomeComp(req.params.comp)} está disponível: ${brl(valor)}, vence em ${vencimento ? vencimento.split('-').reverse().join('/') : '—'}. Veja em Minha empresa › Seu DAS.` };
    db.atualiza('usuarios', u.id, { alertas: [alerta, ...(u.alertas || [])].slice(0, 30) });
    res.json({ linha: linhaDe(u, req.params.comp) });
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
    res.json({ notas: db.lista('notas', (n) => n.status !== 'rascunho').sort((a, b) => (b.enviadaEm || '').localeCompare(a.enviadaEm || '')).map((n) => ({ ...n, prestador: nomes[n.usuarioId] })) });
  });
  admin.post('/notas/:id/anexar', express.json(), (req, res) => {
    const n = db.acha('notas', (x) => x.id === req.params.id);
    if (!n) return res.status(404).json({ erro: 'Nota não encontrada.' });
    const pdf = txt(req.body.pdf, 600);
    if (pdf && !/^https:\/\//.test(pdf)) return res.status(400).json({ erro: 'O link do PDF precisa começar com https://' });
    res.json({ nota: db.atualiza('notas', n.id, { status: 'emitida', numero: txt(req.body.numero, 30), pdf, emitidaEm: new Date().toISOString() }) });
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
  return { portal: r, publico, admin };
};
