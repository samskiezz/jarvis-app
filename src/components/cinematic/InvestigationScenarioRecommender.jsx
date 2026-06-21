/**
 * InvestigationScenarioRecommender — F68.
 *
 * Parallel-fetch:
 *   /v1/investigations   — open cases
 *   /v1/scenario/list    — available runnable scenarios
 *
 * Keyword-correlates each open investigation against scenario names/descriptions
 * to surface which scenarios could remediate each case. Split panel:
 *   left  — open investigations (click to select)
 *   right — matched scenarios for selected case + ▶ RUN button
 *
 * Click ▶ RUN → POST /v1/scenario/{id}/run → outcome inline.
 * Click ▶ ADVISE → /v1/jarvis/agent/chat AI 2-sentence advisory + TTS.
 *
 * Intent: "investigation scenario" / "case action" / "recommend scenario"
 *   / "scenario for case" / "case remediation"
 *   → jarvis:invscen-toggle + TTS brief via buildInvScenarioScript()
 *
 * Toggle: ◈ INVSC at left:5796, zIndex 65. Badge = matched count.
 * 60 s auto-refresh. Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const GOLD = "#E8A800";
const RED  = "#FF3D5A";
const GREEN = "#4ADE80";
const BTN_LEFT   = 5796;
const REFRESH_MS = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isInvScenarioQuery(q) {
  return /investigat.*scenario|scenario.*investigat|case.*action|case.*remedi|remedi.*case|recommend.*scenario|scenario.*for.*case|inv.*scenario|action.*plan.*case/i.test(
    q || ""
  );
}

export async function buildInvScenarioScript() {
  try {
    const [invData, scenData] = await fetchBoth();
    const invs  = normalizeArray(invData).filter((i) => /open|active|pending|in.progress/i.test(i.status || "open"));
    const scens = normalizeArray(scenData);
    const pairs = correlate(invs, scens);
    window.dispatchEvent(new CustomEvent("jarvis:invscen-toggle"));
    return `Investigation-Scenario Recommender open, sir. ${invs.length} open case${invs.length !== 1 ? "s" : ""} cross-referenced against ${scens.length} available scenario${scens.length !== 1 ? "s" : ""}, yielding ${pairs} matched recommendation${pairs !== 1 ? "s" : ""}.`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:invscen-toggle"));
    return "Investigation-Scenario Recommender open, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function InvestigationScenarioRecommender() {
  const [visible,      setVisible]      = useState(false);
  const [invs,         setInvs]         = useState([]);
  const [scenarios,    setScenarios]    = useState([]);
  const [selectedInv,  setSelectedInv]  = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [running,      setRunning]      = useState({});
  const [outcomes,     setOutcomes]     = useState({});
  const [advising,     setAdvising]     = useState(false);
  const [advice,       setAdvice]       = useState("");
  const timerRef = useRef(null);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:invscen-toggle", onToggle);
    return () => window.removeEventListener("jarvis:invscen-toggle", onToggle);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [invData, scenData] = await fetchBoth();
      const rawInvs = normalizeArray(invData).filter((i) =>
        /open|active|pending|in.progress/i.test(i.status || "open")
      );
      setInvs(rawInvs);
      setScenarios(normalizeArray(scenData));
      if (!selectedInv && rawInvs.length > 0) setSelectedInv(rawInvs[0]);
    } catch {
      // leave existing data
    } finally {
      setLoading(false);
    }
  }, [selectedInv]);

  useEffect(() => {
    if (!visible) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [visible, load]);

  const matched = selectedInv ? matchScenarios(selectedInv, scenarios) : [];
  const totalMatched = invs.reduce((n, inv) => n + matchScenarios(inv, scenarios).length, 0);

  const runScenario = useCallback(async (scen) => {
    const key = scen.id || scen.name;
    setRunning((prev) => ({ ...prev, [key]: true }));
    setOutcomes((prev) => ({ ...prev, [key]: null }));
    try {
      const r = await fetch(`${apiBase()}/v1/scenario/${encodeURIComponent(key)}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ investigation_id: selectedInv?.id }),
      });
      const d = await r.json();
      setOutcomes((prev) => ({ ...prev, [key]: d.outcome || d.result || d.status || "Executed." }));
    } catch {
      setOutcomes((prev) => ({ ...prev, [key]: "Execution failed — check server." }));
    } finally {
      setRunning((prev) => ({ ...prev, [key]: false }));
    }
  }, [selectedInv]);

  const advise = useCallback(async () => {
    if (advising || !selectedInv) return;
    setAdvising(true);
    setAdvice("");
    try {
      const scenNames = matched.map((s) => s.name || s.title || s.id).join(", ") || "none matched";
      const prompt = `In exactly 2 sentences: For the investigation titled "${selectedInv.title || selectedInv.name || selectedInv.id}" with status "${selectedInv.status}", which of these available scenarios would best remediate it and why: ${scenNames}? British-butler tone. No markdown.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      if (text) {
        setAdvice(text);
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
      }
    } catch {
      setAdvice("Reasoning core unreachable. Please try again.");
    } finally {
      setAdvising(false);
    }
  }, [advising, selectedInv, matched]);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Investigation-Scenario Recommender"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 65,
          height: 26, padding: "0 8px",
          background: visible ? `${GOLD}22` : "rgba(8,14,22,0.82)",
          border: `1px solid ${visible ? GOLD : "#2A3A4A"}`,
          borderRadius: 5,
          color: visible ? GOLD : "#6E8AA0",
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 1,
          cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        {totalMatched > 0 && !visible && (
          <span style={{
            display: "inline-block", marginRight: 5,
            background: GOLD, color: "#000", borderRadius: "50%",
            width: 14, height: 14, fontSize: 8, lineHeight: "14px", textAlign: "center",
            fontWeight: 700,
          }}>
            {totalMatched > 99 ? "99+" : totalMatched}
          </span>
        )}
        ◈ INVSC
      </button>

      {/* Panel */}
      {visible && (
        <div style={{
          position: "fixed",
          bottom: 44,
          left: Math.min(BTN_LEFT, typeof window !== "undefined" ? window.innerWidth - 620 : BTN_LEFT),
          zIndex: 65,
          width: 600,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          background: "rgba(4,10,18,0.97)",
          border: `1px solid ${GOLD}44`,
          borderTop: `2px solid ${GOLD}`,
          borderRadius: 12,
          boxShadow: `0 0 40px ${GOLD}14, 0 8px 32px rgba(0,0,0,0.75)`,
          fontFamily: "'JetBrains Mono', monospace",
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px", borderBottom: `1px solid ${GOLD}22`, flexShrink: 0,
          }}>
            <span style={{ color: GOLD, fontSize: 13 }}>◈</span>
            <span style={{ color: GOLD, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              INVESTIGATION → SCENARIO RECOMMENDER
            </span>
            {loading && <span style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>loading…</span>}
            <div style={{ flex: 1 }} />
            <button
              onClick={load}
              title="Refresh"
              style={{ background: "transparent", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 13 }}
            >↻</button>
            <button
              onClick={() => setVisible(false)}
              style={{ background: "transparent", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 16, lineHeight: 1 }}
            >×</button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "flex", gap: 8, padding: "10px 14px",
            borderBottom: `1px solid ${GOLD}18`, flexShrink: 0,
          }}>
            {[
              { label: "OPEN CASES",  val: invs.length,       col: CY   },
              { label: "SCENARIOS",   val: scenarios.length,  col: GOLD  },
              { label: "MATCHED",     val: totalMatched,      col: GREEN },
              { label: "SELECTED",    val: matched.length,    col: GOLD  },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                flex: 1, padding: "6px 8px", textAlign: "center",
                background: `${col}0C`, border: `1px solid ${col}33`, borderRadius: 6,
              }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: col }}>{val}</div>
                <div style={{ fontSize: 8, color: "#6E8AA0", letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Split body: investigations left, scenarios right */}
          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

            {/* Left — investigations list */}
            <div style={{
              width: 220, flexShrink: 0, overflowY: "auto",
              borderRight: `1px solid ${GOLD}18`, padding: 8,
            }}>
              <div style={{ fontSize: 8, color: "#6E8AA0", letterSpacing: 2, marginBottom: 6, paddingLeft: 4 }}>
                OPEN CASES
              </div>
              {invs.length === 0 && !loading && (
                <div style={{ fontSize: 10, color: "#4E6A7A", padding: 8 }}>No open cases.</div>
              )}
              {invs.map((inv) => {
                const id    = inv.id || inv._id || JSON.stringify(inv).slice(0, 16);
                const title = inv.title || inv.name || inv.description || id;
                const mCount = matchScenarios(inv, scenarios).length;
                const isSel  = selectedInv === inv;
                return (
                  <div
                    key={id}
                    onClick={() => { setSelectedInv(inv); setAdvice(""); }}
                    style={{
                      padding: "7px 8px", marginBottom: 4, borderRadius: 6, cursor: "pointer",
                      background: isSel ? `${GOLD}1A` : "transparent",
                      border: `1px solid ${isSel ? GOLD : "transparent"}`,
                      transition: "background 0.15s",
                    }}
                  >
                    <div style={{
                      fontSize: 10, color: isSel ? GOLD : "#C8DDF0",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>{title}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3 }}>
                      <span style={{
                        fontSize: 8, color: "#6E8AA0", letterSpacing: 1,
                        textTransform: "uppercase",
                      }}>{inv.status || "open"}</span>
                      {mCount > 0 && (
                        <span style={{
                          fontSize: 7, background: GREEN, color: "#000",
                          borderRadius: 3, padding: "1px 4px", letterSpacing: 1,
                        }}>{mCount} match{mCount !== 1 ? "es" : ""}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right — matched scenarios */}
            <div style={{ flex: 1, overflowY: "auto", padding: 8, display: "flex", flexDirection: "column" }}>
              {!selectedInv ? (
                <div style={{ padding: 16, color: "#4E6A7A", fontSize: 10, letterSpacing: 1, textAlign: "center" }}>
                  Select a case to see scenario recommendations.
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 8, color: "#6E8AA0", letterSpacing: 2, marginBottom: 6, paddingLeft: 4 }}>
                    SCENARIOS FOR: {(selectedInv.title || selectedInv.name || selectedInv.id || "").toUpperCase().slice(0, 42)}
                  </div>

                  {/* Advise button */}
                  <button
                    onClick={advise}
                    disabled={advising}
                    style={{
                      width: "100%", padding: "6px 0", borderRadius: 5, marginBottom: 8,
                      border: `1px solid ${GOLD}55`,
                      background: advising ? "transparent" : `${GOLD}0F`,
                      color: advising ? "#4E6A7A" : GOLD,
                      fontSize: 9, letterSpacing: 1,
                      cursor: advising ? "default" : "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {advising ? "▷ ADVISING…" : "▶ JARVIS ADVISE"}
                  </button>

                  {advice && (
                    <div style={{
                      marginBottom: 8, padding: "8px 10px",
                      background: `${GOLD}08`, border: `1px solid ${GOLD}22`, borderRadius: 6,
                      fontSize: 9, color: "#C8DDF0", lineHeight: 1.7,
                    }}>
                      {advice}
                    </div>
                  )}

                  {matched.length === 0 ? (
                    <div style={{ padding: 12, color: "#4E6A7A", fontSize: 10, letterSpacing: 1, textAlign: "center" }}>
                      No keyword-matched scenarios found.
                    </div>
                  ) : (
                    matched.map((scen) => {
                      const sid    = scen.id || scen.name;
                      const stitle = scen.name || scen.title || scen.description || sid;
                      const sdesc  = scen.description || scen.summary || "";
                      const isRun  = running[sid];
                      const outcome = outcomes[sid];
                      return (
                        <div key={sid} style={{
                          marginBottom: 6, padding: "8px 10px", borderRadius: 7,
                          background: "rgba(232,168,0,0.05)",
                          border: `1px solid ${GOLD}22`,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{
                                fontSize: 10, color: GOLD, fontWeight: 700,
                                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                              }}>{stitle}</div>
                              {sdesc && (
                                <div style={{
                                  fontSize: 8, color: "#6E8AA0", marginTop: 2, lineHeight: 1.5,
                                  display: "-webkit-box", WebkitLineClamp: 2,
                                  WebkitBoxOrient: "vertical", overflow: "hidden",
                                }}>
                                  {sdesc}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => runScenario(scen)}
                              disabled={isRun}
                              style={{
                                flexShrink: 0, padding: "4px 10px", borderRadius: 4,
                                border: `1px solid ${isRun ? "#2A3A4A" : GREEN}`,
                                background: isRun ? "transparent" : `${GREEN}12`,
                                color: isRun ? "#4E6A7A" : GREEN,
                                fontSize: 8, letterSpacing: 1,
                                cursor: isRun ? "default" : "pointer",
                                fontFamily: "inherit",
                              }}
                            >
                              {isRun ? "▷ RUNNING" : "▶ RUN"}
                            </button>
                          </div>
                          {outcome && (
                            <div style={{
                              marginTop: 6, padding: "5px 8px",
                              background: "rgba(74,222,128,0.07)", border: `1px solid ${GREEN}33`, borderRadius: 4,
                              fontSize: 8, color: GREEN, lineHeight: 1.6,
                            }}>
                              ✓ {outcome}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </>
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={{
            padding: "7px 14px", borderTop: `1px solid ${GOLD}18`,
            fontSize: 8, color: "#4E6A7A", letterSpacing: 1, flexShrink: 0,
          }}>
            /v1/investigations · /v1/scenario/list · /v1/scenario/{"{id}"}/run · /v1/jarvis/agent/chat · auto-refresh 60 s
          </div>
        </div>
      )}
    </>
  );
}

// ─── data helpers ─────────────────────────────────────────────────────────────

async function fetchBoth() {
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  return Promise.all([
    fetch(`${base}/v1/investigations`, { headers }).then((r) => r.json()),
    fetch(`${base}/v1/scenario/list`,  { headers }).then((r) => r.json()),
  ]);
}

function matchScenarios(inv, scenarios) {
  const hay = [
    inv.title       || "",
    inv.name        || "",
    inv.description || "",
    inv.type        || "",
    inv.tags?.join?.(" ") || "",
  ].join(" ").toLowerCase();

  const words = hay.split(/\W+/).filter((w) => w.length > 3);

  return scenarios.filter((scen) => {
    const sHay = [
      scen.name        || "",
      scen.title       || "",
      scen.description || "",
      scen.tags?.join?.(" ") || "",
    ].join(" ").toLowerCase();
    return words.some((w) => sHay.includes(w));
  });
}

function correlate(invs, scenarios) {
  return invs.reduce((n, inv) => n + matchScenarios(inv, scenarios).length, 0);
}

function normalizeArray(d) {
  if (Array.isArray(d))          return d;
  if (Array.isArray(d?.data))    return d.data;
  if (Array.isArray(d?.items))   return d.items;
  if (Array.isArray(d?.results)) return d.results;
  return [];
}
