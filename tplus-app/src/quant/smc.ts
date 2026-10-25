/**
 * SMC khung lớn cho VN (long-only) — bám Super SMC 1D như chart mẫu:
 * zigzag % lớn (không fractal 3 nến), BOS/CHoCH trên swing đó, Fib OTE 0.618–0.786,
 * D1 + W1 + M1. Bias bear = SKIP/CUT, không đảo thành short.
 */
import type { Candle } from "./types";
import { vnDateFromUnix } from "./dates";

export type SmcBias = "BULL" | "BEAR" | "RANGE";
export type SmcEvent =
  "BOS_UP" | "BOS_DOWN" | "CHOCH_UP" | "CHOCH_DOWN" | "NONE";
export type SmcFresh = "BUY" | "WAIT" | "SKIP";
export type SmcHeld = "ADD" | "HOLD" | "REDUCE" | "CUT";
export type SmcPd = "DISCOUNT" | "EQUILIBRIUM" | "PREMIUM";

export interface SmcZone {
  kind: "OB" | "FVG" | "SWING" | "OTE";
  low: number;
  high: number;
  i: number;
}

export interface ZzPt {
  confirmedI?: number;
  i: number;
  time: number;
  price: number;
  kind: "H" | "L";
  vol: number;
}

export interface SmcPlan {
  bias: SmcBias;
  event: SmcEvent;
  eventBarsAgo: number | null;
  structure: "HH_HL" | "LH_LL" | "MIXED";
  pd: SmcPd;
  eq: number | null;
  swingHigh: number | null;
  swingLow: number | null;
  poi: SmcZone | null;
  fvg: SmcZone | null;
  ob: SmcZone | null;
  fresh: SmcFresh;
  held: SmcHeld;
  entryLow: number | null;
  entryHigh: number | null;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  rr: number | null;
  thesis: string;
  why: string[];
  weeklyBias: SmcBias;
  monthlyBias: SmcBias;
  loc: number | null;
  flowIn: boolean;
  nearLow: boolean;
  retestOk: boolean;
  zigzag: ZzPt[];
  fib618: number | null;
  fib786: number | null;
  fib500: number | null;
  fib382: number | null;
  fib236: number | null;
}

const EMPTY: SmcPlan = {
  bias: "RANGE",
  event: "NONE",
  eventBarsAgo: null,
  structure: "MIXED",
  pd: "EQUILIBRIUM",
  eq: null,
  swingHigh: null,
  swingLow: null,
  poi: null,
  fvg: null,
  ob: null,
  fresh: "WAIT",
  held: "HOLD",
  entryLow: null,
  entryHigh: null,
  sl: null,
  tp1: null,
  tp2: null,
  rr: null,
  thesis: "Not enough major swings to read HTF structure.",
  why: ["Need a wider map (zigzag ≥ 8%) before BOS / CHoCH."],
  weeklyBias: "RANGE",
  monthlyBias: "RANGE",
  loc: null,
  flowIn: false,
  nearLow: false,
  retestOk: false,
  zigzag: [],
  fib618: null,
  fib786: null,
  fib500: null,
  fib382: null,
  fib236: null,
};

