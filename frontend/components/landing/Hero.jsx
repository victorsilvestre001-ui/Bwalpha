"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, LineChart, Check } from "lucide-react";

// Candles determinísticos para o mockup (sem aleatoriedade, o servidor e o navegador desenham igual).
const CANDLES = (() => {
  const out = [];
  let price = 60;
  for (let i = 0; i < 34; i++) {
    const drift = Math.sin(i / 4) * 2.2 + 0.9;
    const open = price;
    const close = open + drift + (i % 3 === 0 ? -2.6 : 0.4);
    const high = Math.max(open, close) + 1.6 + (i % 4) * 0.4;
    const low = Math.min(open, close) - 1.4 - (i % 5) * 0.3;
    out.push({ open, close, high, low });
    price = close;
  }
  return out;
})();

function ema(values, period) {
  const k = 2 / (period + 1);
  let prev = values[0];
  return values.map((v) => (prev = v * k + prev * (1 - k)));
}

function ChartPreview() {
  const W = 520, H = 210, pad = 8;
  const lo = Math.min(...CANDLES.map((c) => c.low)), hi = Math.max(...CANDLES.map((c) => c.high));
  const y = (v) => pad + (H - 2 * pad) * (1 - (v - lo) / (hi - lo));
  const step = W / CANDLES.length;
  const x = (i) => step * i + step / 2;
  const closes = CANDLES.map((c) => c.close);
  const line = (vals) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

  return (
    <div className="panel panel-glow grad-border relative overflow-hidden p-5 md:p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-mono text-xs text-mist-dim">
          <span className="h-2 w-2 rounded-full bg-neon" />
          PAINEL DE ANÁLISE
        </div>
        <span className="rounded-md bg-void-deep px-2 py-1 font-mono text-[11px] text-mist-dim">XAUUSD · M5</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 h-44 w-full md:h-52" preserveAspectRatio="none" aria-hidden="true">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="#1B2440" strokeWidth="1" />
        ))}
        {CANDLES.map((c, i) => {
          const up = c.close >= c.open;
          const color = up ? "#00F0A8" : "#FF4D6D";
          const top = y(Math.max(c.open, c.close)), bot = y(Math.min(c.open, c.close));
          return (
            <g key={i}>
              <line x1={x(i)} x2={x(i)} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth="1.2" />
              <rect x={x(i) - step * 0.3} y={top} width={step * 0.6} height={Math.max(bot - top, 1.5)} fill={color} rx="1" />
            </g>
          );
        })}
        <path d={line(ema(closes, 9))} fill="none" stroke="#3D8BFF" strokeWidth="2" />
        <path d={line(ema(closes, 21))} fill="none" stroke="#9B5CFF" strokeWidth="2" opacity="0.85" />
      </svg>
      <div className="mt-2 flex gap-4 font-mono text-[10px] text-mist-faint">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-volt" />EMA 9</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-pulse" />EMA 21</span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {[
          { k: "Tendência", v: "Alta", c: "text-neon" },
          { k: "RSI 14", v: "58", c: "text-mist" },
          { k: "MACD", v: "Positivo", c: "text-mist" }
        ].map((s) => (
          <div key={s.k} className="rounded-xl border border-void-line bg-void-deep/60 p-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-mist-faint">{s.k}</div>
            <div className={`mt-1 font-display text-base font-semibold ${s.c}`}>{s.v}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-void-line bg-void-deep/40">
        <div className="border-b border-void-line px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-mist-faint">Histórico</div>
        {[
          ["EURUSD", "M1", "Acerto", true],
          ["XAUUSD", "M5", "Acerto", true],
          ["EURJPY", "M1", "Erro", false]
        ].map(([a, t, r, ok], i) => (
          <div key={i} className={`flex items-center justify-between px-4 py-2 text-xs ${i ? "border-t border-void-line" : ""}`}>
            <span className="font-mono text-mist">{a} <span className="text-mist-faint">{t}</span></span>
            <span className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] ${ok ? "bg-neon/10 text-neon" : "bg-ember/10 text-ember-soft"}`}>{r}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 font-mono text-[10px] text-mist-faint">* Imagem ilustrativa da interface.</p>
    </div>
  );
}

export default function Hero() {
  return (
    <section className="relative overflow-hidden pb-20 pt-32 md:pb-28 md:pt-40">
      <div className="aurora pointer-events-none absolute inset-0" />
      <div className="bg-grid pointer-events-none absolute inset-0" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 md:px-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <motion.span initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="eyebrow">
            <LineChart size={12} /> Análise técnica com IA · Forex e Ouro
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="mt-6 font-display text-[2.6rem] font-bold leading-[1.05] tracking-tight text-mist sm:text-6xl lg:text-7xl"
          >
            Análise técnica profissional, <span className="grad-text">em segundos</span>.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="mt-6 max-w-xl text-base leading-relaxed text-mist-dim md:text-lg"
          >
            A TradeOn AI combina médias móveis, RSI, MACD e leitura de candles para analisar
            EURUSD, EURJPY e Ouro (XAUUSD) no M1 e M5. Cada análise fica registrada no seu histórico.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="mt-9 flex flex-col gap-3 sm:flex-row"
          >
            <Link href="/auth?mode=register" className="btn-primary !px-7 !py-3.5">
              Criar conta grátis <ArrowRight size={16} />
            </Link>
            <a href="#como-funciona" className="btn-ghost !px-7 !py-3.5">Ver como funciona</a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="mt-10 flex flex-wrap gap-6 text-sm text-mist-dim"
          >
            {["1 análise grátis por dia", "Histórico transparente", "Sem cartão para começar"].map((t) => (
              <span key={t} className="flex items-center gap-2"><Check size={16} className="text-neon" />{t}</span>
            ))}
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="relative animate-floaty"
        >
          <div className="absolute -inset-8 rounded-[2rem] bg-gradient-to-br from-neon/20 via-volt/10 to-pulse/20 blur-3xl" />
          <ChartPreview />
        </motion.div>
      </div>
    </section>
  );
}
