import Reveal from "@/components/Reveal";

const SIM = [
  ["Lê o gráfico", "com 4 indicadores em segundos"],
  ["Anota cada leitura", "e confere quando o candle fecha"],
  ["Mostra seu acerto real", "sem filtro, erros inclusos"],
  ["Tira suas dúvidas", "de gráfico, em português"]
];

// "Com a direção certa, a gente produz." do visual de referência, adaptado.
export default function Combinado() {
  return (
    <section id="combinado" className="relative py-24 md:py-36">
      <div className="mx-auto max-w-[1400px] px-4 md:px-8">
        <Reveal className="grid gap-8 md:grid-cols-[1.5fr_1fr] md:items-end">
          <h2 className="mega text-5xl text-white md:text-[6rem]">
            Com a leitura certa,<br /><span className="soft-italic">a decisão é sua.</span>
          </h2>
          <p className="max-w-sm text-white/55 md:justify-self-end">
            A TradeOn não opera por você e não recebe depósito. Ela lê, anota e te mostra o histórico, pra você decidir com mais critério.
          </p>
        </Reveal>
        <div className="mt-16 grid gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
          {SIM.map(([t, s], i) => (
            <Reveal key={t} delay={i * 0.08} className="h-full">
              <div className="h-full bg-ink p-7 transition-colors duration-300 hover:bg-ink-raised">
                <span className="font-mono text-xs text-lilac">0{i + 1}</span>
                <p className="mt-10 font-tight text-2xl font-semibold tracking-[-0.03em] text-white">{t}</p>
                <p className="soft-italic mt-1 text-white/50">{s}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
