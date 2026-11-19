// Integra Contador com PROCURADOR (e-CPF de quem tem procuração eletrônica das empresas no e-CAC).
// O contrato continua no CNPJ do escritório; o procurador assina um "Termo de Autorização" (XMLDSig) e o
// serviço AUTENTICAPROCURADOR/ENVIOXMLASSINADO81 (POST /Apoiar) devolve um token, que vai no header
// "autenticar_procurador_token" das próximas requisições, com autorPedidoDados = CPF do procurador.
// Padrão técnico: .../integra-contador-gerenciador/autenticaprocurador/padroes_tecnicos_assinatura_xml/
const crypto = require('crypto');

// Textos fixos exigidos pela Receita/SERPRO (copiados da documentação oficial)
const TERMO = 'Autorizo a empresa CONTRATANTE, identificada neste termo de autorização como DESTINATÁRIO, a executar as requisições dos serviços web disponibilizados pela API INTEGRA CONTADOR, onde terei o papel de AUTOR PEDIDO DE DADOS no corpo da mensagem enviada na requisição do serviço web. Esse termo de autorização está assinado digitalmente com o certificado digital do PROCURADOR ou OUTORGADO DO CONTRIBUINTE responsável, identificado como AUTOR DO PEDIDO DE DADOS.';
const AVISO = 'O acesso a estas informações foi autorizado pelo próprio PROCURADOR ou OUTORGADO DO CONTRIBUINTE, responsável pela informação, via assinatura digital. É dever do destinatário da autorização e consumidor deste acesso observar a adoção de base legal para o tratamento dos dados recebidos conforme artigos 7º ou 11º da LGPD (Lei n.º 13.709, de 14 de agosto de 2018), aos direitos do titular dos dados (art. 9º, 17 e 18, da LGPD) e aos princípios que norteiam todos os tratamentos de dados no Brasil (art. 6º, da LGPD).';
const FINALIDADE = 'A finalidade única e exclusiva desse TERMO DE AUTORIZAÇÃO, é garantir que o CONTRATANTE apresente a API INTEGRA CONTADOR esse consentimento do PROCURADOR ou OUTORGADO DO CONTRIBUINTE assinado digitalmente, para que possa realizar as requisições dos serviços web da API INTEGRA CONTADOR em nome do AUTOR PEDIDO DE DADOS (PROCURADOR ou OUTORGADO DO CONTRIBUINTE).';

const NS_DS = 'http://www.w3.org/2000/09/xmldsig#';
// Escape de atributo na forma canônica (C14N): & < " e quebras
const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/\t/g, '&#x9;').replace(/\n/g, '&#xA;').replace(/\r/g, '&#xD;');
const aaaammdd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');

// Monta o termo já na forma canônica: sem espaços entre elementos, elementos vazios com fechamento
// explícito e atributos em ordem alfabética (C14N ordena por nome).
function montaTermo({ contratante, procurador, dataAssinatura, vigencia }) {
  const tipoProc = String(procurador.numero).length === 11 ? 'PF' : 'PJ';
  return '<termoDeAutorizacao><dados>'
    + '<sistema id="API Integra Contador"></sistema>'
    + `<termo texto="${attr(TERMO)}"></termo>`
    + `<avisoLegal texto="${attr(AVISO)}"></avisoLegal>`
    + `<finalidade texto="${attr(FINALIDADE)}"></finalidade>`
    + `<dataAssinatura data="${dataAssinatura}"></dataAssinatura>`
    + `<vigencia data="${vigencia}"></vigencia>`
    + `<destinatario nome="${attr(contratante.nome)}" numero="${contratante.numero}" papel="contratante" tipo="PJ"></destinatario>`
    + `<assinadoPor nome="${attr(procurador.nome)}" numero="${procurador.numero}" papel="autor pedido de dados" tipo="${tipoProc}"></assinadoPor>`
    + '</dados></termoDeAutorizacao>';
}

// Assinatura envelopada do documento inteiro (Reference URI=""), RSA-SHA256, SHA-256, C14N, só o
// certificado do titular no KeyInfo.
function assinaTermo(xmlCanonico, { chavePem, certB64 }) {
  const digest = crypto.createHash('sha256').update(xmlCanonico, 'utf8').digest('base64');
  const signedInfo = `<SignedInfo xmlns="${NS_DS}">`
    + '<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></CanonicalizationMethod>'
    + '<SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"></SignatureMethod>'
    + '<Reference URI="">'
    + '<Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform>'
    + '<Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></Transform></Transforms>'
    + '<DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></DigestMethod>'
    + `<DigestValue>${digest}</DigestValue></Reference></SignedInfo>`;
  const valor = crypto.createSign('RSA-SHA256').update(signedInfo, 'utf8').sign(chavePem, 'base64');
  const assinatura = `<Signature xmlns="${NS_DS}">${signedInfo}<SignatureValue>${valor}</SignatureValue>`
    + `<KeyInfo><X509Data><X509Certificate>${String(certB64).replace(/\s+/g, '')}</X509Certificate></X509Data></KeyInfo></Signature>`;
  const fim = '</termoDeAutorizacao>';
  return `<?xml version="1.0" encoding="UTF-8"?>${xmlCanonico.slice(0, -fim.length)}${assinatura}${fim}`;
}

// Termo do dia: assinado hoje, vigente por `dias` (padrão 30)
function termoAssinado({ contratante, procurador, chavePem, certB64, hoje = new Date(), dias = 30 }) {
  const brasilia = new Date(hoje.getTime() - 3 * 3600 * 1000);
  const vig = new Date(brasilia.getTime() + dias * 24 * 3600 * 1000);
  const xml = montaTermo({ contratante, procurador, dataAssinatura: aaaammdd(brasilia), vigencia: aaaammdd(vig) });
  return assinaTermo(xml, { chavePem, certB64 });
}

module.exports = { montaTermo, assinaTermo, termoAssinado, TERMO, AVISO, FINALIDADE };
