const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cnpj = require('./cnpj');
const { buscaEmpresa } = require('./consulta');
const { diagnostico, orcamento } = require('./diagnostico');

const PORT = process.env.PORT || 3100;
const ARQ_PRECOS = path.join(__dirname, 'precos.json');
const ARQ_CONTATOS = path.join(__dirname, 'contatos.jsonl');

// Lido a cada consulta para que mudanças de preço valham sem reiniciar o servidor.
function tabelaPrecos() {
  return JSON.parse(fs.readFileSync(ARQ_PRECOS, 'utf8'));
}

// As APIs públicas limitam requisições; guarda cada CNPJ por 1 hora.
const cache = new Map();
const CACHE_MS = 60 * 60 * 1000;

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '10kb' }));
app.use('/api/', rateLimit({ windowMs: 60 * 1000, limit: 30 }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/empresa/:cnpj', async (req, res) => {
  const c = cnpj.limpa(req.params.cnpj);
  if (!cnpj.valido(c)) return res.status(400).json({ erro: 'CNPJ inválido. Confira os números digitados.' });

  try {
    let emp = cache.get(c);
    if (!emp || Date.now() - emp.em > CACHE_MS) {
      const dados = await buscaEmpresa(c);
      if (!dados) return res.status(404).json({ erro: 'CNPJ não encontrado na Receita Federal.' });
      emp = { dados, em: Date.now() };
      cache.set(c, emp);
    }
    const tabela = tabelaPrecos();
    const { regime, itens } = diagnostico(emp.dados);
    res.json({
      empresa: { ...emp.dados, cnpjFormatado: cnpj.formata(c), regime },
      orcamento: orcamento(itens, tabela),
      escritorio: tabela.escritorio,
    });
  } catch (err) {
    console.error('[consulta]', c, err.message);
    res.status(502).json({ erro: 'Não conseguimos consultar a Receita agora. Tente de novo em alguns minutos.' });
  }
});

// Guarda quem pediu contato, para o escritório retornar mesmo se a pessoa não chamar no WhatsApp.
app.post('/api/contato', (req, res) => {
  const { nome, telefone, cnpj: doc, servicos } = req.body || {};
  if (!nome || !telefone) return res.status(400).json({ erro: 'Informe nome e telefone.' });
  const registro = {
    em: new Date().toISOString(),
    nome: String(nome).slice(0, 120),
    telefone: String(telefone).replace(/\D/g, '').slice(0, 15),
    cnpj: cnpj.limpa(doc).slice(0, 14),
    servicos: Array.isArray(servicos) ? servicos.map(String).slice(0, 30) : [],
  };
  fs.appendFile(ARQ_CONTATOS, JSON.stringify(registro) + '\n', (err) => {
    if (err) {
      console.error('[contato]', err.message);
      return res.status(500).json({ erro: 'Não foi possível registrar agora.' });
    }
    res.json({ ok: true });
  });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Consulta de empresas rodando em http://localhost:${PORT}`));
}

module.exports = app;
