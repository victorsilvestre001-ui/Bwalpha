// Simula uma banca aplicando os resultados reais do histórico, em ordem cronológica.
// results: [{ result: 'win'|'loss'|'draw', ... }] (mais antigo primeiro)
export function simulateBankroll(results, { capital, stakePct, payoutPct, targetPct, stopPct, compound }) {
  const target = capital * (1 + targetPct / 100);
  const stopAt = capital * (1 - stopPct / 100);
  let balance = capital;
  let peak = capital;
  let maxDrawdown = 0;
  let wins = 0, losses = 0, draws = 0;
  let status = "running";
  const points = [{ i: 0, balance, item: null, stake: 0, pnl: 0 }];

  for (const item of results) {
    const base = compound ? balance : capital;
    const stake = Math.min(balance, Math.round(base * (stakePct / 100) * 100) / 100);
    if (stake <= 0) { status = "broke"; break; }

    let pnl = 0;
    if (item.result === "win") { pnl = stake * (payoutPct / 100); wins++; }
    else if (item.result === "loss") { pnl = -stake; losses++; }
    else { draws++; }
    balance = Math.round((balance + pnl) * 100) / 100;

    peak = Math.max(peak, balance);
    maxDrawdown = Math.max(maxDrawdown, peak > 0 ? (peak - balance) / peak : 0);
    points.push({ i: points.length, balance, item, stake, pnl });

    if (balance >= target) { status = "target"; break; }
    if (balance <= 0) { status = "broke"; break; }
    if (balance <= stopAt) { status = "stop"; break; }
  }

  return {
    points,
    balance,
    pnl: balance - capital,
    pnlPct: ((balance - capital) / capital) * 100,
    wins, losses, draws,
    operations: points.length - 1,
    maxDrawdown,
    status,
    target,
    stopAt,
  };
}
