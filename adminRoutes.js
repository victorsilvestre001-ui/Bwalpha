const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const pool = require('./db');
const { authMiddleware } = require('./authMiddleware');
const { sendCouponEmail } = require('./mailer');

const router = express.Router();

// Datas do painel no horário de Brasília.
const TZ = 'America/Sao_Paulo';
// users.created_at é TIMESTAMP sem fuso (gravado em UTC); page_visits usa TIMESTAMPTZ.
const USER_LOCAL = `((created_at AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}')`;
const VISIT_LOCAL = `(created_at AT TIME ZONE '${TZ}')`;
const TODAY_LOCAL = `(NOW() AT TIME ZONE '${TZ}')::date`;

const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|headless|lighthouse|pingdom|uptime|curl|wget|python-requests/i;

const visitLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });

// Visitante anônimo: hash do IP + navegador + dia, com segredo do servidor. Nada disso é
// guardado em claro e o código muda todo dia, então só serve para contar pessoas por dia.
function visitorHash(req, day) {
    const salt = process.env.JWT_SECRET || 'tradeon';
    return crypto.createHash('sha256')
        .update(`${salt}|${day}|${req.ip}|${req.get('user-agent') || ''}`)
        .digest('hex');
}

function cleanText(value, max) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

// Registra uma visita de página (chamado pelo site a cada página aberta).
router.post('/visit', visitLimiter, async (req, res) => {
    const ua = req.get('user-agent') || '';
    if (!ua || BOT_UA.test(ua)) return res.status(204).end();

    const path = cleanText(req.body?.path, 200);
    if (!path.startsWith('/')) return res.status(400).json({ error: 'Caminho inválido' });
    const source = cleanText(req.body?.source, 100).toLowerCase() || null;

    try {
        const day = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
        await pool.query(
            `INSERT INTO page_visits (path, visitor_hash, source) VALUES ($1, $2, $3)`,
            [path, visitorHash(req, day), source]
        );
        res.status(204).end();
    } catch (err) {
        console.error('Erro ao registrar visita:', err.message);
        res.status(204).end(); // contagem nunca atrapalha o site
    }
});

// Só a conta dona: confere o plano no banco (o token pode ser antigo).
async function requireOwnerDb(req, res, next) {
    try {
        const { rows } = await pool.query('SELECT plan FROM users WHERE id = $1', [req.user.id]);
        if (rows[0]?.plan === 'owner') return next();
        return res.status(403).json({ error: 'Painel exclusivo do administrador' });
    } catch (err) {
        console.error('Erro ao verificar dono:', err.message);
        return res.status(500).json({ error: 'Erro ao verificar permissão' });
    }
}

function maskEmail(email) {
    const [user, domain] = String(email).split('@');
    if (!domain) return email;
    return `${user.slice(0, 2)}${'*'.repeat(Math.max(1, Math.min(6, user.length - 2)))}@${domain}`;
}

router.get('/stats', authMiddleware, requireOwnerDb, async (req, res) => {
    try {
        const [accounts, visits, daily, pages, sources, recent, signals] = await Promise.all([
            pool.query(`
                SELECT COUNT(*)::int AS total,
                       COUNT(*) FILTER (WHERE ${USER_LOCAL}::date = ${TODAY_LOCAL})::int AS today,
                       COUNT(*) FILTER (WHERE ${USER_LOCAL}::date > ${TODAY_LOCAL} - 7)::int AS last7,
                       COUNT(*) FILTER (WHERE ${USER_LOCAL}::date > ${TODAY_LOCAL} - 30)::int AS last30,
                       COUNT(*) FILTER (WHERE plan = 'vip')::int AS vip
                FROM users WHERE plan <> 'owner'`),
            pool.query(`
                SELECT COUNT(*)::int AS total,
                       COUNT(*) FILTER (WHERE ${VISIT_LOCAL}::date = ${TODAY_LOCAL})::int AS today,
                       COUNT(*) FILTER (WHERE ${VISIT_LOCAL}::date > ${TODAY_LOCAL} - 7)::int AS last7,
                       COUNT(*) FILTER (WHERE ${VISIT_LOCAL}::date > ${TODAY_LOCAL} - 30)::int AS last30,
                       COUNT(DISTINCT visitor_hash) FILTER (WHERE ${VISIT_LOCAL}::date = ${TODAY_LOCAL})::int AS unique_today
                FROM page_visits`),
            pool.query(`
                WITH days AS (
                    SELECT generate_series(${TODAY_LOCAL} - 13, ${TODAY_LOCAL}, INTERVAL '1 day')::date AS day
                ), v AS (
                    SELECT ${VISIT_LOCAL}::date AS day, COUNT(*)::int AS visits, COUNT(DISTINCT visitor_hash)::int AS people
                    FROM page_visits WHERE created_at > NOW() - INTERVAL '15 days' GROUP BY 1
                ), u AS (
                    SELECT ${USER_LOCAL}::date AS day, COUNT(*)::int AS signups
                    FROM users WHERE plan <> 'owner' AND created_at > NOW() - INTERVAL '15 days' GROUP BY 1
                )
                SELECT to_char(days.day, 'YYYY-MM-DD') AS day,
                       COALESCE(v.visits, 0) AS visits, COALESCE(v.people, 0) AS people, COALESCE(u.signups, 0) AS signups
                FROM days LEFT JOIN v USING (day) LEFT JOIN u USING (day) ORDER BY days.day`),
            pool.query(`
                SELECT path, COUNT(*)::int AS visits FROM page_visits
                WHERE created_at > NOW() - INTERVAL '7 days' GROUP BY path ORDER BY visits DESC LIMIT 6`),
            pool.query(`
                SELECT COALESCE(source, 'direto') AS source, COUNT(*)::int AS visits FROM page_visits
                WHERE created_at > NOW() - INTERVAL '7 days' GROUP BY 1 ORDER BY visits DESC LIMIT 6`),
            pool.query(`
                SELECT name, email, plan, created_at FROM users WHERE plan <> 'owner'
                ORDER BY created_at DESC LIMIT 8`),
            pool.query(`
                SELECT COUNT(*) FILTER (WHERE (requested_at AT TIME ZONE '${TZ}')::date = ${TODAY_LOCAL})::int AS today
                FROM analyses`),
        ]);

        const days = daily.rows;
        const people7 = days.slice(-7).reduce((sum, d) => sum + d.people, 0);
        res.json({
            generatedAt: new Date().toISOString(),
            accounts: accounts.rows[0],
            visits: { ...visits.rows[0], avgPeople7: Math.round(people7 / 7) },
            signalsToday: signals.rows[0].today,
            daily: days,
            topPages: pages.rows,
            topSources: sources.rows,
            recentUsers: recent.rows.map((u) => ({
                name: u.name,
                email: maskEmail(u.email),
                plan: u.plan,
                createdAt: u.created_at,
            })),
        });
    } catch (err) {
        console.error('Erro ao montar painel do dono:', err.message);
        res.status(500).json({ error: 'Erro ao carregar o painel' });
    }
});

