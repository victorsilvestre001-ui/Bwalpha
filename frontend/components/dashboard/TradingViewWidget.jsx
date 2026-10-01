"use client";
import { ASSETS } from "@/lib/assets";

// Gráfico do TradingView embutido direto por iframe (o mesmo endereço que o script oficial
// de embed monta). Assim não depende de carregar o script s3.tradingview.com, que deixou de montar o gráfico.
export default function TradingViewWidget({ pair = "EURUSD", timeframe = "M1" }) {
  // Endereço clássico do TradingView (tv.js / widgetembed): carrega os dados por outro servidor
  // do que o widget novo, que estava ficando só girando.
  const params = new URLSearchParams({
    frameElementId: `tv_${pair}_${timeframe}`,
    symbol: ASSETS[pair]?.tv || `FX_IDC:${pair}`,
    interval: timeframe === "M5" ? "5" : "1",
    hidesidetoolbar: "1",
    symboledit: "0",
    saveimage: "0",
    toolbarbg: "0E1426",
    theme: "dark",
    style: "1",
    timezone: "America/Sao_Paulo",
    locale: "br",
    withdateranges: "0",
    hideideas: "1"
  });
  const src = `https://s.tradingview.com/widgetembed/?${params.toString()}`;

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
