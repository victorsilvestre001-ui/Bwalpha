// Venda rápida: linha de item em que se digita o nome do produto e o sistema sugere o tipo (NCM) e os
// campos fiscais. Usada no painel do escritório (aba Vendas) e na Área do Cliente (Cupom fiscal).
// linhaVendaRapida({ buscar(q) -> Promise<sugestoes>, aoMudar() }) devolve o elemento da linha.
// O item lido é { produtoId } (produto já cadastrado) ou { descricao, ncm } (produto novo).
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const ncmFmt = (n) => String(n || '').replace(/^(\d{4})(\d{2})(\d{2})$/, '$1.$2.$3');
  const curto = (s, n = 70) => { const t = String(s || '').split(' > ').pop(); return t.length > n ? `${t.slice(0, n)}…` : t; };
  const virgula = (v) => String(Number(v).toFixed(2)).replace('.', ',');

  window.linhaVendaRapida = function ({ buscar, aoMudar = () => {} }) {
    const div = document.createElement('div');
    div.className = 'item-venda venda-rapida';
    div.innerHTML = `<div class="vr-busca"><input class="iDesc" autocomplete="off" maxlength="120" placeholder="Digite o produto (ex.: pastilha de freio)"><div class="vr-lista" hidden></div><small class="vr-info"></small></div>
      <input class="iQtd" inputmode="decimal" value="1" title="Quantidade" aria-label="Quantidade">
      <input class="iVal" inputmode="decimal" placeholder="Valor" aria-label="Valor unitário">
      <button type="button" class="lnk perigo iX" title="Tirar">×</button>`;
    const q = (s) => div.querySelector(s);
    const ent = q('.iDesc'); const lista = q('.vr-lista'); const info = q('.vr-info');
    let escolha = null; // { tipo, produtoId?, ncm, ... }
    let sugs = [];
    let timer = null; let seq = 0;

    const mostraInfo = () => {
      if (!escolha) { info.innerHTML = ent.value.trim().length >= 2 ? '<span class="vr-falta">Escolha o tipo do produto na lista</span>' : ''; return; }
      if (escolha.tipo === 'meu') { info.innerHTML = `Produto cadastrado · NCM ${ncmFmt(escolha.ncm)}${escolha.conferir ? ' · <span class="vr-conf">escritório vai conferir</span>' : ''}`; return; }
      const s = escolha.sugestao || {};
      info.innerHTML = `Novo · NCM ${ncmFmt(escolha.ncm)} · ${esc(curto(escolha.ncmDescricao, 50))}${s.obs ? ` · ${esc(s.obs)}` : ''} <button type="button" class="lnk vr-troca">trocar</button>`;
      const t = q('.vr-troca'); if (t) t.addEventListener('mousedown', (ev) => { ev.preventDefault(); abreLista(); ent.focus(); });
    };
    const escolhe = (s, { automatico = false } = {}) => {
      escolha = s;
      if (s.tipo === 'meu') { ent.value = s.descricao; if (s.valor && !q('.iVal').value) q('.iVal').value = virgula(s.valor); }
      if (s.tipo === 'catalogo' && !automatico) ent.value = s.descricao;
      lista.hidden = true; mostraInfo(); aoMudar();
    };
    const abreLista = () => {
      if (!sugs.length) { lista.hidden = true; return; }
      lista.innerHTML = sugs.map((s, i) => `<button type="button" data-i="${i}" class="${escolha === s ? 'sel' : ''}">${
        s.tipo === 'meu' ? `<b>${esc(s.descricao)}</b><small>seu produto · ${brl(s.valor)}</small>`
        : s.tipo === 'catalogo' ? `<b>${esc(s.descricao)}</b><small>NCM ${ncmFmt(s.ncm)} · ${esc(curto(s.ncmDescricao, 60))}</small>`
        : `<b>${esc(curto(s.ncmDescricao))}</b><small>NCM ${ncmFmt(s.ncm)}${s.sugestao && s.sugestao.obs ? ` · ${esc(s.sugestao.obs)}` : ''}</small>`}</button>`).join('');
      lista.hidden = false;
      lista.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('mousedown', (ev) => { ev.preventDefault(); escolhe(sugs[+b.dataset.i]); }));
    };
    ent.addEventListener('input', () => {
      escolha = null; mostraInfo(); aoMudar();
      clearTimeout(timer);
      const texto = ent.value.trim();
      if (texto.length < 2) { sugs = []; lista.hidden = true; return; }
      timer = setTimeout(async () => {
        const meu = ++seq;
        try { sugs = await buscar(texto); } catch { sugs = []; }
        if (meu !== seq) return;
        // Já deixa escolhido o mais provável: produto igual da empresa, senão a primeira sugestão de tipo
        const igual = sugs.find((s) => s.tipo === 'meu' && s.descricao.toLowerCase() === texto.toLowerCase());
        const prim = igual || sugs[0];
        if (prim) escolhe(prim, { automatico: true });
        if (document.activeElement === ent) abreLista();
      }, 250);
    });
    ent.addEventListener('focus', abreLista);
    ent.addEventListener('blur', () => setTimeout(() => { lista.hidden = true; }, 120));
    [q('.iQtd'), q('.iVal')].forEach((i) => i.addEventListener('input', aoMudar));
    q('.iX').addEventListener('click', () => { div.remove(); aoMudar(); });
    div.lerItem = () => {
      const texto = ent.value.trim();
      if (!texto) return null;
      const base = { quantidade: q('.iQtd').value.replace(',', '.'), valor: q('.iVal').value };
      if (escolha && escolha.tipo === 'meu') return { ...base, produtoId: escolha.id };
      return { ...base, descricao: texto, ncm: escolha ? escolha.ncm : '' };
    };
    return div;
  };
  window.lerItensVendaRapida = (raiz) => Array.from(raiz.querySelectorAll('.venda-rapida')).map((d) => d.lerItem()).filter(Boolean);
})();
