// Gera XMLs de NF-e sintéticos para os testes da análise de recuperação
function item({ ncm, cfop = '5102', valor, csosn = '102', cstPis = '49', desc = 'Produto' }) {
  return `<det nItem="1"><prod><cProd>1</cProd><xProd>${desc}</xProd><NCM>${ncm}</NCM><CFOP>${cfop}</CFOP><vProd>${valor.toFixed(2)}</vProd></prod>`
    + `<imposto><ICMS><ICMSSN${csosn}><orig>0</orig><CSOSN>${csosn}</CSOSN></ICMSSN${csosn}></ICMS><PIS><PISOutr><CST>${cstPis}</CST></PISOutr></PIS></imposto></det>`;
}

function nfe({ chave, cnpj = '12345678000195', data, tpNF = 1, itens }) {
  return `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe${chave}" versao="4.00">`
    + `<ide><mod>55</mod><tpNF>${tpNF}</tpNF><finNFe>1</finNFe><dhEmi>${data}T10:00:00-03:00</dhEmi></ide><emit><CNPJ>${cnpj}</CNPJ></emit>`
    + itens.map(item).join('') + '</infNFe></NFe></nfeProc>';
}

function cancelamento(chave) {
  return `<?xml version="1.0"?><procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe"><evento><infEvento><tpEvento>110111</tpEvento><chNFe>${chave}</chNFe></infEvento></evento></procEventoNFe>`;
}

module.exports = { nfe, cancelamento };
