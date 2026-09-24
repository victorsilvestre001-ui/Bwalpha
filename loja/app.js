(() => {
  const S = window.STORE;
  const CATS = window.CATEGORIES;
  const PRODUCTS = window.PRODUCTS;
  const byId = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const app = $('#app');

  // ---------- Utils ----------
  const brl = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ref = p => p.oldPrice || p.separados || 0;
  const pct = p => ref(p) > p.price ? Math.round((1 - p.price / ref(p)) * 100) : 0;
  const pix = v => Math.round(v * (1 - S.pixDiscount) * 100) / 100;
  const installment = v => {
    const n = Math.max(1, Math.min(S.maxInstallments, Math.floor(v / 20)));
    return `${n}x de ${brl(v / n)} sem juros`;
  };
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const store = {
    get(k, d) { try { const v = localStorage.getItem('elan.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('elan.' + k, JSON.stringify(v)); } catch { /* sem storage */ } }
  };
  const stars = r => '★'.repeat(Math.round(r)) + '☆'.repeat(5 - Math.round(r));

  // ---------- Ilustração dos produtos (SVG) ----------
  let svgId = 0;
  function art(p) {
    if (p.img) return `<img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy">`;
    const [a, b] = p.colors;
    const g = 'g' + (++svgId);
    const grad = `<defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>`;
    const f = `url(#${g})`;
    const shapes = {
      jar: `<rect x="22" y="30" width="56" height="14" rx="4" fill="#2b2530"/><rect x="18" y="44" width="64" height="42" rx="10" fill="${f}"/><rect x="26" y="56" width="48" height="12" rx="3" fill="#fff" opacity=".75"/>`,
      bottle: `<rect x="42" y="10" width="16" height="18" rx="3" fill="#2b2530"/><rect x="30" y="26" width="40" height="64" rx="10" fill="${f}"/><rect x="36" y="48" width="28" height="20" rx="3" fill="#fff" opacity=".75"/>`,
      palette: `<rect x="10" y="22" width="80" height="58" rx="8" fill="#2b2530"/>${[0,1,2,3,4,5].map(i => `<circle cx="${24 + (i % 3) * 26}" cy="${40 + Math.floor(i / 3) * 22}" r="9" fill="${i % 2 ? a : b}" opacity="${1 - i * .1}"/>`).join('')}`,
      lipstick: `<rect x="38" y="52" width="24" height="40" rx="3" fill="#2b2530"/><rect x="40" y="36" width="20" height="18" fill="#c9a86a"/><path d="M42 36 L42 16 Q50 6 58 14 L58 36 Z" fill="${f}"/>`,
      tube: `<path d="M32 12 H68 L62 76 H38 Z" fill="${f}"/><rect x="40" y="76" width="20" height="14" rx="2" fill="#2b2530"/><rect x="40" y="30" width="20" height="24" rx="2" fill="#fff" opacity=".7"/>`,
      spray: `<rect x="44" y="6" width="12" height="10" rx="2" fill="#2b2530"/><rect x="38" y="16" width="24" height="10" rx="2" fill="#bbb"/><rect x="30" y="26" width="40" height="66" rx="12" fill="${f}"/><rect x="36" y="50" width="28" height="18" rx="3" fill="#fff" opacity=".7"/>`,
      dropper: `<ellipse cx="50" cy="14" rx="8" ry="8" fill="#2b2530"/><rect x="42" y="18" width="16" height="14" fill="#2b2530"/><rect x="30" y="32" width="40" height="58" rx="8" fill="${f}"/><rect x="36" y="52" width="28" height="18" rx="3" fill="#fff" opacity=".7"/>`,
      perfume: `<rect x="42" y="8" width="16" height="16" rx="2" fill="#c9a86a"/><rect x="46" y="22" width="8" height="8" fill="#c9a86a"/><rect x="22" y="30" width="56" height="60" rx="14" fill="${f}"/><rect x="34" y="52" width="32" height="16" rx="2" fill="#fff" opacity=".7"/>`,
      nail: `<rect x="44" y="8" width="12" height="36" rx="4" fill="#2b2530"/><rect x="32" y="44" width="36" height="46" rx="10" fill="${f}"/>`,
      brush: `${[0,1,2].map(i => `<g transform="rotate(${-18 + i * 18} 50 90)"><rect x="46" y="40" width="8" height="50" rx="3" fill="#2b2530"/><rect x="45" y="30" width="10" height="12" fill="#c9a86a"/><path d="M44 30 Q50 6 56 30 Z" fill="${f}"/></g>`).join('')}`,
      sponge: `<path d="M50 12 C70 30 76 50 74 66 C72 82 60 90 50 90 C40 90 28 82 26 66 C24 50 30 30 50 12 Z" fill="${f}"/>`,
      bag: `<path d="M34 34 Q34 14 50 14 Q66 14 66 34" stroke="#2b2530" stroke-width="5" fill="none"/><rect x="16" y="32" width="68" height="56" rx="10" fill="${f}" opacity=".85"/>`,
      kit: `<rect x="10" y="38" width="80" height="52" rx="6" fill="${f}"/><rect x="46" y="38" width="8" height="52" fill="#fff" opacity=".8"/><path d="M50 38 C38 20 26 28 34 38 M50 38 C62 20 74 28 66 38" stroke="#fff" stroke-width="5" fill="none"/>`
    };
    return `<svg viewBox="0 0 100 100" role="img" aria-label="${esc(p.name)}">${grad}${shapes[p.shape] || shapes.jar}</svg>`;
  }

  // ---------- Estado ----------
  let cart = store.get('cart', []);
  let favs = store.get('favs', []);
  let coupon = store.get('coupon', null);
  let cep = store.get('cep', '');

  function saveCart() { store.set('cart', cart); store.set('coupon', coupon); updateBadges(); renderCart(); }
  function updateBadges() {
    $('#cartCount').textContent = cart.reduce((s, i) => s + i.qty, 0);
    $('#favCount').textContent = favs.length;
  }
  function addToCart(id, qty = 1, shade = null) {
    const p = byId[id];
    if (!p) return;
    shade = shade || (p.shades ? p.shades[0] : null);
    const line = cart.find(i => i.id === id && i.shade === shade);
    const inCart = cart.filter(i => i.id === id).reduce((s, i) => s + i.qty, 0);
    const allowed = Math.max(0, Math.min(qty, p.stock - inCart));
    if (!allowed) return toast(`Só temos ${p.stock} unidade(s) de "${p.name}" em estoque.`);
    if (line) line.qty += allowed; else cart.push({ id, shade, qty: allowed });
    saveCart();
    openCart();
  }
  function toggleFav(id) {
    favs = favs.includes(id) ? favs.filter(f => f !== id) : [...favs, id];
    store.set('favs', favs);
    updateBadges();
    $$(`[data-fav="${id}"]`).forEach(b => b.textContent = favs.includes(id) ? '♥' : '♡');
    toast(favs.includes(id) ? 'Adicionado aos favoritos ♥' : 'Removido dos favoritos');
  }

  // ---------- Promoções e totais ----------
  function shippingOptions(zip, subtotal, freeByCoupon) {
    const d = zip.replace(/\D/g, '');
    if (d.length !== 8) return null;
    const near = Number(d[0]) <= 3; // SP, RJ, ES, MG
    const free = subtotal >= S.freeShippingFrom || freeByCoupon;
    return [
      { id: 'pac', name: 'Econômico', days: near ? 6 : 10, price: free ? 0 : (near ? 19.9 : 29.9) },
      { id: 'sedex', name: 'Expresso', days: near ? 2 : 5, price: near ? 34.9 : 49.9 }
    ];
  }

  function totals(ship = 'pac') {
    const lines = cart.map(i => ({ ...i, p: byId[i.id] })).filter(i => i.p);
    const subtotal = lines.reduce((s, i) => s + i.p.price * i.qty, 0);
    // Leve 3 pague 2: a cada 3 unidades elegíveis, a mais barata sai de graça.
    const units = lines.filter(i => i.p.tags.includes('leve3pague2')).flatMap(i => Array(i.qty).fill(i.p.price)).sort((a, b) => b - a);
    const l3p2 = units.filter((_, idx) => idx % 3 === 2).reduce((s, v) => s + v, 0);
    const eligibleUnits = units.length;
    let couponDiscount = 0, couponError = '';
    const c = coupon && S.coupons[coupon];
    const afterPromo = subtotal - l3p2;
    if (c) {
      if (c.min && afterPromo < c.min) couponError = `Cupom válido para compras acima de ${brl(c.min)}.`;
      else if (c.type === 'percent') couponDiscount = afterPromo * c.value / 100;
    }
    const goods = afterPromo - couponDiscount;
    const opts = shippingOptions(cep, afterPromo, c && c.type === 'shipping' && !couponError);
    const shipOpt = opts ? (opts.find(o => o.id === ship) || opts[0]) : null;
    const shipping = shipOpt ? shipOpt.price : null;
    const total = goods + (shipping || 0);
    const pixTotal = pix(goods) + (shipping || 0);
    return { lines, subtotal, l3p2, eligibleUnits, couponDiscount, couponError, goods, opts, shipOpt, shipping, total, pixTotal };
  }

  // ---------- Countdown ----------
  function remaining() {
    let ms = S.flashSaleEnds - Date.now();
    if (ms < 0) { S.flashSaleEnds = new Date(S.flashSaleEnds.getTime() + 864e5); ms = S.flashSaleEnds - Date.now(); }
    const s = Math.floor(ms / 1000);
    return { h: Math.floor(s / 3600), m: Math.floor(s / 60) % 60, s: s % 60 };
  }
  const pad = n => String(n).padStart(2, '0');
  const countdownHTML = () => `<div class="countdown" data-countdown aria-label="Tempo restante da oferta">
    <div class="unit"><b data-h>00</b><small>horas</small></div>:<div class="unit"><b data-m>00</b><small>min</small></div>:<div class="unit"><b data-s>00</b><small>seg</small></div></div>`;
  function tick() {
    const r = remaining();
    $$('[data-countdown]').forEach(el => { $('[data-h]', el).textContent = pad(r.h); $('[data-m]', el).textContent = pad(r.m); $('[data-s]', el).textContent = pad(r.s); });
  }
  setInterval(tick, 1000);

  // ---------- Componentes ----------
  function tagsHTML(p) {
    const t = pct(p) ? [`<span class="tag tag-off">-${pct(p)}%</span>`] : [];
    if (p.tags.includes('relampago')) t.push('<span class="tag tag-flash">⚡ Oferta da semana</span>');
    if (p.tags.includes('leve3pague2')) t.push('<span class="tag tag-l3">Leve 3 pague 2</span>');
    if (p.tags.includes('novo')) t.push('<span class="tag tag-new">Lançamento</span>');
    if (p.tags.includes('importado')) t.push('<span class="tag tag-imp">Importado</span>');
    return t.join('');
  }
  function card(p) {
    return `<article class="card">
      <div class="tags">${tagsHTML(p)}</div>
      <button class="fav" data-fav="${p.id}" aria-label="Favoritar">${favs.includes(p.id) ? '♥' : '♡'}</button>
      <a href="#/p/${p.id}" class="media">${art(p)}</a>
      <div class="brand">${esc(p.brand)}</div>
      <a href="#/p/${p.id}" class="name">${esc(p.name)}</a>
      ${p.reviews ? `<div class="stars">${stars(p.rating)} <small>(${p.reviews})</small></div>` : ''}
      <div class="price-block">
        ${ref(p) > p.price ? `<div class="price-old">${p.separados ? 'Separados: ' : ''}${brl(ref(p))}</div>` : ''}
        <div class="price">${brl(p.price)}</div>
        <div class="price-pix">${brl(pix(p.price))} no Pix</div>
        <div class="installments">ou ${installment(p.price)}</div>
        ${p.stock <= 10 ? `<div class="stock-low">🔥 Restam só ${p.stock} unidades</div>` : ''}
      </div>
      <button class="btn btn-primary" data-add="${p.id}">Comprar</button>
    </article>`;
  }
  const grid = list => list.length ? `<div class="grid">${list.map(card).join('')}</div>` : `<div class="empty"><div class="big">🔎</div><p>Nenhum produto encontrado.</p><a href="#/" class="btn btn-primary">Ver novidades</a></div>`;
  const rail = list => `<div class="rail">${list.map(card).join('')}</div>`;
  const byTag = t => PRODUCTS.filter(p => p.tags.includes(t));
  const catName = id => (CATS.find(c => c.id === id) || {}).name || id;
  const crumbs = items => `<nav class="breadcrumb container" aria-label="Você está em"><a href="#/">Início</a>${items.map(([l, h]) => `<span>›</span>${h ? `<a href="${h}">${esc(l)}</a>` : esc(l)}`).join('')}</nav>`;

  // ---------- Páginas ----------
  const slides = [
    { bg: 'linear-gradient(120deg,#ffe3ec,#ffc9dc)', eyebrow: '💄 Maquiagem', title: 'Maquiagem a partir de R$ 9,90', text: 'Blush, contorno, paletas e cílios com 5% OFF no Pix e frete grátis acima de R$ 199.', cta: 'Ver ofertas', href: '#/ofertas', img: 'img/banner-maquiagem.jpg', fade: '#fdb2bd', alt: 'Mulher negra aplicando sombra com pincel', ids: ['iconic-paleta', 'tapioca', 'blush-multifuncional'] },
    { bg: 'linear-gradient(120deg,#f3f0ff,#d0bfff)', eyebrow: '🔥 Leve 3 pague 2', title: 'Monte seu kit e pague só 2', text: 'Corretivos, contornos, pó de tapioca, sobrancelha e skincare. O desconto entra sozinho no carrinho.', cta: 'Montar meu kit', href: '#/promo/leve3pague2', img: 'img/banner-batom.jpg', fade: '#a794c5', alt: 'Mulher branca passando batom líquido', ids: ['color-contour', 'gloss-peeloff', 'tint-brow'] },
    { bg: 'linear-gradient(120deg,#fff4e0,#ffd8a8)', eyebrow: '✨ Skincare', title: 'Pele de vidro com Vitamina C', text: 'Kit Pele de Vidro com 3 séruns por R$ 49,90. Frete grátis acima de R$ 199.', cta: 'Ver skincare', href: '#/c/skincare', img: 'img/banner-skincare.jpg', fade: '#c98159', alt: 'Mulher negra aplicando sérum de vitamina C', ids: ['serum-vitc', 'serum-ah', 'tonico-glicolico'] }
  ];
  let slideTimer;

  function pageHome() {
    const best = byTag('mais-vendido');
    const flash = byTag('relampago');
    const news = byTag('novo');
    const brands = [...new Set(PRODUCTS.map(p => p.brand))];
    app.innerHTML = `
      <section class="hero">
        <div class="slides" id="slides">${slides.map((s, i) => `
          <div class="slide${s.img ? ' has-photo' : ''}" style="background:${s.bg}${s.img ? `;--fade:${s.fade}` : ''}">${s.img ? `<img class="slide-photo" src="${s.img}" alt="${esc(s.alt)}"${i ? ' loading="lazy"' : ''} onerror="this.parentNode.classList.remove('has-photo');this.remove()">` : ''}<div class="container">
            <div class="slide-copy"><span class="eyebrow">${s.eyebrow}</span><h1>${s.title}</h1><p>${s.text}</p><a class="btn btn-primary btn-lg" href="${s.href}">${s.cta} →</a></div>
            <div class="slide-art">${s.ids.map(id => art(byId[id])).join('')}</div>
          </div></div>`).join('')}</div>
        <div class="dots" id="dots">${slides.map((_, i) => `<button aria-label="Banner ${i + 1}" data-slide="${i}"></button>`).join('')}</div>
      </section>

      <section class="section container">
        <div class="cat-circles">${CATS.map(c => {
          const sample = PRODUCTS.find(p => p.cat === c.id);
          return `<a href="#/c/${c.id}"><div class="circle">${sample ? art(sample) : ''}</div>${c.name}</a>`;
        }).join('')}</div>
      </section>

      <section class="section container">
        <div class="flash">
          <div class="section-head"><div><h2>⚡ Ofertas da semana</h2><p>Seleção com os melhores preços da loja</p></div></div>
          ${rail(flash)}
        </div>
      </section>

      <section class="section container">
        <div class="promo-banners">
          <a class="promo-banner" href="#/promo/leve3pague2" style="background:#e5dbff"><div><p class="eyebrow">Promoção</p><h3>Leve 3,<br>pague 2</h3><p>Em produtos selecionados</p></div><span class="btn btn-dark">Aproveitar</span><span class="big">3x2</span></a>
          <a class="promo-banner" href="#/c/kits" style="background:#ffe3ec"><div><p class="eyebrow">Kits exclusivos</p><h3>Kits mais<br>baratos</h3><p>Pague menos que comprando separado</p></div><span class="btn btn-dark">Ver kits</span><span class="big">🎁</span></a>
          <a class="promo-banner" href="#/c/perfumes" style="background:#fff3bf"><div><p class="eyebrow">Perfumaria</p><h3>Body splash<br>R$ 24,90</h3><p>10 fragrâncias</p></div><span class="btn btn-dark">Ver fragrâncias</span><span class="big">✨</span></a>
        </div>
      </section>

      <section class="section container">
        <div class="section-head"><div><h2>Destaques 🏆</h2><p>Os produtos que escolhemos para você</p></div><a class="link" href="#/ofertas">Ver todos →</a></div>
        ${rail(best)}
      </section>

      <section class="section section-soft"><div class="container">
        <div class="section-head"><div><h2>Lançamentos ✨</h2><p>Acabaram de chegar na Élan Beauté</p></div></div>
        ${rail(news)}
      </div></section>

      <section class="section container">
        <div class="section-head"><div><h2>Compre por marca</h2></div></div>
        <div class="brands">${brands.map(b => `<a href="#/marca/${encodeURIComponent(b)}">${esc(b)}</a>`).join('')}</div>
      </section>`;
    startSlider();
  }

  function startSlider() {
    let i = 0;
    const go = n => {
      i = (n + slides.length) % slides.length;
      const el = $('#slides');
      if (!el) return clearInterval(slideTimer);
      el.style.transform = `translateX(-${i * 100}%)`;
      $$('#dots button').forEach((b, j) => b.classList.toggle('on', j === i));
    };
    $$('#dots button').forEach(b => b.onclick = () => { go(+b.dataset.slide); restart(); });
    const restart = () => { clearInterval(slideTimer); slideTimer = setInterval(() => go(i + 1), 5500); };
    go(0); restart();
  }

  function pageListing({ title, subtitle = '', list, crumb, sub }) {
    const brands = [...new Set(list.map(p => p.brand))];
    const maxPrice = Math.ceil(Math.max(...list.map(p => p.price), 0) / 10) * 10;
    app.innerHTML = `${crumbs(crumb)}
      <div class="container listing">
        <aside class="filters" id="filters">
          ${sub ? `<h4>Subcategorias</h4>${sub.map(s => `<label><input type="checkbox" name="sub" value="${esc(s)}"> ${esc(s)}</label>`).join('')}` : ''}
          <h4>Marcas</h4>${brands.map(b => `<label><input type="checkbox" name="brand" value="${esc(b)}"> ${esc(b)}</label>`).join('')}
          <h4>Promoções</h4>
          <label><input type="checkbox" name="tag" value="relampago"> ⚡ Oferta da semana</label>
          <label><input type="checkbox" name="tag" value="leve3pague2"> Leve 3 pague 2</label>
          <h4>Preço até <span id="priceVal">${brl(maxPrice)}</span></h4>
          <input type="range" id="priceRange" min="10" max="${maxPrice}" step="10" value="${maxPrice}">
        </aside>
        <div>
          <div class="list-top">
            <div><h1>${esc(title)}</h1><small class="installments">${subtitle}</small></div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-outline filters-toggle" id="filtersToggle" style="padding:8px 14px">Filtrar</button>
              <select id="sort" aria-label="Ordenar">
                <option value="rel">Mais relevantes</option><option value="sold">Mais vendidos</option>
                <option value="off">Maior desconto</option><option value="low">Menor preço</option><option value="high">Maior preço</option>
              </select>
            </div>
          </div>
          <div id="results"></div>
        </div>
      </div>`;
    const apply = () => {
      const checked = n => $$(`#filters input[name=${n}]:checked`).map(i => i.value);
      const subs = checked('sub'), bs = checked('brand'), tags = checked('tag');
      const max = +$('#priceRange').value;
      $('#priceVal').textContent = brl(max);
      let r = list.filter(p => (!subs.length || subs.includes(p.sub)) && (!bs.length || bs.includes(p.brand)) && tags.every(t => p.tags.includes(t)) && p.price <= max);
      const sort = $('#sort').value;
      const sorters = { sold: (a, b) => (b.reviews || 0) - (a.reviews || 0), off: (a, b) => pct(b) - pct(a), low: (a, b) => a.price - b.price, high: (a, b) => b.price - a.price };
      if (sorters[sort]) r = [...r].sort(sorters[sort]);
      $('#results').innerHTML = `<p class="installments">${r.length} produto(s)</p>` + grid(r);
    };
    $('#filters').addEventListener('input', apply);
    $('#sort').addEventListener('change', apply);
    $('#filtersToggle').onclick = () => $('#filters').classList.toggle('open');
    apply();
  }

  function pageProduct(id) {
    const p = byId[id];
    if (!p) return pageNotFound();
    let shade = p.shades ? p.shades[0] : null;
    let qty = 1;
    const related = PRODUCTS.filter(x => x.cat === p.cat && x.id !== p.id).slice(0, 8);
    const pair = PRODUCTS.find(x => x.id !== p.id && x.cat === p.cat && x.brand === p.brand) || related[0];
    const bundleTotal = pair ? (p.price + pair.price) * 0.9 : 0;
    app.innerHTML = `${crumbs([[catName(p.cat), `#/c/${p.cat}`], [p.sub, `#/c/${p.cat}?sub=${encodeURIComponent(p.sub)}`], [p.name]])}
      <div class="container pdp">
        <div class="gallery">
          <div class="thumbs">${[0, 1, 2].map(i => `<button class="${i ? '' : 'on'}" aria-label="Imagem ${i + 1}">${art(p)}</button>`).join('')}</div>
          <div class="main-img"><div class="tags">${tagsHTML(p)}</div>${art(p)}</div>
        </div>
        <div>
          <a class="brand-link" href="#/marca/${encodeURIComponent(p.brand)}">${esc(p.brand)}</a>
          <h1>${esc(p.name)}</h1>
          ${p.reviews ? `<div class="stars">${stars(p.rating)} <small>${p.rating.toFixed(1)} · ${p.reviews} avaliações</small></div>` : ''}
          <div class="sku">Cód.: ${p.id.toUpperCase()}</div>

          <div class="pdp-price">
            ${pct(p) ? `<div><span class="price-old">${p.separados ? 'Comprando separado' : 'De'} ${brl(ref(p))}</span> <span class="save">Economize ${brl(ref(p) - p.price)} (-${pct(p)}%)</span></div>` : ''}
            <div class="price">${brl(p.price)}</div>
            <div class="installments">ou ${installment(p.price)}</div>
            <div class="pix-line"><span class="pix-badge">PIX</span><b style="color:var(--pix)">${brl(pix(p.price))}</b> com ${S.pixDiscount * 100}% de desconto</div>
          </div>

          ${p.tags.includes('leve3pague2') ? `<div class="promo-note">🎁 LEVE 3 PAGUE 2 — combine com outros produtos da promoção e o de menor valor sai grátis. <a class="link" href="#/promo/leve3pague2">Ver produtos</a></div>` : ''}

          ${p.shades ? `<div class="opt-label">Cor/Tom: <span id="shadeName">${esc(shade)}</span></div>
            <div class="shades">${p.shades.map((s, i) => `<button class="${i ? '' : 'on'}" data-shade="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}

          ${p.stock <= 10 ? `<div class="stock-low" style="font-size:14px;margin-top:12px">🔥 Corra! Restam apenas ${p.stock} unidades em estoque</div>` : '<div class="installments" style="margin-top:12px;color:var(--green)">✔ Em estoque — pronta entrega</div>'}

          <div class="buy-row">
            <div class="qty"><button data-q="-1" aria-label="Diminuir">−</button><input id="qty" value="1" inputmode="numeric" aria-label="Quantidade"><button data-q="1" aria-label="Aumentar">+</button></div>
            <button class="btn btn-primary btn-lg" id="buy">🛍️ Comprar</button>
          </div>
          <button class="btn btn-outline btn-block" data-fav="${p.id}" id="favBig">${favs.includes(p.id) ? '♥ Nos favoritos' : '♡ Adicionar aos favoritos'}</button>

          <div class="ship-calc">
            <b>🚚 Calcule o frete e prazo</b>
            <form id="shipForm"><input id="cepInput" placeholder="00000-000" inputmode="numeric" maxlength="9" value="${esc(cep)}" aria-label="CEP"><button class="btn btn-dark">Calcular</button></form>
            <div class="ship-result" id="shipResult"></div>
            <small class="installments">Frete grátis nas compras acima de ${brl(S.freeShippingFrom)}</small>
          </div>

          <div class="trust">
            <div><span>💸</span>5% OFF no Pix</div>
            <div><span>🔄</span>7 dias para troca</div>
            <div><span>🔒</span>Compra 100% segura</div>
          </div>
        </div>
      </div>

      ${pair ? `<section class="section container">
        <div class="section-head"><div><h2>Compre junto e ganhe 10% OFF</h2></div></div>
        <div class="bundle">
          <div class="item">${art(p)}<div><small>${esc(p.name)}</small><br><b>${brl(p.price)}</b></div></div>
          <span class="plus">+</span>
          <a class="item" href="#/p/${pair.id}">${art(pair)}<div><small>${esc(pair.name)}</small><br><b>${brl(pair.price)}</b></div></a>
          <div class="total"><div class="price-old">${brl(p.price + pair.price)}</div><div class="price">${brl(bundleTotal)}</div><div class="price-pix">${brl(pix(bundleTotal))} no Pix</div><button class="btn btn-primary" id="buyBundle" style="margin-top:8px">Comprar os 2</button></div>
        </div>
      </section>` : ''}

      <section class="container tabs">
        <div class="tab-btns" role="tablist">
          <button class="on" data-tab="desc">Descrição</button><button data-tab="how">Modo de uso</button><button data-tab="ing">Composição</button><button data-tab="rev">Avaliações (${p.reviews || 0})</button>
        </div>
        <div class="tab-panel" id="tabPanel"></div>
      </section>

      ${related.length ? `<section class="section container"><div class="section-head"><div><h2>Você também vai amar</h2></div></div>${rail(related)}</section>` : ''}`;

    const panels = {
      desc: `<p>${esc(p.desc || `${p.name} da ${p.brand}: beleza com preço justo.`)}</p><ul><li>Marca: ${esc(p.brand)}</li><li>Categoria: ${catName(p.cat)} › ${esc(p.sub)}</li></ul>`,
      how: `<p>${esc(p.howto || 'Aplique conforme a necessidade. Uso externo. Em caso de irritação, suspenda o uso.')}</p>`,
      ing: `<p>${esc(p.ingredients || 'Consulte a embalagem do produto para a composição completa.')}</p>`,
      rev: `${p.reviews ? `<p class="stars" style="font-size:22px">${stars(p.rating)} <b style="color:var(--text)">${p.rating.toFixed(1)}</b> <small>de 5 · ${p.reviews} avaliações</small></p>` : '<p>Este produto ainda não tem avaliações.</p>'}<p>Comprou este produto? Conte para outras clientes o que achou!</p><button class="btn btn-outline" onclick="this.textContent='Obrigada! Enviaremos um link por e-mail 💌'">Avaliar produto</button>`
    };
    const setTab = t => { $$('.tab-btns button').forEach(b => b.classList.toggle('on', b.dataset.tab === t)); $('#tabPanel').innerHTML = panels[t]; };
    $$('.tab-btns button').forEach(b => b.onclick = () => setTab(b.dataset.tab));
    setTab('desc');

    $$('[data-shade]').forEach(b => b.onclick = () => { shade = b.dataset.shade; $('#shadeName').textContent = shade; $$('[data-shade]').forEach(x => x.classList.toggle('on', x === b)); });
    const qtyInput = $('#qty');
    const setQty = v => { qty = Math.max(1, Math.min(p.stock, v || 1)); qtyInput.value = qty; };
    $$('[data-q]').forEach(b => b.onclick = () => setQty(qty + +b.dataset.q));
    qtyInput.onchange = () => setQty(parseInt(qtyInput.value, 10));
    $('#buy').onclick = () => addToCart(p.id, qty, shade);
    $('#favBig').addEventListener('click', () => setTimeout(() => { $('#favBig').textContent = favs.includes(p.id) ? '♥ Nos favoritos' : '♡ Adicionar aos favoritos'; }));
    if (pair) $('#buyBundle').onclick = () => { addToCart(p.id, 1, shade); addToCart(pair.id, 1); if (!coupon) { coupon = 'BEMVINDA10'; saveCart(); toast('Cupom BEMVINDA10 aplicado: 10% OFF!'); } };

    const showShip = () => {
      const opts = shippingOptions(cep, p.price * qty, false);
      $('#shipResult').innerHTML = opts ? opts.map(o => `<div><span>${o.name} — até ${o.days} dias úteis</span><b>${o.price ? brl(o.price) : '<span style="color:var(--green)">Grátis</span>'}</b></div>`).join('') : '';
    };
    maskCep($('#cepInput'));
    $('#shipForm').onsubmit = e => {
      e.preventDefault();
      const v = $('#cepInput').value;
      if (v.replace(/\D/g, '').length !== 8) return toast('Digite um CEP válido com 8 dígitos.');
      cep = v; store.set('cep', cep); showShip(); renderCart();
    };
    if (cep) showShip();
    tick();
    document.title = `${p.name} | Élan Beauté`;
  }

  function maskCep(input) {
    input.addEventListener('input', () => { const d = input.value.replace(/\D/g, '').slice(0, 8); input.value = d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d; });
  }

  function pageCheckout() {
    if (!cart.length) { app.innerHTML = `<div class="container empty"><div class="big">🛍️</div><h2>Sua sacola está vazia</h2><a class="btn btn-primary" href="#/ofertas">Ver ofertas</a></div>`; return; }
    let ship = 'pac', pay = 'pix';
    app.innerHTML = `${crumbs([['Sacola'], ['Finalizar compra']])}
      <form class="container checkout" id="checkoutForm">
        <div>
          <div class="box"><h3>1. Seus dados</h3><div class="fields">
            <label class="full">Nome completo<input required name="name" autocomplete="name"></label>
            <label>E-mail<input required type="email" name="email" autocomplete="email"></label>
            <label>Celular / WhatsApp<input required name="phone" inputmode="tel" autocomplete="tel"></label>
            <label class="full">CPF<input required name="cpf" inputmode="numeric" maxlength="14"></label>
          </div></div>
          <div class="box"><h3>2. Entrega</h3><div class="fields">
            <label>CEP<input required id="coCep" value="${esc(cep)}" inputmode="numeric" maxlength="9" autocomplete="postal-code"></label>
            <label>Número<input required name="num"></label>
            <label class="full">Endereço<input required name="street" autocomplete="street-address"></label>
            <label>Complemento<input name="comp"></label>
            <label>Bairro<input required name="district"></label>
          </div><div class="pay-opts" id="shipOpts" style="margin-top:14px"></div></div>
          <div class="box"><h3>3. Pagamento</h3><div class="pay-opts">
            <label><input type="radio" name="pay" value="pix" checked> <div><b>Pix — ${S.pixDiscount * 100}% OFF</b><small>Aprovação imediata. Código gerado ao finalizar.</small></div></label>
            <label><input type="radio" name="pay" value="card"> <div><b>Cartão de crédito</b><small>Até ${S.maxInstallments}x sem juros</small></div></label>
            <label><input type="radio" name="pay" value="boleto"> <div><b>Boleto bancário</b><small>Aprovação em até 2 dias úteis</small></div></label>
          </div></div>
        </div>
        <div><div class="box" style="position:sticky;top:150px"><h3>Resumo do pedido</h3><div id="coSummary"></div>
          <button class="btn btn-primary btn-block btn-lg" style="margin-top:14px">Finalizar compra 🔒</button>
          <p class="installments" style="text-align:center">Ambiente 100% seguro</p></div></div>
      </form>`;
    const draw = () => {
      const t = totals(ship);
      $('#shipOpts').innerHTML = t.opts ? t.opts.map(o => `<label><input type="radio" name="ship" value="${o.id}" ${o.id === t.shipOpt.id ? 'checked' : ''}><div><b>${o.name} — ${o.price ? brl(o.price) : 'Grátis'}</b><small>Até ${o.days} dias úteis</small></div></label>`).join('') : '<p class="installments">Informe o CEP para ver as opções de entrega.</p>';
      $$('#shipOpts input').forEach(i => i.onchange = () => { ship = i.value; draw(); });
      const final = pay === 'pix' ? t.pixTotal : t.total;
      $('#coSummary').innerHTML = t.lines.map(i => `<div class="cart-item" style="grid-template-columns:48px 1fr auto"><div class="thumb" style="width:48px;height:48px">${art(i.p)}</div><div class="nm">${i.qty}x ${esc(i.p.name)}${i.shade ? `<div class="opt">${esc(i.shade)}</div>` : ''}</div><div class="p">${brl(i.p.price * i.qty)}</div></div>`).join('') + totalsHTML(t, pay === 'pix') + `<div class="totals"><div class="grand"><span>Total${pay === 'pix' ? ' no Pix' : ''}</span><span>${brl(final)}</span></div>${pay === 'card' ? `<div><span></span><span class="installments">${installment(final)}</span></div>` : ''}</div>`;
    };
    const coCep = $('#coCep');
    maskCep(coCep);
    coCep.addEventListener('input', () => { cep = coCep.value; store.set('cep', cep); draw(); });
    $$('input[name=pay]').forEach(i => i.onchange = () => { pay = i.value; draw(); });
    $('#checkoutForm').onsubmit = e => {
      e.preventDefault();
      const t = totals(ship);
      if (!t.opts) return toast('Informe um CEP válido para calcular a entrega.');
      const order = 'BB' + Date.now().toString().slice(-7);
      const final = pay === 'pix' ? t.pixTotal : t.total;
      cart = []; coupon = null; saveCart();
      app.innerHTML = `<div class="container success"><div class="big">🎉</div><h1>Pedido ${order} recebido!</h1>
        <p>Total: <b>${brl(final)}</b> — ${pay === 'pix' ? 'pague com o Pix para confirmar' : pay === 'boleto' ? 'o boleto foi enviado para o seu e-mail' : 'pagamento em análise'}.</p>
        <p class="installments">Esta é uma loja de demonstração: conecte um gateway (Mercado Pago, Pagar.me, Stripe…) para receber pagamentos reais.</p>
        <a class="btn btn-primary" href="#/">Continuar comprando</a></div>`;
      window.scrollTo(0, 0);
    };
    draw();
  }

  function pageInfo(slug) {
    const pages = {
      sobre: ['Quem somos', 'A Élan Beauté nasceu para trazer maquiagem, skincare e perfumaria com preço justo, entrega rápida e atendimento de verdade.'],
      entrega: ['Prazos e entregas', `Enviamos para todo o Brasil. Frete grátis nas compras acima de ${brl(S.freeShippingFrom)} (modalidade econômica). Pedidos pagos até 14h são postados no mesmo dia útil.`],
      trocas: ['Trocas e devoluções', 'Você tem até 7 dias corridos após o recebimento para desistir da compra, conforme o Código de Defesa do Consumidor. Produtos com defeito podem ser trocados em até 30 dias.'],
      pagamento: ['Formas de pagamento', `Pix com ${S.pixDiscount * 100}% de desconto, cartão de crédito em até ${S.maxInstallments}x sem juros e boleto bancário.`],
      privacidade: ['Política de privacidade', 'Seus dados são usados apenas para processar pedidos e, se você autorizar, enviar ofertas. Nunca vendemos seus dados.'],
      faq: ['Dúvidas frequentes', 'Os produtos são originais? Sim, todos com nota fiscal e procedência. Como acompanho meu pedido? Enviamos o código de rastreio por e-mail e WhatsApp.']
    };
    const [title, text] = pages[slug] || ['Em breve', 'Esta página está sendo preparada.'];
    app.innerHTML = `${crumbs([[title]])}<div class="container" style="max-width:820px;padding-bottom:40px"><h1>${title}</h1><p>${text}</p></div>`;
  }

  function pageNotFound() {
    app.innerHTML = `<div class="container empty"><div class="big">😕</div><h2>Página não encontrada</h2><a class="btn btn-primary" href="#/">Voltar ao início</a></div>`;
  }

  // ---------- Carrinho ----------
  function totalsHTML(t, pixMode) {
    return `<div class="totals">
      <div><span>Subtotal</span><span>${brl(t.subtotal)}</span></div>
      ${t.l3p2 ? `<div class="discount"><span>🎁 Leve 3 pague 2</span><span>− ${brl(t.l3p2)}</span></div>` : ''}
      ${t.couponDiscount ? `<div class="discount"><span>Cupom ${esc(coupon)}</span><span>− ${brl(t.couponDiscount)}</span></div>` : ''}
      ${pixMode ? `<div class="discount"><span>Desconto Pix (${S.pixDiscount * 100}%)</span><span>− ${brl(t.goods - pix(t.goods))}</span></div>` : ''}
      <div><span>Frete</span><span>${t.shipping === null ? 'Calcular no checkout' : t.shipping === 0 ? '<b style="color:var(--green)">Grátis</b>' : brl(t.shipping)}</span></div>
    </div>`;
  }

  function renderCart() {
    const t = totals();
    const body = $('#cartBody'), foot = $('#cartFoot');
    if (!t.lines.length) {
      body.innerHTML = `<div class="empty"><div class="big">🛍️</div><p>Sua sacola está vazia.</p><p class="installments">Use o cupom <b>BEMVINDA10</b> e ganhe 10% OFF na primeira compra!</p></div>`;
      foot.innerHTML = `<button class="btn btn-primary btn-block" data-go="#/ofertas">Ver ofertas do dia</button>`;
      return;
    }
    const base = t.subtotal - t.l3p2;
    const missing = S.freeShippingFrom - base;
    const nextL3 = t.eligibleUnits % 3;
    const upsell = PRODUCTS.filter(p => !cart.some(i => i.id === p.id) && (missing > 0 ? p.price >= missing * 0.6 && p.price <= missing + 40 : p.tags.includes('leve3pague2'))).slice(0, 2);
    body.innerHTML = `
      <div class="free-ship">${missing > 0 ? `Faltam <b>${brl(missing)}</b> para você ganhar <b>FRETE GRÁTIS</b> 🚚` : '🎉 Parabéns! Você ganhou <b>FRETE GRÁTIS</b>'}
        <div class="bar"><i style="width:${Math.min(100, base / S.freeShippingFrom * 100)}%"></i></div></div>
      ${nextL3 ? `<div class="promo-note">🎁 Adicione mais ${3 - nextL3} produto(s) do <a class="link" href="#/promo/leve3pague2">Leve 3 pague 2</a> e o de menor valor sai de graça!</div>` : ''}
      ${t.lines.map((i, idx) => `<div class="cart-item">
        <a class="thumb" href="#/p/${i.p.id}">${art(i.p)}</a>
        <div><div class="nm">${esc(i.p.name)}</div>${i.shade ? `<div class="opt">Tom: ${esc(i.shade)}</div>` : ''}
          <div class="qty"><button data-cq="${idx}" data-d="-1" aria-label="Diminuir">−</button><input value="${i.qty}" readonly aria-label="Quantidade"><button data-cq="${idx}" data-d="1" aria-label="Aumentar">+</button></div>
          <button class="rm" data-rm="${idx}">remover</button></div>
        <div class="p">${brl(i.p.price * i.qty)}</div>
      </div>`).join('')}
      ${upsell.length ? `<div class="upsell"><h4>${missing > 0 ? 'Complete e ganhe frete grátis:' : 'Aproveite também:'}</h4>${upsell.map(p => `<div class="mini">${art(p)}<div>${esc(p.name)}<br><b>${brl(p.price)}</b></div><button data-add="${p.id}">+ Add</button></div>`).join('')}</div>` : ''}`;
    foot.innerHTML = `
      ${coupon ? `<div class="coupon-applied"><span>🏷️ Cupom <b>${esc(coupon)}</b> ${t.couponError ? `<br><small style="color:#e03131">${t.couponError}</small>` : 'aplicado'}</span><button data-rmcoupon>remover</button></div>`
        : `<form class="coupon-form" id="couponForm"><input placeholder="Cupom de desconto" id="couponInput" aria-label="Cupom de desconto"><button>Aplicar</button></form>`}
      ${totalsHTML(t, false)}
      <div class="totals"><div class="grand"><span>Total</span><span>${brl(t.total)}</span></div>
      <div class="pix"><span>ou no Pix</span><span>${brl(t.pixTotal)}</span></div>
      <div><span></span><span class="installments">ou ${installment(t.total)}</span></div></div>
      <button class="btn btn-primary btn-block btn-lg" data-go="#/checkout" style="margin-top:10px">Finalizar compra</button>
      <button class="btn btn-block" data-close-cart style="background:none;padding:8px">Continuar comprando</button>`;
    const form = $('#couponForm');
    if (form) form.onsubmit = e => {
      e.preventDefault();
      const code = $('#couponInput').value.trim().toUpperCase();
      if (!S.coupons[code]) return toast('Cupom inválido 😕');
      coupon = code; saveCart(); toast(`Cupom ${code} aplicado: ${S.coupons[code].label}`);
    };
  }

  function openCart() { renderCart(); $('#cartDrawer').classList.add('open'); $('#cartDrawer').setAttribute('aria-hidden', 'false'); $('#overlay').classList.add('open'); }
  function closeDrawers() { $$('.drawer').forEach(d => { d.classList.remove('open'); d.setAttribute('aria-hidden', 'true'); }); $('#overlay').classList.remove('open'); }

  // ---------- Toast / modal ----------
  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
  }

  // ---------- Navegação ----------
  function renderNav() {
    $('#catnav').innerHTML = `<ul>${CATS.map(c => `<li data-cat="${c.id}"><a href="#/c/${c.id}">${c.name}</a><div class="dropdown">${c.subs.map(s => `<a href="#/c/${c.id}?sub=${encodeURIComponent(s)}">${esc(s)}</a>`).join('')}<a href="#/c/${c.id}"><b>Ver tudo</b></a></div></li>`).join('')}<li class="hot"><a href="#/ofertas">Ofertas</a></li></ul>`;
    $('#menuBody').innerHTML = `<div class="mcat"><a href="#/ofertas" style="color:var(--primary)">🔥 Ofertas do dia</a></div><div class="mcat"><a href="#/promo/leve3pague2" style="color:var(--primary)">🎁 Leve 3 pague 2</a></div>` + CATS.map(c => `<div class="mcat"><a href="#/c/${c.id}">${c.name}</a><div class="subs">${c.subs.map(s => `<a href="#/c/${c.id}?sub=${encodeURIComponent(s)}">${esc(s)}</a>`).join('')}</div></div>`).join('') ;
  }

  function route() {
    clearInterval(slideTimer);
    closeDrawers();
    $('#searchSuggest').classList.remove('open');
    document.title = 'Élan Beauté | Maquiagem, Skincare e Perfumaria';
    const hash = location.hash.slice(1) || '/';
    const [path, qs] = hash.split('?');
    const params = new URLSearchParams(qs || '');
    const parts = path.split('/').filter(Boolean);
    $$('#catnav li').forEach(li => li.classList.toggle('active', li.dataset.cat === parts[1]));
    const [kind, arg] = parts;

    if (!kind) pageHome();
    else if (kind === 'c') {
      const c = CATS.find(x => x.id === arg);
      if (!c) return pageNotFound();
      pageListing({ title: c.name, subtitle: 'Até 50% OFF + 5% no Pix', list: PRODUCTS.filter(p => p.cat === c.id), sub: c.subs, crumb: [[c.name]] });
      const sub = params.get('sub');
      if (sub) { const box = $$('#filters input[name=sub]').find(i => i.value === sub); if (box) { box.checked = true; box.dispatchEvent(new Event('input', { bubbles: true })); } }
    }
    else if (kind === 'p') pageProduct(arg);
    else if (kind === 'ofertas') pageListing({ title: 'Ofertas 🔥', subtitle: 'Ofertas da semana, kits e leve 3 pague 2', list: PRODUCTS.filter(p => p.tags.includes('relampago') || p.tags.includes('leve3pague2') || p.cat === 'kits'), crumb: [['Ofertas']] });
    else if (kind === 'outlet') pageListing({ title: 'Outlet — últimas unidades', subtitle: 'Quando acabar, acabou!', list: PRODUCTS.filter(p => p.tags.includes('outlet') || p.stock <= 5), crumb: [['Outlet']] });
    else if (kind === 'promo' && arg === 'leve3pague2') pageListing({ title: 'Leve 3, pague 2 🎁', subtitle: 'Escolha 3 produtos e o de menor valor sai grátis', list: byTag('leve3pague2'), crumb: [['Leve 3 pague 2']] });
    else if (kind === 'marca') { const b = decodeURIComponent(arg || ''); pageListing({ title: b, list: PRODUCTS.filter(p => p.brand === b), crumb: [['Marcas'], [b]] }); }
    else if (kind === 'busca') {
      const q = params.get('q') || '';
      const n = norm(q);
      pageListing({ title: `Resultados para “${q}”`, list: PRODUCTS.filter(p => norm(`${p.name} ${p.brand} ${p.sub} ${catName(p.cat)}`).includes(n)), crumb: [['Busca']] });
    }
    else if (kind === 'favoritos') {
      const list = favs.map(id => byId[id]).filter(Boolean);
      app.innerHTML = `${crumbs([['Favoritos']])}<div class="container" style="padding-bottom:40px"><h1>Meus favoritos ♥</h1>${list.length ? grid(list) : '<div class="empty"><div class="big">♡</div><p>Você ainda não favoritou nenhum produto.</p><a class="btn btn-primary" href="#/ofertas">Ver ofertas</a></div>'}</div>`;
    }
    else if (kind === 'checkout') pageCheckout();
    else if (kind === 'conta') {
      app.innerHTML = `${crumbs([['Minha conta']])}<div class="container" style="max-width:460px;padding-bottom:40px"><div class="box"><h3>Entrar ou cadastrar</h3><form class="fields" onsubmit="event.preventDefault();this.innerHTML='<p class=full>Enviamos um link de acesso para o seu e-mail 💌</p>'"><label class="full">E-mail<input type="email" required></label><button class="btn btn-primary full">Receber link de acesso</button></form><p class="installments">Clientes cadastradas recebem ofertas exclusivas e cupons de aniversário 🎂</p></div></div>`;
    }
    else if (kind === 'info') pageInfo(arg);
    else pageNotFound();
    window.scrollTo(0, 0);
    tick();
  }

  // ---------- Busca ----------
  const searchInput = $('#searchInput'), suggest = $('#searchSuggest');
  $('#searchForm').onsubmit = e => { e.preventDefault(); const q = searchInput.value.trim(); if (q) location.hash = `#/busca?q=${encodeURIComponent(q)}`; };
  searchInput.addEventListener('input', () => {
    const n = norm(searchInput.value.trim());
    if (n.length < 2) return suggest.classList.remove('open');
    const r = PRODUCTS.filter(p => norm(`${p.name} ${p.brand}`).includes(n)).slice(0, 5);
    suggest.innerHTML = r.map(p => `<a href="#/p/${p.id}"><span class="thumb">${art(p)}</span><span>${esc(p.name)}<br><b>${brl(p.price)}</b></span></a>`).join('') || '<a>Nenhum resultado</a>';
    suggest.classList.add('open');
  });
  document.addEventListener('click', e => { if (!e.target.closest('.search')) suggest.classList.remove('open'); });

  // ---------- Eventos globais ----------
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-add],[data-fav],[data-cq],[data-rm],[data-rmcoupon],[data-go],[data-close-cart]');
    if (!t) return;
    if (t.dataset.add) { e.preventDefault(); addToCart(t.dataset.add); }
    else if (t.dataset.fav) { e.preventDefault(); toggleFav(t.dataset.fav); }
    else if (t.dataset.cq !== undefined) {
      const line = cart[+t.dataset.cq];
      const p = byId[line.id];
      const others = cart.filter(i => i.id === line.id && i !== line).reduce((s, i) => s + i.qty, 0);
      line.qty = Math.max(1, Math.min(p.stock - others, line.qty + +t.dataset.d));
      saveCart();
    }
    else if (t.dataset.rm !== undefined) { cart.splice(+t.dataset.rm, 1); saveCart(); }
    else if (t.hasAttribute('data-rmcoupon')) { coupon = null; saveCart(); }
    else if (t.dataset.go) { closeDrawers(); location.hash = t.dataset.go; }
    else if (t.hasAttribute('data-close-cart')) closeDrawers();
  });
  $('#cartBtn').onclick = openCart;
  $('#closeCart').onclick = closeDrawers;
  $('#closeMenu').onclick = closeDrawers;
  $('#overlay').onclick = closeDrawers;
  $('#menuToggle').onclick = () => { $('#menuDrawer').classList.add('open'); $('#menuDrawer').setAttribute('aria-hidden', 'false'); $('#overlay').classList.add('open'); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeDrawers(); $('#couponModal').hidden = true; } });

  const modal = $('#couponModal');
  modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('[data-close]')) { modal.hidden = true; store.set('popupSeen', true); } });
  $('#copyCoupon').onclick = () => {
    coupon = 'BEMVINDA10'; saveCart();
    try { navigator.clipboard.writeText('BEMVINDA10').catch(() => {}); } catch { /* clipboard indisponível */ }
    toast('Cupom BEMVINDA10 copiado e aplicado na sacola!');
  };
  if (!store.get('popupSeen', false)) setTimeout(() => { if (!location.hash.startsWith('#/checkout')) modal.hidden = false; }, 7000);

  $('#newsForm').onsubmit = e => {
    e.preventDefault();
    coupon = 'BEMVINDA10'; saveCart();
    e.target.innerHTML = '<p style="margin:0;font-weight:700">Prontinho! Seu cupom <u>BEMVINDA10</u> já está aplicado na sacola 💖</p>';
  };
  $('#whatsapp').href = `https://wa.me/${S.whatsapp}?text=${encodeURIComponent('Olá! Vim pelo site da Élan Beauté e gostaria de ajuda.')}`;
  $('#year').textContent = new Date().getFullYear();

  renderNav();
  updateBadges();
  renderCart();
  window.addEventListener('hashchange', route);
  route();
})();
