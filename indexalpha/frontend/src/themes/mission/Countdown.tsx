import { useEffect, useState } from "react";
import { useReducedMotion } from "../../hooks/useMotion";

const STORAGE_KEY = "indexalpha:launched";
const STEPS = ["T-3", "T-2", "T-1", "LIFTOFF"];
const STEP_MS = 620;

function launched(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Contagem regressiva de lançamento no primeiro acesso da sessão. Clique ou tecla pula. */
export function Countdown() {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(() => !reduced && !launched());
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const finish = () => {
      setLeaving(true);
      try {
        sessionStorage.setItem(STORAGE_KEY, "1");
      } catch {
        /* sem storage: a contagem só repete na próxima visita */
      }
      window.setTimeout(() => setVisible(false), 700);
    };
    const id = window.setInterval(() => {
      setStep((s) => {
        if (s >= STEPS.length - 1) {
          window.clearInterval(id);
          window.setTimeout(finish, 650);
          return s;
        }
        return s + 1;
      });
    }, STEP_MS);
    window.addEventListener("keydown", finish, { once: true });
    window.addEventListener("pointerdown", finish, { once: true });
    return () => {
      window.clearInterval(id);
      window.removeEventListener("keydown", finish);
      window.removeEventListener("pointerdown", finish);
    };
  }, [visible]);

  if (!visible) return null;
  const liftoff = STEPS[step] === "LIFTOFF";

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-black transition-all duration-700 ${
        leaving ? "scale-110 opacity-0 blur-sm" : "opacity-100"
      }`}
    >
      <div className="relative flex h-64 w-64 items-center justify-center">
        <span key={step} className="absolute inset-0 animate-ping rounded-full border border-ion/40" />
        <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90 overflow-visible">
          <defs>
            <filter id="cd-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="1.6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <circle cx="50" cy="50" r="46" fill="none" stroke="white" strokeOpacity="0.1" strokeWidth="1" />
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke="#4da3ff"
            strokeWidth="1.5"
            strokeDasharray={289}
            strokeDashoffset={289 * (1 - (step + 1) / STEPS.length)}
            filter="url(#cd-glow)"
            style={{ transition: `stroke-dashoffset ${STEP_MS}ms linear` }}
          />
        </svg>
        <span
          key={STEPS[step]}
          style={{ animationDuration: "320ms" }}
          className={`animate-enter font-sans font-extralight tabular-nums text-white ${liftoff ? "text-4xl tracking-[0.3em]" : "text-7xl"}`}
        >
          {STEPS[step]}
        </span>
      </div>
      <p className="mt-10 font-cond text-xs uppercase tracking-[0.5em] text-white/50">IndexAlpha · Mission WIN-01</p>
      <p className="mt-2 font-cond text-[10px] uppercase tracking-[0.4em] text-white/30">clique ou tecle para pular</p>
    </div>
  );
}
