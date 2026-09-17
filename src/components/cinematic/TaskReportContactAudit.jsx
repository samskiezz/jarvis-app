/**
 * F176 — Task × Report × Contact — Mission Accountability Audit (MACON)
 *
 * Parallel-fetches /entities/Task + /v1/reports + /entities/Contact every 90 s.
 * Keyword-correlates each task against the report archive AND the contacts roster:
 *
 *   FULLY_OWNED   — cited in ≥1 report AND assigned to ≥1 contact
 *   ASSIGNED      — contact found, no supporting report
 *   DOCUMENTED    — report found, no contact owner
 *   ORPHAN        — neither — a mission with no owner or paper trail
 *
 * Stat tiles: tasks / reports / contacts / fully owned / orphans
 * Filter tabs: ALL | FULLY_OWNED | ASSIGNED | DOCUMENTED | ORPHAN
 * Text search on task name / status / description.
 * Expand row → matched reports (amber bars) + matched contacts (cyan bars).
 * Red badge + pulse on ORPHAN count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence accountability brief + TTS.
 *
 * Toggle:  ◈ MACON  at bottom:8 left:970800, zIndex:677.
 * Event:   jarvis:macon-toggle
 * Voice:   "macon / mission accountability / task report contact / orphan task /
 *           unowned task / task accountability / task ownership / task audit /
 *           mission dossier / untracked mission"
 * Refresh: 90 s auto-poll.
 */
import { useEffect, useRef, useState } from "react";

const BTN_LEFT = 970_800;
const POLL_MS  = 90_000;

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

const MACON_RE =
  /\b(macon|mission\s+accountability|task\s+report\s+contact|orphan\s+task|unowned\s+task|task\s+accountability|task\s+ownership|task\s+audit|mission\s+dossier|untracked\s+mission)\b/i;

export function isMaconQuery(q) { return MACON_RE.test(q || ""); }

