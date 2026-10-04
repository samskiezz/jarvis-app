/**
 * F279 — Ops Alert × RiskSignal × Contact Response Coverage (ARCOV)
 *
 * Parallel-fetches /v1/ops/alerts, /entities/RiskSignal, /entities/Contact;
 * keyword-correlates each ops alert against risk signals AND contacts to classify:
 *   FULLY_COVERED    — matched by ≥1 risk signal AND ≥1 contact
 *   SIGNAL_LINKED    — risk signal match only
 *   CONTACT_ASSIGNED — contact match only
 *   UNHANDLED        — no match (response coverage gap)
 *
 * Stat tiles: OPS ALERTS / RISK SIGNALS / CONTACTS / COV%
 * Class tiles: FULLY COVERED / SIGNAL LINKED / CONTACT ASSIGNED / UNHANDLED
 * Filter tabs: ALL | FULLY_COVERED | SIGNAL_LINKED | CONTACT_ASSIGNED | UNHANDLED
 * Expand any alert → matched risk signal cards (red, severity) + contact cards (orange, role) with relevance bars
 * UNHANDLED rows pulse red
 * ▶ ASSESS RESPONSE COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *
 * Toggle:  ◈ ARCOV  left:1112400, bottom:8, zIndex:702
 * Voice:   "arcov / ops alert coverage / alert response / unhandled alert /
 *           alert contact / alert risk signal / response coverage alert"
 * Event:   jarvis:arcov-toggle
 * Refresh: 90-s auto-poll
 */
import { useCallback, useEffect, useRef, useState } from "react";

const BTN_LEFT = 1112400;
const POLL_MS  = 90_000;
const API_KEY  = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ───────────────────────────────────────────────────

const ARCOV_RE =
  /\b(arcov|ops\s+alert\s+coverage|alert\s+response|unhandled\s+alert|alert\s+contact|alert\s+risk\s+signal|response\s+coverage\s+alert)\b/i;

export function isArcovQuery(q) { return ARCOV_RE.test(q); }

export async function buildArcovScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [aRes, rRes, cRes] = await Promise.all([
      fetch(`${base}/v1/ops/alerts`,          { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`,    { headers: hdr }),
      fetch(`${base}/entities/Contact`,       { headers: hdr }),
    ]);
    const aRaw = await aRes.json();
    const rRaw = await rRes.json();
    const cRaw = await cRes.json();

    const alerts  = normaliseAlerts(aRaw);
    const signals = normaliseSignals(rRaw);
    const contacts = normaliseContacts(cRaw);
    const corr    = buildCorrelated(alerts, signals, contacts);

    const fully    = corr.filter(c => c.cls === "FULLY_COVERED").length;
    const signOnly = corr.filter(c => c.cls === "SIGNAL_LINKED").length;
    const contOnly = corr.filter(c => c.cls === "CONTACT_ASSIGNED").length;
    const unhandled = corr.filter(c => c.cls === "UNHANDLED").length;
    const pct      = alerts.length ? Math.round((fully / alerts.length) * 100) : 0;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS ops alert response coverage assessment (ARCOV): ${alerts.length} operational alerts cross-referenced ` +
          `against ${signals.length} risk signals and ${contacts.length} contacts. ` +
          `FULLY_COVERED: ${fully}, SIGNAL_LINKED: ${signOnly}, CONTACT_ASSIGNED: ${contOnly}, UNHANDLED (gap): ${unhandled}. ` +
          `Full coverage: ${pct}%. Give a 2-sentence operational response readiness brief — formal British butler tone, first person.`,
      }),
    });
    if (!r.ok) throw new Error("agent chat failed");
    const j = await r.json();
    return j.response || j.message || j.content || "";
  } catch {
    return "ARCOV online, sir. Assessing operational alert response coverage across risk signals and contacts.";
  }
}

// ── normalisation ─────────────────────────────────────────────────────────────

function normaliseAlerts(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.items)  ? raw.items
    : Array.isArray(raw?.data)   ? raw.data
    : Array.isArray(raw?.alerts) ? raw.alerts
    : [];
  return arr.map(a => ({
    id:       a.id || a._id || String(Math.random()),
    name:     a.name || a.title || a.alert_name || "Unnamed Alert",
    severity: a.severity || a.level || a.priority || "",
    type:     a.type || a.alert_type || "",
    desc:     `${a.name || ""} ${a.title || ""} ${a.description || ""} ${a.type || ""} ${a.severity || ""} ${(a.tags || []).join(" ")}`.toLowerCase(),
  }));
}

