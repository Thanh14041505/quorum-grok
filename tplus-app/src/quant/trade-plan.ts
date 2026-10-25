import type {
  ConsensusResult,
  Regime,
  ScanConfig,
  SmcSummary,
  StrategyResult,
  TradeDecision,
  TradePlan,
  TradePlanIssue,
  TradeSetupType,
} from "./types";
import { rrFrom } from "./strategies/contract.ts";

const VOTER_IDS = new Set(["S1", "S2", "S3", "S4", "S5", "S6"]);
const BUY_SIGNALS = new Set(["BUY", "STRONG_BUY"]);
const WATCH_SIGNALS = new Set(["WATCH", "HOLD", "NO_SIGNAL", "FILTERED"]);
const EXIT_SIGNALS = new Set(["EXIT", "SELL"]);
const REDUCE_SIGNALS = new Set(["REDUCE"]);

type SmcContext = Pick<
  SmcSummary,
  "bias" | "fresh" | "held" | "pd" | "nearLow" | "flowIn" | "retestOk"
>;
type Candidate = {
  source: string;
  entry: number;
  sl: number;
  tp1: number;
  tp2: number | null;
  rr: number;
};

export interface BuildTradePlanInput {
  strategies: StrategyResult[];
  consensus: ConsensusResult;
  regime: Regime;
  smc: SmcContext | null;
  price: number;
  cfg: ScanConfig;
}

