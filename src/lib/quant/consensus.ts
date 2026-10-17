import type { ConsensusResult, Signal, StrategyResult } from "./types";

const BULL: Signal[] = ["STRONG_BUY", "BUY", "ADD"];
const BEAR: Signal[] = ["EXIT", "SELL", "REDUCE"];
const NEUT: Signal[] = ["WATCH", "HOLD", "NO_SIGNAL", "FILTERED"];

function bucket(signal: Signal): "bull" | "bear" | "neut" | "err" {
  if (signal === "ERROR") return "err";
  if (BULL.includes(signal)) return "bull";
  if (BEAR.includes(signal)) return "bear";
  if (NEUT.includes(signal)) return "neut";
  return "neut";
}

/**
 * Meta engine không override tín hiệu gốc.
 * Conflict là thông tin — không biến bất đồng thành "fake certainty".
 */
export function buildConsensus(results: StrategyResult[]): ConsensusResult {
  const live = results.filter((r) => r.signal !== "ERROR");
  const bullish = live.filter((r) => bucket(r.signal) === "bull").map((r) => r.shortId);
  const bearish = live.filter((r) => bucket(r.signal) === "bear").map((r) => r.shortId);
  const neutral = live.filter((r) => bucket(r.signal) === "neut").map((r) => r.shortId);
  const errors = results.filter((r) => r.signal === "ERROR").map((r) => r.shortId);
  const total = live.length;

  let conflict: ConsensusResult["conflict"] = "NONE";
  if (bullish.length && bearish.length) {
    const minority = Math.min(bullish.length, bearish.length);
    if (minority >= 2 && Math.abs(bullish.length - bearish.length) <= 1) conflict = "HIGH";
    else if (minority >= 1) conflict = "MEDIUM";
    else conflict = "LOW";
  } else if (bullish.length && neutral.length >= 3) conflict = "LOW";

  let signal: Signal = "NO_SIGNAL";
  if (bearish.length >= 3 && bearish.length > bullish.length) signal = "EXIT";
  else if (bullish.length >= 4 && conflict !== "HIGH") signal = bullish.length >= 5 ? "STRONG_BUY" : "BUY";
  else if (bullish.length >= 3 && conflict === "HIGH") signal = "WATCH";
  else if (bullish.length >= 2) signal = "WATCH";
  else if (bearish.length >= 2) signal = "REDUCE";
  else signal = "NO_SIGNAL";

  const summary = [
    `BUY-side ${bullish.length}/${total}`,
    `Neutral ${neutral.length}/${total}`,
    `SELL-side ${bearish.length}/${total}`,
    `Conflict ${conflict}`,
  ];
  if (errors.length) summary.push(`Errors ${errors.join(",")}`);

  return {
    signal,
    agreement: bullish.length,
    total,
    conflict,
    bullish,
    neutral,
    bearish,
    errors,
    summary,
  };
}
