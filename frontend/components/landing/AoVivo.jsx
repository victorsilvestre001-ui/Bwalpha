"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { assetDigits } from "@/lib/assets";
import HeroChart from "@/components/landing/HeroChart";

// Faixa "ao vivo": o gráfico do Ouro no centro e as cotações em cartões inclinados dos lados,
// com a palavra gigante apagada no fundo (como a vitrine de trabalhos do visual de referência).
const FALLBACK = [{ label: "EURUSD", rate: null }, { label: "EURJPY", rate: null }, { label: "XAUUSD", rate: null }];
const NOME = { EURUSD: "Euro / Dólar", EURJPY: "Euro / Iene", XAUUSD: "Ouro" };

function Cartao({ k, v, sub, tilt, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }}
      style={{ transform: `perspective(900px) rotateY(${tilt}deg)` }}
      className="flex h-44 flex-col justify-between rounded-[24px] border border-white/10 bg-gradient-to-b from-ink-card to-ink-raised p-5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)] md:h-56"
    >
      <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-white/40">{k}</span>
      <div>
        <div className="mega text-3xl text-white md:text-4xl">{v}</div>
        <div className="soft-italic mt-1 text-sm text-white/50">{sub}</div>
      </div>
    </motion.div>
  );
}

export default function AoVivo() {
  const [quotes, setQuotes] = useState(FALLBACK);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    api.publicQuotes().then((q) => { if (Array.isArray(q) && q.length) setQuotes(q); }).catch(() => {});
    api.marketStatus().then((s) => setOpen(!!s?.open)).catch(() => {});
  }, []);

  const q = (l) => quotes.find((x) => x.label === l);
  const fmt = (l) => (q(l)?.rate ? q(l).rate.toFixed(assetDigits(l)) : "—");

  return (
    <section id="ao-vivo" className="relative overflow-hidden py-20 md:py-28">
      <div aria-hidden="true" className="soft-italic pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 select-none whitespace-nowrap text-center text-[22vw] leading-none text-white/[0.035]">
        ao vivo
      </div>

      <div className="relative mx-auto grid max-w-[1400px] items-center gap-4 px-4 md:grid-cols-[1fr_2.2fr_1fr] md:gap-6 md:px-8">
        <div className="order-2 grid grid-cols-2 gap-4 md:order-1 md:grid-cols-1">
          <Cartao k="EURUSD" v={fmt("EURUSD")} sub={NOME.EURUSD} tilt={14} delay={0.1} />
          <Cartao k="EURJPY" v={fmt("EURJPY")} sub={NOME.EURJPY} tilt={10} delay={0.2} />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.97 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          className="order-1 md:order-2"
        >
          <HeroChart />
        </motion.div>
        <div className="order-3 grid grid-cols-2 gap-4 md:grid-cols-1">
          <Cartao k="Ouro" v={fmt("XAUUSD")} sub={NOME.XAUUSD} tilt={-10} delay={0.2} />
          <Cartao k="Mercado" v={open == null ? "—" : open ? "Aberto" : "Fechado"} sub="dom 19h até sex 19h" tilt={-14} delay={0.3} />
        </div>
      </div>
    </section>
  );
}
