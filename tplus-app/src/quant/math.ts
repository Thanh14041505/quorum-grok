export function sma(
  values: number[],
  period: number,
  i: number,
): number | null {
  if (i + 1 < period) return null;
  let sum = 0;
  for (let k = i - period + 1; k <= i; k++) sum += values[k]!;
  return sum / period;
}

export function emaSeries(
  values: number[],
  period: number,
): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i]!;
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i]! * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder / RSI smoothing: alpha = 1/period, không dùng future bars. */
export function rmaSeries(
  values: number[],
  period: number,
): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  if (values.length < period) return out;
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i]!;
  prev /= period;
  out[period - 1] = prev;
  const a = 1 / period;
  for (let i = period; i < values.length; i++) {
    prev = a * values[i]! + (1 - a) * prev;
    out[i] = prev;
  }
  return out;
}

export function rollingMax(
  values: number[],
  period: number,
  i: number,
  end = i,
): number | null {
  if (end + 1 < period) return null;
  const start = end - period + 1;
  if (start < 0) return null;
  let m = -Infinity;
  for (let k = start; k <= end; k++) m = Math.max(m, values[k]!);
  return m;
}

export function rollingMin(
  values: number[],
  period: number,
  i: number,
  end = i,
): number | null {
  if (end + 1 < period) return null;
  const start = end - period + 1;
  if (start < 0) return null;
  let m = Infinity;
  for (let k = start; k <= end; k++) m = Math.min(m, values[k]!);
  return m;
}

export function pctChange(
  values: number[],
  i: number,
  n: number,
): number | null {
  const j = i - n;
  if (j < 0 || !values[j]) return null;
  return values[i]! / values[j]! - 1;
}

export function lastFinite(
  arr: Array<number | null | undefined>,
): number | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    const v = arr[i];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function nz(n: number | null | undefined, fallback = 0): number {
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

export function hashSymbol(symbol: string): number {
  let h = 2166136261;
  for (let i = 0; i < symbol.length; i++) {
    h ^= symbol.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
