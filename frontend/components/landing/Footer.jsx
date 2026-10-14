import { LogoMark } from "@/components/Logo";
import { CompanyLine } from "@/components/legal/LegalPage";
import { WHATSAPP_URL } from "@/lib/contact";

const NAVEGUE = [["#leitura", "O que a IA lê"], ["#como-funciona", "Como funciona"], ["#planos", "Planos"], ["#faq", "Perguntas"], ["/auth", "Entrar"]];
const LEGAL = [["/termos", "Termos"], ["/privacidade", "Privacidade"], ["/risco", "Aviso de risco"]];

export default function Footer() {
  return (
    <footer className="border-t border-white/10 pb-10 pt-16">
      <div className="mx-auto max-w-[1400px] px-4 md:px-8">
        <div className="grid gap-12 md:grid-cols-[1.5fr_auto_auto] md:gap-20">
          <div>
            <div className="flex items-end gap-4">
              <LogoMark size={88} tone="lilac" />
              <span className="mega text-6xl text-white md:text-8xl">Trade<span className="text-lilac">On</span></span>
            </div>
            <p className="soft-italic mt-5 text-lg text-white/55">O gráfico fala. A gente traduz.</p>
          </div>
          <div>
            <p className="font-tight text-xs text-white/35">Navegue</p>
            <ul className="mt-4 space-y-2.5">{NAVEGUE.map(([h, l]) => <li key={h}><a href={h} className="font-tight text-white/85 transition-colors hover:text-lilac">{l}</a></li>)}</ul>
          </div>
          <div>
            <p className="font-tight text-xs text-white/35">Fale com a gente</p>
            <ul className="mt-4 space-y-2.5">
              <li><a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="font-tight text-white/85 hover:text-lilac">WhatsApp</a></li>
              <li><a href="mailto:tradeonia@gmail.com" className="font-tight text-white/85 hover:text-lilac">tradeonia@gmail.com</a></li>
              {LEGAL.map(([h, l]) => <li key={h}><a href={h} className="font-tight text-white/50 hover:text-lilac">{l}</a></li>)}
            </ul>
          </div>
        </div>
        <p className="mt-16 max-w-4xl text-xs leading-relaxed text-white/35">
          Aviso de risco: operar no mercado financeiro envolve risco elevado e pode resultar na perda do capital investido.
          A TradeOn AI é uma ferramenta de análise e educação, não é corretora e não constitui recomendação de investimento nem garantia de resultado.
        </p>
        <p className="mt-4 text-xs text-white/35">© {new Date().getFullYear()} TradeOn AI. Todos os direitos reservados. <CompanyLine /></p>
      </div>
    </footer>
  );
}
