"use client";
import { useEffect, useRef } from "react";

export default function TradingViewWidget({ pair = "EURUSD", timeframe = "M1" }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = "";
    const container = document.createElement("div");
    container.className = "tradingview-widget-container__widget";
    container.style.height = "100%";
    el.appendChild(container);
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: `FX:${pair}`,
      interval: timeframe === "M5" ? "5" : "1",
      timezone: "America/Sao_Paulo",
      theme: "dark",
      style: "1",
      locale: "br",
      backgroundColor: "rgba(14, 20, 38, 1)",
      gridColor: "rgba(27, 36, 64, 0.6)",
      hide_side_toolbar: true,
      allow_symbol_change: false,
      support_host: "https://www.tradingview.com"
    });
    el.appendChild(script);
    return () => { el.innerHTML = ""; };
  }, [pair, timeframe]);

  return <div ref={ref} className="tradingview-widget-container h-full w-full" />;
}
