/**
 * OperationalMorningBriefing — F567 (OMBRF)
 *
 * Data sources (all confirmed-real):
 *   GET /entities/Task              → {items:[...]}
 *   GET /entities/RiskSignal        → {items:[...]}
 *   GET /entities/SwarmJob          → {items:[...]}
 *   GET /v1/investigations          → {items:[...]}
 *   GET /v1/ops/events              → {items:[...]}
 *   GET /v1/jarvis/system/status    → {cpu,memory,uptime,...}
 *   POST /v1/jarvis/agent/chat      → AI narrative brief
 *   POST /v1/voice/tts              → spoken brief
 *
 * Displays:
 *   - 6 stat tiles: tasks / critical risks / active swarm / open cases / ops events / system health
 *   - Blocked task list + escalated investigation list
 *   - ▶ BRIEF ME → /v1/jarvis/agent/chat 4-sentence operational SITREP + TTS spoken in full
 *   - 5-min auto-refresh
 *
 * Toggle: ◈ OMBRF at left:62520, bottom:8, zIndex:131.
 * Badge: red = critical risk count; amber = blocked task count.
 *
 * Exported helpers for JarvisBrain:
 *   isOmbrfQuery(q) / buildOmbrfScript()
 *
 * Voice triggers: "morning brief / daily brief / ombrf / brief me /
 *   operational briefing / daily sitrep / morning sitrep / sitrep /
 *   operational summary / daily intelligence / morning report / daily report"
 *
 * Additive only — mounted via App.jsx; no edits to CinematicShell / CinematicHome / JarvisLoader.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const RED  = "#F87171";
const AMB  = "#FFA500";
const GRN  = "#4ADE80";
const DIM  = "#4E6070";
const PURP = "#B06EFF";
const GOLD = "#FCD34D";

const BTN_LEFT   = 62_520;
const REFRESH_MS = 300_000; // 5 minutes — this is a briefing, not a ticker
const Z_INDEX    = 131;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const OMBRF_RE =
  /\bombrf\b|\bmorning\s+brief(?:ing)?\b|\bdaily\s+brief(?:ing)?\b|\bbrief\s+me\b|\boperational\s+brief(?:ing)?\b|\bdaily\s+sitrep\b|\bmorning\s+sitrep\b|\bsitrep\b|\boperational\s+summary\b|\bdaily\s+intelligence\b|\bmorning\s+report\b|\bdaily\s+report\b/i;

export function isOmbrfQuery(text) {
  return OMBRF_RE.test(text || "");
}

// ─── fetch helpers ─────────────────────────────────────────────────────────────

function auth() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function normArray(raw, ...keys) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of [...keys, "items", "results", "data", "records"]) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

async function safeFetch(url) {
  try {
    const r = await fetch(`${apiBase()}${url}`, { headers: auth() });
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  }
}

async function fetchAllData() {
  const [tasksR, risksR, swarmR, invR, opsR, sysR] = await Promise.allSettled([
    safeFetch("/entities/Task"),
    safeFetch("/entities/RiskSignal"),
    safeFetch("/entities/SwarmJob"),
    safeFetch("/v1/investigations"),
    safeFetch("/v1/ops/events"),
    safeFetch("/v1/jarvis/system/status"),
  ]);

  const tasks  = normArray(tasksR.status  === "fulfilled" ? tasksR.value  : null);
  const risks  = normArray(risksR.status  === "fulfilled" ? risksR.value  : null);
  const swarm  = normArray(swarmR.status  === "fulfilled" ? swarmR.value  : null);
  const inv    = normArray(invR.status    === "fulfilled" ? invR.value    : null);
  const ops    = normArray(opsR.status    === "fulfilled" ? opsR.value    : null);
  const sys    = sysR.status === "fulfilled" ? sysR.value : null;

  return { tasks, risks, swarm, inv, ops, sys };
}

// ─── voice script builder ─────────────────────────────────────────────────────

export async function buildOmbrfScript() {
  try {
    const { tasks, risks, swarm, inv, ops } = await fetchAllData();

    const blocked     = tasks.filter((t) => (t.status || t.state || "").toLowerCase() === "blocked");
    const critRisks   = risks.filter((r) =>
      ["critical", "high"].includes((r.severity || r.level || r.priority || "").toLowerCase()),
    );
    const activeSwarm = swarm.filter((j) =>
      ["running", "active", "in_progress"].includes((j.status || j.state || "").toLowerCase()),
    );
    const openInv     = inv.filter((i) =>
      ["open", "active", "escalated"].includes((i.status || i.state || "").toLowerCase()),
    );
    const critOps     = ops.filter((e) =>
      (e.severity || e.level || "").toLowerCase() === "critical",
    );

    const parts = [
      `Operational briefing: ${tasks.length} tasks (${blocked.length} blocked), ` +
      `${risks.length} risk signals (${critRisks.length} critical or high).`,

      activeSwarm.length
        ? `${activeSwarm.length} of ${swarm.length} swarm jobs are actively running.`
        : `${swarm.length} swarm jobs on record; none currently active.`,

      openInv.length
        ? `${openInv.length} investigations are open or escalated.`
        : `No open investigations at this time.`,

      critOps.length
        ? `${critOps.length} critical operational events require attention.`
        : `Operational events: ${ops.length} total, none critical.`,
    ];

    return parts.join(" ");
  } catch {
    return "Unable to compile operational morning briefing at this time, sir.";
  }
}

// ─── component ─────────────────────────────────────────────────────────────────

export default function OperationalMorningBriefing() {
  const [open, setOpen]       = useState(false);
  const [data, setData]       = useState(null);
  const [briefing, setBriefing] = useState("");
  const [loading, setLoading] = useState(false);
  const [briefing_ai, setBriefingAi] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [tab, setTab]         = useState("OVERVIEW");
  const timerRef              = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchAllData();
      setData(d);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const toggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:ombrf-toggle", toggle);
    return () => window.removeEventListener("jarvis:ombrf-toggle", toggle);
  }, []);

  async function brief() {
    if (!data) return;
    setBriefingAi("Generating intelligence brief…");
    setSpeaking(false);

    const ctx = buildSitrepContext(data);
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth() },
        body: JSON.stringify({
          message:
            `Generate a 4-sentence operational SITREP for a senior analyst. ` +
            `Current data: ${ctx}. ` +
            `Be direct and specific. Identify the most critical action item.`,
        }),
      });
      const d = await r.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBriefingAi(text);
      if (text) speakText(text);
    } catch {
      setBriefingAi("Unable to reach the reasoning core for this briefing, sir.");
    }
  }

  async function speakText(text) {
    setSpeaking(true);
    try {
      const r = await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth() },
        body: JSON.stringify({ text, voice: "onyx" }),
      });
      if (!r.ok) { setSpeaking(false); return; }
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      const au   = new Audio(url);
      au.onended = () => { setSpeaking(false); URL.revokeObjectURL(url); };
      au.onerror = () => setSpeaking(false);
      au.play().catch(() => setSpeaking(false));
    } catch {
      setSpeaking(false);
    }
  }

  function buildSitrepContext(d) {
    if (!d) return "no data";
    const blocked   = (d.tasks  || []).filter((t) => (t.status || t.state || "").toLowerCase() === "blocked");
    const critRisks = (d.risks  || []).filter((r) =>
      ["critical", "high"].includes((r.severity || r.level || r.priority || "").toLowerCase()),
    );
    const openInv   = (d.inv    || []).filter((i) =>
      ["open", "active", "escalated"].includes((i.status || i.state || "").toLowerCase()),
    );
    const critOps   = (d.ops    || []).filter((e) => (e.severity || "").toLowerCase() === "critical");
    const activeSwarm = (d.swarm || []).filter((j) =>
      ["running", "active", "in_progress"].includes((j.status || j.state || "").toLowerCase()),
    );

    return [
      `tasks=${d.tasks.length}(blocked=${blocked.length})`,
      `risks=${d.risks.length}(critical=${critRisks.length})`,
      `swarm=${d.swarm.length}(active=${activeSwarm.length})`,
      `investigations=${d.inv.length}(open=${openInv.length})`,
      `ops_events=${d.ops.length}(critical=${critOps.length})`,
      d.sys?.cpu ? `cpu=${d.sys.cpu}%` : "",
    ].filter(Boolean).join(" | ");
  }

  // derived
  const blocked     = data ? (data.tasks  || []).filter((t) => (t.status || t.state || "").toLowerCase() === "blocked") : [];
  const critRisks   = data ? (data.risks  || []).filter((r) =>
    ["critical", "high"].includes((r.severity || r.level || r.priority || "").toLowerCase()),
  ) : [];
  const openInv     = data ? (data.inv    || []).filter((i) =>
    ["open", "active", "escalated"].includes((i.status || i.state || "").toLowerCase()),
  ) : [];
  const critOps     = data ? (data.ops    || []).filter((e) => (e.severity || "").toLowerCase() === "critical") : [];
  const activeSwarm = data ? (data.swarm  || []).filter((j) =>
    ["running", "active", "in_progress"].includes((j.status || j.state || "").toLowerCase()),
  ) : [];

  const badge = critRisks.length > 0 ? critRisks.length : blocked.length > 0 ? blocked.length : null;
  const badgeColor = critRisks.length > 0 ? RED : AMB;

  const sysHealth = data?.sys
    ? (() => {
        const cpu = data.sys.cpu ?? data.sys.cpu_pct ?? null;
        const mem = data.sys.memory ?? data.sys.memory_pct ?? null;
        if (cpu !== null && cpu > 90) return "STRESSED";
        if (cpu !== null && cpu > 70) return "BUSY";
        return "NOMINAL";
      })()
    : "UNKNOWN";

  const now = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  return (
    <>
      {/* ◈ OMBRF button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Operational Morning Briefing"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: Z_INDEX,
          background: "rgba(5,8,13,0.82)",
          border: `1px solid ${open ? CY : "#2A3A44"}`,
          color: open ? CY : "#6E8AA0",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 10,
          letterSpacing: 1,
          padding: "4px 8px",
          borderRadius: 4,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ◈ OMBRF
        {badge !== null && (
          <span
            style={{
              marginLeft: 5,
              background: badgeColor,
              color: "#000",
              borderRadius: 8,
              fontSize: 9,
              fontWeight: 700,
              padding: "1px 5px",
              minWidth: 16,
              display: "inline-block",
              textAlign: "center",
            }}
          >
            {badge}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            left: 18,
            top: 60,
            zIndex: Z_INDEX + 100,
            width: "min(640px, 94vw)",
            maxHeight: "88vh",
            background: "rgba(6,10,16,0.96)",
            border: `1px solid ${CY}44`,
            borderRadius: 12,
            boxShadow: `0 0 60px ${CY}18`,
            fontFamily: "'JetBrains Mono',monospace",
            color: "#DCEBF5",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderBottom: `1px solid ${CY}22`,
              flexShrink: 0,
            }}
          >
            <span style={{ color: CY, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              OPERATIONAL BRIEFING
            </span>
            <span style={{ fontSize: 10, color: DIM, marginLeft: "auto" }}>
              {now} · {loading ? "refreshing…" : "OMBRF"}
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
            >
              ✕
            </button>
          </div>

          {/* Stat tiles */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 8,
              padding: "12px 14px 6px",
              flexShrink: 0,
            }}
          >
            {[
              { label: "TASKS", val: data?.tasks?.length ?? "–", sub: `${blocked.length} blocked`, color: blocked.length > 0 ? AMB : GRN },
              { label: "RISKS", val: data?.risks?.length ?? "–", sub: `${critRisks.length} critical/high`, color: critRisks.length > 0 ? RED : GRN },
              { label: "SWARM", val: data?.swarm?.length ?? "–", sub: `${activeSwarm.length} active`, color: CY },
              { label: "CASES", val: data?.inv?.length ?? "–", sub: `${openInv.length} open/escalated`, color: openInv.length > 0 ? AMB : GRN },
              { label: "OPS EVENTS", val: data?.ops?.length ?? "–", sub: `${critOps.length} critical`, color: critOps.length > 0 ? RED : GRN },
              { label: "SYS HEALTH", val: sysHealth, sub: data?.sys?.cpu != null ? `CPU ${data.sys.cpu}%` : "—", color: sysHealth === "NOMINAL" ? GRN : sysHealth === "BUSY" ? AMB : RED },
            ].map(({ label, val, sub, color }) => (
              <div
                key={label}
                style={{
                  background: "rgba(15,22,30,0.9)",
                  border: `1px solid ${color}44`,
                  borderRadius: 8,
                  padding: "8px 10px",
                }}
              >
                <div style={{ fontSize: 9, color: DIM, letterSpacing: 1, marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color, letterSpacing: 1 }}>{val}</div>
                <div style={{ fontSize: 9, color: DIM }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Tab bar */}
          <div style={{ display: "flex", gap: 6, padding: "0 14px 6px", flexShrink: 0 }}>
            {["OVERVIEW", "BLOCKED", "RISKS", "CASES"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "transparent",
                  border: `1px solid ${tab === t ? CY : DIM}`,
                  color: tab === t ? CY : DIM,
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: 9,
                  letterSpacing: 1,
                  padding: "3px 8px",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Content area */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 10px" }}>
            {tab === "OVERVIEW" && (
              <div style={{ fontSize: 11, lineHeight: 1.6, color: "#A0B8C8" }}>
                {data ? (
                  <>
                    <p style={{ margin: "8px 0 4px", color: CY, fontSize: 10, letterSpacing: 1 }}>SITUATION</p>
                    <p style={{ margin: "0 0 6px" }}>
                      {data.tasks.length} tasks in the system, <span style={{ color: AMB }}>{blocked.length} blocked</span>.&nbsp;
                      {critRisks.length > 0
                        ? <><span style={{ color: RED }}>{critRisks.length} critical or high-severity risk signals</span> require immediate attention.</>
                        : "Risk signals are within acceptable parameters."}&nbsp;
                      {activeSwarm.length} swarm jobs actively running.
                    </p>
                    <p style={{ margin: "0 0 6px" }}>
                      {openInv.length > 0
                        ? <><span style={{ color: AMB }}>{openInv.length} investigations</span> are open or escalated.</>
                        : "No open investigations."}&nbsp;
                      {critOps.length > 0
                        ? <><span style={{ color: RED }}>{critOps.length} critical ops events</span> on record.</>
                        : `${data.ops.length} operational events, none critical.`}
                    </p>
                    <p style={{ margin: 0, color: sysHealth === "NOMINAL" ? GRN : sysHealth === "BUSY" ? AMB : RED }}>
                      System health: {sysHealth}.
                    </p>
                  </>
                ) : (
                  <span style={{ color: DIM }}>{loading ? "Loading briefing data…" : "No data available."}</span>
                )}
              </div>
            )}

            {tab === "BLOCKED" && (
              <div>
                {blocked.length === 0 ? (
                  <p style={{ color: GRN, fontSize: 11, margin: "10px 0" }}>No blocked tasks. All clear.</p>
                ) : (
                  blocked.map((t, i) => (
                    <div
                      key={t.id || i}
                      style={{
                        borderBottom: `1px solid ${DIM}33`,
                        padding: "7px 0",
                        fontSize: 11,
                      }}
                    >
                      <span style={{ color: AMB }}>⊡ </span>
                      <span style={{ color: "#DCEBF5" }}>
                        {t.title || t.name || t.task_name || `Task ${t.id || i + 1}`}
                      </span>
                      {t.priority && (
                        <span style={{ marginLeft: 8, fontSize: 9, color: DIM }}>
                          [{t.priority.toUpperCase()}]
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === "RISKS" && (
              <div>
                {critRisks.length === 0 ? (
                  <p style={{ color: GRN, fontSize: 11, margin: "10px 0" }}>No critical/high risk signals active.</p>
                ) : (
                  critRisks.map((r, i) => {
                    const sev = (r.severity || r.level || r.priority || "").toLowerCase();
                    const col = sev === "critical" ? RED : AMB;
                    return (
                      <div key={r.id || i} style={{ borderBottom: `1px solid ${DIM}33`, padding: "7px 0", fontSize: 11 }}>
                        <span style={{ color: col }}>⚡ </span>
                        <span style={{ color: "#DCEBF5" }}>
                          {r.name || r.title || r.signal_name || `Signal ${r.id || i + 1}`}
                        </span>
                        <span style={{ marginLeft: 8, fontSize: 9, color: col }}>[{sev.toUpperCase()}]</span>
                        {r.description && (
                          <div style={{ color: DIM, fontSize: 9, marginTop: 2 }}>
                            {String(r.description).slice(0, 100)}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {tab === "CASES" && (
              <div>
                {openInv.length === 0 ? (
                  <p style={{ color: GRN, fontSize: 11, margin: "10px 0" }}>No open or escalated cases.</p>
                ) : (
                  openInv.map((c, i) => {
                    const st = (c.status || c.state || "").toLowerCase();
                    const col = st === "escalated" ? RED : AMB;
                    return (
                      <div key={c.id || i} style={{ borderBottom: `1px solid ${DIM}33`, padding: "7px 0", fontSize: 11 }}>
                        <span style={{ color: col }}>◉ </span>
                        <span style={{ color: "#DCEBF5" }}>
                          {c.title || c.name || c.case_name || `Case ${c.id || i + 1}`}
                        </span>
                        <span style={{ marginLeft: 8, fontSize: 9, color: col }}>[{st.toUpperCase()}]</span>
                        {c.lead && <span style={{ marginLeft: 6, fontSize: 9, color: DIM }}>Lead: {c.lead}</span>}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* AI Brief section */}
          {briefing_ai && (
            <div
              style={{
                borderTop: `1px solid ${CY}22`,
                padding: "10px 14px",
                flexShrink: 0,
                fontSize: 11,
                lineHeight: 1.6,
                color: "#A8CEDE",
                background: `${CY}09`,
              }}
            >
              <div style={{ fontSize: 9, color: CY, letterSpacing: 2, marginBottom: 4 }}>AI SITREP</div>
              {speaking
                ? <span style={{ color: CY }}>◍ speaking…</span>
                : briefing_ai}
            </div>
          )}

          {/* Footer */}
          <div
            style={{
              borderTop: `1px solid ${CY}22`,
              padding: "8px 14px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <button
              onClick={brief}
              disabled={!data || loading}
              style={{
                background: `${CY}18`,
                border: `1px solid ${CY}`,
                color: CY,
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 10,
                letterSpacing: 1,
                padding: "5px 12px",
                borderRadius: 4,
                cursor: data && !loading ? "pointer" : "not-allowed",
                opacity: data && !loading ? 1 : 0.5,
              }}
            >
              ▶ BRIEF ME
            </button>
            <button
              onClick={load}
              style={{
                background: "transparent",
                border: `1px solid ${DIM}`,
                color: DIM,
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 10,
                padding: "5px 10px",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              ↺ REFRESH
            </button>
            <span style={{ marginLeft: "auto", fontSize: 9, color: DIM }}>
              auto-refresh 5 min
            </span>
          </div>
        </div>
      )}
    </>
  );
}
