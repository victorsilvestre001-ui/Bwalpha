import { assetDigits } from "@/lib/assets";

function Tag({ value, empty }) {
  if (!value) return <span className="rounded-full border border-void-line px-2.5 py-0.5 font-mono text-[11px] text-mist-faint">{empty}</span>;
  const call = value === "CALL";
  return (
    <span className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-semibold ${call ? "border-neon/40 bg-neon/10 text-neon" : "border-ember/40 bg-ember/10 text-ember-soft"}`}>
      {call ? "▲ CALL" : "▼ PUT"}
    </span>
  );
}

export default function BwalphaPanel({ data, pair, price }) {
  const d = assetDigits(pair);
  const f = (v) => (v == null ? "—" : Number(v).toFixed(d));
  const sto = Math.max(0, Math.min(100, data.estocastico ?? 50));
  const range = data.resistencia - data.suporte;
  const pos = range > 0 ? Math.max(0, Math.min(100, ((price - data.suporte) / range) * 100)) : 50;

  return (
    <div className="rounded-2xl border border-void-line bg-void-deep/60 p-5">
      <div className="font-mono text-[10px] uppercase tracking-widest text-mist-faint">Indicador bwalpha</div>

      <div className="mt-4 space-y-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-mist-dim">Cruzamento de médias</span>
          <Tag value={data.cruzamento} empty="sem cruzamento" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-mist-dim">Alerta estocástico + bandas</span>
          <Tag value={data.alerta} empty="sem alerta" />
        </div>
      </div>

      <div className="mt-5">
        <div className="flex justify-between font-mono text-[10px] uppercase tracking-wider text-mist-faint">
          <span>Estocástico (5)</span>
          <span className="text-mist">{sto.toFixed(0)}</span>
        </div>
        <div className="relative mt-2 h-2 rounded-full bg-void-line">
          <div className="absolute inset-y-0 left-0 rounded-l-full bg-neon/25" style={{ width: `${data.limiteInferior}%` }} />
          <div className="absolute inset-y-0 right-0 rounded-r-full bg-ember/25" style={{ width: `${100 - data.limiteSuperior}%` }} />
          <div className="absolute top-1/2 h-3.5 w-1 -translate-y-1/2 rounded-full bg-mist" style={{ left: `calc(${sto}% - 2px)` }} />
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10px] text-mist-faint">
          <span>{data.limiteInferior}</span>
          <span>{data.limiteSuperior}</span>
        </div>
      </div>

      <div className="mt-5">
        <div className="flex justify-between font-mono text-[10px] uppercase tracking-wider text-mist-faint">
          <span>Suporte</span>
          <span>Resistência</span>
        </div>
        <div className="relative mt-2 h-2 rounded-full bg-gradient-to-r from-neon/40 via-void-line to-ember/40">
          <div className="absolute top-1/2 h-3.5 w-1 -translate-y-1/2 rounded-full bg-mist" style={{ left: `calc(${pos}% - 2px)` }} title="Preço atual" />
        </div>
        <div className="mt-1 flex justify-between font-mono text-xs">
          <span className="text-neon">{f(data.suporte)}</span>
          <span className="text-ember-soft">{f(data.resistencia)}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 font-mono text-xs">
        <div className="rounded-lg border border-void-line px-3 py-2"><div className="text-[10px] uppercase text-mist-faint">Banda sup.</div><div className="text-mist">{f(data.bandaSuperior)}</div></div>
        <div className="rounded-lg border border-void-line px-3 py-2"><div className="text-[10px] uppercase text-mist-faint">Banda inf.</div><div className="text-mist">{f(data.bandaInferior)}</div></div>
      </div>
    </div>
  );
}
