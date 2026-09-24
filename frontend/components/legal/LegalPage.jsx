import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Logo from "@/components/Logo";
import { COMPANY } from "@/lib/company";

export function CompanyLine() {
  const parts = [COMPANY.name, COMPANY.document].filter(Boolean);
  return (
    <>
      {parts.length > 0 && <>{parts.join(" · ")}. </>}
      {COMPANY.email && <>Contato: <a href={`mailto:${COMPANY.email}`} className="text-neon hover:underline">{COMPANY.email}</a>.</>}
    </>
  );
}

export default function LegalPage({ title, children }) {
  return (
    <main className="min-h-screen bg-void font-body text-mist">
      <header className="border-b border-void-line">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <Logo />
          <Link href="/" className="flex items-center gap-1.5 text-sm text-mist-dim hover:text-mist"><ArrowLeft size={15} /> Voltar</Link>
        </div>
      </header>
      <article className="legal mx-auto max-w-3xl px-5 py-12">
        <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-mist-faint">Última atualização: {COMPANY.updatedAt}</p>
        <div className="mt-8 space-y-4 text-[15px] leading-relaxed text-mist-dim">{children}</div>
        <nav className="mt-12 flex flex-wrap gap-4 border-t border-void-line pt-6 text-sm">
          <Link href="/termos" className="text-mist-dim hover:text-mist">Termos de uso</Link>
          <Link href="/privacidade" className="text-mist-dim hover:text-mist">Política de privacidade</Link>
          <Link href="/risco" className="text-mist-dim hover:text-mist">Aviso de risco</Link>
        </nav>
      </article>
    </main>
  );
}
