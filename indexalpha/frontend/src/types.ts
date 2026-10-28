export type Action = "BUY" | "SELL" | "HOLD";

export interface Signal {
  action: Action;
  confidence: number;
  stop_loss_pct: number;
  take_profit_pct: number;
  volatility_filter_applied: boolean;
}

export interface Pillar {
  ticker: string;
  sector: string;
  weight: number;
  z_score: number;
  contribution: number;
  price: number;
  change_pct: number;
}

export interface Thesis {
  thesis_text: string;
  risk_warning: string;
  source: "llm" | "fallback";
  model: string | null;
  generated_at: string;
}

export interface TradeLevels {
  entry: number;
  stop_loss: number;
  take_profit: number;
  stop_points: number;
  target_points: number;
  risk_brl: number;
  reward_brl: number;
  risk_reward: number | null;
  point_value_brl: number;
}

export interface SignalRecord {
  id: number;
  timestamp: string;
  index_score: number;
  action: Exclude<Action, "HOLD">;
  confidence: number;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  status: "open" | "closed";
  exit_price: number | null;
  exit_reason: string | null;
  pnl_points: number;
  pnl_brl: number;
}

export interface Snapshot {
  timestamp: string;
  index_score: number;
  raw_score: number;
  coverage: number;
  signal: Signal;
  market: {
    win_price: number;
    foreign_flow: number;
    vix: number;
    atr_pct: number;
    macro_scenario: string;
    factor_trends: Record<string, number>;
  };
  pillars: Pillar[];
  top_drivers: string[];
  thesis: Thesis | null;
  ai_enabled: boolean;
  trade: TradeLevels | null;
  open_position: SignalRecord | null;
  history: SignalRecord[];
  score_history: { t: string; score: number }[];
  tick_seconds: number;
}
