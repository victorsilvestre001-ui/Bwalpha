"use client";
import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries, ColorType } from "lightweight-charts";
import { api } from "@/lib/api";
import { ASSETS, assetDigits } from "@/lib/assets";
import TradingViewWidget from "./TradingViewWidget";

// Gráfico próprio com os candles da Exnova (os mesmos que a IA lê), atualizado a cada 2 s.
// Horário de Brasília (o gráfico trabalha em UTC, então deslocamos -3h). Se a API falhar
// logo no início, cai para o widget do TradingView.
const BRT = -3 * 3600;

export default function LiveChart({ pair = "EURUSD", timeframe = "M1" }) {
  const box = useRef(null);
  const [fallback, setFallback] = useState(false);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    if (fallback || !box.current) return;
    const el = box.current;
    const digits = assetDigits(pair);
    let chart;
    try { chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#0E1426" }, textColor: "#9AA6C3", fontFamily: "JetBrains Mono, monospace", attributionLogo: false },
      grid: { vertLines: { color: "rgba(27,36,64,0.6)" }, horzLines: { color: "rgba(27,36,64,0.6)" } },
      localization: { locale: "pt-BR" },
      rightPriceScale: { borderColor: "rgba(154,166,195,0.15)" },
      timeScale: { borderColor: "rgba(154,166,195,0.15)", timeVisible: true, secondsVisible: false, rightOffset: 4 },
      crosshair: { mode: 0 }
    }); } catch { setFallback(true); return; }
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#00F0A8", downColor: "#FF4D6D", borderUpColor: "#00F0A8", borderDownColor: "#FF4D6D",
      wickUpColor: "#00F0A8", wickDownColor: "#FF4D6D",
      priceFormat: { type: "price", precision: digits, minMove: 1 / 10 ** digits }
    });
    let alive = true, loaded = false, fails = 0, lastTime = 0;
    async function tick() {
      try {
        const { candles } = await api.chartCandles(pair, timeframe);
        if (!alive) return;
        const data = candles.map((c) => ({ ...c, time: c.time + BRT }));
        if (!loaded) {
          series.setData(data);
          chart.timeScale().scrollToRealTime();
          loaded = true;
          setStatus("ok");
        } else {
          for (const c of data.slice(-3)) if (c.time >= lastTime) series.update(c);
        }
        lastTime = data[data.length - 1]?.time || lastTime;
        fails = 0;
      } catch {
        fails += 1;
        if (!loaded && fails >= 2 && alive) setFallback(true);
      }
    }
    tick();
    const id = setInterval(tick, 2000);
    return () => { alive = false; clearInterval(id); chart.remove(); };
  }, [pair, timeframe, fallback]);

  if (fallback) return <TradingViewWidget pair={pair} timeframe={timeframe} />;
  return (
    <div className="relative h-full w-full">
      <div className="absolute left-3 top-2 z-10 flex items-center gap-2 font-mono text-xs text-mist-dim">
        <span className="font-semibold text-mist">{ASSETS[pair]?.label || pair}</span>
        <span>· {timeframe}</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-neon" /> ao vivo</span>
      </div>
      {status === "loading" && <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-mist-faint">Carregando gráfico…</div>}
      <div ref={box} className="h-full w-full pt-7" />
    </div>
  );
}
