// Painel do escritório: empresas da carteira -> notas fiscais, PGDAS-D/DAS e configuração.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const doc = (d) => { const c = String(d || ''); return c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c.length === 11 ? c.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : c; };
const data = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');
const dataIso = (d) => (d ? d.split('-').reverse().join('/') : '—');
const icone = (id) => `<svg class="i"><use href="#i-${id}"/></svg>`;
const iniciais = (n) => String(n || '?').replace(/\b(LTDA|ME|EPP|EIRELI|S\/?A|SLU)\b/gi, '').replace(/[^\p{L}\s]/gu, '').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
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
// Cada pessoa entra com o próprio e-mail; a senha geral do painel continua valendo para o responsável
let modoPainel = false;
let EU = { usuario: null, gestor: false };
const erroLogin = (t) => { $('#erroLogin').textContent = t; $('#erroLogin').hidden = !t; };
$('#trocaModo').addEventListener('click', (e) => {
  e.preventDefault();
  modoPainel = !modoPainel;
  $('#modoConta').hidden = modoPainel; $('#modoPainel').hidden = !modoPainel;
  $('#trocaModo').textContent = modoPainel ? 'Entrar com e-mail e senha' : 'Entrar com a senha geral do painel';
  erroLogin('');
  (modoPainel ? $('#senha') : $('#email')).focus();
});
$('#formLogin').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  erroLogin('');
  if (modoPainel) {
    senha = $('#senha').value;
    try { sessionStorage.setItem('senhaAdmin', senha); } catch { /* ok */ }
    return inicia(true);
  }
  const email = $('#email').value.trim();
  if (!email || !$('#senhaConta').value) return erroLogin('Informe e-mail e senha.');
  const r = await fetch('/api/portal/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ email, senha: $('#senhaConta').value }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return erroLogin(j.erro || 'Não foi possível entrar.');
  $('#senhaConta').value = '';
  inicia(true);
});
$('#sair').addEventListener('click', async (e) => {
  e.preventDefault();
  senha = '';
  try { sessionStorage.removeItem('senhaAdmin'); } catch { /* ok */ }
  await fetch('/api/portal/sair', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
  location.hash = ''; location.reload();
});

async function inicia(tentou) {
  try {
    EU = await api('/equipe/eu');
    $('#telaLogin').hidden = true;
    $('#app').hidden = false;
    desenhaConta();
    await carregaIntegra();
    if (EU.usuario && EU.usuario.trocarSenha) location.hash = '#/conta';
    rota();
    contaPedidos();
  } catch (err) {
    $('#app').hidden = true;
    $('#telaLogin').hidden = false;
    if (tentou || senha) erroLogin(err.status === 401 ? (modoPainel ? 'Senha incorreta.' : 'Este acesso não tem permissão no painel do escritório.') : err.message);
  }
}

const PAPEL = { dono: 'Responsável', equipe: 'Funcionário' };
function desenhaConta() {
  const u = EU.usuario;
  $('#menuEquipe').hidden = !EU.gestor;
  $('#menuAdmin').hidden = !EU.gestor;
  $('#menuConta').hidden = !u;
  if (u) { $('#contaIni').textContent = iniciais(u.nome); $('#contaNome').textContent = u.nome; $('#contaPapel').textContent = PAPEL[u.papel] || ''; }
}
window.addEventListener('hashchange', rota);

function rota() {
  const partes = location.hash.replace(/^#\/?/, '').split('/');
  $$('.lateral [data-menu]').forEach((a) => a.classList.toggle('ativo', a.dataset.menu === (partes[0] === 'empresa' ? 'empresas' : (partes[0] || 'assistente'))));
  if (partes[0] === 'empresa' && partes[1]) return telaEmpresa(partes[1], partes[2] || 'notas');
  if (partes[0] === 'pedidos') return telaPedidos();
  if (partes[0] === 'integra') return telaIntegra();
  if (EU.usuario && EU.usuario.trocarSenha) return telaConta();
  if (partes[0] === 'equipe' && EU.gestor) return telaEquipe();
  if (partes[0] === 'conta' && EU.usuario) return telaConta();
  if (partes[0] === 'assistente') return telaAssistente();
  if (partes[0] === 'empresas') return telaEmpresas();
  return telaAssistente();
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
      <div><h1>${EU.gestor ? 'Empresas' : 'Minhas empresas'}</h1><p>${EU.gestor ? 'Todas as empresas do escritório e quem cuida de cada uma.' : 'As empresas que você cuida. Empresa que você cadastrar entra aqui.'}</p></div>
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
        <td><div class="empresa-cel"><span class="avatar">${esc(iniciais(e.fantasia || e.nome))}</span><div><b>${esc(e.nome)}</b><small>${doc(e.cnpj)}${e.municipio ? ` · ${esc(e.municipio)}/${esc(e.uf)}` : ''}</small>${EU.gestor && e.equipe ? `<small class="emp-equipe">${e.equipe.length ? `${icone('pessoas')} ${e.equipe.map((m) => esc(m.nome)).join(', ')}` : 'Sem funcionário'}</small>` : ''}</div></div></td>
        <td class="ocultar-cel">${esc(e.regime)}</td>
        <td>${chipCert(e)}</td>
        <td>${chipEmissao(e.emissao)}</td>
        <td class="num"><b>${brl(e.notasMes.valor)}</b><br><small>${e.notasMes.quantidade} nota(s)${e.pendentes ? ` · <span style="color:var(--atencao)">${e.pendentes} pendente(s)</span>` : ''}</small></td>
        <td>${e.das ? `${chipDas(e.das.status)}<br><small>${comp(e.das.competencia)} · ${brl(e.das.valor)}</small>` : '<span class="chip neutro">—</span>'}</td>
        <td class="acoes">${icone('seta')}</td>
      </tr>`).join('') : `<tr><td colspan="7" class="vazio">${!empresas.length && !EU.gestor ? 'Você ainda não tem empresas. Clique em "Cadastrar empresa" ou peça ao responsável para passar as suas.' : 'Nenhuma empresa encontrada.'}</td></tr>`;
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
const chipDas = (s) => ({ calculada: '<span class="chip atencao">A declarar</span>', aprovada: '<span class="chip atencao">A declarar</span>', entregue: '<span class="chip ok">Sem movimento</span>', das_disponivel: '<span class="chip info">Guia enviada</span>', paga: '<span class="chip ok">Paga</span>' })[s] || `<span class="chip neutro">${esc(s)}</span>`;

async function cadastraEmpresa() {
  const r = await dialogo({
    titulo: 'Cadastrar empresa',
    sub: 'Os dados (razão social, endereço, regime) vêm da Receita pelo CNPJ.',
    corpo: `<label class="campo"><span>CNPJ da empresa</span><input id="dCnpj" inputmode="numeric" placeholder="00.000.000/0000-00" autofocus></label>
            <label class="campo"><span>WhatsApp do cliente (opcional)</span><input id="dTel" placeholder="(11) 99999-9999"></label>`,
    botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Cadastrar', classe: 'primario', acao: async (d) => api('/empresas', { body: { cnpj: $('#dCnpj', d).value, telefone: $('#dTel', d).value } }) }],
  });
  if (r && r.usuario) { aviso(r.preenchidos && r.preenchidos.length ? `Empresa cadastrada com ${r.preenchidos.join(', ')} preenchidos. Confira na Configuração.` : 'Empresa cadastrada.'); location.hash = `#/empresa/${r.usuario.id}/config`; }
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
      <a href="#/empresa/${id}/clientes" class="${aba === 'clientes' ? 'ativo' : ''}">${icone('pessoas')} Clientes <span class="cont-aba">${d.clientes.filter((c) => c.salvo).length}</span></a>
      <a href="#/empresa/${id}/das" class="${aba === 'das' ? 'ativo' : ''}">${icone('calc')} PGDAS-D e DAS</a>
      <a href="#/empresa/${id}/config" class="${aba === 'config' ? 'ativo' : ''}">${icone('engr')} Configuração</a>
    </nav>
    <section id="abaCorpo"></section>`;
  ({ notas: abaNotas, clientes: abaClientes, das: abaDas, config: abaConfig })[aba]?.(d);
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
        <label class="campo"><span>Cliente</span><select id="nCliente"><option value="">Novo cliente (digitar CNPJ ou CPF)</option>${d.clientes.map((c, i) => `<option value="${i}">${esc(c.nome)} · ${doc(c.documento)}${c.salvo ? '' : ' (das notas)'}</option>`).join('')}</select></label>
        <form id="formNota" novalidate>
          <div class="passo"><span class="n">1</span><div>
            <label class="campo"><span>Para quem? (CNPJ ou CPF do tomador)</span><input id="nDoc" inputmode="numeric" placeholder="00.000.000/0000-00" autocomplete="off"></label>
            <div id="nTomador" class="tomador" hidden></div>
            <div id="nCpf" hidden><label class="campo"><span>Nome do tomador</span><input id="nNome" maxlength="160"></label></div>
            <label class="campo"><span>E-mail do tomador <small>(opcional, vai na nota)</small></span><input id="nEmail" type="email" maxlength="160" placeholder="financeiro@cliente.com.br"></label>
            <label class="check-salvar" id="nSalvarBox" hidden><input type="checkbox" id="nSalvar" checked> Salvar no cadastro de clientes desta empresa</label>
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
    $('#nSalvarBox').hidden = !(c.length === 11 || c.length === 14) || d.clientes.some((x) => x.salvo && x.documento === c);
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
    $('#nDoc').value = mascaraDoc(t.documento); $('#nNome').value = t.nome || ''; $('#nDesc').value = t.descricao || ''; $('#nEmail').value = t.email || '';
    $('#nValor').value = t.valor ? mascaraValor(Math.round(t.valor * 100)) : ''; atualiza(); (t.valor ? $('#nDesc') : $('#nValor')).focus();
  };
  $('#nDoc').addEventListener('input', (ev) => { ev.target.value = mascaraDoc(ev.target.value); atualiza(); });
  $('#nValor').addEventListener('input', (ev) => { ev.target.value = mascaraValor(ev.target.value); });
  $('#nCliente').addEventListener('change', (ev) => {
    const cl = d.clientes[+ev.target.value];
    if (!cl) { preenche({ documento: '', nome: '', descricao: '', email: '' }); $('#nDoc').focus(); return; }
    preenche({ documento: cl.documento, nome: cl.nome, email: cl.email, descricao: cl.descricaoPadrao, valor: cl.valorPadrao });
  });
  // Vindo da aba Clientes (botão Emitir nota)
  try {
    const pre = JSON.parse(sessionStorage.getItem('preNota') || 'null');
    sessionStorage.removeItem('preNota');
    if (pre && pre.empresa === e.id) {
      const i = d.clientes.findIndex((x) => x.documento === pre.documento);
      if (i >= 0) { $('#nCliente').value = String(i); $('#nCliente').dispatchEvent(new Event('change')); }
      // Valor e descrição ditos no pedido valem mais que os padrões do cliente
      if (pre.valor) $('#nValor').value = mascaraValor(Math.round(pre.valor * 100));
      if (pre.descricao) $('#nDesc').value = pre.descricao;
      if (i < 0) $('#nDoc').focus();
    }
  } catch { /* ok */ }
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
    try { rasc = (await api(`/escritorio/empresas/${e.id}/notas`, { body: { documento: c, valor: String(numValor($('#nValor').value)), descricao: $('#nDesc').value, nome: $('#nNome').value, email: $('#nEmail').value, salvarCliente: !$('#nSalvarBox').hidden && $('#nSalvar').checked } })).nota; } catch (err) { return msg(err.message); }
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
    if (r.status === 'emitida') await notaPronta(e, r); else aviso(txt, r.status === 'erro' ? 'erro' : 'ok');
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

// Nota saiu: entrega na hora (PDF, WhatsApp, link) e mostra para quem o e-mail foi
async function notaPronta(e, n) {
  const texto = `Olá! Segue a nota fiscal${n.numero ? ` nº ${n.numero}` : ''} de ${e.nome} no valor de ${brl(n.valor)}: ${n.pdf}`;
  const email = n.entrega ? (n.entrega.ok ? `<p class="msg ok">${icone('check')} Enviada por e-mail para ${esc(n.entrega.para.join(', '))}.</p>` : `<p class="msg atencao">E-mail automático não enviado (${esc(n.entrega.erro)}).</p>`) : '';
  await dialogo({
    titulo: `${icone('check')} Nota${n.numero ? ' nº ' + esc(n.numero) : ''} emitida`, sub: `${esc(n.tomador.nome)} · ${brl(n.valor)}`,
    corpo: `<div style="display:grid;gap:10px">
      <a class="btn primario largo" href="${esc(n.pdf)}" target="_blank" rel="noopener">${icone('pdf')} Abrir a nota (PDF)</a>
      <a class="btn largo" href="https://wa.me/?text=${encodeURIComponent(texto)}" target="_blank" rel="noopener">Enviar no WhatsApp</a>
      <button type="button" class="btn largo" id="copiaLink">${icone('link')} Copiar link da nota</button></div>${email}`,
    botoes: [{ texto: 'Fechar', valor: true }],
  }).then(() => {});
}
document.addEventListener('click', async (ev) => {
  if (ev.target.closest('#copiaLink')) { const a = $('#dlg a.btn.primario'); try { await navigator.clipboard.writeText(a.href); aviso('Link copiado.'); } catch { aviso('Não deu para copiar.', 'erro'); } }
});

// ----- Clientes (tomadores) da empresa -----
function abaClientes(d) {
  const e = d.empresa;
  const salvos = d.clientes.filter((c) => c.salvo);
  const total = d.clientes.reduce((t, c) => t + c.notas.total, 0);
  $('#abaCorpo').innerHTML = `
    <div class="kpis">
      <div class="kpi"><span>Clientes cadastrados</span><b>${salvos.length}</b><small>${d.clientes.length - salvos.length ? `+ ${d.clientes.length - salvos.length} só nas notas` : 'todos cadastrados'}</small></div>
      <div class="kpi"><span>Faturado para clientes</span><b>${brl(total)}</b><small>notas emitidas e na fila</small></div>
      <div class="kpi"><span>Maior cliente</span><b style="font-size:1.05rem">${esc((d.clientes.slice().sort((a, b) => b.notas.total - a.notas.total)[0] || {}).nome || '—')}</b><small>${brl((d.clientes.slice().sort((a, b) => b.notas.total - a.notas.total)[0] || { notas: { total: 0 } }).notas.total)}</small></div>
      <div class="kpi"><span>Ticket médio</span><b>${brl(total / Math.max(1, d.clientes.reduce((t, c) => t + c.notas.quantidade, 0)))}</b><small>por nota</small></div>
    </div>
    <div class="ferramentas">
      <div class="busca">${icone('busca')}<input id="buscaCli" placeholder="Buscar cliente por nome, CNPJ ou cidade"></div>
      <button class="btn primario" id="novoCli" style="margin-left:auto">${icone('mais')} Novo cliente</button>
    </div>
    <div class="card sem-pad"><table class="tabela"><thead><tr><th>Cliente</th><th class="ocultar-cel">Cidade</th><th class="ocultar-cel">Contato</th><th class="num">Notas</th><th class="num">Faturado</th><th class="ocultar-cel">Última nota</th><th></th></tr></thead><tbody id="linhasCli"></tbody></table></div>`;
  const desenha = () => {
    const q = $('#buscaCli').value.trim().toLowerCase().replace(/[./-]/g, '');
    const lista = d.clientes.filter((c) => !q || `${c.nome} ${c.fantasia || ''} ${c.municipio || ''}`.toLowerCase().includes(q) || c.documento.includes(q));
    $('#linhasCli').innerHTML = lista.length ? lista.map((c) => `<tr>
      <td><div class="empresa-cel"><span class="avatar">${esc(iniciais(c.fantasia || c.nome))}</span><div><b class="trunca" style="max-width:220px" title="${esc(c.nome)}">${esc(c.nome)}</b><small>${doc(c.documento)}${c.salvo ? '' : ' · <span class="chip neutro" style="padding:1px 7px">só nas notas</span>'}</small></div></div></td>
      <td class="ocultar-cel">${esc([c.municipio, c.uf].filter(Boolean).join('/') || '—')}</td>
      <td class="ocultar-cel"><small class="trunca" style="max-width:170px" title="${esc(c.email || '')}">${esc(c.email || '—')}</small><small>${esc(c.telefone || '')}</small></td>
      <td class="num">${c.notas.quantidade}</td>
      <td class="num"><b>${brl(c.notas.total)}</b></td>
      <td class="ocultar-cel">${data(c.notas.ultima)}</td>
      <td class="acoes"><div class="acoes-col"><button class="lnk" data-emitir="${esc(c.documento)}">${icone('nota')} Emitir nota</button>${c.salvo ? `<button class="lnk" data-editar="${esc(c.id)}">Editar</button><button class="lnk perigo" data-excluir="${esc(c.id)}">Excluir</button>` : `<button class="lnk" data-salvar="${esc(c.documento)}">Salvar no cadastro</button>`}</div></td>
    </tr>`).join('') : '<tr><td colspan="7" class="vazio">Nenhum cliente ainda. Cadastre o primeiro ou emita uma nota.</td></tr>';
    $$('[data-emitir]').forEach((b) => b.addEventListener('click', () => {
      try { sessionStorage.setItem('preNota', JSON.stringify({ empresa: e.id, documento: b.dataset.emitir })); } catch { /* ok */ }
      location.hash = `#/empresa/${e.id}/notas`;
    }));
    $$('[data-editar]').forEach((b) => b.addEventListener('click', () => formCliente(e, d.clientes.find((c) => c.id === b.dataset.editar))));
    $$('[data-salvar]').forEach((b) => b.addEventListener('click', () => formCliente(e, { ...d.clientes.find((c) => c.documento === b.dataset.salvar), salvo: false, novoDeNota: true })));
    $$('[data-excluir]').forEach((b) => b.addEventListener('click', async () => {
      const c = d.clientes.find((x) => x.id === b.dataset.excluir);
      const ok = await dialogo({ titulo: 'Excluir cliente?', sub: `${esc(c.nome)} · ${doc(c.documento)}`, corpo: '<p class="suave" style="margin:0">As notas já emitidas para ele continuam no histórico.</p>', botoes: [{ texto: 'Voltar', valor: false }, { texto: 'Excluir', classe: 'primario', acao: async () => api(`/escritorio/empresas/${e.id}/clientes/${c.id}`, { method: 'DELETE' }) }] });
      if (ok) { aviso('Cliente excluído.'); telaEmpresa(e.id, 'clientes'); }
    }));
  };
  $('#buscaCli').addEventListener('input', desenha);
  $('#novoCli').addEventListener('click', () => formCliente(e, null));
  desenha();
}

