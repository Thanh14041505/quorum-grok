import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ScanConfig, ScanReport } from "./types";
import { DEFAULT_CONFIG, DEFAULT_WATCHLIST } from "./config";
import type { DeskView } from "./queues";
import { parseHoldings } from "./holdings";

interface DeskState {
  watchlistText: string;
  holdingsText: string;
  apiKey: string;
  config: ScanConfig;
  report: ScanReport | null;
  scanning: boolean;
  scanDone: number;
  scanTotal: number;
  error: string | null;
  selected: string | null;
  view: DeskView;
  setWatchlistText: (v: string) => void;
  setHoldingsText: (v: string) => void;
  setApiKey: (v: string) => void;
  patchConfig: (p: Partial<ScanConfig>) => void;
  resetConfig: () => void;
  setReport: (r: ScanReport | null) => void;
  setScanning: (v: boolean) => void;
  setProgress: (done: number, total: number) => void;
  setError: (v: string | null) => void;
  setSelected: (v: string | null) => void;
  setView: (v: DeskView) => void;
}

const memoryStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

export const useDesk = create<DeskState>()(
  persist(
    (set) => ({
      watchlistText: DEFAULT_WATCHLIST.join(" "),
      holdingsText: "",
      apiKey: "",
      config: DEFAULT_CONFIG,
      report: null,
      scanning: false,
      scanDone: 0,
      scanTotal: 0,
      error: null,
      selected: null,
      view: "ALL",
      setWatchlistText: (watchlistText) => set({ watchlistText }),
      setHoldingsText: (holdingsText) => set({ holdingsText }),
      setApiKey: (apiKey) => set({ apiKey }),
      patchConfig: (p) => set((s) => ({ config: { ...s.config, ...p } })),
      resetConfig: () => set({ config: { ...DEFAULT_CONFIG } }),
      setReport: (report) => set({ report }),
      setScanning: (scanning) => set({ scanning }),
      setProgress: (scanDone, scanTotal) => set({ scanDone, scanTotal }),
      setError: (error) => set({ error }),
      setSelected: (selected) => set({ selected }),
      setView: (view) => set({ view }),
    }),
    {
      name: "quorum-vn-desk",
      version: 3,
      storage: createJSONStorage(() =>
        typeof window === "undefined" ? memoryStorage : localStorage,
      ),
      partialize: (s) => ({
        watchlistText: s.watchlistText,
        holdingsText: s.holdingsText,
        apiKey: s.apiKey,
        config: s.config,
      }),
      merge: (persisted, current) => {
        const prev = (persisted ?? {}) as Partial<DeskState>;
        return {
          ...current,
          ...prev,
          config: { ...DEFAULT_CONFIG, ...(prev.config ?? {}) },
          view: "ALL",
        };
      },
      migrate: (persisted, version) => {
        const prev = persisted as {
          watchlistText?: string;
          holdingsText?: string;
          apiKey?: string;
          config?: Partial<ScanConfig>;
        };
        const mergedConfig = { ...DEFAULT_CONFIG, ...(prev.config ?? {}) };
        if (version < 2) {
          mergedConfig.lookbackBars = DEFAULT_CONFIG.lookbackBars;
          mergedConfig.buyScore = DEFAULT_CONFIG.buyScore;
          mergedConfig.watchScore = DEFAULT_CONFIG.watchScore;
          mergedConfig.minTpPct = DEFAULT_CONFIG.minTpPct;
        }
        return {
          watchlistText: prev.watchlistText ?? DEFAULT_WATCHLIST.join(" "),
          holdingsText: prev.holdingsText ?? "",
          apiKey: prev.apiKey ?? "",
          config: mergedConfig,
        };
      },
    },
  ),
);

export function parseWatchlist(text: string): string[] {
  const parts = text
    .toUpperCase()
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter((s) => /^[A-Z0-9]{2,10}$/.test(s));
  return [...new Set(parts)];
}

/** Watchlist ∪ sổ đang giữ — S7 cần mã đang hold dù không nằm core list. */
export function collectScanSymbols(): string[] {
  const s = useDesk.getState();
  return [
    ...new Set([
      ...parseWatchlist(s.watchlistText),
      ...parseHoldings(s.holdingsText).map((h) => h.symbol),
    ]),
  ];
}
