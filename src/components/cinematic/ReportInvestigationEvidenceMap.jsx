/**
 * ReportInvestigationEvidenceMap — F308
 * Fetches /v1/reports + /v1/investigations and keyword-matches each report
 * against open investigation titles/descriptions.
 * Reports that match at least one investigation are LINKED; others are UNLINKED.
 * Stat tiles: reports / linked / unlinked / investigations.
 * Unlinked count amber-pulses when ≥ 1.
 * Expandable rows show matched investigations with status badge.
 * Filter tabs: ALL / LINKED / UNLINKED.
 * Text search on report title.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS.
 * ◈ RIEVMAP toggle (left:62920, bottom:8, zIndex:121).
 * Voice: "report evidence"/"evidence map"/"report cases"/"rievmap"/"investigation reports".
 * jarvis:report-inv-evidence-toggle event.
 * 90-s auto-refresh.
 * Additive-only — no edits to CinematicShell/CinematicHome/JarvisLoader.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const GR = "#00FF9F";
const AM = "#FFB800";
const RD = "#FF4444";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";
const POLL_MS = 90_000;

const RIEVMAP_RE =
  /\breport.?evidence\b|\bevidence.?map\b|\breport.?cases?\b|\brievmap\b|\binvestigation.?report\b|\breport.?investigation\b|\bevidence.?coverage\b|\breport.?case.?link\b|\bcase.?evidence\b/i;

export function isReportInvEvidenceQuery(text) {
  return RIEVMAP_RE.test(text || "");
}

const TAG = {
  background: "rgba(0,0,0,0.75)",
  border: `1px solid ${CY}33`,
  borderRadius: 6,
  padding: "2px 7px",
  fontSize: 10,
  color: CY,
};
const STAT_BOX = {
  background: "rgba(0,0,0,0.55)",
  border: `1px solid ${CY}33`,
  borderRadius: 8,
  padding: "10px 16px",
  minWidth: 78,
  textAlign: "center",
};

const STATUS_COLORS = {
  open: GR,
  active: GR,
  closed: "#666",
  resolved: "#666",
  pending: AM,
  "in_progress": CY,
};

function statusColor(s) {
  return STATUS_COLORS[(s || "").toLowerCase()] || "#888";
}

function tokenize(str) {
  return (str || "")
    .toLowerCase()
    .split(/[\s\-_\/,.;:()[\]{}]+/)
    .filter((t) => t.length >= 3);
}

function matchScore(reportTokens, targetStr) {
  const targetTokens = tokenize(targetStr);
  return reportTokens.filter((t) => targetTokens.includes(t)).length;
}

async function fetchReports(base, headers) {
  const res = await fetch(`${base}/v1/reports`, { headers });
  if (!res.ok) return [];
  const d = await res.json();
  return Array.isArray(d)
    ? d
    : d.reports || d.items || d.data || Object.values(d) || [];
}

async function fetchInvestigations(base, headers) {
  const res = await fetch(`${base}/v1/investigations`, { headers });
  if (!res.ok) return [];
  const d = await res.json();
  return Array.isArray(d)
    ? d
    : d.investigations || d.items || d.data || [];
}

function buildMappings(reports, investigations) {
  return reports.map((report) => {
    const reportName =
      report.title || report.name || report.subject || report.id || "?";
    const reportDesc = report.description || report.summary || report.content || "";
    const reportTokens = tokenize(reportName + " " + reportDesc);

    const matchedInvestigations = investigations
      .filter((inv) => {
        const invStr =
          (inv.title || inv.name || "") +
          " " +
          (inv.description || inv.summary || "") +
          " " +
          (inv.tags || "");
        return matchScore(reportTokens, invStr) > 0;
      })
      .map((inv) => ({
        id: inv.id || inv._id || "",
        title: inv.title || inv.name || "Unnamed",
        status: inv.status || "unknown",
        type: inv.type || inv.category || "",
      }));

    const linked = matchedInvestigations.length > 0;
    return { report, reportName, reportDesc, matchedInvestigations, linked };
  });
}

export async function buildReportInvEvidenceScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [reports, investigations] = await Promise.all([
    fetchReports(base, headers).catch(() => []),
    fetchInvestigations(base, headers).catch(() => []),
  ]);
  if (!reports.length) return "No report data available, sir.";
  const mappings = buildMappings(reports, investigations);
  const linked = mappings.filter((m) => m.linked).length;
  const unlinked = mappings.length - linked;
  const topUnlinked = mappings
    .filter((m) => !m.linked)
    .slice(0, 3)
    .map((m) => m.reportName)
    .join(", ");
  if (unlinked === 0)
    return `All ${reports.length} reports are linked to at least one open investigation. ${investigations.length} investigations indexed. Evidence coverage is complete.`;
  return (
    `Report-investigation evidence map: ${reports.length} reports — ${linked} linked, ${unlinked} unlinked. ` +
    `${investigations.length} investigations available. ` +
    `Unlinked reports: ${topUnlinked || "none"}.`
  );
}

export default function ReportInvestigationEvidenceMap() {
  const [open, setOpen] = useState(false);
  const [mappings, setMappings] = useState([]);
  const [invCount, setInvCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState("");
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState({});
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const base = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [reports, investigations] = await Promise.all([
        fetchReports(base, headers).catch(() => []),
        fetchInvestigations(base, headers).catch(() => []),
      ]);
      setInvCount(investigations.length);
      setMappings(buildMappings(reports, investigations));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("jarvis:report-inv-evidence-toggle", handler);
    return () =>
      window.removeEventListener("jarvis:report-inv-evidence-toggle", handler);
  }, []);

  const linked = mappings.filter((m) => m.linked).length;
  const unlinked = mappings.length - linked;

  const filtered = mappings
    .filter((m) => {
      if (tab === "LINKED") return m.linked;
      if (tab === "UNLINKED") return !m.linked;
      return true;
    })
    .filter((m) => {
      if (!search) return true;
      return m.reportName.toLowerCase().includes(search.toLowerCase());
    });

  async function handleAssess() {
    setAssessing(true);
    setAssessText("");
    try {
      const base = apiBase();
      const prompt =
        `Report-investigation evidence map: ${mappings.length} reports — ${linked} linked to investigations, ${unlinked} unlinked. ` +
        `${invCount} total investigations. ` +
        `Summarize the evidence coverage and recommend the top action in 2 sentences.`;
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: prompt }),
      });
      if (res.ok) {
        const d = await res.json();
        const txt = d.response || d.message || d.content || "";
        setAssessText(txt);
        window.dispatchEvent(
          new CustomEvent("jarvis:speak", { detail: { text: txt } })
        );
      } else {
        setAssessText("Assessment unavailable at this time.");
      }
    } catch {
      setAssessText("Assessment failed.");
    } finally {
      setAssessing(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed",
          bottom: 8,
          left: 62920,
          zIndex: 121,
          background: open ? `${CY}22` : "rgba(0,0,0,0.7)",
          border: `1px solid ${unlinked > 0 ? AM + "88" : CY + "55"}`,
          borderRadius: 6,
          color: unlinked > 0 ? AM : CY,
          fontSize: 10,
          padding: "3px 8px",
          cursor: "pointer",
          fontFamily: "monospace",
          letterSpacing: 1,
          whiteSpace: "nowrap",
          animation:
            unlinked > 0 ? "rievmap-pulse 2.2s ease-in-out infinite" : "none",
        }}
        title="Reports × Investigation Evidence Map"
      >
        ◈ RIEVMAP{unlinked > 0 ? ` [${unlinked}]` : ""}
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            top: 40,
            right: 16,
            width: 600,
            maxHeight: "82vh",
            background: "rgba(5,10,18,0.97)",
            border: `1px solid ${CY}55`,
            borderRadius: 12,
            zIndex: 9200,
            display: "flex",
            flexDirection: "column",
            fontFamily: "monospace",
            color: CY,
            boxShadow: `0 0 40px ${CY}22`,
            overflow: "hidden",
          }}
        >
          {/* header */}
          <div
            style={{
              padding: "12px 16px 8px",
              borderBottom: `1px solid ${CY}22`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 12, letterSpacing: 2 }}>
              ◈ REPORTS × INVESTIGATION EVIDENCE MAP
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none",
                border: "none",
                color: CY,
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* stat tiles */}
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: "10px 16px",
              borderBottom: `1px solid ${CY}11`,
              flexWrap: "wrap",
            }}
          >
            {[
              { label: "REPORTS", val: mappings.length, col: CY },
              { label: "LINKED", val: linked, col: GR },
              {
                label: "UNLINKED",
                val: unlinked,
                col: unlinked > 0 ? AM : "#444",
              },
              { label: "INVESTIGATIONS", val: invCount, col: "#AA88FF" },
            ].map(({ label, val, col }) => (
              <div key={label} style={{ ...STAT_BOX, borderColor: col + "44" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: col }}>
                  {val}
                </div>
                <div
                  style={{ fontSize: 9, color: col + "aa", letterSpacing: 1 }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* filter + search */}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "8px 16px",
              alignItems: "center",
              borderBottom: `1px solid ${CY}11`,
              flexWrap: "wrap",
            }}
          >
            {["ALL", "LINKED", "UNLINKED"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "rgba(0,0,0,0.5)",
                  border: `1px solid ${tab === t ? CY : CY + "44"}`,
                  borderRadius: 4,
                  color: tab === t ? CY : CY + "88",
                  fontSize: 9,
                  padding: "2px 8px",
                  cursor: "pointer",
                  letterSpacing: 1,
                }}
              >
                {t}
                {t === "LINKED" && linked > 0 && (
                  <span style={{ marginLeft: 4, color: GR }}>{linked}</span>
                )}
                {t === "UNLINKED" && unlinked > 0 && (
                  <span style={{ marginLeft: 4, color: AM }}>{unlinked}</span>
                )}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search reports…"
              style={{
                marginLeft: "auto",
                background: "rgba(0,0,0,0.4)",
                border: `1px solid ${CY}33`,
                borderRadius: 4,
                color: CY,
                fontSize: 10,
                padding: "3px 8px",
                outline: "none",
                fontFamily: "monospace",
                width: 160,
              }}
            />
          </div>

          {/* rows */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 0" }}>
            {loading && (
              <div
                style={{
                  padding: "16px",
                  color: CY + "88",
                  fontSize: 11,
                  textAlign: "center",
                }}
              >
                loading…
              </div>
            )}
            {err && (
              <div style={{ padding: "10px 16px", color: RD, fontSize: 10 }}>
                {err}
              </div>
            )}
            {!loading && !err && filtered.length === 0 && (
              <div
                style={{
                  padding: "16px",
                  color: CY + "55",
                  fontSize: 11,
                  textAlign: "center",
                }}
              >
                no reports match
              </div>
            )}
            {filtered.map((m, i) => {
              const key =
                m.report?.id || m.report?.title || m.reportName || i;
              const isExp = !!expanded[key];
              const linkCol = m.linked ? GR : AM;
              const reportType =
                m.report?.type || m.report?.category || m.report?.format || "";
              return (
                <div
                  key={key}
                  style={{
                    borderBottom: `1px solid ${CY}11`,
                    padding: "7px 16px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      cursor: "pointer",
                    }}
                    onClick={() =>
                      setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
                    }
                  >
                    <span
                      style={{
                        ...TAG,
                        borderColor: linkCol + "55",
                        color: linkCol,
                        fontSize: 9,
                        minWidth: 58,
                        textAlign: "center",
                        letterSpacing: 1,
                      }}
                    >
                      {m.linked ? "LINKED" : "UNLINKED"}
                    </span>
                    <span
                      style={{ fontSize: 11, flex: 1, color: "#DCEBF5" }}
                    >
                      {m.reportName}
                    </span>
                    {reportType && (
                      <span
                        style={{
                          ...TAG,
                          fontSize: 8,
                          color: "#AA88FF",
                          borderColor: "#AA88FF44",
                        }}
                      >
                        {reportType}
                      </span>
                    )}
                    <span style={{ fontSize: 9, color: CY + "55" }}>
                      {m.matchedInvestigations.length} inv
                    </span>
                    <span style={{ fontSize: 10, color: CY + "55" }}>
                      {isExp ? "▲" : "▼"}
                    </span>
                  </div>
                  {m.reportDesc && (
                    <div
                      style={{
                        fontSize: 9,
                        color: CY + "66",
                        marginTop: 3,
                        paddingLeft: 68,
                      }}
                    >
                      {m.reportDesc.slice(0, 100)}
                      {m.reportDesc.length > 100 ? "…" : ""}
                    </div>
                  )}
                  {isExp && (
                    <div
                      style={{
                        marginTop: 6,
                        paddingLeft: 68,
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      {m.matchedInvestigations.length > 0 ? (
                        <>
                          <div
                            style={{
                              fontSize: 9,
                              color: "#AA88FF",
                              letterSpacing: 1,
                              marginBottom: 3,
                            }}
                          >
                            INVESTIGATIONS ({m.matchedInvestigations.length})
                          </div>
                          {m.matchedInvestigations.slice(0, 6).map(
                            (inv, ii) => (
                              <div
                                key={ii}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                  fontSize: 10,
                                  color: "#DCEBF5",
                                }}
                              >
                                <span
                                  style={{
                                    ...TAG,
                                    fontSize: 8,
                                    color: statusColor(inv.status),
                                    borderColor:
                                      statusColor(inv.status) + "44",
                                    minWidth: 52,
                                    textAlign: "center",
                                  }}
                                >
                                  {(inv.status || "unknown").toUpperCase()}
                                </span>
                                <span style={{ flex: 1 }}>{inv.title}</span>
                                {inv.type && (
                                  <span
                                    style={{
                                      fontSize: 8,
                                      color: CY + "66",
                                    }}
                                  >
                                    {inv.type}
                                  </span>
                                )}
                              </div>
                            )
                          )}
                          {m.matchedInvestigations.length > 6 && (
                            <div
                              style={{ fontSize: 9, color: CY + "55" }}
                            >
                              +{m.matchedInvestigations.length - 6} more…
                            </div>
                          )}
                        </>
                      ) : (
                        <div
                          style={{
                            fontSize: 9,
                            color: AM + "aa",
                            fontStyle: "italic",
                          }}
                        >
                          No matching investigations found for this report.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* footer */}
          <div
            style={{
              padding: "8px 16px",
              borderTop: `1px solid ${CY}22`,
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={handleAssess}
              disabled={assessing || !mappings.length}
              style={{
                background: assessing ? `${CY}11` : `${CY}22`,
                border: `1px solid ${CY}55`,
                borderRadius: 5,
                color: CY,
                fontSize: 10,
                padding: "4px 12px",
                cursor: assessing ? "default" : "pointer",
                letterSpacing: 1,
                opacity: !mappings.length ? 0.4 : 1,
              }}
            >
              {assessing ? "▶ assessing…" : "▶ ASSESS"}
            </button>
            <button
              onClick={load}
              disabled={loading}
              style={{
                background: "rgba(0,0,0,0.4)",
                border: `1px solid ${CY}33`,
                borderRadius: 5,
                color: CY + "88",
                fontSize: 10,
                padding: "4px 10px",
                cursor: "pointer",
                letterSpacing: 1,
              }}
            >
              ↺
            </button>
            {assessText && (
              <div
                style={{
                  fontSize: 10,
                  color: GR,
                  flex: 1,
                  lineHeight: 1.4,
                }}
              >
                {assessText}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes rievmap-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
      `}</style>
    </>
  );
}
