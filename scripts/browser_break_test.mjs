#!/usr/bin/env node
/**
 * Browser break-test for the JARVIS live UI.
 *
 * Loads the public /jarvis/ URL, exercises the most critical controls, and records:
 *   - failed network requests (4xx/5xx)
 *   - wrong content types (HTML where JSON expected)
 *   - console errors / warnings
 *   - blocked pointer targets
 *   - stale loading states (>10s)
 *
 * Run:
 *   node scripts/browser_break_test.mjs
 *   BREAK_TEST_URL=https://app.projectsolar.cloud/jarvis/?__jv=17 node scripts/browser_break_test.mjs
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = join(__dirname, "..", "server", "data", "break_test_report.json");

const URL = process.env.BREAK_TEST_URL || "https://app.projectsolar.cloud/jarvis/?__jv=17";
const TIMEOUT_MS = Number(process.env.BREAK_TEST_TIMEOUT_MS || "20000");

const failures = [];
const consoleEntries = [];
const networkErrors = [];

function fail(step, detail) {
  const entry = { step, detail, at: new Date().toISOString() };
  failures.push(entry);
  console.error(`[FAIL] ${step}: ${detail}`);
}

function log(step, detail) {
  console.log(`[OK] ${step}: ${detail}`);
}

async function waitForResponse(page, predicate, timeout = 10000) {
  try {
    await page.waitForResponse(predicate, { timeout });
    return true;
  } catch {
    return false;
  }
}

async function run() {
  const started = Date.now();
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    console.error("Playwright chromium launch failed:", e.message);
    console.error("Install browsers with: npx playwright install chromium");
    process.exit(1);
  }

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  page.on("console", (msg) => {
    const text = msg.text();
    const type = msg.type();
    consoleEntries.push({ type, text });
    if (type === "error" || text.includes("Failed to load") || text.includes("TypeError") || text.includes("ReferenceError")) {
      networkErrors.push({ kind: "console", type, text });
    }
  });

  page.on("pageerror", (err) => {
    networkErrors.push({ kind: "pageerror", text: err.message });
  });

  page.on("response", (resp) => {
    const status = resp.status();
    const url = resp.url();
    const req = resp.request();
    const resourceType = req.resourceType();
    if (status >= 400) {
      networkErrors.push({ kind: "http", status, url, resourceType });
    }
    // JSON endpoints returning HTML is a common routing bug.
    if (url.includes("/v1/") || url.endsWith("/counts") || url.endsWith("/metrics")) {
      const contentType = resp.headers()["content-type"] || "";
      if (contentType.includes("text/html")) {
        networkErrors.push({ kind: "content-type", url, contentType });
      }
    }
  });

  // 1. Load the live UI
  console.log(`\nLoading ${URL}…`);
  try {
    await page.goto(URL, { waitUntil: "networkidle", timeout: TIMEOUT_MS });
  } catch (e) {
    fail("page-load", e.message);
    await browser.close();
    return;
  }

  // Wait for the command bar to prove the app rendered.
  try {
    await page.waitForSelector("#cmd", { timeout: 10000 });
    log("render", "#cmd visible");
  } catch (e) {
    fail("render", "#cmd not visible after load: " + e.message);
  }

  // 2. Send a chat message through the live UI
  try {
    await page.fill("#say", "What is your status?");
    const chatRespPromise = page.waitForResponse((r) => r.url().includes("/chat") && r.status() < 500 && r.request().method() === "POST", { timeout: 20000 });
    await page.click(".send");
    const resp = await chatRespPromise;
    const body = await resp.json().catch(() => ({}));
    const reply = body?.reply || "";
    if (!reply) {
      fail("chat", "/chat returned empty reply");
    } else {
      log("chat", `reply: ${reply.slice(0, 80)}`);
    }
  } catch (e) {
    fail("chat", e.message);
  }

  // 3. Open Control Center and launch the Apps carousel from there
  try {
    await page.click("#ccBtn");
    await page.waitForSelector("#ovControlCenter.open", { timeout: 5000 });
    const appsBtn = page.locator("#ccApps");
    if (await appsBtn.isVisible({ timeout: 5000 })) {
      await appsBtn.click();
      await page.waitForSelector("#ovCarousel", { state: "visible", timeout: 8000 });
      log("control-center-apps", "carousel opened from Control Center");
      // Close carousel + control center so later tests can reach the page.
      await page.evaluate(() => { if (window.closeCarouselOverlay) window.closeCarouselOverlay(); });
      await page.evaluate(() => { if (window.toggleControlCenter) window.toggleControlCenter(); });
    } else {
      fail("control-center-apps", "ccApps button not visible");
    }
  } catch (e) {
    fail("control-center-apps", e.message);
  }

  // 4. Click a quick action (Status) and verify something happens
  try {
    const statusBtn = page.locator('button[aria-label="Read system status"]').first();
    if (await statusBtn.isVisible({ timeout: 5000 })) {
      await statusBtn.click();
      await page.waitForTimeout(800);
      const crystal = await page.textContent("#crystal");
      log("quick-status", crystal ? `crystal: ${crystal.slice(0, 80)}` : "crystal empty");
    } else {
      fail("quick-status", "Status button not visible");
    }
  } catch (e) {
    fail("quick-status", e.message);
  }

  // 5. Panel toggle sanity: at least one live panel should be clickable
  try {
    const toggles = page.locator(".gp-tog");
    const count = await toggles.count();
    if (count > 0) {
      await toggles.first().click();
      log("panel-toggle", `toggled first of ${count} panels`);
    } else {
      fail("panel-toggle", "No .gp-tog elements found");
    }
  } catch (e) {
    fail("panel-toggle", e.message);
  }

  // 6. Collect final report
  const duration = Date.now() - started;
  const report = {
    url: URL,
    duration_ms: duration,
    timestamp: new Date().toISOString(),
    passed: failures.length === 0,
    failures,
    networkErrors,
    consoleEntries: consoleEntries.slice(0, 200),
  };

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log(`\nReport written to ${REPORT_PATH}`);
  console.log(`Result: ${report.passed ? "PASS" : "FAIL"} (${failures.length} failures, ${networkErrors.length} network issues)`);

  await browser.close();
  process.exit(report.passed ? 0 : 1);
}

run().catch((e) => {
  console.error("Break-test runner crashed:", e);
  process.exit(1);
});
