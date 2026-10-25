# Source review and implementation decisions

Reviewed the default branches of the five supplied repositories on 25 October 2026. Source commits:

| Repository                  | Commit                                   | Files/behaviour reviewed                                                           | Result                                                                                                                                                                               |
| --------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| quant-trading-web-chatgpt   | e4340a77a23f1543c9a3afa9116d625896749272 | T+ table, stock detail, settings, T+ engine, OHLCV API/env sample                  | Table/detail hierarchy, server-side credential configuration. Do not inherit minimum-reward target forcing.                                                                          |
| quant-trading-web-grok      | fefa753624751fed0e48966550a27ee2ec31e3ac | T+ table/detail/settings, tplusRisk, VNDirect adapter                              | Editable/saved custom lists, entry zones, upper-entry conservative R:R. Do not inherit ATR SL clipping or manufactured TP fallbacks.                                                 |
| quant-trading-stock-scanner | 6c076f48903f7045f003ba5095932c154d622d7a | S1–S9 adapters/registry/mapping, charts/detail pages, README                       | Philosophy of multiple strategy evidence cards, confirmed swing-high/low markers, separate SMC context. Remove S7. Original Python notebook strategies are not byte-for-byte ported. |
| live_stock_scan             | 80ff23ea9f578cdc0d3abb4b2912c486e38e746b | app table/detail layout, vn_quant engine and SMC                                   | Trend, Flow, Ichimoku, VSA, PK RSI/Composite context columns. Do not show uncalibrated Win% or fixed risk-multiple targets as validated predictions.                                 |
| quorum-grok                 | f361232bbe27a6aa566bd0a3cf2dfe9469c3d3f0 | quant engine/strategies/consensus/trade-plan/SMC/fetch, scanner, detail, SMC chart | Reuse TypeScript technical engine and SMC model, 20D sparkline/status/setup/consensus/Call layout. Build a separate minimal Vite app and Node API.                                   |

## Fidelity and deliberate changes

The Quorum TypeScript engine is reused locally under `src/quant` so no Python/Streamlit runtime or full financial-data service is needed. Its IDs mean:

| ID  | This app / Quorum model    | Relationship to stock-scanner notebooks                                       |
| --- | -------------------------- | ----------------------------------------------------------------------------- |
| S1  | Daily Pulse                | Related multi-factor philosophy, not Python S1 v5.5 parity                    |
| S2  | Ichimoku 3TF               | Ichimoku evidence, not Python S2 v5.7 parity                                  |
| S3  | VSA Smart Money            | VSA evidence, not the complete Python S3 engine                               |
| S4  | Volume Profile             | Volume-location evidence; different from Python S4 RSI engine                 |
| S5  | Multi-Factor               | Independent technical score; not Python S5 PR016 parity                       |
| S6  | RSI / Composite Divergence | Confirmed divergence evidence; not Python S6 PR016 parity                     |
| S8  | Grok Tape                  | Quorum deterministic tape model, not an LLM API call and not Python S8 parity |
| S9  | SMC                        | Quorum major D/W/M structure model                                            |

This avoids double-counting nearly duplicate Python notebook families as six independent model confirmations. The six ballot components still share OHLCV indicators and are **not statistically independent**. No claim of notebook parity or validated consensus win rate is made.

Quorum's legacy raw strategy labels and setup classification are retained as inspectable evidence. Some of those raw labels still contain their original R:R/target thresholds. The prominent ticket and final **Call** are built by `terminal.ts` from actual support/resistance and the user's net-R:R setting; the inherited ticket decision is not the displayed execution decision. Raw cards do not present their legacy entry/SL/TP as a competing recommended ticket. Setup hard vetoes (distribution, supply, broken confirmed low, etc.) remain effective.

The inherited S7 holder strategy was removed from the executable registry and file set. S7 references in historical tests/type comments describe legacy input compatibility, not a running strategy.

## SMC temporal correction

Quorum's major zigzag records where an extreme occurred. Its historical BOS/CHoCH walker originally activated that pivot immediately after the extreme date, even though it was only knowable after an 8–14% reversal. The new version records `confirmedI`, waits for a later candle (avoids assuming high/low order inside a single daily candle), and activates the pivot only at confirmation. Chart points remain anchored at the historical extreme for visual clarity.

Weekly/monthly bars are resampled from the available daily history and may include the current unfinished period. An 800-bar window cannot always establish a reliable monthly bias or the full monthly Ichimoku cloud; unknown/range context must not be read as confirmation. Higher-timeframe reversal thresholds remain those of Quorum (12% weekly, 16% monthly).

## Performance and operational boundaries

- Node functions fetch only OHLCV, one symbol per invocation; no long-running multi-symbol function needed.
- VNDirect first; do not call both providers every time when the primary has valid recent data.
- Browser scan concurrency 1–3, warm-server shared upstream pool 3, 3-minute bounded cache, in-flight request deduplication, per-source 429 cooldown. No claim of account-wide distributed throttling on Vercel.
- The analysis Web Worker receives only changed candle series, caches other symbols in memory and recomputes all only when benchmark/settings change. Analysis stays off the browser UI thread.
- Failed symbols do not invalidate successful rows. Saved browser snapshots are restored as stale. Benchmarks and individual stock sessions are checked before any actionable Call.
- Default D1 snapshots do not promise realtime streaming. Source/session/load time are shown/exported. Actual latency varies by provider/network; no performance superiority claim is made.
- No automated execution, historical profit claim or new fundamental dependency.
