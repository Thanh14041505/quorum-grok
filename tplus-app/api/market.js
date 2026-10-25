import { loadSymbol } from "../server/market.mjs";
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });
  const url = new URL(req.url, "http://localhost");
  if (url.searchParams.get("health") === "1")
    return res
      .status(200)
      .json({
        ok: true,
        adapterConfigured: Boolean(process.env.MARKET_API_URL),
        keyConfigured: Boolean(process.env.MARKET_API_KEY),
        providers: ["VNDIRECT", "VPS"],
        interval: "D",
      });
  const symbol = (url.searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(symbol))
    return res.status(400).json({ error: "Invalid symbol" });
  try {
    return res
      .status(200)
      .json(await loadSymbol(symbol, url.searchParams.get("bars")));
  } catch (e) {
    return res
      .status(502)
      .json({
        error: e instanceof Error ? e.message : "Market feed unavailable",
        symbol,
      });
  }
}
