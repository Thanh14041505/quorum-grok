import type { Candle } from "./types";
import { computeFeatures, resample } from "./indicators";
import { rollingMax, rollingMin } from "./math";

export interface IchiTf {
  tenkan: number | null;
  kijun: number | null;
  spanA: number | null;
  spanB: number | null;
  cloudTop: number | null;
  cloudBot: number | null;
  aboveCloud: boolean;
  belowCloud: boolean;
  tenkanAboveKijun: boolean;
  strongCloud: boolean;
  kijunFlat: number | null;
  ssbFlat: number | null;
  khachSan: boolean;
  cloudThicknessPct: number | null;
}

export interface IchimokuPack {
  d: IchiTf;
  w: IchiTf;
  m: IchiTf;
  above3tf: boolean;
  belowDaily: boolean;
  tenkanCrossUp: boolean;
  ichiScore: number;
  label: string;
}

function midline(high: number[], low: number[], period: number, i: number): number | null {
  const hh = rollingMax(high, period, i);
  const ll = rollingMin(low, period, i);
  if (hh == null || ll == null) return null;
  return (hh + ll) / 2;
}

function isFlat(series: Array<number | null>, i: number, look = 8, tol = 0.004): boolean {
  const cur = series[i];
  if (cur == null) return false;
  let count = 0;
  for (let k = Math.max(0, i - look + 1); k <= i; k++) {
    const v = series[k];
    if (v != null && Math.abs(v - cur) / cur <= tol) count++;
  }
  return count >= Math.max(5, look - 2);
}

function computeTf(candles: Candle[], displacement = 26): IchiTf {
  const n = candles.length;
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  const close = candles.map((c) => c.close);
  const tenkanS: Array<number | null> = Array(n).fill(null);
  const kijunS: Array<number | null> = Array(n).fill(null);
  const spanBraw: Array<number | null> = Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    tenkanS[i] = midline(high, low, 9, i);
    kijunS[i] = midline(high, low, 26, i);
    spanBraw[i] = midline(high, low, 52, i);
  }
  const i = n - 1;
  // Mây tại nến hiện tại = Span tính từ nến t-26 — không dùng high/low tương lai.
  const src = i - displacement;
  const tenkan = tenkanS[i];
  const kijun = kijunS[i];
  const spanA =
    src >= 0 && tenkanS[src] != null && kijunS[src] != null
      ? (tenkanS[src]! + kijunS[src]!) / 2
      : null;
  const spanB = src >= 0 ? spanBraw[src] : null;
  const cloudTop = spanA != null && spanB != null ? Math.max(spanA, spanB) : null;
  const cloudBot = spanA != null && spanB != null ? Math.min(spanA, spanB) : null;
  const lastClose = close[i]!;
  const kijunFlat = isFlat(kijunS, i) ? kijun : null;
  const ssbFlat = isFlat(spanBraw, i, 12, 0.006) ? spanBraw[i] : null;
  const khachSan = Boolean(kijunFlat && ssbFlat && Math.abs(kijunFlat - ssbFlat) / lastClose < 0.015);
  return {
    tenkan, kijun, spanA, spanB, cloudTop, cloudBot,
    aboveCloud: cloudTop != null && lastClose > cloudTop,
    belowCloud: cloudBot != null && lastClose < cloudBot,
    tenkanAboveKijun: tenkan != null && kijun != null && tenkan > kijun,
    strongCloud: spanA != null && spanB != null && spanA > spanB,
    kijunFlat, ssbFlat, khachSan,
    cloudThicknessPct:
      cloudTop != null && cloudBot != null && lastClose
        ? ((cloudTop - cloudBot) / lastClose) * 100
        : null,
  };
}

export function computeIchimoku(daily: Candle[]): IchimokuPack {
  const d = computeTf(daily);
  const w = computeTf(resample(daily, "week"));
  const m = computeTf(resample(daily, "month"));
  const above3tf = d.aboveCloud && w.aboveCloud && m.aboveCloud;
  const belowDaily = d.belowCloud;
  const n = daily.length;
  let tenkanCrossUp = false;
  if (n >= 27) {
    const prev = computeTf(daily.slice(0, -1));
    tenkanCrossUp = Boolean(!prev.tenkanAboveKijun && d.tenkanAboveKijun);
  }
  let score = 5;
  if (d.aboveCloud) score += 1.6;
  if (w.aboveCloud) score += 1.2;
  if (m.aboveCloud) score += 1.0;
  if (d.tenkanAboveKijun) score += 0.8;
  if (d.strongCloud) score += 0.4;
  if (d.belowCloud) score -= 2.2;
  if (w.belowCloud) score -= 1.4;
  if (above3tf) score += 0.8;
  score = Math.max(0, Math.min(10, score));

  let label = "Mixed / inside cloud";
  if (above3tf) label = "3TF bull — price above D/W/M cloud";
  else if (d.aboveCloud && w.aboveCloud) label = "Above D+W cloud — uptrend";
  else if (d.belowCloud && w.belowCloud) label = "Below D+W cloud — downtrend";
  else if (d.belowCloud) label = "Below daily cloud";
  else if (d.aboveCloud) label = "Above daily cloud";

  return { d, w, m, above3tf, belowDaily, tenkanCrossUp, ichiScore: score, label };
}

export function ichimokuLevels(pack: IchimokuPack, close: number) {
  const supports = [pack.d.kijun, pack.d.cloudBot, pack.w.kijun, pack.w.cloudBot, pack.m.kijun]
    .filter((v): v is number => typeof v === "number" && v > 0 && v < close)
    .sort((a, b) => b - a);
  const resists = [pack.d.kijun, pack.d.cloudTop, pack.w.kijun, pack.w.cloudTop, pack.m.kijun]
    .filter((v): v is number => typeof v === "number" && v > close)
    .sort((a, b) => a - b);
  return {
    support1: supports[0] ?? null,
    support2: supports[1] ?? null,
    resist1: resists[0] ?? null,
    resist2: resists[1] ?? null,
  };
}

export function featuresOk(_c: Candle[]) {
  return computeFeatures;
}
