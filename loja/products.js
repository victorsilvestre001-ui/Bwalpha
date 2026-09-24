// Catálogo da loja. Troque nomes, preços e imagens pelos seus produtos reais.
// `img` é opcional: sem ela, a loja desenha uma ilustração do produto (shape + cores).
window.STORE = {
  name: 'Élan Beauté',
  tagline: 'Maquiagem e skincare',
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
  {
    "id": "maquiagem",
    "name": "Maquiagem",
    "subs": [
      "Rosto",
      "Olhos",
      "Lábios",
      "Sobrancelhas"
    ]
  },
  {
    "id": "skincare",
    "name": "Skincare",
    "subs": [
      "Limpeza e Tônicos",
      "Séruns"
    ]
  },
  {
    "id": "corpo",
    "name": "Corpo & Banho",
    "subs": [
      "Hidratantes"
    ]
  },
  {
    "id": "perfumes",
    "name": "Perfumes",
    "subs": [
      "Body Splash"
    ]
  },
  {
    "id": "cabelos",
    "name": "Cabelos",
    "subs": [
      "Acessórios de Cabelo"
    ]
  },
  {
    "id": "acessorios",
    "name": "Acessórios",
    "subs": [
      "Esponjas",
      "Pinças"
    ]
  },
  {
    "id": "kits",
    "name": "Kits",
    "subs": [
      "Kits Maquiagem",
      "Kits Skincare",
      "Kits Corpo e Perfume"
    ]
  }
];

