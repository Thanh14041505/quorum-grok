import { parseHoldings, pnlFrac } from "@/lib/quant/holdings";
import { formatPercent, formatPrice } from "@/lib/quant/format";
import { SignalBadge } from "@/components/ui/badge-signal";
import type { ScanReport } from "@/lib/quant/types";
import { useDesk } from "@/lib/quant/store";
import { TickerButton } from "@/components/desk/ticker-button";

export function HoldingsPanel({ report }: { report: ScanReport }) {
  const text = useDesk((s) => s.holdingsText);
  const holdings = parseHoldings(text);
  if (!holdings.length) return null;

  return (
    <section className="rounded-lg border border-border bg-bg-elevated p-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[11px] uppercase tracking-[0.16em] text-subtle">Existing book · S7</h2>
        <p className="font-mono text-[11px] text-muted">{holdings.length} names</p>
      </div>
      <p className="mt-1 text-[11px] text-muted">
        Dao Găm holder is for names you already own. P/L uses your cost in nghìn VNĐ.
      </p>
      <div className="mt-2 overflow-auto">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead className="text-[10px] uppercase tracking-[0.14em] text-subtle">
            <tr>
              <th className="py-1 font-medium">Ticker</th>
              <th className="py-1 font-medium">Cost</th>
              <th className="py-1 font-medium">Last</th>
              <th className="py-1 font-medium">P/L</th>
              <th className="py-1 font-medium">S7</th>
              <th className="py-1 font-medium">Why</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => {
              const row = report.rows.find((r) => r.symbol === h.symbol);
              const s7 = row?.strategies.find((s) => s.shortId === "S7");
              const pnl = row ? pnlFrac(row.price, h.cost) : null;
              return (
                <tr key={h.symbol} className="border-t border-border/70">
                  <td className="py-1.5">
                    <TickerButton symbol={h.symbol} className="font-medium hover:underline">
                      {h.symbol}
                    </TickerButton>
                    {!row ? <span className="ml-2 text-subtle">not in scan</span> : null}
                  </td>
                  <td className="py-1.5 font-mono tabular-nums">{h.cost.toFixed(2)}</td>
                  <td className="py-1.5 font-mono tabular-nums">{row ? formatPrice(row.price) : "—"}</td>
                  <td
                    className={
                      "py-1.5 font-mono tabular-nums " +
                      (pnl == null ? "text-muted" : pnl >= 0 ? "text-up" : "text-down")
                    }
                  >
                    {formatPercent(pnl)}
                  </td>
                  <td className="py-1.5">{s7 ? <SignalBadge signal={s7.signal} compact /> : "—"}</td>
                  <td className="max-w-xs truncate py-1.5 text-muted">{s7?.reasons[0] ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
