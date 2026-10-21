// Baixa os dados abertos da dívida ativa da União (PGFN), soma as inscrições de
// cada CNPJ e grava um índice compacto que o site consulta em milissegundos.
// A PGFN publica um arquivo novo por trimestre.
//
//   node pgfn/atualiza.js                       baixa o trimestre mais recente
//   node pgfn/atualiza.js --zips pasta/         usa zips já baixados (mesmos nomes da PGFN)
//
// Saída em DADOS_DIR (padrão ./dados): pgfn.bin + pgfn.json

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const yauzl = require('yauzl');
const { DADOS_DIR, TAM_REGISTRO, TIPOS } = require('./formato');

const BASE = 'https://dadosabertos.pgfn.gov.br/';
const ARQUIVOS = [
  ['Dados_abertos_Nao_Previdenciario.zip', TIPOS.naoPrevidenciario],
  ['Dados_abertos_Previdenciario.zip', TIPOS.previdenciario],
  ['Dados_abertos_FGTS.zip', TIPOS.fgts],
];
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; ConsultaCNPJ/1.0)' };

function arg(nome) {
  const i = process.argv.indexOf(nome);
  return i > -1 ? process.argv[i + 1] : null;
}

async function trimestreMaisRecente() {
  const r = await fetch(BASE, { headers: UA });
  if (!r.ok) throw new Error(`PGFN respondeu ${r.status}`);
  const lista = [...(await r.text()).matchAll(/href="(\d{4}_trimestre_\d{2})\/"/g)].map((m) => m[1]).sort();
  if (!lista.length) throw new Error('Nenhum trimestre encontrado na página da PGFN');
  return lista[lista.length - 1];
}

async function baixa(url, destino) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${url} respondeu ${r.status}`);
  await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(destino));
}

// Acumuladores em arrays tipados (milhões de CNPJs cabem em poucas centenas de MB).
class Acumulador {
  constructor() {
    this.indice = new Map();
    this.n = 0;
    this.cap = 1 << 20;
    this.aloca(this.cap);
  }
  aloca(cap) {
    const velho = this;
    const novo = {
      cnpj: new Float64Array(cap), total: new Float64Array(cap), regularizado: new Float64Array(cap),
      qtd: new Uint32Array(cap), ajuizadas: new Uint32Array(cap), tipos: new Uint8Array(cap),
    };
    for (const k of Object.keys(novo)) if (velho[k]) novo[k].set(velho[k].subarray(0, this.n));
    Object.assign(this, novo);
    this.cap = cap;
  }
  soma(cnpj, valor, regularizada, ajuizada, tipo) {
    let i = this.indice.get(cnpj);
    if (i === undefined) {
      if (this.n === this.cap) this.aloca(this.cap * 2);
      i = this.n++;
      this.indice.set(cnpj, i);
      this.cnpj[i] = cnpj;
    }
    this.total[i] += valor;
    if (regularizada) this.regularizado[i] += valor;
    this.qtd[i]++;
    if (ajuizada) this.ajuizadas[i]++;
    this.tipos[i] |= tipo;
  }
}

async function processaZip(arquivo, tipo, acc) {
  const zip = await yauzl.openPromise(arquivo);
  let linhas = 0;
  for await (const entrada of zip.eachEntry()) {
    if (!entrada.fileName.endsWith('.csv')) continue;
    const stream = await zip.openReadStreamPromise(entrada);
    stream.setEncoding('latin1');
    let col = null;
    for await (const linha of readline.createInterface({ input: stream, crlfDelay: Infinity })) {
      const f = linha.split(';');
      if (!col) {
        col = Object.fromEntries(f.map((nome, i) => [nome.trim(), i]));
        continue;
      }
      if (f[col.TIPO_PESSOA] !== 'Pessoa jurídica') continue;
      const cnpj = Number(f[col.CPF_CNPJ].replace(/\D/g, ''));
      if (!cnpj) continue;
      const valor = parseFloat(f[col.VALOR_CONSOLIDADO]) || 0;
      // Fora de "Em cobrança" = parcelada/transacionada (Benefício Fiscal), garantida ou suspensa.
      const regularizada = f[col.TIPO_SITUACAO_INSCRICAO] !== 'Em cobrança';
      acc.soma(cnpj, valor, regularizada, f[col.INDICADOR_AJUIZADO] === 'SIM', tipo);
      linhas++;
    }
  }
  zip.close();
  return linhas;
}

function grava(acc, meta) {
  const ordem = Array.from({ length: acc.n }, (_, i) => i).sort((a, b) => acc.cnpj[a] - acc.cnpj[b]);
  const buf = Buffer.alloc(acc.n * TAM_REGISTRO);
  ordem.forEach((i, k) => {
    const o = k * TAM_REGISTRO;
    buf.writeDoubleLE(acc.cnpj[i], o);
    buf.writeDoubleLE(Math.round(acc.total[i] * 100) / 100, o + 8);
    buf.writeDoubleLE(Math.round(acc.regularizado[i] * 100) / 100, o + 16);
    buf.writeUInt32LE(acc.qtd[i], o + 24);
    buf.writeUInt32LE(acc.ajuizadas[i], o + 28);
    buf.writeUInt8(acc.tipos[i], o + 32);
  });
  fs.mkdirSync(DADOS_DIR, { recursive: true });
  // Grava em arquivos temporários e troca de uma vez, para o site nunca ler um índice pela metade.
  fs.writeFileSync(path.join(DADOS_DIR, 'pgfn.bin.tmp'), buf);
  fs.writeFileSync(path.join(DADOS_DIR, 'pgfn.json.tmp'), JSON.stringify(meta, null, 2));
  fs.renameSync(path.join(DADOS_DIR, 'pgfn.bin.tmp'), path.join(DADOS_DIR, 'pgfn.bin'));
  fs.renameSync(path.join(DADOS_DIR, 'pgfn.json.tmp'), path.join(DADOS_DIR, 'pgfn.json'));
}

async function atualiza({ zips } = {}) {
  const inicio = Date.now();
  const trimestre = arg('--trimestre') || (zips ? path.basename(path.resolve(zips)) : await trimestreMaisRecente());
  const pasta = zips || path.join(DADOS_DIR, 'tmp-pgfn');
  fs.mkdirSync(pasta, { recursive: true });
  const acc = new Acumulador();
  let linhas = 0;
  for (const [nome, tipo] of ARQUIVOS) {
    const arquivo = path.join(pasta, nome);
    if (!zips) {
      console.log(`[pgfn] baixando ${trimestre}/${nome}`);
      await baixa(`${BASE}${trimestre}/${nome}`, arquivo);
    }
    console.log(`[pgfn] processando ${nome}`);
    linhas += await processaZip(arquivo, tipo, acc);
    if (!zips) fs.unlinkSync(arquivo);
  }
  const meta = { trimestre, empresas: acc.n, inscricoes: linhas, geradoEm: new Date().toISOString() };
  grava(acc, meta);
  if (!zips) fs.rmSync(pasta, { recursive: true, force: true });
  console.log(`[pgfn] pronto: ${acc.n} empresas, ${linhas} inscrições, ${Math.round((Date.now() - inicio) / 1000)}s, memória ${Math.round(process.memoryUsage().rss / 1e6)} MB`);
  return meta;
}

if (require.main === module) {
  atualiza({ zips: arg('--zips') }).catch((err) => {
    console.error('[pgfn] erro:', err.message);
    process.exit(1);
  });
}

module.exports = { atualiza, trimestreMaisRecente };
