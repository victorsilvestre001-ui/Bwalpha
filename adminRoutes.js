const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const pool = require('./db');
const { authMiddleware } = require('./authMiddleware');
const { sendCouponEmail, sendTrialEmail, sendMarketOpenEmail, sendPixReminderEmail, sendResultsEmail } = require('./mailer');

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

// campaign (opcional): envios que se repetem (ex.: um por dia) usam a tabela campaign_emails
// com uma chave; sem ela, a tabela da campanha guarda só user_id (um e-mail por conta, para sempre).
function registerCampaign(route, { table, campaign, where, send, notReady, info = () => ({}) }) {
    const sentFilter = () => (campaign
        ? { sql: `NOT EXISTS (SELECT 1 FROM campaign_emails c WHERE c.user_id = u.id AND c.campaign = $1)`, params: [campaign()] }
        : { sql: `NOT EXISTS (SELECT 1 FROM ${table} c WHERE c.user_id = u.id)`, params: [] });
    const eligible = () => {
        const f = sentFilter();
        return { sql: `FROM users u WHERE ${where} AND ${f.sql}`, params: f.params };
    };
    const countSent = () => (campaign
        ? pool.query('SELECT COUNT(*)::int AS total FROM campaign_emails WHERE campaign = $1', [campaign()])
        : pool.query(`SELECT COUNT(*)::int AS total FROM ${table}`));
    const markSent = (userId) => (campaign
        ? pool.query('INSERT INTO campaign_emails (campaign, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [campaign(), userId])
        : pool.query(`INSERT INTO ${table} (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [userId]));
    let running = false;

    router.get(route, authMiddleware, requireOwnerDb, async (req, res) => {
        try {
            const e = eligible();
            const [elig, sent] = await Promise.all([
                pool.query(`SELECT COUNT(*)::int AS total ${e.sql}`, e.params),
                countSent(),
            ]);
            res.json({ ...info(), ready: !notReady(), eligible: elig.rows[0].total, alreadySent: sent.rows[0].total, running });
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
            const e = eligible();
            const { rows } = await pool.query(
                `SELECT u.id, u.name, u.email, u.plan,
                        (SELECT COUNT(*)::int FROM analyses a WHERE a.user_id = u.id) AS signals_used,
                        COALESCE((SELECT BOOL_OR((a.requested_at AT TIME ZONE '${TZ}')::date < ${TODAY_LOCAL})
                                  FROM analyses a WHERE a.user_id = u.id), false) AS trial_expired
                 ${e.sql} ORDER BY u.id LIMIT ${CAMPAIGN_BATCH}`,
                e.params
            );
            for (const u of rows) {
                const result = await send(u.name, u.email, u);
                if (result.ok) {
                    await markSent(u.id);
                    sent += 1;
                } else {
                    failed.push(maskEmail(u.email));
                    console.error(`E-mail ${route} não enviado para a conta ${u.id}:`, result.error);
                }
                await new Promise((r) => setTimeout(r, 600));
            }
            const left = eligible();
            const leftCount = await pool.query(`SELECT COUNT(*)::int AS total ${left.sql}`, left.params);
            console.log(`Envio ${route}: ${sent} e-mail(s) enviado(s), ${failed.length} falha(s).`);
            res.json({ sent, failed, remaining: leftCount.rows[0].total });
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
    notReady: () => (!process.env.SIGNUP_COUPON ? 'Cupom não configurado no servidor (SIGNUP_COUPON).' : null),
    info: () => ({ coupon: process.env.SIGNUP_COUPON || null, discount: process.env.SIGNUP_COUPON_DISCOUNT || '15%' }),
});

// Aviso do teste grátis de 3 sinais: só para contas free que ainda não usaram nenhum sinal.
registerCampaign('/trial-campaign', {
    table: 'trial_emails',
    where: `u.plan = 'free' AND NOT EXISTS (SELECT 1 FROM analyses a WHERE a.user_id = u.id)`,
    send: sendTrialEmail,
    notReady: () => (!process.env.RESEND_API_KEY ? 'Envio de e-mail não configurado (RESEND_API_KEY).' : null),
});

// "Mercado aberto": aviso para todas as contas (menos a do dono), no máximo um por dia.
// O texto muda conforme a conta: VIP, free com teste disponível ou free com teste encerrado.
registerCampaign('/market-open-campaign', {
    campaign: () => `mercado-aberto-${new Date().toLocaleDateString('en-CA', { timeZone: TZ })}`,
    where: `u.plan <> 'owner'`,
    send: sendMarketOpenEmail,
    notReady: () => (!process.env.RESEND_API_KEY ? 'Envio de e-mail não configurado (RESEND_API_KEY).' : null),
});

// Resultados (imagem do histórico M1 de 28/09: 8 WIN em 9): uma vez por conta. O nome da campanha
// mudou, então quem recebeu o aviso anterior (4 WIN) recebe este também.
registerCampaign('/results-campaign', {
    campaign: () => 'resultados-m1-2809-9sinais',
    where: `u.plan <> 'owner'`,
    send: sendResultsEmail,
    notReady: () => (!process.env.RESEND_API_KEY ? 'Envio de e-mail não configurado (RESEND_API_KEY).' : null),
});

// Lembrete de Pix/boleto não pago para um e-mail específico (dono digita no painel).
const pixReminderLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
router.post('/pix-reminder', authMiddleware, requireOwnerDb, pixReminderLimiter, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        return res.status(400).json({ error: 'E-mail inválido' });
    }
    try {
        const { rows } = await pool.query(`SELECT name, plan FROM users WHERE LOWER(email) = $1`, [email]);
        const user = rows[0];
        if (user && (user.plan === 'vip' || user.plan === 'owner')) {
            return res.status(409).json({ error: 'Essa conta já é VIP (o pagamento já foi confirmado).' });
        }
        const result = await sendPixReminderEmail(user?.name || String(req.body?.name || '').slice(0, 80), email);
        if (!result.ok) {
            console.error('Erro ao enviar lembrete de Pix:', result.error);
            return res.status(502).json({ error: 'Não foi possível enviar o e-mail agora.' });
        }
        console.log(`Lembrete de Pix enviado para ${email.replace(/^(.{2}).*@/, '$1***@')} (conta ${user ? 'existe' : 'não existe'})`);
        res.json({ sent: true, hasAccount: !!user, name: user?.name || null });
    } catch (err) {
        console.error('Erro no lembrete de Pix:', err.message);
        res.status(500).json({ error: 'Erro ao enviar lembrete' });
    }
});

module.exports = router;
