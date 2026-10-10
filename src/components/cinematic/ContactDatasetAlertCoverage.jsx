/**
 * F277 — Contact × Dataset × Ops Alert Response Coverage Matrix (CDOACOV)
 *
 * Parallel-fetches /entities/Contact, /v1/datasets, /v1/ops/alerts;
 * keyword-correlates each contact (name/role/org/tags) against datasets AND alerts to classify:
 *   FULLY_COVERED  — matched by ≥1 dataset AND ≥1 alert
 *   DATASET_LINKED — dataset match only
 *   ALERT_LINKED   — alert match only
 *   UNTRACKED      — no match (response coverage gap)
 *
 * Stat tiles: CONTACTS / DATASETS / ALERTS / FULLY COV. / DATASET / ALERT / UNTRACKED / COV%
 * Filter tabs: ALL | FULLY_COVERED | DATASET_LINKED | ALERT_LINKED | UNTRACKED
 * Expand any contact → matched dataset cards (purple) + alert cards (orange) with relevance bars
 * ▶ ASSESS COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *
 * Toggle:  ◈ CDOACOV  left:1111280, bottom:8, zIndex:700
 * Voice:   "cdoacov / contact dataset alert / contact coverage / contact response coverage /
 *           untracked contact response / personnel alert coverage"
 * Event:   jarvis:cdoacov-toggle
 * Refresh: 90-s auto-poll
 */
import { useCallback, useEffect, useRef, useState } from "react";

const BTN_LEFT = 1111280;
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

const CDOACOV_RE =
  /\b(cdoacov|contact\s+dataset\s+alert|contact\s+coverage|contact\s+response\s+coverage|untracked\s+contact\s+response|personnel\s+alert\s+coverage)\b/i;

export function isCdoacovQuery(q) { return CDOACOV_RE.test(q); }

