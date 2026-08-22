/**
 * JarvisOsMonitor — F278.
 *
 * Operational spine view: architecture map, tamper-evident audit chain,
 * observability metrics, and human-in-the-loop approval gates.
 *
 * Data sources (all real — endpoints listed in JARVIS_FEATURE_BACKLOG.md):
 *   GET  /v1/jarvis/architecture   (poll 120 s) → {layers:[{layer,key,status,modules,present,note}], summary}
 *   GET  /v1/jarvis/audit?limit=50 (poll 60 s)  → {entries:[{id,ts,actor,action,target,meta,hash,prev_hash}]}
 *   GET  /v1/jarvis/audit/verify   (poll 120 s) → {intact,checked,broken_at}
 *   GET  /v1/jarvis/metrics        (poll 60 s)  → {spans,p50_ms,p95_ms,total_cost,error_rate,by_layer}
 *   GET  /v1/jarvis/approvals      (poll 60 s)  → {approvals:[{id,ts,action,role,actor,status,...}]}
 *   POST /v1/jarvis/approvals/{id}              → decide {approve,decided_by,reason}
 *
 * Displays:
 *   - Stat tiles: native-layers / audit-entries / total-spans / pending-approvals
 *   - ARCH | AUDIT | METRICS | APPROVALS tab switcher + text search
 *   - ARCH: 10-layer status bars (native=green/partial=amber/interface=cyan/missing=red)
 *           + chain-integrity chip + summary tiles
 *   - AUDIT: reverse-chron log with expand → actor/action/target/ts/hash-prefix
 *   - METRICS: p50/p95/cost/error-rate tiles + by_layer breakdown bars
 *   - APPROVALS: pending gates with inline ✓ APPROVE / ✗ DENY + reason input;
 *                decided entries collapsed below
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence OS health brief + TTS
 *
 * Toggle: ◈ JOSM at left:288000, bottom:8, zIndex:156.
 * Badge: red=chain broken or pending approvals, amber=partial layers, green=all clear.
 * Auto-refresh: 60 s fast / 120 s slow.
 *
 * Exported helpers for JarvisBrain:
 *   isJosmQuery(q) / buildJosmScript()
 *
 * Voice triggers: "jarvis os / jarvis architecture / system layers / audit log /
 *   audit chain / josm / approvals board / observability / action approvals /
 *   jarvis metrics / pending approvals / system architecture / layer status /
 *   os monitor / jos"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const PU   = "#A78BFA";
const RD   = "#F87171";
const DIM  = "#3A4A55";
const GRAY = "#4E6070";

const BTN_LEFT  = 288000;
const POLL_FAST = 60_000;
const POLL_SLOW = 120_000;
const API_KEY   =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── JarvisBrain exports ──────────────────────────────────────────────────────

const JOSM_RE =
  /\b(jarvis\s+os|jarvis\s+arch(?:itecture)?|system\s+layers?|audit\s+log|audit\s+chain|josm\b|approvals?\s+board|observability|action\s+approvals?|jarvis\s+metrics|pending\s+approvals?|system\s+arch(?:itecture)?|layer\s+status|os\s+monitor|jos\b)\b/i;

export function isJosmQuery(q) {
  return JOSM_RE.test(q || "");
}

export async function buildJosmScript() {
  try {
    const [archR, metricsR, approvalsR, verifyR] = await Promise.all([
      fetch(`${apiBase()}/v1/jarvis/architecture`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/v1/jarvis/metrics`,      { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/v1/jarvis/approvals`,    { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/v1/jarvis/audit/verify`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const arch      = await archR.json();
    const metrics   = await metricsR.json();
    const approvals = await approvalsR.json();
    const verify    = await verifyR.json();
    window.dispatchEvent(new CustomEvent("jarvis:josm-toggle"));
    const native    = arch?.summary?.native ?? 0;
    const total     = arch?.summary?.total  ?? 0;
    const pending   = (approvals?.approvals ?? []).filter((a) => a.status === "pending").length;
    const intact    = verify?.intact !== false;
    return (
      `Jarvis OS: ${native}/${total} layers native, audit chain ${intact ? "intact" : "BROKEN"}, ` +
      `${metrics?.spans ?? 0} spans recorded (p95 ${metrics?.p95_ms ?? 0} ms), ` +
      `${pending} pending approval${pending !== 1 ? "s" : ""}. ` +
      (pending > 0 ? "Open the approvals tab to review pending gates." : "All systems nominal.")
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:josm-toggle"));
    return "Jarvis OS Monitor open, sir.";
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function hdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function age(ts) {
  if (!ts) return "—";
  const raw = typeof ts === "number" ? (ts > 1e10 ? ts / 1000 : ts) : new Date(ts).getTime() / 1000;
  if (isNaN(raw)) return "—";
  const s = Math.max(0, Math.floor(Date.now() / 1000 - raw));
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function truncate(str, len = 120) {
  if (!str) return "";
  const s = typeof str === "string" ? str : JSON.stringify(str);
  return s.length > len ? s.slice(0, len) + "…" : s;
}

function layerColor(status) {
  if (status === "native")    return GN;
  if (status === "partial")   return AM;
  if (status === "interface") return CY;
  return RD;
}

// ─── fetch helpers ────────────────────────────────────────────────────────────

async function fetchArch() {
  const r = await fetch(`${apiBase()}/v1/jarvis/architecture`, { headers: hdr() });
  if (!r.ok) throw new Error(`architecture ${r.status}`);
  return r.json();
}

async function fetchAudit() {
  const r = await fetch(`${apiBase()}/v1/jarvis/audit?limit=50`, { headers: hdr() });
  if (!r.ok) throw new Error(`audit ${r.status}`);
  return r.json();
}

async function fetchVerify() {
  const r = await fetch(`${apiBase()}/v1/jarvis/audit/verify`, { headers: hdr() });
  if (!r.ok) throw new Error(`audit/verify ${r.status}`);
  return r.json();
}

async function fetchMetrics() {
  const r = await fetch(`${apiBase()}/v1/jarvis/metrics`, { headers: hdr() });
  if (!r.ok) throw new Error(`metrics ${r.status}`);
  return r.json();
}

async function fetchApprovals() {
  const r = await fetch(`${apiBase()}/v1/jarvis/approvals`, { headers: hdr() });
  if (!r.ok) throw new Error(`approvals ${r.status}`);
  return r.json();
}

async function postDecide(id, approve, reason) {
  const r = await fetch(`${apiBase()}/v1/jarvis/approvals/${id}`, {
    method: "POST",
    headers: { ...hdr(), "Content-Type": "application/json" },
    body: JSON.stringify({ approve, decided_by: "operator", reason: reason || "" }),
  });
  if (!r.ok) throw new Error(`approvals/decide ${r.status}`);
  return r.json();
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StatTile({ label, value, color }) {
  return (
    <div
      style={{
        flex: 1,
        background: "rgba(41,231,255,0.04)",
        border: "1px solid rgba(41,231,255,0.10)",
        borderRadius: 6,
        padding: "8px 10px",
        minWidth: 60,
      }}
    >
      <div style={{ color, fontSize: 16, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      <div style={{ color: GRAY, fontSize: 9, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
    </div>
  );
}

function TabBtn({ label, active, count, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "rgba(41,231,255,0.12)" : "transparent",
        border: `1px solid ${active ? CY : "rgba(41,231,255,0.15)"}`,
        borderRadius: 4,
        color: active ? CY : GRAY,
        cursor: "pointer",
        fontSize: 10,
        fontFamily: "monospace",
        letterSpacing: "0.06em",
        padding: "3px 8px",
        display: "flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {label}
      {count != null && (
        <span
          style={{
            background: count > 0 ? `${AM}33` : `${DIM}55`,
            border: `1px solid ${count > 0 ? AM : DIM}`,
            borderRadius: 3,
            color: count > 0 ? AM : GRAY,
            fontSize: 9,
            padding: "0 3px",
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function ActionBtn({ label, onClick, disabled, color = CY }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: `${color}11`,
        border: `1px solid ${color}44`,
        borderRadius: 3,
        color: disabled ? GRAY : color,
        cursor: disabled ? "wait" : "pointer",
        flexShrink: 0,
        fontFamily: "monospace",
        fontSize: 9,
        padding: "2px 7px",
      }}
    >
      {label}
    </button>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function JarvisOsMonitor() {
  const [open, setOpen]         = useState(false);
  const [arch, setArch]         = useState(null);
  const [audit, setAudit]       = useState(null);
  const [verify, setVerify]     = useState(null);
  const [metrics, setMetrics]   = useState(null);
  const [approvals, setApprovals] = useState(null);
  const [tab, setTab]           = useState("ARCH");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState({});
  const [busy, setBusy]         = useState({});
  const [reasons, setReasons]   = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState("");
  const fastRef = useRef(null);
  const slowRef = useRef(null);

  const loadFast = useCallback(async () => {
    try {
      const [auditData, metricsData, approvalsData] = await Promise.all([
        fetchAudit(),
        fetchMetrics(),
        fetchApprovals(),
      ]);
      setAudit(auditData);
      setMetrics(metricsData);
      setApprovals(approvalsData);
    } catch {
      // preserve previous data
    }
  }, []);

  const loadSlow = useCallback(async () => {
    try {
      const [archData, verifyData] = await Promise.all([fetchArch(), fetchVerify()]);
      setArch(archData);
      setVerify(verifyData);
    } catch {
      // preserve previous data
    }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([loadFast(), loadSlow()]);
  }, [loadFast, loadSlow]);

  useEffect(() => {
    loadAll();
    fastRef.current = setInterval(loadFast, POLL_FAST);
    slowRef.current = setInterval(loadSlow, POLL_SLOW);
    return () => {
      clearInterval(fastRef.current);
      clearInterval(slowRef.current);
    };
  }, [loadAll, loadFast, loadSlow]);

  useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:josm-toggle", onToggle);
    return () => window.removeEventListener("jarvis:josm-toggle", onToggle);
  }, []);

  // ── derived values ────────────────────────────────────────────────────────
  const layers       = arch?.layers ?? [];
  const archSummary  = arch?.summary ?? {};
  const entries      = audit?.entries ?? [];
  const pendingApps  = (approvals?.approvals ?? []).filter((a) => a.status === "pending");
  const decidedApps  = (approvals?.approvals ?? []).filter((a) => a.status !== "pending");
  const chainIntact  = verify?.intact !== false;
  const spans        = metrics?.spans ?? 0;

  let badgeColor = GN;
  let badgeVal   = "OK";
  if (!chainIntact || pendingApps.length > 0) {
    badgeColor = RD;
    badgeVal   = pendingApps.length > 0 ? pendingApps.length : "!";
  } else if ((archSummary.partial || 0) > 0 || (archSummary.missing || 0) > 0) {
    badgeColor = AM;
    badgeVal   = (archSummary.partial || 0) + (archSummary.missing || 0);
  }

  const lc = search.toLowerCase();
  function matches(...strs) {
    return !lc || strs.some((s) => (s || "").toLowerCase().includes(lc));
  }

  function toggleExpand(key) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function markBusy(id, val) {
    setBusy((prev) => ({ ...prev, [id]: val }));
  }

  async function handleDecide(id, approve) {
    if (busy[id]) return;
    markBusy(id, true);
    try {
      await postDecide(id, approve, reasons[id] || "");
      await loadFast();
      setReasons((prev) => { const n = { ...prev }; delete n[id]; return n; });
    } catch {
      // silently ignore
    } finally {
      markBusy(id, false);
    }
  }

  async function assess() {
    setAssessing(true); setAssessText("");
    try {
      const script = await buildJosmScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...hdr(), "Content-Type": "application/json" },
        body: JSON.stringify({
          message:
            `Jarvis OS status: ${archSummary.native ?? 0}/${archSummary.total ?? 0} layers native, ` +
            `audit chain ${chainIntact ? "intact" : "BROKEN"}, ` +
            `${spans} spans, ${pendingApps.length} pending approval(s). ` +
            "Give a 2-sentence operational health brief.",
        }),
      });
      const d = await r.json();
      const text = d?.response || d?.message || script;
      setAssessText(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setAssessText("OS assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }

  // ── tab renderers ─────────────────────────────────────────────────────────

  function renderArchTab() {
    const filtered = layers.filter((l) =>
      matches(l.layer, l.key, l.note, l.status)
    );
    return (
      <div>
        {/* chain integrity chip */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <span
            style={{
              background: chainIntact ? `${GN}22` : `${RD}22`,
              border: `1px solid ${chainIntact ? GN : RD}55`,
              borderRadius: 3,
              color: chainIntact ? GN : RD,
              fontSize: 9,
              padding: "1px 6px",
            }}
          >
            {chainIntact ? `✓ CHAIN INTACT (${verify?.checked ?? 0} entries)` : `✗ CHAIN BROKEN at #${verify?.broken_at}`}
          </span>
          <span style={{ color: GRAY, fontSize: 9 }}>
            {archSummary.native ?? 0} native · {archSummary.partial ?? 0} partial · {archSummary.interface ?? 0} iface · {archSummary.missing ?? 0} missing
          </span>
        </div>

        {filtered.length === 0 && (
          <div style={{ color: GRAY, fontSize: 11, padding: "12px 0", textAlign: "center" }}>
            {lc ? "No matches." : "No architecture data."}
          </div>
        )}

        {filtered.map((l) => {
          const color = layerColor(l.status);
          const pct   = l.modules.length > 0 ? (l.present.length / l.modules.length) * 100 : 0;
          return (
            <div
              key={l.key}
              style={{ borderBottom: "1px solid rgba(41,231,255,0.06)", paddingBottom: 6, marginBottom: 4 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    background: `${color}22`,
                    border: `1px solid ${color}44`,
                    borderRadius: 3,
                    color,
                    flexShrink: 0,
                    fontSize: 9,
                    padding: "1px 5px",
                    minWidth: 56,
                    textAlign: "center",
                  }}
                >
                  {l.status.toUpperCase()}
                </span>
                <span style={{ color: "#8BAFC4", flex: 1, fontSize: 11 }}>{l.layer}</span>
                {l.modules.length > 0 && (
                  <span style={{ color: GRAY, fontSize: 9, flexShrink: 0 }}>
                    {l.present.length}/{l.modules.length}
                  </span>
                )}
              </div>
              {l.modules.length > 0 && (
                <div
                  style={{
                    background: "rgba(41,231,255,0.06)",
                    borderRadius: 2,
                    height: 3,
                    marginTop: 4,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      background: color,
                      borderRadius: 2,
                      height: "100%",
                      width: `${pct}%`,
                      transition: "width 0.4s",
                    }}
                  />
                </div>
              )}
              <div style={{ color: GRAY, fontSize: 9, marginTop: 3, lineHeight: 1.4 }}>
                {truncate(l.note, 90)}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderAuditTab() {
    const filtered = entries.filter((e) =>
      matches(e.actor, e.action, e.target, e.hash)
    );
    return (
      <div>
        {filtered.length === 0 && (
          <div style={{ color: GRAY, fontSize: 11, padding: "12px 0", textAlign: "center" }}>
            {lc ? "No matches." : "No audit entries yet."}
          </div>
        )}
        {filtered.map((e) => {
          const k = `audit-${e.id}`;
          const isExp = expanded[k];
          return (
            <div key={k} style={{ borderBottom: "1px solid rgba(41,231,255,0.06)" }}>
              <div
                onClick={() => toggleExpand(k)}
                style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "5px 0" }}
              >
                <span
                  style={{
                    background: "rgba(41,231,255,0.06)",
                    border: "1px solid rgba(41,231,255,0.15)",
                    borderRadius: 3,
                    color: CY,
                    flexShrink: 0,
                    fontSize: 9,
                    padding: "1px 4px",
                  }}
                >
                  #{e.id}
                </span>
                <span style={{ color: AM, fontSize: 10, flexShrink: 0 }}>{e.actor}</span>
                <span style={{ color: "#8BAFC4", flex: 1, fontSize: 10 }}>
                  {truncate(e.action, 40)}
                </span>
                <span style={{ color: GRAY, fontSize: 9, flexShrink: 0 }}>
                  {age(e.ts)}
                </span>
                <span style={{ color: GRAY, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div
                  style={{
                    background: "rgba(41,231,255,0.03)",
                    border: "1px solid rgba(41,231,255,0.08)",
                    borderRadius: 4,
                    color: GRAY,
                    fontSize: 9,
                    lineHeight: 1.5,
                    margin: "0 0 6px 12px",
                    padding: "5px 8px",
                  }}
                >
                  <div><span style={{ color: CY }}>action:</span> {e.action}</div>
                  {e.target && <div><span style={{ color: CY }}>target:</span> {e.target}</div>}
                  {e.hash && <div><span style={{ color: CY }}>hash:</span> {e.hash.slice(0, 16)}…</div>}
                  {e.meta && Object.keys(e.meta).length > 0 && (
                    <div><span style={{ color: CY }}>meta:</span> {truncate(JSON.stringify(e.meta), 80)}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function renderMetricsTab() {
    if (!metrics) return (
      <div style={{ color: GRAY, fontSize: 11, padding: "12px 0", textAlign: "center" }}>Loading…</div>
    );
    const byLayer = metrics.by_layer || {};
    const layerKeys = Object.keys(byLayer).filter((k) => matches(k));
    const maxCount = Math.max(1, ...Object.values(byLayer));
    return (
      <div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {[
            { label: "SPANS",      value: metrics.spans,                    color: CY },
            { label: "P50 ms",     value: metrics.p50_ms,                   color: GN },
            { label: "P95 ms",     value: metrics.p95_ms,                   color: AM },
            { label: "COST $",     value: (metrics.total_cost ?? 0).toFixed(4), color: PU },
            { label: "ERR RATE",   value: `${((metrics.error_rate ?? 0) * 100).toFixed(1)}%`,
                                          color: (metrics.error_rate ?? 0) > 0.05 ? RD : GN },
          ].map((t) => (
            <div
              key={t.label}
              style={{
                background: "rgba(41,231,255,0.04)",
                border: "1px solid rgba(41,231,255,0.10)",
                borderRadius: 6,
                padding: "6px 10px",
                minWidth: 56,
              }}
            >
              <div style={{ color: t.color, fontSize: 14, fontWeight: 700 }}>{t.value}</div>
              <div style={{ color: GRAY, fontSize: 8, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {t.label}
              </div>
            </div>
          ))}
        </div>

        {layerKeys.length > 0 && (
          <div>
            <div style={{ color: GRAY, fontSize: 9, letterSpacing: "0.06em", marginBottom: 4, textTransform: "uppercase" }}>
              By Layer
            </div>
            {layerKeys.map((k) => (
              <div key={k} style={{ marginBottom: 5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ color: "#8BAFC4", fontSize: 10 }}>{k}</span>
                  <span style={{ color: GRAY, fontSize: 9 }}>{byLayer[k]}</span>
                </div>
                <div style={{ background: "rgba(41,231,255,0.06)", borderRadius: 2, height: 4, overflow: "hidden" }}>
                  <div
                    style={{
                      background: CY,
                      borderRadius: 2,
                      height: "100%",
                      width: `${(byLayer[k] / maxCount) * 100}%`,
                      transition: "width 0.4s",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {layerKeys.length === 0 && lc && (
          <div style={{ color: GRAY, fontSize: 11, textAlign: "center", padding: "8px 0" }}>No matches.</div>
        )}

        {layerKeys.length === 0 && !lc && (
          <div style={{ color: GRAY, fontSize: 11, textAlign: "center", padding: "8px 0" }}>No layer data yet.</div>
        )}
      </div>
    );
  }

  function renderApprovalsTab() {
    const filtered = [...pendingApps, ...decidedApps].filter((a) =>
      matches(a.action, a.role, a.actor, a.status, a.decided_by)
    );
    return (
      <div>
        {filtered.length === 0 && (
          <div style={{ color: GRAY, fontSize: 11, padding: "12px 0", textAlign: "center" }}>
            {lc ? "No matches." : "No approval gates."}
          </div>
        )}
        {filtered.map((a) => {
          const isPending = a.status === "pending";
          const statusColor = isPending ? AM : a.status === "approved" ? GN : RD;
          const k = `app-${a.id}`;
          const isExp = expanded[k];
          return (
            <div key={k} style={{ borderBottom: "1px solid rgba(41,231,255,0.06)" }}>
              <div
                onClick={() => isPending ? null : toggleExpand(k)}
                style={{ cursor: isPending ? "default" : "pointer", display: "flex", alignItems: "center", gap: 6, padding: "5px 0" }}
              >
                <span
                  style={{
                    background: `${statusColor}22`,
                    border: `1px solid ${statusColor}44`,
                    borderRadius: 3,
                    color: statusColor,
                    flexShrink: 0,
                    fontSize: 9,
                    padding: "1px 5px",
                  }}
                >
                  {a.status.toUpperCase()}
                </span>
                <span style={{ color: "#8BAFC4", flex: 1, fontSize: 10 }}>
                  {truncate(a.action, 60)}
                </span>
                <span style={{ color: GRAY, fontSize: 9, flexShrink: 0 }}>{age(a.ts)}</span>
                {!isPending && (
                  <span style={{ color: GRAY, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                )}
              </div>

              {isPending && (
                <div
                  style={{
                    background: "rgba(41,231,255,0.03)",
                    border: "1px solid rgba(41,231,255,0.08)",
                    borderRadius: 4,
                    margin: "0 0 6px 12px",
                    padding: "5px 8px",
                  }}
                >
                  <div style={{ color: GRAY, fontSize: 9, marginBottom: 4 }}>
                    actor: <span style={{ color: CY }}>{a.actor}</span> · role: <span style={{ color: PU }}>{a.role}</span>
                  </div>
                  <input
                    value={reasons[a.id] || ""}
                    onChange={(e) => setReasons((prev) => ({ ...prev, [a.id]: e.target.value }))}
                    placeholder="reason (optional)…"
                    style={{
                      background: "rgba(41,231,255,0.05)",
                      border: "1px solid rgba(41,231,255,0.12)",
                      borderRadius: 3,
                      color: CY,
                      fontFamily: "monospace",
                      fontSize: 9,
                      marginBottom: 5,
                      outline: "none",
                      padding: "3px 6px",
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  />
                  <div style={{ display: "flex", gap: 5 }}>
                    <ActionBtn
                      label={busy[a.id] ? "…" : "✓ APPROVE"}
                      onClick={() => handleDecide(a.id, true)}
                      disabled={busy[a.id]}
                      color={GN}
                    />
                    <ActionBtn
                      label={busy[a.id] ? "…" : "✗ DENY"}
                      onClick={() => handleDecide(a.id, false)}
                      disabled={busy[a.id]}
                      color={RD}
                    />
                  </div>
                </div>
              )}

              {!isPending && isExp && (
                <div
                  style={{
                    background: "rgba(41,231,255,0.03)",
                    border: "1px solid rgba(41,231,255,0.08)",
                    borderRadius: 4,
                    color: GRAY,
                    fontSize: 9,
                    lineHeight: 1.5,
                    margin: "0 0 6px 12px",
                    padding: "5px 8px",
                  }}
                >
                  <div>actor: <span style={{ color: CY }}>{a.actor}</span> · role: <span style={{ color: PU }}>{a.role}</span></div>
                  {a.decided_by && <div>decided by: <span style={{ color: GN }}>{a.decided_by}</span> · {age(a.decided_ts)}</div>}
                  {a.reason && <div>reason: {truncate(a.reason, 80)}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  const tabContent = {
    ARCH:      renderArchTab,
    AUDIT:     renderAuditTab,
    METRICS:   renderMetricsTab,
    APPROVALS: renderApprovalsTab,
  };

  return (
    <>
      {/* ── dock button ─────────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Jarvis OS Monitor"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: 156,
          background: open ? "rgba(41,231,255,0.15)" : "rgba(10,18,26,0.85)",
          border: `1px solid ${open ? CY : "rgba(41,231,255,0.25)"}`,
          borderRadius: 5,
          color: open ? CY : "#8BAFC4",
          cursor: "pointer",
          fontFamily: "monospace",
          fontSize: 10,
          letterSpacing: "0.06em",
          padding: "4px 8px",
          display: "flex",
          alignItems: "center",
          gap: 5,
          userSelect: "none",
          whiteSpace: "nowrap",
        }}
      >
        <span>◈</span>
        <span>JOSM</span>
        <span
          style={{
            background: badgeColor,
            borderRadius: 3,
            color: "#0A121A",
            fontSize: 9,
            fontWeight: 700,
            minWidth: 24,
            padding: "0 3px",
            textAlign: "center",
          }}
        >
          {badgeVal}
        </span>
      </button>

      {/* ── panel ───────────────────────────────────────────────────────────── */}
      {open && (
        <div
          style={{
            position: "fixed",
            left: BTN_LEFT - 400,
            bottom: 44,
            zIndex: 156,
            width: 460,
            maxHeight: 600,
            background: "rgba(8,16,24,0.97)",
            border: "1px solid rgba(41,231,255,0.22)",
            borderRadius: 8,
            boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
            display: "flex",
            flexDirection: "column",
            fontFamily: "monospace",
            overflow: "hidden",
          }}
        >
          {/* header */}
          <div
            style={{
              borderBottom: "1px solid rgba(41,231,255,0.12)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
            }}
          >
            <span style={{ color: CY, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", flex: 1 }}>
              ◈ JARVIS OS MONITOR
            </span>
            {pendingApps.length > 0 && (
              <span
                style={{
                  background: `${RD}22`,
                  border: `1px solid ${RD}55`,
                  borderRadius: 3,
                  color: RD,
                  fontSize: 9,
                  padding: "1px 5px",
                }}
              >
                {pendingApps.length} pending
              </span>
            )}
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: GRAY, cursor: "pointer", fontSize: 13 }}
            >
              ✕
            </button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 6, padding: "8px 12px 4px" }}>
            <StatTile
              label="Native Layers"
              value={`${archSummary.native ?? "—"}/${archSummary.total ?? "—"}`}
              color={(archSummary.native ?? 0) === (archSummary.total ?? 0) ? GN : AM}
            />
            <StatTile
              label="Audit Entries"
              value={entries.length}
              color={chainIntact ? CY : RD}
            />
            <StatTile
              label="Total Spans"
              value={spans}
              color={PU}
            />
            <StatTile
              label="Pending Gates"
              value={pendingApps.length}
              color={pendingApps.length > 0 ? RD : GN}
            />
          </div>

          {/* tab bar + search */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 12px", flexWrap: "wrap" }}>
            <TabBtn label="ARCH"      active={tab === "ARCH"}      count={layers.length || null}     onClick={() => { setTab("ARCH");      setSearch(""); }} />
            <TabBtn label="AUDIT"     active={tab === "AUDIT"}     count={entries.length || null}    onClick={() => { setTab("AUDIT");     setSearch(""); }} />
            <TabBtn label="METRICS"   active={tab === "METRICS"}                                     onClick={() => { setTab("METRICS");   setSearch(""); }} />
            <TabBtn label="APPROVALS" active={tab === "APPROVALS"} count={pendingApps.length || null} onClick={() => { setTab("APPROVALS"); setSearch(""); }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                background: "rgba(41,231,255,0.05)",
                border: "1px solid rgba(41,231,255,0.12)",
                borderRadius: 4,
                color: CY,
                flex: 1,
                fontFamily: "monospace",
                fontSize: 10,
                marginLeft: 4,
                minWidth: 70,
                outline: "none",
                padding: "3px 6px",
              }}
            />
          </div>

          {/* body */}
          <div style={{ flex: 1, overflow: "auto", padding: "4px 12px 8px" }}>
            {arch === null && tab === "ARCH" && (
              <div style={{ color: GRAY, fontSize: 11, padding: "12px 0", textAlign: "center" }}>Loading…</div>
            )}
            {audit === null && tab === "AUDIT" && (
              <div style={{ color: GRAY, fontSize: 11, padding: "12px 0", textAlign: "center" }}>Loading…</div>
            )}
            {tabContent[tab]?.()}
          </div>

          {/* assess footer */}
          <div
            style={{
              borderTop: "1px solid rgba(41,231,255,0.10)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              padding: "6px 12px 8px",
            }}
          >
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                alignSelf: "flex-start",
                background: "rgba(41,231,255,0.08)",
                border: `1px solid ${CY}44`,
                borderRadius: 4,
                color: CY,
                cursor: assessing ? "wait" : "pointer",
                fontFamily: "monospace",
                fontSize: 10,
                padding: "3px 10px",
              }}
            >
              {assessing ? "Assessing…" : "▶ ASSESS"}
            </button>
            {assessText && (
              <div
                style={{
                  background: "rgba(41,231,255,0.04)",
                  border: "1px solid rgba(41,231,255,0.10)",
                  borderRadius: 4,
                  color: "#8BAFC4",
                  fontSize: 10,
                  lineHeight: 1.5,
                  padding: "5px 8px",
                }}
              >
                {assessText}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
