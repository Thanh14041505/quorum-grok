import test from "node:test";
import assert from "node:assert/strict";
import { buildConsensus } from "./consensus.ts";
import { DEFAULT_CONFIG } from "./config.ts";
import { buildTradePlan } from "./trade-plan.ts";
import type { Signal, SmcSummary, StrategyResult } from "./types.ts";

type Extra = Record<string, string | number | boolean | null>;
type Levels = { entry?: number | null; sl?: number | null; tp1?: number | null; tp2?: number | null };

function strategy(shortId: string, signal: Signal = "NO_SIGNAL", extras: Extra = {}, levels: Levels = {}): StrategyResult {
  const entry = levels.entry === undefined ? 100 : levels.entry;
  const sl = levels.sl === undefined ? 95 : levels.sl;
  const tp1 = levels.tp1 === undefined ? 112 : levels.tp1;
  const tp2 = levels.tp2 === undefined ? 120 : levels.tp2;
  return {
    id: shortId.toLowerCase(), shortId, name: shortId, signal, score: 70,
    reasons: [], warnings: [], checks: [], entry, sl, tp1, tp2, rr: 2.4, extras, error: null,
  };
}

function smcSummary(overrides: Partial<Pick<SmcSummary, "bias" | "fresh" | "held" | "pd" | "nearLow" | "flowIn" | "retestOk">> = {}) {
  return {
    bias: "BULL" as const, fresh: "WAIT" as const, held: "HOLD" as const, pd: "EQUILIBRIUM",
    nearLow: false, flowIn: false, retestOk: false, ...overrides,
  };
}

function breakoutStrategies(overrides: Partial<Record<string, StrategyResult>> = {}): StrategyResult[] {
  const defaults: StrategyResult[] = [
    strategy("S1", "BUY", { setup: "BREAKOUT" }),
    strategy("S2", "BUY", { d1: true, w1: true, m1: false, zone: "Kijun daily pullback" }),
    strategy("S3", "WATCH", { vsa: "NONE" }),
    strategy("S4", "BUY", { zone: "At POC", vah: 105, val: 94 }),
    strategy("S5", "BUY", { trend: 9, vp_position: "value_area" }),
    strategy("S6", "WATCH", { kind: "none" }),
    strategy("S7", "HOLD", { holder: "HOLD" }),
    strategy("S8", "BUY", { structure: "HH_HL", donchianPct: 0.6, coiled: true, effort: "DEMAND", rsAligned: true, extended: false, swingLow: 90, high20: 106 }),
    strategy("S9", "WATCH", { fresh: "WAIT", bias: "BULL" }),
  ];
  return defaults.map((value) => overrides[value.shortId] ?? value);
}

test("four of six votes can produce an uptrend breakout without counting S7/S8/S9", () => {
  const strategies = breakoutStrategies();
  const consensus = buildConsensus(strategies);
  const plan = buildTradePlan({
    strategies, consensus, price: 100, regime: "BULL",
    smc: smcSummary(), cfg: { ...DEFAULT_CONFIG, allowNewLongInBear: false },
  });
  assert.equal(consensus.total, 6);
  assert.equal(plan.setupType, "UPTREND_BREAKOUT_CONTINUATION");
  assert.equal(plan.buyVotes.length, 4);
  assert.equal(plan.decision, "BUY");
  assert.equal(plan.ticketSource, "S8");
});

test("VSA DISTRIBUTION is a hard veto even when a breakout has enough bullish votes", () => {
  const strategies = breakoutStrategies({
    S3: strategy("S3", "EXIT", { vsa: "DISTRIBUTION" }),
  });
  const plan = buildTradePlan({
    strategies, consensus: buildConsensus(strategies), price: 100, regime: "BULL",
    smc: smcSummary(), cfg: DEFAULT_CONFIG,
  });
  assert.equal(plan.setupType, "UPTREND_BREAKOUT_CONTINUATION");
  assert.equal(plan.decision, "NO_TRADE");
  assert.ok(plan.hardVetoes.some((issue) => issue.code === "VSA_DISTRIBUTION"));
});