export async function buildCdoacovScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [cRes, dRes, aRes] = await Promise.all([
      fetch(`${base}/entities/Contact`,  { headers: hdr }),
      fetch(`${base}/v1/datasets`,       { headers: hdr }),
      fetch(`${base}/v1/ops/alerts`,     { headers: hdr }),
    ]);
    const cRaw = await cRes.json();
    const dRaw = await dRes.json();
    const aRaw = await aRes.json();

    const contacts  = normaliseContacts(cRaw);
    const datasets  = normaliseDatasets(dRaw);
    const alerts    = normaliseAlerts(aRaw);
    const corr      = buildCorrelated(contacts, datasets, alerts);

    const fully    = corr.filter(c => c.cls === "FULLY_COVERED").length;
    const dsOnly   = corr.filter(c => c.cls === "DATASET_LINKED").length;
    const altOnly  = corr.filter(c => c.cls === "ALERT_LINKED").length;
    const unt      = corr.filter(c => c.cls === "UNTRACKED").length;
    const pct      = contacts.length ? Math.round((fully / contacts.length) * 100) : 0;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS contact dataset-alert coverage matrix (CDOACOV): ${contacts.length} contacts cross-referenced ` +
          `against ${datasets.length} datasets and ${alerts.length} ops alerts. ` +
          `FULLY_COVERED: ${fully}, DATASET_LINKED: ${dsOnly}, ALERT_LINKED: ${altOnly}, UNTRACKED (gap): ${unt}. ` +
          `Full coverage: ${pct}%. Give a 2-sentence personnel response coverage brief — formal British butler tone, first person.`,
      }),
    });
    if (!r.ok) throw new Error("agent chat failed");
    const j = await r.json();
    return j.response || j.message || j.content || "";
  } catch {
    return "CDOACOV online, sir. Assessing contact response coverage across datasets and operational alerts.";
  }
}

// ── normalisation ─────────────────────────────────────────────────────────────

function normaliseContacts(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.items) ? raw.items
    : Array.isArray(raw?.data)  ? raw.data
    : [];
  return arr.map(c => ({
    id:   c.id || c._id || String(Math.random()),
    name: c.name || c.full_name || c.contact_name || "Unnamed Contact",
    role: c.role || c.title || c.position || "",
    org:  c.org || c.organization || c.company || "",
    desc: `${c.name || ""} ${c.full_name || ""} ${c.role || ""} ${c.org || ""} ${c.organization || ""} ${c.tags?.join(" ") || ""}`.toLowerCase(),
  }));
}

function normaliseDatasets(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.items) ? raw.items
    : Array.isArray(raw?.data)  ? raw.data
    : Array.isArray(raw?.datasets) ? raw.datasets
    : [];
  return arr.map(d => ({
    id:   d.id || d._id || String(Math.random()),
    name: d.name || d.title || d.dataset_name || "Unnamed Dataset",
    type: d.type || d.dataset_type || "",
    desc: `${d.name || ""} ${d.description || ""} ${d.type || ""} ${d.tags?.join(" ") || ""}`.toLowerCase(),
  }));
}

function normaliseAlerts(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.items) ? raw.items
    : Array.isArray(raw?.data)  ? raw.data
    : Array.isArray(raw?.alerts) ? raw.alerts
    : [];
  return arr.map(a => ({
    id:       a.id || a._id || String(Math.random()),
    name:     a.name || a.title || a.alert_name || a.message || "Unnamed Alert",
    severity: a.severity || a.level || a.priority || "MEDIUM",
    type:     a.type || a.alert_type || "",
    desc: `${a.name || ""} ${a.title || ""} ${a.message || ""} ${a.description || ""} ${a.type || ""} ${a.tags?.join(" ") || ""}`.toLowerCase(),
  }));
}

function tokenize(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(t => t.length > 2);
}

function relevance(tokens, desc) {
  const hits = tokens.filter(t => desc.includes(t)).length;
  return tokens.length ? Math.round((hits / tokens.length) * 100) : 0;
}

function buildCorrelated(contacts, datasets, alerts) {
  return contacts.map(con => {
    const tokens   = tokenize(con.desc);
    const mDatasets = datasets
      .map(d => ({ ...d, rel: relevance(tokens, d.desc) }))
      .filter(d => d.rel > 0)
      .sort((a, b) => b.rel - a.rel)
      .slice(0, 5);
    const mAlerts = alerts
      .map(a => ({ ...a, rel: relevance(tokens, a.desc) }))
      .filter(a => a.rel > 0)
      .sort((a, b) => b.rel - a.rel)
      .slice(0, 5);
    const hasDs  = mDatasets.length > 0;
    const hasAlt = mAlerts.length > 0;
    let cls;
    if (hasDs && hasAlt)       cls = "FULLY_COVERED";
    else if (hasDs)            cls = "DATASET_LINKED";
    else if (hasAlt)           cls = "ALERT_LINKED";
    else                       cls = "UNTRACKED";
    return { ...con, cls, mDatasets, mAlerts };
  });
}

function sevColor(s) {
  const sl = (s || "").toLowerCase();
  if (sl === "critical") return "#ef4444";
  if (sl === "high")     return "#f97316";
  if (sl === "medium")   return "#eab308";
  return "#6b7280";
}

// ── component ─────────────────────────────────────────────────────────────────
export default function ContactDatasetAlertCoverage() {
  const [open,      setOpen]      = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [contacts,  setContacts]  = useState([]);
  const [datasets,  setDatasets]  = useState([]);
  const [alerts,    setAlerts]    = useState([]);
  const [corr,      setCorr]      = useState([]);
  const [expanded,  setExpanded]  = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [assess,    setAssess]    = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [cRes, dRes, aRes] = await Promise.all([
        fetch(`${base}/entities/Contact`,  { headers: hdr }),
        fetch(`${base}/v1/datasets`,       { headers: hdr }),
        fetch(`${base}/v1/ops/alerts`,     { headers: hdr }),
      ]);
      const cRaw = await cRes.json();
      const dRaw = await dRes.json();
      const aRaw = await aRes.json();
      const c = normaliseContacts(cRaw);
      const d = normaliseDatasets(dRaw);
      const a = normaliseAlerts(aRaw);
      setContacts(c); setDatasets(d); setAlerts(a);
      setCorr(buildCorrelated(c, d, a));
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
    window.addEventListener("jarvis:cdoacov-toggle", handler);
    return () => window.removeEventListener("jarvis:cdoacov-toggle", handler);
  }, []);

  const handleAssess = useCallback(async () => {
    setAssessing(true); setAssess("");
    const script = await buildCdoacovScript();
    setAssess(script);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
  }, []);

  const fully   = corr.filter(c => c.cls === "FULLY_COVERED").length;
  const dsOnly  = corr.filter(c => c.cls === "DATASET_LINKED").length;
  const altOnly = corr.filter(c => c.cls === "ALERT_LINKED").length;
  const unt     = corr.filter(c => c.cls === "UNTRACKED").length;
  const pct     = contacts.length ? Math.round((fully / contacts.length) * 100) : 0;

  const TABS = ["ALL", "FULLY_COVERED", "DATASET_LINKED", "ALERT_LINKED", "UNTRACKED"];

  const visible = corr.filter(c => {
    const matchTab    = tab === "ALL" || c.cls === tab;
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  const clsColor = cls => ({
    FULLY_COVERED:  "#22c55e",
    DATASET_LINKED: "#a855f7",
    ALERT_LINKED:   "#f97316",
    UNTRACKED:      "#ef4444",
  }[cls] || "#6b7280");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 700,
          background: "rgba(0,0,0,0.7)", border: "1px solid #22c55e",
          color: "#22c55e", padding: "4px 10px", fontSize: 11,
          borderRadius: 4, cursor: "pointer", fontFamily: "monospace",
          whiteSpace: "nowrap",
        }}
      >
        ◈ CDOACOV {unt > 0 && <span style={{ color: "#ef4444", marginLeft: 4 }}>● {unt}</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", right: 20, top: 60, width: 720, maxHeight: "85vh",
      background: "rgba(0,4,12,0.97)", border: "1px solid #22c55e",
      borderRadius: 8, zIndex: 9999, display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: "#e2e8f0", overflow: "hidden",
    }}>
      {/* header */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #1e3a5f", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#22c55e", fontWeight: 700, fontSize: 13 }}>
          ◈ CDOACOV — Contact Dataset-Alert Coverage Matrix
        </span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>

      {/* primary stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, padding: "10px 14px 6px" }}>
        {[
          { label: "CONTACTS",  val: contacts.length,  col: "#22c55e" },
          { label: "DATASETS",  val: datasets.length,  col: "#a855f7" },
          { label: "ALERTS",    val: alerts.length,    col: "#f97316" },
          { label: "COV%",      val: `${pct}%`,        col: pct >= 70 ? "#22c55e" : pct >= 40 ? "#eab308" : "#ef4444" },
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
          { label: "FULLY COV.",    val: fully,   col: "#22c55e" },
          { label: "DATASET LINK",  val: dsOnly,  col: "#a855f7" },
          { label: "ALERT LINK",    val: altOnly, col: "#f97316" },
          { label: "UNTRACKED",     val: unt,     col: "#ef4444" },
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
            background: tab === t ? "#22c55e" : "rgba(255,255,255,0.05)",
            color: tab === t ? "#000" : "#94a3b8", border: "none",
            borderRadius: 4, padding: "3px 8px", fontSize: 10, cursor: "pointer",
          }}>
            {t.replace(/_/g, " ")}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search contacts…"
          style={{
            marginLeft: "auto", background: "rgba(255,255,255,0.06)", border: "1px solid #334155",
            color: "#e2e8f0", borderRadius: 4, padding: "3px 8px", fontSize: 11, width: 160,
          }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 10px" }}>
        {loading && <div style={{ color: "#64748b", textAlign: "center", padding: 20, fontSize: 12 }}>Loading…</div>}
        {!loading && visible.length === 0 && (
          <div style={{ color: "#64748b", textAlign: "center", padding: 20, fontSize: 12 }}>No contacts match.</div>
        )}
        {visible.map(con => (
          <div key={con.id} style={{ marginBottom: 6 }}>
            <div
              onClick={() => setExpanded(expanded === con.id ? null : con.id)}
              style={{
                background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "8px 12px",
                cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
                border: `1px solid ${con.cls === "UNTRACKED" ? "rgba(239,68,68,0.3)" : "transparent"}`,
              }}
            >
              <div>
                <span style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 600 }}>{con.name}</span>
                {con.role && <span style={{ color: "#64748b", fontSize: 10, marginLeft: 6 }}>{con.role}</span>}
                {con.org  && <span style={{ color: "#64748b", fontSize: 10, marginLeft: 6 }}>· {con.org}</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  background: `${clsColor(con.cls)}22`, color: clsColor(con.cls),
                  borderRadius: 4, padding: "2px 7px", fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
                }}>
                  {con.cls.replace(/_/g, " ")}
                </span>
                <span style={{ color: "#475569", fontSize: 11 }}>{expanded === con.id ? "▲" : "▼"}</span>
              </div>
            </div>

            {expanded === con.id && (
              <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: "0 0 6px 6px", padding: "8px 12px", marginTop: 1 }}>
                {/* datasets */}
                {con.mDatasets.length > 0 && (
                  <>
                    <div style={{ color: "#a855f7", fontSize: 10, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>DATASETS ({con.mDatasets.length})</div>
                    {con.mDatasets.map(d => (
                      <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                        <span style={{ color: "#c4b5fd", fontSize: 11, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                        {d.type && <span style={{ background: "#a855f722", color: "#c4b5fd", borderRadius: 3, padding: "1px 5px", fontSize: 9 }}>{d.type}</span>}
                        <div style={{ width: 80, height: 4, background: "#1e293b", borderRadius: 2, flexShrink: 0 }}>
                          <div style={{ width: `${d.rel}%`, height: "100%", background: "#a855f7", borderRadius: 2 }} />
                        </div>
                        <span style={{ color: "#64748b", fontSize: 9, width: 28, textAlign: "right" }}>{d.rel}%</span>
                      </div>
                    ))}
                  </>
                )}
                {/* alerts */}
                {con.mAlerts.length > 0 && (
                  <>
                    <div style={{ color: "#f97316", fontSize: 10, fontWeight: 700, margin: "8px 0 4px", letterSpacing: 1 }}>ALERTS ({con.mAlerts.length})</div>
                    {con.mAlerts.map(a => (
                      <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                        <span style={{ color: "#fdba74", fontSize: 11, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                        <span style={{ background: `${sevColor(a.severity)}22`, color: sevColor(a.severity), borderRadius: 3, padding: "1px 5px", fontSize: 9, fontWeight: 700 }}>{(a.severity || "MED").toUpperCase()}</span>
                        <div style={{ width: 80, height: 4, background: "#1e293b", borderRadius: 2, flexShrink: 0 }}>
                          <div style={{ width: `${a.rel}%`, height: "100%", background: "#f97316", borderRadius: 2 }} />
                        </div>
                        <span style={{ color: "#64748b", fontSize: 9, width: 28, textAlign: "right" }}>{a.rel}%</span>
                      </div>
                    ))}
                  </>
                )}
                {con.mDatasets.length === 0 && con.mAlerts.length === 0 && (
                  <div style={{ color: "#ef4444", fontSize: 11 }}>No dataset or alert links — contact untracked.</div>
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
            background: assessing ? "rgba(34,197,94,0.1)" : "rgba(34,197,94,0.15)",
            border: "1px solid #22c55e", color: "#22c55e",
            borderRadius: 4, padding: "5px 14px", fontSize: 11,
            cursor: assessing ? "default" : "pointer", fontFamily: "monospace",
          }}
        >
          {assessing ? "▶ assessing…" : "▶ ASSESS COVERAGE"}
        </button>
      </div>
    </div>
  );
}
