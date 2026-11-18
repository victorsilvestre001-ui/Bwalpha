// Emissão direta na NFS-e Padrão Nacional (Sefin Nacional / Receita Federal), sem intermediário.
// Usa o certificado A1 que a empresa já conectou no site (portal/certificado.js) para:
//   - assinar a DPS (XMLDSig envelopado, C14N, RSA-SHA256)
//   - autenticar a conexão (TLS mútuo)
// Endpoints (Manual dos Contribuintes - API do Emissor Público Nacional):
//   POST /nfse                        { dpsXmlGZipB64 }  -> 201 { chaveAcesso, nfseXmlGZipB64, ... }
//   GET  /dps/{idDps}                 chave da NFS-e gerada por uma DPS (para retomar envio interrompido)
//   POST /nfse/{chave}/eventos        { pedidoRegistroEventoXmlGZipB64 } (cancelamento: evento 101101)
//   ADN  GET /danfse/{chave}          PDF da nota
// Leiaute: esquemas XSD v1.01 (produção 2026-02-09). Na produção restrita (homologação) o leiaute
// traz o campo obrigatório finNFSe, que a produção ainda não tem.
// Variáveis: NFSE_NACIONAL=1 liga; NFSE_AMBIENTE=homologacao usa a produção restrita.
const https = require('https');
const zlib = require('zlib');
const crypto = require('crypto');
const forge = require('node-forge');

const NS = 'http://www.sped.fazenda.gov.br/nfse';
const NS_DS = 'http://www.w3.org/2000/09/xmldsig#';
const VERSAO = '1.01';
const VER_APLIC = 'VJ-Portal-1.0';

// Ambiente padrão (variáveis); cada empresa pode ter o seu em fiscal.emissao (desligada | homologacao | producao)
const homologacao = () => process.env.NFSE_AMBIENTE === 'homologacao';
const ligado = () => process.env.NFSE_NACIONAL === '1';
const URLS = (homolog) => (homolog
  ? { sefin: 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional', adn: 'https://adn.producaorestrita.nfse.gov.br' }
  : { sefin: 'https://sefin.nfse.gov.br/SefinNacional', adn: 'https://adn.nfse.gov.br' });

class ErroNfse extends Error {
  constructor(msg, { status, erros, rejeitada } = {}) { super(msg); this.status = status; this.erros = erros || []; this.rejeitada = !!rejeitada; }
}

// ---------- XML ----------
// Texto escapado como na forma canônica (C14N): só &, < e > (e CR). Assim o XML que montamos já é canônico.
const escTxt = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#xD;');
const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/\t/g, '&#x9;').replace(/\n/g, '&#xA;').replace(/\r/g, '&#xD;');
// Remove caracteres que o leiaute não aceita e espaços repetidos
const limpa = (s, max) => String(s || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, max);

// el('a', [el('b', 'x')]) -> <a><b>x</b></a>; valores null/undefined/'' são omitidos
function el(nome, conteudo, attrs = '') {
  if (conteudo === null || conteudo === undefined || conteudo === '') return '';
  const dentro = Array.isArray(conteudo) ? conteudo.join('') : escTxt(conteudo);
  if (Array.isArray(conteudo) && !dentro) return '';
  return `<${nome}${attrs}>${dentro}</${nome}>`;
}

const dec2 = (v) => {
  const n = Math.round(Number(v) * 100) / 100;
  if (!(n >= 0)) throw new ErroNfse('Valor inválido.');
  return n === 0 ? '0' : n.toFixed(2);
};

// Data/hora no fuso de Brasília (-03:00), sem milissegundos: 2026-11-18T10:15:00-03:00
function dataHoraBrasilia(d) {
  const local = new Date(d.getTime() - 3 * 3600 * 1000);
  return local.toISOString().slice(0, 19) + '-03:00';
}

// % aproximado dos tributos do Simples para a nota (padrão 6,00%: 1ª faixa do Anexo III)
function pctSimples(v) {
  const n = Math.round(Number(String(v == null || v === '' ? '6' : v).replace(',', '.')) * 100) / 100;
  if (!(n > 0 && n < 100)) throw new ErroNfse('Alíquota do Simples inválida nos Dados da nota (use um valor entre 0,01 e 99,99).');
  return n.toFixed(2);
}

function idDps({ codigoMunicipio, cnpj, serie, numero }) {
  return `DPS${String(codigoMunicipio).padStart(7, '0')}2${String(cnpj).padStart(14, '0')}${String(serie).padStart(5, '0')}${String(numero).padStart(15, '0')}`;
}

