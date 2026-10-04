/**
 * TaskPriorityQuadrant — F51.
 * Polls /entities/Task → classifies tasks into an Eisenhower 2×2 quadrant:
 *   Q1 DO FIRST  — high priority + urgent
 *   Q2 PLAN      — high priority + not urgent
 *   Q3 DELEGATE  — low priority  + urgent
 *   Q4 SKIP      — low priority  + not urgent
 * Urgency: task.urgent === true OR days_until_due <= 3 OR due_date within 3 days.
 * Priority: high/critical → high; everything else → low.
 * Stat tiles: TOTAL / DO FIRST / PLAN / DELEGATE.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts.
 * ◈ TSKQUAD button left:937260 bottom:8 zIndex:634.
 * Voice: "task quadrant"/"priority quadrant"/"eisenhower"/"tskquad"/"urgent tasks".
 * 90-s auto-refresh. Additive only — mounted via App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const CY  = "#29E7FF";
const GR  = "#4ADE80";
const AM  = "#F59E0B";
const RD  = "#EF4444";
const PU  = "#A78BFA";
const DIM = "#1A2A36";
const BG  = "rgba(0,10,20,0.96)";
const MN  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
const REFRESH_MS = 90_000;
const BTN_LEFT   = 937260;
const Z          = 634;

const TSKQUAD_RE =
  /\btask\s+quadrant|priority\s+quadrant|eisenhower|tskquad\b|urgent\s+tasks?\s+matrix/i;

export function isTskquadQuery(text) {
  return TSKQUAD_RE.test(text || "");
}

function authHdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

async function fetchTasks() {
  const r = await fetch(`${apiBase()}/entities/Task`, { headers: authHdr() });
  if (!r.ok) throw new Error(`/entities/Task ${r.status}`);
  const d = await r.json();
  const arr = Array.isArray(d) ? d
    : Array.isArray(d?.data)  ? d.data
    : Array.isArray(d?.items) ? d.items
    : Array.isArray(d?.tasks) ? d.tasks
    : [];
  return arr;
}

function isHighPriority(task) {
  const p = (task.priority || task.importance || "").toLowerCase();
  return p === "high" || p === "critical" || p === "urgent";
}

function isUrgent(task) {
  if (task.urgent === true) return true;
  const due = task.due_date || task.deadline || task.due_at;
  if (!due) return false;
  const d = new Date(due);
  if (isNaN(d)) return false;
  const daysLeft = (d - Date.now()) / 86_400_000;
  return daysLeft >= 0 && daysLeft <= 3;
}

function classify(task) {
  const hi = isHighPriority(task);
  const ur = isUrgent(task);
  if (hi && ur)  return "Q1";
  if (hi && !ur) return "Q2";
  if (!hi && ur) return "Q3";
  return "Q4";
}

const Q_LABEL = {
  Q1: "DO FIRST",
  Q2: "PLAN",
  Q3: "DELEGATE",
  Q4: "SKIP",
};
const Q_COLOR = { Q1: RD, Q2: GR, Q3: AM, Q4: DIM };
const Q_BG    = {
  Q1: "rgba(239,68,68,0.07)",
  Q2: "rgba(74,222,128,0.07)",
  Q3: "rgba(245,158,11,0.07)",
  Q4: "rgba(26,42,54,0.6)",
};
const Q_BORDER = {
  Q1: `1px solid ${RD}44`,
  Q2: `1px solid ${GR}44`,
  Q3: `1px solid ${AM}44`,
  Q4: "1px solid transparent",
};

export async function buildTskquadScript() {
  try {
    const tasks = await fetchTasks();
    if (!tasks.length)
      return "No tasks found, sir. Task queue is empty.";
    const counts = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
    tasks.forEach((t) => counts[classify(t)]++);
    return (
      `Task Priority Quadrant: ${tasks.length} total tasks. ` +
      `DO FIRST (critical + urgent): ${counts.Q1}. ` +
      `PLAN (high priority, not urgent): ${counts.Q2}. ` +
      `DELEGATE (low priority, urgent): ${counts.Q3}. ` +
      `SKIP (low priority, not urgent): ${counts.Q4}. ` +
      (counts.Q1 > 0
        ? `There are ${counts.Q1} tasks demanding immediate attention, sir.`
        : "No immediate critical tasks at this time.")
    );
  } catch {
    return "Task priority quadrant is unavailable. Backend may be offline.";
  }
}

const TILE = {
  background: "rgba(0,255,200,0.05)",
  border: "1px solid rgba(41,231,255,0.2)",
  borderRadius: 6,
  padding: "6px 14px",
  minWidth: 80,
  textAlign: "center",
};

function Tile({ label, value, color = CY }) {
  return (
    <div style={TILE}>
      <div style={{ color, fontSize: 20, fontWeight: 700, fontFamily: MN }}>{value}</div>
      <div style={{ color: "#6B8CA3", fontSize: 9, letterSpacing: 1 }}>{label}</div>
    </div>
  );
}

function QuadPanel({ qid, tasks, expanded, onToggle }) {
  const color  = Q_COLOR[qid];
  const label  = Q_LABEL[qid];
  return (
    <div
      onClick={onToggle}
      style={{
        background:   Q_BG[qid],
        border:       Q_BORDER[qid],
        borderRadius: 7,
        padding:      "10px 12px",
        cursor:       "pointer",
        minHeight:    80,
        position:     "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color, fontSize: 11, fontFamily: MN, letterSpacing: 1 }}>
          {qid} · {label}
        </span>
        <span style={{
          background: color,
          color: "#000",
          borderRadius: "50%",
          width: 22,
          height: 22,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
          fontFamily: MN,
        }}>
          {tasks.length}
        </span>
      </div>
      {expanded && tasks.length > 0 && (
        <div style={{ marginTop: 8, maxHeight: 120, overflowY: "auto" }}>
          {tasks.map((t, i) => (
            <div key={t.id || i} style={{
              fontSize: 10,
              color: "#B0C8D8",
              fontFamily: MN,
              padding: "2px 0",
              borderTop: i ? "1px solid rgba(255,255,255,0.05)" : "none",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}>
              {t.title || t.name || t.description || `Task ${i + 1}`}
            </div>
          ))}
        </div>
      )}
      {tasks.length === 0 && (
        <div style={{ color: "#4A6070", fontSize: 10, marginTop: 6, fontFamily: MN }}>
          No tasks
        </div>
      )}
    </div>
  );
}

export default function TaskPriorityQuadrant() {
  const [open,      setOpen]      = useState(false);
  const [quadrants, setQuadrants] = useState({ Q1: [], Q2: [], Q3: [], Q4: [] });
  const [total,     setTotal]     = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState("");
  const [assessing, setAssessing] = useState(false);
  const [expanded,  setExpanded]  = useState({});
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const tasks = await fetchTasks();
      const q = { Q1: [], Q2: [], Q3: [], Q4: [] };
      tasks.forEach((t) => q[classify(t)].push(t));
      setQuadrants(q);
      setTotal(tasks.length);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => {
      setOpen((o) => {
        if (!o) load();
        return !o;
      });
    };
    window.addEventListener("jarvis:tskquad-toggle", toggle);
    return () => window.removeEventListener("jarvis:tskquad-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const handleAssess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = await buildTskquadScript();
      const voice  = getActiveVoice();
      const res = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ message: `Task Priority Quadrant assessment: ${script}` }),
      });
      const j = await res.json();
      const reply = j.response || j.message || j.answer || script;
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: reply, voice },
      }));
    } catch {
      const fallback = await buildTskquadScript().catch(
        () => "Task quadrant assessment unavailable."
      );
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: fallback, voice: getActiveVoice() },
      }));
    } finally {
      setAssessing(false);
    }
  }, []);

  const toggleExpand = (qid) =>
    setExpanded((e) => ({ ...e, [qid]: !e[qid] }));

  const q1Pulse = quadrants.Q1.length > 0;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => { setOpen((o) => { if (!o) load(); return !o; }); }}
        style={{
          position:   "fixed",
          left:       BTN_LEFT,
          bottom:     8,
          zIndex:     Z,
          background: open ? "rgba(239,68,68,0.18)" : "rgba(0,10,20,0.7)",
          border:     `1px solid ${open ? RD : "rgba(239,68,68,0.35)"}`,
          color:      open ? RD : "#6B8CA3",
          borderRadius: 4,
          padding:    "3px 8px",
          fontSize:   10,
          cursor:     "pointer",
          fontFamily: MN,
          letterSpacing: 1,
          whiteSpace: "nowrap",
          animation:  q1Pulse && !open ? "tskquad-pulse 1.4s ease-in-out infinite" : "none",
        }}
        title="Task Priority Quadrant (TSKQUAD)"
      >
        ◈ TSKQUAD{total > 0 && (
          <span style={{ color: quadrants.Q1.length ? RD : CY, marginLeft: 4 }}>{total}</span>
        )}
      </button>

      <style>{`
        @keyframes tskquad-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
          50%      { box-shadow: 0 0 0 5px rgba(239,68,68,0); }
        }
      `}</style>

      {/* Panel */}
      {open && (
        <div
          style={{
            position:   "fixed",
            left:       "50%",
            top:        "50%",
            transform:  "translate(-50%,-50%)",
            zIndex:     Z + 1,
            width:      540,
            maxHeight:  620,
            background: BG,
            border:     `1px solid ${CY}44`,
            borderRadius: 10,
            boxShadow:  `0 0 40px ${CY}22`,
            display:    "flex",
            flexDirection: "column",
            overflow:   "hidden",
            fontFamily: MN,
          }}
        >
          {/* Header */}
          <div style={{
            display:    "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding:    "10px 16px",
            borderBottom: `1px solid ${CY}33`,
          }}>
            <span style={{ color: CY, fontSize: 13, letterSpacing: 2 }}>
              ◈ TASK PRIORITY QUADRANT
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleAssess}
                disabled={assessing}
                style={{
                  background: assessing ? "#0A2030" : "rgba(41,231,255,0.1)",
                  border:     `1px solid ${CY}55`,
                  color:      assessing ? "#6B8CA3" : CY,
                  borderRadius: 4,
                  padding:    "3px 10px",
                  fontSize:   10,
                  cursor:     assessing ? "default" : "pointer",
                  letterSpacing: 1,
                  fontFamily: MN,
                }}
              >
                {assessing ? "…" : "▶ ASSESS"}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "transparent",
                  border:     "none",
                  color:      "#6B8CA3",
                  fontSize:   16,
                  cursor:     "pointer",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "12px 16px", flexWrap: "wrap" }}>
            <Tile label="TOTAL"     value={loading ? "…" : total}                   color={CY} />
            <Tile label="DO FIRST"  value={loading ? "…" : quadrants.Q1.length}     color={RD} />
            <Tile label="PLAN"      value={loading ? "…" : quadrants.Q2.length}     color={GR} />
            <Tile label="DELEGATE"  value={loading ? "…" : quadrants.Q3.length}     color={AM} />
          </div>

          {/* Axis label header */}
          <div style={{
            display:      "grid",
            gridTemplateColumns: "1fr 1fr",
            gap:          4,
            padding:      "0 16px",
            marginBottom: 4,
          }}>
            <div style={{ textAlign: "center", fontSize: 9, color: "#6B8CA3", letterSpacing: 1 }}>
              HIGH PRIORITY →
            </div>
            <div style={{ textAlign: "center", fontSize: 9, color: "#6B8CA3", letterSpacing: 1 }}>
              LOW PRIORITY →
            </div>
          </div>

          {/* Error */}
          {err && (
            <div style={{ color: RD, fontSize: 11, padding: "4px 16px" }}>
              ⚠ {err}
            </div>
          )}

          {/* 2×2 Grid */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 12px" }}>
            {loading && total === 0 ? (
              <div style={{ color: "#6B8CA3", fontSize: 11, padding: "20px 0", textAlign: "center" }}>
                Loading tasks…
              </div>
            ) : (
              <>
                {/* Urgency row label left */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  <div style={{ position: "relative" }}>
                    <div style={{
                      position: "absolute",
                      left: -12,
                      top: "50%",
                      transform: "translateY(-50%) rotate(-90deg)",
                      fontSize: 8,
                      color: "#6B8CA3",
                      letterSpacing: 1,
                      whiteSpace: "nowrap",
                    }}>
                      URGENT
                    </div>
                    <QuadPanel
                      qid="Q1"
                      tasks={quadrants.Q1}
                      expanded={expanded.Q1}
                      onToggle={() => toggleExpand("Q1")}
                    />
                  </div>
                  <QuadPanel
                    qid="Q3"
                    tasks={quadrants.Q3}
                    expanded={expanded.Q3}
                    onToggle={() => toggleExpand("Q3")}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div style={{ position: "relative" }}>
                    <div style={{
                      position: "absolute",
                      left: -12,
                      top: "50%",
                      transform: "translateY(-50%) rotate(-90deg)",
                      fontSize: 8,
                      color: "#6B8CA3",
                      letterSpacing: 1,
                      whiteSpace: "nowrap",
                    }}>
                      NOT URGENT
                    </div>
                    <QuadPanel
                      qid="Q2"
                      tasks={quadrants.Q2}
                      expanded={expanded.Q2}
                      onToggle={() => toggleExpand("Q2")}
                    />
                  </div>
                  <QuadPanel
                    qid="Q4"
                    tasks={quadrants.Q4}
                    expanded={expanded.Q4}
                    onToggle={() => toggleExpand("Q4")}
                  />
                </div>
                <div style={{
                  marginTop:  6,
                  color:      "#6B8CA3",
                  fontSize:   9,
                  textAlign:  "center",
                  letterSpacing: 1,
                }}>
                  Click a quadrant to expand task list
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div style={{
            borderTop:   `1px solid ${CY}22`,
            padding:     "6px 16px",
            color:       "#6B8CA3",
            fontSize:    9,
            letterSpacing: 1,
          }}>
            AUTO-REFRESH 90 s · SOURCE /entities/Task · URGENCY: urgent=true OR due ≤ 3 days
            {loading && " · LOADING…"}
          </div>
        </div>
      )}
    </>
  );
}
