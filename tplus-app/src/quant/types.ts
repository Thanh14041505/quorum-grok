export type Signal =
  | "STRONG_BUY"
  | "BUY"
  | "WATCH"
  | "HOLD"
  | "ADD"
  | "REDUCE"
  | "EXIT"
  | "SELL"
  | "NO_SIGNAL"
  | "FILTERED"
  | "ERROR";

export type Regime =
  "STRONG_BULL" | "BULL" | "SIDEWAYS" | "BEAR" | "STRONG_BEAR" | "UNKNOWN";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StrategyMeta {
  id: string;
  shortId: string;
  name: string;
  sourceNotebook: string;
  sourceSection: string;
  philosophy: string;
  indicators: string[];
  filters: string[];
}

export interface StrategyResult {
  id: string;
  shortId: string;
  name: string;
  signal: Signal;
  score: number | null;
  reasons: string[];
  warnings: string[];
  checks: Array<{ ok: boolean; text: string }>;
  entry: number | null;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  rr: number | null;
  extras: Record<string, string | number | boolean | null>;
  error: string | null;
}

export interface ScanConfig {
  lookbackBars: number;
  minHistoryRows: number;
  minPriceVnd: number;
  minAvgValue20d: number;
  minAvgVol20d: number;
  buyScore: number;
  strongBuyScore: number;
  watchScore: number;
  exitRiskThreshold: number;
  reduceRiskThreshold: number;
  minRrSwing: number;
  minTpPct: number;
  minAtrPct: number;
  riskPerTrade: number;
  capital: number;
  maxPositionPct: number;
  allowNewLongInBear: boolean;
  requireMarketConfirmation: boolean;
  rsiOb: number;
  rsiOs: number;
  volumeExpansion: number;
  /** Notebook hard gate: drop LOW_PRICE / LOW_LIQUIDITY instead of scoring them. */
  hardGate: boolean;
}

export interface MarketSnapshot {
  symbol: string;
  candles: Candle[];
  last: Candle;
  price: number;
  changePct: number;
  volume: number;
  avgValue20d: number;
  historyRows: number;
  demo: boolean;
}

export interface ConsensusResult {
  signal: Signal;
  agreement: number;
  total: number;
  conflict: "NONE" | "LOW" | "MEDIUM" | "HIGH";
  bullish: string[];
  neutral: string[];
  bearish: string[];
  errors: string[];
  summary: string[];
}

export interface GrokCall {
  stance: "LEAN_LONG" | "SCALE_IN" | "WAIT" | "PROTECT" | "NO_TRADE";
  conviction: "LOW" | "MEDIUM" | "HIGH";
  headline: string;
  why: string[];
  invalidation: number | null;
  horizon: string;
  changeMind: string;
  disagreesWithConsensus: boolean;
  entry: number | null;
  sl: number | null;
  tp1: number | null;
}

export type SmcBias = "BULL" | "BEAR" | "RANGE";
export type SmcFresh = "BUY" | "WAIT" | "SKIP";
export type SmcHeld = "ADD" | "HOLD" | "REDUCE" | "CUT";

export interface SmcSummary {
  bias: SmcBias;
  event: string;
  pd: string;
  fresh: SmcFresh;
  held: SmcHeld;
  thesis: string;
  entryLow: number | null;
  entryHigh: number | null;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  rr: number | null;
  eq: number | null;
  swingHigh: number | null;
  swingLow: number | null;
  poiKind: string | null;
  poiLow: number | null;
  poiHigh: number | null;
  fvgLow: number | null;
  fvgHigh: number | null;
  obLow: number | null;
  obHigh: number | null;
  weeklyBias: string;
  monthlyBias: string;
  loc: number | null;
  flowIn: boolean;
  nearLow: boolean;
  retestOk: boolean;
  fib618: number | null;
  fib786: number | null;
  fib500: number | null;
  fib382: number | null;
  fib236: number | null;
  zigzag: Array<{ i: number; time: number; price: number; kind: "H" | "L" }>;
}

export type TradeSetupType =
  | "PULLBACK_UPTREND"
  | "UPTREND_BREAKOUT_CONTINUATION"
  | "DOWNTREND_RELIEF_RALLY"
  | "MAJOR_REVERSAL"
  | "NONE";

export type TradeDecision =
  | "STRONG_SETUP"
  | "BUY"
  | "COUNTERTREND_PROBE"
  | "REVERSAL_PROBE"
  | "WATCH"
  | "NO_TRADE";

export type TradeIssueSeverity = "HARD_VETO" | "WARNING" | "CONTEXT_CONFLICT";

export interface TradePlanIssue {
  code: string;
  source: string;
  severity: TradeIssueSeverity;
  message: string;
}

export interface TradePlan {
  setupType: TradeSetupType;
  decision: TradeDecision;
  primaryTrend: "BULLISH" | "BEARISH" | "MIXED" | "UNKNOWN";
  summary: string;
  buyVotes: string[];
  strongBuyVotes: string[];
  watchVotes: string[];
  exitVotes: string[];
  reduceVotes: string[];
  totalVoting: number;
  supportingStrategies: string[];
  conflictingStrategies: string[];
  hardVetoes: TradePlanIssue[];
  warnings: TradePlanIssue[];
  contextConflicts: TradePlanIssue[];
  reasons: string[];
  ticketSource: string | null;
  riskMultiplier: number;
  entry: number | null;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  rr: number | null;
}

export interface StockScanRow {
  symbol: string;
  status: "OK" | "FILTERED" | "ERROR";
  price: number;
  changePct: number;
  volume: number;
  regime: Regime;
  regimeScore: number;
  strategies: StrategyResult[];
  consensus: ConsensusResult;
  entry: number | null;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  rr: number | null;
  riskPct: number | null;
  positionSize: number | null;
  lotShares: number | null;
  filterReason: string | null;
  error: string | null;
  demo: boolean;
  spark: number[];
  notes: string[];
  alpha: number | null;
  grokCall: GrokCall | null;
  sessionDate: string;
  sessionLagDays: number;
  smc: SmcSummary | null;
  /** Setup-aware decision layer; S7/S8/S9 remain separate from the S1–S6 ballot. */
  tradePlan?: TradePlan | null;
}

export interface ScanReport {
  asOf: string;
  regime: Regime;
  regimeScore: number;
  regimeReason: string;
  benchmarkClose: number | null;
  rows: StockScanRow[];
  demo: boolean;
  dataNote: string;
  requested?: number;
  stale?: boolean;
}
