import type { Candle } from "./types";
import { emaSeries, nz, pctChange, rmaSeries, rollingMax, rollingMin, sma } from "./math";

export interface Features {
  n: number;
  close: number[];
  open: number[];
  high: number[];
  low: number[];
  volume: number[];
  time: number[];
  ma20: Array<number | null>;
  ma50: Array<number | null>;
  ma200: Array<number | null>;
  ma9: Array<number | null>;
  ma10: Array<number | null>;
  ema20: Array<number | null>;
  ema12: Array<number | null>;
  ema26: Array<number | null>;
  rsi14: Array<number | null>;
  macd: Array<number | null>;
  macdSignal: Array<number | null>;
  macdHist: Array<number | null>;
  atr14: Array<number | null>;
  plusDi: Array<number | null>;
  minusDi: Array<number | null>;
  adx14: Array<number | null>;
  stochK: Array<number | null>;
  stochD: Array<number | null>;
  cmf20: Array<number | null>;
  mfi14: Array<number | null>;
  obv: number[];
  volMa20: Array<number | null>;
  bbMid: Array<number | null>;
  bbUpper: Array<number | null>;
  bbLower: Array<number | null>;
  bbWidth: Array<number | null>;
  force: Array<number | null>;
}

export interface Snapshot {
  close: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  time: number;
  ret1d: number | null;
  ret5d: number | null;
  ret20d: number | null;
  ret60d: number | null;
  ma20: number | null;
  ma50: number | null;
  ma200: number | null;
  ma9: number | null;
  ma10: number | null;
  ema20: number | null;
  ma20Slope: number | null;
  ma50Slope: number | null;
  aboveMa20: boolean;
  aboveMa50: boolean;
  aboveMa200: boolean;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  macdHistPct: number | null;
  macdCrossUp: boolean;
  atr14: number | null;
  atrPct: number | null;
  adx14: number | null;
  plusDi: number | null;
  minusDi: number | null;
  stochK: number | null;
  stochCrossUp: boolean;
  cmf20: number | null;
  mfi14: number | null;
  obv: number;
  obvMa20: number | null;
  obvSignal: number;
  obvSlope: number;
  volumeRatio: number | null;
  dollarValue: number;
  avgValue20d: number | null;
  avgVol20d: number | null;
  resistance20: number | null;
  support20: number | null;
  breakout20: boolean;
  breakdown20: boolean;
  distanceResistance: number | null;
  distanceSupport: number | null;
  relativeStrength60d: number | null;
  bbWidth: number | null;
  bbSqueeze: boolean;
  forceIndex: number | null;
  emaPct: number | null;
  trendLong: "uptrend" | "weak_up" | "sideway" | "weak_down" | "downtrend";
}

