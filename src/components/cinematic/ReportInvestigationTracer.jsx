/**
 * ReportInvestigationTracer — F74.
 *
 * Parallel-fetches /v1/reports + /v1/investigations.
 * Keyword-correlates each investigation (title/description/subject)
 * against the report catalog (title/summary/category/tags) to surface:
 *   TRACED       — investigations with at least one matching report
 *   UNDOCUMENTED — investigations with no report coverage (documentation gap)
 *
 * Stat tiles: investigations / reports / traced / undocumented
 * Filter tabs: ALL / TRACED / UNDOCUMENTED + text search
 * Expand investigation → matched reports with relevance score + type badge.
 * Amber badge on undocumented count.
 * Click ▶ ASSESS on any investigation → /v1/jarvis/agent/chat AI
 *   2-sentence documentation-gap brief + TTS via jarvis:speak-dossier.
 * 5-min auto-refresh.
 *
 * Intent: "report investigation" / "undocumented cases" /
 *         "which investigations have reports" / "investigation reports" /
 *         "rinvt" / "report traceability"
 *   → jarvis:rinvt-toggle + TTS brief via buildRinvtScript()
 *
 * Toggle: ◈ RINVT at left:17740, zIndex 65.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED = "#FF3D5A";
const PURPLE = "#A78BFA";
const BTN_LEFT = 17740;
const REFRESH_MS = 5 * 60 * 1000;
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

function normaliseInvestigations(raw) {
  return normaliseArray(raw).map((inv) => ({
    id: inv.id || inv.case_id || String(Math.random()),
    title: inv.title || inv.name || inv.case_name || "Unnamed Case",
    description: inv.description || inv.summary || inv.details || "",
    status: (inv.status || "open").toLowerCase(),
    priority: inv.priority || inv.severity || "",
    subject: inv.subject || inv.target || inv.person_of_interest || "",
    lead: inv.lead || inv.assigned_to || inv.investigator || "",
    date: inv.date || inv.created_at || inv.opened_at || "",
  }));
}

function normaliseReports(raw) {
  return normaliseArray(raw).map((r) => ({
    id: r.id || r.report_id || String(Math.random()),
    title: r.title || r.name || r.report_name || "Untitled Report",
    summary: r.summary || r.description || r.abstract || "",
    category: r.category || r.type || r.report_type || "",
    tags: [...(r.tags || []), ...(r.keywords || [])].map(String),
    date: r.date || r.created_at || r.published_at || "",
    author: r.author || r.created_by || "",
  }));
}

function keywords(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function reportMatchScore(report, inv) {
  const invText =
    `${inv.title} ${inv.description} ${inv.subject} ${inv.lead}`.toLowerCase();
  const reportWords = [
    ...keywords(report.title),
    ...keywords(report.summary),
    ...keywords(report.category),
    ...report.tags.flatMap(keywords),
  ];
  return reportWords.reduce(
    (acc, w) => acc + (invText.includes(w) ? 1 : 0),
    0
  );
}

function correlate(investigations, reports) {
  return investigations.map((inv) => {
    const matched = reports
      .map((r) => ({ ...r, _score: reportMatchScore(r, inv) }))
      .filter((r) => r._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    return { ...inv, matched };
  });
}

function statusColor(status) {
  if (status === "open") return RED;
  if (status === "in-progress" || status === "in_progress") return AMBER;
  if (status === "pending") return PURPLE;
  return "#445566";
}

function priorityColor(p) {
  const lp = String(p).toLowerCase();
  if (lp === "critical") return RED;
  if (lp === "high") return AMBER;
  if (lp === "medium") return CY;
  return "#445566";
}

// ─── exported intent helpers (consumed by JarvisBrain) ──────────────────────

const RINVT_RE =
  /report.{0,20}invest|invest.{0,20}report|undocument|which\s+invest.{0,10}report|report\s+tracea|investigation\s+report|rinvt\b/i;

export function isRinvtQuery(q) {
  return RINVT_RE.test(q || "");
}

export async function buildRinvtScript() {
  try {
    const [reportRaw, invRaw] = await Promise.all([
      fetch(`${apiBase()}/v1/reports`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
      fetch(`${apiBase()}/v1/investigations`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
    ]);
    const reports = normaliseReports(reportRaw);
    const investigations = normaliseInvestigations(invRaw);
    const correlated = correlate(investigations, reports);
    const traced = correlated.filter((inv) => inv.matched.length > 0);
    const undocumented = correlated.filter((inv) => inv.matched.length === 0);
    const openUndocumented = undocumented.filter(
      (inv) =>
        inv.status === "open" ||
        inv.status === "in-progress" ||
        inv.status === "in_progress"
    );
    return `Report-investigation tracer active, sir. ${reports.length} report${reports.length !== 1 ? "s" : ""} cross-referenced against ${investigations.length} case${investigations.length !== 1 ? "s" : ""}. ${traced.length} investigation${traced.length !== 1 ? "s have" : " has"} documented report coverage. ${undocumented.length} case${undocumented.length !== 1 ? "s remain" : " remains"} undocumented${openUndocumented.length > 0 ? `, including ${openUndocumented.length} currently open or active` : ""}. Select a case to review report traceability.`;
  } catch (_) {
    return "Report-investigation tracer is standing by, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function ReportInvestigationTracer() {
  const [visible, setVisible] = useState(false);
  const [reports, setReports] = useState([]);
  const [investigations, setInvestigations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("UNDOCUMENTED");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [reportRaw, invRaw] = await Promise.all([
        fetch(`${apiBase()}/v1/reports`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
        fetch(`${apiBase()}/v1/investigations`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
      ]);
      setReports(normaliseReports(reportRaw));
      setInvestigations(normaliseInvestigations(invRaw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:rinvt-toggle", onToggle);
    return () => window.removeEventListener("jarvis:rinvt-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) {
      clearInterval(pollRef.current);
      return;
    }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assessInvestigation(inv) {
    setAssessing(inv.id);
    const reportTitles =
      inv.matched.length > 0
        ? inv.matched
            .map((r) => `"${r.title}"${r.category ? ` (${r.category})` : ""}`)
            .join(", ")
        : "none";
    const prompt = `As JARVIS, provide a 2-sentence assessment of the documentation coverage for the investigation "${inv.title}". ${inv.matched.length > 0 ? `Matched reports: ${reportTitles}. Assess how well these reports support the investigation.` : "This investigation has no matched reports in the system. Assess the documentation gap and recommend what report types should be created."}`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Insufficient report data available for traceability assessment, sir.";
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } })
      );
    } catch (_) {
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", {
          detail: { text: "Assessment unavailable at this time, sir." },
        })
      );
    }
    setAssessing(null);
  }

  const correlated = correlate(investigations, reports);
  const traced = correlated.filter((inv) => inv.matched.length > 0);
  const undocumented = correlated.filter((inv) => inv.matched.length === 0);

  const baseList =
    tab === "TRACED"
      ? traced
      : tab === "UNDOCUMENTED"
      ? undocumented
      : correlated;

  const displayed = search
    ? baseList.filter((inv) =>
        `${inv.title} ${inv.description} ${inv.subject}`.toLowerCase().includes(search.toLowerCase())
      )
    : baseList;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Report-Investigation Tracer (F74)"
        style={{
          position: "fixed",
          bottom: 6,
          left: BTN_LEFT,
          zIndex: 65,
          background: visible ? `${CY}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? CY : CY}44`,
          color: visible ? CY : `${CY}99`,
          borderRadius: 4,
          padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 8,
          letterSpacing: 1,
          cursor: "pointer",
          whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ RINVT
        {undocumented.length > 0 && (
          <span
            style={{
              marginLeft: 4,
              background: AMBER,
              color: "#04060A",
              borderRadius: 3,
              padding: "0 4px",
              fontSize: 7,
              fontWeight: "bold",
            }}
          >
            {undocumented.length}
          </span>
        )}
      </button>

      {visible && (
        <div
          style={{
            position: "fixed",
            bottom: 32,
            left: BTN_LEFT - 280,
            zIndex: 65,
            width: 560,
            maxHeight: "70vh",
            overflowY: "auto",
            background: "rgba(6,11,18,0.93)",
            border: `1px solid ${CY}44`,
            borderRadius: 10,
            padding: "14px 16px",
            fontFamily: "'JetBrains Mono',monospace",
            color: "#DCEBF5",
            backdropFilter: "blur(12px)",
            boxShadow: `0 0 60px ${CY}18`,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 10,
            }}
          >
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>
              ◈ REPORT-INVESTIGATION TRACER
            </span>
            <button
              onClick={fetchData}
              style={{
                marginLeft: "auto",
                background: "transparent",
                border: `1px solid ${CY}33`,
                borderRadius: 3,
                color: `${CY}88`,
                padding: "2px 6px",
                fontSize: 7,
                cursor: "pointer",
                letterSpacing: 1,
              }}
            >
              ↻ REFRESH
            </button>
            <button
              onClick={() => setVisible(false)}
              style={{
                background: "transparent",
                border: "none",
                color: "#445566",
                cursor: "pointer",
                fontSize: 14,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>

          {/* Stat tiles */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4,1fr)",
              gap: 6,
              marginBottom: 10,
            }}
          >
            {[
              ["INVESTIGATIONS", investigations.length, CY],
              ["REPORTS", reports.length, PURPLE],
              ["TRACED", traced.length, GREEN],
              ["UNDOCUMENTED", undocumented.length, AMBER],
            ].map(([label, val, col]) => (
              <div
                key={label}
                style={{
                  background: `${col}0d`,
                  border: `1px solid ${col}33`,
                  borderRadius: 5,
                  padding: "6px 8px",
                  textAlign: "center",
                }}
              >
                <div
                  style={{ color: col, fontSize: 16, fontWeight: "bold" }}
                >
                  {loading ? "…" : val}
                </div>
                <div
                  style={{
                    color: "#445566",
                    fontSize: 8,
                    letterSpacing: 1,
                    marginTop: 2,
                  }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div
            style={{
              display: "flex",
              gap: 4,
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            {["ALL", "TRACED", "UNDOCUMENTED"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "transparent",
                  border: `1px solid ${tab === t ? CY : "#1e3040"}`,
                  color: tab === t ? CY : "#445566",
                  borderRadius: 4,
                  padding: "3px 10px",
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: 8,
                  letterSpacing: 1,
                  cursor: "pointer",
                }}
              >
                {t}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                marginLeft: "auto",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid #1e3040",
                borderRadius: 4,
                color: "#a0b8cc",
                padding: "3px 8px",
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 8,
                outline: "none",
                width: 120,
              }}
            />
          </div>

          {/* Investigation rows */}
          {loading && displayed.length === 0 ? (
            <div
              style={{
                color: "#445566",
                fontSize: 10,
                textAlign: "center",
                padding: "20px 0",
              }}
            >
              cross-referencing reports against investigations…
            </div>
          ) : displayed.length === 0 ? (
            <div
              style={{
                color: "#445566",
                fontSize: 10,
                textAlign: "center",
                padding: "20px 0",
              }}
            >
              {tab === "UNDOCUMENTED"
                ? "All investigations have report coverage."
                : "No investigations match this filter."}
            </div>
          ) : (
            displayed.map((inv) => {
              const sc = statusColor(inv.status);
              const pc = priorityColor(inv.priority);
              const isOpen = expanded === inv.id;
              const hasReports = inv.matched.length > 0;
              return (
                <div
                  key={inv.id}
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: `1px solid ${isOpen ? `${CY}44` : "#1a2530"}`,
                    borderRadius: 6,
                    padding: "8px 10px",
                    marginBottom: 6,
                    cursor: "pointer",
                  }}
                  onClick={() => setExpanded(isOpen ? null : inv.id)}
                >
                  {/* Investigation header */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 7,
                        color: sc,
                        border: `1px solid ${sc}55`,
                        borderRadius: 3,
                        padding: "1px 5px",
                        letterSpacing: 1,
                        whiteSpace: "nowrap",
                        textTransform: "uppercase",
                      }}
                    >
                      {inv.status}
                    </span>
                    {inv.priority && (
                      <span
                        style={{
                          fontSize: 7,
                          color: pc,
                          border: `1px solid ${pc}44`,
                          borderRadius: 3,
                          padding: "1px 5px",
                          letterSpacing: 1,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {String(inv.priority).toUpperCase()}
                      </span>
                    )}
                    <span
                      style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}
                    >
                      {inv.title}
                    </span>
                    <span
                      style={{
                        fontSize: 7,
                        color: hasReports ? GREEN : AMBER,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {hasReports
                        ? `${inv.matched.length} report${inv.matched.length !== 1 ? "s" : ""}`
                        : "no reports"}
                    </span>
                  </div>

                  {/* Description snippet */}
                  {inv.description && (
                    <div
                      style={{
                        color: "#556677",
                        fontSize: 8,
                        lineHeight: 1.4,
                        marginBottom: 4,
                      }}
                    >
                      {inv.description.slice(0, 120)}
                      {inv.description.length > 120 ? "…" : ""}
                    </div>
                  )}

                  {/* Assess button */}
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <span
                      style={{ fontSize: 7, color: "#334455", flex: 1 }}
                    >
                      {inv.lead && `Lead: ${inv.lead}`}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        assessInvestigation(inv);
                      }}
                      disabled={assessing === inv.id}
                      style={{
                        background:
                          assessing === inv.id ? "#1a2530" : `${CY}18`,
                        color: assessing === inv.id ? "#445566" : CY,
                        border: `1px solid ${CY}44`,
                        borderRadius: 3,
                        padding: "2px 8px",
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: 7,
                        letterSpacing: 1,
                        cursor:
                          assessing === inv.id ? "default" : "pointer",
                      }}
                    >
                      {assessing === inv.id ? "…assessing" : "▶ ASSESS"}
                    </button>
                  </div>

                  {/* Expanded report list */}
                  {isOpen && hasReports && (
                    <div
                      style={{
                        marginTop: 8,
                        paddingTop: 8,
                        borderTop: `1px solid ${CY}18`,
                      }}
                    >
                      {inv.matched.map((report) => (
                        <div
                          key={report.id}
                          style={{
                            background: "rgba(255,255,255,0.02)",
                            border: "1px solid #1e3040",
                            borderRadius: 4,
                            padding: "6px 8px",
                            marginBottom: 4,
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 8,
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div
                              style={{ color: "#a0b8cc", fontSize: 10 }}
                            >
                              {report.title}
                            </div>
                            {report.category && (
                              <div
                                style={{
                                  marginTop: 2,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 7,
                                    color: PURPLE,
                                    border: "1px solid #A78BFA33",
                                    borderRadius: 2,
                                    padding: "1px 4px",
                                  }}
                                >
                                  {report.category}
                                </span>
                              </div>
                            )}
                            {report.summary && (
                              <div
                                style={{
                                  color: "#445566",
                                  fontSize: 8,
                                  lineHeight: 1.4,
                                  marginTop: 3,
                                }}
                              >
                                {report.summary.slice(0, 100)}
                                {report.summary.length > 100 ? "…" : ""}
                              </div>
                            )}
                            {report.tags.length > 0 && (
                              <div
                                style={{
                                  display: "flex",
                                  gap: 4,
                                  flexWrap: "wrap",
                                  marginTop: 3,
                                }}
                              >
                                {report.tags.slice(0, 4).map((tag) => (
                                  <span
                                    key={tag}
                                    style={{
                                      fontSize: 7,
                                      color: `${CY}88`,
                                      border: `1px solid ${CY}22`,
                                      borderRadius: 2,
                                      padding: "1px 4px",
                                    }}
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: 7,
                              color: `${GREEN}aa`,
                              whiteSpace: "nowrap",
                            }}
                          >
                            score {report._score}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {isOpen && !hasReports && (
                    <div
                      style={{
                        marginTop: 8,
                        paddingTop: 8,
                        borderTop: "1px solid #1a2530",
                        color: AMBER,
                        fontSize: 8,
                      }}
                    >
                      ⚠ No matching reports found — this investigation is
                      undocumented.
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div
            style={{
              marginTop: 8,
              color: "#223344",
              fontSize: 7,
              textAlign: "right",
            }}
          >
            /v1/reports + /v1/investigations · 5-min auto-refresh · click ▶
            ASSESS for AI documentation-gap brief
          </div>
        </div>
      )}
    </>
  );
}
