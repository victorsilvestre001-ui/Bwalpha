import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import Reveal from "@/components/Reveal";

const PLANS = [
  {
    name: "Grátis",
    tag: "Pra começar",
    price: "R$ 0",
    note: "pra sempre",
    cta: "Começar grátis",
    href: "/auth?mode=register",
    highlight: false,
    items: ["1 leitura da IA por dia", "Gráfico ao vivo no painel", "Cotações de EURUSD, EURJPY e Ouro", "3 perguntas por dia ao assistente"]
  },
  {
    name: "VIP",
    tag: "Pagou uma vez, é seu",
    price: "Acesso total",
    note: "pagamento único · sem mensalidade",
    cta: "Quero ser VIP",
    href: "/auth?mode=register&plan=vip",
    highlight: true,
    items: ["Tudo do plano Grátis", "Leituras ilimitadas no M1 e M5 (EURUSD, EURJPY e Ouro)", "Histórico completo + simulador de gestão de risco", "Assistente de IA sem limite", "Sem mensalidade, sem pegadinha"]
  }
];

export default function Pricing() {
  return (
    <section id="planos" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <Reveal className="text-center">
          <p className="soft-italic text-2xl text-white/50 md:text-3xl">Comece no</p>
          <h2 className="mega mt-2 text-6xl text-white md:text-8xl">zero a zero<span className="text-lilac">.</span></h2>
          <p className="mx-auto mt-6 max-w-md text-white/55">Teste de graça todo dia. Se gostar, o VIP é seu de uma vez.</p>
        </Reveal>

        <div className="mt-16 grid gap-5 md:grid-cols-2">
          {PLANS.map((p, i) => (
            <Reveal key={p.name} delay={i * 0.1} className="h-full">
              <div className={`relative flex h-full flex-col rounded-[28px] p-8 md:p-10 ${p.highlight ? "bg-lilac text-white shadow-[0_40px_100px_-30px_rgba(139,108,246,0.7)]" : "border border-white/10 bg-ink-raised text-white"}`}>
                <div className={`font-tight text-sm ${p.highlight ? "text-white/75" : "text-white/45"}`}>{p.tag}</div>
                <h3 className="mega mt-2 text-5xl">{p.name}</h3>
                <div className="mt-8 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-tight text-3xl font-semibold tracking-[-0.03em]">{p.price}</span>
                  <span className={`soft-italic text-sm ${p.highlight ? "text-white/80" : "text-white/50"}`}>{p.note}</span>
                </div>
                <ul className="mt-8 flex-1 space-y-3">
                  {p.items.map((it) => (
                    <li key={it} className={`flex items-start gap-3 text-sm ${p.highlight ? "text-white/90" : "text-white/60"}`}>
                      <Check size={16} className={`mt-0.5 shrink-0 ${p.highlight ? "text-white" : "text-lilac"}`} /> {it}
                    </li>
                  ))}
                </ul>
                <Link href={p.href} className={`mt-10 inline-flex items-center justify-between gap-3 self-start rounded-full py-1.5 pl-5 pr-1.5 font-tight text-sm font-semibold transition-transform hover:-translate-y-0.5 ${p.highlight ? "bg-white text-ink" : "bg-lilac text-white"}`}>
                  {p.cta}
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full ${p.highlight ? "bg-ink text-white" : "bg-white text-ink"}`}><ArrowUpRight size={15} /></span>
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-white/50">Não curtiu? Em até 7 dias você pede e a gente devolve. Simples assim.</p>
      </div>
    </section>
  );
}
