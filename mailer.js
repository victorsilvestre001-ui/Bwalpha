// E-mails transacionais da TradeOn AI (via Resend).
// O remetente precisa ser de um domínio verificado no Resend (resend.com/domains).
const EMAIL_FROM = process.env.EMAIL_FROM || 'TradeOn AI <contato@tradeonia.com.br>';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.tradeonia.com.br';

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function sendEmail({ to, subject, html }) {
    if (!process.env.RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY não configurada' };
    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html }),
        });
        if (!res.ok) return { ok: false, error: `${res.status} ${await res.text()}` };
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

// Cupom do VIP (criado na Kiwify). Sem SIGNUP_COUPON, os e-mails saem sem cupom.
function couponOffer(name, email) {
    const coupon = process.env.SIGNUP_COUPON;
    if (!coupon || !process.env.KIWIFY_CHECKOUT_URL) return null;
    const url = new URL(process.env.KIWIFY_CHECKOUT_URL);
    url.searchParams.set('email', email);
    if (name) url.searchParams.set('name', name);
    url.searchParams.set('coupon', coupon);
    return { coupon, discount: process.env.SIGNUP_COUPON_DISCOUNT || '15%', url: url.toString() };
}

function couponBlock(offer, label) {
    return `
        <div style="margin-top: 24px; padding: 20px; border: 1px dashed #00F0A8; border-radius: 10px; background: rgba(0,240,168,0.06); text-align: center;">
            <p style="margin: 0; font-size: 14px; color: #9AA6C3;">${escapeHtml(label)}</p>
            <p style="margin: 6px 0 0; font-size: 20px; font-weight: 700; color: #E7ECF7;">${escapeHtml(offer.discount)} OFF no plano VIP</p>
            <p style="margin: 14px 0 0; font-size: 13px; color: #9AA6C3;">Use o cupom:</p>
            <p style="margin: 6px 0 0; font-family: 'Courier New', monospace; font-size: 26px; font-weight: 700; letter-spacing: 3px; color: #00F0A8;">${escapeHtml(offer.coupon)}</p>
            <a href="${escapeHtml(offer.url)}" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: #00F0A8; color: #05070F; text-decoration: none; border-radius: 6px; font-weight: 700;">
                Ativar VIP com desconto
            </a>
            <p style="margin: 12px 0 0; font-size: 12px; color: #5B6788;">Compre com este mesmo e-mail para o VIP ser liberado na sua conta automaticamente.</p>
        </div>`;
}

function layout(inner, footer) {
    return `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #05070F; color: #E7ECF7; border-radius: 12px;">
            ${inner}
            <p style="font-size: 12px; color: #8a8a8a; margin-top: 32px;">${footer}</p>
        </div>`;
}

const button = (href, text) => `
    <a href="${escapeHtml(href)}" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: linear-gradient(100deg, #00F0A8, #3D8BFF); color: #05070F; text-decoration: none; border-radius: 6px; font-weight: 600;">${text}</a>`;

// E-mail de boas-vindas (com o cupom, se configurado).
async function sendWelcomeEmail(name, email) {
    const offer = couponOffer(name, email);
    const result = await sendEmail({
        to: email,
        subject: offer
            ? `Sua conta na TradeOn AI foi criada 🎉 + ${offer.discount} OFF no VIP`
            : 'Sua conta na TradeOn AI foi criada 🎉',
        html: layout(`
            <h1 style="color: #00F0A8; font-size: 22px; margin-bottom: 8px;">Bem-vindo(a), ${escapeHtml(name)}!</h1>
            <p style="font-size: 15px; line-height: 1.6; color: #E7ECF7;">
                Sua conta na <strong>TradeOn AI</strong> foi criada com sucesso usando o e-mail <strong>${escapeHtml(email)}</strong>.
            </p>
            <p style="font-size: 15px; line-height: 1.6; color: #E7ECF7;">
                Você já pode entrar na plataforma e acompanhar as análises de mercado em tempo real para EURUSD, EURJPY e XAUUSD (ouro).
            </p>
            ${button(`${FRONTEND_URL}/auth`, 'Acessar minha conta')}
            ${offer ? couponBlock(offer, 'Presente de boas-vindas') : ''}`,
            'Se você não criou essa conta, pode ignorar este e-mail com segurança.'),
    });
    if (!result.ok) console.error('Erro ao enviar e-mail de boas-vindas:', result.error);
    return { ...result, couponSent: result.ok && !!offer };
}

module.exports = { sendEmail, sendWelcomeEmail, escapeHtml };
