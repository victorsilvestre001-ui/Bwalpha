"""Gera a planilha de análise dos produtos do fornecedor Bem Mulher.

Para adicionar produtos de novos prints, acrescente linhas em PRODUTOS
(com o número do lote) e rode:  python3 gerar_planilha.py
"""
from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.formatting.rule import ColorScaleRule, CellIsRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

SAIDA = 'analise-bem-mulher.xlsx'

# (chave, produto, marca, categoria, qtd_caixa, preco_fornecedor, internet_min, internet_max,
#  fonte_preco, preco_venda, recomendacao, comprar, lote, observacao)
# preco_fornecedor = preço exibido no site (caixa inteira quando qtd_caixa > 1).
# fonte_preco: "Confirmado" = achado à venda na internet; "Estimado" = por produtos parecidos.
PRODUTOS = [
    # Lote 1
    ('choco_fun', 'Pó Compacto Choco Fun', 'Fenzza', 'Maquiagem – Rosto', 24, 156.50, 14.99, 14.99, 'Estimado', 14.90, 'Comprar', 'S', 1, 'Referência: Pó Solto Choco Fun R$ 14,99'),
    ('blush_velvet', 'Blush Matte Velvet Cheeks', 'Dapop', 'Maquiagem – Rosto', 24, 161.70, 12.00, 15.90, 'Estimado', 14.90, 'Comprar (kit Pele Perfeita)', 'S', 1, 'Linha nova; referência: outros blushes Dapop'),
    ('blush_glow_velvet', 'Blush Glow Velvet Cheeks', 'Dapop', 'Maquiagem – Rosto', 24, None, 12.00, 15.90, 'Estimado', 14.90, 'Confirmar preço', 'N', 1, 'Preço não apareceu no print'),
    ('po_soft_focus', 'Pó Translúcido Solto Soft Focus', 'Dapop', 'Maquiagem – Rosto', 24, None, None, None, 'Estimado', None, 'Confirmar preço', 'N', 1, 'Preço não apareceu no print'),
    ('bronzer_velvet', 'Bronzer Velvet (DP2470)', 'Dapop', 'Maquiagem – Rosto', 24, 161.70, 12.00, 15.90, 'Estimado', 14.90, 'Opcional', 'N', 1, ''),
    ('contorno_velvet', 'Contorno Velvet (DP2471)', 'Dapop', 'Maquiagem – Rosto', 24, 161.70, 12.00, 15.90, 'Estimado', 14.90, 'Comprar (kit Pele Perfeita)', 'S', 1, ''),
    ('ilum_velvet', 'Iluminador Velvet Glow', 'Dapop', 'Maquiagem – Rosto', 24, 163.70, 15.90, 15.90, 'Estimado', 14.90, 'Comprar (kit Pele Perfeita)', 'S', 1, ''),
    ('skin_filter', 'Pó Facial Matificante Skin Filter', 'Dapop', 'Maquiagem – Rosto', 1, 5.70, 7.90, 10.00, 'Estimado', 11.90, 'Confirmar preço', 'N', 1, 'Site diz "C/24 Unid" por R$ 5,70: confirmar se é caixa ou unidade'),
    ('micelar_pantenol', 'Água Micelar Pantenol e Ác. Hialurônico 200ml', 'Dapop', 'Skincare', 1, 5.70, 9.99, 12.00, 'Confirmado', 12.90, 'Comprar', 'S', 1, ''),
    ('tonico_glicolico', 'Tônico Facial Ácido Glicólico 200ml', 'Dapop', 'Skincare', 1, 5.70, 12.90, 16.99, 'Confirmado', 14.90, 'Comprar', 'S', 1, ''),
    ('demaquilante_aloe', 'Demaquilante Aloe Vera e Alantoína 200ml', 'Dapop', 'Skincare', 1, 5.70, 9.99, 12.00, 'Estimado', 12.90, 'Opcional', 'N', 1, ''),
    ('adstringente', 'Loção Adstringente Chá Verde 200ml', 'Dapop', 'Skincare', 1, 5.70, 9.99, 12.00, 'Estimado', 12.90, 'Comprar (kit Rotina Skincare)', 'S', 1, ''),
    ('micelar_vitc', 'Água Micelar Vitamina C e Ác. Hialurônico 200ml', 'Dapop', 'Skincare', 1, 5.70, 9.99, 12.00, 'Confirmado', 12.90, 'Opcional', 'N', 1, ''),
    ('micelar_rosa', 'Água Micelar Rosa Mosqueta e Niacinamida 200ml', 'Dapop', 'Skincare', 1, 5.70, 9.99, 12.00, 'Confirmado', 12.90, 'Opcional', 'N', 1, ''),
    ('kit4_esponjas', 'Kit Esponjas Makeup Blender Puff c/4', 'Mahav', 'Acessórios', 1, 5.30, 13.90, 19.90, 'Confirmado', 16.90, 'Comprar', 'S', 1, ''),
    ('esponja_gota', 'Esponja Gota Makeup Blender Choco/Cherry', 'Mahav', 'Acessórios', 1, 2.60, 6.90, 6.90, 'Estimado', 7.90, 'Só em kit', 'N', 1, ''),
    ('esponja_chanfrada', 'Esponja Chanfrada Makeup Blender Cut', 'Mahav', 'Acessórios', 1, 2.60, 6.90, 6.90, 'Estimado', 7.90, 'Só em kit', 'N', 1, ''),
    ('lips_cheeks', 'Lips e Cheeks Cream', 'Miss Romantic', 'Maquiagem – Lábios', 24, 101.99, 10.00, 10.00, 'Estimado', 11.90, 'Opcional', 'N', 1, ''),
    ('gloss_sweet', 'Lip Gloss Sweet', 'Miss Romantic', 'Maquiagem – Lábios', 24, 90.99, 10.00, 10.00, 'Estimado', 9.90, 'Limitar (muitos gloss)', 'N', 1, ''),
    ('liner_sweet', 'Lip Liner Sweet Linha dos Lábios', 'Miss Romantic', 'Maquiagem – Lábios', 24, 64.20, 5.00, 10.00, 'Estimado', 7.90, 'Só em kit', 'N', 1, ''),
    # Lote 2
    ('mascara_cilios', 'Máscara para Cílios Natural Curling', 'Miss Romantic', 'Maquiagem – Olhos', 24, 160.40, 12.90, 12.90, 'Estimado', 12.90, 'Trocada pela Super Poderes 36h', 'N', 2, ''),
    ('cilios_8d', 'Cílios Postiços 8D (F007/F011/F012/F019/F022)', 'Sabrina Sato', 'Maquiagem – Olhos', 10, 37.80, 4.06, 10.99, 'Confirmado', 9.90, 'Comprar', 'S', 2, '5 modelos, mesmo preço. Pedir nota fiscal e confirmar que são originais'),
    ('serum_ah', 'Sérum Facial Ácido Hialurônico Reflection 30ml', 'Safira', 'Skincare', 1, 6.30, 15.00, 20.00, 'Estimado', 16.90, 'Comprar (kit Pele de Vidro)', 'S', 2, ''),
    ('serum_clareador', 'Sérum Facial Clareador Reflection 30ml', 'Safira', 'Skincare', 1, 6.30, 15.00, 20.00, 'Estimado', 16.90, 'Comprar (kit Pele de Vidro)', 'S', 2, ''),
    ('serum_vitc', 'Sérum Facial Vitamina C Reflection 30ml', 'Safira', 'Skincare', 1, 6.30, 15.00, 20.00, 'Estimado', 16.90, 'Comprar (kit Pele de Vidro)', 'S', 2, ''),
    ('ureia', 'Creme Hidratante Ureia 3% 200g', 'Safira', 'Corpo', 1, 6.90, 20.00, 30.00, 'Estimado', 19.90, 'Comprar', 'S', 2, 'Pesado: frete mais caro. Melhor no seu site'),
    ('batom_melana', 'Batom Brilho Natural', 'Melana', 'Maquiagem – Lábios', 24, 165.30, 14.90, 14.90, 'Estimado', 14.90, 'Opcional', 'N', 2, ''),
    ('lip_oil_fruit', 'Lip Oil Fruit Juice (LG007)', 'Hudamoji', 'Maquiagem – Lábios', 24, 95.60, 7.39, 7.39, 'Confirmado', 9.90, 'Opcional', 'N', 2, ''),
    ('gloss_hudamoji', 'Lip Gloss Alta Pigmentação', 'Hudamoji', 'Maquiagem – Lábios', 24, 147.50, 12.90, 12.90, 'Estimado', 12.90, 'Limitar (muitos gloss)', 'N', 2, ''),
    ('ilum_jummyju', 'Iluminador Compacto', 'JummyJu', 'Maquiagem – Rosto', 24, 113.30, 12.90, 12.90, 'Estimado', 12.90, 'Opcional', 'N', 2, ''),
    ('tatoo_brow', 'Máscara para Sobrancelhas Tatoo Brow', 'Femme Paris', 'Maquiagem – Sobrancelhas', 24, 110.80, 12.00, 15.00, 'Estimado', 12.90, 'Comprar (kits)', 'S', 2, ''),
    ('contorno_stick', 'Contorno Stick', 'Femme Paris', 'Maquiagem – Rosto', 24, 151.70, 15.90, 15.90, 'Estimado', 15.90, 'Comprar', 'S', 2, ''),
    # Lote 3
    ('gloss_peeloff', 'Lip Gloss Peel-Off', 'Femme Paris', 'Maquiagem – Lábios', 24, 131.30, 12.90, 12.90, 'Estimado', 12.90, 'Comprar (1 das 2 linhas de gloss)', 'S', 3, 'Tendência'),
    ('pentes', 'Conjunto de Pentes e Acessórios c/9 peças', '—', 'Cabelos', 1, 6.50, 15.00, 20.00, 'Estimado', 16.90, 'Comprar', 'S', 3, ''),
    ('mini_esponja', 'Mini Esponja para Maquiagem c/4', 'Rub… (confirmar marca)', 'Acessórios', 1, 3.20, 9.90, 9.90, 'Estimado', 9.90, 'Opcional', 'N', 3, ''),
    ('tapioca', 'Pó de Tapioca Lilás Selva Neon', 'Miss Rôse', 'Maquiagem – Rosto', 15, 49.50, 7.54, 11.99, 'Confirmado', 11.90, 'Comprar', 'S', 3, 'Melhor custo da lista'),
    ('tint_brow', 'Tint Brow Preenche Sobrancelha', 'Wike Make', 'Maquiagem – Sobrancelhas', 24, 150.60, 12.90, 12.90, 'Estimado', 12.90, 'Comprar (kit Sobrancelha)', 'S', 3, ''),
    ('gel_sobrancelha', 'Gel Fixador de Sobrancelhas com Pente', 'Wike Make', 'Maquiagem – Sobrancelhas', 24, 138.20, 12.90, 12.90, 'Estimado', 12.90, 'Comprar (kit Sobrancelha)', 'S', 3, ''),
    ('gloss_candy', 'Lip Gloss Candy', 'Wike Make', 'Maquiagem – Lábios', 24, 153.60, 7.52, 10.00, 'Confirmado', 11.90, 'Evitar (margem baixa)', 'N', 3, 'Vendido por R$ 7,50–10 em outras lojas'),
    ('gloss_icecream', 'Lip Gloss Ice Cream', 'Wike Make', 'Maquiagem – Lábios', 24, 153.60, 7.52, 10.00, 'Confirmado', 11.90, 'Evitar (margem baixa)', 'N', 3, 'Vendido por R$ 7,50–10 em outras lojas'),
    ('gloss_pompom', 'Lip Gloss Pompom', 'Wike Make', 'Maquiagem – Lábios', 24, 144.40, 7.52, 10.00, 'Confirmado', 11.90, 'Evitar (margem baixa)', 'N', 3, ''),
    ('gloss_chaveiro', 'Lip Gloss com Chaveiro', 'Wike Make', 'Maquiagem – Lábios', 24, 138.20, 7.52, 10.00, 'Confirmado', 11.90, 'Comprar (1 das 2 linhas de gloss)', 'S', 3, 'Bom para presente'),
    ('gloss_belle', 'Lip Gloss (ME005)', 'Belle Angel', 'Maquiagem – Lábios', 24, 166.30, 12.90, 12.90, 'Estimado', 12.90, 'Limitar (muitos gloss)', 'N', 3, ''),
    ('body_libertad', 'Hidratante Corporal Body Cream Libertad 150ml', 'Cap Life', 'Corpo', 1, 5.70, 14.90, 14.90, 'Estimado', 14.90, 'Comprar', 'S', 3, ''),
    # Lote 4
    ('betterme_hidratante', 'Super Hidratante Corporal e Facial Vitamina C 150g', 'Better Me', 'Corpo', 1, 6.20, 14.90, 19.90, 'Estimado', 16.90, 'Comprar', 'S', 4, 'Outras versões (pêssego, baunilha) à venda no ML/Shopee'),
    ('betterme_esfoliante', 'Super Esfoliante Corporal e Facial Vitamina C 150g', 'Better Me', 'Corpo', 1, 6.50, 14.90, 19.90, 'Estimado', 16.90, 'Opcional', 'N', 4, ''),
    ('pink21_matte_touch', 'Batom Líquido Matte Touch', 'Pink 21', 'Maquiagem – Lábios', 48, 252.80, 10.00, 24.99, 'Estimado', 14.90, 'Opcional', 'N', 4, 'Caixa com 48'),
    ('pink21_beauty', 'Batom Líquido Beauty', 'Pink 21', 'Maquiagem – Lábios', 24, 158.80, 10.00, 24.99, 'Estimado', 14.90, 'Opcional', 'N', 4, ''),
    ('pink21_all_day', 'Batom Líquido Efeito Matte All Day', 'Pink 21', 'Maquiagem – Lábios', 48, 271.60, 10.00, 24.99, 'Confirmado', 14.90, 'Comprar (1 linha de batom)', 'S', 4, 'Caixa com 48. Visto de R$ 10 a R$ 24,99'),
    ('alleva_banana', 'Pó Solto Banana Soft Sheer', 'Alleva', 'Maquiagem – Rosto', 18, 89.60, 12.90, 14.90, 'Estimado', 13.90, 'Opcional', 'N', 4, 'Caixa com 18'),
    ('alleva_translucido', 'Pó Solto Translúcido Soft Sheer', 'Alleva', 'Maquiagem – Rosto', 18, 89.60, 12.90, 14.90, 'Estimado', 13.90, 'Opcional', 'N', 4, 'Caixa com 18'),
    ('splash_fem', 'Body Splash 120ml femininos (7 fragrâncias)', 'Natuza', 'Perfumaria', 1, 6.80, 19.90, 29.90, 'Estimado', 24.90, 'Comprar', 'S', 4, 'Obsession Pink, Libertad, Sahar Al Noor, Royal Rose, Golden Vip, Yara Zahra, Good Angel. Body splash árabe de 200ml de outras marcas sai por ~R$ 59,90'),
    ('splash_men', 'Body Splash For Men 120ml (3 fragrâncias)', 'Natuza', 'Perfumaria', 1, 6.80, 19.90, 29.90, 'Estimado', 24.90, 'Comprar', 'S', 4, 'Asad Black, Royal Black, Hayat Al Gold'),
    ('body_cream_natuza', 'Hidratante Body Cream 120ml (4 fragrâncias)', 'Natuza', 'Corpo', 1, 6.60, 19.90, 24.90, 'Estimado', 22.90, 'Comprar (kit Perfumada)', 'S', 4, 'Libertad, Obsession Pink, Good Angel, Golden Vip (lote 5)'),
    # Lote 5
    ('alleva_fix_all', 'Pó Solto Blindagem Fix All', 'Alleva', 'Maquiagem – Rosto', 18, 89.60, 12.90, 14.90, 'Estimado', 13.90, 'Opcional', 'N', 5, 'Caixa com 18'),
    ('mia_trio_snow', 'Trio de Sombras Snow', 'Mia Make', 'Maquiagem – Olhos', 24, 160.20, 10.00, 14.90, 'Estimado', 14.90, 'Opcional', 'N', 5, ''),
    ('mia_duo_lips', 'Duo Lips Contorno e Batom', 'Mia Make', 'Maquiagem – Lábios', 24, 165.99, 12.90, 14.90, 'Estimado', 14.90, 'Opcional', 'N', 5, 'Duas coleções de cores no site'),
    ('pink21_primer_hidro', 'Primer Hidratante Hidro 45ml (CS6372)', 'Pink 21', 'Maquiagem – Rosto', 1, 6.70, 12.90, 16.90, 'Estimado', 14.90, 'Comprar (kit Make Completa)', 'S', 5, ''),
    ('amora_corretivo', 'Corretivo Líquido Amora', 'Pink 21', 'Maquiagem – Rosto', 24, 161.70, 12.90, 13.29, 'Estimado', 12.90, 'Opcional', 'N', 5, 'Referência: base Amora by Pink 21 R$ 13,29'),
    ('amora_blush_bastao', 'Blush em Bastão Amora', 'Pink 21', 'Maquiagem – Rosto', 24, 138.99, 14.90, 18.50, 'Estimado', 14.90, 'Comprar', 'S', 5, 'Referência: blush em bastão Pink 21 R$ 18,50'),
    ('pink21_candy_bear', 'Lip Gloss Candy Bear', 'Pink 21', 'Maquiagem – Lábios', 24, 191.20, 12.90, 14.90, 'Estimado', 14.90, 'Evitar (muitos gloss)', 'N', 5, ''),
    ('wecandy_corretivo', 'Corretivo Quick Fix We Candy Box A', 'We Candy', 'Maquiagem – Rosto', 36, 224.90, 12.90, 12.90, 'Estimado', 12.90, 'Opcional', 'N', 5, 'Caixa com 36'),
    ('vivai_fruits', 'Lip Gloss Fruits (3326.1.1)', 'Vivai', 'Maquiagem – Lábios', 36, 224.90, 2.08, 12.90, 'Confirmado', 11.90, 'Evitar (vendido barato)', 'N', 5, 'Box de 24 visto por R$ 49,90 na Amazon (~R$ 2,08/un.)'),
    ('vivai_choko', 'Gloss Glitter Choko (3429.1.1)', 'Vivai', 'Maquiagem – Lábios', 36, 229.99, 12.90, 12.90, 'Estimado', 12.90, 'Evitar (muitos gloss)', 'N', 5, 'Caixa com 36'),
    ('pink21_corretivo_matte', 'Corretivo Líquido Acabamento Matte', 'Pink 21', 'Maquiagem – Rosto', 24, 158.80, 12.90, 12.90, 'Estimado', 12.90, 'Confirmar qtd', 'N', 5, 'Qtd na caixa cortada no print: considerei 24, confirmar'),
    ('color_contour', 'Contorno em Bastão Color Contour', 'Pink 21', 'Maquiagem – Rosto', 48, 115.99, 6.76, 15.90, 'Confirmado', 12.90, 'Comprar', 'S', 5, 'Caixa com 48: custo muito baixo'),
    ('honey_sobrancelha', 'Máscara Incolor para Sobrancelha Honey', 'Pink 21', 'Maquiagem – Sobrancelhas', 24, 158.80, 12.90, 12.90, 'Estimado', 12.90, 'Confirmar qtd', 'N', 5, 'Qtd na caixa cortada no print: considerei 24, confirmar'),
    ('amora_gloss', 'Lip Gloss Amora (CS7043)', 'Pink 21', 'Maquiagem – Lábios', 24, 161.70, 12.90, 12.90, 'Estimado', 12.90, 'Evitar (muitos gloss)', 'N', 5, ''),
    ('the_pink_blush', 'Blush Líquido The Pink Multiuso', 'Pink 21', 'Maquiagem – Rosto', 24, 158.80, 19.90, 21.70, 'Confirmado', 17.90, 'Comprar', 'S', 5, 'Blush e batom; em alta'),
    ('amora_delineador', 'Delineador Líquido Peel Off Amora', 'Pink 21', 'Maquiagem – Olhos', 24, 126.40, 12.90, 12.90, 'Estimado', 12.90, 'Opcional', 'N', 5, ''),
    ('pink21_lip_balm', 'Lip Balm (CS7085)', 'Pink 21', 'Maquiagem – Lábios', 24, 148.80, 10.00, 12.90, 'Estimado', 11.90, 'Opcional', 'N', 5, ''),
    ('iconic_paleta', 'Paleta de Sombras The Iconic (Cor 01 e Cor 03)', 'Pink 21', 'Maquiagem – Olhos', 1, 6.80, 11.99, 45.90, 'Estimado', 19.90, 'Comprar', 'S', 5, '9 cores. Cor 03 no lote 6, mesmo preço. Outras paletas Pink 21 de R$ 11,99 a R$ 45,90'),
    # Lote 6
    ('pink21_corretivo_cs5963', 'Corretivo Líquido (CS5963)', 'Pink 21', 'Maquiagem – Rosto', 24, 93.99, 12.90, 12.90, 'Estimado', 12.90, 'Comprar (único corretivo)', 'S', 6, 'Corretivo mais barato da lista'),
    ('angels_mascara', 'Máscara para Cílios Volume e Define', '4Angels', 'Maquiagem – Olhos', 24, 142.90, 10.00, 12.90, 'Estimado', 11.90, 'Confirmar qtd', 'N', 6, 'Qtd na caixa cortada no print: considerei 24, confirmar'),
    ('angels_batom', 'Batom Líquido (BR1262)', '4Angels', 'Maquiagem – Lábios', 24, 142.90, 10.00, 12.90, 'Estimado', 11.90, 'Evitar (já tem batom)', 'N', 6, ''),
    ('angels_gloss_caramel', 'Lip Gloss Caramel (BR1260)', '4Angels', 'Maquiagem – Lábios', 24, 142.90, 10.00, 12.90, 'Estimado', 11.90, 'Evitar (muitos gloss)', 'N', 6, ''),
    ('angels_lip_tint', 'Lip Tint (BR1255)', '4Angels', 'Maquiagem – Lábios', 24, 131.30, 10.00, 10.00, 'Confirmado', 11.90, 'Opcional', 'N', 6, 'Lip tint 4Angels visto por R$ 10'),
    ('angels_delineador', 'Delineador Líquido (BR1250)', '4Angels', 'Maquiagem – Olhos', 24, 113.80, 10.00, 12.90, 'Estimado', 11.90, 'Opcional', 'N', 6, ''),
    ('angels_paleta', 'Paleta de Sombras (BR1248)', '4Angels', 'Maquiagem – Olhos', 24, 113.60, 10.00, 12.90, 'Estimado', 12.90, 'Opcional', 'N', 6, 'A The Iconic (Pink 21) dá mais lucro'),
    # Lote 7
    ('angels_corretivo', 'Corretivo Líquido Camuflagem Matte', '4Angels', 'Maquiagem – Rosto', 24, 142.90, 10.00, 12.90, 'Estimado', 11.90, 'Evitar (tem corretivo melhor)', 'N', 7, 'Qtd na caixa cortada no print: considerei 24, confirmar'),
    ('angels_lip_oil_heart', 'Lip Oil Heart Charm (BR1228)', '4Angels', 'Maquiagem – Lábios', 24, 150.20, 10.00, 12.90, 'Estimado', 11.90, 'Evitar (muitos gloss)', 'N', 7, ''),
    ('angels_lip_oil', 'Lip Oil (BR1226)', '4Angels', 'Maquiagem – Lábios', 24, 142.90, 10.00, 12.90, 'Estimado', 11.90, 'Evitar (muitos gloss)', 'N', 7, ''),
    ('angels_gloss', 'Lip Gloss (BR1225)', '4Angels', 'Maquiagem – Lábios', 24, 142.90, 10.00, 12.90, 'Estimado', 11.90, 'Evitar (muitos gloss)', 'N', 7, ''),
    ('plump_cat', 'Brilho Labial Plump Cat Omg', 'Love Rain', 'Maquiagem – Lábios', 1, 6.00, 12.90, 12.90, 'Estimado', 12.90, 'Opcional', 'N', 7, ''),
    ('lenco_demaquilante', 'Lenço Demaquilante 30 un. (Vit. C, Niacinamida, Retinol, Ác. Hialurônico)', 'Super Poderes', 'Skincare', 1, 5.20, 7.99, 10.00, 'Confirmado', 9.90, 'Opcional (bom para kit)', 'N', 7, '4 versões, mesmo preço'),
    ('sp_corretivo_bastao', 'Corretivo em Bastão', 'Super Poderes', 'Maquiagem – Rosto', 24, 164.50, 12.90, 15.00, 'Estimado', 12.90, 'Evitar (Color Cover é mais barato)', 'N', 7, ''),
    ('melana_mascara', 'Máscara para Cílios (E-CZ223)', 'Melana', 'Maquiagem – Olhos', 24, 132.20, 12.90, 12.90, 'Estimado', 12.90, 'Opcional', 'N', 7, ''),
    ('boom_eyes', 'Delineador Líquido Boom Eyes', 'Pink 21', 'Maquiagem – Olhos', 24, 158.80, 12.90, 12.90, 'Estimado', 12.90, 'Opcional', 'N', 7, ''),
    ('color_cover', 'Corretivo em Bastão Color Cover', 'Pink 21', 'Maquiagem – Rosto', 48, 116.70, 13.80, 15.90, 'Confirmado', 12.90, 'Comprar', 'S', 7, 'Caixa com 48: custo muito baixo. Outros corretivos Pink 21 R$ 13,80–15,90'),
    ('honey_gloss', 'Lip Gloss Honey (CS6661)', 'Pink 21', 'Maquiagem – Lábios', 24, 129.60, 12.90, 12.90, 'Estimado', 12.90, 'Evitar (muitos gloss)', 'N', 7, ''),
    ('lapis_labial', 'Lápis Labial Multiuso (c/12)', 'Pink 21', 'Maquiagem – Lábios', 12, 16.70, 3.96, 7.69, 'Confirmado', 5.90, 'Só em kit', 'N', 7, 'Pacote com 12: R$ 1,39 cada'),
    ('blush_multifuncional', 'Blush Líquido Multifuncional', 'Pink 21', 'Maquiagem – Rosto', 24, 93.99, 19.90, 21.70, 'Estimado', 15.90, 'Comprar', 'S', 7, 'Mais barato que o The Pink (R$ 3,92 x R$ 6,62). Referência: blush líquido multiuso Pink 21'),
    ('saarah_splash', 'Body Splash Saarah 130ml', 'Cap Life', 'Perfumaria', 1, 6.99, 14.90, 19.90, 'Estimado', 19.90, 'Opcional', 'N', 7, 'Visto a R$ 6,40–6,99 em atacadistas; preço de varejo não achado'),
    ('love_rain_concealer', 'Corretivo Líquido Concealer (LR-4908)', 'Love Rain', 'Maquiagem – Rosto', 24, 160.40, 12.90, 12.90, 'Estimado', 12.90, 'Evitar (tem corretivo melhor)', 'N', 7, ''),
    ('vivai_cherry', 'Batom Matte Cherry', 'Vivai', 'Maquiagem – Lábios', 24, None, None, None, 'Estimado', None, 'Confirmar preço', 'N', 7, 'Preço escondido no print'),
    ('vivai_viv', 'Batom Cintilante Viv', 'Vivai', 'Maquiagem – Lábios', 24, None, None, None, 'Estimado', None, 'Confirmar preço', 'N', 7, 'Preço escondido no print'),
    # Lote 8
    ('belle_banana', 'Pó Solto Banana (B101)', 'Belle Angel', 'Maquiagem – Rosto', 19, 119.90, 12.90, 14.90, 'Estimado', 13.90, 'Opcional', 'N', 8, 'Caixa com 19. O Pó de Tapioca Miss Rôse é mais barato'),
    ('belle_blush', 'Blush (ME003)', 'Belle Angel', 'Maquiagem – Rosto', 24, 142.20, 12.90, 12.90, 'Estimado', 12.90, 'Opcional', 'N', 8, ''),
    ('belle_you_me', 'Lip Cream You Me com Chaveiro', 'Belle Angel', 'Maquiagem – Lábios', 24, 129.30, 12.90, 12.90, 'Estimado', 12.90, 'Evitar (muitos gloss)', 'N', 8, ''),
    ('hello_kitty_oil', 'Lip Oil Jelly Hello Kitty', 'Yalanni', 'Maquiagem – Lábios', 24, 160.40, 14.90, 14.90, 'Estimado', 14.90, 'Evitar (personagem licenciado)', 'N', 8, 'Hello Kitty é marca registrada: sem licença comprovada, o anúncio pode ser removido'),
    ('chocolip', 'Lip Gloss Chocolip', 'JummyJu', 'Maquiagem – Lábios', 24, 147.20, 12.90, 12.90, 'Estimado', 12.90, 'Evitar (muitos gloss)', 'N', 8, ''),
    ('velvet_fix_brow', 'Gel para Sobrancelha Velvet Fix Brow', 'JummyJu', 'Maquiagem – Sobrancelhas', 24, 135.90, 12.90, 12.90, 'Estimado', 12.90, 'Opcional', 'N', 8, 'Já tem o gel Wike Make'),
    ('candy_balm', 'Candy Balm 10g (Biscoito Recheado, Creme de Avelã)', 'Super Poderes', 'Maquiagem – Lábios', 1, 5.70, 5.50, 9.09, 'Confirmado', 9.90, 'Só em kit', 'N', 8, 'Hidratante labial; 2 sabores'),
    ('sp_mascara_alonga', 'Máscara para Cílios Alonga Olhar', 'Super Poderes', 'Maquiagem – Olhos', 24, 123.70, 12.90, 12.90, 'Estimado', 12.90, 'Opcional', 'N', 8, ''),
    ('sp_mascara_36h', 'Máscara para Cílios 36h Curva e Volume', 'Super Poderes', 'Maquiagem – Olhos', 24, 123.70, 12.90, 12.90, 'Estimado', 12.90, 'Comprar (kit Olhar Poderoso)', 'S', 8, 'Mais barata que a Miss Romantic (R$ 5,15 x R$ 6,68)'),
    ('super_bocao', 'Gloss Labial Super Bocão (N°06, N°08, N°09)', 'Super Poderes', 'Maquiagem – Lábios', 1, 5.20, 11.50, 11.50, 'Confirmado', 11.90, 'Opcional', 'N', 8, 'Gloss "aumenta boca", muito procurado'),
    ('gelato_gloss', 'Lip Gloss Gelato', 'Wike Make', 'Maquiagem – Lábios', 24, 139.99, 7.52, 10.00, 'Estimado', 11.90, 'Evitar (muitos gloss)', 'N', 8, ''),
    ('entregou_tudo', 'Pó Solto Facial Rosa Entregou Tudo', 'Wike Make', 'Maquiagem – Rosto', 15, 76.80, 12.90, 12.90, 'Estimado', 12.90, 'Opcional', 'N', 8, 'Caixa com 15'),
    ('glow_line_cream', 'Body Cream 125ml (Glow Belle, Angelical, Paradoxo, Glowly, Royal Glow)', 'Glow Line', 'Corpo', 1, 6.80, 19.90, 24.90, 'Estimado', 22.90, 'Opcional', 'N', 8, '5 fragrâncias. A Natuza já cobre os body creams'),
]

