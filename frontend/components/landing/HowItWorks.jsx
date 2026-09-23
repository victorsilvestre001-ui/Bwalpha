import { UserPlus, SlidersHorizontal, Rocket } from "lucide-react";
import Reveal from "@/components/Reveal";

const STEPS = [
  { n: "01", icon: UserPlus, title: "Crie sua conta", text: "Cadastro em menos de um minuto. O plano gratuito já libera o painel de análise." },
  { n: "02", icon: SlidersHorizontal, title: "Escolha ativo e tempo", text: "Selecione EURUSD, EURJPY ou Ouro (XAUUSD) e o timeframe M1 ou M5." },
  { n: "03", icon: Rocket, title: "Receba o sinal", text: "A IA processa os indicadores e entrega direção, confiança e o detalhamento técnico." }
];

export default function HowItWorks() {
  return (
    <section id="como-funciona" className="relative py-24 md:py-32">
      <div className="aurora pointer-events-none absolute inset-0 opacity-50" />
      <div className="relative mx-auto max-w-7xl px-5 md:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">Como funciona</span>
          <h2 className="mt-5 font-display text-3xl font-bold tracking-tight text-mist md:text-5xl">
            Três passos. <span className="grad-text">Zero complicação.</span>
          </h2>
        </Reveal>

        <div className="relative mt-16 grid gap-6 md:grid-cols-3">
          <div className="pointer-events-none absolute left-0 right-0 top-12 hidden h-px bg-gradient-to-r from-transparent via-neon/40 to-transparent md:block" />
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.1}>
              <div className="relative text-center">
                <div className="relative mx-auto flex h-24 w-24 items-center justify-center rounded-3xl border border-void-line bg-void-card shadow-neon">
                  <s.icon size={30} className="text-neon" />
                  <span className="absolute -right-2 -top-2 rounded-lg bg-gradient-to-r from-neon to-volt px-2 py-0.5 font-mono text-[11px] font-semibold text-void">{s.n}</span>
                </div>
                <h3 className="mt-7 font-display text-xl font-semibold text-mist">{s.title}</h3>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-mist-dim">{s.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
