"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import Reveal from "@/components/Reveal";

const QA = [
  { q: "O que é a TradeOn AI?", a: "É uma plataforma de análise que combina indicadores técnicos e inteligência artificial para sugerir a direção de EURUSD, EURJPY e Ouro (XAUUSD) nos timeframes M1 e M5." },
  { q: "Preciso pagar para usar?", a: "Não. O plano Free libera o painel de análise, o gráfico e o calendário econômico. O VIP libera o assistente de IA ilimitado e recursos extras." },
  { q: "Os sinais garantem lucro?", a: "Não. Nenhuma ferramenta garante resultado. Os sinais são apoio à decisão — sempre use gestão de risco e opere apenas o que pode perder." },
  { q: "Quando o mercado está aberto?", a: "O Forex abre domingo às 22h (UTC) e fecha sexta às 22h (UTC). Fora desse horário o painel avisa que o mercado está fechado." },
  { q: "Como cancelo o VIP?", a: "Direto no painel, em Perfil → Gerenciar assinatura. O cancelamento é feito pelo portal seguro de pagamentos." }
];

export default function FAQ() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-3xl px-5 md:px-8">
        <Reveal className="text-center">
          <span className="eyebrow">FAQ</span>
          <h2 className="mt-5 font-display text-3xl font-bold tracking-tight text-mist md:text-5xl">Perguntas frequentes</h2>
        </Reveal>
        <div className="mt-12 space-y-3">
          {QA.map((item, i) => {
            const isOpen = open === i;
            return (
              <Reveal key={item.q} delay={i * 0.04}>
                <button onClick={() => setOpen(isOpen ? -1 : i)} className={`panel w-full p-5 text-left transition-colors ${isOpen ? "border-neon/30" : ""}`}>
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-display font-semibold text-mist">{item.q}</span>
                    <Plus size={18} className={`shrink-0 text-neon transition-transform duration-300 ${isOpen ? "rotate-45" : ""}`} />
                  </div>
                  <div className={`grid transition-all duration-300 ${isOpen ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                    <p className="overflow-hidden text-sm leading-relaxed text-mist-dim">{item.a}</p>
                  </div>
                </button>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