# (nome, componentes (chaves; repetir = mais de uma unidade), preço de venda)
KITS = [
    ('Pele de Vidro', ['serum_ah', 'serum_vitc', 'serum_clareador'], 49.90),
    ('Pele Perfeita', ['blush_velvet', 'contorno_velvet', 'ilum_velvet', 'tapioca'], 49.90),
    ('Rotina Skincare', ['micelar_pantenol', 'tonico_glicolico', 'adstringente'], 39.90),
    ('Olhar Poderoso', ['cilios_8d', 'cilios_8d', 'cilios_8d', 'sp_mascara_36h', 'tatoo_brow'], 44.90),
    ('Sobrancelha Perfeita', ['tint_brow', 'gel_sobrancelha', 'tatoo_brow'], 34.90),
    ('Lábios Suculentos', ['lip_oil_fruit', 'gloss_hudamoji', 'batom_melana'], 34.90),
    ('Perfumada (splash + creme)', ['splash_fem', 'body_cream_natuza'], 44.90),
    ('Presente Masculino (2 splash)', ['splash_men', 'splash_men'], 44.90),
    ('Make Completa', ['iconic_paleta', 'the_pink_blush', 'color_contour', 'pink21_primer_hidro'], 59.90),
    ('Pele Pink 21', ['color_cover', 'color_contour', 'blush_multifuncional', 'pink21_primer_hidro'], 49.90),
]

