import { blankResult, rrFrom, type Strategy } from "./contract";

/**
 * S7 Dao Găm + Holder — PR016 enhanced / Claude v1.1 HolderAdvisor.
 * Tín hiệu cho người ĐANG GIỮ, không phải người đang tìm entry mới.
 */
export const daoGamHolder: Strategy = {
  meta: {
    id: "dao-gam-holder",
    shortId: "S7",
    name: "Dao Gam Holder",
    sourceNotebook: "Tool_CK_Grok_v2_PR016_enhanced_v2.ipynb + Tool_CK_Claude_v1_1.ipynb",
    sourceSection: "ItpTouchAnalyzer + MAContextEngine + HolderAdvisor + Dao Găm MA65/129",
    philosophy:
      "A 'dao găm' is a FLAT Kijun or Senkou B (equilibrium), not any MA. Existing-position logic: cut when MA50 + downtrend/CMF fail; add only on successful support tests with positive VSA.",
    indicators: ["Kijun/SSB flat D/W/M", "MA9/10", "MA50/200", "MA65/129", "CMF", "VSA"],
    filters: ["flat-line tolerance ~1.5%", "cut requires corroboration (not a single MA nick)"],
  },
  run(ctx) {
    const { snap, ichi, vsa, features } = ctx;
    const close = snap.close;
    const i = features.n - 1;
    const ma65 = i >= 64 ? avg(features.close, i, 65) : null;
    const ma129 = i >= 128 ? avg(features.close, i, 129) : null;

    const shortBroken = Boolean(snap.ma9 && snap.ma10 && close < snap.ma9 && close < snap.ma10);
    const belowMa50Hard = Boolean(snap.ma50 && close < snap.ma50 * 0.985);
    const vsaPos = vsa === "VOL_SURGE" || vsa === "SPRING" || vsa === "DRY_VOLUME";
    const vsaNeg = vsa === "DISTRIBUTION";
    const cmf = snap.cmf20 ?? 0;

    const touchTol = 0.015;
    const touch = (lvl: number | null) =>
      lvl != null && Math.abs(close - lvl) / close <= touchTol;
    const d1Touch = touch(ichi.d.kijunFlat) || touch(ichi.d.ssbFlat);
    const wmTouch = touch(ichi.w.kijunFlat) || touch(ichi.w.ssbFlat) || touch(ichi.m.kijunFlat);
    const maTouch = touch(snap.ma50) || touch(snap.ma200) || touch(ma65) || touch(ma129);
    const touchingSupport = d1Touch || wmTouch || maTouch;

    const reasons: string[] = [];
    const warnings: string[] = [];
    if (ichi.d.kijunFlat) reasons.push("Daily Kijun is flat (dao gam)");
    if (ichi.d.khachSan) reasons.push("Daily hotel (Kijun ≈ SSB flat)");
    if (wmTouch) reasons.push("Higher-timeframe dao gam in play");
    if (shortBroken) warnings.push("Lost MA9 and MA10 — short trend broken");

    let signal: "ADD" | "HOLD" | "REDUCE" | "EXIT" | "WATCH" = "WATCH";
    let score = 50;
    let reasonText = "No clear holder signal; watch MA9/10 and money flow.";

    if ((snap.trendLong === "downtrend" && (belowMa50Hard || cmf < -0.15)) || (belowMa50Hard && vsaNeg)) {
      signal = "EXIT";
      score = 18;
      reasonText = [
        snap.trendLong === "downtrend" ? "Long-term trend rolled over" : "",
        belowMa50Hard ? "Broke MA50 (lost medium-term shelf)" : "",
        cmf < -0.15 ? `Heavy outflow CMF=${cmf.toFixed(3)}` : "",
        vsaNeg ? "VSA distribution" : "",
      ]
        .filter(Boolean)
        .join("; ");
      warnings.push(reasonText);
    } else if (shortBroken && (snap.trendLong === "uptrend" || snap.trendLong === "weak_up") && (snap.volumeRatio ?? 1) > 1.2) {
      signal = "REDUCE";
      score = 38;
      reasonText = "Lost MA9/10 on rising volume while higher trend intact — lock a tranche, trail the rest at MA50.";
    } else if ((snap.trendLong === "uptrend" || snap.trendLong === "weak_up") && vsaPos && touchingSupport) {
      signal = "ADD";
      score = 82;
      reasonText = "Uptrend intact, VSA constructive, testing a real shelf — stop can sit just under the level.";
      reasons.push(reasonText);
    } else if (snap.trendLong === "uptrend" && !shortBroken) {
      signal = "HOLD";
      score = 74;
      reasonText = "Long and short trend still agree. No sell trigger.";
      reasons.push(reasonText);
    } else {
      reasons.push(reasonText);
    }

    const support = ichi.d.kijunFlat ?? ichi.d.ssbFlat ?? snap.ma50 ?? close * 0.94;
    const entry = touchingSupport ? close : support;
    const sl = support * 0.985;
    const tp1 = close * 1.09;

    return blankResult(this.meta, {
      signal,
      score,
      reasons: reasons.length ? reasons : [reasonText],
      warnings,
      checks: [
        { ok: !belowMa50Hard, text: belowMa50Hard ? "Below MA50" : "MA50 shelf holds" },
        { ok: !shortBroken, text: shortBroken ? "MA9/10 lost" : "Short MAs intact" },
        { ok: touchingSupport, text: touchingSupport ? "Touching dao gam / MA shelf" : "Not at a dao gam" },
        { ok: vsaPos, text: `VSA ${vsa}` },
        { ok: snap.trendLong === "uptrend", text: `Trend ${snap.trendLong}` },
      ],
      entry, sl, tp1, tp2: close * 1.16,
      rr: rrFrom(entry, sl, tp1),
      extras: {
        holder: signal,
        reason: reasonText,
        d1KijunFlat: ichi.d.kijunFlat,
        d1SsbFlat: ichi.d.ssbFlat,
        ma65, ma129,
        shortBroken,
      },
    });
  },
};

function avg(arr: number[], i: number, n: number): number {
  let s = 0;
  for (let k = i - n + 1; k <= i; k++) s += arr[k]!;
  return s / n;
}
