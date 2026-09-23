import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Reveal from "@/components/Reveal";

export default function CTA() {
  return (
    <section className="px-5 py-20 md:px-8">
      <Reveal>
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl border border-void-line bg-void-card px-8 py-16 text-center md:px-16 md:py-20">
          <div className="aurora pointer-events-none absolute inset-0" />
          <div className="bg-grid pointer-events-none absolute inset-0 opacity-70" />
          <div className="relative">
            <h2 className="mx-auto max-w-3xl font-display text-3xl font-bold tracking-tight text-mist md:text-5xl">
              Pronto para operar com <span className="grad-text">a IA do seu lado?</span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-mist-dim">Crie sua conta gratuita e faça sua primeira análise em menos de um minuto.</p>
            <Link href="/auth?mode=register" className="btn-primary mt-9 !px-8 !py-4">
              Começar agora <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