FONT = 'Arial'
AZUL = Font(name=FONT, color='0000FF')
PRETO = Font(name=FONT, color='000000')
VERDE = Font(name=FONT, color='008000')
NEGRITO = Font(name=FONT, bold=True)
CAB_FONT = Font(name=FONT, bold=True, color='FFFFFF')
CAB_FILL = PatternFill('solid', start_color='111014')
AMARELO = PatternFill('solid', start_color='FFFF00')
ROSA = PatternFill('solid', start_color='FFE3EC')
BORDA = Border(bottom=Side(style='thin', color='E6DDE3'))
BRL = 'R$ #,##0.00;[Red]-R$ #,##0.00;-'
PCT = '0.0%;[Red]-0.0%;-'
INT = '#,##0;[Red]-#,##0;-'

wb = Workbook()

# ---------- Premissas ----------
pr = wb.active
pr.title = 'Premissas'
pr['A1'] = 'Premissas usadas nas contas'
pr['A1'].font = Font(name=FONT, bold=True, size=14)
pr['A2'] = 'Células em amarelo com texto azul podem ser alteradas. O resto da planilha se atualiza sozinho.'
pr['A2'].font = Font(name=FONT, italic=True, color='666666')
premissas = [
    ('pix', 'Desconto Pix no seu site', 0.05, PCT, 'Configuração atual da loja Élan Beauté'),
    ('taxa_pag', 'Taxa do meio de pagamento (seu site)', 0.01, PCT, 'Estimativa para Pix; cartão costuma ser 3–5%'),
    ('emb', 'Embalagem por pedido/unidade (R$)', 1.00, BRL, 'Estimativa: saquinho + etiqueta'),
    ('ml_com', 'Mercado Livre: comissão', 0.12, PCT, 'Aproximado (anúncio clássico, beleza). Confira a taxa atual'),
    ('ml_fixa', 'Mercado Livre: taxa fixa por venda abaixo de R$ 79 (R$)', 6.25, BRL, 'Aproximado. Confira a taxa atual'),
    ('sh_com', 'Shopee: comissão + frete grátis', 0.20, PCT, 'Aproximado. Confira a taxa atual'),
    ('sh_fixa', 'Shopee: taxa fixa por item (R$)', 4.00, BRL, 'Aproximado. Confira a taxa atual'),
    ('meta', 'Meta de lucro por mês (R$)', 1000.00, BRL, 'Valor de exemplo: coloque a sua meta'),
]
REF = {}
pr.append([])
pr.append(['Premissa', 'Valor', 'Observação'])
for c in pr[4]:
    c.font, c.fill = CAB_FONT, CAB_FILL
