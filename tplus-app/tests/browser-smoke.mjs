import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { demoSeries } from "../src/quant/demo-data.ts";
const port = 5182;
const server = spawn(process.execPath, ["server/dev.mjs"], {
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/market?health=1`)).ok)
        break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  let options = { headless: true, args: ["--no-sandbox"] };
  if (process.env.CHROMIUM_USE_SPARTICUZ === "1") {
    const { default: c } = await import("@sparticuz/chromium");
    options = {
      ...options,
      args: c.args,
      executablePath: await c.executablePath(),
    };
  }
  browser = await chromium.launch(options);
  const page = await browser.newPage({
    viewport: { width: 1500, height: 1000 },
  });
  const exceptions = [];
  page.on("pageerror", (e) => exceptions.push(e.message));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.getByRole("button", { name: "Xem demo giao diện" }).click();
  await page.waitForFunction(
    () => document.querySelectorAll("tbody tr").length === 12,
    {},
    { timeout: 30000 },
  );
  assert.match(await page.locator("tbody").innerText(), /DEMO/);
  assert.equal(
    await page
      .locator("tbody tr td:nth-child(7)")
      .getByText("BUY", { exact: true })
      .count(),
    0,
  );
  await page.screenshot({ path: "/tmp/tplus-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Kỹ thuật", exact: true }).click();
  assert.equal(
    await page
      .getByRole("columnheader", { name: "Ichimoku", exact: true })
      .count(),
    1,
  );
  await page.locator(".ticker").first().click();
  await page.getByRole("heading", { name: "8 góc nhìn chiến thuật" }).waitFor();
  assert.equal(await page.locator(".strategy").count(), 8);
  assert.equal(
    await page.locator(".strategy-id").getByText("S7", { exact: true }).count(),
    0,
  );
  await page.getByRole("button", { name: "200D", exact: true }).click();
  await page.screenshot({ path: "/tmp/tplus-detail.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "/tmp/tplus-mobile-detail.png",
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await page
    .getByRole("button", { name: "Về T+ Scanner", exact: false })
    .click();
  await page.getByRole("button", { name: "Mở settings" }).click();
  await page
    .getByRole("textbox", { name: "Danh sách mã", exact: false })
    .fill("fpt; hpg FPT SSI");
  await page.getByRole("textbox", { name: "Tên watchlist" }).fill("Test list");
  await page
    .getByRole("button", { name: "Lưu watchlist", exact: true })
    .click();
  await page.getByRole("button", { name: "Lưu & áp dụng" }).click();
  assert.match(
    await page.evaluate(() => localStorage.getItem("compass.settings")),
    /FPT, HPG, SSI/,
  );
  assert.match(
    await page.evaluate(() => localStorage.getItem("compass.lists")),
    /Test list/,
  );
  await page.screenshot({ path: "/tmp/tplus-mobile.png", fullPage: true });
  await page.route("**/api/market?symbol=**", async (route) => {
    const symbol = new URL(route.request().url()).searchParams.get("symbol");
    if (symbol === "SSI")
      return route.fulfill({
        status: 502,
        json: { error: "VNDIRECT: rate limited" },
      });
    return route.fulfill({
      json: {
        symbol,
        candles: demoSeries(symbol, 800),
        source: "FIXTURE",
        session: "2026-10-23",
        fetchedAt: Date.now(),
        stale: true,
        cached: false,
      },
    });
  });
  await page
    .getByRole("button", { name: "Quét thị trường", exact: false })
    .click();
  await page
    .getByText("Mã tải lỗi (1)", { exact: true })
    .waitFor({ timeout: 30000 });
  await page.waitForFunction(
    () => document.querySelectorAll("tbody tr").length === 2,
  );
  await page.waitForFunction(() =>
    document.querySelector("tbody")?.innerText.includes("STALE"),
  );
  assert.match(await page.locator("tbody").innerText(), /STALE/);
  await page.getByRole("button", { name: "Quét lại nhóm lỗi" }).click();
  await page
    .getByText("Mã tải lỗi (1)", { exact: true })
    .waitFor({ timeout: 30000 });
  await page.waitForFunction(
    () => document.querySelectorAll("tbody tr").length === 2,
  );
  assert.equal(await page.locator("tbody tr").count(), 2);
  assert.deepEqual(exceptions, []);
  console.log(
    JSON.stringify({
      ok: true,
      checks: [
        "12-row demo",
        "8 strategies and no S7",
        "technical columns",
        "detail chart",
        "mobile overflow",
        "saved settings/watchlist",
        "partial API failure",
        "retry retains successes",
        "zero browser exceptions",
      ],
    }),
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
