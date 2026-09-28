// Venda do VIP pela Cakto: o site manda o cliente para o link de checkout (com o e-mail da conta)
// e o webhook libera o VIP pelo e-mail da compra (mesmo esquema da Kiwify, via vip_grants).
// Variáveis: CAKTO_CHECKOUT_URL, CAKTO_WEBHOOK_SECRET (a "chave secreta" do webhook na Cakto).
const express = require('express');
const pool = require('./db');
const { secureCompare } = require('./secureCompare');

const router = express.Router();

function caktoCheckoutUrl(user) {
    const url = new URL(process.env.CAKTO_CHECKOUT_URL);
    if (user.email) url.searchParams.set('email', user.email);
    if (user.name) url.searchParams.set('name', user.name);
    return url.toString();
}

// Grava o VIP na conta (se existir) e em vip_grants (para quem comprou antes de se cadastrar).
async function applyGrant(email, active, orderId) {
    const status = active ? 'active' : 'refunded';
    await pool.query(
        `INSERT INTO vip_grants (email, provider, status, subscription_id, expires_at, updated_at)
         VALUES ($1, 'cakto', $2, $3, NULL, NOW())
         ON CONFLICT (email) DO UPDATE SET provider = 'cakto', status = $2,
             subscription_id = COALESCE($3, vip_grants.subscription_id), expires_at = NULL, updated_at = NOW()`,
        [email, status, orderId]
    );
    const r = await pool.query(
        `UPDATE users SET plan = $2, subscription_status = $3, subscription_expires_at = NULL, payment_provider = 'cakto'
         WHERE LOWER(email) = $1 AND plan <> 'owner' RETURNING id`,
        [email, active ? 'vip' : 'free', status]
    );
    return r.rowCount;
}

const PAID = /approved|paid|aprovad|purchase_complete|compra_aprovada/i;
const REVOKED = /refund|reembols|chargeback|estorn|charge_back/i;

router.post('/', express.json({ limit: '500kb' }), async (req, res) => {
    const body = req.body || {};
    const secret = process.env.CAKTO_WEBHOOK_SECRET;
    // A Cakto manda a chave secreta no corpo ("secret"); aceita também no cabeçalho ou na URL.
    const got = String(body.secret || req.headers['x-cakto-secret'] || req.headers['x-webhook-secret'] || req.query.secret || '');
    if (!secret || !secureCompare(got, secret)) {
        console.error(`Webhook Cakto com chave inválida (campos: ${Object.keys(body).slice(0, 12).join(', ')})`);
        return res.status(401).json({ error: 'Chave inválida' });
    }
    const data = body.data || body;
    const event = String(body.event || body.type || data.event || '');
    const status = String(data.status || '');
    const email = String(data.customer?.email || data.customer_email || body.customer?.email || '').trim().toLowerCase();
    const orderId = data.id ? String(data.id) : (data.refId || null);
    console.log(`Cakto: evento=${event} status=${status} pedido=${orderId} email=${email.replace(/^(.{2}).*@/, '$1***@')}`);
    if (!email) return res.json({ received: true, ignored: 'sem e-mail' });
    try {
        if (REVOKED.test(event) || REVOKED.test(status)) {
            await applyGrant(email, false, orderId);
            console.log('Cakto: VIP removido (reembolso/chargeback)');
        } else if (PAID.test(event) || PAID.test(status)) {
            const n = await applyGrant(email, true, orderId);
            console.log(`Cakto: VIP liberado ✅ (${n} conta(s))`);
        }
        res.json({ received: true });
    } catch (err) {
        console.error('Erro ao processar webhook Cakto:', err.message);
        res.status(500).json({ error: 'Erro ao processar evento' });
    }
});

module.exports = { router, caktoCheckoutUrl };