async function formCliente(e, c) {
  const editando = c && c.salvo;
  const v = c || {};
  const r = await dialogo({
    titulo: editando ? 'Editar cliente' : 'Novo cliente', sub: editando ? `${doc(v.documento)}` : 'Com CNPJ, a razão social e a cidade vêm da Receita.',
    corpo: `${editando ? '' : `<label class="campo"><span>CNPJ ou CPF</span><input id="kDoc" inputmode="numeric" value="${esc(mascaraDoc(v.documento || ''))}" placeholder="00.000.000/0000-00"></label><div id="kInfo" class="tomador" hidden></div>`}
      <label class="campo"><span>Nome / razão social</span><input id="kNome" value="${esc(v.nome || '')}" placeholder="${editando ? '' : 'Preenchido pela Receita quando for CNPJ'}"></label>
      <div class="form-2"><label class="campo"><span>E-mail</span><input id="kEmail" type="email" value="${esc(v.email || '')}"></label>
      <label class="campo"><span>Telefone / WhatsApp</span><input id="kTel" value="${esc(v.telefone || '')}"></label></div>
      <label class="campo"><span>Descrição padrão do serviço</span><textarea id="kDesc" rows="2">${esc(v.descricaoPadrao || '')}</textarea></label>
      <div class="form-2"><label class="campo"><span>Valor padrão (R$)</span><input id="kValor" inputmode="numeric" value="${v.valorPadrao ? esc(mascaraValor(Math.round(v.valorPadrao * 100))) : ''}"></label>
      <label class="campo"><span>Observações</span><input id="kObs" value="${esc(v.observacoes || '')}"></label></div>`,
    botoes: [{ texto: 'Cancelar', valor: null }, { texto: editando ? 'Salvar' : 'Cadastrar cliente', classe: 'primario', acao: async (dl) => {
      const corpo = { documento: editando ? v.documento : $('#kDoc', dl).value, nome: $('#kNome', dl).value, email: $('#kEmail', dl).value, telefone: $('#kTel', dl).value, descricaoPadrao: $('#kDesc', dl).value, valorPadrao: $('#kValor', dl).value, observacoes: $('#kObs', dl).value };
      return editando ? api(`/escritorio/empresas/${e.id}/clientes/${v.id}`, { method: 'PUT', body: corpo }) : api(`/escritorio/empresas/${e.id}/clientes`, { body: corpo });
    } }],
  });
  if (r) { aviso(editando ? 'Cliente atualizado.' : 'Cliente cadastrado.'); telaEmpresa(e.id, 'clientes'); }
}
// Busca na Receita enquanto digita o CNPJ no cadastro de cliente
document.addEventListener('input', async (ev) => {
  if (ev.target.id === 'kValor') { ev.target.value = mascaraValor(ev.target.value); return; }
  if (ev.target.id !== 'kDoc') return;
  ev.target.value = mascaraDoc(ev.target.value);
  const c = ev.target.value.replace(/\D/g, '');
  const info = $('#kInfo');
  if (c.length !== 14) { info.hidden = true; return; }
  info.hidden = false; info.className = 'tomador carregando'; info.textContent = 'Buscando na Receita…';
  try {
    const t = await api('/escritorio/tomador/' + c);
    info.className = 'tomador ok'; info.innerHTML = `${icone('check')}<span><b>${esc(t.nome)}</b><br><small>${esc([t.municipio, t.uf].filter(Boolean).join('/'))}</small></span>`;
    if (!$('#kNome').value) $('#kNome').value = t.nome;
  } catch (err) { info.className = 'tomador erro'; info.textContent = err.message; }
});

