import { grokStanceClass, grokStanceLabel } from "@/lib/quant/grok-call";
import { formatPrice } from "@/lib/quant/format";
import type { GrokCall } from "@/lib/quant/types";

export function GrokCallCard({ call, sessionDate }: { call: GrokCall; sessionDate?: string }) {
  return (
    <section className="rounded-lg border border-border-strong bg-bg-elevated p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">
          Grok call · not a 7-brain vote{sessionDate ? ` · phiên ${sessionDate}` : ""}
        </p>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          Conviction {call.conviction}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={"rounded-sm px-2 py-1 font-mono text-xs font-medium " + grokStanceClass(call.stance)}>
          {grokStanceLabel(call.stance)}
        </span>
        {call.disagreesWithConsensus ? (
          <span className="rounded-sm bg-warn-dim px-2 py-1 font-mono text-[10px] text-warn">Disagrees with consensus</span>
        ) : null}
      </div>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-fg">{call.headline}</p>
      {call.why.length ? (
        <ul className="mt-3 space-y-1">
          {call.why.map((w) => (
            <li key={w} className="flex gap-2 text-xs leading-5 text-muted">
              <span className="text-subtle">·</span>
              <span>{w}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Meta label="Invalidation" value={call.invalidation ? `${formatPrice(call.invalidation)} nghìn` : "N/A"} />
        <Meta label="Horizon" value={call.horizon} />
        <Meta
          label="Grok levels"
          value={
            call.entry && call.sl && call.sl < call.entry
              ? `${formatPrice(call.entry)} → stop ${formatPrice(call.sl)}${call.tp1 ? ` · TP ${formatPrice(call.tp1)}` : ""}`
              : "No long ticket"
          }
        />
      </div>
      <p className="mt-3 text-xs leading-5 text-muted">
        Change my mind: {call.changeMind}
      </p>
    </section>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.14em] text-subtle">{label}</p>
      <p className="mt-1 font-mono text-xs text-fg">{value}</p>
    </div>
  );
}
