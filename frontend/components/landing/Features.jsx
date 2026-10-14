import Reveal from "@/components/Reveal";

// O que a IA lê no gráfico, em linguagem de gente, como lista numerada de nomes gigantes (visual b+).
const READS = [
  { tag: "Médias EMA 9 e 21", title: "Pra onde vai", text: "As médias de 9 e 21 períodos mostram se o preço está subindo, caindo ou andando de lado." },
  { tag: "RSI", title: "Com que força", text: "Se o movimento ainda tem gás ou se já esticou demais e pode cansar." },
  { tag: "MACD", title: "Se o ritmo muda", text: "Avisa quando o movimento começa a perder ou ganhar velocidade." },
  { tag: "Sessão do dia", title: "Em que hora", text: "O Ouro de Londres não é o Ouro de Nova York. A sessão do dia entra na conta." }
];

export default function Features() {
  return (
    <section id="leitura" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-[1400px] px-4 md:px-8">
        <Reveal className="grid gap-6 md:grid-cols-[1.4fr_1fr] md:items-end">
          <h2 className="mega text-5xl text-white md:text-[5.5rem]">
            O que a IA enxerga,<br /><span className="soft-italic text-white/70">e o olho cansado não.</span>
          </h2>
          <p className="max-w-md text-white/55 md:justify-self-end">
            Você olha um candle. A TradeOn olha cem candles, quatro indicadores e o horário do mercado ao mesmo tempo.
          </p>
        </Reveal>

        <div className="mt-16 border-t border-white/10">
          {READS.map((r, i) => (
            <Reveal key={r.title} delay={i * 0.06}>
              <div className="group grid gap-2 border-b border-white/10 py-6 md:grid-cols-[60px_1fr_auto] md:items-center md:gap-8 md:py-8">
                <span className="font-mono text-xs text-white/35">0{i + 1}</span>
                <div>
                  <h3 className="mega text-4xl text-white transition-colors duration-300 group-hover:text-lilac md:text-7xl">{r.title}</h3>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/50 md:text-base">{r.text}</p>
                </div>
                <span className="font-tight text-sm text-white/40 md:text-right">{r.tag}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
