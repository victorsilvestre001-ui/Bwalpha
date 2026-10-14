import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import Reveal from "@/components/Reveal";
import Stars from "@/components/landing/Stars";

export default function CTA() {
  return (
    <section className="relative overflow-hidden py-28 text-center md:py-40">
      <Stars density={0.0001} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_60%_at_50%_60%,rgba(139,108,246,0.18),transparent_70%)]" />
      <Reveal className="relative mx-auto max-w-6xl px-4">
        <p className="soft-italic text-3xl text-white md:text-6xl">O mercado abre de novo amanhã.</p>
        <h2 className="mega mt-2 text-[3.2rem] text-lilac sm:text-7xl md:text-[8rem]">Chegue sabendo ler.</h2>
        <p className="mx-auto mt-6 max-w-sm text-sm leading-relaxed text-white/60 md:text-base">
          Conta grátis, sem cartão. A primeira leitura sai em menos de um minuto.
        </p>
        <Link href="/auth?mode=register" className="btn-pill mt-10 !py-2 !pl-6 !text-base">
          Ler meu primeiro gráfico <span className="dot !h-9 !w-9"><ArrowUpRight size={16} /></span>
        </Link>
      </Reveal>
    </section>
  );
}
