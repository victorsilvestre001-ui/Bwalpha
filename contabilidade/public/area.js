// Área do Cliente: entrada, planos e painel (empresa, notas, orçamentos, conta).
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const data = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');
const icone = (id) => `<svg class="i"><use href="#i-${id}"/></svg>`;
const docFmt = (d) => { const c = String(d || ''); return c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c.length === 11 ? c.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : c; };
const LOGO_SVG = '<svg class="monograma" viewBox="0 0 48 48" aria-hidden="true"><circle class="fundo" cx="24" cy="24" r="23"/><circle cx="24" cy="24" r="19.5" fill="none" stroke="#c9a227" stroke-width="1" opacity=".6"/><path d="M12.2 13.2 19.4 30.6 26.6 13.2" stroke="#fff" stroke-width="3.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M34.2 13.2v13.6c0 5.1-3.5 8.4-8.5 8.4H14.6" stroke="#c9a227" stroke-width="3.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let escritorio = {};
let eu = null; // { usuario, plano, focusAtivo, ia }
const linkZap = (texto, numero) => `https://wa.me/${numero || escritorio.whatsapp || ''}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;

async function api(caminho, { method = 'GET', body } = {}) {
  const r = await fetch('/api/portal' + caminho, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.erro || 'Erro inesperado'), { status: r.status });
  return j;
}

function tela(id) { ['telaEntrada', 'telaPlanos', 'telaApp'].forEach((t) => { $('#' + t).hidden = t !== id; }); }

fetch('/api/config').then((r) => r.json()).then((c) => {
  escritorio = c.escritorio || {};
  const [marca, ...resto] = (escritorio.nome || '').split(/\s+/);
  $$('[data-logo]').forEach((el) => { el.innerHTML = `${LOGO_SVG}<span class="wm"><b>${esc(marca)}</b><small>${esc(resto.join(' '))}</small></span>`; });
}).catch(() => {});

// ---------- Entrada ----------
$$('.abas-entrada button').forEach((b) => b.addEventListener('click', () => {
  $$('.abas-entrada button').forEach((x) => x.classList.toggle('ativa', x === b));
  $('#formLogin').hidden = b.dataset.aba !== 'login';
  $('#formCadastro').hidden = b.dataset.aba !== 'cadastro';
  $('#erroEntrada').hidden = true;
}));
$('#cCnpj').addEventListener('input', (e) => {
  const c = e.target.value.replace(/\D/g, '').slice(0, 14);
  e.target.value = c.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
});
function erroEntrada(msg) { $('#erroEntrada').textContent = msg; $('#erroEntrada').hidden = false; }
$('#formLogin').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  try { await api('/login', { method: 'POST', body: { email: $('#lEmail').value, senha: $('#lSenha').value } }); inicia(); } catch (err) { erroEntrada(err.message); }
});
$('#formCadastro').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const botao = ev.target.querySelector('button'); botao.disabled = true; botao.textContent = 'Criando conta e consultando sua empresa…';
  try {
    await api('/cadastro', { method: 'POST', body: { nome: $('#cNome').value, cnpj: $('#cCnpj').value, email: $('#cEmail').value, telefone: $('#cTel').value, senha: $('#cSenha').value } });
    inicia();
  } catch (err) { erroEntrada(err.message); } finally { botao.disabled = false; botao.textContent = 'Criar minha conta'; }
});
$('#sair').addEventListener('click', async () => { await api('/sair', { method: 'POST' }).catch(() => {}); location.reload(); });

// ---------- Planos ----------
async function mostraPlanos() {
  tela('telaPlanos');
  const { planos, pagamentoOnline } = await api('/planos');
  $('#gradePlanosPortal').innerHTML = planos.map((p) => `
    <div class="plano ${p.destaque ? 'destaque' : ''}">
      ${p.destaque ? '<span class="fita">Mais completo</span>' : ''}
      <h3>${esc(p.nome)}</h3>
      <div class="preco">${brl(p.valor)}<small>/mês</small></div>
      <ul>${p.recursos.map((r) => `<li>${icone('check')}<span>${esc(r)}</span></li>`).join('')}</ul>
      <button class="btn largo" data-plano="${esc(p.id)}">Assinar ${esc(p.nome)}</button>
    </div>`).join('');
  $$('[data-plano]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      const r = await api('/assinar', { method: 'POST', body: { planoId: b.dataset.plano } });
      if (r.link) { location.href = r.link; return; }
      const plano = planos.find((p) => p.id === b.dataset.plano);
      $('#avisoPlano').hidden = false;
      $('#avisoPlano').innerHTML = `<b>Pedido registrado!</b> Para liberar o plano ${esc(plano.nome)} (${brl(plano.valor)}/mês), fale com a gente no WhatsApp para receber o link de pagamento. A liberação é feita logo após a confirmação.
        <div class="linha-botoes"><a class="btn azul" target="_blank" rel="noopener" href="${linkZap(`Olá! Criei minha conta na Área do Cliente (${eu.usuario.email}) e quero assinar o plano ${plano.nome}.`)}">${icone('zap')} Falar no WhatsApp</a></div>`;
    } catch (err) { alert(err.message); } finally { b.disabled = false; }
  }));
  if (!pagamentoOnline) $('#avisoPlano').hidden = true;
}

// ---------- Painel ----------
$$('.lateral button').forEach((b) => b.addEventListener('click', () => abre(b.dataset.aba)));
function abre(aba) {
  $$('.lateral button').forEach((x) => x.classList.toggle('ativa', x.dataset.aba === aba));
  ['empresa', 'notas', 'orcamentos', 'conta', 'simulador', 'recuperar'].forEach((a) => { $('#aba' + a[0].toUpperCase() + a.slice(1)).hidden = a !== aba; });
  ({ empresa: abaEmpresa, notas: abaNotas, orcamentos: abaOrcamentos, conta: abaConta, simulador: () => ferramenta('Simulador', '/planejamento'), recuperar: () => ferramenta('Recuperar', '/economia') })[aba]();
}

// Simulador e Recuperar impostos abrem dentro do painel, já com o CNPJ do assinante
function ferramenta(aba, pagina) {
  const f = $(`#aba${aba} iframe`);
  if (!f.src) f.src = `${pagina}?embed=1&cnpj=${eu.usuario.cnpj}`;
}
window.addEventListener('message', (ev) => {
  if (ev.origin !== location.origin || !ev.data || ev.data.tipo !== 'altura') return;
  $$('iframe.ferramenta').forEach((f) => { if (f.contentWindow === ev.source) f.style.height = `${ev.data.altura + 20}px`; });
});

