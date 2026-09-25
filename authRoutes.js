const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const pool = require('./db');
const { authMiddleware, OWNER_EMAIL } = require('./authMiddleware');
const { applyPendingGrant } = require('./kiwifyWebhook');

// Limita tentativas de login/cadastro por IP, pra dificultar força bruta de senha.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 15, // no máximo 15 tentativas por IP nesse período
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' },
});

// Limite por e-mail: impede força bruta numa conta específica mesmo trocando de IP.
const loginEmailLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => `login:${normalizeEmail(req.body?.email) || 'vazio'}`,
    message: { error: 'Muitas tentativas nesta conta. Aguarde 15 minutos e tente novamente.' },
});

const router = express.Router();

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
const NAME_MAX = 100;

// E-mail sempre em minúsculas e sem espaços: evita contas duplicadas como
// "Fulano@Gmail.com" e "fulano@gmail.com".
function normalizeEmail(email) {
    return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Hash de uma senha qualquer, usado quando o e-mail não existe: assim o login
// demora o mesmo tanto e não revela quais e-mails têm conta.
const DUMMY_HASH = bcrypt.hashSync('tradeon-dummy-password', 10);

// Foto de perfil: só imagem em base64 (PNG, JPEG, WebP ou GIF).
const AVATAR_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+=*$/;


// Remetente precisa ser de um domínio verificado no Resend (resend.com/domains).
const EMAIL_FROM = process.env.EMAIL_FROM || 'TradeOn AI <contato@tradeonia.com.br>';

// Cupom de boas-vindas (criado na Kiwify). Sem SIGNUP_COUPON, o e-mail sai sem cupom.
function welcomeOffer(name, email) {
    const coupon = process.env.SIGNUP_COUPON;
    if (!coupon || !process.env.KIWIFY_CHECKOUT_URL) return null;
    const url = new URL(process.env.KIWIFY_CHECKOUT_URL);
    url.searchParams.set('email', email);
    url.searchParams.set('name', name);
    url.searchParams.set('coupon', coupon);
    return { coupon, discount: process.env.SIGNUP_COUPON_DISCOUNT || '15%', url: url.toString() };
}

async function sendWelcomeEmail(name, email) {
    if (!process.env.RESEND_API_KEY) {
        console.error('RESEND_API_KEY não configurada — e-mail de boas-vindas não enviado.');
        return;
    }
    try {
        const offer = welcomeOffer(name, email);
        const offerHtml = offer ? `
                        <div style="margin-top: 24px; padding: 20px; border: 1px dashed #00F0A8; border-radius: 10px; background: rgba(0,240,168,0.06); text-align: center;">
                            <p style="margin: 0; font-size: 14px; color: #9AA6C3;">Presente de boas-vindas</p>
                            <p style="margin: 6px 0 0; font-size: 20px; font-weight: 700; color: #E7ECF7;">${escapeHtml(offer.discount)} OFF no plano VIP</p>
                            <p style="margin: 14px 0 0; font-size: 13px; color: #9AA6C3;">Use o cupom:</p>
                            <p style="margin: 6px 0 0; font-family: 'Courier New', monospace; font-size: 26px; font-weight: 700; letter-spacing: 3px; color: #00F0A8;">${escapeHtml(offer.coupon)}</p>
                            <a href="${escapeHtml(offer.url)}" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: #00F0A8; color: #05070F; text-decoration: none; border-radius: 6px; font-weight: 700;">
                                Ativar VIP com desconto
                            </a>
                            <p style="margin: 12px 0 0; font-size: 12px; color: #5B6788;">Compre com este mesmo e-mail para o VIP ser liberado na sua conta automaticamente.</p>
                        </div>` : '';
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: EMAIL_FROM,
                to: [email],
                subject: process.env.SIGNUP_COUPON
                    ? `Sua conta na TradeOn AI foi criada 🎉 + ${process.env.SIGNUP_COUPON_DISCOUNT || '15%'} OFF no VIP`
                    : 'Sua conta na TradeOn AI foi criada 🎉',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #05070F; color: #E7ECF7; border-radius: 12px;">
                        <h1 style="color: #00F0A8; font-size: 22px; margin-bottom: 8px;">Bem-vindo(a), ${escapeHtml(name)}!</h1>
                        <p style="font-size: 15px; line-height: 1.6; color: #E7ECF7;">
                            Sua conta na <strong>TradeOn AI</strong> foi criada com sucesso usando o e-mail <strong>${escapeHtml(email)}</strong>.
                        </p>
                        <p style="font-size: 15px; line-height: 1.6; color: #E7ECF7;">
                            Você já pode entrar na plataforma e acompanhar as análises de mercado em tempo real para EURUSD, EURJPY e XAUUSD (ouro).
                        </p>
                        <a href="${process.env.FRONTEND_URL || 'https://www.tradeonia.com.br'}/auth" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: linear-gradient(100deg, #00F0A8, #3D8BFF); color: #05070F; text-decoration: none; border-radius: 6px; font-weight: 600;">
                            Acessar minha conta
                        </a>
                        ${offerHtml}
                        <p style="font-size: 12px; color: #8a8a8a; margin-top: 32px;">
                            Se você não criou essa conta, pode ignorar este e-mail com segurança.
                        </p>
                    </div>
                `,
            }),
        });
        if (!res.ok) {
            const errText = await res.text();
            console.error('Erro ao enviar e-mail de boas-vindas:', res.status, errText);
        }
    } catch (err) {
        console.error('Erro ao enviar e-mail de boas-vindas:', err);
    }
}

router.post('/register', authLimiter, async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const email = normalizeEmail(req.body?.email);
    const { password } = req.body || {};

    if (!name || !email || typeof password !== 'string' || !password) {
        return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
    }
    if (name.length > NAME_MAX) {
        return res.status(400).json({ error: `O nome pode ter no máximo ${NAME_MAX} caracteres.` });
    }
    if (!EMAIL_RE.test(email) || email.length > 150) {
        return res.status(400).json({ error: 'E-mail inválido.' });
    }
    if (password.length < PASSWORD_MIN) {
        return res.status(400).json({ error: 'A senha deve ter pelo menos 8 caracteres.' });
    }
    if (password.length > PASSWORD_MAX) {
        return res.status(400).json({ error: `A senha pode ter no máximo ${PASSWORD_MAX} caracteres.` });
    }

    try {
        const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [email]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Email já cadastrado' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const initialPlan = email === OWNER_EMAIL ? 'owner' : 'free';

        const result = await pool.query(
            `INSERT INTO users (name, email, password_hash, plan) 
             VALUES ($1, $2, $3, $4) RETURNING id, name, email, plan`,
            [name, email, passwordHash, initialPlan]
        );

        // Quem comprou o VIP na Kiwify antes de criar a conta já entra como VIP.
        const user = await applyPendingGrant(result.rows[0]);
        const token = jwt.sign(
            { id: user.id, email: user.email, plan: user.plan },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Envia o e-mail de boas-vindas sem bloquear a resposta ao usuário
        sendWelcomeEmail(user.name, user.email);

        res.status(201).json({ user, token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao criar usuário' });
    }
});

router.post('/login', authLimiter, loginEmailLimiter, async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const { password } = req.body || {};

    if (!email || typeof password !== 'string' || !password || password.length > PASSWORD_MAX) {
        return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    try {
        const result = await pool.query('SELECT * FROM users WHERE LOWER(email) = $1 ORDER BY id LIMIT 1', [email]);
        if (result.rows.length === 0) {
            await bcrypt.compare(password, DUMMY_HASH);
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        let user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        // Garante que a conta do dono sempre tenha o plano 'owner', mesmo que
        // tenha sido criada antes desta regra existir.
        if (user.email.toLowerCase() === OWNER_EMAIL && user.plan !== 'owner') {
            const updated = await pool.query(
                `UPDATE users SET plan = 'owner' WHERE id = $1 RETURNING id, name, email, plan`,
                [user.id]
            );
            user = { ...user, plan: updated.rows[0].plan };
        }
        user = await applyPendingGrant(user);

        const token = jwt.sign(
            { id: user.id, email: user.email, plan: user.plan },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            user: { id: user.id, name: user.name, email: user.email, plan: user.plan },
            token
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao fazer login' });
    }
});


// Retorna os dados completos do usuário logado (incluindo CPF e foto de perfil)
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, name, email, plan, cpf, avatar_url FROM users WHERE id = $1`,
            [req.user.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar dados do usuário' });
    }
});

// Atualiza CPF e/ou foto de perfil do usuário logado
router.patch('/profile', authMiddleware, async (req, res) => {
    const { cpf, avatar } = req.body;

    // Limpa o CPF pra guardar só os números, se foi enviado
    let cleanCpf = null;
    if (cpf !== undefined && cpf !== null && cpf !== '') {
        cleanCpf = String(cpf).slice(0, 20).replace(/\D/g, '');
        if (cleanCpf.length !== 11) {
            return res.status(400).json({ error: 'CPF inválido. Deve conter 11 dígitos.' });
        }
    }

    // Limite de tamanho pra foto (evita payloads gigantes no banco)
    if (avatar !== undefined && avatar !== null && avatar !== '') {
        if (typeof avatar !== 'string' || !AVATAR_RE.test(avatar)) {
            return res.status(400).json({ error: 'Formato de imagem inválido. Use PNG, JPG, WebP ou GIF.' });
        }
        if (avatar.length > 2_000_000) {
            return res.status(400).json({ error: 'Imagem muito grande. Escolha uma foto menor.' });
        }
    }

    try {
        const fields = [];
        const values = [];
        let i = 1;

        if (cpf !== undefined) {
            fields.push(`cpf = $${i++}`);
            values.push(cleanCpf);
        }
        if (avatar !== undefined) {
            fields.push(`avatar_url = $${i++}`);
            values.push(avatar || null);
        }

        if (fields.length === 0) {
            return res.status(400).json({ error: 'Nada para atualizar' });
        }

        values.push(req.user.id);
        const result = await pool.query(
            `UPDATE users SET ${fields.join(', ')} WHERE id = $${i} RETURNING id, name, email, plan, cpf, avatar_url`,
            values
        );

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao atualizar perfil' });
    }
});

module.exports = router;
