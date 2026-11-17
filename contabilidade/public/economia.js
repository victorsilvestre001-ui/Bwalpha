// Página "Recuperar impostos": radar pelo CNPJ, explicação de cada oportunidade e pedido de análise.
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icone = (id) => `<svg class="i"><use href="#i-${id}"/></svg>`;
const SEG = { consolidado: 'Consolidado', boa: 'Boa segurança' };
const CHANCE = { alta: 'Chance alta', media: 'Vale verificar' };
const LOGO_SVG = '<svg class="monograma" viewBox="0 0 48 48" aria-hidden="true"><circle class="fundo" cx="24" cy="24" r="23"/><circle cx="24" cy="24" r="19.5" fill="none" stroke="#c9a227" stroke-width="1" opacity=".6"/><path d="M12.2 13.2 19.4 30.6 26.6 13.2" stroke="#fff" stroke-width="3.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M34.2 13.2v13.6c0 5.1-3.5 8.4-8.5 8.4H14.6" stroke="#c9a227" stroke-width="3.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let escritorio = {};
let ultimo = null; // { empresa, radar }
const linkZap = (texto) => `https://wa.me/${escritorio.whatsapp || ''}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
const mascara = (v) => { const c = v.replace(/\D/g, '').slice(0, 14); return c.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2'); };

fetch('/api/config').then((r) => r.json()).then((c) => {
  escritorio = c.escritorio || {};
  const [marca, ...resto] = (escritorio.nome || '').split(/\s+/);
  $$('[data-logo]').forEach((el) => { el.innerHTML = `${LOGO_SVG}<span class="wm"><b>${esc(marca)}</b><small>${esc(resto.join(' '))}</small></span>`; });
  $$('[data-e]').forEach((el) => { el.textContent = { nome: escritorio.nome, cnpj: escritorio.cnpj }[el.dataset.e] || ''; });
  $$('[data-link="whatsapp"]').forEach((a) => { a.href = linkZap('Olá! Quero saber se minha empresa pode recuperar impostos.'); });
  if (escritorio.recuperacaoHonorario) $('#textoHonorario').textContent = escritorio.recuperacaoHonorario;
}).catch(() => {});
$('#ano').textContent = new Date().getFullYear();

// Detalhe de uma oportunidade (usado na lista geral e no resultado do radar)
const detalhe = (o) => `
  <dl class="op-detalhe">
    <dt>O que é</dt><dd>${esc(o.resumo)}</dd>
    <dt>Quem tem direito</dt><dd>${esc(o.quemTem)}</dd>
    <dt>Quanto costuma render</dt><dd>${esc(o.quantoRende)}</dd>
    <dt>Base legal</dt><dd>${esc(o.baseLegal)}</dd>
    <dt>Segurança</dt><dd><span class="selo-seg ${o.seguranca}">${SEG[o.seguranca]}</span></dd>
    <dt>Documentos</dt><dd><ul>${o.documentos.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></dd>
  </dl>`;

fetch('/api/oportunidades').then((r) => r.json()).then(({ oportunidades }) => {
  $('#listaOportunidades').innerHTML = Object.values(oportunidades).map((o) => `<details><summary>${esc(o.titulo)}</summary>${detalhe(o)}</details>`).join('');
}).catch(() => {});

// Radar pelo CNPJ
$('#cnpj').addEventListener('input', (e) => { e.target.value = mascara(e.target.value); });
async function consulta(c) {
  const el = $('#resultado');
  el.hidden = false;
  el.innerHTML = '<div class="card"><p class="vazio">Procurando oportunidades para esta empresa…</p></div>';
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    const r = await fetch('/api/empresa/' + c);
    const j = await r.json();
    if (!r.ok) throw new Error(j.erro || 'Erro na consulta');
    ultimo = j;
    const e = j.empresa;
    const achados = j.radar || [];
    const fortes = achados.filter((a) => a.id !== 'reforma');
    el.innerHTML = `
      <div class="card">
        <div class="resultado-topo">
          <div><span class="rotulo-solto">Radar de economia</span><h2>${esc(e.razaoSocial)}</h2><p class="dica-sim" style="margin:4px 0 0">${esc(e.atividade)} · ${esc(e.regime)} · ${esc(e.municipio)}/${esc(e.uf)}</p></div>
          <button class="btn" data-quero>Quero a análise completa ${icone('seta')}</button>
        </div>
        ${fortes.length
          ? `<p style="margin:16px 0 0"><b>Encontramos ${fortes.length} oportunidade(s) provável(is) para esta empresa.</b> O valor exato sai da análise das notas fiscais, que é grátis.</p>`
          : '<p style="margin:16px 0 0">Pela atividade e pelo regime, não vemos uma oportunidade típica de recuperação. Mesmo assim, a análise das notas pode encontrar pagamentos a mais e ajudar a preparar a empresa para a Reforma.</p>'}
        ${achados.map((a) => `
          <div class="achado ${a.chance}">
            <span class="chance ${a.chance}">${CHANCE[a.chance]}</span> <span class="selo-seg ${a.seguranca}">${SEG[a.seguranca]}</span>
            <h3>${esc(a.titulo)}</h3>
            <p class="motivo">${icone('busca')} Por que apareceu para você: ${esc(a.motivo)}</p>
            <p>${esc(a.resumo)}</p>
            <details><summary>Ver todos os detalhes</summary>${detalhe(a)}</details>
          </div>`).join('')}
      </div>`;
    $$('#resultado [data-quero]').forEach((b) => b.addEventListener('click', abreLead));
  } catch (err) {
    el.innerHTML = `<div class="card"><p class="erro-form">${esc(err.message)}</p></div>`;
  }
}
$('#formCnpj').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const c = $('#cnpj').value.replace(/\D/g, '');
  if (c.length === 14) consulta(c); else $('#cnpj').focus();
});
const doLink = new URLSearchParams(location.search).get('cnpj');
if (doLink) { $('#cnpj').value = mascara(doLink); consulta(doLink.replace(/\D/g, '')); }

// Pedido de análise: salva no painel e abre o WhatsApp
function abreLead() {
  if (ultimo) $('#lCnpj').value = ultimo.empresa.cnpjFormatado;
  $('#dlg').showModal();
}
$$('[data-quero]').forEach((b) => b.addEventListener('click', abreLead));
$('#lCnpj').addEventListener('input', (e) => { e.target.value = mascara(e.target.value); });
$('#lCancelar').addEventListener('click', () => $('#dlg').close());
$('#formLead').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const nome = $('#lNome').value.trim();
  const achados = ultimo ? ultimo.radar.filter((a) => a.id !== 'reforma').map((a) => a.titulo) : [];
  const empresa = ultimo ? ultimo.empresa.razaoSocial : '';
  const mensagem = achados.length ? `Radar: ${achados.join('; ')}` : 'Pedido de análise de recuperação de tributos';
  fetch('/api/contato', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome, telefone: $('#lTel').value, cnpj: $('#lCnpj').value, assunto: 'Recuperação de tributos', mensagem }),
  }).catch(() => {});
  $('#dlg').close();
  window.open(linkZap(`Olá! Sou ${nome}${empresa ? `, da ${empresa}` : ''}. Quero a análise de recuperação de impostos.${achados.length ? `\nO radar do site apontou: ${achados.join('; ')}.` : ''}`), '_blank');
});
