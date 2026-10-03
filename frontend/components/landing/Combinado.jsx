import { Check } from "lucide-react";
import Reveal from "@/components/Reveal";

const SIM = [
  "Lê o gráfico com 4 indicadores em segundos",
  "Anota cada leitura e confere quando o candle fecha",
  "Mostra a sua taxa de acerto real, sem filtro",
  "Responde suas dúvidas de gráfico em português"
];

export default function Combinado() {
  return (
    <section id="combinado" className="relative py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <Reveal className="max-w-2xl">
          <span className="eyebrow">Na sua tela</span>
          <h2 className="mt-5 font-display text-3xl font-bold tracking-tight text-mist md:text-5xl">
            O que a TradeOn <span className="grad-text">faz por você</span>
          </h2>
        </Reveal>
        <div className="mt-12 max-w-2xl">
          <Reveal>
            <div className="panel h-full p-7">
              <ul className="space-y-3">
                {SIM.map((t) => <li key={t} className="flex gap-3 text-mist-dim"><Check size={18} className="mt-0.5 shrink-0 text-neon" />{t}</li>)}
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
