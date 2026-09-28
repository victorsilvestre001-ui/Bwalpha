const express = require('express');
const pool = require('./db');
const { authMiddleware } = require('./authMiddleware');
const { createVipCheckout } = require('./asaas');
const { caktoCheckoutUrl } = require('./cakto');

const router = express.Router();

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.tradeonia.com.br';

// Provedor do checkout: PAYMENT_PROVIDER=stripe usa o Stripe (Pix + cartão, pagamento único);
// senão, com KIWIFY_CHECKOUT_URL configurada, usa a Kiwify.
function provider() {
    if (process.env.PAYMENT_PROVIDER === 'cakto') return 'cakto';
    if (process.env.PAYMENT_PROVIDER === 'asaas') return 'asaas';
    if (process.env.PAYMENT_PROVIDER === 'stripe') return 'stripe';
    return process.env.KIWIFY_CHECKOUT_URL ? 'kiwify' : 'stripe';
}

// O VIP é pagamento único (preço avulso em BRL no Stripe). Aceita o ID do preço (price_...)
// ou o do produto (prod_...), usando o preço padrão do produto.
let vipPriceCache = null;
async function vipLineItem() {
    const id = process.env.STRIPE_VIP_PRICE_ID || process.env.STRIPE_VIP_PRODUCT_ID;
    if (!id) throw new Error('STRIPE_VIP_PRICE_ID/STRIPE_VIP_PRODUCT_ID não configurado');
    if (!vipPriceCache) {
        if (id.startsWith('prod_')) {
            const product = await stripe.products.retrieve(id);
            const def = product.default_price;
            vipPriceCache = typeof def === 'string' ? def : def?.id;
            if (!vipPriceCache) throw new Error(`Produto ${id} sem preço padrão no Stripe`);
        } else {
            vipPriceCache = id;
        }
    }
    return { price: vipPriceCache, quantity: 1 };
}

function kiwifyCheckoutUrl(user) {
    const url = new URL(process.env.KIWIFY_CHECKOUT_URL);
    if (user.email) url.searchParams.set('email', user.email);
    if (user.name) url.searchParams.set('name', user.name);
    return url.toString();
}

// Cria a sessão de checkout do VIP
router.post('/create-session', authMiddleware, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT name, email FROM users WHERE id = $1', [req.user.id]);
        const user = rows[0] || req.user;
        if (provider() === 'kiwify') return res.json({ url: kiwifyCheckoutUrl(user) });
        if (provider() === 'cakto') return res.json({ url: caktoCheckoutUrl(user) });
        if (provider() === 'asaas') {
            try {
                return res.json({ url: await createVipCheckout(req.user.id) });
            } catch (err) {
                if (err.status) return res.status(err.status).json({ error: err.message });
                throw err;
            }
        }

        const methods = (process.env.STRIPE_PAYMENT_METHODS || 'card,pix').split(',').map((m) => m.trim()).filter(Boolean);
        const params = (types) => ({
            mode: 'payment',
            // Pix precisa estar ativado no painel do Stripe (Configurações > Formas de pagamento).
            payment_method_types: types,
            line_items: [lineItem],
            customer_email: user.email,
            customer_creation: 'always',
            allow_promotion_codes: true,
            payment_method_options: {
                // Parcelamento no cartão (Brasil): o cliente escolhe as parcelas no checkout.
                ...(types.includes('card') && installments ? { card: { installments: { enabled: true } } } : {}),
                ...(types.includes('pix') ? { pix: { expires_after_seconds: 3600 } } : {}),
                // Boleto vence em 3 dias; o VIP libera quando compensar (async_payment_succeeded).
                ...(types.includes('boleto') ? { boleto: { expires_after_days: 3 } } : {}),
            },
            success_url: `${FRONTEND_URL}/dashboard?vip=success`,
            cancel_url: `${FRONTEND_URL}/dashboard?vip=cancelled`,
            client_reference_id: String(req.user.id),
            metadata: { user_id: String(req.user.id) },
            payment_intent_data: { metadata: { user_id: String(req.user.id) } },
        });
        const lineItem = await vipLineItem();
        let installments = process.env.STRIPE_INSTALLMENTS !== '0';
        let types = methods;
        let session;
        // Se o Pix ou o parcelamento ainda não estiverem liberados na conta, tira o recurso e
        // tenta de novo: o cliente nunca fica sem conseguir comprar.
        for (let attempt = 0; !session; attempt++) {
            try {
                session = await stripe.checkout.sessions.create(params(types));
            } catch (err) {
                if (attempt < 3 && types.includes('pix') && types.length > 1 && /pix/i.test(err.message)) {
                    console.error('Stripe: Pix indisponível, checkout sem Pix:', err.message);
                    types = types.filter((m) => m !== 'pix');
                } else if (attempt < 3 && installments && /installment/i.test(err.message)) {
                    console.error('Stripe: parcelamento indisponível, checkout sem parcelas:', err.message);
                    installments = false;
                } else {
                    throw err;
                }
            }
        }
        res.json({ url: session.url });
    } catch (err) {
        console.error('Erro ao criar sessão de checkout:', err.message);
        res.status(500).json({ error: 'Erro ao iniciar checkout' });
    }
});

// VIP é pagamento único: não há assinatura para gerenciar.
router.post('/portal-session', authMiddleware, async (req, res) => {
    res.status(400).json({ error: 'O VIP é pagamento único, sem mensalidade. Dúvidas ou reembolso: tradeonia@gmail.com.' });
});

// Conferência ao iniciar: mostra nos logs se o produto/preço do VIP está pronto para o checkout.
async function checkStripeSetup() {
    if (provider() !== 'stripe') return;
    try {
        const { price } = await vipLineItem();
        const p = await stripe.prices.retrieve(price);
        console.log(`Stripe pronto: preço ${p.id} ${p.currency.toUpperCase()} ${(p.unit_amount / 100).toFixed(2)} tipo=${p.type} ativo=${p.active} modo=${p.livemode ? 'real' : 'teste'}`);
        if (p.type !== 'one_time') console.error('Stripe: o preço do VIP precisa ser de PAGAMENTO ÚNICO (não recorrente).');
        if (p.currency !== 'brl') console.error('Stripe: o preço precisa ser em BRL para aceitar Pix.');
    } catch (err) {
        console.error('Stripe: configuração do VIP com problema:', err.message);
    }
}

module.exports = router;
module.exports.provider = provider;
module.exports.checkStripeSetup = checkStripeSetup;
