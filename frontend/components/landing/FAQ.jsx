"use client";
import { useState } from "react";
import { Plus, MessageCircle } from "lucide-react";
import Reveal from "@/components/Reveal";

const WHATS = "https://wa.me/5511957235874?text=" + encodeURIComponent("Olá! Tenho uma dúvida sobre a TradeOn AI.");

const QA = [
  { q: "Vou ganhar dinheiro com isso?", a: "Ninguém sério pode te prometer isso. A TradeOn te ajuda a ler o gráfico com mais critério e a medir o seu acerto real. Operar sempre envolve risco: use gestão e opere só o que pode perder." },
  { q: "É corretora? Preciso depositar aqui?", a: "Não. A TradeOn não recebe depósito nem opera por você. É uma ferramenta de leitura de gráfico e estudo." },
  { q: "Quanto custa para testar?", a: "Nada. A conta grátis libera o gráfico ao vivo, 1 leitura da IA por dia e 3 perguntas por dia ao assistente. Sem cartão." },
  { q: "O VIP cobra todo mês?", a: "Não. É pagamento único: pagou uma vez, é seu. E se não curtir, em até 7 dias você pede o dinheiro de volta pelo tradeonia@gmail.com." },
  { q: "Quando dá para usar?", a: "Quando o mercado está aberto: de domingo às 19h até sexta às 19h (horário de Brasília). Fora disso o painel avisa que o mercado está fechado." },
  { q: "Se eu tiver dúvida, falo com quem?", a: "Com gente de verdade, pelo WhatsApp (11) 95723-5874 ou pelo tradeonia@gmail.com." }
];

export default function FAQ() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-3xl px-5 md:px-8">
        <Reveal className="text-center">
          <span className="eyebrow">Sem enrolação</span>
          <h2 className="mt-5 font-display text-3xl font-bold tracking-tight text-mist md:text-5xl">Perguntas que todo mundo faz</h2>
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
        <Reveal className="mt-10 text-center">
          <p className="text-mist-dim">Ficou alguma dúvida?</p>
          <a href={WHATS} target="_blank" rel="noopener noreferrer" className="btn-primary mt-4 !px-7 !py-3.5">
            <MessageCircle size={18} /> Falar no WhatsApp
          </a>
          <p className="mt-2 font-mono text-xs text-mist-faint">(11) 95723-5874</p>
        </Reveal>
      </div>
    </section>
  );
}
