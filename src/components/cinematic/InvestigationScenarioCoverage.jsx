/**
 * InvestigationScenarioCoverage — F83.
 *
 * Parallel-fetches /v1/investigations + /v1/scenario/list, then
 * keyword-correlates each open investigation against the scenario catalog
 * to surface SCRIPTED investigations (at least one scenario provides
 * response planning) vs UNPLANNED (no scenario alignment — response gap).
 *
 * Stat tiles: investigations / scenarios / scripted / unplanned
 * Filter tabs: ALL / SCRIPTED / UNPLANNED
 * Expand investigation → matched scenarios with status/category badge + relevance score.
 * Click ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence investigation-scenario brief
 *   + jarvis:speak-dossier TTS.
 * 90 s auto-refresh.
 *
 * Intent: "invest scenario" / "scenario invest" / "invscn" /
 *         "scripted investigation" / "unplanned investigation" /
 *         "investigation scenario coverage" / "case scenario" /
 *         "investigation response plan"
 *   → jarvis:invscn-toggle + TTS brief via buildInvscnScript()
 *
 * Toggle: ◈ INVSCN at left:691920, bottom:8, zIndex:264.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const PURPLE = "#A78BFA";
const RED    = "#FF4D4D";
const BTN_LEFT   = 691920;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise helpers ────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseInvestigations(raw) {
  return normaliseArray(raw).map((inv) => ({
    id:          inv.id || inv.investigation_id || String(Math.random()),
    title:       inv.title || inv.name || inv.subject || "Unnamed Investigation",
    description: inv.description || inv.summary || inv.notes || inv.body || "",
    kind:        inv.kind || inv.type || inv.category || "",
    status:      inv.status || inv.state || "",
    tags:        [...(inv.tags || []), ...(inv.labels || [])].map(String),
  }));
}

function normaliseScenarios(raw) {
  return normaliseArray(raw).map((s) => ({
    id:          s.id || s.scenario_id || String(Math.random()),
    name:        s.name || s.title || "Unnamed Scenario",
    description: s.description || s.summary || s.body || "",
    type:        s.type || s.scenario_type || "",
    category:    s.category || s.domain || "",
    status:      s.status || s.state || "",
    tags:        [...(s.tags || []), ...(s.labels || [])].map(String),
  }));
}

function tokens(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function matchScore(investigation, scenario) {
  const scenText = [
    scenario.name,
    scenario.description,
    scenario.type,
    scenario.category,
    scenario.tags.join(" "),
  ].join(" ").toLowerCase();

  const words = [
    ...tokens(investigation.title),
    ...tokens(investigation.description),
    ...tokens(investigation.kind),
    ...investigation.tags.flatMap(tokens),
  ];
  return words.reduce((acc, w) => acc + (scenText.includes(w) ? 1 : 0), 0);
}

function correlate(investigations, scenarios) {
  return investigations.map((inv) => {
    const matched = scenarios
      .map((s) => ({ ...s, _score: matchScore(inv, s) }))
      .filter((s) => s._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    return { ...inv, matched };
  });
}

// ─── exported voice-trigger helpers ──────────────────────────────────────────

export function isInvscnQuery(q) {
  const s = q.toLowerCase();
  return (
    s.includes("invscn") ||
    s.includes("invest scenario") ||
    s.includes("scenario invest") ||
    s.includes("scripted investigation") ||
    s.includes("unplanned investigation") ||
    s.includes("investigation scenario") ||
    s.includes("case scenario") ||
    s.includes("investigation response plan") ||
    s.includes("scenario coverage invest")
  );
}

export async function buildInvscnScript() {
  const base = apiBase();
  const hdr  = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
  try {
    const [invRaw, scnRaw] = await Promise.all([
      fetch(`${base}/v1/investigations`, { headers: hdr }).then((r) => r.json()),
      fetch(`${base}/v1/scenario/list`,  { headers: hdr }).then((r) => r.json()),
    ]);
    const investigations = normaliseInvestigations(invRaw);
    const scenarios      = normaliseScenarios(scnRaw);
    const correlated     = correlate(investigations, scenarios);
    const scripted   = correlated.filter((i) => i.matched.length > 0);
    const unplanned  = correlated.filter((i) => i.matched.length === 0);
    return (
      `Investigation × Scenario Coverage: ${investigations.length} open investigations, ` +
      `${scenarios.length} scenarios available. ` +
      `${scripted.length} investigations have scenario response planning; ` +
      `${unplanned.length} are UNPLANNED with no matching scenario — these represent active response gaps, sir.`
    );
  } catch {
    return "Investigation scenario coverage data unavailable at this time, sir.";
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function InvestigationScenarioCoverage() {
  const [visible,      setVisible]      = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [investigations, setInvestigations] = useState([]);
  const [scenarios,    setScenarios]    = useState([]);
  const [tab,          setTab]          = useState("ALL");
  const [search,       setSearch]       = useState("");
  const [expanded,     setExpanded]     = useState(null);
  const [assessing,    setAssessing]    = useState(null);
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const base = apiBase();
    const hdr  = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
    try {
      const [invRaw, scnRaw] = await Promise.all([
        fetch(`${base}/v1/investigations`, { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/v1/scenario/list`,  { headers: hdr }).then((r) => r.json()),
      ]);
      setInvestigations(normaliseInvestigations(invRaw));
      setScenarios(normaliseScenarios(scnRaw));
    } catch (_) {
      /* network errors are silent — stale data stays */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    fetchData();
    timerRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [visible, fetchData]);

  // listen for voice-trigger toggle
  useEffect(() => {
    const handler = () => setVisible((v) => !v);
    window.addEventListener("jarvis:invscn-toggle", handler);
    return () => window.removeEventListener("jarvis:invscn-toggle", handler);
  }, []);

  async function assessInvestigation(inv) {
    setAssessing(inv.id);
    const scenNames = inv.matched.map((s) => `"${s.name}"`).join(", ");
    const prompt =
      `As JARVIS, provide a 2-sentence investigation-scenario readiness assessment for the investigation ` +
      `titled "${inv.title}" (type: ${inv.kind || "unknown"}). ` +
      `Matched scenarios: ${scenNames || "none"}. ` +
      `Assess whether the current scenario planning provides adequate response coverage for this investigation.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body:    JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Insufficient scenario data to assess this investigation, sir.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: "Assessment unavailable at this time, sir." },
      }));
    }
    setAssessing(null);
  }

  const correlated = correlate(investigations, scenarios);
  const scripted   = correlated.filter((i) => i.matched.length > 0);
  const unplanned  = correlated.filter((i) => i.matched.length === 0);

  const base =
    tab === "SCRIPTED"  ? scripted  :
    tab === "UNPLANNED" ? unplanned : correlated;

  const displayed = search
    ? base.filter((i) =>
        `${i.title} ${i.kind} ${i.status}`.toLowerCase().includes(search.toLowerCase())
      )
    : base;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Investigation × Scenario Coverage (F83)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 264,
          background: visible ? `${CY}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? CY : `${CY}44`}`,
          color: visible ? CY : `${CY}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ INVSCN
        {unplanned.length > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#000",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{unplanned.length}</span>
        )}
      </button>

      {visible && (
        <div style={{
          position: "fixed", bottom: 32, left: Math.max(8, BTN_LEFT - 280), zIndex: 264,
          width: 580, maxHeight: "70vh", overflowY: "auto",
          background: "rgba(6,11,18,0.93)",
          border: `1px solid ${CY}44`,
          borderRadius: 10, padding: "14px 16px",
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${CY}18`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>
              ◈ INVESTIGATION × SCENARIO COVERAGE
            </span>
            <button onClick={fetchData} style={{
              marginLeft: "auto", background: "transparent",
              border: `1px solid ${CY}33`, borderRadius: 3,
              color: `${CY}88`, padding: "2px 6px", fontSize: 7,
              cursor: "pointer", letterSpacing: 1,
            }}>↻ REFRESH</button>
            <button onClick={() => setVisible(false)} style={{
              background: "transparent", border: "none",
              color: "#445566", cursor: "pointer", fontSize: 14, lineHeight: 1,
            }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              ["INVESTIGATIONS", investigations.length, CY],
              ["SCENARIOS",      scenarios.length,      PURPLE],
              ["SCRIPTED",       scripted.length,        GREEN],
              ["UNPLANNED",      unplanned.length,       unplanned.length > 0 ? AMBER : "#445566"],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 5, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: "bold" }}>
                  {loading ? "…" : val}
                </div>
                <div style={{ color: "#445566", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {["ALL", "SCRIPTED", "UNPLANNED"].map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${CY}22` : "transparent",
                border: `1px solid ${tab === t ? CY : "#1e3040"}`,
                color: tab === t ? CY : "#445566",
                borderRadius: 4, padding: "3px 10px",
                fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Search */}
          <input
            type="text"
            placeholder="search investigations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%", boxSizing: "border-box",
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${CY}22`, borderRadius: 4,
              color: "#DCEBF5", padding: "5px 8px",
              fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
              outline: "none", marginBottom: 10,
            }}
          />

          {/* Investigation rows */}
          {loading && displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              correlating investigations against scenario catalog…
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              {tab === "UNPLANNED"
                ? "All investigations have matching scenarios."
                : "No investigations in this filter."}
            </div>
          ) : (
            displayed.map((inv) => {
              const isOpen    = expanded === inv.id;
              const hasScenarios = inv.matched.length > 0;
              return (
                <div key={inv.id} style={{
                  background: "rgba(255,255,255,0.02)",
                  border: `1px solid ${isOpen ? `${CY}44` : "#1a2530"}`,
                  borderLeft: `3px solid ${hasScenarios ? GREEN : AMBER}`,
                  borderRadius: 6, padding: "8px 10px", marginBottom: 6,
                  cursor: "pointer",
                }} onClick={() => setExpanded(isOpen ? null : inv.id)}>
                  {/* Investigation header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{
                      width: 26, height: 26, borderRadius: "50%",
                      background: hasScenarios ? `${GREEN}22` : `${AMBER}22`,
                      border: `1px solid ${hasScenarios ? GREEN : AMBER}44`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 9, color: hasScenarios ? GREEN : AMBER,
                      fontWeight: "bold", flexShrink: 0,
                    }}>
                      {inv.title.charAt(0).toUpperCase()}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: "#DCEBF5", fontSize: 10, fontWeight: "bold" }}>
                        {inv.title}
                      </div>
                      {(inv.kind || inv.status) && (
                        <div style={{ color: "#556677", fontSize: 8, marginTop: 1 }}>
                          {[inv.kind, inv.status].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                    <span style={{
                      fontSize: 7, whiteSpace: "nowrap",
                      color: hasScenarios ? GREEN : AMBER,
                      border: `1px solid ${hasScenarios ? GREEN : AMBER}44`,
                      borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                    }}>
                      {hasScenarios
                        ? `${inv.matched.length} scenario${inv.matched.length !== 1 ? "s" : ""}`
                        : "UNPLANNED"}
                    </span>
                  </div>

                  {/* Assess button */}
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); assessInvestigation(inv); }}
                      disabled={assessing === inv.id}
                      style={{
                        background: assessing === inv.id ? "#1a2530" : `${CY}18`,
                        color: assessing === inv.id ? "#445566" : CY,
                        border: `1px solid ${CY}44`,
                        borderRadius: 3, padding: "2px 8px",
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                        letterSpacing: 1, cursor: assessing === inv.id ? "default" : "pointer",
                      }}
                    >{assessing === inv.id ? "…assessing" : "▶ ASSESS"}</button>
                  </div>

                  {/* Expanded scenario list */}
                  {isOpen && hasScenarios && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${CY}18` }}>
                      {inv.matched.map((s) => (
                        <div key={s.id} style={{
                          background: "rgba(255,255,255,0.02)",
                          border: "1px solid #1e3040",
                          borderRadius: 4, padding: "6px 8px", marginBottom: 4,
                          display: "flex", alignItems: "flex-start", gap: 8,
                        }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3, flexShrink: 0 }}>
                            {s.type && (
                              <span style={{
                                fontSize: 7, color: PURPLE, border: "1px solid #A78BFA44",
                                borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                                whiteSpace: "nowrap", textTransform: "uppercase",
                              }}>{s.type}</span>
                            )}
                            {s.status && (
                              <span style={{
                                fontSize: 7, color: GREEN, border: "1px solid #00c87844",
                                borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                                whiteSpace: "nowrap", textTransform: "uppercase",
                              }}>{s.status}</span>
                            )}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ color: "#a0b8cc", fontSize: 10 }}>{s.name}</div>
                            {s.category && (
                              <div style={{ color: "#334455", fontSize: 7, marginTop: 2 }}>
                                {s.category}
                              </div>
                            )}
                          </div>
                          {/* Relevance score bar */}
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                            <div style={{ fontSize: 7, color: `${CY}66`, whiteSpace: "nowrap" }}>
                              score {s._score}
                            </div>
                            <div style={{ width: 48, height: 3, background: "#1a2530", borderRadius: 2 }}>
                              <div style={{
                                width: `${Math.min(100, s._score * 20)}%`,
                                height: "100%", background: CY, borderRadius: 2,
                              }} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {isOpen && !hasScenarios && (
                    <div style={{
                      marginTop: 8, paddingTop: 8, borderTop: "1px solid #1a2530",
                      color: AMBER, fontSize: 8,
                    }}>
                      ⚠ No scenarios cover this investigation. Consider defining a response plan or scenario.
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div style={{ marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right" }}>
            /v1/investigations + /v1/scenario/list · 90 s auto-refresh · ▶ ASSESS for scenario readiness brief
          </div>
        </div>
      )}
    </>
  );
}
