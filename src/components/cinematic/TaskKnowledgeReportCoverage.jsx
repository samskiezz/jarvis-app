/**
 * TaskKnowledgeReportCoverage — F103 (TKROPS).
 *
 * Pulls /entities/Task × /knowledge/ × /v1/reports and keyword-correlates
 * each task against KB articles AND reports, classifying each task as:
 *
 *   FULLY_DOCUMENTED — matched at least one KB article AND one report
 *   KB_ONLY          — matched a KB article but no report
 *   REPORT_ONLY      — matched a report but no KB article
 *   UNDOCUMENTED     — no KB article or report backing (operational blind spot)
 *
 * Red pulse on UNDOCUMENTED count.
 *
 * Layout:
 *   • 5 stat tiles: TASKS / KB ARTS / REPORTS / FULLY DOCUMENTED / UNDOCUMENTED
 *   • Coverage % bar
 *   • Filter tabs: ALL / FULLY_DOCUMENTED / KB_ONLY / REPORT_ONLY / UNDOCUMENTED
 *   • Text search on task title / status / type
 *   • Expandable rows → matched KB articles (amber) + reports (green)
 *   • ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *
 * Toggle:  ◈ TKROPS at left:981120, bottom:8, zIndex:127
 * Mounted: App.jsx
 * Wired:   JarvisBrain.jsx via isTkropsQuery / buildTkropsScript
 *
 * Voice: "tkrops" / "task knowledge" / "task report" /
 *        "task documentation" / "undocumented task" /
 *        "task coverage" / "task backing" / "task knowledge report" /
 *        "operational coverage" / "task doc coverage"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#FFB347";
const GREEN = "#00c878";
const RED   = "#FF3D5A";
const DIM   = "#1a2a38";

const BTN_LEFT   = 981120;
const REFRESH_MS = 120_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function authHdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function normalise(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function keywords(str = "") {
  return str.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function matchPool(entity, pool) {
  const eks = keywords(
    [entity.title, entity.name, entity.description, entity.type, entity.status].join(" ")
  );
  if (!eks.length) return [];
  return pool.filter(item => {
    const pks = keywords(
      [item.title, item.subject, item.name, item.description, item.content, item.type, item.category].join(" ")
    );
    return eks.some(k => pks.includes(k));
  });
}

function classify(kbHits, reportHits) {
  if (kbHits > 0 && reportHits > 0) return "FULLY_DOCUMENTED";
  if (kbHits > 0)                   return "KB_ONLY";
  if (reportHits > 0)               return "REPORT_ONLY";
  return "UNDOCUMENTED";
}

const CLASS_ORDER = ["FULLY_DOCUMENTED", "KB_ONLY", "REPORT_ONLY", "UNDOCUMENTED"];
const CLASS_LABEL = {
  FULLY_DOCUMENTED: "FULLY DOCUMENTED",
  KB_ONLY:          "KB ONLY",
  REPORT_ONLY:      "REPORT ONLY",
  UNDOCUMENTED:     "UNDOCUMENTED",
};
const CLASS_COLOR = {
  FULLY_DOCUMENTED: GREEN,
  KB_ONLY:          AMBER,
  REPORT_ONLY:      CY,
  UNDOCUMENTED:     RED,
};

async function fetchData() {
  const base = apiBase();
  const hdr  = authHdr();
  const [rawTasks, rawKB, rawReports] = await Promise.all([
    fetch(`${base}/entities/Task`,  { headers: hdr }).then(r => r.json()),
    fetch(`${base}/knowledge/`,     { headers: hdr }).then(r => r.json()),
    fetch(`${base}/v1/reports`,     { headers: hdr }).then(r => r.json()),
  ]);
  const tasks   = normalise(rawTasks);
  const kb      = normalise(rawKB);
  const reports = normalise(rawReports);

  const rows = tasks.map(task => {
    const kbMatches     = matchPool(task, kb);
    const reportMatches = matchPool(task, reports);
    const cls           = classify(kbMatches.length, reportMatches.length);
    return {
      id:             task.id || task._id || "",
      title:          task.title || task.name || task.id || "Untitled",
      status:         task.status || "",
      type:           task.type || "",
      cls,
      kbMatches,
      reportMatches,
    };
  });

  rows.sort((a, b) => CLASS_ORDER.indexOf(a.cls) - CLASS_ORDER.indexOf(b.cls));
  return { rows, kb, reports };
}

const TKROPS_RE = /\btkrops\b|\btask\s*(knowledge|report|doc(umentation)?|backing|coverage|kb|knowledge\s*report|doc\s*coverage|operational\s*coverage)\b|\bundocumented\s*task\b|\boperational\s*coverage\b/i;

export function isTkropsQuery(q = "") { return TKROPS_RE.test(q); }

export async function buildTkropsScript() {
  try {
    const { rows } = await fetchData();
    const fully  = rows.filter(r => r.cls === "FULLY_DOCUMENTED").length;
    const undoc  = rows.filter(r => r.cls === "UNDOCUMENTED").length;
    const pct    = rows.length ? Math.round((fully / rows.length) * 100) : 0;
    const worst  = rows.filter(r => r.cls === "UNDOCUMENTED").map(r => r.title).slice(0, 3).join(", ") || "none";
    return `Task Knowledge–Report Coverage: ${fully}/${rows.length} tasks (${pct}%) are fully documented with both KB article and report backing. ${undoc} task(s) are undocumented — no KB or report support; top undocumented: ${worst}. Recommend creating KB articles and reports to close these operational documentation gaps.`;
  } catch {
    return "Unable to retrieve task documentation coverage data at this time.";
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function TaskKnowledgeReportCoverage() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [kb,        setKb]        = useState([]);
  const [reports,   setReports]   = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState(null);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const d = await fetchData();
      setRows(d.rows);
      setKb(d.kb);
      setReports(d.reports);
    } catch (e) {
      setErr(e.message || "fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => {
      if (!o) load();
      return !o;
    });
    window.addEventListener("jarvis:tkrops-toggle", handler);
    return () => window.removeEventListener("jarvis:tkrops-toggle", handler);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const handleAssess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = await buildTkropsScript();
      const base   = apiBase();
      const r      = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body:    JSON.stringify({ message: script }),
      });
      const d      = await r.json();
      const answer = (d.answer || script).trim();
      await fetch(`${base}/v1/voice/tts`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body:    JSON.stringify({ text: answer }),
      });
    } catch { /* silent */ }
    setAssessing(false);
  }, []);

  const fully = rows.filter(r => r.cls === "FULLY_DOCUMENTED").length;
  const undoc = rows.filter(r => r.cls === "UNDOCUMENTED").length;
  const pct   = rows.length ? Math.round((fully / rows.length) * 100) : 0;

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.title.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const PULSE = { animation: "pulse-tkrops-red 1.2s infinite" };

  return (
    <>
      <style>{`
        @keyframes pulse-tkrops-red {
          0%,100% { box-shadow: 0 0 0 0 rgba(255,61,90,0.6); }
          50%      { box-shadow: 0 0 0 6px rgba(255,61,90,0); }
        }
        @keyframes pulse-tkrops-row {
          0%,100% { opacity:1; }
          50%      { opacity:0.55; }
        }
      `}</style>

      {/* Floating toggle button */}
      <button
        onClick={() => { setOpen(o => { if (!o) load(); return !o; }); }}
        title="Task Knowledge–Report Operational Coverage (TKROPS)"
        style={{
          position: "fixed",
          left:     BTN_LEFT,
          bottom:   8,
          zIndex:   127,
          background: open ? CY : "#0d1f2d",
          color:      open ? "#000" : CY,
          border:     `1px solid ${CY}`,
          borderRadius: 4,
          padding:    "3px 8px",
          fontSize:   10,
          fontFamily: "monospace",
          cursor:     "pointer",
          letterSpacing: 1,
          ...(undoc > 0 && !open ? PULSE : {}),
        }}
      >
        ◈ TKROPS
      </button>

      {open && (
        <div style={{
          position:   "fixed",
          top:        60,
          left:       "50%",
          transform:  "translateX(-50%)",
          width:      780,
          maxHeight:  "80vh",
          overflowY:  "auto",
          background: "#0a1520",
          border:     `1px solid ${CY}`,
          borderRadius: 8,
          zIndex:     9900,
          padding:    16,
          fontFamily: "monospace",
          color:      "#c8d8e8",
        }}>
          {/* Header */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <span style={{ color:CY, fontSize:13, letterSpacing:2 }}>
              ◈ TASK KNOWLEDGE–REPORT OPERATIONAL COVERAGE
            </span>
            <div style={{ display:"flex", gap:8 }}>
              <button
                onClick={handleAssess}
                disabled={assessing}
                style={{ background:GREEN, color:"#000", border:"none", borderRadius:4, padding:"3px 10px", fontSize:10, cursor:"pointer" }}
              >
                {assessing ? "…" : "▶ ASSESS"}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ background:"transparent", color:"#888", border:"1px solid #333", borderRadius:4, padding:"2px 8px", fontSize:11, cursor:"pointer" }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Stat tiles */}
          {rows.length > 0 && (
            <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
              {[
                { label:"TASKS",            val: rows.length,    col: CY    },
                { label:"KB ARTS",          val: kb.length,      col: AMBER },
                { label:"REPORTS",          val: reports.length, col: GREEN },
                { label:"FULLY DOCUMENTED", val: fully,          col: GREEN },
                { label:"UNDOCUMENTED",     val: undoc,          col: RED   },
              ].map(t => (
                <div key={t.label} style={{ background:DIM, border:`1px solid ${t.col}33`, borderRadius:4, padding:"6px 12px", minWidth:80, textAlign:"center" }}>
                  <div style={{ color:t.col, fontSize:14, fontWeight:"bold" }}>{t.val}</div>
                  <div style={{ color:"#7a9ab8", fontSize:9 }}>{t.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Coverage bar */}
          {rows.length > 0 && (
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:10, color:"#7a9ab8", marginBottom:4 }}>Coverage {pct}%</div>
              <div style={{ height:6, background:"#1a2a38", borderRadius:3, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${pct}%`, background: pct >= 50 ? GREEN : AMBER, transition:"width .4s" }} />
              </div>
            </div>
          )}

          {/* Filter tabs */}
          <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
            {["ALL", ...CLASS_ORDER].map(tab => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                style={{
                  background:   filter === tab ? CY : DIM,
                  color:        filter === tab ? "#000" : "#7a9ab8",
                  border:       `1px solid ${filter === tab ? CY : "#2a3a4a"}`,
                  borderRadius: 3,
                  padding:      "2px 8px",
                  fontSize:     9,
                  cursor:       "pointer",
                }}
              >
                {tab === "ALL" ? "ALL" : CLASS_LABEL[tab]}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            placeholder="Search tasks…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width:"100%", background:"#0d1f2d", border:`1px solid #2a3a4a`, color:"#c8d8e8", borderRadius:4, padding:"4px 8px", fontSize:11, marginBottom:10, boxSizing:"border-box" }}
          />

          {/* Loading / error */}
          {loading && <div style={{ color:"#7a9ab8", fontSize:11, textAlign:"center", padding:12 }}>Loading…</div>}
          {err     && <div style={{ color:RED, fontSize:11, padding:8 }}>Error: {err}</div>}

          {/* Rows */}
          {!loading && visible.map(row => {
            const isExp = expanded === row.id;
            const cls   = row.cls;
            const col   = CLASS_COLOR[cls];
            return (
              <div key={row.id || row.title} style={{ borderBottom:"1px solid #1a2a38" }}>
                <div
                  onClick={() => setExpanded(isExp ? null : (row.id || row.title))}
                  style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 4px", cursor:"pointer" }}
                >
                  <div>
                    <span style={{ color:"#c8d8e8", fontSize:11 }}>{row.title}</span>
                    {row.status && (
                      <span style={{ color:"#7a9ab8", fontSize:10, marginLeft:8 }}>[{row.status}]</span>
                    )}
                    {row.type && (
                      <span style={{ color:"#7a9ab8", fontSize:10, marginLeft:6 }}>{row.type}</span>
                    )}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{
                      background: col + "22",
                      color:       col,
                      border:      `1px solid ${col}55`,
                      borderRadius: 3,
                      padding:     "1px 7px",
                      fontSize:    9,
                      letterSpacing: 0.5,
                      ...(cls === "UNDOCUMENTED" ? { animation: "pulse-tkrops-row 1.4s infinite" } : {}),
                    }}>
                      {CLASS_LABEL[cls]}
                    </span>
                    <span style={{ color:"#7a9ab8", fontSize:10 }}>
                      KB:{row.kbMatches.length} RPT:{row.reportMatches.length}
                    </span>
                    <span style={{ color:"#555", fontSize:10 }}>{isExp ? "▲" : "▼"}</span>
                  </div>
                </div>

                {isExp && (
                  <div style={{ padding:"4px 12px 10px", background:"#0d1a26" }}>
                    {row.kbMatches.length > 0 && (
                      <div style={{ marginBottom:8 }}>
                        <div style={{ color:AMBER, fontSize:9, marginBottom:4 }}>KB ARTICLES ({row.kbMatches.length})</div>
                        {row.kbMatches.slice(0, 5).map((k, i) => (
                          <div key={i} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
                            <div style={{ fontSize:10, color:"#c8d8e8", flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                              {k.title || k.subject || k.name || "—"}
                            </div>
                            <div style={{ width:80, height:4, background:"#1a2a38", borderRadius:2, flexShrink:0 }}>
                              <div style={{ height:"100%", width:`${Math.min(100, 60 + i * 8)}%`, background:AMBER, borderRadius:2 }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {row.reportMatches.length > 0 && (
                      <div>
                        <div style={{ color:GREEN, fontSize:9, marginBottom:4 }}>REPORTS ({row.reportMatches.length})</div>
                        {row.reportMatches.slice(0, 5).map((r, i) => (
                          <div key={i} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
                            <div style={{ fontSize:10, color:"#c8d8e8", flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                              {r.title || r.subject || r.name || "—"}
                            </div>
                            <div style={{ width:80, height:4, background:"#1a2a38", borderRadius:2, flexShrink:0 }}>
                              <div style={{ height:"100%", width:`${Math.min(100, 60 + i * 8)}%`, background:GREEN, borderRadius:2 }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {row.kbMatches.length === 0 && row.reportMatches.length === 0 && (
                      <div style={{ color:"#555", fontSize:10 }}>No matching KB articles or reports found for this task.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {!loading && visible.length === 0 && rows.length > 0 && (
            <div style={{ color:"#555", fontSize:11, textAlign:"center", padding:12 }}>No tasks match filter.</div>
          )}

          <div style={{ color:"#3a4a5a", fontSize:9, marginTop:10, textAlign:"right" }}>
            auto-refresh every {REFRESH_MS / 1000}s · /entities/Task × /knowledge/ × /v1/reports
          </div>
        </div>
      )}
    </>
  );
}
