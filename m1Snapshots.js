// Foto do candle M1 ao vivo no segundo em que o app pede o sinal (13s antes do fechamento).
// O backtest com candles já fechados não mostra o que o candle parecia nesse momento, e é aí que
// o acerto real e o do teste se separam. Com estas fotos, o backtest (BACKTEST_SOURCE=snap)
// testa as regras com exatamente o que o sinal viu. Desliga com M1_SNAPSHOTS=0.
const pool = require('./db');
const { getLiveM1 } = require('./liveCandles');

// Mesma fonte que o sinal usa (LIVE_SOURCE, ex.: exnova), para o teste ver o que o sinal viu.
const PAIRS = { EURUSD: 'EUR/USD', XAUUSD: 'XAU/USD', EURJPY: 'EUR/JPY' };
const SNAP_SECOND = 47;
const KEEP_DAYS = 21;

async function ensureTable() {
    await pool.query(`CREATE TABLE IF NOT EXISTS m1_snapshots (
        pair VARCHAR(12) NOT NULL,
        time TIMESTAMPTZ NOT NULL,
        open NUMERIC NOT NULL, high NUMERIC NOT NULL, low NUMERIC NOT NULL, close NUMERIC NOT NULL,
        ticks INTEGER,
        PRIMARY KEY (pair, time)
    )`);
}

function start() {
    if (process.env.M1_SNAPSHOTS === '0') return;
    let lastMinute = 0;
    let saved = 0;
    ensureTable().then(() => {
        setInterval(async () => {
            const now = Date.now();
            const minute = Math.floor(now / 60_000) * 60_000;
            if (minute === lastMinute || new Date(now).getUTCSeconds() < SNAP_SECOND) return;
            lastMinute = minute;
            for (const [pair, sym] of Object.entries(PAIRS)) {
                const c = getLiveM1(sym, minute, now);
                if (!c) continue;
                try {
                    await pool.query(
                        `INSERT INTO m1_snapshots (pair, time, open, high, low, close, ticks) VALUES ($1, $2, $3, $4, $5, $6, $7)
                         ON CONFLICT (pair, time) DO NOTHING`,
                        [pair, new Date(minute), c.open, c.high, c.low, c.close, c.ticks]);
                    if (++saved === 1 || saved % 500 === 0) console.log(`Fotos M1: ${saved} gravadas`);
                } catch (err) {
                    console.error('Fotos M1: erro ao gravar', err.message);
                }
            }
            if (new Date(now).getUTCMinutes() === 0 && new Date(now).getUTCHours() === 3) {
                pool.query(`DELETE FROM m1_snapshots WHERE time < NOW() - INTERVAL '${KEEP_DAYS} days'`).catch(() => {});
            }
        }, 1000);
    }).catch((err) => console.error('Fotos M1: erro ao criar tabela', err.message));
}

module.exports = { start };