for i, (k, nome, val, fmt, obs) in enumerate(premissas, start=5):
    pr.cell(i, 1, nome).font = PRETO
    v = pr.cell(i, 2, val)
    v.font, v.fill, v.number_format = AZUL, AMARELO, fmt
    pr.cell(i, 3, obs).font = Font(name=FONT, color='666666')
    REF[k] = f'Premissas!$B${i}'
pr.column_dimensions['A'].width = 52
pr.column_dimensions['B'].width = 14
pr.column_dimensions['C'].width = 60

# ---------- Produtos ----------
ps = wb.create_sheet('Produtos')
cab = ['ID', 'Produto', 'Marca', 'Categoria', 'Lote (print)', 'Qtd na caixa', 'Preço no fornecedor',
       'Custo por unidade', 'Internet: menor preço', 'Internet: maior preço', 'Preço internet é',
       'Seu preço de venda', 'Lucro/un. seu site', 'Margem seu site', 'Lucro/un. Mercado Livre',
       'Lucro/un. Shopee', 'Lucro da caixa (seu site)', 'Unidades/mês p/ meta', 'Recomendação',
       'Vou comprar? (S/N)', 'Observação', 'Faturamento (se comprar)', 'Lucro (se comprar)', 'Quantas caixas/unidades comprar', 'Investimento (se comprar)']
