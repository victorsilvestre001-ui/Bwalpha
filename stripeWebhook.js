const express = require('express');
const pool = require('./db');

const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Libera (ou tira) o VIP da conta. Pagamento único: sem data de expiração.
async function setVip(userId, active, customerId) {
    const result = await pool.query(
        `UPDATE users SET plan = $1, subscription_status = $2, payment_provider = 'stripe',
                stripe_customer_id = COALESCE($3, stripe_customer_id)
         WHERE id = $4 AND plan <> 'owner' RETURNING id`,
        [active ? 'vip' : 'free', active ? 'active' : 'refunded', customerId || null, userId]
    );
    return result.rowCount;
}

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
        const obj = event.data.object;
        switch (event.type) {
            // Cartão: já chega pago. Pix: chega "unpaid" e o pagamento confirma depois (async_payment_succeeded).
            case 'checkout.session.completed':
            case 'checkout.session.async_payment_succeeded': {
                const userId = obj.metadata?.user_id || obj.client_reference_id;
                if (userId && obj.payment_status === 'paid') {
                    const n = await setVip(userId, true, obj.customer);
                    console.log(`Stripe: pagamento confirmado (${event.type}), conta ${userId} VIP ✅ (${n})`);
                } else {
                    console.log(`Stripe: checkout ${obj.id} aguardando pagamento (${obj.payment_status})`);
                }
                break;
            }
            case 'checkout.session.async_payment_failed':
                console.log(`Stripe: Pix não pago/expirado no checkout ${obj.id}`);
                break;
            // Reembolso total ou contestação: tira o VIP.
            case 'charge.refunded':
            case 'charge.dispute.created': {
                const charge = event.type === 'charge.refunded' ? obj : await stripe.charges.retrieve(obj.charge);
                const pi = charge.payment_intent ? await stripe.paymentIntents.retrieve(charge.payment_intent) : null;
                const userId = pi?.metadata?.user_id;
                if (userId && (event.type === 'charge.dispute.created' || charge.refunded)) {
                    await setVip(userId, false);
                    console.log(`Stripe: ${event.type}, VIP removido da conta ${userId}`);
                }
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
