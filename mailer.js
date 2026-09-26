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

// Cupom para quem já tinha conta (enviado pelo painel do dono, com confirmação).
async function sendCouponEmail(name, email) {
    const offer = couponOffer(name, email);
    if (!offer) return { ok: false, error: 'Cupom não configurado (SIGNUP_COUPON / KIWIFY_CHECKOUT_URL)' };
    const firstName = String(name || '').trim().split(/\s+/)[0];
    return sendEmail({
        to: email,
        subject: `🎁 ${offer.discount} OFF no VIP da TradeOn AI, só para você`,
        html: layout(`
            <h1 style="color: #00F0A8; font-size: 22px; margin-bottom: 8px;">${firstName ? `${escapeHtml(firstName)}, um` : 'Um'} presente para você 🎁</h1>
            <p style="font-size: 15px; line-height: 1.6; color: #E7ECF7;">
                Obrigado por ter criado sua conta na <strong>TradeOn AI</strong>. Liberamos um desconto especial para você experimentar o plano VIP:
            </p>
            <ul style="font-size: 14px; line-height: 1.8; color: #E7ECF7; padding-left: 18px;">
                <li>Análises da IA em M1 e M5 (EURUSD, EURJPY e Ouro)</li>
                <li>Contagem até a entrada, sincronizada com o servidor</li>
                <li>Histórico de WIN/RED com a sua taxa de acerto real</li>
                <li>Assistente de IA ilimitado</li>
            </ul>
            ${couponBlock(offer, 'Cupom exclusivo')}
            ${button(`${FRONTEND_URL}/auth`, 'Acessar minha conta')}`,
            'Você recebeu este e-mail porque criou uma conta na TradeOn AI. Conteúdo educativo; operar envolve risco.'),
    });
}

// Aviso para contas já cadastradas: teste grátis de 3 sinais liberado.
async function sendTrialEmail(name, email) {
    const firstName = String(name || '').trim().split(/\s+/)[0];
    const offer = couponOffer(name, email);
    return sendEmail({
        to: email,
        subject: '🎁 Liberamos 3 sinais grátis da IA para você testar',
        html: layout(`
            <h1 style="color: #00F0A8; font-size: 22px; margin-bottom: 8px;">${firstName ? `${escapeHtml(firstName)}, seu` : 'Seu'} teste grátis está liberado 🎁</h1>
            <p style="font-size: 15px; line-height: 1.6; color: #E7ECF7;">
                Agora toda conta da <strong>TradeOn AI</strong> pode testar <strong>3 sinais da IA de graça</strong>, sem precisar ser VIP.
            </p>
            <ol style="font-size: 14px; line-height: 1.8; color: #E7ECF7; padding-left: 18px;">
                <li>Entre na sua conta</li>
                <li>Escolha o ativo (EURUSD, EURJPY ou Ouro) e o tempo (M1 ou M5)</li>
                <li>Clique em <strong>Analisar com IA</strong></li>
            </ol>
            <p style="font-size: 14px; line-height: 1.6; color: #9AA6C3;">
                A IA espera o candle fechar, mostra COMPRA ou VENDA com a contagem até a entrada, e depois confere o resultado no seu histórico (WIN ou RED).
                Os 3 sinais valem no seu primeiro dia de uso.
            </p>
            ${button(`${FRONTEND_URL}/auth`, 'Testar meus 3 sinais')}
            ${offer ? `<p style="font-size: 13px; line-height: 1.6; color: #9AA6C3; margin-top: 20px;">Gostou? Use o cupom <strong style="color: #00F0A8; font-family: 'Courier New', monospace;">${escapeHtml(offer.coupon)}</strong> para ${escapeHtml(offer.discount)} OFF no VIP.</p>` : ''}`,
            'Você recebeu este e-mail porque tem uma conta na TradeOn AI. Conteúdo educativo; operar envolve risco.'),
    });
}

module.exports = { sendEmail, sendWelcomeEmail, sendCouponEmail, sendTrialEmail, escapeHtml };
