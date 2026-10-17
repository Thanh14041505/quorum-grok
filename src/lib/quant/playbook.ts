import { grokLongs } from "./grok-call";
import type { ScanConfig, ScanReport, StockScanRow } from "./types";
import { formatPrice, formatRr } from "./format";

export interface Breadth {
  ok: number;
  buy: number;
  watch: number;
  exit: number;
  conflict: number;
  grok: number;
  smc: number;
  buyPct: number;
  exitPct: number;
  line: string;
}

export function breadth(report: ScanReport): Breadth {
  const okRows = report.rows.filter((r) => r.status === "OK");
  const ok = okRows.length || 1;
  const buy = okRows.filter((r) => r.consensus.signal === "BUY" || r.consensus.signal === "STRONG_BUY").length;
  const watch = okRows.filter((r) => r.consensus.signal === "WATCH" || r.consensus.signal === "HOLD" || r.consensus.signal === "ADD").length;
  const exit = okRows.filter((r) => r.consensus.signal === "EXIT" || r.consensus.signal === "REDUCE" || r.consensus.signal === "SELL").length;
  const conflict = okRows.filter((r) => r.consensus.conflict === "HIGH" || r.consensus.conflict === "MEDIUM").length;
  const grok = grokLongs(okRows);
  const smc = okRows.filter((r) => r.smc?.fresh === "BUY").length;
  const buyPct = (buy / ok) * 100;
  const exitPct = (exit / ok) * 100;
  const line = `${okRows.length} scored · buy ${buy} (${buyPct.toFixed(0)}%) · watch ${watch} · exit-risk ${exit} (${exitPct.toFixed(0)}%) · conflict ${conflict} · Grok longs ${grok} · SMC longs ${smc}`;
  return { ok: okRows.length, buy, watch, exit, conflict, grok, smc, buyPct, exitPct, line };
}

export interface PriceLevel {
  label: string;
  value: number;
  kind: "support" | "resist" | "value" | "entry";
}

