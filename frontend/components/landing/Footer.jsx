import Logo from "@/components/Logo";

export default function Footer() {
  return (
    <footer className="border-t border-void-line py-12">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <Logo />
          <div className="flex flex-wrap gap-6 text-sm text-mist-dim">
            <a href="#recursos" className="hover:text-mist">Recursos</a>
            <a href="#planos" className="hover:text-mist">Planos</a>
            <a href="#faq" className="hover:text-mist">FAQ</a>
            <a href="/auth" className="hover:text-mist">Entrar</a>
          </div>
        </div>
        <p className="mt-10 max-w-4xl text-xs leading-relaxed text-mist-faint">
          Aviso de risco: operar no mercado financeiro envolve risco elevado e pode resultar na perda do capital investido.
          As análises da TradeOn AI são ferramentas de apoio e não constituem recomendação de investimento nem garantia de resultado.
        </p>
        <p className="mt-4 text-xs text-mist-faint">© {new Date().getFullYear()} TradeOn AI. Todos os direitos reservados.</p>
      </div>
    </footer>
  );
}
