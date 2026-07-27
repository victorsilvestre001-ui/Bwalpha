const express = require('express');
const pool = require('./db');

const router = express.Router();

const ALLOWED_PAIRS = ['EURUSD', 'EURJPY'];
const MAX_DATA_AGE_MS = 3 * 60 * 1000; // dados com mais de 3 minutos são considerados desatualizados

const SYSTEM_PROMPT = `Você é a BWAlpha IA, uma inteligência artificial especializada em operações de Forex, com foco exclusivo nos pares EURUSD e EURJPY.

Sua função é receber dados de mercado em tempo real através de uma API ou Webhook (TradingView, MetaTrader 5 ou outra fonte confiável) e analisar cada oportunidade utilizando confluências técnicas.

Considere na análise:
- Tendência principal.
- Estrutura de mercado (HH, HL, LH, LL).
- Suportes e resistências.
- Liquidez e rompimentos.
- Volume (quando disponível).
- VWAP (quando disponível).
- Médias móveis (EMA 9, EMA 21 e EMA 200).
- RSI.
- MACD.
- ATR.
- Price Action.
- Candlestick de confirmação.
- Horário da sessão (Londres e Nova York têm prioridade).
- Notícias econômicas de alto impacto (evite operações durante eventos de grande volatilidade).

Objetivo:
Gerar apenas sinais de alta probabilidade, evitando entradas de baixa qualidade.

Quando identificar uma oportunidade, responda exatamente neste formato:

📈 BWAlpha Signals

Ativo: EURUSD ou EURJPY
Direção: COMPRA ou VENDA
Timeframe: M1
Preço de Entrada:
Stop Loss:
Take Profit:
Probabilidade:
Motivo da Entrada:
Gerenciamento de Risco:
Status: Aguardando | Entrada Confirmada | Operação Encerrada

Caso não exista uma operação com alta probabilidade, responda apenas:

"Nenhuma entrada de alta qualidade no momento. Aguardando confirmação do mercado."

Nunca invente preços ou dados de mercado. Utilize exclusivamente as informações recebidas da API ou Webhook em tempo real. Caso algum dado esteja ausente ou desatualizado, informe que não é possível emitir um sinal confiável.

Seu objetivo é priorizar qualidade em vez de quantidade, buscando consistência e gerenciamento de risco.`;

function checkSecret(req) {
    const secretFromHeader = req.headers['x-webhook-secret'];
    const secretFromQuery = req.query.secret;
    const secretFromBody = req.body?.secret;
    const provided = secretFromHeader || secretFromQuery || secretFromBody;
    return provided === process.env.WEBHOOK_SECRET;
}

function isFresh(timestamp) {
    if (!timestamp) return false;
    const eventTime = new Date(timestamp).getTime();
    if (Number.isNaN(eventTime)) return false;
    return Math.abs(Date.now() - eventTime) <= MAX_DATA_AGE_MS;
}

// Campos mínimos que precisam vir no payload do TradingView/MT5 para que a IA
// tenha dados suficientes — sem eles, nunca inventamos e recusamos a análise.
const REQUIRED_FIELDS = [
    'pair', 'timestamp', 'price', 'ema9', 'ema21', 'ema200',
    'rsi', 'macd', 'atr', 'session',
];

function getMissingFields(data) {
    return REQUIRED_FIELDS.filter((f) => data[f] === undefined || data[f] === null || data[f] === '');
}

function parseAISignal(text) {
    if (!text || !text.includes('📈')) return null;

    const get = (label) => {
        const match = text.match(new RegExp(`${label}:\\s*(.+)`, 'i'));
        return match ? match[1].trim() : null;
    };

    const pair = get('Ativo');
    const direcaoRaw = get('Direção');
    const entry = get('Preço de Entrada');
    const stop = get('Stop Loss');
    const target = get('Take Profit');

    if (!pair || !direcaoRaw || !entry || !stop || !target) return null;

    const direction = /compra/i.test(direcaoRaw) ? 'BUY' : /venda/i.test(direcaoRaw) ? 'SELL' : null;
    if (!direction) return null;

    const toNumber = (v) => {
        const n = parseFloat(String(v).replace(',', '.'));
        return Number.isNaN(n) ? null : n;
    };

    return {
        pair: pair.toUpperCase().trim(),
        direction,
        entry_price: toNumber(entry),
        stop_loss: toNumber(stop),
        take_profit: toNumber(target),
        probabilidade: get('Probabilidade'),
        motivo: get('Motivo da Entrada'),
        gerenciamento: get('Gerenciamento de Risco'),
        status: get('Status'),
    };
}

router.post('/tradingview', async (req, res) => {
    if (!checkSecret(req)) {
        return res.status(401).json({ error: 'Não autorizado' });
    }

    const data = req.body;

    if (!data.pair || !ALLOWED_PAIRS.includes(String(data.pair).toUpperCase())) {
        return res.status(400).json({ error: `pair deve ser um de: ${ALLOWED_PAIRS.join(', ')}` });
    }

    const missing = getMissingFields(data);
    if (missing.length > 0) {
        return res.status(422).json({
            error: 'Dados insuficientes para uma análise confiável — sinal não emitido.',
            missing_fields: missing,
        });
    }

    if (!isFresh(data.timestamp)) {
        return res.status(422).json({
            error: 'Dados desatualizados — sinal não emitido.',
        });
    }

    try {
        const userMessage = `Dados de mercado recebidos em tempo real (JSON):\n\n${JSON.stringify(data, null, 2)}\n\nAnalise e responda no formato definido.`;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-6',
                max_tokens: 600,
                system: SYSTEM_PROMPT,
                messages: [{ role: 'user', content: userMessage }],
            }),
        });

        const aiData = await response.json();
        const aiText = aiData.content?.find((c) => c.type === 'text')?.text || '';

        const parsed = parseAISignal(aiText);

        if (parsed && parsed.entry_price && parsed.stop_loss && parsed.take_profit) {
            const result = await pool.query(
                `INSERT INTO signals (pair, direction, entry_price, stop_loss, take_profit, source)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                [parsed.pair, parsed.direction, parsed.entry_price, parsed.stop_loss, parsed.take_profit, 'bwalpha-ia']
            );

            return res.status(201).json({
                signal_created: true,
                signal: result.rows[0],
                ai_analysis: aiText,
            });
        }

        return res.json({
            signal_created: false,
            ai_analysis: aiText || 'Nenhuma entrada de alta qualidade no momento. Aguardando confirmação do mercado.',
        });
    } catch (err) {
        console.error('Erro na análise da BWAlpha IA:', err);
        res.status(500).json({ error: 'Erro ao processar análise de mercado' });
    }
});

module.exports = router;
