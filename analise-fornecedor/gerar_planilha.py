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
    ('mascara_cilios', 'Máscara para Cílios Natural Curling', 'Miss Romantic', 'Maquiagem – Olhos', 24, 160.40, 12.90, 12.90, 'Estimado', 12.90, 'Comprar (kit Olhar Poderoso)', 'S', 2, ''),
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
]

# (nome, componentes (chaves; repetir = mais de uma unidade), preço de venda)
KITS = [
    ('Pele de Vidro', ['serum_ah', 'serum_vitc', 'serum_clareador'], 49.90),
    ('Pele Perfeita', ['blush_velvet', 'contorno_velvet', 'ilum_velvet', 'tapioca'], 49.90),
    ('Rotina Skincare', ['micelar_pantenol', 'tonico_glicolico', 'adstringente'], 39.90),
    ('Olhar Poderoso', ['cilios_8d', 'cilios_8d', 'cilios_8d', 'mascara_cilios', 'tatoo_brow'], 44.90),
    ('Sobrancelha Perfeita', ['tint_brow', 'gel_sobrancelha', 'tatoo_brow'], 34.90),
    ('Lábios Suculentos', ['lip_oil_fruit', 'gloss_hudamoji', 'batom_melana'], 34.90),
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
       'Vou comprar? (S/N)', 'Observação', 'Faturamento da caixa (se comprar)', 'Lucro da caixa (se comprar)']
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
    ps[f'V{r}'] = f'=IF(AND(T{r}="S",ISNUMBER(L{r}),ISNUMBER(F{r})),L{r}*F{r},0)'
    ps[f'W{r}'] = f'=IF(AND(T{r}="S",ISNUMBER(Q{r})),Q{r},0)'
    for col in 'GHIJLMOPQVW':
        ps[f'{col}{r}'].number_format = BRL
    ps[f'N{r}'].number_format = PCT
    ps[f'R{r}'].number_format = INT
    for c in ps[r]:
        c.border = BORDA
        c.alignment = Alignment(vertical='center', wrap_text=c.column in (2, 19, 21))
    if fonte == 'Estimado':
        ps[f'K{r}'].font = Font(name=FONT, color='B8860B')
last = len(PRODUTOS) + 1

widths = [6, 42, 16, 22, 8, 9, 13, 12, 12, 12, 12, 12, 12, 10, 13, 12, 14, 12, 26, 11, 44, 14, 14]
for i, w in enumerate(widths, start=1):
    ps.column_dimensions[get_column_letter(i)].width = w
ps.freeze_panes = 'C2'
ps.auto_filter.ref = f'A1:W{last}'
dv = DataValidation(type='list', formula1='"S,N"', allow_blank=True)
ps.add_data_validation(dv)
dv.add(f'T2:T{last}')
for col in 'MOP':
    ps.conditional_formatting.add(f'{col}2:{col}{last}', CellIsRule(operator='lessThan', formula=['0'], font=Font(name=FONT, color='C00000', bold=True)))
ps.conditional_formatting.add(f'M2:M{last}', ColorScaleRule(start_type='min', start_color='FFFFFF', end_type='max', end_color='63BE7B'))
ps['G1'].comment = Comment('Preço mostrado no site do fornecedor (Bem Mulher, página Loja de R$10), lido dos prints enviados. Quando a qtd na caixa é maior que 1, é o preço da caixa inteira.', 'Claude')
ps['I1'].comment = Comment('Preços encontrados em lojas online por busca na internet (set/2026). "Estimado" = produto exato não encontrado; valor baseado em produtos parecidos.', 'Claude')
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
rs['A2'] = 'Atualizada a cada leva de prints. Produtos marcados com "S" em "Vou comprar?" (aba Produtos) entram nas contas abaixo.'
rs['A2'].font = Font(name=FONT, italic=True, color='666666')
linhas = [
    ('Produtos analisados', f'=COUNTA(Produtos!A2:A{last})', INT),
    ('Produtos marcados para comprar', f'=COUNTIF(Produtos!T2:T{last},"S")', INT),
    ('Investimento (1 caixa/unidade de cada marcado)', f'=SUMIF(Produtos!T2:T{last},"S",Produtos!G2:G{last})', BRL),
    ('Unidades compradas', f'=SUMIF(Produtos!T2:T{last},"S",Produtos!F2:F{last})', INT),
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
