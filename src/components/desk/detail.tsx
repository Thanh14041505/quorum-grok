import { SignalBadge } from "@/components/ui/badge-signal";
import { GrokCallCard } from "@/components/desk/grok-call-card";
import { SmcCard } from "@/components/desk/smc-card";
import { SmcChart } from "@/components/desk/smc-chart";
import { STRATEGIES } from "@/lib/quant/engine";
import { loadBars } from "@/lib/quant/api";
import {
  formatPercent,
  formatPrice,
  formatRr,
  formatScore,
  formatVnd,
  formatVolume,
} from "@/lib/quant/format";
import { parseHoldings, pnlFrac } from "@/lib/quant/holdings";
import { buildTicket, extractLevels, thesis } from "@/lib/quant/playbook";
import type { Candle, StockScanRow } from "@/lib/quant/types";
import { useDesk } from "@/lib/quant/store";
import { useEffect, useState } from "react";

export function StockDetail({ row }: { row: StockScanRow }) {
  const config = useDesk((s) => s.config);
  const holdingsText = useDesk((s) => s.holdingsText);
  const holding = parseHoldings(holdingsText).find((h) => h.symbol === row.symbol);
  const ticket = buildTicket(row, config);
  const levels = extractLevels(row);
  const s7 = row.strategies.find((s) => s.shortId === "S7");
  const pnl = holding ? pnlFrac(row.price, holding.cost) : null;
  const [bars, setBars] = useState<Candle[]>([]);

  useEffect(() => {
    let cancelled = false;
    void loadBars({ data: { symbol: row.symbol, bars: 240 } }).then((res) => {
      if (!cancelled) setBars(res.candles);
    });
    return () => {
      cancelled = true;
    };
  }, [row.symbol]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-subtle">Name</p>
          <h1 className="mt-1 font-sans text-3xl font-medium tracking-tight">{row.symbol}</h1>
          <p className="mt-1 font-mono text-sm text-muted">
            {formatPrice(row.price)}
            <span className="ml-1 text-subtle">nghìn VNĐ</span>
            <span className={"ml-3 " + (row.changePct >= 0 ? "text-up" : "text-down")}>
              {formatPercent(row.changePct)}
            </span>
            <span className="ml-3 text-subtle">Vol {formatVolume(row.volume)}</span>
            {row.sessionDate ? (
              <span className={"ml-3 " + ((row.sessionLagDays ?? 0) > 1 ? "text-warn" : "text-subtle")}>
                Phiên {row.sessionDate}
              </span>
            ) : null}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-[0.18em] text-subtle">Consensus</p>
          <div className="mt-1 flex items-center justify-end gap-2">
            <SignalBadge signal={row.consensus.signal} />
            <span className="font-mono text-xs text-muted">
              {row.consensus.agreement}/{row.consensus.total} · {row.consensus.conflict}
            </span>
          </div>
        </div>
      </header>

      <p className="max-w-3xl text-sm leading-6 text-muted">{thesis(row)}</p>

      {row.grokCall ? <GrokCallCard call={row.grokCall} sessionDate={row.sessionDate} /> : null}

      {row.smc ? <SmcCard smc={row.smc} held={Boolean(holding)} /> : null}

      <SmcChart candles={bars} smc={row.smc} price={row.price} />

      {row.filterReason ? (
        <p className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-warn">
          Gate: {row.filterReason}
          {config.hardGate ? " · hard gate on" : " · scored anyway (soft gate)"}
        </p>
      ) : null}

      {holding ? (
        <section className="rounded-lg border border-border bg-bg-elevated px-3 py-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">Existing position · S7</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-4 font-mono text-sm">
            <span>Cost {holding.cost.toFixed(2)}</span>
            <span className={pnl == null ? "text-muted" : pnl >= 0 ? "text-up" : "text-down"}>
              P/L {formatPercent(pnl)}
            </span>
            {holding.shares != null ? <span className="text-muted">{holding.shares.toLocaleString("vi-VN")} sh</span> : null}
            {s7 ? <SignalBadge signal={s7.signal} /> : null}
          </div>
          <p className="mt-2 text-xs text-muted">{s7?.reasons[0] ?? "No holder read yet."}</p>
        </section>
      ) : (
        <p className="text-xs text-subtle">Not in your book — S7 is a holder brain, not a fresh-entry vote.</p>
      )}

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <RiskCell
          label={row.smc?.fresh === "WAIT" ? "Limit zone" : "Entry"}
          value={
            row.smc?.entryLow && row.smc.entryHigh
              ? `${formatPrice(row.smc.entryLow)}–${formatPrice(row.smc.entryHigh)}`
              : formatPrice(row.entry)
          }
        />
        <RiskCell label="Stop" value={formatPrice(row.sl)} />
        <RiskCell label="TP1 / TP2" value={`${formatPrice(row.tp1)}  ·  ${formatPrice(row.tp2)}`} />
        <RiskCell
          label="R:R / risk"
          value={`${formatRr(row.rr)}  ·  ${row.riskPct != null ? row.riskPct.toFixed(2) + "%" : "N/A"}`}
        />
      </section>
      {row.smc?.fresh === "SKIP" ? (
        <p className="text-xs text-muted">No long ticket — SMC bias is not inverted into a short (VN cash cannot short).</p>
      ) : null}

      {ticket ? (
        <section className="rounded-lg border border-border bg-bg-elevated p-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">Position ticket</p>
          <p className="mt-2 font-mono text-sm tabular-nums text-fg">
            {ticket.shares > 0 ? `${ticket.shares.toLocaleString("vi-VN")} sh` : "lot too small"}
            <span className="ml-2 text-muted">{formatVnd(ticket.notional)}</span>
            <span className="ml-2 text-subtle">
              { (config.riskPerTrade * 100).toFixed(1)}% of {(config.capital / 1_000_000).toFixed(0)} triệu · lot 100
            </span>
          </p>
          <p className="mt-1 text-xs text-muted">
            VN cash stocks settle T+1.5 — this is a swing ticket, not a day-trade.
          </p>
          {ticket.gated && ticket.gateReason ? (
            <p className="mt-2 text-xs text-warn">Risk gate: {ticket.gateReason}</p>
          ) : null}
        </section>
      ) : (
        <p className="text-xs text-muted">Position size N/A — no strategy produced a complete entry/stop.</p>
      )}

      {levels.length ? (
        <section>
          <h2 className="text-[11px] uppercase tracking-[0.16em] text-subtle">Levels (Ichimoku / VP / Dao găm)</h2>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {levels.map((l) => (
              <div key={l.label} className="rounded-md border border-border bg-surface px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.14em] text-subtle">{l.label}</p>
                <p className="mt-1 font-mono text-sm tabular-nums">{formatPrice(l.value)}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border border-border bg-bg-elevated p-3">
        <h2 className="text-[11px] uppercase tracking-[0.16em] text-subtle">Conflict</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Camp title="Bullish" items={row.consensus.bullish} tone="up" />
          <Camp title="Neutral" items={row.consensus.neutral} tone="hold" />
          <Camp title="Bearish" items={row.consensus.bearish} tone="down" />
        </div>
        <p className="mt-3 text-xs text-muted">{row.consensus.summary.join(" · ")}</p>
      </section>

      <section>
        <h2 className="text-[11px] uppercase tracking-[0.16em] text-subtle">Strategy matrix</h2>
        <div className="mt-2 overflow-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="bg-surface text-[10px] uppercase tracking-[0.14em] text-subtle">
              <tr>
                <th className="px-3 py-2 font-medium">Brain</th>
                <th className="px-2 py-2 font-medium">Signal</th>
                <th className="px-2 py-2 font-medium">Score</th>
                <th className="px-2 py-2 font-medium">Why</th>
              </tr>
            </thead>
            <tbody>
              {row.strategies.map((s) => {
                const meta = STRATEGIES.find((x) => x.meta.id === s.id)?.meta;
                return (
                  <tr key={s.id} className="border-t border-border align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium">{s.shortId} {s.name}</div>
                      <div className="mt-0.5 max-w-xs text-[11px] text-subtle">{meta?.philosophy}</div>
                    </td>
                    <td className="px-2 py-2">
                      <SignalBadge signal={s.signal} />
                    </td>
                    <td className="px-2 py-2 font-mono tabular-nums">{formatScore(s.score)}</td>
                    <td className="px-2 py-2 text-muted">
                      {s.error ? <span className="text-down">{s.error}</span> : s.reasons.join(" · ") || "—"}
                      {s.warnings.length ? (
                        <div className="mt-1 text-warn">{s.warnings.join(" · ")}</div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {row.strategies.map((s) =>
        s.checks.length ? (
          <section key={s.id} className="rounded-md border border-border bg-surface px-3 py-2">
            <h3 className="text-[11px] uppercase tracking-[0.16em] text-subtle">
              Why {s.shortId} says {s.signal.replaceAll("_", " ")}
            </h3>
            <ul className="mt-2 space-y-1">
              {s.checks.map((c, i) => (
                <li key={i} className="flex gap-2 font-mono text-[12px]">
                  <span className={c.ok ? "text-up" : "text-subtle"}>{c.ok ? "+" : "·"}</span>
                  <span className={c.ok ? "text-fg" : "text-muted"}>{c.text}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
    </div>
  );
}

function RiskCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-bg-elevated px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-subtle">{label}</p>
      <p className="mt-1 font-mono text-sm tabular-nums">{value}</p>
    </div>
  );
}

function Camp({ title, items, tone }: { title: string; items: string[]; tone: "up" | "down" | "hold" }) {
  const color = tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-muted";
  return (
    <div>
      <p className={"text-[11px] font-medium " + color}>{title}</p>
      <p className="mt-1 font-mono text-xs text-fg">{items.length ? items.join("  ") : "—"}</p>
    </div>
  );
}
