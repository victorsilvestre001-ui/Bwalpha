// Painel do escritório: empresas da carteira -> notas fiscais, PGDAS-D/DAS e configuração.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const doc = (d) => { const c = String(d || ''); return c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c.length === 11 ? c.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : c; };
const data = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');
const dataIso = (d) => (d ? d.split('-').reverse().join('/') : '—');
const icone = (id) => `<svg class="i"><use href="#i-${id}"/></svg>`;
const iniciais = (n) => String(n || '?').replace(/\b(LTDA|ME|EPP|EIRELI|S\/?A|SLU)\b/gi, '').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const comp = (c) => `${MESES[+c.slice(5, 7) - 1]}/${c.slice(0, 4)}`;
const pct = (v) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

let senha = '';
try { senha = sessionStorage.getItem('senhaAdmin') || ''; } catch { /* sem armazenamento */ }

async function api(caminho, { method, body } = {}) {
  const r = await fetch('/api/admin/portal' + caminho, { method: method || (body ? 'POST' : 'GET'), headers: { 'x-admin-senha': senha, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.erro || 'Erro inesperado'), { status: r.status });
  return j;
}

function aviso(texto, tipo = 'ok') {
  const el = $('#aviso');
  el.className = `aviso ${tipo === 'erro' ? 'erro' : ''}`;
  el.innerHTML = `${tipo === 'erro' ? '' : icone('check')}<span>${texto}</span>`;
  el.hidden = false;
  clearTimeout(aviso.t);
  aviso.t = setTimeout(() => { el.hidden = true; }, 4200);
}

// Diálogo genérico: devolve uma Promise com o resultado do botão clicado
function dialogo({ titulo, sub = '', corpo = '', botoes = [] }) {
  const dlg = $('#dlg');
  $('#dlgCorpo').innerHTML = `<div class="dlg-cab"><h2>${titulo}</h2>${sub ? `<p>${sub}</p>` : ''}</div><div class="dlg-corpo">${corpo}</div><div class="dlg-pe">${botoes.map((b, i) => `<button type="button" class="btn ${b.classe || ''}" data-b="${i}">${b.texto}</button>`).join('')}</div>`;
  dlg.showModal();
  return new Promise((ok) => {
    $$('[data-b]', dlg).forEach((btn) => btn.addEventListener('click', async () => {
      const b = botoes[+btn.dataset.b];
      if (b.acao) {
        btn.disabled = true;
        try { const r = await b.acao(dlg); if (r === false) { btn.disabled = false; return; } ok(r); dlg.close(); } catch (err) { btn.disabled = false; mostraErroDlg(err.message); }
      } else { ok(b.valor); dlg.close(); }
    }));
    dlg.addEventListener('cancel', () => ok(null), { once: true });
  });
}
function mostraErroDlg(texto) {
  let el = $('#dlg .msg.erro');
  if (!el) { el = document.createElement('p'); el.className = 'msg erro'; $('#dlg .dlg-corpo').append(el); }
  el.textContent = texto;
}

// ---------- Entrada ----------
$('#formLogin').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  senha = $('#senha').value;
  try { sessionStorage.setItem('senhaAdmin', senha); } catch { /* ok */ }
  inicia();
});
$('#sair').addEventListener('click', (e) => { e.preventDefault(); senha = ''; try { sessionStorage.removeItem('senhaAdmin'); } catch { /* ok */ } location.hash = ''; location.reload(); });

async function inicia() {
  try {
    await api('/escritorio/empresas');
    $('#telaLogin').hidden = true;
    $('#app').hidden = false;
    rota();
    contaPedidos();
  } catch (err) {
    $('#app').hidden = true;
    $('#telaLogin').hidden = false;
    if (senha) { $('#erroLogin').textContent = err.status === 401 ? 'Senha incorreta.' : err.message; $('#erroLogin').hidden = false; }
  }
}
window.addEventListener('hashchange', rota);

