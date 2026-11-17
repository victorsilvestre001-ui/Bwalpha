// Robô que baixa as notas da empresa com o certificado A1, pelos serviços oficiais:
//  - NF-e recebidas (compras): Distribuição de DF-e do Ambiente Nacional (SOAP, NT 2014.002).
//    Sem manifestar a nota, vem o "resumo" (emitente, data, valor), que basta para os totais.
//  - NFS-e do padrão nacional (emitidas e tomadas): API do Ambiente de Dados Nacional (ADN).
// Guarda só um resumo de cada nota em DADOS_DIR/notas-capturadas/<id>.json.
const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const { XMLParser } = require('fast-xml-parser');
const db = require('./db');
const cert = require('./certificado');
const ax = require('./analise-xml');
const { DADOS_DIR } = require('../pgfn/formato');

const PASTA = path.join(DADOS_DIR, 'notas-capturadas');
const URL_NFE = 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx';
const URL_ADN = 'https://adn.nfse.gov.br/contribuintes/DFe';
const UF = { RO: 11, AC: 12, AM: 13, RR: 14, PA: 15, AP: 16, TO: 17, MA: 21, PI: 22, CE: 23, RN: 24, PB: 25, PE: 26, AL: 27, SE: 28, BA: 29, MG: 31, ES: 32, RJ: 33, SP: 35, PR: 41, SC: 42, RS: 43, MS: 50, MT: 51, GO: 52, DF: 53 };
const HORA = 60 * 60 * 1000;
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', removeNSPrefix: true, parseTagValue: false, isArray: (n) => n === 'docZip' });
const raiz = (c) => String(c || '').replace(/\D/g, '').slice(0, 8);
const dezNsu = (n) => String(n || 0).padStart(15, '0');
const gunzip = (b64) => zlib.gunzipSync(Buffer.from(String(b64), 'base64')).toString('utf8');

const arq = (id) => path.join(PASTA, `${String(id).replace(/[^\w-]/g, '')}.json`);
function leBase(id) {
  try { return JSON.parse(fs.readFileSync(arq(id), 'utf8')); } catch { return { nfe: { ultNSU: '0' }, nfse: { ultNSU: 0 }, notas: {}, canceladas: [] }; }
}
function gravaBase(id, b) {
  fs.mkdirSync(PASTA, { recursive: true });
  fs.writeFileSync(arq(id) + '.tmp', JSON.stringify(b));
  fs.renameSync(arq(id) + '.tmp', arq(id));
}

// Requisição HTTPS com o certificado do cliente (autenticação mútua)
function https_({ url, method = 'GET', headers = {}, body, pfx, senha }) {
  return new Promise((ok, falha) => {
    const req = https.request(url, { method, headers, pfx, passphrase: senha, timeout: 60000 }, (res) => {
      const partes = [];
      res.on('data', (c) => partes.push(c));
      res.on('end', () => ok({ status: res.statusCode, texto: Buffer.concat(partes).toString('utf8') }));
    });
    req.on('timeout', () => req.destroy(new Error('O serviço oficial demorou para responder.')));
    req.on('error', falha);
    if (body) req.write(body);
    req.end();
  });
}

function envelopeNfe({ cnpj, uf, ultNSU }) {
  return '<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">'
    + '<soap12:Body><nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDadosMsg>'
    + `<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><tpAmb>1</tpAmb><cUFAutor>${UF[uf] || 35}</cUFAutor><CNPJ>${cnpj}</CNPJ><distNSU><ultNSU>${dezNsu(ultNSU)}</ultNSU></distNSU></distDFeInt>`
    + '</nfeDadosMsg></nfeDistDFeInteresse></soap12:Body></soap12:Envelope>';
}

