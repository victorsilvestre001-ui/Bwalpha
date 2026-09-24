"""Gera loja/products.js com os produtos marcados "S" (Vou comprar) e os kits da planilha.

Uso:  python3 gerar_produtos_loja.py
Lê PRODUTOS e KITS de gerar_planilha.py, então rode depois de atualizar a planilha.
"""
import json
import re
from pathlib import Path

AQUI = Path(__file__).parent
FOTOS = AQUI.parent / 'loja' / 'img' / 'produtos'
fonte = (AQUI / 'gerar_planilha.py').read_text(encoding='utf-8')
dados = {}
exec(fonte.split('\nFONT = ')[0], dados)  # só as listas, sem gerar o .xlsx
PRODUTOS, KITS = dados['PRODUTOS'], dados['KITS']

CATEGORIAS = [
    {'id': 'maquiagem', 'name': 'Maquiagem', 'subs': ['Rosto', 'Olhos', 'Lábios', 'Sobrancelhas']},
    {'id': 'skincare', 'name': 'Skincare', 'subs': ['Limpeza e Tônicos', 'Séruns']},
    {'id': 'corpo', 'name': 'Corpo & Banho', 'subs': ['Hidratantes']},
    {'id': 'perfumes', 'name': 'Perfumes', 'subs': ['Body Splash']},
    {'id': 'cabelos', 'name': 'Cabelos', 'subs': ['Acessórios de Cabelo']},
    {'id': 'acessorios', 'name': 'Acessórios', 'subs': ['Esponjas', 'Pinças']},
    {'id': 'kits', 'name': 'Kits', 'subs': ['Kits Maquiagem', 'Kits Skincare', 'Kits Corpo e Perfume']},
]

# Produtos em destaque na vitrine e promoções reais (o "leve 3 pague 2" é aplicado no carrinho).
DESTAQUE = {'color_contour', 'blush_multifuncional', 'bf_blush_stick', 'iconic_paleta', 'splash_fem', 'kit_pincas',
            'tapioca', 'serum_vitc', 'kit4_esponjas', 'cilios_8d'}
RELAMPAGO = {'the_pink_blush', 'color_cover', 'ureia', 'body_cream_natuza', 'contorno_stick', 'serum_ah'}
LEVE3 = {'tapioca', 'color_contour', 'color_cover', 'gloss_peeloff', 'gloss_chaveiro', 'micelar_pantenol',
         'adstringente', 'tonico_glicolico', 'tatoo_brow', 'tint_brow', 'gel_sobrancelha', 'pink21_corretivo_cs5963'}
NOVO = {'bf_blush_stick', 'bf_iluminador_stick', 'bf_corretivo_stick', 'splash_men', 'kit_pincas', 'sp_mascara_36h'}

VARIACOES = {
    'cilios_8d': ['F007', 'F011', 'F012', 'F015', 'F019', 'F020', 'F022'],
    'splash_fem': ['Obsession Pink', 'Libertad', 'Sahar Al Noor', 'Royal Rose', 'Golden Vip', 'Yara Zahra', 'Good Angel'],
    'splash_men': ['Asad Black', 'Royal Black', 'Hayat Al Gold'],
    'body_cream_natuza': ['Libertad', 'Obsession Pink', 'Good Angel', 'Golden Vip'],
    'iconic_paleta': ['Cor 01', 'Cor 03'],
}

CORES = {
    'Rosto': ['#f3d1c1', '#c98a6b'], 'Olhos': ['#3a3340', '#15121a'], 'Lábios': ['#f06a8f', '#b0244d'],
    'Sobrancelhas': ['#8a5a3b', '#4a2e1c'], 'Limpeza e Tônicos': ['#d9f2ff', '#5aaed6'], 'Séruns': ['#ffd27a', '#e59a2f'],
    'Hidratantes': ['#fbe3c3', '#e0a96d'], 'Body Splash': ['#f6c1d9', '#b4235f'], 'Acessórios de Cabelo': ['#f3d1dc', '#b5838d'],
    'Esponjas': ['#ff9eb5', '#e75480'], 'Pinças': ['#d9d9e0', '#7a7a8c'],
}