// Situação no Simples (opSimpNac): 1 não optante, 2 MEI, 3 ME/EPP
function opSimpNac(empresa) {
  if (!empresa) return 1;
  if (empresa.mei) return 2;
  return empresa.simples ? 3 : 1;
}

// Monta o XML da DPS (sem assinatura). Devolve { xml, id }.
function montaDps(nota, prestador, { agora = new Date(), ambiente = 1 } = {}) {
  const f = prestador.fiscal || {};
  if (!/^\d{7}$/.test(String(f.codigoMunicipio || ''))) throw new ErroNfse('Falta o código IBGE do município da empresa (Dados da nota no /admin).');
  if (!/^\d{6}$/.test(String(f.codigoServico || ''))) throw new ErroNfse('Falta o código de tributação nacional do serviço (Dados da nota no /admin).');
  const serie = String(Number(f.serieDps || 1));
  const numero = String(Number(nota.numeroDps));
  if (!(Number(numero) >= 1)) throw new ErroNfse('Número da DPS inválido.');
  const id = idDps({ codigoMunicipio: f.codigoMunicipio, cnpj: prestador.cnpj, serie, numero });
  const dh = dataHoraBrasilia(new Date(agora.getTime() - 60 * 1000)); // 1 min antes: evita "data futura" por diferença de relógio
  const op = opSimpNac(prestador.empresa);
  const t = nota.tomador || {};
  const toma = t.cnpj || t.cpf ? el('toma', [
    t.cnpj ? el('CNPJ', t.cnpj) : el('CPF', t.cpf),
    el('xNome', limpa(t.nome, 300) || null),
    el('email', limpa(t.email, 80) || null),
  ]) : '';
  const infDps = [
    el('tpAmb', String(ambiente)),
    el('dhEmi', dh),
    el('verAplic', VER_APLIC),
    el('serie', serie),
    el('nDPS', numero),
    el('dCompet', dh.slice(0, 10)),
    el('tpEmit', '1'),
    ambiente === 2 ? el('finNFSe', '0') : '', // só existe no leiaute da produção restrita (RTC)
    el('cLocEmi', String(f.codigoMunicipio)),
    el('prest', [
      el('CNPJ', prestador.cnpj),
      el('regTrib', [
        el('opSimpNac', String(op)),
        op === 3 ? el('regApTribSN', '1') : '',
        el('regEspTrib', String(Number(f.regimeEspecial || 0))),
      ]),
    ]),
    toma,
    el('serv', [
      el('locPrest', [el('cLocPrestacao', String(f.codigoMunicipio))]),
      el('cServ', [
        el('cTribNac', String(f.codigoServico)),
        el('cNBS', f.codigoNbs && /^\d{9}$/.test(f.codigoNbs) ? f.codigoNbs : null),
        el('xDescServ', limpa(nota.descricao, 2000)),
      ]),
    ]),
    el('valores', [
      el('vServPrest', [el('vServ', dec2(nota.valor))]),
      el('trib', [
        el('tribMun', [el('tribISSQN', '1'), el('tpRetISSQN', '1')]),
        // ME/EPP do Simples (opSimpNac 3) não pode usar indTotTrib (rejeição E0712): informa o % aproximado
        // dos tributos pela alíquota do Simples (pTotTribSN). MEI e não optantes usam indTotTrib=0.
        el('totTrib', [op === 3 ? el('pTotTribSN', pctSimples(f.aliquotaSN)) : el('indTotTrib', '0')]),
      ]),
    ]),
  ].join('');
  return { id, xml: `<DPS xmlns="${NS}" versao="${VERSAO}"><infDPS Id="${id}">${infDps}</infDPS></DPS>` };
}

// ---------- Certificado ----------
function abreCertificado(pfx, senha) {
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.createBuffer(pfx.toString('binary'))), false, senha);
  const sacos = [
    ...((p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]) || []),
    ...((p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]) || []),
  ];
  const certs = ((p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]) || []).map((b) => b.cert).filter(Boolean);
  const cert = certs.find((c) => !(c.getExtension('basicConstraints') || {}).cA) || certs[0];
  if (!sacos.length || !cert) throw new ErroNfse('O certificado não tem a chave privada.');
  return {
    chavePem: forge.pki.privateKeyToPem(sacos[0].key),
    certB64: forge.util.encode64(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()),
  };
}

