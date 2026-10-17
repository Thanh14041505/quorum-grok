import type { Candle } from "./types";
import { demoSeries } from "./demo-data";
import { calendarLagDays, isStaleSession, vnDateFromUnix, vnToday } from "./dates";

const cache = new Map<string, { at: number; candles: Candle[]; bars: number; last: number }>();
const TTL_MS = 3 * 60 * 1000;

function isIndex(symbol: string) {
  return symbol === "VNINDEX" || symbol === "VN30";
}

/**
 * VPS/VNDIRECT trả giá cổ phiếu theo nghìn VNĐ (66.4 = 66,400₫).
 * Index để nguyên điểm. Nhân 1000 để khớp Daily Scanner min_price=5_000₫.
 */
function toVnd(symbol: string, px: number): number {
  if (isIndex(symbol)) return px;
  return px * 1000;
}

function sortDedup(candles: Candle[]): Candle[] {
  const byDay = new Map<string, Candle>();
  for (const c of candles) {
    if (!Number.isFinite(c.close) || c.close <= 0 || !c.time) continue;
    byDay.set(vnDateFromUnix(c.time), c);
  }
  return [...byDay.values()].sort((a, b) => a.time - b.time);
}

function assertFresh(symbol: string, candles: Candle[], source: string): Candle[] {
  const last = candles[candles.length - 1];
  if (!last) throw new Error(`${source} empty`);
  if (isStaleSession(last.time, 7)) {
    throw new Error(
      `${source} stale last bar ${vnDateFromUnix(last.time)} (today ${vnToday()})`,
    );
  }
  return candles;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; QuorumVN/1.1; research terminal)",
    },
    signal: AbortSignal.timeout(14_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fromVps(symbol: string, bars: number): Promise<Candle[]> {
  const now = Math.floor(Date.now() / 1000);
  const from = now - 86_400 * Math.ceil(Math.max(bars, 60) * 1.8);
  const url = `https://histdatafeed.vps.com.vn/tradingview/history?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${now}`;
  const data = (await getJson(url)) as {
    s?: string;
    t?: number[];
    o?: number[];
    h?: number[];
    l?: number[];
    c?: number[];
    v?: number[];
  };
  if (data.s !== "ok" || !data.t?.length || !data.c?.length) {
    throw new Error("VPS empty");
  }
  const out: Candle[] = [];
  for (let i = 0; i < data.t.length; i++) {
    out.push({
      time: data.t[i]!,
      open: toVnd(symbol, data.o?.[i] ?? data.c[i]!),
      high: toVnd(symbol, data.h?.[i] ?? data.c[i]!),
      low: toVnd(symbol, data.l?.[i] ?? data.c[i]!),
      close: toVnd(symbol, data.c[i]!),
      volume: data.v?.[i] ?? 0,
    });
  }
  return assertFresh(symbol, sortDedup(out), "VPS");
}

/**
 * VNDIRECT v4 mặc định size=N + sort=asc trả N ngày CŨ NHẤT từ mốc start —
 * đó là bug khiến desk phân tích phiên 5 tháng trước. Luôn sort=desc rồi đảo chiều.
 */
async function fromVndirect(symbol: string, bars: number): Promise<Candle[]> {
  const size = Math.min(Math.max(bars + 40, 120), 1000);
  const q = encodeURIComponent(`code:${symbol}`);
  const path = isIndex(symbol) ? "vnmarket_prices" : "stock_prices";
  const pages: Candle[] = [];
  const need = bars + 20;
  let page = 1;
  while (pages.length < need && page <= 4) {
    const url = `https://api-finfo.vndirect.com.vn/v4/${path}?q=${q}&sort=date:desc&size=${size}&page=${page}`;
    const data = (await getJson(url)) as {
      data?: Array<{
        date: string;
        adOpen?: number;
        adHigh?: number;
        adLow?: number;
        adClose?: number;
        open?: number;
        high?: number;
        low?: number;
        close?: number;
        nmVolume?: number;
        accumulatedVol?: number;
      }>;
    };
    const rows = data.data ?? [];
    if (!rows.length) break;
    for (const r of rows) {
      if (!r.date) continue;
      const close = r.adClose ?? r.close ?? 0;
      pages.push({
        time: Math.floor(new Date(`${r.date}T07:00:00+07:00`).getTime() / 1000),
        open: toVnd(symbol, r.adOpen ?? r.open ?? close),
        high: toVnd(symbol, r.adHigh ?? r.high ?? close),
        low: toVnd(symbol, r.adLow ?? r.low ?? close),
        close: toVnd(symbol, close),
        volume: r.nmVolume ?? r.accumulatedVol ?? 0,
      });
    }
    if (rows.length < size) break;
    page++;
  }
  if (!pages.length) throw new Error("VNDIRECT empty");
  return assertFresh(symbol, sortDedup(pages), "VNDIRECT");
}

function pickNewer(a: Candle[] | null, b: Candle[] | null): Candle[] | null {
  const la = a?.[a.length - 1]?.time ?? 0;
  const lb = b?.[b.length - 1]?.time ?? 0;
  if (lb > la) return b;
  return a;
}

async function loadOne(symbol: string, bars: number): Promise<Candle[]> {
  const key = `${symbol}:${bars}`;
  const hit = cache.get(key);
  if (
    hit &&
    Date.now() - hit.at < TTL_MS &&
    hit.bars >= bars &&
    hit.candles.length >= 60 &&
    !isStaleSession(hit.last, 7)
  ) {
    return hit.candles.slice(-bars);
  }

  let best: Candle[] | null = null;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const fn of [fromVndirect, fromVps]) {
      try {
        const candles = await fn(symbol, bars);
        best = pickNewer(best, candles);
      } catch (err) {
        lastErr = err;
      }
    }
    if (best && best.length >= 60 && !isStaleSession(best[best.length - 1]!.time, 7)) break;
    await new Promise((r) => setTimeout(r, 240 * (attempt + 1)));
  }

  if (!best || best.length < 60) {
    throw lastErr instanceof Error ? lastErr : new Error("All sources failed");
  }
  cache.set(key, { at: Date.now(), candles: best, bars, last: best[best.length - 1]!.time });
  return best.slice(-bars);
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export async function loadMarket(symbols: string[], bars = 800) {
  const uniq = [...new Set(["VNINDEX", ...symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)])];
  const series: Record<string, Candle[]> = {};
  const errors: Record<string, string> = {};
  let live = 0;
  await mapPool(uniq, 6, async (symbol) => {
    try {
      series[symbol] = await loadOne(symbol, bars);
      live++;
    } catch (err) {
      errors[symbol] = err instanceof Error ? err.message : String(err);
    }
  });

  let demo = false;
  const lastIdx = series.VNINDEX?.[series.VNINDEX.length - 1];
  const asOf = lastIdx ? vnDateFromUnix(lastIdx.time) : vnToday();
  const lag = lastIdx ? calendarLagDays(asOf) : 999;
  let dataNote = `Live OHLCV VNDIRECT (desc) / VPS. Phiên ${asOf}. Giá VND, UI nghìn VNĐ.`;
  if (lag > 0) dataNote += ` Last bar is ${lag}d behind Vietnam today ${vnToday()}.`;
  if (live < Math.min(2, uniq.length)) {
    demo = true;
    dataNote = "Market APIs unreachable — showing structural demo series so the desk still works. Not tradable.";
    for (const symbol of uniq) {
      if (!series[symbol]) series[symbol] = demoSeries(symbol, bars);
      delete errors[symbol];
    }
  }
  return { series, errors, demo, dataNote };
}

export { loadOne };
