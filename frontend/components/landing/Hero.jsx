"use client";
import { motion } from "framer-motion";
import Stars from "@/components/landing/Stars";

const fade = (delay) => ({ initial: { opacity: 0, y: 28 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] } });

// Palavras soltas embaixo do título, cada uma num estilo (como no visual de referência).
const CHIPS = [
  { t: "EURUSD", c: "font-tight text-base font-semibold" },
  { t: "EURJPY", c: "soft-italic text-lg" },
  { t: "Ouro", c: "font-tight text-lg font-medium" },
  { t: "M1 e M5", c: "soft-italic text-base" }
];

export default function Hero() {
  return (
    <section className="relative flex min-h-[92vh] items-center justify-center overflow-hidden pb-16 pt-32">
      <Stars />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(60%_60%_at_50%_100%,rgba(139,108,246,0.16),transparent_70%)]" />

      <div className="relative mx-auto max-w-6xl px-4 text-center">
        <motion.p {...fade(0)} className="soft-italic text-[2.6rem] leading-none text-white sm:text-6xl md:text-7xl">
          O gráfico fala.
        </motion.p>
        <motion.h1 {...fade(0.12)} className="mega mt-2 text-[3.4rem] text-lilac sm:text-[6rem] md:text-[8.5rem]">
          A gente traduz.
        </motion.h1>

        <motion.div {...fade(0.28)} className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-white/85">
          {CHIPS.map((c, i) => (
            <span key={c.t} className="flex items-center gap-4">
              {i > 0 && <span className="text-lilac">+</span>}
              <span className={c.c}>{c.t}</span>
            </span>
          ))}
        </motion.div>

        <motion.p {...fade(0.4)} className="mx-auto mt-8 max-w-xl text-sm leading-relaxed text-white/55 md:text-base">
          Média, RSI, MACD e candle viram uma frase que você entende, em 5 segundos. E tudo fica anotado: os acertos e também os erros.
        </motion.p>

        <motion.a {...fade(0.55)} href="#ao-vivo" className="mt-14 inline-flex flex-col items-center gap-3 text-white/40 transition-colors hover:text-white/70">
          <span className="flex h-9 w-5 justify-center rounded-full border border-white/25 pt-2">
            <span className="h-1.5 w-1 animate-scroll-dot rounded-full bg-white" />
          </span>
          <span className="font-tight text-[10px] uppercase tracking-[0.35em]">Role para descobrir</span>
        </motion.a>
      </div>
    </section>
  );
}
