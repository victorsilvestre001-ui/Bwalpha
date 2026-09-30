// Venda do VIP pela Perfect Pay: o site manda o cliente para o link de checkout (com o e-mail da conta)
// e o postback libera o VIP pelo e-mail da compra (mesmo esquema da Cakto/Kiwify, via vip_grants).
// Variáveis: PERFECTPAY_CHECKOUT_URL, PERFECTPAY_TOKEN (o "token" do postback na Perfect Pay).
const express = require('express');
const pool = require('./db');
const { secureCompare } = require('./secureCompare');

const router = express.Router();

function perfectpayCheckoutUrl(user) {
    const url = new URL(process.env.PERFECTPAY_CHECKOUT_URL);
    if (user.email) url.searchParams.set('email', user.email);
    if (user.name) url.searchParams.set('name', user.name);
    return url.toString();
}

async function applyGrant(email, active, orderId) {
    const status = active ? 'active' : 'refunded';
    await pool.query(
        `INSERT INTO vip_grants (email, provider, status, subscription_id, expires_at, updated_at)
         VALUES ($1, 'perfectpay', $2, $3, NULL, NOW())
         ON CONFLICT (email) DO UPDATE SET provider = 'perfectpay', status = $2,
             subscription_id = COALESCE($3, vip_grants.subscription_id), expires_at = NULL, updated_at = NOW()`,
        [email, status, orderId]
    );
    const r = await pool.query(
        `UPDATE users SET plan = $2, subscription_status = $3, subscription_expires_at = NULL, payment_provider = 'perfectpay'
         WHERE LOWER(email) = $1 AND plan <> 'owner' RETURNING id`,
        [email, active ? 'vip' : 'free', status]
    );
    return r.rowCount;
}

// sale_status_enum da Perfect Pay: 2 aprovado, 10 completo libera; 7 devolvido e 9 chargeback tiram.
// O resto (pendente, boleto/Pix gerado, recusado, expirado...) é ignorado.
const PAID = new Set([2, 10]);
const REVOKED_ENUM = new Set([7, 9]);
const PAID_TEXT = /^(approved|aprovad|completed|complet)/i;
const REVOKED_TEXT = /refund|reembols|devolvid|chargeback|charged_back|estorn/i;

router.post('/', express.json({ limit: '500kb' }), express.urlencoded({ extended: true }), async (req, res) => {
    const body = req.body || {};
    const token = process.env.PERFECTPAY_TOKEN;
    const got = String(body.token || req.headers['x-perfectpay-token'] || req.query.token || '');
    if (!token || !secureCompare(got, token)) {
        console.error(`Postback Perfect Pay com token inválido (campos: ${Object.keys(body).slice(0, 12).join(', ')})`);
        return res.status(401).json({ error: 'Token inválido' });
    }
    const statusEnum = Number(body.sale_status_enum);
    const statusText = String(body.sale_status_detail || body.sale_status || body.status || '');
    const email = String(body.customer?.email || body.customer_email || body.email || '').trim().toLowerCase();
    const orderId = body.code ? String(body.code) : null;
    console.log(`Perfect Pay: status=${statusEnum || '-'} ${statusText} venda=${orderId} email=${email.replace(/^(.{2}).*@/, '$1***@')}`);
    if (!email) return res.json({ received: true, ignored: 'sem e-mail' });
    try {
        if (REVOKED_ENUM.has(statusEnum) || REVOKED_TEXT.test(statusText)) {
            await applyGrant(email, false, orderId);
            console.log('Perfect Pay: VIP removido (devolução/chargeback)');
        } else if (PAID.has(statusEnum) || PAID_TEXT.test(statusText)) {
            const n = await applyGrant(email, true, orderId);
            console.log(`Perfect Pay: VIP liberado ✅ (${n} conta(s))`);
        }
        res.json({ received: true });
    } catch (err) {
        console.error('Erro ao processar postback Perfect Pay:', err.message);
        res.status(500).json({ error: 'Erro ao processar evento' });
    }
});

module.exports = { router, perfectpayCheckoutUrl };
