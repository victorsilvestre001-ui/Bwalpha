const jwt = require('jsonwebtoken');

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

function requirePaidPlan(req, res, next) {
    if (req.user.plan === 'free') {
        return res.status(403).json({ error: 'Recurso exclusivo para assinantes' });
    }
    next();
}

module.exports = { authMiddleware, requirePaidPlan };
