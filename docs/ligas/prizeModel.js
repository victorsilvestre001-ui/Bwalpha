// Modelo de premiação das Ligas: quanto a plataforma retém, quanto vai para o
// prêmio e como o prêmio se divide entre os primeiros colocados.
// Uso: node docs/ligas/prizeModel.js [jogadores] [entrada_reais] [margem_alvo]

const players = Number(process.argv[2] || 100);
const entry = Number(process.argv[3] || 10);
const targetMargin = Number(process.argv[4] || 0.15); // margem líquida sobre o arrecadado

// Custos diretos (premissas; trocar pelos do contrato com o PSP)
const PIX_IN_PCT = 0.0099;   // custo do Pix de entrada
const PIX_OUT_FIXED = 1.0;   // custo por saque de prêmio (R$)
const PAID_SHARE = 0.10;     // top 10% premiados
const MIN_PRIZE_MULT = 1.5;  // último premiado recebe >= 1,5x a entrada

const gross = players * entry;
const paid = Math.max(1, Math.floor(players * PAID_SHARE));
const costs = gross * PIX_IN_PCT + paid * PIX_OUT_FIXED;
// Taxa retida arredondada para cima em pontos inteiros de %
const takeRate = Math.ceil(((targetMargin * gross + costs) / gross) * 100) / 100;
const pool = Math.round(gross * (1 - takeRate));

// Curva de potência: p_i ∝ 1 / i^alpha, com piso no último premiado.
// Busca o alpha que deixa o 1º com ~25% do prêmio sem furar o piso.
function curve(alpha) {
  const floor = entry * MIN_PRIZE_MULT;
  const w = Array.from({ length: paid }, (_, i) => 1 / Math.pow(i + 1, alpha));
  const rest = pool - floor * paid; // o que sobra depois de garantir o piso a todos
  const sw = w.reduce((a, b) => a + b, 0);
  return w.map(x => floor + rest * (x / sw));
}

function roundTo(values, step) {
  // Arredonda para múltiplos de `step` e acerta a diferença no 1º lugar
  const r = values.map(v => Math.round(v / step) * step);
  r[0] += pool - r.reduce((a, b) => a + b, 0);
  return r;
}

let best = null;
for (let a = 0.5; a <= 2.5; a += 0.01) {
  const c = curve(a);
  const diff = Math.abs(c[0] / pool - 0.25);
  if (!best || diff < best.diff) best = { a, c, diff };
}
const prizes = roundTo(best.c, 5);

const fmt = v => 'R$ ' + v.toFixed(2).replace('.', ',');
console.log(`Jogadores: ${players} | Entrada: ${fmt(entry)} | Arrecadado: ${fmt(gross)}`);
console.log(`Custos diretos (Pix entrada ${(PIX_IN_PCT * 100).toFixed(2)}% + ${paid} saques): ${fmt(costs)}`);
console.log(`Taxa retida: ${(takeRate * 100).toFixed(0)}% = ${fmt(gross * takeRate)}`);
console.log(`Margem líquida: ${fmt(gross * takeRate - costs)} (${(((gross * takeRate - costs) / gross) * 100).toFixed(1)}%)`);
console.log(`Prêmio garantido: ${fmt(pool)} | alpha=${best.a.toFixed(2)}`);
let acc = 0;
prizes.forEach((p, i) => {
  acc += p;
  console.log(`${String(i + 1).padStart(2)}º  ${fmt(p).padStart(10)}  ${((p / pool) * 100).toFixed(1).padStart(5)}%  ${(p / entry).toFixed(1).padStart(5)}x  acum ${((acc / pool) * 100).toFixed(1)}%`);
});
console.log(`Retorno médio ao jogador (RTP): ${((pool / gross) * 100).toFixed(1)}%`);
