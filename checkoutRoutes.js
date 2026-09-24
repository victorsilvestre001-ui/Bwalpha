const express = require('express');
const pool = require('./db');
const { authMiddleware } = require('./authMiddleware');

const router = express.Router();

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const VIP_PRICE_ID = process.env.STRIPE_VIP_PRICE_ID || 'price_1Tze961kvSRT3RoOkxXhq787';

// O VIP é uma assinatura mensal. Se o preço cadastrado no Stripe for de pagamento
// único (não recorrente), o Stripe recusa o checkout em modo "subscription"; nesse
// caso montamos a cobrança mensal com o mesmo valor, moeda e produto do preço.
let vipLineItemCache = null;
async function getVipLineItem() {
    if (vipLineItemCache) return vipLineItemCache;
    const price = await stripe.prices.retrieve(VIP_PRICE_ID);
    vipLineItemCache = price.recurring
        ? { price: price.id, quantity: 1 }
        : {
            price_data: {
                currency: price.currency,
                unit_amount: price.unit_amount,
                product: typeof price.product === 'string' ? price.product : price.product.id,
                recurring: { interval: 'month' },
            },
            quantity: 1,
        };
    return vipLineItemCache;
}


const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.bwalphaia.com';

// Com KIWIFY_CHECKOUT_URL configurada, o VIP é vendido pela Kiwify (o webhook libera o plano
// pelo e-mail da compra, por isso o e-mail da conta já vai preenchido). Sem ela, usa o Stripe.
function kiwifyCheckoutUrl(user) {
    const url = new URL(process.env.KIWIFY_CHECKOUT_URL);
    if (user.email) url.searchParams.set('email', user.email);
    if (user.name) url.searchParams.set('name', user.name);
    return url.toString();
}

// Cria uma sessão de checkout pra assinatura VIP
router.post('/create-session', authMiddleware, async (req, res) => {
    if (process.env.KIWIFY_CHECKOUT_URL) {
        try {
            const { rows } = await pool.query('SELECT name, email FROM users WHERE id = $1', [req.user.id]);
            return res.json({ url: kiwifyCheckoutUrl(rows[0] || req.user) });
        } catch (err) {
            console.error('Erro ao montar checkout Kiwify:', err.message);
            return res.status(500).json({ error: 'Erro ao iniciar checkout' });
        }
    }
    try {
        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [await getVipLineItem()],
            customer_email: req.user.email,
            success_url: `${FRONTEND_URL}/dashboard?vip=success`,
            cancel_url: `${FRONTEND_URL}/dashboard?vip=cancelled`,
            client_reference_id: String(req.user.id),
            metadata: { user_id: String(req.user.id) },
        });

        res.json({ url: session.url });
    } catch (err) {
        console.error('Erro ao criar sessão de checkout:', err.message);
        res.status(500).json({ error: 'Erro ao iniciar checkout' });
    }
});

// Cria uma sessão do Customer Portal (pra cancelar/gerenciar assinatura)
router.post('/portal-session', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT stripe_customer_id, payment_provider FROM users WHERE id = $1',
            [req.user.id]
        );
        if (result.rows[0]?.payment_provider === 'kiwify') {
            if (process.env.KIWIFY_MANAGE_URL) return res.json({ url: process.env.KIWIFY_MANAGE_URL });
            return res.status(400).json({
                error: 'Sua assinatura é gerenciada pela Kiwify: use o link do e-mail de compra ou fale com a gente em tradeonia@gmail.com.',
            });
        }
        const customerId = result.rows[0]?.stripe_customer_id;

        if (!customerId) {
            return res.status(400).json({ error: 'Nenhuma assinatura encontrada' });
        }

        const portalSession = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${FRONTEND_URL}/dashboard`,
        });

        res.json({ url: portalSession.url });
    } catch (err) {
        console.error('Erro ao criar sessão do portal:', err.message);
        res.status(500).json({ error: 'Erro ao abrir portal de gerenciamento' });
    }
});

module.exports = router;
