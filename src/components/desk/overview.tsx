import { calendarLagDays, formatIndex, vnToday } from "@/lib/quant/format";
import { breadth } from "@/lib/quant/playbook";
import type { ScanReport } from "@/lib/quant/types";
import { useDesk } from "@/lib/quant/store";

export function OverviewBar({ report }: { report: ScanReport }) {
  const b = breadth(report);
  const requested = report.requested ?? report.rows.length;
  const filtered = report.rows.filter((r) => r.status === "FILTERED").length;
  const errors = report.rows.filter((r) => r.status === "ERROR").length;

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      <Stat
        label="Session"
        value={report.asOf || "N/A"}
        hint={
          report.stale || calendarLagDays(report.asOf) > 0
            ? `Vietnam today ${vnToday()} · ${calendarLagDays(report.asOf)}d lag`
            : "Asia/Ho Chi Minh · latest daily bar"
        }
        warn={Boolean(report.stale)}
      />
      <Stat
        label="VNINDEX regime"
        value={`${report.regime.replaceAll("_", " ")}`}
        hint={Number.isFinite(report.regimeScore) ? `${report.regimeScore.toFixed(0)} · ${formatIndex(report.benchmarkClose)}` : undefined}
      />
      <Stat label="Buy-side" value={String(b.buy)} hint={`${b.buyPct.toFixed(0)}% scored · ${b.watch} watch · SMC ${b.smc}`} />
      <Stat label="Exit risk" value={String(b.exit)} hint={`${b.conflict} conflict`} />
      <Stat label="Grok longs" value={String(b.grok)} hint="SCALE IN / LEAN LONG — my call, not a vote" />
      <Stat
        label="Universe"
        value={`${report.rows.length}/${requested}`}
        hint={`${b.ok} ok · ${filtered} filtered · ${errors} err${report.demo ? " · Demo" : " · Live"}`}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-bg-elevated px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-[0.16em] text-subtle">{label}</p>
      <p className={"mt-1 font-medium tabular-nums " + (warn ? "text-warn" : "text-fg")}>{value}</p>
      {hint ? <p className={"mt-0.5 font-mono text-[11px] " + (warn ? "text-warn" : "text-muted")}>{hint}</p> : null}
    </div>
  );
}

export function RegimeNote({ report }: { report: ScanReport }) {
  const cfg = useDesk((s) => s.config);
  const b = breadth(report);
  const bear = report.regime === "BEAR" || report.regime === "STRONG_BEAR";
  return (
    <div className="rounded-lg border border-border bg-bg-elevated px-3 py-3">
      <p className="text-[10px] uppercase tracking-[0.16em] text-subtle">Morning playbook</p>
      <p className="mt-1.5 text-sm leading-6 text-fg">{b.line}</p>
      <p className="mt-1 text-xs leading-5 text-muted">
        {report.regimeReason}. {report.dataNote}
        {report.demo ? " Signals are for UI validation only." : ""}
      </p>
      <p className="mt-2 text-xs leading-5 text-muted">
        Grok call is independent: I can WAIT when consensus is BUY, and PROTECT when some brains are still long. High conflict never becomes a long. SMC is long-only — bearish structure is skip/cut, never a short ticket.
      </p>
      {report.stale ? (
        <p className="mt-2 text-xs text-warn">
          Last bar is not the current Vietnam session. Do not trade this tape — hit Scan again.
        </p>
      ) : null}
      {bear && !cfg.allowNewLongInBear ? (
        <p className="mt-2 text-xs text-warn">
          Regime gate on: new longs capped. S7 still talks for names you already hold.
        </p>
      ) : null}
    </div>
  );
}
