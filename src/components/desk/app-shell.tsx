import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useDesk } from "@/lib/quant/store";

export function AppShell({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg lg:flex-row">
      <div className="hidden lg:block lg:h-screen lg:sticky lg:top-0">{sidebar}</div>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <Link
            to="/"
            className="flex items-baseline gap-3"
            onClick={() => useDesk.getState().setSelected(null)}
          >
            <span className="text-lg font-medium tracking-tight">Quorum VN</span>
            <span className="hidden text-[11px] uppercase tracking-[0.18em] text-subtle sm:inline">
              Seven independent brains
            </span>
          </Link>
          <p className="font-mono text-[11px] text-subtle">Prices in nghìn VNĐ</p>
        </header>
        <div className="border-b border-border lg:hidden">{sidebar}</div>
        <main className="flex-1 px-4 py-4 lg:px-6 lg:py-5">{children}</main>
      </div>
    </div>
  );
}