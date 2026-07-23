const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('./db');
const { authMiddleware } = require('./authMiddleware');

const router = express.Router();

// Retorna os dados atuais do usuário logado (plano sempre atualizado do banco)
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, name, email, plan FROM users WHERE id = $1',
            [req.user.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        res.json({ user: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar usuário' });
    }
});

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

        const result = await pool.query(
            `INSERT INTO users (name, email, password_hash) 
             VALUES ($1, $2, $3) RETURNING id, name, email, plan`,
            [name, email, passwordHash]
        );

        const user = result.rows[0];
        const token = jwt.sign(
            { id: user.id, email: user.email, plan: user.plan },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

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

        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
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
