const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cnpj = require('./cnpj');
const { buscaEmpresa } = require('./consulta');
const { diagnostico, orcamento } = require('./diagnostico');
const assistente = require('./assistente');

const PORT = process.env.PORT || 3100;
const ARQ_PRECOS = path.join(__dirname, 'precos.json');
const ARQ_CONTATOS = process.env.ARQ_CONTATOS || path.join(__dirname, 'contatos.jsonl');

// Lido a cada consulta para que mudanças de preço valham sem reiniciar o servidor.
function tabelaPrecos() {
  return JSON.parse(fs.readFileSync(ARQ_PRECOS, 'utf8'));
}

// As APIs públicas limitam requisições; guarda cada CNPJ por 1 hora.
const cache = new Map();
const CACHE_MS = 60 * 60 * 1000;

class ErroConsulta extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; }
}

async function analisa(doc) {
  const c = cnpj.limpa(doc);
  if (!cnpj.valido(c)) throw new ErroConsulta(400, 'CNPJ inválido. Confira os números digitados.');
  let emp = cache.get(c);
  if (!emp || Date.now() - emp.em > CACHE_MS) {
    const dados = await buscaEmpresa(c);
    if (!dados) throw new ErroConsulta(404, 'CNPJ não encontrado na Receita Federal.');
    emp = { dados, em: Date.now() };
    cache.set(c, emp);
  }
  const tabela = tabelaPrecos();
  const { regime, itens } = diagnostico(emp.dados);
  return {
    empresa: { ...emp.dados, cnpjFormatado: cnpj.formata(c), regime },
    orcamento: orcamento(itens, tabela),
    escritorio: tabela.escritorio,
    servicos: tabela.servicos,
  };
}

function senhaOk(recebida) {
  const certa = process.env.ADMIN_SENHA;
  if (!certa || typeof recebida !== 'string') return false;
  const a = crypto.createHash('sha256').update(recebida).digest();
  const b = crypto.createHash('sha256').update(certa).digest();
  return crypto.timingSafeEqual(a, b);
}

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '50kb' }));
app.use('/api/', rateLimit({ windowMs: 60 * 1000, limit: 30 }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.get('/api/config', (req, res) => {
  const { escritorio, servicos } = tabelaPrecos();
  res.json({ escritorio, servicos, ia: assistente.ativo() });
});

app.get('/api/empresa/:cnpj', async (req, res) => {
  try {
    res.json(await analisa(req.params.cnpj));
  } catch (err) {
    if (err instanceof ErroConsulta) return res.status(err.status).json({ erro: err.message });
    console.error('[consulta]', req.params.cnpj, err.message);
    res.status(502).json({ erro: 'Não conseguimos consultar a Receita agora. Tente de novo em alguns minutos.' });
  }
});

// Contador virtual: responde em streaming (Server-Sent Events).
const limiteIa = rateLimit({ windowMs: 60 * 1000, limit: 8, message: { erro: 'Muitas perguntas seguidas. Espere um minuto.' } });
app.post('/api/assistente', limiteIa, async (req, res) => {
  if (!assistente.ativo()) return res.status(503).json({ erro: 'Assistente indisponível.' });
  const mensagens = assistente.limpaMensagens(req.body && req.body.mensagens);
  if (!mensagens) return res.status(400).json({ erro: 'Mensagem inválida.' });

  let dados;
  try {
    dados = await analisa(req.body.cnpj);
  } catch (err) {
    return res.status(err.status || 502).json({ erro: err.message });
  }

  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  const envia = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  try {
    await assistente.responde({ ...dados, mensagens }, (texto) => envia({ texto }));
  } catch (err) {
    console.error('[assistente]', err instanceof assistente.Anthropic.APIError ? `${err.status} ${err.message}` : err.message);
    const ocupado = err instanceof assistente.Anthropic.RateLimitError || (err instanceof assistente.Anthropic.APIError && err.status >= 500);
    envia({ erro: ocupado ? 'O assistente está muito ocupado agora. Tente de novo em instantes.' : 'Não consegui responder agora.' });
  }
  envia({ fim: true });
  res.end();
});

// Guarda quem pediu contato, para o escritório retornar mesmo se a pessoa não chamar no WhatsApp.
app.post('/api/contato', (req, res) => {
  const { nome, telefone, cnpj: doc, servicos, total, email, assunto, mensagem } = req.body || {};
  if (!nome || !telefone) return res.status(400).json({ erro: 'Informe nome e telefone.' });
  const registro = {
    id: crypto.randomUUID(),
    em: new Date().toISOString(),
    nome: String(nome).slice(0, 120),
    telefone: String(telefone).replace(/\D/g, '').slice(0, 15),
    cnpj: cnpj.limpa(doc).slice(0, 14),
    servicos: Array.isArray(servicos) ? servicos.map(String).slice(0, 30) : [],
    total: Number(total) || 0,
    email: String(email || '').slice(0, 120),
    assunto: String(assunto || '').slice(0, 80),
    mensagem: String(mensagem || '').slice(0, 2000),
  };
  fs.appendFile(ARQ_CONTATOS, JSON.stringify(registro) + '\n', (err) => {
    if (err) {
      console.error('[contato]', err.message);
      return res.status(500).json({ erro: 'Não foi possível registrar agora.' });
    }
    res.json({ ok: true });
  });
});

// Painel do escritório: lista os contatos (senha em ADMIN_SENHA).
app.get('/api/admin/contatos', (req, res) => {
  if (!process.env.ADMIN_SENHA) return res.status(503).json({ erro: 'Defina ADMIN_SENHA no servidor para usar o painel.' });
  if (!senhaOk(req.get('x-admin-senha'))) return res.status(401).json({ erro: 'Senha incorreta.' });
  fs.readFile(ARQ_CONTATOS, 'utf8', (err, txt) => {
    if (err && err.code !== 'ENOENT') return res.status(500).json({ erro: err.message });
    const contatos = (txt || '').split('\n').filter(Boolean).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean).reverse();
    const { servicos } = tabelaPrecos();
    res.json({ contatos, nomes: Object.fromEntries(Object.entries(servicos).map(([id, s]) => [id, s.nome])) });
  });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Consulta de empresas rodando em http://localhost:${PORT}${assistente.ativo() ? ' (com IA)' : ' (sem IA: defina ANTHROPIC_API_KEY)'}`));
}

module.exports = app;
