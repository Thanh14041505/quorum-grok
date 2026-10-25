/// <reference lib="webworker" />
import { analyze, type Feed, type Settings, type Analysis } from "./terminal";
let feeds = new Map<string, Feed>();
let lastConfig = "";
self.onmessage = (
  event: MessageEvent<{
    changed: Feed[];
    symbols: string[];
    settings: Settings;
  }>,
) => {
  const { changed, symbols, settings } = event.data;
  const active = new Set(symbols);
  for (const key of feeds.keys()) if (!active.has(key)) feeds.delete(key);
  const config = JSON.stringify(settings);
  const all =
    config !== lastConfig || changed.some((f) => f.symbol === "VNINDEX");
  lastConfig = config;
  for (const f of changed) feeds.set(f.symbol, f);
  const candidates = all ? [...feeds.values()] : changed;
  const results: Analysis[] = [];
  for (const f of candidates) {
    if (f.symbol === "VNINDEX") continue;
    try {
      results.push(analyze(f, feeds.get("VNINDEX") ?? null, settings));
    } catch (e) {
      self.postMessage({
        error: `${f.symbol}: ${e instanceof Error ? e.message : "Analysis error"}`,
      });
    }
  }
  const bench = feeds.get("VNINDEX");
  self.postMessage({
    results,
    symbols,
    config,
    benchmarkVersion: bench
      ? `${bench.fetchedAt}:${bench.source}:${bench.stale}`
      : "",
  });
};
