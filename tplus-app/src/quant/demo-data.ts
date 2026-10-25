import type { Candle } from "./types";
import { hashSymbol } from "./math";

/** Walk giả lập có cấu trúc VN (gap cuối tuần, biên ATR ~2%) — chỉ dùng khi người dùng chọn DEMO. */
export function demoSeries(
  symbol: string,
  bars = 320,
  now = Date.now(),
): Candle[] {
  const seed = hashSymbol(symbol);
  let price = 12_000 + (seed % 80_000);
  if (symbol === "VNINDEX") price = 1_200;
  const isIndex = symbol === "VNINDEX" || symbol === "VN30";
  const out: Candle[] = [];
  let t = Math.floor(now / 1000);
  let remaining = bars - 1;
  while ([0, 6].includes(new Date(t * 1000).getUTCDay())) t -= 86400;
  while (remaining > 0) {
    t -= 86400;
    if (![0, 6].includes(new Date(t * 1000).getUTCDay())) remaining--;
  }
  let i = 0;
  while (out.length < bars) {
    const d = new Date(t * 1000);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      const n =
        Math.sin((i + seed) * 0.07) * 0.012 +
        (((seed >> (i % 16)) & 7) - 3) * 0.003;
      const open = price;
      const close = Math.max(1000, price * (1 + n));
      const high =
        Math.max(open, close) * (1 + 0.008 + ((seed >> 3) & 3) * 0.002);
      const low = Math.min(open, close) * (1 - 0.008);
      const volume = isIndex ? 0 : 400_000 + (seed % 5_000_000) + i * 137;
      out.push({
        time: t,
        open: isIndex ? open : Math.round(open),
        high: isIndex ? high : Math.round(high),
        low: isIndex ? low : Math.round(low),
        close: isIndex ? close : Math.round(close),
        volume,
      });
      price = close;
      i++;
    }
    t += 86400;
  }
  return out;
}
