const express = require('express');
const pool = require('./db');

const router = express.Router();
const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

// Envia uma mensagem de novo sinal pro canal/grupo do Telegram
// Retorna o message_id do Telegram (pra depois vincular o "green/red" a esse sinal)
async function postSignalToTelegram(signal) {
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return null;

    const emoji = signal.direction === 'BUY' ? '🟢' : '🔴';
    const acao = signal.direction === 'BUY' ? 'COMPRA' : 'VENDA';
    const agora = new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
    });
    const timeframe = signal.timeframe || 'M1';
    const affiliateLink =
        'https://exnova.com/lp/start-trading/?aff=830021&aff_model=revenue&afftrack=BwAlpha';

    const text =
        `📈 BWAlpha Signals\n\n` +
        `${emoji} ${acao}\n` +
        `📊 Ativo: ${signal.pair}\n` +
        `⏱ Timeframe: ${timeframe}\n` +
        `🎯 Entrada: ${agora}\n\n` +
        `🚀 Execute este sinal pela plataforma: ${affiliateLink}\n\n` +
        `_Responda esta mensagem com "green" ou "red" pra fechar o sinal._`;

    try {
        const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: process.env.TELEGRAM_CHAT_ID,
                text,
                parse_mode: 'Markdown',
            }),
        });
        const data = await res.json();
        return data.ok ? data.result.message_id : null;
    } catch (err) {
        console.error('Erro ao postar sinal no Telegram:', err.message);
        return null;
    }
}

async function sendTelegramMessage(text, replyToMessageId) {
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return;
    try {
        await fetch(`${TELEGRAM_API}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: process.env.TELEGRAM_CHAT_ID,
                text,
                reply_to_message_id: replyToMessageId,
            }),
        });
    } catch (err) {
        console.error('Erro ao responder no Telegram:', err.message);
    }
}

// Webhook que recebe as mensagens do Telegram (configurado via setWebhook)
router.post('/webhook', async (req, res) => {
    // Confere o secret token que o Telegram manda no header (configurado no setWebhook)
    const secret = req.headers['x-telegram-bot-api-secret-token'];
    if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
        return res.status(401).send('Não autorizado');
    }

    const update = req.body;
    const message = update.message || update.channel_post;

    // Só nos importa: uma resposta (reply) a uma mensagem de sinal, com texto green/red
    if (message?.reply_to_message && message.text) {
        const repliedMessageId = message.reply_to_message.message_id;
        const text = message.text.trim().toLowerCase();

        const isGreen = /^green$/i.test(text) || /^win$/i.test(text);
        const isRed = /^red$/i.test(text) || /^loss$/i.test(text);

        if (isGreen || isRed) {
            try {
                const result = await pool.query(
                    `UPDATE signals 
                     SET status = $1, closed_at = NOW()
                     WHERE telegram_message_id = $2 AND status = 'open'
                     RETURNING *`,
                    [isGreen ? 'win' : 'loss', repliedMessageId]
                );

                if (result.rows.length > 0) {
                    const signal = result.rows[0];
                    await sendTelegramMessage(
                        `✅ Sinal ${signal.pair} fechado como ${isGreen ? 'GREEN ✅' : 'RED ❌'}. Site atualizado!`,
                        message.message_id
                    );
                } else {
                    await sendTelegramMessage(
                        `⚠️ Não encontrei um sinal em aberto vinculado a essa mensagem.`,
                        message.message_id
                    );
                }
            } catch (err) {
                console.error('Erro ao processar reply do Telegram:', err.message);
            }
        }
    }

    res.sendStatus(200);
});

async function setupWebhook() {
    if (!process.env.TELEGRAM_BOT_TOKEN) return;

    const domain = process.env.RAILWAY_PUBLIC_DOMAIN || 'bwalpha-production.up.railway.app';
    const webhookUrl = `https://${domain}/api/telegram/webhook`;

    try {
        const res = await fetch(`${TELEGRAM_API}/setWebhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: webhookUrl,
                secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
            }),
        });
        const data = await res.json();
        if (data.ok) {
            console.log(`Webhook do Telegram configurado: ${webhookUrl} ✅`);
        } else {
            console.error('Erro ao configurar webhook do Telegram:', JSON.stringify(data));
        }
    } catch (err) {
        console.error('Erro ao configurar webhook do Telegram:', err.message);
    }
}

module.exports = { router, postSignalToTelegram, setupWebhook };
