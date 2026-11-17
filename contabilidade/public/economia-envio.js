// Recuperar impostos: envio dos XMLs/ZIPs das notas e relatório da análise.
(() => {
  const q = (s) => document.querySelector(s);
  const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const pct = (v) => `${((Number(v) || 0) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const nomeMes = (m) => `${MES[Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}`;
  const STATUS = { rascunho: 'Em montagem: envie todos os arquivos e clique em "Enviar para o contador".', em_revisao: 'Enviada. Aguardando a revisão do contador da V&J.', revisada: 'Revisada pelo contador.', em_recuperacao: 'Pedido de recuperação em andamento.', sem_credito: 'Revisada: não encontramos valor a recuperar.' };
  const SEP = '\n<!--VJ-SEP-->\n';
  const LOTE_BYTES = 4 * 1024 * 1024;
  let analise = null;

  const api = async (metodo, url, corpo, cab = {}) => {
    const r = await fetch(url, { method: metodo, headers: cab, body: corpo, credentials: 'same-origin' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Não foi possível concluir agora.');
    return j;
  };
  const erro = (msg) => { q('#relatorio').insertAdjacentHTML('afterbegin', `<div class="erro-envio">${e(msg)}</div>`); };

  async function garanteAnalise() {
    if (analise && analise.status === 'rascunho') return analise;
    analise = (await api('POST', '/api/portal/analises')).analise;
    return analise;
  }

  // Junta XMLs pequenos em lotes (menos requisições); ZIPs e arquivos grandes vão sozinhos
  async function lotes(arquivos) {
    const saida = [];
    let atual = [];
    let tam = 0;
    const fecha = () => { if (atual.length) saida.push({ nome: `${atual.length} XML(s)`, corpo: atual.join(SEP), qtd: atual.length }); atual = []; tam = 0; };
    for (const f of arquivos) {
      if (/\.zip$/i.test(f.name) || f.size > LOTE_BYTES) { saida.push({ nome: f.name, corpo: f, qtd: 1 }); continue; }
      if (!/\.xml$/i.test(f.name)) { saida.push({ nome: f.name, corpo: f, qtd: 1 }); continue; }
      const t = await f.text();
      if (tam + t.length > LOTE_BYTES) fecha();
      atual.push(t);
      tam += t.length;
    }
    fecha();
    return saida;
  }

  async function envia(lista) {
    const arquivos = [...lista].filter((f) => f.size);
    if (!arquivos.length) return;
    q('#relatorio').querySelectorAll('.erro-envio').forEach((x) => x.remove());
    try { await garanteAnalise(); } catch (err) { return erro(err.message); }
    const pacotes = await lotes(arquivos);
    const total = pacotes.reduce((t, p) => t + p.qtd, 0);
    let feitos = 0;
    let novas = 0;
    q('#progresso').hidden = false;
    const mostra = () => { q('#barra').style.width = `${Math.round((feitos / total) * 100)}%`; q('#progressoTxt').textContent = `Lendo ${feitos} de ${total} arquivo(s)… ${novas} nota(s) de venda encontradas`; };
    mostra();
    for (const p of pacotes) {
      try {
        const j = await api('POST', `/api/portal/analises/${analise.id}/arquivos`, p.corpo, { 'Content-Type': 'application/octet-stream', 'X-Nome-Arquivo': encodeURIComponent(p.nome).slice(0, 120) });
        analise = j.analise;
        novas += j.notasNovas || 0;
      } catch (err) { erro(`${p.nome}: ${err.message}`); }
      feitos += p.qtd;
      mostra();
    }
    q('#progressoTxt').textContent = `Pronto: ${total} arquivo(s) lidos, ${novas} nota(s) de venda novas.`;
    desenha();
  }

  function desenha() {
    const a = analise;
    const alvo = q('#relatorio');
    const erros = [...alvo.querySelectorAll('.erro-envio')].map((x) => x.outerHTML).join('');
    if (!a || !a.relatorio) { alvo.innerHTML = erros; return; }
    const r = a.relatorio;
    const cats = Object.entries(r.categorias || {}).sort((x, y) => y[1] - x[1]);
    const temValor = r.total > 0.5;
    alvo.innerHTML = `${erros}
      <div class="rel">
        <div class="status ${a.status === 'rascunho' ? 'rascunho' : ''}"><span>${e(STATUS[a.status] || a.status)}</span>${a.observacao ? `<span>Contador: ${e(a.observacao)}</span>` : ''}</div>
        <div class="rel-kpis">
          <div class="total"><small>Potencial a recuperar (estimado)</small><b>${brl(r.total)}</b></div>
          <div><small>PIS e Cofins monofásicos</small><b>${brl(r.pisCofins)}</b></div>
          ${r.regime === 'simples' ? `<div><small>ICMS já pago por ST</small><b>${brl(r.icms)}</b></div>` : ''}
          <div><small>Notas de venda lidas</small><b>${r.notas.toLocaleString('pt-BR')}</b></div>
          <div><small>Período</small><b>${r.periodo ? `${nomeMes(r.periodo.de)} a ${nomeMes(r.periodo.ate)}` : '—'}</b></div>
        </div>
        <p class="nota-legal">${temValor
          ? 'Este é o valor pago a mais <b>se essas receitas não foram separadas</b> na declaração do Simples (PGDAS-D). Valores sem a correção pela Selic: com ela, o valor recuperado é maior. O contador confere os extratos do PGDAS-D antes de qualquer pedido.'
          : 'Nas notas enviadas não aparecem produtos monofásicos nem com ICMS por substituição. Se você vende esses produtos, confira se enviou as notas de venda certas.'}</p>
        <div><h3>Receita por tipo de produto</h3>
          <div class="tabela-rolagem"><table><thead><tr><th>Categoria</th><th>Vendas no período</th><th>% das vendas</th></tr></thead><tbody>
          ${cats.map(([c, v]) => `<tr><td>${e(c)}</td><td>${brl(v)}</td><td>${pct(r.receita ? v / r.receita : 0)}</td></tr>`).join('') || '<tr><td colspan="3">Nenhum produto monofásico encontrado.</td></tr>'}
          ${r.receitaSt ? `<tr><td>Vendas com ICMS já pago por substituição (CSOSN 500)</td><td>${brl(r.receitaSt)}</td><td>${pct(r.receita ? r.receitaSt / r.receita : 0)}</td></tr>` : ''}
          </tbody></table></div></div>
        <div><h3>Mês a mês</h3>
          <div class="tabela-rolagem"><table><thead><tr><th>Mês</th><th>Vendas</th><th>Monofásicas</th>${r.regime === 'simples' ? '<th>Com ST</th><th>Alíquota do DAS</th>' : ''}<th>PIS/Cofins a mais</th>${r.regime === 'simples' ? '<th>ICMS a mais</th>' : ''}</tr></thead><tbody>
          ${r.linhas.map((l) => `<tr class="${l.dentroPrazo ? '' : 'prescrito'}"><td>${nomeMes(l.mes)}</td><td>${brl(l.receita)}</td><td>${brl(l.monofasica)}</td>${r.regime === 'simples' ? `<td>${brl(l.comSt)}</td><td>${pct(l.aliquotaEfetiva)}</td>` : ''}<td>${brl(l.pisCofins)}</td>${r.regime === 'simples' ? `<td>${brl(l.icms)}</td>` : ''}</tr>`).join('')}
          </tbody><tfoot><tr><td>Total (até 5 anos)</td><td>${brl(r.receita)}</td><td>${brl(r.receitaMonofasica)}</td>${r.regime === 'simples' ? `<td>${brl(r.receitaSt)}</td><td></td>` : ''}<td>${brl(r.pisCofins)}</td>${r.regime === 'simples' ? `<td>${brl(r.icms)}</td>` : ''}</tr></tfoot></table></div></div>
        ${r.produtos.length ? `<div><h3>Produtos que mais pesam</h3><div class="tabela-rolagem"><table><thead><tr><th>Produto</th><th>NCM</th><th>Categoria</th><th>Vendas</th></tr></thead><tbody>
          ${r.produtos.slice(0, 15).map((p) => `<tr><td>${e(p.descricao)}</td><td>${e(p.ncm)}</td><td>${e(p.categoria)}</td><td>${brl(p.valor)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
        ${r.avisos.length ? `<div><h3>Observações da leitura</h3><ul class="avisos">${r.avisos.map((x) => `<li>${e(x)}</li>`).join('')}</ul></div>` : ''}
        <div><h3>Próximos passos</h3><ol class="nota-legal" style="font-size:.9rem">
          <li>O contador confere os extratos do PGDAS-D de cada mês para ver se essas receitas já foram separadas.</li>
          <li>Se não foram, retificamos as declarações dos meses com valor e pedimos a restituição (ou a compensação em guias futuras).</li>
          ${r.icms > 0.5 ? '<li>A parte do ICMS é pedida à Secretaria da Fazenda do estado, que tem regras próprias.</li>' : ''}
          <li>Daqui para frente, as vendas desses produtos passam a ser declaradas separadas e o DAS fica menor todo mês.</li>
        </ol>
        <p class="nota-legal">Base legal: LC 123/2006, art. 18, §4º-A; ${r.bases.map((b) => `${e(b.categoria)}: ${e(b.base)}`).join('; ')}.</p></div>
        <details><summary>Arquivos enviados (${a.arquivos.length})</summary><ul class="lista-arq">${a.arquivos.map((f) => `<li>${e(f.nome)}: ${f.notas} nota(s)</li>`).join('')}</ul></details>
        <div class="acoes">
          ${a.status === 'rascunho' ? '<button class="btn azul" id="concluir">Enviar para o contador revisar</button>' : '<button class="btn azul" id="nova">Começar uma nova análise</button>'}
          <button class="sec" id="imprimir">Imprimir ou salvar em PDF</button>
          ${a.status === 'rascunho' ? '<button class="sec" id="descartar">Descartar e recomeçar</button>' : ''}
        </div>
      </div>`;
    q('#imprimir').onclick = () => window.print();
    if (q('#concluir')) q('#concluir').onclick = async () => {
      try { analise = (await api('POST', `/api/portal/analises/${a.id}/concluir`)).analise; desenha(); } catch (err) { erro(err.message); }
    };
    if (q('#nova')) q('#nova').onclick = async () => { analise = null; q('#relatorio').innerHTML = ''; q('#progresso').hidden = true; q('#zona').scrollIntoView({ behavior: 'smooth' }); };
    if (q('#descartar')) q('#descartar').onclick = async () => {
      if (!confirm('Apagar esta análise e os totais lidos?')) return;
      try { await api('DELETE', `/api/portal/analises/${a.id}`); analise = null; q('#relatorio').innerHTML = ''; q('#progresso').hidden = true; } catch (err) { erro(err.message); }
    };
  }

  const zona = q('#zona');
  q('#arquivos').addEventListener('change', (ev) => { envia(ev.target.files); ev.target.value = ''; });
  ['dragenter', 'dragover'].forEach((t) => zona.addEventListener(t, (ev) => { ev.preventDefault(); zona.classList.add('sobre'); }));
  ['dragleave', 'drop'].forEach((t) => zona.addEventListener(t, (ev) => { ev.preventDefault(); zona.classList.remove('sobre'); }));
  zona.addEventListener('drop', (ev) => envia(ev.dataTransfer.files));

  // Abre a análise mais recente (em montagem ou já enviada)
  api('GET', '/api/portal/analises').then(({ analises }) => {
    if (analises.length) { analise = analises[0]; desenha(); }
  }).catch(() => {});
})();
