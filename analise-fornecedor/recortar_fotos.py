"""Recorta as fotos dos produtos a partir dos prints do site do fornecedor.

Uso:  python3 recortar_fotos.py <pasta_dos_prints>
Salva em loja/img/produtos/<id>.jpg (quadrado, fundo branco, 480x480).
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

PASTA = Path(sys.argv[1])
SAIDA = Path(__file__).parent.parent / 'loja' / 'img' / 'produtos'
SAIDA.mkdir(parents=True, exist_ok=True)

# chave do produto: (print, coluna, qual foto de cima para baixo naquela coluna)
MAPA = {
    'choco_fun': ('73a7c219', 'L', 0), 'blush_velvet': ('73a7c219', 'R', 0), 'contorno_velvet': ('52bf97bd', 'R', 0),
    'ilum_velvet': ('52bf97bd', 'L', 1), 'micelar_pantenol': ('6d13e91b', 'L', 0), 'tonico_glicolico': ('6d13e91b', 'R', 0),
    'adstringente': ('6d13e91b', 'R', 1), 'kit4_esponjas': ('223ca22a', 'L', 1), 'cilios_8d': ('3b377d7e', 'R', 0),
    'serum_ah': ('7fa5bef9', 'L', 1), 'serum_clareador': ('7fa5bef9', 'R', 1), 'serum_vitc': ('907c91cc', 'L', 0),
    'ureia': ('907c91cc', 'R', 0), 'tatoo_brow': ('63987125', 'L', 1), 'contorno_stick': ('63987125', 'R', 1),
    'gloss_peeloff': ('86c0815b', 'L', 0), 'pentes': ('86c0815b', 'R', 0), 'tapioca': ('86c0815b', 'R', 1),
    'tint_brow': ('49de5b3a', 'L', 0), 'gel_sobrancelha': ('49de5b3a', 'R', 0), 'gloss_chaveiro': ('a862624b', 'R', 0),
    'body_libertad': ('a862624b', 'R', 1), 'betterme_hidratante': ('9ca10203', 'L', 0), 'pink21_all_day': ('708e8344', 'L', 0),
    'splash_fem': ('708e8344', 'R', 1), 'splash_men': ('9d0de1b4', 'R', 1), 'body_cream_natuza': ('3ffbc8b6', 'R', 0),
    'pink21_primer_hidro': ('87ca1707', 'L', 0), 'amora_blush_bastao': ('87ca1707', 'L', 1), 'color_contour': ('9d02a915', 'R', 0),
    'the_pink_blush': ('302954f8', 'L', 0), 'iconic_paleta': ('302954f8', 'R', 1), 'pink21_corretivo_cs5963': ('34142da8', 'R', 0),
    'color_cover': ('d38fc4dd', 'L', 0), 'blush_multifuncional': ('d38fc4dd', 'R', 1), 'sp_mascara_36h': ('193c7985', 'R', 0),
    'bf_iluminador_stick': ('9a5bed30', 'R', 0), 'bf_corretivo_stick': ('9a5bed30', 'L', 1), 'bf_blush_stick': ('9a5bed30', 'R', 1),
    'kit_pincas': ('f8da4879', 'L', 0),
}
COLUNAS = {'L': (40, 610), 'R': (690, 1250)}
TOPO = 470  # abaixo da barra de busca do site


def claro(px):
    r, g, b = px[:3]
    return r > 238 and g > 238 and b > 238


def apagar_botoes(img):
    """Pinta de branco os botões flutuantes (WhatsApp e voltar ao topo) do canto direito."""
    w, h = img.size
    d = ImageDraw.Draw(img)
    px = img.load()
    for y in range(TOPO, h, 4):
        for x in (1180,):
            r, g, b = px[x, y][:3]
            if (r > 200 and g < 110 and b < 110) or (g > 110 and r < 90 and b > 100 and b < 170):
                d.ellipse((x - 105, y - 105, x + 105, y + 105), fill=(255, 255, 255))
    return img


def faixas(img, x0, x1):
    """Faixas verticais com conteúdo (linhas não brancas) dentro da coluna."""
    px = img.load()
    linhas = []
    for y in range(TOPO, img.size[1]):
        n = sum(1 for x in range(x0, x1, 6) if not claro(px[x, y]))
        linhas.append(n > 1)
    bandas, ini, vazio = [], None, 0
    for i, cheio in enumerate(linhas):
        if cheio:
            if ini is None:
                ini = i
            vazio = 0
        elif ini is not None:
            vazio += 1
            if vazio > 18:
                bandas.append((ini + TOPO, i - vazio + TOPO))
                ini, vazio = None, 0
    if ini is not None:
        bandas.append((ini + TOPO, len(linhas) + TOPO))
    return [b for b in bandas if b[1] - b[0] > 170]


def caixa(img, x0, x1, y0, y1):
    px = img.load()
    xs = [x for x in range(x0, x1) if any(not claro(px[x, y]) for y in range(y0, y1, 5))]
    return (min(xs), y0, max(xs) + 1, y1) if xs else (x0, y0, x1, y1)


ok = []
for chave, (arq, col, idx) in MAPA.items():
    img = Image.open(PASTA / f'{arq}-image.png').convert('RGB')
    img = apagar_botoes(img)
    x0, x1 = COLUNAS[col]
    bandas = faixas(img, x0, x1)
    if idx >= len(bandas):
        print('SEM FOTO', chave, bandas)
        continue
    y0, y1 = bandas[idx]
    b = caixa(img, x0, x1, y0, y1)
    recorte = img.crop(b)
    lado = int(max(recorte.size) * 1.1)
    quadro = Image.new('RGB', (lado, lado), 'white')
    quadro.paste(recorte, ((lado - recorte.size[0]) // 2, (lado - recorte.size[1]) // 2))
    quadro.resize((480, 480), Image.LANCZOS).save(SAIDA / f"{chave.replace('_', '-')}.jpg", quality=85, optimize=True)
    ok.append(chave)
print(len(ok), 'fotos salvas em', SAIDA)
