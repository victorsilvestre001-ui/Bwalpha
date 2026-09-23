import "./globals.css";

export const metadata = {
  title: "TradeOn AI | Inteligência Artificial para Traders",
  description: "A TradeOn AI analisa o mercado em segundos com Inteligência Artificial e entrega sinais para EURUSD, EURJPY e Ouro (XAUUSD) com leitura técnica completa.",
  icons: { icon: "/icon.svg", apple: "/icon.svg" }
};

export const viewport = { themeColor: "#05070F" };

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
