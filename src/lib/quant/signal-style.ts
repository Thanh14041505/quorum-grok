import type { Signal } from "./types";
import { signalTone } from "./format";

export function signalClass(signal: Signal): string {
  const tone = signalTone(signal);
  if (tone === "up") return "bg-up-dim text-up";
  if (tone === "down") return "bg-down-dim text-down";
  if (tone === "warn") return "bg-warn-dim text-warn";
  if (tone === "hold") return "bg-surface-2 text-hold";
  return "bg-surface-2 text-muted";
}
