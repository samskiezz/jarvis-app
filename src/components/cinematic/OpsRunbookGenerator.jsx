/**
 * OpsRunbookGenerator — F60.
 *
 * Fetches /v1/ops/events (confirmed real endpoint under /v1/ops/*), lists
 * recent critical/high severity events, and lets the user click any event to
 * request a JARVIS-generated 3-step remediation runbook from /v1/jarvis/agent/chat.
 * The top step is spoken aloud via jarvis:speak-dossier → TTS.
 *
 * Wired in JarvisBrain: "JARVIS, runbook" / "remediation" / "playbook"
 *   → jarvis:runbook-toggle event + TTS brief via buildRunbookScript().
 *
 * Toggle button: ◎ RUNBOOK at left:4964, zIndex 65 (same strip as other panels).
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const RED = "#FF3D5A";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const BTN_LEFT = 4964;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isRunbookQuery(q) {
  return /runbook|remediat|playbook|mitigation|fix steps|resolve steps|ops run|incident response/i.test(
    q || ""
  );
}

export async function buildRunbookScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/ops/events?limit=20`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!r.ok) throw new Error("ops/events unavailable");
    const d = await r.json();
    const events = Array.isArray(d) ? d : d.events || d.items || [];
    const criticals = events.filter(
      (e) => (e.severity || e.sev || 0) >= 70
    ).length;
    const total = events.length;
    window.dispatchEvent(new CustomEvent("jarvis:runbook-toggle"));
    if (!total) return "No recent ops events detected, sir. All systems appear nominal.";
    return `Ops runbook panel online, sir. ${total} recent events loaded, ${criticals} critical. Select any event to generate a three-step remediation plan.`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:runbook-toggle"));
    return "Ops runbook panel open, sir. Select an event to generate a remediation plan.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function OpsRunbookGenerator() {
  const [visible, setVisible] = useState(false);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [runbook, setRunbook] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [filter, setFilter] = useState("all");
  const critBadge = events.filter((e) => sev(e) >= 90).length;
  const pollRef = useRef(null);

  const fetchEvents = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase()}/v1/ops/events?limit=30`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) return;
      const d = await r.json();
      const arr = Array.isArray(d) ? d : d.events || d.items || [];
      setEvents(arr);
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:runbook-toggle", onToggle);
    return () => window.removeEventListener("jarvis:runbook-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetchEvents().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchEvents, 30_000);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchEvents]);

  async function generateRunbook(event) {
    setSelectedId(event.id || event.event_id || event.title);
    setRunbook(null);
    setGenerating(true);
    const sevLabel = sev(event) >= 90 ? "CRITICAL" : sev(event) >= 70 ? "HIGH" : "MEDIUM";
    const prompt = `Generate a concise 3-step remediation runbook for this ops event. Event: "${event.title || event.name || event.type || "Unknown event"}". Severity: ${sevLabel}. Category: ${event.category || event.type || "operational"}. Format your response as exactly three numbered steps (STEP 1: …, STEP 2: …, STEP 3: …). Be specific and actionable.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setRunbook(answer || "No runbook generated. Please retry.");
      if (answer) {
        const firstStep = answer.split(/\n/)[0];
        window.dispatchEvent(
          new CustomEvent("jarvis:speak-dossier", { detail: { text: firstStep } })
        );
      }
    } catch (_) {
      setRunbook("Unable to reach JARVIS reasoning core. Please retry.");
    } finally {
      setGenerating(false);
    }
  }

  const filtered = events.filter((e) => {
    if (filter === "critical") return sev(e) >= 90;
    if (filter === "high") return sev(e) >= 70 && sev(e) < 90;
    return true;
  });

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Ops Runbook Generator"
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 65,
          height: 26,
          padding: "0 8px",
          background: visible ? `${RED}22` : "rgba(8,14,22,0.82)",
          border: `1px solid ${visible ? RED : "#2A3A4A"}`,
          borderRadius: 5,
          color: visible ? RED : "#6E8AA0",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          letterSpacing: 1,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {critBadge > 0 && visible === false && (
          <span
            style={{
              display: "inline-block",
              marginRight: 5,
              background: RED,
              color: "#fff",
              borderRadius: "50%",
              width: 14,
              height: 14,
              fontSize: 9,
              lineHeight: "14px",
              textAlign: "center",
            }}
          >
            {critBadge}
          </span>
        )}
        ◎ RUNBOOK
      </button>

      {/* Panel */}
      {visible && (
        <div
          style={{
            position: "fixed",
            bottom: 44,
            left: Math.min(BTN_LEFT, window.innerWidth - 540),
            zIndex: 65,
            width: 520,
            maxHeight: "70vh",
            display: "flex",
            flexDirection: "column",
            background: "rgba(4,10,18,0.94)",
            border: `1px solid ${RED}44`,
            borderTop: `2px solid ${RED}`,
            borderRadius: 12,
            boxShadow: `0 0 40px ${RED}18, 0 8px 32px rgba(0,0,0,0.7)`,
            fontFamily: "'JetBrains Mono', monospace",
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
              borderBottom: `1px solid ${RED}22`,
              flexShrink: 0,
            }}
          >
            <span style={{ color: RED, fontSize: 14 }}>◎</span>
            <span style={{ color: RED, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              OPS RUNBOOK GENERATOR
            </span>
            {loading && (
              <span style={{ marginLeft: "auto", color: "#6E8AA0", fontSize: 10 }}>
                loading…
              </span>
            )}
            <button
              onClick={() => setVisible(false)}
              style={{
                marginLeft: "auto",
                background: "transparent",
                border: "none",
                color: "#6E8AA0",
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* Filter tabs */}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "8px 14px",
              borderBottom: `1px solid #1A2A3A`,
              flexShrink: 0,
            }}
          >
            {["all", "critical", "high"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  border: `1px solid ${filter === f ? RED : "#2A3A4A"}`,
                  background: filter === f ? `${RED}22` : "transparent",
                  color: filter === f ? RED : "#6E8AA0",
                  fontSize: 10,
                  letterSpacing: 1,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textTransform: "uppercase",
                }}
              >
                {f}
              </button>
            ))}
            <span style={{ marginLeft: "auto", color: "#6E8AA0", fontSize: 10 }}>
              {filtered.length} events
            </span>
          </div>

          {/* Split: event list + runbook */}
          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
            {/* Event list */}
            <div
              style={{
                width: 220,
                overflowY: "auto",
                borderRight: `1px solid #1A2A3A`,
                flexShrink: 0,
              }}
            >
              {!loading && filtered.length === 0 && (
                <div style={{ padding: 14, color: "#6E8AA0", fontSize: 11 }}>
                  No events found.
                </div>
              )}
              {filtered.map((ev, i) => {
                const s = sev(ev);
                const accent = s >= 90 ? RED : s >= 70 ? AMBER : CY;
                const isSelected =
                  (ev.id || ev.event_id || ev.title) === selectedId;
                return (
                  <div
                    key={ev.id || ev.event_id || i}
                    onClick={() => generateRunbook(ev)}
                    style={{
                      padding: "8px 10px",
                      borderBottom: `1px solid #0E1A26`,
                      cursor: "pointer",
                      background: isSelected ? `${RED}12` : "transparent",
                      borderLeft: `2px solid ${isSelected ? RED : "transparent"}`,
                      transition: "background 0.1s",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginBottom: 3,
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: accent,
                          boxShadow: s >= 90 ? `0 0 6px ${RED}` : "none",
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 9,
                          letterSpacing: 1,
                          color: accent,
                          flexShrink: 0,
                        }}
                      >
                        {s >= 90 ? "CRIT" : s >= 70 ? "HIGH" : "MED"}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#DCEBF5",
                        lineHeight: 1.3,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {ev.title || ev.name || ev.type || "Unnamed event"}
                    </div>
                    {ev.timestamp && (
                      <div
                        style={{ fontSize: 9, color: "#4E6A7A", marginTop: 2 }}
                      >
                        {new Date(ev.timestamp).toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Runbook pane */}
            <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
              {!selectedId && (
                <div
                  style={{
                    color: "#6E8AA0",
                    fontSize: 11,
                    lineHeight: 1.6,
                    paddingTop: 8,
                  }}
                >
                  Select an ops event on the left.
                  <br />
                  JARVIS will generate a three-step remediation runbook using
                  the live knowledge graph.
                </div>
              )}

              {generating && (
                <div style={{ color: CY, fontSize: 11, letterSpacing: 1 }}>
                  consulting the knowledge graph…
                </div>
              )}

              {!generating && runbook && (
                <>
                  <div
                    style={{
                      fontSize: 10,
                      color: RED,
                      letterSpacing: 2,
                      fontWeight: 700,
                      marginBottom: 10,
                    }}
                  >
                    REMEDIATION RUNBOOK
                  </div>
                  {parseRunbook(runbook).map((step, idx) => (
                    <div
                      key={idx}
                      style={{
                        marginBottom: 12,
                        padding: "8px 10px",
                        background: "rgba(255,61,90,0.06)",
                        border: `1px solid ${RED}22`,
                        borderLeft: `3px solid ${RED}`,
                        borderRadius: 6,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 9,
                          color: RED,
                          letterSpacing: 1,
                          marginBottom: 4,
                          fontWeight: 700,
                        }}
                      >
                        STEP {idx + 1}
                      </div>
                      <div
                        style={{ fontSize: 12, color: "#DCEBF5", lineHeight: 1.5 }}
                      >
                        {step}
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => generateRunbook(
                      events.find(
                        (e) =>
                          (e.id || e.event_id || e.title) === selectedId
                      ) || {}
                    )}
                    style={{
                      marginTop: 4,
                      padding: "4px 12px",
                      background: "transparent",
                      border: `1px solid ${RED}55`,
                      borderRadius: 4,
                      color: RED,
                      fontSize: 10,
                      letterSpacing: 1,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    REGENERATE
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "5px 14px",
              borderTop: `1px solid ${RED}18`,
              fontSize: 10,
              color: "#4E6A7A",
              letterSpacing: 1,
              flexShrink: 0,
            }}
          >
            /v1/ops/events + /v1/jarvis/agent/chat · 30s auto-refresh · click event to generate plan
          </div>
        </div>
      )}
    </>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function sev(e) {
  return Number(e.severity ?? e.sev ?? e.priority ?? 0);
}

function parseRunbook(text) {
  const steps = text
    .split(/(?:STEP\s*\d+\s*:?\s*)/i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (steps.length >= 2) return steps.slice(0, 3);
  return text
    .split(/\n+/)
    .map((l) => l.replace(/^\d+[\.\)]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 3);
}
