// Busca de NCM pelo nome do produto e sugestão dos campos fiscais da venda (Simples Nacional).
// Tabela oficial: portal/ncm.json, gerada da Nomenclatura do Siscomex (Portal Único, download público).
// A sugestão é um ponto de partida: o produto criado assim fica marcado "conferir" para o escritório revisar.
let TAB = null;
const tabela = () => {
  if (!TAB) { try { TAB = require('./ncm.json'); } catch { TAB = { ncm: [] }; } TAB.idx = TAB.ncm.map(([c, d]) => [c, d, semAcento(d)]); }
  return TAB;
};
function semAcento(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
const PARADAS = new Set(['de', 'da', 'do', 'das', 'dos', 'para', 'com', 'sem', 'em', 'e', 'o', 'a', 'kg', 'un', 'ml', 'lt', 'litro', 'litros', 'cx', 'pct']);

// Nomes populares -> NCM (o nome comercial nem sempre aparece no texto oficial)
const POPULARES = [
  [/pastilha|lona de freio/, '68138190'], [/disco de freio/, '87083090'], [/\bpneu/, '40114000'], [/camara de ar/, '40139000'],
  [/oleo.*motor|oleo lubrificante|oleo \d+w/, '27101932'], [/filtro de oleo/, '84212300'], [/filtro de ar/, '84213100'], [/vela de igni/, '85111000'],
  [/bateria/, '85071010'], [/lampada|farol/, '85392190'], [/correia/, '40103900'], [/amortecedor/, '87088000'], [/retrovisor/, '70091000'],
  [/capacete/, '65061000'], [/corrente.*moto|kit relacao|kit transmissao/, '87149990'], [/cabo de embreagem|cabo de acelerador/, '87149990'],
  [/refrigerante/, '22021000'], [/agua mineral/, '22011000'], [/cerveja/, '22030000'], [/suco/, '20098990'],
  [/camiseta|camisa de malha/, '61091000'], [/calca jeans/, '62034200'], [/tenis\b/, '64041100'],
  [/\bpao\b|pao frances/, '19059090'], [/bolo/, '19059090'], [/salgado|coxinha|pastel/, '19059090'],
  [/shampoo|xampu/, '33051000'], [/perfume/, '33030010'], [/batom|maquiagem/, '33041000'], [/creme dental|pasta de dente/, '33061000'],
  [/medicamento|remedio/, '30049099'], [/celular|smartphone/, '85171300'], [/carregador/, '85044010'], [/fone de ouvido/, '85183000'],
];

function busca(q, limite = 8) {
  const t = tabela();
  const txt = semAcento(q);
  const digitos = txt.replace(/\D/g, '');
  if (digitos.length >= 4 && /^[\d.\s]+$/.test(txt)) return t.idx.filter(([c]) => c.startsWith(digitos)).slice(0, limite).map(([c, d]) => ({ ncm: c, descricao: d }));
  const res = [];
  for (const [re, c] of POPULARES) if (re.test(txt)) { const x = t.idx.find(([cc]) => cc === c); if (x && !res.some((r) => r.ncm === c)) res.push({ ncm: c, descricao: x[1], popular: true }); }
  const palavras = txt.split(/[^a-z0-9]+/).filter((p) => p.length >= 3 && !PARADAS.has(p));
  if (palavras.length) {
    const pont = [];
    for (const [c, d, n] of t.idx) {
      let s = 0;
      for (const p of palavras) { const raiz = p.length > 5 ? p.slice(0, p.length - 1) : p; if (n.includes(` ${raiz}`) || n.startsWith(raiz)) s += 2; else if (n.includes(raiz)) s += 1; }
      if (s) pont.push([s - d.length / 2000, c, d]);
    }
    pont.sort((a, b) => b[0] - a[0]);
    for (const [, c, d] of pont) { if (res.length >= limite) break; if (!res.some((r) => r.ncm === c)) res.push({ ncm: c, descricao: d }); }
  }
  return res.slice(0, limite);
}

const descricaoDe = (ncm) => { const x = tabela().idx.find(([c]) => c === String(ncm)); return x ? x[1] : ''; };

// PIS/COFINS monofásico (Leis 10.147, 10.485, 13.097 e combustíveis): no Simples a receita é segregada (CST 04)
const MONOFASICO = ['3003', '3004', '3303', '3304', '3305', '3307', '340111', '96032', '2201', '2202', '2203', '2710', '2711', '22071', '22072',
  '4009', '4010', '4011', '4013', '401693', '6813', '700711', '700910', '7320', '830120', '84073', '840820', '8409', '841330', '842123', '842131', '8482', '8483', '8507', '8511', '8512', '8539', '854430', '8707', '8708', '8714', '902610', '9029', '903180', '903289'];
// Mercadorias que em SP costumam ter substituição tributária (ICMS-ST já recolhido na compra)
const ST_PROVAVEL = ['2201', '2202', '2203', '2710', '3003', '3004', '3303', '3304', '3305', '3307', '4011', '4013', '4009', '4010', '6813', '8507', '8511', '8512', '8539', '8708', '8714', '8421', '8483', '8482'];

function sugestaoFiscal(ncm, { uf = 'SP' } = {}) {
  const n = String(ncm || '').replace(/\D/g, '');
  const mono = MONOFASICO.some((p) => n.startsWith(p));
  const st = uf === 'SP' && ST_PROVAVEL.some((p) => n.startsWith(p));
  const obs = [mono && 'PIS/COFINS monofásico', st && 'provável ICMS-ST (confira a nota de compra)'].filter(Boolean);
  return { csosn: st ? '500' : '102', cfop: st ? '5405' : '5102', pisCst: mono ? '04' : '49', origem: 0, unidade: 'UN', obs: obs.join('; ') };
}

module.exports = { busca, descricaoDe, sugestaoFiscal, semAcento, vigencia: () => tabela().vigencia };
