// Certificado digital A1 do cliente: leitura, conferência e guarda criptografada.
// O arquivo e a senha ficam cifrados (AES-256-GCM) no volume; a chave vem de CERT_CHAVE
// (variável do Railway), nunca do código. Usado para consultar as notas da empresa e, com
// NFSE_NACIONAL=1, para emitir NFS-e no Padrão Nacional (portal/nfse-nacional.js).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const forge = require('node-forge');
const { DADOS_DIR } = require('../pgfn/formato');

const PASTA = path.join(DADOS_DIR, 'certificados');
const arq = (id) => path.join(PASTA, `${String(id).replace(/[^\w-]/g, '')}.bin`);
const chave = () => (process.env.CERT_CHAVE ? crypto.createHash('sha256').update(process.env.CERT_CHAVE).digest() : null);
const ativo = () => !!chave();

class ErroCertificado extends Error {}

// Abre o .pfx/.p12 e devolve os dados públicos (titular, CNPJ, validade)
function le(pfx, senha) {
  let p12;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.createBuffer(pfx.toString('binary'))), false, senha);
  } catch {
    throw new ErroCertificado('Não conseguimos abrir o certificado: confira a senha e se o arquivo é o .pfx (ou .p12) do certificado A1.');
  }
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []).map((b) => b.cert).filter(Boolean);
  const temChave = (p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []).length
    || (p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []).length;
  // O certificado da empresa é o que não é autoridade certificadora
  const cert = certs.find((c) => !(c.getExtension('basicConstraints') || {}).cA) || certs[0];
  if (!cert || !temChave) throw new ErroCertificado('O arquivo não traz o certificado com a chave privada. Exporte o A1 novamente "com a chave privada".');
  const cn = (cert.subject.getField('CN') || {}).value || '';
  let cnpj = (cn.match(/:(\d{14})\b/) || [])[1];
  if (!cnpj) {
    // ICP-Brasil: CNPJ no "otherName" 2.16.76.1.3.3 do nome alternativo
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const pos = der.indexOf(forge.asn1.oidToDer('2.16.76.1.3.3').getBytes());
    if (pos >= 0) cnpj = (der.slice(pos, pos + 40).match(/\d{14}/) || [])[0];
  }
  return { titular: cn.split(':')[0].trim() || cn, cnpj: cnpj || '', validoDe: cert.validity.notBefore.toISOString(), validoAte: cert.validity.notAfter.toISOString() };
}

function confere(pfx, senha, cnpjEmpresa) {
  const info = le(pfx, senha);
  if (!info.cnpj) throw new ErroCertificado('Este certificado não é de empresa (e-CNPJ). Envie o certificado A1 do CNPJ.');
  if (info.cnpj.slice(0, 8) !== String(cnpjEmpresa).slice(0, 8)) throw new ErroCertificado(`Este certificado é do CNPJ ${info.cnpj}, não da empresa desta conta.`);
  if (Date.parse(info.validoAte) < Date.now()) throw new ErroCertificado(`Este certificado venceu em ${new Date(info.validoAte).toLocaleDateString('pt-BR')}. Renove e envie o novo.`);
  return info;
}

function guarda(id, pfx, senha) {
  const k = chave();
  if (!k) throw new ErroCertificado('Recurso ainda não ativado no servidor.');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const corpo = Buffer.concat([c.update(JSON.stringify({ pfx: pfx.toString('base64'), senha })), c.final()]);
  fs.mkdirSync(PASTA, { recursive: true, mode: 0o700 });
  fs.writeFileSync(arq(id), Buffer.concat([iv, c.getAuthTag(), corpo]), { mode: 0o600 });
}

function carrega(id) {
  const k = chave();
  if (!k) return null;
  let b;
  try { b = fs.readFileSync(arq(id)); } catch { return null; }
  const d = crypto.createDecipheriv('aes-256-gcm', k, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  const j = JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'));
  return { pfx: Buffer.from(j.pfx, 'base64'), senha: j.senha };
}

const apaga = (id) => fs.rmSync(arq(id), { force: true });

module.exports = { ativo, le, confere, guarda, carrega, apaga, ErroCertificado };
