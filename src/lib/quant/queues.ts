import type { Signal, StockScanRow } from "./types";

const BUY_SIDE: Signal[] = ["STRONG_BUY", "BUY"];
const WATCH_SIDE: Signal[] = ["WATCH", "HOLD", "ADD"];
const EXIT_SIDE: Signal[] = ["EXIT", "REDUCE", "SELL"];

export type DeskView = "ALL" | "BUY" | "WATCH" | "EXIT" | "CONFLICT" | "HOLD" | "GROK" | "SMC";

export function inView(row: StockScanRow, view: DeskView): boolean {
  if (view === "ALL") return true;
  if (view === "CONFLICT") return row.consensus.conflict === "HIGH" || row.consensus.conflict === "MEDIUM";
  if (view === "HOLD") {
    const s7 = row.strategies.find((s) => s.shortId === "S7");
    return s7 != null && ["ADD", "HOLD", "REDUCE", "EXIT"].includes(s7.signal);
  }
  if (view === "GROK") {
    const s = row.grokCall?.stance;
    return s === "LEAN_LONG" || s === "SCALE_IN";
  }
  if (view === "SMC") {
    return row.smc?.fresh === "BUY";
  }
  if (view === "BUY") return BUY_SIDE.includes(row.consensus.signal);
  if (view === "WATCH") return WATCH_SIDE.includes(row.consensus.signal);
  if (view === "EXIT") return EXIT_SIDE.includes(row.consensus.signal);
  return true;
}

export function queueCounts(rows: StockScanRow[]) {
  return {
    buy: rows.filter((r) => BUY_SIDE.includes(r.consensus.signal)).length,
    watch: rows.filter((r) => WATCH_SIDE.includes(r.consensus.signal)).length,
    exit: rows.filter((r) => EXIT_SIDE.includes(r.consensus.signal)).length,
    conflict: rows.filter((r) => r.consensus.conflict === "HIGH" || r.consensus.conflict === "MEDIUM").length,
    hold: rows.filter((r) => {
      const s7 = r.strategies.find((s) => s.shortId === "S7");
      return s7 != null && ["ADD", "HOLD", "REDUCE", "EXIT"].includes(s7.signal);
    }).length,
    grok: rows.filter((r) => r.grokCall?.stance === "LEAN_LONG" || r.grokCall?.stance === "SCALE_IN").length,
    smc: rows.filter((r) => r.smc?.fresh === "BUY").length,
  };
}

export function topQueue(rows: StockScanRow[], view: DeskView, n = 8): StockScanRow[] {
  return rows.filter((r) => inView(r, view) && r.status !== "ERROR").slice(0, n);
}
