// Códigos de emissão da NFS-e Nacional a partir do CNPJ:
//  - lista oficial de serviços (Anexo B, servicos-nfse.json)
//  - sugestão do código de tributação nacional pelo CNAE (tabela abaixo: prefixo do CNAE -> código).
//    O prefixo mais longo vence. É uma sugestão: o contador confere e pode trocar no painel.
//  - alíquota inicial do Simples pelo anexo (1ª faixa) quando não há faturamento para calcular.
const path = require('path');
const LISTA = require(path.join(__dirname, '..', 'servicos-nfse.json')).servicos;
const POR_CODIGO = Object.fromEntries(LISTA.map((s) => [s.codigo, s]));

const CNAE_SERVICO = {
  // Informática
  6201: '010101', 6202: '010401', 6203: '010501', 6204: '010601', 6209: '010701', 6311: '010301', 6319: '010902', 9511: '140201',
  // Saúde
  8610: '040301', 8621: '042101', 8622: '042101', 8630501: '040303', 8630502: '040303', 8630503: '040101', 8630504: '041201', 8630506: '040901', 8630507: '041801',
  8640202: '040201', 8640203: '040202', 8640204: '040205', 8640205: '040205', 8640207: '040205', 8640208: '040205', 8640209: '040205', 8640210: '040204', 8640211: '040204', 8640212: '040201',
  8650001: '040601', 8650002: '041001', 8650003: '041601', 8650004: '040802', 8650005: '040801', 8650006: '040803', 8650099: '040901', 8660: '040901', 8690901: '040901', 8690903: '040501', 8690999: '040901',
  8711: '041701', 8712: '041701', 8720: '041702', 8730: '041704', 8800: '270101', 3250706: '041401',
  // Veterinária e animais
  7500: '050101', 9609208: '050801',
  // Beleza e bem-estar
  9602501: '060101', 9602502: '060201', 9609206: '060301', 9313: '060401', 8591: '060401', 9609299: '060601',
  // Engenharia, arquitetura e construção
  7111: '070104', 7112: '070101', 7119: '070103', 7119701: '070103', 7119702: '072002', 7119703: '070302', 7119704: '070101',
  4110: '070202', 4120: '070202', 4211: '070202', 4212: '070202', 4213: '070202', 4221: '070202', 4222: '070202', 4223: '070202', 4291: '070202', 4292: '070202', 4299: '070202',
  4311: '070401', 4312: '070202', 4313: '070202', 4319: '070202', 4321: '070202', 4322: '070202', 4329: '070202', 4330: '070501', 4330401: '070202', 4330402: '070602', 4330403: '070602', 4330404: '070501', 4330405: '070602',
  4391: '070202', 4399: '070202', 4399103: '070202', 4399105: '070202', 7732: '030501',
  8121: '071002', 8122: '071301', 8129: '071002', 8130: '071102', 3811: '070901', 3812: '070901', 3821: '070902', 3822: '070902', 3839: '070902', 3900: '071201',
  // Educação
  8511: '080101', 8512: '080101', 8513: '080101', 8520: '080101', 8531: '080102', 8532: '080102', 8533: '080102', 8541: '080201', 8542: '080201', 8550: '080201', 8592: '080201', 8593: '080201', 8599: '080201',
  // Hospedagem e turismo
  5510801: '090101', 5510802: '090104', 5510803: '090103', 5590: '090102', 7911: '090201', 7912: '090202', 7990: '090301',
  // Intermediação e representação
  6622: '100102', 6619: '100201', 6821: '100502', 6822: '100502', 7490104: '100202', 4610: '100901', 4611: '100901', 4612: '100901', 4613: '100901', 4614: '100901', 4615: '100901', 4616: '100901', 4617: '100901', 4618: '100901', 4619: '100901',
  // Guarda, vigilância e logística
  5223: '110101', 8011: '110201', 8012: '110301', 8020: '110501', 5211: '110401', 5212: '110402',
  // Eventos e entretenimento
  9001: '120701', 9001906: '121301', 9002: '370101', 9329: '121701', 8230: '171001', 8230001: '171001', 8230002: '171001', 9311: '121101', 9319: '121101', 5914: '120201',
  // Fotografia, gráfica e reprografia
  7420: '130301', 5911: '130301', 5912: '130301', 5920: '130201', 8219: '130401', 1813: '130501', 1821: '130501', 1822: '130501',
  // Manutenção, reparação e instalação
  3311: '140101', 3312: '140101', 3313: '140101', 3314: '140101', 3315: '140101', 3316: '140101', 3317: '140101', 3319: '140101', 3321: '140601', 3329: '140601',
  4520: '140101', 4520001: '140101', 4520002: '141201', 4520003: '140101', 4520004: '140101', 4520005: '140101', 4520006: '140401', 4520007: '140601', 4520008: '140101', 4543: '140101',
  9512: '140201', 9521: '140201', 9529: '140101', 9529101: '140101', 9529102: '240101', 9529103: '140101', 9529104: '140101', 9529105: '140101',
  9601: '141001', 9529199: '140101', 1340: '140501', 3101: '141301', 2512: '141302', 4930: '160201', 4929: '160201',
  // Transporte municipal
  4921: '160101', 4922: '160101', 5099: '160104',
  // Apoio administrativo, consultoria e gestão
  7020: '170101', 7320: '170102', 8211: '170202', 8220: '170203', 7490101: '170205', 7810: '170401', 7820: '170501', 7830: '170501',
  7311: '170601', 7312: '172501', 7319: '170601', 7319002: '170601', 7319003: '170601', 7319004: '170601',
  7490: '170101', 7490105: '170101', 7490199: '170101', 8291: '172201', 8299: '170202', 8299799: '170202', 8211300: '170202',
  6911: '171401', 6912: '210101', 6920: '171901', 6920601: '171901', 6920602: '171601', 6463: '150101', 6630: '150101',
  8292: '170202', 7740: '030201', 7220: '020101', 7210: '020101', 8299702: '170202', 8299707: '170202',
  6810: '171201', 8112: '171201', 7739: '030401', 7711: '030401', 7719: '030401', 7721: '030401', 7722: '030401', 7723: '030401', 7729: '030401',
  // Diversos
  7410: '230101', 7410202: '230101', 7410203: '230102', 7410299: '230101', 9603: '250101', 5320: '260101', 5310: '260101', 8411: '990101',
  6399: '170102', 6391: '100701', 6311900: '010301', 6190: '010301', 9200: '190101', 7500100: '050101', 8550302: '080201',
};

