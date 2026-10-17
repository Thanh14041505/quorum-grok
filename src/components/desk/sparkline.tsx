export function Sparkline({ values }: { values: number[] }) {
  if (!values || values.length < 2) {
    return <span className="inline-block h-6 w-16 text-subtle">—</span>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = 22 - ((v - min) / span) * 20;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const up = values[values.length - 1]! >= values[0]!;
  return (
    <svg viewBox="0 0 100 24" className={"h-6 w-16 " + (up ? "text-up" : "text-down")} aria-hidden>
      <polyline fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" points={points} />
    </svg>
  );
}

export function PriceChart({
  values,
  marks = [],
}: {
  values: number[];
  marks?: Array<{ price: number; label: string }>;
}) {
  if (!values || values.length < 2) {
    return <div className="flex h-36 items-center justify-center text-sm text-muted">No series</div>;
  }
  const min = Math.min(...values, ...marks.map((m) => m.price));
  const max = Math.max(...values, ...marks.map((m) => m.price));
  const span = max - min || 1;
  const w = 640;
  const h = 160;
  const pad = 8;
  const yOf = (v: number) => pad + (1 - (v - min) / span) * (h - pad * 2);
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = yOf(v);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const up = values[values.length - 1]! >= values[0]!;
  const last = values[values.length - 1]!;
  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">Close · {values.length} sessions</p>
        <p className={"font-mono text-xs tabular-nums " + (up ? "text-up" : "text-down")}>
          {(last / 1000).toFixed(2)}
        </p>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className={"h-36 w-full " + (up ? "text-up" : "text-down")} role="img">
        {marks.map((m) => {
          const y = yOf(m.price);
          return (
            <g key={m.label} className="text-subtle">
              <line x1={pad} x2={w - pad} y1={y} y2={y} stroke="currentColor" strokeDasharray="4 4" strokeWidth="1" />
              <text x={w - pad - 2} y={y - 3} textAnchor="end" fill="currentColor" fontSize="10">
                {m.label} {(m.price / 1000).toFixed(2)}
              </text>
            </g>
          );
        })}
        <polygon
          fill="currentColor"
          fillOpacity="0.12"
          points={`${pad},${h - pad} ${pts.join(" ")} ${w - pad},${h - pad}`}
        />
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={pts.join(" ")}
        />
      </svg>
    </div>
  );
}