async function abaEmpresa(atualizar) {
  const el = $('#abaEmpresa');
  el.innerHTML = '<p class="vazio">Carregando sua empresa…</p>';
  try {
    const [{ empresa: e, analise: a, alertas }, rs, das] = await Promise.all([api('/painel' + (atualizar ? '?atualizar=1' : '')), api('/resumo').catch(() => null), api('/das').catch(() => null)]);
    if (!e) { el.innerHTML = '<p class="vazio">Não conseguimos consultar o CNPJ agora. Tente atualizar em instantes.</p>'; return; }
    const urg = (a.itens || []).filter((i) => i.gravidade === 'urgente').length;
    const r = a.reforma;
    el.innerHTML = `
      <h1>${esc(e.razaoSocial)}</h1>
      <p class="sub">${esc(e.atividade)} · ${esc(e.municipio)}/${esc(e.uf)} · atualizado em ${data(a.em)} <button class="sec" id="atualizar">Atualizar agora</button></p>
      <div class="kpis-empresa">
        <div><span>Situação</span><b>${esc(e.situacao)}</b></div>
        <div><span>Regime</span><b>${esc(e.regime)}</b></div>
        <div><span>Pendências urgentes</span><b>${urg}</b></div>
        <div><span>Dívida ativa em cobrança</span><b>${brl(a.dividaAtiva)}</b></div>
      </div>
      ${rs ? cardResumo(rs) : ''}
      ${das && e.regime === 'Simples Nacional' ? cardDas(das.meses) : ''}
      <section class="card">
        <h2>${icone('sino')} Alertas do seu agente</h2>
        <p class="sub">Todo dia o sistema reconsulta seu CNPJ e avisa aqui quando algo muda: situação, dívida ativa, exclusões e prazos.</p>
        ${alertas.length ? `<ul class="alertas">${alertas.map((x) => `<li>${icone('sino')}<span>${esc(x.texto)}<small>${data(x.em)}</small></span></li>`).join('')}</ul>` : '<p class="vazio">Nenhuma mudança desde o cadastro. Vamos avisar aqui assim que algo acontecer.</p>'}
      </section>
      ${r ? `<section class="card reforma-card">
        <div class="reforma-topo"><div><span class="rotulo">Reforma Tributária</span><h2>Seu plano de adequação</h2><p>${esc(r.resumo)}</p></div><span class="nivel nivel-${r.impacto.nivel}">Impacto ${r.impacto.nivel === 'medio' ? 'médio' : r.impacto.nivel}</span></div>
        <p class="impacto-texto">${esc(r.impacto.texto)}</p>
        <ol class="linha-acoes">${r.acoes.map((x) => `<li><span class="quando">${esc(x.quando)}</span><div><b>${esc(x.titulo)}</b><p>${esc(x.texto)}</p></div></li>`).join('')}</ol>
      </section>` : ''}
      <section class="card">
        <h2>Pendências e obrigações</h2>
        ${(a.itens || []).map((i) => `<div class="item" style="cursor:default"><span class="tag ${i.gravidade}">${{ urgente: 'Urgente', atencao: 'Verificar', rotina: 'Rotina', ok: 'Em dia' }[i.gravidade]}</span><div><h3>${esc(i.titulo)}</h3><p>${esc(i.explicacao)}</p></div><span></span></div>`).join('')}
        <div class="linha-botoes"><a class="btn azul" target="_blank" rel="noopener" href="${linkZap(`Olá! Sou cliente da Área do Cliente (${e.razaoSocial}) e quero ajuda com as pendências da empresa.`)}">${icone('zap')} Pedir ajuda à equipe</a></div>
      </section>`;
    $('#atualizar').addEventListener('click', () => abaEmpresa(true));
    $$('[data-copiar]').forEach((b) => b.addEventListener('click', () => { navigator.clipboard.writeText(b.dataset.copiar).then(() => { b.textContent = 'Copiado ✅'; }); }));
  } catch (err) { trataErro(err, el); }
}

