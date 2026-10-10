/**
 * F82 – Task × Dataset × Report Intelligence Execution Nexus (TDRNEX)
 * Correlates each Task against available Datasets AND published Reports.
 * Classifies each task by evidential backing:
 *   FULLY_EVIDENCED – matched by ≥1 dataset AND ≥1 report
 *   DATA_ONLY        – matched by ≥1 dataset, no report
 *   REPORT_ONLY      – matched by ≥1 report, no dataset
 *   UNVALIDATED      – no dataset or report backing (evidence gap)
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const BTN_LEFT   = 963060;
const Z          = 664;
const REFRESH_MS = 90_000;

const CY   = "#29E7FF";
const AM   = "#F5A623";
const GR   = "#00c878";
const RD   = "#FF3B3B";
const DIM  = "#3a5060";
const MONO = "'JetBrains Mono', 'Courier New', monospace";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
function authHdr() { return { Authorization: `Bearer ${API_KEY}` }; }

function kw(item) {
  return [
    item.name, item.title, item.description,
    item.subject, item.topic, item.category,
    item.type, item.kind, item.tags, item.label,
    item.summary, item.notes, item.dataset_name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function overlap(a, b) {
  const wa = a.split(/\W+/).filter(w => w.length > 3);
  const wb = new Set(b.split(/\W+/).filter(w => w.length > 3));
  return wa.filter(w => wb.has(w)).length;
}

function classify(task, datasets, reports) {
  const tk = kw(task);
  const matchedDatasets = datasets.filter(d => overlap(tk, kw(d)) >= 1);
  const matchedReports  = reports.filter(r => overlap(tk, kw(r)) >= 1);

  let cls;
  if (matchedDatasets.length > 0 && matchedReports.length > 0) cls = "FULLY_EVIDENCED";
  else if (matchedDatasets.length > 0)                          cls = "DATA_ONLY";
  else if (matchedReports.length > 0)                           cls = "REPORT_ONLY";
  else                                                          cls = "UNVALIDATED";

  return {
    id:              task.id || task.name || Math.random().toString(36).slice(2),
    name:            task.title || task.name || "Unnamed Task",
    status:          task.status || "unknown",
    priority:        task.priority || task.urgency || "",
    cls,
    matchedDatasets,
    matchedReports,
    expanded:        false,
  };
}

const CLS_COLOR = {
  FULLY_EVIDENCED: GR,
  DATA_ONLY:       CY,
  REPORT_ONLY:     AM,
  UNVALIDATED:     RD,
};
const CLS_LABEL = {
  FULLY_EVIDENCED: "FULLY EVIDENCED",
  DATA_ONLY:       "DATA ONLY",
  REPORT_ONLY:     "REPORT ONLY",
  UNVALIDATED:     "UNVALIDATED",
};

// ── Voice exports ────────────────────────────────────────────────────────────
const TDRNEX_RE =
  /\btdrnex\b|task evidence|task dataset|task report|unvalidated task|task backing|evidence gap|task data report/i;

export function isTdrnexQuery(text) {
  return TDRNEX_RE.test(text || "");
}

export async function buildTdrnexScript() {
  const base = apiBase();
  const h    = authHdr();
  const [tr, dr, rr] = await Promise.allSettled([
    fetch(`${base}/entities/Task`,   { headers: h }).then(r => r.ok ? r.json() : []),
    fetch(`${base}/v1/datasets`,     { headers: h }).then(r => r.ok ? r.json() : []),
    fetch(`${base}/v1/reports`,      { headers: h }).then(r => r.ok ? r.json() : []),
  ]);
  const tasks    = Array.isArray(tr.value) ? tr.value : (tr.value?.items ?? tr.value?.data ?? []);
  const datasets = Array.isArray(dr.value) ? dr.value : (dr.value?.items ?? dr.value?.datasets ?? []);
  const reports  = Array.isArray(rr.value) ? rr.value : (rr.value?.items ?? rr.value?.reports ?? []);
  const items    = tasks.map(t => classify(t, datasets, reports));
  const unv      = items.filter(i => i.cls === "UNVALIDATED").length;
  const full     = items.filter(i => i.cls === "FULLY_EVIDENCED").length;
  const parts    = ["Task evidence nexus report."];
  parts.push(`${items.length} tasks correlated against ${datasets.length} datasets and ${reports.length} reports.`);
  if (full > 0)  parts.push(`${full} tasks are fully evidenced with both dataset and report backing.`);
  if (unv > 0)   parts.push(`${unv} tasks have no evidence backing — these are validation blind spots.`);
  else           parts.push("All tasks have some evidence backing. Execution posture is strong.");
  return parts.join(" ");
}

// ── Component ────────────────────────────────────────────────────────────────
export default function TaskDatasetReportNexus() {
  const [open,    setOpen]    = useState(false);
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab,     setTab]     = useState("ALL");
  const [search,  setSearch]  = useState("");
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState("");
  const timerRef = useRef(null);
  const audioRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const h    = authHdr();
      const [tr, dr, rr] = await Promise.allSettled([
        fetch(`${base}/entities/Task`,   { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/v1/datasets`,     { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/v1/reports`,      { headers: h }).then(r => r.ok ? r.json() : []),
      ]);
      const tasks    = Array.isArray(tr.value) ? tr.value : (tr.value?.items ?? tr.value?.data ?? []);
      const datasets = Array.isArray(dr.value) ? dr.value : (dr.value?.items ?? dr.value?.datasets ?? []);
      const reports  = Array.isArray(rr.value) ? rr.value : (rr.value?.items ?? rr.value?.reports ?? []);
      setItems(tasks.map(t => classify(t, datasets, reports)));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => !o); if (!items.length) load(); };
    window.addEventListener("jarvis:tdrnex-toggle", toggle);
    return () => window.removeEventListener("jarvis:tdrnex-toggle", toggle);
  }, [items.length, load]);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  function toggleExpand(id) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, expanded: !i.expanded } : i));
  }

  async function assess() {
    setAssessing(true); setAssessText("");
    try {
      const script = await buildTdrnexScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHdr() },
        body: JSON.stringify({ message: `Task evidence nexus assessment: ${script}` }),
      });
      const d = await r.json();
      const txt = (d.answer || script).replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssessText(txt);
      try {
        const voice = getActiveVoice ? getActiveVoice() : "ash";
        const tr2 = await fetch(`${apiBase()}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: txt, voice }),
        });
        if (tr2.ok) {
          const url = URL.createObjectURL(await tr2.blob());
          try { audioRef.current?.pause(); } catch {}
          const a = new Audio(url);
          audioRef.current = a;
          a.onended = () => URL.revokeObjectURL(url);
          a.play().catch(() => {});
        }
      } catch {}
    } catch { setAssessText("Assessment unavailable."); }
    setAssessing(false);
  }

  const filtered = items
    .filter(i => tab === "ALL" || i.cls === tab)
    .filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()));

  const counts = {
    total: items.length,
    FULLY_EVIDENCED: items.filter(i => i.cls === "FULLY_EVIDENCED").length,
    DATA_ONLY:       items.filter(i => i.cls === "DATA_ONLY").length,
    REPORT_ONLY:     items.filter(i => i.cls === "REPORT_ONLY").length,
    UNVALIDATED:     items.filter(i => i.cls === "UNVALIDATED").length,
  };

  const btnBg = open ? `${RD}22` : "rgba(5,8,13,0.82)";

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => { setOpen(o => !o); if (!items.length) load(); }}
        title="F82: Task × Dataset × Report Execution Nexus"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z,
          background: btnBg, border: `1px solid ${open ? RD : DIM}`,
          color: open ? RD : DIM, borderRadius: 6, padding: "3px 8px",
          fontSize: 10, fontFamily: MONO, cursor: "pointer", letterSpacing: 1,
          boxShadow: open ? `0 0 14px ${RD}44` : "none",
          transition: "all 0.2s",
        }}
      >
        ◈ TDRNEX
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", left: 18, top: 54, zIndex: Z,
          width: "min(720px, 94vw)", maxHeight: "80vh",
          background: "rgba(4,8,14,0.97)", border: `1px solid ${RD}55`,
          borderRadius: 14, padding: "16px 18px", overflowY: "auto",
          fontFamily: MONO, color: "#DCEBF5",
          boxShadow: `0 0 80px ${RD}18, 0 24px 48px rgba(0,0,0,0.8)`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <span style={{ color: RD, fontSize: 14 }}>◈</span>
            <b style={{ color: RD, letterSpacing: 3, fontSize: 12, textShadow: `0 0 12px ${RD}` }}>
              TASK × DATASET × REPORT NEXUS
            </b>
            <span style={{ marginLeft: "auto", fontSize: 10, color: DIM }}>
              {loading ? "refreshing…" : `${items.length} tasks`}
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
            >✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {[
              { label: "TASKS",    val: counts.total,          color: CY },
              { label: "EVIDENCED",val: counts.FULLY_EVIDENCED, color: GR },
              { label: "DATA ONLY",val: counts.DATA_ONLY,       color: CY },
              { label: "RPT ONLY", val: counts.REPORT_ONLY,     color: AM },
              { label: "UNVALIDATED", val: counts.UNVALIDATED,  color: RD },
            ].map(t => (
              <div key={t.label} style={{
                background: `${t.color}0D`, border: `1px solid ${t.color}44`,
                borderRadius: 8, padding: "6px 12px", textAlign: "center", minWidth: 80,
              }}>
                <div style={{ fontSize: 18, color: t.color, fontWeight: 700 }}>{t.val}</div>
                <div style={{ fontSize: 9, color: DIM, letterSpacing: 1 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* Unvalidated warning */}
          {counts.UNVALIDATED > 0 && (
            <div style={{
              background: `${RD}0D`, border: `1px solid ${RD}44`, borderRadius: 8,
              padding: "8px 12px", marginBottom: 12, fontSize: 11, color: RD,
              animation: "tdrnex-pulse 2s ease-in-out infinite",
            }}>
              ⚠ {counts.UNVALIDATED} task{counts.UNVALIDATED !== 1 ? "s" : ""} have no dataset or report backing — evidence gap
            </div>
          )}

          {/* Filter tabs + search */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
            {["ALL", "FULLY_EVIDENCED", "DATA_ONLY", "REPORT_ONLY", "UNVALIDATED"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${CLS_COLOR[t] ?? CY}22` : "transparent",
                border: `1px solid ${tab === t ? (CLS_COLOR[t] ?? CY) : DIM}`,
                color: tab === t ? (CLS_COLOR[t] ?? CY) : DIM,
                borderRadius: 5, padding: "3px 10px", fontSize: 10,
                cursor: "pointer", letterSpacing: 1,
              }}>
                {t === "ALL" ? "ALL" : CLS_LABEL[t]}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search tasks…"
              style={{
                marginLeft: "auto", background: "transparent",
                border: `1px solid ${DIM}`, borderRadius: 5,
                padding: "3px 10px", fontSize: 11, color: "#DCEBF5",
                outline: "none", fontFamily: MONO, width: 160,
              }}
            />
          </div>

          {/* Task list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
            {filtered.length === 0 && (
              <div style={{ color: DIM, fontSize: 12, textAlign: "center", padding: "16px 0" }}>
                {loading ? "Loading…" : "No tasks match"}
              </div>
            )}
            {filtered.map(item => (
              <div key={item.id} style={{
                background: "rgba(8,14,24,0.6)", border: `1px solid ${CLS_COLOR[item.cls]}33`,
                borderRadius: 8, overflow: "hidden",
              }}>
                <div
                  onClick={() => toggleExpand(item.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 12px", cursor: "pointer",
                    borderLeft: `3px solid ${CLS_COLOR[item.cls]}`,
                  }}
                >
                  <span style={{
                    fontSize: 10, color: CLS_COLOR[item.cls],
                    background: `${CLS_COLOR[item.cls]}22`,
                    borderRadius: 4, padding: "2px 7px", letterSpacing: 1, flexShrink: 0,
                  }}>
                    {CLS_LABEL[item.cls]}
                  </span>
                  <span style={{ flex: 1, fontSize: 12, color: "#DCEBF5", letterSpacing: 0.5 }}>
                    {item.name}
                  </span>
                  {item.status && (
                    <span style={{ fontSize: 9, color: DIM, letterSpacing: 1 }}>
                      {item.status.toUpperCase()}
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: DIM }}>{item.expanded ? "▲" : "▼"}</span>
                </div>

                {item.expanded && (
                  <div style={{ padding: "8px 12px", borderTop: `1px solid ${DIM}33` }}>
                    {/* Matched datasets */}
                    {item.matchedDatasets.length > 0 ? (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 10, color: CY, letterSpacing: 1, marginBottom: 4 }}>
                          DATASETS ({item.matchedDatasets.length})
                        </div>
                        {item.matchedDatasets.slice(0, 5).map((d, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                            <span style={{ fontSize: 11, color: "#8AAECC", flex: 1 }}>
                              {d.name || d.title || d.dataset_name || "Dataset"}
                            </span>
                            <div style={{ width: 60, height: 4, background: DIM, borderRadius: 2 }}>
                              <div style={{ width: "70%", height: "100%", background: CY, borderRadius: 2 }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 10, color: DIM, marginBottom: 8 }}>No matching datasets</div>
                    )}

                    {/* Matched reports */}
                    {item.matchedReports.length > 0 ? (
                      <div>
                        <div style={{ fontSize: 10, color: GR, letterSpacing: 1, marginBottom: 4 }}>
                          REPORTS ({item.matchedReports.length})
                        </div>
                        {item.matchedReports.slice(0, 5).map((r, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                            <span style={{ fontSize: 11, color: "#8AAECC", flex: 1 }}>
                              {r.title || r.name || "Report"}
                            </span>
                            <div style={{ width: 60, height: 4, background: DIM, borderRadius: 2 }}>
                              <div style={{ width: "65%", height: "100%", background: GR, borderRadius: 2 }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 10, color: DIM }}>No matching reports</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Assess */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? `${CY}22` : `${CY}18`,
                border: `1px solid ${CY}55`, color: CY,
                borderRadius: 7, padding: "6px 18px",
                fontSize: 11, cursor: assessing ? "not-allowed" : "pointer",
                letterSpacing: 1, fontFamily: MONO,
              }}
            >
              {assessing ? "◍ assessing…" : "▶ ASSESS"}
            </button>
            {assessText && (
              <span style={{ fontSize: 11, color: "#8AAECC", flex: 1 }}>{assessText}</span>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes tdrnex-pulse {
          0%,100% { opacity:1; }
          50%      { opacity:0.55; }
        }
      `}</style>
    </>
  );
}
