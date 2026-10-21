const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const data = (d) => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';
const ROTULO = { urgente: 'Urgente', atencao: 'Verificar', rotina: 'Rotina' };
const icone = (id) => `<svg class="i"><use href="#i-${id}"/></svg>`;
let atual = null;
let config = { escritorio: {}, servicos: {}, ia: false };
let conversa = [];

// Serviços mostrados na grade (o preço vem de precos.json pelo id).
const SERVICOS = [
  { id: 'mensal_simples', icone: 'grafico', titulo: 'Contabilidade mensal', texto: 'Impostos, folha, declarações e balanço em dia, com um contador acompanhando sua empresa.', mensal: true },
  { id: 'mensal_mei', icone: 'usuario', titulo: 'MEI', texto: 'Guias mensais, declaração anual, controle do limite e migração para ME quando chegar a hora.', mensal: true },
  { id: 'regularizar_inapto', icone: 'escudo', titulo: 'Regularização de CNPJ', texto: 'CNPJ inapto, suspenso ou com declarações atrasadas volta a funcionar e emitir nota.' },
  { id: null, icone: 'pessoas', titulo: 'Departamento pessoal', texto: 'Admissões, folha, férias, 13º, rescisões, eSocial e FGTS Digital sem erro.', obs: 'Incluso no plano Simples' },
  { id: 'transacao_pgfn', icone: 'moeda', titulo: 'Dívidas e parcelamentos', texto: 'Negociação na PGFN com desconto de juros e multa e parcelamento na Receita e no Simples.' },
  { id: 'certidoes', icone: 'certidao', titulo: 'Certidões negativas', texto: 'Federal, FGTS, trabalhista, estadual e municipal para licitações, bancos e contratos.' },
];
const PLANOS = [
  { id: 'mensal_mei', titulo: 'MEI', desc: 'Para o microempreendedor individual' },
  { id: 'mensal_simples', titulo: 'Simples Nacional', desc: 'Para micro e pequenas empresas' },
  { id: 'mensal_presumido', titulo: 'Lucro Presumido', desc: 'Para empresas que faturam mais' },
];

// Monograma V&J: V em branco e J em dourado, com a cauda do J sublinhando o V.
const LOGO_SVG = `<svg class="monograma" viewBox="0 0 48 48" aria-hidden="true"><circle class="fundo" cx="24" cy="24" r="23"/><circle cx="24" cy="24" r="19.5" fill="none" stroke="#c9a227" stroke-width="1" opacity=".6"/><path d="M12.2 13.2 19.4 30.6 26.6 13.2" stroke="#fff" stroke-width="3.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M34.2 13.2v13.6c0 5.1-3.5 8.4-8.5 8.4H14.6" stroke="#c9a227" stroke-width="3.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function linkZap(texto) {
  const n = config.escritorio.whatsapp || '';
  return `https://wa.me/${n}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}

function fone(n) {
  const d = String(n || '').replace(/^55/, '');
  return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : d;
}