function rota() {
  const partes = location.hash.replace(/^#\/?/, '').split('/');
  $$('.lateral [data-menu]').forEach((a) => a.classList.toggle('ativo', a.dataset.menu === (partes[0] === 'empresa' ? 'empresas' : (partes[0] || 'empresas'))));
  if (partes[0] === 'empresa' && partes[1]) return telaEmpresa(partes[1], partes[2] || 'notas');
  if (partes[0] === 'pedidos') return telaPedidos();
  return telaEmpresas();
}

async function contaPedidos() {
  try {
    const { notas } = await api('/notas');
    const n = notas.filter((x) => ['fila', 'erro'].includes(x.status)).length;
    $('#contPedidos').textContent = n; $('#contPedidos').hidden = !n;
  } catch { /* ok */ }
}

// ---------- Empresas ----------
let filtroEmp = 'todas';
async function telaEmpresas() {
  const el = $('#conteudo');
  el.innerHTML = '<p class="vazio">Carregando empresas…</p>';
  const { empresas } = await api('/escritorio/empresas');
  const ligadas = empresas.filter((e) => e.emissao === 'producao').length;
  const semCert = empresas.filter((e) => !e.certificado.ativo).length;
  const faturado = empresas.reduce((t, e) => t + e.notasMes.valor, 0);
  const dasPend = empresas.filter((e) => e.das && ['calculada', 'aprovada'].includes(e.das.status)).length;
  el.innerHTML = `
    <div class="cab">
      <div><h1>Empresas</h1><p>As empresas para as quais o escritório emite notas e apura o Simples.</p></div>
      <button class="btn primario" id="novaEmp">${icone('mais')} Cadastrar empresa</button>
    </div>
    <div class="kpis">
      <div class="kpi"><span>Empresas</span><b>${empresas.length}</b><small>${semCert ? `${semCert} sem certificado` : 'todas com certificado'}</small></div>
      <div class="kpi"><span>Emissão automática</span><b>${ligadas}</b><small>ligadas em produção</small></div>
      <div class="kpi"><span>Notas no mês</span><b>${brl(faturado)}</b><small>${empresas.reduce((t, e) => t + e.notasMes.quantidade, 0)} nota(s)</small></div>
      <div class="kpi"><span>DAS a conferir</span><b>${dasPend}</b><small>competência anterior</small></div>
    </div>
    <div class="ferramentas">
      <div class="busca">${icone('busca')}<input id="buscaEmp" placeholder="Buscar por nome ou CNPJ"></div>
      <div class="filtros">${[['todas', 'Todas'], ['ligada', 'Emissão ligada'], ['semcert', 'Sem certificado'], ['das', 'DAS a conferir']].map(([v, t]) => `<button class="filtro ${filtroEmp === v ? 'ativo' : ''}" data-f="${v}">${t}</button>`).join('')}</div>
    </div>
    <div class="card sem-pad"><table class="tabela"><thead><tr><th>Empresa</th><th class="ocultar-cel">Regime</th><th>Certificado</th><th>Emissão de NF</th><th class="num">Notas no mês</th><th>DAS</th><th></th></tr></thead><tbody id="linhasEmp"></tbody></table></div>`;
  const desenha = () => {
    const q = $('#buscaEmp').value.trim().toLowerCase().replace(/[./-]/g, '');
    const lista = empresas.filter((e) => (!q || (e.nome + ' ' + e.fantasia).toLowerCase().includes(q) || e.cnpj.includes(q))
      && (filtroEmp !== 'ligada' || e.emissao === 'producao') && (filtroEmp !== 'semcert' || !e.certificado.ativo) && (filtroEmp !== 'das' || (e.das && ['calculada', 'aprovada'].includes(e.das.status))));
    $('#linhasEmp').innerHTML = lista.length ? lista.map((e) => `
      <tr class="clicavel" data-id="${e.id}">
        <td><div class="empresa-cel"><span class="avatar">${esc(iniciais(e.fantasia || e.nome))}</span><div><b>${esc(e.nome)}</b><small>${doc(e.cnpj)}${e.municipio ? ` · ${esc(e.municipio)}/${esc(e.uf)}` : ''}</small></div></div></td>
        <td class="ocultar-cel">${esc(e.regime)}</td>
        <td>${chipCert(e)}</td>
        <td>${chipEmissao(e.emissao)}</td>
        <td class="num"><b>${brl(e.notasMes.valor)}</b><br><small>${e.notasMes.quantidade} nota(s)${e.pendentes ? ` · <span style="color:var(--atencao)">${e.pendentes} pendente(s)</span>` : ''}</small></td>
        <td>${e.das ? `${chipDas(e.das.status)}<br><small>${comp(e.das.competencia)} · ${brl(e.das.valor)}</small>` : '<span class="chip neutro">—</span>'}</td>
        <td class="acoes">${icone('seta')}</td>
      </tr>`).join('') : '<tr><td colspan="7" class="vazio">Nenhuma empresa encontrada.</td></tr>';
    $$('#linhasEmp tr[data-id]').forEach((tr) => tr.addEventListener('click', () => { location.hash = `#/empresa/${tr.dataset.id}/notas`; }));
  };
  $('#buscaEmp').addEventListener('input', desenha);
  $$('[data-f]').forEach((b) => b.addEventListener('click', () => { filtroEmp = b.dataset.f; $$('[data-f]').forEach((x) => x.classList.toggle('ativo', x === b)); desenha(); }));
  $('#novaEmp').addEventListener('click', cadastraEmpresa);
  desenha();
}

const chipCert = (e) => {
  if (!e.certificado.ativo) return '<span class="chip erro">Não conectado</span>';
  const dias = Math.ceil((Date.parse(e.certificado.validoAte) - Date.now()) / 86400000);
  return dias <= 30 ? `<span class="chip atencao">Vence ${data(e.certificado.validoAte)}</span>` : `<span class="chip ok">Até ${data(e.certificado.validoAte)}</span>`;
};
const chipEmissao = (v) => ({ producao: '<span class="chip ok">Automática</span>', homologacao: '<span class="chip info">Em teste</span>' })[v] || '<span class="chip neutro">Manual</span>';
const chipDas = (s) => ({ calculada: '<span class="chip atencao">A conferir</span>', aprovada: '<span class="chip info">Gerar guia</span>', das_disponivel: '<span class="chip info">Guia enviada</span>', paga: '<span class="chip ok">Paga</span>' })[s] || `<span class="chip neutro">${esc(s)}</span>`;

async function cadastraEmpresa() {
  const r = await dialogo({
    titulo: 'Cadastrar empresa',
    sub: 'Os dados (razão social, endereço, regime) vêm da Receita pelo CNPJ.',
    corpo: `<label class="campo"><span>CNPJ da empresa</span><input id="dCnpj" inputmode="numeric" placeholder="00.000.000/0000-00" autofocus></label>
            <label class="campo"><span>WhatsApp do cliente (opcional)</span><input id="dTel" placeholder="(11) 99999-9999"></label>`,
    botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Cadastrar', classe: 'primario', acao: async (d) => api('/empresas', { body: { cnpj: $('#dCnpj', d).value, telefone: $('#dTel', d).value } }) }],
  });
  if (r && r.usuario) { aviso('Empresa cadastrada.'); location.hash = `#/empresa/${r.usuario.id}/config`; }
}

// ---------- Empresa ----------
async function telaEmpresa(id, aba) {
  const el = $('#conteudo');
  if (!telaEmpresa.atual || telaEmpresa.atual !== id) el.innerHTML = '<p class="vazio">Carregando…</p>';
  telaEmpresa.atual = id;
  let d;
  try { d = await api(`/escritorio/empresas/${id}`); } catch (err) { el.innerHTML = `<p class="msg erro">${esc(err.message)}</p>`; return; }
  const e = d.empresa;
  el.innerHTML = `
    <a class="migalha" href="#/empresas">${icone('volta')} Empresas</a>
    <div class="cab">
      <div class="empresa-topo">
        <span class="avatar">${esc(iniciais(e.fantasia || e.nome))}</span>
        <div><h1>${esc(e.nome)}</h1>
          <div class="meta"><span class="chip neutro">${doc(e.cnpj)}</span><span class="chip neutro">${esc(e.regime)}</span>${e.municipio ? `<span class="chip neutro">${esc(e.municipio)}/${esc(e.uf)}</span>` : ''}${chipCert(e)}${chipEmissao(e.emissao)}</div>
        </div>
      </div>
    </div>
    <nav class="abas">
      <a href="#/empresa/${id}/notas" class="${aba === 'notas' ? 'ativo' : ''}">${icone('nota')} Notas fiscais</a>
      <a href="#/empresa/${id}/das" class="${aba === 'das' ? 'ativo' : ''}">${icone('calc')} PGDAS-D e DAS</a>
      <a href="#/empresa/${id}/config" class="${aba === 'config' ? 'ativo' : ''}">${icone('engr')} Configuração</a>
    </nav>
    <section id="abaCorpo"></section>`;
  ({ notas: abaNotas, das: abaDas, config: abaConfig })[aba]?.(d);
}

// ----- Notas fiscais -----
const STATUS_NOTA = { emitida: ['ok', 'Emitida'], processando: ['info', 'Processando'], fila: ['atencao', 'Com a equipe'], erro: ['erro', 'Recusada'], cancelada: ['neutro', 'Cancelada'] };
function abaNotas(d) {
  const e = d.empresa;
  const faixa = e.emissao === 'producao'
    ? `<div class="faixa ok">${icone('raio')}<span><b>Emissão automática ligada.</b> A nota sai na hora pela Receita (NFS-e Nacional) com o certificado da empresa.</span></div>`
    : e.emissao === 'homologacao'
      ? `<div class="faixa info">${icone('raio')}<span><b>Emissão em teste.</b> As notas vão para a homologação da Receita, sem valor fiscal.</span><a class="btn pequeno" href="#/empresa/${e.id}/config">Configurar</a></div>`
      : `<div class="faixa atencao">${icone('raio')}<span><b>Emissão manual.</b> O pedido fica em "Pedidos de nota" para a equipe emitir no Emissor Nacional.</span><a class="btn pequeno" href="#/empresa/${e.id}/config">Ligar emissão automática</a></div>`;
  $('#abaCorpo').innerHTML = `
    ${faixa}
    <div class="grade-nota">
      <div class="card">
        <h2>Emitir nota fiscal</h2>
        ${d.tomadores.length ? `<div class="chips-freq">${d.tomadores.map((t, i) => `<button type="button" data-freq="${i}">${esc((t.nome || doc(t.documento)).slice(0, 34))}</button>`).join('')}</div>` : ''}
        <form id="formNota" novalidate>
          <div class="passo"><span class="n">1</span><div>
            <label class="campo"><span>Para quem? (CNPJ ou CPF do tomador)</span><input id="nDoc" inputmode="numeric" placeholder="00.000.000/0000-00" autocomplete="off"></label>
            <div id="nTomador" class="tomador" hidden></div>
            <div id="nCpf" hidden><label class="campo"><span>Nome do tomador</span><input id="nNome" maxlength="160"></label></div>
          </div></div>
          <div class="passo"><span class="n">2</span><div>
            <label class="campo"><span>Quanto?</span><div class="valor-campo"><i>R$</i><input id="nValor" inputmode="numeric" placeholder="0,00" autocomplete="off"></div></label>
          </div></div>
          <div class="passo"><span class="n">3</span><div>
            <label class="campo"><span>O que foi feito?</span><textarea id="nDesc" rows="4" maxlength="2000" placeholder="Ex.: Manutenção corretiva do motor elétrico da linha 2, em 15/11/2026"></textarea></label>
          </div></div>
          <button class="btn primario largo">Conferir e emitir ${icone('seta')}</button>
          <p id="nMsg" class="msg erro" hidden></p>
        </form>
      </div>
      <div class="card sem-pad">
        <div style="padding:20px 22px 6px;display:flex;justify-content:space-between;align-items:center"><h2 style="margin:0">Notas da empresa</h2><small>${d.notas.length} no total</small></div>
        <table class="tabela"><thead><tr><th>Data</th><th>Tomador</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead><tbody>
        ${d.notas.length ? d.notas.map((n) => { const [cls, txt] = STATUS_NOTA[n.status] || ['neutro', n.status]; return `<tr>
          <td>${data(n.enviadaEm)}${n.numero ? `<br><small>Nº ${esc(n.numero)}</small>` : ''}</td>
          <td><b class="trunca" title="${esc(n.tomador.nome || '')}">${esc(n.tomador.nome || '—')}</b><small class="trunca" title="${esc(n.descricao)}">${esc(n.descricao)}</small></td>
          <td class="num"><b>${brl(n.valor)}</b></td>
          <td><span class="chip ${cls}">${txt}</span>${n.erro ? `<br><small style="color:var(--erro)">${esc(n.erro.slice(0, 90))}</small>` : ''}</td>
          <td class="acoes"><div class="acoes-col">${n.pdf ? `<a class="lnk" href="${esc(n.pdf)}" target="_blank" rel="noopener">${icone('pdf')} PDF</a>` : ''}<button class="lnk" data-repetir="${n.id}">Repetir</button>${n.status === 'emitida' && !n.cancelamentoPedido ? `<button class="lnk perigo" data-cancelar="${n.id}">Cancelar</button>` : ''}</div></td>
        </tr>`; }).join('') : '<tr><td colspan="5" class="vazio">Nenhuma nota ainda. Emita a primeira ao lado.</td></tr>'}
        </tbody></table>
      </div>
    </div>`;
  ligaFormNota(d);
}

const mascaraDoc = (v) => { const c = String(v || '').replace(/\D/g, '').slice(0, 14); return c.length <= 11 ? c.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2') : c.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2'); };
const mascaraValor = (v) => { const c = String(v || '').replace(/\D/g, '').replace(/^0+/, ''); return c ? (Number(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''; };
const numValor = (v) => Number(String(v || '').replace(/\./g, '').replace(',', '.')) || 0;

function ligaFormNota(d) {
  const e = d.empresa;
  let timer;
  const atualiza = () => {
    const c = $('#nDoc').value.replace(/\D/g, '');
    const info = $('#nTomador');
    $('#nCpf').hidden = c.length !== 11;
    clearTimeout(timer);
    if (c.length !== 14) { info.hidden = true; return; }
    info.hidden = false; info.className = 'tomador carregando'; info.textContent = 'Buscando na Receita…';
    timer = setTimeout(async () => {
      try {
        const t = await api('/escritorio/tomador/' + c);
        info.className = 'tomador ok';
        info.innerHTML = `${icone('check')}<span><b>${esc(t.nome)}</b><br><small>${esc([t.municipio, t.uf].filter(Boolean).join('/'))}${t.situacao && t.situacao !== 'ATIVA' ? ` · <b style="color:var(--erro)">situação ${esc(t.situacao)}</b>` : ''}</small></span>`;
      } catch (err) { info.className = 'tomador erro'; info.textContent = err.message; }
    }, 300);
  };
  const preenche = (t) => {
    $('#nDoc').value = mascaraDoc(t.documento); $('#nNome').value = t.nome || ''; $('#nDesc').value = t.descricao || '';
    $('#nValor').value = t.valor ? mascaraValor(Math.round(t.valor * 100)) : ''; atualiza(); (t.valor ? $('#nDesc') : $('#nValor')).focus();
  };
  $('#nDoc').addEventListener('input', (ev) => { ev.target.value = mascaraDoc(ev.target.value); atualiza(); });
  $('#nValor').addEventListener('input', (ev) => { ev.target.value = mascaraValor(ev.target.value); });
  $$('[data-freq]').forEach((b) => b.addEventListener('click', () => { const t = d.tomadores[+b.dataset.freq]; preenche({ documento: t.documento, nome: t.nome, descricao: t.ultimaDescricao }); }));
  $$('[data-repetir]').forEach((b) => b.addEventListener('click', () => { const n = d.notas.find((x) => x.id === b.dataset.repetir); preenche({ documento: n.tomador.cnpj || n.tomador.cpf, nome: n.tomador.nome, descricao: n.descricao, valor: n.valor }); window.scrollTo({ top: 0, behavior: 'smooth' }); }));
  $$('[data-cancelar]').forEach((b) => b.addEventListener('click', () => cancelaNota(e, d.notas.find((x) => x.id === b.dataset.cancelar))));
  $('#formNota').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const msg = (t) => { $('#nMsg').textContent = t; $('#nMsg').hidden = !t; };
    const c = $('#nDoc').value.replace(/\D/g, '');
    if (c.length !== 11 && c.length !== 14) return msg('Informe o CNPJ ou CPF do tomador.');
    if (!(numValor($('#nValor').value) > 0)) return msg('Informe o valor da nota.');
    if ($('#nDesc').value.trim().length < 5) return msg('Descreva o serviço prestado.');
    msg('');
    let rasc;
    try { rasc = (await api(`/escritorio/empresas/${e.id}/notas`, { body: { documento: c, valor: String(numValor($('#nValor').value)), descricao: $('#nDesc').value, nome: $('#nNome').value } })).nota; } catch (err) { return msg(err.message); }
    const destino = { producao: 'A nota será emitida <b>agora</b> na Receita, com valor fiscal.', homologacao: 'A nota irá para a <b>homologação</b> da Receita (teste, sem valor fiscal).' }[e.emissao] || 'O pedido irá para a <b>fila da equipe</b>, para emissão no Emissor Nacional.';
    const r = await dialogo({
      titulo: 'Conferir nota fiscal', sub: destino,
      corpo: `<dl class="confere"><dt>Prestador</dt><dd><b>${esc(e.nome)}</b><br><small>${doc(e.cnpj)}</small></dd>
        <dt>Tomador</dt><dd><b>${esc(rasc.tomador.nome || '—')}</b><br><small>${doc(rasc.tomador.cnpj || rasc.tomador.cpf)}${rasc.tomador.municipio ? ` · ${esc(rasc.tomador.municipio)}/${esc(rasc.tomador.uf)}` : ''}</small></dd>
        <dt>Serviço</dt><dd>${esc(rasc.descricao)}</dd><dt>Valor</dt><dd class="valor">${brl(rasc.valor)}</dd></dl>`,
      botoes: [{ texto: 'Voltar e corrigir', valor: 'voltar' }, { texto: `${e.emissao === 'producao' ? 'Emitir nota' : 'Enviar'} ${icone('seta')}`, classe: 'ouro', acao: async () => (await api(`/escritorio/empresas/${e.id}/notas/${rasc.id}/emitir`, { method: 'POST' })).nota }],
    });
    if (!r || r === 'voltar') { await api(`/escritorio/empresas/${e.id}/notas/${rasc.id}`, { method: 'DELETE' }).catch(() => {}); return; }
    const txt = { emitida: `Nota ${r.numero ? 'nº ' + esc(r.numero) + ' ' : ''}emitida pela Receita.`, processando: 'Enviada. A Receita ainda está processando.', fila: 'Pedido enviado para a fila da equipe.', erro: `A Receita recusou: ${esc(r.erro || '')}` }[r.status] || 'Enviada.';
    aviso(txt, r.status === 'erro' ? 'erro' : 'ok');
    telaEmpresa(e.id, 'notas'); contaPedidos();
  });
}

