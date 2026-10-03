"use client";
import { useEffect, useRef, useState } from "react";
import { useInView } from "framer-motion";
import Reveal from "@/components/Reveal";
import { api } from "@/lib/api";

// Números reais da plataforma (banco de dados), contando até o valor quando aparecem na tela.
function Count({ to }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!inView || to == null) return;
    let cur = 0;
    const step = Math.max(1, Math.round(to / 40));
    const t = setInterval(() => { cur = Math.min(to, cur + step); setV(cur); if (cur >= to) clearInterval(t); }, 25);
    return () => clearInterval(t);
  }, [inView, to]);
  return <span ref={ref}>{to == null ? "—" : v.toLocaleString("pt-BR")}</span>;
}

export default function Placar() {
  const [s, setS] = useState(null);
  useEffect(() => { api.publicStats().then(setS).catch(() => {}); }, []);

  const items = [
    { n: s?.community, l: "pessoas na comunidade", small: "TradeOn + outros projetos" },
    { n: s?.analyses, l: "leituras feitas pela IA" },
    { n: 3, l: "ativos: EURUSD, EURJPY e Ouro" },
    { n: s?.daysOnline, l: "dias no ar" }
  ];

  return (
    <section id="placar" className="relative py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <Reveal className="max-w-2xl">
          <span className="eyebrow">Placar aberto</span>
          <h2 className="mt-5 font-display text-3xl font-bold tracking-tight text-mist md:text-5xl">
            Aqui o erro <span className="grad-text">também aparece</span>
          </h2>
          <p className="mt-5 text-mist-dim">Cada leitura é conferida sozinha quando o candle fecha. Ninguém apaga o vermelho para a foto ficar bonita.</p>
        </Reveal>

        <div className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {items.map((it, i) => (
            <Reveal key={it.l} delay={i * 0.06}>
              <div className="panel relative h-full overflow-hidden p-6">
                <div className="pointer-events-none absolute -bottom-12 -right-10 h-32 w-32 rounded-full bg-neon/10 blur-2xl" />
                <div className="font-display text-3xl font-extrabold text-mist md:text-4xl"><Count to={it.n} /></div>
                <div className="mt-1 text-sm text-mist-dim">{it.l}</div>
                {it.small && <div className="text-xs text-mist-faint">{it.small}</div>}
              </div>
            </Reveal>
          ))}
        </div>
        <p className="mt-4 font-mono text-[11px] text-mist-faint">Números tirados direto do sistema, atualizados automaticamente.</p>
      </div>
    </section>
  );
}
