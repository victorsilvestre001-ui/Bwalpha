const express = require('express');
const cors = require('cors');
require('dotenv').config();

const pool = require('./db');
const authRoutes = require('./authRoutes');
const signalsRoutes = require('./signalsRoutes');
const chatRoutes = require('./chatRoutes');
const calendarRoutes = require('./calendarRoutes');
const checkoutRoutes = require('./checkoutRoutes');
const stripeWebhook = require('./stripeWebhook');
const { router: marketRoutes } = require('./marketRoutes');

const app = express();

app.use(cors());

// Webhook do Stripe PRECISA vir antes do express.json() (precisa do corpo cru)
app.use('/api/stripe/webhook', stripeWebhook);

app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/signals', signalsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/market', marketRoutes);

app.get('/', (req, res) => {
    res.json({ status: 'BWAlpha AI backend rodando 🚀' });
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
    created_at TIMESTAMP DEFAULT NOW(),
    closed_at TIMESTAMP
);

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

runMigrations().then(() => {
    app.listen(PORT, () => {
        console.log(`Servidor rodando na porta ${PORT}`);
    });
});
