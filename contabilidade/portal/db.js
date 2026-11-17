// Banco simples em JSON (um arquivo no volume persistente). Suficiente para o começo do
// portal; se crescer muito, troque por Postgres mantendo as mesmas funções.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DADOS_DIR } = require('../pgfn/formato');

const ARQ = process.env.ARQ_PORTAL || path.join(DADOS_DIR, 'portal.json');
const COLECOES = ['usuarios', 'sessoes', 'notas', 'orcamentos', 'analises'];

let dados = null;
let gravando = null;

function carrega() {
  if (dados) return dados;
  try {
    dados = JSON.parse(fs.readFileSync(ARQ, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    dados = {};
  }
  for (const c of COLECOES) dados[c] = dados[c] || [];
  return dados;
}

// Grava em arquivo temporário e renomeia, para nunca deixar o banco pela metade.
function grava() {
  if (gravando) return;
  gravando = setImmediate(() => {
    gravando = null;
    fs.mkdirSync(path.dirname(ARQ), { recursive: true });
    fs.writeFileSync(ARQ + '.tmp', JSON.stringify(dados));
    fs.renameSync(ARQ + '.tmp', ARQ);
  });
}

const id = () => crypto.randomUUID();

module.exports = {
  lista: (col, filtro = () => true) => carrega()[col].filter(filtro),
  acha: (col, filtro) => carrega()[col].find(filtro) || null,
  insere(col, obj) {
    const reg = { id: id(), criadoEm: new Date().toISOString(), ...obj };
    carrega()[col].push(reg);
    grava();
    return reg;
  },
  atualiza(col, idReg, patch) {
    const reg = carrega()[col].find((r) => r.id === idReg);
    if (!reg) return null;
    Object.assign(reg, patch, { atualizadoEm: new Date().toISOString() });
    grava();
    return reg;
  },
  remove(col, filtro) {
    const d = carrega();
    const antes = d[col].length;
    d[col] = d[col].filter((r) => !filtro(r));
    if (d[col].length !== antes) grava();
  },
  // Para os testes: começa de um banco vazio em outro arquivo
  _reinicia() { dados = null; },
  ARQ,
};
