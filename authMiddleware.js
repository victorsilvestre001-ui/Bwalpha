const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido ou expirado' });
    }
}

function requirePaidPlan(req, res, next) {
    if (req.user.plan === 'free') {
        return res.status(403).json({ error: 'Recurso exclusivo para assinantes' });
    }
    next();
}

// Confere o plano direto no banco (e não no token): quem acabou de assinar o VIP
// ainda tem um token antigo com plan='free' até fazer login de novo.
async function requireVip(req, res, next) {
    try {
        const pool = require('./db');
        const result = await pool.query('SELECT plan FROM users WHERE id = $1', [req.user.id]);
        const plan = result.rows[0]?.plan;
        if (plan === 'vip' || plan === 'owner') return next();
        return res.status(403).json({ error: 'Os sinais da IA são exclusivos para assinantes VIP.', vipRequired: true });
    } catch (err) {
        console.error('Erro ao verificar plano:', err.message);
        return res.status(500).json({ error: 'Erro ao verificar seu plano' });
    }
}

// Reservado para futuras rotas de administração (ex: painel de métricas,
// gestão de usuários). Por enquanto só a conta marcada como plan='owner'
// passa por aqui.
function requireOwner(req, res, next) {
    if (req.user.plan !== 'owner') {
        return res.status(403).json({ error: 'Recurso exclusivo para o administrador' });
    }
    next();
}

module.exports = { authMiddleware, requirePaidPlan, requireOwner, requireVip };
