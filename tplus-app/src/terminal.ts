import { DEFAULT_CONFIG } from "./quant/config";
import { buildContext } from "./quant/context";
import { scanSymbol } from "./quant/engine";
import { detectRegime } from "./quant/regime";
import type { Candle, StockScanRow, TradeSetupType } from "./quant/types";

export const SETUPS: Record<TradeSetupType, string> = {
  PULLBACK_UPTREND: "Hồi trong trend tăng",
  UPTREND_BREAKOUT_CONTINUATION: "Breakout tiếp diễn",
  DOWNTREND_RELIEF_RALLY: "Hồi trong trend giảm",
  MAJOR_REVERSAL: "Đảo chiều lớn",
  NONE: "Chưa rõ setup",
};
export interface Feed {
  symbol: string;
  candles: Candle[];
  source: string;
  session: string;
  fetchedAt: number;
  stale: boolean;
  cached: boolean;
  warning?: string;
}
export interface Settings {
  symbols: string;
  minRr: number;
  minValue: number;
  feeBps: number;
  slippageBps: number;
  concurrency: number;
  capital: number;
  riskPct: number;
  maxPositionPct: number;
}
export const DEFAULT_SETTINGS: Settings = {
  symbols:
    "FPT, HPG, SSI, TCB, MBB, MWG, VHM, VCB, STB, DGC, PAN, ANV, CEO, PVS, VND, HSG, KBC, CTG, PNJ, GMD",
  minRr: 1.5,
  minValue: 500000000,
  feeBps: 15,
  slippageBps: 10,
  concurrency: 3,
  capital: 100000000,
  riskPct: 1,
  maxPositionPct: 20,
};
export const parseSymbols = (input: string) =>
  [
    ...new Set(
      input
        .toUpperCase()
        .split(/[\s,;]+/)
        .filter((x) => /^[A-Z][A-Z0-9]{1,9}$/.test(x)),
    ),
  ].slice(0, 300);
