import { useState } from "react";
import type { Analysis } from "./terminal";
import { price } from "./terminal";
export function Chart({ a }: { a: Analysis }) {
  const [bars, setBars] = useState(120),
    [zones, setZones] = useState(true),
    [swings, setSwings] = useState(true),
    [hover, setHover] = useState<number | null>(null);
  const c = a.feed.candles.slice(-bars),
    s = a.row.smc,
    t = a.ticket;
  const w = 1100,
    h = 430,
    left = 16,
    right = 90,
    top = 25,
    bottom = 72;
  const major = (s?.zigzag ?? []).filter((p) => p.time >= c[0].time);
  const levels = [
    { v: t?.sl, label: "SL", color: "#fb7185" },
    { v: t?.tp1, label: "TP1", color: "#43d9aa" },
    { v: t?.tp2, label: "TP2", color: "#43d9aa" },
    { v: a.row.price, label: "Giá", color: "#c5cedf" },
  ].filter(
    (x): x is { v: number; label: string; color: string } => x.v != null,
  );
  const candidates = c
    .flatMap((x) => [x.high, x.low])
    .concat(levels.map((x) => x.v));
  const min = Math.min(...candidates) * 0.99,
    max = Math.max(...candidates) * 1.01,
    span = max - min || 1;
  const x = (i: number) =>
      left + (i / Math.max(c.length - 1, 1)) * (w - left - right),
    y = (v: number) => top + ((max - v) / span) * (h - top - bottom);
  const idx = new Map(c.map((v, i) => [v.time, i]));
  const volMax = Math.max(...c.map((x) => x.volume), 1);
  const band = (
    lo: number | null | undefined,
    hi: number | null | undefined,
    label: string,
    color: string,
  ) =>
    lo != null && hi != null ? (
      <g key={label}>
        <rect
          x={left}
          width={w - left - right}
          y={y(Math.max(lo, hi))}
          height={Math.abs(y(lo) - y(hi))}
          fill={color}
          opacity=".10"
        />
        <text
          x={left + 8}
          y={y(Math.max(lo, hi)) + 13}
          fill={color}
          fontSize="10"
        >
          {label}
        </text>
      </g>
    ) : null;
  const bar = hover == null ? c.at(-1)! : (c[hover] ?? c.at(-1)!);
  return (
    <section className="panel chart-panel">
      <div className="chart-tools">
        <div>
          <strong>Cấu trúc & vùng giao dịch</strong>
          <small>D1 · SMC lớn + swing đã xác nhận</small>
        </div>
        <div className="controls">
          {[60, 120, 200, 400].map((n) => (
            <button
              key={n}
              className={bars === n ? "selected" : ""}
              onClick={() => {
                setBars(n);
                setHover(null);
              }}
            >
              {n}D
            </button>
          ))}
          <label>
            <input
              type="checkbox"
              checked={zones}
              onChange={(e) => setZones(e.target.checked)}
            />{" "}
            Zones
          </label>
          <label>
            <input
              type="checkbox"
              checked={swings}
              onChange={(e) => setSwings(e.target.checked)}
            />{" "}
            Swings
          </label>
        </div>
      </div>
      <div className="ohlc">
        {new Date(bar.time * 1000).toLocaleDateString("vi-VN", {
          timeZone: "Asia/Ho_Chi_Minh",
        })}{" "}
        <span>O {price(bar.open)}</span>
        <span>H {price(bar.high)}</span>
        <span>L {price(bar.low)}</span>
        <span>C {price(bar.close)}</span>
        <span>Vol {(bar.volume / 1e6).toFixed(2)}m</span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`${a.row.symbol}: nến D1, SMC, Fibonacci, swing high/low và kế hoạch giá`}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.round(
            ((((e.clientX - r.left) / r.width) * w - left) /
              (w - left - right)) *
              (c.length - 1),
          );
          setHover(Math.max(0, Math.min(c.length - 1, i)));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id="plot">
            <rect
              x={left}
              y={top - 15}
              width={w - left - right + 3}
              height={h - bottom - top + 25}
            />
          </clipPath>
        </defs>
        {Array.from({ length: 6 }, (_, i) => {
          const v = min + (span * i) / 5;
          return (
            <g key={i}>
              <line
                x1={left}
                x2={w - right}
                y1={y(v)}
                y2={y(v)}
                stroke="#202d40"
              />
              <text
                x={w - right + 10}
                y={y(v) + 4}
                fill="#70819b"
                fontSize="11"
              >
                {price(v)}
              </text>
            </g>
          );
        })}
        <g clipPath="url(#plot)">
          {zones && (
            <>
              {band(s?.fib786, s?.fib618, "FIB OTE 0.618–0.786", "#60a5fa")}
              {band(s?.swingLow, s?.eq, "DISCOUNT", "#43d9aa")}
              {band(t?.low, t?.high, "ENTRY ZONE", "#e7bd68")}
              {band(s?.obLow, s?.obHigh, "ORDER BLOCK", "#a78bfa")}
            </>
          )}
          {zones && s?.eq != null && (
            <line
              x1={left}
              x2={w - right}
              y1={y(s.eq)}
              y2={y(s.eq)}
              stroke="#70819b"
              strokeDasharray="2 5"
            />
          )}
          {c.map((v, i) => {
            const color = v.close >= v.open ? "#43d9aa" : "#fb7185";
            return (
              <g key={v.time}>
                <line
                  x1={x(i)}
                  x2={x(i)}
                  y1={y(v.high)}
                  y2={y(v.low)}
                  stroke={color}
                />
                <rect
                  x={x(i) - Math.max(1, ((w - left - right) / c.length) * 0.3)}
                  y={Math.min(y(v.open), y(v.close))}
                  width={Math.max(2, ((w - left - right) / c.length) * 0.6)}
                  height={Math.max(1, Math.abs(y(v.open) - y(v.close)))}
                  fill={color}
                />
              </g>
            );
          })}
          <polyline
            points={major
              .map((p) => `${x(idx.get(p.time)!)},${y(p.price)}`)
              .join(" ")}
            fill="none"
            stroke="#e7bd68"
            strokeWidth="2"
            opacity=".9"
          />
          {major.map((p) => (
            <g key={p.time + "major"}>
              <circle
                cx={x(idx.get(p.time)!)}
                cy={y(p.price)}
                r="3.5"
                fill="#e7bd68"
              />
              <text
                x={x(idx.get(p.time)!)}
                y={y(p.price) + (p.kind === "H" ? -10 : 17)}
                textAnchor="middle"
                fill="#e7bd68"
                fontSize="10"
              >
                {p.kind} {price(p.price)}
              </text>
            </g>
          ))}
          {swings &&
            a.pivots
              .filter((p) => idx.has(p.time))
              .map((p) => {
                const px = x(idx.get(p.time)!),
                  py = y(p.price) + (p.kind === "H" ? -5 : 5);
                return (
                  <path
                    key={p.time + p.kind}
                    d={
                      p.kind === "H"
                        ? `M${px - 3},${py - 4} L${px + 3},${py - 4} L${px},${py}`
                        : `M${px - 3},${py + 4} L${px + 3},${py + 4} L${px},${py}`
                    }
                    fill="#8a9ab3"
                  />
                );
              })}
          {levels.map((l) => (
            <line
              key={l.label}
              x1={left}
              x2={w - right}
              y1={y(l.v)}
              y2={y(l.v)}
              stroke={l.color}
              opacity=".6"
              strokeDasharray="5 5"
            />
          ))}
        </g>
        {levels.map((l) => (
          <text
            key={l.label}
            x={w - right + 8}
            y={y(l.v) - 5}
            fill={l.color}
            fontSize="10"
          >
            {l.label} {price(l.v)}
          </text>
        ))}
        {c.map((v, i) => (
          <rect
            key={"v" + v.time}
            x={x(i) - 1.5}
            y={h - 30 - (v.volume / volMax) * 30}
            width={Math.max(2, ((w - left - right) / c.length) * 0.7)}
            height={(v.volume / volMax) * 30}
            fill={v.close >= v.open ? "#43d9aa" : "#fb7185"}
            opacity=".3"
          />
        ))}
        {[
          0,
          Math.floor(c.length / 3),
          Math.floor((c.length * 2) / 3),
          c.length - 1,
        ].map((i) => (
          <text
            key={i}
            x={x(i)}
            y={h - 4}
            textAnchor={i === 0 ? "start" : "end"}
            fill="#70819b"
            fontSize="11"
          >
            {new Date(c[i].time * 1000).toLocaleDateString("vi-VN", {
              timeZone: "Asia/Ho_Chi_Minh",
            })}
          </text>
        ))}
        {hover != null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={top}
            y2={h - 25}
            stroke="#b5c3da"
            opacity=".4"
            strokeDasharray="3 3"
          />
        )}
      </svg>
      <div className="chart-legend">
        <span className="gold">━ SMC lớn</span>
        <span>▴ Swing ngắn hạn (3 nến xác nhận)</span>
        <span className="blue">■ Fibonacci OTE</span>
        <span className="up">■ Discount</span>
        <span>Giá: nghìn VND · volume: cổ phiếu</span>
      </div>
    </section>
  );
}
