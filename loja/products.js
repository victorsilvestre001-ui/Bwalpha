// Catálogo da loja. Troque nomes, preços e imagens pelos seus produtos reais.
// `img` é opcional: sem ela, a loja desenha uma ilustração do produto (shape + cores).
window.STORE = {
  name: 'Élan Beauté',
  tagline: 'Beleza importada',
  whatsapp: '5511999999999',
  freeShippingFrom: 199,
  pixDiscount: 0.05,
  maxInstallments: 6,
  // Fim da oferta relâmpago: meia-noite de hoje (renova todo dia).
  flashSaleEnds: (() => { const d = new Date(); d.setHours(23, 59, 59, 0); return d; })(),
  coupons: {
    BEMVINDA10: { type: 'percent', value: 10, label: '10% OFF na primeira compra' },
    ELAN20: { type: 'percent', value: 20, min: 299, label: '20% OFF acima de R$ 299' },
    FRETEGRATIS: { type: 'shipping', label: 'Frete grátis' }
  }
};

window.CATEGORIES = [
  { id: 'maquiagem', name: 'Maquiagem', subs: ['Rosto', 'Olhos', 'Lábios', 'Pó e Fixação', 'Primer'] },
  { id: 'skincare', name: 'Skincare', subs: ['Limpeza', 'Hidratantes', 'Séruns', 'Protetor Solar', 'Máscaras'] },
  { id: 'cabelos', name: 'Cabelos', subs: ['Shampoo', 'Condicionador', 'Finalizadores', 'Tratamento'] },
  { id: 'corpo', name: 'Corpo & Banho', subs: ['Hidratante Corporal', 'Body Splash', 'Sabonetes', 'Esfoliantes'] },
  { id: 'perfumes', name: 'Perfumes', subs: ['Femininos', 'Masculinos', 'Body Mist', 'Miniaturas'] },
  { id: 'unhas', name: 'Unhas', subs: ['Esmaltes', 'Tratamentos', 'Acessórios'] },
  { id: 'acessorios', name: 'Acessórios', subs: ['Pincéis', 'Esponjas', 'Nécessaires', 'Espelhos'] },
  { id: 'kits', name: 'Kits', subs: ['Kits Maquiagem', 'Kits Skincare', 'Presentes'] }
];