// Transforma cada documento recebido no resumo usado pelo simulador
function docNfe(schema, xml, cnpj) {
  if (/^resNFe/.test(schema)) {
    const r = parser.parse(xml).resNFe || {};
    return { tipo: 'nfe', chave: String(r.chNFe || ''), mes: String(r.dhEmi || '').slice(0, 7), emit: raiz(r.CNPJ), dest: raiz(cnpj), saida: String(r.tpNF) === '1' && String(r.cSitNFe || '1') === '1', valor: Number(r.vNF) || 0 };
  }
  if (/^procNFe/.test(schema)) return ax.resumoNota(xml);
  if (/^(resEvento|procEventoNFe)/.test(schema)) {
    const x = parser.parse(xml);
    const ev = x.resEvento || ((x.procEventoNFe || {}).evento || {}).infEvento || {};
    if (String(ev.tpEvento) === '110111') return { tipo: 'cancelamento', chave: String(ev.chNFe || '') };
  }
  return null;
}

async function buscaNfe(base, { cnpj, uf, pfx, senha }, transporte) {
  if (base.nfe.esperarAte && Date.now() < Date.parse(base.nfe.esperarAte)) return { novas: 0, aviso: 'aguardando o intervalo pedido pela Receita' };
  let novas = 0;
  for (let volta = 0; volta < 30; volta++) {
    const r = await transporte({ url: URL_NFE, method: 'POST', headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' }, body: envelopeNfe({ cnpj, uf, ultNSU: base.nfe.ultNSU }), pfx, senha });
    if (r.status >= 400 && !/retDistDFeInt/.test(r.texto)) throw new Error(`Serviço de NF-e respondeu ${r.status}.`);
    const corpo = parser.parse(r.texto);
    const ret = JSON.stringify(corpo).includes('retDistDFeInt') ? acha(corpo, 'retDistDFeInt') : null;
    if (!ret) throw new Error('Resposta inesperada do serviço de NF-e.');
    const cStat = String(ret.cStat);
    if (cStat === '656') { base.nfe.esperarAte = new Date(Date.now() + HORA).toISOString(); break; }
    if (cStat === '137') { base.nfe.ultNSU = String(ret.ultNSU || base.nfe.ultNSU); base.nfe.esperarAte = new Date(Date.now() + HORA).toISOString(); break; }
    if (cStat !== '138') throw new Error(`Receita: ${ret.xMotivo || cStat}`);
    for (const d of ((ret.loteDistDFeInt || {}).docZip || [])) {
      const n = docNfe(String(d['@schema'] || ''), gunzip(d['#text']), cnpj);
      if (n) novas += guardaNota(base, n);
    }
    base.nfe.ultNSU = String(ret.ultNSU);
    if (Number(ret.ultNSU) >= Number(ret.maxNSU)) { base.nfe.esperarAte = new Date(Date.now() + HORA).toISOString(); break; }
  }
  return { novas };
}

async function buscaNfse(base, { cnpj, pfx, senha }, transporte) {
  let novas = 0;
  for (let volta = 0; volta < 30; volta++) {
    const proximo = Number(base.nfse.ultNSU || 0) + 1;
    const r = await transporte({ url: `${URL_ADN}/${proximo}?cnpjConsulta=${cnpj}&lote=true`, headers: { Accept: 'application/json' }, pfx, senha });
    if (r.status === 404 || r.status === 204) break;
    if (r.status >= 400) throw new Error(`Serviço de NFS-e respondeu ${r.status}.`);
    let j;
    try { j = JSON.parse(r.texto); } catch { throw new Error('Resposta inesperada do serviço de NFS-e.'); }
    const lote = j.LoteDFe || [];
    if (!lote.length) break;
    for (const d of lote) {
      if (d.ArquivoXml) {
        const n = ax.resumoNota(gunzip(d.ArquivoXml));
        if (n) novas += guardaNota(base, n);
        if (/EVENTO/i.test(d.TipoDocumento || '') && /cancel/i.test(gunzip(d.ArquivoXml)) && d.ChaveAcesso) base.canceladas.push(String(d.ChaveAcesso));
      }
      base.nfse.ultNSU = Math.max(Number(base.nfse.ultNSU || 0), Number(d.NSU) || 0);
    }
  }
  return { novas };
}

function guardaNota(base, n) {
  if (n.tipo === 'cancelamento') { if (n.chave && !base.canceladas.includes(n.chave)) base.canceladas.push(n.chave); return 0; }
  if (!n.chave || base.notas[n.chave]) return 0;
  base.notas[n.chave] = n;
  return 1;
}

function acha(obj, nome) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj[nome]) return obj[nome];
  for (const v of Object.values(obj)) { const a = acha(v, nome); if (a) return a; }
  return null;
}

