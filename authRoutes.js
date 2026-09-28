const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const pool = require('./db');
const { authMiddleware, OWNER_EMAIL } = require('./authMiddleware');
const { applyPendingGrant } = require('./kiwifyWebhook');
const { sendWelcomeEmail } = require('./mailer');
const { cleanCpf, isValidCpf, CPF_TAKEN } = require('./cpf');

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

// Hash de uma senha qualquer, usado quando o e-mail não existe: assim o login
// demora o mesmo tanto e não revela quais e-mails têm conta.
const DUMMY_HASH = bcrypt.hashSync('tradeon-dummy-password', 10);

// Foto de perfil: só imagem em base64 (PNG, JPEG, WebP ou GIF).
const AVATAR_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+=*$/;

router.post('/register', authLimiter, async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const email = normalizeEmail(req.body?.email);
    const { password } = req.body || {};
    const cpf = cleanCpf(req.body?.cpf);

    if (!name || !email || typeof password !== 'string' || !password || !cpf) {
        return res.status(400).json({ error: 'Nome, CPF, email e senha são obrigatórios' });
    }
    if (!isValidCpf(cpf)) {
        return res.status(400).json({ error: 'CPF inválido. Confira os números.' });
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
        const cpfInUse = await pool.query('SELECT id FROM users WHERE cpf = $1 LIMIT 1', [cpf]);
        if (cpfInUse.rows.length > 0) {
            return res.status(409).json({ error: CPF_TAKEN });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const initialPlan = email === OWNER_EMAIL ? 'owner' : 'free';

        const result = await pool.query(
            `INSERT INTO users (name, email, password_hash, plan, cpf)
             VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, plan`,
            [name, email, passwordHash, initialPlan, cpf]
        );

        // Quem comprou o VIP na Kiwify antes de criar a conta já entra como VIP.
        const user = await applyPendingGrant(result.rows[0]);
        const token = jwt.sign(
            { id: user.id, email: user.email, plan: user.plan },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Envia o e-mail de boas-vindas sem bloquear a resposta ao usuário; se o cupom foi junto,
        // a conta não entra no envio de cupom para contas antigas (painel do dono).
        sendWelcomeEmail(user.name, user.email).then((r) => {
            if (r.couponSent) {
                return pool.query('INSERT INTO coupon_emails (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
            }
        }).catch((err) => console.error('Erro ao registrar cupom enviado:', err.message));

        res.status(201).json({ user, token });
    } catch (err) {
        // Dois cadastros simultâneos com o mesmo CPF/e-mail: o índice único barra o segundo.
        if (err.code === '23505') {
            return res.status(409).json({ error: /cpf/i.test(err.constraint || '') ? CPF_TAKEN : 'Email já cadastrado' });
        }
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

    // CPF: só números e com dígitos válidos. Depois de cadastrado não pode ser trocado nem
    // apagado (senão daria para liberar o CPF e criar outra conta com ele).
    const newCpf = cpf !== undefined && cpf !== null && cpf !== '' ? cleanCpf(cpf) : null;
    if (newCpf !== null && !isValidCpf(newCpf)) {
        return res.status(400).json({ error: 'CPF inválido. Confira os números.' });
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
            const current = (await pool.query('SELECT cpf FROM users WHERE id = $1', [req.user.id])).rows[0]?.cpf || null;
            if (current && current !== newCpf) {
                return res.status(400).json({ error: 'O CPF não pode ser alterado. Se precisar corrigir, fale com o suporte.' });
            }
            if (!current && newCpf) {
                const inUse = await pool.query('SELECT id FROM users WHERE cpf = $1 AND id <> $2 LIMIT 1', [newCpf, req.user.id]);
                if (inUse.rows.length > 0) return res.status(409).json({ error: CPF_TAKEN });
                fields.push(`cpf = $${i++}`);
                values.push(newCpf);
            }
        }
        if (avatar !== undefined) {
            fields.push(`avatar_url = $${i++}`);
            values.push(avatar || null);
        }

        if (fields.length === 0) {
            // Ex.: salvou o mesmo CPF que já estava cadastrado.
            const same = await pool.query('SELECT id, name, email, plan, cpf, avatar_url FROM users WHERE id = $1', [req.user.id]);
            return res.json(same.rows[0]);
        }

        values.push(req.user.id);
        const result = await pool.query(
            `UPDATE users SET ${fields.join(', ')} WHERE id = $${i} RETURNING id, name, email, plan, cpf, avatar_url`,
            values
        );

        res.json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: CPF_TAKEN });
        console.error(err);
        res.status(500).json({ error: 'Erro ao atualizar perfil' });
    }
});

module.exports = router;