// DAS do Simples: estimativa pelas notas e guia liberada pelo contador
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const nomeComp = (c) => `${MESES[+c.slice(5, 7) - 1]}/${c.slice(0, 4)}`;
function cardDas(meses) {
  meses = (meses || []).filter((m) => !m.semDados);
  if (!meses.length) return '';
  const st = (m) => ({
    calculada: m.semMovimento ? '<span class="tag rotina">Sem faturamento</span>' : '<span class="tag atencao">Estimado: o contador está conferindo</span>',
    aprovada: '<span class="tag rotina">Conferido: guia em preparação</span>',
    das_disponivel: m.das && Date.parse(m.das.vencimento) < Date.now() - 86400000 ? '<span class="tag urgente">Vencido: pague com urgência</span>' : '<span class="tag urgente">Guia disponível para pagar</span>',
    paga: '<span class="tag ok">Pago</span>',
  })[m.status] || '';
  return `<section class="card">
    <h2>${icone('moeda')} Seu DAS (Simples Nacional)</h2>
    <p class="sub">Calculado automaticamente pelas suas notas fiscais do mês. O contador confere e libera a guia aqui.</p>
    <div class="tabela-das">${meses.map((m) => `
      <div class="linha-das">
        <div><b>${nomeComp(m.competencia)}</b><small>Faturamento ${brl(m.receita)}${m.notas && m.notas.length ? ` · ${m.notas.length} nota(s)` : ''}</small></div>
        <div><b>${brl(m.das ? m.das.valor : m.valor)}</b><small>vence ${data((m.das && m.das.vencimento) || m.vencimento)}</small></div>
        <div>${st(m)}</div>
        <div>${m.das ? `${m.das.pdf ? `<a class="btn azul pequeno" href="${esc(m.das.pdf)}" target="_blank" rel="noopener">Baixar guia</a>` : ''}${m.das.linhaDigitavel ? ` <button class="sec" data-copiar="${esc(m.das.linhaDigitavel)}">Copiar código de barras</button>` : ''}` : ''}</div>
      </div>`).join('')}
    </div>
  </section>`;
}

const quando = (n) => (n === 0 ? 'hoje' : n === 1 ? 'amanhã' : `em ${n} dias`);
function cardResumo({ resumo: r, canais, preferencias }) {
  const lis = (arr) => `<ul class="alertas">${arr.join('')}</ul>`;
  const enviado = canais.email || canais.whatsapp;
  const meios = [canais.email && 'por e-mail', canais.whatsapp && 'pelo WhatsApp'].filter(Boolean).join(' e ');
  return `
    <section class="card resumo-dia">
      <h2>${icone('ia')} Seu resumo de hoje</h2>
      <p class="sub">${enviado && preferencias.resumo !== false ? `Também enviado todo dia útil de manhã ${meios}.` : 'Este resumo é atualizado todo dia aqui na sua Área.'}</p>
      <h3>📅 Impostos e prazos dos próximos 10 dias</h3>
      ${r.agenda.length ? lis(r.agenda.map((x) => `<li>${icone('sino')}<span><b>${x.data.split('-').reverse().join('/')} · ${quando(x.emDias)}</b> — ${esc(x.titulo)}<small>${esc(x.detalhe)}</small></span></li>`)) : '<p class="vazio">Nada vence nos próximos 10 dias.</p>'}
      ${r.pendentes.length ? `<h3>📝 Orçamentos aguardando aprovação · ${brl(r.valorPendente)}</h3>${lis(r.pendentes.map((o) => `<li>${icone('orc')}<span>Nº ${String(o.numero).padStart(4, '0')} · ${esc(o.cliente.nome)} · <b>${brl(o.total)}</b><small>vence ${quando(o.validade.dias)} · <a target="_blank" rel="noopener" href="${linkZap(`Olá! Passando para lembrar do orçamento${o.titulo ? ` "${o.titulo}"` : ''} de ${brl(o.total)}. Ficou alguma dúvida? ${location.origin}/o/${o.token}`, '')}">lembrar o cliente no WhatsApp</a></small></span></li>`))}` : ''}
      ${r.respondidos.length ? `<h3>✅ Respostas de clientes</h3>${lis(r.respondidos.map((o) => `<li>${icone('check')}<span>${esc(o.cliente.nome)} <b>${o.status === 'aprovado' ? 'aprovou' : 'recusou'}</b> o orçamento de ${brl(o.total)}</span></li>`))}` : ''}
      ${r.dica ? `<h3>💡 Reforma Tributária: dica do dia</h3><p><b>${esc(r.dica.titulo)}:</b> ${esc(r.dica.texto)}</p>` : ''}
    </section>`;
}

