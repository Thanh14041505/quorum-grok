import { formatSignal } from "@/lib/quant/format";
import { signalClass } from "@/lib/quant/signal-style";
import type { Signal } from "@/lib/quant/types";

export function SignalBadge({ signal, compact = false }: { signal: Signal; compact?: boolean }) {
  return (
    <span
      className={
        "inline-flex items-center justify-center rounded-sm px-1.5 font-mono text-[10px] font-medium tracking-wide " +
        (compact ? "min-w-10 py-0.5" : "min-w-14 py-1") +
        " " +
        signalClass(signal)
      }
    >
      {compact ? compactLabel(signal) : formatSignal(signal)}
    </span>
  );
}

function compactLabel(signal: Signal): string {
  switch (signal) {
    case "STRONG_BUY":
      return "SBUY";
    case "NO_SIGNAL":
      return "—";
    case "FILTERED":
      return "FLT";
    case "ERROR":
      return "ERR";
    default:
      return signal.slice(0, 4);
  }
}
