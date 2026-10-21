// Consulta o índice da dívida ativa (gerado por atualiza.js). Busca binária lendo direto
// do arquivo (o índice tem centenas de MB, não vale carregar na memória); reabre sozinho
// quando o índice é atualizado.
const fs = require('fs');
const path = require('path');
const { DADOS_DIR, TAM_REGISTRO, TIPOS } = require('./formato');

let aberto = { fd: null, n: 0, meta: null, mtime: 0 };
const reg = Buffer.alloc(TAM_REGISTRO);

function indice() {
  const arq = path.join(DADOS_DIR, 'pgfn.bin');
  let st;
  try { st = fs.statSync(arq); } catch { return null; }
  if (st.mtimeMs !== aberto.mtime) {
    if (aberto.fd !== null) fs.closeSync(aberto.fd);
    aberto = {
      fd: fs.openSync(arq, 'r'),
      n: st.size / TAM_REGISTRO,
      meta: JSON.parse(fs.readFileSync(path.join(DADOS_DIR, 'pgfn.json'), 'utf8')),
      mtime: st.mtimeMs,
    };
  }
  return aberto;
}

function le(idx, i) {
  fs.readSync(idx.fd, reg, 0, TAM_REGISTRO, i * TAM_REGISTRO);
  return reg;
}

function primeiroMaiorOuIgual(idx, alvo) {
  let lo = 0;
  let hi = idx.n;
  while (lo < hi) {
    const meio = (lo + hi) >>> 1;
    if (le(idx, meio).readDoubleLE(0) < alvo) lo = meio + 1; else hi = meio;
  }
  return lo;
}

// A dívida é da pessoa jurídica: soma matriz e filiais (mesma raiz de 8 dígitos).
function dividaAtiva(cnpj14) {
  const idx = indice();
  if (!idx || !/^\d{14}$/.test(cnpj14)) return null;
  const raiz = Number(cnpj14.slice(0, 8)) * 1e6;
  const r = { trimestre: idx.meta.trimestre, total: 0, regularizado: 0, inscricoes: 0, ajuizadas: 0, tipos: [] };
  let bits = 0;
  for (let i = primeiroMaiorOuIgual(idx, raiz); i < idx.n; i++) {
    const b = le(idx, i);
    if (b.readDoubleLE(0) >= raiz + 1e6) break;
    r.total += b.readDoubleLE(8);
    r.regularizado += b.readDoubleLE(16);
    r.inscricoes += b.readUInt32LE(24);
    r.ajuizadas += b.readUInt32LE(28);
    bits |= b.readUInt8(32);
  }
  if (bits & TIPOS.naoPrevidenciario) r.tipos.push('tributos federais');
  if (bits & TIPOS.previdenciario) r.tipos.push('INSS');
  if (bits & TIPOS.fgts) r.tipos.push('FGTS');
  r.total = Math.round(r.total * 100) / 100;
  r.regularizado = Math.round(r.regularizado * 100) / 100;
  r.emCobranca = Math.round((r.total - r.regularizado) * 100) / 100;
  return r;
}

function info() {
  const idx = indice();
  return idx ? idx.meta : null;
}

module.exports = { dividaAtiva, info };