// ---------- Assinatura XMLDSig ----------
// Assina o elemento com Id=idRef dentro de xml. O XML é montado por nós já na forma canônica,
// então a forma canônica do elemento é o próprio trecho com o xmlns herdado da raiz.
function assina(xml, { tag, idRef, chavePem, certB64 }) {
  const ini = xml.indexOf(`<${tag} Id="${idRef}">`);
  const fimTag = `</${tag}>`;
  const fim = xml.indexOf(fimTag, ini);
  if (ini < 0 || fim < 0) throw new ErroNfse('Elemento a assinar não encontrado.');
  const trecho = xml.slice(ini, fim + fimTag.length);
  const canonico = trecho.replace(`<${tag} Id=`, `<${tag} xmlns="${NS}" Id=`);
  const digest = crypto.createHash('sha256').update(canonico, 'utf8').digest('base64');
  const signedInfo = `<SignedInfo xmlns="${NS_DS}">`
    + '<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></CanonicalizationMethod>'
    + '<SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"></SignatureMethod>'
    + `<Reference URI="#${idRef}">`
    + '<Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform>'
    + '<Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></Transform></Transforms>'
    + '<DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></DigestMethod>'
    + `<DigestValue>${digest}</DigestValue></Reference></SignedInfo>`;
  const valor = crypto.createSign('RSA-SHA256').update(signedInfo, 'utf8').sign(chavePem, 'base64');
  const assinatura = `<Signature xmlns="${NS_DS}">${signedInfo}<SignatureValue>${valor}</SignatureValue>`
    + `<KeyInfo><X509Data><X509Certificate>${certB64}</X509Certificate></X509Data></KeyInfo></Signature>`;
  // A assinatura vai logo depois do elemento assinado, dentro da raiz
  return xml.slice(0, fim + fimTag.length) + assinatura + xml.slice(fim + fimTag.length);
}

// ---------- Transporte ----------
const gz64 = (txt) => zlib.gzipSync(Buffer.from(txt, 'utf8')).toString('base64');
const desgz64 = (b64) => zlib.gunzipSync(Buffer.from(String(b64), 'base64')).toString('utf8');

