// Simulador guiado: atividade -> números -> resultado (cálculo em tributos.js).
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const { brl, simula, setorPorCnae, SETORES, REGRAS } = Tributos;
const pct = (v) => `${(v * 100).toFixed(1).replace('.', ',')}%`;
const icone = (id) => `<svg class="i"><use href="#i-${id}"/></svg>`;
const LOGO_SVG = '<svg class="monograma" viewBox="0 0 48 48" aria-hidden="true"><circle class="fundo" cx="24" cy="24" r="23"/><circle cx="24" cy="24" r="19.5" fill="none" stroke="#c9a227" stroke-width="1" opacity=".6"/><path d="M12.2 13.2 19.4 30.6 26.6 13.2" stroke="#fff" stroke-width="3.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M34.2 13.2v13.6c0 5.1-3.5 8.4-8.5 8.4H14.6" stroke="#c9a227" stroke-width="3.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let config = { escritorio: {} };
let estado = { setor: null, empresa: null, resultado: null };

const linkZap = (texto) => `https://wa.me/${config.escritorio.whatsapp || ''}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;

fetch('/api/config').then((r) => r.json()).then((c) => {
  config = c;
  const e = c.escritorio || {};
  const [marca, ...resto] = (e.nome || '').split(/\s+/);
  $$('[data-logo]').forEach((el) => { el.innerHTML = `${LOGO_SVG}<span class="wm"><b>${esc(marca)}</b><small>${esc(resto.join(' '))}</small></span>`; });
  $$('[data-e]').forEach((el) => { el.textContent = { nome: e.nome, cnpj: e.cnpj }[el.dataset.e] || ''; });
  $$('[data-link="whatsapp"]').forEach((a) => { a.href = linkZap('Olá! Vim pelo simulador de impostos do site.'); });
}).catch(() => {});
$('#ano').textContent = new Date().getFullYear();

function vaiPara(n) {
  [1, 2, 3].forEach((i) => { $(`#p${i}`).hidden = i !== n; });
  $$('#barra li').forEach((li, i) => { li.classList.toggle('ativo', i === n - 1); li.classList.toggle('feito', i < n - 1); });
  window.scrollTo({ top: $('.sim').offsetTop - 120, behavior: 'smooth' });
}

// Passo 1: CNPJ ou escolha manual
function mascaraCnpj(v) {
  const c = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 14);
  return c.replace(/^(\w{2})(\w)/, '$1.$2').replace(/^(\w{2})\.(\w{3})(\w)/, '$1.$2.$3').replace(/\.(\w{3})(\w)/, '.$1/$2').replace(/(\w{4})(\w)/, '$1-$2');
}
$('#cnpj').addEventListener('input', (e) => { e.target.value = mascaraCnpj(e.target.value); });

async function buscaCnpj(c) {
  const info = $('#empresaInfo');
  info.hidden = false;
  info.textContent = 'Consultando a Receita…';
  try {
    const r = await fetch('/api/empresa/' + c);
    const j = await r.json();
    if (!r.ok) throw new Error(j.erro || 'Erro na consulta');
    const e = j.empresa;
    estado.empresa = e;
    const setor = setorPorCnae(e.cnae);
    info.innerHTML = `<b>${esc(e.razaoSocial)}</b><br>${esc(e.atividade)}<br>Regime atual: <b>${esc(e.regime)}</b>${setor ? ` · Atividade identificada: <b>${SETORES[setor]}</b>` : ''}`;
    if (setor) { $$('#setores button').forEach((b) => b.classList.toggle('sel', b.dataset.setor === setor)); setTimeout(() => escolheSetor(setor), 900); }
  } catch (err) {
    info.textContent = err.message + ' Escolha a atividade abaixo.';
  }
}
$('#formCnpj').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const c = $('#cnpj').value.replace(/[^A-Za-z0-9]/g, '');
  if (c.length === 14) buscaCnpj(c);
});
const doLink = new URLSearchParams(location.search).get('cnpj');
if (doLink) { $('#cnpj').value = mascaraCnpj(doLink); buscaCnpj(doLink.replace(/\D/g, '')); }

