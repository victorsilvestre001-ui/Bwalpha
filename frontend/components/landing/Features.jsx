import { Brain, Timer, History, MessageSquareText, Gauge, ShieldCheck } from "lucide-react";
import Reveal from "@/components/Reveal";

const FEATURES = [
  { icon: Brain, title: "Motor de confluência", text: "EMA 9/21, RSI 14, MACD e padrões de candle votam juntos para chegar a uma direção objetiva.", accent: "text-neon" },
  { icon: Timer, title: "Horário de entrada", text: "Cada sinal vem com o horário de entrada no próximo candle e uma contagem sincronizada com o servidor.", accent: "text-volt" },
  { icon: Gauge, title: "Nível de confiança", text: "Cada sinal vem classificado como Alta, Média ou Baixa confiança, para você decidir com clareza.", accent: "text-pulse-soft" },
  { icon: MessageSquareText, title: "Assistente de IA", text: "Tire dúvidas de trading, envie prints do gráfico e receba análise em linguagem simples.", accent: "text-neon" },
  { icon: History, title: "Histórico de Win e Red", text: "Cada análise fica registrada e é conferida automaticamente no fechamento do candle, com sua taxa de acerto.", accent: "text-volt" },
  { icon: ShieldCheck, title: "Gráfico integrado", text: "Gráfico em tempo real direto no painel, sem trocar de aba enquanto você analisa.", accent: "text-pulse-soft" }
];

export default function Features() {
  return (
    <section id="recursos" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <Reveal className="max-w-2xl">
          <span className="eyebrow">Recursos</span>
          <h2 className="mt-5 font-display text-3xl font-bold tracking-tight text-mist md:text-5xl">
            Tudo o que você precisa <span className="grad-text">em um só painel.</span>
          </h2>
          <p className="mt-4 text-mist-dim md:text-lg">Menos abas abertas, mais decisões com critério.</p>
        </Reveal>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 0.06}>
              <div className="panel group h-full p-7 transition-all duration-300 hover:-translate-y-1 hover:border-neon/30">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-void-line bg-void-deep">
                  <f.icon size={20} className={f.accent} />
                </div>
                <h3 className="mt-6 font-display text-lg font-semibold text-mist">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-mist-dim">{f.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
