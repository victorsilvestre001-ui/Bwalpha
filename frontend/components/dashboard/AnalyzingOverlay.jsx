"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const STEPS = ["Coletando candles", "Lendo o candle atual", "Medindo a força do corpo", "Consolidando sinal"];

export default function AnalyzingOverlay() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 250);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-void/85 backdrop-blur-md">
      <div className="relative h-20 w-20">
        <div className="absolute inset-0 rounded-full border-2 border-void-line" />
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-neon border-r-volt" />
        <div className="absolute inset-4 rounded-full bg-neon/10 blur-md" />
      </div>
      <div className="mt-6 font-mono text-xs uppercase tracking-widest text-neon">{STEPS[step]}…</div>
      <div className="mt-4 flex gap-1.5">
        {STEPS.map((_, i) => <span key={i} className={`h-1 w-6 rounded-full transition-colors ${i <= step ? "bg-neon" : "bg-void-line"}`} />)}
      </div>
    </motion.div>
  );
}