ps.append(cab)
for c in ps[1]:
    c.font, c.fill = CAB_FONT, CAB_FILL
    c.alignment = Alignment(wrap_text=True, vertical='center', horizontal='center')
ps.row_dimensions[1].height = 42

ID = {}
for i, (k, nome, marca, cat, qtd, preco, imin, imax, fonte, venda, rec, comprar, lote, obs) in enumerate(PRODUTOS, start=2):
    pid = f'P{i - 1:02d}'
    ID[k] = pid
    r = i
    vals = {1: pid, 2: nome, 3: marca, 4: cat, 5: lote, 6: qtd, 7: preco, 9: imin, 10: imax, 11: fonte,
            12: venda, 19: rec, 20: comprar, 21: obs}
    for col, v in vals.items():
        cell = ps.cell(r, col, v)
        cell.font = PRETO
    for col in (6, 7, 9, 10, 12, 20):
        ps.cell(r, col).font = AZUL
    ps.cell(r, 12).fill = AMARELO
    ps.cell(r, 20).fill = AMARELO
    ps[f'H{r}'] = f'=IF(ISNUMBER(G{r}),IFERROR(G{r}/F{r},""),"")'
    ps[f'M{r}'] = f'=IFERROR(L{r}*(1-{REF["pix"]})*(1-{REF["taxa_pag"]})-H{r}-{REF["emb"]},"")'
    ps[f'N{r}'] = f'=IFERROR(M{r}/L{r},"")'
    ps[f'O{r}'] = f'=IFERROR(L{r}*(1-{REF["ml_com"]})-{REF["ml_fixa"]}-H{r}-{REF["emb"]},"")'
    ps[f'P{r}'] = f'=IFERROR(L{r}*(1-{REF["sh_com"]})-{REF["sh_fixa"]}-H{r}-{REF["emb"]},"")'
    ps[f'Q{r}'] = f'=IFERROR(M{r}*F{r},"")'
    ps[f'R{r}'] = f'=IFERROR(IF(M{r}>0,ROUNDUP({REF["meta"]}/M{r},0),"sem lucro"),"")'
    q = ps.cell(r, 24, 1 if qtd > 1 else 12)
    q.font, q.fill = AZUL, AMARELO
    ps[f'V{r}'] = f'=IF(AND(T{r}="S",ISNUMBER(L{r}),ISNUMBER(F{r})),L{r}*F{r}*X{r},0)'
    ps[f'W{r}'] = f'=IF(AND(T{r}="S",ISNUMBER(Q{r})),Q{r}*X{r},0)'
    ps[f'Y{r}'] = f'=IF(AND(T{r}="S",ISNUMBER(G{r})),G{r}*X{r},0)'
    for col in 'GHIJLMOPQVWY':
        ps[f'{col}{r}'].number_format = BRL
    ps[f'N{r}'].number_format = PCT
    ps[f'R{r}'].number_format = INT
    for c in ps[r]:
        c.border = BORDA
        c.alignment = Alignment(vertical='center', wrap_text=c.column in (2, 19, 21))
    if fonte == 'Estimado':
        ps[f'K{r}'].font = Font(name=FONT, color='B8860B')
