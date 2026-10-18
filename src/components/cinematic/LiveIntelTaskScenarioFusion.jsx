/**
 * LiveIntelTaskScenarioFusion — F310
 * 3-way fusion panel: correlates live intel events (getLiveIntel earthquakes + markets)
 * against active Tasks and available Scenarios by keyword matching.
 *
 * Endpoints: /functions/getLiveIntel + /entities/Task + /v1/scenario/list
 * Classification per event: TRIGGERED (has matching task AND scenario) /
 *   MONITORED (matches task only) / READY (matches scenario only) / UNMATCHED.
 * Stat tiles: events / triggered / monitored / ready.
 * Red pulse on triggered count when ≥ 1.
 * Expandable rows show matched tasks (status) + matched scenarios (type/status).
 * Filter tabs: ALL / TRIGGERED / MONITORED / READY / UNMATCHED.
 * Text search on event label/type.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS.
 * ◈ LITSFUSION toggle (left:64040, bottom:8, zIndex:123).
 * Voice: "intel fusion"/"live intel tasks"/"event task map"/"intel scenarios"/"litsfusion"/"live event fusion".
 * jarvis:litsfusion-toggle event.
 * 60-s auto-refresh.
 * Additive-only — no edits to CinematicShell/CinematicHome/JarvisLoader.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const GR = "#00FF9F";
const AM = "#FFB800";
const RD = "#FF4444";
const PRP = "#A855F7";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";
const POLL_MS = 60_000;

const LITS_RE =
  /\bintel.?fusion\b|\blive.?intel.?task\b|\bevent.?task.?map\b|\bintel.?scenario\b|\blitsfusion\b|\blive.?event.?fusion\b|\btask.?intel\b|\bscenario.?intel\b|\blive.?fusion\b|\bevent.?fusion\b/i;

export function isLitsFusionQuery(text) {
  return LITS_RE.test(text || "");
}

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
  minWidth: 78,
  textAlign: "center",
};

function tokenize(str) {
  return (str || "")
    .toLowerCase()
    .split(/[\s\-_\/,.;:()[\]{}]+/)
    .filter((t) => t.length >= 3);
}

function hasOverlap(tokensA, targetStr) {
  const tokensB = tokenize(targetStr);
  return tokensA.some((t) => tokensB.includes(t));
}

async function fetchLiveIntel(base, headers) {
  const res = await fetch(`${base}/functions/getLiveIntel`, { headers });
  if (!res.ok) return { earthquakes: [], markets: [] };
  const d = await res.json();
  const data = d?.data ?? d;
  return {
    earthquakes: Array.isArray(data?.earthquakes) ? data.earthquakes : [],
    markets: Array.isArray(data?.markets) ? data.markets : [],
  };
}

async function fetchTasks(base, headers) {
  const res = await fetch(`${base}/entities/Task`, { headers });
  if (!res.ok) return [];
  const d = await res.json();
  return Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : Array.isArray(d?.items) ? d.items : [];
}

async function fetchScenarios(base, headers) {
  const res = await fetch(`${base}/v1/scenario/list`, { headers });
  if (!res.ok) return [];
  const d = await res.json();
  return Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : Array.isArray(d?.scenarios) ? d.scenarios : [];
}

function classifyEvents(intel, tasks, scenarios) {
  const allEvents = [
    ...intel.earthquakes.map((e) => ({
      id: e.id || `q-${e.location || Math.random()}`,
      label: e.location || e.place || "Unknown location",
      type: "SEISMIC",
      magnitude: e.magnitude ?? e.mag ?? null,
      severity: e.magnitude >= 6 ? "CRITICAL" : e.magnitude >= 5 ? "HIGH" : "MEDIUM",
    })),
    ...intel.markets.map((m) => ({
      id: m.symbol || m.id || `m-${m.name || Math.random()}`,
      label: m.symbol || m.name || "Unknown market",
      type: "MARKET",
      change: m.change ?? m.change_pct ?? null,
      severity: Math.abs(m.change ?? 0) >= 5 ? "HIGH" : "MEDIUM",
    })),
  ];

  return allEvents.map((ev) => {
    const evTokens = tokenize(ev.label + " " + ev.type);
    const matchedTasks = tasks.filter((t) =>
      hasOverlap(evTokens, (t.title || t.name || "") + " " + (t.description || ""))
    ).map((t) => ({
      id: t.id,
      title: t.title || t.name || "Untitled",
      status: t.status || "unknown",
    }));

    const matchedScenarios = scenarios.filter((s) =>
      hasOverlap(evTokens, (s.name || s.title || "") + " " + (s.description || "") + " " + (s.type || ""))
    ).map((s) => ({
      id: s.id,
      title: s.name || s.title || "Untitled",
      type: s.type || "scenario",
      status: s.status || "unknown",
    }));

    const hasTasks = matchedTasks.length > 0;
    const hasScenarios = matchedScenarios.length > 0;
    const classification =
      hasTasks && hasScenarios ? "TRIGGERED" :
      hasTasks ? "MONITORED" :
      hasScenarios ? "READY" : "UNMATCHED";

    return { ...ev, matchedTasks, matchedScenarios, classification };
  });
}

export async function buildLitsFusionScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [intel, tasks, scenarios] = await Promise.all([
    fetchLiveIntel(base, headers),
    fetchTasks(base, headers),
    fetchScenarios(base, headers),
  ]);
  const rows = classifyEvents(intel, tasks, scenarios);
  const triggered = rows.filter((r) => r.classification === "TRIGGERED").length;
  const monitored = rows.filter((r) => r.classification === "MONITORED").length;
  const ready = rows.filter((r) => r.classification === "READY").length;
  const unmatched = rows.filter((r) => r.classification === "UNMATCHED").length;
  return (
    `Live intel, task, and scenario fusion analysis complete, sir. ` +
    `${rows.length} live events assessed against ${tasks.length} tasks and ${scenarios.length} scenarios. ` +
    `${triggered} events are fully triggered — matching both active tasks and response scenarios. ` +
    `${monitored} events are monitored with task coverage but no scenario playbook. ` +
    `${ready} events have scenario coverage but no active task. ` +
    `${unmatched} events remain unmatched. ` +
    (triggered > 0
      ? `Immediate attention recommended: ${triggered} event${triggered > 1 ? "s" : ""} with full trigger coverage.`
      : `No events have full trigger coverage at this time.`)
  );
}

export default function LiveIntelTaskScenarioFusion() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [taskCount, setTaskCount] = useState(0);
  const [scenarioCount, setScenarioCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assessResult, setAssessResult] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const base = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [intel, tasks, scenarios] = await Promise.all([
        fetchLiveIntel(base, headers),
        fetchTasks(base, headers),
        fetchScenarios(base, headers),
      ]);
      setTaskCount(tasks.length);
      setScenarioCount(scenarios.length);
      setRows(classifyEvents(intel, tasks, scenarios));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("jarvis:litsfusion-toggle", handler);
    return () => window.removeEventListener("jarvis:litsfusion-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const triggered = rows.filter((r) => r.classification === "TRIGGERED").length;
  const monitored = rows.filter((r) => r.classification === "MONITORED").length;
  const ready = rows.filter((r) => r.classification === "READY").length;

  const filtered = rows.filter((r) => {
    if (tab !== "ALL" && r.classification !== tab) return false;
    if (search && !r.label.toLowerCase().includes(search.toLowerCase()) &&
        !r.type.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  async function handleAssess() {
    setAssessing(true);
    setAssessResult(null);
    try {
      const base = apiBase();
      const prompt =
        `Analyze the live intel-task-scenario fusion state: ${rows.length} live events, ` +
        `${triggered} triggered, ${monitored} monitored, ${ready} ready, ${taskCount} tasks, ${scenarioCount} scenarios. ` +
        `Identify the most critical unaddressed events and recommend immediate actions.`;
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await res.json();
      const text = d.response || d.message || d.content || d.text || "Assessment complete.";
      setAssessResult(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak", { detail: { text } }));
    } catch {
      setAssessResult("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }

  function classColor(cls) {
    if (cls === "TRIGGERED") return RD;
    if (cls === "MONITORED") return AM;
    if (cls === "READY") return GR;
    return "#555";
  }

  const triggeredPulse =
    triggered > 0 ? { animation: "litsfusion-pulse 1.5s ease-in-out infinite" } : {};

  if (!open) {
    return (
      <>
        <style>{`@keyframes litsfusion-pulse { 0%,100%{opacity:1} 50%{opacity:0.45} }`}</style>
        <button
          onClick={() => setOpen(true)}
          title="Live Intel × Task × Scenario Fusion"
          style={{
            position: "fixed",
            left: 64040,
            bottom: 8,
            zIndex: 123,
            background: "rgba(0,0,0,0.75)",
            border: `1px solid ${CY}55`,
            borderRadius: 6,
            color: CY,
            fontSize: 10,
            padding: "3px 8px",
            cursor: "pointer",
            fontFamily: "monospace",
            letterSpacing: 1,
            whiteSpace: "nowrap",
          }}
        >
          ◈ LITSFUSION
        </button>
      </>
    );
  }

  return (
    <>
      <style>{`
        @keyframes litsfusion-pulse { 0%,100%{opacity:1} 50%{opacity:0.45} }
        .litsfusion-row:hover { background: rgba(41,231,255,0.07) !important; }
      `}</style>
      <div
        style={{
          position: "fixed",
          right: 24,
          bottom: 56,
          width: 580,
          maxHeight: "80vh",
          overflowY: "auto",
          background: "rgba(6,10,20,0.97)",
          border: `1px solid ${CY}55`,
          borderRadius: 12,
          zIndex: 9500,
          fontFamily: "monospace",
          color: CY,
          padding: 16,
          boxShadow: `0 0 32px ${CY}22`,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2 }}>
            ◈ LIVE INTEL × TASK × SCENARIO FUSION
          </span>
          <button
            onClick={() => setOpen(false)}
            style={{ background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 16 }}
          >
            ✕
          </button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={STAT_BOX}>
            <div style={{ fontSize: 20, fontWeight: 700, color: CY }}>{rows.length}</div>
            <div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>EVENTS</div>
          </div>
          <div style={{ ...STAT_BOX, ...triggeredPulse, borderColor: triggered > 0 ? `${RD}55` : `${CY}33` }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: triggered > 0 ? RD : "#555" }}>{triggered}</div>
            <div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>TRIGGERED</div>
          </div>
          <div style={STAT_BOX}>
            <div style={{ fontSize: 20, fontWeight: 700, color: AM }}>{monitored}</div>
            <div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>MONITORED</div>
          </div>
          <div style={STAT_BOX}>
            <div style={{ fontSize: 20, fontWeight: 700, color: GR }}>{ready}</div>
            <div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>READY</div>
          </div>
          <div style={STAT_BOX}>
            <div style={{ fontSize: 16, fontWeight: 700, color: PRP }}>{taskCount}T / {scenarioCount}S</div>
            <div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>TASKS/SCEN</div>
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          {["ALL", "TRIGGERED", "MONITORED", "READY", "UNMATCHED"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? `${CY}22` : "transparent",
                border: `1px solid ${tab === t ? CY : CY + "44"}`,
                borderRadius: 4,
                color: tab === t ? CY : "#666",
                fontSize: 10,
                padding: "2px 10px",
                cursor: "pointer",
              }}
            >
              {t}
            </button>
          ))}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search event…"
            style={{
              marginLeft: "auto",
              background: "rgba(0,0,0,0.5)",
              border: `1px solid ${CY}44`,
              borderRadius: 4,
              color: CY,
              fontSize: 10,
              padding: "2px 8px",
              outline: "none",
              width: 130,
            }}
          />
        </div>

        {/* Rows */}
        {loading && <div style={{ fontSize: 11, color: "#555", marginBottom: 8 }}>Loading…</div>}
        {err && <div style={{ fontSize: 10, color: RD, marginBottom: 8 }}>Error: {err}</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ fontSize: 11, color: "#555" }}>No events match current filter.</div>
        )}
        {filtered.map((row) => (
          <div key={row.id} className="litsfusion-row" style={{ borderBottom: `1px solid ${CY}22`, padding: "6px 0" }}>
            <div
              style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}
              onClick={() => setExpanded((p) => ({ ...p, [row.id]: !p[row.id] }))}
            >
              <span style={{ fontSize: 10, color: classColor(row.classification), minWidth: 72 }}>
                {row.classification}
              </span>
              <span style={{ flex: 1, fontSize: 11, color: CY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row.label}
              </span>
              <span style={{ ...TAG }}>{row.type}</span>
              {row.magnitude != null && (
                <span style={{ fontSize: 9, color: row.severity === "CRITICAL" ? RD : AM }}>
                  M{row.magnitude}
                </span>
              )}
              {row.change != null && (
                <span style={{ fontSize: 9, color: row.change >= 0 ? GR : RD }}>
                  {row.change >= 0 ? "+" : ""}{typeof row.change === "number" ? row.change.toFixed(2) : row.change}%
                </span>
              )}
              <span style={{ fontSize: 10, color: "#555" }}>
                {row.matchedTasks.length}T/{row.matchedScenarios.length}S
              </span>
              <span style={{ fontSize: 10, color: "#555" }}>{expanded[row.id] ? "▲" : "▼"}</span>
            </div>
            {expanded[row.id] && (
              <div style={{ paddingLeft: 80, paddingTop: 6 }}>
                {row.matchedTasks.length > 0 && (
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ fontSize: 9, color: "#777", marginBottom: 2 }}>TASKS:</div>
                    {row.matchedTasks.map((t) => (
                      <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 2 }}>
                        <span style={{ fontSize: 10, color: AM }}>{t.title}</span>
                        <span style={{ fontSize: 9, color: "#666" }}>{t.status}</span>
                      </div>
                    ))}
                  </div>
                )}
                {row.matchedScenarios.length > 0 && (
                  <div>
                    <div style={{ fontSize: 9, color: "#777", marginBottom: 2 }}>SCENARIOS:</div>
                    {row.matchedScenarios.map((s) => (
                      <div key={s.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 2 }}>
                        <span style={{ fontSize: 10, color: GR }}>{s.title}</span>
                        <span style={{ fontSize: 9, color: "#666" }}>{s.type}</span>
                        <span style={{ fontSize: 9, color: "#555" }}>{s.status}</span>
                      </div>
                    ))}
                  </div>
                )}
                {row.matchedTasks.length === 0 && row.matchedScenarios.length === 0 && (
                  <div style={{ fontSize: 10, color: "#555" }}>No task or scenario matches found.</div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Assess */}
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={handleAssess}
            disabled={assessing}
            style={{
              background: assessing ? "rgba(41,231,255,0.1)" : `${CY}22`,
              border: `1px solid ${CY}`,
              borderRadius: 5,
              color: CY,
              fontSize: 10,
              padding: "4px 14px",
              cursor: assessing ? "default" : "pointer",
              letterSpacing: 1,
            }}
          >
            {assessing ? "ASSESSING…" : "▶ ASSESS"}
          </button>
          <button
            onClick={load}
            style={{
              background: "transparent",
              border: `1px solid ${CY}44`,
              borderRadius: 5,
              color: "#888",
              fontSize: 10,
              padding: "4px 10px",
              cursor: "pointer",
            }}
          >
            ↺
          </button>
          <span style={{ fontSize: 9, color: "#555", marginLeft: "auto" }}>auto-refresh 60s</span>
        </div>

        {assessResult && (
          <div
            style={{
              marginTop: 10,
              padding: 10,
              background: "rgba(41,231,255,0.07)",
              border: `1px solid ${CY}33`,
              borderRadius: 6,
              fontSize: 10,
              color: CY,
              lineHeight: 1.6,
              maxHeight: 140,
              overflowY: "auto",
            }}
          >
            {assessResult}
          </div>
        )}
      </div>

      {/* Collapsed toggle button */}
      <button
        onClick={() => setOpen(false)}
        title="Live Intel × Task × Scenario Fusion"
        style={{
          position: "fixed",
          left: 64040,
          bottom: 8,
          zIndex: 123,
          background: `${CY}22`,
          border: `1px solid ${CY}`,
          borderRadius: 6,
          color: CY,
          fontSize: 10,
          padding: "3px 8px",
          cursor: "pointer",
          fontFamily: "monospace",
          letterSpacing: 1,
          whiteSpace: "nowrap",
        }}
      >
        ◈ LITSFUSION
      </button>
    </>
  );
}
