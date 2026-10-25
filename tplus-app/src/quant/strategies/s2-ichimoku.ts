import { ichimokuLevels } from "../ichimoku";
import { blankResult, rrFrom, type Strategy } from "./contract";

/**
 * S2 Ichimoku 3TF — Trịnh Phát style từ Claude v1 / PR016 IchimokuEngine.
 * Hội tụ D/W/M quan trọng hơn một tín hiệu Tenkan cắt Kijun đơn lẻ.
 */
export const ichimoku3tf: Strategy = {
  meta: {
    id: "ichimoku-3tf",
    shortId: "S2",
    name: "Ichimoku 3TF",
    sourceNotebook: "Tool_CK_Claude_v1.ipynb + Tool_CK_Grok_v2_PR016.ipynb",
    sourceSection: "IchimokuEngine D/W/M, Kijun pullback, min T1 9%",
    philosophy:
      "Multi-timeframe cloud alignment. Buy pullbacks to daily Kijun / kumo while weekly+monthly remain bullish. Skip names that cannot clear a 9% first target.",
    indicators: [
      "Tenkan 9",
      "Kijun 26",
      "Senkou B 52",
      "Kumo D/W/M",
      "Chikou implied via cloud",
    ],
    filters: [
      "below daily cloud vetoes new longs",
      "min ATR% 1.5",
      "min T1 9%",
    ],
  },
  run(ctx) {
    const { ichi, snap, cfg } = ctx;
    const close = snap.close;
    const levels = ichimokuLevels(ichi, close);
    const kijun = ichi.d.kijun;
    const cloudTop = ichi.d.cloudTop;
    const cloudBot = ichi.d.cloudBot;

    // Entry ưu tiên kéo về Kijun daily (vùng vàng) rồi mép trên kumo.
    let entry = close;
    let zone = "Market";
    if (kijun && close > kijun && (close - kijun) / close <= 0.035) {
      entry = kijun;
      zone = "Kijun daily pullback";
    } else if (
      cloudTop &&
      close > cloudTop &&
      (close - cloudTop) / close <= 0.04
    ) {
      entry = cloudTop;
      zone = "Kumo top retest";
    } else if (kijun && close > kijun) {
      entry = Math.max(kijun, close * (1 - (cfg.minAtrPct / 100) * 0.35));
      zone = "Dip toward Kijun";
    }

    const slBase =
      levels.support1 ?? cloudBot ?? (kijun ? kijun * 0.985 : close * 0.94);
    const sl = Math.min(slBase, entry * 0.97);
    const risk = entry - sl;
    let tp1 = entry + risk * 2.0;
    const minTp = entry * (1 + cfg.minTpPct / 100);
    if (tp1 < minTp) tp1 = minTp;
    const tp2 =
      levels.resist1 && levels.resist1 > tp1
        ? levels.resist1
        : entry + risk * 3.5;

    const atrOk =
      (snap.atrPct ?? 0) * 100 >= cfg.minAtrPct || (snap.atrPct ?? 0) === 0;
    const reasons: string[] = [ichi.label];
    const warnings: string[] = [];
    const checks = [
      { ok: ichi.d.aboveCloud, text: "Daily above cloud" },
      { ok: ichi.w.aboveCloud, text: "Weekly above cloud" },
      { ok: ichi.m.aboveCloud, text: "Monthly above cloud" },
      { ok: ichi.d.tenkanAboveKijun, text: "Tenkan > Kijun" },
      { ok: ichi.d.strongCloud, text: "Bullish kumo (SpanA > SpanB)" },
      { ok: !ichi.belowDaily, text: "Not below daily cloud" },
    ];

    let signal: "STRONG_BUY" | "BUY" | "WATCH" | "EXIT" | "NO_SIGNAL" =
      "NO_SIGNAL";
    if (ichi.belowDaily && ichi.w.belowCloud) {
      signal = "EXIT";
      warnings.push("Daily+weekly below cloud");
    } else if (ichi.belowDaily) {
      signal = "EXIT";
      warnings.push("Price lost the daily cloud");
    } else if (ichi.above3tf && ichi.d.tenkanAboveKijun) {
      signal = "STRONG_BUY";
      reasons.push("3TF bull alignment");
    } else if (
      ichi.d.aboveCloud &&
      ichi.w.aboveCloud &&
      ichi.d.tenkanAboveKijun
    ) {
      signal = "BUY";
    } else if (ichi.d.aboveCloud || ichi.tenkanCrossUp) {
      signal = "WATCH";
      reasons.push(
        ichi.tenkanCrossUp
          ? "Tenkan cross up, waiting for cloud confirm"
          : "Daily cloud only",
      );
    }
    if (signal === "BUY" || signal === "STRONG_BUY") {
      if (!atrOk) {
        warnings.push(
          `ATR ${(100 * (snap.atrPct ?? 0)).toFixed(1)}% below ${cfg.minAtrPct}% — range too tight`,
        );
        signal = "WATCH";
      }
    }

    return blankResult(this.meta, {
      signal,
      score: ichi.ichiScore * 10,
      reasons,
      warnings,
      checks,
      entry,
      sl,
      tp1,
      tp2,
      rr: rrFrom(entry, sl, tp1),
      extras: {
        zone,
        kijun: kijun,
        cloudTop,
        cloudBot,
        d1: ichi.d.aboveCloud,
        w1: ichi.w.aboveCloud,
        m1: ichi.m.aboveCloud,
      },
    });
  },
};
