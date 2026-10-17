import type { Candle, Regime, ScanConfig } from "./types";
import { computeFeatures, lastSnapshot, type Features, type Snapshot } from "./indicators";
import { computeIchimoku, ichimokuLevels, type IchimokuPack } from "./ichimoku";
import { detectDryup, detectVsa, volumeProfile, type VolumeProfile, type VsaLabel } from "./smart-money";
import { detectDivergence, type DivergenceHit } from "./divergence";
import { analyzeSmc, emptySmc, type SmcPlan } from "./smc";

export interface StrategyContext {
  symbol: string;
  candles: Candle[];
  features: Features;
  snap: Snapshot;
  benchSnap: Snapshot | null;
  ichi: IchimokuPack;
  vsa: VsaLabel;
  vp: VolumeProfile;
  dryup: { dryup: boolean; bonus: number; bars: number };
  divergence: DivergenceHit;
  regime: Regime;
  regimeScore: number;
  cfg: ScanConfig;
  smc: SmcPlan;
}

export function buildContext(
  symbol: string,
  candles: Candle[],
  bench: Candle[] | null,
  regime: Regime,
  regimeScore: number,
  cfg: ScanConfig,
): StrategyContext {
  const features = computeFeatures(candles);
  const benchCloses =
    bench && bench.length
      ? alignBenchmark(candles, bench)
      : null;
  const snap = lastSnapshot(features, benchCloses);
  const benchSnap = bench && bench.length >= 60 ? lastSnapshot(computeFeatures(bench)) : null;
  const ichi = computeIchimoku(candles);
  const vsa = detectVsa(features, features.n - 1);
  const vp = volumeProfile(features);
  const dryup = detectDryup(features, snap);
  const divergence = detectDivergence(features);
  const smc = candles.length >= 40 ? analyzeSmc(candles) : emptySmc();
  return {
    symbol, candles, features, snap, benchSnap, ichi, vsa, vp, dryup, divergence,
    regime, regimeScore, cfg, smc,
  };
}

function alignBenchmark(stock: Candle[], bench: Candle[]): number[] {
  const map = new Map(bench.map((c) => [c.time, c.close]));
  let last = bench[0]?.close ?? 1;
  return stock.map((c) => {
    const v = map.get(c.time);
    if (v != null) last = v;
    return last;
  });
}

export { ichimokuLevels };
export type { SmcPlan };
