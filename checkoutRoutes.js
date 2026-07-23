const express = require('express');
const pool = require('./db');
const { authMiddleware } = require('./authMiddleware');

const router = express.Router();

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const VIP_PRICE_ID = 'price_1TwKmk1zbvxTzBS9O3S0q8xa';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://bwalpha-frontend.vercel.app';

// Cria uma sessão de checkout do Stripe pra assinatura VIP
router.post('/create-session', authMiddleware, async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [{ price: VIP_PRICE_ID, quantity: 1 }],
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
            'SELECT stripe_customer_id FROM users WHERE id = $1',
            [req.user.id]
        );
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
