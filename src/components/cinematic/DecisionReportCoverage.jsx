/**
 * DecisionReportCoverage — F145.
 *
 * Parallel-fetches /v1/decision/list + /v1/reports and
 * keyword-correlates each strategic decision (title / reason / risks /
 * alternatives / expected_outcome) against every report (title / summary /
 * type) to surface decisions that are BACKED (at least one report provides
 * supporting evidence) vs UNSUPPORTED (no documentary evidence found —
 * strategic intelligence gap).
 *
 * Stat tiles: decisions / reports / backed / unsupported.
 * Filter tabs: ALL / BACKED / UNSUPPORTED + text search.
 * Expand decision → matched reports with type badge + date badge + score.
 * Amber badge on unsupported count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence strategic-evidence brief + TTS.
 *
 * Toggle: ◈ DECRPT at left:47480, bottom:8, zIndex:96.
 * Event:  jarvis:decrpt-toggle
 * Voice:  "decision report" / "strategic evidence" / "decisions backed"
 *         / "report backed decisions" / "decrpt"
 * Refresh: 120s auto-refresh while open.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const GREEN  = "#00c878";
const AMBER  = "#F5A623";
const RED    = "#FF3D5A";
const VIOLET = "#A78BFA";
const BTN_LEFT = 47480;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isDecrptQuery(q) {
  return /decis.{0,20}report|report.{0,20}decis|strategic\s+evidence|decisions?\s+backed|report.{0,10}backed.{0,10}decis|evidence.{0,15}decision|decrpt\b/i.test(
    q || ""
  );
}

export async function buildDecrptScript() {
  try {
    const [dr, rr] = await Promise.all([
      fetch(`${apiBase()}/v1/decision/list`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
      fetch(`${apiBase()}/v1/reports`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    const decisions = normaliseDecisions(dr.ok ? await dr.json() : []);
    const reports   = normaliseReports(rr.ok ? await rr.json() : []);
    const { backed } = buildCoverage(decisions, reports);
    const unsupported = decisions.length - backed.size;
    window.dispatchEvent(new CustomEvent("jarvis:decrpt-toggle"));
    if (!decisions.length)
      return "No strategic decisions on record, sir. The decision ledger is empty.";
    return (
      `Decision–report evidence map active, sir. ` +
      `${decisions.length} decision${decisions.length !== 1 ? "s" : ""} cross-referenced ` +
      `against ${reports.length} report${reports.length !== 1 ? "s" : ""}. ` +
      `${backed.size} decision${backed.size !== 1 ? "s are" : " is"} backed by documentary evidence. ` +
      `${unsupported} decision${unsupported !== 1 ? "s remain" : " remains"} unsupported — ` +
      `no report evidence found.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:decrpt-toggle"));
    return "Decision–report coverage panel open, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function DecisionReportCoverage() {
  const [visible,    setVisible]    = useState(false);
  const [decisions,  setDecisions]  = useState([]);
  const [reports,    setReports]    = useState([]);
  const [coverage,   setCoverage]   = useState({ backed: new Set(), pairs: [] });
  const [loading,    setLoading]    = useState(false);
  const [search,     setSearch]     = useState("");
  const [filter,     setFilter]     = useState("all");
  const [selected,   setSelected]   = useState(null);
  const [aiMap,      setAiMap]      = useState({});
  const [aiLoading,  setAiLoading]  = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [dr, rr] = await Promise.all([
        fetch(`${apiBase()}/v1/decision/list`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
        fetch(`${apiBase()}/v1/reports`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
      ]);
      const rawDec = normaliseDecisions(dr.ok ? await dr.json() : []);
      const rawRep = normaliseReports(rr.ok ? await rr.json() : []);
      setDecisions(rawDec);
      setReports(rawRep);
      setCoverage(buildCoverage(rawDec, rawRep));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:decrpt-toggle", onToggle);
    return () => window.removeEventListener("jarvis:decrpt-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, 120_000);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function getAiAssessment(dec, matchedReports) {
    const did = decId(dec);
    if (aiMap[did] || aiLoading === did) return;
    setAiLoading(did);
    const title    = dec.title || did;
    const repTitles = matchedReports.map((r) => r.title || r.id || "Report").join(", ");
    const hasCover  = matchedReports.length > 0;
    const prompt = hasCover
      ? `As JARVIS, provide a 2-sentence strategic-evidence assessment for decision "${title}". ` +
        `This decision is backed by ${matchedReports.length} report${matchedReports.length !== 1 ? "s" : ""}: ${repTitles.slice(0, 200)}. ` +
        `Evaluate whether the documentary evidence is sufficient and flag any intelligence gaps.`
      : `As JARVIS, provide a 2-sentence strategic-evidence assessment for decision "${title}"${dec.reason ? ` (rationale: "${String(dec.reason).slice(0, 100)}")` : ""}. ` +
        `This decision has NO report backing — no documentary evidence exists. ` +
        `Recommend what research or reporting should be commissioned to support it.`;
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

  const unsupportedCount = decisions.length - coverage.backed.size;

  const filtered = decisions.filter((dec) => {
    const did = decId(dec);
    if (filter === "backed"      && !coverage.backed.has(did)) return false;
    if (filter === "unsupported" &&  coverage.backed.has(did)) return false;
    if (search) {
      const s    = search.toLowerCase();
      const text = [dec.title, dec.reason, dec.expected, ...(dec.risks || []), ...(dec.alternatives || [])]
        .filter(Boolean).join(" ").toLowerCase();
      if (!text.includes(s)) return false;
    }
    return true;
  });

  const selectedMatches = selected
    ? coverage.pairs
        .filter((p) => p.decId === decId(selected))
        .map((p) => p.report)
    : [];

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Decision × Report Coverage"
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 96,
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
        {unsupportedCount > 0 && !visible && (
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
            {unsupportedCount > 9 ? "9+" : unsupportedCount}
          </span>
        )}
        ◈ DECRPT
      </button>

      {/* Panel */}
      {visible && (
        <div
          style={{
            position: "fixed",
            bottom: 44,
            left: Math.min(BTN_LEFT, window.innerWidth - 660),
            zIndex: 96,
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
              DECISION × REPORT COVERAGE
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
              { label: "DECISIONS",    val: decisions.length,       col: CY     },
              { label: "REPORTS",      val: reports.length,         col: VIOLET },
              { label: "BACKED",       val: coverage.backed.size,   col: GREEN  },
              { label: "UNSUPPORTED",  val: unsupportedCount,       col: AMBER  },
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
            {["all", "backed", "unsupported"].map((f) => (
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
                const did        = decId(dec);
                const isBacked   = coverage.backed.has(did);
                const isActive   = selected && decId(selected) === did;
                const matchCount = coverage.pairs.filter((p) => p.decId === did).length;
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
                          background: isBacked ? GREEN : AMBER,
                          flexShrink: 0,
                          boxShadow: !isBacked ? `0 0 4px ${AMBER}` : undefined,
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
                      <span style={{ fontSize: 8, color: isBacked ? GREEN : AMBER, letterSpacing: 1 }}>
                        {isBacked ? `${matchCount} report${matchCount !== 1 ? "s" : ""}` : "unsupported"}
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
                  Select a decision to see matched reports and request an AI assessment.
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

                    {/* Matched reports or no-coverage message */}
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
                        No reports found for this decision — no documentary evidence.
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
                          {selectedMatches.length} MATCHING REPORT{selectedMatches.length !== 1 ? "S" : ""}
                        </div>
                        {selectedMatches.map((rep, i) => {
                          const rid    = rep.id || rep._id || rep.title || `rep-${i}`;
                          const rType  = (rep.type || "").toUpperCase();
                          const rDate  = rep.date ? String(rep.date).slice(0, 10) : "";
                          const score  = coverage.pairs.find(
                            (p) => p.decId === decId(selected) && (p.report.id || p.report._id || p.report.title) === rid
                          )?.matchScore || 0;
                          return (
                            <div
                              key={`${rid}-${i}`}
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
                                  {rep.title || rid}
                                </span>
                                {rType && (
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
                                    {rType}
                                  </span>
                                )}
                                {rDate && (
                                  <span
                                    style={{
                                      fontSize: 8,
                                      color: CY,
                                      letterSpacing: 1,
                                      padding: "1px 5px",
                                      border: `1px solid ${CY}44`,
                                      borderRadius: 3,
                                      flexShrink: 0,
                                    }}
                                  >
                                    {rDate}
                                  </span>
                                )}
                              </div>
                              {rep.summary && (
                                <div style={{ paddingLeft: 19, fontSize: 10, color: "#4E8A9A", lineHeight: 1.4, marginBottom: 4 }}>
                                  {String(rep.summary).slice(0, 110)}
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
            /v1/decision/list + /v1/reports · 120s auto-refresh · click ▶ ASSESS for AI analysis
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

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  return [];
}

function normaliseDecisions(raw) {
  return normaliseArray(raw).map((d, i) => ({
    id:           d.id || d._id || d.decision_id || `dec-${i}`,
    title:        d.title || d.name || `Decision ${i + 1}`,
    reason:       d.reason || d.rationale || "",
    risks:        Array.isArray(d.risks)        ? d.risks        : [],
    alternatives: Array.isArray(d.alternatives) ? d.alternatives : [],
    expected:     d.expected_outcome || d.outcome || "",
    _raw: d,
  }));
}

function normaliseReports(raw) {
  return normaliseArray(raw).map((r, i) => ({
    id:      r.id || r.report_id || r._id || `rep-${i}`,
    title:   r.title || r.name || r.report_title || `Report ${i + 1}`,
    summary: r.summary || r.description || r.abstract || "",
    type:    r.type || r.report_type || r.category || "",
    date:    r.date || r.created_at || r.published_at || "",
    _raw: r,
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

function buildCoverage(decisions, reports) {
  const backed = new Set();
  const pairs  = [];

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

    for (const rep of reports) {
      const rText = [rep.title, rep.summary, rep.type].filter(Boolean).join(" ");
      const rKws  = keywords(rText);
      const score = dKws.filter((w) => rKws.includes(w)).length;
      if (score >= 1) {
        backed.add(did);
        pairs.push({ decId: did, report: rep, matchScore: score });
      }
    }
  }

  pairs.sort((a, b) => b.matchScore - a.matchScore);
  return { backed, pairs };
}
