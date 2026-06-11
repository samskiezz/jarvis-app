import { chromium, devices } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.JARVIS_AUDIT_URL || "http://127.0.0.1:5173";
const outDir = process.env.JARVIS_AUDIT_OUT || "/tmp/jarvis-responsive-audit";
const routeLimit = Number(process.env.JARVIS_AUDIT_ROUTE_LIMIT || "0");
const fixtureApi = process.env.JARVIS_AUDIT_FIXTURE_API !== "0";

const routes = [
  { name: "home", path: "/" },
  { name: "portal", path: "/portal" },
  { name: "cinematic", path: "/cinematic/01_command_atrium" },
  { name: "setup", path: "/apex/Setup" },
  { name: "terminal", path: "/apex/JarvisTerminal" },
  { name: "gateway", path: "/apex/GatewayConsole" },
  { name: "reports", path: "/apex/Reports" },
  { name: "plane-graph", path: "/apex/PlaneGraph" },
  { name: "command", path: "/apex/CommandCenter" },
  { name: "dashboard", path: "/apex/Dashboard" },
];

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "laptop", width: 1366, height: 768 },
  { name: "tablet", ...devices["iPad Pro 11"].viewport },
  { name: "mobile", ...devices["iPhone 14"].viewport, isMobile: true },
];

const selectedRoutes = routeLimit > 0 ? routes.slice(0, routeLimit) : routes;

function apiFixture(url, method) {
  const u = new URL(url);
  const p = u.pathname;
  if (p === "/auth/me") return { ok: true, user: { id: "audit", email: "audit@local" } };
  if (p === "/v1/jarvis/system/status") {
    return {
      ok: true,
      gotham: { ontology_objects: 900, cases: 3 },
      foundry: { endpoints: 489 },
      gpu: { connected: false, model: "qwen2.5:32b" },
    };
  }
  if (p === "/functions/getLiveIntel") {
    return {
      ok: true,
      markets: [{ display: "XRP/AUD", price: "2.07", change_pct: 1.2 }],
      earthquakes: [],
      alerts: [],
      risks: [],
    };
  }
  if (p === "/v1/cinematic/brain") return { ok: true, online: true, mode: "audit" };
  if (p.startsWith("/v1/cinematic/scene/")) return { ok: true, scene: p.split("/").pop(), panels: [] };
  if (p === "/v1/underworld/health") return { reachable: false, status: 502, latency_ms: 0, detail: "audit fixture" };
  if (p === "/v1/underworld/catalog") return { configured: true, endpoints: [] };
  if (p.startsWith("/v1/underworld/proxy/")) return { ok: false, status: 502, error: "audit fixture" };
  if (p.startsWith("/v1/activity")) return { activity: [] };
  if (p.startsWith("/v1/reports")) return { reports: [] };
  if (p.startsWith("/v1/jarvis/research/status")) return { ok: true, connection: { ollama_host: "" } };
  if (method === "POST") return { ok: true };
  return { ok: true, items: [] };
}

function slug(s) {
  return s.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

async function auditPage(page, route, viewport) {
  const url = new URL(route.path, baseUrl).toString();
  const consoleIssues = [];
  const pageErrors = [];
  const failedRequests = [];

  if (fixtureApi) {
    await page.route(/https?:\/\/(76\.13\.176\.135|127\.0\.0\.1|localhost):8001\/.*/, async (route) => {
      const req = route.request();
      const pathname = new URL(req.url()).pathname;
      if (pathname.startsWith("/streams/")) {
        await route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache" },
          body: "event: frame\ndata: {\"units\":[],\"events\":[]}\n\n",
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(apiFixture(req.url(), req.method())),
      });
    });
  }

  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type())) {
      consoleIssues.push(`${msg.type()}: ${msg.text()}`.slice(0, 500));
    }
  });
  page.on("pageerror", (err) => pageErrors.push(String(err.message || err).slice(0, 500)));
  page.on("requestfailed", (req) => {
    const failure = req.failure();
    const url = req.url();
    const detail = failure?.errorText || "";
    if (detail.includes("ERR_ABORTED") && /\.(mp4|webm|mov)(\?|$)/i.test(url)) return;
    failedRequests.push(`${req.method()} ${url} ${detail}`.slice(0, 500));
  });

  await page.addInitScript(() => {
    try {
      localStorage.setItem("jarvis_setup_done_v", "1");
    } catch {
      // ignore storage-disabled contexts
    }
  });
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 12000 }).catch((err) => ({ error: err }));
  await page.waitForTimeout(800);

  const metrics = await page.evaluate(() => {
    const body = document.body;
    const doc = document.documentElement;
    const text = (body?.innerText || "").replace(/\s+/g, " ").trim();
    const overflowX = Math.max(body?.scrollWidth || 0, doc?.scrollWidth || 0) - window.innerWidth;
    const buttons = [...document.querySelectorAll("button,a,input,textarea,select")];
    const tinyTargets = buttons.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.width < 28 || r.height < 28);
    }).length;
    return {
      title: document.title,
      textLength: text.length,
      textSample: text.slice(0, 240),
      overflowX,
      tinyTargets,
      bodyWidth: body?.scrollWidth || 0,
      viewportWidth: window.innerWidth,
    };
  });

  const shot = path.join(outDir, `${viewport.name}-${slug(route.name)}.png`);
  await page.screenshot({ path: shot, fullPage: false });

  const failures = [];
  if (response?.error) failures.push(`navigation failed: ${response.error.message}`);
  if (response?.status && response.status() >= 500) failures.push(`http ${response.status()}`);
  if (pageErrors.length) failures.push(`page errors: ${pageErrors.length}`);
  if (metrics.textLength < 20) failures.push("body text too short / likely blank");
  if (metrics.overflowX > 4) failures.push(`horizontal overflow ${metrics.overflowX}px`);

  return {
    route: route.path,
    routeName: route.name,
    viewport: viewport.name,
    screenshot: shot,
    failures,
    consoleIssues: consoleIssues.slice(0, 8),
    pageErrors: pageErrors.slice(0, 8),
    failedRequests: failedRequests.slice(0, 8),
    metrics,
  };
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const viewport of viewports) {
      for (const route of selectedRoutes) {
        const page = await browser.newPage({
          viewport: { width: viewport.width, height: viewport.height },
          isMobile: viewport.isMobile || false,
        });
        try {
          results.push(await auditPage(page, route, viewport));
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  const reportPath = path.join(outDir, "report.json");
  await fs.writeFile(reportPath, JSON.stringify({ baseUrl, generatedAt: new Date().toISOString(), results }, null, 2));

  const failed = results.filter((r) => r.failures.length);
  console.log(`Responsive audit: ${results.length} checks, ${failed.length} failed`);
  console.log(`Report: ${reportPath}`);
  for (const r of failed.slice(0, 20)) {
    console.log(`FAIL ${r.viewport} ${r.route}: ${r.failures.join("; ")} | ${r.screenshot}`);
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
