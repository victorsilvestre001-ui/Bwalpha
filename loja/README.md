# Bella Box — loja de cosméticos importados

Loja virtual estática (HTML + CSS + JavaScript puro, sem build). Estrutura inspirada em e-commerces de beleza importada: barra de promoções, cabeçalho com busca, menu de categorias com submenus, vitrines, página de produto completa, sacola lateral e checkout.

## Como rodar

```bash
cd loja
python3 -m http.server 8080   # ou: npx serve .
```

Abra http://localhost:8080. Para publicar, suba a pasta `loja/` em qualquer hospedagem estática (Vercel, Netlify, GitHub Pages).

## Promoções incluídas

| Promoção | Onde aparece | Como funciona |
|---|---|---|
| Barra de avisos rotativa | Topo de todas as páginas | Frete grátis, Pix, parcelamento, cupom |
| Oferta relâmpago com cronômetro | Home e página do produto | Produtos com tag `relampago`; termina à meia-noite e renova no dia seguinte |
| Leve 3 pague 2 | Selo nos produtos, página `#/promo/leve3pague2`, sacola | A cada 3 unidades elegíveis, a mais barata sai de graça (calculado sozinho) |
| 5% OFF no Pix | Cards, produto, sacola, checkout | `STORE.pixDiscount` |
| Parcelamento sem juros | Cards e produto | Até `STORE.maxInstallments`x, com parcela mínima de R$ 20 |
| Frete grátis + barra de progresso | Sacola | "Faltam R$ X para frete grátis" e sugestões de produtos para completar |
| Pop-up de cupom de boas-vindas | Aparece 7s após a 1ª visita | Clicar no cupom copia e aplica `BEMVINDA10` |
| Newsletter | Rodapé | Cadastro aplica o cupom na sacola |
| Compre junto e ganhe 10% OFF | Página do produto | Adiciona os 2 itens e aplica o cupom |
| Estoque baixo | Cards e produto | "Restam só N unidades" quando `stock <= 10` |
| Outlet | Menu | Tag `outlet` ou estoque ≤ 5 |

Cupons (em `products.js`): `BEMVINDA10` (10%), `BELLA20` (20% acima de R$ 299), `FRETEGRATIS`.

## Como personalizar

Tudo que muda com frequência está em **`products.js`**:

- `STORE`: nome, WhatsApp, valor do frete grátis, desconto do Pix, parcelas e cupons.
- `CATEGORIES`: categorias e subcategorias do menu.
- `PRODUCTS`: produtos. Use `img: 'imagens/produto.jpg'` para foto real; sem `img`, a loja desenha uma ilustração com `shape` + `colors`.
  Tags: `relampago`, `leve3pague2`, `mais-vendido`, `novo`, `importado`, `outlet`.

Antes de publicar, troque os dados de exemplo: nome da loja, CNPJ, endereço, telefone/WhatsApp, redes sociais, produtos, notas e número de avaliações. Mostre apenas números reais aos clientes.

## O que falta para vender de verdade

- **Pagamento:** o checkout é uma simulação. Integre um gateway (Mercado Pago, Pagar.me, PagSeguro ou Stripe) para gerar Pix, boleto e cobrar no cartão.
- **Frete:** o cálculo usa uma tabela fixa por região do CEP. Troque por uma API de frete (Melhor Envio, Correios, Frenet).
- **Estoque e pedidos:** hoje ficam no navegador (`localStorage`). Para vender, use um backend ou uma plataforma (Shopify, Nuvemshop).