// ----- Integra Contador: puxar guia e comandos -----
let INTEGRA = { ativo: false };
async function carregaIntegra() { try { INTEGRA = await api('/escritorio/integra'); } catch { INTEGRA = { ativo: false }; } }

// Puxa o DAS da Receita e entrega: PDF, WhatsApp do cliente e link
async function puxaGuia(e, competencia) {
  const r = await api(`/apuracoes/${e.id}/${competencia}/puxar`, { method: 'POST' });
  const d = r.das;
  const texto = `Olá! Segue a guia do DAS de ${comp(competencia)} da ${e.nome}: ${brl(d.valor)}, pagar até ${dataIso(d.vencimento)}. ${d.pdf}`;
  const zap = `https://wa.me/${String(r.telefone || e.telefone || '').replace(/\D/g, '').replace(/^(?!55)(\d{10,11})$/, '55$1')}?text=${encodeURIComponent(texto)}`;
  await dialogo({
    titulo: `${icone('check')} Guia de ${comp(competencia)} pronta`, sub: `${esc(e.nome)}${INTEGRA.modo === 'demonstracao' ? ' · <b>demonstração (dados fictícios)</b>' : ''}`,
    corpo: `<dl class="confere" style="margin-bottom:14px"><dt>Total</dt><dd class="valor">${brl(d.valor)}</dd>${d.multa || d.juros ? `<dt>Composição</dt><dd><small>principal ${brl(d.principal)} + multa ${brl(d.multa)} + juros ${brl(d.juros)}</small></dd>` : ''}<dt>Pagar até</dt><dd><b>${dataIso(d.vencimento)}</b></dd></dl>
      <div style="display:grid;gap:10px">
        <a class="btn primario largo" href="${esc(d.pdf)}" target="_blank" rel="noopener">${icone('pdf')} Abrir a guia (PDF)</a>
        <a class="btn largo" href="${esc(zap)}" target="_blank" rel="noopener">Enviar ao cliente no WhatsApp</a>
      </div>
      ${r.envio && r.envio.ok ? `<p class="msg ok">${icone('check')} Enviada por e-mail ao cliente.</p>` : '<p class="msg info">O cliente também vê a guia na Área do Cliente.</p>'}`,
    botoes: [{ texto: 'Fechar', valor: true }],
  });
}