function aplicaConfig() {
  const e = config.escritorio || {};
  const raiz = document.documentElement.style;
  if (e.corPrincipal) raiz.setProperty('--marca', e.corPrincipal);
  if (e.corDestaque) raiz.setProperty('--destaque', e.corDestaque);
  const [marca, ...resto] = (e.nome || '').split(/\s+/);
  $$('[data-logo]').forEach((el) => {
    el.innerHTML = e.logoUrl
      ? `<img src="${esc(e.logoUrl)}" alt="${esc(e.nome)}">`
      : `${LOGO_SVG}<span class="wm"><b>${esc(marca)}</b><small>${esc(resto.join(' '))}</small></span>`;
  });
  const valores = { nome: e.nome, email: e.email, cidade: e.cidade, cnpj: e.cnpj, fone: fone(e.whatsapp), desde: e.fundacao };
  $$('[data-e]').forEach((el) => { el.textContent = valores[el.dataset.e] || ''; });
  $$('[data-link="whatsapp"]').forEach((a) => { a.href = linkZap('Olá! Vim pelo site e gostaria de falar com a contabilidade.'); });
  $$('[data-link="email"]').forEach((a) => { a.href = `mailto:${e.email || ''}`; });
  $$('[data-link="fone"]').forEach((a) => { a.href = `tel:+${e.whatsapp || ''}`; });
  $$('[data-zap]').forEach((a) => { a.href = linkZap(a.dataset.zap); });
  $$('[data-preco]').forEach((el) => {
    const s = config.servicos[el.dataset.preco];
    el.textContent = s ? brl(s.valor) : 'sob consulta';
  });
  $$('[data-se-ia]').forEach((el) => { el.hidden = !config.ia; });
  $('#ano').textContent = new Date().getFullYear();

  $('#gradeServicos').innerHTML = SERVICOS.map((s, n) => {
    const p = s.id && config.servicos[s.id];
    return `<div class="servico revela" style="--atraso:${(n % 3) * 0.1}s">
      <div class="ic">${icone(s.icone)}</div>
      <h3>${s.titulo}</h3><p>${s.texto}</p>
      <div class="valor">${p ? `a partir de <b>${brl(p.valor)}</b>${s.mensal ? '/mês' : ''}` : esc(s.obs || 'Sob consulta')}</div>
    </div>`;
  }).join('');

  $('#gradePlanos').innerHTML = PLANOS.map((pl, n) => {
    const s = config.servicos[pl.id];
    if (!s) return '';
    return `<div class="plano revela ${s.destaque ? 'destaque' : ''}" style="--atraso:${n * 0.12}s">
      ${s.destaque ? '<span class="fita">Mais escolhido</span>' : ''}
      <h3>${pl.titulo}</h3>
      <div class="preco">${brl(s.valor)}<small>/mês</small></div>
      <div class="desc">${pl.desc}</div>
      <ul>${(s.itens || []).map((i) => `<li>${icone('check')}<span>${esc(i)}</span></li>`).join('')}</ul>
      <a class="btn" target="_blank" rel="noopener" href="${linkZap(`Olá! Tenho interesse no plano ${pl.titulo} (${brl(s.valor)}/mês).`)}">Quero este plano</a>
    </div>`;
  }).join('');
  observaRevela();
}

// Faz os blocos aparecerem suavemente quando entram na tela.
const observador = 'IntersectionObserver' in window
  ? new IntersectionObserver((entradas) => entradas.forEach((en) => {
    if (en.isIntersecting) { en.target.classList.add('visivel'); observador.unobserve(en.target); }
  }), { rootMargin: '0px 0px -60px 0px', threshold: 0.12 })
  : null;
function observaRevela() {
  $$('.revela:not(.visivel)').forEach((el) => (observador ? observador.observe(el) : el.classList.add('visivel')));
}
observaRevela();

fetch('/api/config').then((r) => r.json()).then((c) => { config = c; aplicaConfig(); }).catch(() => {});

$('#abreMenu').addEventListener('click', () => $('#links').classList.toggle('aberto'));
$$('#links a').forEach((a) => a.addEventListener('click', () => $('#links').classList.remove('aberto')));

$('#formSite').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const dados = {
    nome: $('#cNome').value.trim(), telefone: $('#cTel').value.trim(), email: $('#cEmail').value.trim(),
    assunto: $('#cAssunto').value, mensagem: $('#cMsg').value.trim(),
  };
  fetch('/api/contato', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) }).catch(() => {});
  $('#okSite').hidden = false;
  window.open(linkZap(`Olá! Sou ${dados.nome}. Assunto: ${dados.assunto}.${dados.mensagem ? `\n${dados.mensagem}` : ''}`), '_blank');
  ev.target.reset();
});


function mascara(v) {
  const c = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 14);
  return c.replace(/^(\w{2})(\w)/, '$1.$2').replace(/^(\w{2})\.(\w{3})(\w)/, '$1.$2.$3')
    .replace(/\.(\w{3})(\w)/, '.$1/$2').replace(/(\w{4})(\w)/, '$1-$2');
}
$('#cnpj').addEventListener('input', (e) => { e.target.value = mascara(e.target.value); });
document.querySelectorAll('[data-demo]').forEach((a) => a.addEventListener('click', () => {
  $('#cnpj').value = mascara(a.dataset.demo); consultar();
}));
$('#form').addEventListener('submit', (e) => { e.preventDefault(); consultar(); });

async function consultar() {
  const c = $('#cnpj').value.replace(/[^A-Za-z0-9]/g, '');
  if (c.length !== 14) { $('#cnpj').focus(); $('#cnpj').style.borderColor = 'var(--urgente)'; return; }
  $('#cnpj').style.borderColor = '';
  $('#btnBuscar').disabled = true;
  $('#diagnostico').hidden = false;
  $('#saida').innerHTML = '<div class="carregando">Consultando a Receita Federal…</div>';
  $('#diagnostico').scrollIntoView({ behavior: 'smooth' });
  try {
    const r = await fetch('/api/empresa/' + c);
    const j = await r.json();
    if (!r.ok) throw new Error(j.erro || 'Erro na consulta');
    atual = j;
    render(j);
  } catch (err) {
    $('#saida').innerHTML = `<div class="erro">${esc(err.message)}</div>`;
  } finally {
    $('#btnBuscar').disabled = false;
  }
}