async function cancelaNota(e, n) {
  const r = await dialogo({
    titulo: `Cancelar nota${n.numero ? ' nº ' + esc(n.numero) : ''}`, sub: `${esc(n.tomador.nome)} · ${brl(n.valor)}`,
    corpo: '<label class="campo"><span>Motivo do cancelamento (mínimo 15 caracteres)</span><textarea id="dMotivo" rows="3" maxlength="255"></textarea></label>',
    botoes: [{ texto: 'Voltar', valor: null }, { texto: 'Cancelar nota', classe: 'primario', acao: async (d) => (await api(`/escritorio/empresas/${e.id}/notas/${n.id}/cancelar`, { body: { justificativa: $('#dMotivo', d).value } })).nota }],
  });
  if (r) { aviso(r.status === 'cancelada' ? 'Nota cancelada na Receita.' : 'Pedido de cancelamento registrado.'); telaEmpresa(e.id, 'notas'); }
}

// ----- PGDAS-D e DAS -----
const STATUS_APU = { calculada: 'A conferir', aprovada: 'Aprovada: gerar a guia', das_disponivel: 'Guia enviada ao cliente', paga: 'Paga' };
function abaDas(d) {
  const e = d.empresa;
  if (!d.apuracao) { $('#abaCorpo').innerHTML = `<div class="card vazio">${e.regime === 'MEI' ? 'Empresa MEI: o DAS-MEI é fixo e não passa pelo PGDAS-D.' : 'Esta empresa não está no Simples Nacional.'}</div>`; return; }
  const meses = d.apuracao.meses;
  const atual = meses[0]; // última competência fechada
  const hoje = new Date().toISOString().slice(0, 10);
  $('#abaCorpo').innerHTML = `
    <div class="kpis">
      <div class="kpi"><span>Competência</span><b>${comp(atual.competencia)}</b><small>${STATUS_APU[atual.status] || atual.status}</small></div>
      <div class="kpi"><span>Receita do mês</span><b>${brl(atual.receita)}</b><small>${atual.notas.length} nota(s)</small></div>
      <div class="kpi"><span>RBT12</span><b>${brl(atual.rbt12)}</b><small>${esc(atual.regraRbt12 || '')}</small></div>
      <div class="kpi"><span>DAS</span><b>${brl(atual.das ? atual.das.valor : atual.valor)}</b><small>vence ${dataIso((atual.das && atual.das.vencimento) || atual.vencimento)}</small></div>
    </div>
    <div class="faixa info">${icone('raio')}<span><b>Transmissão automática do PGDAS-D:</b> aguardando a ativação do contrato Integra Contador (SERPRO). Até lá, gere a guia no Portal do Simples e anexe aqui.</span><button class="btn pequeno" disabled>Gerar pelo Integra Contador</button></div>
    <div class="card sem-pad"><table class="tabela"><thead><tr><th>Competência</th><th class="num">Receita</th><th class="num ocultar-cel">RBT12</th><th class="ocultar-cel">Cálculo</th><th class="num">DAS</th><th>Vencimento</th><th>Situação</th><th></th></tr></thead><tbody>
    ${meses.map((m) => { const venc = (m.das && m.das.vencimento) || m.vencimento; const atrasado = m.status !== 'paga' && venc < hoje && !m.semMovimento; return `<tr>
      <td><b>${comp(m.competencia)}</b></td>
      <td class="num">${brl(m.receita)}<br><small>${m.notas.length} nota(s)${m.ajuste && m.ajuste.extra ? ' + ajuste' : ''}</small></td>
      <td class="num ocultar-cel">${brl(m.rbt12)}</td>
      <td class="ocultar-cel"><small>${m.partes.map((p) => `${esc(p.rotulo)}: Anexo ${p.anexo} · ${pct(p.aliquota)}`).join('<br>') || (m.semDados ? '<span style="color:var(--atencao)">Sem notas no sistema</span>' : 'Sem movimento')}${m.avisos.length ? `<br><span style="color:var(--atencao)" title="${esc(m.avisos.join(' '))}">⚠ ${m.avisos.length} aviso(s)</span>` : ''}</small></td>
      <td class="num"><b>${brl(m.das ? m.das.valor : m.valor)}</b></td>
      <td style="${atrasado ? 'color:var(--erro);font-weight:700' : ''}">${dataIso(venc)}${atrasado ? '<br><small>vencido</small>' : ''}</td>
      <td>${chipDas(m.status)}</td>
      <td class="acoes">${{
        calculada: `<button class="btn pequeno" data-apu="ajuste" data-c="${m.competencia}">Ajustar</button><button class="btn pequeno primario" data-apu="aprovar" data-c="${m.competencia}">Aprovar</button>`,
        aprovada: `<button class="btn pequeno primario" data-apu="das" data-c="${m.competencia}" data-v="${m.valor}">Anexar guia</button>`,
        das_disponivel: `${m.das && m.das.pdf ? `<a class="btn pequeno" href="${esc(m.das.pdf)}" target="_blank" rel="noopener">${icone('pdf')} Guia</a>` : ''}<button class="btn pequeno" data-apu="pago" data-c="${m.competencia}">Marcar paga</button>`,
      }[m.status] || ''}</td>
    </tr>`; }).join('')}
    </tbody></table></div>`;
  $$('[data-apu]').forEach((b) => b.addEventListener('click', async () => {
    const base = `/apuracoes/${e.id}/${b.dataset.c}`;
    try {
      if (b.dataset.apu === 'aprovar') { await api(base + '/aprovar', { body: {} }); aviso('Apuração aprovada.'); }
      if (b.dataset.apu === 'pago') { await api(base + '/pago', { body: {} }); aviso('DAS marcado como pago.'); }
      if (b.dataset.apu === 'ajuste') {
        const ok = await dialogo({ titulo: `Ajustar ${comp(b.dataset.c)}`, sub: 'Use quando houver faturamento fora do sistema ou o RBT12 estiver errado.',
          corpo: `<label class="campo"><span>Receita a somar em serviços (R$)</span><input id="aExtra" placeholder="0,00"></label>
            <label class="campo"><span>RBT12 correto (vazio = usar o calculado)</span><input id="aRbt"></label>
            <label class="campo"><span>Anexo dos serviços</span><select id="aAnexo"><option value="">Manter</option><option>III</option><option>IV</option><option>V</option></select></label>`,
          botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Salvar ajuste', classe: 'primario', acao: async (dl) => api(base + '/ajuste', { body: { extra: { servicos: $('#aExtra', dl).value }, rbt12: $('#aRbt', dl).value, anexos: $('#aAnexo', dl).value ? { servicos: $('#aAnexo', dl).value } : {} } }) }] });
        if (ok) aviso('Ajuste salvo e DAS recalculado.');
      }
      if (b.dataset.apu === 'das') {
        const ok = await dialogo({ titulo: `Guia do DAS · ${comp(b.dataset.c)}`, sub: 'O cliente recebe o aviso e a guia na Área do Cliente.',
          corpo: `<label class="campo"><span>Link do PDF do DAS</span><input id="gPdf" placeholder="https://…"></label>
            <label class="campo"><span>Código de barras / linha digitável</span><input id="gLinha"></label>
            <div class="form-2"><label class="campo"><span>Valor da guia</span><input id="gValor" value="${Number(b.dataset.v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}"></label>
            <label class="campo"><span>Vencimento</span><input id="gVenc" type="date"></label></div>`,
          botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Enviar ao cliente', classe: 'primario', acao: async (dl) => api(base + '/das', { body: { pdf: $('#gPdf', dl).value, linhaDigitavel: $('#gLinha', dl).value, valor: $('#gValor', dl).value, vencimento: $('#gVenc', dl).value } }) }] });
        if (ok) aviso('Guia enviada ao cliente.');
      }
    } catch (err) { aviso(esc(err.message), 'erro'); }
    telaEmpresa(e.id, 'das');
  }));
}

// ----- Configuração -----
function abaConfig(d) {
  const e = d.empresa;
  const f = e.fiscal || {};
  const t = e.ultimoTeste;
  $('#abaCorpo').innerHTML = `
    <div class="grade-2">
      <form class="card" id="formFiscal">
        <h2>Emissão de nota fiscal</h2>
        <div class="segmentos">
          <label><input type="radio" name="emissao" value="desligada" ${e.emissao === 'desligada' ? 'checked' : ''}><b>Manual</b><small>Pedido vai para a fila da equipe</small></label>
          <label><input type="radio" name="emissao" value="homologacao" ${e.emissao === 'homologacao' ? 'checked' : ''}><b>Teste</b><small>Homologação, sem valor fiscal</small></label>
          <label><input type="radio" name="emissao" value="producao" ${e.emissao === 'producao' ? 'checked' : ''}><b>Automática</b><small>Sai na hora pela Receita</small></label>
        </div>
        <div class="form-2">
          <label class="campo"><span>Município (código IBGE)</span><input id="fMun" maxlength="7" value="${esc(f.codigoMunicipio || '')}" placeholder="Ex.: 3534401"></label>
          <label class="campo"><span>Código do serviço (nacional)</span><input id="fServ" maxlength="6" value="${esc(f.codigoServico || '')}" placeholder="Ex.: 140101"></label>
          <label class="campo"><span>Série da DPS</span><input id="fSerie" value="${esc(f.serieDps || 900)}"></label>
          <label class="campo"><span>Próximo número</span><input id="fNum" value="${esc(e.proximoDps || 1)}"></label>
          <label class="campo"><span>Alíquota do Simples (%)</span><input id="fAliq" value="${esc(String(f.aliquotaSN || 6).replace('.', ','))}"></label>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primario">Salvar</button>${e.emissao === 'homologacao' ? '<button type="button" class="btn" id="btnTeste">Testar emissão (R$ 1,00)</button>' : ''}</div>
        ${t ? `<p class="msg ${t.status === 'emitida' ? 'ok' : 'erro'}">Último teste (${new Date(t.enviadaEm).toLocaleString('pt-BR')}): ${t.status === 'emitida' ? `nota ${esc(t.numero)} gerada${t.pdf ? ` · <a href="${esc(t.pdf)}" target="_blank" rel="noopener">ver PDF</a>` : ''}` : esc(t.erro || t.status)}</p>` : ''}
      </form>
      <div>
        <div class="card">
          <h2>Certificado digital A1</h2>
          ${e.certificado.ativo ? `<div class="linha-info"><span class="suave">Titular</span><b>${esc(e.certificado.titular || e.nome)}</b></div><div class="linha-info"><span class="suave">Válido até</span><b>${data(e.certificado.validoAte)}</b></div><div class="linha-info"><span class="suave">Uso</span><span>Consultar e emitir notas</span></div>`
            : '<p class="msg atencao">Sem certificado: a empresa não emite nota automática nem tem as notas baixadas.</p>'}
          <div style="margin-top:14px"><button class="btn" id="btnCert">${icone('chave')} ${e.certificado.ativo ? 'Trocar certificado' : 'Conectar certificado'}</button></div>
        </div>
        <div class="card">
          <h2>Dados da empresa</h2>
          <div class="linha-info"><span class="suave">CNPJ</span><b>${doc(e.cnpj)}</b></div>
          <div class="linha-info"><span class="suave">Regime</span><span>${esc(e.regime)}</span></div>
          <div class="linha-info"><span class="suave">Município</span><span>${esc(e.municipio || '—')}/${esc(e.uf || '')}</span></div>
          <div class="linha-info"><span class="suave">Contato</span><span>${esc(e.telefone || e.email || '—')}</span></div>
        </div>
      </div>
    </div>`;
  $('#formFiscal').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const emissao = $('input[name=emissao]:checked').value;
    if (emissao === 'producao' && e.emissao !== 'producao' && !(t && t.status === 'emitida')) {
      const seguir = await dialogo({ titulo: 'Ligar emissão automática?', sub: 'As próximas notas desta empresa sairão com valor fiscal, direto pela Receita.', corpo: '<p class="msg atencao" style="margin:0">Esta empresa ainda não tem um teste de emissão que deu certo. Recomendo testar antes.</p>', botoes: [{ texto: 'Voltar', valor: false }, { texto: 'Ligar mesmo assim', classe: 'primario', valor: true }] });
      if (!seguir) return;
    }
    try {
      await api(`/assinantes/${e.id}/fiscal`, { body: { codigoMunicipio: $('#fMun').value, codigoServico: $('#fServ').value, serieDps: $('#fSerie').value, proximoDps: $('#fNum').value, aliquotaSN: $('#fAliq').value, emissao } });
      aviso('Configuração salva.'); telaEmpresa(e.id, 'config');
    } catch (err) { aviso(esc(err.message), 'erro'); }
  });
  if ($('#btnTeste')) $('#btnTeste').addEventListener('click', async (ev) => {
    ev.target.disabled = true; ev.target.textContent = 'Enviando para a Receita…';
    try { const { nota } = await api(`/assinantes/${e.id}/nota-teste`, { body: {} }); aviso(nota.status === 'emitida' ? `Teste aprovado: nota ${esc(nota.numero || '')} gerada na homologação.` : `Recusada: ${esc(nota.erro || nota.status)}`, nota.status === 'emitida' ? 'ok' : 'erro'); } catch (err) { aviso(esc(err.message), 'erro'); }
    telaEmpresa(e.id, 'config');
  });
  $('#btnCert').addEventListener('click', async () => {
    const ok = await dialogo({ titulo: 'Certificado digital A1', sub: esc(e.nome),
      corpo: `<label class="campo"><span>Arquivo (.pfx ou .p12)</span><input type="file" id="cArq" accept=".pfx,.p12"></label>
        <label class="campo"><span>Senha do certificado</span><input type="password" id="cSenha" autocomplete="off"></label>
        <label style="display:flex;gap:8px;font-size:.88rem"><input type="checkbox" id="cOk" style="width:auto"> Tenho autorização do cliente para usar este certificado somente para consultar e emitir as notas fiscais da empresa.</label>`,
      botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Conectar', classe: 'primario', acao: async (dl) => {
        const arq = $('#cArq', dl).files[0];
        if (!arq) throw new Error('Escolha o arquivo do certificado.');
        const b64 = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(arq); });
        return api(`/assinantes/${e.id}/certificado`, { body: { pfx: b64, senha: $('#cSenha', dl).value, autorizo: $('#cOk', dl).checked } });
      } }] });
    if (ok) { aviso('Certificado conectado.'); telaEmpresa(e.id, 'config'); }
  });
}

