# T+ Compass — Vietnam scanning terminal

Standalone React + TypeScript app, with a small Node OHLCV API. Run locally or deploy the `tplus-app` folder as a separate Vercel project. No fundamentals, database, paid AI service or authentication required.

## Local

Node 22+ recommended.

```bash
cd tplus-app
npm ci
cp .env.example .env.local  # optional; default feeds require no key
npm run dev
```

Open http://localhost:5173. Windows PowerShell: `Copy-Item .env.example .env.local` instead of `cp`.

```bash
npm test
npm run build
```

`npm run preview` previews only the built frontend. Use `npm run dev` for the local API, or Vercel for the production API.

## Vercel

1. Import `Thanh14041505/quorum-grok` and select this feature branch (or main after merging).
2. **Root Directory: `tplus-app`**. Framework: Vite. Install: `npm ci`. Build: `npm run build`. Output: `dist`.
3. Deploy. `api/market.js` runs as a Node serverless function; `/stock/FPT` deep links are rewritten to the app.
4. Default feeds need no key. Optional adapter variables are server-only: `MARKET_API_URL`, `MARKET_API_KEY`. Never prefix a secret with `VITE_`.

This is a separate app. The original Quorum application and its deployment configuration are unchanged.

## Workflow

- Settings: paste comma/space/semicolon-separated symbols, save named watchlists, reopen/delete lists, choose the broad universe, save risk/cost/concurrency settings. Up to 300 unique symbols.
- Scan: VNINDEX first, then a pool of 1–3 symbol requests. Cancel retains completed rows. Per-symbol errors are visible; retry retains successful rows. No automatic background polling.
- Table: 20-session sparkline, price/change, source session/status, score, consensus, four setups, deterministic Call, SMC. Switch **Kế hoạch/Kỹ thuật** to inspect entry/SL/targets/R:R or Trend/Flow/Ichimoku/VSA/PK RSI/RVOL.
- Filters: SMC Longs, confirmed entries, watch, blocked, setup, score, ticker; sort by score, net R:R or symbol.
- Details: entry/SL/TP1/TP2/R:R first, then candle chart, major SMC zigzag, confirmed local swing triangles, Fibonacci OTE, discount, OB and execution plan. View 60/120/200/400 bars, crosshair OHLCV and optional overlays. Eight expandable strategy cards below.
- CSV exports the filtered rows, VND price levels, both target R:Rs, conservative net R:R, feed/session/timestamp, triggers and warnings. No extra network request.
- Last live scan is stored in IndexedDB. Restored snapshots are explicitly stale until refreshed. Demo is opt-in and never produces an actionable Call.

## Data API

`GET /api/market?symbol=FPT&bars=800`

VNDirect adjusted daily OHLCV first, VPS fallback. VNDirect requests newest records (`date:desc`) and sorts ascending after validation. Prices normalised to **VND**, indices remain **points**. UI stock prices are **thousand VND**. Invalid OHLCV is excluded; sessions are deduplicated and timestamps aligned to Vietnamese calendar days. At least 60 valid bars are required by the API, 250 for a tradable engine row/benchmark.

Each response includes `source`, `session`, `fetchedAt`, `cached`, `stale`, and candles. `GET /api/market?health=1` returns configuration flags, never the key.

Default data is **D1 snapshots**, potentially including the unfinished session. This is not a streaming quote feed. Verify current prices before execution. Freshness is checked against Vietnamese weekdays and 15:15 local time; exchange holidays are not modelled and can conservatively flag a snapshot stale. A stock/benchmark session mismatch blocks new entries.

Warm-process cache: 3 minutes, bounded to 350 entries, duplicate-request coalescing, upstream 429 cooldown and a shared pool of three. Client also caps concurrency to three. Vercel instances have separate caches/limits; there is no distributed quota guarantee. If all feeds fail, return an error or explicitly stale cached data. Never synthesize market candles as an error fallback.

### Optional authenticated adapter

Set `MARKET_API_URL` to a trusted OHLCV endpoint. The server appends `symbol` and `bars`; `MARKET_API_KEY` is sent only as `Authorization: Bearer …` to that configured endpoint. The browser cannot choose an upstream URL. Required response:

```json
{
  "unit": "vnd",
  "candles": [
    {
      "time": 1792688400,
      "open": 57000,
      "high": 58000,
      "low": 56500,
      "close": 57500,
      "volume": 1000000
    }
  ]
}
```

Use `unit: "thousand-vnd"` for 57.0-style stock prices. `time` is Unix seconds. Supply at least 250 daily bars; 800 is preferable for weekly/monthly context. This is a generic adapter contract, not a direct vnstock API-key integration.

## Trade plan and R:R

See [IMPLEMENTATION.md](./IMPLEMENTATION.md) for source-by-source decisions and engine limitations.

- Setup classification: uptrend pullback, uptrend breakout continuation, downtrend relief rally, major reversal. The **NONE** state does not invent a setup.
- Entry: setup-dependent support/SMC demand/Kijun/EMA or the previous 20-session breakout high.
- SL: last confirmed local low below the anchor, with a 0.2 ATR buffer. It is never squeezed to force a preferred R:R.
- TP1/TP2: nearest distinct confirmed swing highs above the entire entry zone, within the past 180 sessions, plus the last confirmed major swing high. No multiple-of-risk synthetic target. If there is no resistance in price discovery, targets stay empty and Call cannot become BUY.
- Gross R:R is shown for TP1 and TP2 at entry midpoint, and for TP1 at the upper entry bound. Net R:R uses the upper bound and subtracts configurable costs on both legs:
  `reward = TP*(1-cost) - entry*(1+cost)`;
  `risk = entry*(1+cost) - SL*(1-cost)`.
  Default per-side cost is 15 bps fees/tax reserve + 10 bps slippage; configure for your account.
- Final Call is distinct from raw consensus. New entries require valid data, a fresh and aligned benchmark, no setup hard veto, price inside zone, confirmation candle/flow (or breakout/volume), enough supporting evidence, and conservative net R:R ≥ the configurable threshold. Major reversal also requires upward BOS/CHoCH plus a held retest. Probe sizing uses half the risk budget. Displayed sizing is indicative and uses 100-share lots.
- S1–S6 ballot; S8 tape and S9 SMC confirm. **S7 is not registered, executed or shown.** Scores rank candidates; they are not win probabilities. The eight TypeScript strategies come from Quorum, not exact replicas of the Python notebook strategies with the same IDs.

## Validation

`npm test`: inherited consensus/four-setup cases plus new structural-target, net-cost, stale/demo/benchmark gates, pivot confirmation, no-future-demo, OHLCV normalization, units, no-demo fallback and cache tests.

Browser smoke test (Chromium required):

```bash
npx playwright install chromium
node --import tsx tests/browser-smoke.mjs
```

It checks demo scanning, technical columns, eight strategy detail cards, mobile overflow, watchlist/settings persistence, partial API errors and retry behaviour. Tests use deterministic fixtures, not live trading prices. Screenshots are temporary QA output.

The new synthesis has no historical performance validation. SL cannot guarantee an exit at its displayed price during gaps/limit-down sessions, and a T+ plan does not assume shares can be sold before settlement.
