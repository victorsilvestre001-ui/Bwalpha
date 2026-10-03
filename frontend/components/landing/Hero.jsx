"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import HeroChart from "@/components/landing/HeroChart";

const fade = (delay) => ({ initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] } });

export default function Hero() {
  return (
    <section className="relative overflow-hidden pb-16 pt-32 md:pb-20 md:pt-40">
      <div className="aurora pointer-events-none absolute inset-0" />
      <div className="bg-grid pointer-events-none absolute inset-0" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 md:px-8 lg:grid-cols-[1.02fr_1fr]">
        <div>
          <motion.span {...fade(0)} className="eyebrow">
            <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon opacity-60" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-neon" /></span>
            Forex e Ouro · leitura em segundos
          </motion.span>

          <motion.h1 {...fade(0.1)} className="mt-6 font-display text-[2.8rem] font-extrabold leading-[1.02] tracking-tight text-mist sm:text-6xl lg:text-[4rem]">
            O gráfico fala.<br />
            <span className="grad-text">A gente traduz.</span>
          </motion.h1>

          <motion.p {...fade(0.2)} className="mt-6 max-w-xl text-base leading-relaxed text-mist-dim md:text-lg">
            Média, RSI, MACD e candle viram uma frase que você entende, em 5 segundos, no EURUSD, no EURJPY e no Ouro.
            E tudo fica anotado: os acertos e também os erros.
          </motion.p>

          <motion.div {...fade(0.3)} className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/auth?mode=register" className="btn-primary !px-7 !py-3.5">
              Ler meu primeiro gráfico <ArrowRight size={16} />
            </Link>
            <a href="#leitura" className="btn-ghost !px-7 !py-3.5">Ver o que a IA enxerga</a>
          </motion.div>

          <motion.div {...fade(0.45)} className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-mist-dim">
            {["1 leitura grátis todo dia", "Sem cartão", "Devolvemos em 7 dias se não curtir"].map((t) => (
              <span key={t} className="flex items-center gap-2"><Check size={15} className="text-neon" />{t}</span>
            ))}
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="relative"
        >
          <div className="absolute -inset-8 rounded-[2rem] bg-gradient-to-br from-neon/20 via-volt/10 to-pulse/20 blur-3xl" />
          <div className="relative"><HeroChart /></div>
        </motion.div>
      </div>
    </section>
  );
}