// Gerado por analise-fornecedor/gerar_produtos_loja.py a partir da planilha. Edite a planilha e rode de novo.
window.PRODUCTS = [
  {
    "id": "choco-fun",
    "name": "Pó Compacto Choco Fun",
    "brand": "Fenzza",
    "cat": "maquiagem",
    "sub": "Rosto",
    "price": 14.9,
    "stock": 24,
    "shape": "jar",
    "colors": [
      "#f3d1c1",
      "#c98a6b"
    ],
    "tags": [],
    "desc": "Pó Compacto Choco Fun da Fenzza. Para uma pele bonita no dia a dia, com textura fácil de aplicar e espalhar."
  },
  {
    "id": "blush-velvet",
    "name": "Blush Matte Velvet Cheeks",
    "brand": "Dapop",
    "cat": "maquiagem",
    "sub": "Rosto",
    "price": 14.9,
    "stock": 24,
    "shape": "jar",
    "colors": [
      "#f3d1c1",
      "#c98a6b"
    ],
    "tags": [],
    "desc": "Blush Matte Velvet Cheeks da Dapop. Para uma pele bonita no dia a dia, com textura fácil de aplicar e espalhar."
  },
  {
    "id": "contorno-velvet",
    "name": "Contorno Velvet",
    "brand": "Dapop",
    "cat": "maquiagem",
    "sub": "Rosto",
    "price": 14.9,
    "stock": 24,
    "shape": "jar",
    "colors": [
      "#f3d1c1",
      "#c98a6b"
    ],
    "tags": [],
    "desc": "Contorno Velvet (DP2471) da Dapop. Para uma pele bonita no dia a dia, com textura fácil de aplicar e espalhar."
  },
  {
    "id": "ilum-velvet",
    "name": "Iluminador Velvet Glow",
    "brand": "Dapop",
    "cat": "maquiagem",
    "sub": "Rosto",
    "price": 14.9,
    "stock": 24,
    "shape": "jar",
    "colors": [
      "#f3d1c1",
      "#c98a6b"
    ],
    "tags": [],
    "desc": "Iluminador Velvet Glow da Dapop. Para uma pele bonita no dia a dia, com textura fácil de aplicar e espalhar."
  },
  {
    "id": "micelar-pantenol",
    "name": "Água Micelar Pantenol e Ác. Hialurônico 200ml",
    "brand": "Dapop",
    "cat": "skincare",
    "sub": "Limpeza e Tônicos",
    "price": 12.9,
    "stock": 12,
    "shape": "bottle",
    "colors": [
      "#d9f2ff",
      "#5aaed6"
    ],
    "tags": [
      "leve3pague2"
    ],
    "desc": "Água Micelar Pantenol e Ác. Hialurônico 200ml da Dapop. Para a rotina de limpeza e preparo da pele, de manhã e à noite."
  },
  {
    "id": "tonico-glicolico",
    "name": "Tônico Facial Ácido Glicólico 200ml",
    "brand": "Dapop",
    "cat": "skincare",
    "sub": "Limpeza e Tônicos",
    "price": 14.9,
    "stock": 12,
    "shape": "bottle",
    "colors": [
      "#d9f2ff",
      "#5aaed6"
    ],
    "tags": [
      "leve3pague2"
    ],
    "desc": "Tônico Facial Ácido Glicólico 200ml da Dapop. Para a rotina de limpeza e preparo da pele, de manhã e à noite."
  },
  {
    "id": "adstringente",
    "name": "Loção Adstringente Chá Verde 200ml",
    "brand": "Dapop",
    "cat": "skincare",
    "sub": "Limpeza e Tônicos",
    "price": 12.9,
    "stock": 12,
    "shape": "bottle",
    "colors": [
      "#d9f2ff",
      "#5aaed6"
    ],
    "tags": [
      "leve3pague2"
    ],
    "desc": "Loção Adstringente Chá Verde 200ml da Dapop. Para a rotina de limpeza e preparo da pele, de manhã e à noite."
  },
  {
    "id": "kit4-esponjas",
    "name": "Kit Esponjas Makeup Blender Puff c/4",
    "brand": "Mahav",
    "cat": "acessorios",
    "sub": "Esponjas",
    "price": 16.9,
    "stock": 12,
    "shape": "sponge",
    "colors": [
      "#ff9eb5",
      "#e75480"
    ],
    "tags": [
      "mais-vendido"
    ],
    "desc": "Kit Esponjas Makeup Blender Puff c/4 da Mahav. Acessório prático para a sua rotina de beleza."
  },
  {
    "id": "cilios-8d",
    "name": "Cílios Postiços 8D (F007/F011/F012/F015/F019/F020/F022)",
    "brand": "Sabrina Sato",
    "cat": "maquiagem",
    "sub": "Olhos",
    "price": 9.9,
    "stock": 10,
    "shape": "palette",
    "colors": [
      "#3a3340",
      "#15121a"
    ],
    "tags": [
      "mais-vendido"
    ],
    "desc": "Cílios Postiços 8D (F007/F011/F012/F015/F019/F020/F022) da Sabrina Sato. Para valorizar o olhar, da maquiagem leve do dia à produção da noite.",
    "shades": [
      "F007",
      "F011",
      "F012",
      "F015",
      "F019",
      "F020",
      "F022"
    ]
  },
  {
    "id": "serum-ah",
    "name": "Sérum Facial Ácido Hialurônico Reflection 30ml",
    "brand": "Safira",
    "cat": "skincare",
    "sub": "Séruns",
    "price": 16.9,
    "stock": 12,
    "shape": "dropper",
    "colors": [
      "#ffd27a",
      "#e59a2f"
    ],
    "tags": [
      "relampago"
    ],
    "desc": "Sérum Facial Ácido Hialurônico Reflection 30ml da Safira. Sérum facial de absorção rápida para usar antes do hidratante."
  },
  {
    "id": "serum-clareador",
    "name": "Sérum Facial Clareador Reflection 30ml",
    "brand": "Safira",
    "cat": "skincare",
    "sub": "Séruns",
    "price": 16.9,
    "stock": 12,
    "shape": "dropper",
    "colors": [
      "#ffd27a",
      "#e59a2f"
    ],
    "tags": [],
    "desc": "Sérum Facial Clareador Reflection 30ml da Safira. Sérum facial de absorção rápida para usar antes do hidratante."
  },
  {
    "id": "serum-vitc",
    "name": "Sérum Facial Vitamina C Reflection 30ml",
    "brand": "Safira",
    "cat": "skincare",
    "sub": "Séruns",
    "price": 16.9,
    "stock": 12,
    "shape": "dropper",
    "colors": [
      "#ffd27a",
      "#e59a2f"
    ],
    "tags": [
      "mais-vendido"
    ],
    "desc": "Sérum Facial Vitamina C Reflection 30ml da Safira. Sérum facial de absorção rápida para usar antes do hidratante."
  },
  {
    "id": "ureia",
    "name": "Creme Hidratante Ureia 3% 200g",
    "brand": "Safira",
    "cat": "corpo",
    "sub": "Hidratantes",
    "price": 19.9,
    "stock": 12,
    "shape": "jar",
    "colors": [
      "#fbe3c3",
      "#e0a96d"
    ],
    "tags": [
      "relampago"
    ],
    "desc": "Creme Hidratante Ureia 3% 200g da Safira. Hidratação para o corpo com fragrância gostosa."
  },
  {
    "id": "tatoo-brow",
    "name": "Máscara para Sobrancelhas Tatoo Brow",
    "brand": "Femme Paris",
    "cat": "maquiagem",
    "sub": "Sobrancelhas",
    "price": 12.9,
    "stock": 24,
    "shape": "lipstick",
    "colors": [
      "#8a5a3b",
      "#4a2e1c"
    ],
    "tags": [
      "leve3pague2"
    ],
    "desc": "Máscara para Sobrancelhas Tatoo Brow da Femme Paris. Para sobrancelhas alinhadas e definidas o dia todo."
  },
  {
    "id": "contorno-stick",
    "name": "Contorno Stick",
    "brand": "Femme Paris",
    "cat": "maquiagem",
    "sub": "Rosto",
    "price": 15.9,
    "stock": 24,
    "shape": "lipstick",
    "colors": [
      "#f3d1c1",
      "#c98a6b"
    ],
    "tags": [
      "relampago"
    ],
    "desc": "Contorno Stick da Femme Paris. Para uma pele bonita no dia a dia, com textura fácil de aplicar e espalhar."
  },
  {
    "id": "gloss-peeloff",
    "name": "Lip Gloss Peel-Off",
    "brand": "Femme Paris",
    "cat": "maquiagem",
    "sub": "Lábios",
    "price": 12.9,
    "stock": 24,
    "shape": "tube",
    "colors": [
      "#f06a8f",
      "#b0244d"
    ],
    "tags": [
      "leve3pague2"
    ],
    "desc": "Lip Gloss Peel-Off da Femme Paris. Cor e brilho para os lábios, prático para levar na bolsa."
  },
  {
    "id": "pentes",
    "name": "Conjunto de Pentes e Acessórios c/9 peças",
    "brand": "—",
    "cat": "cabelos",
    "sub": "Acessórios de Cabelo",
    "price": 16.9,
    "stock": 12,
    "shape": "brush",
    "colors": [
      "#f3d1dc",
      "#b5838d"
    ],
    "tags": [],
    "desc": "Conjunto de Pentes e Acessórios c/9 peças da —. Acessório prático para a sua rotina de beleza."
  },
  {
    "id": "tapioca",
    "name": "Pó de Tapioca Lilás Selva Neon",
    "brand": "Miss Rôse",
    "cat": "maquiagem",
    "sub": "Rosto",
    "price": 11.9,
    "stock": 15,
    "shape": "jar",
    "colors": [
      "#f3d1c1",
      "#c98a6b"
    ],
    "tags": [
      "mais-vendido",
      "leve3pague2"
    ],
    "desc": "Pó de Tapioca Lilás Selva Neon da Miss Rôse. Para uma pele bonita no dia a dia, com textura fácil de aplicar e espalhar."
  },
  {
    "id": "tint-brow",
    "name": "Tint Brow Preenche Sobrancelha",
    "brand": "Wike Make",
    "cat": "maquiagem",
    "sub": "Sobrancelhas",
    "price": 12.9,
    "stock": 24,
    "shape": "lipstick",
    "colors": [
      "#8a5a3b",
      "#4a2e1c"
    ],
    "tags": [
      "leve3pague2"
    ],
    "desc": "Tint Brow Preenche Sobrancelha da Wike Make. Para sobrancelhas alinhadas e definidas o dia todo."
  },
  {
    "id": "gel-sobrancelha",
    "name": "Gel Fixador de Sobrancelhas com Pente",
    "brand": "Wike Make",
    "cat": "maquiagem",
    "sub": "Sobrancelhas",
    "price": 12.9,
    "stock": 24,
    "shape": "brush",
    "colors": [
      "#8a5a3b",
      "#4a2e1c"
    ],
    "tags": [
      "leve3pague2"
    ],
    "desc": "Gel Fixador de Sobrancelhas com Pente da Wike Make. Para sobrancelhas alinhadas e definidas o dia todo."
  },
  {
    "id": "gloss-chaveiro",
    "name": "Lip Gloss com Chaveiro",
    "brand": "Wike Make",
    "cat": "maquiagem",
    "sub": "Lábios",
    "price": 11.9,
    "stock": 24,
    "shape": "tube",
    "colors": [
      "#f06a8f",
      "#b0244d"
    ],
    "tags": [
      "leve3pague2"
    ],
    "desc": "Lip Gloss com Chaveiro da Wike Make. Cor e brilho para os lábios, prático para levar na bolsa."
  },
  {
    "id": "body-libertad",
    "name": "Hidratante Corporal Body Cream Libertad 150ml",
    "brand": "Cap Life",
    "cat": "corpo",
    "sub": "Hidratantes",
    "price": 14.9,
    "stock": 12,
    "shape": "bottle",
    "colors": [
      "#fbe3c3",
      "#e0a96d"
    ],
    "tags": [],
    "desc": "Hidratante Corporal Body Cream Libertad 150ml da Cap Life. Hidratação para o corpo com fragrância gostosa."
  },
  {
    "id": "betterme-hidratante",
    "name": "Super Hidratante Corporal e Facial Vitamina C 150g",
    "brand": "Better Me",
    "cat": "corpo",
    "sub": "Hidratantes",
    "price": 16.9,
    "stock": 12,
    "shape": "bottle",
    "colors": [
      "#fbe3c3",
      "#e0a96d"
    ],
    "tags": [],
    "desc": "Super Hidratante Corporal e Facial Vitamina C 150g da Better Me. Hidratação para o corpo com fragrância gostosa."
  },
  {
    "id": "pink21-all-day",
    "name": "Batom Líquido Efeito Matte All Day",
    "brand": "Pink 21",
    "cat": "maquiagem",
    "sub": "Lábios",
    "price": 14.9,
    "stock": 48,
    "shape": "lipstick",
    "colors": [
      "#f06a8f",
      "#b0244d"
    ],
    "tags": [],
    "desc": "Batom Líquido Efeito Matte All Day da Pink 21. Cor e brilho para os lábios, prático para levar na bolsa."
  },
  {
    "id": "splash-fem",
    "name": "Body Splash 120ml femininos (7 fragrâncias)",
    "brand": "Natuza",
    "cat": "perfumes",
    "sub": "Body Splash",
    "price": 24.9,
    "stock": 12,
    "shape": "spray",
    "colors": [
      "#f6c1d9",
      "#b4235f"
    ],
    "tags": [
      "mais-vendido"
    ],
    "desc": "Body Splash 120ml femininos (7 fragrâncias) da Natuza. Fragrância leve para usar no corpo e renovar ao longo do dia.",
    "shades": [
      "Obsession Pink",
      "Libertad",
      "Sahar Al Noor",
      "Royal Rose",
      "Golden Vip",
      "Yara Zahra",
      "Good Angel"
    ]
  },
  {
    "id": "splash-men",
    "name": "Body Splash For Men 120ml (3 fragrâncias)",
    "brand": "Natuza",
    "cat": "perfumes",
    "sub": "Body Splash",
    "price": 24.9,
    "stock": 12,
    "shape": "spray",
    "colors": [
      "#f6c1d9",
      "#b4235f"
    ],
    "tags": [
      "novo"
    ],
    "desc": "Body Splash For Men 120ml (3 fragrâncias) da Natuza. Fragrância leve para usar no corpo e renovar ao longo do dia.",
    "shades": [
      "Asad Black",
      "Royal Black",
      "Hayat Al Gold"
    ]
  },
  {
    "id": "body-cream-natuza",
    "name": "Hidratante Body Cream 120ml (4 fragrâncias)",
    "brand": "Natuza",
    "cat": "corpo",
    "sub": "Hidratantes",
    "price": 22.9,
    "stock": 12,
    "shape": "bottle",
    "colors": [
      "#fbe3c3",
      "#e0a96d"
    ],
    "tags": [
      "relampago"
    ],
    "desc": "Hidratante Body Cream 120ml (4 fragrâncias) da Natuza. Hidratação para o corpo com fragrância gostosa.",
    "shades": [
      "Libertad",
      "Obsession Pink",
      "Good Angel",
      "Golden Vip"
    ]
  },
  {
    "id": "pink21-primer-hidro",
    "name": "Primer Hidratante Hidro 45ml",
    "brand": "Pink 21",
    "cat": "maquiagem",
    "sub": "Rosto",
    "price": 14.9,
    "stock": 12,
    "shape": "tube",
    "colors": [
      "#f3d1c1",
      "#c98a6b"
    ],
    "tags": [],
    "desc": "Primer Hidratante Hidro 45ml (CS6372) da Pink 21. Para uma pele bonita no dia a dia, com textura fácil de aplicar e espalhar."
  },
  {
    "id": "amora-blush-bastao",
    "name": "Blush em Bastão Amora",
    "brand": "Pink 21",
    "cat": "maquiagem",
    "sub": "Rosto",
    "price": 14.9,
    "stock": 24,
    "shape": "lipstick",
    "colors": [
      "#f3d1c1",
      "#c98a6b"
    ],
    "tags": [],
    "desc": "Blush em Bastão Amora da Pink 21. Para uma pele bonita no dia a dia, com textura fácil de aplicar e espalhar."
  },
  {
    "id": "color-contour",
    "name": "Contorno em Bastão Color Contour",
    "brand": "Pink 21",
    "cat": "maquiagem",
    "sub": "Rosto",
    "price": 12.9,
    "stock": 48,
    "shape": "lipstick",
    "colors": [
      "#f3d1c1",
      "#c98a6b"
    ],
    "tags": [
      "mais-vendido",
      "leve3pague2"
    ],
    "desc": "Contorno em Bastão Color Contour da Pink 21. Para uma pele bonita no dia a dia, com textura fácil de aplicar e espalhar."
  },
  {
    "id": "the-pink-blush",
    "name": "Blush Líquido The Pink Multiuso",
    "brand": "Pink 21",
    "cat": "maquiagem",
    "sub": "Rosto",
    "price": 17.9,
    "stock": 24,
    "shape": "dropper",
    "colors": [
      "#f3d1c1",
      "#c98a6b"
    ],
    "tags": [
      "relampago"
    ],
    "desc": "Blush Líquido The Pink Multiuso da Pink 21. Para uma pele bonita no dia a dia, com textura fácil de aplicar e espalhar."
  },
  {
    "id": "iconic-paleta",
    "name": "Paleta de Sombras The Iconic (Cor 01 e Cor 03)",
    "brand": "Pink 21",
    "cat": "maquiagem",
    "sub": "Olhos",
    "price": 19.9,
    "stock": 12,
    "shape": "palette",
    "colors": [
      "#3a3340",
      "#15121a"
    ],
    "tags": [
      "mais-vendido"
    ],
    "desc": "Paleta de Sombras The Iconic (Cor 01 e Cor 03) da Pink 21. Para valorizar o olhar, da maquiagem leve do dia à produção da noite.",
    "shades": [
      "Cor 01",
      "Cor 03"
    ]
  },
  {
    "id": "pink21-corretivo-cs5963",
    "name": "Corretivo Líquido",
    "brand": "Pink 21",
    "cat": "maquiagem",
    "sub": "Rosto",
    "price": 12.9,
    "stock": 24,
    "shape": "tube",
    "colors": [
      "#f3d1c1",
      "#c98a6b"
    ],
    "tags": [
      "leve3pague2"
    ],
    "desc": "Corretivo Líquido (CS5963) da Pink 21. Para uma pele bonita no dia a dia, com textura fácil de aplicar e espalhar."
  },
  {
    "id": "color-cover",
    "name": "Corretivo em Bastão Color Cover",
    "brand": "Pink 21",
    "cat": "maquiagem",
    "sub": "Rosto",
    "price": 12.9,
    "stock": 48,
    "shape": "lipstick",
    "colors": [
      "#f3d1c1",
      "#c98a6b"
    ],
    "tags": [
      "relampago",
      "leve3pague2"
    ],
    "desc": "Corretivo em Bastão Color Cover da Pink 21. Para uma pele bonita no dia a dia, com textura fácil de aplicar e espalhar."
  },
  {
    "id": "blush-multifuncional",
    "name": "Blush Líquido Multifuncional",
    "brand": "Pink 21",
    "cat": "maquiagem",
    "sub": "Rosto",
    "price": 15.9,
    "stock": 24,
    "shape": "dropper",
    "colors": [
      "#f3d1c1",
      "#c98a6b"
    ],
    "tags": [
      "mais-vendido"
    ],
    "desc": "Blush Líquido Multifuncional da Pink 21. Para uma pele bonita no dia a dia, com textura fácil de aplicar e espalhar."
  },
  {
    "id": "sp-mascara-36h",
    "name": "Máscara para Cílios 36h Curva e Volume",
    "brand": "Super Poderes",
    "cat": "maquiagem",
    "sub": "Olhos",
    "price": 12.9,
    "stock": 24,
    "shape": "lipstick",
    "colors": [
      "#3a3340",
      "#15121a"
    ],
    "tags": [
      "novo"
    ],
    "desc": "Máscara para Cílios 36h Curva e Volume da Super Poderes. Para valorizar o olhar, da maquiagem leve do dia à produção da noite."
  },
  {
    "id": "bf-iluminador-stick",
    "name": "Iluminador Stick Multifuncional",
    "brand": "Bellafemme",
    "cat": "maquiagem",
    "sub": "Rosto",
    "price": 19.9,
    "stock": 24,
    "shape": "lipstick",
    "colors": [
      "#f3d1c1",
      "#c98a6b"
    ],
    "tags": [
      "novo"
    ],
    "desc": "Iluminador Stick Multifuncional da Bellafemme. Para uma pele bonita no dia a dia, com textura fácil de aplicar e espalhar."
  },
  {
    "id": "bf-corretivo-stick",
    "name": "Corretivo Stick Multifuncional",
    "brand": "Bellafemme",
    "cat": "maquiagem",
    "sub": "Rosto",
    "price": 19.9,
    "stock": 24,
    "shape": "lipstick",
    "colors": [
      "#f3d1c1",
      "#c98a6b"
    ],
    "tags": [
      "novo"
    ],
    "desc": "Corretivo Stick Multifuncional da Bellafemme. Para uma pele bonita no dia a dia, com textura fácil de aplicar e espalhar."
  },
  {
    "id": "bf-blush-stick",
    "name": "Blush Stick Multifuncional",
    "brand": "Bellafemme",
    "cat": "maquiagem",
    "sub": "Rosto",
    "price": 19.9,
    "stock": 24,
    "shape": "lipstick",
    "colors": [
      "#f3d1c1",
      "#c98a6b"
    ],
    "tags": [
      "mais-vendido",
      "novo"
    ],
    "desc": "Blush Stick Multifuncional (BF10197) da Bellafemme. Para uma pele bonita no dia a dia, com textura fácil de aplicar e espalhar."
  },
  {
    "id": "kit-pincas",
    "name": "Kit de Pinças para Sobrancelha (4 pinças)",
    "brand": "Ruby Anjo",
    "cat": "acessorios",
    "sub": "Pinças",
    "price": 19.9,
    "stock": 12,
    "shape": "brush",
    "colors": [
      "#d9d9e0",
      "#7a7a8c"
    ],
    "tags": [
      "mais-vendido",
      "novo"
    ],
    "desc": "Kit de Pinças para Sobrancelha (4 pinças) da Ruby Anjo. Acessório prático para a sua rotina de beleza."
  },
  {
    "id": "kit-pele-de-vidro",
    "name": "Kit Pele de Vidro",
    "brand": "Élan Beauté",
    "cat": "kits",
    "sub": "Kits Skincare",
    "price": 49.9,
    "separados": 50.7,
    "stock": 12,
    "shape": "kit",
    "colors": [
      "#ffc2d6",
      "#d9265f"
    ],
    "tags": [
      "mais-vendido"
    ],
    "desc": "Kit com: Sérum Facial Ácido Hialurônico Reflection 30ml + Sérum Facial Vitamina C Reflection 30ml + Sérum Facial Clareador Reflection 30ml, Comprando separado sai R$ 50,70."
  },
  {
    "id": "kit-pele-perfeita",
    "name": "Kit Pele Perfeita",
    "brand": "Élan Beauté",
    "cat": "kits",
    "sub": "Kits Maquiagem",
    "price": 49.9,
    "separados": 56.6,
    "stock": 15,
    "shape": "kit",
    "colors": [
      "#ffc2d6",
      "#d9265f"
    ],
    "tags": [
      "mais-vendido"
    ],
    "desc": "Kit com: Blush Matte Velvet Cheeks + Contorno Velvet + Iluminador Velvet Glow + Pó de Tapioca Lilás Selva Neon, Comprando separado sai R$ 56,60."
  },
  {
    "id": "kit-rotina-skincare",
    "name": "Kit Rotina Skincare",
    "brand": "Élan Beauté",
    "cat": "kits",
    "sub": "Kits Skincare",
    "price": 39.9,
    "separados": 40.7,
    "stock": 12,
    "shape": "kit",
    "colors": [
      "#ffc2d6",
      "#d9265f"
    ],
    "tags": [],
    "desc": "Kit com: Água Micelar Pantenol e Ác. Hialurônico 200ml + Tônico Facial Ácido Glicólico 200ml + Loção Adstringente Chá Verde 200ml, Comprando separado sai R$ 40,70."
  },
  {
    "id": "kit-olhar-poderoso",
    "name": "Kit Olhar Poderoso",
    "brand": "Élan Beauté",
    "cat": "kits",
    "sub": "Kits Maquiagem",
    "price": 44.9,
    "separados": 55.5,
    "stock": 3,
    "shape": "kit",
    "colors": [
      "#ffc2d6",
      "#d9265f"
    ],
    "tags": [],
    "desc": "Kit com: 3x Cílios Postiços 8D (F007/F011/F012/F015/F019/F020/F022) + Máscara para Cílios 36h Curva e Volume + Máscara para Sobrancelhas Tatoo Brow, Comprando separado sai R$ 55,50."
  },
  {
    "id": "kit-sobrancelha-perfeita",
    "name": "Kit Sobrancelha Perfeita",
    "brand": "Élan Beauté",
    "cat": "kits",
    "sub": "Kits Maquiagem",
    "price": 44.9,
    "separados": 58.6,
    "stock": 12,
    "shape": "kit",
    "colors": [
      "#ffc2d6",
      "#d9265f"
    ],
    "tags": [],
    "desc": "Kit com: Tint Brow Preenche Sobrancelha + Gel Fixador de Sobrancelhas com Pente + Máscara para Sobrancelhas Tatoo Brow + Kit de Pinças para Sobrancelha (4 pinças), Comprando separado sai R$ 58,60."
  },
  {
    "id": "kit-perfumada-splash-creme",
    "name": "Kit Perfumada",
    "brand": "Élan Beauté",
    "cat": "kits",
    "sub": "Kits Corpo e Perfume",
    "price": 44.9,
    "separados": 47.8,
    "stock": 12,
    "shape": "kit",
    "colors": [
      "#ffc2d6",
      "#d9265f"
    ],
    "tags": [],
    "desc": "Kit com: Body Splash 120ml femininos (7 fragrâncias) + Hidratante Body Cream 120ml (4 fragrâncias), Comprando separado sai R$ 47,80."
  },
  {
    "id": "kit-presente-masculino-2-splash",
    "name": "Kit Presente Masculino",
    "brand": "Élan Beauté",
    "cat": "kits",
    "sub": "Kits Corpo e Perfume",
    "price": 44.9,
    "separados": 49.8,
    "stock": 6,
    "shape": "kit",
    "colors": [
      "#ffc2d6",
      "#d9265f"
    ],
    "tags": [],
    "desc": "Kit com: 2x Body Splash For Men 120ml (3 fragrâncias), Comprando separado sai R$ 49,80."
  },
  {
    "id": "kit-make-completa",
    "name": "Kit Make Completa",
    "brand": "Élan Beauté",
    "cat": "kits",
    "sub": "Kits Maquiagem",
    "price": 59.9,
    "separados": 65.6,
    "stock": 12,
    "shape": "kit",
    "colors": [
      "#ffc2d6",
      "#d9265f"
    ],
    "tags": [
      "mais-vendido"
    ],
    "desc": "Kit com: Paleta de Sombras The Iconic (Cor 01 e Cor 03) + Blush Líquido The Pink Multiuso + Contorno em Bastão Color Contour + Primer Hidratante Hidro 45ml, Comprando separado sai R$ 65,60."
  },
  {
    "id": "kit-pele-pink-21",
    "name": "Kit Pele Pink 21",
    "brand": "Élan Beauté",
    "cat": "kits",
    "sub": "Kits Maquiagem",
    "price": 49.9,
    "separados": 56.6,
    "stock": 12,
    "shape": "kit",
    "colors": [
      "#ffc2d6",
      "#d9265f"
    ],
    "tags": [
      "mais-vendido"
    ],
    "desc": "Kit com: Corretivo em Bastão Color Cover + Contorno em Bastão Color Contour + Blush Líquido Multifuncional + Primer Hidratante Hidro 45ml, Comprando separado sai R$ 56,60."
  },
  {
    "id": "kit-trio-stick-bellafemme",
    "name": "Kit Trio Stick Bellafemme",
    "brand": "Élan Beauté",
    "cat": "kits",
    "sub": "Kits Maquiagem",
    "price": 54.9,
    "separados": 59.7,
    "stock": 24,
    "shape": "kit",
    "colors": [
      "#ffc2d6",
      "#d9265f"
    ],
    "tags": [
      "mais-vendido"
    ],
    "desc": "Kit com: Blush Stick Multifuncional + Iluminador Stick Multifuncional + Corretivo Stick Multifuncional, Comprando separado sai R$ 59,70."
  }
];
