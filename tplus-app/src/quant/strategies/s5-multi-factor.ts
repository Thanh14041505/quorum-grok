import {
  BASE_WEIGHTS,
  REGIME_SCORE_MULT,
  REGIME_WEIGHT_DELTA,
  regimeBucket,
} from "../config";
import { vsaScore } from "../smart-money";
import { clamp } from "../math";
import { blankResult, rrFrom, type Strategy } from "./contract";

/**
 * S5 Multi-Factor Score — PR016 ScoringEngine (0–10, regime-weighted).
 * Giữ piecewise volume/CMF/RSI swing vs hold; không gộp thành magic 87/100.
 */
export const multiFactor: Strategy = {
  meta: {
    id: "multi-factor",
    shortId: "S5",
    name: "Multi-Factor",
    sourceNotebook: "Tool_CK_Grok_v2_PR016.ipynb",
    sourceSection: "ScoringEngine.score + BASE_WEIGHTS + REGIME_WEIGHT_DELTA",
    philosophy:
      "Weighted 0–10 subscores (volume, CMF, OBV, RSI, EMA, Stoch, MACD, VP, trend, RS, VSA, Ichimoku) scaled by regime. Swing RSI prefers 28–45, not overbought chase.",
    indicators: [
      "volume",
      "CMF",
      "OBV",
      "RSI",
      "EMA%",
      "Stoch",
      "MACD",
      "VP",
      "trend",
      "Ichimoku",
      "VSA",
    ],
    filters: ["min score 5.0 / 10 (swing)", "regime multiplier 0.70–1.00"],
  },
  run(ctx) {
    const { snap, ichi, vsa, vp, dryup, regime, cfg } = ctx;
    const bucket = regimeBucket(regime);
    const weights = { ...BASE_WEIGHTS };
    const delta = REGIME_WEIGHT_DELTA[bucket] ?? {};
    for (const [k, v] of Object.entries(delta))
      weights[k] = (weights[k] ?? 0) + v;

    const s: Record<string, number> = {};
    const vol = snap.volumeRatio ?? 1;
    if (vol <= 0.8) s.volume_ratio = clamp(vol * 4, 0, 10);
    else if (vol < 1.3) s.volume_ratio = clamp(3.5 + (vol - 0.8) * 6, 0, 10);
    else if (vol < 2.2) s.volume_ratio = clamp(6 + (vol - 1.3) * 3.5, 0, 10);
    else s.volume_ratio = clamp(8.5 + (vol - 2.2) * 1.2, 0, 10);

    s.cmf = clamp(((snap.cmf20 ?? 0) + 0.25) / 0.055, 0, 10);
    s.obv = clamp(
      (snap.obvSignal === 1 ? 7.5 : 2.5) + clamp(snap.obvSlope / 9, -2.8, 2.8),
      0,
      10,
    );
    s.force = clamp(((snap.forceIndex ?? 0) + 1) * 4.8, 0, 10);
    s.inst_flow = 5;
    s.vsa = vsaScore(vsa);

    const rsi = snap.rsi14 ?? 50;
    if (rsi <= 28) s.rsi = 9.5;
    else if (rsi <= 45) s.rsi = 8 + (45 - rsi) / 8.5;
    else if (rsi <= 55) s.rsi = 6.5;
    else if (rsi <= 68) s.rsi = 4;
    else if (rsi <= 78) s.rsi = 1.5;
    else s.rsi = 0.5;

    s.ema = clamp(((snap.emaPct ?? 0) + 6) / 1.1, 0, 10);
    const k = snap.stochK ?? 50;
    s.stoch = k < 22 ? 8.8 : k < 45 ? 7 : k < 75 ? 4.2 : 1.2;
    if (snap.stochCrossUp) s.stoch = Math.min(10, s.stoch + 1.8);
    s.macd = clamp(5 + (snap.macdHistPct ?? 0) * 480, 0, 10);
    if (snap.macdCrossUp) s.macd = Math.min(10, s.macd + 1.7);

    const vpMap = {
      breakout: 9.2,
      value_area: 6.8,
      at_poc: 5.5,
      below_value: 2.2,
      unknown: 4.5,
    };
    s.vp_position = vpMap[vp.position];
    const tMap = {
      uptrend: 9.5,
      weak_up: 6.8,
      sideway: 4.2,
      downtrend: 0.8,
      weak_down: 1.8,
    };
    s.trend = tMap[snap.trendLong];
    s.rs_score = clamp((snap.relativeStrength60d ?? 0) * 42 + 5, 0, 10);
    s.ichimoku = ichi.ichiScore;
    s.momentum_div = ctx.divergence.kind.startsWith("bull")
      ? 8
      : ctx.divergence.kind.startsWith("bear")
        ? 2.5
        : 5;
    s.dmi_aroon = clamp(((snap.adx14 ?? 20) / 40) * 10, 0, 10);

    const tw = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
    let weighted = 0;
    for (const [k2, w] of Object.entries(weights))
      weighted += (s[k2] ?? 4.5) * w;
    const regimeMult = REGIME_SCORE_MULT[bucket] ?? 1;
    const total = Math.min(10, (weighted / tw) * regimeMult + dryup.bonus);

    const close = snap.close;
    const atr = snap.atr14 ?? close * 0.03;
    const entry = close;
    const sl = close - 2 * atr;
    const tp1 = Math.max(
      entry * (1 + cfg.minTpPct / 100),
      entry + 2 * (entry - sl),
    );

    let signal: "STRONG_BUY" | "BUY" | "WATCH" | "NO_SIGNAL" | "EXIT" =
      "NO_SIGNAL";
    if (total >= 8 && snap.trendLong === "uptrend") signal = "STRONG_BUY";
    else if (total >= 5.0 && snap.trendLong !== "downtrend") signal = "BUY";
    else if (total >= 4.2) signal = "WATCH";
    if (snap.trendLong === "downtrend" && total < 4) signal = "EXIT";

    const top = Object.entries(s)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k3, v]) => `${k3} ${v.toFixed(1)}`);

    return blankResult(this.meta, {
      signal,
      score: total * 10,
      reasons: [
        `Weighted ${total.toFixed(2)}/10 × regime ${regimeMult}`,
        ...top,
      ],
      warnings: dryup.dryup ? [] : [],
      checks: Object.entries(s)
        .slice(0, 8)
        .map(([k3, v]) => ({
          ok: v >= 5,
          text: `${k3} ${v.toFixed(1)}`,
        })),
      entry,
      sl,
      tp1,
      tp2: entry + 3.5 * (entry - sl),
      rr: rrFrom(entry, sl, tp1),
      extras: { total, regimeMult, ...s },
    });
  },
};
