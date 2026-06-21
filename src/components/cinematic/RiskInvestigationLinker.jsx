/**
 * RiskInvestigationLinker — F58.
 *
 * Parallel-fetches /entities/RiskSignal + /v1/investigations.
 * Keyword-correlates each risk signal (title/description/type/severity)
 * against open investigation titles, descriptions, and subjects to surface
 * which active risks have case coverage and which are uncovered gaps.
 *
 * Stat tiles: risks / cases / covered risks / uncovered risks
 * Filter tabs: ALL / COVERED / UNCOVERED
 * Split panel: risk list left, matched investigations right.
 * Click ▶ ASSESS on any risk → /v1/jarvis/agent/chat AI 2-sentence
 *   investigation-relevance assessment + TTS via jarvis:speak-dossier.
 * 90 s auto-refresh.
 *
 * Intent: "risk investigation link" / "risk inv link" / "case risk coverage" /
 *         "risk case gap" / "rkinvl" / "risk case link"
 *   → jarvis:risk-inv-link-toggle + TTS brief via buildRiskInvLinkScript()
 *
 * Toggle: ◈ RKINVL at left:7772, bottom:8, zIndex 65.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const RED    = "#FF3D5A";
const PURPLE = "#A78BFA";
const BTN_LEFT  = 7772;
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

function normaliseRisks(raw) {
  return normaliseArray(raw).map((r) => ({
    id:          r.id || r.signal_id || String(Math.random()),
    title:       r.title || r.name || r.signal_name || "Unnamed Risk",
    description: r.description || r.details || r.summary || "",
    severity:    (r.severity || r.level || "medium").toLowerCase(),
    type:        r.type || r.category || r.risk_type || "",
    status:      (r.status || "open").toLowerCase(),
    tags:        [...(r.tags || []), ...(r.keywords || [])].map(String),
    date:        r.date || r.created_at || r.detected_at || "",
  }));
}

function normaliseInvestigations(raw) {
  return normaliseArray(raw).map((inv) => ({
    id:          inv.id || inv.case_id || String(Math.random()),
    title:       inv.title || inv.name || inv.case_name || "Unnamed Case",
    description: inv.description || inv.summary || inv.details || "",
    status:      (inv.status || "open").toLowerCase(),
    priority:    inv.priority || inv.severity || "",
    subject:     inv.subject || inv.target || "",
    lead:        inv.lead || inv.assigned_to || inv.investigator || "",
  }));
}

function tokens(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function riskMatchScore(risk, inv) {
  const invText = `${inv.title} ${inv.description} ${inv.subject} ${inv.lead}`.toLowerCase();
  const riskWords = [
    ...tokens(risk.title),
    ...tokens(risk.description),
    ...tokens(risk.type),
    ...risk.tags.flatMap(tokens),
  ];
  return riskWords.reduce((acc, w) => acc + (invText.includes(w) ? 1 : 0), 0);
}

function correlate(risks, investigations) {
  return risks.map((risk) => {
    const matched = investigations
      .map((inv) => ({ ...inv, _score: riskMatchScore(risk, inv) }))
      .filter((inv) => inv._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    return { ...risk, matched };
  });
}

function severityColor(s) {
  if (s === "critical") return RED;
  if (s === "high")     return AMBER;
  if (s === "medium")   return CY;
  return "#445566";
}

function statusColor(s) {
  if (s === "open")                                     return RED;
  if (s === "in-progress" || s === "in_progress")       return AMBER;
  if (s === "pending")                                   return PURPLE;
  return "#445566";
}

// ─── exported intent helpers (consumed by JarvisBrain) ───────────────────────

const RKINVL_RE =
  /risk.{0,15}invest|invest.{0,15}risk|risk.{0,15}case|case.{0,15}risk|risk[\s-]?case[\s-]?gap|risk[\s-]?case[\s-]?link|case[\s-]?risk|rkinvl\b/i;

export function isRiskInvLinkQuery(q) {
  return RKINVL_RE.test(q || "");
}

export async function buildRiskInvLinkScript() {
  try {
    const [riskRaw, invRaw] = await Promise.all([
      fetch(`${apiBase()}/entities/RiskSignal`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
      fetch(`${apiBase()}/v1/investigations`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
    ]);
    const risks           = normaliseRisks(riskRaw);
    const investigations  = normaliseInvestigations(invRaw);
    const correlated      = correlate(risks, investigations);
    const covered         = correlated.filter((r) => r.matched.length > 0);
    const uncovered       = correlated.filter((r) => r.matched.length === 0);
    const criticalUncov   = uncovered.filter((r) => r.severity === "critical");
    return `Risk-investigation linker active, sir. ${risks.length} risk signal${risks.length !== 1 ? "s" : ""} cross-referenced against ${investigations.length} case${investigations.length !== 1 ? "s" : ""}. ${covered.length} risk${covered.length !== 1 ? "s have" : " has"} investigation coverage. ${uncovered.length} risk${uncovered.length !== 1 ? "s are" : " is"} uncovered — including ${criticalUncov.length} critical. Select a risk to assess its case relevance.`;
  } catch (_) {
    return "Risk-investigation linker is standing by, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function RiskInvestigationLinker() {
  const [visible, setVisible]     = useState(false);
  const [risks, setRisks]         = useState([]);
  const [investigations, setInvestigations] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState("UNCOVERED");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [riskRaw, invRaw] = await Promise.all([
        fetch(`${apiBase()}/entities/RiskSignal`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
        fetch(`${apiBase()}/v1/investigations`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
      ]);
      setRisks(normaliseRisks(riskRaw));
      setInvestigations(normaliseInvestigations(invRaw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:risk-inv-link-toggle", onToggle);
    return () => window.removeEventListener("jarvis:risk-inv-link-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assessRisk(risk) {
    setAssessing(risk.id);
    const invTitles = risk.matched.map((inv) => `"${inv.title}"`).join(", ");
    const prompt = `As JARVIS, provide a 2-sentence assessment of whether these investigations adequately cover the risk signal "${risk.title}" (${risk.severity} severity). Investigations: ${invTitles || "none"}. Focus on whether there are coverage gaps or overlap.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Insufficient data to assess investigation coverage for this risk, sir.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: "Assessment unavailable at this time, sir." },
      }));
    }
    setAssessing(null);
  }

  const correlated  = correlate(risks, investigations);
  const covered     = correlated.filter((r) => r.matched.length > 0);
  const uncovered   = correlated.filter((r) => r.matched.length === 0);
  const critUncov   = uncovered.filter((r) => r.severity === "critical");

  const displayed =
    tab === "ALL"       ? correlated  :
    tab === "COVERED"   ? covered     : uncovered;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Risk-Investigation Linker (F58)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 65,
          background: visible ? `${CY}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? CY : `${CY}44`}`,
          color: visible ? CY : `${CY}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ RKINVL
        {critUncov.length > 0 && (
          <span style={{
            marginLeft: 4, background: RED, color: "#fff",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{critUncov.length}</span>
        )}
      </button>

      {visible && (
        <div style={{
          position: "fixed", bottom: 32, left: Math.max(8, BTN_LEFT - 280), zIndex: 65,
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
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>◈ RISK-INVESTIGATION LINKER</span>
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
              ["RISKS",     risks.length,       CY],
              ["CASES",     investigations.length, PURPLE],
              ["COVERED",   covered.length,     GREEN],
              ["UNCOVERED", uncovered.length,   uncovered.length > 0 ? RED : "#445566"],
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
            {["ALL", "COVERED", "UNCOVERED"].map((t) => (
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

          {/* Risk rows */}
          {loading && displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              correlating risks against investigations…
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              {tab === "UNCOVERED" ? "All risks have investigation coverage." : "No risks in this filter."}
            </div>
          ) : (
            displayed.map((risk) => {
              const sc   = severityColor(risk.severity);
              const isOpen = expanded === risk.id;
              const hasCoverage = risk.matched.length > 0;
              return (
                <div key={risk.id} style={{
                  background: "rgba(255,255,255,0.02)",
                  border: `1px solid ${isOpen ? `${CY}44` : "#1a2530"}`,
                  borderLeft: `3px solid ${sc}`,
                  borderRadius: 6, padding: "8px 10px", marginBottom: 6,
                  cursor: "pointer",
                }} onClick={() => setExpanded(isOpen ? null : risk.id)}>
                  {/* Risk header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 7, color: sc, border: `1px solid ${sc}55`,
                      borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                      whiteSpace: "nowrap", textTransform: "uppercase",
                    }}>{risk.severity}</span>
                    {risk.type && (
                      <span style={{
                        fontSize: 7, color: PURPLE, border: "1px solid #A78BFA44",
                        borderRadius: 3, padding: "1px 5px", letterSpacing: 1, whiteSpace: "nowrap",
                      }}>{String(risk.type).toUpperCase()}</span>
                    )}
                    <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{risk.title}</span>
                    <span style={{
                      fontSize: 7, whiteSpace: "nowrap",
                      color: hasCoverage ? GREEN : RED,
                    }}>
                      {hasCoverage ? `${risk.matched.length} case${risk.matched.length !== 1 ? "s" : ""}` : "⚠ UNCOVERED"}
                    </span>
                  </div>

                  {risk.description && (
                    <div style={{ color: "#556677", fontSize: 8, lineHeight: 1.4, marginBottom: 4 }}>
                      {risk.description.slice(0, 120)}{risk.description.length > 120 ? "…" : ""}
                    </div>
                  )}

                  {/* Assess button */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 7, color: "#334455", flex: 1 }}>
                      {risk.date ? `detected: ${String(risk.date).slice(0, 10)}` : ""}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); assessRisk(risk); }}
                      disabled={assessing === risk.id}
                      style={{
                        background: assessing === risk.id ? "#1a2530" : `${CY}18`,
                        color: assessing === risk.id ? "#445566" : CY,
                        border: `1px solid ${CY}44`,
                        borderRadius: 3, padding: "2px 8px",
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                        letterSpacing: 1, cursor: assessing === risk.id ? "default" : "pointer",
                      }}
                    >{assessing === risk.id ? "…assessing" : "▶ ASSESS"}</button>
                  </div>

                  {/* Expanded investigation list */}
                  {isOpen && hasCoverage && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${CY}18` }}>
                      {risk.matched.map((inv) => {
                        const isc = statusColor(inv.status);
                        return (
                          <div key={inv.id} style={{
                            background: "rgba(255,255,255,0.02)",
                            border: "1px solid #1e3040",
                            borderRadius: 4, padding: "6px 8px", marginBottom: 4,
                            display: "flex", alignItems: "flex-start", gap: 8,
                          }}>
                            <span style={{
                              fontSize: 7, color: isc, border: `1px solid ${isc}55`,
                              borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                              textTransform: "uppercase", whiteSpace: "nowrap", flexShrink: 0,
                            }}>{inv.status}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ color: "#a0b8cc", fontSize: 10 }}>{inv.title}</div>
                              {inv.description && (
                                <div style={{ color: "#445566", fontSize: 8, marginTop: 1 }}>
                                  {inv.description.slice(0, 80)}{inv.description.length > 80 ? "…" : ""}
                                </div>
                              )}
                              {inv.lead && (
                                <div style={{ color: "#334455", fontSize: 7, marginTop: 2 }}>Lead: {inv.lead}</div>
                              )}
                            </div>
                            <div style={{ fontSize: 7, color: `${CY}66`, whiteSpace: "nowrap" }}>
                              score {inv._score}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {isOpen && !hasCoverage && (
                    <div style={{
                      marginTop: 8, paddingTop: 8, borderTop: "1px solid #1a2530",
                      color: RED, fontSize: 8,
                    }}>
                      ⚠ No investigation coverage found for this risk signal.
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div style={{ marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right" }}>
            /entities/RiskSignal + /v1/investigations · 90 s auto-refresh · ▶ ASSESS for AI coverage assessment
          </div>
        </div>
      )}
    </>
  );
}