export function analyzeSmc(candles: Candle[]): SmcPlan {
  const n = candles.length;
  if (n < 60) return EMPTY;
  const close = candles.map((c) => c.close);
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  const open = candles.map((c) => c.open);
  const volume = candles.map((c) => c.volume);
  const price = close[n - 1]!;
  const atr = atrLast(high, low, close, 14);
  const minPct = Math.max(
    0.08,
    Math.min(0.14, atr ? (2.6 * atr) / price : 0.08),
  );

  const zz = significantZigZag(candles, minPct);
  if (
    zz.filter((p) => p.kind === "H").length < 2 ||
    zz.filter((p) => p.kind === "L").length < 2
  ) {
    return { ...EMPTY, zigzag: zz };
  }

  const weekly = resample(candles, "W");
  const monthly = resample(candles, "M");
  const wZz = significantZigZag(weekly, 0.12);
  const mZz = significantZigZag(monthly, 0.16);
  const weeklyBias = biasFromZigZag(wZz);
  const monthlyBias = biasFromZigZag(mZz);

  const highs = zz.filter((p) => p.kind === "H");
  const lows = zz.filter((p) => p.kind === "L");
  const lastH = highs[highs.length - 1]!;
  const priorH = highs[highs.length - 2]!;
  const lastL = lows[lows.length - 1]!;
  const priorL = lows[lows.length - 2]!;

  let structure: SmcPlan["structure"] = "MIXED";
  if (lastH.price > priorH.price && lastL.price > priorL.price)
    structure = "HH_HL";
  else if (lastH.price < priorH.price && lastL.price < priorL.price)
    structure = "LH_LL";

  const walk = walkMajor(close, zz);
  const swingHigh = lastH.price;
  const swingLow = lastL.price;
  const range = Math.max(swingHigh - swingLow, price * 0.01);
  const eq = swingLow + range * 0.5;
  const loc = (price - swingLow) / range;
  let pd: SmcPd = "EQUILIBRIUM";
  if (loc <= 0.382) pd = "DISCOUNT";
  else if (loc >= 0.618) pd = "PREMIUM";

  const fibHigh =
    lastH.i > lastL.i ? lastH.price : Math.max(lastH.price, priorH.price);
  const fibLow =
    lastL.i > lastH.i ? lastL.price : Math.min(lastL.price, priorL.price);
  const fibSpan = fibHigh - fibLow;
  const fib =
    fibSpan > 0
      ? {
          fib236: fibHigh - fibSpan * 0.236,
          fib382: fibHigh - fibSpan * 0.382,
          fib500: fibHigh - fibSpan * 0.5,
          fib618: fibHigh - fibSpan * 0.618,
          fib786: fibHigh - fibSpan * 0.786,
        }
      : {
          fib236: null,
          fib382: null,
          fib500: null,
          fib618: null,
          fib786: null,
        };

  const ote: SmcZone | null =
    fib.fib618 != null && fib.fib786 != null
      ? {
          kind: "OTE",
          low: Math.min(fib.fib618, fib.fib786),
          high: Math.max(fib.fib618, fib.fib786),
          i: lastL.i,
        }
      : null;

  const fvg = lastMajorBullFvg(high, low, close, 0.012);
  const ob = lastBullishOb(open, high, low, close, walk.bosUpAt, 0.012);
  const poi = pickPoi(ote, fvg, ob, lastL, eq, price);

  const volMa = smaLast(volume, 20);
  const lastRange = Math.max(high[n - 1]! - low[n - 1]!, 1e-9);
  const closePos = (close[n - 1]! - low[n - 1]!) / lastRange;
  const flowIn = Boolean(
    volMa &&
    volume[n - 1]! > volMa * 1.25 &&
    close[n - 1]! >= open[n - 1]! &&
    closePos >= 0.6,
  );
  const nearLow = loc <= 0.28 || price <= swingLow * 1.03;
  const retestOk = successfulRetest(low, close, lastL, n);

  const htfDiscount =
    locFromZz(mZz, monthly.at(-1)?.close ?? price) <= 0.4 ||
    locFromZz(wZz, weekly.at(-1)?.close ?? price) <= 0.4 ||
    (monthlyBias !== "BEAR" && nearLow);

  const why: string[] = [];
  why.push(
    `Major zigzag ${(minPct * 100).toFixed(0)}% · D1 ${walk.bias}/${walk.event} · W1 ${weeklyBias} · M1 ${monthlyBias}.`,
  );
  why.push(
    `Last swing ${fmt(swingLow)}–${fmt(swingHigh)} · loc ${(loc * 100).toFixed(0)}% (${pd}) · OTE ${ote ? `${fmt(ote.low)}–${fmt(ote.high)}` : "n/a"}.`,
  );
  why.push(
    `${nearLow ? "Near major low" : "Not at the base"} · ${retestOk ? "retest held" : "no successful retest"} · ${flowIn ? "money in (vol+close)" : "no demand bar"}.`,
  );

  const reversal = htfDiscount && (retestOk || flowIn) && loc <= 0.4;
  const continuation =
    walk.bias === "BULL" &&
    weeklyBias !== "BEAR" &&
    pd !== "PREMIUM" &&
    (nearLow || inZone(price, ote));
  const bearHtF =
    walk.bias === "BEAR" &&
    weeklyBias === "BEAR" &&
    monthlyBias === "BEAR" &&
    !reversal;

  if (
    bearHtF ||
    ((walk.event === "CHOCH_DOWN" || walk.event === "BOS_DOWN") &&
      !reversal &&
      loc > 0.35)
  ) {
    const held: SmcHeld =
      walk.event === "CHOCH_DOWN" ||
      (walk.event === "BOS_DOWN" && (walk.eventBarsAgo ?? 99) <= 20)
        ? "CUT"
        : "REDUCE";
    return {
      ...base(
        walk,
        structure,
        pd,
        eq,
        swingHigh,
        swingLow,
        poi,
        fvg,
        ob,
        why,
        weeklyBias,
        monthlyBias,
        loc,
        flowIn,
        nearLow,
        retestOk,
        zz,
        fib,
      ),
      fresh: "SKIP",
      held,
      thesis:
        held === "CUT"
          ? "Major CHoCH/BOS down on the wide map. Skip new buys. If you hold, cut — VN cannot short, so no inverted ticket."
          : "HTF still bear (W/M). No long. Reduce if you hold. Wait for a CHoCH up at a major low with money in.",
      entryLow: null,
      entryHigh: null,
      sl: null,
      tp1: null,
      tp2: null,
      rr: null,
    };
  }

  const long = buildLongPlan(
    price,
    poi ?? ote,
    swingLow,
    swingHigh,
    pd,
    walk.bias === "BEAR" && !reversal,
  );
  let fresh: SmcFresh = "WAIT";
  let held: SmcHeld = "HOLD";
  let thesis: string;

  if ((reversal || continuation) && long && (long.inZone || nearLow)) {
    fresh = "BUY";
    held = "ADD";
    thesis = reversal
      ? `HTF discount + ${retestOk ? "successful low retest" : "money in"}. Long OTE/zone ${fmt(long.entryLow)}–${fmt(long.entryHigh)}, SL ${fmt(long.sl)}, TP1 ${fmt(long.tp1)}.`
      : `Bullish major structure, price still in discount/OTE. Long ${fmt(long.entryLow)}–${fmt(long.entryHigh)}, SL ${fmt(long.sl)}, TP1 ${fmt(long.tp1)}.`;
  } else if (walk.bias === "BULL" && pd === "PREMIUM") {
    fresh = "WAIT";
    held = "HOLD";
    thesis =
      "Wide map is bullish but price is in premium of the last major swing — do not chase. Wait for OTE 0.618–0.786.";
  } else if (long && (reversal || continuation)) {
    fresh = "WAIT";
    held = "HOLD";
    thesis = `Setup forming. Limit in ${fmt(long.entryLow)}–${fmt(long.entryHigh)}; no market buy until the zone is tagged.`;
  } else if (nearLow && !flowIn && !retestOk) {
    fresh = "WAIT";
    held = "HOLD";
    thesis =
      "Near a major low but no money in and no held retest yet. Observe the base — do not guess the turn.";
  } else if (walk.bias === "BEAR") {
    fresh = "SKIP";
    held = "REDUCE";
    thesis =
      "Major structure still down. Skip. If you hold, reduce. No short ticket.";
  } else {
    fresh = "WAIT";
    held = "HOLD";
    thesis =
      "No HTF edge yet. Need a major discount + flow or a held retest of the last significant low.";
  }

  return {
    ...base(
      walk,
      structure,
      pd,
      eq,
      swingHigh,
      swingLow,
      poi,
      fvg,
      ob,
      why,
      weeklyBias,
      monthlyBias,
      loc,
      flowIn,
      nearLow,
      retestOk,
      zz,
      fib,
    ),
    fresh,
    held,
    entryLow: long?.entryLow ?? null,
    entryHigh: long?.entryHigh ?? null,
    sl: long?.sl ?? null,
    tp1: long?.tp1 ?? null,
    tp2: long?.tp2 ?? null,
    rr: long?.rr ?? null,
    thesis,
  };
}

