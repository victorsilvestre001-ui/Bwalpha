// E-mails transacionais da TradeOn AI (via Resend).
// O remetente precisa ser de um domínio verificado no Resend (resend.com/domains).
const EMAIL_FROM = process.env.EMAIL_FROM || 'TradeOn AI <contato@tradeonia.com.br>';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://www.tradeonia.com.br';

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function sendEmail({ to, subject, html, replyTo }) {
    if (!process.env.RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY não configurada' };
    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
        });
        if (!res.ok) return { ok: false, error: `${res.status} ${await res.text()}` };
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

// Link do checkout da Hotmart com e-mail/nome preenchidos e, se houver, o cupom já aplicado (offDiscount).
function hotmartLink(name, email, withCoupon = true) {
    if (process.env.PAYMENT_PROVIDER !== 'hotmart' || !process.env.HOTMART_CHECKOUT_URL) return null;
    const url = new URL(process.env.HOTMART_CHECKOUT_URL);
    if (email) url.searchParams.set('email', email);
    if (name) url.searchParams.set('name', name);
    if (withCoupon && process.env.SIGNUP_COUPON) url.searchParams.set('offDiscount', process.env.SIGNUP_COUPON);
    return url.toString();
}

// Cupom do VIP (criado na Kiwify). Sem SIGNUP_COUPON, os e-mails saem sem cupom.
// Com o Stripe, o link leva ao painel (o botão de VIP abre o checkout) e o cupom é digitado
// no campo "código promocional" do pagamento.
function couponOffer(name, email) {
    const coupon = process.env.SIGNUP_COUPON;
    if (!coupon) return null;
    // Hotmart: o link do checkout já leva o e-mail e aplica o cupom (parâmetro offDiscount).
    const hm = hotmartLink(name, email);
    if (hm) return { coupon, discount: process.env.SIGNUP_COUPON_DISCOUNT || '15%', url: hm };
    if ((process.env.PAYMENT_PROVIDER && process.env.PAYMENT_PROVIDER !== 'kiwify') || !process.env.KIWIFY_CHECKOUT_URL) {
        return { coupon, discount: process.env.SIGNUP_COUPON_DISCOUNT || '15%', url: `${FRONTEND_URL}/dashboard?upgrade=1` };
    }
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

// "Mercado aberto": o convite muda conforme o plano da conta.
async function sendMarketOpenEmail(name, email, account = {}) {
    const firstName = String(name || '').trim().split(/\s+/)[0];
    const hi = firstName ? `${escapeHtml(firstName)}, o` : 'O';
    const vip = account.plan === 'vip' || account.plan === 'owner';
    const trialLeft = !vip && !account.trial_expired && (account.signals_used || 0) < (parseInt(process.env.FREE_TRIAL_SIGNALS ?? '0', 10) || 0);
    const offer = !vip && !trialLeft ? couponOffer(name, email) : null;

    const body = vip
        ? `<p style="font-size: 15px; line-height: 1.6; color: #E7ECF7;">Os ativos já estão em movimento. Entre no painel, escolha <strong>EURUSD, EURJPY ou Ouro</strong> e deixe a IA ler o candle para você.</p>
           ${button(`${FRONTEND_URL}/dashboard`, 'Abrir o painel')}`
        : trialLeft
            ? `<p style="font-size: 15px; line-height: 1.6; color: #E7ECF7;">Seus <strong>3 sinais grátis</strong> estão esperando por você. Ótimo momento para testar a IA com o mercado em movimento.</p>
               ${button(`${FRONTEND_URL}/dashboard`, 'Testar meus sinais grátis')}`
            : `<p style="font-size: 15px; line-height: 1.6; color: #E7ECF7;">Com o <strong>VIP</strong> você recebe as análises da IA sem limite, com contagem até a entrada e histórico de WIN/RED.</p>
               ${offer ? couponBlock(offer, 'Condição especial') : button(`${FRONTEND_URL}/dashboard`, 'Conhecer o VIP')}`;

    return sendEmail({
        to: email,
        subject: '📈 Mercado aberto: a IA da TradeOn já está analisando',
        html: layout(`
            <h1 style="color: #00F0A8; font-size: 22px; margin-bottom: 8px;">${hi} mercado está aberto! 📈</h1>
            ${body}
            <p style="font-size: 13px; line-height: 1.6; color: #9AA6C3; margin-top: 20px;">Lembre da gestão: valor fixo por entrada e stop diário. Confiança não é garantia.</p>`,
            'Você recebeu este e-mail porque tem uma conta na TradeOn AI. Conteúdo educativo; operar envolve risco.'),
    });
}

// Lembrete para quem gerou o Pix (ou boleto) e não concluiu o pagamento (link da Hotmart, ou Kiwify).
async function sendPixReminderEmail(name, email) {
    const firstName = String(name || '').trim().split(/\s+/)[0];
    let checkout = hotmartLink(name, email) || `${FRONTEND_URL}/dashboard?upgrade=1`;
    if (process.env.PAYMENT_PROVIDER !== 'hotmart' && (!process.env.PAYMENT_PROVIDER || process.env.PAYMENT_PROVIDER === 'kiwify') && process.env.KIWIFY_CHECKOUT_URL) {
        const url = new URL(process.env.KIWIFY_CHECKOUT_URL);
        url.searchParams.set('email', email);
        if (name) url.searchParams.set('name', name);
        if (process.env.SIGNUP_COUPON) url.searchParams.set('coupon', process.env.SIGNUP_COUPON);
        checkout = url.toString();
    }
    const offer = couponOffer(name, email);
    return sendEmail({
        to: email,
        subject: 'Seu Pix do VIP TradeOn AI ainda não foi pago',
        html: layout(`
            <h1 style="color: #00F0A8; font-size: 22px; margin-bottom: 8px;">${firstName ? `${escapeHtml(firstName)}, falta` : 'Falta'} só um passo ⏳</h1>
            <p style="font-size: 15px; line-height: 1.6; color: #E7ECF7;">
                Vimos que você gerou um <strong>Pix para o VIP da TradeOn AI</strong>, mas o pagamento ainda não foi confirmado.
            </p>
            <p style="font-size: 15px; line-height: 1.6; color: #E7ECF7;">O que falta para finalizar:</p>
            <ol style="font-size: 14px; line-height: 1.8; color: #E7ECF7; padding-left: 18px;">
                <li>Abra o app do seu banco e pague o Pix (QR Code ou <strong>copia e cola</strong>) que apareceu na tela de compra.</li>
                <li>O Pix tem prazo de validade. Se venceu, é só gerar um novo pelo botão abaixo.</li>
                <li>Use este mesmo e-mail (<strong>${escapeHtml(email)}</strong>) para o VIP ser liberado na sua conta automaticamente.</li>
            </ol>
            <p style="font-size: 14px; line-height: 1.6; color: #9AA6C3;">
                Assim que o pagamento cair, o acesso é liberado na hora. É pagamento único, sem mensalidade.
            </p>
            ${checkout ? button(checkout, 'Finalizar pagamento') : ''}
            ${offer ? `<p style="font-size: 13px; line-height: 1.6; color: #9AA6C3; margin-top: 20px;">O cupom <strong style="color: #00F0A8; font-family: 'Courier New', monospace;">${escapeHtml(offer.coupon)}</strong> (${escapeHtml(offer.discount)} OFF) ${process.env.PAYMENT_PROVIDER === 'stripe' ? 'é só digitar no campo "código promocional" do pagamento.' : 'já vai aplicado no link.'}</p>` : ''}
            <p style="font-size: 14px; line-height: 1.6; color: #9AA6C3; margin-top: 20px;">
                Teve alguma dificuldade? É só responder este e-mail que a gente te ajuda.
            </p>`,
            'Você recebeu este e-mail porque iniciou uma compra na TradeOn AI. Se já pagou, pode ignorar. Conteúdo educativo; operar envolve risco.'),
        replyTo: process.env.SUPPORT_EMAIL || 'tradeonia@gmail.com',
    });
}

// Aviso: o pagamento do VIP mudou para um novo link (Hotmart), já com o cupom de desconto aplicado.
async function sendNewCheckoutEmail(name, email) {
    const firstName = String(name || '').trim().split(/\s+/)[0];
    const link = hotmartLink(name, email) || `${FRONTEND_URL}/dashboard?upgrade=1`;
    const coupon = process.env.SIGNUP_COUPON;
    const discount = process.env.SIGNUP_COUPON_DISCOUNT || '20%';
    return sendEmail({
        to: email,
        subject: coupon ? `🔗 Novo link do VIP TradeOn AI + ${discount} OFF para você` : '🔗 Novo link de pagamento do VIP TradeOn AI',
        html: layout(`
            <h1 style="color: #00F0A8; font-size: 22px; margin-bottom: 8px;">${firstName ? `${escapeHtml(firstName)}, mudamos` : 'Mudamos'} o link de pagamento do VIP 🔗</h1>
            <p style="font-size: 15px; line-height: 1.6; color: #E7ECF7;">
                O pagamento do <strong>VIP da TradeOn AI</strong> agora é feito por um novo link, mais rápido e seguro, com <strong>Pix, cartão ou boleto</strong>.
                Se você tentou pagar antes e não conseguiu, agora já está funcionando.
            </p>
            ${coupon ? `<div style="margin-top: 20px; padding: 20px; border: 1px dashed #00F0A8; border-radius: 10px; background: rgba(0,240,168,0.06); text-align: center;">
                <p style="margin: 0; font-size: 14px; color: #9AA6C3;">Presente pela mudança</p>
                <p style="margin: 6px 0 0; font-size: 20px; font-weight: 700; color: #E7ECF7;">${escapeHtml(discount)} OFF no VIP</p>
                <p style="margin: 10px 0 0; font-family: 'Courier New', monospace; font-size: 24px; font-weight: 700; letter-spacing: 3px; color: #00F0A8;">${escapeHtml(coupon)}</p>
                <p style="margin: 8px 0 0; font-size: 13px; color: #9AA6C3;">O cupom já vai aplicado no botão abaixo.</p>
            </div>` : ''}
            <p style="font-size: 15px; line-height: 1.6; color: #E7ECF7; margin-top: 20px;">Com o VIP você tem:</p>
            <ul style="font-size: 14px; line-height: 1.8; color: #E7ECF7; padding-left: 18px;">
                <li>Análises da IA <strong>ilimitadas</strong> em EURUSD, EURJPY e Ouro (M1 e M5)</li>
                <li>Direção, confiança, horário de entrada, pressão e volatilidade</li>
                <li>Assistente de IA ilimitado</li>
                <li><strong>Pagamento único</strong>, sem mensalidade</li>
            </ul>
            ${button(link, coupon ? 'Ativar VIP com desconto' : 'Ativar meu VIP')}
            <p style="font-size: 13px; line-height: 1.6; color: #9AA6C3; margin-top: 16px;">
                Compre com este mesmo e-mail (<strong>${escapeHtml(email)}</strong>) para o VIP ser liberado na sua conta automaticamente.
            </p>`,
            'Você recebeu este e-mail porque tem uma conta na TradeOn AI. Conteúdo educativo; operar envolve risco.'),
        replyTo: process.env.SUPPORT_EMAIL || 'tradeonia@gmail.com',
    });
}

// Comemoração dos 500 cadastros: obrigado a todos; contas sem VIP recebem o cupom da comemoração
// (CELEBRA_COUPON, criado no Stripe como código promocional), VIP recebe só o agradecimento.
async function sendCelebrationEmail(name, email, account = {}) {
    const firstName = String(name || '').trim().split(/\s+/)[0];
    const vip = account.plan === 'vip' || account.plan === 'owner';
    const coupon = process.env.CELEBRA_COUPON;
    const discount = process.env.CELEBRA_DISCOUNT || '50%';
    const offer = !vip && coupon ? { coupon, discount, url: `${FRONTEND_URL}/dashboard?upgrade=1` } : null;
    return sendEmail({
        to: email,
        subject: offer ? `🎉 Nossa comunidade passou de 500 pessoas: ${discount} OFF no VIP` : '🎉 Nossa comunidade passou de 500 pessoas',
        html: layout(`
            <h1 style="color: #00F0A8; font-size: 22px; margin-bottom: 8px;">${firstName ? `${escapeHtml(firstName)}, chegamos` : 'Chegamos'} a 500 pessoas 🎉</h1>
            <p style="font-size: 15px; line-height: 1.6; color: #E7ECF7;">
                A nossa comunidade passou de <strong>500 pessoas cadastradas</strong>, somando a TradeOn AI e os nossos outros projetos. Obrigado por fazer parte desde o começo.
            </p>
            <p style="font-size: 15px; line-height: 1.6; color: #E7ECF7;">
                Nas últimas semanas a plataforma ganhou o gráfico ao vivo, o histórico com acertos e erros conferidos automaticamente e 1 análise grátis por dia para todos.
            </p>
            ${offer ? `${couponBlock(offer, 'Presente de comemoração')}
            <p style="font-size: 13px; line-height: 1.6; color: #9AA6C3; margin-top: 12px;">
                No pagamento, digite o cupom no campo <strong>código promocional</strong>. O VIP é <strong>pagamento único</strong>, sem mensalidade.
            </p>` : `${button(`${FRONTEND_URL}/dashboard`, 'Abrir o painel')}`}`,
            'Você recebeu este e-mail porque tem uma conta na TradeOn AI. Conteúdo educativo; operar envolve risco e resultados passados não garantem resultados futuros.'),
        replyTo: process.env.SUPPORT_EMAIL || 'tradeonia@gmail.com',
    });
}

// Resultados do dia: imagem do histórico (hospedada no site) + convite conforme o plano.
async function sendResultsEmail(name, email, account = {}) {
    const firstName = String(name || '').trim().split(/\s+/)[0];
    const vip = account.plan === 'vip' || account.plan === 'owner';
    const trialLeft = !vip && !account.trial_expired && (account.signals_used || 0) < (parseInt(process.env.FREE_TRIAL_SIGNALS ?? '0', 10) || 0);
    const offer = !vip && !trialLeft ? couponOffer(name, email) : null;
    const cta = vip
        ? button(`${FRONTEND_URL}/dashboard`, 'Abrir o painel')
        : trialLeft
            ? button(`${FRONTEND_URL}/dashboard`, 'Testar meus 3 sinais grátis')
            : (offer ? couponBlock(offer, 'Condição especial') : button(`${FRONTEND_URL}/dashboard`, 'Conhecer o VIP'));
    return sendEmail({
        to: email,
        subject: '📊 Sinais M1 de 28/09: 8 WIN em 9 análises',
        html: layout(`
            <h1 style="color: #00F0A8; font-size: 22px; margin-bottom: 8px;">${firstName ? `${escapeHtml(firstName)}, olha` : 'Olha'} o resultado dos sinais M1 📊</h1>
            <p style="font-size: 15px; line-height: 1.6; color: #E7ECF7;">
                No dia 28/09 foram <strong>9 análises no M1</strong> (EURUSD e Ouro) conferidas no histórico:
                <strong style="color: #00F0A8;">8 WIN</strong> e <strong style="color: #FF8FA3;">1 RED</strong>, <strong>89% de acerto</strong>.
            </p>
            <p style="font-size: 15px; line-height: 1.6; color: #E7ECF7;">
                A IA lê o candle ao vivo e mostra a direção, a confiança, a pressão compradora/vendedora e agora também a <strong>volatilidade</strong> do mercado.
            </p>
            <img src="${FRONTEND_URL}/email/historico-m1-2809-9sinais.jpg" alt="Histórico de sinais M1 de 28/09: 8 WIN e 1 RED" width="520" style="display: block; width: 100%; max-width: 520px; margin: 20px auto; border-radius: 12px;">
            <p style="font-size: 14px; line-height: 1.6; color: #9AA6C3;">
                Cada sinal mostra o horário de entrada, a expiração e a confiança, e o resultado é conferido automaticamente, com os acertos e os erros.
            </p>
            ${cta}
            <p style="font-size: 12px; line-height: 1.6; color: #5B6788; margin-top: 20px;">
                Registro de um único dia (amostra pequena). Resultados passados não garantem resultados futuros. Opere com gestão e só com o que pode perder.
            </p>`,
            'Você recebeu este e-mail porque tem uma conta na TradeOn AI. Conteúdo educativo; operar envolve risco.'),
    });
}

// Novidade: 1 análise grátis por dia para contas sem VIP (FREE_DAILY_SIGNALS).
async function sendDailyFreeEmail(name, email) {
    const firstName = String(name || '').trim().split(/\s+/)[0];
    const n = Math.max(1, parseInt(process.env.FREE_DAILY_SIGNALS ?? '1', 10) || 1);
    const qtd = n === 1 ? '1 análise da IA por dia' : `${n} análises da IA por dia`;
    return sendEmail({
        to: email,
        subject: `🎁 Novidade: ${qtd} grátis na TradeOn AI`,
        html: layout(`
            <h1 style="color: #00F0A8; font-size: 22px; margin-bottom: 8px;">${firstName ? `${escapeHtml(firstName)}, sua` : 'Sua'} conta ganhou ${qtd} 🎁</h1>
            <p style="font-size: 15px; line-height: 1.6; color: #E7ECF7;">
                A partir de hoje, toda conta da TradeOn AI tem <strong>${qtd}, grátis</strong>. Todo dia a análise é renovada à meia-noite (horário de Brasília).
            </p>
            <p style="font-size: 15px; line-height: 1.6; color: #E7ECF7;">Como usar:</p>
            <ol style="font-size: 14px; line-height: 1.8; color: #E7ECF7; padding-left: 18px;">
                <li>Entre no painel e escolha <strong>EURUSD, EURJPY ou Ouro</strong> e o tempo (M1 ou M5).</li>
                <li>Toque em <strong>Analisar com IA</strong>.</li>
                <li>Veja a direção, a confiança, o horário de entrada, a pressão e a volatilidade do mercado.</li>
            </ol>
            <p style="font-size: 14px; line-height: 1.6; color: #9AA6C3;">Se a IA não encontrar entrada, a análise não é gasta: você pode tentar de novo.</p>
            ${button(`${FRONTEND_URL}/dashboard`, 'Fazer minha análise de hoje')}
            <p style="font-size: 13px; line-height: 1.6; color: #9AA6C3; margin-top: 20px;">Quer análises ilimitadas? O <strong>VIP</strong> é pagamento único, sem mensalidade.</p>
            <p style="font-size: 12px; line-height: 1.6; color: #5B6788; margin-top: 12px;">Confiança não é garantia. Opere com gestão e só com o que pode perder.</p>`,
            'Você recebeu este e-mail porque tem uma conta na TradeOn AI. Conteúdo educativo; operar envolve risco.'),
    });
}

// E-mail com o link para criar uma nova senha (vale por 1 hora, uso único).
async function sendPasswordResetEmail(name, email, url) {
    const result = await sendEmail({
        to: email,
        subject: 'Crie uma nova senha na TradeOn AI',
        html: layout(`
            <h1 style="color: #00F0A8; font-size: 22px; margin-bottom: 8px;">Olá, ${escapeHtml(name || '')}!</h1>
            <p style="font-size: 15px; line-height: 1.6; color: #E7ECF7;">
                Recebemos um pedido para criar uma nova senha na conta <strong>${escapeHtml(email)}</strong>.
                Clique no botão abaixo para escolher a nova senha. O link vale por <strong>1 hora</strong>.
            </p>
            ${button(url, 'Criar nova senha')}`,
            'Se você não pediu isso, ignore este e-mail: sua senha continua a mesma.'),
    });
    if (!result.ok) console.error('Erro ao enviar e-mail de nova senha:', result.error);
    return result;
}

module.exports = { sendEmail, sendCelebrationEmail, sendDailyFreeEmail, sendNewCheckoutEmail, sendPasswordResetEmail, sendPixReminderEmail, sendResultsEmail, sendWelcomeEmail, sendCouponEmail, sendTrialEmail, sendMarketOpenEmail, escapeHtml };
