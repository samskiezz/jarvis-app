/**
 * ScenarioExecMonitor — F306
 * Polls /v1/scenario/list every 45 s and classifies scenarios by execution state:
 * RUNNING / ACTIVE / COMPLETED / FAILED / PENDING.
 * Unlike ScenarioLauncher (F13, browse + run), this is a pure status monitor:
 * who is executing now, what finished, what failed.
 * Stat tiles (total / running / active / completed / failed);
 * execution-state sort: running > active > pending > completed > failed;
 * red pulse on failed count; expandable rows show type, last_run, outcome;
 * filter tabs ALL / RUNNING / ACTIVE / COMPLETED / FAILED;
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS;
 * ◈ SCEXMON toggle (left:61800, bottom:8, zIndex:119);
 * voice "scenario status"/"running scenarios"/"scenario monitor"/"scexmon"/"execution status";
 * jarvis:scenario-exec-monitor-toggle event; 45-s auto-refresh.
 * Additive-only — no edits to CinematicShell/CinematicHome/JarvisLoader.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const GR = "#00FF9F";
const AM = "#FFB800";
const RD = "#FF4444";
const BL = "#5599FF";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";
const POLL_MS = 45_000;

const SCEXMON_RE =
  /\bscenario.?status\b|\brunning.?scenario\b|\bscenario.?monitor\b|\bscexmon\b|\bexecution.?status\b|\bscenario.?exec\b|\bactive.?scenario\b|\bscenario.?state\b|\bscenario.?execution\b|\bfailed.?scenario\b|\bscenario.?running\b/i;

export function isScenarioExecMonitorQuery(text) {
  return SCEXMON_RE.test(text || "");
}

const STATE_ORDER = { running: 0, active: 1, pending: 2, completed: 3, failed: 4 };

function classifyState(s) {
  const raw = (s.status || s.state || s.execution_status || "").toLowerCase();
  if (raw.includes("run")) return "running";
  if (raw.includes("activ")) return "active";
  if (raw.includes("complet") || raw.includes("done") || raw.includes("success")) return "completed";
  if (raw.includes("fail") || raw.includes("error")) return "failed";
  return "pending";
}

export async function buildScenarioExecMonitorScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const res = await fetch(`${base}/v1/scenario/list`, { headers });
  if (!res.ok) return "Scenario execution data unavailable, sir.";
  const data = await res.json();
  const scenarios = Array.isArray(data) ? data : data.scenarios || data.items || data.data || [];
  const byState = {};
  scenarios.forEach((s) => {
    const st = classifyState(s);
    byState[st] = (byState[st] || 0) + 1;
  });
  const running = byState.running || 0;
  const active = byState.active || 0;
  const completed = byState.completed || 0;
  const failed = byState.failed || 0;
  if (!scenarios.length) return "No scenario execution data available, sir.";
  const topRunning = scenarios
    .filter((s) => classifyState(s) === "running")
    .slice(0, 2)
    .map((s) => s.title || s.name || "unnamed")
    .join(", ");
  const topFailed = scenarios
    .filter((s) => classifyState(s) === "failed")
    .slice(0, 2)
    .map((s) => s.title || s.name || "unnamed")
    .join(", ");
  return (
    `Scenario execution monitor: ${scenarios.length} total scenarios. ` +
    `${running} running${running > 0 ? ` (${topRunning})` : ""}. ` +
    `${active} active. ${completed} completed. ` +
    (failed > 0 ? `${failed} failed — ${topFailed}. Attention required.` : "No failures detected.")
  );
}

const STATE_COLORS = {
  running: BL,
  active: GR,
  completed: "#888",
  failed: RD,
  pending: AM,
};

const TAG = {
  background: "rgba(0,0,0,0.75)",
  border: `1px solid ${CY}33`,
  borderRadius: 6,
  padding: "2px 7px",
  fontSize: 10,
  color: CY,
};
const STAT_BOX = {
  background: "rgba(0,0,0,0.55)",
  border: `1px solid ${CY}33`,
  borderRadius: 8,
  padding: "10px 16px",
  minWidth: 80,
  textAlign: "center",
};

export default function ScenarioExecMonitor() {
  const [open, setOpen] = useState(false);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState({});
  const [assessText, setAssessText] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const base = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const res = await fetch(`${base}/v1/scenario/list`, { headers });
      if (res.ok) {
        const data = await res.json();
        setScenarios(
          Array.isArray(data) ? data : data.scenarios || data.items || data.data || [],
        );
      } else {
        setErr(`Fetch failed: ${res.status}`);
      }
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("jarvis:scenario-exec-monitor-toggle", handler);
    return () =>
      window.removeEventListener("jarvis:scenario-exec-monitor-toggle", handler);
  }, []);

  const mapped = scenarios.map((s) => ({ ...s, _state: classifyState(s) }));

  mapped.sort((a, b) => {
    const ao = STATE_ORDER[a._state] ?? 99;
    const bo = STATE_ORDER[b._state] ?? 99;
    if (ao !== bo) return ao - bo;
    return (a.title || a.name || "").localeCompare(b.title || b.name || "");
  });

  const TABS = ["ALL", "RUNNING", "ACTIVE", "COMPLETED", "FAILED"];

  const filtered = mapped
    .filter((s) => {
      if (tab !== "ALL") return s._state === tab.toLowerCase();
      return true;
    })
    .filter((s) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (s.title || s.name || "").toLowerCase().includes(q) ||
        (s.description || "").toLowerCase().includes(q) ||
        (s.type || "").toLowerCase().includes(q)
      );
    });

  const byState = {};
  mapped.forEach((s) => {
    byState[s._state] = (byState[s._state] || 0) + 1;
  });
  const failedCount = byState.failed || 0;

  async function handleAssess() {
    setAssessing(true);
    setAssessText("");
    try {
      const base = apiBase();
      const prompt = `Scenario execution status: ${mapped.length} total scenarios — ${byState.running || 0} running, ${byState.active || 0} active, ${byState.completed || 0} completed, ${failedCount} failed. Summarize execution health in 2 sentences.`;
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: prompt }),
      });
      if (res.ok) {
        const d = await res.json();
        const txt = d.response || d.message || d.content || "";
        setAssessText(txt);
        window.dispatchEvent(
          new CustomEvent("jarvis:speak", { detail: { text: txt } }),
        );
      } else {
        setAssessText("Assessment unavailable at this time.");
      }
    } catch {
      setAssessText("Assessment failed.");
    } finally {
      setAssessing(false);
    }
  }

  function formatTime(ts) {
    if (!ts) return "—";
    try {
      const d = new Date(ts);
      if (isNaN(d)) return String(ts);
      const now = Date.now();
      const diff = now - d.getTime();
      if (diff < 60000) return "just now";
      if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
      return `${Math.floor(diff / 86400000)}d ago`;
    } catch {
      return String(ts);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed",
          bottom: 8,
          left: 61800,
          zIndex: 119,
          background: open ? `${CY}22` : "rgba(0,0,0,0.7)",
          border: `1px solid ${failedCount > 0 ? RD + "88" : CY + "55"}`,
          borderRadius: 6,
          color: failedCount > 0 ? RD : CY,
          fontSize: 10,
          padding: "3px 8px",
          cursor: "pointer",
          fontFamily: "monospace",
          letterSpacing: 1,
          whiteSpace: "nowrap",
          animation: failedCount > 0 ? "scexmon-pulse 2s ease-in-out infinite" : "none",
        }}
        title="Scenario Execution Monitor"
      >
        ◈ SCEXMON{failedCount > 0 ? ` [${failedCount}]` : ""}
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            top: 40,
            right: 16,
            width: 580,
            maxHeight: "82vh",
            background: "rgba(5,10,18,0.97)",
            border: `1px solid ${CY}55`,
            borderRadius: 12,
            zIndex: 9200,
            display: "flex",
            flexDirection: "column",
            fontFamily: "monospace",
            color: CY,
            boxShadow: `0 0 40px ${CY}22`,
            overflow: "hidden",
          }}
        >
          {/* header */}
          <div
            style={{
              padding: "12px 16px 8px",
              borderBottom: `1px solid ${CY}22`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 12, letterSpacing: 2 }}>
              ◈ SCENARIO EXECUTION MONITOR
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none",
                border: "none",
                color: CY,
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* stat tiles */}
          <div
            style={{
              display: "flex",
              gap: 10,
              padding: "10px 16px",
              borderBottom: `1px solid ${CY}11`,
              flexWrap: "wrap",
            }}
          >
            {[
              { label: "TOTAL", val: mapped.length, col: CY },
              { label: "RUNNING", val: byState.running || 0, col: BL },
              { label: "ACTIVE", val: byState.active || 0, col: GR },
              { label: "COMPLETED", val: byState.completed || 0, col: "#888" },
              {
                label: "FAILED",
                val: failedCount,
                col: failedCount > 0 ? RD : "#444",
              },
            ].map(({ label, val, col }) => (
              <div key={label} style={{ ...STAT_BOX, borderColor: col + "44" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: col }}>{val}</div>
                <div style={{ fontSize: 9, color: col + "aa", letterSpacing: 1 }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* filter + search */}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "8px 16px",
              alignItems: "center",
              borderBottom: `1px solid ${CY}11`,
              flexWrap: "wrap",
            }}
          >
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "rgba(0,0,0,0.5)",
                  border: `1px solid ${tab === t ? CY : CY + "44"}`,
                  borderRadius: 4,
                  color: tab === t ? CY : CY + "88",
                  fontSize: 9,
                  padding: "2px 8px",
                  cursor: "pointer",
                  letterSpacing: 1,
                }}
              >
                {t}
                {t !== "ALL" && (byState[t.toLowerCase()] || 0) > 0 && (
                  <span style={{ marginLeft: 4, color: STATE_COLORS[t.toLowerCase()] }}>
                    {byState[t.toLowerCase()]}
                  </span>
                )}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search scenarios…"
              style={{
                marginLeft: "auto",
                background: "rgba(0,0,0,0.4)",
                border: `1px solid ${CY}33`,
                borderRadius: 4,
                color: CY,
                fontSize: 10,
                padding: "3px 8px",
                outline: "none",
                fontFamily: "monospace",
                width: 160,
              }}
            />
          </div>

          {/* rows */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 0" }}>
            {loading && (
              <div
                style={{
                  padding: "16px",
                  color: CY + "88",
                  fontSize: 11,
                  textAlign: "center",
                }}
              >
                loading…
              </div>
            )}
            {err && (
              <div style={{ padding: "10px 16px", color: RD, fontSize: 10 }}>
                {err}
              </div>
            )}
            {!loading && !err && filtered.length === 0 && (
              <div
                style={{
                  padding: "16px",
                  color: CY + "55",
                  fontSize: 11,
                  textAlign: "center",
                }}
              >
                no scenarios match
              </div>
            )}
            {filtered.map((s, i) => {
              const stateCol = STATE_COLORS[s._state] || CY;
              const key = s.id || s.name || s.title || i;
              const isExp = !!expanded[key];
              const lastRun =
                s.last_run || s.last_executed || s.executed_at || s.updated_at;
              const outcome = s.outcome || s.result || s.last_outcome || "";
              return (
                <div
                  key={key}
                  style={{
                    borderBottom: `1px solid ${CY}11`,
                    padding: "7px 16px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      cursor: "pointer",
                    }}
                    onClick={() =>
                      setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
                    }
                  >
                    <span
                      style={{
                        ...TAG,
                        borderColor: stateCol + "55",
                        color: stateCol,
                        letterSpacing: 1,
                        fontSize: 9,
                        minWidth: 68,
                        textAlign: "center",
                        textTransform: "uppercase",
                        animation:
                          s._state === "running"
                            ? "scexmon-pulse 1.5s ease-in-out infinite"
                            : "none",
                      }}
                    >
                      {s._state}
                    </span>
                    <span style={{ fontSize: 11, flex: 1, color: "#DCEBF5" }}>
                      {s.title || s.name || "Unnamed Scenario"}
                    </span>
                    {s.type && (
                      <span style={{ ...TAG, fontSize: 9, color: CY + "99" }}>
                        {s.type}
                      </span>
                    )}
                    {lastRun && (
                      <span style={{ fontSize: 9, color: CY + "66" }}>
                        {formatTime(lastRun)}
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: CY + "55" }}>
                      {isExp ? "▲" : "▼"}
                    </span>
                  </div>
                  {s.description && (
                    <div
                      style={{
                        fontSize: 9,
                        color: CY + "66",
                        marginTop: 3,
                        paddingLeft: 76,
                      }}
                    >
                      {s.description.slice(0, 120)}
                      {s.description.length > 120 ? "…" : ""}
                    </div>
                  )}
                  {isExp && (
                    <div
                      style={{
                        marginTop: 6,
                        paddingLeft: 76,
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: 12,
                          flexWrap: "wrap",
                          fontSize: 10,
                          color: CY + "88",
                        }}
                      >
                        {s.id && (
                          <span>
                            ID:{" "}
                            <span style={{ color: CY }}>{s.id}</span>
                          </span>
                        )}
                        {s.category && (
                          <span>
                            CAT:{" "}
                            <span style={{ color: CY }}>{s.category}</span>
                          </span>
                        )}
                        {s.priority && (
                          <span>
                            PRI:{" "}
                            <span style={{ color: CY }}>{s.priority}</span>
                          </span>
                        )}
                        {lastRun && (
                          <span>
                            LAST RUN:{" "}
                            <span style={{ color: GR }}>
                              {new Date(lastRun).toLocaleString("en-GB", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </span>
                          </span>
                        )}
                      </div>
                      {outcome && (
                        <div
                          style={{
                            fontSize: 10,
                            color:
                              s._state === "failed"
                                ? RD
                                : s._state === "completed"
                                  ? GR
                                  : CY,
                            marginTop: 2,
                          }}
                        >
                          OUTCOME: {outcome}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* assess footer */}
          <div
            style={{
              padding: "8px 16px",
              borderTop: `1px solid ${CY}22`,
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={handleAssess}
              disabled={assessing || !mapped.length}
              style={{
                background: assessing ? `${CY}11` : `${CY}22`,
                border: `1px solid ${CY}55`,
                borderRadius: 5,
                color: CY,
                fontSize: 10,
                padding: "4px 12px",
                cursor: assessing ? "default" : "pointer",
                letterSpacing: 1,
                opacity: !mapped.length ? 0.4 : 1,
              }}
            >
              {assessing ? "▶ assessing…" : "▶ ASSESS"}
            </button>
            <button
              onClick={load}
              disabled={loading}
              style={{
                background: "rgba(0,0,0,0.4)",
                border: `1px solid ${CY}33`,
                borderRadius: 5,
                color: CY + "88",
                fontSize: 10,
                padding: "4px 10px",
                cursor: "pointer",
                letterSpacing: 1,
              }}
            >
              ↺
            </button>
            {assessText && (
              <div
                style={{
                  fontSize: 10,
                  color: GR,
                  flex: 1,
                  lineHeight: 1.4,
                }}
              >
                {assessText}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes scexmon-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </>
  );
}
