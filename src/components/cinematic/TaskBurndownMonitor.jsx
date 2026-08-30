/**
 * TaskBurndownMonitor (F461)
 * Polls /entities/Task every 60 s, accumulates a rolling completion history
 * in localStorage (up to 30 snapshots), and renders a burndown chart with
 * velocity metrics. Wires to /v1/jarvis/agent/chat for AI assessment.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const STORAGE_KEY = "jarvis:tbm:history";
const MAX_HISTORY = 30;
const CY = "#29E7FF";
const GR = "#00c878";
const AM = "#f59e0b";
const RD = "#F43F5E";
const MONO = "'JetBrains Mono','Courier New',monospace";
const API_KEY =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_KEY) ||
  "dev-key";

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(h) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(h.slice(-MAX_HISTORY)));
  } catch {}
}

function computeVelocity(history) {
  if (history.length < 2) return 0;
  const recent = history.slice(-5);
  const first = recent[0];
  const last = recent[recent.length - 1];
  const dtMs = last.ts - first.ts;
  if (dtMs <= 0) return 0;
  const dtHrs = dtMs / 3_600_000;
  const deltaDone = last.done - first.done;
  return dtHrs > 0 ? (deltaDone / dtHrs).toFixed(2) : 0;
}

function Sparkline({ history, width = 160, height = 30 }) {
  if (history.length < 2) return null;
  const vals = history.map((h) => h.done);
  const max = Math.max(...vals, 1);
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * width;
    const y = height - (v / max) * height;
    return `${x},${y}`;
  });
  const polyline = pts.join(" ");
  const area = `${pts[0]} ${pts.join(" ")} ${width},${height} 0,${height}`;
  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
      <polygon points={area} fill={`${GR}18`} />
      <polyline points={polyline} fill="none" stroke={GR} strokeWidth={1.5} />
      {vals.slice(-1).map((v, _) => {
        const x = width;
        const y = height - (v / max) * height;
        return <circle key="dot" cx={x} cy={y} r={3} fill={GR} />;
      })}
    </svg>
  );
}

function StatTile({ label, value, accent = CY }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${accent}22`,
        borderRadius: 7,
        padding: "6px 10px",
        minWidth: 70,
        textAlign: "center",
      }}
    >
      <div style={{ color: accent, fontFamily: MONO, fontSize: 15, fontWeight: 700 }}>
        {value}
      </div>
      <div style={{ color: "#4a6070", fontFamily: MONO, fontSize: 9, letterSpacing: 1.2, marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

export function isTbmQuery(q) {
  return /\b(tbm|task\s+burn|burndown|sprint\s*(status|progress)?|task\s+velocity|completion\s+rate|task\s+completion|task\s+progress\s+chart)\b/i.test(
    q || ""
  );
}

export function buildTbmScript() {
  window.dispatchEvent(new CustomEvent("jarvis:tbm-toggle"));
}

export default function TaskBurndownMonitor() {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [history, setHistory] = useState(() => loadHistory());
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${apiBase()}/entities/Task`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) return;
      const d = await r.json();
      const list = Array.isArray(d) ? d : d.items || d.data || [];
      setTasks(list);

      const done = list.filter((t) =>
        /done|complete|closed|resolved/i.test(String(t.status || ""))
      ).length;

      setHistory((prev) => {
        const next = [
          ...prev,
          { ts: Date.now(), total: list.length, done },
        ].slice(-MAX_HISTORY);
        saveHistory(next);
        return next;
      });
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTasks();
    timerRef.current = setInterval(fetchTasks, 60_000);
    return () => clearInterval(timerRef.current);
  }, [fetchTasks]);

  useEffect(() => {
    const h = () => setOpen((v) => !v);
    window.addEventListener("jarvis:tbm-toggle", h);
    return () => window.removeEventListener("jarvis:tbm-toggle", h);
  }, []);

  const total = tasks.length;
  const done = tasks.filter((t) =>
    /done|complete|closed|resolved/i.test(String(t.status || ""))
  ).length;
  const inProgress = tasks.filter((t) =>
    /in.?progress|active|running|started/i.test(String(t.status || ""))
  ).length;
  const blocked = tasks.filter((t) =>
    /block|stuck|hold|paused/i.test(String(t.status || ""))
  ).length;
  const pending = total - done - inProgress - blocked;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const velocity = computeVelocity(history);
  const remaining = total - done;
  const eta =
    velocity > 0 ? `~${(remaining / velocity).toFixed(1)} h` : "N/A";

  const FILTERS = ["ALL", "DONE", "IN_PROGRESS", "PENDING", "BLOCKED"];
  const filtered = tasks.filter((t) => {
    if (filter === "ALL") return true;
    const s = String(t.status || "").toLowerCase();
    if (filter === "DONE") return /done|complete|closed|resolved/.test(s);
    if (filter === "IN_PROGRESS") return /in.?progress|active|running|started/.test(s);
    if (filter === "BLOCKED") return /block|stuck|hold|paused/.test(s);
    if (filter === "PENDING") {
      return (
        !/done|complete|closed|resolved|in.?progress|active|running|started|block|stuck|hold|paused/.test(
          s
        )
      );
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    setAssessment("");
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          message: `Task burndown analysis: ${total} tasks total, ${done} done (${pct}%), ${inProgress} in-progress, ${blocked} blocked, ${pending} pending. Velocity: ${velocity} tasks/hr. ETA to completion: ${eta}. Provide a 2-sentence strategic assessment.`,
        }),
      });
      const d = await r.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssessment(text);
      if (text) {
        window.dispatchEvent(
          new CustomEvent("jarvis:speak-dossier", { detail: { text } })
        );
      }
    } catch {}
    setAssessing(false);
  }

  const badgeAccent = blocked > 0 ? RD : pct >= 80 ? GR : AM;

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Task Burndown Monitor (F461)"
        style={{
          position: "fixed",
          bottom: 8,
          left: 8640,
          zIndex: 68,
          background: open ? "rgba(41,231,255,0.15)" : "rgba(5,12,20,0.75)",
          border: `1px solid ${open ? CY : "rgba(41,231,255,0.2)"}`,
          color: CY,
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: 1.2,
          padding: "4px 8px",
          borderRadius: 6,
          cursor: "pointer",
          whiteSpace: "nowrap",
          backdropFilter: "blur(6px)",
        }}
      >
        ⬡ TBM
        {blocked > 0 && (
          <span
            style={{
              marginLeft: 5,
              background: RD,
              color: "#fff",
              borderRadius: 4,
              padding: "0 4px",
              fontSize: 9,
              fontWeight: 700,
            }}
          >
            {blocked}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 36,
            left: 8540,
            width: 440,
            maxHeight: "72vh",
            display: "flex",
            flexDirection: "column",
            background: "rgba(4,10,18,0.96)",
            border: `1px solid ${CY}33`,
            borderRadius: 12,
            boxShadow: `0 0 60px ${CY}15,0 20px 50px rgba(0,0,0,0.8)`,
            fontFamily: MONO,
            zIndex: 2000,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              borderBottom: `1px solid ${CY}22`,
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700, flex: 1 }}>
              TASK BURNDOWN
            </span>
            {loading && (
              <span style={{ color: "#3a5060", fontSize: 9 }}>SYNCING…</span>
            )}
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none",
                border: "none",
                color: "#3a5060",
                cursor: "pointer",
                fontSize: 14,
                lineHeight: 1,
                padding: 0,
              }}
            >
              ×
            </button>
          </div>

          {/* Stats row */}
          <div
            style={{
              padding: "10px 14px",
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <StatTile label="TOTAL" value={total} accent={CY} />
            <StatTile label="DONE" value={done} accent={GR} />
            <StatTile label="IN PROG" value={inProgress} accent={CY} />
            <StatTile label="BLOCKED" value={blocked} accent={blocked > 0 ? RD : "#3a5060"} />
            <StatTile label="PENDING" value={pending} accent={AM} />
          </div>

          {/* Burndown progress bar */}
          <div style={{ padding: "0 14px 10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ color: "#4a6070", fontSize: 9, letterSpacing: 1.5 }}>COMPLETION</span>
              <span style={{ color: GR, fontSize: 10, fontWeight: 700 }}>{pct}%</span>
            </div>
            <div
              style={{
                height: 6,
                background: "rgba(255,255,255,0.06)",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: `linear-gradient(90deg,${GR},${CY})`,
                  borderRadius: 3,
                  transition: "width 0.5s ease",
                }}
              />
            </div>
          </div>

          {/* Sparkline + velocity */}
          <div
            style={{
              padding: "0 14px 10px",
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <Sparkline history={history} width={160} height={28} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#4a6070", fontSize: 9, letterSpacing: 1.2 }}>VELOCITY</span>
                <span style={{ color: GR, fontSize: 10 }}>{velocity} /hr</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#4a6070", fontSize: 9, letterSpacing: 1.2 }}>ETA</span>
                <span style={{ color: velocity > 0 ? CY : "#4a6070", fontSize: 10 }}>{eta}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#4a6070", fontSize: 9, letterSpacing: 1.2 }}>SNAPSHOTS</span>
                <span style={{ color: "#4a6070", fontSize: 10 }}>{history.length}</span>
              </div>
            </div>
          </div>

          {/* Filter tabs */}
          <div
            style={{
              borderTop: `1px solid ${CY}11`,
              borderBottom: `1px solid ${CY}11`,
              padding: "5px 14px",
              display: "flex",
              gap: 4,
              flexWrap: "wrap",
            }}
          >
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? `${CY}18` : "transparent",
                  border: `1px solid ${filter === f ? CY : "rgba(41,231,255,0.12)"}`,
                  color: filter === f ? CY : "#4a6070",
                  borderRadius: 4,
                  padding: "2px 7px",
                  fontSize: 9,
                  letterSpacing: 1.2,
                  cursor: "pointer",
                  fontFamily: MONO,
                }}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Task list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 14px" }}>
            {filtered.length === 0 && (
              <div style={{ color: "#3a5060", fontSize: 11, textAlign: "center", padding: "14px 0" }}>
                No tasks
              </div>
            )}
            {filtered.slice(0, 40).map((t, i) => {
              const s = String(t.status || "pending").toLowerCase();
              const accent =
                /done|complete|closed|resolved/.test(s)
                  ? GR
                  : /block|stuck|hold/.test(s)
                  ? RD
                  : /in.?progress|active|running/.test(s)
                  ? CY
                  : AM;
              return (
                <div
                  key={t.id || i}
                  style={{
                    borderBottom: "1px solid rgba(255,255,255,0.03)",
                    padding: "5px 0",
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: accent,
                      flexShrink: 0,
                      marginTop: 4,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        color: "#c0dce8",
                        fontSize: 11,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t.title || t.name || t.id || "—"}
                    </div>
                    <div style={{ color: "#3a5060", fontSize: 9, marginTop: 1 }}>
                      {(t.priority || "").toUpperCase() || "NORMAL"} · {(t.status || "PENDING").toUpperCase()}
                    </div>
                  </div>
                </div>
              );
            })}
            {filtered.length > 40 && (
              <div style={{ color: "#3a5060", fontSize: 9, textAlign: "center", paddingTop: 6 }}>
                +{filtered.length - 40} more
              </div>
            )}
          </div>

          {/* Assess footer */}
          <div style={{ borderTop: `1px solid ${CY}11`, padding: "8px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? "rgba(41,231,255,0.06)" : "rgba(41,231,255,0.12)",
                border: `1px solid ${CY}44`,
                color: CY,
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: 1.2,
                padding: "5px 10px",
                borderRadius: 6,
                cursor: assessing ? "default" : "pointer",
                alignSelf: "flex-start",
              }}
            >
              {assessing ? "ASSESSING…" : "▶ ASSESS"}
            </button>
            {assessment && (
              <div style={{ color: "#88aabb", fontSize: 10, lineHeight: 1.5, fontFamily: MONO }}>
                {assessment}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
