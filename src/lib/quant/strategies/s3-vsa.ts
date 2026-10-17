import { vsaScore, vsaText } from "../smart-money";
import { blankResult, rrFrom, type Strategy } from "./contract";

/**
 * S3 VSA Smart Money — Grok v2 VSAEngine.
 * Phân biệt mua thật vs xả hàng bằng Volume × Spread × Close Position.
 */
export const vsaSmartMoney: Strategy = {
  meta: {
    id: "vsa-smart-money",
    shortId: "S3",
    name: "VSA Smart Money",
    sourceNotebook: "Tool_CK_Grok_v2.ipynb",
    sourceSection: "VSAEngine.detect + to_score + hard filters in SignalBuilder",
    philosophy:
      "Read smart-money footprints: surge, spring, dry-up, distribution, no-demand. Distribution in a swing setup is a hard veto.",
    indicators: ["volume ratio", "spread ratio", "close position", "1-day ROC"],
    filters: ["DISTRIBUTION blocks new longs", "breakout + NO_DEMAND = bull trap"],
  },
  run(ctx) {
    const { vsa, snap, dryup, vp } = ctx;
    const score = vsaScore(vsa) * 10;
    const close = snap.close;
    const atr = snap.atr14 ?? close * 0.03;
    const entry = Math.min(close, (vp.poc + close) / 2);
    const sl = Math.min(vp.val, entry - 1.6 * atr);
    const tp1 = entry + 2.2 * (entry - sl);

    const reasons = [vsaText(vsa)];
    const warnings: string[] = [];
    if (dryup.dryup) reasons.push(`Wyckoff dry-up ${dryup.bars} sessions`);
    if (vp.position === "breakout") reasons.push("Price above value area");
    if (vp.position === "below_value") warnings.push("Below value area");

    let signal: "STRONG_BUY" | "BUY" | "WATCH" | "EXIT" | "NO_SIGNAL" = "NO_SIGNAL";
    if (vsa === "DISTRIBUTION") {
      signal = "EXIT";
      warnings.push("Hard filter: distribution — smart money selling into strength");
    } else if (snap.breakout20 && vsa === "NO_DEMAND") {
      signal = "NO_SIGNAL";
      warnings.push("Hard filter: breakout without demand (bull trap)");
    } else if (vsa === "VOL_SURGE" && (snap.ret1d ?? 0) > 0) {
      signal = "STRONG_BUY";
    } else if (vsa === "SPRING" || (vsa === "DRY_VOLUME" && dryup.dryup && snap.aboveMa50)) {
      signal = "BUY";
    } else if (vsa === "DRY_VOLUME") {
      signal = "WATCH";
    } else if (vsa === "NO_DEMAND") {
      signal = "WATCH";
      warnings.push("Price up on no demand");
    }

    return blankResult(this.meta, {
      signal,
      score,
      reasons,
      warnings,
      checks: [
        { ok: vsa === "VOL_SURGE" || vsa === "SPRING", text: `VSA ${vsaText(vsa)}` },
        { ok: (snap.volumeRatio ?? 1) >= 1.1, text: `Vol ${(snap.volumeRatio ?? 1).toFixed(2)}x` },
        { ok: (snap.cmf20 ?? 0) > 0, text: `CMF ${(snap.cmf20 ?? 0).toFixed(3)}` },
        { ok: vsa !== "DISTRIBUTION", text: "Not distributing" },
        { ok: !(snap.breakout20 && vsa === "NO_DEMAND"), text: "Breakout has demand" },
      ],
      entry, sl, tp1, tp2: entry + 3.2 * (entry - sl),
      rr: rrFrom(entry, sl, tp1),
      extras: { vsa, dryup: dryup.dryup, vp: vp.position },
    });
  },
};
