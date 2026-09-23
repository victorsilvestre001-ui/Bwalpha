"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import Logo from "@/components/Logo";

const LINKS = [
  { href: "#recursos", label: "Recursos" },
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#planos", label: "Planos" },
  { href: "#faq", label: "FAQ" }
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

  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${scrolled ? "border-b border-void-line/80 bg-void/80 backdrop-blur-xl" : "bg-transparent"}`}>
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:px-8">
        <Logo />
        <div className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="text-sm text-mist-dim transition-colors hover:text-mist">{l.label}</a>
          ))}
        </div>
        <div className="hidden items-center gap-3 md:flex">
          <Link href="/auth" className="text-sm font-medium text-mist-dim transition-colors hover:text-mist">Entrar</Link>
          <Link href="/auth?mode=register" className="btn-primary !px-5 !py-2.5">Começar grátis</Link>
        </div>
        <button className="rounded-lg p-2 text-mist md:hidden" onClick={() => setOpen((v) => !v)} aria-label="Menu">
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>
      {open && (
        <div className="border-t border-void-line bg-void/95 px-5 pb-6 pt-2 backdrop-blur-xl md:hidden">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block py-3 text-mist-dim">{l.label}</a>
          ))}
          <div className="mt-3 flex flex-col gap-3">
            <Link href="/auth" className="btn-ghost">Entrar</Link>
            <Link href="/auth?mode=register" className="btn-primary">Começar grátis</Link>
          </div>
        </div>
      )}
    </header>
  );
}