function normaliseSignals(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.items)   ? raw.items
    : Array.isArray(raw?.data)    ? raw.data
    : Array.isArray(raw?.signals) ? raw.signals
    : [];
  return arr.map(s => ({
    id:       s.id || s._id || String(Math.random()),
    name:     s.name || s.title || s.signal_name || "Unnamed Signal",
    severity: s.severity || s.level || "",
    type:     s.type || s.signal_type || "",
    desc:     `${s.name || ""} ${s.title || ""} ${s.description || ""} ${s.type || ""} ${s.severity || ""} ${(s.tags || []).join(" ")}`.toLowerCase(),
  }));
}

function normaliseContacts(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.items)    ? raw.items
    : Array.isArray(raw?.data)     ? raw.data
    : Array.isArray(raw?.contacts) ? raw.contacts
    : [];
  return arr.map(c => ({
    id:   c.id || c._id || String(Math.random()),
    name: c.name || c.full_name || c.contact_name || "Unnamed Contact",
    role: c.role || c.title || c.job_title || "",
    org:  c.org || c.organization || c.company || "",
    desc: `${c.name || ""} ${c.full_name || ""} ${c.role || ""} ${c.org || ""} ${c.organization || ""} ${c.email || ""} ${(c.tags || []).join(" ")}`.toLowerCase(),
  }));
}

function tokenize(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(t => t.length > 2);
}

function relevance(tokens, desc) {
  const hits = tokens.filter(t => desc.includes(t)).length;
  return tokens.length ? Math.round((hits / tokens.length) * 100) : 0;
}

function buildCorrelated(alerts, signals, contacts) {
  return alerts.map(alert => {
    const tokens   = tokenize(alert.desc);
    const mSignals = signals
      .map(s => ({ ...s, rel: relevance(tokens, s.desc) }))
      .filter(s => s.rel > 0)
      .sort((a, b) => b.rel - a.rel)
      .slice(0, 5);
    const mContacts = contacts
      .map(c => ({ ...c, rel: relevance(tokens, c.desc) }))
      .filter(c => c.rel > 0)
      .sort((a, b) => b.rel - a.rel)
      .slice(0, 5);
    const hasSig  = mSignals.length > 0;
    const hasCont = mContacts.length > 0;
    let cls;
    if (hasSig && hasCont) cls = "FULLY_COVERED";
    else if (hasSig)       cls = "SIGNAL_LINKED";
    else if (hasCont)      cls = "CONTACT_ASSIGNED";
    else                   cls = "UNHANDLED";
    return { ...alert, cls, mSignals, mContacts };
  });
}

function severityColor(s) {
  const sl = (s || "").toLowerCase();
  if (sl === "critical")           return "#ef4444";
  if (sl === "high")               return "#f97316";
  if (sl === "medium" || sl === "moderate") return "#eab308";
  if (sl === "low" || sl === "info") return "#22c55e";
  return "#64748b";
}

