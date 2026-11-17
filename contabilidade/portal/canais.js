// Canais de envio do relacionamento com o cliente.
// E-mail: Resend (RESEND_API_KEY e EMAIL_FROM com domínio verificado no Resend).
// WhatsApp: API oficial do WhatsApp Business (Meta Cloud API). Mensagens iniciadas pela empresa
// exigem um modelo aprovado pela Meta: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_TEMPLATE
// (nome do modelo, com 3 variáveis: nome, resumo e link) e WHATSAPP_TEMPLATE_LANG (padrão pt_BR).

const emailAtivo = () => !!process.env.RESEND_API_KEY;
const whatsappAtivo = () => !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID && process.env.WHATSAPP_TEMPLATE);

function textoDeHtml(html) {
  return String(html).replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, t) => `${t.replace(/<[^>]+>/g, '').trim()}: ${href}`)
    .replace(/<(br|\/p|\/h\d|\/div|\/li|\/tr)[^>]*>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*/g, '\n\n').trim();
}

async function enviaEmail({ para, assunto, html, responderPara }) {
  if (!emailAtivo()) return { ok: false, erro: 'e-mail não configurado' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || 'V&J Assessoria Contábil <contato@vmcontabil.com.br>', to: [para], subject: assunto, html, text: textoDeHtml(html), reply_to: responderPara }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return { ok: false, erro: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
  return { ok: true };
}

// Variáveis de modelo do WhatsApp não aceitam quebra de linha, tabulação nem mais de 4 espaços seguidos
const limpaVar = (s) => String(s).replace(/[\n\t]+/g, ' · ').replace(/ {4,}/g, ' ').slice(0, 900);

async function enviaWhatsapp({ numero, variaveis }) {
  if (!whatsappAtivo()) return { ok: false, erro: 'WhatsApp não configurado' };
  const para = String(numero || '').replace(/\D/g, '');
  if (para.length < 10) return { ok: false, erro: 'número de WhatsApp inválido' };
  const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: para.startsWith('55') ? para : `55${para}`,
      type: 'template',
      template: {
        name: process.env.WHATSAPP_TEMPLATE,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'pt_BR' },
        components: [{ type: 'body', parameters: variaveis.map((v) => ({ type: 'text', text: limpaVar(v) })) }],
      },
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return { ok: false, erro: `WhatsApp ${res.status}: ${(await res.text()).slice(0, 200)}` };
  return { ok: true };
}

module.exports = { emailAtivo, whatsappAtivo, enviaEmail, enviaWhatsapp, limpaVar };
