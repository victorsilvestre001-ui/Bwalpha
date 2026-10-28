import { useEffect, useState } from "react";
import { useReducedMotion } from "../hooks/useMotion";

const LINES = [
  "INDEXALPHA ENGINE v0.1 :: cold boot",
  "[ OK ] montando /engine/weights ............ 20 pilares",
  "[ OK ] IndexEngine ......................... Σ w·z → tanh",
  "[ OK ] filtro de volatilidade .............. limiar 25%",
  "[ OK ] risco ............................... stop 1,5×ATR · alvo 3×ATR",
  "[ OK ] MarketSimulator ..................... feed a cada 5 s",
  "[ OK ] ContextualAI ........................ pronto",
  "> handshake concluído. acesso concedido",
];
const LINE_MS = 190;
const STORAGE_KEY = "indexalpha:booted";

function alreadyBooted(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Sequência de boot no primeiro acesso da sessão. Clique ou tecla pula. */
export function BootSequence() {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(() => !reduced && !alreadyBooted());
  const [count, setCount] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const finish = () => {
      setLeaving(true);
      try {
        sessionStorage.setItem(STORAGE_KEY, "1");
      } catch {
        /* sem storage: o boot só repete na próxima visita */
      }
      window.setTimeout(() => setVisible(false), 450);
    };
    const id = window.setInterval(() => {
      setCount((c) => {
        if (c >= LINES.length) {
          window.clearInterval(id);
          window.setTimeout(finish, 500);
          return c;
        }
        return c + 1;
      });
    }, LINE_MS);
    window.addEventListener("keydown", finish, { once: true });
    window.addEventListener("pointerdown", finish, { once: true });
    return () => {
      window.clearInterval(id);
      window.removeEventListener("keydown", finish);
      window.removeEventListener("pointerdown", finish);
    };
  }, [visible]);

  if (!visible) return null;
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-void px-4 transition-opacity duration-500 ${
        leaving ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="w-full max-w-2xl text-[13px] leading-6 sm:text-sm">
        {LINES.slice(0, count).map((line, i) => (
          <p
            key={line}
            className={`animate-rise whitespace-pre-wrap break-words ${
              i === LINES.length - 1 ? "glow-strong mt-3 text-ph" : i === 0 ? "glow mb-2 text-cy" : "text-ph/80"
            }`}
          >
            {line}
          </p>
        ))}
        <p className="cursor mt-1 text-ph" />
        <p className="mt-8 text-[11px] uppercase tracking-[0.3em] text-ph-dim">clique ou tecle para pular</p>
      </div>
    </div>
  );
}
