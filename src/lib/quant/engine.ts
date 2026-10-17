import type { Candle, ScanConfig, ScanReport, StockScanRow, StrategyResult } from "./types";
import { DEFAULT_CONFIG } from "./config";
import { buildContext } from "./context";
import { buildConsensus } from "./consensus";
import { calendarLagDays, vnDateFromUnix, vnToday } from "./dates";
import { detectRegime } from "./regime";
import { sizePlannedTicket } from "./risk";
import { buildTradePlan } from "./trade-plan";
import { dailyPulse } from "./strategies/s1-daily-pulse";
import { ichimoku3tf } from "./strategies/s2-ichimoku";
import { vsaSmartMoney } from "./strategies/s3-vsa";
import { volumeProfileStrategy } from "./strategies/s4-volume-profile";
import { multiFactor } from "./strategies/s5-multi-factor";
import { rsiDivergence } from "./strategies/s6-divergence";
import { daoGamHolder } from "./strategies/s7-dao-gam";
import { grokTape } from "./strategies/s8-grok-tape";
import { smcStructure } from "./strategies/s9-smc";
import { buildGrokCall } from "./grok-call";
import type { SmcSummary } from "./types";
import type { Strategy } from "./strategies/contract";

export const STRATEGIES: Strategy[] = [
  dailyPulse,
  ichimoku3tf,
  vsaSmartMoney,
  volumeProfileStrategy,
  multiFactor,
  rsiDivergence,
  daoGamHolder,
  grokTape,
  smcStructure,
];

/** S1–S6 vote. S7 is for holders; S8 tape + S9 SMC are separate validators. */
export const VOTING_IDS = new Set(["S1", "S2", "S3", "S4", "S5", "S6"]);