/** Setup-aware synthesis; raw strategy signals remain untouched. */
export function buildTradePlan(input: BuildTradePlanInput): TradePlan {
  const { strategies, consensus, regime, smc, price, cfg } = input;
  const byId = new Map(
    strategies.map((strategy) => [strategy.shortId, strategy]),
  );
  const s1 = byId.get("S1");
  const s2 = byId.get("S2");
  const s3 = byId.get("S3");
  const s4 = byId.get("S4");
  const s5 = byId.get("S5");
  const s6 = byId.get("S6");
  const s7 = byId.get("S7");
  const s8 = byId.get("S8");
  const s9 = byId.get("S9");
  const voters = strategies.filter((strategy) =>
    VOTER_IDS.has(strategy.shortId),
  );
  const liveVoters = voters.filter((strategy) => strategy.signal !== "ERROR");
  const buyVotes = liveVoters
    .filter((strategy) => BUY_SIGNALS.has(strategy.signal))
    .map((strategy) => strategy.shortId);
  const strongBuyVotes = liveVoters
    .filter((strategy) => strategy.signal === "STRONG_BUY")
    .map((strategy) => strategy.shortId);
  const watchVotes = liveVoters
    .filter((strategy) => WATCH_SIGNALS.has(strategy.signal))
    .map((strategy) => strategy.shortId);
  const exitVotes = liveVoters
    .filter((strategy) => EXIT_SIGNALS.has(strategy.signal))
    .map((strategy) => strategy.shortId);
  const reduceVotes = liveVoters
    .filter((strategy) => REDUCE_SIGNALS.has(strategy.signal))
    .map((strategy) => strategy.shortId);

  const vsa = extraString(s3, "vsa");
  const divergence = extraString(s6, "kind");
  const s8Structure = extraString(s8, "structure");
  const s8Effort = extraString(s8, "effort");
  const s8Extended = extraBoolean(s8, "extended");
  const s8Coiled = extraBoolean(s8, "coiled");
  const rsAligned = extraBoolean(s8, "rsAligned");
  const donchianPct = extraNumber(s8, "donchianPct");
  // S8 swingLow can fall back to a Donchian range; only this explicit field is a confirmed pivot.
  const s8SwingLow = extraNumber(s8, "confirmedSwingLow");
  const brokeSwing = s8SwingLow != null && price < s8SwingLow * 0.997;
  const s1Setup = extraString(s1, "setup");
  const s2DailyAbove = extraBoolean(s2, "d1");
  const s2WeeklyAbove = extraBoolean(s2, "w1");
  const s4Zone = extraString(s4, "zone");
  const s2Zone = extraString(s2, "zone");
  const s5TrendScore = extraNumber(s5, "trend");
  const bullishContext =
    (s2DailyAbove && s2WeeklyAbove && s2?.signal !== "EXIT") ||
    smc?.bias === "BULL" ||
    (s8Structure === "HH_HL" &&
      !brokeSwing &&
      !s8Extended &&
      (s5TrendScore == null || s5TrendScore >= 4));
  const bearishContext =
    smc?.bias === "BEAR" ||
    s8Structure === "LH_LL" ||
    s1Setup === "BREAKDOWN" ||
    (s5TrendScore != null && s5TrendScore <= 1.8) ||
    s2?.signal === "EXIT" ||
    regime === "BEAR" ||
    regime === "STRONG_BEAR";
  const constructiveVsa =
    vsa === "SPRING" || vsa === "VOL_SURGE" || vsa === "DRY_VOLUME";
  const regularBull =
    divergence === "bull_reg" &&
    (s6?.signal === "BUY" || s6?.signal === "STRONG_BUY");
  const demand = s8Effort === "DEMAND";
  const midRange =
    donchianPct != null && donchianPct > 0.35 && donchianPct < 0.82;
  const pullbackLocation =
    donchianPct != null && donchianPct >= 0.18 && donchianPct <= 0.55;
  const valueRetest =
    /POC|VAH retest|VAL|EMA20|Kijun|Kumo/i.test(s4Zone ?? "") ||
    /pullback|retest|Dip toward Kijun/i.test(s2Zone ?? "");
  const breakoutCandidate =
    s1Setup === "BREAKOUT" ||
    (s8Structure === "HH_HL" &&
      demand &&
      rsAligned &&
      s8Coiled &&
      midRange &&
      !s8Extended);
  const pullbackCandidate =
    (s8Structure === "HH_HL" &&
      (pullbackLocation || s8Coiled || valueRetest)) ||
    (bullishContext && valueRetest && s2?.signal !== "EXIT");
  const majorReversalCandidate = Boolean(
    bearishContext &&
    smc?.fresh === "BUY" &&
    s9?.signal === "BUY" &&
    regularBull &&
    (smc.pd === "DISCOUNT" || smc.nearLow) &&
    (smc.flowIn || smc.retestOk),
  );
  const reliefEvidence =
    (regularBull && constructiveVsa) ||
    (regularBull && demand) ||
    (constructiveVsa && demand);
  const reliefCandidate =
    bearishContext && !majorReversalCandidate && reliefEvidence;

  let setupType: TradeSetupType = "NONE";
  if (majorReversalCandidate) setupType = "MAJOR_REVERSAL";
  else if (reliefCandidate) setupType = "DOWNTREND_RELIEF_RALLY";
  else if (bullishContext && breakoutCandidate)
    setupType = "UPTREND_BREAKOUT_CONTINUATION";
  else if (bullishContext && pullbackCandidate && !s8Extended)
    setupType = "PULLBACK_UPTREND";

  const hardVetoes: TradePlanIssue[] = [];
  const warnings: TradePlanIssue[] = [];
  const contextConflicts: TradePlanIssue[] = [];
  const addIssue = (
    list: TradePlanIssue[],
    code: string,
    source: string,
    severity: TradePlanIssue["severity"],
    message: string,
  ) => {
    if (!list.some((item) => item.code === code && item.source === source))
      list.push({ code, source, severity, message });
  };
  const specialized =
    setupType === "DOWNTREND_RELIEF_RALLY" || setupType === "MAJOR_REVERSAL";
  const trendSetup =
    setupType === "PULLBACK_UPTREND" ||
    setupType === "UPTREND_BREAKOUT_CONTINUATION";

  if (vsa === "DISTRIBUTION") {
    addIssue(
      hardVetoes,
      "VSA_DISTRIBUTION",
      "S3",
      "HARD_VETO",
      "VSA Distribution blocks new long entries.",
    );
  }
  if (s8Effort === "SUPPLY") {
    addIssue(
      hardVetoes,
      "TAPE_SUPPLY",
      "S8",
      "HARD_VETO",
      "Supply bar: do not open a new long until the tape improves.",
    );
  }
  if (brokeSwing && (specialized || trendSetup)) {
    addIssue(
      hardVetoes,
      "BROKE_CONFIRMED_SWING_LOW",
      "S8",
      "HARD_VETO",
      "Price closed materially below S8's last confirmed pivot low.",
    );
  }
  if (specialized && (divergence === "bear_reg" || divergence === "bear_hid")) {
    addIssue(
      hardVetoes,
      "BEARISH_DIVERGENCE",
      "S6",
      "HARD_VETO",
      "Bearish divergence conflicts with a long reversal/bounce setup.",
    );
  }
  if (setupType === "MAJOR_REVERSAL" && smc?.fresh !== "BUY") {
    addIssue(
      hardVetoes,
      "SMC_NOT_BUY",
      "S9",
      "HARD_VETO",
      "Major reversal requires a valid SMC fresh BUY plan.",
    );
  }
  if (trendSetup && exitVotes.length > 0) {
    addIssue(
      hardVetoes,
      "VOTING_EXIT",
      exitVotes.join(","),
      "HARD_VETO",
      "A voting strategy is issuing EXIT/SELL; trend-following entries are blocked.",
    );
  }
  if (trendSetup && reduceVotes.length > 0) {
    addIssue(
      warnings,
      "VOTING_REDUCE",
      reduceVotes.join(","),
      "WARNING",
      "A voting strategy recommends reducing risk; do not upgrade this setup to a strong entry.",
    );
  }
  if (trendSetup && s9?.extras.fresh === "SKIP") {
    addIssue(
      hardVetoes,
      "SMC_HTF_SKIP",
      "S9",
      "HARD_VETO",
      "SMC says SKIP on the higher-timeframe map.",
    );
  }
  if (trendSetup && s8?.signal === "EXIT") {
    addIssue(
      hardVetoes,
      "TAPE_STRUCTURE_EXIT",
      "S8",
      "HARD_VETO",
      "Grok Tape reports broken price structure.",
    );
  }
  if (
    trendSetup &&
    (regime === "BEAR" || regime === "STRONG_BEAR") &&
    !cfg.allowNewLongInBear
  ) {
    addIssue(
      hardVetoes,
      "BEAR_REGIME_GATE",
      "REGIME",
      "HARD_VETO",
      "New trend-following longs are disabled in a bearish market regime.",
    );
  }
  if (specialized && smc?.fresh === "SKIP") {
    addIssue(
      contextConflicts,
      "SMC_SKIP_CONTEXT",
      "S9",
      "CONTEXT_CONFLICT",
      "SMC HTF remains bearish; this is a countertrend setup, not a confirmed long-term trend.",
    );
  }
  if (specialized && exitVotes.length) {
    addIssue(
      contextConflicts,
      "BEARISH_VOTERS_CONTEXT",
      exitVotes.join(","),
      "CONTEXT_CONFLICT",
      "Some trend-following voters remain bearish; that is context, not automatic invalidation of a specialist bounce/reversal.",
    );
  }
  if (s7 && (s7.signal === "EXIT" || s7.signal === "REDUCE")) {
    addIssue(
      warnings,
      "HOLDER_RISK",
      "S7",
      "WARNING",
      `S7 ${s7.signal} applies to an existing holding; review position risk separately.`,
    );
  }
  if (smc?.held === "CUT") {
    addIssue(
      warnings,
      "SMC_HOLDER_CUT",
      "S9",
      "WARNING",
      "SMC says CUT for an existing position; this is not a new-entry ballot.",
    );
  }
  if (specialized && (s8?.signal === "EXIT" || s8Structure === "LH_LL")) {
    addIssue(
      contextConflicts,
      "TAPE_BEARISH_CONTEXT",
      "S8",
      "CONTEXT_CONFLICT",
      "Grok Tape still reads bearish structure; countertrend/reversal evidence must stay small and invalidation must be respected.",
    );
  }
  if (s8Extended) {
    addIssue(
      warnings,
      "EXTENDED_TAPE",
      "S8",
      "WARNING",
      "Price is extended near the 20-day high; wait for a retest rather than chasing.",
    );
  }
  if (consensus.conflict === "HIGH" || consensus.conflict === "MEDIUM") {
    addIssue(
      warnings,
      "CONSENSUS_CONFLICT",
      "S1-S6",
      "WARNING",
      `Voting conflict is ${consensus.conflict}.`,
    );
  }

  const candidateOrder: Record<TradeSetupType, string[]> = {
    PULLBACK_UPTREND: ["S4", "S8", "S2", "S5", "S1", "S3"],
    UPTREND_BREAKOUT_CONTINUATION: ["S8", "S1", "S4", "S2", "S5", "S3"],
    DOWNTREND_RELIEF_RALLY: ["S6", "S3", "S4", "S8", "S1"],
    MAJOR_REVERSAL: ["S9", "S6", "S3", "S4"],
    NONE: [],
  };
  const minTargetApplies = setupType !== "DOWNTREND_RELIEF_RALLY";
  const candidates = candidateOrder[setupType]
    .map((id) => byId.get(id))
    .filter(
      (strategy): strategy is StrategyResult =>
        strategy != null && BUY_SIGNALS.has(strategy.signal),
    );
  let ticket: Candidate | null = null;
  for (const strategy of candidates) {
    const candidate = candidateFrom(strategy, price);
    if (!candidate) continue;
    if (candidate.rr < cfg.minRrSwing) continue;
    if (
      minTargetApplies &&
      (candidate.tp1 / candidate.entry - 1) * 100 < cfg.minTpPct
    )
      continue;
    ticket = candidate;
    break;
  }
  if (!ticket && setupType !== "NONE") {
    addIssue(
      warnings,
      "NO_VALID_TICKET",
      "TICKET",
      "WARNING",
      "No strategy has a coherent long ticket meeting the setup's R:R/target rules.",
    );
  }
  if (setupType === "DOWNTREND_RELIEF_RALLY" && !reliefEvidence) {
    addIssue(
      hardVetoes,
      "INSUFFICIENT_RELIEF_CONFIRMATION",
      "SETUP",
      "HARD_VETO",
      "A downtrend bounce requires at least two complementary signs of recovery.",
    );
  }
  if (
    setupType === "MAJOR_REVERSAL" &&
    !(regularBull && smc?.fresh === "BUY")
  ) {
    addIssue(
      hardVetoes,
      "INSUFFICIENT_REVERSAL_CONFIRMATION",
      "SETUP",
      "HARD_VETO",
      "Major reversal requires confirmed Regular Bullish divergence plus a valid SMC BUY.",
    );
  }

  let decision: TradeDecision = "NO_TRADE";
  let riskMultiplier = 1;
  const blocked = hardVetoes.length > 0;
  if (
    !blocked &&
    (setupType === "PULLBACK_UPTREND" ||
      setupType === "UPTREND_BREAKOUT_CONTINUATION")
  ) {
    if (s8Extended) {
      decision = "WATCH";
    } else if (
      buyVotes.length >= 4 &&
      exitVotes.length === 0 &&
      reduceVotes.length === 0 &&
      ticket
    ) {
      decision =
        buyVotes.length >= 5 &&
        (s8?.signal === "BUY" ||
          s8?.signal === "STRONG_BUY" ||
          smc?.bias === "BULL")
          ? "STRONG_SETUP"
          : "BUY";
    } else if (buyVotes.length >= 3 || watchVotes.length >= 1) {
      decision = "WATCH";
    }
  } else if (!blocked && setupType === "DOWNTREND_RELIEF_RALLY") {
    if (ticket && reliefEvidence) {
      decision = "COUNTERTREND_PROBE";
      riskMultiplier = 0.5;
    } else {
      decision = "WATCH";
    }
  } else if (!blocked && setupType === "MAJOR_REVERSAL") {
    if (ticket && regularBull && smc?.fresh === "BUY") {
      const structureConfirmed =
        s8Structure === "HH_HL" || s2DailyAbove || s2WeeklyAbove;
      decision = structureConfirmed ? "BUY" : "REVERSAL_PROBE";
      riskMultiplier = structureConfirmed ? 0.75 : 0.5;
    } else {
      decision = "WATCH";
    }
  } else if (
    setupType === "NONE" &&
    (buyVotes.length >= 2 || consensus.signal === "WATCH")
  ) {
    decision = "WATCH";
  }
  if (hardVetoes.length) decision = "NO_TRADE";
  if (
    warnings.some((issue) => issue.code === "VOTING_REDUCE") &&
    (decision === "STRONG_SETUP" || decision === "BUY")
  )
    decision = "WATCH";
  if (
    !ticket &&
    (decision === "BUY" ||
      decision === "STRONG_SETUP" ||
      decision === "COUNTERTREND_PROBE" ||
      decision === "REVERSAL_PROBE")
  ) {
    decision = "WATCH";
  }

  const supportingStrategies = [
    ...new Set([
      ...buyVotes,
      ...(setupType === "DOWNTREND_RELIEF_RALLY" && regularBull ? ["S6"] : []),
      ...(setupType === "MAJOR_REVERSAL" && smc?.fresh === "BUY" ? ["S9"] : []),
      ...(setupType !== "NONE" &&
      s8 &&
      (s8.signal === "BUY" || s8.signal === "STRONG_BUY")
        ? ["S8"]
        : []),
    ]),
  ];
  const conflictingStrategies = [
    ...new Set([
      ...exitVotes,
      ...reduceVotes,
      ...(s8?.signal === "EXIT" ? ["S8"] : []),
      ...(s9?.extras.fresh === "SKIP" ? ["S9"] : []),
      ...(vsa === "DISTRIBUTION" ? ["S3"] : []),
    ]),
  ];
  const reasons = [
    `Setup ${setupType}; decision ${decision}.`,
    `Voting BUY ${buyVotes.length}/6; WATCH ${watchVotes.length}; EXIT ${exitVotes.length}; REDUCE ${reduceVotes.length}.`,
    ...supportingStrategies.map((id) => `${id} supports the setup.`),
    ...hardVetoes.map((issue) => issue.message),
    ...warnings.map((issue) => issue.message),
    ...contextConflicts.map((issue) => issue.message),
  ];
  const primaryTrend: TradePlan["primaryTrend"] =
    setupType === "DOWNTREND_RELIEF_RALLY" ||
    (setupType === "MAJOR_REVERSAL" && bearishContext)
      ? "BEARISH"
      : bullishContext
        ? "BULLISH"
        : bearishContext
          ? "BEARISH"
          : "MIXED";

  return {
    setupType,
    decision,
    primaryTrend,
    summary: decisionSummary(decision, setupType),
    buyVotes,
    strongBuyVotes,
    watchVotes,
    exitVotes,
    reduceVotes,
    totalVoting: voters.length,
    supportingStrategies,
    conflictingStrategies,
    hardVetoes,
    warnings,
    contextConflicts,
    reasons,
    ticketSource: ticket?.source ?? null,
    riskMultiplier,
    entry: ticket?.entry ?? null,
    sl: ticket?.sl ?? null,
    tp1: ticket?.tp1 ?? null,
    tp2: ticket?.tp2 ?? null,
    rr: ticket?.rr ?? null,
  };
}

