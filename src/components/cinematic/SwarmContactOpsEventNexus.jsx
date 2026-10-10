/**
 * F280 — SwarmJob × Contact × Ops Event Operational Mission Execution Nexus (SCOEMEX)
 *
 * Parallel-fetches /entities/SwarmJob, /entities/Contact, /v1/ops/events;
 * keyword-correlates each swarm job against contacts AND ops events to classify:
 *   FULLY_EXECUTED    — matched by ≥1 contact AND ≥1 ops event
 *   CONTACT_ASSIGNED  — contact match only
 *   EVENT_DRIVEN      — ops event match only
 *   UNEXECUTED        — no match (mission execution gap)
 *
 * Stat tiles: SWARM JOBS / CONTACTS / OPS EVENTS / EXEC%
 * Class tiles: FULLY EXECUTED / CONTACT ASSIGNED / EVENT DRIVEN / UNEXECUTED
 * Coverage bar (green≥70% / amber≥40% / red<40%)
 * Filter tabs: ALL | FULLY_EXECUTED | CONTACT_ASSIGNED | EVENT_DRIVEN | UNEXECUTED
 * Expand any job → matched contact cards (cyan, role) + ops event cards (orange, type) with relevance bars
 * UNEXECUTED rows pulse red
 * ▶ ASSESS MISSION EXECUTION → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *
 * Toggle:  ◈ SCOEMEX  left:1112960, bottom:8, zIndex:703
 * Voice:   "scoemex / swarm mission execution / swarm contact ops / unexecuted swarm /
 *           mission execution nexus / swarm ops contact / contact swarm ops /
 *           swarm execution coverage / ops swarm contact"
 * Event:   jarvis:scoemex-toggle
 * Refresh: 90-s auto-poll
 */
import { useCallback, useEffect, useRef, useState } from "react";

const BTN_LEFT = 1112960;
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

const SCOEMEX_RE =
  /\b(scoemex|swarm\s+mission\s+execution|swarm\s+contact\s+ops|unexecuted\s+swarm|mission\s+execution\s+nexus|swarm\s+ops\s+contact|contact\s+swarm\s+ops|swarm\s+execution\s+coverage|ops\s+swarm\s+contact)\b/i;

export function isScoemexQuery(q) { return SCOEMEX_RE.test(q); }