last = len(PRODUTOS) + 1

widths = [6, 42, 16, 22, 8, 9, 13, 12, 12, 12, 12, 12, 12, 10, 13, 12, 14, 12, 26, 11, 44, 14, 14, 13, 14]
for i, w in enumerate(widths, start=1):
    ps.column_dimensions[get_column_letter(i)].width = w
ps.freeze_panes = 'C2'
ps.auto_filter.ref = f'A1:Y{last}'
dv = DataValidation(type='list', formula1='"S,N"', allow_blank=True)
ps.add_data_validation(dv)
dv.add(f'T2:T{last}')
for col in 'MOP':
    ps.conditional_formatting.add(f'{col}2:{col}{last}', CellIsRule(operator='lessThan', formula=['0'], font=Font(name=FONT, color='C00000', bold=True)))
ps.conditional_formatting.add(f'M2:M{last}', ColorScaleRule(start_type='min', start_color='FFFFFF', end_type='max', end_color='63BE7B'))
ps['G1'].comment = Comment('Preço mostrado no site do fornecedor (Bem Mulher, página Loja de R$10), lido dos prints enviados. Quando a qtd na caixa é maior que 1, é o preço da caixa inteira.', 'Claude')
ps['I1'].comment = Comment('Preços encontrados em lojas online por busca na internet (set/2026). "Estimado" = produto exato não encontrado; valor baseado em produtos parecidos.', 'Claude')
ps['X1'].comment = Comment('Caixas (quando o produto vem em caixa) ou unidades (produto avulso). Padrão: 1 caixa ou 12 unidades.', 'Claude')
ps['M1'].comment = Comment('= Preço de venda − desconto Pix − taxa de pagamento − custo − embalagem (ver aba Premissas).', 'Claude')

