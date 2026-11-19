// Gera XMLs de NF-e sintéticos para os testes da análise de recuperação
function item({ ncm, cfop = '5102', valor, csosn = '102', cstPis = '49', desc = 'Produto' }) {
  return `<det nItem="1"><prod><cProd>1</cProd><xProd>${desc}</xProd><NCM>${ncm}</NCM><CFOP>${cfop}</CFOP><vProd>${valor.toFixed(2)}</vProd></prod>`
    + `<imposto><ICMS><ICMSSN${csosn}><orig>0</orig><CSOSN>${csosn}</CSOSN></ICMSSN${csosn}></ICMS><PIS><PISOutr><CST>${cstPis}</CST></PISOutr></PIS></imposto></det>`;
}

function nfe({ chave, cnpj = '12345678000195', dest = '', data, tpNF = 1, itens }) {
  return `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe${chave}" versao="4.00">`
    + `<ide><mod>55</mod><tpNF>${tpNF}</tpNF><finNFe>1</finNFe><dhEmi>${data}T10:00:00-03:00</dhEmi></ide><emit><CNPJ>${cnpj}</CNPJ></emit>${dest ? `<dest><CNPJ>${dest}</CNPJ></dest>` : ''}`
    + itens.map(item).join('') + '</infNFe></NFe></nfeProc>';
}

function cancelamento(chave) {
  return `<?xml version="1.0"?><procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe"><evento><infEvento><tpEvento>110111</tpEvento><chNFe>${chave}</chNFe></infEvento></evento></procEventoNFe>`;
}

module.exports = { nfe, cancelamento };

// Certificado A1 de teste (autoassinado), no formato .pfx
function pfxTeste({ cnpj = '12345678000195', senha = 'senha123', dias = 365, cpf = '', nomeTitular = 'FULANO DE TAL' } = {}) {
  const forge = require('node-forge');
  const chaves = forge.pki.rsa.generateKeyPair(1024);
  const c = forge.pki.createCertificate();
  c.publicKey = chaves.publicKey;
  c.serialNumber = '01';
  c.validity.notBefore = new Date(Date.now() - 86400000);
  c.validity.notAfter = new Date(Date.now() + dias * 86400000);
  const nome = [{ name: 'commonName', value: cpf ? `${nomeTitular}:${cpf}` : `EMPRESA TESTE LTDA:${cnpj}` }];
  c.setSubject(nome); c.setIssuer(nome);
  c.sign(chaves.privateKey);
  const p12 = forge.pkcs12.toPkcs12Asn1(chaves.privateKey, [c], senha, { algorithm: '3des' });
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary');
}
module.exports.pfxTeste = pfxTeste;
