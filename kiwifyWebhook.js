const express = require('express');
const crypto = require('crypto');
const pool = require('./db');
const { secureCompare } = require('./secureCompare');

const router = express.Router();

// Eventos da Kiwify (campo webhook_event_type) e status do pedido (order_status).
const ACTIVATE_EVENTS = new Set(['order_approved', 'subscription_renewed']);
const REVOKE_EVENTS = new Set(['order_refunded', 'chargeback']);
const REVOKE_STATUS = new Set(['refunded', 'chargedback']);

// A Kiwify assina cada entrega: ?signature=<HMAC-SHA1 do corpo cru, com o token do webhook>.
function validSignature(rawBody, signature) {
    const token = process.env.KIWIFY_WEBHOOK_TOKEN;
    if (!token || !signature) return false;
    const expected = crypto.createHmac('sha1', token).update(rawBody).digest('hex');
    return secureCompare(expected, String(signature));
}

// Grava o estado do VIP no usuário (se já tiver conta) e em vip_grants (para quem
// comprou antes de se cadastrar, ou com a conta criada depois).
async function applyGrant(email, { plan, status, subscriptionId, expiresAt }) {
    await pool.query(
        `INSERT INTO vip_grants (email, provider, status, subscription_id, expires_at, updated_at)
         VALUES ($1, 'kiwify', $2, $3, $4, NOW())
         ON CONFLICT (email) DO UPDATE SET status = $2, subscription_id = COALESCE($3, vip_grants.subscription_id),
             expires_at = $4, updated_at = NOW()`,
        [email, status, subscriptionId, expiresAt]
    );
    const result = await pool.query(
        `UPDATE users SET plan = $2, subscription_status = $3, subscription_expires_at = $4,
                payment_provider = 'kiwify', kiwify_subscription_id = COALESCE($5, kiwify_subscription_id)
         WHERE LOWER(email) = $1 AND plan <> 'owner'
         RETURNING id`,
        [email, plan, status, expiresAt, subscriptionId]
    );
    return result.rowCount;
}

router.post('/', express.raw({ type: '*/*' }), async (req, res) => {
    const raw = req.body instanceof Buffer ? req.body.toString('utf8') : '';
    if (!process.env.KIWIFY_WEBHOOK_TOKEN) {
        console.error('Webhook Kiwify recebido, mas KIWIFY_WEBHOOK_TOKEN não está configurado.');
        return res.status(503).json({ error: 'Webhook não configurado' });
    }
    if (!validSignature(raw, req.query.signature)) {
        console.error('Webhook Kiwify com assinatura inválida.');
        return res.status(401).json({ error: 'Assinatura inválida' });
    }

    let body;
    try {
        body = JSON.parse(raw);
    } catch {
        return res.status(400).json({ error: 'JSON inválido' });
    }

    const event = body.webhook_event_type;
    const status = body.order_status;
    const email = String(body.Customer?.email || '').trim().toLowerCase();
    const subscriptionId = body.subscription_id || body.Subscription?.id || null;
    const nextPayment = body.Subscription?.next_payment ? new Date(body.Subscription.next_payment) : null;
    console.log(`Kiwify: evento=${event} status=${status} pedido=${body.order_id} assinatura=${subscriptionId} email=${email.replace(/^(.{2}).*@/, '$1***@')}`);

    if (!email) return res.json({ received: true, ignored: 'sem e-mail' });

    try {
        let updated = null;
        if (REVOKE_EVENTS.has(event) || REVOKE_STATUS.has(status)) {
            updated = await applyGrant(email, { plan: 'free', status: 'refunded', subscriptionId, expiresAt: null });
        } else if (event === 'subscription_canceled') {
            // Cancelou: mantém o VIP até o fim do período já pago.
            const until = nextPayment && nextPayment > new Date() ? nextPayment : null;
            updated = await applyGrant(email, { plan: until ? 'vip' : 'free', status: 'canceled', subscriptionId, expiresAt: until });
        } else if (event === 'subscription_late') {
            // Atrasado: a Kiwify ainda tenta cobrar; o VIP segue até cancelar de vez.
            updated = await applyGrant(email, { plan: 'vip', status: 'past_due', subscriptionId, expiresAt: null });
        } else if (ACTIVATE_EVENTS.has(event) || status === 'paid') {
            updated = await applyGrant(email, { plan: 'vip', status: 'active', subscriptionId, expiresAt: null });
        }
        if (updated != null) console.log(`Kiwify: ${updated} conta(s) atualizada(s) para o evento ${event}`);
        res.json({ received: true });
    } catch (err) {
        console.error('Erro ao processar webhook Kiwify:', err.message);
        res.status(500).json({ error: 'Erro ao processar evento' });
    }
});

// Aplica uma compra feita antes de a conta existir (ou com a conta criada depois).
async function applyPendingGrant(user) {
    if (!user?.email || user.plan === 'owner') return user;
    const { rows } = await pool.query(`SELECT * FROM vip_grants WHERE email = $1`, [user.email.toLowerCase()]);
    const grant = rows[0];
    if (!grant) return user;
    const active = grant.status === 'active' || grant.status === 'past_due'
        || (grant.status === 'canceled' && grant.expires_at && new Date(grant.expires_at) > new Date());
    const plan = active ? 'vip' : 'free';
    if (plan === user.plan) return user;
    await pool.query(
        `UPDATE users SET plan = $2, subscription_status = $3, subscription_expires_at = $4,
                payment_provider = $5, kiwify_subscription_id = $6
         WHERE id = $1`,
        [user.id, plan, grant.status, grant.expires_at, grant.provider, grant.subscription_id]
    );
    return { ...user, plan };
}

module.exports = { router, applyPendingGrant, validSignature };