function base(
  walk: ReturnType<typeof walkMajor>,
  structure: SmcPlan["structure"],
  pd: SmcPd,
  eq: number,
  swingHigh: number,
  swingLow: number,
  poi: SmcZone | null,
  fvg: SmcZone | null,
  ob: SmcZone | null,
  why: string[],
  weeklyBias: SmcBias,
  monthlyBias: SmcBias,
  loc: number,
  flowIn: boolean,
  nearLow: boolean,
  retestOk: boolean,
  zigzag: ZzPt[],
  fib: {
    fib236: number | null;
    fib382: number | null;
    fib500: number | null;
    fib618: number | null;
    fib786: number | null;
  },
): SmcPlan {
  return {
    bias: walk.bias,
    event: walk.event,
    eventBarsAgo: walk.eventBarsAgo,
    structure,
    pd,
    eq,
    swingHigh,
    swingLow,
    poi,
    fvg,
    ob,
    why,
    weeklyBias,
    monthlyBias,
    loc,
    flowIn,
    nearLow,
    retestOk,
    zigzag: zigzag.slice(-14),
    fib618: fib.fib618,
    fib786: fib.fib786,
    fib500: fib.fib500,
    fib382: fib.fib382,
    fib236: fib.fib236,
    thesis: "",
    fresh: "WAIT",
    held: "HOLD",
    entryLow: null,
    entryHigh: null,
    sl: null,
    tp1: null,
    tp2: null,
    rr: null,
  };
}

