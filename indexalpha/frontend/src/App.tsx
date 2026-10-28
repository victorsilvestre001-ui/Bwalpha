import { useEffect, useState } from "react";
import { useEventLog } from "./hooks/useEventLog";
import { useMarketFeed } from "./hooks/useMarketFeed";
import { HackerDashboard } from "./themes/HackerDashboard";
import { MarketDashboard } from "./themes/market/MarketDashboard";
import { MissionDashboard } from "./themes/mission/MissionDashboard";

type Theme = "market" | "mission" | "terminal";
const THEMES: { id: Theme; label: string }[] = [
  { id: "market", label: "Mercado" },
  { id: "mission", label: "Missão" },
  { id: "terminal", label: "Terminal" },
];
const isTheme = (v: string | null): v is Theme => THEMES.some((t) => t.id === v);
const STORAGE_KEY = "indexalpha:theme";

function initialTheme(): Theme {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("theme");
    if (isTheme(fromUrl)) return fromUrl;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isTheme(saved)) return saved;
  } catch {
    /* storage bloqueado: usa o padrão */
  }
  return "market";
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
      {theme === "market" && <MarketDashboard feed={feed} log={log} />}
      {theme === "mission" && <MissionDashboard feed={feed} log={log} />}
      {theme === "terminal" && <HackerDashboard feed={feed} log={log} />}

      <div className="fixed bottom-4 right-4 z-[70] flex border border-white/20 bg-black/80 font-cond text-[11px] uppercase tracking-[0.2em] backdrop-blur">
        {THEMES.map((t) => (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            aria-pressed={theme === t.id}
            className={`px-3 py-1.5 transition-colors ${theme === t.id ? "bg-white text-black" : "text-white/60 hover:text-white"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </>
  );
}
