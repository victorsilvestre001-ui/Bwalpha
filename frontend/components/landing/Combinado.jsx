import { Check, X } from "lucide-react";
import Reveal from "@/components/Reveal";

const SIM = [
  "Lê o gráfico com 4 indicadores em segundos",
  "Anota cada leitura e confere quando o candle fecha",
  "Mostra a sua taxa de acerto real, sem filtro",
  "Responde suas dúvidas de gráfico em português"
];
const NAO = [
  "Não promete lucro. Quem promete, está vendendo outra coisa",
  "Não opera por você e não toca no seu dinheiro",
  "Não é corretora e não empurra corretora",
  "Não substitui a sua gestão de risco"
];

export default function Combinado() {
  return (
    <section id="combinado" className="relative py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <Reveal className="max-w-2xl">
          <span className="eyebrow">Combinado não sai caro</span>
          <h2 className="mt-5 font-display text-3xl font-bold tracking-tight text-mist md:text-5xl">
            O que a gente faz, e o que <span className="grad-text">a gente não promete</span>
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <Reveal>
            <div className="panel h-full p-7">
              <h3 className="font-display text-xl font-semibold text-mist">A TradeOn faz</h3>
              <ul className="mt-5 space-y-3">
                {SIM.map((t) => <li key={t} className="flex gap-3 text-mist-dim"><Check size={18} className="mt-0.5 shrink-0 text-neon" />{t}</li>)}
              </ul>
            </div>
          </Reveal>
          <Reveal delay={0.08}>
            <div className="panel h-full p-7">
              <h3 className="font-display text-xl font-semibold text-mist">A TradeOn não faz</h3>
              <ul className="mt-5 space-y-3">
                {NAO.map((t) => <li key={t} className="flex gap-3 text-mist-dim"><X size={18} className="mt-0.5 shrink-0 text-ember" />{t}</li>)}
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
