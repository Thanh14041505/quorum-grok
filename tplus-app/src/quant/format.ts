import type { Signal } from "./types";
export {
  formatVnSession,
  vnDateFromUnix,
  vnToday,
  calendarLagDays,
} from "./dates";

const NA = "N/A";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Giá cổ phiếu VN: backend lưu VND, UI luôn hiển thị nghìn VNĐ (66.40). */
export function formatPrice(
  vnd: number | null | undefined,
  digits = 2,
): string {
  if (!isFiniteNumber(vnd)) return NA;
  return (vnd / 1000).toFixed(digits);
}

export function formatIndex(points: number | null | undefined): string {
  if (!isFiniteNumber(points)) return NA;
  return points.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatPercent(
  frac: number | null | undefined,
  digits = 2,
): string {
  if (!isFiniteNumber(frac)) return NA;
  const pct = frac * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(digits)}%`;
}

export function formatPercentPoints(
  pct: number | null | undefined,
  digits = 2,
): string {
  if (!isFiniteNumber(pct)) return NA;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(digits)}%`;
}

export function formatVolume(volume: number | null | undefined): string {
  if (!isFiniteNumber(volume)) return NA;
  const abs = Math.abs(volume);
  if (abs >= 1_000_000_000) return `${(volume / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(volume / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(volume / 1_000).toFixed(1)}K`;
  return Math.round(volume).toString();
}

export function formatNumber(
  value: number | null | undefined,
  digits = 1,
): string {
  if (!isFiniteNumber(value)) return NA;
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(digits);
}

export function formatVnd(vnd: number | null | undefined): string {
  if (!isFiniteNumber(vnd)) return NA;
  const abs = Math.abs(vnd);
  if (abs >= 1_000_000_000_000)
    return `${(vnd / 1_000_000_000_000).toFixed(2)} nghìn tỷ`;
  if (abs >= 1_000_000_000) return `${(vnd / 1_000_000_000).toFixed(2)} tỷ`;
  if (abs >= 1_000_000) return `${(vnd / 1_000_000).toFixed(0)} triệu`;
  return `${Math.round(vnd).toLocaleString("vi-VN")} ₫`;
}

export function formatRr(rr: number | null | undefined): string {
  if (!isFiniteNumber(rr) || rr <= 0) return NA;
  return `1:${rr.toFixed(2)}`;
}

export function formatSignal(signal: Signal): string {
  switch (signal) {
    case "STRONG_BUY":
      return "STRONG BUY";
    case "NO_SIGNAL":
      return "NO SIGNAL";
    default:
      return signal.replaceAll("_", " ");
  }
}

export function signalTone(
  signal: Signal,
): "up" | "down" | "warn" | "hold" | "muted" {
  switch (signal) {
    case "STRONG_BUY":
    case "BUY":
    case "ADD":
      return "up";
    case "EXIT":
    case "SELL":
      return "down";
    case "REDUCE":
    case "WATCH":
    case "FILTERED":
    case "ERROR":
      return "warn";
    case "HOLD":
      return "hold";
    default:
      return "muted";
  }
}

export function formatScore(score: number | null | undefined): string {
  if (!isFiniteNumber(score)) return NA;
  return score.toFixed(1);
}
