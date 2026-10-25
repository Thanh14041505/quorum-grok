import type { Features } from "./indicators";
import { emaSeries, rmaSeries, sma } from "./math";

export type DivKind =
  "bull_reg" | "bear_reg" | "bull_hid" | "bear_hid" | "none";

export interface DivergenceHit {
  kind: DivKind;
  strength: number;
  age: number;
  confirmed: boolean;
  label: string;
}

interface Pivot {
  index: number;
  price: number;
  osc: number;
}

function rsiSeries(close: number[], period: number): Array<number | null> {
  const gain: number[] = Array(close.length).fill(0);
  const loss: number[] = Array(close.length).fill(0);
  for (let i = 1; i < close.length; i++) {
    const d = close[i]! - close[i - 1]!;
    gain[i] = d > 0 ? d : 0;
    loss[i] = d < 0 ? -d : 0;
  }
  const ag = rmaSeries(gain, period);
  const al = rmaSeries(loss, period);
  return close.map((_, i) => {
    if (ag[i] == null || al[i] == null) return null;
    if (al[i] === 0) return 100;
    return 100 - 100 / (1 + ag[i]! / al[i]!);
  });
}

/**
 * Composite Index (Constance Brown / Pine "Composite Index Divergence").
 * Pivot chỉ được dùng sau lbR nến xác nhận — không look-ahead.
 */
export function compositeOscillator(close: number[]): Array<number | null> {
  const rsi = rsiSeries(close, 14);
  const rsiFast = rsiSeries(close, 3);
  const n = close.length;
  const mom: Array<number | null> = Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (i >= 9 && rsi[i] != null && rsi[i - 9] != null)
      mom[i] = rsi[i]! - rsi[i - 9]!;
  }
  const fastMa: Array<number | null> = Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (i < 2) continue;
    const a = rsiFast[i];
    const b = rsiFast[i - 1];
    const c = rsiFast[i - 2];
    if (a != null && b != null && c != null) fastMa[i] = (a + b + c) / 3;
  }
  const composite: Array<number | null> = Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (mom[i] != null && fastMa[i] != null)
      composite[i] = mom[i]! + fastMa[i]!;
  }
  return composite;
}

function confirmedPivots(
  price: number[],
  osc: Array<number | null>,
  kind: "high" | "low",
  lbL = 5,
  lbR = 5,
): Pivot[] {
  const pivots: Pivot[] = [];
  const last = price.length - 1;
  for (let i = lbL; i <= last - lbR; i++) {
    const p = price[i]!;
    let ok = true;
    for (let k = i - lbL; k <= i + lbR; k++) {
      if (k === i) continue;
      if (kind === "low" && price[k]! < p) {
        ok = false;
        break;
      }
      if (kind === "high" && price[k]! > p) {
        ok = false;
        break;
      }
    }
    if (!ok || osc[i] == null) continue;
    pivots.push({ index: i, price: p, osc: osc[i]! });
  }
  return pivots;
}

export function detectDivergence(f: Features, maxAge = 15): DivergenceHit {
  const osc = compositeOscillator(f.close);
  const lows = confirmedPivots(f.low, osc, "low");
  const highs = confirmedPivots(f.high, osc, "high");
  const last = f.n - 1;

  const pick = (pivots: Pivot[], bull: boolean): DivergenceHit | null => {
    if (pivots.length < 2) return null;
    const b = pivots[pivots.length - 1]!;
    const age = last - (b.index + 5);
    if (age < 0 || age > maxAge) return null;
    for (let j = pivots.length - 2; j >= 0; j--) {
      const a = pivots[j]!;
      const gap = b.index - a.index;
      if (gap < 5 || gap > 60) continue;
      if (bull) {
        if (b.price < a.price && b.osc > a.osc) {
          return {
            kind: "bull_reg",
            strength: Math.min(
              10,
              ((a.price - b.price) / a.price) * 100 + (b.osc - a.osc) * 0.15,
            ),
            age,
            confirmed: true,
            label: "Regular bullish (price LL, oscillator HL)",
          };
        }
        if (b.price > a.price && b.osc < a.osc) {
          return {
            kind: "bull_hid",
            strength: Math.min(10, ((b.price - a.price) / a.price) * 80),
            age,
            confirmed: true,
            label: "Hidden bullish (price HL, oscillator LL)",
          };
        }
      } else {
        if (b.price > a.price && b.osc < a.osc) {
          return {
            kind: "bear_reg",
            strength: Math.min(10, ((b.price - a.price) / a.price) * 100),
            age,
            confirmed: true,
            label: "Regular bearish (price HH, oscillator LH)",
          };
        }
        if (b.price < a.price && b.osc > a.osc) {
          return {
            kind: "bear_hid",
            strength: Math.min(10, ((a.price - b.price) / a.price) * 80),
            age,
            confirmed: true,
            label: "Hidden bearish (price LH, oscillator HH)",
          };
        }
      }
      break;
    }
    return null;
  };

  const bull = pick(lows, true);
  const bear = pick(highs, false);
  if (bull && bear) return bull.age <= bear.age ? bull : bear;
  return (
    bull ??
    bear ?? {
      kind: "none",
      strength: 0,
      age: 0,
      confirmed: false,
      label: "None",
    }
  );
}

export function macdRsiDivergence(f: Features): {
  rsi: DivergenceHit;
  macd: DivergenceHit;
} {
  const rsi = detectDivergence(f);
  const macdOsc = emaSeries(f.close, 12).map((v, i) => {
    const slow = emaSeries(f.close, 26)[i];
    if (v == null || slow == null) return null;
    return v - slow;
  });
  // Dùng lại pivot trên MACD histogram — cùng rule xác nhận lbR.
  const fake: Features = { ...f, close: f.close };
  const highs = confirmedPivots(f.high, macdOsc, "high");
  const lows = confirmedPivots(f.low, macdOsc, "low");
  void fake;
  const last = f.n - 1;
  let macd: DivergenceHit = {
    kind: "none",
    strength: 0,
    age: 0,
    confirmed: false,
    label: "None",
  };
  if (lows.length >= 2) {
    const b = lows[lows.length - 1]!;
    const a = lows[lows.length - 2]!;
    const age = last - (b.index + 5);
    if (age >= 0 && age <= 15 && b.price < a.price && b.osc > a.osc) {
      macd = {
        kind: "bull_reg",
        strength: 6,
        age,
        confirmed: true,
        label: "MACD regular bullish",
      };
    } else if (age >= 0 && age <= 15 && b.price > a.price && b.osc < a.osc) {
      macd = {
        kind: "bull_hid",
        strength: 5,
        age,
        confirmed: true,
        label: "MACD hidden bullish",
      };
    }
  }
  if (macd.kind === "none" && highs.length >= 2) {
    const b = highs[highs.length - 1]!;
    const a = highs[highs.length - 2]!;
    const age = last - (b.index + 5);
    if (age >= 0 && age <= 15 && b.price > a.price && b.osc < a.osc) {
      macd = {
        kind: "bear_reg",
        strength: 6,
        age,
        confirmed: true,
        label: "MACD regular bearish",
      };
    }
  }
  return { rsi, macd };
}

export { sma };
