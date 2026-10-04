-- Ligas de Palpites - schema PostgreSQL (16+)
-- Fica no schema `ligas` para não colidir com as tabelas atuais da TradeOn.
-- Dinheiro real e banca virtual em centavos (BIGINT). Odds em NUMERIC(8,3).

CREATE SCHEMA IF NOT EXISTS ligas;
SET search_path TO ligas;

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;   -- e-mail sem diferença de maiúsculas

-- ---------------------------------------------------------------------------
-- Usuários, KYC e convites
-- ---------------------------------------------------------------------------

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           CITEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    display_name    VARCHAR(40) UNIQUE NOT NULL,          -- apelido público no ranking
    cpf             CHAR(11) UNIQUE,                       -- preenchido no KYC; 1 conta por CPF
    birth_date      DATE,
    phone           VARCHAR(20),
    kyc_status      VARCHAR(12) NOT NULL DEFAULT 'pending'
                    CHECK (kyc_status IN ('pending', 'approved', 'rejected', 'review')),
    plan            VARCHAR(10) NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
    status          VARCHAR(12) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'self_excluded', 'suspended', 'banned')),
    self_excluded_until TIMESTAMPTZ,
    referred_by     UUID REFERENCES users(id),
    referral_code   VARCHAR(12) UNIQUE NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE kyc_checks (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id),
    provider        VARCHAR(30) NOT NULL,                  -- ex: idwall, unico, serpro
    check_type      VARCHAR(20) NOT NULL,                  -- cpf | selfie | pep | sanctions
    result          VARCHAR(12) NOT NULL CHECK (result IN ('pass', 'fail', 'review')),
    raw_response    JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Limites de jogo responsável definidos pelo próprio usuário
CREATE TABLE user_limits (
    user_id             UUID PRIMARY KEY REFERENCES users(id),
    daily_deposit_cents BIGINT,
    monthly_deposit_cents BIGINT,
    daily_entries       INTEGER,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cupons de entrada (convite, patrocínio, retenção). Valem só como entrada, nunca saque.
CREATE TABLE entry_coupons (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id),
    source          VARCHAR(20) NOT NULL CHECK (source IN ('referral', 'sponsor', 'promo', 'support')),
    max_entry_cents BIGINT NOT NULL,                       -- ex: 1000 = vale liga de até R$10
    referral_user_id UUID REFERENCES users(id),            -- amigo que gerou o cupom
    expires_at      TIMESTAMPTZ NOT NULL,
    used_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Carteira (dinheiro real) - livro-razão imutável
-- ---------------------------------------------------------------------------

CREATE TABLE wallets (
    user_id         UUID PRIMARY KEY REFERENCES users(id),
    balance_cents   BIGINT NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
    locked_cents    BIGINT NOT NULL DEFAULT 0 CHECK (locked_cents >= 0), -- saque em processamento
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Toda movimentação vira uma linha; o saldo da carteira é a soma das linhas.
CREATE TABLE wallet_transactions (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id),
    type            VARCHAR(20) NOT NULL CHECK (type IN (
                        'deposit', 'withdrawal', 'entry_fee', 'entry_refund',
                        'prize', 'adjustment')),
    amount_cents    BIGINT NOT NULL,                       -- + entra, - sai
    balance_after_cents BIGINT NOT NULL,
    league_id       BIGINT,                                -- FK adicionada abaixo
    psp             VARCHAR(20),                           -- asaas | mercadopago | ...
    psp_reference   VARCHAR(100),
    payer_cpf       CHAR(11),                              -- Pix tem de vir do CPF do titular
    status          VARCHAR(12) NOT NULL DEFAULT 'confirmed'
                    CHECK (status IN ('pending', 'confirmed', 'failed', 'reversed')),
    idempotency_key VARCHAR(100) UNIQUE NOT NULL,          -- evita crédito duplo de webhook
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Eventos esportivos, mercados e odds (vindos do agregador)
-- ---------------------------------------------------------------------------

CREATE TABLE sports_events (
    id              BIGSERIAL PRIMARY KEY,
    provider        VARCHAR(20) NOT NULL,                  -- the-odds-api | sportradar | ...
    provider_event_id VARCHAR(80) NOT NULL,
    sport           VARCHAR(30) NOT NULL,                  -- soccer | basketball | esports_cs2 ...
    competition     VARCHAR(80) NOT NULL,                  -- ex: Brasileirão Série A
    home_team       VARCHAR(80) NOT NULL,
    away_team       VARCHAR(80) NOT NULL,
    starts_at       TIMESTAMPTZ NOT NULL,
    status          VARCHAR(12) NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled', 'live', 'finished', 'postponed', 'cancelled')),
    home_score      SMALLINT,
    away_score      SMALLINT,
    result_confirmed_at TIMESTAMPTZ,                       -- 2ª fonte bateu com a 1ª
    UNIQUE (provider, provider_event_id)
);

CREATE TABLE markets (
    id              BIGSERIAL PRIMARY KEY,
    event_id        BIGINT NOT NULL REFERENCES sports_events(id),
    market_type     VARCHAR(20) NOT NULL,                  -- h2h | totals | spreads | btts
    line            NUMERIC(6,2),                          -- ex: 2.5 gols; NULL no 1X2
    status          VARCHAR(10) NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'suspended', 'settled', 'void')),
    UNIQUE (event_id, market_type, line)
);

