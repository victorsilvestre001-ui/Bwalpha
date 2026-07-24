const express = require('express');
const pool = require('./db');
const { authMiddleware, requirePaidPlan } = require('./authMiddleware');
const { getQuotes, getIndicators, getEconomicSnapshot } = require('./marketRoutes');

const router = express.Router();

const SYSTEM_PROMPT = `Você é o assistente de IA do BWAlpha, especializado exclusivamente em trading.

Você pode ajudar com:
- Explicação de price action e estrutura de mercado
- Gerenciamento de risco (position sizing, stop loss, R:R)
- Análise de prints/gráficos enviados pelo usuário (tendência, suporte, resistência)
- Explicação de indicadores técnicos
- Dúvidas sobre os pares EURUSD e EURJPY

Você recebe cotações reais e atualizadas em tempo real no início da conversa (formato "[Cotações atuais em tempo real: ...]"). Use esses valores exatos quando o usuário perguntar sobre preços atuais — nunca invente ou estime um preço se a cotação real estiver disponível.

Regras importantes:
- Não responda perguntas fora do escopo de trading/mercados financeiros
- Sempre inclua um lembrete de que isso não é aconselhamento financeiro e envolve risco
- Seja direto e objetivo, sem enrolação
- Se o usuário enviar uma imagem de gráfico, estruture a resposta como:
  Tendência: [Alta/Baixa/Lateral]
  Resistência: [valor]
  Suporte: [valor]
  Probabilidade de continuação: [Baixa/Média/Alta]
  Observação: [alerta sobre notícias/eventos relevantes, se aplicável]`;

router.post('/', authMiddleware, async (req, res) => {
    const { message, image_base64 } = req.body;
    const userId = req.user.id;

    if (!message && !image_base64) {
        return res.status(400).json({ error: 'Envie uma mensagem ou uma imagem' });
    }

    try {
        // Plano free: limitado a 3 perguntas por dia. VIP: sem limite.
        const userResult = await pool.query('SELECT plan FROM users WHERE id = $1', [userId]);
        const plan = userResult.rows[0]?.plan;

        if (plan !== 'vip') {
            const countResult = await pool.query(
                `SELECT COUNT(*) AS total FROM chat_history
                 WHERE user_id = $1 AND role = 'user' AND created_at >= CURRENT_DATE`,
                [userId]
            );
            const usedToday = parseInt(countResult.rows[0].total, 10);

            if (usedToday >= 3) {
                return res.status(403).json({
                    error: 'Você atingiu o limite de 3 perguntas gratuitas hoje. Vire VIP pra ter acesso ilimitado ao assistente.',
                    limitReached: true,
                });
            }
        }
        const userContent = [];

        // Injeta cotações reais e atuais no contexto, pra IA responder com preços de verdade
        try {
            const quotes = await getQuotes();
            if (quotes.length > 0) {
                const quotesText = quotes
                    .filter((q) => !q.error)
                    .map((q) => `${q.label}: ${q.rate} (bid ${q.bid} / ask ${q.ask})`)
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

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-6',
                max_tokens: 1000,
                system: SYSTEM_PROMPT,
                messages: [{ role: 'user', content: userContent }]
            })
        });

        const data = await response.json();
        const aiText = data.content?.find(c => c.type === 'text')?.text || 'Erro ao gerar resposta';

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

        if (plan === 'vip') {
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