/** Zigzag theo % — bỏ nhiễu ngắn hạn. Swing chỉ chốt khi đảo chiều đủ minPct (không look-ahead). */
export function significantZigZag(candles: Candle[], minPct: number): ZzPt[] {
  const n = candles.length;
  if (n < 8) return [];
  const pts: ZzPt[] = [];
  let tracking: "H" | "L" = candles[1]!.high >= candles[0]!.high ? "H" : "L";
  let extremeI = 0;
  let extremeP = tracking === "H" ? candles[0]!.high : candles[0]!.low;
  for (let i = 1; i < n; i++) {
    const c = candles[i]!;
    if (tracking === "H") {
      if (c.high >= extremeP) {
        extremeP = c.high;
        extremeI = i;
      }
      if (
        extremeI < i &&
        extremeP > 0 &&
        (extremeP - c.low) / extremeP >= minPct
      ) {
        pts.push({
          confirmedI: i,
          i: extremeI,
          price: extremeP,
          kind: "H",
          vol: candles[extremeI]!.volume,
          time: candles[extremeI]!.time,
        });
        tracking = "L";
        extremeP = c.low;
        extremeI = i;
      }
    } else {
      if (c.low <= extremeP) {
        extremeP = c.low;
        extremeI = i;
      }
      if (
        extremeI < i &&
        extremeP > 0 &&
        (c.high - extremeP) / extremeP >= minPct
      ) {
        pts.push({
          confirmedI: i,
          i: extremeI,
          price: extremeP,
          kind: "L",
          vol: candles[extremeI]!.volume,
          time: candles[extremeI]!.time,
        });
        tracking = "H";
        extremeP = c.high;
        extremeI = i;
      }
    }
  }
  return pts;
}

function walkMajor(
  close: number[],
  zz: ZzPt[],
): {
  bias: SmcBias;
  event: SmcEvent;
  eventBarsAgo: number | null;
  bosUpAt: number | null;
} {
  const n = close.length;
  let bias: SmcBias = "RANGE";
  let event: SmcEvent = "NONE";
  let eventAt = -1;
  let bosUpAt: number | null = null;
  let activeHigh: ZzPt | null = null;
  let activeLow: ZzPt | null = null;
  let p = 0;
  for (let i = 0; i < n; i++) {
    while (p < zz.length && (zz[p]!.confirmedI ?? zz[p]!.i) <= i) {
      const pt = zz[p]!;
      if (pt.kind === "H") activeHigh = pt;
      else activeLow = pt;
      p++;
    }
    const px = close[i]!;
    if (activeHigh && i > activeHigh.i && px > activeHigh.price) {
      event = bias === "BEAR" ? "CHOCH_UP" : "BOS_UP";
      bias = "BULL";
      eventAt = i;
      bosUpAt = i;
      activeHigh = null;
    } else if (activeLow && i > activeLow.i && px < activeLow.price) {
      event = bias === "BULL" ? "CHOCH_DOWN" : "BOS_DOWN";
      bias = "BEAR";
      eventAt = i;
      activeLow = null;
    }
  }
  if (bias === "RANGE") bias = biasFromZigZag(zz);
  return {
    bias,
    event,
    eventBarsAgo: eventAt >= 0 ? n - 1 - eventAt : null,
    bosUpAt,
  };
}