// ----- Notas fiscais -----
async function abaNotas() {
  const el = $('#abaNotas');
  el.innerHTML = '<p class="vazio">Carregando notas…</p>';
  try {
    const n = await api('/notas');
    const f = eu.usuario.fiscal || {};
    el.innerHTML = `
      <h1>Notas fiscais de serviço</h1>
      <p class="sub">Informe só o CNPJ (ou CPF) do cliente, a descrição e o valor. Você confere o rascunho e confirma. Este mês: <b>${n.usadas} de ${n.limite}</b> notas.</p>
      ${n.limite ? '' : `<div class="card aviso-sim">A emissão de notas faz parte do plano Completo. <a href="#" id="irConta">Ver planos</a></div>`}
      <section class="card">
        <form id="formNota" class="grade-form">
          <label class="campo"><span>CNPJ ou CPF do cliente</span><input id="nDoc" required maxlength="18" placeholder="Somente números"></label>
          <label class="campo"><span>Valor da nota (R$)</span><input id="nValor" required inputmode="decimal" placeholder="Ex.: 1500,00"></label>
          <label class="campo cheio"><span>Descrição do serviço</span><textarea id="nDesc" required maxlength="2000" rows="3" placeholder="Ex.: Frete de Sorocaba/SP para Campinas/SP, carga de 12 toneladas, em 15/11/2026"></textarea></label>
          <label class="campo"><span>Nome do cliente (se for CPF)</span><input id="nNome" maxlength="160"></label>
          <label class="campo"><span>E-mail do cliente (opcional)</span><input id="nEmail" type="email" maxlength="160"></label>
          <div class="cheio"><button class="btn azul">Gerar rascunho da nota</button></div>
        </form>
        <div id="previewNota"></div>
      </section>
      <section class="card">
        <h2>Notas enviadas</h2>
        ${n.notas.filter((x) => x.status !== 'rascunho').length ? `<table class="lista-docs"><thead><tr><th>Data</th><th>Cliente</th><th class="ocultar-cel">Descrição</th><th>Valor</th><th>Situação</th><th></th></tr></thead><tbody>
          ${n.notas.filter((x) => x.status !== 'rascunho').map((x) => `<tr>
            <td>${data(x.enviadaEm)}${x.numero ? `<br><small>Nº ${esc(x.numero)}</small>` : ''}</td>
            <td>${esc(x.tomador.nome)}<br><small>${docFmt(x.tomador.cnpj || x.tomador.cpf)}</small></td>
            <td class="ocultar-cel">${esc(x.descricao.slice(0, 80))}${x.descricao.length > 80 ? '…' : ''}</td>
            <td>${brl(x.valor)}</td>
            <td><span class="status st-${x.status}">${{ emitida: 'Emitida', processando: 'Processando', fila: 'Com a equipe', erro: 'Erro', cancelada: 'Cancelada' }[x.status] || x.status}</span>${x.erro ? `<br><small style="color:var(--urgente)">${esc(x.erro)}</small>` : ''}</td>
            <td class="acoes">${x.pdf ? `<a href="${esc(x.pdf)}" target="_blank" rel="noopener">PDF</a><a target="_blank" rel="noopener" href="${linkZap(`Olá! Segue a nota fiscal${x.numero ? ` nº ${x.numero}` : ''} no valor de ${brl(x.valor)}: ${x.pdf}`, '')}">Enviar</a>` : ''}</td>
          </tr>`).join('')}</tbody></table>` : '<p class="vazio">Nenhuma nota enviada ainda.</p>'}
      </section>
      <details class="card config-fiscal" ${n.fiscalOk ? '' : 'open'}>
        <summary>Configuração fiscal da sua empresa ${n.fiscalOk ? '✅' : '(preencha uma vez)'}</summary>
        <p class="sub">Esses dados vão em todas as notas. Na dúvida, a equipe V&amp;J preenche para você.</p>
        <form id="formFiscal" class="grade-form">
          <label class="campo"><span>Código IBGE do município (7 dígitos)</span><input id="fMun" maxlength="7" value="${esc(f.codigoMunicipio || '')}" placeholder="Sorocaba: 3552205"></label>
          <label class="campo"><span>Código de tributação nacional do serviço (6 dígitos)</span><input id="fServ" maxlength="6" value="${esc(f.codigoServico || '')}" placeholder="Ex.: 010701"></label>
          <label class="campo"><span>Série da DPS</span><input id="fSerie" type="number" min="1" value="${esc(f.serieDps || 1)}"></label>
          <label class="campo"><span>Próximo número da DPS</span><input id="fNum" type="number" min="1" value="${esc(eu.usuario.proximoDps || 1)}"></label>
          <div class="cheio"><button class="btn azul">Salvar configuração</button> <span id="okFiscal"></span></div>
        </form>
      </details>`;
    if ($('#irConta')) $('#irConta').addEventListener('click', (e) => { e.preventDefault(); abre('conta'); });
    $('#formNota').addEventListener('submit', geraRascunho);
    $('#formFiscal').addEventListener('submit', salvaFiscal);
  } catch (err) { trataErro(err, el); }
}