CREATE TABLE selections (
    id              BIGSERIAL PRIMARY KEY,
    market_id       BIGINT NOT NULL REFERENCES markets(id),
    code            VARCHAR(20) NOT NULL,                  -- home | draw | away | over | under ...
    fair_odds       NUMERIC(8,3),                          -- consenso sem margem (de-vig)
    offered_odds    NUMERIC(8,3),                          -- fair com a margem da liga aplicada
    closing_odds    NUMERIC(8,3),                          -- última odd antes do início (para CLV)
    odds_updated_at TIMESTAMPTZ,
    result          VARCHAR(6) CHECK (result IN ('win', 'lose', 'void', 'half_win', 'half_lose')),
    UNIQUE (market_id, code)
);

-- Histórico das odds oferecidas (auditoria e disputa de palpite)
CREATE TABLE odds_snapshots (
    selection_id    BIGINT NOT NULL REFERENCES selections(id),
    captured_at     TIMESTAMPTZ NOT NULL,
    fair_odds       NUMERIC(8,3) NOT NULL,
    bookmaker_count SMALLINT NOT NULL,
    PRIMARY KEY (selection_id, captured_at)
);

-- ---------------------------------------------------------------------------
-- Ligas
-- ---------------------------------------------------------------------------

CREATE TABLE sponsors (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(80) NOT NULL,
    contract_value_cents BIGINT,
    logo_url        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE leagues (
    id              BIGSERIAL PRIMARY KEY,
    slug            VARCHAR(60) UNIQUE NOT NULL,
    title           VARCHAR(100) NOT NULL,
    format          VARCHAR(12) NOT NULL DEFAULT 'standard'
                    CHECK (format IN ('standard', 'knockout')),
    duration        VARCHAR(6) NOT NULL CHECK (duration IN ('24h', '7d', '30d')),
    entry_fee_cents BIGINT NOT NULL CHECK (entry_fee_cents >= 0),   -- 0 = liga grátis
    take_rate_bps   INTEGER NOT NULL DEFAULT 1700,         -- 1700 = 17% retido
    guaranteed_prize_cents BIGINT NOT NULL,                -- prêmio anunciado antes de abrir
    min_entries     INTEGER NOT NULL,                      -- abaixo disso a liga é cancelada e reembolsada
    max_entries     INTEGER NOT NULL,
    start_bankroll_cents BIGINT NOT NULL DEFAULT 100000,   -- R$1.000 virtuais
    max_stake_bps   INTEGER NOT NULL DEFAULT 1000,         -- 10% da banca atual
    min_settled_bets SMALLINT NOT NULL DEFAULT 10,         -- abaixo disso o Skill Score é penalizado
    max_odds        NUMERIC(8,3) NOT NULL DEFAULT 25.000,  -- teto por palpite (simples ou múltipla)
    margin_bps      INTEGER NOT NULL DEFAULT 200,          -- margem sobre a fair odd (2%)
    allowed_sports  TEXT[] NOT NULL,
    allowed_competitions TEXT[],
    sponsor_id      BIGINT REFERENCES sponsors(id),
    status          VARCHAR(12) NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'open', 'running', 'settling', 'finished', 'cancelled')),
    opens_at        TIMESTAMPTZ NOT NULL,
    starts_at       TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at AND starts_at >= opens_at),
    CHECK (max_entries >= min_entries)
);

ALTER TABLE wallet_transactions
    ADD CONSTRAINT wallet_tx_league_fk FOREIGN KEY (league_id) REFERENCES leagues(id);

-- Tabela de premiação fixa, publicada junto com a liga
CREATE TABLE league_prize_tiers (
    league_id       BIGINT NOT NULL REFERENCES leagues(id),
    rank_from       INTEGER NOT NULL,
    rank_to         INTEGER NOT NULL,
    prize_cents     BIGINT NOT NULL CHECK (prize_cents > 0), -- valor por colocação
    prize_item      VARCHAR(120),                          -- brinde de patrocinador, se houver
    PRIMARY KEY (league_id, rank_from),
    CHECK (rank_to >= rank_from)
);

CREATE TABLE league_entries (
    id              BIGSERIAL PRIMARY KEY,
    league_id       BIGINT NOT NULL REFERENCES leagues(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    entry_tx_id     BIGINT REFERENCES wallet_transactions(id),
    coupon_id       BIGINT REFERENCES entry_coupons(id),
    bankroll_cents  BIGINT NOT NULL,                       -- disponível para novos palpites
    exposure_cents  BIGINT NOT NULL DEFAULT 0,             -- stake em palpites abertos
    peak_equity_cents BIGINT NOT NULL,                     -- maior (banca + exposição) já atingido
    max_drawdown_bps INTEGER NOT NULL DEFAULT 0,           -- maior queda desde o pico
    settled_bets    INTEGER NOT NULL DEFAULT 0,
    clv_sum_bps     BIGINT NOT NULL DEFAULT 0,             -- soma do CLV ponderado por stake
    clv_stake_cents BIGINT NOT NULL DEFAULT 0,
    skill_score     NUMERIC(12,4),
    final_rank      INTEGER,
    status          VARCHAR(12) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'knocked_out', 'disqualified', 'refunded')),
    knocked_out_at  TIMESTAMPTZ,
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Uma entrada por usuário por liga (multi-entrada é o principal vetor de conluio)
CREATE UNIQUE INDEX uq_entry_user_league ON league_entries (league_id, user_id);

