import type { ReactNode } from "react";
import { DEFAULT_CONFIG, DEFAULT_WATCHLIST, FULL_WATCHLIST } from "@/lib/quant/config";
import { downloadCsv, scanToCsv } from "@/lib/quant/export-csv";
import { parseHoldings } from "@/lib/quant/holdings";
import { collectScanSymbols, parseWatchlist, useDesk } from "@/lib/quant/store";

export function Sidebar({ onScan }: { onScan: () => void }) {
  const watchlistText = useDesk((s) => s.watchlistText);
  const holdingsText = useDesk((s) => s.holdingsText);
  const apiKey = useDesk((s) => s.apiKey);
  const config = useDesk((s) => s.config);
  const scanning = useDesk((s) => s.scanning);
  const scanDone = useDesk((s) => s.scanDone);
  const scanTotal = useDesk((s) => s.scanTotal);
  const report = useDesk((s) => s.report);
  const setWatchlistText = useDesk((s) => s.setWatchlistText);
  const setHoldingsText = useDesk((s) => s.setHoldingsText);
  const setApiKey = useDesk((s) => s.setApiKey);
  const patchConfig = useDesk((s) => s.patchConfig);
  const resetConfig = useDesk((s) => s.resetConfig);
  const n = collectScanSymbols().length;
  const watchN = parseWatchlist(watchlistText).length;
  const holdN = parseHoldings(holdingsText).length;
  const pct = scanTotal > 0 ? Math.round((scanDone / scanTotal) * 100) : 0;

  return (
    <aside className="flex h-full flex-col gap-5 overflow-y-auto border-r border-border bg-bg-elevated p-4 lg:w-72">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">Watchlist</p>
        <textarea
          value={watchlistText}
          onChange={(e) => setWatchlistText(e.target.value)}
          rows={5}
          spellCheck={false}
          className="mt-2 w-full resize-y rounded-md border border-border bg-bg px-2.5 py-2 font-mono text-xs leading-5 text-fg outline-none focus:border-border-strong"
          placeholder="FPT HPG MWG"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-sm border border-border px-2 py-1 text-[11px] text-muted hover:text-fg"
            onClick={() => setWatchlistText(DEFAULT_WATCHLIST.join(" "))}
          >
            Core 20
          </button>
          <button
            type="button"
            className="rounded-sm border border-border px-2 py-1 text-[11px] text-muted hover:text-fg"
            onClick={() => setWatchlistText(FULL_WATCHLIST.join(" "))}
          >
            Broad {FULL_WATCHLIST.length}
          </button>
          <span className="ml-auto self-center font-mono text-[11px] text-subtle">{watchN} unique</span>
        </div>
      </div>

      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">Existing book</p>
        <textarea
          value={holdingsText}
          onChange={(e) => setHoldingsText(e.target.value)}
          rows={4}
          spellCheck={false}
          className="mt-2 w-full resize-y rounded-md border border-border bg-bg px-2.5 py-2 font-mono text-xs leading-5 text-fg outline-none focus:border-border-strong"
          placeholder={"FPT 96.5 200\nHPG 21.2"}
        />
        <p className="mt-1.5 text-[11px] leading-4 text-subtle">
          One line: TICKER cost(nghìn) [shares]. S7 Dao Găm reads this book. {holdN} held.
        </p>
      </div>

      <Field label="Lookback bars">
        <Num value={config.lookbackBars} onChange={(v) => patchConfig({ lookbackBars: Math.max(60, v) })} />
      </Field>
      <Field label="Buy score">
        <Num value={config.buyScore} onChange={(v) => patchConfig({ buyScore: v })} />
      </Field>
      <Field label="Watch score">
        <Num value={config.watchScore} onChange={(v) => patchConfig({ watchScore: v })} />
      </Field>
      <Field label="Min R:R">
        <Num value={config.minRrSwing} step={0.1} onChange={(v) => patchConfig({ minRrSwing: v })} />
      </Field>
      <Field label="Min T1 %">
        <Num value={config.minTpPct} step={0.5} onChange={(v) => patchConfig({ minTpPct: v })} />
      </Field>
      <Field label="Capital (triệu VNĐ)">
        <Num
          value={config.capital / 1_000_000}
          step={10}
          onChange={(v) => patchConfig({ capital: Math.max(1, v) * 1_000_000 })}
        />
      </Field>
      <Field label="Risk / trade %">
        <Num
          value={config.riskPerTrade * 100}
          step={0.1}
          onChange={(v) => patchConfig({ riskPerTrade: v / 100 })}
        />
      </Field>

      <button
        type="button"
        className="self-start text-[11px] text-subtle underline-offset-2 hover:text-fg hover:underline"
        onClick={resetConfig}
      >
        Reset defaults ({DEFAULT_CONFIG.lookbackBars} / {DEFAULT_CONFIG.buyScore} / {DEFAULT_CONFIG.watchScore} / T1 {DEFAULT_CONFIG.minTpPct}%)
      </button>

      <label className="flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={config.allowNewLongInBear}
          onChange={(e) => patchConfig({ allowNewLongInBear: e.target.checked })}
          className="accent-accent"
        />
        Allow new longs in bear regime
      </label>
      <label className="flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={config.hardGate}
          onChange={(e) => patchConfig({ hardGate: e.target.checked })}
          className="accent-accent"
        />
        Hard liquidity gate (drop instead of score)
      </label>

      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">VNStock key</p>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Optional — public feeds used"
          autoComplete="off"
          className="mt-2 w-full rounded-md border border-border bg-bg px-2.5 py-2 font-mono text-xs text-fg outline-none focus:border-border-strong"
        />
        <p className="mt-1.5 text-[11px] leading-4 text-subtle">
          Stored locally only. Live bars come from public VPS / VNDIRECT feeds — no key required.
        </p>
      </div>

      {scanning && scanTotal > 0 ? (
        <div>
          <div className="mb-1 flex justify-between font-mono text-[11px] text-subtle">
            <span>Scanning</span>
            <span>
              {scanDone}/{scanTotal} · {pct}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface">
            <div className="h-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : null}

      {report ? (
        <button
          type="button"
          className="rounded-sm border border-border px-2 py-1.5 text-[11px] text-muted hover:text-fg"
          onClick={() => downloadCsv(`quorum-vn-${report.asOf}.csv`, scanToCsv(report))}
        >
          Export {report.rows.length} rows CSV
        </button>
      ) : null}

      <button
        type="button"
        onClick={onScan}
        disabled={scanning || n === 0}
        className="mt-auto rounded-md bg-accent px-3 py-2.5 text-sm font-medium text-accent-fg transition-transform duration-150 enabled:hover:brightness-110 enabled:active:scale-[0.98] disabled:opacity-50"
      >
        {scanning
          ? scanTotal
            ? `Scanning ${scanDone}/${scanTotal}…`
            : "Scanning…"
          : `Scan ${n} names`}
      </button>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function Num({
  value,
  onChange,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <input
      type="number"
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full rounded-md border border-border bg-bg px-2.5 py-1.5 font-mono text-xs tabular-nums text-fg outline-none focus:border-border-strong"
    />
  );
}
