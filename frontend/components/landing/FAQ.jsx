"use client";
import { useState } from "react";
import { Plus, ArrowUpRight } from "lucide-react";
import Reveal from "@/components/Reveal";
import { WHATSAPP_URL as WHATS, WHATSAPP_NUMBER } from "@/lib/contact";

const QA = [
  { q: "Vou ganhar dinheiro com isso?", a: "Ninguém sério pode te prometer isso. A TradeOn te ajuda a ler o gráfico com mais critério e a medir o seu acerto real. Operar sempre envolve risco: use gestão e opere só o que pode perder." },
  { q: "É corretora? Preciso depositar aqui?", a: "Não. A TradeOn não recebe depósito nem opera por você. É uma ferramenta de leitura de gráfico e estudo." },
  { q: "Quanto custa para testar?", a: "Nada. A conta grátis libera o gráfico ao vivo, 1 leitura da IA por dia e 3 perguntas por dia ao assistente. Sem cartão." },
  { q: "O VIP cobra todo mês?", a: "Não. É pagamento único: pagou uma vez, é seu. E se não curtir, em até 7 dias você pede o dinheiro de volta pelo tradeonia@gmail.com." },
  { q: "Quando dá para usar?", a: "Quando o mercado está aberto: de domingo às 19h até sexta às 19h (horário de Brasília). Fora disso o painel avisa que o mercado está fechado." }
];

export default function FAQ() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="relative py-24 md:py-32">
      <div className="mx-auto grid max-w-[1400px] gap-12 px-4 md:px-8 lg:grid-cols-[1fr_1.6fr]">
        <Reveal>
          <p className="soft-italic text-2xl text-white/50">Sem enrolação.</p>
          <h2 className="mega mt-2 text-5xl text-white md:text-7xl">Perguntas que todo mundo faz.</h2>
          <a href={WHATS} target="_blank" rel="noopener noreferrer" className="btn-pill mt-10">
            Perguntar no WhatsApp <span className="dot"><ArrowUpRight size={15} /></span>
          </a>
          <p className="mt-3 font-mono text-xs text-white/35">{WHATSAPP_NUMBER}</p>
        </Reveal>
        <div className="border-t border-white/10">
          {QA.map((item, i) => {
            const isOpen = open === i;
            return (
              <Reveal key={item.q} delay={i * 0.04}>
                <button onClick={() => setOpen(isOpen ? -1 : i)} className="group w-full border-b border-white/10 py-6 text-left">
                  <div className="flex items-center justify-between gap-6">
                    <span className="flex items-baseline gap-5">
                      <span className="font-mono text-xs text-white/35">0{i + 1}</span>
                      <span className={`font-tight text-xl font-semibold tracking-[-0.03em] transition-colors md:text-2xl ${isOpen ? "text-lilac" : "text-white group-hover:text-lilac-soft"}`}>{item.q}</span>
                    </span>
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${isOpen ? "rotate-45 border-lilac bg-lilac text-white" : "border-white/15 text-white"}`}>
                      <Plus size={16} />
                    </span>
                  </div>
                  <div className={`grid transition-all duration-300 ${isOpen ? "mt-4 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                    <p className="overflow-hidden pl-10 text-sm leading-relaxed text-white/55 md:text-base">{item.a}</p>
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
