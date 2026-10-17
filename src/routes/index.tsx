import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { ActionBoard } from "@/components/desk/action-board";
import { AppShell } from "@/components/desk/app-shell";
import { StockDetail } from "@/components/desk/detail";
import { HoldingsPanel } from "@/components/desk/holdings-panel";
import { OverviewBar, RegimeNote } from "@/components/desk/overview";
import { ScannerTable } from "@/components/desk/scanner-table";
import { Sidebar } from "@/components/desk/sidebar";
import { scanWatchlist } from "@/lib/quant/client-scan";
import { runScan } from "@/lib/quant/api";
import { collectScanSymbols, useDesk } from "@/lib/quant/store";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const report = useDesk((s) => s.report);
  const scanning = useDesk((s) => s.scanning);
  const error = useDesk((s) => s.error);
  const config = useDesk((s) => s.config);
  const selected = useDesk((s) => s.selected);
  const setSelected = useDesk((s) => s.setSelected);

  async function handleScan() {
    const symbols = collectScanSymbols();
    if (!symbols.length) return;
    useDesk.getState().setScanning(true);
    useDesk.getState().setError(null);
    useDesk.getState().setProgress(0, symbols.length);
    try {
      const next = await scanWatchlist(symbols, config, ({ done, total, report: partial }) => {
        useDesk.getState().setProgress(done, total);
        if (partial) useDesk.getState().setReport(partial);
      });
      useDesk.getState().setReport(next);
      useDesk.getState().setProgress(next.rows.length, symbols.length);
    } catch (err) {
      useDesk.getState().setError(err instanceof Error ? err.message : String(err));
    } finally {
      useDesk.getState().setScanning(false);
    }
  }

  useEffect(() => {
    if (!useDesk.getState().report && !useDesk.getState().scanning) {
      void handleScan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const row = selected ? report?.rows.find((r) => r.symbol === selected) : undefined;

  useEffect(() => {
    if (!selected || row) return;
    let cancelled = false;
    void runScan({ data: { symbols: [selected], config } })
      .then((next) => {
        if (cancelled) return;
        const prev = useDesk.getState().report;
        if (!prev) useDesk.getState().setReport(next);
        else {
          useDesk.getState().setReport({
            ...prev,
            rows: [...prev.rows.filter((r) => r.symbol !== selected), ...next.rows],
          });
        }
      })
      .catch((err) => {
        if (!cancelled) useDesk.getState().setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [selected, row, config]);

  useEffect(() => {
    if (selected) window.scrollTo({ top: 0, behavior: "auto" });
  }, [selected]);

  return (
    <AppShell sidebar={<Sidebar onScan={() => void handleScan()} />}>
      {selected ? (
        <div className="space-y-4">
          <button
            type="button"
            className="text-xs uppercase tracking-[0.16em] text-subtle hover:text-fg"
            onClick={() => setSelected(null)}
          >
            ← Daily desk
          </button>
          {row ? (
            <StockDetail row={row} />
          ) : (
            <div className="h-64 animate-pulse rounded-lg bg-surface" />
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-medium tracking-tight">Daily desk</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
              Shared bars. Seven brains vote. S8 Tape and S9 SMC read the chart and do not vote.
              SMC is long-only: bearish structure means skip/cut, never a short ticket.
            </p>
          </div>

          {error ? (
            <p className="rounded-md border border-down-dim bg-down-dim px-3 py-2 text-sm text-down">{error}</p>
          ) : null}

          {scanning && !report ? (
            <div className="space-y-2">
              <div className="h-16 animate-pulse rounded-md bg-surface" />
              <div className="h-64 animate-pulse rounded-lg bg-surface" />
            </div>
          ) : null}

          {report ? (
            <>
              <OverviewBar report={report} />
              <RegimeNote report={report} />
              <ActionBoard report={report} />
              <HoldingsPanel report={report} />
              {scanning ? (
                <p className="text-xs text-subtle">Refreshing batches — rows appear as each group finishes.</p>
              ) : null}
              <ScannerTable report={report} onSelect={(symbol) => setSelected(symbol)} />
            </>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}
