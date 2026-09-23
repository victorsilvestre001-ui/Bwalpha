import { ExternalLink } from "lucide-react";

const AFFILIATE = "https://exnova.com/lp/start-trading/?aff=830021&aff_model=revenue&afftrack=BwAlpha";

export default function BrokerCard() {
  return (
    <div className="panel p-5">
      <div className="font-mono text-[10px] uppercase tracking-widest text-mist-faint">Corretora parceira</div>
      <h3 className="mt-2 font-display text-lg font-semibold text-mist">Opere na Exnova</h3>
      <p className="mt-1 text-sm text-mist-dim">Abra sua conta e aplique as análises da TradeOn AI na corretora parceira.</p>
      <a href={AFFILIATE} target="_blank" rel="noopener noreferrer" className="btn-ghost mt-4 w-full !py-2.5">
        Abrir conta <ExternalLink size={14} />
      </a>
    </div>
  );
}
