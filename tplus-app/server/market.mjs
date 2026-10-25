// Shared by the local server and Vercel function. No generated data in this path.
const cache = new Map();
const inflight = new Map();
const cooldown = new Map();
let active = 0;
const queue = [];
async function limited(fn) {
  if (active >= 3) await new Promise((resolve) => queue.push(resolve));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    queue.shift()?.();
  }
}
export function normalise(rows, symbol, unit = "thousand-vnd") {
  if (!Array.isArray(rows)) throw new Error("Invalid OHLCV payload");
  const factor =
    ["VNINDEX", "VN30"].includes(symbol) || unit === "vnd" ? 1 : 1000;
  const days = new Map();
  for (const r of rows) {
    const time =
      typeof r.time === "number"
        ? r.time
        : Date.parse(`${r.date ?? r.time}T00:00:00+07:00`) / 1000;
    const bar = {
      time,
      open: Number(r.adOpen ?? r.open) * factor,
      high: Number(r.adHigh ?? r.high) * factor,
      low: Number(r.adLow ?? r.low) * factor,
      close: Number(r.adClose ?? r.close) * factor,
      volume: Number(r.nmVolume ?? r.accumulatedVol ?? r.volume),
    };
    if (
      !Object.values(bar).every(Number.isFinite) ||
      bar.time <= 0 ||
      bar.time > Date.now() / 1000 + 86400 ||
      Math.min(bar.open, bar.low, bar.close) <= 0 ||
      bar.volume < 0 ||
      bar.high < Math.max(bar.open, bar.close, bar.low) ||
      bar.low > Math.min(bar.open, bar.close)
    )
      continue;
    const day = new Date(time * 1000 + 7 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    // Use the same timestamp for all feeds, allowing benchmark alignment by session.
    days.set(day, { ...bar, time: Date.parse(`${day}T00:00:00+07:00`) / 1000 });
  }
  const out = [...days.values()].sort((a, b) => a.time - b.time);
  if (out.length < 60)
    throw new Error("Insufficient valid history (minimum 60 sessions)");
  return out;
}
async function json(url, source, headers = {}) {
  if ((cooldown.get(source) ?? 0) > Date.now())
    throw new Error(`${source}: cooldown after upstream rate limit`);
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 TPlusCompass/1.0",
      ...headers,
    },
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 429) {
    const seconds = Math.min(
      300,
      Math.max(60, Number(response.headers.get("retry-after")) || 60),
    );
    cooldown.set(source, Date.now() + seconds * 1000);
    throw new Error(`${source}: rate limited; retry after ${seconds}s`);
  }
  if (!response.ok) throw new Error(`${source}: HTTP ${response.status}`);
  return response.json();
}
async function vndirect(symbol, bars) {
  const path = ["VNINDEX", "VN30"].includes(symbol)
    ? "vnmarket_prices"
    : "stock_prices";
  const data = await json(
    `https://api-finfo.vndirect.com.vn/v4/${path}?q=${encodeURIComponent("code:" + symbol)}&sort=date:desc&size=${Math.min(1000, bars + 40)}&page=1`,
    "VNDIRECT",
  );
  return normalise(data.data, symbol);
}
async function vps(symbol, bars) {
  const now = Math.floor(Date.now() / 1000);
  const d = await json(
    `https://histdatafeed.vps.com.vn/tradingview/history?symbol=${symbol}&resolution=D&from=${now - Math.ceil(bars * 1.9) * 86400}&to=${now}`,
    "VPS",
  );
  if (d.s !== "ok" || !Array.isArray(d.t))
    throw new Error("VPS: empty history");
  return normalise(
    d.t.map((time, i) => ({
      time,
      open: d.o?.[i],
      high: d.h?.[i],
      low: d.l?.[i],
      close: d.c?.[i],
      volume: d.v?.[i],
    })),
    symbol,
  );
}
async function adapter(symbol, bars) {
  const url = new URL(process.env.MARKET_API_URL);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("bars", String(bars));
  const d = await json(
    url,
    "ADAPTER",
    process.env.MARKET_API_KEY
      ? { Authorization: `Bearer ${process.env.MARKET_API_KEY}` }
      : {},
  );
  if (!["vnd", "thousand-vnd"].includes(d.unit))
    throw new Error("ADAPTER: unit must be vnd or thousand-vnd");
  return normalise(d.candles, symbol, d.unit);
}
export function lagWeekdays(time, now = Date.now()) {
  const day = new Date(time * 1000 + 7 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  const today = new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 10);
  let lag = 0;
  for (
    let t = Date.parse(day) + 86400000;
    t <= Date.parse(today);
    t += 86400000
  )
    if (![0, 6].includes(new Date(t).getUTCDay())) lag++;
  return lag;
}
export function isStale(time, now = Date.now()) {
  const vn = new Date(now + 7 * 3600 * 1000);
  const beforeClose =
    ![0, 6].includes(vn.getUTCDay()) &&
    vn.getUTCHours() * 60 + vn.getUTCMinutes() < 15 * 60 + 15;
  return lagWeekdays(time, now) > (beforeClose ? 1 : 0);
}
export async function loadSymbol(symbol, bars = 800) {
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(symbol)) throw new Error("Invalid symbol");
  bars = Math.min(1000, Math.max(250, Math.floor(Number(bars) || 800)));
  const key = `${symbol}:${bars}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.fetchedAt < 180000)
    return { ...hit, cached: true, stale: isStale(hit.candles.at(-1).time) };
  if (inflight.has(key)) return inflight.get(key);
  const task = limited(async () => {
    const failures = [];
    let best = null;
    for (const [source, fn] of process.env.MARKET_API_URL
      ? [
          ["ADAPTER", adapter],
          ["VNDIRECT", vndirect],
          ["VPS", vps],
        ]
      : [
          ["VNDIRECT", vndirect],
          ["VPS", vps],
        ]) {
      try {
        const candles = (await fn(symbol, bars)).slice(-bars);
        const candidate = {
          symbol,
          candles,
          source,
          fetchedAt: Date.now(),
          session: new Date(candles.at(-1).time * 1000 + 7 * 3600 * 1000)
            .toISOString()
            .slice(0, 10),
          stale: isStale(candles.at(-1).time),
          cached: false,
        };
        if (!best || candles.at(-1).time > best.candles.at(-1).time)
          best = candidate;
        if (!candidate.stale) break;
      } catch (e) {
        failures.push(
          `${source}: ${e instanceof Error ? e.message.replace(/https?:\/\/\S+/g, "[upstream]") : "feed unavailable"}`,
        );
      }
    }
    if (!best) {
      if (hit)
        return {
          ...hit,
          cached: true,
          stale: true,
          warning: "Feeds unavailable; showing previous cached snapshot",
        };
      throw new Error(failures.join(" | "));
    }
    cache.delete(key);
    cache.set(key, best);
    while (cache.size > 350) cache.delete(cache.keys().next().value);
    return best;
  });
  inflight.set(key, task);
  try {
    return await task;
  } finally {
    inflight.delete(key);
  }
}
