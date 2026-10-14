"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";
import Logo from "@/components/Logo";

const LINKS = [
  { href: "#leitura", label: "O que a IA lê" },
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#planos", label: "Planos" },
  { href: "#faq", label: "Perguntas" }
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${scrolled ? "bg-ink/70 backdrop-blur-xl" : "bg-transparent"}`}>
      <nav className="mx-auto flex h-[72px] max-w-[1400px] items-center justify-between px-4 md:px-8">
        <Logo tone="lilac" />
        <div className="flex items-center gap-3">
          <Link href="/auth" className="hidden font-tight text-sm text-white/70 transition-colors hover:text-white sm:block">Entrar</Link>
          <Link href="/auth?mode=register" className="btn-pill">
            Testar grátis <span className="dot"><ArrowUpRight size={15} /></span>
          </Link>
          <button onClick={() => setOpen(true)} aria-label="Abrir menu" className="flex h-10 w-10 flex-col items-center justify-center gap-[5px] rounded-full border border-white/10 transition-colors hover:border-lilac">
            <span className="h-[1.5px] w-4 bg-white" /><span className="h-[1.5px] w-4 bg-white" />
          </button>
        </div>
      </nav>

      <div className={`fixed inset-0 z-50 bg-ink/95 backdrop-blur-xl transition-opacity duration-500 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}>
        <div className="mx-auto flex h-[72px] max-w-[1400px] items-center justify-between px-4 md:px-8">
          <Logo tone="lilac" />
          <button onClick={() => setOpen(false)} aria-label="Fechar menu" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-white hover:border-lilac">
            <X size={18} />
          </button>
        </div>
        <div className="mx-auto mt-10 max-w-[1400px] px-4 md:px-8">
          {LINKS.map((l, i) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="group flex items-baseline gap-5 border-b border-white/10 py-4 md:py-5">
              <span className="font-mono text-xs text-white/40">0{i + 1}</span>
              <span className="mega text-4xl text-white transition-colors group-hover:text-lilac md:text-6xl">{l.label}</span>
            </a>
          ))}
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/auth?mode=register" className="btn-pill">Testar grátis <span className="dot"><ArrowUpRight size={15} /></span></Link>
            <Link href="/auth" className="btn-line">Entrar</Link>
          </div>
        </div>
      </div>
    </header>
  );
}
