"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, TrendingUp, Activity, Zap } from "lucide-react";

const BARS = [38, 52, 44, 61, 57, 70, 64, 78, 73, 86, 80, 92];

function SignalPreview() {
  return (
    <div className="panel panel-glow grad-border relative overflow-hidden p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 animate-scan bg-gradient-to-b from-neon/10 to-transparent" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-mono text-xs text-mist-dim">
          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-neon" /></span>
          ANÁLISE AO VIVO
        </div>
        <span className="rounded-md bg-void-deep px-2 py-1 font-mono text-[11px] text-mist-dim">EURUSD · M5</span>
      </div>

      <div className="mt-6 flex h-32 items-end gap-1.5">
        {BARS.map((h, i) => (
          <motion.div
            key={i}
            className="flex-1 rounded-t-md bg-gradient-to-t from-volt/30 to-neon/80"
            initial={{ height: 0 }}
            animate={{ height: `${h}%` }}
            transition={{ duration: 0.9, delay: 0.4 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        {[
          { k: "Direção", v: "COMPRA", c: "text-neon" },
          { k: "Confiança", v: "Alta", c: "text-mist" },
          { k: "RSI 14", v: "58.4", c: "text-mist" }
        ].map((s) => (
          <div key={s.k} className="rounded-xl border border-void-line bg-void-deep/60 p-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-mist-faint">{s.k}</div>
            <div className={`mt-1 font-display text-base font-semibold ${s.c}`}>{s.v}</div>
          </div>
        ))}
      </div>
      <p className="mt-4 font-mono text-[10px] text-mist-faint">* Exemplo ilustrativo da interface.</p>
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
            <Sparkles size={12} /> Nova geração · TradeOn AI
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="mt-6 font-display text-[2.6rem] font-bold leading-[1.05] tracking-tight text-mist sm:text-6xl lg:text-7xl"
          >
            Ligue o seu trade <br className="hidden sm:block" />
            na <span className="grad-text">inteligência</span> certa.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="mt-6 max-w-xl text-base leading-relaxed text-mist-dim md:text-lg"
          >
            A TradeOn AI lê o mercado em segundos — médias, RSI, MACD, padrões de candle e a leitura dos últimos 5 candles —
            e entrega uma direção clara para EURUSD, EURJPY e Ouro (XAUUSD) em M1 e M5.
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
            {[
              { i: Zap, t: "Sinal em segundos" },
              { i: Activity, t: "5+ indicadores combinados" },
              { i: TrendingUp, t: "EURUSD, EURJPY & Ouro" }
            ].map(({ i: Icon, t }) => (
              <span key={t} className="flex items-center gap-2"><Icon size={16} className="text-neon" />{t}</span>
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
          <SignalPreview />
        </motion.div>
      </div>
    </section>
  );
}