async function geraRascunho(ev) {
  ev.preventDefault();
  const botao = ev.target.querySelector('button'); botao.disabled = true;
  try {
    const { nota } = await api('/notas', { method: 'POST', body: { documento: $('#nDoc').value, valor: String($('#nValor').value).replace(/\./g, '').replace(',', '.'), descricao: $('#nDesc').value, nome: $('#nNome').value, email: $('#nEmail').value } });
    const u = eu.usuario;
    $('#previewNota').innerHTML = `
      <div class="preview-nota">
        <b>Confira antes de emitir</b>
        <dl>
          <dt>Prestador</dt><dd>${esc(u.empresa ? u.empresa.razaoSocial : u.nome)} · ${docFmt(u.cnpj)}</dd>
          <dt>Cliente</dt><dd>${esc(nota.tomador.nome || '—')} · ${docFmt(nota.tomador.cnpj || nota.tomador.cpf)}${nota.tomador.municipio ? ` · ${esc(nota.tomador.municipio)}/${esc(nota.tomador.uf)}` : ''}</dd>
          <dt>Serviço</dt><dd>${esc(nota.descricao)}</dd>
          <dt>Valor</dt><dd class="valor">${brl(nota.valor)}</dd>
        </dl>
        <p class="sub">Nota emitida não pode ser apagada, só cancelada. Confira o CNPJ, a descrição e o valor.</p>
        <div class="linha-botoes"><button class="btn" id="confirmaNota">Confirmar e emitir ${icone('seta')}</button><button class="sec" id="descartaNota">${icone('lixo')} Descartar</button></div>
      </div>`;
    $('#confirmaNota').addEventListener('click', async () => {
      $('#confirmaNota').disabled = true;
      try {
        const r = await api(`/notas/${nota.id}/emitir`, { method: 'POST' });
        const msg = { fila: 'Nota enviada para a equipe V&J. Você recebe o PDF aqui assim que for emitida.', processando: 'Nota enviada para a prefeitura/Receita. Em instantes ela aparece como emitida.', erro: `Não foi possível emitir: ${r.nota.erro || ''}` }[r.nota.status] || 'Nota enviada.';
        alert(msg);
        abaNotas();
      } catch (err) { alert(err.message); $('#confirmaNota').disabled = false; }
    });
    $('#descartaNota').addEventListener('click', async () => { await api(`/notas/${nota.id}`, { method: 'DELETE' }); $('#previewNota').innerHTML = ''; });
  } catch (err) { alert(err.message); } finally { botao.disabled = false; }
}

async function salvaFiscal(ev) {
  ev.preventDefault();
  try {
    const r = await api('/fiscal', { method: 'PUT', body: { codigoMunicipio: $('#fMun').value, codigoServico: $('#fServ').value, serieDps: $('#fSerie').value, proximoDps: $('#fNum').value } });
    eu.usuario = r.usuario;
    $('#okFiscal').textContent = 'Salvo ✅';
  } catch (err) { $('#okFiscal').textContent = err.message; }
}