function escolheSetor(setor) {
  estado.setor = setor;
  $('#setorEscolhido').textContent = `· ${SETORES[setor]}`;
  $$('[data-so]').forEach((el) => { el.hidden = el.dataset.so !== setor; });
  $('#rotInsumos').textContent = setor === 'transporte' ? 'Diesel, pneus, peças e manutenção por mês'
    : setor === 'servicos' ? 'Materiais e insumos usados no serviço por mês' : 'Compras de mercadorias e insumos por mês';
  vaiPara(2);
}
$$('#setores button').forEach((b) => b.addEventListener('click', () => escolheSetor(b.dataset.setor)));

// Passo 2: números (digitados por mês)
function dinheiro(el) {
  const n = Number(String(el.value).replace(/\D/g, '')) / 100;
  return Number.isFinite(n) ? n : 0;
}
$$('[data-dinheiro]').forEach((el) => el.addEventListener('input', () => {
  const n = dinheiro(el);
  el.value = n ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
}));
$('#fInter').addEventListener('input', (e) => { $('#vInter').textContent = `${e.target.value}%`; });
$('#fB2b').addEventListener('input', (e) => { $('#vB2b').textContent = `${e.target.value}%`; });
$('#volta1').addEventListener('click', () => vaiPara(1));

$('#formNumeros').addEventListener('submit', (ev) => {
  ev.preventDefault();
  if (!dinheiro($('#fFat'))) { $('#fFat').focus(); return; }
  const entrada = {
    setor: estado.setor,
    faturamento: dinheiro($('#fFat')) * 12,
    folha: dinheiro($('#fFolha')) * 12,
    prolabore: dinheiro($('#fPro')) * 12,
    insumos: dinheiro($('#fIns')) * 12,
    outras: dinheiro($('#fOut')) * 12,
    intermunicipal: estado.setor === 'transporte' ? Number($('#fInter').value) / 100 : 0,
    b2b: Number($('#fB2b').value) / 100,
    uf: $('#fUf').value,
  };
  estado.caminhoes = Number($('#fCam').value) || 0;
  estado.resultado = simula(entrada);
  mostraResultado(estado.resultado);
  vaiPara(3);
});

