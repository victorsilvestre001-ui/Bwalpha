const express = require('express');
const pool = require('./db');
const { authMiddleware } = require('./authMiddleware');

const router = express.Router();

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.tradeonia.com.br';

// Provedor do checkout: PAYMENT_PROVIDER=stripe usa o Stripe (Pix + cartão, pagamento único);
// senão, com KIWIFY_CHECKOUT_URL configurada, usa a Kiwify.
function provider() {
    if (process.env.PAYMENT_PROVIDER === 'stripe') return 'stripe';
    return process.env.KIWIFY_CHECKOUT_URL ? 'kiwify' : 'stripe';
}

// O VIP é pagamento único: usa o preço STRIPE_VIP_PRICE_ID (preço avulso em BRL no Stripe).
function vipLineItem() {
    if (!process.env.STRIPE_VIP_PRICE_ID) throw new Error('STRIPE_VIP_PRICE_ID não configurado');
    return { price: process.env.STRIPE_VIP_PRICE_ID, quantity: 1 };
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

        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            // Pix precisa estar ativado no painel do Stripe (Configurações > Formas de pagamento).
            payment_method_types: (process.env.STRIPE_PAYMENT_METHODS || 'card,pix').split(',').map((m) => m.trim()).filter(Boolean),
            line_items: [vipLineItem()],
            customer_email: user.email,
            customer_creation: 'always',
            allow_promotion_codes: true,
            payment_method_options: { pix: { expires_after_seconds: 3600 } },
            success_url: `${FRONTEND_URL}/dashboard?vip=success`,
            cancel_url: `${FRONTEND_URL}/dashboard?vip=cancelled`,
            client_reference_id: String(req.user.id),
            metadata: { user_id: String(req.user.id) },
            payment_intent_data: { metadata: { user_id: String(req.user.id) } },
        });
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

module.exports = router;
module.exports.provider = provider;