// ---------- Cupom do VIP para quem já tinha conta ----------
// Contas free que ainda não receberam o cupom (nem no cadastro, nem por aqui).
const COUPON_ELIGIBLE_SQL = `
    FROM users u
    WHERE u.plan = 'free' AND NOT EXISTS (SELECT 1 FROM coupon_emails c WHERE c.user_id = u.id)`;
const COUPON_BATCH = 200;
let couponRunning = false;

router.get('/coupon-campaign', authMiddleware, requireOwnerDb, async (req, res) => {
    try {
        const [eligible, sent] = await Promise.all([
            pool.query(`SELECT COUNT(*)::int AS total ${COUPON_ELIGIBLE_SQL}`),
            pool.query('SELECT COUNT(*)::int AS total FROM coupon_emails'),
        ]);
        res.json({
            coupon: process.env.SIGNUP_COUPON || null,
            discount: process.env.SIGNUP_COUPON_DISCOUNT || '15%',
            eligible: eligible.rows[0].total,
            alreadySent: sent.rows[0].total,
            running: couponRunning,
        });
    } catch (err) {
        console.error('Erro ao contar contas para o cupom:', err.message);
        res.status(500).json({ error: 'Erro ao carregar o envio de cupom' });
    }
});

// Envia o cupom para as contas elegíveis (até 200 por clique; cada conta recebe uma vez só).
router.post('/coupon-campaign', authMiddleware, requireOwnerDb, async (req, res) => {
    if (!process.env.SIGNUP_COUPON || !process.env.KIWIFY_CHECKOUT_URL) {
        return res.status(400).json({ error: 'Cupom não configurado no servidor (SIGNUP_COUPON).' });
    }
    if (couponRunning) return res.status(409).json({ error: 'Já existe um envio em andamento.' });
    couponRunning = true;
    let sent = 0;
    const failed = [];
    try {
        const { rows } = await pool.query(
            `SELECT u.id, u.name, u.email ${COUPON_ELIGIBLE_SQL} ORDER BY u.id LIMIT $1`,
            [COUPON_BATCH]
        );
        for (const u of rows) {
            const result = await sendCouponEmail(u.name, u.email);
            if (result.ok) {
                await pool.query('INSERT INTO coupon_emails (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [u.id]);
                sent += 1;
            } else {
                failed.push(maskEmail(u.email));
                console.error(`Cupom não enviado para a conta ${u.id}:`, result.error);
            }
            await new Promise((r) => setTimeout(r, 600)); // limite do Resend: ~2 e-mails por segundo
        }
        const left = await pool.query(`SELECT COUNT(*)::int AS total ${COUPON_ELIGIBLE_SQL}`);
        console.log(`Cupom: ${sent} e-mail(s) enviado(s), ${failed.length} falha(s).`);
        res.json({ sent, failed, remaining: left.rows[0].total });
    } catch (err) {
        console.error('Erro no envio de cupom:', err.message);
        res.status(500).json({ error: 'Erro ao enviar os cupons', sent });
    } finally {
        couponRunning = false;
    }
});

module.exports = router;