// Uma rodada para um cliente; devolve o que mudou e grava o estado no cadastro
async function rodaUsuario(u, { transporte = module.exports.transporte } = {}) {
  const c = cert.carrega(u.id);
  if (!c) return null;
  const base = leBase(u.id);
  const dados = { cnpj: u.cnpj, uf: (u.empresa && u.empresa.uf) || 'SP', pfx: c.pfx, senha: c.senha };
  const resultado = { novas: 0, erros: [] };
  for (const [nome, fn] of [['NF-e', buscaNfe], ['NFS-e', buscaNfse]]) {
    try { resultado.novas += (await fn(base, dados, transporte)).novas; } catch (err) {
      console.error('[captura]', u.id, nome, err.message);
      resultado.erros.push(`${nome}: ${amigavel(err.message)}`);
    }
  }
  gravaBase(u.id, base);
  const info = u.certificado || {};
  const patch = { certificado: { ...info, ultimaBusca: new Date().toISOString(), totalNotas: Object.keys(base.notas).length, ultimoErro: resultado.erros.join(' · ') || null } };
  // Aviso de vencimento, uma vez, 30 dias antes
  const dias = Math.ceil((Date.parse(info.validoAte) - Date.now()) / (24 * HORA));
  if (dias <= 30 && !info.avisoVencimento) {
    patch.certificado.avisoVencimento = new Date().toISOString();
    patch.alertas = [{ em: new Date().toISOString(), texto: `Seu certificado digital vence em ${Math.max(0, dias)} dia(s) (${new Date(info.validoAte).toLocaleDateString('pt-BR')}). Renove e envie o novo na Área do Cliente para não parar a busca das notas.` }, ...(u.alertas || [])].slice(0, 30);
  }
  db.atualiza('usuarios', u.id, patch);
  return resultado;
}

// Mensagem que o cliente entende (o detalhe técnico fica no log do servidor)
function amigavel(m) {
  if (/respondeu (401|403)|SSL|certificate|handshake|bad record/i.test(m)) return 'o serviço oficial recusou a conexão com o certificado';
  if (/ECONN|ETIMEDOUT|ENOTFOUND|socket|demorou/i.test(m)) return 'o serviço oficial está fora do ar ou lento';
  if (/^Receita:/.test(m)) return m;
  return 'o serviço oficial respondeu de forma inesperada';
}

function notasDe(id) {
  const b = leBase(id);
  return { notas: Object.values(b.notas), canceladas: b.canceladas };
}

const apaga = (id) => fs.rmSync(arq(id), { force: true });

// Uma vez por hora, roda quem não foi atualizado nas últimas 20 horas
function agenda() {
  const ciclo = async () => {
    for (const u of db.lista('usuarios', (x) => x.certificado && x.certificado.ativo)) {
      if (u.certificado.ultimaBusca && Date.now() - Date.parse(u.certificado.ultimaBusca) < 20 * HORA) continue;
      try { await rodaUsuario(u); } catch (err) { console.error('[captura]', u.id, err.message); }
    }
  };
  setTimeout(ciclo, 60 * 1000);
  setInterval(ciclo, HORA).unref();
}

module.exports = { transporte: https_, rodaUsuario, notasDe, apaga, agenda, envelopeNfe, docNfe };
