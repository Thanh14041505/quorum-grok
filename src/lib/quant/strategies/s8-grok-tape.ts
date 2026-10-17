import { readTape } from "../tape";
import { blankResult, rrFrom, type Strategy } from "./contract";

/**
 * S8 Grok Tape — não thứ 8, ý tưởng riêng, không nằm 7 notebook gốc.
 * Không vote vào consensus. Consensus vẫn là S1–S7.
 */
export const grokTape: Strategy = {
  meta: {
    id: "grok-tape",
    shortId: "S8",
    name: "Grok Tape",
    sourceNotebook: "Original — not from the 7 notebooks",
    sourceSection: "Confirmed swings + Donchian location + effort/result + ATR compression + RS persistence",
    philosophy:
      "Price action first. Grade structure (HH/HL vs LH/LL), location in the 20-day range, effort vs result, and whether the name is coiled or already extended. Do not chase the high. Do not invent certainty.",
    indicators: ["Confirmed swing 3/3", "Donchian 20", "ATR14/ATR60", "Close location × volume", "RS 5/20/60 vs VNINDEX", "Unfilled gap"],
    filters: ["no look-ahead pivots", "extended 20d high is a WATCH not a BUY", "supply bar vetoes new longs"],
  },
  run(ctx) {
    const { features, snap, benchSnap, cfg } = ctx;
    const close = snap.close;
    const tape = readTape(
      features.high,
      features.low,
      features.close,
      features.open,
      features.volume,
      features.atr14,
      features.volMa20,
      { d5: snap.ret5d, d20: snap.ret20d, d60: snap.ret60d },
      { d5: benchSnap?.ret5d ?? null, d20: benchSnap?.ret20d ?? null, d60: benchSnap?.ret60d ?? null },
    );

    const swingLow = tape.lastLow?.price ?? tape.low20 ?? close * 0.94;
    const swingHigh = tape.lastHigh?.price ?? tape.high20 ?? close * 1.06;
    const brokeSwing = Boolean(tape.lastLow && close < tape.lastLow.price * 0.997);
    const pullback = tape.donchianPct != null && tape.donchianPct <= 0.55 && tape.donchianPct >= 0.18;
    const midRange = tape.donchianPct != null && tape.donchianPct > 0.35 && tape.donchianPct < 0.82;

    const reasons: string[] = [];
    const warnings: string[] = [];
    reasons.push(`Structure ${tape.structure.replaceAll("_", "/")}`);
    if (tape.donchianPct != null) reasons.push(`20d location ${(tape.donchianPct * 100).toFixed(0)}%`);
    if (tape.coiled) reasons.push("ATR coiled vs 60d");
    if (tape.rsAligned) reasons.push("RS 5/20/60 vs VNINDEX all green");
    if (tape.effort === "DEMAND") reasons.push("Demand bar (close high + volume)");
    if (tape.effort === "SUPPLY") warnings.push("Supply bar (close low + volume)");
    if (tape.extended) warnings.push("Extended into the 20d high — do not chase");
    if (brokeSwing) warnings.push("Closed through last confirmed swing low");

    let signal: "STRONG_BUY" | "BUY" | "WATCH" | "EXIT" | "NO_SIGNAL" = "NO_SIGNAL";
    let score = 48;

    if (tape.structure === "LH_LL" || brokeSwing) {
      signal = "EXIT";
      score = 18;
      reasons.push(
        brokeSwing && tape.structure !== "LH_LL"
          ? "Close through last confirmed swing low — treat as broken even if older pivots were HH/HL"
          : "Structure is LH/LL — tape is defending lower highs",
      );
    } else if (tape.effort === "SUPPLY" && (tape.structure !== "HH_HL" || (snap.aboveMa20 === false))) {
      signal = "EXIT";
      score = 28;
    } else if (tape.extended) {
      signal = "WATCH";
      score = 58;
    } else if (
      tape.structure === "HH_HL" &&
      tape.effort === "DEMAND" &&
      tape.rsAligned &&
      tape.coiled &&
      midRange
    ) {
      signal = "STRONG_BUY";
      score = 86;
      reasons.push("Coiled HH/HL with demand — expansion candidate");
    } else if (tape.structure === "HH_HL" && (pullback || tape.coiled) && tape.effort !== "SUPPLY") {
      signal = "BUY";
      score = 74;
      reasons.push(pullback ? "HH/HL pullback in the lower half of 20d range" : "HH/HL coiled");
    } else if (tape.structure === "HH_HL" && midRange) {
      signal = "WATCH";
      score = 62;
    } else if (tape.structure === "MIXED") {
      signal = "WATCH";
      score = 50;
    }

    // Entry: không mua đuổi — ưu tiên mép swing / nửa dưới Donchian.
    let entry = close;
    let zone = "Market";
    if (signal === "BUY" || signal === "STRONG_BUY") {
      if (pullback) {
        entry = close;
        zone = "Pullback in 20d range";
      } else if (tape.lastLow && close > tape.lastLow.price) {
        entry = Math.max(tape.lastLow.price, close * 0.985);
        zone = "Toward last swing low";
      }
    }
    const sl = Math.min(swingLow * 0.995, entry * 0.97);
    const risk = Math.max(entry - sl, entry * 0.02);
    let tp1 = Math.max(entry * (1 + cfg.minTpPct / 100), entry + risk * 2);
    if (tape.high20 && tape.high20 > entry) tp1 = Math.max(tp1, tape.high20);
    const tp2 = entry + risk * 3.2;
    const rr = rrFrom(entry, sl, tp1);
    if ((signal === "BUY" || signal === "STRONG_BUY") && rr != null && rr < cfg.minRrSwing) {
      warnings.push(`R:R ${rr.toFixed(2)} under min ${cfg.minRrSwing} — tape is BUY but location is tight`);
      signal = "WATCH";
      score = Math.min(score, 60);
    }

    return blankResult(this.meta, {
      signal,
      score,
      reasons,
      warnings,
      checks: [
        { ok: tape.structure === "HH_HL", text: `Structure ${tape.structure.replaceAll("_", "/")}` },
        { ok: !brokeSwing, text: brokeSwing ? "Lost last swing low" : "Swing low intact" },
        { ok: !tape.extended, text: tape.extended ? "Extended" : "Not chasing the 20d high" },
        { ok: tape.effort !== "SUPPLY", text: `Effort ${tape.effort}` },
        { ok: tape.rsAligned, text: tape.rsAligned ? "RS persistent vs index" : "RS not aligned" },
        { ok: tape.coiled, text: tape.coiled ? "Coiled" : `ATR ratio ${tape.atrRatio?.toFixed(2) ?? "N/A"}` },
      ],
      entry,
      sl,
      tp1,
      tp2,
      rr,
      extras: {
        zone,
        structure: tape.structure,
        donchianPct: tape.donchianPct,
        coiled: tape.coiled,
        effort: tape.effort,
        rsAligned: tape.rsAligned,
        extended: tape.extended,
        swingLow,
        confirmedSwingLow: tape.lastLow?.price ?? null,
        swingHigh,
        high20: tape.high20,
        low20: tape.low20,
        gapPct: tape.gapPct,
        gapUnfilled: tape.gapUnfilled,
      },
    });
  },
};
