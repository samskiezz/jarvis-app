/**
 * DecisionScenarioCoverage — F122.
 *
 * Parallel-fetches /v1/decision/list + /v1/scenario/list and
 * keyword-correlates each strategic decision (title / reason / risks /
 * alternatives / expected_outcome) against every scenario (name /
 * objective / type / description) to surface decisions that are
 * OPERATIONALIZED (backed by at least one scenario) vs THEORETICAL
 * (no scenario coverage — execution gap).
 *
 * Stat tiles: decisions / scenarios / operationalized / theoretical.
 * Filter tabs: ALL / OPERATIONALIZED / THEORETICAL + text search.
 * Expand decision → matched scenarios with type badge + status badge + score.
 * Amber badge on theoretical count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence strategy-to-execution brief + TTS.
 *
 * Toggle: ◈ DECSCEN at left:36280, bottom:8, zIndex:76.
 * Event:  jarvis:decscen-toggle
 * Voice:  "decision scenario" / "operationalized decisions" / "strategic scenarios"
 *         / "execution gap" / "decscen"
 * Refresh: 90s auto-refresh while open.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const GREEN  = "#00c878";
const AMBER  = "#F5A623";
const RED    = "#FF3D5A";
const VIOLET = "#A78BFA";
const BTN_LEFT = 36280;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isDecScenQuery(q) {
  return /decis.{0,20}scenario|scenario.{0,20}decis|operationali[sz]ed\s+decision|execution\s+gap|strategic\s+scenario|decscen\b|decision\s+coverage|scenario.{0,15}backed/i.test(
    q || ""
  );
}

export async function buildDecScenScript() {
  try {
    const [dr, sr] = await Promise.all([
      fetch(`${apiBase()}/v1/decision/list`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
      fetch(`${apiBase()}/v1/scenario/list`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    const decisions  = normaliseDecisions(dr.ok ? await dr.json() : []);
    const scenarios  = normaliseScenarios(sr.ok ? await sr.json() : []);
    const { operationalized } = buildCoverage(decisions, scenarios);
    const theoretical = decisions.length - operationalized.size;
    window.dispatchEvent(new CustomEvent("jarvis:decscen-toggle"));
    if (!decisions.length)
      return "No strategic decisions on record, sir. The decision ledger is empty.";
    return (
      `Decision–scenario coverage map active, sir. ` +
      `${decisions.length} decision${decisions.length !== 1 ? "s" : ""} cross-referenced ` +
      `against ${scenarios.length} scenario${scenarios.length !== 1 ? "s" : ""}. ` +
      `${operationalized.size} decision${operationalized.size !== 1 ? "s are" : " is"} ` +
      `operationalized in at least one scenario. ` +
      `${theoretical} decision${theoretical !== 1 ? "s remain" : " remains"} theoretical — ` +
      `no operational scenario backing found.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:decscen-toggle"));
    return "Decision–scenario coverage panel open, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function DecisionScenarioCoverage() {
  const [visible,          setVisible]          = useState(false);
  const [decisions,        setDecisions]        = useState([]);
  const [scenarios,        setScenarios]        = useState([]);
  const [coverage,         setCoverage]         = useState({ operationalized: new Set(), pairs: [] });
  const [loading,          setLoading]          = useState(false);
  const [search,           setSearch]           = useState("");
  const [filter,           setFilter]           = useState("all");
  const [selected,         setSelected]         = useState(null);
  const [aiMap,            setAiMap]            = useState({});
  const [aiLoading,        setAiLoading]        = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [dr, sr] = await Promise.all([
        fetch(`${apiBase()}/v1/decision/list`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
        fetch(`${apiBase()}/v1/scenario/list`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
      ]);
      const rawDec  = normaliseDecisions(dr.ok ? await dr.json() : []);
      const rawScen = normaliseScenarios(sr.ok ? await sr.json() : []);
      setDecisions(rawDec);
      setScenarios(rawScen);
      setCoverage(buildCoverage(rawDec, rawScen));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:decscen-toggle", onToggle);
    return () => window.removeEventListener("jarvis:decscen-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, 90_000);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function getAiAssessment(dec, matchedScenarios) {
    const did = decId(dec);
    if (aiMap[did] || aiLoading === did) return;
    setAiLoading(did);
    const title    = dec.title || did;
    const scNames  = matchedScenarios.map((s) => s.name || s.title || s.id || "Scenario").join(", ");
    const hasCover = matchedScenarios.length > 0;
    const prompt = hasCover
      ? `As JARVIS, provide a 2-sentence strategy-to-execution assessment for decision "${title}". ` +
        `This decision is operationalized in ${matchedScenarios.length} scenario${matchedScenarios.length !== 1 ? "s" : ""}: ${scNames}. ` +
        `Evaluate whether the scenario coverage is sufficient and flag any execution risks.`
      : `As JARVIS, provide a 2-sentence strategy-to-execution assessment for decision "${title}"${dec.reason ? ` (rationale: "${String(dec.reason).slice(0, 100)}")` : ""}. ` +
        `This decision has NO scenario backing — it is theoretical with no operational plan. ` +
        `Recommend an appropriate scenario or next action to operationalize it.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAiMap((prev) => ({ ...prev, [did]: answer }));
      if (answer)
        window.dispatchEvent(
          new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } })
        );
    } catch (_) {
      setAiMap((prev) => ({ ...prev, [did]: "Unable to reach reasoning core." }));
    } finally {
      setAiLoading(null);
    }
  }

  const theoreticalCount = decisions.length - coverage.operationalized.size;

  const filtered = decisions.filter((dec) => {
    const did = decId(dec);
    if (filter === "operationalized" && !coverage.operationalized.has(did)) return false;
    if (filter === "theoretical"     &&  coverage.operationalized.has(did)) return false;
    if (search) {
      const s = search.toLowerCase();
      const text = [dec.title, dec.reason, dec.expected, ...(dec.risks || []), ...(dec.alternatives || [])]
        .filter(Boolean).join(" ").toLowerCase();
      if (!text.includes(s)) return false;
    }
    return true;
  });

  const selectedMatches = selected
    ? coverage.pairs
        .filter((p) => p.decId === decId(selected))
        .map((p) => p.scenario)
    : [];

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Decision × Scenario Coverage"
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 76,
          height: 26,
          padding: "0 8px",
          background: visible ? `${AMBER}22` : "rgba(8,14,22,0.82)",
          border: `1px solid ${visible ? AMBER : "#2A3A4A"}`,
          borderRadius: 5,
          color: visible ? AMBER : "#6E8AA0",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          letterSpacing: 1,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {theoreticalCount > 0 && !visible && (
          <span
            style={{
              display: "inline-block",
              marginRight: 5,
              background: AMBER,
              color: "#000",
              borderRadius: "50%",
              width: 14,
              height: 14,
              fontSize: 9,
              lineHeight: "14px",
              textAlign: "center",
              fontWeight: 700,
            }}
          >
            {theoreticalCount > 9 ? "9+" : theoreticalCount}
          </span>
        )}
        ◈ DECSCEN
      </button>

      {/* Panel */}
      {visible && (
        <div
          style={{
            position: "fixed",
            bottom: 44,
            left: Math.min(BTN_LEFT, window.innerWidth - 660),
            zIndex: 76,
            width: 640,
            maxHeight: "76vh",
            display: "flex",
            flexDirection: "column",
            background: "rgba(4,10,18,0.96)",
            border: `1px solid ${AMBER}44`,
            borderTop: `2px solid ${AMBER}`,
            borderRadius: 12,
            boxShadow: `0 0 40px ${AMBER}14, 0 8px 32px rgba(0,0,0,0.75)`,
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
              borderBottom: `1px solid ${AMBER}22`,
              flexShrink: 0,
            }}
          >
            <span style={{ color: AMBER, fontSize: 13 }}>◈</span>
            <span style={{ color: AMBER, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              DECISION × SCENARIO COVERAGE
            </span>
            {loading && (
              <span style={{ marginLeft: "auto", color: "#6E8AA0", fontSize: 10 }}>loading…</span>
            )}
            <button
              onClick={() => setVisible(false)}
              style={{
                marginLeft: loading ? 0 : "auto",
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

          {/* Stat tiles */}
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: "8px 14px",
              borderBottom: `1px solid #1A2A3A`,
              flexShrink: 0,
            }}
          >
            {[
              { label: "DECISIONS",       val: decisions.length,              col: CY    },
              { label: "SCENARIOS",        val: scenarios.length,              col: VIOLET },
              { label: "OPERATIONALIZED",  val: coverage.operationalized.size, col: GREEN  },
              { label: "THEORETICAL",      val: theoreticalCount,              col: AMBER  },
            ].map((t) => (
              <div
                key={t.label}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid #1A2A3A",
                  borderRadius: 6,
                  padding: "5px 8px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 14, color: t.col, fontWeight: 700 }}>{t.val}</div>
                <div style={{ fontSize: 8, color: "#4E6A7A", letterSpacing: 1, marginTop: 1 }}>
                  {t.label}
                </div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "7px 14px",
              borderBottom: `1px solid #1A2A3A`,
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            {["all", "operationalized", "theoretical"].map((f) => (
              <button
                key={f}
                onClick={() => { setFilter(f); setSelected(null); }}
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  border: `1px solid ${filter === f ? AMBER : "#2A3A4A"}`,
                  background: filter === f ? `${AMBER}22` : "transparent",
                  color: filter === f ? AMBER : "#6E8AA0",
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
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search decisions…"
              style={{
                marginLeft: "auto",
                padding: "2px 8px",
                borderRadius: 4,
                border: "1px solid #2A3A4A",
                background: "rgba(255,255,255,0.04)",
                color: "#DCEBF5",
                fontSize: 10,
                fontFamily: "inherit",
                width: 140,
                outline: "none",
              }}
            />
          </div>

          {/* Split pane */}
          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
            {/* Decision list */}
            <div
              style={{
                width: 240,
                borderRight: `1px solid #1A2A3A`,
                overflowY: "auto",
                flexShrink: 0,
              }}
            >
              {!loading && filtered.length === 0 && (
                <div style={{ padding: 14, color: "#6E8AA0", fontSize: 10 }}>
                  No decisions in this filter.
                </div>
              )}
              {filtered.map((dec) => {
                const did            = decId(dec);
                const isOp           = coverage.operationalized.has(did);
                const isActive       = selected && decId(selected) === did;
                const matchCount     = coverage.pairs.filter((p) => p.decId === did).length;
                return (
                  <div
                    key={did}
                    onClick={() => setSelected(dec)}
                    style={{
                      padding: "9px 12px",
                      borderBottom: `1px solid #0E1A26`,
                      cursor: "pointer",
                      background: isActive ? `${AMBER}10` : "transparent",
                      borderLeft: isActive ? `3px solid ${AMBER}` : "3px solid transparent",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: isOp ? GREEN : AMBER,
                          flexShrink: 0,
                          boxShadow: !isOp ? `0 0 4px ${AMBER}` : undefined,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 10,
                          color: "#DCEBF5",
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {dec.title || did}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 5, paddingLeft: 12 }}>
                      <span style={{ fontSize: 8, color: isOp ? GREEN : AMBER, letterSpacing: 1 }}>
                        {isOp ? `${matchCount} scenario${matchCount !== 1 ? "s" : ""}` : "theoretical"}
                      </span>
                      {(dec.risks || []).length > 0 && (
                        <span style={{ fontSize: 8, color: RED, letterSpacing: 1 }}>
                          {(dec.risks || []).length} RSK
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Detail pane */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {!selected && (
                <div style={{ padding: 20, color: "#6E8AA0", fontSize: 10, lineHeight: 1.6 }}>
                  Select a decision to see matched scenarios and request an AI assessment.
                </div>
              )}
              {selected && (() => {
                const did = decId(selected);
                return (
                  <div>
                    {/* Decision header + assess button */}
                    <div
                      style={{
                        padding: "10px 14px",
                        borderBottom: `1px solid #1A2A3A`,
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 8,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: "#DCEBF5", marginBottom: 3, fontWeight: 700 }}>
                          {selected.title || did}
                        </div>
                        {selected.reason && (
                          <div style={{ fontSize: 10, color: "#4E8A9A", lineHeight: 1.4, marginBottom: 4 }}>
                            {String(selected.reason).slice(0, 140)}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {(selected.risks || []).slice(0, 3).map((r, i) => (
                            <span
                              key={i}
                              style={{
                                fontSize: 8,
                                color: RED,
                                letterSpacing: 1,
                                padding: "1px 5px",
                                border: `1px solid ${RED}44`,
                                borderRadius: 3,
                              }}
                            >
                              {String(r).toUpperCase().slice(0, 28)}
                            </span>
                          ))}
                          {selected.expected && (
                            <span
                              style={{
                                fontSize: 8,
                                color: CY,
                                letterSpacing: 1,
                                padding: "1px 5px",
                                border: `1px solid ${CY}44`,
                                borderRadius: 3,
                              }}
                            >
                              OUTCOME: {String(selected.expected).slice(0, 28).toUpperCase()}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => getAiAssessment(selected, selectedMatches)}
                        disabled={!!aiMap[did] || aiLoading === did}
                        style={{
                          flexShrink: 0,
                          padding: "3px 10px",
                          borderRadius: 4,
                          border: `1px solid ${aiMap[did] ? GREEN + "66" : VIOLET + "66"}`,
                          background: aiMap[did]
                            ? `${GREEN}12`
                            : aiLoading === did
                            ? `${VIOLET}22`
                            : "transparent",
                          color: aiMap[did] ? GREEN : VIOLET,
                          fontSize: 9,
                          letterSpacing: 1,
                          cursor: aiMap[did] || aiLoading === did ? "default" : "pointer",
                          fontFamily: "inherit",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {aiMap[did] ? "✓ ASSESSED" : aiLoading === did ? "consulting…" : "▶ ASSESS"}
                      </button>
                    </div>

                    {/* AI assessment */}
                    {aiMap[did] && (
                      <div
                        style={{
                          margin: "10px 14px",
                          padding: "8px 12px",
                          background: `${GREEN}0A`,
                          border: `1px solid ${GREEN}22`,
                          borderRadius: 6,
                          fontSize: 10,
                          color: "#A0D8B0",
                          lineHeight: 1.5,
                        }}
                      >
                        <span
                          style={{
                            color: GREEN,
                            fontSize: 8,
                            letterSpacing: 1,
                            fontWeight: 700,
                            display: "block",
                            marginBottom: 3,
                          }}
                        >
                          JARVIS ASSESSMENT
                        </span>
                        {aiMap[did]}
                      </div>
                    )}

                    {/* Matched scenarios or no-coverage message */}
                    {selectedMatches.length === 0 ? (
                      <div
                        style={{
                          padding: "14px",
                          color: AMBER,
                          fontSize: 10,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span style={{ fontSize: 14 }}>⚠</span>
                        No scenarios are operationalizing this decision — theoretical only.
                      </div>
                    ) : (
                      <div>
                        <div
                          style={{
                            padding: "7px 14px",
                            color: GREEN,
                            fontSize: 10,
                            letterSpacing: 1,
                            fontWeight: 700,
                            borderBottom: `1px solid #1A2A3A`,
                          }}
                        >
                          {selectedMatches.length} MATCHING SCENARIO{selectedMatches.length !== 1 ? "S" : ""}
                        </div>
                        {selectedMatches.map((scen, i) => {
                          const sid      = scen.id || scen.scenario_id || scen._id || scen.name;
                          const sType    = (scen.type || scen.category || "").toUpperCase();
                          const sStatus  = (scen.status || "").toUpperCase();
                          const statusCol =
                            sStatus === "RUNNING" || sStatus === "ACTIVE"    ? GREEN
                            : sStatus === "PENDING" || sStatus === "QUEUED"  ? CY
                            : sStatus === "FAILED"                           ? RED
                            : sStatus === "COMPLETED"                        ? VIOLET
                            : "#6E8AA0";
                          const score = coverage.pairs.find(
                            (p) => p.decId === decId(selected) && (p.scenario.id || p.scenario._id || p.scenario.name) === sid
                          )?.matchScore || 0;
                          return (
                            <div
                              key={`${sid}-${i}`}
                              style={{
                                padding: "9px 14px",
                                borderBottom: `1px solid #0E1A26`,
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                                <span style={{ color: GREEN, fontSize: 11, flexShrink: 0 }}>▶</span>
                                <span
                                  style={{
                                    fontSize: 11,
                                    color: "#DCEBF5",
                                    flex: 1,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {scen.name || scen.title || scen.scenario_name || sid}
                                </span>
                                {sType && (
                                  <span
                                    style={{
                                      fontSize: 8,
                                      color: VIOLET,
                                      letterSpacing: 1,
                                      padding: "1px 5px",
                                      border: `1px solid ${VIOLET}44`,
                                      borderRadius: 3,
                                      flexShrink: 0,
                                    }}
                                  >
                                    {sType}
                                  </span>
                                )}
                                {sStatus && (
                                  <span
                                    style={{
                                      fontSize: 8,
                                      color: statusCol,
                                      letterSpacing: 1,
                                      padding: "1px 5px",
                                      border: `1px solid ${statusCol}44`,
                                      borderRadius: 3,
                                      flexShrink: 0,
                                    }}
                                  >
                                    {sStatus}
                                  </span>
                                )}
                              </div>
                              {scen.description && (
                                <div style={{ paddingLeft: 19, fontSize: 10, color: "#4E8A9A", lineHeight: 1.4, marginBottom: 4 }}>
                                  {String(scen.description).slice(0, 110)}
                                </div>
                              )}
                              <div style={{ paddingLeft: 19, display: "flex", alignItems: "center", gap: 6 }}>
                                <div
                                  style={{
                                    flex: 1,
                                    height: 3,
                                    background: "#1A2A3A",
                                    borderRadius: 2,
                                    overflow: "hidden",
                                    maxWidth: 120,
                                  }}
                                >
                                  <div
                                    style={{
                                      height: "100%",
                                      width: `${Math.min(100, score * 20)}%`,
                                      background: GREEN,
                                      borderRadius: 2,
                                    }}
                                  />
                                </div>
                                <span style={{ fontSize: 9, color: "#4E6A7A" }}>
                                  score {score}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "5px 14px",
              borderTop: `1px solid ${AMBER}18`,
              fontSize: 10,
              color: "#4E6A7A",
              letterSpacing: 1,
              flexShrink: 0,
            }}
          >
            /v1/decision/list + /v1/scenario/list · 90s auto-refresh · click ▶ ASSESS for AI analysis
          </div>
        </div>
      )}
    </>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function decId(d) {
  return d.id || d._id || d.decision_id || d.title || "decision";
}

function normaliseDecisions(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.decisions) ? raw.decisions
    : Array.isArray(raw?.items)     ? raw.items
    : Array.isArray(raw?.data)      ? raw.data
    : Array.isArray(raw?.results)   ? raw.results
    : [];
  return arr.map((d, i) => ({
    id:           d.id || d._id || d.decision_id || `dec-${i}`,
    title:        d.title || d.name || `Decision ${i + 1}`,
    reason:       d.reason || d.rationale || "",
    risks:        Array.isArray(d.risks)        ? d.risks        : [],
    alternatives: Array.isArray(d.alternatives) ? d.alternatives : [],
    expected:     d.expected_outcome || d.outcome || "",
    _raw: d,
  }));
}

function normaliseScenarios(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.scenarios) ? raw.scenarios
    : Array.isArray(raw?.items)     ? raw.items
    : Array.isArray(raw?.data)      ? raw.data
    : Array.isArray(raw?.results)   ? raw.results
    : [];
  return arr.map((s, i) => ({
    id:          s.id || s.scenario_id || s._id || `scen-${i}`,
    name:        s.name || s.title || s.scenario_name || `Scenario ${i + 1}`,
    type:        s.type || s.category || "",
    status:      s.status || "",
    description: s.description || s.objective || "",
    _raw: s,
  }));
}

function keywords(str) {
  if (!str) return [];
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function buildCoverage(decisions, scenarios) {
  const operationalized = new Set();
  const pairs           = [];

  for (const dec of decisions) {
    const did   = decId(dec);
    const dText = [
      dec.title,
      dec.reason,
      dec.expected,
      ...(dec.risks || []),
      ...(dec.alternatives || []),
    ].filter(Boolean).join(" ");
    const dKws = keywords(dText);
    if (!dKws.length) continue;

    for (const scen of scenarios) {
      const sText = [
        scen.name,
        scen.description,
        scen.type,
      ].filter(Boolean).join(" ");
      const sKws  = keywords(sText);
      const score = dKws.filter((w) => sKws.includes(w)).length;
      if (score >= 1) {
        operationalized.add(did);
        pairs.push({ decId: did, scenario: scen, matchScore: score });
      }
    }
  }

  pairs.sort((a, b) => b.matchScore - a.matchScore);
  return { operationalized, pairs };
}
