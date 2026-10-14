"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Search } from "lucide-react";

// "Como funciona na prática" em seção clara: passos à esquerda, celular no meio e cartão branco do lado
// (visual de referência). Os passos trocam sozinhos a cada 5 s ou no clique.
const STEPS = [
  {
    tag: "Conta", title: "Abre a conta em menos tempo que um café.",
    text: "Nome, e-mail e senha. Sem cartão.",
    card: { k: "Para começar", big: "R$ 0", sub: "1 leitura grátis todo dia" }
  },
  {
    tag: "Ativo", title: "Escolhe o ativo e o tempo do gráfico.",
    text: "EURUSD, EURJPY ou Ouro. M1 para o rápido, M5 para o com calma.",
    card: { k: "Na tela", big: "3", sub: "ativos · M1 e M5" }
  },
  {
    tag: "Leitura", title: "Lê em português. O clique final é seu.",
    text: "A IA entrega a leitura e anota. Quando o candle fecha, confere se acertou ou errou.",
    card: { k: "Leitura", big: "~5 s", sub: "conferida quando o candle fecha" }
  }
];

function Tela({ i }) {
  if (i === 0) return (
    <div className="space-y-3 p-4">
      <div className="font-tight text-base font-semibold text-white">Criar conta</div>
      {["Nome", "E-mail", "Senha"].map((c) => (
        <div key={c} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[11px] text-white/40">{c}</div>
      ))}
      <div className="rounded-full bg-lilac py-2.5 text-center text-xs font-semibold text-white">Começar grátis</div>
    </div>
  );
  if (i === 1) return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-2 rounded-full bg-white/[0.06] px-3 py-2 text-[11px] text-white/60"><Search size={12} /> Escolha o ativo</div>
      {[["EURUSD", "Euro / Dólar"], ["EURJPY", "Euro / Iene"], ["XAUUSD", "Ouro"]].map(([a, n], k) => (
        <div key={a} className={`flex items-center justify-between rounded-xl px-3 py-2.5 ${k === 2 ? "bg-lilac/25 ring-1 ring-lilac" : "bg-white/[0.04]"}`}>
          <span className="font-tight text-xs font-semibold text-white">{a}</span><span className="text-[10px] text-white/45">{n}</span>
        </div>
      ))}
      <div className="flex gap-2">
        <span className="flex-1 rounded-full bg-white/[0.06] py-1.5 text-center text-[10px] text-white/60">M1</span>
        <span className="flex-1 rounded-full bg-lilac py-1.5 text-center text-[10px] font-semibold text-white">M5</span>
      </div>
    </div>
  );
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between text-[10px] text-white/50"><span>XAUUSD · M5</span><span>leitura da IA</span></div>
      <svg viewBox="0 0 200 70" className="h-20 w-full">
        {[12, 20, 16, 28, 24, 34, 30, 42, 38, 48].map((y, k) => (
          <rect key={k} x={8 + k * 19} y={70 - y - 10} width="9" height={10 + (k % 3) * 4} rx="1.5" fill={k % 3 === 1 ? "#FF4D6D" : "#00F0A8"} />
        ))}
        <path d="M4 58 C50 50 90 40 196 18" stroke="#B9A6FF" strokeWidth="2" fill="none" />
      </svg>
      {[["Médias", "subindo"], ["RSI", "62 · com gás"], ["MACD", "ganhando ritmo"]].map(([k, v]) => (
        <div key={k} className="flex justify-between border-b border-white/5 pb-1.5 text-[11px]"><span className="text-white/45">{k}</span><span className="text-white">{v}</span></div>
      ))}
      <div className="rounded-xl bg-white/[0.05] p-2.5 text-[11px] leading-snug text-white/80">“Tendência de alta no M5, RSI sem exagero. Leitura anotada.”</div>
    </div>
  );
}

export default function HowItWorks() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % STEPS.length), 5000);
    return () => clearInterval(t);
  }, [i]);
  const s = STEPS[i];

  return (
    <section id="como-funciona" className="relative bg-paper py-24 text-paper-ink md:py-32">
      <div className="mx-auto grid max-w-[1400px] items-center gap-14 px-4 md:px-8 lg:grid-cols-[1fr_auto_1fr]">
        <div className="max-w-md">
          <p className="font-tight text-sm text-paper-dim">Como funciona na prática</p>
          <p className="font-tight text-sm font-medium">do cadastro à primeira leitura</p>
          <div className="mt-4 flex items-center gap-3 font-mono text-xs text-paper-dim">
            <span>0{i + 1}</span>
            <span className="relative h-px w-24 bg-paper-line">
              <motion.span key={i} className="absolute inset-y-0 left-0 bg-lilac" initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ duration: 5, ease: "linear" }} />
            </span>
            <span>0{STEPS.length}</span>
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={i} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.45 }}>
              <p className="mt-8 font-tight text-sm font-medium text-lilac-deep">{s.tag}</p>
              <h2 className="mega mt-2 text-4xl !leading-[1.02] md:text-[3.4rem]">{s.title}</h2>
              <p className="mt-4 text-paper-dim">{s.text}</p>
            </motion.div>
          </AnimatePresence>
          <div className="mt-8 flex gap-2">
            {STEPS.map((x, k) => (
              <button key={x.tag} onClick={() => setI(k)} className={`rounded-full px-4 py-2 font-tight text-xs font-medium transition-colors ${k === i ? "bg-paper-ink text-white" : "bg-white text-paper-dim hover:text-paper-ink"}`}>
                {x.tag}
              </button>
            ))}
          </div>
        </div>

        <div className="relative mx-auto">
          <div className="relative h-[460px] w-[230px] rounded-[42px] border-[7px] border-[#2A2833] bg-[#0B0A12] shadow-[0_50px_80px_-30px_rgba(11,10,18,0.55)]">
            <div className="absolute left-1/2 top-2.5 h-5 w-20 -translate-x-1/2 rounded-full bg-black" />
            <div className="h-full overflow-hidden rounded-[34px] pt-10">
              <AnimatePresence mode="wait">
                <motion.div key={i} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
                  <Tela i={i} />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
          <div className="mx-auto mt-6 h-4 w-40 rounded-full bg-black/15 blur-md" />
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.45 }}
            className="w-full max-w-xs justify-self-center rounded-3xl bg-paper-card p-6 shadow-[0_30px_60px_-30px_rgba(11,10,18,0.35)] lg:justify-self-start">
            <p className="font-tight text-xs text-paper-dim">{s.card.k}</p>
            <p className="mega mt-2 text-6xl text-lilac">{s.card.big}</p>
            <p className="mt-2 font-tight text-sm">{s.card.sub}</p>
            <div className="mt-5 flex items-center gap-2 border-t border-paper-line pt-4 text-xs text-paper-dim">
              <Check size={14} className="text-lilac-deep" /> sem promessa de lucro, só leitura
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