# ---------- Kits ----------
ks = wb.create_sheet('Kits')
max_comp = max(len(c) for _, c, _ in KITS)
kcab = ['Kit'] + [f'Item {i}' for i in range(1, max_comp + 1)] + ['Custo do kit', 'Preço de venda', 'Lucro seu site',
                                                                    'Lucro Mercado Livre', 'Lucro Shopee', 'Kits/mês p/ meta (seu site)']
ks.append(kcab)
for c in ks[1]:
    c.font, c.fill = CAB_FONT, CAB_FILL
    c.alignment = Alignment(wrap_text=True, vertical='center', horizontal='center')
ks.row_dimensions[1].height = 36
cc = max_comp + 2  # coluna do custo
L = get_column_letter
for r, (nome, comps, preco) in enumerate(KITS, start=2):
    ks.cell(r, 1, nome).font = NEGRITO
    for j, k in enumerate(comps, start=2):
        ks.cell(r, j, ID[k]).font = AZUL
        ks.cell(r, j).comment = Comment(next(p[1] for p in PRODUTOS if p[0] == k), 'Claude')
    parts = [f'IFERROR(INDEX(Produtos!$H$2:$H${last},MATCH({L(j)}{r},Produtos!$A$2:$A${last},0)),0)' for j in range(2, max_comp + 2)]
    ks.cell(r, cc, '=' + '+'.join(parts)).number_format = BRL
    p = ks.cell(r, cc + 1, preco)
    p.font, p.fill, p.number_format = AZUL, AMARELO, BRL
    C, V = L(cc), L(cc + 1)
    ks.cell(r, cc + 2, f'={V}{r}*(1-{REF["pix"]})*(1-{REF["taxa_pag"]})-{C}{r}-{REF["emb"]}').number_format = BRL
    ks.cell(r, cc + 3, f'={V}{r}*(1-{REF["ml_com"]})-{REF["ml_fixa"]}-{C}{r}-{REF["emb"]}').number_format = BRL
    ks.cell(r, cc + 4, f'={V}{r}*(1-{REF["sh_com"]})-{REF["sh_fixa"]}-{C}{r}-{REF["emb"]}').number_format = BRL
    ks.cell(r, cc + 5, f'=IF({L(cc + 2)}{r}>0,ROUNDUP({REF["meta"]}/{L(cc + 2)}{r},0),"sem lucro")').number_format = INT
    for c in ks[r]:
        c.border = BORDA