export function runStrategies(ctx: ReturnType<typeof buildContext>): StrategyResult[] {
  return STRATEGIES.map((s) => {
    try {
      return s.run(ctx);
    } catch (err) {
      return {
        id: s.meta.id,
        shortId: s.meta.shortId,
        name: s.meta.name,
        signal: "ERROR",
        score: null,
        reasons: [],
        warnings: [],
        checks: [],
        entry: null,
        sl: null,
        tp1: null,
        tp2: null,
        rr: null,
        extras: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
}

export function scanSymbol(
  symbol: string,
  candles: Candle[],
  bench: Candle[] | null,
  regime: ReturnType<typeof detectRegime>,
  cfg: ScanConfig = DEFAULT_CONFIG,
  demo = false,
): StockScanRow {
  const spark = sparkFrom(candles);
  if (candles.length < cfg.minHistoryRows) {
    return stubRow(symbol, candles, regime, demo, "FILTERED", "INSUFFICIENT_HISTORY");
  }
  const last = candles[candles.length - 1]!;
  const notes: string[] = [];
  if (last.close < cfg.minPriceVnd) notes.push("LOW_PRICE");
  const ctx = buildContext(symbol, candles, bench, regime.regime, regime.score, cfg);
  if ((ctx.snap.avgValue20d ?? 0) < cfg.minAvgValue20d) notes.push("LOW_LIQUIDITY");

  // Hard gate = đúng Daily Scanner production. Soft = vẫn chấm điểm, gắn lý do.
  if (cfg.hardGate && notes.length) {
    return stubRow(symbol, candles, regime, demo, "FILTERED", notes.join("+"));
  }

  const strategies = runStrategies(ctx);
  const voters = strategies.filter((s) => VOTING_IDS.has(s.shortId));
  const consensus = buildConsensus(voters);
  if (notes.length) {
    consensus.summary = [...notes, ...consensus.summary];
  }
  const smc = toSmcSummary(ctx.smc);
  const tradePlan = buildTradePlan({
    strategies,
    consensus,
    price: ctx.snap.close,
    regime: regime.regime,
    smc,
    cfg,
  });
  const actionable = ["STRONG_SETUP", "BUY", "COUNTERTREND_PROBE", "REVERSAL_PROBE"].includes(tradePlan.decision);
  const risk = actionable
    ? sizePlannedTicket(ctx.snap.close, tradePlan, cfg, tradePlan.riskMultiplier)
    : { entry: null, sl: null, tp1: null, tp2: null, rr: null, riskPct: null, positionSize: null, lotShares: null };
  const grokCall = buildGrokCall(
    strategies.find((s) => s.shortId === "S8"),
    consensus,
    cfg,
    regime.regime,
    smc,
    strategies.find((s) => s.shortId === "S7"),
  );
  const prev = candles.length > 1 ? candles[candles.length - 2]!.close : last.close;
  const alpha = strategies.find((s) => s.shortId === "S1")?.score ?? null;
  const sessionDate = vnDateFromUnix(last.time);
  const sessionLagDays = calendarLagDays(sessionDate);
  if (sessionLagDays > 2) notes.push(`STALE_SESSION_${sessionDate}`);
  return {
    symbol,
    status: "OK",
    price: ctx.snap.close,
    changePct: prev ? ctx.snap.close / prev - 1 : 0,
    volume: ctx.snap.volume,
    regime: regime.regime,
    regimeScore: regime.score,
    strategies,
    consensus,
    tradePlan,
    entry: risk.entry,
    sl: risk.sl,
    tp1: risk.tp1,
    tp2: risk.tp2,
    rr: risk.rr,
    riskPct: risk.riskPct,
    positionSize: risk.positionSize,
    lotShares: risk.lotShares,
    filterReason: notes.length ? notes.join("+") : null,
    error: null,
    demo,
    spark,
    notes,
    alpha,
    grokCall,
    sessionDate,
    sessionLagDays,
    smc,
  };
}

function stubRow(
  symbol: string,
  candles: Candle[],
  regime: ReturnType<typeof detectRegime>,
  demo: boolean,
  status: "FILTERED" | "ERROR",
  reason: string,
): StockScanRow {
  const last = candles[candles.length - 1];
  const prev = candles.length > 1 ? candles[candles.length - 2]!.close : last?.close ?? 0;
  const sessionDate = last ? vnDateFromUnix(last.time) : "";
  return {
    symbol,
    status,
    price: last?.close ?? 0,
    changePct: last && prev ? last.close / prev - 1 : 0,
    volume: last?.volume ?? 0,
    regime: regime.regime,
    regimeScore: regime.score,
    strategies: STRATEGIES.map((s) => ({
      id: s.meta.id,
      shortId: s.meta.shortId,
      name: s.meta.name,
      signal: status === "ERROR" ? "ERROR" : "FILTERED",
      score: null,
      reasons: [],
      warnings: [],
      checks: [],
      entry: null, sl: null, tp1: null, tp2: null, rr: null,
      extras: {},
      error: null,
    })),
    consensus: {
      signal: "FILTERED",
      agreement: 0,
      total: 6,
      conflict: "NONE",
      bullish: [],
      neutral: [],
      bearish: [],
      errors: [],
      summary: [reason],
    },
    entry: null, sl: null, tp1: null, tp2: null, rr: null, riskPct: null, positionSize: null, lotShares: null,
    filterReason: reason,
    error: status === "ERROR" ? reason : null,
    demo,
    spark: sparkFrom(candles),
    notes: [reason],
    alpha: null,
    grokCall: {
      stance: "NO_TRADE",
      conviction: "LOW",
      headline: status === "ERROR" ? "No call — feed error." : "No call — name did not clear the gate.",
      why: [reason],
      invalidation: null,
      horizon: "—",
      changeMind: "Pass the history/liquidity gate, then re-read the tape.",
      disagreesWithConsensus: false,
      entry: null,
      sl: null,
      tp1: null,
    },
    sessionDate,
    sessionLagDays: sessionDate ? calendarLagDays(sessionDate) : 999,
    smc: null,
    tradePlan: null,
  };
}

function sparkFrom(candles: Candle[]): number[] {
  return candles.slice(-40).map((c) => c.close);
}

export function buildReport(
  series: Record<string, Candle[]>,
  errors: Record<string, string>,
  demo: boolean,
  dataNote: string,
  cfg: ScanConfig = DEFAULT_CONFIG,
): ScanReport {
  const bench = series.VNINDEX ?? series.vnindex ?? [];
  const regime = detectRegime(bench);
  const rows: StockScanRow[] = [];
  for (const [symbol, candles] of Object.entries(series)) {
    if (symbol.toUpperCase() === "VNINDEX" || symbol.toUpperCase() === "VN30") continue;
    rows.push(scanSymbol(symbol, candles, bench, regime, cfg, demo));
  }
  for (const [symbol, message] of Object.entries(errors)) {
    if (symbol.toUpperCase() === "VNINDEX") continue;
    rows.push(stubRow(symbol, [], regime, demo, "ERROR", message));
  }
  rows.sort((a, b) => rank(b) - rank(a) || a.symbol.localeCompare(b.symbol));
  const lastBench = bench[bench.length - 1];
  const asOf = lastBench ? vnDateFromUnix(lastBench.time) : vnToday();
  const lag = calendarLagDays(asOf);
  return {
    asOf,
    regime: regime.regime,
    regimeScore: regime.score,
    regimeReason: regime.reason,
    benchmarkClose: regime.close,
    rows,
    demo,
    dataNote: lag > 2 ? `${dataNote} STALE: last VNINDEX session ${asOf} vs today ${vnToday()}.` : dataNote,
    requested: rows.length,
    stale: lag > 2,
  };
}

export function rankRows(rows: StockScanRow[]): StockScanRow[] {
  return [...rows].sort((a, b) => {
    const diff = rank(b) - rank(a);
    if (diff !== 0) return diff;
    return a.symbol.localeCompare(b.symbol);
  });
}

export function errorRow(symbol: string, message: string): StockScanRow {
  return stubRow(symbol, [], { regime: "UNKNOWN", score: 0, reason: message, close: null }, false, "ERROR", message);
}

function rank(row: StockScanRow): number {
  if (row.status !== "OK") return -1;
  const order: Record<string, number> = {
    STRONG_BUY: 6, BUY: 5, ADD: 4.5, WATCH: 3, HOLD: 2.5, REDUCE: 2, EXIT: 1.5, SELL: 1, NO_SIGNAL: 0,
  };
  const smcBoost = row.smc?.fresh === "BUY" ? 0.4 : row.smc?.fresh === "SKIP" ? -0.3 : 0;
  const setupBoost = row.tradePlan?.decision === "STRONG_SETUP" ? 2
    : row.tradePlan?.decision === "BUY" ? 1
      : row.tradePlan?.decision === "COUNTERTREND_PROBE" || row.tradePlan?.decision === "REVERSAL_PROBE" ? 0.5 : 0;
  return (order[row.consensus.signal] ?? 0) * 10 + row.consensus.agreement + smcBoost + setupBoost;
}

function toSmcSummary(plan: ReturnType<typeof buildContext>["smc"]): SmcSummary {
  return {
    bias: plan.bias,
    event: plan.event,
    pd: plan.pd,
    fresh: plan.fresh,
    held: plan.held,
    thesis: plan.thesis,
    entryLow: plan.entryLow,
    entryHigh: plan.entryHigh,
    sl: plan.sl,
    tp1: plan.tp1,
    tp2: plan.tp2,
    rr: plan.rr,
    eq: plan.eq,
    swingHigh: plan.swingHigh,
    swingLow: plan.swingLow,
    poiKind: plan.poi?.kind ?? null,
    poiLow: plan.poi?.low ?? null,
    poiHigh: plan.poi?.high ?? null,
    fvgLow: plan.fvg?.low ?? null,
    fvgHigh: plan.fvg?.high ?? null,
    obLow: plan.ob?.low ?? null,
    obHigh: plan.ob?.high ?? null,
    weeklyBias: plan.weeklyBias,
    monthlyBias: plan.monthlyBias,
    loc: plan.loc,
    flowIn: plan.flowIn,
    nearLow: plan.nearLow,
    retestOk: plan.retestOk,
    fib618: plan.fib618,
    fib786: plan.fib786,
    fib500: plan.fib500,
    fib382: plan.fib382,
    fib236: plan.fib236,
    zigzag: (plan.zigzag ?? []).map((p) => ({ i: p.i, time: p.time, price: p.price, kind: p.kind })),
  };
}

