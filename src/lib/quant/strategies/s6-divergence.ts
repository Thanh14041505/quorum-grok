import { blankResult, rrFrom, type Strategy } from "./contract";

/**
 * S6 RSI Composite Divergence — Claude v1.1 / Grok ChatGPT v3.
 * Pivot phải xác nhận sau lbR=5 phiên. Win-rate ~75% là tuyên bố, không phải xác suất đã đo.
 */
export const rsiDivergence: Strategy = {
  meta: {
    id: "rsi-divergence",
    shortId: "S6",
    name: "RSI Composite",
    sourceNotebook: "Tool_CK_Claude_v1_1.ipynb + Tool_CK_Grok_ChatGPT_v3_RSI_Divergence_DaoGam.ipynb",
    sourceSection: "CompositeDivergenceEngine (Constance Brown Composite Index)",
    philosophy:
      "Regular bullish divergence = reversal candidate. Hidden bullish = continuation on pullback. Unconfirmed pivots are ignored to avoid look-ahead.",
    indicators: ["RSI 14", "RSI momentum 9", "fast RSI 3", "Composite Index", "fractal pivots lbL/lbR=5"],
    filters: ["pivot confirmation delay 5 bars", "max age 15 bars", "range 5–60 bars between pivots"],
  },
  run(ctx) {
    const { divergence, snap, ichi, cfg } = ctx;
    const close = snap.close;
    const atr = snap.atr14 ?? close * 0.03;
    const entry = close;
    const sl = Math.min(snap.support20 ?? close - 2 * atr, close - 1.8 * atr);
    const tp1 = Math.max(entry * (1 + cfg.minTpPct / 100), entry + 2.2 * (entry - sl));

    const reasons = [divergence.label];
    const warnings: string[] = [];
    if (divergence.kind !== "none") reasons.push(`Age ${divergence.age} bars after confirm`);

    let signal: "BUY" | "STRONG_BUY" | "WATCH" | "EXIT" | "NO_SIGNAL" = "NO_SIGNAL";
    if (divergence.kind === "bull_reg" && divergence.confirmed) {
      signal = ichi.d.aboveCloud || snap.aboveMa50 ? "STRONG_BUY" : "BUY";
      reasons.push("Regular bullish — reversal attempt");
    } else if (divergence.kind === "bull_hid" && divergence.confirmed) {
      signal = snap.trendLong === "uptrend" || snap.trendLong === "weak_up" ? "BUY" : "WATCH";
      reasons.push("Hidden bullish — continuation if trend intact");
    } else if (divergence.kind === "bear_reg") {
      signal = "EXIT";
      warnings.push("Regular bearish divergence — distribution / reversal risk");
    } else if (divergence.kind === "bear_hid") {
      signal = "WATCH";
      warnings.push("Hidden bearish — do not catch falling knives");
    } else {
      signal = "NO_SIGNAL";
    }

    const score =
      divergence.kind === "none"
        ? 45
        : divergence.kind.startsWith("bull")
          ? 60 + divergence.strength * 3
          : 35 - divergence.strength * 2;

    return blankResult(this.meta, {
      signal,
      score: Math.max(0, Math.min(100, score)),
      reasons,
      warnings,
      checks: [
        { ok: divergence.confirmed && divergence.kind !== "none", text: divergence.confirmed ? "Pivot confirmed" : "No confirmed pivot" },
        { ok: divergence.kind.startsWith("bull"), text: divergence.label },
        { ok: divergence.age > 0 && divergence.age <= 15, text: `Age ${divergence.age}` },
        { ok: snap.aboveMa50 || divergence.kind === "bull_reg", text: "Context not a naked catch" },
      ],
      entry, sl, tp1, tp2: entry + 3.4 * (entry - sl),
      rr: rrFrom(entry, sl, tp1),
      extras: {
        kind: divergence.kind,
        age: divergence.age,
        strength: divergence.strength,
      },
    });
  },
};