function sugere1(cnae) {
  const c = String(cnae || '').replace(/\D/g, '');
  if (!c) return null;
  for (const n of [7, 5, 4]) {
    const cod = CNAE_SERVICO[c.slice(0, n)];
    if (cod && POR_CODIGO[cod]) return { ...POR_CODIGO[cod], cnae: c, por: n === 7 ? 'subclasse do CNAE' : 'classe do CNAE' };
  }
  return null;
}
// CNAE principal primeiro; se for comércio/indústria (sem serviço), tenta os secundários
function sugereServico(cnae, secundarios = []) {
  const p = sugere1(cnae);
  if (p) return p;
  for (const s of secundarios || []) { const r = sugere1(s); if (r) return { ...r, secundario: true }; }
  return null;
}

// Alíquota inicial do Simples (1ª faixa de cada anexo, LC 123/2006)
const PRIMEIRA_FAIXA = { I: 4, II: 4.5, III: 6, IV: 4.5, V: 15.5 };
const aliquotaInicial = (anexo) => PRIMEIRA_FAIXA[anexo] || 6;

// Busca na lista oficial por código ou palavras da descrição (para o seletor do painel)
function buscaServicos(q, limite = 20) {
  const sem = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const termos = sem(q).split(/\s+/).filter(Boolean);
  if (!termos.length) return [];
  const digitos = String(q).replace(/\D/g, '');
  return LISTA.filter((s) => (digitos.length >= 2 && s.codigo.startsWith(digitos.padEnd(2, '0').slice(0, digitos.length))) || termos.every((t) => sem(`${s.codigo} ${s.item} ${s.descricao}`).includes(t))).slice(0, limite);
}

// Reforma tributária (IBS/CBS): código indicador da operação (cIndOp, Anexo VII da NT 009 da NFS-e)
// pelo tipo de serviço, conforme o local da operação do art. 11 da LC 214/2025
const INDOP = {
  '020201': 'Serviço sobre bem imóvel (local do imóvel)',
  '030101': 'Serviço presencial na pessoa (estabelecimento do prestador)',
  '050101': 'Serviço sobre bem móvel (estabelecimento do prestador)',
  '060101': 'Transporte de passageiros (início do transporte)',
  '070101': 'Transporte de carga (local de entrega)',
  '100301': 'Demais serviços (domicílio do tomador)',
  '010101': 'Fornecimento de bem móvel material (local da entrega)',
  '020101': 'Operação com bem imóvel ou direito sobre imóvel (local do imóvel)',
  '020202': 'Serviço sobre bem imóvel (local do imóvel)',
  '020301': 'Administração e intermediação de imóvel (local do imóvel)',
  '020401': 'Serviço sobre bem imóvel (local do imóvel)',
  '040101': 'Organização de eventos (local do evento)',
  '050201': 'Serviços portuários (local da prestação)',
  '080101': 'Exploração de via (local da prestação)',
  '100101': 'Cessão de espaço publicitário (domicílio do adquirente)',
  '100501': 'Bens imateriais e direitos (domicílio do adquirente)',
};
// Anexo VIII da NFS-e (RTC, v1.02.00): por item da LC 116 -> NBS possíveis, cIndOp e cClassTrib sugeridos.
// A própria Receita marca a tabela como preliminar; usamos como sugestão.
let RTC = {};
try { RTC = require('./nbs-servicos.json'); } catch { RTC = {}; }
const itemDe = (codigo) => { const c = String(codigo || '').replace(/\D/g, '').padStart(6, '0'); return `${c.slice(0, 2)}.${c.slice(2, 4)}`; };
const rtcDoServico = (codigo) => RTC[itemDe(codigo)] || null;
const nbsPadrao = (codigo) => { const r = rtcDoServico(codigo); return r && r.nbs[0] ? r.nbs[0].codigo : ''; };

function indOpServico(codigo) {
  const r = rtcDoServico(codigo);
  if (r && /^\d{6}$/.test(r.indOp)) return r.indOp;
  const c = String(codigo || '').replace(/\D/g, '').padStart(6, '0');
  const item = c.slice(0, 2);
  const sub = c.slice(0, 4);
  if (item === '07' && !['0701', '0703'].includes(sub)) return '020201'; // construção, reforma, limpeza e conservação de imóveis
  if (['04', '06'].includes(item) || ['0801', '0802'].includes(sub) || item === '12') return '030101'; // saúde, estética, academia, ensino e diversões presenciais
  if (item === '14') return '050101'; // manutenção, conserto e beneficiamento de bens móveis
  if (sub === '1601') return '060101';
  if (sub === '1602') return '070101';
  return '100301';
}

module.exports = { indOpServico, INDOP, rtcDoServico, nbsPadrao, sugereServico, aliquotaInicial, buscaServicos, servico: (c) => POR_CODIGO[String(c || '').padStart(6, '0')] || null, LISTA };