window.PRODUCTS = [
  { id: 'po-solto-cherry', name: 'Pó Solto Bake & Set Cherry Blossom 20g', brand: 'Velvet Lab', cat: 'maquiagem', sub: 'Pó e Fixação', price: 89.9, oldPrice: 129.9, rating: 4.9, reviews: 1284, stock: 7, shape: 'jar', colors: ['#f7c6d0', '#e88fa6'], tags: ['mais-vendido', 'relampago'], shades: ['Cherry Blossom', 'Translucent', 'Banana', 'Sand'],
    desc: 'Pó solto ultrafino para selar e "assar" a maquiagem. Tom rosado que ilumina a pele, controla a oleosidade e deixa acabamento aveludado por até 16 horas.',
    howto: 'Aplique com esponja úmida sobre o corretivo, deixe agir por 3 a 5 minutos e retire o excesso com pincel macio.',
    ingredients: 'Talc, Silica, Mica, Dimethicone, Caprylyl Glycol, Iron Oxides.' },
  { id: 'base-skin-glow', name: 'Base Líquida Skin Glow FPS 20 30ml', brand: 'Velvet Lab', cat: 'maquiagem', sub: 'Rosto', price: 119.9, oldPrice: 159.9, rating: 4.8, reviews: 842, stock: 22, shape: 'bottle', colors: ['#e9c8a8', '#b98a63'], tags: ['mais-vendido'], shades: ['01 Claro', '02 Médio', '03 Bege', '04 Canela', '05 Café'] },
  { id: 'paleta-sunset', name: 'Paleta de Sombras Sunset Dreams 18 cores', brand: 'Aurora Beauty', cat: 'maquiagem', sub: 'Olhos', price: 139.9, oldPrice: 219.9, rating: 4.9, reviews: 2311, stock: 4, shape: 'palette', colors: ['#f29e6d', '#9c3d54'], tags: ['relampago', 'importado'] },
  { id: 'batom-matte-rose', name: 'Batom Líquido Matte Velvet Rose', brand: 'Aurora Beauty', cat: 'maquiagem', sub: 'Lábios', price: 49.9, oldPrice: 69.9, rating: 4.7, reviews: 530, stock: 40, shape: 'lipstick', colors: ['#c44569', '#7d1f3a'], tags: ['leve3pague2'], shades: ['Rose', 'Nude', 'Red Kiss', 'Berry'] },
  { id: 'gloss-cristal', name: 'Lip Gloss Cristal Plump', brand: 'Kiss & Co', cat: 'maquiagem', sub: 'Lábios', price: 39.9, oldPrice: 54.9, rating: 4.6, reviews: 318, stock: 55, shape: 'tube', colors: ['#ffb3c6', '#ff6b9a'], tags: ['leve3pague2'] },
  { id: 'primer-pore', name: 'Primer Pore Blur Minimizador 30ml', brand: 'Velvet Lab', cat: 'maquiagem', sub: 'Primer', price: 79.9, oldPrice: 99.9, rating: 4.7, reviews: 611, stock: 18, shape: 'tube', colors: ['#dcd3f5', '#9a86d6'], tags: ['novo'] },
  { id: 'mascara-volume', name: 'Máscara de Cílios Mega Volume à Prova d\'Água', brand: 'Kiss & Co', cat: 'maquiagem', sub: 'Olhos', price: 59.9, oldPrice: 79.9, rating: 4.8, reviews: 977, stock: 30, shape: 'lipstick', colors: ['#2b2b2b', '#111'], tags: ['mais-vendido', 'leve3pague2'] },
  { id: 'spray-fixador', name: 'Spray Fixador Setting Mist 100ml', brand: 'Velvet Lab', cat: 'maquiagem', sub: 'Pó e Fixação', price: 69.9, oldPrice: 99.9, rating: 4.8, reviews: 1450, stock: 12, shape: 'spray', colors: ['#bfe3f2', '#6fb1cf'], tags: ['relampago'] },
  { id: 'serum-vitc', name: 'Sérum Vitamina C 15% Glow Booster 30ml', brand: 'Pure Derm', cat: 'skincare', sub: 'Séruns', price: 99.9, oldPrice: 149.9, rating: 4.9, reviews: 1893, stock: 9, shape: 'dropper', colors: ['#ffd27a', '#f39c12'], tags: ['mais-vendido', 'relampago'] },
  { id: 'hidratante-gel', name: 'Hidratante Facial Gel Ácido Hialurônico 50g', brand: 'Pure Derm', cat: 'skincare', sub: 'Hidratantes', price: 84.9, oldPrice: 109.9, rating: 4.8, reviews: 740, stock: 25, shape: 'jar', colors: ['#cdeffd', '#5bb8e0'], tags: ['novo'] },
  { id: 'protetor-50', name: 'Protetor Solar Facial Toque Seco FPS 50', brand: 'Pure Derm', cat: 'skincare', sub: 'Protetor Solar', price: 69.9, oldPrice: 89.9, rating: 4.7, reviews: 1204, stock: 60, shape: 'tube', colors: ['#fff1c1', '#f5b841'], tags: [] },
  { id: 'gel-limpeza', name: 'Gel de Limpeza Facial Suave 150ml', brand: 'Pure Derm', cat: 'skincare', sub: 'Limpeza', price: 49.9, oldPrice: 64.9, rating: 4.6, reviews: 402, stock: 70, shape: 'bottle', colors: ['#d9f5e6', '#4cbb85'], tags: ['leve3pague2'] },
  { id: 'mascara-argila', name: 'Máscara Facial Argila Rosa Detox 100g', brand: 'Pure Derm', cat: 'skincare', sub: 'Máscaras', price: 54.9, oldPrice: 74.9, rating: 4.5, reviews: 211, stock: 3, shape: 'jar', colors: ['#f8cdd3', '#d97a8a'], tags: ['outlet'] },
  { id: 'shampoo-repair', name: 'Shampoo Bond Repair Profissional 300ml', brand: 'Hair Studio', cat: 'cabelos', sub: 'Shampoo', price: 89.9, oldPrice: 119.9, rating: 4.8, reviews: 655, stock: 20, shape: 'bottle', colors: ['#e6d5f7', '#8e5cc9'], tags: ['importado'] },
  { id: 'oleo-argan', name: 'Óleo Finalizador Argan Gold 60ml', brand: 'Hair Studio', cat: 'cabelos', sub: 'Finalizadores', price: 64.9, oldPrice: 94.9, rating: 4.9, reviews: 1022, stock: 14, shape: 'dropper', colors: ['#f7d774', '#c99a2e'], tags: ['mais-vendido'] },
  { id: 'mascara-cabelo', name: 'Máscara Capilar Nutrição Intensa 250g', brand: 'Hair Studio', cat: 'cabelos', sub: 'Tratamento', price: 74.9, oldPrice: 99.9, rating: 4.7, reviews: 388, stock: 33, shape: 'jar', colors: ['#fde2c8', '#e59a5b'], tags: ['leve3pague2'] },
  { id: 'body-splash-vanilla', name: 'Body Splash Vanilla Dream 250ml', brand: 'Sweet Garden', cat: 'corpo', sub: 'Body Splash', price: 59.9, oldPrice: 89.9, rating: 4.9, reviews: 2750, stock: 11, shape: 'spray', colors: ['#fbe3c3', '#e0a96d'], tags: ['mais-vendido', 'relampago', 'importado'] },
  { id: 'hidratante-corpo', name: 'Hidratante Corporal Cherry Almond 236ml', brand: 'Sweet Garden', cat: 'corpo', sub: 'Hidratante Corporal', price: 54.9, oldPrice: 74.9, rating: 4.8, reviews: 980, stock: 45, shape: 'bottle', colors: ['#ffc2d1', '#e05780'], tags: ['leve3pague2', 'importado'] },
  { id: 'esfoliante-acucar', name: 'Esfoliante Corporal Açúcar & Coco 200g', brand: 'Sweet Garden', cat: 'corpo', sub: 'Esfoliantes', price: 44.9, oldPrice: 64.9, rating: 4.6, reviews: 276, stock: 2, shape: 'jar', colors: ['#fff6e0', '#d4a373'], tags: ['outlet'] },
  { id: 'perfume-bloom', name: 'Perfume Bloom Eau de Parfum 100ml', brand: 'Maison Lune', cat: 'perfumes', sub: 'Femininos', price: 249.9, oldPrice: 389.9, rating: 4.9, reviews: 690, stock: 6, shape: 'perfume', colors: ['#f6c1d9', '#c2185b'], tags: ['importado', 'relampago'] },
  { id: 'perfume-noir', name: 'Perfume Noir Intense Eau de Parfum 100ml', brand: 'Maison Lune', cat: 'perfumes', sub: 'Masculinos', price: 269.9, oldPrice: 399.9, rating: 4.8, reviews: 433, stock: 8, shape: 'perfume', colors: ['#5a5a6e', '#1f1f2e'], tags: ['importado'] },
  { id: 'mini-perfumes', name: 'Kit Miniaturas de Perfume 4x10ml', brand: 'Maison Lune', cat: 'perfumes', sub: 'Miniaturas', price: 129.9, oldPrice: 189.9, rating: 4.7, reviews: 301, stock: 15, shape: 'perfume', colors: ['#d7c4f2', '#7e57c2'], tags: ['novo'] },
  { id: 'esmalte-gel', name: 'Esmalte Efeito Gel Pink Candy 10ml', brand: 'Nail Pop', cat: 'unhas', sub: 'Esmaltes', price: 19.9, oldPrice: 29.9, rating: 4.6, reviews: 512, stock: 90, shape: 'nail', colors: ['#ff8fab', '#fb6f92'], tags: ['leve3pague2'] },
  { id: 'base-fortalecedora', name: 'Base Fortalecedora de Unhas 10ml', brand: 'Nail Pop', cat: 'unhas', sub: 'Tratamentos', price: 24.9, oldPrice: 34.9, rating: 4.5, reviews: 190, stock: 80, shape: 'nail', colors: ['#f1f1f1', '#cfcfcf'], tags: ['leve3pague2'] },
  { id: 'kit-pinceis', name: 'Kit 12 Pincéis Profissionais + Estojo', brand: 'Pro Tools', cat: 'acessorios', sub: 'Pincéis', price: 99.9, oldPrice: 159.9, rating: 4.8, reviews: 1120, stock: 13, shape: 'brush', colors: ['#f3d1dc', '#b5838d'], tags: ['mais-vendido'] },
  { id: 'esponja-gota', name: 'Esponja de Maquiagem Gota Soft (2 un.)', brand: 'Pro Tools', cat: 'acessorios', sub: 'Esponjas', price: 29.9, oldPrice: 44.9, rating: 4.7, reviews: 845, stock: 120, shape: 'sponge', colors: ['#ff9eb5', '#e75480'], tags: ['leve3pague2'] },
  { id: 'necessaire', name: 'Nécessaire Transparente Glam', brand: 'Pro Tools', cat: 'acessorios', sub: 'Nécessaires', price: 39.9, oldPrice: 59.9, rating: 4.5, reviews: 150, stock: 5, shape: 'bag', colors: ['#fce4ec', '#f06292'], tags: ['outlet'] },
  { id: 'kit-glow', name: 'Kit Glow Completo: Base + Pó + Fixador', brand: 'Velvet Lab', cat: 'kits', sub: 'Kits Maquiagem', price: 229.9, oldPrice: 339.7, rating: 4.9, reviews: 402, stock: 10, shape: 'kit', colors: ['#f7c6d0', '#e88fa6'], tags: ['relampago', 'mais-vendido'] },
  { id: 'kit-skincare', name: 'Kit Rotina Skincare 4 Passos', brand: 'Pure Derm', cat: 'kits', sub: 'Kits Skincare', price: 249.9, oldPrice: 364.6, rating: 4.8, reviews: 288, stock: 9, shape: 'kit', colors: ['#cdeffd', '#5bb8e0'], tags: ['novo'] },
  { id: 'kit-presente', name: 'Box Presente Sweet Garden Vanilla', brand: 'Sweet Garden', cat: 'kits', sub: 'Presentes', price: 139.9, oldPrice: 199.8, rating: 4.9, reviews: 517, stock: 16, shape: 'kit', colors: ['#fbe3c3', '#e0a96d'], tags: ['importado'] }
];
