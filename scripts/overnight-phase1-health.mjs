#!/usr/bin/env node
/**
 * Phase 1 — Health & Fix: build check, dev server smoke test, runtime crash detection.
 * Exits 0 when all routes render without JS crashes, non-zero otherwise.
 */
import { chromium } from "playwright";
import { execSync, spawn } from "child_process";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import http from "http";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SCREENSHOTS_DIR = join(ROOT, "logs", "overnight-screenshots");
const REPORT_PATH = join(ROOT, "logs", "overnight-phase1-report.json");
const DEV_PORT = 3000;
const BASE = `http://localhost:${DEV_PORT}`;

const ROUTES = [
  { path: "/", label: "home" },
  { path: "/portal", label: "portal" },
  { path: "/cinematic/01_command_atrium", label: "command_atrium" },
  { path: "/cinematic/02_ops_floor", label: "ops_floor" },
  { path: "/cinematic/05_cyber_lab", label: "cyber_lab" },
  { path: "/cinematic/08_war_room", label: "war_room" },
];

const IGNORE_PATTERNS = [
  "fetch", "ERR_CONNECTION_REFUSED", "net::ERR", "Failed to load resource",
  "favicon.ico", "AxiosError", "Network Error", "ECONNREFUSED", "404",
  "AbortError", "signal is aborted", "WebSocket", "wss://", "ws://",
];

const CRASH_PATTERNS = [
  "TypeError", "ReferenceError", "SyntaxError", "Cannot read properties",
  "is not defined", "is not a function", "Unexpected token",
  "Cannot find module", "Module not found",
];

function isCrash(text) {
  if (IGNORE_PATTERNS.some((p) => text.includes(p))) return false;
  return CRASH_PATTERNS.some((p) => text.includes(p));
}

function log(msg) {
  console.log(`[phase1] ${msg}`);
}

// ── Build ────────────────────────────────────────────────────────────────────

function runBuild() {
  try {
    execSync("node node_modules/vite/bin/vite.js build", {
      cwd: ROOT,
      stdio: "pipe",
      timeout: 300_000,
    });
    return { ok: true, error: null };
  } catch (e) {
    const stderr = (e.stderr || "").toString();
    const stdout = (e.stdout || "").toString();
    return { ok: false, error: stderr || stdout || e.message };
  }
}

function attemptBuildFix(errorText) {
  // Pattern: "Could not resolve" or "does not provide an export named"
  const missingImportMatch = errorText.match(
    /Could not resolve ['"]([^'"]+)['"] from ['"]([^'"]+)['"]/
  );
  if (missingImportMatch) {
    const [, specifier, fromFile] = missingImportMatch;
    return {
      file: fromFile,
      error: `Missing import: ${specifier}`,
      fix: `Could not auto-fix missing module "${specifier}" in ${fromFile}`,
      applied: false,
    };
  }

  // Pattern: "Unexpected token" with file path — usually a syntax error
  const syntaxMatch = errorText.match(
    /(?:Parse error|SyntaxError|Unexpected token)[^\n]*\n\s*(?:at |in )([^\s:]+):?(\d+)?/
  );
  if (syntaxMatch) {
    return {
      file: syntaxMatch[1],
      error: `Syntax error at line ${syntaxMatch[2] || "?"}`,
      fix: "Syntax errors require manual review",
      applied: false,
    };
  }

  // Pattern: file:line:col error format from esbuild/rollup
  const esbuildMatch = errorText.match(
    /(?:✘ \[ERROR\]|error:)\s*(.*?)\n\s*([^\s]+\.(?:jsx?|tsx?)):(\d+):(\d+)/
  );
  if (esbuildMatch) {
    return {
      file: esbuildMatch[2],
      error: `${esbuildMatch[1].trim()} at ${esbuildMatch[2]}:${esbuildMatch[3]}`,
      fix: "Build error requires manual review",
      applied: false,
    };
  }

  // Rollup-style file reference
  const rollupMatch = errorText.match(
    /(?:src\/[^\s:]+\.(?:jsx?|tsx?))(?::(\d+))?/
  );
  if (rollupMatch) {
    return {
      file: rollupMatch[0].split(":")[0],
      error: errorText.slice(0, 200),
      fix: "Build error requires manual review",
      applied: false,
    };
  }

  return null;
}

// ── Dev server ───────────────────────────────────────────────────────────────