/// ---------- Aba Pedidos: tudo por mensagem ----------
// Exemplos: "puxar guia da AGEN", "puxar DAS de outubro da LH Motos",
// "emitir nota da AGEN para VIMARI de 2.750,00 manutenção do motor", "cadastrar empresa 12.345.678/0001-90"
const MESES_NOME = { jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06', jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12' };
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const IGNORAR = ['puxar', 'puxa', 'guia', 'gerar', 'emitir', 'emite', 'nota', 'fiscal', 'cliente', 'empresa', 'para', 'pagar', 'mandar', 'manda', 'enviar', 'envia', 'vencida', 'ltda', 'das', 'servicos', 'servico', 'referente', 'valor', 'reais', 'cadastrar'];
const palavrasDe = (q) => q.split(/[^a-z0-9]+/).filter((p) => p.length >= 3 && !IGNORAR.includes(p) && !MESES_NOME[p.slice(0, 3)]);
const melhor = (lista, nomeDe, palavras) => lista.map((x) => [x, palavras.filter((p) => semAcento(nomeDe(x)).includes(p)).length]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])[0];

// Executa o pedido e devolve { texto, link? } para o histórico
async function executaPedido(texto) {
  const q = semAcento(texto);
  const { empresas } = await api('/escritorio/empresas');
  // Cadastrar empresa pelo CNPJ
  const cnpj = (texto.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/) || [])[0];
  if (/cadastr/.test(q) && cnpj) {
    const r = await api('/empresas', { body: { cnpj } });
    return { texto: `Empresa ${r.usuario.empresa ? r.usuario.empresa.razaoSocial : doc(r.usuario.cnpj)} cadastrada${r.preenchidos && r.preenchidos.length ? ' com ' + r.preenchidos.join(', ') : ''}.`, link: `#/empresa/${r.usuario.id}/config` };
  }
  // Empresa: o que vem antes de "para" (depois é o tomador da nota)
  const [antes, depois = ''] = q.split(/\bpara\b/);
  const alvo = melhor(empresas, (e) => `${e.nome} ${e.fantasia} ${e.cnpj}`, palavrasDe(antes)) || melhor(empresas, (e) => `${e.nome} ${e.fantasia}`, palavrasDe(q));
  if (!alvo) throw new Error('Não achei a empresa. Use o nome do cadastro, por exemplo "puxar guia da AGEN".');
  const e = alvo[0];
  const d = await api(`/escritorio/empresas/${e.id}`);
  // Emitir nota: cliente (tomador), valor e descrição; abre a conferência
  if (/\bnota|\bnf/.test(q) && !/\bguia|\bdas\b/.test(q)) {
    const cli = depois ? melhor(d.clientes, (c) => `${c.nome} ${c.fantasia || ''} ${c.documento}`, palavrasDe(depois)) : null;
    const valorTxt = (texto.match(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d{2,})(?![\d/.])/) || [])[1];
    const valor = valorTxt ? Number(valorTxt.replace(/\./g, '').replace(',', '.')) : 0;
    const desc = valorTxt ? texto.slice(texto.indexOf(valorTxt) + valorTxt.length).replace(/^\s*(reais|,|-|de|referente a|ref\.?)\s*/i, '').trim() : '';
    try { sessionStorage.setItem('preNota', JSON.stringify({ empresa: e.id, documento: cli ? cli[0].documento : '', valor, descricao: desc.length >= 5 ? desc : '' })); } catch { /* ok */ }
    location.hash = `#/empresa/${e.id}/notas`;
    return { texto: `Nota da ${e.nome}${cli ? ' para ' + cli[0].nome : ''}${valor ? ' de ' + brl(valor) : ''} aberta para conferir e emitir.`, link: `#/empresa/${e.id}/notas` };
  }
  // Puxar guia do DAS
  if (!d.apuracao) throw new Error(`${e.nome} não está no Simples Nacional.`);
  const mesTxt = Object.keys(MESES_NOME).find((m) => new RegExp(`\\b${m}`).test(q));
  const ano = (q.match(/\b(20\d{2})\b/) || [])[1];
  let m = mesTxt ? d.apuracao.meses.find((x) => x.competencia.slice(5) === MESES_NOME[mesTxt] && (!ano || x.competencia.startsWith(ano))) : null;
  if (!m) m = d.apuracao.meses.slice().reverse().find((x) => !['paga', 'entregue'].includes(x.status) && (x.das ? x.das.valor : x.valor) > 0);
  if (!m) throw new Error(`${e.nome} não tem DAS em aberto.`);
  if (!INTEGRA.ativo) throw new Error(`O Integra Contador ainda não está ligado. A guia de ${comp(m.competencia)} da ${e.nome} precisa ser gerada em PGDAS-D e DAS.`);
  await puxaGuia(d.empresa, m.competencia);
  return { texto: `Guia de ${comp(m.competencia)} da ${e.nome} puxada e enviada ao cliente.`, link: `#/empresa/${e.id}/das` };
}

// Histórico de cada pessoa separado (o responsável herda o histórico antigo do painel)
const HIST = 'vj-pedidos';
const chaveHist = () => (EU.usuario ? `${HIST}-${EU.usuario.id}` : HIST);
const leHist = () => {
  try {
    const meu = localStorage.getItem(chaveHist());
    return JSON.parse(meu || (EU.gestor ? localStorage.getItem(HIST) : null) || '[]');
  } catch { return []; }
};
const gravaHist = (h) => { try { localStorage.setItem(chaveHist(), JSON.stringify(h.slice(0, 50))); } catch { /* ok */ } };

function telaAssistente() {
  const el = $('#conteudo');
  // Atalhos: começam o pedido e você completa com a empresa
  const atalhos = [['Puxar guia', 'Puxar guia da ', 'calc'], ['Emitir NF', 'Emitir NF da ', 'nota'], ['Cadastrar empresa', 'Cadastrar empresa ', 'predio']];
  const desenha = () => {
    const h = leHist();
    $('#histPedidos').innerHTML = h.length ? h.map((p) => `<li class="ped ${p.ok ? 'ok' : 'erro'}"><div class="ped-q">${esc(p.pedido)}<small>${new Date(p.em).toLocaleString('pt-BR')}</small></div><div class="ped-r">${p.ok ? icone('check') : '⚠'} <span>${esc(p.resposta)}</span>${p.link ? ` <a href="${esc(p.link)}">Abrir</a>` : ''}</div></li>`).join('') : '<li class="vazio">Seus pedidos aparecem aqui.</li>';
  };
  el.innerHTML = `
    <div class="cab"><div><h1>Pedidos</h1><p>Escreva o que precisa, como numa mensagem. O painel faz.</p></div></div>
    <form class="card pedido" id="formPedido">
      <textarea id="pedido" rows="3" placeholder="O que você precisa?"></textarea>
      <div class="pedido-pe"><div class="atalhos">${atalhos.map(([rotulo, inicio, ic]) => `<button type="button" class="btn pequeno" data-ex="${esc(inicio)}">${icone(ic)} ${rotulo}</button>`).join('')}</div><button class="btn ouro">${icone('raio')} Fazer</button></div>
    </form>
    <div class="card"><h2>Histórico</h2><ul class="hist" id="histPedidos"></ul></div>`;
  $$('[data-ex]').forEach((b) => b.addEventListener('click', () => { const p = $('#pedido'); p.value = b.dataset.ex; p.focus(); p.setSelectionRange(p.value.length, p.value.length); }));
  $('#pedido').addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); $('#formPedido').requestSubmit(); } });
  $('#formPedido').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const pedido = $('#pedido').value.trim();
    if (!pedido) return;
    const btn = ev.target.querySelector('button.ouro'); btn.disabled = true; btn.textContent = 'Fazendo…';
    let reg;
    try { const r = await executaPedido(pedido); reg = { pedido, ok: true, resposta: r.texto, link: r.link }; } catch (err) { reg = { pedido, ok: false, resposta: err.message }; }
    gravaHist([{ ...reg, em: new Date().toISOString() }, ...leHist()]);
    if (location.hash.startsWith('#/assistente')) { $('#pedido').value = ''; desenha(); btn.disabled = false; btn.innerHTML = `${icone('raio')} Fazer`; if (!reg.ok) aviso(esc(reg.resposta), 'erro'); }
  });
  desenha();
  $('#pedido').focus();
}

