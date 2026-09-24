const express = require('express');
const pool = require('./db');
const { authMiddleware, requirePaidPlan } = require('./authMiddleware');
const Anthropic = require('@anthropic-ai/sdk');
const { getQuotes, getIndicators, getEconomicSnapshot } = require('./marketRoutes');

const anthropic = new Anthropic(); // usa ANTHROPIC_API_KEY
const CHAT_MODEL = 'claude-sonnet-4-6';
const HISTORY_MESSAGES = 8; // últimas mensagens enviadas como contexto da conversa

const router = express.Router();

const SYSTEM_PROMPT = `Você é o assistente de IA da TradeOn AI: um professor de trading paciente e didático, que explica mercado financeiro para brasileiros de forma clara, bonita e fácil de entender.

Seu escopo:
- Price action e estrutura de mercado
- Gerenciamento de risco (tamanho de posição, stop, risco/retorno, gestão de banca)
- Análise de prints de gráficos enviados pelo usuário (tendência, suporte, resistência)
- Indicadores técnicos e padrões de candle
- Os ativos EURUSD, EURJPY e XAUUSD (ouro), e psicologia do trader

Dados de mercado: no início da mensagem você pode receber cotações reais e dados macro entre colchetes (ex.: "[Cotações atuais em tempo real: ...]"). Use esses valores exatos quando falar de preço atual; nunca invente ou estime um preço que não foi informado. Se não houver cotação, diga que não tem o preço no momento.

Como escrever as respostas (em português do Brasil, formatadas em Markdown):
- Comece com uma frase curta que responde direto à pergunta.
- Depois explique em seções com títulos curtos (## ou ###), cada uma com parágrafos de 1 a 3 frases.
- Use listas para passos e características, **negrito** para os termos-chave, e tabelas quando comparar coisas (ex.: compra x venda, M1 x M5).
- Sempre que ajudar, inclua um **exemplo prático** com números (ex.: banca de R$ 100, entrada de 2%, payout de 85%).
- Explique qualquer termo técnico na primeira vez que ele aparecer, como se o usuário estivesse começando.
- Termine com uma seção "### 📌 Resumo" com 2 a 4 tópicos curtos.
- Na última linha, um lembrete em itálico de uma frase: *Conteúdo educativo, não é recomendação de investimento. Operar envolve risco.*
- Ajuste o tamanho à pergunta: saudação ou pergunta simples pedem resposta curta (sem seções); pergunta de "como funciona" ou "me explica" pede a estrutura completa. Evite enrolação e repetição.
- Use no máximo 3 ou 4 emojis por resposta, só como marcadores de seção.

Se o usuário enviar a imagem de um gráfico, responda nesta estrutura:
## Leitura do gráfico
| Item | Leitura |
|---|---|
| Tendência | Alta / Baixa / Lateral |
| Resistência | valor |
| Suporte | valor |
| Probabilidade de continuação | Baixa / Média / Alta |
Depois, em "### O que observar", explique em tópicos o porquê de cada leitura e cite notícias ou eventos relevantes, se houver.

Limites:
- Não responda perguntas fora de trading e mercado financeiro; diga com gentileza que só pode ajudar com esses temas.
- Nunca prometa lucro, acerto garantido ou "sinal certeiro".
- Use o histórico da conversa para entender perguntas de continuação (ex.: "e no ouro?").`;

// Aplica de verdade o limite diário de mensagens do plano gratuito. Antes,
// só existia um endpoint informativo (/limit) que calculava o restante mas
// nada impedia o próprio envio — qualquer usuário logado podia mandar
// mensagens ilimitadas e gerar custo sem limite na API da Anthropic.
const FREE_DAILY_MESSAGE_LIMIT = 3;

async function checkChatLimit(userId) {
    const userResult = await pool.query('SELECT plan FROM users WHERE id = $1', [userId]);
    const plan = userResult.rows[0]?.plan;

    if (plan === 'vip' || plan === 'owner') return { allowed: true };

    const countResult = await pool.query(
        `SELECT COUNT(*) AS total FROM chat_history
         WHERE user_id = $1 AND role = 'user' AND created_at >= CURRENT_DATE`,
        [userId]
    );
    const usedToday = parseInt(countResult.rows[0].total, 10);

    if (usedToday >= FREE_DAILY_MESSAGE_LIMIT) {
        return { allowed: false, usedToday };
    }
    return { allowed: true, usedToday };
}