function startDevServer() {
  const child = spawn("node", ["node_modules/vite/bin/vite.js", "--port", String(DEV_PORT), "--host", "localhost"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  return child;
}

function waitForServer(url, timeoutMs = 60_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Server not ready after ${timeoutMs}ms`));
        return;
      }
      http.get(url, (res) => {
        if (res.statusCode === 200) resolve();
        else setTimeout(check, 1000);
        res.resume();
      }).on("error", () => setTimeout(check, 1000));
    };
    check();
  });
}

// ── Browser checks ───────────────────────────────────────────────────────────

async function checkRoutes() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome",
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const results = [];

  for (const route of ROUTES) {
    const page = await context.newPage();
    const crashes = [];

    page.on("console", (msg) => {
      if (msg.type() === "error" && isCrash(msg.text())) {
        crashes.push(msg.text());
      }
    });
    page.on("pageerror", (err) => {
      if (isCrash(err.message)) {
        crashes.push(err.message);
      }
    });

    let rendered = false;
    const screenshotName = `${route.label}.png`;
    const screenshotPath = join(SCREENSHOTS_DIR, screenshotName);

    try {
      const navTimeout = route.path === "/" ? 60_000 : 30_000;
      try {
        await page.goto(`${BASE}${route.path}`, { waitUntil: "domcontentloaded", timeout: navTimeout });
      } catch (navErr) {
        // The home route may redirect through a loader — try waiting for any content
        if (route.path === "/") {
          await page.waitForTimeout(5000);
        } else {
          throw navErr;
        }
      }
      await page.waitForTimeout(3000);

      // Check for non-white-screen: at least one visible element with content
      rendered = await page.evaluate(() => {
        const body = document.body;
        if (!body) return false;
        // React error boundary detection
        const errorBoundary = body.querySelector('[class*="error"], [class*="Error"]');
        if (errorBoundary && errorBoundary.textContent.includes("went wrong")) return false;
        // White screen: body has no meaningful child content
        const text = body.innerText.trim();
        return text.length > 10;
      });

      await page.screenshot({ path: screenshotPath, fullPage: false });
    } catch (e) {
      crashes.push(`Navigation error: ${e.message}`);
    }

    await page.close();
    results.push({
      path: route.path,
      label: route.label,
      rendered,
      errors: crashes,
      screenshot: screenshotName,
    });

    const status = rendered && crashes.length === 0 ? "✓" : "✗";
    log(`${status} ${route.path} — rendered=${rendered}, crashes=${crashes.length}`);
    if (crashes.length > 0) {
      crashes.forEach((c) => log(`  ERROR: ${c.slice(0, 200)}`));
    }
  }

  await browser.close();
  return results;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const report = {
    passed: false,
    timestamp: new Date().toISOString(),
    buildStatus: "unknown",
    routes: [],
    fixes: [],
  };

  // Phase 1a: Build check with retry
  log("Running vite build...");
  let buildResult = runBuild();
  let buildAttempt = 1;

  while (!buildResult.ok && buildAttempt < 3) {
    log(`Build failed (attempt ${buildAttempt}). Analyzing error...`);
    const fixInfo = attemptBuildFix(buildResult.error);
    if (fixInfo) {
      report.fixes.push(fixInfo);
      log(`Identified: ${fixInfo.error}`);
      if (!fixInfo.applied) {
        log("Cannot auto-fix this build error.");
        break;
      }
      log(`Applied fix: ${fixInfo.fix}`);
    } else {
      log("Could not identify a fixable pattern in the build error.");
      log(`Error output: ${buildResult.error.slice(0, 500)}`);
      break;
    }
    buildAttempt++;
    buildResult = runBuild();
  }

  if (!buildResult.ok) {
    report.buildStatus = "failed";
    log(`BUILD FAILED after ${buildAttempt} attempt(s).`);
    log(buildResult.error.slice(0, 1000));
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    process.exit(1);
  }

  report.buildStatus = "passed";
  log(`Build passed (attempt ${buildAttempt}).`);

  // Phase 1b: Dev server + browser smoke test
  log("Starting dev server...");
  const server = startDevServer();
  let serverPid = server.pid;

  const cleanup = () => {
    try { server.kill("SIGTERM"); } catch {}
    try { process.kill(serverPid, 0); process.kill(serverPid, "SIGKILL"); } catch {}
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => { cleanup(); process.exit(1); });
  process.on("SIGTERM", () => { cleanup(); process.exit(1); });

  try {
    await waitForServer(BASE, 60_000);
    log("Dev server ready.");
  } catch (e) {
    log(`Dev server failed to start: ${e.message}`);
    report.buildStatus = "server_failed";
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    cleanup();
    process.exit(1);
  }

  // Phase 1c: Route checks
  log("Checking routes with Playwright...");
  const routeResults = await checkRoutes();
  report.routes = routeResults;

  // Determine pass/fail
  const crashingRoutes = routeResults.filter((r) => r.errors.length > 0 || !r.rendered);
  report.passed = crashingRoutes.length === 0;

  if (report.passed) {
    log(`ALL ${routeResults.length} ROUTES HEALTHY.`);
  } else {
    log(`${crashingRoutes.length}/${routeResults.length} routes have issues:`);
    crashingRoutes.forEach((r) => {
      log(`  ${r.path}: rendered=${r.rendered}, errors=${r.errors.length}`);
    });
  }

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  log(`Report written to ${REPORT_PATH}`);

  cleanup();
  process.exit(report.passed ? 0 : 1);
}

main().catch((e) => {
  console.error("[phase1] Fatal:", e);
  process.exit(1);
});