def slug(chave):
    return chave.replace('_', '-')


def categoria(cat, nome):
    n = nome.lower()
    if cat.startswith('Maquiagem'):
        return 'maquiagem', cat.split('– ')[1]
    if cat == 'Skincare':
        return 'skincare', 'Séruns' if 'sérum' in n else 'Limpeza e Tônicos'
    if cat == 'Corpo':
        return 'corpo', 'Hidratantes'
    if cat == 'Perfumaria':
        return 'perfumes', 'Body Splash'
    if cat == 'Cabelos':
        return 'cabelos', 'Acessórios de Cabelo'
    return 'acessorios', 'Pinças' if 'pinça' in n else 'Esponjas'


def forma(nome, sub):
    n = nome.lower()
    regras = [('sérum', 'dropper'), ('splash', 'spray'), ('ureia', 'jar'), ('paleta', 'palette'), ('cílios postiços', 'palette'),
              ('pinça', 'brush'), ('pente', 'brush'), ('esponja', 'sponge'), ('pó', 'jar'), ('gloss', 'tube'), ('primer', 'tube'),
              ('água', 'bottle'), ('tônico', 'bottle'), ('loção', 'bottle'), ('cream', 'bottle'), ('hidratante', 'bottle'),
              ('batom', 'lipstick'), ('stick', 'lipstick'), ('bastão', 'lipstick'), ('máscara', 'lipstick'), ('tint', 'lipstick'),
              ('gel', 'tube'), ('blush líquido', 'dropper'), ('corretivo', 'tube')]
    for termo, f in regras:
        if termo in n:
            return f
    return 'jar'


def descricao(nome, marca, sub):
    base = f'{nome} da {marca}.'
    extra = {
        'Rosto': 'Para uma pele bonita no dia a dia, com textura fácil de aplicar e espalhar.',
        'Olhos': 'Para valorizar o olhar, da maquiagem leve do dia à produção da noite.',
        'Lábios': 'Cor e brilho para os lábios, prático para levar na bolsa.',
        'Sobrancelhas': 'Para sobrancelhas alinhadas e definidas o dia todo.',
        'Limpeza e Tônicos': 'Para a rotina de limpeza e preparo da pele, de manhã e à noite.',
        'Séruns': 'Sérum facial de absorção rápida para usar antes do hidratante.',
        'Hidratantes': 'Hidratação para o corpo com fragrância gostosa.',
        'Body Splash': 'Fragrância leve para usar no corpo e renovar ao longo do dia.',
    }.get(sub, 'Acessório prático para a sua rotina de beleza.')
    return f'{base} {extra}'


produtos, preco_por_chave = [], {}
for (k, nome, marca, cat, qtd, preco_forn, imin, imax, fonte_preco, venda, rec, comprar, lote, obs) in PRODUTOS:
    if comprar != 'S' or not venda:
        continue
    c, sub = categoria(cat, nome)
    tags = []
    if k in DESTAQUE: tags.append('mais-vendido')
    if k in RELAMPAGO: tags.append('relampago')
    if k in LEVE3: tags.append('leve3pague2')
    if k in NOVO: tags.append('novo')
    unidades = qtd * (1 if qtd > 1 else 12)
    p = {'id': slug(k), 'name': re.sub(r'\s*\([A-Z]{2}\d+\)$', '', nome), 'brand': marca, 'cat': c, 'sub': sub,
         'price': venda, 'stock': unidades, 'shape': forma(nome, sub), 'colors': CORES.get(sub, ['#f3d1dc', '#b5838d']),
         'tags': tags, 'desc': descricao(nome, marca, sub)}
    if k in VARIACOES:
        p['shades'] = VARIACOES[k]
    foto = FOTOS / f"{slug(k)}.jpg"
    if foto.exists():
        p['img'] = f'img/produtos/{foto.name}'
        if qtd > 1 and k != 'cilios_8d':
            p['imgNote'] = f'Foto do expositor do fabricante com {qtd} unidades. Você recebe 1 unidade.'
        elif k in VARIACOES:
            p['imgNote'] = f'Foto da versão {VARIACOES[k][0]}.'
    produtos.append(p)
    preco_por_chave[k] = venda

