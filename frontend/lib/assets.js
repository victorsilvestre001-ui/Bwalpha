// Ativos disponíveis na análise. `digits` = casas decimais exibidas; `tv` = símbolo no TradingView.
export const ASSETS = {
  EURUSD: { label: "EURUSD", name: "Euro / Dólar", digits: 5, tv: "FX:EURUSD" },
  EURJPY: { label: "EURJPY", name: "Euro / Iene", digits: 3, tv: "FX:EURJPY" },
  XAUUSD: { label: "XAUUSD", name: "Ouro / Dólar", digits: 2, tv: "OANDA:XAUUSD" }
};

export const ASSET_LIST = Object.keys(ASSETS);

export function assetDigits(pair) {
  return ASSETS[pair]?.digits ?? 5;
}
