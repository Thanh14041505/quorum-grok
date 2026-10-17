# Quorum VN

Seven independent Vietnam-stock trading brains, one shared data layer, a consensus desk that refuses to hide disagreement.

This is a professional web terminal (not a notebook dump). Each strategy keeps the philosophy of its source notebook. Signals are never merged into a fake 87/100 score.

## Desk

1. Paste a watchlist. Optionally paste an **existing book** (`FPT 96.5 200`).
2. Scan. Names you hold are included even if they are not on the watchlist.
3. Read the morning playbook, then queues: **Grok longs** / **SMC longs** / Buy / Watch / Exit / Conflict.
4. Open a ticker for **Grok Call**, **SMC structure** (entry zone / SL / TP on the candles), lot size, and why each brain voted.
5. Export CSV for the daily tape.

Prices are stored in VND and shown as **nghìn VNĐ** (66.40). Percentages use `+5.42%`. Missing values render as `N/A`.

## Brains

| ID | Name | Source | Idea |
| --- | --- | --- | --- |
| S1 | Daily Pulse | Production Daily Scanner | Interpretable trend/flow/structure/RS with exit veto |
| S2 | Ichimoku 3TF | Claude v1 / PR016 | Trịnh Phát D/W/M cloud, Kijun pullback, min 9% T1 |
| S3 | VSA Smart Money | Grok v2 | Volume × spread × close-position, distribution hard-veto |
| S4 | Volume Profile | Grok v2 SignalBuilder | POC/VAH/VAL location, R:R ≥ 2, 9% first target |
| S5 | Multi-Factor | PR016 ScoringEngine | Regime-weighted 0–10 subscores |
| S6 | RSI Composite | Claude v1.1 / Grok v3 | Constance Brown composite, confirmed pivots only |
| S7 | Dao Gam Holder | PR016+ / HolderAdvisor | Existing-position CUT / REDUCE / ADD / HOLD |
| S8 | Grok Tape | Original | Confirmed swings, Donchian location, effort/result, ATR coil, RS persistence — **does not vote** |
| S9 | SMC Structure | Original | **Major** zigzag (≥8%, D/W/M), BOS/CHoCH, Fib OTE 0.618–0.786. Buy only at HTF discount + money-in or a held low retest. Long-only: no short ticket. |
| — | Grok Call | Original | Buy/sell recommendation: SCALE IN / LEAN LONG / WAIT / PROTECT. Can disagree with consensus. |

## Data

OHLCV is fetched newest-first from VNDIRECT (`sort=date:desc`, then reversed) with VPS as backup. The old `sort=asc&size=N` call returned the *oldest* N days and made the desk trade May while the market was in September. Session dates are Asia/Ho_Chi_Minh. A last bar older than 7 calendar days is rejected, not scored.

If every feed is unreachable, the desk falls back to a clearly labeled demo series so the UI still works.

## Chạy ổn định (không tự reload)

Preview trong khung chat là bản đang sửa: nó tự tải lại mỗi khi code đổi, và nút **Mở trong thẻ mới** của khung đó dễ bị Cloudflare chặn. Đó không phải app hỏng.

Cách dùng thật:

1. Bấm **Xuất bản** trên khung preview. Đợi link công khai.
2. Mở link đó trong tab mới. Tab này không tự reload, bấm mã xem chi tiết bình thường.

## Chạy trên máy (Node, không phải Streamlit)

App này là web React (TanStack Start). **Streamlit Community Cloud không chạy được** — Streamlit chỉ host file Python `app.py`. Đừng tạo app Streamlit rồi upload zip này.

Cần [Node.js 22](https://nodejs.org/).

```bash
cd quorum-vn
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
npm install
npm run dev
```

Mở `http://localhost:8080`. Watchlist, sổ lệnh và kết quả scan nằm trong trình duyệt (localStorage), không cần API key. Dữ liệu giá lấy từ VPS / VNDIRECT.

Build production:

```bash
npm run build
npm run preview
```

## Đưa lên mạng (Vercel)

1. Đẩy thư mục này lên một repo GitHub (không commit `node_modules`).
2. Vào [vercel.com](https://vercel.com) → Add New Project → import repo.
3. Framework preset để Vite / Other. Build command: `npm run build`. Output đã cấu hình Nitro cho Vercel — không cần đổi.
4. Deploy. Dùng URL Vercel trong tab mới. Không cần Streamlit, không cần secret.

Defaults: lookback 800, buy score 75, watch score 60, min T1 7%. Broad list is 243 names.