async function telaIntegra() {
  const el = $('#conteudo');
  await carregaIntegra();
  const s = INTEGRA;
  el.innerHTML = `
    <div class="cab"><div><h1>Integra Contador</h1><p>Conexão com a Receita (SERPRO) para puxar as guias do DAS sozinho.</p></div></div>
    <div class="grade-2">
      <div class="card">
        <h2>Situação</h2>
        <div class="linha-info"><span class="suave">Conexão</span>${s.ativo ? (s.modo === 'demonstracao' ? '<span class="chip info">Demonstração</span>' : '<span class="chip ok">Ligada</span>') : '<span class="chip erro">Desligada</span>'}</div>
        <div class="linha-info"><span class="suave">Contratante</span><b>${doc(s.contratante || '')}</b></div>
        ${s.modo === 'producao' ? `<div class="linha-info"><span class="suave">Chaves do SERPRO</span>${s.chaves ? '<span class="chip ok">Configuradas</span>' : '<span class="chip erro">Faltam</span>'}</div>
        <div class="linha-info"><span class="suave">e-CNPJ do escritório</span>${s.certificado ? '<span class="chip ok">Conectado</span>' : '<span class="chip erro">Falta</span>'}</div>` : ''}
        ${!s.ativo ? `<p class="msg atencao">Para ligar: 1) contrato ativo na Área do Cliente SERPRO; 2) Consumer Key e Secret nas variáveis do Railway (INTEGRA_CONSUMER_KEY e INTEGRA_CONSUMER_SECRET); 3) e-CNPJ do escritório aqui ao lado.</p>` : ''}
      </div>
      <div class="card">
        <h2>e-CNPJ do escritório</h2>
        <p class="suave" style="margin-top:0">O certificado do contratante (VIMARI) autentica o site no SERPRO. Fica guardado criptografado.</p>
        <label class="campo"><span>Arquivo (.pfx ou .p12)</span><input type="file" id="iArq" accept=".pfx,.p12"></label>
        <label class="campo"><span>Senha do certificado</span><input type="password" id="iSenha" autocomplete="off"></label>
        <button class="btn primario" id="iEnviar">${icone('chave')} Conectar</button>
        <p id="iMsg" class="msg" hidden></p>
      </div>
    </div>`;
  $('#iEnviar').addEventListener('click', async () => {
    const arq = $('#iArq').files[0];
    const msg = (t, c) => { $('#iMsg').className = `msg ${c}`; $('#iMsg').textContent = t; $('#iMsg').hidden = false; };
    if (!arq) return msg('Escolha o arquivo do certificado.', 'erro');
    const b64 = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]); fr.readAsDataURL(arq); });
    try { await api('/escritorio/integra/certificado', { body: { pfx: b64, senha: $('#iSenha').value } }); aviso('Certificado do escritório conectado.'); telaIntegra(); } catch (err) { msg(err.message, 'erro'); }
  });
}

// ---------- Equipe ----------
// A senha provisória aparece uma única vez, para o responsável repassar à pessoa
function mostraSenhaProvisoria(m, s) {
  return dialogo({
    titulo: 'Acesso pronto',
    sub: `Repasse para ${esc(m.nome)}. Esta senha aparece só agora; no primeiro acesso a pessoa cria a própria.`,
    corpo: `<div class="cred"><div><span>Endereço</span><b>${esc(location.origin)}/escritorio</b></div><div><span>E-mail</span><b>${esc(m.email)}</b></div><div><span>Senha provisória</span><b class="mono-txt">${esc(s)}</b></div></div>`,
    botoes: [{ texto: 'Copiar dados', classe: 'secundario', acao: async () => { try { await navigator.clipboard.writeText(`Painel do escritório: ${location.origin}/escritorio\nE-mail: ${m.email}\nSenha provisória: ${s}`); aviso('Dados copiados.'); } catch { aviso('Não deu para copiar; anote a senha.', 'erro'); } return false; } }, { texto: 'Pronto', classe: 'primario', valor: true }],
  });
}

