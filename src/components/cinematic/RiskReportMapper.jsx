/**
 * RiskReportMapper — F74.
 *
 * Parallel-fetches /entities/RiskSignal + /v1/reports.
 * Keyword-correlates active risk names/descriptions against report titles to
 * surface which risks have evidentiary report coverage ("evidenced") versus
 * risks with no matching reports ("naked").
 *
 * Stat tiles: risks / reports / evidenced / naked
 * Filter tabs: ALL / EVIDENCED / NAKED
 * List: risks sorted by coverage (naked first); each shows matched report titles.
 * Click ▶ ASSESS on any risk → /v1/jarvis/agent/chat AI 2-sentence evidence-gap
 *   assessment + TTS via jarvis:speak-dossier.
 * 5-minute auto-refresh.
 *
 * Intent: "risk report" / "risk evidence" / "report coverage" / "naked risk" /
 *         "uncovered risk" / "riskrep" / "evidence gap" / "risk documentation"
 *   → jarvis:riskrep-toggle + TTS brief via buildRiskRepScript()
 *
 * Toggle: ◎ RISKREP at left:6420, zIndex 65.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const GREEN = "#00c878";
const RED = "#FF3D5A";
const PURPLE = "#A78BFA";
const AMBER = "#F5A623";
const BTN_LEFT = 6420;
const REFRESH_MS = 300_000; // 5 minutes
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

function normaliseRisks(raw) {
  return normaliseArray(raw).map((r) => ({
    id: r.id || r.signal_id || String(Math.random()),
    name: r.name || r.title || r.signal_name || "Unnamed Risk",
    description: r.description || r.summary || r.details || "",
    severity: Number(r.severity ?? r.score ?? r.risk_score ?? 0),
    status: (r.status || "open").toLowerCase(),
    category: r.category || r.type || r.risk_type || "",
    tags: [...(r.tags || []), ...(r.keywords || [])].map(String),
  }));
}

function normaliseReports(raw) {
  return normaliseArray(raw).map((r) => ({
    id: r.id || r.report_id || String(Math.random()),
    title: r.title || r.name || r.report_title || "Unnamed Report",
    summary: r.summary || r.description || r.abstract || "",
    type: r.type || r.report_type || r.category || "",
    date: r.date || r.created_at || r.published_at || "",
  }));
}

function keywords(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function reportMatchScore(risk, report) {
  const riskWords = [
    ...keywords(risk.name),
    ...keywords(risk.description),
    ...keywords(risk.category),
    ...risk.tags.flatMap(keywords),
  ];
  const reportText = `${report.title} ${report.summary}`.toLowerCase();
  return riskWords.reduce((acc, w) => acc + (reportText.includes(w) ? 1 : 0), 0);
}

function correlate(risks, reports) {
  return risks
    .filter((r) => r.status !== "resolved" && r.status !== "closed")
    .map((risk) => {
      const matched = reports
        .map((rep) => ({ ...rep, _score: reportMatchScore(risk, rep) }))
        .filter((rep) => rep._score > 0)
        .sort((a, b) => b._score - a._score)
        .slice(0, 5);
      return { ...risk, matched, evidenced: matched.length > 0 };
    })
    .sort((a, b) => {
      // naked risks first, then by severity descending
      if (a.evidenced !== b.evidenced) return a.evidenced ? 1 : -1;
      return b.severity - a.severity;
    });
}

function severityColor(sev) {
  if (sev >= 90) return RED;
  if (sev >= 70) return AMBER;
  if (sev >= 40) return CY;
  return "#445566";
}

// ─── exported intent helpers (consumed by JarvisBrain) ──────────────────────

const RISKREP_RE =
  /risk.{0,12}report|report.{0,12}risk|risk\s+eviden|eviden.{0,12}gap|naked\s+risk|uncovered\s+risk|risk\s+doc|riskrep\b|report\s+cover|risk\s+coverage/i;

export function isRiskRepQuery(q) {
  return RISKREP_RE.test(q || "");
}

export async function buildRiskRepScript() {
  try {
    const [riskRaw, repRaw] = await Promise.all([
      fetch(`${apiBase()}/entities/RiskSignal`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
      fetch(`${apiBase()}/v1/reports`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
    ]);
    const risks = normaliseRisks(riskRaw);
    const reports = normaliseReports(repRaw);
    const correlated = correlate(risks, reports);
    const evidenced = correlated.filter((r) => r.evidenced);
    const naked = correlated.filter((r) => !r.evidenced);
    return `Risk-report evidence mapping complete, sir. ${risks.length} active risk signal${risks.length !== 1 ? "s" : ""} assessed against ${reports.length} report${reports.length !== 1 ? "s" : ""}. ${evidenced.length} risk${evidenced.length !== 1 ? "s have" : " has"} evidentiary report coverage. ${naked.length} risk${naked.length !== 1 ? "s remain" : " remains"} undocumented — these represent evidence gaps requiring attention.`;
  } catch (_) {
    return "Risk-report evidence mapper is standing by, sir.";
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function RiskReportMapper() {
  const [visible, setVisible] = useState(false);
  const [risks, setRisks] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("NAKED");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [riskRaw, repRaw] = await Promise.all([
        fetch(`${apiBase()}/entities/RiskSignal`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
        fetch(`${apiBase()}/v1/reports`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
      ]);
      setRisks(normaliseRisks(riskRaw));
      setReports(normaliseReports(repRaw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:riskrep-toggle", onToggle);
    return () => window.removeEventListener("jarvis:riskrep-toggle", onToggle);
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
    const reportTitles = risk.matched.map((r) => r.title).join(", ");
    const prompt = `As JARVIS, provide a 2-sentence evidence-gap assessment for the risk signal "${risk.name}" (severity ${risk.severity}). Matched reports: ${reportTitles || "none — this is an undocumented risk"}. Advise on the significance of this evidence gap and what documentation should be prioritised.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Insufficient data to assess this evidence gap at this time, sir.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", {
          detail: { text: "Evidence gap assessment unavailable at this time, sir." },
        })
      );
    }
    setAssessing(null);
  }

  const correlated = correlate(risks, reports);
  const evidenced = correlated.filter((r) => r.evidenced);
  const naked = correlated.filter((r) => !r.evidenced);

  const displayed =
    tab === "ALL" ? correlated : tab === "EVIDENCED" ? evidenced : naked;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Risk-Report Evidence Mapper (F74)"
        style={{
          position: "fixed", bottom: 6, left: BTN_LEFT, zIndex: 65,
          background: visible ? `${RED}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? RED : RED}44`,
          color: visible ? RED : `${RED}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◎ RISKREP
        {naked.length > 0 && (
          <span style={{
            marginLeft: 4, background: RED, color: "#04060A",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{naked.length}</span>
        )}
      </button>

      {visible && (
        <div style={{
          position: "fixed", bottom: 32, left: BTN_LEFT - 280, zIndex: 65,
          width: 560, maxHeight: "70vh", overflowY: "auto",
          background: "rgba(6,11,18,0.93)",
          border: `1px solid ${RED}44`,
          borderRadius: 10, padding: "14px 16px",
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${RED}18`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: RED, fontSize: 11, letterSpacing: 2 }}>◎ RISK-REPORT EVIDENCE MAPPER</span>
            <button
              onClick={fetchData}
              style={{
                marginLeft: "auto", background: "transparent",
                border: `1px solid ${RED}33`, borderRadius: 3,
                color: `${RED}88`, padding: "2px 6px", fontSize: 7,
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
              ["RISKS", correlated.length, CY],
              ["REPORTS", reports.length, PURPLE],
              ["EVIDENCED", evidenced.length, GREEN],
              ["NAKED", naked.length, RED],
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
            {["ALL", "NAKED", "EVIDENCED"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${RED}22` : "transparent",
                  border: `1px solid ${tab === t ? RED : "#1e3040"}`,
                  color: tab === t ? RED : "#445566",
                  borderRadius: 4, padding: "3px 10px",
                  fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                  letterSpacing: 1, cursor: "pointer",
                }}
              >{t}</button>
            ))}
          </div>

          {/* Risk rows */}
          {loading && displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              mapping risks against reports…
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              {tab === "NAKED" ? "No undocumented risks — all active risks have report coverage." : "No risks in this filter."}
            </div>
          ) : (
            displayed.map((risk) => {
              const sc = severityColor(risk.severity);
              const isOpen = expanded === risk.id;
              return (
                <div key={risk.id} style={{
                  background: "rgba(255,255,255,0.02)",
                  border: `1px solid ${isOpen ? `${RED}44` : "#1a2530"}`,
                  borderRadius: 6, padding: "8px 10px", marginBottom: 6,
                  cursor: "pointer",
                }} onClick={() => setExpanded(isOpen ? null : risk.id)}>
                  {/* Risk header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 7, color: sc, border: `1px solid ${sc}55`,
                      borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                      whiteSpace: "nowrap",
                    }}>{risk.severity > 0 ? `SEV ${risk.severity}` : "SEV —"}</span>
                    {risk.category && (
                      <span style={{
                        fontSize: 7, color: PURPLE, border: `1px solid ${PURPLE}44`,
                        borderRadius: 3, padding: "1px 5px", letterSpacing: 1, whiteSpace: "nowrap",
                      }}>{String(risk.category).toUpperCase()}</span>
                    )}
                    <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{risk.name}</span>
                    <span style={{
                      fontSize: 7,
                      color: risk.evidenced ? GREEN : RED,
                      border: `1px solid ${risk.evidenced ? GREEN : RED}44`,
                      borderRadius: 3, padding: "1px 5px", whiteSpace: "nowrap",
                    }}>
                      {risk.evidenced
                        ? `${risk.matched.length} report${risk.matched.length !== 1 ? "s" : ""}`
                        : "NAKED"}
                    </span>
                  </div>

                  {/* Description snippet */}
                  {risk.description && (
                    <div style={{ color: "#556677", fontSize: 8, lineHeight: 1.4, marginBottom: 4 }}>
                      {risk.description.slice(0, 120)}{risk.description.length > 120 ? "…" : ""}
                    </div>
                  )}

                  {/* Assess button */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 7, color: "#334455", flex: 1 }}>
                      {risk.tags.length > 0 && risk.tags.slice(0, 3).map((tag) => (
                        <span key={tag} style={{
                          marginRight: 4, border: "1px solid #223344",
                          borderRadius: 2, padding: "0 3px",
                        }}>{tag}</span>
                      ))}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); assessRisk(risk); }}
                      disabled={assessing === risk.id}
                      style={{
                        background: assessing === risk.id ? "#1a2530" : `${RED}18`,
                        color: assessing === risk.id ? "#445566" : RED,
                        border: `1px solid ${RED}44`,
                        borderRadius: 3, padding: "2px 8px",
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                        letterSpacing: 1, cursor: assessing === risk.id ? "default" : "pointer",
                      }}
                    >{assessing === risk.id ? "…assessing" : "▶ ASSESS"}</button>
                  </div>

                  {/* Expanded matched reports */}
                  {isOpen && risk.matched.length > 0 && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${RED}18` }}>
                      {risk.matched.map((rep) => (
                        <div key={rep.id} style={{
                          background: "rgba(255,255,255,0.02)",
                          border: "1px solid #1e3040",
                          borderRadius: 4, padding: "6px 8px", marginBottom: 4,
                          display: "flex", alignItems: "flex-start", gap: 8,
                        }}>
                          <div style={{
                            width: 24, height: 24, borderRadius: 4,
                            background: `${PURPLE}22`, border: `1px solid ${PURPLE}44`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 10, color: PURPLE, flexShrink: 0,
                          }}>📄</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ color: "#a0b8cc", fontSize: 10 }}>{rep.title}</div>
                            {rep.summary && (
                              <div style={{ color: "#445566", fontSize: 8, marginTop: 1 }}>
                                {rep.summary.slice(0, 100)}{rep.summary.length > 100 ? "…" : ""}
                              </div>
                            )}
                            <div style={{ color: "#334455", fontSize: 7, marginTop: 2 }}>
                              {[rep.type, rep.date].filter(Boolean).join(" · ")}
                            </div>
                          </div>
                          <div style={{ fontSize: 7, color: `${PURPLE}66`, whiteSpace: "nowrap" }}>
                            score {rep._score}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {isOpen && risk.matched.length === 0 && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #1a2530", color: RED, fontSize: 8 }}>
                      No reports found for this risk — documentation required.
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div style={{ marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right" }}>
            /entities/RiskSignal + /v1/reports · 5-min auto-refresh · click ▶ ASSESS for AI evidence-gap assessment
          </div>
        </div>
      )}
    </>
  );
}
