const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('./db');

const router = express.Router();

// Conta que deve sempre ter acesso total (dono da plataforma).
const OWNER_EMAIL = 'victor.silvestre001@gmail.com';

async function sendWelcomeEmail(name, email) {
    if (!process.env.RESEND_API_KEY) {
        console.error('RESEND_API_KEY não configurada — e-mail de boas-vindas não enviado.');
        return;
    }
    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: 'BwAlpha.IA <onboarding@resend.dev>',
                to: [email],
                subject: 'Sua conta na BwAlpha.IA foi criada 🎉',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #0B0E14; color: #F3EFE6; border-radius: 12px;">
                        <h1 style="color: #B8863D; font-size: 22px; margin-bottom: 8px;">Bem-vindo(a), ${name}!</h1>
                        <p style="font-size: 15px; line-height: 1.6; color: #F3EFE6;">
                            Sua conta na <strong>BwAlpha.IA</strong> foi criada com sucesso usando o e-mail <strong>${email}</strong>.
                        </p>
                        <p style="font-size: 15px; line-height: 1.6; color: #F3EFE6;">
                            Você já pode entrar na plataforma e acompanhar as análises de mercado em tempo real para EURUSD e EURJPY.
                        </p>
                        <a href="https://www.bwalphaia.com/auth" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: linear-gradient(180deg, #E7C68C, #B8863D); color: #0B0E14; text-decoration: none; border-radius: 6px; font-weight: 600;">
                            Acessar minha conta
                        </a>
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

router.post('/register', async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
    }

    try {
        const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Email já cadastrado' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const initialPlan = email.toLowerCase() === OWNER_EMAIL ? 'owner' : 'free';

        const result = await pool.query(
            `INSERT INTO users (name, email, password_hash, plan) 
             VALUES ($1, $2, $3, $4) RETURNING id, name, email, plan`,
            [name, email, passwordHash, initialPlan]
        );

        const user = result.rows[0];
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

router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        let user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        // Garante que a conta do dono sempre tenha o plano 'owner', mesmo que
        // tenha sido criada antes desta regra existir.
        if (email.toLowerCase() === OWNER_EMAIL && user.plan !== 'owner') {
            const updated = await pool.query(
                `UPDATE users SET plan = 'owner' WHERE id = $1 RETURNING id, name, email, plan`,
                [user.id]
            );
            user = { ...user, plan: updated.rows[0].plan };
        }

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

module.exports = router;
