// Diagnóstico de suporte: USER_LOOKUP=<e-mail ou parte dele> escreve nos logs o estado da(s)
// conta(s) parecida(s) (sem senha). Útil quando um cliente não consegue entrar.
const pool = require('./db');

// USER_EMAIL_FIX=<e-mail errado>><e-mail certo>: corrige um e-mail digitado errado no cadastro
// (só se o certo ainda não tiver conta). Pode ficar ligado: depois da troca não faz mais nada.
async function fixEmail() {
    const [from, to] = (process.env.USER_EMAIL_FIX || '').split('>').map((x) => x.trim().toLowerCase());
    if (!from || !to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return;
    try {
        const taken = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [to]);
        if (taken.rows.length) return console.log(`USER_EMAIL_FIX: ${to} já tem conta (id ${taken.rows[0].id}), nada a fazer`);
        const r = await pool.query('UPDATE users SET email = $1 WHERE LOWER(email) = $2 RETURNING id', [to, from]);
        console.log(`USER_EMAIL_FIX: ${r.rows.length ? `conta ${r.rows[0].id} agora é ${to}` : `${from} não encontrado`}`);
    } catch (err) {
        console.error('USER_EMAIL_FIX erro:', err.message);
    }
}

// VIP_GRANT_EMAILS="a@x.com,b@y.com": libera o VIP de cortesia (pedido do dono). Vale para quem já tem
// conta e para quem se cadastrar depois com o mesmo e-mail (vip_grants). Pode ficar ligado.
async function grantVip() {
    const emails = (process.env.VIP_GRANT_EMAILS || '').split(',').map((x) => x.trim().toLowerCase())
        .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    for (const email of emails) {
        try {
            await pool.query(
                `INSERT INTO vip_grants (email, provider, status, subscription_id, expires_at, updated_at)
                 VALUES ($1, 'manual', 'active', NULL, NULL, NOW())
                 ON CONFLICT (email) DO UPDATE SET status = 'active', expires_at = NULL, updated_at = NOW()`,
                [email]);
            const r = await pool.query(
                `UPDATE users SET plan = 'vip', subscription_status = 'active', subscription_expires_at = NULL, payment_provider = 'manual'
                 WHERE LOWER(email) = $1 AND plan <> 'owner' RETURNING id`, [email]);
            console.log(`VIP_GRANT: ${email} ${r.rowCount ? `liberado na conta ${r.rows[0].id}` : 'sem conta ainda; libera ao se cadastrar'}`);
        } catch (err) {
            console.error(`VIP_GRANT erro (${email}):`, err.message);
        }
    }
}

// HISTORY_RESET_USERS="email|2026-10-07T03:40:00Z,...": recomeça o histórico visível dessa conta a partir
// da data (os sinais antigos continuam no banco para os estudos). Pode ficar ligado: a data é fixa.
async function resetHistory() {
    const itens = (process.env.HISTORY_RESET_USERS || '').split(',').map((x) => x.trim().split('|')).filter(([e, d]) => e && d);
    if (!itens.length) return;
    try {
        await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS history_reset_at TIMESTAMPTZ');
        for (const [email, data] of itens) {
            const t = Date.parse(data);
            if (!Number.isFinite(t)) continue;
            const r = await pool.query('UPDATE users SET history_reset_at = $2 WHERE LOWER(email) = $1 RETURNING id', [email.toLowerCase(), new Date(t)]);
            console.log(`HISTORY_RESET: ${email} ${r.rowCount ? `conta ${r.rows[0].id} a partir de ${new Date(t).toISOString()}` : 'sem conta'}`);
        }
    } catch (err) {
        console.error('HISTORY_RESET erro:', err.message);
    }
}

async function run() {
    await fixEmail();
    await grantVip();
    await resetHistory();
    const q = (process.env.USER_LOOKUP || '').trim().toLowerCase();
    if (!q) return;
    const key = q.split('@')[0].replace(/[^a-z0-9]/g, '').slice(0, 12) || q;
    try {
        const { rows } = await pool.query(
            `SELECT u.id, u.name, u.email, u.plan, u.created_at, u.payment_provider,
                    (u.cpf IS NOT NULL) AS tem_cpf, length(u.password_hash) AS hash_len,
                    (u.email <> LOWER(TRIM(u.email))) AS email_com_maiuscula_ou_espaco,
                    (SELECT COUNT(*)::int FROM analyses a WHERE a.user_id = u.id) AS sinais,
                    (SELECT MAX(requested_at) FROM analyses a WHERE a.user_id = u.id) AS ultimo_sinal
             FROM users u
             WHERE LOWER(u.email) = $1 OR regexp_replace(LOWER(u.email), '[^a-z0-9]', '', 'g') LIKE $2
             ORDER BY u.id`,
            [q, `%${key}%`]);
        console.log(`USER_LOOKUP "${q}": ${rows.length} conta(s) ${JSON.stringify(rows)}`);
        const g = await pool.query('SELECT email, provider, status, expires_at, updated_at FROM vip_grants WHERE LOWER(email) LIKE $1', [`%${key}%`]);
        console.log(`USER_LOOKUP vip_grants ${JSON.stringify(g.rows)}`);
    } catch (err) {
        console.error('USER_LOOKUP erro:', err.message);
    }
}

module.exports = { run };
