"use client";
import { ASSETS } from "@/lib/assets";

// Gráfico do TradingView embutido direto por iframe (o mesmo endereço que o script oficial
// de embed monta). Assim não depende de carregar o script s3.tradingview.com, que deixou de montar o gráfico.
export default function TradingViewWidget({ pair = "EURUSD", timeframe = "M1" }) {
  const config = {
    autosize: true,
    symbol: ASSETS[pair]?.tv || `FX_IDC:${pair}`,
    interval: timeframe === "M5" ? "5" : "1",
    timezone: "America/Sao_Paulo",
    theme: "dark",
    style: "1",
    locale: "br",
    backgroundColor: "rgba(14, 20, 38, 1)",
    gridColor: "rgba(27, 36, 64, 0.6)",
    hide_side_toolbar: true,
    allow_symbol_change: false,
    save_image: false,
    support_host: "https://www.tradingview.com"
  };
  const src = `https://www.tradingview-widget.com/embed-widget/advanced-chart/?locale=br#${encodeURIComponent(JSON.stringify(config))}`;

  return (
    <div className="tradingview-widget-container relative h-full min-h-[440px] w-full">
      <iframe
        key={`${pair}-${timeframe}`}
        title={`Gráfico ${pair} ${timeframe}`}
        src={src}
        className="absolute inset-0 h-full w-full border-0"
        allowTransparency
        allowFullScreen
        scrolling="no"
      />
    </div>
  );
}