function requisicao({ url, method = 'GET', body, pfx, senha, binario = false }) {
  return new Promise((resolve, reject) => {
    const dados = body ? Buffer.from(JSON.stringify(body), 'utf8') : null;
    const headers = { Accept: binario ? 'application/pdf' : 'application/json' };
    if (dados) Object.assign(headers, { 'Content-Type': 'application/json', 'Content-Length': dados.length });
    const req = https.request(url, { method, headers, pfx, passphrase: senha, timeout: 60000 }, (res) => {
      const partes = [];
      res.on('data', (c) => partes.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(partes);
        if (binario) return resolve({ status: res.statusCode, buf, tipo: res.headers['content-type'] || '' });
        let json = null;
        try { json = buf.length ? JSON.parse(buf.toString('utf8')) : null; } catch { json = { bruto: buf.toString('utf8').slice(0, 500) }; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('timeout', () => { const e = new ErroNfse('A Receita não respondeu a tempo. Tente de novo em alguns minutos.'); e.semResposta = true; req.destroy(e); });
    req.on('error', reject);
    if (dados) req.write(dados);
    req.end();
  });
}

// Lê a lista de erros da resposta, seja qual for a grafia dos campos
function mensagensErro(json) {
  if (!json) return [];
  const lista = json.erros || json.Erros || json.erro || json.mensagens || (json.Codigo || json.codigo ? [json] : []);
  return (Array.isArray(lista) ? lista : [lista]).map((e) => {
    if (typeof e === 'string') return e;
    const cod = e.Codigo || e.codigo || '';
    const desc = e.Descricao || e.descricao || e.mensagem || e.Mensagem || '';
    const comp = e.Complemento || e.complemento || '';
    return [cod, desc, comp].filter(Boolean).join(' - ');
  }).filter(Boolean);
}

// ---------- Operações ----------
let transporte = requisicao; // trocado nos testes

async function emite(nota, prestador, { pfx, senha }, { homolog = false } = {}) {
  const cert = abreCertificado(pfx, senha);
  const { id, xml } = montaDps(nota, prestador, { ambiente: homolog ? 2 : 1 });
  const assinado = assina(`<?xml version="1.0" encoding="UTF-8"?>${xml}`, { tag: 'infDPS', idRef: id, ...cert });
  const r = await transporte({ url: `${URLS(homolog).sefin}/nfse`, method: 'POST', body: { dpsXmlGZipB64: gz64(assinado) }, pfx, senha });
  if ((r.status === 200 || r.status === 201) && r.json && r.json.chaveAcesso) {
    return { status: 'emitida', idDps: id, chaveAcesso: r.json.chaveAcesso, numero: numeroDaNfse(r.json.nfseXmlGZipB64) || '', nfseXml: r.json.nfseXmlGZipB64 || '', alertas: mensagensErro({ erros: r.json.alertas || [] }), emitidaEm: new Date().toISOString() };
  }
  const msgs = mensagensErro(r.json);
  // Rejeitada pela Receita (regra de negócio): a DPS não virou nota e o número pode ser reaproveitado? Não: guardamos o erro.
  throw new ErroNfse(msgs.join('; ') || `A Receita respondeu ${r.status}.`, { status: r.status, erros: msgs, rejeitada: r.status >= 400 && r.status < 500 });
}

// Número da NFS-e dentro do XML devolvido (<nNFSe>)
function numeroDaNfse(b64) {
  if (!b64) return '';
  try { return (desgz64(b64).match(/<nNFSe>(\d+)<\/nNFSe>/) || [])[1] || ''; } catch { return ''; }
}

// Retoma uma emissão interrompida (sem resposta): pergunta à Receita se a DPS virou nota
async function consultaDps(idDps, { pfx, senha }, { homolog = false } = {}) {
  const r = await transporte({ url: `${URLS(homolog).sefin}/dps/${idDps}`, pfx, senha });
  if (r.status === 200 && r.json && r.json.chaveAcesso) return { chaveAcesso: r.json.chaveAcesso };
  return null;
}

async function danfse(chave, { pfx, senha }, { homolog = false } = {}) {
  const r = await transporte({ url: `${URLS(homolog).adn}/danfse/${chave}`, pfx, senha, binario: true });
  if (r.status === 200 && r.buf && r.buf.length > 500 && r.buf.subarray(0, 4).toString() === '%PDF') return r.buf;
  throw new ErroNfse(`DANFSe indisponível (${r.status}).`);
}

function montaCancelamento({ chave, cnpjAutor, codigo = '9', motivo, agora = new Date(), ambiente = 1 }) {
  if (!/^\d{50}$/.test(String(chave))) throw new ErroNfse('Chave de acesso inválida.');
  const m = limpa(motivo, 255);
  if (m.length < 15) throw new ErroNfse('O motivo do cancelamento precisa ter pelo menos 15 caracteres.');
  const id = `PRE${chave}101101`;
  const inf = [
    el('tpAmb', String(ambiente)),
    el('verAplic', VER_APLIC),
    el('dhEvento', dataHoraBrasilia(new Date(agora.getTime() - 60 * 1000))),
    el('CNPJAutor', cnpjAutor),
    el('chNFSe', chave),
    el('e101101', [el('xDesc', 'Cancelamento de NFS-e'), el('cMotivo', String(codigo)), el('xMotivo', m)]),
  ].join('');
  return { id, xml: `<pedRegEvento xmlns="${NS}" versao="${VERSAO}"><infPedReg Id="${id}">${inf}</infPedReg></pedRegEvento>` };
}

async function cancela(nota, prestador, justificativa, { pfx, senha }, { homolog = false } = {}) {
  const cert = abreCertificado(pfx, senha);
  const { id, xml } = montaCancelamento({ chave: nota.chaveAcesso, cnpjAutor: prestador.cnpj, motivo: justificativa, ambiente: homolog ? 2 : 1 });
  const assinado = assina(`<?xml version="1.0" encoding="UTF-8"?>${xml}`, { tag: 'infPedReg', idRef: id, ...cert });
  const r = await transporte({ url: `${URLS(homolog).sefin}/nfse/${nota.chaveAcesso}/eventos`, method: 'POST', body: { pedidoRegistroEventoXmlGZipB64: gz64(assinado) }, pfx, senha });
  if (r.status === 200 || r.status === 201) return { status: 'cancelada', canceladaEm: new Date().toISOString() };
  throw new ErroNfse(mensagensErro(r.json).join('; ') || `A Receita respondeu ${r.status}.`, { status: r.status });
}

module.exports = {
  ligado, homologacao, montaDps, montaCancelamento, assina, abreCertificado, emite, consultaDps, danfse, cancela,
  idDps, opSimpNac, mensagensErro, numeroDaNfse, gz64, desgz64, ErroNfse,
  _setTransporte: (t) => { transporte = t || requisicao; },
};
