// Estudo das análises do site (pedido do dono em 21/10: "a análise do site está dando muito RED").
// Lê a tabela analyses (sinais entregues aos usuários, com WIN/RED conferido) e mostra o acerto por ativo, tempo,
// confiança, tipo de leitura, direção e horário de Brasília, separado em duas metades no tempo: só vale cortar ou
// manter uma faixa que se comporta igual nas duas. Mostra também o acerto se o sinal fosse invertido.
// BACKTEST_SOURCE=site; logs SITE_*.
const pct = (w, n) => (n ? +(100 * w / n).toFixed(1) : null);

async function runSite(pool) {
    const { rows } = await pool.query(`SELECT pair, timeframe, direction, confidence, leitura, entry_time, result
        FROM analyses WHERE result IN ('win', 'loss') ORDER BY entry_time`);
    if (!rows.length) { console.log('SITE_TOTAL sem análises conferidas'); return; }
    const corte = rows[Math.floor(rows.length / 2)].entry_time.getTime();
    const resume = (l) => { const w = l.filter((r) => r.result === 'win').length; return { n: l.length, acerto: pct(w, l.length) }; };
    const metades = (l) => ({ tudo: resume(l), m1: resume(l.filter((r) => r.entry_time.getTime() < corte)), m2: resume(l.filter((r) => r.entry_time.getTime() >= corte)) });
    console.log(`SITE_TOTAL de=${rows[0].entry_time.toISOString().slice(0, 10)} ate=${rows.at(-1).entry_time.toISOString().slice(0, 10)} ${JSON.stringify(metades(rows))}`);
    const hora = (r) => { const h = new Date(r.entry_time.getTime() - 3 * 3600_000).getUTCHours(); return `${String(h).padStart(2, '0')}h`; };
    const sessao = (r) => { const h = new Date(r.entry_time.getTime() - 3 * 3600_000).getUTCHours(); return h >= 22 || h < 4 ? '22h-04h' : h < 9 ? '04h-09h' : h < 13 ? '09h-13h' : h < 18 ? '13h-18h' : '18h-22h'; };
    const chaves = {
        ativo_tempo: (r) => `${r.pair} ${r.timeframe}`,
        confianca: (r) => `${r.timeframe} ${r.confidence || '?'}`,
        leitura: (r) => `${r.timeframe} ${r.leitura || '-'}`,
        direcao: (r) => `${r.pair} ${r.timeframe} ${r.direction}`,
        sessao_brt: (r) => `${r.timeframe} ${sessao(r)}`,
        hora_brt: (r) => `${r.timeframe} ${hora(r)}`,
        ativo_tempo_confianca: (r) => `${r.pair} ${r.timeframe} ${r.confidence || '?'}`,
    };
    for (const [nome, f] of Object.entries(chaves)) {
        const grupos = {};
        for (const r of rows) (grupos[f(r)] ||= []).push(r);
        const out = Object.fromEntries(Object.entries(grupos).filter(([, l]) => l.length >= 10).sort().map(([k, l]) => [k, metades(l)]));
        console.log(`SITE_FAIXA ${nome} ${JSON.stringify(out)}`);
    }
}

module.exports = { runSite };
