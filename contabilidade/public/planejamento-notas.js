// Simulador: lê as notas dos últimos 12 meses e preenche faturamento, compras e % de clientes empresa.
(() => {
  const q = (s) => document.querySelector(s);
  const SEP = '\n<!--VJ-SEP-->\n';
  const LOTE = 4 * 1024 * 1024;
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const nomeMes = (m) => `${MES[Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}`;
  const brl = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const raiz = (c) => String(c || '').replace(/\D/g, '').slice(0, 8);
  const notas = new Map();
  const canceladas = new Set();
  let ignorados = 0;
  let cnpjConta = '';
  fetch('/api/portal/eu', { credentials: 'same-origin' }).then((r) => r.json()).then((j) => { cnpjConta = (j.usuario && j.usuario.cnpj) || ''; }).catch(() => {});

  const caixa = q('#leituraNotas');
  const mostra = (html, tipo = '') => { caixa.hidden = false; caixa.className = `leitura-notas ${tipo}`; caixa.innerHTML = html; };

  async function pacotes(arquivos) {
    const saida = [];
    let atual = [];
    let tam = 0;
    const fecha = () => { if (atual.length) saida.push(atual.join(SEP)); atual = []; tam = 0; };
    for (const f of arquivos) {
      if (!/\.xml$/i.test(f.name) || f.size > LOTE) { saida.push(f); continue; }
      const t = await f.text();
      if (tam + t.length > LOTE) fecha();
      atual.push(t);
      tam += t.length;
    }
    fecha();
    return saida;
  }

  function preenche(id, valor) {
    const el = q(id);
    el.value = valor ? valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
    el.classList.toggle('auto', !!valor);
  }

  function calcula() {
    const lista = [...notas.values()].filter((n) => !canceladas.has(n.chave) && n.saida && /^\d{4}-\d{2}$/.test(n.mes));
    if (!lista.length) return mostra('Não encontramos notas nos arquivos. Confira se são os XMLs (não o PDF/DANFE) das notas.', 'erro');
    // Qual é a empresa: a do CNPJ consultado, a da conta, ou quem mais aparece como emitente
    const contagem = {};
    lista.forEach((n) => { if (n.emit) contagem[n.emit] = (contagem[n.emit] || 0) + 1; if (n.dest) contagem[n.dest] = (contagem[n.dest] || 0) + 1; });
    const consultada = raiz(typeof estado !== 'undefined' && estado.empresa && estado.empresa.cnpj);
    const empresa = [consultada, raiz(cnpjConta)].find((c) => c && contagem[c]) || Object.entries(contagem).sort((a, b) => b[1] - a[1])[0][0];
    const vendas = lista.filter((n) => n.emit === empresa);
    const compras = lista.filter((n) => n.dest === empresa && n.emit !== empresa);
    // Janela: os 12 meses até o último mês com nota
    const ultimo = [...vendas, ...compras].map((n) => n.mes).sort().pop();
    const [a, m] = ultimo.split('-').map(Number);
    const inicio = `${m === 12 ? a : a - 1}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`;
    const dentro = (n) => n.mes >= inicio && n.mes <= ultimo;
    const v = vendas.filter(dentro);
    const c = compras.filter(dentro);
    const meses = new Set([...v, ...c].map((n) => n.mes)).size || 1;
    const totalV = v.reduce((t, n) => t + n.valor, 0);
    const totalC = c.reduce((t, n) => t + n.valor, 0);
    const paraEmpresas = v.filter((n) => n.dest && n.dest !== empresa).reduce((t, n) => t + n.valor, 0);
    const b2b = totalV ? Math.round((paraEmpresas / totalV) * 20) * 5 : null;
    preenche('#fFat', totalV / meses);
    preenche('#fIns', totalC / meses);
    if (b2b !== null) { q('#fB2b').value = b2b; q('#vB2b').textContent = `${b2b}%`; }
    const avisos = [];
    if (meses < 12) avisos.push(`Recebemos notas de ${meses} mês(es). A média foi feita sobre esses meses; com os 12 meses o resultado fica mais preciso.`);
    if (!c.length) avisos.push('Não vieram notas de compra. Se tiver, envie também: elas mostram os créditos de imposto.');
    if (canceladas.size) avisos.push(`${canceladas.size} nota(s) canceladas ficaram de fora.`);
    if (ignorados) avisos.push(`${ignorados} arquivo(s) não eram notas e foram ignorados.`);
    mostra(`<b>Pronto! Li ${v.length + c.length} notas de ${nomeMes(inicio)} a ${nomeMes(ultimo)}.</b>
      <ul>
        <li>Vendas: <b>${brl(totalV / meses)}</b> por mês (${brl(totalV)} no período)</li>
        <li>Compras: <b>${brl(totalC / meses)}</b> por mês</li>
        ${b2b !== null ? `<li>Vendas para empresas: <b>${b2b}%</b></li>` : ''}
      </ul>
      <p style="margin:8px 0 0">Agora só falta digitar <b>salários</b> e <b>pró-labore</b> e clicar em <b>Ver resultado</b>.</p>
      ${avisos.length ? `<ul style="color:var(--atencao)">${avisos.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}`, 'ok');
    q('#fFolha').focus();
  }

  async function envia(arquivos) {
    arquivos = [...arquivos].filter((f) => f.size);
    if (!arquivos.length) return;
    const lotes = await pacotes(arquivos);
    let feitos = 0;
    for (const corpo of lotes) {
      mostra(`Lendo as notas… ${Math.round((feitos / lotes.length) * 100)}%`);
      try {
        const r = await fetch('/api/portal/analises/leitura', { method: 'POST', body: corpo, credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' } });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.erro || 'Não foi possível ler agora.');
        j.notas.forEach((n) => { if (n.tipo === 'cancelamento') canceladas.add(n.chave); else if (n.chave) notas.set(n.chave, n); });
        ignorados += j.ignorados || 0;
      } catch (err) { return mostra(err.message, 'erro'); }
      feitos++;
    }
    calcula();
  }

  q('#notasSim').addEventListener('change', (ev) => { envia(ev.target.files); ev.target.value = ''; });
  const zona = q('#atalho');
  ['dragenter', 'dragover'].forEach((t) => zona.addEventListener(t, (ev) => ev.preventDefault()));
  zona.addEventListener('drop', (ev) => { ev.preventDefault(); envia(ev.dataTransfer.files); });
  ['#fFat', '#fIns'].forEach((id) => q(id).addEventListener('input', () => q(id).classList.remove('auto')));
})();
