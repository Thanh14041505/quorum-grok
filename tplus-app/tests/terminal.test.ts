import test from "node:test";
import assert from "node:assert/strict";
import {
  analyze,
  confirmedSwings,
  DEFAULT_SETTINGS,
  netRr,
  parseSymbols,
  structuralTicket,
} from "../src/terminal";
import { demoSeries } from "../src/quant/demo-data";
import { significantZigZag } from "../src/quant/smc";
import { errorRow, STRATEGIES } from "../src/quant/engine";
import { buildTradePlan } from "../src/quant/trade-plan";
import { DEFAULT_CONFIG } from "../src/quant/config";
import type { Candle } from "../src/quant/types";

test("symbol list normalises, dedupes and rejects URL/input injection", () => {
  assert.deepEqual(
    parseSymbols("fpt; HPG FPT, SSI\nhttps://evil.test X<script>"),
    ["FPT", "HPG", "SSI"],
  );
});
test("S7 is absent from the executable strategy registry", () => {
  assert.equal(STRATEGIES.length, 8);
  assert.ok(!STRATEGIES.some((s) => s.meta.shortId === "S7"));
});
test("demo sessions never extend into the future", () => {
  const now = Date.parse("2026-10-25T05:00:00Z");
  const c = demoSeries("HPG", 800, now);
  assert.equal(c.length, 800);
  assert.ok(c.at(-1)!.time * 1000 <= now);
});
test("short swings require right-hand confirmation and preserve past prefixes", () => {
  const c = Array.from({ length: 400 }, (_, i) => {
    const p = 10000 + Math.sin(i * 0.25) * 700;
    return {
      time: 1700000000 + i * 86400,
      open: p,
      close: p,
      high: p + 100,
      low: p - 100,
      volume: 1e6,
    };
  });
  const half = confirmedSwings(c.slice(0, 200));
  assert.ok(half.length > 0);
  assert.deepEqual(
    half,
    confirmedSwings(c).filter((p) => p.confirmedAt <= c[199].time),
  );
  assert.ok(half.every((p) => p.confirmedAt > p.time));
});
test("major zigzag records the first knowable confirmation time", () => {
  const c = demoSeries("FPT", 800);
  const early = significantZigZag(c.slice(0, 400), 0.08);
  assert.ok(early.length > 0);
  assert.ok(early.every((p) => p.confirmedI! > p.i));
  assert.deepEqual(
    early,
    significantZigZag(c, 0.08).filter((p) => p.confirmedI! < 400),
  );
});
test("costs reduce R:R and upper-entry calculation is conservative", () => {
  assert.equal(netRr(100, 95, 110, 0), 2);
  assert.ok(netRr(100, 95, 110, 25)! < 2);
  assert.ok(netRr(102, 95, 110, 25)! < netRr(100, 95, 110, 25)!);
});
function row() {
  const r = errorRow("HPG", "fixture");
  r.status = "OK";
  r.price = 10000;
  r.tradePlan = {
    ...buildTradePlan({
      strategies: [],
      consensus: r.consensus,
      regime: "BULL",
      smc: null,
      price: 10000,
      cfg: DEFAULT_CONFIG,
    }),
    setupType: "PULLBACK_UPTREND",
  };
  return r;
}
function wave(): Candle[] {
  return Array.from({ length: 100 }, (_, i) => {
    const p = 10000 + Math.sin(i * 0.25) * 700;
    return {
      time: 1700000000 + i * 86400,
      open: p,
      close: p,
      high: p + 100,
      low: p - 100,
      volume: 1e6,
    };
  });
}
test("ticket targets are observed confirmed highs, never a forced R multiple", () => {
  const c = wave(),
    r = row();
  const t = structuralTicket(r, c, DEFAULT_SETTINGS, 300, 9800, 9900);
  assert.ok(t);
  assert.ok(t.sl < t.low);
  assert.ok(t.tp1! > t.high);
  assert.ok(t.tp2 == null || t.tp2 > t.tp1!);
  assert.ok(
    confirmedSwings(c).some((p) => p.kind === "H" && p.price === t.tp1),
  );
  const highThreshold = structuralTicket(
    r,
    c,
    { ...DEFAULT_SETTINGS, minRr: 9 },
    300,
    9800,
    9900,
  );
  assert.equal(highThreshold?.tp1, t.tp1);
  assert.equal(highThreshold?.sl, t.sl);
});
test("price discovery has no fabricated TP and cannot become READY without targets", () => {
  const c = wave(),
    r = row();
  r.price = 12000;
  const t = structuralTicket(r, c, DEFAULT_SETTINGS, 600, 11500, 11600);
  assert.ok(t);
  assert.equal(t.tp1, null);
  assert.equal(t.tp2, null);
  assert.equal(t.rrNet, null);
});
test("stale, demo, and missing benchmark lock new entries", () => {
  const candles = demoSeries("FPT", 800);
  const feed = {
    symbol: "FPT",
    candles,
    source: "VNDIRECT",
    session: "2026-10-23",
    fetchedAt: Date.now(),
    stale: false,
    cached: false,
  };
  const bench = {
    ...feed,
    symbol: "VNINDEX",
    candles: demoSeries("VNINDEX", 800),
  };
  for (const [f, b] of [
    [{ ...feed, stale: true }, bench],
    [{ ...feed, source: "DEMO" }, bench],
    [feed, null],
    [feed, { ...bench, session: "2026-10-22" }],
  ] as const) {
    assert.equal(analyze(f, b, DEFAULT_SETTINGS).call, "NO_TRADE");
  }
});
