import Reveal from "@/components/Reveal";

// O que a IA lê no gráfico, em linguagem de gente.
const READS = [
  { tag: "EMA", title: "Pra onde vai", text: "As médias de 9 e 21 períodos mostram se o preço está subindo, caindo ou andando de lado.", tone: "bg-neon/10 text-neon" },
  { tag: "RSI", title: "Com que força", text: "Se o movimento ainda tem gás ou se já esticou demais e pode cansar.", tone: "bg-volt/15 text-volt" },
  { tag: "MACD", title: "Se o ritmo muda", text: "Avisa quando o movimento começa a perder ou ganhar velocidade.", tone: "bg-pulse/15 text-pulse-soft" },
  { tag: "⏱", title: "Em que hora", text: "O Ouro de Londres não é o Ouro de Nova York. A sessão do dia entra na conta.", tone: "bg-ember/15 text-ember-soft" }
];

export default function Features() {
  return (
    <section id="leitura" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <Reveal className="max-w-2xl">
          <span className="eyebrow">O que a IA enxerga</span>
          <h2 className="mt-5 font-display text-3xl font-bold tracking-tight text-mist md:text-5xl">
            Quatro coisas que o olho cansado <span className="grad-text">não vê às 9 da manhã</span>
          </h2>
          <p className="mt-5 text-mist-dim">Você olha um candle. A TradeOn olha cem candles, quatro indicadores e o horário do mercado ao mesmo tempo.</p>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {READS.map((r, i) => (
            <Reveal key={r.title} delay={i * 0.08}>
              <div className="panel h-full p-6 transition-all duration-300 hover:-translate-y-1 hover:border-neon/40">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl font-mono text-xs font-semibold ${r.tone}`}>{r.tag}</div>
                <h3 className="mt-4 font-display text-lg font-semibold text-mist">{r.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-mist-dim">{r.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
