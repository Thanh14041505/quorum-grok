import { formatPercent, formatPrice, formatRr } from "./format";
import type { ScanReport } from "./types";

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

/** Daily Scanner export — một hàng / mã, đủ để đối chiếu notebook. */
export function scanToCsv(report: ScanReport): string {
  const header = [
    "ticker", "session", "status", "gate", "price_k", "chg", "volume", "regime",
    "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9",
    "consensus", "agreement", "conflict", "trade_setup", "trade_decision", "buy_votes", "vote_exits", "trade_ticket_source", "risk_multiplier",
    "grok_call", "smc_bias", "smc_fresh", "smc_held", "alpha",
    "entry_k", "sl_k", "tp1_k", "rr", "lot_shares", "notes",
  ];
  const lines = [header.join(",")];
  for (const row of report.rows) {
    const byId = Object.fromEntries(row.strategies.map((s) => [s.shortId, s.signal]));
    lines.push(
      [
        row.symbol,
        row.sessionDate ?? "",
        row.status,
        row.filterReason ?? "",
        formatPrice(row.price),
        formatPercent(row.changePct),
        row.volume,
        row.regime,
        byId.S1 ?? "",
        byId.S2 ?? "",
        byId.S3 ?? "",
        byId.S4 ?? "",
        byId.S5 ?? "",
        byId.S6 ?? "",
        byId.S7 ?? "",
        byId.S8 ?? "",
        byId.S9 ?? "",
        row.consensus.signal,
        `${row.consensus.agreement}/${row.consensus.total}`,
        row.consensus.conflict,
        row.tradePlan?.setupType ?? "",
        row.tradePlan?.decision ?? "",
        row.tradePlan ? `${row.tradePlan.buyVotes.length}/${row.tradePlan.totalVoting}` : "",
        row.tradePlan?.exitVotes.join("|") ?? "",
        row.tradePlan?.ticketSource ?? "",
        row.tradePlan?.riskMultiplier ?? "",
        row.grokCall?.stance ?? "",
        row.smc?.bias ?? "",
        row.smc?.fresh ?? "",
        row.smc?.held ?? "",
        row.alpha ?? "",
        formatPrice(row.entry),
        formatPrice(row.sl),
        formatPrice(row.tp1),
        formatRr(row.rr),
        row.lotShares ?? "",
        row.notes?.join("|") ?? "",
      ].map(csvCell).join(","),
    );
  }
  return lines.join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