function biasFromZigZag(zz: ZzPt[]): SmcBias {
  const hs = zz.filter((p) => p.kind === "H");
  const ls = zz.filter((p) => p.kind === "L");
  if (hs.length < 2 || ls.length < 2) return "RANGE";
  const hh = hs[hs.length - 1]!.price > hs[hs.length - 2]!.price;
  const hl = ls[ls.length - 1]!.price > ls[ls.length - 2]!.price;
  const lh = hs[hs.length - 1]!.price < hs[hs.length - 2]!.price;
  const ll = ls[ls.length - 1]!.price < ls[ls.length - 2]!.price;
  if (hh && hl) return "BULL";
  if (lh && ll) return "BEAR";
  return "RANGE";
}

function locFromZz(zz: ZzPt[], price: number): number {
  const hs = zz.filter((p) => p.kind === "H");
  const ls = zz.filter((p) => p.kind === "L");
  if (!hs.length || !ls.length) return 0.5;
  const hi = hs[hs.length - 1]!.price;
  const lo = ls[ls.length - 1]!.price;
  const span = hi - lo;
  if (span <= 0) return 0.5;
  return (price - lo) / span;
}

function lastMajorBullFvg(
  high: number[],
  low: number[],
  close: number[],
  minGap: number,
): SmcZone | null {
  const last = close.length - 1;
  const from = Math.max(2, last - 120);
  let found: SmcZone | null = null;
  for (let i = from; i <= last; i++) {
    const bot = high[i - 2]!;
    const top = low[i]!;
    if (top <= bot) continue;
    if ((top - bot) / bot < minGap) continue;
    let filled = false;
    for (let k = i + 1; k <= last; k++) {
      if (low[k]! <= bot) {
        filled = true;
        break;
      }
    }
    if (!filled) found = { kind: "FVG", low: bot, high: top, i };
  }
  return found;
}

function lastBullishOb(
  open: number[],
  high: number[],
  low: number[],
  close: number[],
  bosUpAt: number | null,
  minRange: number,
): SmcZone | null {
  const end = bosUpAt ?? close.length - 1;
  const start = Math.max(1, end - 60);
  let ob: SmcZone | null = null;
  for (let i = end; i >= start; i--) {
    if (close[i]! >= open[i]!) continue;
    const rng = high[i]! - low[i]!;
    if (rng / close[i]! < minRange) continue;
    ob = { kind: "OB", low: low[i]!, high: high[i]!, i };
    break;
  }
  if (!ob) return null;
  for (let k = ob.i + 1; k < close.length; k++) {
    if (close[k]! < ob.low) return null;
  }
  return ob;
}

function pickPoi(
  ote: SmcZone | null,
  fvg: SmcZone | null,
  ob: SmcZone | null,
  lastLow: ZzPt,
  eq: number,
  price: number,
): SmcZone | null {
  const swing: SmcZone = {
    kind: "SWING",
    low: lastLow.price * 0.995,
    high: lastLow.price * 1.02,
    i: lastLow.i,
  };
  const ranked = [ote, fvg, ob, swing].filter((z): z is SmcZone => z != null);
  const alive = ranked.filter((z) => z.low < price * 1.01);
  const discount = alive.filter((z) => z.high <= eq * 1.02);
  const pool = discount.length ? discount : alive;
  if (!pool.length) return null;
  const prefer =
    pool.find((z) => z.kind === "OTE") ??
    pool.find((z) => z.kind === "FVG") ??
    pool[0]!;
  return prefer;
}

function successfulRetest(
  low: number[],
  close: number[],
  lastLow: ZzPt,
  n: number,
): boolean {
  const from = Math.max(lastLow.i, n - 18);
  let tagged = false;
  for (let i = from; i < n; i++) {
    if (low[i]! <= lastLow.price * 1.015) tagged = true;
    if (tagged && close[i]! > lastLow.price * 1.02 && i === n - 1) return true;
  }
  return tagged && close[n - 1]! > lastLow.price * 1.015;
}

