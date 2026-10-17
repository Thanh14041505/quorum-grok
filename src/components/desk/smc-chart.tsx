import type { Candle, SmcSummary } from "@/lib/quant/types";
import { formatPrice } from "@/lib/quant/format";

/** Nến rộng + zigzag lớn + Fib OTE + zone. Không vẽ fractal nhiễu. */
export function SmcChart({
  candles,
  smc,
  price,
}: {
  candles: Candle[];
  smc: SmcSummary | null;
  price: number;
}) {
  if (candles.length < 8) {
    return <div className="flex h-72 items-center justify-center text-sm text-muted">Need more bars for structure</div>;
  }
  const slice = candles.slice(-200);
  const w = 880;
  const h = 360;
  const padL = 10;
  const padR = 78;
  const padT = 14;
  const padB = 14;
  const highs = slice.map((c) => c.high);
  const lows = slice.map((c) => c.low);
  const extras = [
    smc?.sl, smc?.tp1, smc?.tp2, smc?.eq, smc?.entryLow, smc?.entryHigh,
    smc?.fvgLow, smc?.fvgHigh, smc?.swingHigh, smc?.swingLow, price,
    smc?.fib618, smc?.fib786, smc?.fib500, smc?.fib382, smc?.fib236,
    ...(smc?.zigzag ?? []).map((z) => z.price),
  ].filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const min = Math.min(...lows, ...extras);
  const max = Math.max(...highs, ...extras);
  const span = max - min || 1;
  const xOf = (i: number) => padL + (i / Math.max(slice.length - 1, 1)) * (w - padL - padR);
  const yOf = (v: number) => padT + (1 - (v - min) / span) * (h - padT - padB);
  const bw = Math.max(1.6, (w - padL - padR) / slice.length - 1.1);

  const zones: Array<{ lo: number; hi: number; fill: string; label: string; solid?: boolean }> = [];
  if (smc?.fib786 && smc.fib618) {
    zones.push({ lo: smc.fib786, hi: smc.fib618, fill: "var(--color-up)", label: "OTE", solid: true });
  }
  if (smc?.entryLow && smc.entryHigh) {
    zones.push({ lo: smc.entryLow, hi: smc.entryHigh, fill: "var(--color-accent)", label: "ZONE", solid: true });
  }
  if (smc?.fvgLow && smc.fvgHigh) zones.push({ lo: smc.fvgLow, hi: smc.fvgHigh, fill: "var(--color-up)", label: "FVG" });

  const lines: Array<{ v: number; label: string; color: string }> = [];
  if (smc?.fib236) lines.push({ v: smc.fib236, label: "0.236", color: "var(--color-subtle)" });
  if (smc?.fib382) lines.push({ v: smc.fib382, label: "0.382", color: "var(--color-subtle)" });
  if (smc?.eq || smc?.fib500) lines.push({ v: (smc.eq ?? smc.fib500)!, label: "EQ", color: "var(--color-subtle)" });
  if (smc?.fib618) lines.push({ v: smc.fib618, label: "0.618", color: "var(--color-warn)" });
  if (smc?.fib786) lines.push({ v: smc.fib786, label: "0.786", color: "var(--color-warn)" });
  if (smc?.sl) lines.push({ v: smc.sl, label: "SL", color: "var(--color-down)" });
  if (smc?.tp1) lines.push({ v: smc.tp1, label: "TP1", color: "var(--color-up)" });
  if (smc?.tp2) lines.push({ v: smc.tp2, label: "TP2", color: "var(--color-up)" });

  const timeIndex = new Map(slice.map((c, i) => [c.time, i]));
  const zz = (smc?.zigzag ?? [])
    .map((p) => {
      const x = timeIndex.get(p.time);
      return x == null ? null : { ...p, x };
    })
    .filter((p): p is NonNullable<typeof p> => p != null);
  const zzPts = zz.map((p) => `${xOf(p.x).toFixed(1)},${yOf(p.price).toFixed(1)}`).join(" ");

  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">
          Major structure · {slice.length}d
          {smc ? ` · D ${smc.bias} ${smc.event} · W ${smc.weeklyBias} · M ${smc.monthlyBias}` : ""}
        </p>
        <p className="font-mono text-[11px] text-muted">
          {smc?.pd ?? ""} {smc?.poiKind ? `· ${smc.poiKind}` : ""} {smc?.nearLow ? "· near low" : ""} {smc?.flowIn ? "· money in" : ""}
        </p>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-72 w-full sm:h-80" role="img" aria-label="SMC major structure chart">
        {zones.map((z) => {
          const y1 = yOf(z.hi);
          const y2 = yOf(z.lo);
          return (
            <rect
              key={z.label + z.lo}
              x={padL}
              y={Math.min(y1, y2)}
              width={w - padL - padR}
              height={Math.max(3, Math.abs(y2 - y1))}
              fill={z.fill}
              fillOpacity={z.solid ? 0.18 : 0.08}
              stroke={z.fill}
              strokeOpacity={0.4}
            />
          );
        })}
        {lines.map((ln) => (
          <g key={ln.label + ln.v}>
            <line
              x1={padL}
              x2={w - padR}
              y1={yOf(ln.v)}
              y2={yOf(ln.v)}
              stroke={ln.color}
              strokeDasharray="4 4"
              strokeWidth="1"
            />
            <text x={w - padR + 4} y={yOf(ln.v) + 3} fill={ln.color} fontSize="9" fontFamily="ui-monospace, monospace">
              {ln.label} {formatPrice(ln.v)}
            </text>
          </g>
        ))}
        {slice.map((c, i) => {
          const x = xOf(i);
          const up = c.close >= c.open;
          const color = up ? "var(--color-up)" : "var(--color-down)";
          const yH = yOf(c.high);
          const yL = yOf(c.low);
          const yO = yOf(c.open);
          const yC = yOf(c.close);
          const top = Math.min(yO, yC);
          const body = Math.max(1.1, Math.abs(yC - yO));
          return (
            <g key={c.time}>
              <line x1={x} x2={x} y1={yH} y2={yL} stroke={color} strokeWidth="1" />
              <rect x={x - bw / 2} y={top} width={bw} height={body} fill={color} />
            </g>
          );
        })}
        {zzPts ? (
          <polyline
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="1.8"
            strokeLinejoin="round"
            points={zzPts}
            opacity="0.85"
          />
        ) : null}
        {zz.map((p) => (
          <circle
            key={p.kind + p.i}
            cx={xOf(p.x)}
            cy={yOf(p.price)}
            r="3.2"
            fill={p.kind === "H" ? "var(--color-down)" : "var(--color-up)"}
          />
        ))}
      </svg>
    </div>
  );
}
