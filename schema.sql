-- BWAlpha AI - Schema do banco de dados PostgreSQL

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    plan VARCHAR(20) DEFAULT 'free',        -- free | pro | lifetime
    subscription_status VARCHAR(20) DEFAULT 'inactive', -- active | inactive | cancelled
    subscription_expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE signals (
    id SERIAL PRIMARY KEY,
    pair VARCHAR(20) NOT NULL,              -- ex: EURUSD
    direction VARCHAR(10) NOT NULL,         -- BUY | SELL
    entry_price NUMERIC(12,5),
    stop_loss NUMERIC(12,5),
    take_profit NUMERIC(12,5),
    status VARCHAR(20) DEFAULT 'open',      -- open | win | loss | breakeven
    result_pips NUMERIC(10,2),
    source VARCHAR(30) DEFAULT 'bwalpha',   -- de onde veio o sinal (webhook TradingView)
    created_at TIMESTAMP DEFAULT NOW(),
    closed_at TIMESTAMP
);

CREATE TABLE chat_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(10) NOT NULL,              -- user | assistant
    message TEXT NOT NULL,
    image_url TEXT,                         -- print enviado pelo usuário, se houver
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE economic_events (
    id SERIAL PRIMARY KEY,
    event_name VARCHAR(150) NOT NULL,
    country VARCHAR(50),
    impact VARCHAR(10),                     -- low | medium | high
    event_time TIMESTAMP NOT NULL,
    forecast VARCHAR(30),
    previous VARCHAR(30),
    actual VARCHAR(30)
);

CREATE TABLE subscriptions_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(30),                   -- hotmart | stripe
    event_type VARCHAR(50),                 -- purchase | renewal | cancellation
    raw_payload JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Índices úteis
CREATE INDEX idx_signals_pair ON signals(pair);
CREATE INDEX idx_signals_status ON signals(status);
CREATE INDEX idx_chat_user ON chat_history(user_id);
CREATE INDEX idx_events_time ON economic_events(event_time);
