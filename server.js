const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const pool = require('./db');
const authRoutes = require('./authRoutes');
const signalsRoutes = require('./signalsRoutes');
const chatRoutes = require('./chatRoutes');
const { router: calendarRoutes, syncEconomicCalendar } = require('./calendarRoutes');
const checkoutRoutes = require('./checkoutRoutes');
const stripeWebhook = require('./stripeWebhook');
const { router: kiwifyWebhook } = require('./kiwifyWebhook');
const { router: marketRoutes } = require('./marketRoutes');
const { router: telegramRoutes, setupWebhook } = require('./telegramRoutes');
const marketAnalysisRoutes = require('./marketAnalysisRoutes');
const { router: analysesRoutes, resolvePendingAnalyses } = require('./analysesRoutes');
const adminRoutes = require('./adminRoutes');

const app = express();

// Necessário no Railway (e em qualquer PaaS atrás de proxy reverso): sem isso,
// o express-rate-limit não consegue identificar o IP real do usuário e
// derruba a requisição com erro (ERR_ERL_UNEXPECTED_X_FORWARDED_FOR).
app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));

// CORS restrito ao(s) domínio(s) reais do site — antes estava liberado pra
// qualquer origem, o que permitia que qualquer site chamasse a API em nome
// de um usuário caso um token JWT vazasse (ex: por XSS em outro lugar).
const ALLOWED_ORIGINS = [
    'https://www.tradeonia.com.br',
    'https://tradeonia.com.br',
    'https://www.bwalphaia.com',
    'https://bwalphaia.com',
    process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        // Requisições sem origin (ex: apps mobile, curl, webhooks server-to-server) são permitidas.
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.vercel.app')) {
            return callback(null, true);
        }
        return callback(new Error('Origem não permitida pelo CORS'));
    },
}));

app.use('/api/stripe/webhook', stripeWebhook);
app.use('/api/kiwify/webhook', kiwifyWebhook);

app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/signals', signalsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/analyses', analysesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/webhook/market', marketAnalysisRoutes);

app.get('/', (req, res) => {
    res.json({ status: 'TradeOn AI backend rodando 🚀' });
});

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    plan VARCHAR(20) DEFAULT 'free',
    subscription_status VARCHAR(20) DEFAULT 'inactive',
    subscription_expires_at TIMESTAMP,
    stripe_customer_id VARCHAR(100),
    stripe_subscription_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS cpf VARCHAR(14);
ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS kiwify_subscription_id VARCHAR(100);

-- Compras da Kiwify por e-mail (vale também para quem comprou antes de criar a conta).
CREATE TABLE IF NOT EXISTS vip_grants (
    email VARCHAR(150) PRIMARY KEY,
    provider VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    subscription_id VARCHAR(100),
    expires_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE TABLE IF NOT EXISTS signals (
    id SERIAL PRIMARY KEY,
    pair VARCHAR(20) NOT NULL,
    direction VARCHAR(10) NOT NULL,
    entry_price NUMERIC(12,5),
    stop_loss NUMERIC(12,5),
    take_profit NUMERIC(12,5),
    status VARCHAR(20) DEFAULT 'open',
    result_pips NUMERIC(10,2),
    source VARCHAR(30) DEFAULT 'bwalpha',
    telegram_message_id BIGINT,
    created_at TIMESTAMP DEFAULT NOW(),
    closed_at TIMESTAMP
);

ALTER TABLE signals ADD COLUMN IF NOT EXISTS telegram_message_id BIGINT;

CREATE TABLE IF NOT EXISTS chat_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(10) NOT NULL,
    message TEXT NOT NULL,
    image_url TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS economic_events (
    id SERIAL PRIMARY KEY,
    event_name VARCHAR(150) NOT NULL,
    country VARCHAR(50),
    impact VARCHAR(10),
    event_time TIMESTAMP NOT NULL,
    forecast VARCHAR(30),
    previous VARCHAR(30),
    actual VARCHAR(30)
);

CREATE TABLE IF NOT EXISTS subscriptions_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(30),
    event_type VARCHAR(50),
    raw_payload JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signals_pair ON signals(pair);
CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);
CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_history(user_id);
CREATE INDEX IF NOT EXISTS idx_events_time ON economic_events(event_time);

CREATE TABLE IF NOT EXISTS analyses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    pair VARCHAR(20) NOT NULL,
    timeframe VARCHAR(5) NOT NULL,
    direction VARCHAR(10) NOT NULL,
    confidence VARCHAR(10),
    requested_at TIMESTAMPTZ NOT NULL,
    entry_time TIMESTAMPTZ NOT NULL,
    expiry_time TIMESTAMPTZ NOT NULL,
    open_price NUMERIC(14,6),
    close_price NUMERIC(14,6),
    result VARCHAR(10),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analyses_user ON analyses(user_id, requested_at DESC);
-- Visitas do site (sem cookies: visitor_hash é um código anônimo que muda todo dia).
CREATE TABLE IF NOT EXISTS page_visits (
    id BIGSERIAL PRIMARY KEY,
    path VARCHAR(200) NOT NULL,
    visitor_hash CHAR(64) NOT NULL,
    source VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_page_visits_created ON page_visits(created_at);

CREATE INDEX IF NOT EXISTS idx_analyses_pending ON analyses(expiry_time) WHERE result IS NULL;
`;

async function runMigrations() {
    try {
        await pool.query(SCHEMA_SQL);
        console.log('Schema do banco verificado/criado com sucesso ✅');
    } catch (err) {
        console.error('Erro ao rodar migrações do schema:', err.message);
    }
}

const PORT = process.env.PORT || 3001;

const CALENDAR_SYNC_INTERVAL_MS = 3 * 60 * 60 * 1000; // a cada 3 horas

runMigrations().then(() => {
    app.listen(PORT, () => {
        console.log(`Servidor rodando na porta ${PORT}`);
        setupWebhook();
        syncEconomicCalendar();
        setInterval(syncEconomicCalendar, CALENDAR_SYNC_INTERVAL_MS);
        // Confere WIN/RED das análises cujo candle já fechou, mesmo sem ninguém abrir o histórico.
        setInterval(resolvePendingAnalyses, 60 * 1000);
        // Backtest sob demanda: RUN_BACKTEST=1 escreve nos logs a taxa de acerto de cada estratégia.
        if (process.env.RUN_BACKTEST === '1') {
            require('./backtest').run().catch((err) => console.error('BACKTEST_ERR', err.message));
        }
    });
});
