// Diagnóstico de suporte: USER_LOOKUP=<e-mail ou parte dele> escreve nos logs o estado da(s)
// conta(s) parecida(s) (sem senha). Útil quando um cliente não consegue entrar.
const pool = require('./db');

async function run() {
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