// ----- Orçamentos -----
async function abaOrcamentos() {
  const el = $('#abaOrcamentos');
  el.innerHTML = '<p class="vazio">Carregando orçamentos…</p>';
  try {
    const { orcamentos } = await api('/orcamentos');
    el.innerHTML = `
      <h1>Orçamentos</h1>
      <p class="sub">Coloque o CNPJ do cliente, o que vai ser feito e os valores. O sistema monta um orçamento profissional com link para enviar.</p>
      <section class="card">
        <form id="formOrc">
          <div class="grade-form">
            <label class="campo"><span>CNPJ ou CPF do cliente</span><input id="oDoc" maxlength="18" placeholder="Somente números"></label>
            <label class="campo"><span>Nome do cliente</span><input id="oNome" maxlength="160" placeholder="Preenchido pelo CNPJ"></label>
            <label class="campo cheio"><span>Título do orçamento</span><input id="oTitulo" maxlength="160" placeholder="Ex.: Transporte de carga Sorocaba → Campinas (dezembro)"></label>
          </div>
          <div class="itens-orc"><span class="campo"><span>Itens</span></span><div id="itens"></div>
            <button type="button" class="add-item" id="addItem">${icone('mais')} Adicionar item</button></div>
          <div class="grade-form">
            <label class="campo"><span>Desconto (R$)</span><input id="oDesc" inputmode="decimal" placeholder="0,00"></label>
            <label class="campo"><span>Validade (dias)</span><input id="oVal" type="number" min="1" max="180" value="15"></label>
            <label class="campo"><span>Prazo de execução/entrega</span><input id="oPrazo" maxlength="200" placeholder="Ex.: 5 dias úteis após o aceite"></label>
            <label class="campo"><span>Condições de pagamento</span><input id="oPag" maxlength="300" placeholder="Ex.: 50% no aceite e 50% na entrega, via Pix"></label>
            <label class="campo cheio"><span>Escopo / detalhes do serviço</span><textarea id="oEscopo" rows="5" maxlength="6000" placeholder="Descreva o que está incluso"></textarea>
              ${eu.ia ? `<button type="button" class="btn-ia" id="iaEscopo">${icone('ia')} Escrever o escopo com IA</button>` : ''}</label>
            <label class="campo cheio"><span>Observações</span><textarea id="oObs" rows="2" maxlength="2000"></textarea></label>
          </div>
          <div class="total-orc" id="totalOrc"></div>
          <button class="btn azul">Gerar orçamento</button>
        </form>
      </section>
      <section class="card">
        <h2>Orçamentos gerados</h2>
        ${orcamentos.length ? `<table class="lista-docs"><thead><tr><th>Nº</th><th>Cliente</th><th class="ocultar-cel">Título</th><th>Total</th><th>Situação</th><th></th></tr></thead><tbody>
          ${orcamentos.map((o) => { const link = `${location.origin}/o/${o.token}`; return `<tr>
            <td>${String(o.numero).padStart(4, '0')}<br><small>${data(o.criadoEm)}</small></td>
            <td>${esc(o.cliente.nome)}</td><td class="ocultar-cel">${esc(o.titulo || '—')}</td><td>${brl(o.total)}</td>
            <td><select data-status="${o.id}" class="sel-status st-${o.status || 'aguardando'}">${['aguardando', 'aprovado', 'recusado'].map((s) => `<option value="${s}" ${(o.status || 'aguardando') === s ? 'selected' : ''}>${{ aguardando: 'Aguardando', aprovado: 'Aprovado', recusado: 'Recusado' }[s]}</option>`).join('')}</select>${o.respondidoPor && o.respondidoPor !== 'empresa' ? '<br><small>pelo cliente</small>' : ''}</td>
            <td class="acoes"><a href="/o/${esc(o.token)}" target="_blank" rel="noopener">Abrir</a><a target="_blank" rel="noopener" href="${linkZap(`Olá! Segue o orçamento${o.titulo ? ` "${o.titulo}"` : ''} no valor de ${brl(o.total)}: ${link}`, '')}">Enviar</a><button data-copia="${esc(link)}">Copiar link</button></td>
          </tr>`; }).join('')}</tbody></table>` : '<p class="vazio">Nenhum orçamento ainda.</p>'}
      </section>`;
    addItem(); recalc();
    $('#addItem').addEventListener('click', () => addItem());
    $('#oDesc').addEventListener('input', recalc);
    $('#oDoc').addEventListener('change', buscaCliente);
    if ($('#iaEscopo')) $('#iaEscopo').addEventListener('click', escopoIa);
    $('#formOrc').addEventListener('submit', salvaOrc);
    $$('[data-copia]').forEach((b) => b.addEventListener('click', () => { navigator.clipboard.writeText(b.dataset.copia); b.textContent = 'Copiado!'; }));
    $$('[data-status]').forEach((s) => s.addEventListener('change', async () => {
      try { await api(`/orcamentos/${s.dataset.status}`, { method: 'PATCH', body: { status: s.value } }); s.className = `sel-status st-${s.value}`; } catch (err) { alert(err.message); }
    }));
  } catch (err) { trataErro(err, el); }
}
const num = (v) => Number(String(v || '').replace(/\./g, '').replace(',', '.')) || 0;
function addItem() {
  const d = document.createElement('div');
  d.className = 'linha-item';
  d.innerHTML = '<input class="ides" placeholder="Descrição do item" maxlength="500"><input class="iqtd" type="number" min="0" step="any" value="1" aria-label="Quantidade"><input class="ival val" inputmode="decimal" placeholder="Valor unit. (R$)"><button type="button" class="rem" aria-label="Remover">✕</button>';
  $('#itens').appendChild(d);
  d.querySelectorAll('input').forEach((i) => i.addEventListener('input', recalc));
  d.querySelector('.rem').addEventListener('click', () => { d.remove(); recalc(); });
}
function itensForm() {
  return [...$$('#itens .linha-item')].map((d) => ({ descricao: d.querySelector('.ides').value, quantidade: Number(d.querySelector('.iqtd').value) || 1, valor: num(d.querySelector('.ival').value) })).filter((i) => i.descricao);
}
function recalc() {
  const sub = itensForm().reduce((t, i) => t + i.quantidade * i.valor, 0);
  const desc = num($('#oDesc').value);
  $('#totalOrc').textContent = `Total: ${brl(Math.max(0, sub - desc))}`;
}
async function buscaCliente() {
  const c = $('#oDoc').value.replace(/\D/g, '');
  if (c.length !== 14) return;
  try { const r = await fetch('/api/empresa/' + c); const j = await r.json(); if (r.ok) $('#oNome').value = j.empresa.razaoSocial; } catch {}
}
async function escopoIa() {
  const b = $('#iaEscopo'); b.disabled = true; b.textContent = 'Escrevendo…';
  try {
    const r = await api('/orcamentos/escopo', { method: 'POST', body: { itens: itensForm(), titulo: $('#oTitulo').value, cliente: $('#oNome').value } });
    $('#oEscopo').value = r.escopo;
  } catch (err) { alert(err.message); } finally { b.disabled = false; b.innerHTML = `${icone('ia')} Escrever o escopo com IA`; }
}
async function salvaOrc(ev) {
  ev.preventDefault();
  try {
    const { orcamento } = await api('/orcamentos', { method: 'POST', body: {
      documento: $('#oDoc').value, nomeCliente: $('#oNome').value, titulo: $('#oTitulo').value, itens: itensForm(),
      desconto: num($('#oDesc').value), validadeDias: $('#oVal').value, prazo: $('#oPrazo').value, pagamento: $('#oPag').value,
      escopo: $('#oEscopo').value, observacoes: $('#oObs').value,
    } });
    window.open(`/o/${orcamento.token}`, '_blank');
    abaOrcamentos();
  } catch (err) { alert(err.message); }
}

