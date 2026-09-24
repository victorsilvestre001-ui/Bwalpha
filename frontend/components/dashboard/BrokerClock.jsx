"use client";
import { useEffect, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { now, brokerOffset, setBrokerOffset, MAX_BROKER_OFFSET_MS } from "@/lib/clock";

function hhmmss(ms) {
  return new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// Relógio que o usuário compara com o da corretora e ajusta de 1 em 1 segundo.
export default function BrokerClock() {
  const [t, setT] = useState(() => now());
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    setOffset(brokerOffset());
    const id = setInterval(() => setT(now()), 250);
    return () => clearInterval(id);
  }, []);

  function change(deltaMs) {
    setOffset(setBrokerOffset(brokerOffset() + deltaMs));
    setT(now());
  }

  const secs = Math.round(offset / 1000);
  const max = MAX_BROKER_OFFSET_MS / 1000;

  return (
    <div className="mt-4 rounded-xl border border-void-line bg-void-deep/60 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-mist-faint">Relógio da corretora</div>
          <div className="font-mono text-lg font-semibold tabular-nums text-mist">{hhmmss(t)}</div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => change(-1000)} disabled={secs <= -max} aria-label="Atrasar 1 segundo" className="grid h-8 w-8 place-items-center rounded-lg border border-void-line text-mist-dim transition-colors hover:border-neon/50 hover:text-neon disabled:opacity-40">
            <Minus size={14} />
          </button>
          <span className="w-12 text-center font-mono text-xs tabular-nums text-mist-dim">{secs > 0 ? `+${secs}` : secs}s</span>
          <button onClick={() => change(1000)} disabled={secs >= max} aria-label="Adiantar 1 segundo" className="grid h-8 w-8 place-items-center rounded-lg border border-void-line text-mist-dim transition-colors hover:border-neon/50 hover:text-neon disabled:opacity-40">
            <Plus size={14} />
          </button>
          {secs !== 0 && (
            <button onClick={() => change(-offset)} aria-label="Zerar ajuste" className="grid h-8 w-8 place-items-center rounded-lg text-mist-faint transition-colors hover:text-mist">
              <RotateCcw size={13} />
            </button>
          )}
        </div>
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-mist-faint">
        Compare com o relógio da sua corretora e ajuste até os segundos ficarem iguais. As contagens de entrada passam a seguir a corretora.
      </p>
    </div>
  );
}