function seriesOrNull(arr: Array<number | null>, i: number): number | null {
  const v = arr[i];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function computeFeatures(candles: Candle[]): Features {
  const n = candles.length;
  const close = candles.map((c) => c.close);
  const open = candles.map((c) => c.open);
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  const volume = candles.map((c) => c.volume);
  const time = candles.map((c) => c.time);

  const ma20: Array<number | null> = Array(n).fill(null);
  const ma50: Array<number | null> = Array(n).fill(null);
  const ma200: Array<number | null> = Array(n).fill(null);
  const ma9: Array<number | null> = Array(n).fill(null);
  const ma10: Array<number | null> = Array(n).fill(null);
  const volMa20: Array<number | null> = Array(n).fill(null);
  const bbMid: Array<number | null> = Array(n).fill(null);
  const bbUpper: Array<number | null> = Array(n).fill(null);
  const bbLower: Array<number | null> = Array(n).fill(null);
  const bbWidth: Array<number | null> = Array(n).fill(null);

  for (let i = 0; i < n; i++) {
    ma9[i] = sma(close, 9, i);
    ma10[i] = sma(close, 10, i);
    ma20[i] = sma(close, 20, i);
    ma50[i] = sma(close, 50, i);
    ma200[i] = sma(close, 200, i);
    volMa20[i] = sma(volume, 20, i);
    const mid = ma20[i];
    if (mid != null && i >= 19) {
      let varSum = 0;
      for (let k = i - 19; k <= i; k++) {
        const d = close[k]! - mid;
        varSum += d * d;
      }
      const sd = Math.sqrt(varSum / 20);
      bbMid[i] = mid;
      bbUpper[i] = mid + 2 * sd;
      bbLower[i] = mid - 2 * sd;
      bbWidth[i] = mid !== 0 ? (4 * sd) / mid : null;
    }
  }

  const ema12 = emaSeries(close, 12);
  const ema26 = emaSeries(close, 26);
  const ema20 = emaSeries(close, 20);
  const macd: Array<number | null> = Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (ema12[i] != null && ema26[i] != null) macd[i] = ema12[i]! - ema26[i]!;
  }
  const macdFilled = macd.map((v) => v ?? 0);
  const macdSignal = emaSeries(macdFilled, 9);
  const macdHist: Array<number | null> = Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (macd[i] != null && macdSignal[i] != null) macdHist[i] = macd[i]! - macdSignal[i]!;
  }

  const tr: number[] = Array(n).fill(0);
  const plusDm: number[] = Array(n).fill(0);
  const minusDm: number[] = Array(n).fill(0);
  const gain: number[] = Array(n).fill(0);
  const loss: number[] = Array(n).fill(0);
  const obv: number[] = Array(n).fill(0);
  const force: Array<number | null> = Array(n).fill(null);

  for (let i = 0; i < n; i++) {
    if (i === 0) {
      tr[i] = high[i]! - low[i]!;
      continue;
    }
    const prev = close[i - 1]!;
    tr[i] = Math.max(high[i]! - low[i]!, Math.abs(high[i]! - prev), Math.abs(low[i]! - prev));
    const up = high[i]! - high[i - 1]!;
    const down = low[i - 1]! - low[i]!;
    plusDm[i] = up > down && up > 0 ? up : 0;
    minusDm[i] = down > up && down > 0 ? down : 0;
    const d = close[i]! - prev;
    gain[i] = d > 0 ? d : 0;
    loss[i] = d < 0 ? -d : 0;
    obv[i] = obv[i - 1]! + Math.sign(d) * volume[i]!;
    force[i] = d * volume[i]!;
  }

  const atr14 = rmaSeries(tr, 14);
  const plusDiSm = rmaSeries(plusDm, 14);
  const minusDiSm = rmaSeries(minusDm, 14);
  const avgGain = rmaSeries(gain, 14);
  const avgLoss = rmaSeries(loss, 14);

  const plusDi: Array<number | null> = Array(n).fill(null);
  const minusDi: Array<number | null> = Array(n).fill(null);
  const dx: number[] = Array(n).fill(0);
  const rsi14: Array<number | null> = Array(n).fill(null);

  for (let i = 0; i < n; i++) {
    const atr = atr14[i];
    if (atr && atr > 0 && plusDiSm[i] != null && minusDiSm[i] != null) {
      plusDi[i] = (100 * plusDiSm[i]!) / atr;
      minusDi[i] = (100 * minusDiSm[i]!) / atr;
      const den = plusDi[i]! + minusDi[i]!;
      dx[i] = den === 0 ? 0 : (100 * Math.abs(plusDi[i]! - minusDi[i]!)) / den;
    }
    if (avgGain[i] != null && avgLoss[i] != null) {
      if (avgLoss[i] === 0) rsi14[i] = 100;
      else rsi14[i] = 100 - 100 / (1 + avgGain[i]! / avgLoss[i]!);
    }
  }
  const adx14 = rmaSeries(dx, 14);

  const stochK: Array<number | null> = Array(n).fill(null);
  const stochD: Array<number | null> = Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const hh = rollingMax(high, 14, i);
    const ll = rollingMin(low, 14, i);
    if (hh != null && ll != null && hh !== ll) stochK[i] = ((close[i]! - ll) / (hh - ll)) * 100;
    else if (hh != null) stochK[i] = 50;
    stochD[i] = sma(stochK.map((v) => v ?? 50), 3, i);
  }

  const cmf20: Array<number | null> = Array(n).fill(null);
  const mfv: number[] = Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const range = high[i]! - low[i]!;
    const mfm = range === 0 ? 0 : ((close[i]! - low[i]!) - (high[i]! - close[i]!)) / range;
    mfv[i] = mfm * volume[i]!;
  }
  for (let i = 0; i < n; i++) {
    if (i < 19) continue;
    let mfvSum = 0;
    let volSum = 0;
    for (let k = i - 19; k <= i; k++) {
      mfvSum += mfv[k]!;
      volSum += volume[k]!;
    }
    cmf20[i] = volSum === 0 ? 0 : mfvSum / volSum;
  }

  const typical = close.map((c, i) => (high[i]! + low[i]! + c) / 3);
  const mfi14: Array<number | null> = Array(n).fill(null);
  for (let i = 13; i < n; i++) {
    let pos = 0;
    let neg = 0;
    for (let k = i - 13; k <= i; k++) {
      if (k === 0) continue;
      const raw = typical[k]! * volume[k]!;
      if (typical[k]! > typical[k - 1]!) pos += raw;
      else if (typical[k]! < typical[k - 1]!) neg += raw;
    }
    if (neg === 0) mfi14[i] = 100;
    else mfi14[i] = 100 - 100 / (1 + pos / neg);
  }

  return {
    n, close, open, high, low, volume, time,
    ma20, ma50, ma200, ma9, ma10, ema20, ema12, ema26,
    rsi14, macd, macdSignal, macdHist, atr14, plusDi, minusDi, adx14,
    stochK, stochD, cmf20, mfi14, obv, volMa20, bbMid, bbUpper, bbLower, bbWidth, force,
  };
}

