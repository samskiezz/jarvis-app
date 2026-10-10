/**
 * F196 — Contact × Task × Report — Operator Accountability Audit (OPAC)
 *
 * Parallel-fetches /entities/Contact + /entities/Task + /v1/reports every 90 s.
 * Keyword-correlates each contact against the task catalog AND the report archive:
 *
 *   FULLY_ACCOUNTABLE — contact has matched open tasks AND documented reports
 *   TASK_ONLY         — contact has matched tasks but no report coverage
 *   REPORTED_ONLY     — contact appears in reports but has no assigned tasks
 *   UNACCOUNTED       — neither tasks nor reports reference this contact
 *
 * Stat tiles: contacts / tasks / reports / fully accountable / unaccounted
 * Filter tabs: ALL | FULLY_ACCOUNTABLE | TASK_ONLY | REPORTED_ONLY | UNACCOUNTED
 * Text search on contact name/role/organization/email.
 * Expand row → matched tasks (amber bars) + matched reports (cyan bars).
 * Red badge + pulse on UNACCOUNTED count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 *
 * Toggle:  ◈ OPAC  at bottom:8 left:988000, zIndex:697.
 * Event:   jarvis:opac-toggle
 * Voice:   "opac / operator accountability / contact accountability / operator audit / contact task report"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const BTN_LEFT = 988_000;
const POLL_MS  = 90_000;
const GREEN    = "#00FF88";
const AMBER    = "#FFB020";
const CY       = "#29E7FF";
const RED      = "#FF4545";
const MONO     = "'JetBrains Mono',monospace";

const API_KEY =
  (typeof window !== "undefined" && window.__JARVIS_API_KEY__) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function apiBase() {
  if (typeof window !== "undefined" && window.__JARVIS_API_BASE__) return window.__JARVIS_API_BASE__;
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    return `${window.location.protocol}//${window.location.hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── Exported intent helpers ───────────────────────────────────────────────────

const OPAC_RE =
  /\b(opac|operator\s+accountability|contact\s+accountability|operator\s+audit|contact\s+task\s+report|accountability\s+audit|operator\s+coverage)\b/i;

export function isOpacQuery(q) {
  return OPAC_RE.test(q || "");
}

function toArr(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  const keys = ["contacts","tasks","reports","items","data","results","records"];
  for (const k of keys) if (Array.isArray(v[k])) return v[k];
  return [];
}

function keywords(obj) {
  if (!obj) return [];
  const raw = [
    obj.name, obj.title, obj.type, obj.category,
    obj.description, obj.summary, obj.tags, obj.status,
    obj.email, obj.role, obj.organization, obj.id,
  ].filter(Boolean).join(" ").toLowerCase();
  return raw.split(/[\s,;|_/.-]+/).filter(w => w.length > 2);
}

function matchKws(kws, obj) {
  if (!kws.length) return false;
  const hay = [
    obj.name, obj.title, obj.type, obj.description, obj.summary,
    obj.tags, obj.status, obj.category, obj.label, obj.email,
    obj.role, obj.organization, obj.assignee, obj.owner,
  ].filter(Boolean).join(" ").toLowerCase();
  return kws.some(k => hay.includes(k));
}

export async function buildOpacScript() {
  const base = apiBase();
  const h = { Authorization: `Bearer ${API_KEY}` };
  try {
    const [ctR, tkR, rpR] = await Promise.allSettled([
      fetch(`${base}/entities/Contact`, { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/entities/Task`,    { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/v1/reports`,       { headers: h }).then(r => r.ok ? r.json() : []),
    ]);
    const contacts = toArr(ctR.value);
    const tasks    = toArr(tkR.value);
    const reports  = toArr(rpR.value);
    let unaccounted = 0;

    for (const ct of contacts) {
      const kws = keywords(ct);
      const hasTask   = tasks.some(t => matchKws(kws, t));
      const hasReport = reports.some(r => matchKws(kws, r));
      if (!hasTask && !hasReport) unaccounted++;
    }

    window.dispatchEvent(new CustomEvent("jarvis:opac-toggle"));
    return `OPAC analysis: ${contacts.length} contact${contacts.length !== 1 ? "s" : ""} audited against ` +
      `${tasks.length} task${tasks.length !== 1 ? "s" : ""} × ${reports.length} report${reports.length !== 1 ? "s" : ""}. ` +
      `${unaccounted} contact${unaccounted !== 1 ? "s are" : " is"} unaccounted — no task assignment or report documentation found. ` +
      `Recommend assigning open tasks and linking relevant reports to all unaccounted operators.`;
  } catch (e) {
    window.dispatchEvent(new CustomEvent("jarvis:opac-toggle"));
    return `OPAC panel open, sir. Error: ${e.message}`;
  }
}

// ── Classification helpers ────────────────────────────────────────────────────

const CLASS_COLOR = {
  FULLY_ACCOUNTABLE: GREEN,
  TASK_ONLY:         AMBER,
  REPORTED_ONLY:     CY,
  UNACCOUNTED:       RED,
};

function classify(ct, tasks, reports) {
  const kws = keywords(ct);
  const hasTask   = tasks.some(t => matchKws(kws, t));
  const hasReport = reports.some(r => matchKws(kws, r));
  if (hasTask && hasReport)  return "FULLY_ACCOUNTABLE";
  if (hasTask && !hasReport) return "TASK_ONLY";
  if (!hasTask && hasReport) return "REPORTED_ONLY";
  return "UNACCOUNTED";
}

function topMatches(kws, pool, n = 4) {
  return pool
    .map(obj => {
      const hay = [
        obj.name, obj.title, obj.type, obj.description, obj.summary,
        obj.tags, obj.status, obj.category, obj.label, obj.email,
        obj.role, obj.organization, obj.assignee, obj.owner,
      ].filter(Boolean).join(" ").toLowerCase();
      const score = kws.filter(k => hay.includes(k)).length;
      return { obj, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(x => x.obj);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ContactTaskReportAudit() {
  const [open,     setOpen]     = useState(false);
  const [rows,     setRows]     = useState([]);
  const [contacts, setContacts] = useState([]);
  const [tasks,    setTasks]    = useState([]);
  const [reports,  setReports]  = useState([]);
  const [filter,   setFilter]   = useState("ALL");
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing,setAssessing]= useState(null);
  const [assessTxt,setAssessTxt]= useState({});
  const [loading,  setLoading]  = useState(false);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const base = apiBase();
    const h = { Authorization: `Bearer ${API_KEY}` };
    try {
      const [ctR, tkR, rpR] = await Promise.allSettled([
        fetch(`${base}/entities/Contact`, { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/entities/Task`,    { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/v1/reports`,       { headers: h }).then(r => r.ok ? r.json() : []),
      ]);
      const cts  = toArr(ctR.value);
      const tks  = toArr(tkR.value);
      const rps  = toArr(rpR.value);
      setContacts(cts);
      setTasks(tks);
      setReports(rps);
      setRows(cts.map(ct => ({ ct, cls: classify(ct, tks, rps) })));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => {
      const next = !o;
      if (next) load();
      return next;
    });
    window.addEventListener("jarvis:opac-toggle", toggle);
    return () => window.removeEventListener("jarvis:opac-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (open) {
      pollRef.current = setInterval(load, POLL_MS);
    } else {
      clearInterval(pollRef.current);
    }
    return () => clearInterval(pollRef.current);
  }, [open, load]);

  const handleAssess = useCallback(async (ct) => {
    const key = ct.id || ct.name || ct.email || JSON.stringify(ct).slice(0, 32);
    setAssessing(key);
    try {
      const base = apiBase();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message: `Assess the task and report accountability for this contact: ${JSON.stringify(ct)}. ` +
            `Identify which open tasks they should own and which reports document their actions. Respond in 2 sentences.`,
        }),
      });
      const d = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssessTxt(prev => ({ ...prev, [key]: txt }));
      if (txt && window.speechSynthesis) {
        const u = new SpeechSynthesisUtterance(txt);
        u.rate = 1.0; u.pitch = 0.85;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      }
    } catch {
      setAssessTxt(prev => ({ ...prev, [key]: "Assessment unavailable." }));
    } finally {
      setAssessing(null);
    }
  }, []);

  const TABS = ["ALL", "FULLY_ACCOUNTABLE", "TASK_ONLY", "REPORTED_ONLY", "UNACCOUNTED"];
  const counts = Object.fromEntries(TABS.map(t => [t, t === "ALL" ? rows.length : rows.filter(r => r.cls === t).length]));
  const unaccountedCount = counts["UNACCOUNTED"] || 0;

  const filtered = rows.filter(({ ct, cls }) => {
    if (filter !== "ALL" && cls !== filter) return false;
    if (!search) return true;
    const hay = [ct.name, ct.email, ct.role, ct.organization, ct.title, ct.type]
      .filter(Boolean).join(" ").toLowerCase();
    return hay.includes(search.toLowerCase());
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Operator Accountability Audit (OPAC)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 697,
          fontFamily: MONO, fontSize: 9, letterSpacing: 1,
          background: "#0A1525E8", border: `1px solid ${RED}55`,
          color: RED, borderRadius: 4, padding: "3px 7px",
          cursor: "pointer", userSelect: "none",
          boxShadow: unaccountedCount > 0 ? `0 0 6px ${RED}66` : "none",
          animation: unaccountedCount > 0 ? "opac-pulse 2s ease-in-out infinite" : "none",
        }}
      >
        <style>{`@keyframes opac-pulse{0%,100%{opacity:1}50%{opacity:.55}}`}</style>
        ◈ OPAC{unaccountedCount > 0 ? ` [${unaccountedCount}]` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 8, left: BTN_LEFT - 460, zIndex: 697,
      width: 520, maxHeight: "74vh", display: "flex", flexDirection: "column",
      background: "#080F1CF2", border: `1px solid ${RED}44`,
      borderRadius: 8, fontFamily: MONO, fontSize: 11,
      boxShadow: `0 0 24px ${RED}22`,
      backdropFilter: "blur(12px)",
    }}>
      {/* header */}
      <div style={{
        padding: "8px 14px", borderBottom: `1px solid ${RED}28`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ color: RED, letterSpacing: 2, fontSize: 10 }}>
          ◈ OPERATOR ACCOUNTABILITY AUDIT
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {loading && <span style={{ color: "#3E5060", fontSize: 9 }}>LOADING…</span>}
          <button onClick={load} style={{ background: "none", border: `1px solid ${RED}33`, color: RED, borderRadius: 3, padding: "2px 6px", cursor: "pointer", fontSize: 9 }}>↻</button>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#3E5060", cursor: "pointer", fontSize: 13, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", flexWrap: "wrap" }}>
        {[
          { label: "CONTACTS",          val: contacts.length,                    color: GREEN },
          { label: "TASKS",             val: tasks.length,                       color: AMBER },
          { label: "REPORTS",           val: reports.length,                     color: CY   },
          { label: "FULLY ACCOUNTABLE", val: counts["FULLY_ACCOUNTABLE"] || 0,   color: GREEN },
          { label: "UNACCOUNTED",       val: unaccountedCount, color: RED, pulse: unaccountedCount > 0 },
        ].map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            flex: "1 1 80px", background: "#0B1420", border: `1px solid ${color}33`,
            borderRadius: 5, padding: "5px 8px", textAlign: "center",
            boxShadow: pulse ? `0 0 8px ${color}44` : "none",
          }}>
            <div style={{ color, fontSize: 14, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#2E4060", fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* search */}
      <div style={{ padding: "0 14px 6px" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search contacts…"
          style={{
            width: "100%", background: "#0B1420", border: `1px solid ${RED}33`,
            color: "#A0C0D0", borderRadius: 4, padding: "4px 8px",
            fontFamily: MONO, fontSize: 10, outline: "none", boxSizing: "border-box",
          }}
        />
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 14px 8px", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setFilter(t)} style={{
            fontFamily: MONO, fontSize: 8, letterSpacing: 1,
            background: filter === t ? `${CLASS_COLOR[t] || RED}22` : "transparent",
            border: `1px solid ${filter === t ? (CLASS_COLOR[t] || RED) : "#1E3040"}`,
            color: filter === t ? (CLASS_COLOR[t] || RED) : "#3E5060",
            borderRadius: 3, padding: "2px 6px", cursor: "pointer",
          }}>
            {t} ({counts[t] || 0})
          </button>
        ))}
      </div>

      {/* rows */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 14px 8px" }}>
        {filtered.length === 0 && (
          <div style={{ color: "#2E4060", fontSize: 10, textAlign: "center", padding: "16px 0" }}>
            {loading ? "Fetching operator contacts…" : "No contacts match filter."}
          </div>
        )}
        {filtered.map(({ ct, cls }, i) => {
          const key = ct.id || ct.email || ct.name || String(i);
          const kws = keywords(ct);
          const matchedTasks   = topMatches(kws, tasks, 4);
          const matchedReports = topMatches(kws, reports, 4);
          const clrC  = CLASS_COLOR[cls] || RED;
          const isExp = expanded === key;
          const aKey  = ct.id || ct.email || ct.name || key;

          return (
            <div key={key} style={{
              marginBottom: 5, borderRadius: 5,
              border: `1px solid ${isExp ? clrC + "55" : "#1A2A3A"}`,
              background: isExp ? "#0C1520" : "transparent",
            }}>
              <div
                onClick={() => setExpanded(isExp ? null : key)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 10px", cursor: "pointer",
                }}
              >
                <span style={{
                  fontSize: 8, letterSpacing: 1, color: clrC,
                  border: `1px solid ${clrC}55`, borderRadius: 3,
                  padding: "1px 5px", whiteSpace: "nowrap", flexShrink: 0,
                }}>
                  {cls}
                </span>
                <span style={{ color: "#A0C0D0", flex: 1, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {ct.name || ct.email || key}
                </span>
                {ct.role && (
                  <span style={{ color: "#2E4060", fontSize: 8, flexShrink: 0 }}>{ct.role}</span>
                )}
                <span style={{ color: "#2E4060", fontSize: 9 }}>{isExp ? "▴" : "▾"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "0 10px 10px", borderTop: `1px solid #1A2A3A` }}>
                  {/* task matches */}
                  <div style={{ color: "#3E5060", fontSize: 8, letterSpacing: 1, margin: "6px 0 4px" }}>
                    TASKS ({matchedTasks.length})
                  </div>
                  {matchedTasks.length > 0 ? matchedTasks.map((t, ti) => (
                    <div key={ti} style={{ marginBottom: 3 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9 }}>
                        <span style={{ color: AMBER, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "75%" }}>
                          {t.title || t.name || `task-${ti + 1}`}
                        </span>
                        <span style={{ color: "#2E4060", fontSize: 8, flexShrink: 0 }}>{t.status || t.type || ""}</span>
                      </div>
                      <div style={{ height: 3, background: "#0B1420", borderRadius: 2, marginTop: 2 }}>
                        <div style={{ height: "100%", width: `${Math.min(100, 40 + (kws.filter(k => JSON.stringify(t).toLowerCase().includes(k)).length * 15))}%`, background: AMBER, borderRadius: 2 }} />
                      </div>
                    </div>
                  )) : (
                    <div style={{ color: "#2E4060", fontSize: 9, marginBottom: 4 }}>No task matches.</div>
                  )}

                  {/* report matches */}
                  <div style={{ color: "#3E5060", fontSize: 8, letterSpacing: 1, margin: "6px 0 4px" }}>
                    REPORTS ({matchedReports.length})
                  </div>
                  {matchedReports.length > 0 ? matchedReports.map((r, ri) => (
                    <div key={ri} style={{ marginBottom: 3 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9 }}>
                        <span style={{ color: CY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "75%" }}>
                          {r.title || r.name || `report-${ri + 1}`}
                        </span>
                        <span style={{ color: "#2E4060", fontSize: 8, flexShrink: 0 }}>{r.type || r.status || ""}</span>
                      </div>
                      <div style={{ height: 3, background: "#0B1420", borderRadius: 2, marginTop: 2 }}>
                        <div style={{ height: "100%", width: `${Math.min(100, 40 + (kws.filter(k => JSON.stringify(r).toLowerCase().includes(k)).length * 15))}%`, background: CY, borderRadius: 2 }} />
                      </div>
                    </div>
                  )) : (
                    <div style={{ color: "#2E4060", fontSize: 9, marginBottom: 4 }}>No report matches.</div>
                  )}

                  {/* ASSESS */}
                  <button
                    onClick={e => { e.stopPropagation(); handleAssess(ct); }}
                    disabled={assessing === aKey}
                    style={{
                      fontFamily: MONO, fontSize: 9, letterSpacing: 1,
                      background: `${RED}18`, border: `1px solid ${RED}44`,
                      color: RED, borderRadius: 4, padding: "3px 8px",
                      cursor: assessing === aKey ? "wait" : "pointer", marginTop: 6,
                    }}
                  >
                    {assessing === aKey ? "ASSESSING…" : "▶ ASSESS"}
                  </button>

                  {assessTxt[aKey] && (
                    <div style={{
                      marginTop: 6, padding: "6px 8px",
                      background: `${RED}0A`, border: `1px solid ${RED}22`,
                      borderRadius: 4, color: "#A0C0D0", fontSize: 10, lineHeight: 1.5,
                    }}>
                      {assessTxt[aKey]}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{
        padding: "6px 14px", borderTop: `1px solid ${RED}18`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ color: "#2E4060", fontSize: 9, letterSpacing: 1 }}>
          {filtered.length}/{rows.length} CONTACTS · AUTO-REFRESH 90s
        </span>
        <button
          onClick={load}
          style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: 1,
            background: "none", border: `1px solid ${RED}33`,
            color: RED, borderRadius: 3, padding: "2px 7px", cursor: "pointer",
          }}
        >
          ↻ SYNC
        </button>
      </div>
    </div>
  );
}
