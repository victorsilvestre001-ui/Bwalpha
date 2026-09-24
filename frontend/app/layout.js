import "./globals.css";
import ConsentBanner from "@/components/ConsentBanner";
import VisitTracker from "@/components/VisitTracker";

export const metadata = {
  title: "TradeOn AI | Inteligência Artificial para Traders",
  description: "A TradeOn AI analisa o mercado em segundos com Inteligência Artificial: leitura técnica de EURUSD, EURJPY e Ouro (XAUUSD) com indicadores e histórico transparente.",
  icons: { icon: "/icon.svg", apple: "/icon.svg" }
};

export const viewport = { themeColor: "#05070F" };

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <ConsentBanner />
        <VisitTracker />
      </body>
    </html>
  );
}
