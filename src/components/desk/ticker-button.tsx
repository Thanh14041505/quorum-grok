import type { ReactNode } from "react";
import { useDesk } from "@/lib/quant/store";

/** Stay on `/` — preview iframe breaks if we push `/stock/FPT` or open a new tab. */
export function TickerButton({
  symbol,
  className,
  children,
}: {
  symbol: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        useDesk.getState().setSelected(symbol.toUpperCase());
      }}
    >
      {children ?? symbol}
    </button>
  );
}