function render({ empresa: e, orcamento: o, escritorio }) {
  const conta = (g) => o.itens.filter((i) => i.gravidade === g).length;
  const ativa = e.situacao === 'ATIVA';
  const itens = o.itens.map((i, n) => `
    <label class="item">
      <input type="checkbox" data-servico="${esc(i.preco?.id || '')}" ${i.preco && i.gravidade !== 'rotina' ? 'checked' : ''} ${i.preco ? '' : 'disabled'}>
      <div>
        <h3>${esc(i.titulo)} <span class="tag ${i.gravidade}">${ROTULO[i.gravidade]}</span></h3>
        <p>${esc(i.explicacao)}</p>
        ${i.link ? `<a href="${esc(i.link)}" target="_blank" rel="noopener">Conferir no site oficial ↗</a>` : ''}
      </div>
      <div class="preco">${i.preco ? `<b>${brl(i.preco.valor)}${i.preco.mensal ? '<small>/mês</small>' : ''}</b><small>${esc(i.preco.nome)}</small>${i.preco.prazo ? `<br><small>Prazo: ${esc(i.preco.prazo)}</small>` : ''}` : ''}</div>
    </label>`).join('');

  document.body.classList.add('com-total');
  $('#saida').innerHTML = `
    <div class="titulo-sec" style="margin-bottom:8px"><span class="rotulo">Diagnóstico gratuito</span><h2>Situação da sua empresa</h2></div>
    <section class="card">
      <div class="empresa-topo">
        <div>
          <h2>${esc(e.razaoSocial)}</h2>
          <div style="color:var(--suave)">${esc(e.nomeFantasia)} ${e.nomeFantasia ? '·' : ''} CNPJ ${esc(e.cnpjFormatado)}</div>
        </div>
        <span class="selo ${ativa ? 'ok' : 'ruim'}">${esc(e.situacao || 'SEM SITUAÇÃO')}</span>
      </div>
      <div class="dados">
        <div><span>Regime</span>${esc(e.regime)}</div>
        <div><span>Porte</span>${esc(e.porte || '—')}</div>
        <div><span>Abertura</span>${data(e.abertura)}</div>
        <div><span>Cidade</span>${esc(e.municipio)}${e.uf ? ' / ' + esc(e.uf) : ''}</div>
        <div><span>Atividade principal</span>${esc(e.atividade || '—')}</div>
        <div><span>Natureza jurídica</span>${esc(e.naturezaJuridica || '—')}</div>
      </div>
      <div class="resumo">
        <div class="r-urgente"><b>${conta('urgente')}</b>urgentes</div>
        <div class="r-atencao"><b>${conta('atencao')}</b>para verificar</div>
        <div class="r-rotina"><b>${conta('rotina')}</b>de rotina</div>
      </div>
    </section>
    <section class="card">
      <h2>O que fazer para deixar a empresa em dia</h2>
      <p style="color:var(--suave);margin-top:-6px;font-size:.9rem">Marque o que quer resolver. O valor do pacote atualiza na hora.</p>
      ${itens}
    </section>
    ${config.ia ? `
    <section class="card chat">
      <h2>${icone('ia')} Pergunte ao contador virtual</h2>
      <p style="color:var(--suave);margin-top:-6px;font-size:.9rem">Ele já conhece a situação desta empresa. Tire suas dúvidas na hora, 24 horas por dia.</p>
      <div class="msgs" id="msgs"></div>
      <div class="chips" id="chips">
        ${['Explique a situação da minha empresa', 'O que é mais urgente resolver?', 'O que acontece se eu não resolver?', 'Como funciona o parcelamento?'].map((q) => `<button type="button">${q}</button>`).join('')}
      </div>
      <form id="formChat">
        <input id="pergunta" maxlength="2000" placeholder="Escreva sua dúvida…" autocomplete="off">
        <button class="btn">Enviar</button>
      </form>
      <div class="aviso">Respostas geradas por inteligência artificial, com base nos dados públicos da Receita. Para valores exatos, peça o levantamento completo.</div>
    </section>` : ''}
    <div class="total">
      <div id="totais"></div>
      <button class="btn" id="quero">Quero resolver ${icone('seta')}</button>
    </div>`;

  $('#saida').querySelectorAll('input[type=checkbox]').forEach((cb) => cb.addEventListener('change', (ev) => {
    // O mesmo serviço pode aparecer em mais de um item: marca/desmarca todos juntos.
    $('#saida').querySelectorAll(`input[data-servico="${ev.target.dataset.servico}"]`).forEach((x) => { x.checked = ev.target.checked; });
    totais();
  }));
  $('#quero').addEventListener('click', () => $('#dlg').showModal());
  totais();
  conversa = [];
  if (config.ia) {
    $('#chips').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => pergunta(b.textContent)));
    $('#formChat').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const q = $('#pergunta').value.trim();
      if (q) { $('#pergunta').value = ''; pergunta(q); }
    });
  }
}

