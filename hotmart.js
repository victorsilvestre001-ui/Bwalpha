// Venda do VIP pela Hotmart: o site manda o cliente para o link de checkout (com o e-mail da conta)
// e o webhook (postback 2.0) libera o VIP pelo e-mail do comprador (mesmo esquema da Cakto, via vip_grants).
// Variáveis: HOTMART_CHECKOUT_URL, HOTMART_HOTTOK (o "hottok" da conta, em Ferramentas > Webhook).
const express = require('express');
const pool = require('./db');
const { secureCompare } = require('./secureCompare');

const router = express.Router();

function hotmartCheckoutUrl(user) {
    const url = new URL(process.env.HOTMART_CHECKOUT_URL);
    if (user.email) url.searchParams.set('email', user.email);
    if (user.name) url.searchParams.set('name', user.name);
    return url.toString();
}

async function applyGrant(email, active, orderId) {
    const status = active ? 'active' : 'refunded';
    await pool.query(
        `INSERT INTO vip_grants (email, provider, status, subscription_id, expires_at, updated_at)
         VALUES ($1, 'hotmart', $2, $3, NULL, NOW())
         ON CONFLICT (email) DO UPDATE SET provider = 'hotmart', status = $2,
             subscription_id = COALESCE($3, vip_grants.subscription_id), expires_at = NULL, updated_at = NOW()`,
        [email, status, orderId]
    );
    const r = await pool.query(
        `UPDATE users SET plan = $2, subscription_status = $3, subscription_expires_at = NULL, payment_provider = 'hotmart'
         WHERE LOWER(email) = $1 AND plan <> 'owner' RETURNING id`,
        [email, active ? 'vip' : 'free', status]
    );
    return r.rowCount;
}

// Eventos da Hotmart: aprovada/completa libera; reembolso, chargeback e cancelamento tiram.
// (Boleto/Pix gerado, atrasado, expirado etc. são ignorados.)
const PAID_EVENTS = new Set(['PURCHASE_APPROVED', 'PURCHASE_COMPLETE']);
const REVOKED_EVENTS = new Set(['PURCHASE_REFUNDED', 'PURCHASE_CHARGEBACK', 'PURCHASE_CANCELED', 'PURCHASE_PROTEST']);

router.post('/', express.json({ limit: '500kb' }), async (req, res) => {
    const body = req.body || {};
    const hottok = process.env.HOTMART_HOTTOK;
    const got = String(req.headers['x-hotmart-hottok'] || body.hottok || req.query.hottok || '');
    if (!hottok || !secureCompare(got, hottok)) {
        console.error(`Webhook Hotmart com hottok inválido (campos: ${Object.keys(body).slice(0, 12).join(', ')})`);
        return res.status(401).json({ error: 'Hottok inválido' });
    }
    const event = String(body.event || '').toUpperCase();
    const data = body.data || {};
    const email = String(data.buyer?.email || body.email || '').trim().toLowerCase();
    const orderId = data.purchase?.transaction ? String(data.purchase.transaction) : null;
    console.log(`Hotmart: evento=${event} status=${data.purchase?.status || '-'} transação=${orderId} email=${email.replace(/^(.{2}).*@/, '$1***@')}`);
    if (!email) return res.json({ received: true, ignored: 'sem e-mail' });
    // O botão "Enviar teste" da Hotmart usa e-mails fictícios: valida o hottok e não mexe em nada.
    if (/@example\.(com|org|net)$/i.test(email)) {
        console.log('Hotmart: evento de teste recebido e validado (e-mail fictício, nada foi alterado)');
        return res.json({ received: true, test: true });
    }
    try {
        if (REVOKED_EVENTS.has(event)) {
            await applyGrant(email, false, orderId);
            console.log('Hotmart: VIP removido (reembolso/chargeback/cancelamento)');
        } else if (PAID_EVENTS.has(event)) {
            const n = await applyGrant(email, true, orderId);
            console.log(`Hotmart: VIP liberado ✅ (${n} conta(s))`);
        }
        res.json({ received: true });
    } catch (err) {
        console.error('Erro ao processar webhook Hotmart:', err.message);
        res.status(500).json({ error: 'Erro ao processar evento' });
    }
});

module.exports = { router, hotmartCheckoutUrl };
