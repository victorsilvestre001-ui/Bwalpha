const jwt = require('jsonwebtoken');
const pool = require('./db');

function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido ou expirado' });
    }
}

// Sempre confere o plano atual no banco (o plano no token pode estar desatualizado
// se o usuário virou VIP depois de logar)
async function requirePaidPlan(req, res, next) {
    try {
        const result = await pool.query('SELECT plan FROM users WHERE id = $1', [req.user.id]);
        const currentPlan = result.rows[0]?.plan;

        if (!currentPlan || currentPlan === 'free') {
            return res.status(403).json({ error: 'Recurso exclusivo para assinantes VIP' });
        }

        req.user.plan = currentPlan;
        next();
    } catch (err) {
        console.error('Erro ao checar plano:', err.message);
        res.status(500).json({ error: 'Erro ao verificar assinatura' });
    }
}

module.exports = { authMiddleware, requirePaidPlan };
