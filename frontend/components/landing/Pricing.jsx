import Link from "next/link";
import { Check, Crown } from "lucide-react";
import Reveal from "@/components/Reveal";

const PLANS = [
  {
    name: "Free",
    tag: "Para começar",
    price: "R$ 0",
    note: "para sempre",
    cta: "Criar conta grátis",
    href: "/auth?mode=register",
    highlight: false,
    items: ["3 sinais da IA grátis para testar", "Painel com gráfico em tempo real", "Cotações de EURUSD, EURJPY e Ouro", "3 mensagens por dia com a IA"]
  },
  {
    name: "VIP",
    tag: "Mais completo",
    price: "Acesso total",
    note: "pagamento único · sem mensalidade",
    cta: "Quero ser VIP",
    href: "/auth?mode=register&plan=vip",
    highlight: true,
    items: ["Tudo do plano Free", "Sinais da IA ilimitados (EURUSD, EURJPY e Ouro, M1 e M5)", "Contagem do próximo candle + histórico de Win/Red", "Assistente de IA ilimitado", "Pague uma vez e tenha acesso a tudo"]
  }
];

export default function Pricing() {
  return (
    <section id="planos" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-5xl px-5 md:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">Planos</span>
          <h2 className="mt-5 font-display text-3xl font-bold tracking-tight text-mist md:text-5xl">
            Comece grátis. <span className="grad-text">Evolua quando quiser.</span>
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {PLANS.map((p, i) => (
            <Reveal key={p.name} delay={i * 0.1}>
              <div className={`panel relative h-full p-8 ${p.highlight ? "grad-border shadow-neon" : ""}`}>
                {p.highlight && (
                  <span className="absolute -top-3 right-6 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-neon to-volt px-3 py-1 font-mono text-[11px] font-semibold text-void">
                    <Crown size={12} /> RECOMENDADO
                  </span>
                )}
                <div className="font-mono text-xs uppercase tracking-widest text-mist-faint">{p.tag}</div>
                <h3 className="mt-2 font-display text-2xl font-bold text-mist">{p.name}</h3>
                <div className="mt-6 flex items-baseline gap-2">
                  <span className={`font-display text-4xl font-bold ${p.highlight ? "grad-text" : "text-mist"}`}>{p.price}</span>
                  <span className="text-sm text-mist-dim">{p.note}</span>
                </div>
                <ul className="mt-8 space-y-3">
                  {p.items.map((it) => (
                    <li key={it} className="flex items-start gap-3 text-sm text-mist-dim">
                      <Check size={16} className="mt-0.5 shrink-0 text-neon" /> {it}
                    </li>
                  ))}
                </ul>
                <Link href={p.href} className={`${p.highlight ? "btn-primary" : "btn-ghost"} mt-10 w-full`}>{p.cta}</Link>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
