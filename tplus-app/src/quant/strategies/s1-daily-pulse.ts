import type { StrategyContext } from "../context";
import { blankResult, rrFrom, type Strategy } from "./contract";
import { clamp } from "../math";

/**
 * S1 Daily Pulse — production scanner (Tool_CK_Claude_ChatGPT_v3_ProductionDailyScanner).
 * Điểm hand-built là lớp xếp hạng/rủi ro, KHÔNG phải xác suất đã calibrate.
 */
export const dailyPulse: Strategy = {
  meta: {
    id: "daily-pulse",
    shortId: "S1",
    name: "Daily Pulse",
    sourceNotebook: "Tool_CK_Claude_ChatGPT_v3_ProductionDailyScanner.ipynb",
    sourceSection:
      "Phase 13.2–13.6 causal features + score_stock_snapshot + classify_signal",
    philosophy:
      "Interpretable trend / flow / structure / relative-strength ranking with exit-risk veto and a bear-market gate.",
    indicators: [
      "MA20/50/200",
      "RSI",
      "MACD",
      "ADX",
      "CMF",
      "MFI",
      "OBV",
      "20D structure",
      "RS vs VNINDEX",
    ],
    filters: [
      "min history 250",
      "min price 5,000₫",
      "min 20D value 500M₫",
      "exit risk dominates new buys",
    ],
  },
  run(ctx: StrategyContext) {
    const { snap, cfg, regime } = ctx;
    const clip = (x: number) => clamp(x, 0, 100);

    let trend = 0;
    trend += snap.aboveMa20 ? 20 : 0;
    trend += snap.aboveMa50 ? 20 : 0;
    trend += snap.aboveMa200 ? 20 : 0;
    trend += (snap.ma20Slope ?? 0) > 0 ? 15 : 0;
    trend += (snap.ma50Slope ?? 0) > 0 ? 15 : 0;
    trend += (snap.adx14 ?? 0) >= 20 ? 10 : 0;
    trend = clip(trend);

    let momentum = 50;
    momentum += (snap.ret20d ?? 0) > 0 ? 15 : -15;
    momentum += (snap.ret60d ?? 0) > 0 ? 15 : -15;
    const rsi = snap.rsi14 ?? 50;
    if (rsi >= 50 && rsi <= 70) momentum += 15;
    else if (rsi > 75) momentum -= 10;
    else if (rsi < 40) momentum -= 10;
    momentum += (snap.macdHist ?? 0) > 0 ? 10 : -10;
    momentum = clip(momentum);

    let flow = 50;
    const vr = snap.volumeRatio ?? 1;
    if (vr >= 1.5) flow += 15;
    else if (vr >= 1.1) flow += 8;
    else if (vr < 0.7) flow -= 8;
    const cmf = snap.cmf20 ?? 0;
    if (cmf > 0.1) flow += 20;
    else if (cmf > 0) flow += 10;
    else flow -= 15;
    flow += (snap.mfi14 ?? 50) >= 50 ? 10 : -10;
    flow += snap.obvSignal === 1 ? 10 : -10;
    flow = clip(flow);

    let structure = 50;
    let setup = "NONE";
    if (snap.breakout20) {
      structure += 35;
      setup = "BREAKOUT";
    } else if (
      snap.aboveMa20 &&
      snap.aboveMa50 &&
      (snap.ret5d ?? 0) < 0 &&
      (snap.ret20d ?? 0) > 0
    ) {
      structure += 20;
      setup = "PULLBACK_IN_UPTREND";
    } else if (snap.aboveMa50 && (snap.ret20d ?? 0) > 0) {
      structure += 10;
      setup = "UPTREND_CONTINUATION";
    }
    if ((snap.distanceResistance ?? 1) < 0.03) structure += 5;
    if (snap.breakdown20) {
      structure -= 40;
      setup = "BREAKDOWN";
    }
    structure = clip(structure);

    let rs = 50;
    const rel = snap.relativeStrength60d;
    if (rel != null) {
      if (rel > 0.1) rs += 35;
      else if (rel > 0.03) rs += 20;
      else if (rel < -0.1) rs -= 35;
      else if (rel < -0.03) rs -= 20;
    }
    rs = clip(rs);

    const alpha = clip(
      0.25 * trend +
        0.2 * momentum +
        0.25 * flow +
        0.15 * structure +
        0.15 * rs,
    );

    let exitRisk = 0;
    const exitReasons: string[] = [];
    if (!snap.aboveMa20) {
      exitRisk += 15;
      exitReasons.push("price below MA20");
    }
    if (!snap.aboveMa50) {
      exitRisk += 25;
      exitReasons.push("price below MA50");
    }
    if ((snap.ma20Slope ?? 0) < 0) {
      exitRisk += 10;
      exitReasons.push("MA20 slope negative");
    }
    if ((snap.macdHist ?? 0) < 0) {
      exitRisk += 10;
      exitReasons.push("MACD histogram negative");
    }
    if (cmf < -0.05) {
      exitRisk += 20;
      exitReasons.push("money flow distribution");
    }
    if (vr >= 1.5 && (snap.ret1d ?? 0) < 0) {
      exitRisk += 10;
      exitReasons.push("high-volume down day");
    }
    if (snap.breakdown20) {
      exitRisk += 30;
      exitReasons.push("20D support breakdown");
    }
    if ((snap.ret20d ?? 0) > 0 && cmf < 0 && snap.obvSignal === 0) {
      exitRisk += 15;
      exitReasons.push("price-flow divergence");
    }
    exitRisk = clip(exitRisk);

    let signal = this.meta ? "NO_SIGNAL" : "NO_SIGNAL";
    if (exitRisk >= cfg.exitRiskThreshold) signal = "EXIT";
    else if (exitRisk >= cfg.reduceRiskThreshold && alpha < cfg.watchScore)
      signal = "REDUCE";
    else if (
      (regime === "BEAR" || regime === "STRONG_BEAR") &&
      !cfg.allowNewLongInBear &&
      alpha >= cfg.watchScore
    )
      signal = "WATCH";
    else if (alpha >= cfg.strongBuyScore) signal = "STRONG_BUY";
    else if (alpha >= cfg.buyScore) signal = "BUY";
    else if (alpha >= cfg.watchScore) signal = "WATCH";
    else signal = "NO_SIGNAL";

    const atrPct = snap.atrPct ?? 0.05;
    const slPct = clamp(1.5 * atrPct, 0.03, 0.12);
    const tpPct = clamp(2 * slPct, 0.06, 0.25);
    const entry = snap.close;
    const sl = entry * (1 - slPct);
    const tp1 = entry * (1 + tpPct);

    const reasons: string[] = [];
    if (trend >= 70) reasons.push("trend strong");
    if (flow >= 70) reasons.push("money flow supportive");
    if (structure >= 70) reasons.push(`setup ${setup}`);
    if (rs >= 70) reasons.push("relative strength strong");
    if (vr >= 1.5) reasons.push(`volume ${vr.toFixed(1)}x average`);

    const warnings: string[] = [];
    if (exitRisk >= cfg.reduceRiskThreshold)
      warnings.push(exitReasons.join("; "));
    if (rsi > 75) warnings.push("RSI overbought");

    return blankResult(this.meta, {
      signal: signal as never,
      score: alpha,
      reasons,
      warnings,
      checks: [
        { ok: trend >= 60, text: `Trend ${trend.toFixed(0)}` },
        { ok: momentum >= 55, text: `Momentum ${momentum.toFixed(0)}` },
        { ok: flow >= 55, text: `Flow ${flow.toFixed(0)}` },
        { ok: structure >= 55, text: `Structure ${setup}` },
        { ok: rs >= 50, text: `RS ${rs.toFixed(0)}` },
        {
          ok: exitRisk < cfg.reduceRiskThreshold,
          text: `Exit risk ${exitRisk.toFixed(0)}`,
        },
      ],
      entry,
      sl,
      tp1,
      tp2: entry * (1 + tpPct * 1.6),
      rr: rrFrom(entry, sl, tp1),
      extras: { setup, exitRisk, trend, momentum, flow, structure, rs },
    });
  },
};
