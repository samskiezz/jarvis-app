/**
 * OpsInvCorrelator — F80.
 *
 * Parallel-fetches /v1/ops/events + /v1/investigations.
 * Keyword-correlates critical/high severity ops events (sev ≥ 50) against open
 * investigation case titles, descriptions, and subjects to surface which operational
 * events may be driving (or linked to) active investigation cases.
 *
 * Stat tiles: ops events / open cases / correlated events / uncorrelated events
 * Filter tabs: ALL / CORRELATED / UNCORRELATED
 * Rows sorted by severity descending.
 * Click ▶ ANALYZE on a correlated event → /v1/jarvis/agent/chat AI 2-sentence
 *   operational-intelligence linkage assessment + TTS via jarvis:speak-dossier.
 * 30s auto-refresh.
 *
 * Intent: "ops investigation" / "event case" / "ops case" / "operational case" /
 *         "ops correlation" / "event investigation" / "oicorr"
 *   → jarvis:opsinvcorr-toggle + TTS brief via buildOpsInvCorrScript()
 *
 * Toggle: ⚡ OICORR at left:7044, zIndex 65. Red badge shows correlated-event count.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3D5A";
const BTN_LEFT   = 7044;
const REFRESH_MS = 30_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.events)) return raw.events;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

function normaliseEvents(raw) {
  return normaliseArray(raw).map((e) => ({
    id: e.id || e.event_id || String(Math.random()),
    title: e.title || e.name || e.message || e.description || "Unnamed Event",
    description: e.description || e.details || e.message || "",
    severity: Number(e.severity || e.sev || e.level || 0),
    status: (e.status || "open").toLowerCase(),
    type: e.type || e.category || e.source || "",
    timestamp: e.timestamp || e.created_at || e.date || "",
    service: e.service || e.host || e.component || "",
  }));
}

function normaliseInvestigations(raw) {
  return normaliseArray(raw).map((inv) => ({
    id: inv.id || inv.case_id || String(Math.random()),
    title: inv.title || inv.name || inv.case_name || "Unnamed Case",
    description: inv.description || inv.summary || inv.details || "",
    status: (inv.status || "open").toLowerCase(),
    priority: inv.priority || inv.severity || "",
    subject: inv.subject || inv.target || inv.person_of_interest || "",
  }));
}

function keywords(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function eventMatchScore(evt, investigations) {
  const evtWords = [
    ...keywords(evt.title),
    ...keywords(evt.description),
    ...keywords(evt.type),
    ...keywords(evt.service),
  ];
  const matched = investigations.filter((inv) => {
    const invText = `${inv.title} ${inv.description} ${inv.subject}`.toLowerCase();
    return evtWords.some((w) => invText.includes(w));
  });
  return matched;
}

function correlate(events, investigations) {
  const openCases = investigations.filter(
    (inv) => inv.status === "open" || inv.status === "in-progress" || inv.status === "in_progress"
  );
  return events.map((evt) => ({
    ...evt,
    matchedCases: eventMatchScore(evt, openCases),
  }));
}

function sevColor(sev) {
  if (sev >= 90) return RED;
  if (sev >= 70) return AMBER;
  if (sev >= 50) return CY;
  return "#445566";
}

function sevLabel(sev) {
  if (sev >= 90) return "CRITICAL";
  if (sev >= 70) return "HIGH";
  if (sev >= 50) return "MEDIUM";
  return "LOW";
}

function priorityColor(p) {
  const lp = String(p).toLowerCase();
  if (lp === "critical") return RED;
  if (lp === "high") return AMBER;
  if (lp === "medium") return CY;
  return "#445566";
}

// ─── exported intent helpers (consumed by JarvisBrain) ───────────────────────

const OICORR_RE =
  /ops.{0,15}invest|invest.{0,15}ops|event.{0,12}case|case.{0,12}event|ops.{0,15}case|operational.{0,12}case|ops.{0,15}correlat|event.{0,15}invest|oicorr\b/i;

export function isOpsInvCorrQuery(q) {
  return OICORR_RE.test(q || "");
}

export async function buildOpsInvCorrScript() {
  try {
    const [opsRaw, invRaw] = await Promise.all([
      fetch(`${apiBase()}/v1/ops/events?limit=50`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
      fetch(`${apiBase()}/v1/investigations`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
    ]);
    const events = normaliseEvents(opsRaw);
    const investigations = normaliseInvestigations(invRaw);
    const correlated = correlate(events, investigations);
    const matched = correlated.filter((e) => e.matchedCases.length > 0);
    const criticals = matched.filter((e) => e.severity >= 90).length;
    window.dispatchEvent(new CustomEvent("jarvis:opsinvcorr-toggle"));
    return `Ops-investigation correlator active, sir. ${events.length} operational event${events.length !== 1 ? "s" : ""} cross-referenced against ${investigations.length} case${investigations.length !== 1 ? "s" : ""}. ${matched.length} event${matched.length !== 1 ? "s correlate" : " correlates"} to active investigations, with ${criticals} critical-severity match${criticals !== 1 ? "es" : ""} flagged. Select any event to request an AI linkage assessment.`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:opsinvcorr-toggle"));
    return "Ops-investigation correlator is online, sir. Awaiting data to cross-reference operational events against active cases.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function OpsInvCorrelator() {
  const [visible, setVisible]   = useState(false);
  const [events, setEvents]     = useState([]);
  const [cases, setCases]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState("CORRELATED");
  const [expanded, setExpanded] = useState(null);
  const [analyzing, setAnalyzing] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [opsRaw, invRaw] = await Promise.all([
        fetch(`${apiBase()}/v1/ops/events?limit=50`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
        fetch(`${apiBase()}/v1/investigations`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
      ]);
      setEvents(normaliseEvents(opsRaw));
      setCases(normaliseInvestigations(invRaw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:opsinvcorr-toggle", onToggle);
    return () => window.removeEventListener("jarvis:opsinvcorr-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function analyzeEvent(evt) {
    setAnalyzing(evt.id);
    const caseNames = evt.matchedCases.map((c) => `"${c.title}"`).join(", ");
    const prompt = `As JARVIS, provide a 2-sentence operational-intelligence assessment of the linkage between the "${evt.title}" ops event (severity ${evt.severity}) and the investigation case${evt.matchedCases.length > 1 ? "s" : ""} ${caseNames}. Focus on the most likely causal or evidential relationship and its priority implications.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Insufficient operational data to determine case linkage at this time, sir.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", {
          detail: { text: "Linkage assessment unavailable at this time, sir." },
        })
      );
    }
    setAnalyzing(null);
  }

  const correlated = correlate(events, cases);
  const matched    = correlated.filter((e) => e.matchedCases.length > 0);
  const unmatched  = correlated.filter((e) => e.matchedCases.length === 0);
  const critBadge  = matched.filter((e) => e.severity >= 90).length;

  const displayed =
    tab === "ALL" ? [...correlated].sort((a, b) => b.severity - a.severity)
    : tab === "CORRELATED" ? [...matched].sort((a, b) => b.severity - a.severity)
    : [...unmatched].sort((a, b) => b.severity - a.severity);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Ops-Investigation Correlator (F80)"
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
        ⚡ OICORR
        {critBadge > 0 && (
          <span style={{
            marginLeft: 4, background: RED, color: "#fff",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{critBadge}</span>
        )}
      </button>

      {visible && (
        <div style={{
          position: "fixed", bottom: 32, left: BTN_LEFT - 280, zIndex: 65,
          width: 580, maxHeight: "72vh", overflowY: "auto",
          background: "rgba(6,11,18,0.93)",
          border: `1px solid ${CY}44`,
          borderRadius: 10, padding: "14px 16px",
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${CY}18`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>⚡ OPS-INVESTIGATION CORRELATOR</span>
            <button
              onClick={fetchData}
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
              ["OPS EVENTS", events.length, CY],
              ["OPEN CASES", cases.filter((c) => c.status === "open" || c.status === "in-progress" || c.status === "in_progress").length, "#A78BFA"],
              ["CORRELATED", matched.length, AMBER],
              ["UNCORRELATED", unmatched.length, GREEN],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 5, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: "bold" }}>{loading ? "…" : val}</div>
                <div style={{ color: "#445566", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
            {["ALL", "CORRELATED", "UNCORRELATED"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "transparent",
                  border: `1px solid ${tab === t ? CY : "#1e3040"}`,
                  color: tab === t ? CY : "#445566",
                  borderRadius: 4, padding: "3px 10px",
                  fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                  letterSpacing: 1, cursor: "pointer",
                }}
              >{t}</button>
            ))}
          </div>

          {/* Event rows */}
          {loading && displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              correlating ops events against investigations…
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              {tab === "CORRELATED"
                ? "No ops events correlate to open investigations."
                : "No events in this filter."}
            </div>
          ) : (
            displayed.map((evt) => {
              const sc  = sevColor(evt.severity);
              const hasMatches = evt.matchedCases.length > 0;
              const isOpen = expanded === evt.id;
              return (
                <div
                  key={evt.id}
                  style={{
                    background: evt.severity >= 90 ? `${RED}08` : "rgba(255,255,255,0.02)",
                    border: `1px solid ${isOpen ? `${CY}44` : evt.severity >= 90 ? `${RED}33` : "#1a2530"}`,
                    borderRadius: 6, padding: "8px 10px", marginBottom: 6,
                    cursor: "pointer",
                    animation: evt.severity >= 90 ? "oicorr-pulse 2s ease-in-out infinite" : "none",
                  }}
                  onClick={() => setExpanded(isOpen ? null : evt.id)}
                >
                  {/* Event header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 7, color: sc, border: `1px solid ${sc}55`,
                      borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                      whiteSpace: "nowrap",
                    }}>{sevLabel(evt.severity)}</span>
                    {evt.severity > 0 && (
                      <span style={{ fontSize: 7, color: `${sc}99`, whiteSpace: "nowrap" }}>
                        sev {evt.severity}
                      </span>
                    )}
                    <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{evt.title}</span>
                    <span style={{
                      fontSize: 7, color: hasMatches ? AMBER : "#334455",
                      whiteSpace: "nowrap",
                    }}>
                      {hasMatches
                        ? `${evt.matchedCases.length} case${evt.matchedCases.length !== 1 ? "s" : ""}`
                        : "no cases"}
                    </span>
                  </div>

                  {/* Service / type row */}
                  {(evt.service || evt.type) && (
                    <div style={{ color: "#556677", fontSize: 8, lineHeight: 1.4, marginBottom: 4 }}>
                      {[evt.service, evt.type].filter(Boolean).join(" · ")}
                    </div>
                  )}

                  {/* Analyze button */}
                  {hasMatches && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {evt.timestamp && (
                        <span style={{ fontSize: 7, color: "#334455", flex: 1 }}>
                          {String(evt.timestamp).slice(0, 19).replace("T", " ")}
                        </span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); analyzeEvent(evt); }}
                        disabled={analyzing === evt.id}
                        style={{
                          background: analyzing === evt.id ? "#1a2530" : `${AMBER}18`,
                          color: analyzing === evt.id ? "#445566" : AMBER,
                          border: `1px solid ${AMBER}44`,
                          borderRadius: 3, padding: "2px 8px",
                          fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                          letterSpacing: 1, cursor: analyzing === evt.id ? "default" : "pointer",
                        }}
                      >{analyzing === evt.id ? "…analyzing" : "▶ ANALYZE"}</button>
                    </div>
                  )}

                  {/* Expanded case list */}
                  {isOpen && hasMatches && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${CY}18` }}>
                      <div style={{ color: "#445566", fontSize: 8, letterSpacing: 1, marginBottom: 6 }}>
                        LINKED INVESTIGATIONS
                      </div>
                      {evt.matchedCases.map((inv) => {
                        const pc = priorityColor(inv.priority);
                        return (
                          <div key={inv.id} style={{
                            background: "rgba(255,255,255,0.02)",
                            border: "1px solid #1e3040",
                            borderRadius: 4, padding: "6px 8px", marginBottom: 4,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                              <span style={{
                                fontSize: 7, color: RED, border: `1px solid ${RED}44`,
                                borderRadius: 2, padding: "1px 4px", letterSpacing: 1,
                              }}>
                                {inv.status.toUpperCase()}
                              </span>
                              {inv.priority && (
                                <span style={{
                                  fontSize: 7, color: pc, border: `1px solid ${pc}44`,
                                  borderRadius: 2, padding: "1px 4px", letterSpacing: 1,
                                }}>
                                  {String(inv.priority).toUpperCase()}
                                </span>
                              )}
                              <span style={{ color: "#a0b8cc", fontSize: 10 }}>{inv.title}</span>
                            </div>
                            {inv.description && (
                              <div style={{ color: "#445566", fontSize: 8, lineHeight: 1.4 }}>
                                {inv.description.slice(0, 100)}{inv.description.length > 100 ? "…" : ""}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {isOpen && !hasMatches && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #1a2530", color: "#334455", fontSize: 8 }}>
                      No active investigations correlate to this event.
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div style={{ marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right" }}>
            /v1/ops/events + /v1/investigations · 30s auto-refresh · click ▶ ANALYZE for AI linkage assessment
          </div>
        </div>
      )}

      <style>{`
        @keyframes oicorr-pulse {
          0%, 100% { box-shadow: 0 0 0 0 ${RED}00; }
          50% { box-shadow: 0 0 8px 2px ${RED}44; }
        }
      `}</style>
    </>
  );
}