function candidateFrom(
  strategy: StrategyResult,
  price: number,
): Candidate | null {
  const { entry, sl, tp1, tp2 } = strategy;
  if (
    entry == null ||
    sl == null ||
    tp1 == null ||
    ![price, entry, sl, tp1].every(Number.isFinite) ||
    sl <= 0 ||
    sl >= price ||
    entry <= sl ||
    tp1 <= entry ||
    tp1 <= price
  )
    return null;
  const rr = rrFrom(entry, sl, tp1);
  if (rr == null || !Number.isFinite(rr)) return null;
  return { source: strategy.shortId, entry, sl, tp1, tp2, rr };
}

function extraString(
  strategy: StrategyResult | undefined,
  key: string,
): string | null {
  const value = strategy?.extras[key];
  return typeof value === "string" ? value : null;
}

function extraNumber(
  strategy: StrategyResult | undefined,
  key: string,
): number | null {
  const value = strategy?.extras[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function extraBoolean(
  strategy: StrategyResult | undefined,
  key: string,
): boolean {
  return strategy?.extras[key] === true;
}

function decisionSummary(
  decision: TradeDecision,
  setup: TradeSetupType,
): string {
  const names: Record<TradeSetupType, string> = {
    PULLBACK_UPTREND: "Pullback trong xu hướng tăng",
    UPTREND_BREAKOUT_CONTINUATION: "Breakout tiếp diễn xu hướng tăng",
    DOWNTREND_RELIEF_RALLY: "Nhịp hồi kỹ thuật trong xu hướng giảm",
    MAJOR_REVERSAL: "Đảo chiều cấu trúc khung lớn",
    NONE: "Chưa nhận diện setup",
  };
  const actions: Record<TradeDecision, string> = {
    STRONG_SETUP: "Setup đồng thuận mạnh",
    BUY: "Setup đủ điều kiện xem xét BUY",
    COUNTERTREND_PROBE: "Thăm dò nhịp hồi ngược xu hướng",
    REVERSAL_PROBE: "Thăm dò đảo chiều rủi ro cao",
    WATCH: "Theo dõi / chờ xác nhận",
    NO_TRADE: "Không mở lệnh mới",
  };
  return `${names[setup]} — ${actions[decision]}`;
}
