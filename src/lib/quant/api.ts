import { createServerFn } from "@tanstack/react-start";
import type { Candle, ScanConfig, ScanReport } from "./types";
import { DEFAULT_CONFIG } from "./config";
import { buildReport } from "./engine";

export const runScan = createServerFn({ method: "POST" })
  .validator((data: { symbols: string[]; config?: Partial<ScanConfig>; lookbackBars?: number }) => {
    if (!data || !Array.isArray(data.symbols)) throw new Error("symbols required");
    const symbols = [
      ...new Set(data.symbols.map((s) => String(s).trim().toUpperCase()).filter((s) => /^[A-Z0-9]{2,10}$/.test(s))),
    ];
    if (!symbols.length) throw new Error("symbols required");
    return {
      symbols,
      config: data.config ?? {},
      lookbackBars: data.lookbackBars ?? data.config?.lookbackBars ?? DEFAULT_CONFIG.lookbackBars,
    };
  })
  .handler(async ({ data }): Promise<ScanReport> => {
    const { loadMarket } = await import("./fetch.server");
    const cfg: ScanConfig = {
      ...DEFAULT_CONFIG,
      ...data.config,
      lookbackBars: data.lookbackBars ?? data.config?.lookbackBars ?? DEFAULT_CONFIG.lookbackBars,
    };
    const market = await loadMarket(data.symbols, cfg.lookbackBars);
    const report = buildReport(market.series, market.errors, market.demo, market.dataNote, cfg);
    return { ...report, requested: data.symbols.length };
  });

export const loadBars = createServerFn({ method: "POST" })
  .validator((data: { symbol: string; bars?: number }) => ({
    symbol: String(data.symbol).trim().toUpperCase(),
    bars: data.bars ?? 240,
  }))
  .handler(async ({ data }): Promise<{ candles: Candle[]; demo: boolean }> => {
    const { loadOne } = await import("./fetch.server");
    try {
      const candles = await loadOne(data.symbol, data.bars);
      return { candles: candles.slice(-data.bars), demo: false };
    } catch {
      const { demoSeries } = await import("./demo-data");
      return { candles: demoSeries(data.symbol, data.bars), demo: true };
    }
  });

export const explainName = createServerFn({ method: "POST" })
  .validator((data: { symbol: string; brief: string }) => ({
    symbol: String(data.symbol).trim().toUpperCase().slice(0, 10),
    brief: String(data.brief).slice(0, 4000),
  }))
  .handler(async ({ data }): Promise<{ ok: true; text: string } | { ok: false; error: string }> => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false, error: "AI note is unavailable in this environment." };
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 320,
        messages: [
          {
            role: "system",
            content:
              "You are a Vietnam-stock desk analyst. Write in Vietnamese. Explain the 7-brain consensus without inventing prices, certainty, or a magic score. Conflict is information. Max 160 words. No markdown headings.",
          },
          { role: "user", content: `${data.symbol}\n${data.brief}` },
        ],
      }),
    });
    if (!res.ok) return { ok: false, error: `xAI ${res.status}` };
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return { ok: true, text: body.choices?.[0]?.message?.content ?? "" };
  });