function inZone(price: number, z: SmcZone | null): boolean {
  if (!z) return false;
  const lo = Math.min(z.low, z.high);
  const hi = Math.max(z.low, z.high);
  return price >= lo * 0.995 && price <= hi * 1.01;
}

function buildLongPlan(
  price: number,
  poi: SmcZone | null,
  swingLow: number,
  swingHigh: number,
  pd: SmcPd,
  block: boolean,
): {
  entryLow: number;
  entryHigh: number;
  sl: number;
  tp1: number;
  tp2: number;
  rr: number;
  inZone: boolean;
  priceAboveZone: boolean;
} | null {
  if (!poi || block) return null;
  const entryLow = Math.min(poi.low, poi.high);
  const entryHigh = Math.max(poi.low, poi.high);
  const sl = Math.min(entryLow, swingLow) * 0.992;
  if (!(sl < price)) return null;
  const tp1 = swingHigh > price * 1.01 ? swingHigh : null;
  if (tp1 == null || tp1 <= price) return null;
  const measured = swingHigh + (swingHigh - swingLow) * 0.5;
  const tp2 = measured > tp1 ? measured : tp1 * 1.06;
  const inZ = price >= entryLow && price <= entryHigh * 1.008;
  const priceAboveZone = price > entryHigh * 1.008;
  const fill = priceAboveZone
    ? entryHigh
    : inZ
      ? price
      : Math.min(price, entryHigh);
  if (!(fill > sl) || !(tp1 > fill)) return null;
  const rr = (tp1 - fill) / (fill - sl);
  if (rr < 1.3 && pd === "PREMIUM") return null;
  return { entryLow, entryHigh, sl, tp1, tp2, rr, inZone: inZ, priceAboveZone };
}

function resample(candles: Candle[], kind: "W" | "M"): Candle[] {
  const buckets = new Map<string, Candle>();
  const order: string[] = [];
  for (const c of candles) {
    const iso = vnDateFromUnix(c.time);
    const key = kind === "M" ? iso.slice(0, 7) : weekMonday(iso);
    const prev = buckets.get(key);
    if (!prev) {
      buckets.set(key, { ...c });
      order.push(key);
    } else {
      prev.high = Math.max(prev.high, c.high);
      prev.low = Math.min(prev.low, c.low);
      prev.close = c.close;
      prev.volume += c.volume;
      prev.time = c.time;
    }
  }
  return order.map((k) => buckets.get(k)!);
}

function weekMonday(iso: string): string {
  if (!iso) return "";
  const t = Date.parse(`${iso}T12:00:00+07:00`);
  if (!Number.isFinite(t)) return iso;
  const dow = new Date(t).toLocaleDateString("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "short",
  });
  const offset =
    { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[dow] ?? 0;
  return vnDateFromUnix((t - offset * 86_400_000) / 1000);
}

function atrLast(
  high: number[],
  low: number[],
  close: number[],
  p: number,
): number | null {
  if (close.length < p + 2) return null;
  let acc = 0;
  for (let i = close.length - p; i < close.length; i++) {
    const tr = Math.max(
      high[i]! - low[i]!,
      Math.abs(high[i]! - close[i - 1]!),
      Math.abs(low[i]! - close[i - 1]!),
    );
    acc += tr;
  }
  return acc / p;
}

function smaLast(arr: number[], p: number): number | null {
  if (arr.length < p) return null;
  let s = 0;
  for (let i = arr.length - p; i < arr.length; i++) s += arr[i]!;
  return s / p;
}

export function isLongTicket(
  price: number,
  entry: number | null,
  sl: number | null,
  tp1: number | null,
): boolean {
  if (entry == null || sl == null || tp1 == null) return false;
  if (!(sl < price) || !(tp1 > price) || !(entry > sl) || !(tp1 > entry))
    return false;
  return true;
}

function fmt(v: number): string {
  return (v / 1000).toFixed(2);
}

export function emptySmc(): SmcPlan {
  return { ...EMPTY, zigzag: [] };
}

export function smcFreshClass(fresh: SmcFresh | string | undefined): string {
  if (fresh === "BUY") return "bg-up-dim text-up";
  if (fresh === "SKIP") return "bg-down-dim text-down";
  return "bg-warn-dim text-warn";
}