// Formatação mínima da resposta da IA: escapa tudo, depois negrito, listas e quebras de linha.
function formataIa(t) {
  return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^[-•] /gm, '• ').replace(/\n/g, '<br>');
}

let respondendo = false;
async function pergunta(q) {
  if (respondendo) return;
  respondendo = true;
  $('#chips').hidden = true;
  const msgs = $('#msgs');
  conversa.push({ role: 'user', content: q });
  msgs.insertAdjacentHTML('beforeend', `<div class="msg user">${esc(q)}</div>`);
  const bolha = document.createElement('div');
  bolha.className = 'msg assistant digitando';
  msgs.appendChild(bolha);
  msgs.scrollTop = msgs.scrollHeight;
  let texto = '';
  try {
    const r = await fetch('/api/assistente', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cnpj: atual.empresa.cnpj, mensagens: conversa }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || 'Não consegui responder agora.');
    const leitor = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const partes = buf.split('\n\n');
      buf = partes.pop();
      for (const p of partes) {
        if (!p.startsWith('data: ')) continue;
        const ev = JSON.parse(p.slice(6));
        if (ev.erro) throw new Error(ev.erro);
        if (ev.texto) { texto += ev.texto; bolha.innerHTML = formataIa(texto); msgs.scrollTop = msgs.scrollHeight; }
      }
    }
    conversa.push({ role: 'assistant', content: texto });
  } catch (err) {
    conversa.pop();
    bolha.innerHTML = `<span style="color:var(--urgente)">${esc(err.message)}</span>`;
  } finally {
    bolha.classList.remove('digitando');
    respondendo = false;
  }
}

function selecionados() {
  const ids = new Set([...$('#saida').querySelectorAll('input[type=checkbox]:checked')].map((c) => c.dataset.servico));
  return atual.orcamento.itens.map((i) => i.preco).filter((p, n, arr) => p && ids.has(p.id) && arr.findIndex((q) => q && q.id === p.id) === n);
}

function totais() {
  const sel = selecionados();
  const avulsos = sel.filter((s) => !s.mensal);
  const mensal = sel.find((s) => s.mensal);
  const soma = avulsos.reduce((t, s) => t + s.valor, 0);
  const pct = avulsos.length > 1 ? atual.orcamento.descontoPct : 0;
  const final = soma - Math.round(soma * pct) / 100;
  $('#totais').innerHTML = avulsos.length || mensal
    ? `${pct ? `<span class="de">${brl(soma)}</span> <small style="display:inline">-${pct}% no pacote</small><br>` : ''}
       <span class="por">${brl(final)}</span>
       <small>${avulsos.length} serviço(s) de regularização${mensal ? ` + ${brl(mensal.valor)}/mês de ${esc(mensal.nome.toLowerCase())}` : ''}</small>`
    : '<small>Marque os itens que deseja resolver</small>';
  $('#quero').disabled = !(avulsos.length || mensal);
  return { sel, final, mensal };
}

$('#cancelar').addEventListener('click', () => $('#dlg').close());
$('#formContato').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const { sel, final, mensal } = totais();
  const e = atual.empresa;
  const nome = $('#nome').value.trim();
  const tel = $('#tel').value.trim();
  fetch('/api/contato', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome, telefone: tel, cnpj: e.cnpj, servicos: sel.map((s) => s.id), total: final }),
  }).catch(() => {});
  const linhas = sel.filter((s) => !s.mensal).map((s) => `• ${s.nome} (${brl(s.valor)})`);
  const msg = `Olá! Sou ${nome}. Consultei a empresa ${e.razaoSocial} (CNPJ ${e.cnpjFormatado}) no site e quero resolver:\n${linhas.join('\n')}`
    + `\nTotal: ${brl(final)}` + (mensal ? `\nE tenho interesse em ${mensal.nome} (${brl(mensal.valor)}/mês).` : '');
  $('#dlg').close();
  window.open(`https://wa.me/${atual.escritorio.whatsapp}?text=${encodeURIComponent(msg)}`, '_blank');
});