router.post('/', authMiddleware, async (req, res) => {
    const { message, image_base64 } = req.body;
    const userId = req.user.id;

    if (!message && !image_base64) {
        return res.status(400).json({ error: 'Envie uma mensagem ou uma imagem' });
    }

    try {
        const limitCheck = await checkChatLimit(userId);
        if (!limitCheck.allowed) {
            return res.status(429).json({
                error: 'Limite diário de mensagens do plano gratuito atingido. Assine o VIP para uso ilimitado.',
            });
        }

        const userContent = [];

        try {
            const quotes = await getQuotes();
            if (quotes.length > 0) {
                const quotesText = quotes
                    .filter((q) => !q.error)
                    .map((q) => (q.bid != null && q.ask != null ? `${q.label}: ${q.rate} (bid ${q.bid} / ask ${q.ask})` : `${q.label}: ${q.rate}`))
                    .join(', ');
                if (quotesText) {
                    userContent.push({
                        type: 'text',
                        text: `[Cotações atuais em tempo real: ${quotesText}]`,
                    });
                }
            }

            const indicators = await getIndicators();
            if (indicators) {
                userContent.push({
                    type: 'text',
                    text: `[Indicador técnico: RSI(14) diário do EURUSD = ${indicators.rsi.toFixed(2)} (${indicators.date})]`,
                });
            }

            const econ = await getEconomicSnapshot();
            if (econ) {
                const parts = [];
                if (econ.cpi) parts.push(`CPI: ${econ.cpi.value} (${econ.cpi.date})`);
                if (econ.fedRate) parts.push(`Fed Funds Rate: ${econ.fedRate.value}% (${econ.fedRate.date})`);
                if (econ.unemployment) parts.push(`Desemprego EUA: ${econ.unemployment.value}% (${econ.unemployment.date})`);
                if (parts.length > 0) {
                    userContent.push({
                        type: 'text',
                        text: `[Dados macroeconômicos mais recentes (EUA): ${parts.join(', ')}]`,
                    });
                }
            }
        } catch (e) {
            // Se falhar ao buscar dados de mercado, segue sem eles (não trava o chat)
        }

        if (message) userContent.push({ type: 'text', text: message });
        if (image_base64) {
            userContent.push({
                type: 'image',
                source: { type: 'base64', media_type: 'image/png', data: image_base64 }
            });
        }

        // Últimas mensagens da conversa, para a IA entender perguntas de continuação.
        const historyResult = await pool.query(
            `SELECT role, message FROM chat_history WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
            [userId, HISTORY_MESSAGES]
        );
        const history = historyResult.rows.reverse()
            .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.message)
            .map((m) => ({ role: m.role, content: m.message }));
        while (history.length && history[0].role !== 'user') history.shift();

        let aiText;
        try {
            const response = await anthropic.messages.create({
                model: CHAT_MODEL,
                max_tokens: 8000,
                system: SYSTEM_PROMPT,
                messages: [...history, { role: 'user', content: userContent }],
            });
            aiText = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
            if (response.stop_reason === 'max_tokens') aiText += '\n\n_(Resposta resumida por ser muito longa. Pergunte a parte que quiser aprofundar.)_';
        } catch (err) {
            if (err instanceof Anthropic.RateLimitError) {
                return res.status(503).json({ error: 'A IA está com muitos pedidos agora. Tente de novo em alguns segundos.' });
            }
            if (err instanceof Anthropic.APIError) {
                console.error('ERRO ANTHROPIC:', err.status, err.message);
                return res.status(502).json({ error: 'A IA não conseguiu responder agora. Tente novamente.' });
            }
            throw err;
        }
        if (!aiText) aiText = 'Não consegui gerar uma resposta agora. Tente reformular a pergunta.';

        await pool.query(
            `INSERT INTO chat_history (user_id, role, message) VALUES ($1, 'user', $2)`,
            [userId, message || '[imagem enviada]']
        );
        await pool.query(
            `INSERT INTO chat_history (user_id, role, message) VALUES ($1, 'assistant', $2)`,
            [userId, aiText]
        );

        res.json({ reply: aiText });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao consultar a IA' });
    }
});

router.get('/limit', authMiddleware, async (req, res) => {
    try {
        const userResult = await pool.query('SELECT plan FROM users WHERE id = $1', [req.user.id]);
        const plan = userResult.rows[0]?.plan;

        if (plan === 'vip' || plan === 'owner') {
            return res.json({ plan, unlimited: true });
        }

        const countResult = await pool.query(
            `SELECT COUNT(*) AS total FROM chat_history
             WHERE user_id = $1 AND role = 'user' AND created_at >= CURRENT_DATE`,
            [req.user.id]
        );
        const usedToday = parseInt(countResult.rows[0].total, 10);

        res.json({ plan, unlimited: false, usedToday, remaining: Math.max(0, 3 - usedToday) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao verificar limite' });
    }
});

router.get('/history', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT role, message, created_at FROM chat_history 
             WHERE user_id = $1 ORDER BY created_at ASC LIMIT 100`,
            [req.user.id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao buscar histórico' });
    }
});

module.exports = router;
