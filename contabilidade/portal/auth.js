// Login do portal: senha com scrypt, sessão em cookie httpOnly (token aleatório; no banco fica só o hash).
const crypto = require('crypto');
const db = require('./db');

const COOKIE = 'vj_sessao';
const DURACAO_MS = 30 * 24 * 60 * 60 * 1000;

function hashSenha(senha) {
  const sal = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(senha, sal, 64).toString('hex');
  return `${sal}:${h}`;
}

function confereSenha(senha, guardado) {
  const [sal, h] = String(guardado || '').split(':');
  if (!sal || !h) return false;
  const teste = crypto.scryptSync(senha, sal, 64);
  const certo = Buffer.from(h, 'hex');
  return certo.length === teste.length && crypto.timingSafeEqual(certo, teste);
}

const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

function criaSessao(res, usuarioId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.insere('sessoes', { usuarioId, tokenHash: hashToken(token), expira: Date.now() + DURACAO_MS });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: DURACAO_MS, path: '/' });
}

function encerraSessao(req, res) {
  const token = req.cookies[COOKIE];
  if (token) db.remove('sessoes', (s) => s.tokenHash === hashToken(token));
  res.clearCookie(COOKIE, { path: '/' });
}

// Lê o cookie sem depender de biblioteca externa
function leCookies(req, res, next) {
  req.cookies = Object.fromEntries((req.headers.cookie || '').split(';').map((p) => p.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
  next();
}

function usuarioDaSessao(req) {
  const token = req.cookies && req.cookies[COOKIE];
  if (!token) return null;
  const s = db.acha('sessoes', (x) => x.tokenHash === hashToken(token));
  if (!s || s.expira < Date.now()) return null;
  return db.acha('usuarios', (u) => u.id === s.usuarioId);
}

function planoAtivo(u) {
  return !!u && !!u.planoAte && new Date(u.planoAte) > new Date();
}

function exigeLogin(req, res, next) {
  const u = usuarioDaSessao(req);
  if (!u) return res.status(401).json({ erro: 'Faça login para continuar.' });
  req.usuario = u;
  next();
}

function exigePlano(req, res, next) {
  exigeLogin(req, res, () => {
    if (!planoAtivo(req.usuario)) return res.status(402).json({ erro: 'Esta ferramenta é exclusiva para assinantes. Escolha um plano para liberar.' });
    next();
  });
}

// Dados que podem ir para o navegador (nunca a senha)
function publico(u) {
  const { senha, ...resto } = u;
  return { ...resto, assinante: planoAtivo(u) };
}

module.exports = { hashSenha, confereSenha, criaSessao, encerraSessao, leCookies, usuarioDaSessao, exigeLogin, exigePlano, planoAtivo, publico };
