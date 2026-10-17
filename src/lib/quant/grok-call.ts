import type { GrokCall, ScanConfig, StrategyResult, ConsensusResult, Regime, SmcSummary } from "./types";
import { formatPrice } from "./format";

/**
 * Grok Call — khuyến nghị mua/bán của Grok.
 * Không phải phiếu thứ 8 trong consensus. Có thể WAIT khi 7 não đang BUY.
 * HIGH conflict luôn thắng ego: không long vào bất đồng.
 */
export function buildGrokCall(
  s8: StrategyResult | undefined,
  seven: StrategyResult[],
  consensus: ConsensusResult,
  cfg: ScanConfig,
  regime: Regime,
  smc?: SmcSummary | null,
): GrokCall {
  const structure = String(s8?.extras.structure ?? "MIXED");
  const extended = Boolean(s8?.extras.extended);
  const swingLow = num(s8?.extras.swingLow);
  const donchian = num(s8?.extras.donchianPct);
  const effort = String(s8?.extras.effort ?? "NEUTRAL");
  const coiled = Boolean(s8?.extras.coiled);
  const s8Signal = s8?.signal ?? "NO_SIGNAL";
  const bearReg = regime === "BEAR" || regime === "STRONG_BEAR";
  const s7 = seven.find((s) => s.shortId === "S7");

  const why: string[] = [];
  if (s8?.reasons.length) why.push(...s8.reasons.slice(0, 2));
  if (smc?.thesis) why.push(smc.thesis);
  if (consensus.conflict !== "NONE") why.push(`Seven-brain conflict ${consensus.conflict} (${consensus.bullish.join(" ") || "none"} vs ${consensus.bearish.join(" ") || "none"})`);

  const invalidation = smc?.sl ?? swingLow;
  const horizon = "5–15 sessions (swing, T+1.5)";

  // 0) SMC: SKIP = không short. BUY ở đáy HTF vẫn được long (reversal), kể cả D1 còn BEAR.
  if (smc && smc.fresh === "SKIP") {
    const protect = smc.held === "CUT" || smc.held === "REDUCE";
    return call(
      protect ? "PROTECT" : "NO_TRADE",
      smc.held === "CUT" ? "HIGH" : "MEDIUM",
      smc.held === "CUT"
        ? "SMC lost major structure (CHoCH/BOS down). Skip new buys. If you hold, cut — there is no short."
        : "SMC HTF is not a long. I do not open. Reduce if you hold. No inverted ticket.",
      why,
      smc.swingLow,
      horizon,
      "A bullish CHoCH at a major low with money in, or weekly bias flips off bear.",
      consensus.signal === "BUY" || consensus.signal === "STRONG_BUY",
      s8,
      consensus,
      smc,
    );
  }
  if (consensus.conflict === "HIGH") {
    return call("WAIT", "LOW", "No long. Seven brains are in a fight — that is the signal.", why, invalidation, horizon, "A clean 4+ agreement with structure still HH/HL.", true, s8, consensus, smc);
  }
  if (bearReg && !cfg.allowNewLongInBear) {
    const protect = s8Signal === "EXIT" || (s7 && (s7.signal === "EXIT" || s7.signal === "REDUCE"));
    return call(
      protect ? "PROTECT" : "NO_TRADE",
      "MEDIUM",
      protect
        ? "Index regime is bear. I would not add. If you hold, S7/tape are the bosses."
        : "Bear-regime gate: I do not open a new long here.",
      why,
      invalidation,
      horizon,
      "Regime flips off bear, or you explicitly allow new longs.",
      false,
      s8,
      consensus,
      smc,
    );
  }

  // 2) Tape gãy — bảo vệ, không cãi consensus BUY.
  if (s8Signal === "EXIT" || structure === "LH_LL") {
    const disagrees = consensus.signal === "BUY" || consensus.signal === "STRONG_BUY";
    return call(
      "PROTECT",
      disagrees ? "MEDIUM" : "HIGH",
      disagrees
        ? "Tape lost structure while some brains still want the long. I do not chase their buy."
        : "Structure is LH/LL or the last swing low is gone. Protect first.",
      why,
      invalidation,
      horizon,
      "A confirmed higher low reclaims the broken swing and S1+S2 stop exiting.",
      disagrees,
      s8,
      consensus,
      smc,
    );
  }

  // 3) Consensus đang cắt mạnh — không override bằng long.
  if (consensus.signal === "EXIT" || consensus.signal === "SELL") {
    return call(
      "PROTECT",
      "MEDIUM",
      "The seven are cutting. Even if the tape is not ugly, I do not fade a 3+ exit camp with a new long.",
      why,
      invalidation,
      horizon,
      "Exit camp shrinks and S8 stays BUY on a pullback, not a bounce from nowhere.",
      s8Signal === "BUY" || s8Signal === "STRONG_BUY",
      s8,
      consensus,
      smc,
    );
  }

  // 4) Đuổi đỉnh.
  if (extended) {
    return call(
      "WAIT",
      "LOW",
      "Location is the problem. HH/HL or not, I do not buy the 20-day high.",
      why,
      invalidation,
      horizon,
      `A pullback into the 20d range (Donchian ≤ 55%) holding ${invalidation ? formatPrice(invalidation) : "the last swing"}.`,
      consensus.signal === "BUY" || consensus.signal === "STRONG_BUY",
      s8,
      consensus,
      smc,
    );
  }

  // 5) Setup tôi chịu tiền: SMC discount BUY hoặc S8 HH/HL pullback.
  const pullback = donchian != null && donchian <= 0.55;
  const s8Long = s8Signal === "BUY" || s8Signal === "STRONG_BUY";
  const brainsLong = consensus.agreement >= 3;
  const smcLong = smc?.fresh === "BUY";
  if ((smcLong || (s8Long && structure === "HH_HL" && (pullback || coiled) && effort !== "SUPPLY")) && smc?.fresh !== "SKIP") {
    const scale = smcLong || pullback || coiled;
    const highConviction = Boolean(smcLong && brainsLong && consensus.conflict === "NONE" && smc?.pd === "DISCOUNT");
    const stance = scale ? "SCALE_IN" : "LEAN_LONG";
    const headline = smcLong
      ? smc?.nearLow || smc?.pd === "DISCOUNT"
        ? "Major discount / held low on the wide map — I would scale a long here, stop under the last significant low."
        : "SMC discount POI in bullish structure — I would scale a long here, stop under the POI."
      : scale
        ? "I would scale a swing here — pullback/coil in HH/HL, not a full-size chase."
        : "I lean long, size small, stop under the last confirmed swing.";
    return call(
      stance,
      highConviction ? "HIGH" : brainsLong || smcLong ? "MEDIUM" : "LOW",
      headline,
      why,
      invalidation,
      horizon,
      `Daily close below ${invalidation ? formatPrice(invalidation) : "the POI / last swing"}, or SMC prints CHoCH down.`,
      consensus.signal === "REDUCE",
      s8,
      consensus,
      smc,
    );
  }

  // 6) Default: chờ.
  const disagrees = s8Long && (consensus.signal === "NO_SIGNAL" || consensus.signal === "WATCH");
  return call(
    "WAIT",
    "LOW",
    s8Long
      ? "Tape is constructive but I still want a cleaner pullback or more agreement. Waiting is a position."
      : "No edge I would spend risk on today. Flat is allowed.",
    why.length ? why : ["No HH/HL pullback, no coil, no 4-brain agreement."],
    invalidation,
    horizon,
    "HH/HL pullback with Donchian ≤ 55% and at least 3 of 7 not selling.",
    disagrees,
    s8,
    consensus,
    smc,
  );
}

