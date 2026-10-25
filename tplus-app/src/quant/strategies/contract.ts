import type { StrategyContext } from "../context";
import type { StrategyMeta, StrategyResult } from "../types";

export interface Strategy {
  meta: StrategyMeta;
  run(ctx: StrategyContext): StrategyResult;
}

export function blankResult(
  meta: StrategyMeta,
  extra?: Partial<StrategyResult>,
): StrategyResult {
  return {
    id: meta.id,
    shortId: meta.shortId,
    name: meta.name,
    signal: "NO_SIGNAL",
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
    error: null,
    ...extra,
  };
}

export function rrFrom(
  entry: number | null,
  sl: number | null,
  tp: number | null,
): number | null {
  if (!entry || !sl || !tp) return null;
  const risk = entry - sl;
  const reward = tp - entry;
  if (risk <= 0 || reward <= 0) return null;
  return reward / risk;
}
