import type { Features, Snapshot } from "./indicators";
import { sma } from "./math";

export type VsaLabel =
  | "VOL_SURGE"
  | "DRY_VOLUME"
  | "SPRING"
  | "DISTRIBUTION"
  | "NO_DEMAND"
  | "NONE";

export function detectVsa(f: Features, i: number, lookback = 30): VsaLabel {
  if (i < lookback + 1) return "NONE";
  const volMa = sma(f.volume, lookback, i);
  const spread = f.high.map((h, k) => h - f.low[k]!);
  const spreadMa = sma(spread, lookback, i);
  if (!volMa || !spreadMa) return "NONE";
  const volRatio = f.volume[i]! / volMa;
  const spreadRatio = spreadMa === 0 ? 1 : spread[i]! / spreadMa;
  const range = spread[i]!;
  const closePos = range === 0 ? 0.5 : (f.close[i]! - f.low[i]!) / range;
  const roc = f.close[i]! / f.close[i - 1]! - 1;

  // Thứ tự ưu tiên giống notebook: nổ vol → cạn vol → rút chân → phân phối → cạn cầu.
  if (volRatio > 1.5 && spreadRatio > 1.2 && closePos > 0.7 && roc > 0.015) return "VOL_SURGE";
  if (volRatio < 0.6 && spreadRatio < 0.85 && closePos >= 0.4 && roc > -0.015) return "DRY_VOLUME";
  if (volRatio > 1.3 && spreadRatio > 1.3 && closePos > 0.65 && roc > -0.02) return "SPRING";
  if (volRatio > 1.5 && closePos < 0.35 && spreadRatio > 1.0 && roc < 0.02) return "DISTRIBUTION";
  if (volRatio < 0.6 && closePos < 0.4 && roc > 0) return "NO_DEMAND";
  return "NONE";
}

export function vsaScore(label: VsaLabel): number {
  switch (label) {
    case "VOL_SURGE":
      return 8.5;
    case "SPRING":
      return 8.0;
    case "DRY_VOLUME":
      return 7.0;
    case "NO_DEMAND":
      return 3.5;
    case "DISTRIBUTION":
      return 1.5;
    default:
      return 5.0;
  }
}

export function vsaText(label: VsaLabel): string {
  switch (label) {
    case "VOL_SURGE":
      return "Volume surge (real buying)";
    case "DRY_VOLUME":
      return "Dry volume (supply drying)";
    case "SPRING":
      return "Spring / shakeout";
    case "DISTRIBUTION":
      return "Distribution";
    case "NO_DEMAND":
      return "No demand";
    default:
      return "None";
  }
}

export function detectDryup(f: Features, snap: Snapshot, sessions = 7, volRatio = 0.7, rangeRatio = 0.75) {
  const i = f.n - 1;
  if (i < 20 + sessions) return { dryup: false, bonus: 0, bars: 0 };
  let count = 0;
  for (let k = i - sessions + 1; k <= i; k++) {
    const volMa = sma(f.volume, 20, k);
    const atr = f.atr14[k];
    const spread = f.high[k]! - f.low[k]!;
    if (volMa && atr && f.volume[k]! / volMa < volRatio && spread < atr * rangeRatio) count++;
  }
  const dryup = count >= Math.max(4, sessions - 2);
  // Bonus tối đa 2.0 như VolumeDryupDetector — không bịa thêm.
  const bonus = dryup ? Math.min(2, (count / sessions) * 2) : 0;
  return { dryup, bonus, bars: count };
}

export interface VolumeProfile {
  poc: number;
  vah: number;
  val: number;
  position: "breakout" | "value_area" | "at_poc" | "below_value" | "unknown";
}

export function volumeProfile(f: Features, bins = 30, lookback = 35): VolumeProfile {
  const i = f.n - 1;
  const start = Math.max(0, i - lookback + 1);
  const sliceH = f.high.slice(start, i + 1);
  const sliceL = f.low.slice(start, i + 1);
  const sliceC = f.close.slice(start, i + 1);
  const sliceV = f.volume.slice(start, i + 1);
  const lo = Math.min(...sliceL);
  const hi = Math.max(...sliceH);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) {
    return { poc: f.close[i]!, vah: f.close[i]!, val: f.close[i]!, position: "unknown" };
  }
  const width = (hi - lo) / bins;
  const hist = Array(bins).fill(0);
  for (let k = 0; k < sliceC.length; k++) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((sliceC[k]! - lo) / width)));
    hist[idx] += sliceV[k]!;
  }
  let pocBin = 0;
  for (let b = 1; b < bins; b++) if (hist[b] > hist[pocBin]!) pocBin = b;
  const total = hist.reduce((s, v) => s + v, 0);
  let acc = hist[pocBin]!;
  let left = pocBin;
  let right = pocBin;
  while (acc / total < 0.7 && (left > 0 || right < bins - 1)) {
    const nextL = left > 0 ? hist[left - 1]! : -1;
    const nextR = right < bins - 1 ? hist[right + 1]! : -1;
    if (nextL >= nextR) {
      left -= 1;
      acc += hist[left]!;
    } else {
      right += 1;
      acc += hist[right]!;
    }
  }
  const poc = lo + (pocBin + 0.5) * width;
  const val = lo + left * width;
  const vah = lo + (right + 1) * width;
  const close = f.close[i]!;
  let position: VolumeProfile["position"] = "value_area";
  if (close > vah * 1.005) position = "breakout";
  else if (close < val * 0.995) position = "below_value";
  else if (Math.abs(close - poc) / close < 0.008) position = "at_poc";
  return { poc, vah, val, position };
}
