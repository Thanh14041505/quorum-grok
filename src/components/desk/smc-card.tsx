import type { SmcSummary } from "@/lib/quant/types";
import { formatPrice, formatRr } from "@/lib/quant/format";

export function SmcCard({ smc, held }: { smc: SmcSummary; held: boolean }) {
  const action = held ? smc.held : smc.fresh;
  const actionClass =
    action === "BUY" || action === "ADD"
      ? "bg-up-dim text-up"
      : action === "SKIP" || action === "CUT" || action === "REDUCE"
        ? "bg-down-dim text-down"
        : "bg-warn-dim text-warn";
  const hasTicket = smc.sl != null && smc.tp1 != null && smc.entryLow != null;
  return (
    <section className="rounded-lg border border-border-strong bg-bg-elevated p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">SMC · long only · chart structure</p>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          D {smc.bias} · W {smc.weeklyBias ?? "—"} · M {smc.monthlyBias ?? "—"} · {smc.event} · {smc.pd}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={"rounded-sm px-2 py-1 font-mono text-xs font-medium " + actionClass}>
          {held ? `HOLDING · ${smc.held}` : `FRESH · ${smc.fresh}`}
        </span>
        {held ? (
          <span className="font-mono text-[10px] text-subtle">Fresh would be {smc.fresh}</span>
        ) : (
          <span className="font-mono text-[10px] text-subtle">If held: {smc.held}</span>
        )}
      </div>
      <p className="mt-3 text-sm leading-6 text-fg">{smc.thesis}</p>
      {hasTicket ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Lvl label="Zone" value={`${formatPrice(smc.entryLow)}–${formatPrice(smc.entryHigh)}`} />
          <Lvl label="SL" value={formatPrice(smc.sl)} />
          <Lvl label="TP1 / TP2" value={`${formatPrice(smc.tp1)} · ${formatPrice(smc.tp2)}`} />
          <Lvl label="R:R" value={formatRr(smc.rr)} />
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted">
          {smc.bias === "BEAR" || smc.fresh === "SKIP"
            ? "No long ticket. Bearish structure is skip/cut — VN cash cannot short, so entry/SL/TP are not inverted."
            : smc.pd === "PREMIUM"
              ? "Bullish map, but price is in premium. Do not chase. Wait for a discount POI; no market long."
              : "No valid long geometry yet (SL must sit under last price, TP above it)."}
        </p>
      )}
    </section>
  );
}

function Lvl({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-[0.14em] text-subtle">{label}</p>
      <p className="mt-1 font-mono text-xs tabular-nums text-fg">{value}</p>
    </div>
  );
}