export async function buildScoemexScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [sRes, cRes, eRes] = await Promise.all([
      fetch(`${base}/entities/SwarmJob`,   { headers: hdr }),
      fetch(`${base}/entities/Contact`,    { headers: hdr }),
      fetch(`${base}/v1/ops/events`,       { headers: hdr }),
    ]);
    const sRaw = await sRes.json();
    const cRaw = await cRes.json();
    const eRaw = await eRes.json();

    const jobs    = normaliseJobs(sRaw);
    const contacts = normaliseContacts(cRaw);
    const events  = normaliseEvents(eRaw);
    const corr    = buildCorrelated(jobs, contacts, events);

    const fully    = corr.filter(c => c.cls === "FULLY_EXECUTED").length;
    const contOnly = corr.filter(c => c.cls === "CONTACT_ASSIGNED").length;
    const evOnly   = corr.filter(c => c.cls === "EVENT_DRIVEN").length;
    const unexec   = corr.filter(c => c.cls === "UNEXECUTED").length;
    const pct      = jobs.length ? Math.round((fully / jobs.length) * 100) : 0;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS swarm mission execution nexus assessment (SCOEMEX): ${jobs.length} swarm jobs cross-referenced ` +
          `against ${contacts.length} contacts and ${events.length} operational events. ` +
          `FULLY_EXECUTED: ${fully}, CONTACT_ASSIGNED: ${contOnly}, EVENT_DRIVEN: ${evOnly}, UNEXECUTED (gap): ${unexec}. ` +
          `Execution coverage: ${pct}%. Give a 2-sentence operational mission execution brief — formal British butler tone, first person.`,
      }),
    });
    if (!r.ok) throw new Error("agent chat failed");
    const j = await r.json();
    return j.response || j.message || j.content || "";
  } catch {
    return "SCOEMEX online, sir. Assessing swarm mission execution coverage across contacts and operational events.";
  }
}

// ── normalisation ─────────────────────────────────────────────────────────────

function normaliseJobs(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.items) ? raw.items
    : Array.isArray(raw?.data)  ? raw.data
    : Array.isArray(raw?.jobs)  ? raw.jobs
    : [];
  return arr.map(j => ({
    id:     j.id || j._id || String(Math.random()),
    name:   j.name || j.job_name || j.title || "Unnamed Job",
    type:   j.type || j.job_type || "",
    status: j.status || j.state || "",
    desc:   `${j.name || ""} ${j.job_name || ""} ${j.title || ""} ${j.type || ""} ${j.description || ""} ${(j.tags || []).join(" ")}`.toLowerCase(),
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

function normaliseEvents(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.items)  ? raw.items
    : Array.isArray(raw?.data)   ? raw.data
    : Array.isArray(raw?.events) ? raw.events
    : [];
  return arr.map(e => ({
    id:   e.id || e._id || String(Math.random()),
    name: e.name || e.title || e.event_name || "Unnamed Event",
    type: e.type || e.event_type || "",
    sev:  e.severity || e.level || e.priority || "",
    desc: `${e.name || ""} ${e.title || ""} ${e.type || ""} ${e.description || ""} ${e.severity || ""} ${(e.tags || []).join(" ")}`.toLowerCase(),
  }));
}

function tokenize(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(t => t.length > 2);
}

function relevance(tokens, desc) {
  const hits = tokens.filter(t => desc.includes(t)).length;
  return tokens.length ? Math.round((hits / tokens.length) * 100) : 0;
}

function buildCorrelated(jobs, contacts, events) {
  return jobs.map(job => {
    const tokens    = tokenize(job.desc);
    const mContacts = contacts
      .map(c => ({ ...c, rel: relevance(tokens, c.desc) }))
      .filter(c => c.rel > 0)
      .sort((a, b) => b.rel - a.rel)
      .slice(0, 5);
    const mEvents = events
      .map(e => ({ ...e, rel: relevance(tokens, e.desc) }))
      .filter(e => e.rel > 0)
      .sort((a, b) => b.rel - a.rel)
      .slice(0, 5);
    const hasCont = mContacts.length > 0;
    const hasEv   = mEvents.length > 0;
    let cls;
    if (hasCont && hasEv) cls = "FULLY_EXECUTED";
    else if (hasCont)     cls = "CONTACT_ASSIGNED";
    else if (hasEv)       cls = "EVENT_DRIVEN";
    else                  cls = "UNEXECUTED";
    return { ...job, cls, mContacts, mEvents };
  });
}

function sevColor(s) {
  const sl = (s || "").toLowerCase();
  if (sl === "critical")                      return "#ef4444";
  if (sl === "high")                          return "#f97316";
  if (sl === "medium" || sl === "moderate")   return "#eab308";
  if (sl === "low" || sl === "info")          return "#22c55e";
  return "#64748b";
}

// ── component ─────────────────────────────────────────────────────────────────
export default function SwarmContactOpsEventNexus() {
  const [open,      setOpen]      = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [jobs,      setJobs]      = useState([]);
  const [contacts,  setContacts]  = useState([]);
  const [events,    setEvents]    = useState([]);
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
      const [sRes, cRes, eRes] = await Promise.all([
        fetch(`${base}/entities/SwarmJob`,  { headers: hdr }),
        fetch(`${base}/entities/Contact`,   { headers: hdr }),
        fetch(`${base}/v1/ops/events`,      { headers: hdr }),
      ]);
      const sRaw = await sRes.json();
      const cRaw = await cRes.json();
      const eRaw = await eRes.json();
      const j = normaliseJobs(sRaw);
      const c = normaliseContacts(cRaw);
      const e = normaliseEvents(eRaw);
      setJobs(j); setContacts(c); setEvents(e);
      setCorr(buildCorrelated(j, c, e));
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
    window.addEventListener("jarvis:scoemex-toggle", handler);
    return () => window.removeEventListener("jarvis:scoemex-toggle", handler);
  }, []);

  const handleAssess = useCallback(async () => {
    setAssessing(true); setAssess("");
    const script = await buildScoemexScript();
    setAssess(script);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
  }, []);

  const fully    = corr.filter(c => c.cls === "FULLY_EXECUTED").length;
  const contOnly = corr.filter(c => c.cls === "CONTACT_ASSIGNED").length;
  const evOnly   = corr.filter(c => c.cls === "EVENT_DRIVEN").length;
  const unexec   = corr.filter(c => c.cls === "UNEXECUTED").length;
  const pct      = jobs.length ? Math.round((fully / jobs.length) * 100) : 0;

  const TABS = ["ALL", "FULLY_EXECUTED", "CONTACT_ASSIGNED", "EVENT_DRIVEN", "UNEXECUTED"];

  const visible = corr.filter(c => {
    const matchTab    = tab === "ALL" || c.cls === tab;
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  const clsColor = cls => ({
    FULLY_EXECUTED:   "#22c55e",
    CONTACT_ASSIGNED: "#06b6d4",
    EVENT_DRIVEN:     "#f97316",
    UNEXECUTED:       "#dc2626",
  }[cls] || "#6b7280");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 703,
          background: "rgba(0,0,0,0.7)", border: "1px solid #06b6d4",
          color: "#06b6d4", padding: "4px 10px", fontSize: 11,
          borderRadius: 4, cursor: "pointer", fontFamily: "monospace",
          whiteSpace: "nowrap",
        }}
      >
        ◈ SCOEMEX {unexec > 0 && <span style={{ color: "#ef4444", marginLeft: 4 }}>● {unexec}</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", right: 20, top: 60, width: 720, maxHeight: "85vh",
      background: "rgba(0,4,12,0.97)", border: "1px solid #06b6d4",
      borderRadius: 8, zIndex: 9999, display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: "#e2e8f0", overflow: "hidden",
    }}>
      {/* header */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #1e3a5f", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#06b6d4", fontWeight: 700, fontSize: 13 }}>
          ◈ SCOEMEX — SwarmJob × Contact × Ops Event Mission Execution Nexus
        </span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>

      {/* primary stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, padding: "10px 14px 6px" }}>
        {[
          { label: "SWARM JOBS",  val: jobs.length,     col: "#06b6d4" },
          { label: "CONTACTS",    val: contacts.length, col: "#06b6d4" },
          { label: "OPS EVENTS",  val: events.length,   col: "#f97316" },
          { label: "EXEC%",       val: `${pct}%`,       col: pct >= 70 ? "#22c55e" : pct >= 40 ? "#eab308" : "#ef4444" },
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
          { label: "FULLY EXECUTED",   val: fully,    col: "#22c55e" },
          { label: "CONTACT ASSIGNED", val: contOnly, col: "#06b6d4" },
          { label: "EVENT DRIVEN",     val: evOnly,   col: "#f97316" },
          { label: "UNEXECUTED",       val: unexec,   col: "#dc2626" },
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
            background: tab === t ? "#06b6d4" : "rgba(255,255,255,0.05)",
            color: tab === t ? "#000" : "#94a3b8", border: "none",
            borderRadius: 4, padding: "3px 8px", fontSize: 10, cursor: "pointer",
          }}>
            {t.replace(/_/g, " ")}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search jobs…"
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
          <div style={{ color: "#64748b", textAlign: "center", padding: 20, fontSize: 12 }}>No jobs match.</div>
        )}
        {visible.map(job => (
          <div key={job.id} style={{ marginBottom: 6 }}>
            <div
              onClick={() => setExpanded(expanded === job.id ? null : job.id)}
              style={{
                background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "8px 12px",
                cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
                border: `1px solid ${job.cls === "UNEXECUTED" ? "rgba(220,38,38,0.4)" : "transparent"}`,
                animation: job.cls === "UNEXECUTED" ? "scoemex-pulse 2s ease-in-out infinite" : "none",
              }}
            >
              <div>
                <span style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 600 }}>{job.name}</span>
                {job.type && (
                  <span style={{ background: "rgba(6,182,212,0.15)", color: "#06b6d4", borderRadius: 3, padding: "1px 5px", fontSize: 9, marginLeft: 6 }}>
                    {job.type}
                  </span>
                )}
                {job.status && <span style={{ color: "#64748b", fontSize: 10, marginLeft: 6 }}>{job.status}</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  background: `${clsColor(job.cls)}22`, color: clsColor(job.cls),
                  borderRadius: 4, padding: "2px 7px", fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
                }}>
                  {job.cls.replace(/_/g, " ")}
                </span>
                <span style={{ color: "#475569", fontSize: 11 }}>{expanded === job.id ? "▲" : "▼"}</span>
              </div>
            </div>

            {expanded === job.id && (
              <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: "0 0 6px 6px", padding: "8px 12px", marginTop: 1 }}>
                {/* contacts */}
                {job.mContacts.length > 0 && (
                  <>
                    <div style={{ color: "#06b6d4", fontSize: 10, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>CONTACTS ({job.mContacts.length})</div>
                    {job.mContacts.map(c => (
                      <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                        <span style={{ color: "#67e8f9", fontSize: 11, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                        {c.role && <span style={{ background: "#06b6d422", color: "#67e8f9", borderRadius: 3, padding: "1px 5px", fontSize: 9 }}>{c.role}</span>}
                        <div style={{ width: 80, height: 4, background: "#1e293b", borderRadius: 2, flexShrink: 0 }}>
                          <div style={{ width: `${c.rel}%`, height: "100%", background: "#06b6d4", borderRadius: 2 }} />
                        </div>
                        <span style={{ color: "#64748b", fontSize: 9, width: 28, textAlign: "right" }}>{c.rel}%</span>
                      </div>
                    ))}
                  </>
                )}
                {/* ops events */}
                {job.mEvents.length > 0 && (
                  <>
                    <div style={{ color: "#f97316", fontSize: 10, fontWeight: 700, margin: "8px 0 4px", letterSpacing: 1 }}>OPS EVENTS ({job.mEvents.length})</div>
                    {job.mEvents.map(e => (
                      <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                        <span style={{ color: "#fdba74", fontSize: 11, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
                        {e.type && <span style={{ background: "#f9731622", color: "#fdba74", borderRadius: 3, padding: "1px 5px", fontSize: 9 }}>{e.type}</span>}
                        {e.sev && <span style={{ background: `${sevColor(e.sev)}22`, color: sevColor(e.sev), borderRadius: 3, padding: "1px 5px", fontSize: 9, fontWeight: 700 }}>{e.sev.toUpperCase()}</span>}
                        <div style={{ width: 80, height: 4, background: "#1e293b", borderRadius: 2, flexShrink: 0 }}>
                          <div style={{ width: `${e.rel}%`, height: "100%", background: "#f97316", borderRadius: 2 }} />
                        </div>
                        <span style={{ color: "#64748b", fontSize: 9, width: 28, textAlign: "right" }}>{e.rel}%</span>
                      </div>
                    ))}
                  </>
                )}
                {job.mContacts.length === 0 && job.mEvents.length === 0 && (
                  <div style={{ color: "#ef4444", fontSize: 11 }}>No contact or ops event links — job unexecuted.</div>
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
            background: assessing ? "rgba(6,182,212,0.1)" : "rgba(6,182,212,0.15)",
            border: "1px solid #06b6d4", color: "#06b6d4",
            borderRadius: 4, padding: "5px 14px", fontSize: 11,
            cursor: assessing ? "default" : "pointer", fontFamily: "monospace",
          }}
        >
          {assessing ? "▶ assessing…" : "▶ ASSESS MISSION EXECUTION"}
        </button>
      </div>

      <style>{`
        @keyframes scoemex-pulse {
          0%, 100% { border-color: rgba(220,38,38,0.4); }
          50%       { border-color: rgba(220,38,38,0.9); }
        }
      `}</style>
    </div>
  );
}
