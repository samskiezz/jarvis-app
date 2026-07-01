/**
 * InvestigationSkillCoverage — F53.
 *
 * Parallel-fetches /v1/aip/skill + /v1/investigations + /entities/RiskSignal.
 * Extracts keyword tokens from skill names/descriptions and cross-references them
 * against investigation titles/types and risk signal names/types.
 * Unmatched investigations + risks surface as coverage gaps.
 *
 * Shows:
 *  - Overall coverage % badge
 *  - Uncovered investigations + risks ranked by gap severity
 *  - Covered items (collapsed)
 *  - ▶ ANALYZE → /v1/jarvis/agent/chat structured gap analysis + TTS
 *
 * Toggle: ◎ ISCOV at left:11020, zIndex 65.
 * 5-min auto-refresh while open.
 * Mounted in App.jsx. Intents exported for JarvisBrain.
 * Voice: "investigation coverage" / "skill coverage" / "coverage audit" / "iscov"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const RED = "#FF3D5A";
const AMB = "#F5A623";
const GRN = "#34D399";
const PRP = "#C070FF";
const BTN_LEFT   = 11020;
const REFRESH_MS = 5 * 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isIscovQuery(q) {
  return /investigation.skill|skill.coverage|coverage.audit|iscov|uncovered.investigation|investigation.coverage|knowledge.coverage/i.test(q || "");
}

export async function buildIscovScript() {
  try {
    const { uncoveredInv, uncoveredRisk, total, covered } = await runCoverageAnalysis();
    window.dispatchEvent(new CustomEvent("jarvis:iscov-toggle"));
    const pct = total ? Math.round((covered / total) * 100) : 0;
    const gaps = uncoveredInv.length + uncoveredRisk.length;
    if (!total) {
      return "Investigation skill coverage panel open, sir. No data to analyse yet — endpoints are returning empty sets.";
    }
    return `Investigation skill coverage panel open, sir. Overall coverage sits at ${pct}% across ${total} items. ${gaps} gap${gaps !== 1 ? "s" : ""} detected — ${uncoveredInv.length} investigation${uncoveredInv.length !== 1 ? "s" : ""} and ${uncoveredRisk.length} risk signal${uncoveredRisk.length !== 1 ? "s" : ""} lack matching skill coverage. ${gaps > 0 ? "Recommend running the full gap analysis for targeted remediation." : "All items appear to have skill coverage in place."}`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:iscov-toggle"));
    return "Investigation skill coverage panel open, sir.";
  }
}

// ─── fetchers ─────────────────────────────────────────────────────────────────

const hdrs = { Authorization: `Bearer ${API_KEY}` };

async function fetchSkills() {
  const r = await fetch(`${apiBase()}/v1/aip/skill`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  return Array.isArray(d)          ? d
    : Array.isArray(d?.data)       ? d.data
    : Array.isArray(d?.items)      ? d.items
    : Array.isArray(d?.skills)     ? d.skills
    : [];
}

async function fetchInvestigations() {
  const r = await fetch(`${apiBase()}/v1/investigations`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  return Array.isArray(d)               ? d
    : Array.isArray(d?.data)            ? d.data
    : Array.isArray(d?.items)           ? d.items
    : Array.isArray(d?.investigations)  ? d.investigations
    : Array.isArray(d?.cases)           ? d.cases
    : [];
}

async function fetchRisks() {
  const r = await fetch(`${apiBase()}/entities/RiskSignal`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  return Array.isArray(d)           ? d
    : Array.isArray(d?.data)        ? d.data
    : Array.isArray(d?.items)       ? d.items
    : Array.isArray(d?.results)     ? d.results
    : Array.isArray(d?.RiskSignal)  ? d.RiskSignal
    : [];
}

// ─── matching logic ──────────────────────────────────────────────────────────

function tokenize(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .split(/\W+/)
    .filter((t) => t.length > 3);
}

function skillKeywords(skills) {
  const tokens = new Set();
  skills.forEach((s) => {
    tokenize(s.name || "").forEach((t) => tokens.add(t));
    tokenize(s.description || "").forEach((t) => tokens.add(t));
    tokenize(s.domain || "").forEach((t) => tokens.add(t));
    tokenize(s.category || "").forEach((t) => tokens.add(t));
  });
  return tokens;
}

function hasSkillCoverage(item, kws) {
  const haystack = [
    item.name, item.title, item.case_name, item.label, item.type,
    item.description, item.category, item.signal_type,
  ].filter(Boolean).join(" ");
  return tokenize(haystack).some((t) => kws.has(t));
}

function itemLabel(item) {
  return item.name || item.title || item.case_name || item.label || item.signal_type || item.type || "Unnamed";
}

function itemSeverity(item) {
  const s = (item.severity || item.priority || item.risk_level || "").toLowerCase();
  if (/critical|crit/.test(s)) return "CRITICAL";
  if (/high/.test(s))          return "HIGH";
  if (/med/.test(s))           return "MEDIUM";
  return "LOW";
}

const SEV_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

async function runCoverageAnalysis() {
  const [skills, invs, risks] = await Promise.all([
    fetchSkills(), fetchInvestigations(), fetchRisks(),
  ]);

  const kws = skillKeywords(skills);

  const coveredInv   = invs.filter((i) => hasSkillCoverage(i, kws));
  const uncoveredInv = invs.filter((i) => !hasSkillCoverage(i, kws));
  const coveredRisk  = risks.filter((r) => hasSkillCoverage(r, kws));
  const uncoveredRisk = risks.filter((r) => !hasSkillCoverage(r, kws));

  uncoveredInv.sort((a, b) => SEV_ORDER[itemSeverity(a)] - SEV_ORDER[itemSeverity(b)]);
  uncoveredRisk.sort((a, b) => SEV_ORDER[itemSeverity(a)] - SEV_ORDER[itemSeverity(b)]);

  const total   = invs.length + risks.length;
  const covered = coveredInv.length + coveredRisk.length;

  return { skills, uncoveredInv, uncoveredRisk, coveredInv, coveredRisk, total, covered };
}

// ─── colour helpers ───────────────────────────────────────────────────────────

function sevColor(sev) {
  return sev === "CRITICAL" ? RED : sev === "HIGH" ? AMB : sev === "MEDIUM" ? CY : GRN;
}

// ─── component ────────────────────────────────────────────────────────────────

export default function InvestigationSkillCoverage() {
  const [visible, setVisible]      = useState(false);
  const [data, setData]            = useState(null);
  const [loading, setLoading]      = useState(false);
  const [tab, setTab]              = useState("GAPS");
  const [analyzing, setAnalyzing]  = useState(false);
  const [analysis, setAnalysis]    = useState("");
  const timerRef = useRef(null);

  useEffect(() => {
    const toggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:iscov-toggle", toggle);
    return () => window.removeEventListener("jarvis:iscov-toggle", toggle);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await runCoverageAnalysis();
      setData(result);
    } catch {
      // leave stale data if any
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [visible, load]);

  const analyze = useCallback(async () => {
    if (analyzing || !data) return;
    setAnalyzing(true);
    setAnalysis("");
    try {
      const uncoveredLabels = [
        ...data.uncoveredInv.slice(0, 5).map((i) => `investigation "${itemLabel(i)}"`),
        ...data.uncoveredRisk.slice(0, 5).map((r) => `risk signal "${itemLabel(r)}"`),
      ];
      const pct = data.total ? Math.round((data.covered / data.total) * 100) : 0;
      const prompt =
        `JARVIS skill coverage audit summary: ${pct}% of ${data.total} items are covered by existing skills. ` +
        `Uncovered items include: ${uncoveredLabels.length ? uncoveredLabels.join(", ") : "none"}. ` +
        `In exactly 3 sentences: identify the most critical knowledge gap, explain the operational risk it creates, and recommend the single most impactful skill to add. British-butler tone. No markdown.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      if (text) {
        setAnalysis(text);
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
      }
    } catch {
      setAnalysis("Reasoning core unreachable. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  }, [analyzing, data]);

  const pct     = data && data.total ? Math.round((data.covered / data.total) * 100) : null;
  const gapCount = data ? data.uncoveredInv.length + data.uncoveredRisk.length : 0;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Investigation Skill Coverage"
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 65,
          height: 26,
          padding: "0 8px",
          background: visible ? `${PRP}22` : "rgba(8,14,22,0.82)",
          border: `1px solid ${visible ? PRP : "#2A3A4A"}`,
          borderRadius: 5,
          color: visible ? PRP : "#6E8AA0",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          letterSpacing: 1,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {gapCount > 0 && !visible && (
          <span style={{
            display: "inline-block", marginRight: 5,
            background: AMB, color: "#000", borderRadius: "50%",
            width: 14, height: 14, fontSize: 9,
            lineHeight: "14px", textAlign: "center",
          }}>{Math.min(gapCount, 99)}</span>
        )}
        ◎ ISCOV
      </button>

      {/* Panel */}
      {visible && (
        <div style={{
          position: "fixed",
          bottom: 44,
          left: Math.min(BTN_LEFT, (typeof window !== "undefined" ? window.innerWidth : 1920) - 580),
          zIndex: 200,
          width: 560,
          maxHeight: "72vh",
          background: "rgba(6,12,20,0.97)",
          border: `1px solid ${PRP}55`,
          borderRadius: 10,
          boxShadow: `0 0 28px ${PRP}22`,
          display: "flex",
          flexDirection: "column",
          fontFamily: "'JetBrains Mono', monospace",
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px 8px",
            borderBottom: "1px solid #1A2A3A",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
          }}>
            <span style={{ color: PRP, fontSize: 11, letterSpacing: 1.5, fontWeight: 700 }}>
              ◎ INVESTIGATION SKILL COVERAGE
            </span>
            {loading && (
              <span style={{ color: "#4E6A7A", fontSize: 9, marginLeft: "auto" }}>SCANNING…</span>
            )}
            {pct !== null && !loading && (
              <span style={{
                marginLeft: "auto",
                background: pct >= 75 ? `${GRN}22` : pct >= 50 ? `${AMB}22` : `${RED}22`,
                border: `1px solid ${pct >= 75 ? GRN : pct >= 50 ? AMB : RED}`,
                borderRadius: 4,
                padding: "2px 7px",
                fontSize: 10,
                color: pct >= 75 ? GRN : pct >= 50 ? AMB : RED,
                letterSpacing: 1,
              }}>
                {pct}% COVERED
              </span>
            )}
          </div>

          {/* Stats row */}
          {data && (
            <div style={{
              display: "flex", gap: 8, padding: "8px 14px",
              borderBottom: "1px solid #1A2A3A", flexShrink: 0,
            }}>
              {[
                { label: "SKILLS", val: data.skills.length, col: PRP },
                { label: "INVESTIGATIONS", val: data.coveredInv.length + data.uncoveredInv.length, col: CY },
                { label: "RISK SIGNALS", val: data.coveredRisk.length + data.uncoveredRisk.length, col: AMB },
                { label: "GAPS", val: gapCount, col: gapCount > 0 ? RED : GRN },
              ].map((s) => (
                <div key={s.label} style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid #1A2A3A",
                  borderRadius: 6,
                  padding: "5px 8px",
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: 14, color: s.col, fontWeight: 700 }}>{s.val}</div>
                  <div style={{ fontSize: 8, color: "#4E6A7A", letterSpacing: 1, marginTop: 1 }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Filter tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid #1A2A3A", flexShrink: 0 }}>
            {["GAPS", "INVESTIGATIONS", "RISKS", "COVERED"].map((t) => {
              const col = t === "GAPS" ? RED : t === "INVESTIGATIONS" ? CY : t === "RISKS" ? AMB : GRN;
              return (
                <button key={t} onClick={() => setTab(t)} style={{
                  flex: 1, padding: "6px 0",
                  border: "none",
                  borderBottom: tab === t ? `2px solid ${col}` : "2px solid transparent",
                  background: "transparent",
                  color: tab === t ? col : "#6E8AA0",
                  fontSize: 9, letterSpacing: 1, cursor: "pointer",
                  fontFamily: "inherit",
                }}>
                  {t}
                  {t === "GAPS" && gapCount > 0 && (
                    <span style={{
                      marginLeft: 4, background: RED, color: "#000",
                      borderRadius: "50%", width: 13, height: 13,
                      fontSize: 8, lineHeight: "13px", textAlign: "center",
                      display: "inline-block",
                    }}>{Math.min(gapCount, 99)}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 14px" }}>
            {!data && !loading && (
              <div style={{ color: "#4E6A7A", fontSize: 10, textAlign: "center", padding: 20 }}>
                AWAITING DATA…
              </div>
            )}

            {data && tab === "GAPS" && (
              <>
                {gapCount === 0 ? (
                  <div style={{ color: GRN, fontSize: 10, textAlign: "center", padding: 20 }}>
                    ✓ All items have matching skill coverage.
                  </div>
                ) : (
                  <>
                    {data.uncoveredInv.length > 0 && (
                      <>
                        <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                          INVESTIGATIONS WITHOUT COVERAGE ({data.uncoveredInv.length})
                        </div>
                        {data.uncoveredInv.map((inv, i) => {
                          const sev = itemSeverity(inv);
                          return (
                            <div key={i} style={{
                              padding: "7px 10px", marginBottom: 5,
                              background: "rgba(255,255,255,0.03)",
                              border: `1px solid ${sevColor(sev)}44`,
                              borderLeft: `3px solid ${sevColor(sev)}`,
                              borderRadius: 6, display: "flex", alignItems: "center", gap: 8,
                            }}>
                              <span style={{
                                fontSize: 8, padding: "1px 5px",
                                background: `${sevColor(sev)}22`,
                                color: sevColor(sev), borderRadius: 3, letterSpacing: 1,
                                flexShrink: 0,
                              }}>{sev}</span>
                              <span style={{ fontSize: 10, color: "#C8D8E8", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {itemLabel(inv)}
                              </span>
                              <span style={{ fontSize: 9, color: "#4E6A7A", flexShrink: 0 }}>
                                {inv.status || inv.state || ""}
                              </span>
                            </div>
                          );
                        })}
                      </>
                    )}
                    {data.uncoveredRisk.length > 0 && (
                      <>
                        <div style={{ color: AMB, fontSize: 9, letterSpacing: 1, marginTop: 10, marginBottom: 6 }}>
                          RISK SIGNALS WITHOUT COVERAGE ({data.uncoveredRisk.length})
                        </div>
                        {data.uncoveredRisk.map((rsk, i) => {
                          const sev = itemSeverity(rsk);
                          return (
                            <div key={i} style={{
                              padding: "7px 10px", marginBottom: 5,
                              background: "rgba(255,255,255,0.03)",
                              border: `1px solid ${sevColor(sev)}44`,
                              borderLeft: `3px solid ${sevColor(sev)}`,
                              borderRadius: 6, display: "flex", alignItems: "center", gap: 8,
                            }}>
                              <span style={{
                                fontSize: 8, padding: "1px 5px",
                                background: `${sevColor(sev)}22`,
                                color: sevColor(sev), borderRadius: 3, letterSpacing: 1,
                                flexShrink: 0,
                              }}>{sev}</span>
                              <span style={{ fontSize: 10, color: "#C8D8E8", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {itemLabel(rsk)}
                              </span>
                              <span style={{ fontSize: 9, color: "#4E6A7A", flexShrink: 0 }}>
                                {rsk.signal_type || rsk.type || ""}
                              </span>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </>
                )}
              </>
            )}

            {data && tab === "INVESTIGATIONS" && (
              <>
                {[...data.coveredInv, ...data.uncoveredInv].length === 0 ? (
                  <div style={{ color: "#4E6A7A", fontSize: 10, textAlign: "center", padding: 20 }}>No investigations found.</div>
                ) : (
                  [...data.uncoveredInv, ...data.coveredInv].map((inv, i) => {
                    const covered = data.coveredInv.includes(inv);
                    return (
                      <div key={i} style={{
                        padding: "7px 10px", marginBottom: 5,
                        background: "rgba(255,255,255,0.03)",
                        border: `1px solid ${covered ? GRN : RED}33`,
                        borderLeft: `3px solid ${covered ? GRN : RED}`,
                        borderRadius: 6, display: "flex", alignItems: "center", gap: 8,
                      }}>
                        <span style={{ fontSize: 9, color: covered ? GRN : RED, flexShrink: 0 }}>
                          {covered ? "✓" : "✗"}
                        </span>
                        <span style={{ fontSize: 10, color: "#C8D8E8", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {itemLabel(inv)}
                        </span>
                        <span style={{ fontSize: 9, color: "#4E6A7A", flexShrink: 0 }}>
                          {inv.status || ""}
                        </span>
                      </div>
                    );
                  })
                )}
              </>
            )}

            {data && tab === "RISKS" && (
              <>
                {[...data.coveredRisk, ...data.uncoveredRisk].length === 0 ? (
                  <div style={{ color: "#4E6A7A", fontSize: 10, textAlign: "center", padding: 20 }}>No risk signals found.</div>
                ) : (
                  [...data.uncoveredRisk, ...data.coveredRisk].map((rsk, i) => {
                    const covered = data.coveredRisk.includes(rsk);
                    const sev = itemSeverity(rsk);
                    return (
                      <div key={i} style={{
                        padding: "7px 10px", marginBottom: 5,
                        background: "rgba(255,255,255,0.03)",
                        border: `1px solid ${sevColor(sev)}33`,
                        borderLeft: `3px solid ${covered ? GRN : sevColor(sev)}`,
                        borderRadius: 6, display: "flex", alignItems: "center", gap: 8,
                      }}>
                        <span style={{ fontSize: 9, color: covered ? GRN : RED, flexShrink: 0 }}>
                          {covered ? "✓" : "✗"}
                        </span>
                        <span style={{
                          fontSize: 8, padding: "1px 5px",
                          background: `${sevColor(sev)}22`,
                          color: sevColor(sev), borderRadius: 3, letterSpacing: 1, flexShrink: 0,
                        }}>{sev}</span>
                        <span style={{ fontSize: 10, color: "#C8D8E8", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {itemLabel(rsk)}
                        </span>
                      </div>
                    );
                  })
                )}
              </>
            )}

            {data && tab === "COVERED" && (
              <>
                {data.coveredInv.length === 0 && data.coveredRisk.length === 0 ? (
                  <div style={{ color: "#4E6A7A", fontSize: 10, textAlign: "center", padding: 20 }}>No covered items found.</div>
                ) : (
                  [...data.coveredInv.map((i) => ({ ...i, _kind: "INV" })),
                   ...data.coveredRisk.map((r) => ({ ...r, _kind: "RISK" }))].map((item, i) => (
                    <div key={i} style={{
                      padding: "7px 10px", marginBottom: 5,
                      background: "rgba(255,255,255,0.02)",
                      border: `1px solid ${GRN}22`,
                      borderLeft: `3px solid ${GRN}`,
                      borderRadius: 6, display: "flex", alignItems: "center", gap: 8,
                    }}>
                      <span style={{ fontSize: 8, padding: "1px 5px", background: `${GRN}22`, color: GRN, borderRadius: 3, letterSpacing: 1, flexShrink: 0 }}>
                        {item._kind}
                      </span>
                      <span style={{ fontSize: 10, color: "#8EB8C8", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {itemLabel(item)}
                      </span>
                    </div>
                  ))
                )}
              </>
            )}
          </div>

          {/* AI analysis section */}
          {analysis && (
            <div style={{
              margin: "0 14px 10px",
              padding: "8px 10px",
              background: `${PRP}11`,
              border: `1px solid ${PRP}44`,
              borderRadius: 7,
              flexShrink: 0,
            }}>
              <div style={{ fontSize: 8, color: PRP, letterSpacing: 1, marginBottom: 4 }}>JARVIS ANALYSIS</div>
              <div style={{ fontSize: 10, color: "#C8D8E8", lineHeight: 1.55 }}>{analysis}</div>
            </div>
          )}

          {/* Analyze button */}
          <div style={{
            padding: "8px 14px 12px",
            borderTop: "1px solid #1A2A3A",
            display: "flex",
            justifyContent: "flex-end",
            flexShrink: 0,
          }}>
            <button
              onClick={analyze}
              disabled={analyzing || !data}
              style={{
                padding: "5px 14px",
                background: analyzing ? "rgba(8,14,22,0.6)" : `${PRP}22`,
                border: `1px solid ${analyzing ? "#2A3A4A" : PRP}`,
                borderRadius: 5,
                color: analyzing ? "#4E6A7A" : PRP,
                fontFamily: "inherit",
                fontSize: 10,
                letterSpacing: 1,
                cursor: analyzing || !data ? "not-allowed" : "pointer",
              }}
            >
              {analyzing ? "ANALYSING…" : "▶ ANALYSE GAPS"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