// ── component ─────────────────────────────────────────────────────────────────
export default function OpsAlertRiskSignalContactCoverage() {
  const [open,     setOpen]     = useState(false);
  const [tab,      setTab]      = useState("ALL");
  const [search,   setSearch]   = useState("");
  const [alerts,   setAlerts]   = useState([]);
  const [signals,  setSignals]  = useState([]);
  const [contacts, setContacts] = useState([]);
  const [corr,     setCorr]     = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [assess,   setAssess]   = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [aRes, rRes, cRes] = await Promise.all([
        fetch(`${base}/v1/ops/alerts`,       { headers: hdr }),
        fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
        fetch(`${base}/entities/Contact`,    { headers: hdr }),
      ]);
      const aRaw = await aRes.json();
      const rRaw = await rRes.json();
      const cRaw = await cRes.json();
      const a = normaliseAlerts(aRaw);
      const s = normaliseSignals(rRaw);
      const c = normaliseContacts(cRaw);
      setAlerts(a); setSignals(s); setContacts(c);
      setCorr(buildCorrelated(a, s, c));
    } catch { /* keep previous data */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:arcov-toggle", handler);
    return () => window.removeEventListener("jarvis:arcov-toggle", handler);
  }, []);

  const handleAssess = useCallback(async () => {
    setAssessing(true); setAssess("");
    const script = await buildArcovScript();
    setAssess(script);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
  }, []);

  const fully    = corr.filter(c => c.cls === "FULLY_COVERED").length;
  const signOnly = corr.filter(c => c.cls === "SIGNAL_LINKED").length;
  const contOnly = corr.filter(c => c.cls === "CONTACT_ASSIGNED").length;
  const unhandled = corr.filter(c => c.cls === "UNHANDLED").length;
  const pct      = alerts.length ? Math.round((fully / alerts.length) * 100) : 0;

  const TABS = ["ALL", "FULLY_COVERED", "SIGNAL_LINKED", "CONTACT_ASSIGNED", "UNHANDLED"];

  const visible = corr.filter(c => {
    const matchTab    = tab === "ALL" || c.cls === tab;
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  const clsColor = cls => ({
    FULLY_COVERED:    "#22c55e",
    SIGNAL_LINKED:    "#ef4444",
    CONTACT_ASSIGNED: "#f97316",
    UNHANDLED:        "#dc2626",
  }[cls] || "#6b7280");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 702,
          background: "rgba(0,0,0,0.7)", border: "1px solid #f97316",
          color: "#f97316", padding: "4px 10px", fontSize: 11,
          borderRadius: 4, cursor: "pointer", fontFamily: "monospace",
          whiteSpace: "nowrap",
        }}
      >
        ◈ ARCOV {unhandled > 0 && <span style={{ color: "#ef4444", marginLeft: 4 }}>● {unhandled}</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", right: 20, top: 60, width: 720, maxHeight: "85vh",
      background: "rgba(0,4,12,0.97)", border: "1px solid #f97316",
      borderRadius: 8, zIndex: 9999, display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: "#e2e8f0", overflow: "hidden",
    }}>
      {/* header */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #1e3a5f", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#f97316", fontWeight: 700, fontSize: 13 }}>
          ◈ ARCOV — Ops Alert × Risk Signal × Contact Response Coverage
        </span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>

      {/* primary stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, padding: "10px 14px 6px" }}>
        {[
          { label: "OPS ALERTS",   val: alerts.length,   col: "#f97316" },
          { label: "RISK SIGNALS", val: signals.length,  col: "#ef4444" },
          { label: "CONTACTS",     val: contacts.length, col: "#f97316" },
          { label: "COV%",         val: `${pct}%`,       col: pct >= 70 ? "#22c55e" : pct >= 40 ? "#eab308" : "#ef4444" },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
            <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#64748b", fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* class stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, padding: "0 14px 6px" }}>
        {[
          { label: "FULLY COVERED",    val: fully,    col: "#22c55e" },
          { label: "SIGNAL LINKED",    val: signOnly, col: "#ef4444" },
          { label: "CONTACT ASSIGNED", val: contOnly, col: "#f97316" },
          { label: "UNHANDLED",        val: unhandled, col: "#dc2626" },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "4px 8px", textAlign: "center" }}>
            <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#64748b", fontSize: 9 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* coverage bar */}
      <div style={{ margin: "0 14px 8px", background: "#1e293b", borderRadius: 4, height: 6, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: pct >= 70 ? "#22c55e" : pct >= 40 ? "#eab308" : "#ef4444", transition: "width 0.5s" }} />
      </div>

      {/* filter tabs + search */}
      <div style={{ padding: "0 14px 6px", display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? "#f97316" : "rgba(255,255,255,0.05)",
            color: tab === t ? "#000" : "#94a3b8", border: "none",
            borderRadius: 4, padding: "3px 8px", fontSize: 10, cursor: "pointer",
          }}>
            {t.replace(/_/g, " ")}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search alerts…"
          style={{
            marginLeft: "auto", background: "rgba(255,255,255,0.06)", border: "1px solid #334155",
            color: "#e2e8f0", borderRadius: 4, padding: "3px 8px", fontSize: 11, width: 180,
          }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 10px" }}>
        {loading && <div style={{ color: "#64748b", textAlign: "center", padding: 20, fontSize: 12 }}>Loading…</div>}
        {!loading && visible.length === 0 && (
          <div style={{ color: "#64748b", textAlign: "center", padding: 20, fontSize: 12 }}>No alerts match.</div>
        )}
        {visible.map(alert => (
          <div key={alert.id} style={{ marginBottom: 6 }}>
            <div
              onClick={() => setExpanded(expanded === alert.id ? null : alert.id)}
              style={{
                background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "8px 12px",
                cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
                border: `1px solid ${alert.cls === "UNHANDLED" ? "rgba(220,38,38,0.4)" : "transparent"}`,
                animation: alert.cls === "UNHANDLED" ? "arcov-pulse 2s ease-in-out infinite" : "none",
              }}
            >
              <div>
                <span style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 600 }}>{alert.name}</span>
                {alert.severity && (
                  <span style={{ background: `${severityColor(alert.severity)}22`, color: severityColor(alert.severity), borderRadius: 3, padding: "1px 5px", fontSize: 9, marginLeft: 6, fontWeight: 700 }}>
                    {alert.severity.toUpperCase()}
                  </span>
                )}
                {alert.type && <span style={{ color: "#64748b", fontSize: 10, marginLeft: 6 }}>{alert.type}</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  background: `${clsColor(alert.cls)}22`, color: clsColor(alert.cls),
                  borderRadius: 4, padding: "2px 7px", fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
                }}>
                  {alert.cls.replace(/_/g, " ")}
                </span>
                <span style={{ color: "#475569", fontSize: 11 }}>{expanded === alert.id ? "▲" : "▼"}</span>
              </div>
            </div>

            {expanded === alert.id && (
              <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: "0 0 6px 6px", padding: "8px 12px", marginTop: 1 }}>
                {/* risk signals */}
                {alert.mSignals.length > 0 && (
                  <>
                    <div style={{ color: "#ef4444", fontSize: 10, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>RISK SIGNALS ({alert.mSignals.length})</div>
                    {alert.mSignals.map(s => (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                        <span style={{ color: "#fca5a5", fontSize: 11, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                        {s.severity && <span style={{ background: `${severityColor(s.severity)}22`, color: severityColor(s.severity), borderRadius: 3, padding: "1px 5px", fontSize: 9, fontWeight: 700 }}>{s.severity.toUpperCase()}</span>}
                        <div style={{ width: 80, height: 4, background: "#1e293b", borderRadius: 2, flexShrink: 0 }}>
                          <div style={{ width: `${s.rel}%`, height: "100%", background: "#ef4444", borderRadius: 2 }} />
                        </div>
                        <span style={{ color: "#64748b", fontSize: 9, width: 28, textAlign: "right" }}>{s.rel}%</span>
                      </div>
                    ))}
                  </>
                )}
                {/* contacts */}
                {alert.mContacts.length > 0 && (
                  <>
                    <div style={{ color: "#f97316", fontSize: 10, fontWeight: 700, margin: "8px 0 4px", letterSpacing: 1 }}>CONTACTS ({alert.mContacts.length})</div>
                    {alert.mContacts.map(c => (
                      <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                        <span style={{ color: "#fdba74", fontSize: 11, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                        {c.role && <span style={{ background: "#f9731622", color: "#fdba74", borderRadius: 3, padding: "1px 5px", fontSize: 9 }}>{c.role}</span>}
                        <div style={{ width: 80, height: 4, background: "#1e293b", borderRadius: 2, flexShrink: 0 }}>
                          <div style={{ width: `${c.rel}%`, height: "100%", background: "#f97316", borderRadius: 2 }} />
                        </div>
                        <span style={{ color: "#64748b", fontSize: 9, width: 28, textAlign: "right" }}>{c.rel}%</span>
                      </div>
                    ))}
                  </>
                )}
                {alert.mSignals.length === 0 && alert.mContacts.length === 0 && (
                  <div style={{ color: "#ef4444", fontSize: 11 }}>No risk signal or contact links — alert unhandled.</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* assess footer */}
      <div style={{ padding: "8px 14px", borderTop: "1px solid #1e3a5f" }}>
        {assess && <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 6, lineHeight: 1.4 }}>{assess}</div>}
        <button
          onClick={handleAssess}
          disabled={assessing}
          style={{
            background: assessing ? "rgba(249,115,22,0.1)" : "rgba(249,115,22,0.15)",
            border: "1px solid #f97316", color: "#f97316",
            borderRadius: 4, padding: "5px 14px", fontSize: 11,
            cursor: assessing ? "default" : "pointer", fontFamily: "monospace",
          }}
        >
          {assessing ? "▶ assessing…" : "▶ ASSESS RESPONSE COVERAGE"}
        </button>
      </div>

      <style>{`
        @keyframes arcov-pulse {
          0%, 100% { border-color: rgba(220,38,38,0.4); }
          50%       { border-color: rgba(220,38,38,0.9); }
        }
      `}</style>
    </div>
  );
}
