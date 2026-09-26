import Link from "next/link";
import { ArrowRight, Brain, LineChart, History, Calculator, Bot, ShieldCheck, Check } from "lucide-react";
import Logo from "@/components/Logo";
import Reveal from "@/components/Reveal";
import { CompanyLine } from "@/components/legal/LegalPage";

// Página de destino dos anúncios pagos (Meta e Google). Linguagem de ferramenta de
// análise e educação: sem corretora, sem link de afiliado e sem promessa de ganho.
export const metadata = {
  title: "TradeOn AI | Análise de mercado com IA",
  description: "Leitura técnica com inteligência artificial para EURUSD, EURJPY e Ouro. Indicadores, histórico transparente e simulador de banca. Crie sua conta grátis.",
  robots: { index: false, follow: true }
};

const SIGNUP = "/auth?mode=register";

const FEATURES = [
  { icon: Brain, title: "Leitura técnica com IA", text: "Médias móveis, RSI, MACD e padrões de candle combinados em uma leitura objetiva, com nível de confiança." },
  { icon: LineChart, title: "Gráfico em tempo real", text: "EURUSD, EURJPY e Ouro (XAUUSD) em 1 e 5 minutos, direto no painel." },
  { icon: History, title: "Histórico transparente", text: "Cada leitura fica registrada e é conferida no fechamento do candle. Você vê acertos e erros." },
  { icon: Calculator, title: "Simulador de banca", text: "Teste capital, valor por operação, meta e limite de perda numa banca fictícia, sem dinheiro real." },
  { icon: Bot, title: "Assistente de IA", text: "Tire dúvidas sobre indicadores e gestão de risco e envie prints do gráfico para análise." },
  { icon: ShieldCheck, title: "Gestão de risco em primeiro lugar", text: "Ferramentas para você acompanhar sua taxa de acerto real antes de arriscar." }
];

const FAQ = [
  ["A TradeOn AI é uma corretora?", "Não. A TradeOn AI é uma ferramenta de análise e educação. Ela não executa operações e não guarda dinheiro."],
  ["Garante lucro?", "Não. Nenhuma ferramenta garante resultado. As leituras são apoio à decisão, e operar envolve risco de perda."],
  ["Preciso pagar para testar?", "Não. Você cria a conta grátis, conhece o painel e testa 3 sinais da IA. O VIP é pagamento único, sem mensalidade."]
];

