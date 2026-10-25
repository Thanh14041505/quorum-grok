import type { ScanConfig, StrategyResult } from "./types";
import { rrFrom } from "./strategies/contract";
import { isLongTicket } from "./smc";
import type { TradePlan } from "./types";

export interface RiskOverlay {
  entry: number | null;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  rr: number | null;
  riskPct: number | null;
  positionSize: number | null;
  lotShares: number | null;
}

/**
 * VN long-only: SL phải dưới giá, TP phải trên giá.
 * Ưu tiên ticket S9 SMC nếu hợp lệ — không đảo bias bear thành short.
 */
export function overlayRisk(
  price: number,
  results: StrategyResult[],
  cfg: ScanConfig,
  smc?: StrategyResult,
): RiskOverlay {
  const empty = {
    entry: null,
    sl: null,
    tp1: null,
    tp2: null,
    rr: null,
    riskPct: null,
    positionSize: null,
    lotShares: null,
  };
  const fresh = smc?.extras.fresh;
  // Bias bear / SKIP: không đảo thành short, cũng không giữ ticket long của não khác.
  if (fresh === "SKIP") return empty;
  if (smc && isLongTicket(price, smc.entry, smc.sl, smc.tp1)) {
    return size(smc.entry!, smc.sl!, smc.tp1, smc.tp2, cfg);
  }
  const withLevels = results.filter((r) =>
    isLongTicket(price, r.entry, r.sl, r.tp1),
  );
  if (!withLevels.length) return empty;
  const mid = (arr: number[]) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)]!;
  };
  const entry = mid(withLevels.map((r) => r.entry!));
  const sl = mid(withLevels.map((r) => r.sl!));
  const tp1 = mid(withLevels.map((r) => r.tp1!));
  const tp2s = withLevels
    .map((r) => r.tp2)
    .filter((v): v is number => v != null && v > tp1);
  const tp2 = tp2s.length ? mid(tp2s) : null;
  if (!isLongTicket(price, entry, sl, tp1)) return empty;
  return size(entry, sl, tp1, tp2, cfg);
}

function size(
  entry: number,
  sl: number,
  tp1: number | null,
  tp2: number | null,
  cfg: ScanConfig,
  riskMultiplier = 1,
): RiskOverlay {
  const rr = rrFrom(entry, sl, tp1);
  const riskFrac = (entry - sl) / entry;
  const rawSize =
    (cfg.capital * cfg.riskPerTrade * riskMultiplier) /
    Math.max(entry - sl, entry * 0.01);
  const maxShares = (cfg.capital * cfg.maxPositionPct) / entry;
  const shares = Math.floor(Math.min(rawSize, maxShares) / 100) * 100;
  return {
    entry,
    sl,
    tp1,
    tp2,
    rr,
    riskPct: riskFrac * 100,
    positionSize: shares > 0 ? shares * entry : null,
    lotShares: shares > 0 ? shares : null,
  };
}

export { overlayRisk as computeRisk };

/**
 * Size one already-selected setup ticket. Unlike the legacy overlay, this
 * never takes medians of unrelated strategy levels. The caller must first
 * decide that the setup is actionable; WATCH/NO_TRADE must not call this.
 */
export function sizePlannedTicket(
  price: number,
  ticket: Pick<TradePlan, "entry" | "sl" | "tp1" | "tp2">,
  cfg: ScanConfig,
  riskMultiplier = 1,
): RiskOverlay {
  const empty: RiskOverlay = {
    entry: null,
    sl: null,
    tp1: null,
    tp2: null,
    rr: null,
    riskPct: null,
    positionSize: null,
    lotShares: null,
  };
  const { entry, sl, tp1, tp2 } = ticket;
  if (
    entry == null ||
    sl == null ||
    tp1 == null ||
    ![price, entry, sl, tp1].every(Number.isFinite) ||
    !isLongTicket(price, entry, sl, tp1) ||
    !(riskMultiplier > 0)
  )
    return empty;

  return size(entry, sl, tp1, tp2, cfg, riskMultiplier);
}
