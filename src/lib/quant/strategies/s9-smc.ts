import { blankResult, type Strategy } from "./contract";
import { isLongTicket } from "../smc";

/**
 * S9 SMC khung lớn — zigzag % / BOS-CHoCH / Fib OTE / D+W+M.
 * Không vote. VN long-only. Không dùng fractal 3 nến (nhiễu).
 */
export const smcStructure: Strategy = {
  meta: {
    id: "smc-structure",
    shortId: "S9",
    name: "SMC Structure",
    sourceNotebook: "Original — Super SMC 1D style, mapped to VN cash (long only)",
    sourceSection: "Major zigzag (≥8%) → D/W/M BOS-CHoCH → Fib OTE 0.618–0.786 → money-in / retest at HTF low",
    philosophy:
      "Read the wide map, not the last 3 bars. Buy only at a major discount or a held retest of a significant low with money in. Bearish HTF is skip/cut — never a short.",
    indicators: ["Zigzag 8–14% ATR", "BOS / CHoCH on major swings", "Fib OTE 0.618–0.786", "Weekly + Monthly bias", "Volume demand bar", "Swing-low retest"],
    filters: ["ignore sub-8% noise", "long-only geometry", "no chase in premium", "SL under last major low"],
  },
  run(ctx) {
    const plan = ctx.smc;
    const price = ctx.snap.close;
    const longOk = isLongTicket(price, plan.entryHigh ?? plan.entryLow, plan.sl, plan.tp1);
    let signal: "BUY" | "WATCH" | "NO_SIGNAL" | "REDUCE" | "EXIT" = "NO_SIGNAL";
    let score = 45;
    if (plan.fresh === "BUY" && longOk) {
      signal = "BUY";
      score = plan.nearLow || plan.pd === "DISCOUNT" ? 84 : 74;
    } else if (plan.fresh === "WAIT") {
      signal = "WATCH";
      score = 56;
    } else if (plan.held === "CUT") {
      signal = "EXIT";
      score = 16;
    } else if (plan.held === "REDUCE" || plan.fresh === "SKIP") {
      signal = "REDUCE";
      score = 26;
    }

    const checks = [
      { ok: plan.bias === "BULL" || plan.event === "CHOCH_UP", text: `D1 ${plan.bias} ${plan.event}` },
      { ok: plan.weeklyBias !== "BEAR", text: `W1 ${plan.weeklyBias}` },
      { ok: plan.monthlyBias !== "BEAR", text: `M1 ${plan.monthlyBias}` },
      { ok: plan.pd === "DISCOUNT" || plan.nearLow, text: `Location ${plan.pd}${plan.nearLow ? " · near low" : ""}` },
      { ok: plan.flowIn || plan.retestOk, text: plan.flowIn ? "Money in" : plan.retestOk ? "Low retest held" : "No flow / retest" },
      { ok: longOk, text: longOk ? "Long ticket (SL < price < TP)" : "No short ticket" },
    ];

    return blankResult(this.meta, {
      signal,
      score,
      reasons: [plan.thesis, ...plan.why.slice(0, 2)],
      warnings: longOk || plan.fresh === "SKIP" ? [] : ["Long-only: HTF bear is not inverted into a short."],
      checks,
      entry: longOk ? (plan.fresh === "BUY" ? price : plan.entryHigh) : null,
      sl: longOk ? plan.sl : null,
      tp1: longOk ? plan.tp1 : null,
      tp2: longOk ? plan.tp2 : null,
      rr: longOk ? plan.rr : null,
      extras: {
        bias: plan.bias,
        event: plan.event,
        pd: plan.pd,
        fresh: plan.fresh,
        held: plan.held,
        weekly: plan.weeklyBias,
        monthly: plan.monthlyBias,
        eq: plan.eq,
        swingHigh: plan.swingHigh,
        swingLow: plan.swingLow,
        poiKind: plan.poi?.kind ?? null,
        poiLow: plan.poi?.low ?? null,
        poiHigh: plan.poi?.high ?? null,
        fvgLow: plan.fvg?.low ?? null,
        fvgHigh: plan.fvg?.high ?? null,
        fib618: plan.fib618,
        fib786: plan.fib786,
        flowIn: plan.flowIn,
        nearLow: plan.nearLow,
        retestOk: plan.retestOk,
      },
    });
  },
};