// ---------- Pedidos de nota (fila da equipe) ----------
async function telaPedidos() {
  const el = $('#conteudo');
  el.innerHTML = '<p class="vazio">Carregando…</p>';
  const { notas } = await api('/notas');
  const lista = notas.filter((n) => ['fila', 'erro'].includes(n.status));
  el.innerHTML = `
    <div class="cab"><div><h1>Pedidos de nota</h1><p>Notas que precisam da equipe: empresas com emissão manual ou recusadas pela Receita.</p></div></div>
    <div class="card sem-pad"><table class="tabela"><thead><tr><th>Pedido</th><th>Prestador</th><th>Tomador</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead><tbody>
    ${lista.length ? lista.map((n) => `<tr>
      <td>${new Date(n.enviadaEm).toLocaleString('pt-BR')}</td>
      <td><b>${esc(n.prestador ? n.prestador.nome : '')}</b><br><small>${doc(n.prestador ? n.prestador.cnpj : '')}</small></td>
      <td><b>${esc(n.tomador.nome)}</b><br><small title="${esc(n.descricao)}">${esc(n.descricao.slice(0, 50))}</small></td>
      <td class="num"><b>${brl(n.valor)}</b></td>
      <td>${n.status === 'erro' ? `<span class="chip erro">Recusada</span><br><small style="color:var(--erro)">${esc((n.erro || '').slice(0, 80))}</small>` : '<span class="chip atencao">Aguardando</span>'}</td>
      <td class="acoes"><button class="btn pequeno" data-copiar="${n.id}">Copiar dados</button><a class="btn pequeno" href="https://www.nfse.gov.br/EmissorNacional" target="_blank" rel="noopener">Emissor Nacional</a><button class="btn pequeno primario" data-anexar="${n.id}">Marcar emitida</button></td>
    </tr>`).join('') : '<tr><td colspan="6" class="vazio">Nenhum pedido aguardando. 🎉</td></tr>'}
    </tbody></table></div>`;
  $$('[data-copiar]').forEach((b) => b.addEventListener('click', async () => {
    const n = lista.find((x) => x.id === b.dataset.copiar);
    const txt = [`Prestador: ${n.prestador.nome} (${doc(n.prestador.cnpj)})`, `Tomador: ${n.tomador.nome} - ${doc(n.tomador.cnpj || n.tomador.cpf)}`, `Valor: ${n.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, `Descrição: ${n.descricao}`].join('\n');
    try { await navigator.clipboard.writeText(txt); aviso('Dados copiados.'); } catch { aviso('Não deu para copiar.', 'erro'); }
  }));
  $$('[data-anexar]').forEach((b) => b.addEventListener('click', async () => {
    const ok = await dialogo({ titulo: 'Marcar nota como emitida', sub: 'O cliente recebe o número e o PDF na Área do Cliente.',
      corpo: '<label class="campo"><span>Número da nota</span><input id="mNum"></label><label class="campo"><span>Link do PDF</span><input id="mPdf" placeholder="https://…"></label>',
      botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Salvar', classe: 'primario', acao: async (dl) => api(`/notas/${b.dataset.anexar}/anexar`, { body: { numero: $('#mNum', dl).value, pdf: $('#mPdf', dl).value } }) }] });
    if (ok) { aviso('Nota marcada como emitida.'); telaPedidos(); contaPedidos(); }
  }));
}

inicia();