function call(
  stance: GrokCall["stance"],
  conviction: GrokCall["conviction"],
  headline: string,
  why: string[],
  invalidation: number | null,
  horizon: string,
  changeMind: string,
  disagreesWithConsensus: boolean,
  s8: StrategyResult | undefined,
  _consensus: ConsensusResult,
  smc?: SmcSummary | null,
): GrokCall {
  const longStance = stance === "LEAN_LONG" || stance === "SCALE_IN";
  const smcTicket = longish(smc?.entryHigh ?? smc?.entryLow ?? null, smc?.sl ?? null, smc?.tp1 ?? null);
  const s8Ticket = longish(s8?.entry ?? null, s8?.sl ?? null, s8?.tp1 ?? null);
  return {
    stance,
    conviction,
    headline,
    why: why.slice(0, 6),
    invalidation,
    horizon,
    changeMind,
    disagreesWithConsensus,
    // Bear/WAIT không đảo thành short: không trả entry/SL trên giá, TP dưới giá.
    entry: longStance ? (smcTicket ? smc!.entryHigh : s8Ticket ? s8!.entry : null) : null,
    sl: longStance ? (smcTicket ? smc!.sl : s8Ticket ? s8!.sl : null) : null,
    tp1: longStance ? (smcTicket ? smc!.tp1 : s8Ticket ? s8!.tp1 : null) : null,
  };
}

function longish(entry: number | null, sl: number | null, tp: number | null): boolean {
  return entry != null && sl != null && tp != null && sl < entry && entry < tp;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function grokStanceLabel(stance: GrokCall["stance"]): string {
  switch (stance) {
    case "LEAN_LONG":
      return "LEAN LONG";
    case "SCALE_IN":
      return "SCALE IN";
    case "PROTECT":
      return "PROTECT";
    case "NO_TRADE":
      return "NO TRADE";
    default:
      return "WAIT";
  }
}

export function grokStanceCompact(stance: GrokCall["stance"]): string {
  switch (stance) {
    case "LEAN_LONG":
      return "LEAN";
    case "SCALE_IN":
      return "SCALE";
    case "PROTECT":
      return "CUT";
    case "NO_TRADE":
      return "FLAT";
    default:
      return "WAIT";
  }
}

export function grokStanceClass(stance: GrokCall["stance"]): string {
  if (stance === "LEAN_LONG" || stance === "SCALE_IN") return "bg-up-dim text-up";
  if (stance === "PROTECT") return "bg-down-dim text-down";
  if (stance === "NO_TRADE") return "bg-surface-2 text-muted";
  return "bg-warn-dim text-warn";
}

export function grokLongs(rows: { grokCall?: GrokCall | null; status: string }[]): number {
  return rows.filter((r) => r.status === "OK" && (r.grokCall?.stance === "LEAN_LONG" || r.grokCall?.stance === "SCALE_IN")).length;
}
