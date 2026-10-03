import Reveal from "@/components/Reveal";

const STEPS = [
  { n: "01", title: "Abre a conta", text: "Nome, e-mail e senha. Leva menos tempo que esquentar o café." },
  { n: "02", title: "Escolhe o ativo", text: "EURUSD, EURJPY ou Ouro. M1 para o rápido, M5 para o com calma." },
  { n: "03", title: "Lê e decide", text: "A IA te entrega a leitura em português. O clique final é sempre seu." }
];

export default function HowItWorks() {
  return (
    <section id="como-funciona" className="relative py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <Reveal className="max-w-2xl">
          <span className="eyebrow">Na prática</span>
          <h2 className="mt-5 font-display text-3xl font-bold tracking-tight text-mist md:text-5xl">
            Do café ao gráfico lido <span className="grad-text">em três toques</span>
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.1}>
              <div className="h-full rounded-2xl border border-void-line bg-gradient-to-b from-void-card/90 to-void-raised/60 p-7">
                <div className="font-mono text-sm text-neon">{s.n}</div>
                <h3 className="mt-2 font-display text-xl font-semibold text-mist">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-mist-dim">{s.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
