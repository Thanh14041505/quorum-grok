export interface Holding {
  symbol: string;
  /** Giá vốn, nghìn VNĐ. */
  cost: number;
  shares: number | null;
}

/** Parse "FPT 96.5" / "HPG 21.2 1000" / "MWG:72". */
export function parseHoldings(text: string): Holding[] {
  const out: Holding[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\n|;/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.toUpperCase().match(/^([A-Z0-9]{2,10})\s*[:\s]\s*([0-9]+(?:\.[0-9]+)?)\s*([0-9]+)?/);
    if (!m) continue;
    const symbol = m[1]!;
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    out.push({
      symbol,
      cost: Number(m[2]),
      shares: m[3] ? Number(m[3]) : null,
    });
  }
  return out;
}

export function pnlFrac(lastVnd: number, costNghìn: number): number | null {
  if (!costNghìn || !Number.isFinite(costNghìn) || !Number.isFinite(lastVnd)) return null;
  return lastVnd / 1000 / costNghìn - 1;
}