-- ---------------------------------------------------------------------------
-- Palpites (simulados) e pernas da múltipla
-- ---------------------------------------------------------------------------

CREATE TABLE bets (
    id              BIGSERIAL PRIMARY KEY,
    entry_id        BIGINT NOT NULL REFERENCES league_entries(id),
    bet_type        VARCHAR(8) NOT NULL CHECK (bet_type IN ('single', 'parlay')),
    stake_cents     BIGINT NOT NULL CHECK (stake_cents > 0),
    bankroll_before_cents BIGINT NOT NULL,                 -- prova do limite de 10%
    total_odds      NUMERIC(10,3) NOT NULL CHECK (total_odds > 1),
    potential_return_cents BIGINT NOT NULL,
    status          VARCHAR(10) NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'won', 'lost', 'void', 'cashed_out')),
    return_cents    BIGINT,
    clv_bps         INTEGER,                               -- (odd tomada / odd de fechamento - 1)
    client_ip       INET,
    device_id       VARCHAR(64),
    placed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    settled_at      TIMESTAMPTZ
    -- O teto de stake (leagues.max_stake_bps) é validado na mesma transação que
    -- trava a entrada com SELECT ... FOR UPDATE; bankroll_before_cents fica de prova.
);

CREATE TABLE bet_legs (
    bet_id          BIGINT NOT NULL REFERENCES bets(id),
    selection_id    BIGINT NOT NULL REFERENCES selections(id),
    event_id        BIGINT NOT NULL REFERENCES sports_events(id),
    odds_taken      NUMERIC(8,3) NOT NULL,
    result          VARCHAR(6) CHECK (result IN ('win', 'lose', 'void', 'half_win', 'half_lose')),
    PRIMARY KEY (bet_id, selection_id),
    UNIQUE (bet_id, event_id)                              -- sem duas pernas do mesmo jogo (correlação)
);

-- ---------------------------------------------------------------------------
-- Prêmios e antifraude
-- ---------------------------------------------------------------------------

CREATE TABLE payouts (
    id              BIGSERIAL PRIMARY KEY,
    league_id       BIGINT NOT NULL REFERENCES leagues(id),
    entry_id        BIGINT NOT NULL UNIQUE REFERENCES league_entries(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    rank            INTEGER NOT NULL,
    prize_cents     BIGINT NOT NULL,
    irrf_cents      BIGINT NOT NULL DEFAULT 0,             -- imposto retido, se aplicável
    status          VARCHAR(12) NOT NULL DEFAULT 'held'
                    CHECK (status IN ('held', 'released', 'credited', 'blocked')),
    hold_reason     TEXT,                                  -- ex: revisão antifraude
    wallet_tx_id    BIGINT REFERENCES wallet_transactions(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    released_at     TIMESTAMPTZ
);

CREATE TABLE device_sessions (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id),
    device_id       VARCHAR(64) NOT NULL,                  -- fingerprint (FingerprintJS etc.)
    ip              INET NOT NULL,
    user_agent      TEXT,
    seen_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE fraud_signals (
    id              BIGSERIAL PRIMARY KEY,
    league_id       BIGINT REFERENCES leagues(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    related_user_id UUID REFERENCES users(id),
    signal          VARCHAR(30) NOT NULL,                  -- shared_device | shared_ip | mirrored_bets
                                                           -- | opposite_bets | bot_timing | pix_mismatch
    score           NUMERIC(5,2) NOT NULL,                 -- 0-100
    evidence        JSONB NOT NULL,
    reviewed_by     VARCHAR(60),
    decision        VARCHAR(12) CHECK (decision IN ('dismissed', 'warned', 'disqualified', 'banned')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------

CREATE INDEX idx_wallet_tx_user ON wallet_transactions (user_id, created_at DESC);
CREATE INDEX idx_events_start ON sports_events (starts_at) WHERE status = 'scheduled';
CREATE INDEX idx_leagues_status ON leagues (status, starts_at);
CREATE INDEX idx_entries_rank ON league_entries (league_id, skill_score DESC);
CREATE INDEX idx_bets_entry ON bets (entry_id, placed_at);
CREATE INDEX idx_bets_open ON bets (status) WHERE status = 'open';
CREATE INDEX idx_legs_event ON bet_legs (event_id);           -- liquidar tudo de um jogo
CREATE INDEX idx_device_lookup ON device_sessions (device_id);
CREATE INDEX idx_device_ip ON device_sessions (ip);
CREATE INDEX idx_fraud_open ON fraud_signals (league_id) WHERE decision IS NULL;
