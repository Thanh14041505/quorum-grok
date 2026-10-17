import { runScan } from "./api";
import { errorRow, rankRows } from "./engine";
import type { ScanConfig, ScanReport, StockScanRow } from "./types";

/** Batch size keeps each server round under typical function time limits. */
export const SCAN_BATCH_SIZE = 24;

export interface ScanProgress {
  done: number;
  total: number;
  report: ScanReport | null;
}

function emptyReport(): ScanReport {
  return {
    asOf: new Date().toISOString().slice(0, 10),
    regime: "UNKNOWN",
    regimeScore: 0,
    regimeReason: "Waiting for benchmark.",
    benchmarkClose: null,
    rows: [],
    demo: false,
    dataNote: "",
    requested: 0,
  };
}

function mergeBase(base: ScanReport, part: ScanReport): ScanReport {
  const live = !part.demo;
  return {
    ...base,
    asOf: part.asOf || base.asOf,
    regime: part.regime !== "UNKNOWN" ? part.regime : base.regime,
    regimeScore: part.regime !== "UNKNOWN" ? part.regimeScore : base.regimeScore,
    regimeReason: part.regime !== "UNKNOWN" ? part.regimeReason : base.regimeReason,
    benchmarkClose: part.benchmarkClose ?? base.benchmarkClose,
    demo: live ? false : base.demo && part.demo,
    dataNote: live || !base.dataNote ? part.dataNote : base.dataNote,
  };
}

function upsertRows(rows: StockScanRow[], incoming: StockScanRow[]): StockScanRow[] {
  const map = new Map(rows.map((r) => [r.symbol, r]));
  for (const row of incoming) map.set(row.symbol, row);
  return [...map.values()];
}

export async function scanWatchlist(
  symbols: string[],
  config: ScanConfig,
  onProgress?: (info: ScanProgress) => void,
): Promise<ScanReport> {
  const uniq = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  const total = uniq.length;
  let rows: StockScanRow[] = [];
  let base = emptyReport();
  base.requested = total;
  base.demo = true;

  onProgress?.({ done: 0, total, report: { ...base, rows: [] } });

  for (let i = 0; i < uniq.length; i += SCAN_BATCH_SIZE) {
    const batch = uniq.slice(i, i + SCAN_BATCH_SIZE);
    try {
      const part = await runScan({ data: { symbols: batch, config } });
      base = mergeBase(base, part);
      rows = upsertRows(rows, part.rows);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      rows = upsertRows(
        rows,
        batch.map((symbol) => errorRow(symbol, message)),
      );
    }
    const report: ScanReport = {
      ...base,
      requested: total,
      rows: rankRows(rows),
    };
    onProgress?.({
      done: Math.min(i + SCAN_BATCH_SIZE, total),
      total,
      report,
    });
  }

  return {
    ...base,
    requested: total,
    rows: rankRows(rows),
  };
}