export function snapshotAt(
  f: Features,
  i: number,
  benchmarkCloses?: number[] | null,
): Snapshot {
  const close = f.close[i]!;
  const ma20 = seriesOrNull(f.ma20, i);
  const ma50 = seriesOrNull(f.ma50, i);
  const ma200 = seriesOrNull(f.ma200, i);
  const ema20 = seriesOrNull(f.ema20, i);
  const atr = seriesOrNull(f.atr14, i);
  const volMa = seriesOrNull(f.volMa20, i);
  const rsi = seriesOrNull(f.rsi14, i);
  const macdHist = seriesOrNull(f.macdHist, i);
  const prevMacd = i > 0 ? seriesOrNull(f.macdHist, i - 1) : null;
  const prevMacdLine = i > 0 ? seriesOrNull(f.macd, i - 1) : null;
  const macdLine = seriesOrNull(f.macd, i);
  const macdSig = seriesOrNull(f.macdSignal, i);
  const prevMacdSig = i > 0 ? seriesOrNull(f.macdSignal, i - 1) : null;

  const resistance20 = i >= 20 ? rollingMax(f.high, 20, i, i - 1) : null;
  const support20 = i >= 20 ? rollingMin(f.low, 20, i, i - 1) : null;

  let avgValue: number | null = null;
  let avgVol: number | null = null;
  if (i >= 19) {
    let vs = 0;
    let vv = 0;
    for (let k = i - 19; k <= i; k++) {
      vs += f.close[k]! * f.volume[k]!;
      vv += f.volume[k]!;
    }
    avgValue = vs / 20;
    avgVol = vv / 20;
  }

  const obvMa20 = sma(f.obv, 20, i);
  const obvPrev = i >= 5 ? f.obv[i - 5]! : f.obv[0]!;
  const obvSlope = obvPrev !== 0 ? ((f.obv[i]! - obvPrev) / Math.abs(obvPrev)) * 100 : 0;

  const stochK = seriesOrNull(f.stochK, i);
  const prevK = i > 0 ? seriesOrNull(f.stochK, i - 1) : null;
  const stochD = seriesOrNull(f.stochD, i);
  const prevD = i > 0 ? seriesOrNull(f.stochD, i - 1) : null;

  let bbSqueeze = false;
  const width = seriesOrNull(f.bbWidth, i);
  if (width != null && i >= 60) {
    const window: number[] = [];
    for (let k = i - 59; k <= i; k++) {
      const w = f.bbWidth[k];
      if (w != null) window.push(w);
    }
    window.sort((a, b) => a - b);
    const pctIdx = Math.floor(window.length * 0.15);
    if (window[pctIdx] != null && width <= window[pctIdx]!) bbSqueeze = true;
  }

  let rs: number | null = null;
  if (benchmarkCloses && benchmarkCloses.length === f.n) {
    const rStock = pctChange(f.close, i, 60);
    const rBench = pctChange(benchmarkCloses, i, 60);
    if (rStock != null && rBench != null) rs = rStock - rBench;
  }

  const ma20Prev = i >= 5 ? seriesOrNull(f.ma20, i - 5) : null;
  const ma50Prev = i >= 10 ? seriesOrNull(f.ma50, i - 10) : null;
  const ma20Slope = ma20 != null && ma20Prev ? ma20 / ma20Prev - 1 : null;
  const ma50Slope = ma50 != null && ma50Prev ? ma50 / ma50Prev - 1 : null;

  let trendLong: Snapshot["trendLong"] = "sideway";
  if (ma50 && ma200) {
    if (close > ma50 && ma50 > ma200 && (ma50Slope ?? 0) > 0) trendLong = "uptrend";
    else if (close > ma50 && ma50 > ma200) trendLong = "weak_up";
    else if (close < ma50 && ma50 < ma200 && (ma50Slope ?? 0) < 0) trendLong = "downtrend";
    else if (close < ma50) trendLong = "weak_down";
  }

  const forceRaw = seriesOrNull(f.force, i);
  const forceMa = i >= 13 ? sma(f.force.map((v) => v ?? 0), 13, i) : null;
  const forceIndex =
    forceMa && avgValue ? forceMa / avgValue : forceRaw && avgValue ? forceRaw / avgValue : null;

  return {
    close, open: f.open[i]!, high: f.high[i]!, low: f.low[i]!, volume: f.volume[i]!, time: f.time[i]!,
    ret1d: pctChange(f.close, i, 1),
    ret5d: pctChange(f.close, i, 5),
    ret20d: pctChange(f.close, i, 20),
    ret60d: pctChange(f.close, i, 60),
    ma20, ma50, ma200,
    ma9: seriesOrNull(f.ma9, i),
    ma10: seriesOrNull(f.ma10, i),
    ema20,
    ma20Slope, ma50Slope,
    aboveMa20: ma20 != null && close > ma20,
    aboveMa50: ma50 != null && close > ma50,
    aboveMa200: ma200 != null && close > ma200,
    rsi14: rsi,
    macd: macdLine,
    macdSignal: macdSig,
    macdHist,
    macdHistPct: macdHist != null && close ? macdHist / close : null,
    macdCrossUp: Boolean(
      macdLine != null && macdSig != null && prevMacdLine != null && prevMacdSig != null &&
      prevMacdLine <= prevMacdSig && macdLine > macdSig,
    ),
    atr14: atr,
    atrPct: atr != null && close ? atr / close : null,
    adx14: seriesOrNull(f.adx14, i),
    plusDi: seriesOrNull(f.plusDi, i),
    minusDi: seriesOrNull(f.minusDi, i),
    stochK,
    stochCrossUp: Boolean(
      stochK != null && stochD != null && prevK != null && prevD != null &&
      prevK <= prevD && stochK > stochD,
    ),
    cmf20: seriesOrNull(f.cmf20, i),
    mfi14: seriesOrNull(f.mfi14, i),
    obv: f.obv[i]!,
    obvMa20,
    obvSignal: obvMa20 != null && f.obv[i]! > obvMa20 ? 1 : 0,
    obvSlope,
    volumeRatio: volMa && volMa > 0 ? f.volume[i]! / volMa : null,
    dollarValue: close * f.volume[i]!,
    avgValue20d: avgValue,
    avgVol20d: avgVol,
    resistance20,
    support20,
    breakout20: resistance20 != null && close > resistance20,
    breakdown20: support20 != null && close < support20,
    distanceResistance: resistance20 ? close / resistance20 - 1 : null,
    distanceSupport: support20 ? close / support20 - 1 : null,
    relativeStrength60d: rs,
    bbWidth: width,
    bbSqueeze,
    forceIndex,
    emaPct: ema20 ? (close / ema20 - 1) * 100 : null,
    trendLong,
  };
}