export async function buildMaconScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [tRes, rRes, cRes] = await Promise.all([
      fetch(`${base}/entities/Task`,    { headers: hdr }),
      fetch(`${base}/v1/reports`,       { headers: hdr }),
      fetch(`${base}/entities/Contact`, { headers: hdr }),
    ]);
    const tasks    = normArr(await tRes.json(), ["tasks","data","items","results"]);
    const reports  = normArr(await rRes.json(), ["reports","data","items","results"]);
    const contacts = normArr(await cRes.json(), ["contacts","data","items","results"]);

    const rows   = classifyTasks(tasks, reports, contacts);
    const orphan = rows.filter((r) => r.cls === "ORPHAN").length;
    const full   = rows.filter((r) => r.cls === "FULLY_OWNED").length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS mission accountability audit (MACON): ${tasks.length} tasks cross-referenced ` +
          `against ${reports.length} reports and ${contacts.length} contacts — ` +
          `${full} fully owned (report + contact), ${orphan} orphan (no owner or documentation). ` +
          `Give a 2-sentence mission accountability brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return d?.response || d?.answer || d?.message || "Mission accountability audit complete.";
  } catch (e) {
    return `Mission accountability audit error: ${e.message}`;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normArr(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function tokens(str) {
  return String(str || "").toLowerCase().split(/\W+/).filter((t) => t.length > 2);
}

function hasOverlap(tToks, candidate) {
  const cToks = tokens(
    `${candidate.name || ""} ${candidate.title || ""} ${candidate.description || ""} ` +
    `${candidate.type || ""} ${candidate.category || ""} ${candidate.tags || ""} ` +
    `${candidate.email || ""} ${candidate.role || ""}`
  );
  return tToks.some((t) => cToks.includes(t));
}

function classifyTasks(tasks, reports, contacts) {
  return tasks.map((task) => {
    const tToks = tokens(
      `${task.name || ""} ${task.title || ""} ${task.description || ""} ` +
      `${task.type || ""} ${task.status || ""} ${task.tags || ""}`
    );
    const matchedReports  = reports.filter((r) => hasOverlap(tToks, r));
    const matchedContacts = contacts.filter((c) => hasOverlap(tToks, c));
    const hasReport  = matchedReports.length  > 0;
    const hasContact = matchedContacts.length > 0;
    let cls = "ORPHAN";
    if (hasReport && hasContact) cls = "FULLY_OWNED";
    else if (hasContact)         cls = "ASSIGNED";
    else if (hasReport)          cls = "DOCUMENTED";
    return { task, cls, matchedReports, matchedContacts };
  });
}

// ── Colours ───────────────────────────────────────────────────────────────────

const CY = "#29E7FF";
const GR = "#2ECC71";
const AM = "#F39C12";
const RD = "#E74C3C";

const CLS_COLOR = {
  FULLY_OWNED: GR,
  ASSIGNED:    CY,
  DOCUMENTED:  AM,
  ORPHAN:      RD,
};

const TABS = ["ALL", "FULLY_OWNED", "ASSIGNED", "DOCUMENTED", "ORPHAN"];

// ── Component ─────────────────────────────────────────────────────────────────

export default function TaskReportContactAudit() {
  const [visible,      setVisible]      = useState(false);
  const [rows,         setRows]         = useState([]);
  const [taskCnt,      setTaskCnt]      = useState(0);
  const [reportCnt,    setReportCnt]    = useState(0);
  const [contactCnt,   setContactCnt]   = useState(0);
  const [tab,          setTab]          = useState("ALL");
  const [search,       setSearch]       = useState("");
  const [expanded,     setExpanded]     = useState(null);
  const [answer,       setAnswer]       = useState("");
  const [loading,      setLoading]      = useState(false);
  const [assessing,    setAssessing]    = useState(false);
  const timer = useRef(null);

  const orphanCount = rows.filter((r) => r.cls === "ORPHAN").length;
  const fullCount   = rows.filter((r) => r.cls === "FULLY_OWNED").length;

  async function load() {
    try {
      setLoading(true);
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [tRes, rRes, cRes] = await Promise.all([
        fetch(`${base}/entities/Task`,    { headers: hdr }),
        fetch(`${base}/v1/reports`,       { headers: hdr }),
        fetch(`${base}/entities/Contact`, { headers: hdr }),
      ]);
      const tasks    = normArr(await tRes.json(), ["tasks","data","items","results"]);
      const reports  = normArr(await rRes.json(), ["reports","data","items","results"]);
      const contacts = normArr(await cRes.json(), ["contacts","data","items","results"]);
      setTaskCnt(tasks.length);
      setReportCnt(reports.length);
      setContactCnt(contacts.length);
      setRows(classifyTasks(tasks, reports, contacts));
    } catch (_) { /* silent — panel stays stale */ }
    finally    { setLoading(false); }
  }

  useEffect(() => {
    const toggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:macon-toggle", toggle);
    return () => window.removeEventListener("jarvis:macon-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [visible]);

  async function assess() {
    setAssessing(true);
    const text = await buildMaconScript();
    setAnswer(text);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const filtered = rows.filter((r) => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    const t = r.task;
    return (
      String(t.name        || "").toLowerCase().includes(q) ||
      String(t.title       || "").toLowerCase().includes(q) ||
      String(t.status      || "").toLowerCase().includes(q) ||
      String(t.description || "").toLowerCase().includes(q)
    );
  });

  // ── Styles ──────────────────────────────────────────────────────────────────

  const S = {
    overlay: {
      position: "fixed", inset: 0, background: "rgba(0,8,16,.72)",
      zIndex: 9400, display: "flex", alignItems: "center", justifyContent: "center",
    },
    panel: {
      background: "#060e18", border: "1px solid #1a3a50",
      borderRadius: 10, width: "min(900px,95vw)", maxHeight: "88vh",
      display: "flex", flexDirection: "column", overflow: "hidden",
      boxShadow: "0 0 60px #E74C3C22",
    },
    header: {
      padding: "12px 18px", borderBottom: "1px solid #1a2e3a",
      display: "flex", alignItems: "center", justifyContent: "space-between",
    },
    title: { color: RD, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: 3 },
    close: {
      background: "none", border: "none", color: "#3a5a6a",
      fontSize: 14, cursor: "pointer", padding: "0 4px",
    },
    tiles: { display: "flex", gap: 8, padding: "10px 18px", flexWrap: "wrap" },
    tile: (col) => ({
      flex: "1 1 90px", background: `${col}0d`, border: `1px solid ${col}33`,
      borderRadius: 6, padding: "8px 12px", textAlign: "center",
    }),
    tileVal: (col) => ({
      color: col, fontFamily: "'JetBrains Mono',monospace",
      fontSize: 18, fontWeight: 700, lineHeight: 1,
    }),
    tileLabel: { color: "#3a5a6a", fontSize: 8, letterSpacing: 2, marginTop: 4 },
    tabs: { display: "flex", gap: 4, padding: "0 18px 8px", flexWrap: "wrap" },
    tabBtn: (active) => ({
      background: active ? "#0d2030" : "none",
      border: `1px solid ${active ? "#2a6a8a" : "#1a2e3a"}`,
      color: active ? CY : "#3a5a6a",
      borderRadius: 4, padding: "4px 10px", fontSize: 9,
      letterSpacing: 2, cursor: "pointer",
    }),
    search: {
      margin: "0 18px 8px", padding: "6px 10px",
      background: "#0a1520", border: "1px solid #1a2e3a",
      borderRadius: 5, color: "#80b0c8", fontSize: 10, outline: "none",
    },
    list: { flex: 1, overflowY: "auto", padding: "0 18px 8px" },
    row: (col) => ({
      border: `1px solid ${col}22`, borderRadius: 6, marginBottom: 6,
      padding: "8px 12px", cursor: "pointer",
      background: `${col}08`, transition: "background .2s",
    }),
    rowHead: { display: "flex", alignItems: "center", justifyContent: "space-between" },
    rowName: {
      color: "#b0d0e8", fontFamily: "'JetBrains Mono',monospace",
      fontSize: 10, letterSpacing: 1,
    },
    clsBadge: (col) => ({
      background: `${col}22`, border: `1px solid ${col}55`,
      color: col, borderRadius: 3, padding: "1px 7px",
      fontSize: 8, letterSpacing: 2,
    }),
    expand: {
      marginTop: 10, display: "flex", gap: 16,
      borderTop: "1px solid #1a2e3a", paddingTop: 10,
    },
    subCol: { flex: 1, minWidth: 200 },
    subTitle: { color: "#4a6a7a", fontSize: 9, letterSpacing: 2, marginBottom: 4 },
    bar: (col) => ({
      height: 14, background: `${col}22`, borderRadius: 3,
      marginBottom: 3, overflow: "hidden", position: "relative",
    }),
    barFill: (col, pct) => ({
      width: `${Math.min(pct, 100)}%`, height: "100%",
      background: `${col}66`, transition: "width .4s",
    }),
    barLabel: {
      position: "absolute", top: 0, left: 4,
      color: "#b0c8d8", fontSize: 9, lineHeight: "14px",
      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      maxWidth: "90%",
    },
    footer: {
      padding: "10px 18px", borderTop: "1px solid #1a2e3a",
      display: "flex", gap: 10, alignItems: "flex-start",
    },
    assessBtn: (busy) => ({
      background: busy ? "#1a2a3a" : "#0d2030",
      border: "1px solid #2a6a8a", color: busy ? "#4a6a7a" : CY,
      borderRadius: 5, padding: "5px 14px", fontSize: 10,
      letterSpacing: 2, cursor: busy ? "not-allowed" : "pointer",
      whiteSpace: "nowrap",
    }),
    answer: {
      flex: 1, color: "#80b0c8", fontSize: 10, lineHeight: 1.5,
      fontStyle: "italic",
    },
  };

  useEffect(() => {
    if (document.getElementById("macon-pulse-style")) return;
    const st = document.createElement("style");
    st.id = "macon-pulse-style";
    st.textContent = `
      @keyframes macon-pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
      .macon-pulse { animation: macon-pulse 1.4s ease-in-out infinite; }
    `;
    document.head.appendChild(st);
  }, []);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("jarvis:macon-toggle"))}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 677,
          background: "#0a1520", border: "1px solid #1a3a50",
          color: orphanCount > 0 ? RD : "#3a5a6a",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 2, padding: "3px 8px",
          borderRadius: 4, cursor: "pointer", userSelect: "none",
        }}
        title="Mission Accountability Audit (MACON)"
      >
        <span
          className={orphanCount > 0 ? "macon-pulse" : ""}
          style={{ marginRight: orphanCount > 0 ? 4 : 0, color: RD }}
        >
          {orphanCount > 0 ? `${orphanCount}⚠` : ""}
        </span>
        ◈ MACON
      </button>

      {/* Panel overlay */}
      {visible && (
        <div style={S.overlay} onClick={(e) => { if (e.target === e.currentTarget) setVisible(false); }}>
          <div style={S.panel}>
            {/* Header */}
            <div style={S.header}>
              <span style={S.title}>◈ MISSION ACCOUNTABILITY AUDIT — TASK × REPORT × CONTACT</span>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {loading && <span style={{ color: "#3a5a6a", fontSize: 9, letterSpacing: 2 }}>POLLING…</span>}
                <button style={S.close} onClick={() => setVisible(false)}>✕</button>
              </div>
            </div>

            {/* Stat tiles */}
            <div style={S.tiles}>
              <div style={S.tile(CY)}>
                <div style={S.tileVal(CY)}>{taskCnt}</div>
                <div style={S.tileLabel}>TASKS</div>
              </div>
              <div style={S.tile(AM)}>
                <div style={S.tileVal(AM)}>{reportCnt}</div>
                <div style={S.tileLabel}>REPORTS</div>
              </div>
              <div style={S.tile(CY)}>
                <div style={S.tileVal(CY)}>{contactCnt}</div>
                <div style={S.tileLabel}>CONTACTS</div>
              </div>
              <div style={S.tile(GR)}>
                <div style={S.tileVal(GR)}>{fullCount}</div>
                <div style={S.tileLabel}>FULLY OWNED</div>
              </div>
              <div style={S.tile(RD)} className={orphanCount > 0 ? "macon-pulse" : ""}>
                <div style={S.tileVal(RD)}>{orphanCount}</div>
                <div style={S.tileLabel}>ORPHAN</div>
              </div>
            </div>

            {/* Filter tabs */}
            <div style={S.tabs}>
              {TABS.map((t) => (
                <button key={t} style={S.tabBtn(tab === t)} onClick={() => setTab(t)}>{t}</button>
              ))}
            </div>

            {/* Search */}
            <input
              style={S.search}
              placeholder="search task name / status / description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            {/* List */}
            <div style={S.list}>
              {filtered.length === 0 && (
                <div style={{ color: "#2a4a5a", fontSize: 10, padding: "20px 0", textAlign: "center" }}>
                  {loading ? "LOADING…" : "NO RESULTS"}
                </div>
              )}
              {filtered.map((r, i) => {
                const col  = CLS_COLOR[r.cls];
                const task = r.task;
                const key  = task.id || task.name || i;
                const open = expanded === key;
                const maxMatch = Math.max(
                  r.matchedReports.length,
                  r.matchedContacts.length,
                  1
                );
                return (
                  <div key={key} style={S.row(col)} onClick={() => setExpanded(open ? null : key)}>
                    <div style={S.rowHead}>
                      <span style={S.rowName}>
                        {task.name || task.title || task.id || `task-${i}`}
                        {task.status
                          ? <span style={{ color: "#3a6a8a", fontSize: 9, marginLeft: 6 }}>[{task.status}]</span>
                          : null}
                      </span>
                      <span style={S.clsBadge(col)}>{r.cls}</span>
                    </div>
                    {task.description && (
                      <div style={{ color: "#3a6a7a", fontSize: 9, marginTop: 3, letterSpacing: 1 }}>
                        {String(task.description).slice(0, 90)}{String(task.description).length > 90 ? "…" : ""}
                      </div>
                    )}
                    {open && (
                      <div style={S.expand}>
                        {/* Reports */}
                        <div style={S.subCol}>
                          <div style={S.subTitle}>REPORTS ({r.matchedReports.length})</div>
                          {r.matchedReports.length === 0
                            ? <div style={{ color: "#2a4a5a", fontSize: 9 }}>— none —</div>
                            : r.matchedReports.slice(0, 6).map((rpt, ri) => (
                              <div key={ri} style={S.bar(AM)}>
                                <div style={S.barFill(AM, (r.matchedReports.length / maxMatch) * 100)} />
                                <span style={S.barLabel}>{rpt.name || rpt.title || rpt.id || `report-${ri}`}</span>
                              </div>
                            ))
                          }
                        </div>
                        {/* Contacts */}
                        <div style={S.subCol}>
                          <div style={S.subTitle}>CONTACTS ({r.matchedContacts.length})</div>
                          {r.matchedContacts.length === 0
                            ? <div style={{ color: "#2a4a5a", fontSize: 9 }}>— none —</div>
                            : r.matchedContacts.slice(0, 6).map((c, ci) => (
                              <div key={ci} style={S.bar(CY)}>
                                <div style={S.barFill(CY, (r.matchedContacts.length / maxMatch) * 100)} />
                                <span style={S.barLabel}>{c.name || c.title || c.email || c.id || `contact-${ci}`}</span>
                              </div>
                            ))
                          }
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer / Assess */}
            <div style={S.footer}>
              <button style={S.assessBtn(assessing)} onClick={assess} disabled={assessing}>
                {assessing ? "ANALYSING…" : "▶ ASSESS"}
              </button>
              {answer && <div style={S.answer}>{answer}</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