tipo_kit = {'Pele de Vidro': 'Kits Skincare', 'Rotina Skincare': 'Kits Skincare', 'Perfumada (splash + creme)': 'Kits Corpo e Perfume',
            'Presente Masculino (2 splash)': 'Kits Corpo e Perfume'}
for nome, comps, preco in KITS:
    if not all(c in preco_por_chave for c in comps):
        continue
    separados = round(sum(preco_por_chave[c] for c in comps), 2)
    nomes = {}
    for c in comps:
        nomes[c] = nomes.get(c, 0) + 1
    itens = [f"{n}x {next(p['name'] for p in produtos if p['id'] == slug(c))}" if n > 1 else next(p['name'] for p in produtos if p['id'] == slug(c))
             for c, n in nomes.items()]
    kit_id = 'kit-' + slug(re.sub(r'[^a-z0-9]+', '_', nome.lower()).strip('_'))
    fotos = [FOTOS / f'{slug(c)}.jpg' for c in dict.fromkeys(comps)]
    img_kit = None
    if all(f.exists() for f in fotos):
        from PIL import Image
        n = len(fotos)
        grade = 2 if n > 1 else 1
        lado = 480 // grade
        quadro = Image.new('RGB', (480, 480), 'white')
        for i, f in enumerate(fotos[:4]):
            x, y = (i % grade) * lado, (i // grade) * lado
            if n == 3 and i == 2:
                x = lado // 2
            quadro.paste(Image.open(f).resize((lado, lado)), (x, y))
        quadro.save(FOTOS / f'{kit_id}.jpg', quality=85, optimize=True)
        img_kit = f'img/produtos/{kit_id}.jpg'
    produtos.append({
        'id': kit_id,
        'name': f'Kit {nome.split(" (")[0]}', 'brand': 'Élan Beauté', 'cat': 'kits', 'sub': tipo_kit.get(nome, 'Kits Maquiagem'),
        'price': preco, 'separados': separados,
        'stock': min(next(p['stock'] for p in produtos if p['id'] == slug(c)) // n for c, n in nomes.items()),
        'shape': 'kit', 'colors': ['#ffc2d6', '#d9265f'],
        'tags': ['mais-vendido'] if preco >= 49.9 else [],
        **({'img': img_kit, 'imgNote': 'Montagem com as fotos dos produtos do kit.'} if img_kit else {}),
        'desc': 'Kit com: ' + ' + '.join(itens) + f'. Comprando separado sai R$ {separados:.2f}'.replace('.', ',') + '.',
    })

cabecalho = (AQUI.parent / 'loja' / 'products.js').read_text(encoding='utf-8').split('window.CATEGORIES')[0]
saida = (cabecalho + 'window.CATEGORIES = ' + json.dumps(CATEGORIAS, ensure_ascii=False, indent=2) + ';\n\n'
         + '// Gerado por analise-fornecedor/gerar_produtos_loja.py a partir da planilha. Edite a planilha e rode de novo.\n'
         + 'window.PRODUCTS = ' + json.dumps(produtos, ensure_ascii=False, indent=2) + ';\n')
(AQUI.parent / 'loja' / 'products.js').write_text(saida, encoding='utf-8')
print(len([p for p in produtos if p['cat'] != 'kits']), 'produtos e', len([p for p in produtos if p['cat'] == 'kits']), 'kits')
