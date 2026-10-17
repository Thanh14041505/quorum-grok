import { queueCounts, topQueue, type DeskView } from "@/lib/quant/queues";
import { formatPrice } from "@/lib/quant/format";
import { signalClass } from "@/lib/quant/signal-style";
import type { ScanReport } from "@/lib/quant/types";
import { useDesk } from "@/lib/quant/store";
import { grokStanceClass } from "@/lib/quant/grok-call";
import { parseHoldings } from "@/lib/quant/holdings";
import { TickerButton } from "@/components/desk/ticker-button";

export function ActionBoard({ report }: { report: ScanReport }) {
  const view = useDesk((s) => s.view);
  const setView = useDesk((s) => s.setView);
  const holdingsText = useDesk((s) => s.holdingsText);
  const held = parseHoldings(holdingsText).length;
  const counts = queueCounts(report.rows);
  const lanes: Array<{ id: DeskView; label: string; count: number; hint: string }> = [
    { id: "GROK", label: "Grok longs", count: counts.grok, hint: "My call: SCALE IN / LEAN LONG" },
    { id: "SMC", label: "SMC longs", count: counts.smc, hint: "Discount POI in bullish structure" },
    { id: "BUY", label: "Buy queue", count: counts.buy, hint: "Consensus BUY / STRONG BUY" },
    { id: "WATCH", label: "Watch", count: counts.watch, hint: "WATCH / HOLD / ADD" },
    { id: "EXIT", label: "Exit risk", count: counts.exit, hint: "EXIT / REDUCE / SELL" },
    { id: "CONFLICT", label: "Conflict", count: counts.conflict, hint: "Brains disagree — do not average" },
  ];
  if (held) {
    lanes.push({ id: "HOLD", label: "S7 book", count: counts.hold, hint: `${held} names you marked as held` });
  }

  return (
    <div className={"grid gap-2 sm:grid-cols-2 " + (held ? "xl:grid-cols-3 2xl:grid-cols-7" : "xl:grid-cols-3 2xl:grid-cols-6")}>
      {lanes.map((lane) => (
        <button
          key={lane.id}
          type="button"
          onClick={() => setView(view === lane.id ? "ALL" : lane.id)}
          className={
            "rounded-lg border px-3 py-3 text-left transition-colors " +
            (view === lane.id ? "border-border-strong bg-surface" : "border-border bg-bg-elevated hover:bg-surface")
          }
        >
          <div className="flex items-baseline justify-between">
            <p className="text-[10px] uppercase tracking-[0.16em] text-subtle">{lane.label}</p>
            <p className="font-mono text-lg tabular-nums text-fg">{lane.count}</p>
          </div>
          <p className="mt-1 text-[11px] text-muted">{lane.hint}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {topQueue(report.rows, lane.id, 6).map((row) => (
              <TickerButton
                key={row.symbol}
                symbol={row.symbol}
                className={
                  "rounded-sm px-1.5 py-0.5 font-mono text-[10px] " +
                  (lane.id === "GROK" && row.grokCall
                    ? grokStanceClass(row.grokCall.stance)
                    : lane.id === "SMC" && row.smc
                      ? row.smc.fresh === "BUY"
                        ? "bg-up-dim text-up"
                        : "bg-warn-dim text-warn"
                      : signalClass(row.consensus.signal))
                }
              >
                {row.symbol} {formatPrice(row.price, 1)}
              </TickerButton>
            ))}
          </div>
        </button>
      ))}
    </div>
  );
}
