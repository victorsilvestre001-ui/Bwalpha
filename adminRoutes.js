const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const pool = require('./db');
const { authMiddleware } = require('./authMiddleware');
const { sendCouponEmail, sendTrialEmail } = require('./mailer');

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

// ---------- Envios de e-mail para contas já cadastradas (disparados pelo dono) ----------
// Cada campanha manda no máximo um e-mail por conta (registrado na tabela da campanha),
// até 200 por clique e ~2 por segundo (limite do Resend). Falhas continuam elegíveis.
const CAMPAIGN_BATCH = 200;

function registerCampaign(route, { table, where, send, notReady, info = () => ({}) }) {
    const eligibleSql = `FROM users u WHERE ${where} AND NOT EXISTS (SELECT 1 FROM ${table} c WHERE c.user_id = u.id)`;
    let running = false;

    router.get(route, authMiddleware, requireOwnerDb, async (req, res) => {
        try {
            const [eligible, sent] = await Promise.all([
                pool.query(`SELECT COUNT(*)::int AS total ${eligibleSql}`),
                pool.query(`SELECT COUNT(*)::int AS total FROM ${table}`),
            ]);
            res.json({ ...info(), ready: !notReady(), eligible: eligible.rows[0].total, alreadySent: sent.rows[0].total, running });
        } catch (err) {
            console.error(`Erro ao carregar o envio ${route}:`, err.message);
            res.status(500).json({ error: 'Erro ao carregar o envio' });
        }
    });

    router.post(route, authMiddleware, requireOwnerDb, async (req, res) => {
        const problem = notReady();
        if (problem) return res.status(400).json({ error: problem });
        if (running) return res.status(409).json({ error: 'Já existe um envio em andamento.' });
        running = true;
        let sent = 0;
        const failed = [];
        try {
            const { rows } = await pool.query(`SELECT u.id, u.name, u.email ${eligibleSql} ORDER BY u.id LIMIT $1`, [CAMPAIGN_BATCH]);
            for (const u of rows) {
                const result = await send(u.name, u.email);
                if (result.ok) {
                    await pool.query(`INSERT INTO ${table} (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [u.id]);
                    sent += 1;
                } else {
                    failed.push(maskEmail(u.email));
                    console.error(`E-mail ${route} não enviado para a conta ${u.id}:`, result.error);
                }
                await new Promise((r) => setTimeout(r, 600));
            }
            const left = await pool.query(`SELECT COUNT(*)::int AS total ${eligibleSql}`);
            console.log(`Envio ${route}: ${sent} e-mail(s) enviado(s), ${failed.length} falha(s).`);
            res.json({ sent, failed, remaining: left.rows[0].total });
        } catch (err) {
            console.error(`Erro no envio ${route}:`, err.message);
            res.status(500).json({ error: 'Erro ao enviar os e-mails', sent });
        } finally {
            running = false;
        }
    });
}

// Cupom do VIP para contas free que ainda não receberam (nem no cadastro, nem por aqui).
registerCampaign('/coupon-campaign', {
    table: 'coupon_emails',
    where: `u.plan = 'free'`,
    send: sendCouponEmail,
    notReady: () => (!process.env.SIGNUP_COUPON || !process.env.KIWIFY_CHECKOUT_URL ? 'Cupom não configurado no servidor (SIGNUP_COUPON).' : null),
    info: () => ({ coupon: process.env.SIGNUP_COUPON || null, discount: process.env.SIGNUP_COUPON_DISCOUNT || '15%' }),
});

// Aviso do teste grátis de 3 sinais: só para contas free que ainda não usaram nenhum sinal.
registerCampaign('/trial-campaign', {
    table: 'trial_emails',
    where: `u.plan = 'free' AND NOT EXISTS (SELECT 1 FROM analyses a WHERE a.user_id = u.id)`,
    send: sendTrialEmail,
    notReady: () => (!process.env.RESEND_API_KEY ? 'Envio de e-mail não configurado (RESEND_API_KEY).' : null),
});

module.exports = router;
