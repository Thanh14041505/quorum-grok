import { useMemo, useState } from "react";
import { SignalBadge } from "@/components/ui/badge-signal";
import { Sparkline } from "@/components/desk/sparkline";
import { TickerButton } from "@/components/desk/ticker-button";
import { downloadCsv, scanToCsv } from "@/lib/quant/export-csv";
import { formatPercent, formatPrice, formatRr, formatVolume } from "@/lib/quant/format";
import { inView } from "@/lib/quant/queues";
import { signalClass } from "@/lib/quant/signal-style";
import type { ScanReport, Signal, StockScanRow } from "@/lib/quant/types";
import { STRATEGIES } from "@/lib/quant/engine";
import { grokStanceClass, grokStanceCompact } from "@/lib/quant/grok-call";
import { smcFreshClass } from "@/lib/quant/smc";
import { useDesk } from "@/lib/quant/store";

type StatusFilter = "ALL" | "OK" | "FILTERED" | "ERROR";
type SortMode = "signal" | "ticker";

export function ScannerTable({
  report,
  onSelect,
}: {
  report: ScanReport;
  onSelect: (symbol: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [sort, setSort] = useState<SortMode>("signal");
  const view = useDesk((s) => s.view);

  const counts = useMemo(() => {
    let ok = 0;
    let filtered = 0;
    let error = 0;
    for (const row of report.rows) {
      if (row.status === "OK") ok++;
      else if (row.status === "FILTERED") filtered++;
      else error++;
    }
    return { ok, filtered, error, total: report.rows.length, requested: report.requested ?? report.rows.length };
  }, [report]);

  const rows = useMemo(() => {
    const q = query.trim().toUpperCase();
    let next = report.rows.filter((row) => {
      if (status !== "ALL" && row.status !== status) return false;
      if (!inView(row, view)) return false;
      if (q && !row.symbol.includes(q)) return false;
      return true;
    });
    if (sort === "ticker") next = [...next].sort((a, b) => a.symbol.localeCompare(b.symbol));
    return next;
  }, [report.rows, query, status, sort, view]);

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search ticker (HQC, FPT…)"
          spellCheck={false}
          className="w-full rounded-md border border-border bg-bg px-2.5 py-1.5 font-mono text-xs text-fg outline-none focus:border-border-strong sm:max-w-xs"
        />
        <div className="flex flex-wrap gap-1.5">
          <Chip active={status === "ALL"} onClick={() => setStatus("ALL")} label={`All ${counts.total}`} />
          <Chip active={status === "OK"} onClick={() => setStatus("OK")} label={`OK ${counts.ok}`} />
          <Chip active={status === "FILTERED"} onClick={() => setStatus("FILTERED")} label={`Filtered ${counts.filtered}`} />
          <Chip active={status === "ERROR"} onClick={() => setStatus("ERROR")} label={`Error ${counts.error}`} />
        </div>
        <div className="flex flex-wrap gap-1.5 sm:ml-auto">
          <Chip active={sort === "signal"} onClick={() => setSort("signal")} label="By signal" />
          <Chip active={sort === "ticker"} onClick={() => setSort("ticker")} label="A–Z" />
          <button
            type="button"
            className="rounded-sm border border-border px-2 py-1 text-[11px] text-muted hover:text-fg"
            onClick={() => downloadCsv(`quorum-vn-${report.asOf}.csv`, scanToCsv(report))}
          >
            Export CSV
          </button>
        </div>
      </div>
      <p className="font-mono text-[11px] text-subtle">
        Showing {rows.length} of {counts.total} scanned
        {view !== "ALL" ? ` · queue ${view}` : ""}
        {counts.requested !== counts.total ? ` · requested ${counts.requested}` : ""}
        {query ? ` · filter “${query.trim().toUpperCase()}”` : ""}
      </p>

      <div className="max-h-[calc(100vh-18rem)] overflow-auto rounded-lg border border-border bg-bg-elevated">
        <table className="min-w-[1480px] w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-20 bg-bg-elevated">
            <tr className="border-b border-border text-[10px] uppercase tracking-[0.14em] text-subtle">
              <th className="sticky left-0 z-30 bg-bg-elevated px-3 py-2 font-medium">Ticker</th>
              <th className="px-2 py-2 font-medium">20D</th>
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="px-2 py-2 font-medium">Price</th>
              <th className="px-2 py-2 font-medium">Chg</th>
              <th className="px-2 py-2 font-medium">Vol</th>
              {STRATEGIES.map((s) => (
                <th key={s.meta.id} className="px-1.5 py-2 text-center font-medium">
                  {s.meta.shortId}
                </th>
              ))}
              <th className="px-2 py-2 font-medium">Consensus</th>
              <th className="px-2 py-2 font-medium">Call</th>
              <th className="px-2 py-2 font-medium">SMC</th>
              <th className="px-2 py-2 font-medium">Conflict</th>
              <th className="px-2 py-2 font-medium">Entry</th>
              <th className="px-2 py-2 font-medium">SL</th>
              <th className="px-2 py-2 font-medium">TP1</th>
              <th className="px-2 py-2 font-medium">R:R</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.symbol}
                className={
                  "cursor-pointer border-b border-border/70 hover:bg-surface " +
                  (row.status !== "OK" ? "opacity-80" : "")
                }
                onClick={() => onSelect(row.symbol)}
              >
                <td className="sticky left-0 z-10 bg-bg-elevated px-3 py-2">
                  <TickerButton symbol={row.symbol} className="font-medium tracking-wide text-fg hover:underline">
                    {row.symbol}
                  </TickerButton>
                  {row.sessionDate ? (
                    <p className={"mt-0.5 font-mono text-[10px] " + ((row.sessionLagDays ?? 0) > 1 ? "text-warn" : "text-subtle")}>
                      {row.sessionDate}
                    </p>
                  ) : null}
                  {row.filterReason ? (
                    <p className="mt-0.5 max-w-[9rem] truncate font-mono text-[10px] text-subtle">
                      {row.filterReason}
                    </p>
                  ) : null}
                </td>
                <td className="px-2 py-1">
                  <Sparkline values={row.spark ?? []} />
                </td>
                <td className="px-2 py-2 font-mono text-[10px] text-muted">{statusLabel(row)}</td>
                <td className="px-2 py-2 font-mono tabular-nums">{formatPrice(row.price)}</td>
                <td
                  className={
                    "px-2 py-2 font-mono tabular-nums " +
                    (row.changePct > 0 ? "text-up" : row.changePct < 0 ? "text-down" : "text-muted")
                  }
                >
                  {formatPercent(row.changePct)}
                </td>
                <td className="px-2 py-2 font-mono tabular-nums text-muted">{formatVolume(row.volume)}</td>
                {row.strategies.map((s) => (
                  <td key={s.id} className="px-1.5 py-2 text-center">
                    <SignalBadge signal={s.signal} compact />
                  </td>
                ))}
                <td className="px-2 py-2">
                  <span className={"rounded-sm px-1.5 py-0.5 font-mono text-[10px] " + signalClass(row.consensus.signal as Signal)}>
                    {row.consensus.signal.replaceAll("_", " ")} {row.consensus.agreement}/{row.consensus.total}
                  </span>
                </td>
                <td className="px-2 py-2">
                  {row.grokCall ? (
                    <span className={"rounded-sm px-1.5 py-0.5 font-mono text-[10px] " + grokStanceClass(row.grokCall.stance)}>
                      {grokStanceCompact(row.grokCall.stance)}
                    </span>
                  ) : (
                    <span className="text-subtle">—</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  {row.smc ? (
                    <span className={"rounded-sm px-1.5 py-0.5 font-mono text-[10px] " + smcFreshClass(row.smc.fresh)}>
                      {row.smc.bias === "BULL" ? "BULL" : row.smc.bias === "BEAR" ? "BEAR" : "RNG"} {row.smc.fresh}
                    </span>
                  ) : (
                    <span className="text-subtle">—</span>
                  )}
                </td>
                <td className={"px-2 py-2 font-mono text-[11px] " + conflictTone(row.consensus.conflict)}>
                  {row.consensus.conflict}
                </td>
                <td className="px-2 py-2 font-mono tabular-nums">{formatPrice(row.entry)}</td>
                <td className="px-2 py-2 font-mono tabular-nums">{formatPrice(row.sl)}</td>
                <td className="px-2 py-2 font-mono tabular-nums">{formatPrice(row.tp1)}</td>
                <td className="px-2 py-2 font-mono tabular-nums">{formatRr(row.rr)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={15 + STRATEGIES.length} className="px-3 py-8 text-center text-sm text-muted">
                  No rows match this filter. Clear search or switch queue to All.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function statusLabel(row: StockScanRow): string {
  if (row.status === "OK") return "OK";
  if (row.status === "FILTERED") return row.filterReason ?? "FILTERED";
  return row.error ?? "ERROR";
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-sm border px-2 py-1 text-[11px] " +
        (active ? "border-border-strong bg-surface text-fg" : "border-border text-muted hover:text-fg")
      }
    >
      {label}
    </button>
  );
}

function conflictTone(c: string): string {
  if (c === "HIGH") return "text-down";
  if (c === "MEDIUM") return "text-warn";
  if (c === "LOW") return "text-hold";
  return "text-subtle";
}
