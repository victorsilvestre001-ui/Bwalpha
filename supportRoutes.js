const express = require('express');
const rateLimit = require('express-rate-limit');
const { sendEmail, escapeHtml } = require('./mailer');

const router = express.Router();

// Para onde vão as mensagens de dúvida do site.
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'tradeonia@gmail.com';
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

// Evita spam: no máximo 5 mensagens por hora por IP.
const supportLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Você já enviou várias mensagens. Tente de novo mais tarde ou escreva para ' + SUPPORT_EMAIL },
});

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

router.post('/', supportLimiter, async (req, res) => {
    const name = clean(req.body?.name, 100);
    const email = clean(req.body?.email, 150).toLowerCase();
    const message = clean(req.body?.message, 3000);
    const page = clean(req.body?.page, 200);
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Informe um e-mail válido para a resposta.' });
    if (message.length < 5) return res.status(400).json({ error: 'Escreva sua dúvida.' });

    const result = await sendEmail({
        to: SUPPORT_EMAIL,
        replyTo: email,
        subject: `Dúvida no site: ${name || email}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 560px;">
                <p><strong>Nome:</strong> ${escapeHtml(name || '(não informado)')}</p>
                <p><strong>E-mail:</strong> ${escapeHtml(email)}</p>
                ${page ? `<p><strong>Página:</strong> ${escapeHtml(page)}</p>` : ''}
                <p style="white-space: pre-wrap; border-left: 3px solid #00F0A8; padding-left: 12px;">${escapeHtml(message)}</p>
                <p style="color: #888; font-size: 12px;">Responda este e-mail para falar direto com a pessoa.</p>
            </div>`,
    });
    if (!result.ok) {
        console.error('Erro ao enviar dúvida do site:', result.error);
        return res.status(502).json({ error: 'Não foi possível enviar agora. Escreva para ' + SUPPORT_EMAIL });
    }
    res.json({ ok: true });
});

module.exports = router;
