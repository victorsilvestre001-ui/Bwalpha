"use client";
import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries, LineSeries, ColorType } from "lightweight-charts";
import { api } from "@/lib/api";

// Gráfico da página inicial: Ouro M5 com os mesmos candles do painel, atualizado a cada 5 s.
// Os cards (tendência, RSI, MACD) são calculados desses mesmos candles.
const BRT = -3 * 3600;

function ema(v, p) {
  const k = 2 / (p + 1);
  let a = v[0];
  return v.map((x) => (a = x * k + a * (1 - k)));
}

function rsi(v, p = 14) {
  if (v.length <= p) return null;
  let g = 0, d = 0;
  for (let i = v.length - p; i < v.length; i++) {
    const ch = v[i] - v[i - 1];
    if (ch > 0) g += ch; else d -= ch;
  }
  return d === 0 ? 100 : 100 - 100 / (1 + g / d);
}

export default function HeroChart() {
  const box = useRef(null);
  const [status, setStatus] = useState("loading");
  const [info, setInfo] = useState(null);

  useEffect(() => {
    if (!box.current) return;
    let chart;
    try {
      chart = createChart(box.current, {
        autoSize: true,
        localization: { locale: "pt-BR" },
        layout: { background: { type: ColorType.Solid, color: "#03040A" }, textColor: "#5B6788", fontFamily: "JetBrains Mono, monospace", fontSize: 11, attributionLogo: false },
        grid: { vertLines: { color: "rgba(27,36,64,0.5)" }, horzLines: { color: "rgba(27,36,64,0.5)" } },
        rightPriceScale: { borderColor: "#1B2440" },
        timeScale: { borderColor: "#1B2440", timeVisible: true, secondsVisible: false, rightOffset: 3 },
        crosshair: { mode: 0 },
        handleScroll: false,
        handleScale: false
      });
    } catch {
      setStatus("erro");
      return;
    }
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#00F0A8", downColor: "#FF4D6D", borderVisible: false, wickUpColor: "#00F0A8", wickDownColor: "#FF4D6D",
      priceFormat: { type: "price", precision: 2, minMove: 0.01 }
    });
    const line = (color) => chart.addSeries(LineSeries, { color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    const e9 = line("#3D8BFF");
    const e21 = line("#9B5CFF");

    let alive = true, fitted = false;
    async function load() {
      try {
        const data = await api.publicCandles("XAUUSD");
        if (!alive || !data?.candles?.length) return;
        const rows = data.candles.map((c) => ({ ...c, time: c.time + BRT }));
        const closes = rows.map((r) => r.close);
        const a9 = ema(closes, 9), a21 = ema(closes, 21);
        candles.setData(rows);
        e9.setData(rows.map((r, i) => ({ time: r.time, value: a9[i] })));
        e21.setData(rows.map((r, i) => ({ time: r.time, value: a21[i] })));
        if (!fitted) { chart.timeScale().fitContent(); fitted = true; }
        const macd = ema(closes, 12).at(-1) - ema(closes, 26).at(-1);
        setInfo({ price: closes.at(-1), up: a9.at(-1) > a21.at(-1), rsi: rsi(closes), macd });
        setStatus("ok");
      } catch {
        if (alive) setStatus((s) => (s === "ok" ? "ok" : "erro"));
      }
    }
    load();
    const t = setInterval(load, 5000);
    return () => { alive = false; clearInterval(t); chart.remove(); };
  }, []);

  return (
    <div className="panel panel-glow p-5 md:p-6">
      <div className="flex items-center justify-between font-mono text-xs text-mist-dim">
        <span className="flex items-center gap-2">
          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-neon" /></span>
          OURO AO VIVO
        </span>
        <span className="rounded-md bg-void-deep px-2 py-1 text-[11px]">XAUUSD · M5{info ? ` · ${info.price.toFixed(2)}` : ""}</span>
      </div>

      <div className="relative mt-4 h-60 overflow-hidden rounded-xl border border-void-line bg-void-deep md:h-64">
        <div ref={box} className="absolute inset-0" />
        {status !== "ok" && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-mist-faint">
            {status === "loading" ? "Carregando o gráfico do Ouro…" : "O gráfico volta assim que o mercado reabrir."}
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2.5">
        {[
          { k: "Tendência", v: info ? (info.up ? "Alta" : "Baixa") : "—", c: info ? (info.up ? "text-neon" : "text-ember") : "text-mist" },
          { k: "RSI 14", v: info?.rsi != null ? Math.round(info.rsi) : "—", c: "text-mist" },
          { k: "MACD", v: info ? (info.macd >= 0 ? "Positivo" : "Negativo") : "—", c: "text-mist" }
        ].map((s) => (
          <div key={s.k} className="rounded-xl border border-void-line bg-void-deep/60 p-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-mist-faint">{s.k}</div>
            <div className={`mt-1 font-display text-base font-semibold ${s.c}`}>{s.v}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 font-mono text-[10px] text-mist-faint">Mesmos candles do painel · calculado ao vivo · não é recomendação de compra ou venda</p>
    </div>
  );
}
