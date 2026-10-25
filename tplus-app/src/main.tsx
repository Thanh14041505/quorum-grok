import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Chart } from "./Chart";
import {
  DEFAULT_SETTINGS,
  isSmcLong,
  parseSymbols,
  price,
  SETUPS,
  type Analysis,
  type Feed,
  type Settings,
} from "./terminal";
import { demoSeries } from "./quant/demo-data";
import { DEFAULT_WATCHLIST, FULL_WATCHLIST } from "./quant/config";
import { loadLocal, saveLocal, readFeeds, saveFeeds } from "./storage";
import "./style.css";
const signed = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;
const num = (n: number | null | undefined, d = 2) =>
  n == null ? "—" : n.toFixed(d);
const Badge = ({ text }: { text: string }) => (
  <span
    className={`badge ${/BUY|PROBE|BULL|READY|Vào/.test(text) ? "positive" : /ERROR|NO_TRADE|BEAR|SKIP|Ra|INVALID/.test(text) ? "negative" : "neutral"}`}
  >
    {text.replaceAll("_", " ")}
  </span>
);
function Spark({ values }: { values: number[] }) {
  const lo = Math.min(...values),
    span = Math.max(...values) - lo || 1;
  return (
    <svg
      className="spark"
      viewBox="0 0 90 30"
      aria-label="Giá đóng cửa 20 phiên"
    >
      <polyline
        fill="none"
        stroke={values.at(-1)! >= values[0] ? "#43d9aa" : "#fb7185"}
        strokeWidth="1.8"
        points={values
          .map(
            (v, i) =>
              `${(i / Math.max(values.length - 1, 1)) * 90},${27 - ((v - lo) / span) * 24}`,
          )
          .join(" ")}
      />
    </svg>
  );
}
function App() {
  const [settings, setSettings] = useState<Settings>(() => ({
    ...DEFAULT_SETTINGS,
    ...loadLocal("compass.settings", {}),
  }));
  const [draft, setDraft] = useState(settings),
    [settingsOpen, setSettingsOpen] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, string>>(() =>
      loadLocal("compass.lists", {}),
    ),
    [listName, setListName] = useState("Danh sách của tôi");
  const [feeds, setFeeds] = useState<Feed[]>([]),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [running, setRunning] = useState(false),
    [progress, setProgress] = useState({ done: 0, total: 0 });
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [setup, setSetup] = useState("all"),
    [view, setView] = useState("plan"),
    [minScore, setMinScore] = useState(0),
    [sort, setSort] = useState("score");
  const [notice, setNotice] = useState(""),
    [health, setHealth] = useState<{
      keyConfigured: boolean;
      adapterConfigured: boolean;
    } | null>(null);
  const [selected, setSelected] = useState<string | null>(
    () =>
      decodeURIComponent(
        location.pathname.match(/^\/stock\/([A-Za-z0-9]+)$/)?.[1] ?? "",
      ) || null,
  );
  const abortRef = useRef<AbortController | null>(null),
    feedRef = useRef<Feed[]>([]),
    runRef = useRef(false);
  useEffect(() => {
    const pop = () =>
      setSelected(
        location.pathname.match(/^\/stock\/([A-Za-z0-9]+)$/)?.[1] ?? null,
      );
    window.addEventListener("popstate", pop);
    readFeeds()
      .then((f) => {
        if (!runRef.current) {
          setFeeds(f);
          feedRef.current = f;
        }
      })
      .catch(() => {});
    return () => {
      window.removeEventListener("popstate", pop);
      abortRef.current?.abort();
    };
  }, []);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const workerRef = useRef<Worker | null>(null),
    sentRef = useRef<Map<string, Feed>>(new Map()),
    activeRef = useRef<Set<string>>(new Set()),
    configRef = useRef(JSON.stringify(settings));
  useEffect(() => {
    const worker = new Worker(
      new URL("./analysis.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;
    worker.onmessage = (e) => {
      if (e.data.error) {
        setNotice(e.data.error);
        return;
      }
      const bench = sentRef.current.get("VNINDEX");
      const benchmarkVersion = bench
        ? `${bench.fetchedAt}:${bench.source}:${bench.stale}`
        : "";
      if (
        e.data.config !== configRef.current ||
        e.data.benchmarkVersion !== benchmarkVersion
      )
        return;
      setAnalyses((old) => {
        const map = new Map(old.map((a) => [a.row.symbol, a]));
        for (const a of e.data.results as Analysis[]) {
          const latest = sentRef.current.get(a.row.symbol);
          if (
            latest &&
            latest.fetchedAt === a.feed.fetchedAt &&
            latest.source === a.feed.source &&
            latest.stale === a.feed.stale
          )
            map.set(a.row.symbol, a);
        }
        return [...map.values()].filter((a) =>
          activeRef.current.has(a.row.symbol),
        );
      });
    };
    worker.onerror = () =>
      setNotice("Không chạy được engine phân tích. Vui lòng tải lại trang.");
    return () => worker.terminate();
  }, []);
  useEffect(() => {
    const invalidated =
      configRef.current !== JSON.stringify(settings) ||
      sentRef.current.get("VNINDEX") !==
        feeds.find((f) => f.symbol === "VNINDEX");
    configRef.current = JSON.stringify(settings);
    activeRef.current = new Set(feeds.map((f) => f.symbol));
    setAnalyses((old) =>
      (invalidated ? [] : old).filter((a) => {
        const f = feeds.find((f) => f.symbol === a.row.symbol);
        return (
          f &&
          f.fetchedAt === a.feed.fetchedAt &&
          f.source === a.feed.source &&
          f.stale === a.feed.stale
        );
      }),
    );
    const changed = feeds.filter((f) => sentRef.current.get(f.symbol) !== f);
    sentRef.current = new Map(feeds.map((f) => [f.symbol, f]));
    workerRef.current?.postMessage({
      changed,
      symbols: feeds.map((f) => f.symbol),
      settings,
    });
  }, [feeds, settings]);
  const pending =
    feeds.filter((f) => f.symbol !== "VNINDEX").length > analyses.length;
  const current = analyses.find((a) => a.row.symbol === selected);
  function navigate(symbol: string | null) {
    history.pushState({}, "", symbol ? `/stock/${symbol}` : "/");
    setSelected(symbol);
    window.scrollTo({ top: 0 });
  }
  async function scan(requested?: string[], demo = false) {
    if (runRef.current) return;
    const symbols = (requested ?? parseSymbols(settings.symbols)).filter(
      (s) => s !== "VNINDEX",
    );
    if (!symbols.length && !requested?.includes("VNINDEX")) {
      setNotice("Nhập ít nhất một mã hợp lệ trong Settings.");
      return;
    }
    runRef.current = true;
    setRunning(true);
    setNotice("");
    setErrors({});
    const controller = new AbortController();
    abortRef.current = controller;
    let done = 0,
      index = 0;
    const all = ["VNINDEX", ...symbols];
    // Replace the scan snapshot so failed refreshes cannot retain a fresh BUY from the previous scan.
    let next: Feed[] =
      requested && !demo
        ? feedRef.current.filter((f) => !all.includes(f.symbol))
        : [];
    feedRef.current = next;
    setFeeds(next);
    setProgress({ done, total: all.length });
    try {
      async function one(symbol: string) {
        try {
          let f: Feed;
          if (demo) {
            const candles = demoSeries(symbol, 800);
            f = {
              symbol,
              candles,
              source: "DEMO",
              session: new Date(candles.at(-1)!.time * 1000)
                .toISOString()
                .slice(0, 10),
              fetchedAt: Date.now(),
              stale: false,
              cached: false,
            };
          } else {
            const res = await fetch(`/api/market?symbol=${symbol}&bars=800`, {
              signal: controller.signal,
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            f = data;
          }
          if (controller.signal.aborted) return;
          next = [...next.filter((x) => x.symbol !== symbol), f];
          feedRef.current = next;
          setFeeds(next);
        } catch (e) {
          if (!controller.signal.aborted)
            setErrors((old) => ({
              ...old,
              [symbol]:
                e instanceof Error ? e.message : "Không tải được dữ liệu",
            }));
        } finally {
          if (!controller.signal.aborted)
            setProgress({ done: ++done, total: all.length });
        }
      }
      // Benchmark first; one source failure does not drop successful stock rows.
      await one("VNINDEX");
      await Promise.all(
        Array.from(
          { length: Math.max(1, Math.min(3, settings.concurrency)) },
          async () => {
            while (index < symbols.length && !controller.signal.aborted)
              await one(symbols[index++]);
          },
        ),
      );
      if (!demo)
        saveFeeds(next).catch(() =>
          setNotice("Không lưu được snapshot trên thiết bị này."),
        );
      if (controller.signal.aborted)
        setNotice("Đã dừng. Giữ lại kết quả tải thành công.");
      else if (demo)
        setNotice(
          "DEMO — dữ liệu mô phỏng để xem giao diện; tất cả tín hiệu vào lệnh bị khóa.",
        );
    } finally {
      runRef.current = false;
      setRunning(false);
    }
  }
  useEffect(() => {
    if (selected && !current && !runRef.current) void scan([selected]);
  }, [selected]);
  function openSettings() {
    setDraft({ ...settings });
    setSettingsOpen(true);
    fetch("/api/market?health=1")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
  }
  function saveSettings() {
    const syms = parseSymbols(draft.symbols);
    if (!syms.length) {
      setNotice("Danh sách mã chưa hợp lệ.");
      return;
    }
    const safe = { ...draft, symbols: syms.join(", ") };
    setSettings(safe);
    setSettingsOpen(false);
    setNotice(
      saveLocal("compass.settings", safe)
        ? "Đã lưu settings trên thiết bị."
        : "Settings áp dụng nhưng chưa lưu được trên thiết bị.",
    );
  }
  const visible = analyses
    .filter(
      (a) =>
        a.row.symbol.includes(query.toUpperCase()) &&
        a.score >= minScore &&
        (setup === "all" || a.row.tradePlan?.setupType === setup) &&
        (filter === "all" ||
          (filter === "smc" && isSmcLong(a)) ||
          (filter === "buy" && ["BUY", "PROBE"].includes(a.call)) ||
          (filter === "watch" && a.call === "WATCH") ||
          (filter === "blocked" &&
            (a.call === "NO_TRADE" || a.row.status !== "OK"))),
    )
    .sort((a, b) =>
      sort === "symbol"
        ? a.row.symbol.localeCompare(b.row.symbol)
        : sort === "rr"
          ? (b.ticket?.rrNet ?? -999) - (a.ticket?.rrNet ?? -999)
          : b.score - a.score,
    );
  const bench = feeds.find((f) => f.symbol === "VNINDEX");
  const exportCsv = () => {
    const headers = [
      "Symbol",
      "Session",
      "Source",
      "FetchedAt",
      "Stale",
      "Status",
      "Call",
      "Setup",
      "Score_NotProbability",
      "Price_VND",
      "EntryLow_VND",
      "EntryHigh_VND",
      "SL_VND",
      "TP1_VND",
      "TP2_VND",
      "RR_TP1_mid",
      "RR_TP2_mid",
      "RR_TP1_upper",
      "RR_TP1_upper_net",
      "Consensus",
      "SMC",
      "Trend",
      "Flow",
      "Ichimoku",
      "VSA",
      "RSI_Divergence",
      "Trigger",
      "Warnings",
    ];
    const rows = visible.map((a) => [
      a.row.symbol,
      a.feed.session,
      a.feed.source,
      new Date(a.feed.fetchedAt).toISOString(),
      a.feed.stale,
      a.row.status,
      a.call,
      a.row.tradePlan?.setupType,
      a.score,
      a.row.price,
      a.ticket?.low,
      a.ticket?.high,
      a.ticket?.sl,
      a.ticket?.tp1,
      a.ticket?.tp2,
      a.ticket?.rr1,
      a.ticket?.rr2,
      a.ticket?.rrWorst,
      a.ticket?.rrNet,
      `${a.row.consensus.agreement}/6`,
      a.row.smc?.fresh,
      a.trend,
      a.flow,
      a.ichi,
      a.vsa,
      a.divergence,
      a.ticket?.trigger,
      [...a.notes, ...(a.ticket?.warnings ?? [])].join(" | "),
    ]);
    const csv =
      "\ufeff" +
      [headers, ...rows]
        .map((r) =>
          r
            .map(
              (v) =>
                '"' +
                String(v ?? "")
                  .replace(/^[=+@-]/, "'")
                  .replaceAll('"', '""') +
                '"',
            )
            .join(","),
        )
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `tplus-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      <aside className="sidebar">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate(null);
          }}
        >
          <span className="brand-mark">⌁</span>
          <span>
            COMPASS<small>VIETNAM · T+ TERMINAL</small>
          </span>
        </a>
        <div className="nav-label">WORKSPACE</div>
        <button
          className={!selected ? "nav active" : "nav"}
          onClick={() => navigate(null)}
        >
          ▦ <span>T+ Scanner</span>
          <span className="nav-count">{analyses.length}</span>
        </button>
        <button className="nav" onClick={openSettings}>
          ⚙ <span>Settings & Watchlists</span>
        </button>
        <div className="sidebar-card">
          <span className="eyebrow">PRICE ACTION FIRST</span>
          <p>
            Đúng setup.
            <br />
            Đúng vùng giá.
            <br />
            <span className="up">Rủi ro rõ ràng.</span>
          </p>
          <small>
            8 chiến thuật · SMC khung lớn
            <br />
            Chuyên T+ · Long only
          </small>
        </div>
        <div className="sidebar-bottom">
          <span className="dot" />{" "}
          {running
            ? "Đang lấy dữ liệu"
            : bench
              ? "Snapshot sẵn sàng"
              : "Chờ kết nối thị trường"}
          <small>D1 snapshot · không streaming</small>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            Trading workspace{" "}
            <span className="muted">/ {selected ?? "T+ Scanner"}</span>
          </span>
          <div>
            <span className="live-dot" /> VN MARKET{" "}
            <button onClick={openSettings} aria-label="Mở settings">
              ⚙
            </button>
          </div>
        </header>
        {notice && (
          <div className="notice" role="status">
            {notice}
            <button onClick={() => setNotice("")} aria-label="Đóng thông báo">
              ×
            </button>
          </div>
        )}
        {selected ? (
          current ? (
            <Detail a={current} back={() => navigate(null)} />
          ) : (
            <section className="empty panel">
              <h2>{selected}</h2>
              <p>
                {running
                  ? "Đang tải dữ liệu mã và VNINDEX…"
                  : (errors[selected] ?? "Chưa có dữ liệu.")}
              </p>
              {!running && (
                <button onClick={() => void scan([selected])}>Thử lại</button>
              )}
              <button onClick={() => navigate(null)}>← Về scanner</button>
            </section>
          )
        ) : (
          <>
            <section className="page-heading">
              <div>
                <div className="eyebrow">MARKET INTELLIGENCE / SHORT TERM</div>
                <h1>
                  T+ Scanner <span className="pill">PRICE & VOLUME</span>
                </h1>
                <p>Tìm vùng tích lũy. Đọc cấu trúc. Chờ xác nhận.</p>
              </div>
              <div className="controls">
                <button onClick={exportCsv} disabled={!visible.length}>
                  ↧ Export CSV
                </button>
                {running ? (
                  <button
                    className="danger"
                    onClick={() => abortRef.current?.abort()}
                  >
                    ■ Dừng scan
                  </button>
                ) : (
                  <button className="primary" onClick={() => void scan()}>
                    ▷ Quét thị trường
                  </button>
                )}
              </div>
            </section>
            <div className="stats">
              <article className="panel stat">
                <span>MARKET REGIME</span>
                <strong>{analyses[0]?.row.regime ?? "UNKNOWN"}</strong>
                <small>
                  VNINDEX{" "}
                  {bench
                    ? bench.candles.at(-1)!.close.toLocaleString("en-US", {
                        maximumFractionDigits: 2,
                      })
                    : "—"}{" "}
                  điểm
                </small>
              </article>
              <article className="panel stat">
                <span>UNIVERSE</span>
                <strong>
                  {parseSymbols(settings.symbols).length}
                  <em> mã</em>
                </strong>
                <small>
                  {analyses.length} đã tải · {Object.keys(errors).length} lỗi
                </small>
              </article>
              <article className="panel stat">
                <span>SMC LONGS</span>
                <strong className="up">
                  {analyses.filter(isSmcLong).length}
                </strong>
                <small>Discount / vùng cầu khung lớn</small>
              </article>
              <article className="panel stat">
                <span>ENTRY CONFIRMED</span>
                <strong className="gold">
                  {
                    analyses.filter((a) => ["BUY", "PROBE"].includes(a.call))
                      .length
                  }
                </strong>
                <small>Setup + trigger + R:R ròng</small>
              </article>
            </div>
            <div className="data-strip">
              <span>
                <span className="dot" />{" "}
                {bench
                  ? `VNINDEX · ${bench.source} · phiên ${bench.session}`
                  : "Chưa có VNINDEX — market regime chưa xác nhận"}
              </span>
              <span>
                Giá nghìn VND · D1 {bench?.stale ? "· SNAPSHOT CŨ" : ""} ·{" "}
                {running
                  ? `${progress.done}/${progress.total}`
                  : `${visible.length} kết quả`}
              </span>
            </div>
            {running && (
              <div className="progress">
                <div
                  style={{
                    width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                  }}
                />
              </div>
            )}
            <section className="panel scanner">
              <div className="table-tabs">
                <div>
                  {[
                    ["all", "Tất cả"],
                    ["smc", "SMC Longs"],
                    ["buy", "Có trigger"],
                    ["watch", "Theo dõi"],
                    ["blocked", "Bị chặn"],
                  ].map(([key, label]) => (
                    <button
                      className={filter === key ? "tab active" : "tab"}
                      key={key}
                      onClick={() => setFilter(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="segmented">
                  <button
                    className={view === "plan" ? "selected" : ""}
                    onClick={() => setView("plan")}
                  >
                    Kế hoạch
                  </button>
                  <button
                    className={view === "context" ? "selected" : ""}
                    onClick={() => setView("context")}
                  >
                    Kỹ thuật
                  </button>
                </div>
              </div>
              <div className="filterbar">
                <input
                  aria-label="Tìm mã"
                  placeholder="⌕  Tìm mã cổ phiếu…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <select
                  aria-label="Lọc setup"
                  value={setup}
                  onChange={(e) => setSetup(e.target.value)}
                >
                  <option value="all">Mọi trade setup</option>
                  {Object.entries(SETUPS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <label>
                  Score ≥{" "}
                  <input
                    aria-label="Điểm tối thiểu"
                    type="number"
                    min="0"
                    max="100"
                    value={minScore}
                    onChange={(e) => setMinScore(Number(e.target.value))}
                  />
                </label>
                <select
                  aria-label="Sắp xếp"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="score">Score ↓</option>
                  <option value="rr">R:R ròng ↓</option>
                  <option value="symbol">Mã A–Z</option>
                </select>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th className="sticky">Mã / 20D</th>
                      <th>Giá / %</th>
                      <th>Status</th>
                      <th>Score</th>
                      <th>Consensus</th>
                      <th>Trade setup</th>
                      <th>Call</th>
                      <th>SMC</th>
                      {view === "plan" ? (
                        <>
                          <th>Entry zone</th>
                          <th>SL</th>
                          <th>TP1 / TP2</th>
                          <th>R:R ròng¹</th>
                        </>
                      ) : (
                        <>
                          <th>Trend</th>
                          <th>Dòng tiền</th>
                          <th>Ichimoku</th>
                          <th>VSA</th>
                          <th>PK RSI</th>
                          <th>RVOL</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((a) => (
                      <tr
                        key={a.row.symbol}
                        onClick={() => navigate(a.row.symbol)}
                      >
                        <td className="sticky">
                          <a
                            href={`/stock/${a.row.symbol}`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              navigate(a.row.symbol);
                            }}
                            className="ticker"
                          >
                            {a.row.symbol} <span>↗</span>
                          </a>
                          <Spark values={a.row.spark} />
                        </td>
                        <td>
                          <strong>{price(a.row.price)}</strong>
                          <small
                            className={a.row.changePct >= 0 ? "up" : "down"}
                          >
                            {signed(a.row.changePct)}
                          </small>
                        </td>
                        <td>
                          <Badge
                            text={
                              a.feed.source === "DEMO"
                                ? "DEMO"
                                : a.feed.stale
                                  ? "STALE"
                                  : a.row.status
                            }
                          />
                          <small>{a.feed.session}</small>
                        </td>
                        <td>
                          <span className="score">{a.score}</span>
                          <div className="score-bar">
                            <div style={{ width: `${a.score}%` }} />
                          </div>
                        </td>
                        <td>
                          <strong>
                            {a.row.consensus.agreement}
                            <span className="muted"> / 6</span>
                          </strong>
                          <small>{a.row.consensus.conflict} conflict</small>
                        </td>
                        <td className="setup-cell">
                          {SETUPS[a.row.tradePlan?.setupType ?? "NONE"]}
                          <small>
                            {a.ticket?.state.replaceAll("_", " ") ??
                              "Chưa có kế hoạch"}
                          </small>
                        </td>
                        <td>
                          <Badge text={a.call} />
                        </td>
                        <td>
                          <Badge text={a.row.smc?.fresh ?? "—"} />
                          <small>
                            {a.row.smc?.pd ?? "—"} ·{" "}
                            {a.row.smc?.weeklyBias ?? "—"} W
                          </small>
                        </td>
                        {view === "plan" ? (
                          <>
                            <td className="mono gold">
                              {a.ticket
                                ? `${price(a.ticket.low)} – ${price(a.ticket.high)}`
                                : "—"}
                            </td>
                            <td className="mono down">{price(a.ticket?.sl)}</td>
                            <td className="mono up">
                              {price(a.ticket?.tp1)}
                              <small>{price(a.ticket?.tp2)}</small>
                            </td>
                            <td className="mono">
                              {num(a.ticket?.rrNet)}
                              <small>gross {num(a.ticket?.rrWorst)}</small>
                            </td>
                          </>
                        ) : (
                          <>
                            <td>{a.trend}</td>
                            <td>
                              <span
                                className={
                                  a.flow === "Vào"
                                    ? "up"
                                    : a.flow === "Ra"
                                      ? "down"
                                      : ""
                                }
                              >
                                {a.flow}
                              </span>
                              <small>CMF {num(a.cmf)}</small>
                            </td>
                            <td className="technical-cell">{a.ichi}</td>
                            <td>{a.vsa}</td>
                            <td className="technical-cell">
                              {a.divergence}
                              <small>RSI {num(a.rsi, 1)}</small>
                            </td>
                            <td>{num(a.rvol)}×</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!visible.length && (
                <div className="empty">
                  <div className="empty-icon">⌁</div>
                  <h2>
                    {running
                      ? "Đang đọc thị trường…"
                      : analyses.length
                        ? "Không có mã khớp bộ lọc"
                        : pending
                          ? "Đang phân tích chiến thuật…"
                          : "Bắt đầu từ danh sách của bro"}
                  </h2>
                  <p>
                    {analyses.length
                      ? "Đổi bộ lọc hoặc mở danh sách khác trong Settings."
                      : "Lưu watchlist trong Settings rồi quét giá và khối lượng."}
                  </p>
                  {!analyses.length && !running && !pending && (
                    <div className="controls">
                      <button className="primary" onClick={() => void scan()}>
                        Quét {parseSymbols(settings.symbols).length} mã
                      </button>
                      <button
                        onClick={() =>
                          void scan(DEFAULT_WATCHLIST.slice(0, 12), true)
                        }
                      >
                        Xem demo giao diện
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="table-foot">
                <span>
                  {visible.length} / {analyses.length} mã · Click mã để xem
                  chart & kế hoạch
                </span>
                <span>¹ TP1 tại đầu trên entry, sau phí & trượt giá</span>
              </div>
            </section>
            {!!Object.keys(errors).length && (
              <section className="panel error-panel">
                <strong>Mã tải lỗi ({Object.keys(errors).length})</strong>
                <button
                  disabled={running}
                  onClick={() => void scan(Object.keys(errors))}
                >
                  Quét lại nhóm lỗi
                </button>
                {Object.entries(errors).map(([symbol, error]) => (
                  <p key={symbol}>
                    <b>{symbol}</b> {error}
                  </p>
                ))}
              </section>
            )}
            <footer>
              Score dùng xếp hạng, không phải xác suất thắng. S1–S6 bỏ phiếu; S8
              Tape & S9 SMC xác nhận. Không dùng S7.
              <br />
              D1 có thể gồm phiên đang chạy. Tín hiệu cần kiểm tra lại khi đóng
              phiên; T+ có rủi ro gap và hạn chế bán trước thanh toán.
            </footer>
          </>
        )}
      </main>
      {settingsOpen && (
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <section
            className="settings-modal panel"
            role="dialog"
            aria-modal="true"
            aria-label="Settings & Watchlists"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <div className="eyebrow">PERSONAL WORKSPACE</div>
                <h2>Settings & Watchlists</h2>
              </div>
              <button
                onClick={() => setSettingsOpen(false)}
                aria-label="Đóng settings"
              >
                ×
              </button>
            </div>
            <label className="field">
              Danh sách mã ({parseSymbols(draft.symbols).length}/300)
              <textarea
                value={draft.symbols}
                onChange={(e) =>
                  setDraft({ ...draft, symbols: e.target.value })
                }
                rows={5}
                placeholder="FPT, HPG, SSI…"
              />
            </label>
            <div className="controls">
              <button
                onClick={() =>
                  setDraft({ ...draft, symbols: DEFAULT_WATCHLIST.join(", ") })
                }
              >
                20 mã mẫu
              </button>
              <button
                onClick={() =>
                  setDraft({ ...draft, symbols: FULL_WATCHLIST.join(", ") })
                }
              >
                Universe mở rộng
              </button>
              <select
                aria-label="Watchlist đã lưu"
                onChange={(e) => {
                  if (profiles[e.target.value])
                    setDraft({ ...draft, symbols: profiles[e.target.value] });
                }}
                defaultValue=""
              >
                <option value="" disabled>
                  Mở watchlist đã lưu
                </option>
                {Object.keys(profiles).map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </div>
            <div className="controls watchlist-save">
              <input
                aria-label="Tên watchlist"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
              />
              <button
                onClick={() => {
                  const name = listName.trim();
                  if (name && parseSymbols(draft.symbols).length) {
                    const p = {
                      ...profiles,
                      [name]: parseSymbols(draft.symbols).join(", "),
                    };
                    setProfiles(p);
                    setNotice(
                      saveLocal("compass.lists", p)
                        ? `Đã lưu watchlist “${name}”.`
                        : "Không lưu được watchlist trên thiết bị.",
                    );
                  }
                }}
              >
                Lưu watchlist
              </button>
              <button
                onClick={() => {
                  const p = { ...profiles };
                  delete p[listName.trim()];
                  setProfiles(p);
                  saveLocal("compass.lists", p);
                }}
              >
                Xóa tên này
              </button>
            </div>
            <h3>Điều kiện & quản trị rủi ro</h3>
            <div className="settings-grid">
              {(
                [
                  ["minRr", "R:R ròng tối thiểu", 0.1, 0.1, 10],
                  ["minValue", "GTGD trung bình 20D (VND)", 100000000, 0, 1e12],
                  ["feeBps", "Phí/thuế dự phòng mỗi chiều (bps)", 1, 0, 100],
                  ["slippageBps", "Trượt giá mỗi chiều (bps)", 1, 0, 100],
                  ["capital", "Vốn tham khảo (VND)", 1000000, 0, 1e12],
                  ["riskPct", "Rủi ro mỗi lệnh (%)", 0.1, 0.1, 5],
                  ["maxPositionPct", "Tỷ trọng tối đa (%)", 1, 1, 100],
                  ["concurrency", "Số request đồng thời (1–3)", 1, 1, 3],
                ] as [keyof Settings, string, number, number, number][]
              ).map(([key, label, step, min, max]) => (
                <label className="field" key={key}>
                  {label}
                  <input
                    type="number"
                    value={draft[key]}
                    step={step}
                    min={min}
                    max={max}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        [key]: Math.min(
                          max,
                          Math.max(min, Number(e.target.value) || min),
                        ),
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <div className="api-status">
              <h3>Nguồn dữ liệu & API key</h3>
              <p>VNDirect → VPS · OHLCV D1 · cache 3 phút.</p>
              <p>
                Adapter:{" "}
                <b>
                  {health?.adapterConfigured
                    ? "Đã cấu hình"
                    : "Chưa cấu hình (tùy chọn)"}
                </b>{" "}
                · API key:{" "}
                <b>
                  {health?.keyConfigured
                    ? "Đã cấu hình trên server"
                    : "Không có / không cần cho nguồn mặc định"}
                </b>
              </p>
              <small>
                Cấu hình MARKET_API_URL và MARKET_API_KEY trong .env.local hoặc
                Vercel Environment Variables. Key không được đưa xuống trình
                duyệt.
              </small>
            </div>
            <div className="modal-footer">
              <button onClick={() => setSettingsOpen(false)}>Hủy</button>
              <button className="primary" onClick={saveSettings}>
                Lưu & áp dụng
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
function Detail({ a, back }: { a: Analysis; back: () => void }) {
  const r = a.row,
    t = a.ticket,
    s = r.smc;
  return (
    <>
      <button className="back" onClick={back}>
        ← Về T+ Scanner
      </button>
      <section className="page-heading detail-heading">
        <div>
          <div className="eyebrow">
            {a.feed.source} · PHIÊN {a.feed.session} ·{" "}
            {a.feed.stale ? "DỮ LIỆU CŨ" : "D1 SNAPSHOT"}
          </div>
          <h1>
            {r.symbol} <span className="detail-price">{price(r.price)}</span>
            <span
              className={
                r.changePct >= 0 ? "price-change up" : "price-change down"
              }
            >
              {signed(r.changePct)}
            </span>
          </h1>
          <p>
            {SETUPS[r.tradePlan?.setupType ?? "NONE"]}{" "}
            <span className="muted">·</span> Consensus {r.consensus.agreement}/6{" "}
            <span className="muted">·</span> <Badge text={a.call} />
          </p>
        </div>
        <div className="detail-smc">
          <Badge text={`SMC ${s?.fresh ?? "—"}`} />
          <small>
            D {s?.bias ?? "—"} / W {s?.weeklyBias ?? "—"} / M{" "}
            {s?.monthlyBias ?? "—"}
          </small>
        </div>
      </section>
      {(a.feed.source === "DEMO" || a.feed.stale || r.status !== "OK") && (
        <div className="warning">
          {a.feed.source === "DEMO"
            ? "DEMO — Giá mô phỏng. Không dùng để giao dịch."
            : a.feed.stale
              ? "Snapshot cũ: cần quét lại trước khi dùng kế hoạch."
              : r.filterReason}
        </div>
      )}
      <div className="ticket-grid">
        {[
          [
            "Entry zone",
            t ? `${price(t.low)} – ${price(t.high)}` : "—",
            "gold",
          ],
          ["Stop loss", price(t?.sl), "down"],
          ["Take profit 1", price(t?.tp1), "up"],
          ["Take profit 2", price(t?.tp2), "up"],
          ["R:R TP1 / TP2 (mid)", `${num(t?.rr1)} / ${num(t?.rr2)}`, ""],
          ["R:R ròng (entry cao)", num(t?.rrNet), "gold"],
        ].map(([label, value, color]) => (
          <article className="panel ticket" key={label}>
            <span>{label}</span>
            <strong className={color}>{value}</strong>
          </article>
        ))}
      </div>
      <div className="trigger-strip">
        <div>
          <span className="eyebrow">ĐIỀU KIỆN VÀO</span>
          <p>{t?.trigger ?? "Chưa đủ cấu trúc để lập kế hoạch vào lệnh."}</p>
        </div>
        <Badge text={t?.state ?? "NO_PLAN"} />
      </div>
      <Chart a={a} />
      <div className="detail-grid">
        <section className="panel prose">
          <div className="eyebrow">STRUCTURE & LOCATION</div>
          <h2>SMC khung lớn</h2>
          <p>{s?.thesis ?? "Chưa đủ dữ liệu cấu trúc."}</p>
          <dl>
            <dt>Structure event</dt>
            <dd>{s?.event ?? "—"}</dd>
            <dt>Vị trí trong range</dt>
            <dd>{s?.pd ?? "—"}</dd>
            <dt>Discount OTE</dt>
            <dd>
              {price(s?.fib786)} – {price(s?.fib618)}
            </dd>
            <dt>Demand / POI</dt>
            <dd>
              {s?.poiKind ?? "—"} · {price(s?.poiLow)} – {price(s?.poiHigh)}
            </dd>
            <dt>EQ</dt>
            <dd>{price(s?.eq)}</dd>
          </dl>
          <small>
            Discount/OTE là vùng theo dõi; không tự động là tín hiệu mua.
          </small>
        </section>
        <section className="panel prose">
          <div className="eyebrow">EXECUTION & INVALIDATION</div>
          <h2>Kế hoạch T+</h2>
          <p>{t?.invalidation ?? "Không có lệnh hợp lệ."}</p>
          <p>{t?.targetBasis}</p>
          <p>
            Khối lượng tham khảo:{" "}
            <b>{t?.shares?.toLocaleString("vi-VN") ?? "—"} cổ phiếu</b>
            {["DOWNTREND_RELIEF_RALLY", "MAJOR_REVERSAL"].includes(
              r.tradePlan?.setupType ?? "",
            )
              ? " · giảm 50% ngân sách rủi ro"
              : ""}
            .
          </p>
          <p>
            R:R gross tại đầu trên entry: <b>{num(t?.rrWorst)}</b>. Net trừ phí
            và trượt giá hai chiều theo Settings.
          </p>
          <small>
            SL không bảo đảm khớp giá khi gap/sàn; không giả định bán được cổ
            phiếu trước thanh toán.
          </small>
        </section>
      </div>
      <section className="panel context-grid">
        {[
          ["Trend", a.trend],
          ["Dòng tiền", `${a.flow} · CMF ${num(a.cmf)}`],
          ["Ichimoku D/W/M", a.ichi],
          ["VSA", a.vsa],
          ["PK RSI / Composite", a.divergence],
          ["RSI / RVOL", `${num(a.rsi, 1)} / ${num(a.rvol)}×`],
        ].map(([k, v]) => (
          <div key={k}>
            <small>{k}</small>
            <strong>{v}</strong>
          </div>
        ))}
      </section>
      <section className="panel prose">
        <div className="eyebrow">EVIDENCE & CONFLICTS</div>
        <h2>Xác nhận trước khi vào lệnh</h2>
        {[...a.notes, ...(t?.warnings ?? [])].length ? (
          [...a.notes, ...(t?.warnings ?? [])].map((x, i) => (
            <p className="risk-note" key={i}>
              • {x}
            </p>
          ))
        ) : (
          <p>
            Không có hard veto được engine phát hiện. Vẫn cần giá về đúng zone
            và trigger xác nhận.
          </p>
        )}
        <small>
          Thời điểm tải: {new Date(a.feed.fetchedAt).toLocaleString("vi-VN")} ·{" "}
          {a.feed.cached ? "cache" : "upstream"} ·{" "}
          {a.feed.warning ?? "Phiên D1 có thể chưa đóng."}
        </small>
      </section>
      <section className="strategies">
        <div className="section-heading">
          <h2>8 góc nhìn chiến thuật</h2>
          <span className="muted">
            S1–S6 bỏ phiếu · S8/S9 xác nhận · đã bỏ S7
          </span>
        </div>
        <div className="strategy-grid">
          {r.strategies.map((st) => (
            <article className="panel strategy" key={st.id}>
              <div className="strategy-heading">
                <span className="strategy-id">{st.shortId}</span>
                <h3>{st.name}</h3>
                <Badge text={st.signal} />
              </div>
              <small>
                Raw engine · score {st.score ?? "—"} · tách biệt với Call và kế
                hoạch cấu trúc ở đầu trang.
              </small>
              {st.error && <p className="down">{st.error}</p>}
              {st.reasons.slice(0, 4).map((x, i) => (
                <p key={i}>{x}</p>
              ))}
              {st.warnings.map((x, i) => (
                <p className="gold" key={"w" + i}>
                  {x}
                </p>
              ))}
              <details>
                <summary>Điều kiện & chỉ báo chi tiết</summary>
                {st.checks.map((x, i) => (
                  <p key={i} className={x.ok ? "up" : "muted"}>
                    {x.ok ? "✓" : "○"} {x.text}
                  </p>
                ))}
                <dl>
                  {Object.entries(st.extras).map(([k, v]) => (
                    <React.Fragment key={k}>
                      <dt>{k}</dt>
                      <dd>{String(v ?? "—")}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              </details>
            </article>
          ))}
        </div>
      </section>
      <footer>
        Tham khảo kỹ thuật T+ · Score không phải tỷ lệ thắng. Chưa có backtest
        chứng minh lợi nhuận của lớp tổng hợp mới.
      </footer>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