// Passo 3: resultado
function mostraResultado(r) {
  const e = r.entrada;
  const m = r.melhor;
  const maior = Math.max(...r.opcoes.map((o) => o.total), 1);
  const nomeEmpresa = estado.empresa ? estado.empresa.razaoSocial : `sua empresa de ${SETORES[e.setor].toLowerCase()}`;
  const ref = r.reforma;
  const linhas2027 = [
    ref.simplesDentro && ['Simples com IBS/CBS no DAS', ref.simplesDentro.total, ref.simplesDentro.creditoCliente],
    ref.simplesHibrido && ['Simples híbrido (IBS/CBS fora do DAS)', ref.simplesHibrido.total, ref.simplesHibrido.creditoCliente],
    ['Lucro Presumido', ref.presumido.total, e.faturamento * ref.cbs],
    ['Lucro Real', ref.real.total, e.faturamento * ref.cbs],
  ].filter(Boolean);

  const proximos = {
    simples: ['A opção pelo Simples é feita em <b>janeiro</b>, no Portal do Simples Nacional, e vale para o ano todo.',
      'Mantenha a folha e o pró-labore em dia: eles definem o anexo e a alíquota.',
      'Para 2027: a escolha entre IBS/CBS dentro ou fora do DAS é <b>semestral</b>. Converse com a gente antes da próxima janela.'],
    presumido: ['O regime é escolhido com o <b>primeiro pagamento de imposto do ano</b> e vale até dezembro.',
      'Confira se a desoneração da folha está sendo aproveitada.',
      'Reavalie em 2027: PIS e Cofins viram CBS com crédito, o que pode favorecer o Lucro Real.'],
    real: ['O Lucro Real exige contabilidade completa e controle dos créditos: guarde as notas de diesel, peças e pneus.',
      'O regime é definido com o primeiro pagamento do ano.',
      'Em 2027 a CBS amplia os créditos, o que tende a fortalecer o Lucro Real para quem tem muitos custos.'],
  }[m.regime];

  $('#resultado').innerHTML = `
    <div class="vencedor revela">
      <div>
        <span class="rotulo">Melhor opção hoje para ${esc(nomeEmpresa)}</span>
        <h2>${m.nome}</h2>
        <p>${esc(m.explicacao)}</p>
        ${r.economia > 0 ? `<span class="economia">Economia de ${brl(r.economia)} por ano em relação ao ${r.segunda.nome}</span>` : ''}
      </div>
      <div class="numero"><small>Imposto estimado</small><b>${brl(m.total)}</b><small>por ano · ${pct(m.percentual)} do faturamento<br>${brl(m.total / 12)} por mês</small></div>
    </div>

    <section class="card comparativo">
      <h2>Comparativo dos regimes em 2026</h2>
      <p class="dica-sim">Faturamento de ${brl(e.faturamento)} por ano${estado.caminhoes ? ` com ${estado.caminhoes} caminhão(ões)` : ''}. Clique em cada regime para ver de onde vem o valor.</p>
      ${r.opcoes.map((o) => `
        <div class="barra-reg ${o === m ? 'melhor' : ''}">
          <div class="topo-reg"><b>${o === m ? '✅ ' : ''}${o.nome}</b><span>${brl(o.total)}/ano · ${pct(o.percentual)}</span></div>
          <div class="trilho"><i data-w="${(o.total / maior) * 100}"></i></div>
          <details><summary>Ver detalhes</summary>
            <p>${esc(o.explicacao)}</p>
            <table>${o.detalhes.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${brl(v)}</td></tr>`).join('')}</table>
          </details>
          ${o.avisos.map((a) => `<div class="aviso-sim">${icone('alerta')}<span>${esc(a)}</span></div>`).join('')}
        </div>`).join('')}
      ${r.impossiveis.map((o) => `<div class="aviso-sim">${icone('alerta')}<span><b>${o.nome}:</b> ${esc(o.motivo)}</span></div>`).join('')}
      ${e.setor === 'transporte' ? `<div class="aviso-sim">${icone('alerta')}<span>${r.mei.cabe ? `O faturamento cabe no <b>MEI Caminhoneiro</b> (até ${brl(r.mei.limite)}/ano), que tem imposto fixo mensal. Vale conversar com a gente sobre essa opção.` : `O MEI Caminhoneiro vai até ${brl(r.mei.limite)} por ano, então não se aplica a este faturamento.`}</span></div>` : ''}
    </section>

    <section class="card">
      <h2>E com a Reforma Tributária?</h2>
      <p class="dica-sim">Em 2027 a <b>CBS</b> substitui PIS e Cofins. Ela gera <b>crédito</b>: quem compra de você (empresa) desconta o imposto pago no frete ou na nota. Estimativa com CBS de ${pct(ref.cbs)}.</p>
      <table class="tabela-2027">
        <thead><tr><th>Cenário em 2027</th><th>Seu imposto/ano</th><th>Crédito para seus clientes</th></tr></thead>
        <tbody>${linhas2027.map(([n, t, c]) => `<tr><td>${n}</td><td>${brl(t)}</td><td>${brl(c)}</td></tr>`).join('')}</tbody>
      </table>
      ${r.conselho2027 ? `<div class="conselho">${icone('ia')} ${esc(r.conselho2027)}</div>` : ''}
      <ol class="linha-tempo">${REGRAS.reforma.cronograma.map(([a, t]) => `<li><b>${a}</b>${esc(t)}</li>`).join('')}</ol>
    </section>

    <section class="card">
      <h2>O que fazer agora</h2>
      <ol class="proximos">${proximos.map((p) => `<li>${p}</li>`).join('')}</ol>
      <div class="cta-final">
        <div><b>Quer ter certeza antes de decidir?</b><br><span style="color:var(--suave)">Um contador da V&amp;J confere os números reais e faz o planejamento completo.</span></div>
        <button class="btn" id="queroPlano">Quero o planejamento ${icone('seta')}</button>
      </div>
      <details class="premissas" style="margin-top:18px"><summary>Como calculamos (premissas)</summary>
        <ul>
          <li>Simples Nacional pelas tabelas da LC 123/2006. Transporte de cargas no Anexo III, trocando o ISS pelo ICMS do Anexo I no frete entre cidades.</li>
          <li>Lucro Presumido: presunção de ${e.setor === 'servicos' ? '32%' : '8% (IRPJ) e 12% (CSLL)'}, mais 10% sobre a receita acima de R$ 5 milhões (LC 224/2025). PIS/Cofins de 3,65%.</li>
          <li>Lucro Real: PIS/Cofins de 9,25% com crédito sobre os insumos informados. IRPJ de 15% (+10% acima de R$ 240 mil/ano) e CSLL de 9% sobre o lucro estimado.</li>
          <li>Folha fora do Simples: 20% de INSS patronal, mais cerca de 8,8% de RAT e terceiros${e.setor === 'transporte' ? '. No transporte, usamos a desoneração de 2026 quando é mais barata' : ''}.</li>
          <li>${e.setor === 'transporte' ? `ICMS do frete de 12%${e.uf === 'SP' ? ', com crédito outorgado de 20% em SP' : ''}. ISS de 5% no frete dentro da cidade.` : 'ICMS e ISS estimados com alíquotas padrão; benefícios estaduais e substituição tributária não estão incluídos.'}</li>
          <li>2027: CBS estimada em ${pct(ref.cbs)} (a alíquota oficial ainda não foi publicada). ICMS e ISS seguem iguais até 2028.</li>
          <li>Regras atualizadas em ${REGRAS.atualizadoEm.split('-').reverse().join('/')}. É uma estimativa: não substitui o planejamento feito por um contador.</li>
        </ul>
      </details>
    </section>`;
  requestAnimationFrame(() => setTimeout(() => $$('.trilho i').forEach((i) => { i.style.width = `${i.dataset.w}%`; }), 150));
  $('#queroPlano').addEventListener('click', () => $('#dlg').showModal());
}

// Lead: salva no painel e abre o WhatsApp com o resumo
$('#lCancelar').addEventListener('click', () => $('#dlg').close());
$('#formLead').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const r = estado.resultado;
  const e = r.entrada;
  const nome = $('#lNome').value.trim();
  const resumo = `Simulação: ${SETORES[e.setor]}, faturamento ${brl(e.faturamento)}/ano${estado.caminhoes ? `, ${estado.caminhoes} caminhões` : ''}. `
    + r.opcoes.map((o) => `${o.nome}: ${brl(o.total)}/ano (${pct(o.percentual)})`).join('; ') + `. Melhor: ${r.melhor.nome}.`;
  fetch('/api/contato', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome, telefone: $('#lTel').value, cnpj: estado.empresa ? estado.empresa.cnpj : '', assunto: 'Planejamento tributário', mensagem: resumo, total: 0 }),
  }).catch(() => {});
  $('#dlg').close();
  window.open(linkZap(`Olá! Sou ${nome}${estado.empresa ? `, da ${estado.empresa.razaoSocial}` : ''}. Fiz a simulação de impostos no site e quero o planejamento tributário.\n${resumo}`), '_blank');
});
