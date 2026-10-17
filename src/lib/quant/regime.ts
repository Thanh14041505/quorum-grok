import type { Candle, Regime } from "./types";
import { computeFeatures, lastSnapshot } from "./indicators";
import { clamp } from "./math";

export function detectRegime(benchmark: Candle[]): {
  regime: Regime;
  score: number;
  reason: string;
  close: number | null;
} {
  if (!benchmark.length) {
    return { regime: "UNKNOWN", score: Number.NaN, reason: "No benchmark data", close: null };
  }
  const snap = lastSnapshot(computeFeatures(benchmark));
  let score = 50;
  const reasons: string[] = [];
  if (snap.aboveMa20) {
    score += 10;
    reasons.push("VNINDEX > MA20");
  } else {
    score -= 10;
    reasons.push("VNINDEX < MA20");
  }
  if (snap.aboveMa50) {
    score += 10;
    reasons.push("VNINDEX > MA50");
  } else {
    score -= 10;
    reasons.push("VNINDEX < MA50");
  }
  if (snap.aboveMa200) {
    score += 15;
    reasons.push("VNINDEX > MA200");
  } else {
    score -= 15;
    reasons.push("VNINDEX < MA200");
  }
  score += (snap.ma20Slope ?? 0) > 0 ? 5 : -5;
  score += (snap.ma50Slope ?? 0) > 0 ? 5 : -5;
  if ((snap.cmf20 ?? 0) > 0) {
    score += 5;
    reasons.push("market CMF positive");
  } else {
    score -= 5;
  }
  score = clamp(score, 0, 100);
  let regime: Regime = "SIDEWAYS";
  if (score >= 75) regime = "STRONG_BULL";
  else if (score >= 60) regime = "BULL";
  else if (score >= 45) regime = "SIDEWAYS";
  else if (score >= 30) regime = "BEAR";
  else regime = "STRONG_BEAR";
  return { regime, score, reason: reasons.join("; "), close: snap.close };
}