async function telaEquipe() {
  const el = $('#conteudo');
  el.innerHTML = '<p class="vazio">Carregando equipe…</p>';
  const { equipe, empresas } = await api('/equipe');
  const ativos = equipe.filter((m) => m.ativo).length;
  const semDono = empresas.filter((e) => !equipe.some((m) => m.ativo && m.papel === 'equipe' && m.empresas.includes(e.id))).length;
  const carteira = (m) => (m.papel === 'dono' ? '<span class="suave">Todas</span>' : m.empresas.length ? `<b>${m.empresas.length}</b> <span class="suave">de ${empresas.length}</span>` : '<span class="chip atencao">Nenhuma</span>');
  el.innerHTML = `
    <div class="cab">
      <div><h1>Equipe</h1><p>Quem entra no painel e quais empresas cada funcionário cuida.</p></div>
      <button class="btn primario" id="novoMembro">${icone('mais')} Adicionar pessoa</button>
    </div>
    <div class="kpis tres">
      <div class="kpi"><span>Acessos ativos</span><b>${ativos}</b><small>${equipe.length - ativos ? `${equipe.length - ativos} desativado(s)` : 'nenhum desativado'}</small></div>
      <div class="kpi"><span>Funcionários</span><b>${equipe.filter((m) => m.ativo && m.papel === 'equipe').length}</b><small>cada um com a sua carteira</small></div>
      <div class="kpi"><span>Empresas sem funcionário</span><b>${semDono}</b><small>${semDono ? 'só o responsável cuida' : 'todas distribuídas'}</small></div>
    </div>
    <div class="card sem-pad"><table class="tabela"><thead><tr><th>Pessoa</th><th>Função</th><th>Empresas</th><th>Situação</th><th class="ocultar-cel">Último acesso</th><th></th></tr></thead><tbody>
      ${equipe.map((m) => `
        <tr data-id="${m.id}">
          <td><div class="empresa-cel"><span class="avatar">${esc(iniciais(m.nome))}</span><div><b>${esc(m.nome)}${EU.usuario && EU.usuario.id === m.id ? ' <small class="suave">(você)</small>' : ''}</b><small>${esc(m.email)}</small></div></div></td>
          <td>${m.papel === 'dono' ? '<span class="chip info">Responsável</span>' : '<span class="chip neutro">Funcionário</span>'}</td>
          <td>${carteira(m)}</td>
          <td>${!m.ativo ? '<span class="chip erro">Desativado</span>' : m.trocarSenha ? '<span class="chip atencao">Aguardando 1º acesso</span>' : '<span class="chip ok">Ativo</span>'}</td>
          <td class="ocultar-cel">${m.ultimoAcesso ? data(m.ultimoAcesso) : '<span class="suave">—</span>'}</td>
          <td class="acoes">
            ${m.papel === 'equipe' ? '<button class="btn pequeno" data-acao="carteira">Empresas</button>' : ''}
            <button class="btn pequeno" data-acao="editar">Editar</button>
            <button class="btn pequeno" data-acao="senha">Nova senha</button>
            ${EU.usuario && EU.usuario.id === m.id ? '' : `<button class="btn pequeno ${m.ativo ? 'perigo' : ''}" data-acao="ativo">${m.ativo ? 'Desativar' : 'Reativar'}</button>`}
          </td>
        </tr>`).join('') || '<tr><td colspan="6" class="vazio">Ninguém cadastrado ainda.</td></tr>'}
    </tbody></table></div>
    <div class="card"><h2>O que cada função pode fazer</h2>
      <div class="linha-info"><span><b>Funcionário</b></span><span class="suave">Só as empresas dele: notas fiscais, clientes, PGDAS-D/DAS e pedidos. Empresa que ele cadastrar já entra na carteira dele.</span></div>
      <div class="linha-info"><span><b>Responsável</b></span><span class="suave">Todas as empresas, a equipe e as ferramentas do escritório.</span></div>
    </div>`;

  // Lista de empresas com busca e marcar/desmarcar todas
  const escolhaEmpresas = (marcadas = []) => `
    <div class="escolha-emp">
      <div class="escolha-topo"><input id="eBusca" placeholder="Buscar empresa"><span class="suave" id="eCont"></span><button type="button" class="lnk" id="eTodas">Marcar todas</button></div>
      <div class="escolha-lista">${empresas.map((e) => `<label data-txt="${esc((e.nome + ' ' + e.cnpj).toLowerCase())}"><input type="checkbox" value="${e.id}" ${marcadas.includes(e.id) ? 'checked' : ''}><span><b>${esc(e.nome)}</b><small>${doc(e.cnpj)}</small></span></label>`).join('') || '<p class="vazio">Nenhuma empresa cadastrada.</p>'}</div>
    </div>`;
  const ligaEscolha = () => {
    const caixas = () => $$('.escolha-lista input', $('#dlg'));
    const conta = () => { $('#eCont').textContent = `${caixas().filter((c) => c.checked).length} marcada(s)`; };
    $('#eBusca').addEventListener('input', () => { const q = $('#eBusca').value.trim().toLowerCase().replace(/[./-]/g, ''); $$('.escolha-lista label', $('#dlg')).forEach((l) => { l.hidden = !!q && !l.dataset.txt.replace(/[./-]/g, '').includes(q); }); });
    $('#eTodas').addEventListener('click', () => { const vis = caixas().filter((c) => !c.closest('label').hidden); const todas = vis.every((c) => c.checked); vis.forEach((c) => { c.checked = !todas; }); conta(); });
    caixas().forEach((c) => c.addEventListener('change', conta));
    conta();
  };
  const marcadas = () => $$('.escolha-lista input', $('#dlg')).filter((c) => c.checked).map((c) => c.value);
  const campos = (m = {}) => `
    <label class="campo"><span>Nome</span><input id="mNome" value="${esc(m.nome || '')}" maxlength="120"></label>
    ${m.id ? '' : '<label class="campo"><span>E-mail</span><input id="mEmail" type="email" maxlength="160"></label>'}
    <label class="campo"><span>Função</span><select id="mPapel"><option value="equipe">Funcionário (só as empresas dele)</option><option value="dono" ${m.papel === 'dono' ? 'selected' : ''}>Responsável (vê tudo)</option></select></label>
    ${m.id ? '' : `<div id="mCarteira"><span class="rotulo">Empresas que vai cuidar</span>${escolhaEmpresas()}</div>`}`;

  $('#novoMembro').addEventListener('click', async () => {
    const p = dialogo({ titulo: 'Adicionar pessoa', sub: 'O site cria uma senha provisória para o primeiro acesso.', corpo: campos(), botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Criar acesso', classe: 'primario', acao: () => api('/equipe', { body: { nome: $('#mNome').value, email: $('#mEmail').value, papel: $('#mPapel').value, empresas: $('#mPapel').value === 'equipe' ? marcadas() : [] } }) }] });
    ligaEscolha();
    $('#mPapel').addEventListener('change', () => { $('#mCarteira').hidden = $('#mPapel').value !== 'equipe'; });
    const r = await p;
    if (r) { await mostraSenhaProvisoria(r.membro, r.senhaProvisoria); telaEquipe(); }
  });
  $$('[data-acao]', el).forEach((b) => b.addEventListener('click', async () => {
    const m = equipe.find((x) => x.id === b.closest('tr').dataset.id);
    if (b.dataset.acao === 'carteira') {
      const p = dialogo({ titulo: `Empresas de ${esc(m.nome)}`, sub: 'Marque as empresas que essa pessoa cuida. Ela só vê essas no painel.', corpo: escolhaEmpresas(m.empresas), botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Salvar', classe: 'primario', acao: () => api(`/equipe/${m.id}`, { body: { empresas: marcadas() } }) }] });
      ligaEscolha();
      const r = await p;
      if (r) { aviso(`${esc(m.nome)} agora cuida de ${r.membro.empresas.length} empresa(s).`); telaEquipe(); }
    } else if (b.dataset.acao === 'editar') {
      const r = await dialogo({ titulo: `Editar ${esc(m.nome)}`, sub: esc(m.email), corpo: campos(m), botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Salvar', classe: 'primario', acao: () => api(`/equipe/${m.id}`, { body: { nome: $('#mNome').value, papel: $('#mPapel').value } }) }] });
      if (r) { aviso('Alterações salvas.'); telaEquipe(); }
    } else if (b.dataset.acao === 'senha') {
      const r = await dialogo({ titulo: 'Gerar nova senha?', sub: `${esc(m.nome)} sai do painel e entra de novo com a senha provisória.`, botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Gerar senha', classe: 'primario', acao: () => api(`/equipe/${m.id}/senha`, { method: 'POST' }) }] });
      if (r) { await mostraSenhaProvisoria(r.membro, r.senhaProvisoria); telaEquipe(); }
    } else {
      try { await api(`/equipe/${m.id}`, { body: { ativo: !m.ativo } }); aviso(m.ativo ? `${esc(m.nome)} não entra mais no painel.` : `${esc(m.nome)} pode entrar de novo.`); telaEquipe(); } catch (err) { aviso(esc(err.message), 'erro'); }
    }
  }));
}

function telaConta() {
  const u = EU.usuario;
  $('#conteudo').innerHTML = `
    <div class="cab"><div><h1>Minha conta</h1><p>${esc(u.nome)} · ${esc(u.email)} · ${PAPEL[u.papel] || ''}</p></div></div>
    ${u.trocarSenha ? '<p class="msg atencao" style="margin:0 0 16px">Você entrou com uma senha provisória. Crie a sua senha para continuar usando o painel.</p>' : ''}
    <div class="grade-2"><form class="card" id="formSenha">
      <h2>Trocar senha</h2>
      <label class="campo"><span>Senha atual</span><input type="password" id="sAtual" autocomplete="current-password" required></label>
      <label class="campo"><span>Nova senha (mínimo 8 caracteres)</span><input type="password" id="sNova" autocomplete="new-password" minlength="8" required></label>
      <label class="campo"><span>Repita a nova senha</span><input type="password" id="sNova2" autocomplete="new-password" minlength="8" required></label>
      <button class="btn primario">Salvar senha</button>
      <p id="sMsg" class="msg erro" hidden></p>
    </form></div>`;
  $('#formSenha').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const erro = (t) => { $('#sMsg').textContent = t; $('#sMsg').hidden = !t; };
    if ($('#sNova').value !== $('#sNova2').value) return erro('As duas senhas novas não são iguais.');
    try {
      await api('/equipe-minha-senha', { body: { atual: $('#sAtual').value, nova: $('#sNova').value } });
      EU.usuario.trocarSenha = false;
      aviso('Senha trocada.');
      location.hash = '#/assistente';
    } catch (err) { erro(err.message); }
  });
}

// ----- PGDAS-D e DAS -----
// Um botão por mês, no passo certo: sem movimento -> declarar; com valor -> gerar guia; guia enviada -> marcar paga
const PORTAL_PGDAS = 'https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/pgdasd2018.app/';
const zerado = (m) => !(m.das ? m.das.valor : m.valor);
function situacaoDas(m) {
  if (m.status === 'paga') return ['ok', 'Paga'];
  if (m.status === 'entregue') return ['ok', 'Entregue sem movimento'];
  if (m.status === 'das_disponivel') return ['info', 'Guia com o cliente'];
  if (m.semDados) return ['neutro', 'Sem notas no sistema'];
  return zerado(m) ? ['atencao', 'Declarar sem movimento'] : ['atencao', 'Gerar guia'];
}
// Coluna "Declarado na Receita" (resultado da conferência pelo Integra Contador)
function celulaDeclarado(m) {
  const c = m.conferencia;
  if (!c) return '<span class="suave">—</span>';
  const v = c.receitaDeclarada != null ? brl(c.receitaDeclarada) : '';
  const extra = `${c.retificada ? ' · retificada' : ''}${c.dasPago ? ' · DAS pago' : ''}${c.malha ? ' · em malha' : ''}`;
  if (c.situacao === 'ok') return `<span class="chip ok">${v || 'Declarado'}</span><br><small>confere${extra}</small>`;
  if (c.situacao === 'divergente') return `<span class="chip erro">${v}</span><br><small style="color:var(--erro)">diferença ${brl(c.diferenca)}${extra}</small>`;
  if (c.situacao === 'nao_declarada') return '<span class="chip erro">Não declarado</span><br><small style="color:var(--erro)">tem notas no mês</small>';
  if (c.situacao === 'sem_declaracao') return '<span class="chip neutro">Não declarado</span>';
  return `<span class="chip atencao">Declarado</span><br><small>valor não lido${extra}</small>`;
}

async function conferirEmpresa(e) {
  const r = await api(`/escritorio/empresas/${e.id}/conferir`, { method: 'POST' });
  aviso(r.problemas ? `${r.problemas} mês(es) com diferença entre o PGDAS-D e as notas.` : 'Tudo confere com a Receita.', r.problemas ? 'erro' : 'ok');
  return r;
}

function abaDas(d) {
  const e = d.empresa;
  if (!d.apuracao) { $('#abaCorpo').innerHTML = `<div class="card vazio">${e.regime === 'MEI' ? 'Empresa MEI: o DAS-MEI é fixo e não passa pelo PGDAS-D.' : 'Esta empresa não está no Simples Nacional.'}</div>`; return; }
  const meses = d.apuracao.meses;
  const hoje = new Date().toISOString().slice(0, 10);
  const pendentes = meses.filter((m) => ['calculada', 'aprovada'].includes(m.status) && !m.semDados);
  const aPagar = meses.filter((m) => m.status === 'das_disponivel').reduce((t, m) => t + (m.das ? m.das.valor : 0), 0);
  const prox = meses[0];
  const divergentes = meses.filter((m) => m.conferencia && ['divergente', 'nao_declarada'].includes(m.conferencia.situacao));
  const ultimaConf = meses.map((m) => m.conferencia && m.conferencia.em).filter(Boolean).sort().pop();
  $('#abaCorpo').innerHTML = `
    <div class="kpis">
      <div class="kpi"><span>Mês a declarar</span><b>${comp(prox.competencia)}</b><small>${situacaoDas(prox)[1]}</small></div>
      <div class="kpi"><span>Faturamento</span><b>${brl(prox.receita)}</b><small>${prox.notas.length} nota(s) no mês</small></div>
      <div class="kpi"><span>DAS do mês</span><b>${brl(prox.das ? prox.das.valor : prox.valor)}</b><small>vence ${dataIso((prox.das && prox.das.vencimento) || prox.vencimento)}</small></div>
      <div class="kpi"><span>Pendências</span><b>${pendentes.length}</b><small>${aPagar ? `${brl(aPagar)} em guias a pagar` : 'mês(es) para declarar'}</small></div>
    </div>
    ${INTEGRA.ativo ? `<div class="faixa ${divergentes.length ? 'atencao' : 'info'}">${icone('raio')}<span>${divergentes.length ? `<b>${divergentes.length} mês(es) com o PGDAS-D diferente das notas:</b> ${divergentes.map((m) => comp(m.competencia)).join(', ')}. Retifique e depois puxe a guia.` : (ultimaConf ? `Conferido com a Receita em ${new Date(ultimaConf).toLocaleString('pt-BR')}.` : '<b>Confira com a Receita</b> o que foi declarado no PGDAS-D em cada mês.')}</span><button class="btn pequeno" id="btnConferir">Conferir com a Receita</button></div>` : ''}
    <div class="card sem-pad"><table class="tabela"><thead><tr><th>Mês</th><th class="num">Faturamento (notas)</th><th>Declarado na Receita</th><th class="num">DAS</th><th>Vencimento</th><th>Situação</th><th></th></tr></thead><tbody>
    ${meses.map((m) => {
      const venc = (m.das && m.das.vencimento) || m.vencimento;
      const [cls, txt] = situacaoDas(m);
      const atrasado = !['paga', 'entregue'].includes(m.status) && !zerado(m) && venc < hoje;
      const calc = m.partes.map((p) => `${p.rotulo}: Anexo ${p.anexo} · ${pct(p.aliquota)}`).join(' | ');
      let acao = '';
      if (['calculada', 'aprovada'].includes(m.status)) acao = zerado(m) ? `<button class="btn pequeno primario" data-apu="zerada" data-c="${m.competencia}">Declarar sem movimento</button>` : (INTEGRA.ativo ? `<button class="btn pequeno ouro" data-apu="puxar" data-c="${m.competencia}">${icone('raio')} Puxar guia</button>` : `<button class="btn pequeno ouro" data-apu="guia" data-c="${m.competencia}">Gerar guia</button>`);
      if (m.status === 'das_disponivel') acao = (INTEGRA.ativo && venc < hoje ? `<button class="btn pequeno" data-apu="puxar" data-c="${m.competencia}">Atualizar guia vencida</button><br>` : '') + `${m.das && m.das.pdf ? `<a class="lnk" href="${esc(m.das.pdf)}" target="_blank" rel="noopener">${icone('pdf')} Ver guia</a> ` : ''}<button class="btn pequeno" data-apu="pago" data-c="${m.competencia}">Marcar paga</button>`;
      if (['paga', 'entregue'].includes(m.status)) acao = `<span class="suave">${icone('check')}</span>`;
      return `<tr title="${esc(calc)}">
        <td><b>${comp(m.competencia)}</b>${m.avisos.length ? `<br><small style="color:var(--atencao)" title="${esc(m.avisos.join(' '))}">⚠ conferir</small>` : ''}</td>
        <td class="num">${brl(m.receita)}<br><small>${m.notas.length} nota(s)${m.ajuste && m.ajuste.extra ? ' + ajuste' : ''}</small></td>
        <td>${celulaDeclarado(m)}</td>
        <td class="num"><b>${brl(m.das ? m.das.valor : m.valor)}</b></td>
        <td style="${atrasado ? 'color:var(--erro);font-weight:700' : ''}">${dataIso(venc)}${atrasado ? '<br><small>vencido</small>' : ''}</td>
        <td><span class="chip ${cls}">${txt}</span></td>
        <td class="acoes">${acao}${['calculada', 'aprovada'].includes(m.status) ? `<br><button class="lnk" data-apu="ajuste" data-c="${m.competencia}" style="margin-top:6px">Ajustar faturamento</button>` : ''}</td>
      </tr>`;
    }).join('')}
    </tbody></table></div>
    <p class="suave" style="font-size:.85rem;margin-top:12px">${INTEGRA.ativo ? 'Puxar guia: o site busca o DAS na Receita (vencido já sai com multa e juros até hoje) e envia ao cliente.' : 'Quando o Integra Contador estiver ligado, aparece o botão "Puxar guia": o site busca o DAS na Receita sozinho. Até lá, use "Gerar guia" e anexe o PDF.'}</p>`;
  if ($('#btnConferir')) $('#btnConferir').addEventListener('click', async (ev) => {
    ev.target.disabled = true; ev.target.textContent = 'Consultando a Receita…';
    try { await conferirEmpresa(e); } catch (err) { aviso(esc(err.message), 'erro'); }
    telaEmpresa(e.id, 'das');
  });
  $$('[data-apu]').forEach((b) => b.addEventListener('click', async () => {
    const m = meses.find((x) => x.competencia === b.dataset.c);
    const base = `/apuracoes/${e.id}/${m.competencia}`;
    try {
      if (b.dataset.apu === 'pago') { await api(base + '/pago', { body: {} }); aviso('DAS marcado como pago.'); }
      if (b.dataset.apu === 'conferir') { await conferirEmpresa(e); }
      if (b.dataset.apu === 'puxar') { b.disabled = true; b.textContent = 'Buscando na Receita…'; await puxaGuia(e, m.competencia); }
      if (b.dataset.apu === 'zerada') {
        const ok = await dialogo({ titulo: `Declarar ${comp(m.competencia)} sem movimento`, sub: 'Mês sem faturamento: não há guia para pagar.',
          corpo: `<p style="margin:0 0 12px">Transmita o PGDAS-D de <b>${comp(m.competencia)}</b> com receita <b>R$ 0,00</b> e marque aqui como entregue.</p><a class="btn" href="${PORTAL_PGDAS}" target="_blank" rel="noopener">Abrir o PGDAS-D ${icone('seta')}</a>`,
          botoes: [{ texto: 'Voltar', valor: null }, { texto: 'Marcar como entregue', classe: 'primario', acao: async () => api(base + '/zerada', { method: 'POST' }) }] });
        if (ok) aviso(`${comp(m.competencia)} entregue sem movimento.`);
      }
      if (b.dataset.apu === 'ajuste') {
        const ok = await dialogo({ titulo: `Ajustar ${comp(m.competencia)}`, sub: 'Para faturamento que não passou pelo sistema ou RBT12 diferente.',
          corpo: `<label class="campo"><span>Faturamento a somar (R$)</span><input id="aExtra" placeholder="0,00"></label>
            <div class="form-2"><label class="campo"><span>RBT12 correto</span><input id="aRbt" placeholder="vazio = calculado"></label>
            <label class="campo"><span>Anexo dos serviços</span><select id="aAnexo"><option value="">Manter</option><option>III</option><option>IV</option><option>V</option></select></label></div>`,
          botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Recalcular', classe: 'primario', acao: async (dl) => api(base + '/ajuste', { body: { extra: { servicos: $('#aExtra', dl).value }, rbt12: $('#aRbt', dl).value, anexos: $('#aAnexo', dl).value ? { servicos: $('#aAnexo', dl).value } : {} } }) }] });
        if (ok) aviso('Faturamento ajustado e DAS recalculado.');
      }
      if (b.dataset.apu === 'guia') {
        const venc = (m.das && m.das.vencimento) || m.vencimento;
        const ok = await dialogo({ titulo: `Gerar guia · ${comp(m.competencia)}`, sub: 'Confira, transmita no PGDAS-D e anexe a guia. O cliente recebe na hora.',
          corpo: `<dl class="confere" style="margin-bottom:16px"><dt>Faturamento</dt><dd><b>${brl(m.receita)}</b> <small>(${m.notas.length} nota(s))</small></dd>
              <dt>RBT12</dt><dd>${brl(m.rbt12)}</dd><dt>Cálculo</dt><dd><small>${esc(m.partes.map((p) => `${p.rotulo}: Anexo ${p.anexo} · ${pct(p.aliquota)}`).join(' | ') || '—')}</small></dd>
              <dt>DAS</dt><dd class="valor">${brl(m.valor)}</dd></dl>
            <a class="btn" href="${PORTAL_PGDAS}" target="_blank" rel="noopener" style="margin-bottom:16px">1. Abrir o PGDAS-D ${icone('seta')}</a>
            <label class="campo"><span>2. PDF da guia (DAS)</span><input type="file" id="gArq" accept="application/pdf,.pdf"></label>
            <div class="form-2"><label class="campo"><span>Valor da guia</span><input id="gValor" value="${Number(m.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}"></label>
            <label class="campo"><span>Vencimento</span><input id="gVenc" type="date" value="${esc(venc || '')}"></label></div>
            <label class="campo"><span>Código de barras <small>(opcional)</small></span><input id="gLinha" placeholder="Para o cliente copiar e pagar"></label>`,
          botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Enviar guia ao cliente', classe: 'ouro', acao: async (dl) => {
            const arq = $('#gArq', dl).files[0];
            if (!arq && !$('#gLinha', dl).value.trim()) throw new Error('Anexe o PDF da guia ou informe o código de barras.');
            const pdfArquivo = arq ? await new Promise((ok2) => { const fr = new FileReader(); fr.onload = () => ok2(String(fr.result).split(',')[1]); fr.readAsDataURL(arq); }) : undefined;
            return api(base + '/das', { body: { pdfArquivo, linhaDigitavel: $('#gLinha', dl).value, valor: $('#gValor', dl).value, vencimento: $('#gVenc', dl).value } });
          } }] });
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
          <label class="campo"><span>Código do serviço (nacional)</span><input id="fServ" maxlength="60" list="listaServ" value="${esc(f.codigoServico || '')}" placeholder="Código ou palavra (ex.: manutenção)" autocomplete="off"><datalist id="listaServ"></datalist></label>
          <label class="campo"><span>Série da DPS</span><input id="fSerie" value="${esc(f.serieDps || 900)}"></label>
          <label class="campo"><span>Próximo número</span><input id="fNum" value="${esc(e.proximoDps || 1)}"></label>
          <label class="campo"><span>Alíquota do Simples (%)</span><input id="fAliq" value="${esc(String(f.aliquotaSN || 6).replace('.', ','))}"></label>
        </div>
        <p id="descServ" class="suave" style="font-size:.82rem;margin:-6px 0 14px"></p>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primario">Salvar</button><button type="button" class="btn" id="btnPreencher">${icone('raio')} Preencher pelo CNPJ</button>${e.emissao === 'homologacao' ? '<button type="button" class="btn" id="btnTeste">Testar emissão (R$ 1,00)</button>' : ''}</div>
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
      await api(`/assinantes/${e.id}/fiscal`, { body: { codigoMunicipio: $('#fMun').value, codigoServico: $('#fServ').value.replace(/\D/g, '').slice(0, 6), serieDps: $('#fSerie').value, proximoDps: $('#fNum').value, aliquotaSN: $('#fAliq').value, emissao } });
      aviso('Configuração salva.'); telaEmpresa(e.id, 'config');
    } catch (err) { aviso(esc(err.message), 'erro'); }
  });
  // Código do serviço: busca na lista oficial e mostra a descrição do código escolhido
  const mostraServico = async () => {
    const c = $('#fServ').value.replace(/\D/g, '').slice(0, 6);
    if (c.length !== 6) { $('#descServ').textContent = ''; return; }
    try { const { servicos } = await api('/escritorio/servicos?q=' + c); const s = servicos.find((x) => x.codigo === c); $('#descServ').textContent = s ? `${s.item} · ${s.descricao}` : 'Código não encontrado na lista nacional.'; } catch { /* ok */ }
  };
  let tServ;
  $('#fServ').addEventListener('input', () => {
    clearTimeout(tServ);
    tServ = setTimeout(async () => {
      const q = $('#fServ').value.trim();
      if (/^\d{6}\b/.test(q)) { $('#fServ').value = q.slice(0, 6); mostraServico(); return; }
      if (q.length < 3) return;
      const { servicos } = await api('/escritorio/servicos?q=' + encodeURIComponent(q));
      $('#listaServ').innerHTML = servicos.map((s) => `<option value="${s.codigo} - ${esc(s.descricao.slice(0, 90))}">`).join('');
    }, 250);
  });
  mostraServico();
  $('#btnPreencher').addEventListener('click', async (ev) => {
    ev.target.disabled = true;
    try {
      const r = await api(`/escritorio/empresas/${e.id}/preencher`, { method: 'POST' });
      $('#fMun').value = r.fiscal.codigoMunicipio || ''; $('#fServ').value = r.fiscal.codigoServico || ''; $('#fAliq').value = String(r.fiscal.aliquotaSN || '').replace('.', ',');
      mostraServico();
      aviso(r.servico ? `Preenchido pelo CNAE ${esc(r.cnae)} (${esc(r.atividade.slice(0, 60))}). Confira e salve.` : `Município e alíquota preenchidos. O CNAE ${esc(r.cnae)} não tem código sugerido: busque o serviço na lista.`, r.servico ? 'ok' : 'erro');
    } catch (err) { aviso(esc(err.message), 'erro'); }
    ev.target.disabled = false;
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
