/**
 * TaskCompletionRate — F299
 * Polls /entities/Task every 60 s; tracks done/total completion rate in localStorage
 * rolling history (max 20 readings); rate gauge + sparkline + stat tiles;
 * ◎ TRATE toggle; voice "task rate"/"task completion"/"trate".
 * Additive-only — no edits to CinematicShell/CinematicHome/JarvisLoader.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const GR = "#00FF9F";
const AM = "#FFB800";
const RD = "#FF4444";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";
const HISTORY_KEY = "jarvis_task_rate_history";
const MAX_HISTORY = 20;
const POLL_MS = 60_000;

const TASK_RATE_RE =
  /\btask.?(rate|completion|progress|done|finish)\b|\bhow many tasks\b|\btrate\b|\btask.?percent\b/i;

export function isTaskRateQuery(text) {
  return TASK_RATE_RE.test(text || "");
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveHistory(h) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-MAX_HISTORY)));
  } catch {}
}

function rateColor(rate) {
  if (rate >= 60) return GR;
  if (rate >= 30) return AM;
  return RD;
}

export async function buildTaskRateScript() {
  const base = apiBase();
  const r = await fetch(`${base}/entities/Task`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) return "Task data unavailable, sir.";
  const data = await r.json();
  const tasks = Array.isArray(data) ? data : (data.tasks || data.items || data.data || []);
  const total = tasks.length;
  if (!total) return "No tasks found in the mission catalog, sir.";
  const done = tasks.filter(
    (t) => (t.status || "").toLowerCase() === "done" || (t.status || "").toLowerCase() === "completed",
  ).length;
  const rate = Math.round((done / total) * 100);
  const inProg = tasks.filter((t) => (t.status || "").toLowerCase() === "in_progress").length;
  return `Task completion rate stands at ${rate} percent, sir. ${done} of ${total} missions complete, ${inProg} in progress.`;
}

function Sparkline({ history, color }) {
  if (history.length < 2) return null;
  const vals = history.map((h) => h.rate);
  const min = Math.min(...vals);
  const max = Math.max(...vals, min + 1);
  const W = 120, H = 36;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * W;
    const y = H - ((v - min) / (max - min)) * (H - 4) - 2;
    return `${x},${y}`;
  });
  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RateGauge({ rate, color }) {
  const r = 28, cx = 36, cy = 36;
  const circ = 2 * Math.PI * r;
  const dash = (rate / 100) * circ;
  return (
    <svg width={72} height={72}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={5} />
      <circle
        cx={cx} cy={cy} r={r} fill="none"
        stroke={color} strokeWidth={5}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text
        x={cx} y={cy + 5}
        textAnchor="middle"
        fill={color}
        fontSize="13"
        fontFamily="monospace"
        fontWeight="bold"
      >
        {rate}%
      </text>
    </svg>
  );
}

export default function TaskCompletionRate() {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState(loadHistory);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const pollRef = useRef(null);

  const fetchTasks = useCallback(async () => {
    try {
      const base = apiBase();
      const r = await fetch(`${base}/entities/Task`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) return;
      const data = await r.json();
      const tasks = Array.isArray(data)
        ? data
        : (data.tasks || data.items || data.data || []);
      const total = tasks.length;
      const done = tasks.filter(
        (t) =>
          (t.status || "").toLowerCase() === "done" ||
          (t.status || "").toLowerCase() === "completed",
      ).length;
      const inProg = tasks.filter(
        (t) => (t.status || "").toLowerCase() === "in_progress",
      ).length;
      const blocked = tasks.filter(
        (t) => (t.status || "").toLowerCase() === "blocked",
      ).length;
      const pending = total - done - inProg - blocked;
      const rate = total ? Math.round((done / total) * 100) : 0;
      const entry = { rate, done, inProg, blocked, pending, total, ts: Date.now() };
      setStats(entry);
      setHistory((prev) => {
        const next = [...prev, entry].slice(-MAX_HISTORY);
        saveHistory(next);
        return next;
      });
    } catch {}
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:task-rate-toggle", onToggle);
    return () => window.removeEventListener("jarvis:task-rate-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchTasks().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchTasks, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [open, fetchTasks]);

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildTaskRateScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const answer = (d.answer || script).replace(/<<ACTION:[^>]*>>/g, "").trim();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch {
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", {
          detail: { text: "Task assessment unavailable." },
        }),
      );
    }
    setAssessing(false);
  }

  const rate = stats?.rate ?? 0;
  const color = rateColor(rate);
  const prev = history.length >= 2 ? history[history.length - 2]?.rate : null;
  const delta = prev != null ? rate - prev : null;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Task Completion Rate"
        style={{
          position: "fixed",
          left: 57880,
          bottom: 8,
          zIndex: 112,
          background: open ? CY : "rgba(5,8,13,0.75)",
          border: `1px solid ${open ? CY : "rgba(41,231,255,0.35)"}`,
          color: open ? "#000" : CY,
          fontFamily: "monospace",
          fontSize: 10,
          padding: "3px 7px",
          borderRadius: 4,
          cursor: "pointer",
          letterSpacing: "0.05em",
        }}
      >
        ◎ TRATE
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            right: 18,
            bottom: 90,
            zIndex: 9100,
            width: 300,
            background: "rgba(5,8,13,0.92)",
            border: `1px solid ${CY}`,
            borderRadius: 8,
            padding: 14,
            fontFamily: "monospace",
            color: CY,
            boxShadow: `0 0 18px rgba(41,231,255,0.18)`,
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 11, letterSpacing: "0.12em", fontWeight: "bold" }}>
              ◎ TASK COMPLETION RATE
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none",
                border: "none",
                color: CY,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              ✕
            </button>
          </div>

          {loading && !stats && (
            <div style={{ textAlign: "center", fontSize: 11, opacity: 0.6, padding: "12px 0" }}>
              fetching tasks…
            </div>
          )}

          {stats && (
            <>
              {/* Gauge + delta */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
                <RateGauge rate={rate} color={color} />
                <div>
                  <div style={{ fontSize: 20, fontWeight: "bold", color, lineHeight: 1 }}>
                    {rate}%
                  </div>
                  <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>completion rate</div>
                  {delta != null && (
                    <div
                      style={{
                        fontSize: 10,
                        color: delta > 0 ? GR : delta < 0 ? RD : AM,
                        marginTop: 3,
                      }}
                    >
                      {delta > 0 ? "▲" : delta < 0 ? "▼" : "─"}{" "}
                      {Math.abs(delta)}% vs prev
                    </div>
                  )}
                </div>
              </div>

              {/* Stat tiles */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
                {[
                  { label: "DONE", val: stats.done, col: GR },
                  { label: "ACTIVE", val: stats.inProg, col: CY },
                  { label: "BLOCKED", val: stats.blocked, col: RD },
                  { label: "PENDING", val: stats.pending, col: AM },
                ].map(({ label, val, col }) => (
                  <div
                    key={label}
                    style={{
                      background: "rgba(41,231,255,0.05)",
                      borderRadius: 4,
                      padding: "5px 4px",
                      textAlign: "center",
                      border: `1px solid rgba(41,231,255,0.12)`,
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: "bold", color: col }}>{val}</div>
                    <div style={{ fontSize: 8, opacity: 0.55, marginTop: 1 }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Sparkline */}
              {history.length >= 2 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 9, opacity: 0.5, marginBottom: 3 }}>
                    RATE HISTORY ({history.length} readings)
                  </div>
                  <Sparkline history={history} color={color} />
                </div>
              )}
            </>
          )}

          {/* Assess button */}
          <button
            onClick={assess}
            disabled={assessing || !stats}
            style={{
              width: "100%",
              background: "rgba(41,231,255,0.08)",
              border: `1px solid ${CY}`,
              color: CY,
              fontFamily: "monospace",
              fontSize: 10,
              padding: "5px 0",
              borderRadius: 4,
              cursor: assessing || !stats ? "not-allowed" : "pointer",
              letterSpacing: "0.08em",
              opacity: assessing || !stats ? 0.5 : 1,
            }}
          >
            {assessing ? "▶ ASSESSING…" : "▶ ASSESS — JARVIS BRIEF"}
          </button>
        </div>
      )}
    </>
  );
}
