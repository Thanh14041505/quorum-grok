import test from "node:test";
import assert from "node:assert/strict";
import { normalise, lagWeekdays, loadSymbol } from "../server/market.mjs";
const rows = Array.from({ length: 80 }, (_, i) => ({
  date: new Date(Date.UTC(2026, 7, i + 1)).toISOString().slice(0, 10),
  open: 20,
  high: 22,
  low: 19,
  close: 21,
  nmVolume: 1000000,
}));
test("normalisation preserves adjusted OHLC and VND/index units", () => {
  const c = normalise([...rows].reverse(), "FPT");
  assert.equal(c[0].close, 21000);
  assert.equal(c[0].volume, 1000000);
  assert.ok(c[0].time < c.at(-1).time);
  assert.equal(normalise(rows, "VNINDEX")[0].close, 21);
  assert.equal(normalise(rows, "FPT", "vnd")[0].close, 21);
  assert.equal(
    normalise(
      rows.map((r) => ({ ...r, adClose: 20.5 })),
      "FPT",
    )[0].close,
    20500,
  );
});
test("bad bars are excluded, sessions deduped and empty payloads fail", () => {
  const c = normalise([...rows, rows[0], { ...rows[1], low: 25 }], "SSI");
  assert.equal(c.length, 80);
  assert.throws(() => normalise([], "SSI"), /Insufficient/);
});
test("freshness ignores weekends but detects missed sessions", () => {
  const fri = Date.parse("2026-10-23T00:00:00+07:00") / 1000;
  assert.equal(lagWeekdays(fri, Date.parse("2026-10-25T12:00:00+07:00")), 0);
  assert.equal(lagWeekdays(fri, Date.parse("2026-10-27T12:00:00+07:00")), 2);
});
test("both upstreams failing raises an error, never serves generated candles", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("network unreachable");
  };
  try {
    await assert.rejects(loadSymbol("FAILTEST", 800), /network unreachable/);
  } finally {
    globalThis.fetch = original;
  }
});
test("a duplicate request shares a single upstream operation and is cached", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ data: rows }));
  };
  try {
    const [a, b] = await Promise.all([
      loadSymbol("CACHETEST"),
      loadSymbol("CACHETEST"),
    ]);
    assert.equal(a.session, b.session);
    const count = calls;
    await loadSymbol("CACHETEST");
    assert.equal(calls, count);
    assert.ok(count <= 2);
  } finally {
    globalThis.fetch = original;
  }
});