// ----- Conta -----
function abaConta() {
  const u = eu.usuario;
  $('#abaConta').innerHTML = `
    <h1>Minha conta</h1>
    <section class="card">
      <div class="kpis-empresa">
        <div><span>Nome</span><b>${esc(u.nome)}</b></div>
        <div><span>E-mail</span><b>${esc(u.email)}</b></div>
        <div><span>Plano</span><b>${esc(eu.plano ? eu.plano.nome : '—')}</b></div>
        <div><span>Acesso até</span><b>${u.dono ? 'Sem vencimento' : u.assinante ? data(u.planoAte) : 'Inativo'}</b></div>
      </div>
      <div class="linha-botoes"><button class="btn azul" id="trocarPlano">Ver planos / renovar</button><a class="sec" target="_blank" rel="noopener" href="${linkZap('Olá! Preciso de ajuda com minha conta na Área do Cliente.')}">${icone('zap')} Suporte</a></div>
    </section>`;
  $('#trocarPlano').addEventListener('click', mostraPlanos);
  $('#abaConta').insertAdjacentHTML('beforeend', '<section class="card" id="cardCert"><h2>Certificado digital</h2><p class="sub">Carregando…</p></section>');
  cardCertificado();
  const p = u.preferencias || {};
  $('#abaConta').insertAdjacentHTML('beforeend', `
    <section class="card">
      <h2>${icone('sino')} Resumo diário</h2>
      <p class="sub">Todo dia útil de manhã enviamos um resumo com os impostos que vencem, orçamentos pendentes, notas e alertas da sua empresa.</p>
      <form id="formPref" class="grade-form">
        <label class="campo cheio"><input type="checkbox" id="pResumo" ${p.resumo !== false ? 'checked' : ''}> Quero receber o resumo diário</label>
        <label class="campo"><input type="checkbox" id="pEmail" ${p.resumoEmail !== false ? 'checked' : ''}> Por e-mail (${esc(u.email)})</label>
        <label class="campo"><input type="checkbox" id="pZap" ${p.resumoWhatsapp !== false ? 'checked' : ''}> Pelo WhatsApp</label>
        <label class="campo"><span>Número do WhatsApp</span><input id="pTel" value="${esc(u.telefone || '')}" inputmode="tel" maxlength="20"></label>
        <label class="campo"><span>&nbsp;</span><span><input type="checkbox" id="pFunc" ${p.funcionarios ? 'checked' : ''}> A empresa tem funcionários (inclui FGTS, INSS e salários na agenda)</span></label>
        <div class="cheio"><button class="btn azul">Salvar preferências</button> <span id="okPref"></span></div>
      </form>
    </section>`);
  $('#formPref').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      const r = await api('/preferencias', { method: 'PUT', body: { resumo: $('#pResumo').checked, resumoEmail: $('#pEmail').checked, resumoWhatsapp: $('#pZap').checked, funcionarios: $('#pFunc').checked, telefone: $('#pTel').value } });
      eu.usuario = r.usuario; $('#okPref').textContent = 'Salvo ✅';
    } catch (err) { $('#okPref').textContent = err.message; }
  });
}