export function lastSnapshot(f: Features, benchmarkCloses?: number[] | null): Snapshot {
  return snapshotAt(f, f.n - 1, benchmarkCloses);
}

export function resample(
  candles: Candle[],
  kind: "week" | "month",
): Candle[] {
  const groups = new Map<string, Candle[]>();
  for (const c of candles) {
    const d = new Date(c.time * 1000);
    const key =
      kind === "week"
        ? isoWeekKey(d)
        : `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    const arr = groups.get(key) ?? [];
    arr.push(c);
    groups.set(key, arr);
  }
  const out: Candle[] = [];
  for (const bars of groups.values()) {
    out.push({
      time: bars[bars.length - 1]!.time,
      open: bars[0]!.open,
      high: Math.max(...bars.map((b) => b.high)),
      low: Math.min(...bars.map((b) => b.low)),
      close: bars[bars.length - 1]!.close,
      volume: bars.reduce((s, b) => s + b.volume, 0),
    });
  }
  return out;
}

function isoWeekKey(d: Date): string {
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${week}`;
}

export function swingLow(low: number[], i: number, left = 3, right = 3): number | null {
  // Chỉ dùng swing đã xác nhận: cần `right` nến sau pivot — không look-ahead.
  const pivot = i - right;
  if (pivot - left < 0 || pivot < 0) return null;
  const v = low[pivot]!;
  for (let k = pivot - left; k <= pivot + right; k++) {
    if (k === pivot) continue;
    if (low[k]! < v) return null;
  }
  return v;
}

export { nz };