export default function Comecar() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-void font-body text-mist">
      <header className="relative z-10 border-b border-void-line/70">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 md:px-8">
          <Logo href="/comecar" />
          <div className="flex items-center gap-3">
            <Link href="/auth" className="text-sm text-mist-dim hover:text-mist">Entrar</Link>
            <Link href={SIGNUP} className="btn-primary !px-4 !py-2">Criar conta</Link>
          </div>
        </div>
      </header>

      <section className="relative pb-16 pt-14 md:pb-24 md:pt-20">
        <div className="aurora pointer-events-none absolute inset-0" />
        <div className="bg-grid pointer-events-none absolute inset-0" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 md:px-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <span className="eyebrow">Análise de mercado com IA</span>
            <h1 className="mt-6 font-display text-[2.4rem] font-bold leading-[1.06] tracking-tight sm:text-5xl lg:text-6xl">
              Entenda o mercado em <span className="grad-text">segundos</span>, não em horas.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-mist-dim md:text-lg">
              A TradeOn AI junta os principais indicadores técnicos e uma leitura de inteligência artificial para EURUSD, EURJPY e Ouro, com histórico transparente de cada leitura.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href={SIGNUP} className="btn-primary !px-7 !py-3.5">Criar conta grátis <ArrowRight size={16} /></Link>
              <a href="#como-funciona" className="btn-ghost !px-7 !py-3.5">Como funciona</a>
            </div>
            <p className="mt-4 text-xs text-mist-faint">Sem cartão para criar a conta. Operar no mercado envolve risco.</p>
          </div>

          <div className="panel panel-glow grad-border p-6">
            <div className="flex items-center justify-between font-mono text-xs text-mist-dim">
              <span>LEITURA TÉCNICA</span><span className="rounded-md bg-void-deep px-2 py-1">XAUUSD · M5</span>
            </div>
            <div className="mt-5 space-y-3">
              {[["EMA 9 × EMA 21", "Acima", 78], ["RSI 14", "58,4", 58], ["MACD", "Positivo", 64], ["Padrão de candle", "Engolfo de alta", 70]].map(([k, v, w]) => (
                <div key={k}>
                  <div className="flex justify-between text-sm"><span className="text-mist-dim">{k}</span><span className="font-mono text-mist">{v}</span></div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-void-line"><div className="h-full rounded-full bg-gradient-to-r from-neon to-volt" style={{ width: `${w}%` }} /></div>
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-center justify-between rounded-xl border border-void-line bg-void-deep/60 p-3">
              <span className="text-sm text-mist-dim">Confiança da leitura</span>
              <span className="rounded-full border border-neon/40 bg-neon/10 px-3 py-1 font-mono text-xs text-neon">Alta</span>
            </div>
            <p className="mt-3 font-mono text-[10px] text-mist-faint">* Exemplo ilustrativo da interface.</p>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-5 md:px-8">
          <Reveal className="max-w-2xl">
            <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">Tudo em um só <span className="grad-text">painel</span></h2>
          </Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 0.05}>
                <div className="panel h-full p-6">
                  <f.icon size={20} className="text-neon" />
                  <h3 className="mt-4 font-display text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-mist-dim">{f.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="como-funciona" className="py-16 md:py-24">
        <div className="mx-auto max-w-4xl px-5 md:px-8">
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">Como funciona</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {[["Crie sua conta", "Leva menos de um minuto."], ["Escolha o ativo e o tempo", "EURUSD, EURJPY ou Ouro, em 1 ou 5 minutos."], ["Veja a leitura", "Indicadores, leitura da IA e nível de confiança, registrados no seu histórico."]].map(([t, d], i) => (
              <li key={t} className="panel p-6">
                <span className="font-mono text-sm text-neon">Passo {i + 1}</span>
                <h3 className="mt-2 font-display text-lg font-semibold">{t}</h3>
                <p className="mt-1 text-sm text-mist-dim">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="mx-auto grid max-w-4xl gap-4 px-5 md:grid-cols-2 md:px-8">
          <div className="panel p-7">
            <div className="font-mono text-xs uppercase tracking-widest text-mist-faint">Free</div>
            <div className="mt-2 font-display text-3xl font-bold">R$ 0</div>
            <ul className="mt-5 space-y-2 text-sm text-mist-dim">
              {["3 sinais da IA grátis para testar", "Painel com gráfico em tempo real", "Cotações de EURUSD, EURJPY e Ouro", "3 mensagens por dia com a IA"].map((t) => <li key={t} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-neon" />{t}</li>)}
            </ul>
          </div>
          <div className="panel grad-border p-7">
            <div className="font-mono text-xs uppercase tracking-widest text-neon">VIP</div>
            <div className="mt-2 font-display text-3xl font-bold grad-text">R$ 197</div>
            <div className="mt-1 text-xs text-mist-faint">pagamento único · sem mensalidade</div>
            <ul className="mt-5 space-y-2 text-sm text-mist-dim">
              {["Leituras da IA em 1 e 5 minutos", "Histórico e taxa de acerto", "Simulador de banca", "Assistente de IA ilimitado", "Pague uma vez, acesso a tudo"].map((t) => <li key={t} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-neon" />{t}</li>)}
            </ul>
          </div>
        </div>
        <div className="mt-10 text-center">
          <Link href={SIGNUP} className="btn-primary !px-8 !py-4">Criar conta grátis <ArrowRight size={16} /></Link>
        </div>
      </section>

      <section className="pb-16">
        <div className="mx-auto max-w-3xl space-y-3 px-5 md:px-8">
          {FAQ.map(([q, a]) => (
            <div key={q} className="panel p-5">
              <h3 className="font-display font-semibold">{q}</h3>
              <p className="mt-1.5 text-sm text-mist-dim">{a}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-void-line py-10">
        <div className="mx-auto max-w-6xl px-5 text-xs leading-relaxed text-mist-faint md:px-8">
          <p><strong className="text-mist-dim">Aviso de risco:</strong> operar no mercado financeiro envolve risco elevado e pode resultar na perda do capital investido. A TradeOn AI é uma ferramenta de análise e educação, não é corretora e não faz recomendação de investimento. Resultados passados não garantem resultados futuros.</p>
          <nav className="mt-4 flex flex-wrap gap-4 text-sm">
            <Link href="/termos" className="text-mist-dim hover:text-mist">Termos de uso</Link>
            <Link href="/privacidade" className="text-mist-dim hover:text-mist">Privacidade</Link>
            <Link href="/risco" className="text-mist-dim hover:text-mist">Aviso de risco</Link>
          </nav>
          <p className="mt-4">© {new Date().getFullYear()} TradeOn AI. <CompanyLine /></p>
        </div>
      </footer>
    </main>
  );
}