// Certificado A1: busca automática das notas da empresa
async function cardCertificado() {
  const el = $('#cardCert');
  let c;
  try { c = (await api('/certificado')).certificado; } catch (err) { return trataErro(err, el); }
  const topo = `<h2>${icone('nota')} Certificado digital: busca automática das notas</h2>`;
  if (!c.disponivel) { el.innerHTML = `${topo}<p class="sub">Em breve: conecte o certificado A1 da empresa e as notas chegam sozinhas, todo dia.</p>`; return; }
  if (c.ativo) {
    const vence = Math.ceil((Date.parse(c.validoAte) - Date.now()) / 86400000);
    el.innerHTML = `${topo}
      <p class="sub">Conectado. Todo dia buscamos nos serviços oficiais as <b>notas de compra (NF-e)</b> e as <b>notas de serviço do padrão nacional (NFS-e)</b> da empresa. Elas já entram no Simulador de impostos.</p>
      <div class="kpis-empresa">
        <div><span>Titular</span><b>${esc(c.titular)}</b></div>
        <div><span>Válido até</span><b style="${vence <= 30 ? 'color:var(--urgente)' : ''}">${data(c.validoAte)}${vence <= 30 ? ` (${Math.max(0, vence)} dias)` : ''}</b></div>
        <div><span>Notas baixadas</span><b>${(c.totalNotas || 0).toLocaleString('pt-BR')}</b></div>
        <div><span>Última busca</span><b>${c.ultimaBusca ? new Date(c.ultimaBusca).toLocaleString('pt-BR') : 'Em andamento…'}</b></div>
      </div>
      ${c.ultimoErro ? `<p class="erro-form">Última busca com problema: ${esc(c.ultimoErro)}. Tentamos de novo automaticamente.</p>` : ''}
      <div class="linha-botoes"><button class="btn azul" id="certBuscar">Buscar agora</button><button class="sec" id="certSair">Desconectar e apagar o certificado</button> <span id="certMsg"></span></div>`;
    $('#certBuscar').addEventListener('click', async () => {
      $('#certMsg').textContent = 'Buscando…';
      try { const r = await api('/certificado/buscar', { method: 'POST' }); $('#certMsg').textContent = `${r.resultado.novas} nota(s) nova(s).`; setTimeout(cardCertificado, 1500); } catch (err) { $('#certMsg').textContent = err.message; }
    });
    $('#certSair').addEventListener('click', async () => {
      if (!confirm('Desconectar? O certificado e as notas baixadas serão apagados do nosso sistema.')) return;
      try { await api('/certificado', { method: 'DELETE' }); cardCertificado(); } catch (err) { $('#certMsg').textContent = err.message; }
    });
    return;
  }
  el.innerHTML = `${topo}
    <p class="sub">Envie o <b>certificado A1</b> da empresa (arquivo .pfx ou .p12) e a senha.${eu.usuario.dono ? ' <b>Contador:</b> pode enviar aqui também o certificado de uma empresa cliente; ela entra na sua carteira automaticamente.' : ''} Todo dia buscamos as notas nos serviços oficiais da Receita, sem você precisar baixar nada.</p>
    <form id="formCert" class="grade-form">
      <label class="campo"><span>Arquivo do certificado</span><input type="file" id="certArq" accept=".pfx,.p12" required></label>
      <label class="campo"><span>Senha do certificado</span><input type="password" id="certSenha" required autocomplete="off"></label>
      <label class="campo cheio"><span style="display:flex;gap:10px;align-items:flex-start"><input type="checkbox" id="certOk" required style="width:auto;margin-top:4px"><span>Autorizo a ${esc(escritorio.nome || 'V&J')} a usar este certificado <b>somente para consultar as notas fiscais</b> da ${eu.usuario.dono ? 'empresa dona do certificado (a minha ou a de um cliente que me autorizou)' : 'minha empresa'}. Ele fica guardado criptografado e posso desconectar e apagar quando quiser.</span></span></label>
      <div class="cheio"><button class="btn azul">Conectar certificado</button> <span id="certMsg"></span></div>
    </form>
    <p class="sub" style="font-size:.85rem">Vem automático: notas de compra dos últimos 90 dias e todas as novas, e notas de serviço do padrão nacional. Notas de venda antigas e de loja (NFC-e) continuam pelo envio do arquivo .zip.</p>`;
  $('#formCert').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = $('#certArq').files[0];
    if (!f) return;
    if (f.size > 40000) { $('#certMsg').textContent = 'Arquivo grande demais para um certificado A1.'; return; }
    $('#certMsg').textContent = 'Conferindo o certificado…';
    const b64 = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.readAsDataURL(f); });
    try {
      const r = await api('/certificado', { method: 'POST', body: { pfx: b64, senha: $('#certSenha').value, autorizo: $('#certOk').checked } });
      if (r.carteira) {
        $('#formCert').reset();
        $('#certMsg').innerHTML = `✅ Certificado de <b>${esc(r.carteira.nome)}</b> (${docFmt(r.carteira.cnpj)}) conectado na sua carteira de clientes. Acompanhe em <a href="/admin">Admin › Meus clientes</a>.`;
        return;
      }
      cardCertificado();
    } catch (err) { $('#certMsg').textContent = err.message; }
  });
}

function trataErro(err, el) {
  if (err.status === 401) return inicia();
  if (err.status === 402) return mostraPlanos();
  el.innerHTML = `<p class="erro-form">${esc(err.message)}</p>`;
}

async function inicia() {
  try {
    eu = await api('/eu');
  } catch {
    tela('telaEntrada');
    $('#topoConta').hidden = true;
    return;
  }
  $('#topoConta').hidden = false;
  $('#nomeEmpresa').textContent = eu.usuario.empresa ? eu.usuario.empresa.razaoSocial : eu.usuario.nome;
  $('#linkAdmin').hidden = !eu.usuario.dono;
  if (!eu.usuario.assinante) return mostraPlanos();
  tela('telaApp');
  abre('empresa');
}
inicia();
