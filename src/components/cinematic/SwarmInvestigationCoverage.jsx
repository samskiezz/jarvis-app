/**
 * SwarmInvestigationCoverage — F55.
 *
 * Parallel-fetches /entities/SwarmJob + /v1/investigations and
 * keyword-correlates active/running swarm jobs against open investigation
 * cases to show which cases have automated swarm coverage and which are
 * flying blind (no active jobs).
 *
 * Stat tiles: active jobs / open cases / covered / uncovered.
 * Filter tabs: ALL / COVERED / UNCOVERED.
 * Left pane: investigation list with green/red coverage dot.
 * Right pane: matched swarm jobs for selected case + ▶ ASSESS AI brief.
 *
 * Toggle: ⬡ ICOV at left:5620, bottom:8, zIndex 65.
 * Event:  jarvis:swinv-toggle
 * Voice:  "investigation coverage" / "case coverage" / "swarm investigation"
 *         / "swinv" / "which cases have coverage"
 * AI:     /v1/jarvis/agent/chat per-case assessment → jarvis:speak-dossier TTS.
 * Refresh: 60s auto-refresh while panel open.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const GREEN  = "#00c878";
const AMBER  = "#F5A623";
const RED    = "#FF3D5A";
const VIOLET = "#A78BFA";
const BTN_LEFT = 5620;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isSwarmInvCoverageQuery(q) {
  return /swarm.{0,20}invest|invest.{0,20}(cover|swarm)|case\s+(cover|support)|swinv\b|investigat.{0,15}(cover|automat|support)|which\s+cases?\s+have\s+cover/i.test(
    q || ""
  );
}

export async function buildSwarmInvCoverageScript() {
  try {
    const [jr, ir] = await Promise.all([
      fetch(`${apiBase()}/entities/SwarmJob`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
      fetch(`${apiBase()}/v1/investigations`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    const jobs  = normaliseArray(jr.ok ? await jr.json() : []);
    const cases = normaliseInvestigations(ir.ok ? await ir.json() : []);
    const activeJobs = jobs.filter((j) =>
      ["running", "active", "in_progress", "queued"].includes(
        (j.status || "").toLowerCase()
      )
    );
    const openCases = cases.filter(
      (c) => !["closed", "resolved", "archived"].includes((c.status || "").toLowerCase())
    );
    const { covered } = buildCoverage(activeJobs, openCases);
    const uncovered   = openCases.length - covered.size;
    window.dispatchEvent(new CustomEvent("jarvis:swinv-toggle"));
    if (!openCases.length)
      return "No open investigation cases on record, sir. The case board is clear.";
    return `Swarm-investigation coverage map active, sir. ${activeJobs.length} active swarm job${activeJobs.length !== 1 ? "s" : ""} cross-referenced against ${openCases.length} open case${openCases.length !== 1 ? "s" : ""}. ${covered.size} case${covered.size !== 1 ? "s" : ""} have active swarm job support. ${uncovered} case${uncovered !== 1 ? "s" : ""} ${uncovered !== 1 ? "are" : "is"} running without automated coverage and may require manual resourcing.`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:swinv-toggle"));
    return "Swarm-investigation coverage panel open, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function SwarmInvestigationCoverage() {
  const [visible,     setVisible]     = useState(false);
  const [jobs,        setJobs]        = useState([]);
  const [cases,       setCases]       = useState([]);
  const [coverageMap, setCoverageMap] = useState({ covered: new Set(), pairs: [] });
  const [loading,     setLoading]     = useState(false);
  const [selected,    setSelected]    = useState(null);
  const [aiMap,       setAiMap]       = useState({});
  const [aiLoading,   setAiLoading]   = useState(null);
  const [filter,      setFilter]      = useState("all");
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [jr, ir] = await Promise.all([
        fetch(`${apiBase()}/entities/SwarmJob`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
        fetch(`${apiBase()}/v1/investigations`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
      ]);
      const rawJobs  = normaliseArray(jr.ok ? await jr.json() : []);
      const rawCases = normaliseInvestigations(ir.ok ? await ir.json() : []);
      setJobs(rawJobs);
      setCases(rawCases);
      setCoverageMap(buildCoverage(rawJobs, rawCases));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:swinv-toggle", onToggle);
    return () => window.removeEventListener("jarvis:swinv-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, 60_000);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function getAiAssessment(inv, matchedJobs) {
    const cid = inv.id || inv._id || inv.title || inv.name;
    if (aiMap[cid] || aiLoading === cid) return;
    setAiLoading(cid);
    const caseTitle = inv.title || inv.name || inv.description || "Investigation";
    const jobNames  = matchedJobs.map((j) => j.name || j.title || j.id || "Job").join(", ");
    const hasCover  = matchedJobs.length > 0;
    const prompt = hasCover
      ? `As JARVIS, provide a 2-sentence operational assessment of investigation case "${caseTitle}". Currently ${matchedJobs.length} swarm job${matchedJobs.length !== 1 ? "s" : ""} support it: ${jobNames}. Evaluate whether coverage is adequate and what gaps remain.`
      : `As JARVIS, provide a 2-sentence operational assessment of investigation case "${caseTitle}" (status: ${inv.status || "open"}), which currently has NO active swarm job coverage. Recommend an appropriate automated response action.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAiMap((prev) => ({ ...prev, [cid]: answer }));
      if (answer)
        window.dispatchEvent(
          new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } })
        );
    } catch (_) {
      setAiMap((prev) => ({ ...prev, [cid]: "Unable to reach reasoning core." }));
    } finally {
      setAiLoading(null);
    }
  }

  const activeJobs  = jobs.filter((j) =>
    ["running", "active", "in_progress", "queued"].includes((j.status || "").toLowerCase())
  );
  const openCases   = cases.filter(
    (c) => !["closed", "resolved", "archived"].includes((c.status || "").toLowerCase())
  );
  const uncoveredCount = openCases.length - coverageMap.covered.size;

  const filteredCases =
    filter === "covered"
      ? openCases.filter((c) => coverageMap.covered.has(c.id || c._id || c.title || c.name))
      : filter === "uncovered"
      ? openCases.filter((c) => !coverageMap.covered.has(c.id || c._id || c.title || c.name))
      : openCases;

  const selectedJobMatches = selected
    ? coverageMap.pairs
        .filter((p) => p.caseId === (selected.id || selected._id || selected.title || selected.name))
        .map((p) => p.job)
    : [];

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Swarm-Investigation Coverage"
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 65,
          height: 26,
          padding: "0 8px",
          background: visible ? `${CY}22` : "rgba(8,14,22,0.82)",
          border: `1px solid ${visible ? CY : "#2A3A4A"}`,
          borderRadius: 5,
          color: visible ? CY : "#6E8AA0",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          letterSpacing: 1,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {uncoveredCount > 0 && !visible && (
          <span
            style={{
              display: "inline-block",
              marginRight: 5,
              background: RED,
              color: "#fff",
              borderRadius: "50%",
              width: 14,
              height: 14,
              fontSize: 9,
              lineHeight: "14px",
              textAlign: "center",
            }}
          >
            {uncoveredCount}
          </span>
        )}
        ⬡ ICOV
      </button>

      {/* Panel */}
      {visible && (
        <div
          style={{
            position: "fixed",
            bottom: 44,
            left: Math.min(BTN_LEFT, window.innerWidth - 660),
            zIndex: 65,
            width: 640,
            maxHeight: "75vh",
            display: "flex",
            flexDirection: "column",
            background: "rgba(4,10,18,0.96)",
            border: `1px solid ${CY}44`,
            borderTop: `2px solid ${CY}`,
            borderRadius: 12,
            boxShadow: `0 0 40px ${CY}14, 0 8px 32px rgba(0,0,0,0.75)`,
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
              borderBottom: `1px solid ${CY}22`,
              flexShrink: 0,
            }}
          >
            <span style={{ color: CY, fontSize: 13 }}>⬡</span>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              SWARM–INVESTIGATION COVERAGE
            </span>
            {loading && (
              <span style={{ marginLeft: "auto", color: "#6E8AA0", fontSize: 10 }}>
                loading…
              </span>
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
              { label: "ACTIVE JOBS",  val: activeJobs.length,         col: VIOLET },
              { label: "OPEN CASES",   val: openCases.length,          col: AMBER  },
              { label: "COVERED",      val: coverageMap.covered.size,  col: GREEN  },
              { label: "UNCOVERED",    val: uncoveredCount,            col: RED    },
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

          {/* Filter tabs */}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "7px 14px",
              borderBottom: `1px solid #1A2A3A`,
              flexShrink: 0,
            }}
          >
            {["all", "covered", "uncovered"].map((f) => (
              <button
                key={f}
                onClick={() => { setFilter(f); setSelected(null); }}
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  border: `1px solid ${filter === f ? CY : "#2A3A4A"}`,
                  background: filter === f ? `${CY}22` : "transparent",
                  color: filter === f ? CY : "#6E8AA0",
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
          </div>

          {/* Split body: case list (left) + job detail (right) */}
          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
            {/* Case list */}
            <div
              style={{
                width: 240,
                borderRight: `1px solid #1A2A3A`,
                overflowY: "auto",
                flexShrink: 0,
              }}
            >
              {!loading && filteredCases.length === 0 && (
                <div style={{ padding: 14, color: "#6E8AA0", fontSize: 10 }}>
                  No cases in this filter.
                </div>
              )}
              {filteredCases.map((c) => {
                const cid      = c.id || c._id || c.title || c.name;
                const isCovered = coverageMap.covered.has(cid);
                const isActive  = selected && (selected.id || selected._id || selected.title || selected.name) === cid;
                const pri       = (c.priority || "").toLowerCase();
                const priColor  = pri === "critical" ? RED : pri === "high" ? AMBER : pri === "medium" ? CY : "#4E6A7A";
                const priLabel  = pri ? pri.toUpperCase() : (c.severity ? String(c.severity).toUpperCase() : "OPEN");
                return (
                  <div
                    key={cid}
                    onClick={() => setSelected(c)}
                    style={{
                      padding: "9px 12px",
                      borderBottom: `1px solid #0E1A26`,
                      cursor: "pointer",
                      background: isActive ? `${CY}10` : "transparent",
                      borderLeft: isActive ? `3px solid ${CY}` : "3px solid transparent",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: isCovered ? GREEN : RED,
                          flexShrink: 0,
                          boxShadow: !isCovered ? `0 0 4px ${RED}` : undefined,
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
                        {c.title || c.name || c.description || cid}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 5, paddingLeft: 12 }}>
                      <span
                        style={{
                          fontSize: 8,
                          color: priColor,
                          letterSpacing: 1,
                          padding: "1px 4px",
                          border: `1px solid ${priColor}44`,
                          borderRadius: 3,
                        }}
                      >
                        {priLabel}
                      </span>
                      <span style={{ fontSize: 8, color: isCovered ? GREEN : RED, letterSpacing: 1 }}>
                        {isCovered
                          ? `${coverageMap.pairs.filter((p) => p.caseId === cid).length} job${coverageMap.pairs.filter((p) => p.caseId === cid).length !== 1 ? "s" : ""}`
                          : "no coverage"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Job detail pane */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {!selected && (
                <div style={{ padding: 20, color: "#6E8AA0", fontSize: 10, lineHeight: 1.6 }}>
                  Select an investigation case to see matched swarm jobs.
                </div>
              )}
              {selected && (
                <div>
                  {/* Case header + assess button */}
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
                        {selected.title || selected.name || selected.description || "Investigation Case"}
                      </div>
                      {selected.description && (selected.title || selected.name) && (
                        <div style={{ fontSize: 10, color: "#4E8A9A", lineHeight: 1.4, maxHeight: 36, overflow: "hidden" }}>
                          {String(selected.description).slice(0, 160)}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => getAiAssessment(selected, selectedJobMatches)}
                      disabled={
                        !!aiMap[selected.id || selected._id || selected.title || selected.name] ||
                        aiLoading === (selected.id || selected._id || selected.title || selected.name)
                      }
                      style={{
                        flexShrink: 0,
                        padding: "3px 10px",
                        borderRadius: 4,
                        border: `1px solid ${aiMap[selected.id || selected._id || selected.title || selected.name] ? GREEN + "66" : VIOLET + "66"}`,
                        background: aiMap[selected.id || selected._id || selected.title || selected.name]
                          ? `${GREEN}12`
                          : aiLoading === (selected.id || selected._id || selected.title || selected.name)
                          ? `${VIOLET}22`
                          : "transparent",
                        color: aiMap[selected.id || selected._id || selected.title || selected.name] ? GREEN : VIOLET,
                        fontSize: 9,
                        letterSpacing: 1,
                        cursor:
                          aiMap[selected.id || selected._id || selected.title || selected.name] ||
                          aiLoading === (selected.id || selected._id || selected.title || selected.name)
                            ? "default"
                            : "pointer",
                        fontFamily: "inherit",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {aiMap[selected.id || selected._id || selected.title || selected.name]
                        ? "✓ ASSESSED"
                        : aiLoading === (selected.id || selected._id || selected.title || selected.name)
                        ? "consulting…"
                        : "▶ ASSESS"}
                    </button>
                  </div>

                  {/* AI assessment text */}
                  {aiMap[selected.id || selected._id || selected.title || selected.name] && (
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
                      {aiMap[selected.id || selected._id || selected.title || selected.name]}
                    </div>
                  )}

                  {/* Matched jobs or no-coverage message */}
                  {selectedJobMatches.length === 0 ? (
                    <div
                      style={{
                        padding: "14px",
                        color: RED,
                        fontSize: 10,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span style={{ fontSize: 14 }}>⚠</span>
                      No active swarm jobs are supporting this investigation case.
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
                        {selectedJobMatches.length} MATCHING JOB{selectedJobMatches.length !== 1 ? "S" : ""}
                      </div>
                      {selectedJobMatches.map((job, i) => {
                        const jid     = job.id || job._id || job.name;
                        const jStatus = (job.status || "unknown").toUpperCase();
                        const statusColor =
                          jStatus === "RUNNING" || jStatus === "ACTIVE" ? GREEN
                          : jStatus === "QUEUED"  ? AMBER
                          : jStatus === "FAILED"  ? RED
                          : CY;
                        return (
                          <div
                            key={`${jid}-${i}`}
                            style={{
                              padding: "9px 14px",
                              borderBottom: `1px solid #0E1A26`,
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                              <span style={{ color: VIOLET, fontSize: 11, flexShrink: 0 }}>⬡</span>
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
                                {job.name || job.title || job.description || jid}
                              </span>
                              <span
                                style={{
                                  fontSize: 8,
                                  color: statusColor,
                                  letterSpacing: 1,
                                  padding: "1px 5px",
                                  border: `1px solid ${statusColor}44`,
                                  borderRadius: 3,
                                  flexShrink: 0,
                                }}
                              >
                                {jStatus}
                              </span>
                            </div>
                            {job.description && (
                              <div style={{ paddingLeft: 19, fontSize: 10, color: "#4E8A9A", lineHeight: 1.4 }}>
                                {String(job.description).slice(0, 120)}
                              </div>
                            )}
                            {job.progress !== undefined && (
                              <div style={{ paddingLeft: 19, marginTop: 5 }}>
                                <div
                                  style={{
                                    height: 3,
                                    background: "#1A2A3A",
                                    borderRadius: 2,
                                    overflow: "hidden",
                                  }}
                                >
                                  <div
                                    style={{
                                      height: "100%",
                                      width: `${Math.min(100, Number(job.progress) || 0)}%`,
                                      background: statusColor,
                                      borderRadius: 2,
                                    }}
                                  />
                                </div>
                                <div style={{ fontSize: 9, color: "#4E6A7A", marginTop: 2 }}>
                                  {Math.min(100, Number(job.progress) || 0)}% complete
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "5px 14px",
              borderTop: `1px solid ${CY}18`,
              fontSize: 10,
              color: "#4E6A7A",
              letterSpacing: 1,
              flexShrink: 0,
            }}
          >
            /entities/SwarmJob + /v1/investigations · 60s auto-refresh · click ▶ ASSESS for AI analysis
          </div>
        </div>
      )}
    </>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const k of ["items", "results", "data", "jobs", "records", "nodes"]) {
      if (Array.isArray(data[k])) return data[k];
    }
  }
  return [];
}

function normaliseInvestigations(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const k of ["items", "results", "data", "investigations", "cases", "records"]) {
      if (Array.isArray(data[k])) return data[k];
    }
  }
  return [];
}

function keywords(str) {
  if (!str) return [];
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function buildCoverage(jobs, cases) {
  const activeJobs = jobs.filter((j) =>
    ["running", "active", "in_progress", "queued"].includes((j.status || "").toLowerCase())
  );
  const openCases = cases.filter(
    (c) => !["closed", "resolved", "archived"].includes((c.status || "").toLowerCase())
  );

  const covered = new Set();
  const pairs   = [];

  for (const c of openCases) {
    const cid   = c.id || c._id || c.title || c.name;
    const cText = [
      c.title || "",
      c.name || "",
      c.description || "",
      c.category || "",
      c.type || "",
      ...(Array.isArray(c.tags) ? c.tags : []),
    ].join(" ");
    const cKws = keywords(cText);
    if (!cKws.length) continue;

    for (const j of activeJobs) {
      const jText = [
        j.name || "",
        j.title || "",
        j.description || "",
        j.type || "",
        j.category || "",
        ...(Array.isArray(j.tags) ? j.tags : []),
      ].join(" ");
      const jKws  = keywords(jText);
      const score = cKws.filter((w) => jKws.includes(w)).length;
      if (score >= 1) {
        covered.add(cid);
        pairs.push({ caseId: cid, job: j, matchScore: score });
      }
    }
  }

  pairs.sort((a, b) => b.matchScore - a.matchScore);
  return { covered, pairs };
}
