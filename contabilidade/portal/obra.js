// Serviços de obra (construção civil): a NFS-e Nacional exige o grupo "obra" na DPS
// (rejeição E0370) e o ISS é devido no município onde fica a obra (LC 116/2003, art. 3º).
// Aqui ficam a lista de códigos, a busca do endereço pelo CEP e a validação dos dados.
const https = require('https');

// Subitens que a Receita lista na rejeição E0370 (código de tributação nacional, 6 dígitos)
const CODIGOS = new Set(['070201', '070202', '070401', '070501', '070502', '070601', '070602', '070701', '070801', '071701', '071901', '141403', '141404']);
const exige = (codigo) => CODIGOS.has(String(codigo || '').replace(/\D/g, ''));

const txt = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const so = (v) => String(v || '').replace(/\D/g, '');

// Endereço pelo CEP (ViaCEP traz o código IBGE do município, que vai no local da prestação)
let buscaExterna = (cep) => new Promise((ok, falha) => {
  const req = https.get(`https://viacep.com.br/ws/${cep}/json/`, { timeout: 8000 }, (res) => {
    let s = '';
    res.on('data', (d) => { s += d; });
    res.on('end', () => { try { ok(JSON.parse(s)); } catch (err) { falha(err); } });
  });
  req.on('timeout', () => req.destroy(new Error('CEP: sem resposta')));
  req.on('error', falha);
});

async function buscaCep(cep) {
  const c = so(cep);
  if (c.length !== 8) return null;
  const r = await buscaExterna(c).catch(() => null);
  if (!r || r.erro) return null;
  return { cep: c, logradouro: r.logradouro || '', bairro: r.bairro || '', municipio: r.localidade || '', uf: r.uf || '', codigoMunicipio: so(r.ibge) };
}

// Confere e completa os dados da obra vindos da tela. Devolve { obra } ou { erro }.
async function normaliza(dados) {
  const d = dados || {};
  const o = {
    cep: so(d.cep), numero: txt(d.numero, 60), complemento: txt(d.complemento, 156),
    logradouro: txt(d.logradouro, 255), bairro: txt(d.bairro, 60), municipio: txt(d.municipio, 80), uf: txt(d.uf, 2).toUpperCase(),
    codigoMunicipio: so(d.codigoMunicipio), cno: so(d.cno),
  };
  if (o.cep.length !== 8) return { erro: 'Informe o CEP da obra (8 dígitos).' };
  if (!o.numero) return { erro: 'Informe o número do endereço da obra (use S/N se não tiver).' };
  if (o.cno && (o.cno.length < 12 || o.cno.length > 14)) return { erro: 'O CNO da obra tem 12 dígitos. Confira ou deixe em branco.' };
  // Sem rua, bairro ou município: completa pelo CEP
  if (!o.logradouro || !o.bairro || o.codigoMunicipio.length !== 7) {
    const achado = await buscaCep(o.cep);
    if (achado) {
      o.logradouro = o.logradouro || achado.logradouro;
      o.bairro = o.bairro || achado.bairro;
      o.municipio = o.municipio || achado.municipio;
      o.uf = o.uf || achado.uf;
      if (o.codigoMunicipio.length !== 7) o.codigoMunicipio = achado.codigoMunicipio;
    }
  }
  if (!o.logradouro || !o.bairro) return { erro: 'Não achamos a rua e o bairro por este CEP. Preencha a rua e o bairro da obra.' };
  if (o.codigoMunicipio.length !== 7) return { erro: 'Não achamos o município deste CEP. Confira o CEP da obra.' };
  if (!o.cno) delete o.cno;
  if (!o.complemento) delete o.complemento;
  return { obra: o };
}

module.exports = { CODIGOS, exige, buscaCep, normaliza, _setBusca: (f) => { buscaExterna = f; } };