test("confirmed divergence plus constructive VSA can create a reduced-risk relief-rally probe despite bearish context", () => {
  const strategies = [
    strategy("S1", "EXIT", { setup: "BREAKDOWN" }),
    strategy("S2", "EXIT", { d1: false, w1: false }),
    strategy("S3", "BUY", { vsa: "SPRING" }),
    strategy("S4", "WATCH", { zone: "VAL bounce" }),
    strategy("S5", "EXIT", { trend: 0.8 }),
    strategy("S6", "BUY", { kind: "bull_reg", strength: 7 }),
    strategy("S7", "EXIT", { holder: "EXIT" }),
    strategy("S8", "EXIT", { structure: "LH_LL", effort: "DEMAND", swingLow: 90, extended: false }),
    strategy("S9", "REDUCE", { fresh: "SKIP", bias: "BEAR" }),
  ];
  const plan = buildTradePlan({
    strategies, consensus: buildConsensus(strategies), price: 100, regime: "BEAR",
    smc: smcSummary({ bias: "BEAR", fresh: "SKIP", held: "REDUCE" }),
    cfg: { ...DEFAULT_CONFIG, allowNewLongInBear: false },
  });
  assert.equal(plan.setupType, "DOWNTREND_RELIEF_RALLY");
  assert.equal(plan.decision, "COUNTERTREND_PROBE");
  assert.equal(plan.riskMultiplier, 0.5);
  assert.ok(plan.contextConflicts.some((issue) => issue.code === "SMC_SKIP_CONTEXT"));
  assert.equal(plan.hardVetoes.length, 0);
});

test("a newly broken confirmed swing low invalidates a relief-rally probe", () => {
  const strategies = [
    strategy("S1", "EXIT", { setup: "BREAKDOWN" }),
    strategy("S2", "EXIT", { d1: false, w1: false }),
    strategy("S3", "BUY", { vsa: "SPRING" }),
    strategy("S4", "WATCH", { zone: "VAL bounce" }),
    strategy("S5", "EXIT", { trend: 0.8 }),
    strategy("S6", "BUY", { kind: "bull_reg", strength: 7 }),
    strategy("S7", "HOLD", { holder: "HOLD" }),
    strategy("S8", "EXIT", { structure: "LH_LL", effort: "DEMAND", swingLow: 101, extended: false }),
    strategy("S9", "REDUCE", { fresh: "SKIP", bias: "BEAR" }),
  ];
  const plan = buildTradePlan({
    strategies, consensus: buildConsensus(strategies), price: 100, regime: "BEAR",
    smc: smcSummary({ bias: "BEAR", fresh: "SKIP" }), cfg: DEFAULT_CONFIG,
  });
  assert.equal(plan.setupType, "DOWNTREND_RELIEF_RALLY");
  assert.equal(plan.decision, "NO_TRADE");
  assert.ok(plan.hardVetoes.some((issue) => issue.code === "BROKE_CONFIRMED_SWING_LOW"));
});

test("major reversal requires SMC fresh BUY and a confirmed regular bullish divergence", () => {
  const strategies = [
    strategy("S1", "WATCH"),
    strategy("S2", "WATCH", { d1: false, w1: false }),
    strategy("S3", "BUY", { vsa: "SPRING" }),
    strategy("S4", "WATCH"),
    strategy("S5", "WATCH", { trend: 4.2 }),
    strategy("S6", "BUY", { kind: "bull_reg", strength: 7 }),
    strategy("S7", "HOLD"),
    strategy("S8", "WATCH", { structure: "MIXED", effort: "DEMAND", swingLow: 90, extended: false }),
    strategy("S9", "BUY", { fresh: "BUY", bias: "BULL" }),
  ];
  const plan = buildTradePlan({
    strategies, consensus: buildConsensus(strategies), price: 100, regime: "BEAR",
    smc: smcSummary({ bias: "BULL", fresh: "BUY", pd: "DISCOUNT", nearLow: true, flowIn: true }),
    cfg: DEFAULT_CONFIG,
  });
  assert.equal(plan.setupType, "MAJOR_REVERSAL");
  assert.equal(plan.decision, "REVERSAL_PROBE");
  assert.equal(plan.ticketSource, "S9");
  assert.equal(plan.riskMultiplier, 0.5);
});

test("a candidate without a valid long ticket is WATCH, never position-sized", () => {
  const strategies = breakoutStrategies({
    S8: strategy("S8", "BUY", { structure: "HH_HL", donchianPct: 0.6, coiled: true, effort: "DEMAND", rsAligned: true, extended: false, swingLow: 90 }, { entry: 100, sl: 105, tp1: 95, tp2: 110 }),
    S1: strategy("S1", "BUY", { setup: "BREAKOUT" }, { entry: 100, sl: 105, tp1: 95, tp2: 110 }),
    S2: strategy("S2", "BUY", { d1: true, w1: true }, { entry: 100, sl: 105, tp1: 95, tp2: 110 }),
    S4: strategy("S4", "BUY", { zone: "At POC" }, { entry: 100, sl: 105, tp1: 95, tp2: 110 }),
    S5: strategy("S5", "BUY", { trend: 9 }, { entry: 100, sl: 105, tp1: 95, tp2: 110 }),
  });
  const plan = buildTradePlan({
    strategies, consensus: buildConsensus(strategies), price: 100, regime: "BULL",
    smc: smcSummary(), cfg: DEFAULT_CONFIG,
  });
  assert.equal(plan.decision, "WATCH");
  assert.equal(plan.ticketSource, null);
  assert.equal(plan.entry, null);
});
