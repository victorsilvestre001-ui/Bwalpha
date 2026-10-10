// Ativos disponíveis na análise. `digits` = casas decimais exibidas; `tv` = símbolo no TradingView.
export const ASSETS = {
  EURUSD: { label: "EURUSD", name: "Euro / Dólar", digits: 5, tv: "FX_IDC:EURUSD" },
  EURJPY: { label: "EURJPY", name: "Euro / Iene", digits: 3, tv: "FX_IDC:EURJPY" },
  XAUUSD: { label: "XAUUSD", name: "Ouro / Dólar", digits: 2, tv: "OANDA:XAUUSD" },
  // OTC da Exnova: preço da própria corretora, funciona 24h (inclusive fim de semana).
  "EURUSD-OTC": { label: "EURUSD-OTC", name: "Euro / Dólar · OTC", digits: 5, otc: true },
  "EURJPY-OTC": { label: "EURJPY-OTC", name: "Euro / Iene · OTC", digits: 3, otc: true },
  "XAUUSD-OTC": { label: "XAUUSD-OTC", name: "Ouro / Dólar · OTC", digits: 2, otc: true }
};

export const isOtc = (pair) => !!ASSETS[pair]?.otc;

export const ASSET_LIST = Object.keys(ASSETS);

export function assetDigits(pair) {
  return ASSETS[pair]?.digits ?? 5;
}
