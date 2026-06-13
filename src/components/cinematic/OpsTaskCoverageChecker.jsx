/**
 * OpsTaskCoverageChecker — F77.
 *
 * Parallel-fetches /v1/ops/events (critical + high severity) and /entities/Task
 * (open tasks). Keyword-correlates each significant ops event against task
 * titles/descriptions to determine whether the event is "covered" (a
 * corresponding task exists) or "uncovered" (no task to address it).
 *
 * Stat tiles: events / tasks / covered / uncovered
 * Filter tabs: ALL / UNCOVERED / COVERED
 * Event cards sorted: uncovered criticals first.
 * Click ▶ ASSESS on any event → /v1/jarvis/agent/chat AI remediation
 *   recommendation + TTS via jarvis:speak-dossier.
 * 30s auto-refresh.
 *
 * Intent: "ops coverage" / "ops task coverage" / "uncovered events" /
 *         "task coverage" / "opscov" / "ops gaps"
 *   → jarvis:ops-coverage-toggle + TTS brief via buildOpsCoverageScript()
 *
 * Toggle: ◎ OPSCOV at left:6732, zIndex 65. Red badge on uncovered count.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED = "#FF3D5A";
const BTN_LEFT = 6732;
const REFRESH_MS = 30_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise helpers ────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && Array.isArray(raw.events)) return raw.events;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

function getEvSeverity(ev) {
  const v = ev.severity ?? ev.payload?.severity ?? ev.level ?? 0;
  if (typeof v === "number") return v;
  if (v === "critical") return 95;
  if (v === "high") return 75;
  if (v === "medium") return 50;
  return 20;
}

function getEvName(ev) {
  return ev.name || ev.message || ev.title || ev.type || `Event #${ev.id || "?"}`;
}

function getEvDescription(ev) {
  return ev.description || ev.summary || ev.payload?.message || ev.details || "";
}

function getEvTimestamp(ev) {
  return ev.created_at || ev.timestamp || ev.time || ev.occurred_at || null;
}

function normaliseTasks(raw) {
  return normaliseArray(raw).map((t) => ({
    id: t.id || t.task_id || String(Math.random()),
    title: t.title || t.name || t.task_name || "",
    description: t.description || t.summary || t.details || "",
    status: (t.status || "todo").toLowerCase(),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function overlap(a, b) {
  const bSet = new Set(b);
  return a.filter((w) => bSet.has(w)).length;
}

function isCovered(ev, tasks) {
  const evWords = keywords(`${getEvName(ev)} ${getEvDescription(ev)} ${ev.type || ""}`);
  return tasks.some((t) => {
    if (t.status === "done" || t.status === "completed" || t.status === "closed") return false;
    const tWords = keywords(`${t.title} ${t.description}`);
    return overlap(evWords, tWords) >= 1;
  });
}

function matchedTasks(ev, tasks) {
  const evWords = keywords(`${getEvName(ev)} ${getEvDescription(ev)} ${ev.type || ""}`);
  return tasks.filter((t) => {
    if (t.status === "done" || t.status === "completed" || t.status === "closed") return false;
    const tWords = keywords(`${t.title} ${t.description}`);
    return overlap(evWords, tWords) >= 1;
  });
}

function sevColor(sev) {
  if (sev >= 90) return RED;
  if (sev >= 70) return AMBER;
  if (sev >= 40) return CY;
  return "#445566";
}

function sevLabel(sev) {
  if (sev >= 90) return "CRITICAL";
  if (sev >= 70) return "HIGH";
  if (sev >= 40) return "MEDIUM";
  return "LOW";
}

function fmtTime(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleTimeString("en-GB", {
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return ""; }
}

// ─── exported intent helpers (consumed by JarvisBrain) ───────────────────────

const OPS_COV_RE =
  /ops.{0,15}(coverage|task|gap|check|uncovered)|task.{0,15}coverage|uncovered.{0,15}(event|ops|incident)|ops\s*gap|opscov\b/i;

export function isOpsCoverageQuery(q) {
  return OPS_COV_RE.test(q || "");
}

export async function buildOpsCoverageScript() {
  try {
    const [evRaw, taskRaw] = await Promise.all([
      fetch(`${apiBase()}/v1/ops/events`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
      fetch(`${apiBase()}/entities/Task`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
    ]);
    const events = normaliseArray(evRaw).filter((e) => getEvSeverity(e) >= 70);
    const tasks = normaliseTasks(taskRaw);
    const uncovered = events.filter((e) => !isCovered(e, tasks));
    const covered = events.length - uncovered.length;
    const critical = uncovered.filter((e) => getEvSeverity(e) >= 90).length;
    return `Ops-task coverage check complete, sir. ${events.length} significant event${events.length !== 1 ? "s" : ""} analysed. ${covered} covered by existing tasks, ${uncovered.length} uncovered. ${critical > 0 ? `${critical} uncovered critical event${critical !== 1 ? "s" : ""} require immediate attention.` : "No uncovered criticals at this time."} Opening the coverage panel now.`;
  } catch (_) {
    return "Ops-task coverage checker is standing by, sir.";
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function OpsTaskCoverageChecker() {
  const [visible, setVisible] = useState(false);
  const [events, setEvents] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("ALL");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [evRaw, taskRaw] = await Promise.all([
        fetch(`${apiBase()}/v1/ops/events`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
        fetch(`${apiBase()}/entities/Task`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
      ]);
      setEvents(normaliseArray(evRaw));
      setTasks(normaliseTasks(taskRaw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:ops-coverage-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ops-coverage-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assess(ev) {
    setAssessing(ev.id || ev.name);
    const sev = getEvSeverity(ev);
    const name = getEvName(ev);
    const desc = getEvDescription(ev);
    const linked = matchedTasks(ev, tasks);
    const taskContext = linked.length > 0
      ? `Partially covered by tasks: ${linked.map((t) => t.title).join("; ")}.`
      : "No existing task covers this event.";
    const prompt = `As JARVIS, provide a concrete 2-sentence remediation recommendation for this uncovered ops event: "${name}" (severity ${sev}). ${desc ? `Details: ${desc}.` : ""} ${taskContext} What immediate action should the operator take to address this gap?`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Immediate investigation and task creation recommended for this uncovered event, sir.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: "Assessment unavailable at this time, sir." },
      }));
    }
    setAssessing(null);
  }

  // Only consider sev ≥ 70 (critical + high) for coverage analysis
  const significant = events.filter((e) => getEvSeverity(e) >= 70);
  const uncoveredEvents = significant.filter((e) => !isCovered(e, tasks));
  const coveredEvents = significant.filter((e) => isCovered(e, tasks));
  const openTasks = tasks.filter(
    (t) => t.status !== "done" && t.status !== "completed" && t.status !== "closed"
  );

  // Sort: uncovered criticals first
  function sortedEvents(list) {
    return [...list].sort((a, b) => {
      const aUncov = !isCovered(a, tasks) ? 1 : 0;
      const bUncov = !isCovered(b, tasks) ? 1 : 0;
      if (aUncov !== bUncov) return bUncov - aUncov;
      return getEvSeverity(b) - getEvSeverity(a);
    });
  }

  const displayed =
    tab === "UNCOVERED" ? sortedEvents(uncoveredEvents) :
    tab === "COVERED"   ? sortedEvents(coveredEvents) :
    sortedEvents(significant);

  const uncoveredCount = uncoveredEvents.length;
  const critUncovered = uncoveredEvents.filter((e) => getEvSeverity(e) >= 90).length;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Ops-Task Coverage Checker (F77)"
        style={{
          position: "fixed", bottom: 6, left: BTN_LEFT, zIndex: 65,
          background: visible ? `${CY}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? CY : CY}44`,
          color: visible ? CY : `${CY}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◎ OPSCOV
        {uncoveredCount > 0 && (
          <span style={{
            marginLeft: 4,
            background: critUncovered > 0 ? RED : AMBER,
            color: "#04060A",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
            animation: critUncovered > 0 ? "opscov-pulse 1.4s ease-in-out infinite" : "none",
          }}>{uncoveredCount}</span>
        )}
      </button>

      {visible && (
        <div style={{
          position: "fixed", bottom: 32, left: Math.max(8, BTN_LEFT - 260), zIndex: 65,
          width: 560, maxHeight: "72vh", overflowY: "auto",
          background: "rgba(6,11,18,0.94)",
          border: `1px solid ${CY}44`,
          borderRadius: 10, padding: "14px 16px",
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${CY}18`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>◎ OPS-TASK COVERAGE</span>
            <button
              onClick={() => { setLoading(true); fetchData().finally(() => setLoading(false)); }}
              style={{
                marginLeft: "auto", background: "transparent",
                border: `1px solid ${CY}33`, borderRadius: 3,
                color: `${CY}88`, padding: "2px 6px", fontSize: 7,
                cursor: "pointer", letterSpacing: 1,
              }}
            >↻ REFRESH</button>
            <button
              onClick={() => setVisible(false)}
              style={{
                background: "transparent", border: "none",
                color: "#445566", cursor: "pointer", fontSize: 14, lineHeight: 1,
              }}
            >✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              ["EVENTS", significant.length, CY],
              ["OPEN TASKS", openTasks.length, GREEN],
              ["COVERED", coveredEvents.length, GREEN],
              ["UNCOVERED", uncoveredCount, uncoveredCount > 0 ? RED : "#445566"],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 5, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: "bold" }}>
                  {loading ? "…" : val}
                </div>
                <div style={{ color: "#445566", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
            {[
              ["ALL", significant.length],
              ["UNCOVERED", uncoveredCount],
              ["COVERED", coveredEvents.length],
            ].map(([t, count]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "transparent",
                  border: `1px solid ${tab === t ? CY : "#1e3040"}`,
                  color: tab === t ? CY : "#445566",
                  borderRadius: 4, padding: "3px 8px",
                  fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                  letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
                }}
              >{t} {count > 0 && <span style={{ opacity: 0.6 }}>({count})</span>}</button>
            ))}
          </div>

          {/* Event cards */}
          {loading && displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              correlating ops events against tasks…
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              {tab === "UNCOVERED"
                ? "All significant events are covered by tasks — well done, sir."
                : "No events in this filter."}
            </div>
          ) : (
            displayed.map((ev) => {
              const sev = getEvSeverity(ev);
              const name = getEvName(ev);
              const desc = getEvDescription(ev);
              const ts = getEvTimestamp(ev);
              const sevCol = sevColor(sev);
              const covered = isCovered(ev, tasks);
              const linked = matchedTasks(ev, tasks);
              const evId = ev.id || name;
              const isOpen = expanded === evId;
              const isAssessing = assessing === evId;

              return (
                <div
                  key={evId}
                  onClick={() => setExpanded(isOpen ? null : evId)}
                  style={{
                    background: covered ? "rgba(255,255,255,0.02)" : `${RED}08`,
                    border: `1px solid ${isOpen ? `${CY}44` : covered ? "#1a2530" : `${RED}22`}`,
                    borderRadius: 6, padding: "8px 10px", marginBottom: 6,
                    cursor: "pointer",
                  }}
                >
                  {/* Event header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    {/* Severity indicator with pulse on critical uncovered */}
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                      background: sevCol,
                      boxShadow: (!covered && sev >= 90) ? `0 0 8px ${RED}` : "none",
                      animation: (!covered && sev >= 90) ? "opscov-pulse 1.4s ease-in-out infinite" : "none",
                    }} />
                    <span style={{
                      fontSize: 7, color: sevCol, border: `1px solid ${sevCol}44`,
                      borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                      whiteSpace: "nowrap", textTransform: "uppercase", flexShrink: 0,
                    }}>{sevLabel(sev)}</span>
                    <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1, lineHeight: 1.3 }}>{name}</span>
                    <span style={{
                      fontSize: 7, fontWeight: "bold", whiteSpace: "nowrap",
                      color: covered ? GREEN : RED,
                      border: `1px solid ${covered ? GREEN : RED}33`,
                      borderRadius: 3, padding: "1px 5px", flexShrink: 0,
                    }}>{covered ? "COVERED" : "UNCOVERED"}</span>
                  </div>

                  {/* Description + timestamp */}
                  {desc && (
                    <div style={{ color: "#556677", fontSize: 8, lineHeight: 1.4, marginBottom: 4 }}>
                      {desc.slice(0, 100)}{desc.length > 100 ? "…" : ""}
                    </div>
                  )}

                  {/* Action row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {ts && (
                      <span style={{ fontSize: 7, color: "#334455" }}>{fmtTime(ts)}</span>
                    )}
                    <span style={{ fontSize: 7, color: "#334455" }}>
                      {covered
                        ? `${linked.length} task${linked.length !== 1 ? "s" : ""} linked`
                        : "no task linked"}
                    </span>
                    <div style={{ flex: 1 }} />
                    {!covered && (
                      <button
                        onClick={(e) => { e.stopPropagation(); assess(ev); }}
                        disabled={isAssessing}
                        style={{
                          background: isAssessing ? "#1a2530" : `${RED}18`,
                          color: isAssessing ? "#445566" : RED,
                          border: `1px solid ${RED}44`,
                          borderRadius: 3, padding: "2px 8px",
                          fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                          letterSpacing: 1, cursor: isAssessing ? "default" : "pointer",
                        }}
                      >{isAssessing ? "…assessing" : "▶ ASSESS"}</button>
                    )}
                  </div>

                  {/* Expanded: linked tasks */}
                  {isOpen && covered && linked.length > 0 && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${CY}18` }}>
                      <div style={{ color: GREEN, fontSize: 7, letterSpacing: 1, marginBottom: 4 }}>LINKED TASKS</div>
                      {linked.map((t) => (
                        <div key={t.id} style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "3px 6px",
                          background: `${GREEN}08`, border: `1px solid ${GREEN}22`,
                          borderRadius: 3, marginBottom: 3,
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: GREEN, flexShrink: 0 }} />
                          <span style={{ color: "#80c0a0", fontSize: 8 }}>{t.title}</span>
                          <span style={{ marginLeft: "auto", fontSize: 7, color: "#445566" }}>{t.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {isOpen && !covered && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${RED}18`, color: "#884444", fontSize: 8 }}>
                      No keyword match found in open tasks — click ▶ ASSESS for JARVIS remediation guidance.
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div style={{ marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right" }}>
            /v1/ops/events + /entities/Task · sev≥70 events · 30s auto-refresh · ▶ ASSESS for AI guidance
          </div>
        </div>
      )}

      <style>{`
        @keyframes opscov-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.6; }
        }
      `}</style>
    </>
  );
}