ks.column_dimensions['A'].width = 22
for j in range(2, cc + 6):
    ks.column_dimensions[L(j)].width = 13
kn = len(KITS) + 3
ks.cell(kn, 1, 'Os itens são IDs da aba Produtos (passe o mouse para ver o nome). Repetir um ID = mais de uma unidade no kit.').font = Font(name=FONT, italic=True, color='666666')
ks.conditional_formatting.add(f'{L(cc + 2)}2:{L(cc + 4)}{len(KITS) + 1}', ColorScaleRule(start_type='min', start_color='FFFFFF', end_type='max', end_color='63BE7B'))

# ---------- Resumo ----------
rs = wb.create_sheet('Resumo', 0)
rs['A1'] = 'Análise do fornecedor Bem Mulher (Loja de R$10)'
rs['A1'].font = Font(name=FONT, bold=True, size=14)
rs['A2'] = 'Atualizada a cada leva de prints. Produtos com "S" em "Vou comprar?" entram nas contas abaixo, na quantidade da coluna "Quantas caixas/unidades comprar" (aba Produtos).'
rs['A2'].font = Font(name=FONT, italic=True, color='666666')
linhas = [
    ('Produtos analisados', f'=COUNTA(Produtos!A2:A{last})', INT),
    ('Produtos marcados para comprar', f'=COUNTIF(Produtos!T2:T{last},"S")', INT),
    ('Investimento no fornecedor', f'=SUM(Produtos!Y2:Y{last})', BRL),
    ('Unidades compradas', f'=SUMPRODUCT((Produtos!T2:T{last}="S")*Produtos!F2:F{last}*Produtos!X2:X{last})', INT),
    ('Faturamento se vender tudo no seu site', f'=SUM(Produtos!V2:V{last})', BRL),
    ('Lucro se vender tudo no seu site', f'=SUM(Produtos!W2:W{last})', BRL),
    ('Retorno sobre o investimento', '=IFERROR(B10/B7,"")', PCT),
    ('Meta de lucro por mês', f'={REF["meta"]}', BRL),
]
rs.append([])
rs.append(['Indicador', 'Valor'])
for c in rs[4]:
    c.font, c.fill = CAB_FONT, CAB_FILL
for i, (nome, f, fmt) in enumerate(linhas, start=5):
    rs.cell(i, 1, nome).font = PRETO
    v = rs.cell(i, 2, f)
    v.number_format, v.font = fmt, NEGRITO
    rs.cell(i, 1).fill = ROSA if i in (7, 10) else PatternFill()
rs['A15'] = 'Como usar'
rs['A15'].font = NEGRITO
dicas = [
    'Texto azul com fundo amarelo = você pode alterar (preço de venda, "Vou comprar?", premissas, preço dos kits).',
    'Preço internet "Estimado" (em dourado) = produto exato não achado; confira no Mercado Livre antes de definir o preço.',
    'Lucro em vermelho = você perde dinheiro nesse canal com esse preço. No Mercado Livre e na Shopee, prefira vender em kit.',
    'Use o filtro do cabeçalho na aba Produtos para ordenar por lucro, categoria ou lote.',
    'Taxas do Mercado Livre e da Shopee são aproximadas: confira as atuais e ajuste na aba Premissas.',
]
for i, d in enumerate(dicas, start=16):
    rs.cell(i, 1, '• ' + d).font = PRETO
rs.column_dimensions['A'].width = 50
rs.column_dimensions['B'].width = 18

wb.save(SAIDA)
print('ok', SAIDA, len(PRODUTOS), 'produtos', len(KITS), 'kits')
