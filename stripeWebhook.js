const express = require('express');
const pool = require('./db');

const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// IMPORTANTE: essa rota precisa do corpo cru (raw), não JSON parseado —
// por isso ela é registrada no server.js ANTES do express.json() global.
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('Assinatura do webhook inválida:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const userId = session.metadata?.user_id || session.client_reference_id;
                const customerId = session.customer;
                const subscriptionId = session.subscription;

                if (userId) {
                    await pool.query(
                        `UPDATE users 
                         SET plan = 'vip', subscription_status = 'active', stripe_customer_id = $1, stripe_subscription_id = $2
                         WHERE id = $3`,
                        [customerId, subscriptionId, userId]
                    );
                    console.log(`Usuário ${userId} virou VIP ✅`);
                }
                break;
            }

            case 'customer.subscription.deleted':
            case 'customer.subscription.updated': {
                const subscription = event.data.object;
                const status = subscription.status; // active | canceled | past_due | etc.
                const isActive = status === 'active' || status === 'trialing';

                await pool.query(
                    `UPDATE users 
                     SET plan = $1, subscription_status = $2
                     WHERE stripe_subscription_id = $3`,
                    [isActive ? 'vip' : 'free', status, subscription.id]
                );
                console.log(`Assinatura ${subscription.id} atualizada: ${status}`);
                break;
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                console.log(`Pagamento falhou pra assinatura ${invoice.subscription}`);
                break;
            }

            default:
                break;
        }

        res.json({ received: true });
    } catch (err) {
        console.error('Erro ao processar webhook:', err.message);
        res.status(500).json({ error: 'Erro ao processar evento' });
    }
});

module.exports = router;