export interface Pivot {
  i: number;
  time: number;
  price: number;
  kind: "H" | "L";
  confirmedAt: number;
}
export function confirmedSwings(c: Candle[], radius = 3): Pivot[] {
  const out: Pivot[] = [];
  for (let i = radius; i < c.length - radius; i++) {
    const win = c.slice(i - radius, i + radius + 1);
    if (win.every((x, j) => j === radius || x.high < c[i].high))
      out.push({
        i,
        time: c[i].time,
        price: c[i].high,
        kind: "H",
        confirmedAt: c[i + radius].time,
      });
    if (win.every((x, j) => j === radius || x.low > c[i].low))
      out.push({
        i,
        time: c[i].time,
        price: c[i].low,
        kind: "L",
        confirmedAt: c[i + radius].time,
      });
  }
  return out;
}
export interface Ticket {
  low: number;
  high: number;
  entry: number;
  sl: number;
  tp1: number | null;
  tp2: number | null;
  rr1: number | null;
  rr2: number | null;
  rrWorst: number | null;
  rrNet: number | null;
  trigger: string;
  invalidation: string;
  targetBasis: string;
  shares: number;
  warnings: string[];
  state: "READY" | "WAIT_ZONE" | "WAIT_TRIGGER" | "INVALID";
}
export interface Analysis {
  row: StockScanRow;
  feed: Feed;
  ticket: Ticket | null;
  score: number;
  trend: string;
  flow: string;
  cmf: number | null;
  rvol: number | null;
  ichi: string;
  divergence: string;
  rsi: number | null;
  vsa: string;
  pivots: Pivot[];
  call: string;
  notes: string[];
}
export function netRr(entry: number, sl: number, tp: number, costBps: number) {
  const cost = costBps / 10000;
  const reward = tp * (1 - cost) - entry * (1 + cost);
  const risk = entry * (1 + cost) - sl * (1 - cost);
  return risk > 0 ? reward / risk : null;
}
export function structuralTicket(
  row: StockScanRow,
  c: Candle[],
  settings: Settings,
  atr: number,
  kijun: number | null,
  ema: number | null,
): Ticket | null {
  const setup = row.tradePlan?.setupType ?? "NONE";
  if (setup === "NONE" || !(atr > 0)) return null;
  const smc = row.smc,
    price = row.price;
  const pivots = confirmedSwings(c).filter((p) => p.i >= c.length - 180);
  let low: number, high: number, anchor: number;
  let trigger: string;
  const warnings: string[] = [];
  if (setup === "UPTREND_BREAKOUT_CONTINUATION") {
    const resistance = Math.max(...c.slice(-21, -1).map((x) => x.high));
    low = resistance;
    high = resistance + atr * 0.25;
    anchor = resistance;
    trigger =
      "Đóng cửa vượt nền 20D, RVOL ≥ 1.3 và còn trong entry zone; vượt zone thì chờ retest.";
  } else {
    const supports = [smc?.entryLow, kijun, ema].filter(
      (x): x is number =>
        x != null && x > 0 && x < price + atr * 0.25 && x > price - atr * 4,
    );
    const ref = supports[0];
    if (ref == null) return null;
    low = ref - atr * 0.15;
    high =
      smc?.entryLow === ref && smc.entryHigh != null
        ? Math.min(smc.entryHigh, ref + atr * 0.5)
        : ref + atr * 0.25;
    anchor = low;
    trigger =
      setup === "DOWNTREND_RELIEF_RALLY"
        ? "Nến hồi đóng trên đỉnh phiên trước, dòng tiền dương; chỉ thăm dò."
        : setup === "MAJOR_REVERSAL"
          ? "CHoCH/BOS tăng và retest giữ vùng cầu; cần xác nhận dòng tiền."
          : "Giá về vùng hỗ trợ, nến hồi đóng trên đỉnh phiên trước và CMF dương.";
  }
  const support = pivots
    .filter((x) => x.kind === "L" && x.price < anchor)
    .at(-1)?.price;
  if (support == null) return null;
  const sl = support - atr * 0.2;
  const entry = (low + high) / 2;
  if (!(sl > 0 && sl < low && high >= low)) return null;
  // Targets are observed resistance. Never create a reward multiple to satisfy a gate.
  const levels = pivots
    .filter((x) => x.kind === "H")
    .map((x) => x.price)
    .concat(smc?.swingHigh ?? [])
    .filter((x) => x > high)
    .sort((a, b) => a - b);
  const targets = levels.filter(
    (x, i) => i === 0 || x - levels[i - 1] > atr * 0.15,
  );
  const tp1 = targets[0] ?? null;
  const tp2 = targets.find((x) => tp1 != null && x > tp1 + atr * 0.4) ?? null;
  if (!tp1)
    warnings.push("Chưa có kháng cự đã xác nhận phía trên; TP để trống.");
  const rr = (p: number | null, e: number) =>
    p == null ? null : (p - e) / (e - sl);
  const rrWorst = rr(tp1, high);
  const rrNet =
    tp1 == null
      ? null
      : netRr(high, sl, tp1, settings.feeBps + settings.slippageBps);
  if (rrNet != null && rrNet < settings.minRr)
    warnings.push(
      `R:R ròng tại đầu trên entry thấp hơn ngưỡng ${settings.minRr}.`,
    );
  if ((entry - sl) / entry > 0.1)
    warnings.push("SL cách entry hơn 10%; rủi ro lớn cho T+.");
  const state =
    price <= sl || price > (tp1 ?? Infinity)
      ? "INVALID"
      : price < low || price > high
        ? "WAIT_ZONE"
        : "WAIT_TRIGGER";
  const specialist = ["DOWNTREND_RELIEF_RALLY", "MAJOR_REVERSAL"].includes(
    setup,
  );
  const shares =
    Math.floor(
      Math.min(
        (((settings.capital * settings.riskPct) / 100) *
          (specialist ? 0.5 : 1)) /
          (high - sl),
        (settings.capital * settings.maxPositionPct) / 100 / high,
      ) / 100,
    ) * 100;
  return {
    low,
    high,
    entry,
    sl,
    tp1,
    tp2,
    rr1: rr(tp1, entry),
    rr2: rr(tp2, entry),
    rrWorst,
    rrNet,
    trigger,
    invalidation: `Đóng cửa dưới ${Math.round(sl).toLocaleString("vi-VN")} VND; gap có thể khiến mức lỗ vượt SL.`,
    targetBasis:
      "TP1/TP2: các swing high đã xác nhận gần nhất phía trên vùng entry (180 phiên).",
    shares,
    warnings,
    state,
  };
}
export function analyze(
  feed: Feed,
  benchmark: Feed | null,
  settings: Settings,
): Analysis {
  const cfg = {
    ...DEFAULT_CONFIG,
    minAvgValue20d: settings.minValue,
    hardGate: true,
  };
  const bench =
    benchmark && !benchmark.stale && benchmark.candles.length >= 250
      ? benchmark.candles
      : null;
  const regime = detectRegime(bench ?? []);
  const ctx = buildContext(
    feed.symbol,
    feed.candles,
    bench,
    regime.regime,
    regime.score,
    cfg,
  );
  const row = scanSymbol(
    feed.symbol,
    feed.candles,
    bench,
    regime,
    cfg,
    feed.source === "DEMO",
    ctx,
  );
  const ticket =
    row.status === "OK"
      ? structuralTicket(
          row,
          feed.candles,
          settings,
          ctx.snap.atr14 ?? 0,
          ctx.ichi.d.kijun,
          ctx.snap.ema20,
        )
      : null;
  const notes = [
    ...(row.tradePlan?.hardVetoes.map((x) => x.message) ?? []),
    ...(row.tradePlan?.contextConflicts.map((x) => x.message) ?? []),
  ];
  if (benchmark && feed.session !== benchmark.session)
    notes.push("Phiên mã khác VNINDEX: chờ đồng bộ dữ liệu.");
  if (!bench)
    notes.push("VNINDEX không có dữ liệu đủ mới: chưa xác nhận market regime.");
  if (feed.stale) notes.push("Dữ liệu cũ / feed lỗi: khóa tín hiệu vào lệnh.");
  if (feed.source === "DEMO")
    notes.push("DỮ LIỆU DEMO — không phải giá thị trường.");
  const previous = feed.candles.at(-2)!;
  const reversalBar = row.price > previous.high && (ctx.snap.cmf20 ?? 0) > 0;
  const breakout = row.tradePlan?.setupType === "UPTREND_BREAKOUT_CONTINUATION";
  const major = row.tradePlan?.setupType === "MAJOR_REVERSAL";
  const triggered =
    ticket &&
    (breakout
      ? row.price > ticket.low && (ctx.snap.volumeRatio ?? 0) >= 1.3
      : major
        ? reversalBar &&
          ["CHOCH_UP", "BOS_UP"].includes(ctx.smc.event) &&
          ctx.smc.retestOk
        : reversalBar);
  if (ticket?.state === "WAIT_TRIGGER" && triggered) ticket.state = "READY";
  const veto =
    row.status !== "OK" ||
    feed.stale ||
    !bench ||
    feed.session !== benchmark?.session ||
    feed.source === "DEMO" ||
    (row.tradePlan?.hardVetoes.length ?? 0) > 0;
  const specialist = ["DOWNTREND_RELIEF_RALLY", "MAJOR_REVERSAL"].includes(
    row.tradePlan?.setupType ?? "",
  );
  const support = specialist
    ? ctx.divergence.kind === "bull_reg" || ctx.smc.retestOk
    : row.consensus.agreement >= 3;
  const call = veto
    ? "NO_TRADE"
    : ticket?.state === "READY" &&
        ticket.rrNet != null &&
        ticket.rrNet >= settings.minRr &&
        support
      ? specialist
        ? "PROBE"
        : "BUY"
      : "WATCH";
  // Composite score is a ranking aid; never a calibrated win probability.
  const scores = row.strategies
    .filter((x) => ["S1", "S2", "S3", "S4", "S5", "S6"].includes(x.shortId))
    .map((x) => x.score)
    .filter((x): x is number => x != null);
  const score = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;
  return {
    row,
    feed,
    ticket,
    score,
    trend: ctx.snap.trendLong,
    flow:
      (ctx.snap.cmf20 ?? 0) > 0.05
        ? "Vào"
        : (ctx.snap.cmf20 ?? 0) < -0.05
          ? "Ra"
          : "Cân bằng",
    cmf: ctx.snap.cmf20,
    rvol: ctx.snap.volumeRatio,
    ichi: ctx.ichi.label,
    divergence: ctx.divergence.label,
    rsi: ctx.snap.rsi14,
    vsa: ctx.vsa,
    pivots: confirmedSwings(feed.candles),
    call,
    notes,
  };
}
export function isSmcLong(a: Analysis) {
  const s = a.row.smc;
  return (
    a.row.status === "OK" &&
    !a.feed.stale &&
    !!s &&
    s.fresh !== "SKIP" &&
    (s.fresh === "BUY" ||
      ((s.pd === "DISCOUNT" || s.nearLow) &&
        s.monthlyBias !== "BEAR" &&
        (s.weeklyBias === "BULL" || s.retestOk)))
  );
}
export function price(n: number | null | undefined) {
  return n == null || !Number.isFinite(n)
    ? "—"
    : (n / 1000).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
}
