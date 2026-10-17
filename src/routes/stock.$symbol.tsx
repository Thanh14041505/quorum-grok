import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useDesk } from "@/lib/quant/store";

/** Old /stock/FPT URLs bounce back to `/` with the panel open — no extra preview route. */
export const Route = createFileRoute("/stock/$symbol")({ component: StockRedirect });

function StockRedirect() {
  const { symbol } = Route.useParams();
  const navigate = useNavigate();
  useEffect(() => {
    useDesk.getState().setSelected(String(symbol).toUpperCase());
    void navigate({ to: "/" });
  }, [symbol, navigate]);
  return <div className="p-6 text-sm text-muted">Opening {String(symbol).toUpperCase()}…</div>;
}