export function extractLevels(row: StockScanRow): PriceLevel[] {
  const out: PriceLevel[] = [];
  const push = (label: string, raw: unknown, kind: PriceLevel["kind"]) => {
    const v = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(v) || v <= 0) return;
    out.push({ label, value: v, kind });
  };
  const s2 = row.strategies.find((s) => s.shortId === "S2")?.extras ?? {};
  const s4 = row.strategies.find((s) => s.shortId === "S4")?.extras ?? {};
  const s7 = row.strategies.find((s) => s.shortId === "S7")?.extras ?? {};
  const s8 = row.strategies.find((s) => s.shortId === "S8")?.extras ?? {};
  const smc = row.smc;
  push("Kijun D1", s2.kijun, "support");
  push("Kumo top", s2.cloudTop, "resist");
  push("Kumo bot", s2.cloudBot, "support");
  push("POC", s4.poc, "value");
  push("VAH", s4.vah, "resist");
  push("VAL", s4.val, "support");
  push("Dao găm Kijun", s7.d1KijunFlat, "support");
  push("Dao găm SSB", s7.d1SsbFlat, "support");
  push("MA65", s7.ma65, "support");
  push("MA129", s7.ma129, "support");
  push("Swing low", s8.swingLow, "support");
  push("Swing high", s8.swingHigh, "resist");
  push("Donchian high", s8.high20, "resist");
  push("Donchian low", s8.low20, "support");
  if (smc?.eq) push("SMC EQ", smc.eq, "value");
  if (smc?.poiLow) push("SMC POI low", smc.poiLow, "support");
  if (smc?.poiHigh) push("SMC POI high", smc.poiHigh, "entry");
  if (smc?.swingLow) push("SMC swing low", smc.swingLow, "support");
  if (smc?.swingHigh) push("SMC swing high", smc.swingHigh, "resist");
  if (smc?.sl) push("SMC SL", smc.sl, "support");
  if (smc?.tp1) push("SMC TP1", smc.tp1, "resist");
  if (row.entry) push("Desk entry", row.entry, "entry");
  if (row.sl) push("Desk stop", row.sl, "support");
  if (row.tp1) push("Desk TP1", row.tp1, "resist");
  const seen = new Set<string>();
  return out.filter((l) => {
    const k = `${l.label}:${l.value.toFixed(0)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export interface Ticket {
  entry: number;
  sl: number;
  tp1: number | null;
  tp2: number | null;
  rr: number | null;
  riskPct: number;
  shares: number;
  notional: number;
  gated: boolean;
  gateReason: string | null;
}

export function buildTicket(row: StockScanRow, cfg: ScanConfig): Ticket | null {
  if (!row.entry || !row.sl || row.entry <= row.sl) return null;
  // Long-only: không cấp ticket nếu SL ≥ giá hoặc TP ≤ giá.
  if (row.sl >= row.price) return null;
  if (row.tp1 != null && row.tp1 <= row.price) return null;
  const riskPerShare = row.entry - row.sl;
  const raw = (cfg.capital * cfg.riskPerTrade) / Math.max(riskPerShare, row.entry * 0.01);
  const cap = (cfg.capital * cfg.maxPositionPct) / row.entry;
  const shares = Math.floor(Math.min(raw, cap) / 100) * 100;
  const rr = row.rr;
  const minTargetApplies = row.tradePlan?.setupType !== "DOWNTREND_RELIEF_RALLY";
  const gated = (rr != null && rr < cfg.minRrSwing) ||
    (minTargetApplies && row.tp1 != null && (row.tp1 / row.entry - 1) * 100 < cfg.minTpPct);
  let gateReason: string | null = null;
  if (rr != null && rr < cfg.minRrSwing) gateReason = `R:R ${formatRr(rr)} below min ${cfg.minRrSwing.toFixed(1)}`;
  else if (minTargetApplies && row.tp1 != null && (row.tp1 / row.entry - 1) * 100 < cfg.minTpPct) {
    gateReason = `TP1 ${formatPrice(row.tp1)} is under min T1 ${cfg.minTpPct}%`;
  }
  return {
    entry: row.entry,
    sl: row.sl,
    tp1: row.tp1,
    tp2: row.tp2,
    rr,
    riskPct: (riskPerShare / row.entry) * 100,
    shares,
    notional: shares * row.entry,
    gated,
    gateReason,
  };
}

export function thesis(row: StockScanRow): string {
  const { consensus } = row;
  const smcBit = row.smc
    ? ` SMC ${row.smc.bias}/${row.smc.fresh} (${row.smc.pd}).`
    : "";
  const planBit = row.tradePlan
    ? ` Setup ${row.tradePlan.setupType}: ${row.tradePlan.decision}. ${row.tradePlan.summary}`
    : "";
  const bulls = consensus.bullish.length ? consensus.bullish.join(" ") : "no brain";
  const bears = consensus.bearish.length ? consensus.bearish.join(" ") : "none";
  if (consensus.signal === "FILTERED" || consensus.signal === "ERROR") {
    return row.filterReason ?? consensus.summary[0] ?? "No live signal.";
  }
  if (row.smc?.fresh === "SKIP") {
    return `Chart structure is not a long.${smcBit} ${row.smc.thesis}`;
  }
  if (consensus.conflict === "HIGH") {
    return `Disagreement is the signal: ${bulls} vs ${bears}. Do not average into HIGH conflict.${smcBit}${planBit}`;
  }
  if (consensus.signal === "STRONG_BUY" || consensus.signal === "BUY") {
    return `${bulls} want the long. Selling camp: ${bears}. Conflict ${consensus.conflict}.${smcBit}${planBit}`;
  }
  if (consensus.signal === "EXIT" || consensus.signal === "REDUCE" || consensus.signal === "SELL") {
    return `${bears} are cutting. Buying camp: ${bulls}. Protect first.${smcBit}${planBit}`;
  }
  return `Split tape — buy-side ${consensus.agreement}/${consensus.total}.${smcBit} ${planBit} ${consensus.summary[0] ?? ""}`.trim();
}
