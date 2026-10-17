import { blankResult, rrFrom, type Strategy } from "./contract";

/**
 * S4 Volume Profile + Smart Entry — Grok v2 SignalBuilder.
 * POC/VAH/VAL định vị entry; R:R swing tối thiểu 2.0; T1 ≥ 9%.
 */
export const volumeProfileStrategy: Strategy = {
  meta: {
    id: "volume-profile",
    shortId: "S4",
    name: "Volume Profile",
    sourceNotebook: "Tool_CK_Grok_v2.ipynb",
    sourceSection: "IndicatorEngine VP + SignalBuilder.smart_entry / levels",
    philosophy:
      "Trade location, not prediction. Prefer POC/VAH retests over chasing breakouts. Require 2:1 R:R and a 9% first target.",
    indicators: ["POC", "VAH", "VAL", "EMA20", "ATR", "volume dry-up"],
    filters: ["min R:R 2.0", "min T1 9%", "avoid buying extended above VAH without retest"],
  },
  run(ctx) {
    const { snap, vp, dryup, cfg } = ctx;
    const close = snap.close;
    const atr = snap.atr14 ?? close * 0.025;
    let entry = close;
    let zone = "Market";
    const near = (lvl: number, pct = 0.012) => Math.abs(close - lvl) / close <= pct;

    if (near(vp.poc)) {
      entry = vp.poc;
      zone = "At POC";
    } else if (vp.position === "breakout" && near(vp.vah, 0.02)) {
      entry = vp.vah;
      zone = "VAH retest (avoid buying the high)";
    } else if (vp.position === "below_value" && near(vp.val, 0.02) && snap.aboveMa50) {
      entry = vp.val;
      zone = "VAL bounce in higher timeframe uptrend";
    } else if (snap.ema20 && close > snap.ema20 && (close - snap.ema20) / close < 0.02) {
      entry = snap.ema20;
      zone = "EMA20 support test";
    } else {
      entry = close - atr * 0.45;
      zone = "ATR dip";
    }

    const sl = Math.min(vp.val * 0.995, entry - 1.8 * atr, snap.support20 ?? entry - 2 * atr);
    const risk = Math.max(entry - sl, entry * 0.02);
    let tp1 = Math.max(entry * (1 + cfg.minTpPct / 100), entry + risk * 2);
    if (vp.vah > entry) tp1 = Math.max(tp1, vp.vah);
    const tp2 = entry + risk * 3.2;
    const rr = rrFrom(entry, sl, tp1);

    let locScore = 50;
    if (vp.position === "at_poc") locScore = 62;
    if (vp.position === "value_area") locScore = 68;
    if (vp.position === "breakout" && zone.includes("retest")) locScore = 78;
    if (vp.position === "breakout" && zone === "Market") locScore = 48;
    if (vp.position === "below_value") locScore = 35;
    if (dryup.dryup) locScore += 8;

    const reasons = [`VP ${vp.position}`, zone];
    if (dryup.dryup) reasons.push("Volume dry-up (compression before expansion)");
    const warnings: string[] = [];
    if (rr != null && rr < cfg.minRrSwing) warnings.push(`R:R ${rr.toFixed(2)} below ${cfg.minRrSwing}`);
    if (vp.position === "breakout" && (snap.volumeRatio ?? 1) < 1.1) {
      warnings.push("Breakout without volume confirmation");
    }

    let signal: "BUY" | "WATCH" | "NO_SIGNAL" | "EXIT" = "NO_SIGNAL";
    if (vp.position === "below_value" && !snap.aboveMa50) signal = "EXIT";
    else if (
      (vp.position === "at_poc" || vp.position === "value_area" || zone.includes("retest") || zone.includes("VAL")) &&
      (rr ?? 0) >= cfg.minRrSwing &&
      snap.aboveMa50
    ) {
      signal = "BUY";
    } else if (vp.position !== "below_value") {
      signal = "WATCH";
    }

    return blankResult(this.meta, {
      signal,
      score: locScore,
      reasons,
      warnings,
      checks: [
        { ok: vp.position !== "below_value", text: `Location ${vp.position}` },
        { ok: (rr ?? 0) >= cfg.minRrSwing, text: `R:R ${rr ? rr.toFixed(2) : "N/A"}` },
        { ok: snap.aboveMa50, text: "Above MA50" },
        { ok: dryup.dryup, text: dryup.dryup ? "Dry-up present" : "No dry-up" },
        { ok: !warnings.some((w) => w.includes("without volume")), text: "Volume confirms location" },
      ],
      entry, sl, tp1, tp2, rr,
      extras: { poc: vp.poc, vah: vp.vah, val: vp.val, zone },
    });
  },
};
