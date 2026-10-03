/**
 * DailyBriefingPanel — F59 (DBRIEF).
 * Aggregates /entities/Task + /entities/RiskSignal + /v1/ops/alerts + /v1/investigations
 * into a prioritized daily briefing. ▶ BRIEF OUT speaks it via /v1/voice/tts.
 * ⚑ BRIEF button left:944140 bottom:8 zIndex:642.
 * 120-s auto-refresh. Additive only — mounted via App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const CY = "#29E7FF";
const GR = "#4ADE80";
const AM = "#F59E0B";
const RD = "#EF4444";
const BG = "rgba(0,10,20,0.96)";
const MN = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
const REFRESH_MS = 120_000;
const BTN_LEFT = 944140;
const Z = 642;

const DBRIEF_RE =
  /\bdbrief\b|daily\s+brief(?:ing)?|morning\s+brief(?:ing)?|situation\s+report|sitrep\b|daily\s+status|status\s+brief/i;

export function isDbriefQuery(text) {
  return DBRIEF_RE.test(text || "");
}

function authHdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

async function fetchBriefingData() {
  const base = apiBase();
  const [tasksRes, risksRes, alertsRes, invRes] = await Promise.allSettled([
    fetch(`${base}/entities/Task`, { headers: authHdr() }).then((r) => r.json()),
    fetch(`${base}/entities/RiskSignal`, { headers: authHdr() }).then((r) => r.json()),
    fetch(`${base}/v1/ops/alerts`, { headers: authHdr() }).then((r) => r.json()),
    fetch(`${base}/v1/investigations`, { headers: authHdr() }).then((r) => r.json()),
  ]);

  const tasks = Array.isArray(tasksRes.value) ? tasksRes.value
    : Array.isArray(tasksRes.value?.items) ? tasksRes.value.items
    : Array.isArray(tasksRes.value?.results) ? tasksRes.value.results
    : [];
  const risks = Array.isArray(risksRes.value) ? risksRes.value
    : Array.isArray(risksRes.value?.items) ? risksRes.value.items
    : Array.isArray(risksRes.value?.results) ? risksRes.value.results
    : [];
  const alerts = Array.isArray(alertsRes.value) ? alertsRes.value
    : Array.isArray(alertsRes.value?.alerts) ? alertsRes.value.alerts
    : Array.isArray(alertsRes.value?.items) ? alertsRes.value.items
    : [];
  const investigations = Array.isArray(invRes.value) ? invRes.value
    : Array.isArray(invRes.value?.items) ? invRes.value.items
    : Array.isArray(invRes.value?.results) ? invRes.value.results
    : [];

  return { tasks, risks, alerts, investigations };
}

function buildBriefingLines({ tasks, risks, alerts, investigations }) {
  const lines = [];

  // Critical risks first
  const critRisks = risks.filter(
    (r) => (r.severity || "").toLowerCase() === "critical"
  );
  if (critRisks.length) {
    lines.push({
      priority: "CRITICAL",
      category: "RISK",
      text: `${critRisks.length} critical risk signal${critRisks.length > 1 ? "s" : ""}: ${critRisks
        .slice(0, 3)
        .map((r) => r.name || r.title || "unnamed")
        .join(", ")}`,
      color: RD,
    });
  }

  // Unack'd critical alerts
  const critAlerts = alerts.filter(
    (a) =>
      (a.severity || a.level || "").toLowerCase() === "critical" &&
      !a.acknowledged
  );
  if (critAlerts.length) {
    lines.push({
      priority: "CRITICAL",
      category: "ALERT",
      text: `${critAlerts.length} unacknowledged critical alert${critAlerts.length > 1 ? "s" : ""}`,
      color: RD,
    });
  }

  // In-progress tasks
  const activeTasks = tasks.filter(
    (t) => (t.status || "").toLowerCase() === "in_progress"
  );
  if (activeTasks.length) {
    lines.push({
      priority: "HIGH",
      category: "TASKS",
      text: `${activeTasks.length} task${activeTasks.length > 1 ? "s" : ""} in progress: ${activeTasks
        .slice(0, 3)
        .map((t) => t.name || t.title || "unnamed")
        .join(", ")}`,
      color: CY,
    });
  }

  // Pending tasks
  const pendingTasks = tasks.filter(
    (t) => (t.status || "").toLowerCase() === "pending"
  );
  if (pendingTasks.length) {
    lines.push({
      priority: "MEDIUM",
      category: "TASKS",
      text: `${pendingTasks.length} pending task${pendingTasks.length > 1 ? "s" : ""} awaiting action`,
      color: AM,
    });
  }

  // Open investigations
  const openInv = investigations.filter(
    (i) =>
      (i.status || "").toLowerCase() !== "closed" &&
      (i.status || "").toLowerCase() !== "resolved"
  );
  if (openInv.length) {
    lines.push({
      priority: "MEDIUM",
      category: "INTEL",
      text: `${openInv.length} open investigation${openInv.length > 1 ? "s" : ""}: ${openInv
        .slice(0, 2)
        .map((i) => i.name || i.title || "unnamed")
        .join(", ")}`,
      color: AM,
    });
  }

  // High risks
  const highRisks = risks.filter(
    (r) => (r.severity || "").toLowerCase() === "high"
  );
  if (highRisks.length) {
    lines.push({
      priority: "HIGH",
      category: "RISK",
      text: `${highRisks.length} high-severity risk signal${highRisks.length > 1 ? "s" : ""} active`,
      color: "#F97316",
    });
  }

  if (!lines.length) {
    lines.push({
      priority: "OK",
      category: "STATUS",
      text: "No critical items. All systems nominal.",
      color: GR,
    });
  }

  return lines;
}

export async function buildDbriefScript() {
  try {
    const data = await fetchBriefingData();
    const lines = buildBriefingLines(data);
    const { tasks, risks, alerts, investigations } = data;
    const critCount = risks.filter(
      (r) => (r.severity || "").toLowerCase() === "critical"
    ).length;
    const activeTasks = tasks.filter(
      (t) => (t.status || "").toLowerCase() === "in_progress"
    ).length;
    const openInv = investigations.filter(
      (i) =>
        (i.status || "").toLowerCase() !== "closed" &&
        (i.status || "").toLowerCase() !== "resolved"
    ).length;
    const critAlerts = alerts.filter(
      (a) =>
        (a.severity || a.level || "").toLowerCase() === "critical" &&
        !a.acknowledged
    ).length;

    return (
      `JARVIS Daily Briefing. ` +
      `${critCount} critical risk signal${critCount !== 1 ? "s" : ""}. ` +
      `${critAlerts} unacknowledged critical alert${critAlerts !== 1 ? "s" : ""}. ` +
      `${activeTasks} task${activeTasks !== 1 ? "s" : ""} in progress. ` +
      `${openInv} open investigation${openInv !== 1 ? "s" : ""}. ` +
      (lines[0]?.priority === "CRITICAL"
        ? `Priority action: ${lines[0].text}.`
        : "No critical items. All systems nominal.")
    );
  } catch {
    return "Unable to compile daily briefing at this time.";
  }
}

async function speakText(text) {
  try {
    const voice = getActiveVoice ? getActiveVoice() : "ash";
    const res = await fetch(`${apiBase()}/v1/voice/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHdr() },
      body: JSON.stringify({ text, voice }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    audio.play().catch(() => {});
  } catch {}
}

const PRIORITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, OK: 4 };

export default function DailyBriefingPanel() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchBriefingData();
      setData(d);
      const l = buildBriefingLines(d);
      l.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));
      setLines(l);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.panel === "dbrief") setOpen((v) => !v);
    };
    window.addEventListener("jarvis:dbrief-toggle", handler);
    return () => window.removeEventListener("jarvis:dbrief-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const handleBriefOut = async () => {
    if (speaking) return;
    setSpeaking(true);
    const script = await buildDbriefScript();
    await speakText(script);
    setSpeaking(false);
  };

  const critCount = data
    ? data.risks.filter((r) => (r.severity || "").toLowerCase() === "critical").length
    : 0;
  const activeTasks = data
    ? data.tasks.filter((t) => (t.status || "").toLowerCase() === "in_progress").length
    : 0;
  const openInv = data
    ? data.investigations.filter(
        (i) =>
          (i.status || "").toLowerCase() !== "closed" &&
          (i.status || "").toLowerCase() !== "resolved"
      ).length
    : 0;
  const critAlerts = data
    ? data.alerts.filter(
        (a) =>
          (a.severity || a.level || "").toLowerCase() === "critical" && !a.acknowledged
      ).length
    : 0;

  const hasCrit = critCount > 0 || critAlerts > 0;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: Z,
          background: open
            ? "rgba(41,231,255,0.18)"
            : hasCrit
            ? "rgba(239,68,68,0.18)"
            : "rgba(0,10,20,0.75)",
          border: `1px solid ${open ? CY : hasCrit ? RD : "#1e3a5f"}`,
          borderRadius: 6,
          color: open ? CY : hasCrit ? RD : "#64a0c8",
          fontFamily: MN,
          fontSize: 10,
          padding: "3px 8px",
          cursor: "pointer",
          letterSpacing: 1,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <span>⚑</span>
        <span>BRIEF</span>
        {hasCrit && (
          <span
            style={{
              background: RD,
              color: "#fff",
              borderRadius: 4,
              padding: "0 4px",
              fontSize: 9,
              fontWeight: 700,
            }}
          >
            {critCount + critAlerts}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            left: 240,
            top: 48,
            width: 480,
            maxHeight: "calc(100vh - 80px)",
            background: BG,
            border: `1px solid ${CY}44`,
            borderRadius: 10,
            zIndex: Z + 1,
            fontFamily: MN,
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
              justifyContent: "space-between",
              padding: "10px 14px 8px",
              borderBottom: "1px solid #1e3a5f",
            }}
          >
            <span style={{ color: CY, fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>
              ⚑ DAILY BRIEFING
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={handleBriefOut}
                disabled={speaking || loading}
                style={{
                  background: speaking ? "rgba(74,222,128,0.18)" : "rgba(41,231,255,0.12)",
                  border: `1px solid ${speaking ? GR : CY}44`,
                  borderRadius: 5,
                  color: speaking ? GR : CY,
                  fontFamily: MN,
                  fontSize: 10,
                  padding: "2px 8px",
                  cursor: speaking || loading ? "not-allowed" : "pointer",
                  letterSpacing: 1,
                }}
              >
                {speaking ? "▮ SPEAKING" : "▶ BRIEF OUT"}
              </button>
              <button
                onClick={load}
                disabled={loading}
                style={{
                  background: "transparent",
                  border: `1px solid #1e3a5f`,
                  borderRadius: 5,
                  color: "#64a0c8",
                  fontFamily: MN,
                  fontSize: 10,
                  padding: "2px 8px",
                  cursor: "pointer",
                }}
              >
                ↻
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#64a0c8",
                  fontFamily: MN,
                  fontSize: 13,
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Stat tiles */}
          {data && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4,1fr)",
                gap: 6,
                padding: "8px 14px",
                borderBottom: "1px solid #1e3a5f",
              }}
            >
              {[
                { label: "CRIT RISKS", val: critCount, color: RD },
                { label: "CRIT ALERTS", val: critAlerts, color: RD },
                { label: "ACTIVE TASKS", val: activeTasks, color: CY },
                { label: "OPEN INVEST", val: openInv, color: AM },
              ].map(({ label, val, color }) => (
                <div
                  key={label}
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid #1e3a5f",
                    borderRadius: 5,
                    padding: "4px 6px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ color, fontSize: 16, fontWeight: 700 }}>{val}</div>
                  <div style={{ color: "#64a0c8", fontSize: 8, letterSpacing: 1 }}>{label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Briefing lines */}
          <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px 14px" }}>
            {loading && !data && (
              <div style={{ color: "#64a0c8", fontSize: 11, textAlign: "center", padding: 20 }}>
                Compiling briefing…
              </div>
            )}
            {lines.map((line, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  marginBottom: 8,
                  padding: "6px 8px",
                  background:
                    line.priority === "CRITICAL"
                      ? "rgba(239,68,68,0.08)"
                      : "rgba(255,255,255,0.02)",
                  border: `1px solid ${line.color}22`,
                  borderRadius: 6,
                  animation:
                    line.priority === "CRITICAL" ? "dbrief-pulse 2s infinite" : "none",
                }}
              >
                <div
                  style={{
                    flexShrink: 0,
                    color: line.color,
                    fontSize: 8,
                    fontWeight: 700,
                    letterSpacing: 1,
                    minWidth: 52,
                    paddingTop: 1,
                  }}
                >
                  [{line.priority}]
                </div>
                <div
                  style={{
                    flexShrink: 0,
                    color: "#64a0c8",
                    fontSize: 8,
                    letterSpacing: 1,
                    minWidth: 42,
                    paddingTop: 1,
                  }}
                >
                  {line.category}
                </div>
                <div style={{ color: "#c8d8e8", fontSize: 11, lineHeight: 1.4 }}>
                  {line.text}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes dbrief-pulse {
          0%,100% { border-color: rgba(239,68,68,0.22); }
          50% { border-color: rgba(239,68,68,0.55); }
        }
      `}</style>
    </>
  );
}
