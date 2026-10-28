import { useEffect, useState } from "react";
import { useEventLog } from "./hooks/useEventLog";
import { useMarketFeed } from "./hooks/useMarketFeed";
import { HackerDashboard } from "./themes/HackerDashboard";
import { MissionDashboard } from "./themes/mission/MissionDashboard";

type Theme = "mission" | "terminal";
const STORAGE_KEY = "indexalpha:theme";

function initialTheme(): Theme {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("theme");
    if (fromUrl === "mission" || fromUrl === "terminal") return fromUrl;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "mission" || saved === "terminal") return saved;
  } catch {
    /* storage bloqueado: usa o padrão */
  }
  return "mission";
}

export default function App() {
  const feed = useMarketFeed();
  const log = useEventLog(feed.data);
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* sem storage: o tema só não é lembrado */
    }
  }, [theme]);

  return (
    <>
      {theme === "mission" ? <MissionDashboard feed={feed} log={log} /> : <HackerDashboard feed={feed} log={log} />}

      <div className="fixed bottom-4 right-4 z-[70] flex border border-white/20 bg-black/80 font-cond text-[11px] uppercase tracking-[0.2em] backdrop-blur">
        {(["mission", "terminal"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTheme(t)}
            aria-pressed={theme === t}
            className={`px-3 py-1.5 transition-colors ${theme === t ? "bg-white text-black" : "text-white/60 hover:text-white"}`}
          >
            {t === "mission" ? "Missão" : "Terminal"}
          </button>
        ))}
      </div>
    </>
  );
}
