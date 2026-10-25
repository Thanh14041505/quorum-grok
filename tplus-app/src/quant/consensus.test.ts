import test from "node:test";
import assert from "node:assert/strict";
import { buildConsensus } from "./consensus.ts";
import type { Signal, StrategyResult } from "./types.ts";

function result(shortId: string, signal: Signal): StrategyResult {
  return {
    id: shortId.toLowerCase(),
    shortId,
    name: shortId,
    signal,
    score: 70,
    reasons: [],
    warnings: [],
    checks: [],
    entry: 100,
    sl: 95,
    tp1: 112,
    tp2: 120,
    rr: 2.4,
    extras: {},
    error: null,
  };
}

test("consensus uses only S1-S6 and keeps a six-voter denominator", () => {
  const results = [
    result("S1", "BUY"),
    result("S2", "STRONG_BUY"),
    result("S3", "WATCH"),
    result("S4", "BUY"),
    result("S5", "WATCH"),
    result("S6", "NO_SIGNAL"),
    result("S7", "ADD"),
    result("S8", "STRONG_BUY"),
    result("S9", "BUY"),
  ];
  const consensus = buildConsensus(results);
  assert.equal(consensus.total, 6);
  assert.equal(consensus.agreement, 3);
  assert.deepEqual(consensus.bullish, ["S1", "S2", "S4"]);
  assert.equal(consensus.signal, "WATCH");
});

test("strategy errors do not silently shrink the consensus denominator", () => {
  const results = [
    result("S1", "BUY"),
    result("S2", "BUY"),
    result("S3", "ERROR"),
    result("S4", "WATCH"),
    result("S5", "NO_SIGNAL"),
    result("S6", "WATCH"),
  ];
  const consensus = buildConsensus(results);
  assert.equal(consensus.total, 6);
  assert.deepEqual(consensus.errors, ["S3"]);
});
