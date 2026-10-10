/**
 * F191 — Scenario × Contact × Task — Crisis Response Matrix (CRTM)
 *
 * Parallel-fetches /v1/scenario/list + /entities/Contact + /entities/Task every 90 s.
 * Keyword-correlates each scenario (by name/description/type) against the contacts
 * roster AND the task catalog:
 *
 *   FULLY_RESOURCED — matched ≥1 contact AND ≥1 task
 *   CONTACT_ONLY    — contacts linked, no task coverage
 *   TASK_ONLY       — tasks backing it, no contact ownership
 *   UNRESOURCED     — neither contacts nor tasks (crisis with no coverage)
 *
 * Stat tiles: scenarios / contacts / tasks / fully resourced / unresourced
 * Filter tabs: ALL | FULLY_RESOURCED | CONTACT_ONLY | TASK_ONLY | UNRESOURCED
 * Text search on scenario name/type.
 * Expand row → matched contacts (green bars) + matched tasks (amber bars).
 * Red badge + pulse on UNRESOURCED count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence crisis-readiness brief + TTS.
 *
 * Toggle:  ◈ CRTM  at bottom:8 left:983700, zIndex:692.
 * Event:   jarvis:crtm-toggle
 * Voice:   "crtm / crisis response matrix / scenario contact task / unresourced scenario /
 *           crisis coverage / response matrix / who owns the scenario / scenario ownership"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const BTN_LEFT = 983_700;
const POLL_MS  = 90_000;
const CY       = "#29E7FF";
const AMBER    = "#FFB020";
const RED      = "#FF4545";
const GREEN    = "#00FF88";
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

const CRTM_RE =
  /\b(crtm|crisis\s+response\s+matrix|scenario\s+contact\s+task|unresourced\s+scenario|crisis\s+coverage|response\s+matrix|who\s+owns\s+the\s+scenario|scenario\s+ownership)\b/i;

export function isCrtmQuery(q) {
  return CRTM_RE.test(q || "");
}

function toArr(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (v.scenarios) return v.scenarios;
  if (v.contacts)  return v.contacts;
  if (v.tasks)     return v.tasks;
  if (v.items)     return v.items;
  if (v.data)      return Array.isArray(v.data) ? v.data : [];
  return [];
}

function keywords(obj) {
  if (!obj) return [];
  const raw = [
    obj.name, obj.title, obj.type, obj.objective, obj.description,
    obj.summary, obj.status, obj.id,
  ].filter(Boolean).join(" ").toLowerCase();
  return raw.split(/[\s,;|_/-]+/).filter(w => w.length > 2);
}

function matchKws(kws, obj) {
  if (!kws.length) return false;
  const hay = [
    obj.name, obj.title, obj.role, obj.department, obj.email,
    obj.description, obj.summary, obj.tags, obj.status, obj.type,
  ].filter(Boolean).join(" ").toLowerCase();
  return kws.some(k => hay.includes(k));
}

export async function buildCrtmScript() {
  const base = apiBase();
  const h = { Authorization: `Bearer ${API_KEY}` };
  try {
    const [scnr, conr, taskr] = await Promise.allSettled([
      fetch(`${base}/v1/scenario/list`, { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/entities/Contact`, { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/entities/Task`,    { headers: h }).then(r => r.ok ? r.json() : []),
    ]);
    const scenarios = toArr(scnr.value);
    const contacts  = toArr(conr.value);
    const tasks     = toArr(taskr.value);
    let unresourced = 0;

    for (const scn of scenarios) {
      const kws = keywords(scn);
      const hasContact = contacts.some(c => matchKws(kws, c));
      const hasTask    = tasks.some(t => matchKws(kws, t));
      if (!hasContact && !hasTask) unresourced++;
    }

    return `CRTM analysis: ${scenarios.length} scenario${scenarios.length !== 1 ? "s" : ""} vs ` +
      `${contacts.length} contacts × ${tasks.length} tasks. ` +
      `${unresourced} scenario${unresourced !== 1 ? "s are" : " is"} completely unresourced — ` +
      `no contact ownership and no task coverage. Recommend assigning owners and creating response tasks.`;
  } catch (e) {
    return `CRTM error: ${e.message}`;
  }
}

// ── Classification helpers ────────────────────────────────────────────────────

const CLASS_COLOR = {
  FULLY_RESOURCED: GREEN,
  CONTACT_ONLY:    CY,
  TASK_ONLY:       AMBER,
  UNRESOURCED:     RED,
};

function classify(scn, contacts, tasks) {
  const kws = keywords(scn);
  const hasContact = contacts.some(c => matchKws(kws, c));
  const hasTask    = tasks.some(t => matchKws(kws, t));
  if (hasContact && hasTask)  return "FULLY_RESOURCED";
  if (hasContact && !hasTask) return "CONTACT_ONLY";
  if (!hasContact && hasTask) return "TASK_ONLY";
  return "UNRESOURCED";
}

function topMatches(kws, pool, n = 4) {
  return pool
    .map(obj => {
      const hay = [
        obj.name, obj.title, obj.role, obj.department, obj.email,
        obj.description, obj.summary, obj.tags, obj.status, obj.type,
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

export default function ScenarioContactTaskMatrix() {
  const [open,       setOpen]       = useState(false);
  const [rows,       setRows]       = useState([]);
  const [scenarios,  setScenarios]  = useState([]);
  const [contacts,   setContacts]   = useState([]);
  const [tasks,      setTasks]      = useState([]);
  const [filter,     setFilter]     = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [assessing,  setAssessing]  = useState(null);
  const [assessTxt,  setAssessTxt]  = useState({});
  const [loading,    setLoading]    = useState(false);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const base = apiBase();
    const h = { Authorization: `Bearer ${API_KEY}` };
    try {
      const [sr, cr, tr] = await Promise.allSettled([
        fetch(`${base}/v1/scenario/list`, { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/entities/Contact`, { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/entities/Task`,    { headers: h }).then(r => r.ok ? r.json() : []),
      ]);
      const scns  = toArr(sr.value);
      const cons  = toArr(cr.value);
      const tsks  = toArr(tr.value);
      setScenarios(scns); setContacts(cons); setTasks(tsks);
      setRows(scns.map(scn => ({
        scn,
        cls: classify(scn, cons, tsks),
        kws: keywords(scn),
      })));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => { setOpen(o => !o); if (!rows.length) load(); };
    window.addEventListener("jarvis:crtm-toggle", onToggle);
    return () => window.removeEventListener("jarvis:crtm-toggle", onToggle);
  }, [load, rows.length]);

  useEffect(() => {
    if (!open) return;
    load();
    pollRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [open, load]);

  const TABS = ["ALL", "FULLY_RESOURCED", "CONTACT_ONLY", "TASK_ONLY", "UNRESOURCED"];
  const unresourced = rows.filter(r => r.cls === "UNRESOURCED").length;

  const displayed = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const hay = [r.scn.name, r.scn.title, r.scn.type].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  async function assess(scn, kws) {
    const id = scn.id || scn.name;
    setAssessing(id);
    const base = apiBase();
    const h    = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
    const cons  = topMatches(kws, contacts);
    const tsks  = topMatches(kws, tasks);
    const prompt =
      `Scenario: "${scn.name || scn.title}". ` +
      `Matched contacts: ${cons.map(c => c.name || c.title).join(", ") || "none"}. ` +
      `Matched tasks: ${tsks.map(t => t.name || t.title).join(", ") || "none"}. ` +
      `In 2 sentences, assess this scenario's crisis response readiness: who owns it and what work is underway.`;
    try {
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers: h,
        body: JSON.stringify({ message: prompt }),
      });
      const d   = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "Assessment unavailable.";
      setAssessTxt(prev => ({ ...prev, [id]: txt }));
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setAssessTxt(prev => ({ ...prev, [id]: "Assessment unavailable." }));
    }
    setAssessing(null);
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); if (!rows.length) load(); }}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 692,
          background: "rgba(5,8,14,0.82)", border: `1px solid ${unresourced > 0 ? RED : CY}55`,
          borderRadius: 6, color: unresourced > 0 ? RED : CY,
          fontSize: 10, fontFamily: MONO, letterSpacing: 2,
          padding: "3px 8px", cursor: "pointer",
          boxShadow: unresourced > 0 ? `0 0 12px ${RED}44` : "none",
          animation: unresourced > 0 ? "crtm-pulse 2s ease-in-out infinite" : "none",
        }}
      >
        ◈ CRTM{unresourced > 0 ? ` [${unresourced}]` : ""}
        <style>{`@keyframes crtm-pulse{0%,100%{opacity:1}50%{opacity:.45}}`}</style>
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 40, left: BTN_LEFT - 300, zIndex: 692,
      width: 660, maxHeight: "72vh",
      background: "rgba(5,9,16,0.97)", border: `1px solid ${CY}33`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: `0 0 60px ${CY}14, 0 24px 48px rgba(0,0,0,0.85)`,
      fontFamily: MONO, display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ color: CY, fontSize: 11, letterSpacing: 3, flex: 1 }}>CRISIS RESPONSE MATRIX</span>
        {loading && <span style={{ color: "#4E6070", fontSize: 9 }}>refreshing…</span>}
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: "#4E6070",
          cursor: "pointer", fontSize: 14, padding: 0,
        }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${CY}11` }}>
        {[
          { label: "scenarios", val: scenarios.length, col: CY },
          { label: "contacts",  val: contacts.length,  col: GREEN },
          { label: "tasks",     val: tasks.length,     col: AMBER },
          { label: "resourced", val: rows.filter(r => r.cls === "FULLY_RESOURCED").length, col: GREEN },
          { label: "unresourced", val: unresourced, col: RED },
        ].map(({ label, val, col }) => (
          <div key={label} style={{
            flex: 1, background: "rgba(255,255,255,0.03)", borderRadius: 6,
            padding: "5px 4px", textAlign: "center",
            border: `1px solid ${col}22`,
          }}>
            <div style={{ color: col, fontSize: 15, fontWeight: "bold" }}>{val}</div>
            <div style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1 }}>{label.toUpperCase()}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "6px 14px", borderBottom: `1px solid ${CY}11`, flexWrap: "wrap" }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setFilter(tab)} style={{
            background: filter === tab ? `${CY}18` : "transparent",
            border: `1px solid ${filter === tab ? CY : CY + "22"}`,
            borderRadius: 4, color: filter === tab ? CY : "#4E6070",
            fontSize: 9, letterSpacing: 1, padding: "2px 7px", cursor: "pointer",
          }}>{tab.replace("_", " ")}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search scenarios…"
          style={{
            marginLeft: "auto", background: "rgba(255,255,255,0.04)",
            border: `1px solid ${CY}22`, borderRadius: 4,
            color: "#DCEBF5", fontSize: 9, padding: "2px 7px",
            fontFamily: MONO, outline: "none",
          }}
        />
      </div>

      {/* Rows */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {displayed.length === 0 && (
          <div style={{ padding: "20px 14px", color: "#4E6070", fontSize: 11, textAlign: "center" }}>
            {loading ? "loading…" : "no scenarios"}
          </div>
        )}
        {displayed.map(({ scn, cls, kws }) => {
          const id = scn.id || scn.name;
          const isExp = expanded === id;
          const matchedCons  = topMatches(kws, contacts);
          const matchedTasks = topMatches(kws, tasks);
          const col = CLASS_COLOR[cls] || CY;
          return (
            <div key={id} style={{ borderBottom: `1px solid ${CY}0F` }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 14px", cursor: "pointer",
                  background: isExp ? "rgba(41,231,255,0.05)" : "transparent",
                }}
              >
                <span style={{ color: col, fontSize: 9, letterSpacing: 1, flexShrink: 0, width: 120 }}>
                  {cls.replace("_", " ")}
                </span>
                <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {scn.name || scn.title || id}
                </span>
                <span style={{ color: "#4E6070", fontSize: 9, flexShrink: 0 }}>
                  {scn.type || scn.status || ""}
                </span>
                <span style={{ color: "#2E4050", fontSize: 10, flexShrink: 0 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "6px 14px 10px", background: "rgba(0,0,0,0.2)" }}>
                  {/* Contacts */}
                  <div style={{ fontSize: 9, color: "#4E6070", letterSpacing: 1, marginBottom: 4 }}>
                    CONTACTS ({matchedCons.length})
                  </div>
                  {matchedCons.length === 0
                    ? <div style={{ color: RED, fontSize: 10, marginBottom: 6 }}>no contact ownership</div>
                    : matchedCons.map((c, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <div style={{ height: 6, borderRadius: 3, background: GREEN, width: `${Math.max(20, 100 - i * 15)}%`, maxWidth: 180 }} />
                          <span style={{ color: "#9AB0BE", fontSize: 10 }}>{c.name || c.title}</span>
                          {c.role && <span style={{ color: "#4E6070", fontSize: 9 }}>{c.role}</span>}
                        </div>
                      ))
                  }

                  {/* Tasks */}
                  <div style={{ fontSize: 9, color: "#4E6070", letterSpacing: 1, marginTop: 6, marginBottom: 4 }}>
                    TASKS ({matchedTasks.length})
                  </div>
                  {matchedTasks.length === 0
                    ? <div style={{ color: RED, fontSize: 10, marginBottom: 6 }}>no task coverage</div>
                    : matchedTasks.map((t, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <div style={{ height: 6, borderRadius: 3, background: AMBER, width: `${Math.max(20, 100 - i * 15)}%`, maxWidth: 180 }} />
                          <span style={{ color: "#9AB0BE", fontSize: 10 }}>{t.name || t.title}</span>
                          {t.status && <span style={{ color: "#4E6070", fontSize: 9 }}>{t.status}</span>}
                        </div>
                      ))
                  }

                  {/* Assess */}
                  <button
                    onClick={() => assess(scn, kws)}
                    disabled={assessing === id}
                    style={{
                      marginTop: 8, background: "rgba(41,231,255,0.08)",
                      border: `1px solid ${CY}44`, borderRadius: 4,
                      color: CY, fontSize: 10, padding: "3px 10px", cursor: "pointer",
                      fontFamily: MONO, letterSpacing: 1,
                    }}
                  >
                    {assessing === id ? "assessing…" : "▶ ASSESS"}
                  </button>
                  {assessTxt[id] && (
                    <div style={{ marginTop: 6, color: "#9AB0BE", fontSize: 11, lineHeight: 1.5 }}>
                      {assessTxt[id]}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        borderTop: `1px solid ${CY}1A`, padding: "5px 14px",
        display: "flex", gap: 12, color: "#2E4050", fontSize: 9, letterSpacing: 1,
      }}>
        <span>{displayed.length} scenario{displayed.length !== 1 ? "s" : ""}</span>
        {unresourced > 0 && <span style={{ color: RED }}>● {unresourced} UNRESOURCED</span>}
        <span style={{ marginLeft: "auto" }}>90 s refresh</span>
      </div>
    </div>
  );
}
