/**
 * Grok Tape — price-action primitives.
 * Không dùng Ichimoku / VP / RSI divergence: những não đó đã có chủ.
 * Pivot chỉ tính khi đã confirmed (cần `right` nến sau) — không look-ahead.
 */

export interface SwingPoint {
  i: number;
  price: number;
}

export interface TapeRead {
  structure: "HH_HL" | "LH_LL" | "MIXED";
  lastHigh: SwingPoint | null;
  lastLow: SwingPoint | null;
  priorHigh: SwingPoint | null;
  priorLow: SwingPoint | null;
  donchianPct: number | null;
  high20: number | null;
  low20: number | null;
  coiled: boolean;
  atrRatio: number | null;
  effort: "DEMAND" | "SUPPLY" | "NEUTRAL";
  locInBar: number | null;
  gapPct: number | null;
  gapUnfilled: boolean;
  extended: boolean;
  rs5: number | null;
  rs20: number | null;
  rs60: number | null;
  rsAligned: boolean;
}

export function confirmedSwings(
  high: number[],
  low: number[],
  left = 3,
  right = 3,
): { highs: SwingPoint[]; lows: SwingPoint[] } {
  const highs: SwingPoint[] = [];
  const lows: SwingPoint[] = [];
  const last = high.length - 1;
  for (let i = left; i <= last - right; i++) {
    let isH = true;
    let isL = true;
    for (let k = i - left; k <= i + right; k++) {
      if (k === i) continue;
      if (high[k]! >= high[i]!) isH = false;
      if (low[k]! <= low[i]!) isL = false;
    }
    if (isH) highs.push({ i, price: high[i]! });
    if (isL) lows.push({ i, price: low[i]! });
  }
  return { highs, lows };
}

export function readTape(
  high: number[],
  low: number[],
  close: number[],
  open: number[],
  volume: number[],
  atr14: Array<number | null>,
  volMa20: Array<number | null>,
  stockRet: { d5: number | null; d20: number | null; d60: number | null },
  benchRet: { d5: number | null; d20: number | null; d60: number | null },
): TapeRead {
  const i = close.length - 1;
  const { highs, lows } = confirmedSwings(high, low);
  const lastHigh = highs.length ? highs[highs.length - 1]! : null;
  const priorHigh = highs.length >= 2 ? highs[highs.length - 2]! : null;
  const lastLow = lows.length ? lows[lows.length - 1]! : null;
  const priorLow = lows.length >= 2 ? lows[lows.length - 2]! : null;

  let structure: TapeRead["structure"] = "MIXED";
  if (lastHigh && priorHigh && lastLow && priorLow) {
    const hh = lastHigh.price > priorHigh.price;
    const hl = lastLow.price > priorLow.price;
    const lh = lastHigh.price < priorHigh.price;
    const ll = lastLow.price < priorLow.price;
    if (hh && hl) structure = "HH_HL";
    else if (lh && ll) structure = "LH_LL";
  }

  const high20 = windowMax(high, i, 20);
  const low20 = windowMin(low, i, 20);
  const span = high20 != null && low20 != null ? high20 - low20 : 0;
  const donchianPct = span > 0 && high20 != null && low20 != null ? (close[i]! - low20) / span : null;

  const atrRatio = atrVsOwnHistory(atr14, i, 60);
  const coiled = atrRatio != null && atrRatio < 0.78;

  const range = high[i]! - low[i]!;
  const locInBar = range > 0 ? (close[i]! - low[i]!) / range : null;
  const vr = volMa20[i] && volMa20[i]! > 0 ? volume[i]! / volMa20[i]! : 1;
  let effort: TapeRead["effort"] = "NEUTRAL";
  if (locInBar != null && vr >= 1.4) {
    if (locInBar >= 0.65) effort = "DEMAND";
    else if (locInBar <= 0.35) effort = "SUPPLY";
  }

  const prev = i > 0 ? close[i - 1]! : close[i]!;
  const gapPct = prev ? open[i]! / prev - 1 : null;
  const gapUnfilled = Boolean(prev && ((open[i]! > prev && low[i]! >= prev) || (open[i]! < prev && high[i]! <= prev)));

  const rs5 = diff(stockRet.d5, benchRet.d5);
  const rs20 = diff(stockRet.d20, benchRet.d20);
  const rs60 = diff(stockRet.d60, benchRet.d60);
  const signs = [rs5, rs20, rs60].filter((v): v is number => v != null);
  const rsAligned = signs.length >= 2 && signs.every((v) => v > 0);

  const extended = Boolean(
    (donchianPct != null && donchianPct > 0.92 && (stockRet.d5 ?? 0) > 0.05) ||
      (donchianPct != null && donchianPct > 0.97),
  );

  return {
    structure,
    lastHigh,
    lastLow,
    priorHigh,
    priorLow,
    donchianPct,
    high20,
    low20,
    coiled,
    atrRatio,
    effort,
    locInBar,
    gapPct,
    gapUnfilled,
    extended,
    rs5,
    rs20,
    rs60,
    rsAligned,
  };
}

function windowMax(arr: number[], i: number, n: number): number | null {
  if (i + 1 < n) return null;
  let m = -Infinity;
  for (let k = i - n + 1; k <= i; k++) m = Math.max(m, arr[k]!);
  return m;
}

function windowMin(arr: number[], i: number, n: number): number | null {
  if (i + 1 < n) return null;
  let m = Infinity;
  for (let k = i - n + 1; k <= i; k++) m = Math.min(m, arr[k]!);
  return m;
}

function atrVsOwnHistory(atr: Array<number | null>, i: number, look: number): number | null {
  const cur = atr[i];
  if (cur == null || i + 1 < look) return null;
  let s = 0;
  let n = 0;
  for (let k = i - look + 1; k <= i; k++) {
    if (atr[k] != null) {
      s += atr[k]!;
      n++;
    }
  }
  if (!n) return null;
  const mean = s / n;
  return mean > 0 ? cur / mean : null;
}

function diff(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return a - b;
}
