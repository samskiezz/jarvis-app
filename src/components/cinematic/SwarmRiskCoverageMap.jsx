/**
 * SwarmRiskCoverageMap — F63.
 *
 * Parallel-fetches /entities/SwarmJob + /entities/RiskSignal and
 * keyword-correlates active/running swarm jobs against open risk signals
 * to show which risks have active job coverage and which are uncovered.
 *
 * Intent: "JARVIS, swarm coverage" / "risk coverage" / "swarm risk map"
 *   → jarvis:swarmcoverage-toggle + TTS brief via buildSwarmCoverageScript()
 *
 * Toggle: ⬡ COVER at left:5276, zIndex 65.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const GREEN = "#00c878";
const AMBER = "#F5A623";
const RED = "#FF3D5A";
const VIOLET = "#A78BFA";
const BTN_LEFT = 5276;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isSwarmCoverageQuery(q) {
  return /swarm.{0,15}(cover|risk|map|gap)|risk.{0,15}(cover|swarm)|(coverage|gap)\s+(map|report)|swarm\s+risk\b|uncovered\s+risk|swarm\s+coverage\b/i.test(
    q || ""
  );
}

export async function buildSwarmCoverageScript() {
  try {
    const [jr, rr] = await Promise.all([
      fetch(`${apiBase()}/entities/SwarmJob`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
      fetch(`${apiBase()}/entities/RiskSignal`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    const jobs = normaliseArray(jr.ok ? await jr.json() : []);
    const risks = normaliseArray(rr.ok ? await rr.json() : []);
    const activeJobs = jobs.filter((j) =>
      ["running", "active", "in_progress", "queued"].includes(
        (j.status || "").toLowerCase()
      )
    );
    const openRisks = risks.filter(
      (r) => !["resolved", "closed", "dismissed"].includes((r.status || "").toLowerCase())
    );
    const { covered } = buildCoverage(activeJobs, openRisks);
    const uncovered = openRisks.length - covered.size;
    window.dispatchEvent(new CustomEvent("jarvis:swarmcoverage-toggle"));
    if (!openRisks.length)
      return "No open risk signals detected, sir. The threat board is clear.";
    return `Swarm-risk coverage map active, sir. ${activeJobs.length} active swarm job${activeJobs.length !== 1 ? "s" : ""} cross-referenced against ${openRisks.length} open risk signal${openRisks.length !== 1 ? "s" : ""}. ${covered.size} risk${covered.size !== 1 ? "s" : ""} have active job coverage. ${uncovered} risk${uncovered !== 1 ? "s" : ""} ${uncovered !== 1 ? "are" : "is"} currently uncovered and may require attention.`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:swarmcoverage-toggle"));
    return "Swarm risk coverage map panel open, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function SwarmRiskCoverageMap() {
  const [visible, setVisible] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [risks, setRisks] = useState([]);
  const [coverageMap, setCoverageMap] = useState({ covered: new Set(), pairs: [] });
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [aiMap, setAiMap] = useState({});
  const [aiLoading, setAiLoading] = useState(null);
  const [filter, setFilter] = useState("all");
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [jr, rr] = await Promise.all([
        fetch(`${apiBase()}/entities/SwarmJob`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
        fetch(`${apiBase()}/entities/RiskSignal`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
      ]);
      const rawJobs = normaliseArray(jr.ok ? await jr.json() : []);
      const rawRisks = normaliseArray(rr.ok ? await rr.json() : []);
      setJobs(rawJobs);
      setRisks(rawRisks);
      setCoverageMap(buildCoverage(rawJobs, rawRisks));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:swarmcoverage-toggle", onToggle);
    return () => window.removeEventListener("jarvis:swarmcoverage-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, 60_000);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function getAiCoverageAssessment(risk, matchedJobs) {
    const rid = risk.id || risk._id || risk.title;
    if (aiMap[rid] || aiLoading === rid) return;
    setAiLoading(rid);
    const riskTitle = risk.title || risk.name || risk.description || "Unknown Risk";
    const jobNames = matchedJobs.map((j) => j.name || j.title || j.id || "Job").join(", ");
    const covered = matchedJobs.length > 0;
    const prompt = covered
      ? `As JARVIS, provide a 2-sentence assessment of risk "${riskTitle}" (severity: ${risk.severity || risk.score || "unknown"}). Currently ${matchedJobs.length} swarm job${matchedJobs.length !== 1 ? "s" : ""} are active for this risk: ${jobNames}. Evaluate adequacy of coverage and any remaining exposure.`
      : `As JARVIS, provide a 2-sentence assessment of risk "${riskTitle}" (severity: ${risk.severity || risk.score || "unknown"}) which currently has NO active swarm job coverage. Recommend an appropriate swarm response action.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAiMap((prev) => ({ ...prev, [rid]: answer }));
      if (answer)
        window.dispatchEvent(
          new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } })
        );
    } catch (_) {
      setAiMap((prev) => ({ ...prev, [rid]: "Unable to reach reasoning core." }));
    } finally {
      setAiLoading(null);
    }
  }

  const activeJobs = jobs.filter((j) =>
    ["running", "active", "in_progress", "queued"].includes((j.status || "").toLowerCase())
  );
  const openRisks = risks.filter(
    (r) => !["resolved", "closed", "dismissed"].includes((r.status || "").toLowerCase())
  );
  const uncoveredCount = openRisks.length - coverageMap.covered.size;

  const filteredRisks =
    filter === "covered"
      ? openRisks.filter((r) => coverageMap.covered.has(r.id || r._id || r.title))
      : filter === "uncovered"
      ? openRisks.filter((r) => !coverageMap.covered.has(r.id || r._id || r.title))
      : openRisks;

  const selectedJobMatches = selected
    ? coverageMap.pairs
        .filter((p) => p.riskId === (selected.id || selected._id || selected.title))
        .map((p) => p.job)
    : [];

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Swarm-Risk Coverage Map"
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
        ⬡ COVER
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
              SWARM–RISK COVERAGE MAP
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
              { label: "ACTIVE JOBS", val: activeJobs.length, col: VIOLET },
              { label: "OPEN RISKS", val: openRisks.length, col: AMBER },
              { label: "COVERED", val: coverageMap.covered.size, col: GREEN },
              { label: "UNCOVERED", val: uncoveredCount, col: RED },
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

          {/* Split body: risk list (left) + job detail (right) */}
          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
            {/* Risk list */}
            <div
              style={{
                width: 240,
                borderRight: `1px solid #1A2A3A`,
                overflowY: "auto",
                flexShrink: 0,
              }}
            >
              {!loading && filteredRisks.length === 0 && (
                <div style={{ padding: 14, color: "#6E8AA0", fontSize: 10 }}>
                  No risks in this filter.
                </div>
              )}
              {filteredRisks.map((r) => {
                const rid = r.id || r._id || r.title;
                const isCovered = coverageMap.covered.has(rid);
                const isActive = selected && (selected.id || selected._id || selected.title) === rid;
                const sev = r.severity || r.score || r.priority || 0;
                const sevNum = typeof sev === "number" ? sev : parseInt(sev, 10) || 0;
                const sevLabel = sevNum >= 90 ? "CRITICAL" : sevNum >= 70 ? "HIGH" : sevNum >= 40 ? "MEDIUM" : "LOW";
                const sevColor = sevNum >= 90 ? RED : sevNum >= 70 ? AMBER : sevNum >= 40 ? CY : "#4E6A7A";
                return (
                  <div
                    key={rid}
                    onClick={() => setSelected(r)}
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
                      <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.title || r.name || r.description || rid}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 5, paddingLeft: 12 }}>
                      <span
                        style={{
                          fontSize: 8,
                          color: sevColor,
                          letterSpacing: 1,
                          padding: "1px 4px",
                          border: `1px solid ${sevColor}44`,
                          borderRadius: 3,
                        }}
                      >
                        {sevLabel}
                      </span>
                      <span style={{ fontSize: 8, color: isCovered ? GREEN : RED, letterSpacing: 1 }}>
                        {isCovered
                          ? `${coverageMap.pairs.filter((p) => p.riskId === rid).length} job${coverageMap.pairs.filter((p) => p.riskId === rid).length !== 1 ? "s" : ""}`
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
                  Select a risk signal to see matched swarm jobs.
                </div>
              )}
              {selected && (
                <div>
                  {/* Risk header + assess button */}
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
                        {selected.title || selected.name || selected.description || "Risk Signal"}
                      </div>
                      {selected.description && (selected.title || selected.name) && (
                        <div style={{ fontSize: 10, color: "#4E8A9A", lineHeight: 1.4, maxHeight: 36, overflow: "hidden" }}>
                          {String(selected.description).slice(0, 160)}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => getAiCoverageAssessment(selected, selectedJobMatches)}
                      disabled={
                        !!aiMap[selected.id || selected._id || selected.title] ||
                        aiLoading === (selected.id || selected._id || selected.title)
                      }
                      style={{
                        flexShrink: 0,
                        padding: "3px 10px",
                        borderRadius: 4,
                        border: `1px solid ${aiMap[selected.id || selected._id || selected.title] ? GREEN + "66" : VIOLET + "66"}`,
                        background: aiMap[selected.id || selected._id || selected.title]
                          ? `${GREEN}12`
                          : aiLoading === (selected.id || selected._id || selected.title)
                          ? `${VIOLET}22`
                          : "transparent",
                        color: aiMap[selected.id || selected._id || selected.title] ? GREEN : VIOLET,
                        fontSize: 9,
                        letterSpacing: 1,
                        cursor:
                          aiMap[selected.id || selected._id || selected.title] ||
                          aiLoading === (selected.id || selected._id || selected.title)
                            ? "default"
                            : "pointer",
                        fontFamily: "inherit",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {aiMap[selected.id || selected._id || selected.title]
                        ? "✓ ASSESSED"
                        : aiLoading === (selected.id || selected._id || selected.title)
                        ? "consulting…"
                        : "▶ ASSESS"}
                    </button>
                  </div>

                  {/* AI assessment text */}
                  {aiMap[selected.id || selected._id || selected.title] && (
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
                      <span style={{ color: GREEN, fontSize: 8, letterSpacing: 1, fontWeight: 700, display: "block", marginBottom: 3 }}>
                        JARVIS ASSESSMENT
                      </span>
                      {aiMap[selected.id || selected._id || selected.title]}
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
                      No active swarm jobs are addressing this risk signal.
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
                        const jid = job.id || job._id || job.name;
                        const jStatus = (job.status || "unknown").toUpperCase();
                        const statusColor =
                          jStatus === "RUNNING" || jStatus === "ACTIVE" ? GREEN
                          : jStatus === "QUEUED" ? AMBER
                          : jStatus === "FAILED" ? RED
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
                              <span style={{ fontSize: 11, color: "#DCEBF5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
            /entities/SwarmJob + /entities/RiskSignal · 60s auto-refresh · click ▶ ASSESS for AI analysis
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
    for (const k of ["items", "results", "data", "jobs", "signals", "risks", "records", "nodes"]) {
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

function buildCoverage(jobs, risks) {
  const activeJobs = jobs.filter((j) =>
    ["running", "active", "in_progress", "queued"].includes((j.status || "").toLowerCase())
  );
  const openRisks = risks.filter(
    (r) => !["resolved", "closed", "dismissed"].includes((r.status || "").toLowerCase())
  );

  const covered = new Set();
  const pairs = [];

  for (const r of openRisks) {
    const rid = r.id || r._id || r.title;
    const rText = [
      r.title || "",
      r.name || "",
      r.description || "",
      r.category || "",
      r.type || "",
      ...(Array.isArray(r.tags) ? r.tags : []),
    ].join(" ");
    const rKws = keywords(rText);
    if (!rKws.length) continue;

    for (const j of activeJobs) {
      const jText = [
        j.name || "",
        j.title || "",
        j.description || "",
        j.type || "",
        j.category || "",
        ...(Array.isArray(j.tags) ? j.tags : []),
      ].join(" ");
      const jKws = keywords(jText);
      const score = rKws.filter((w) => jKws.includes(w)).length;
      if (score >= 1) {
        covered.add(rid);
        pairs.push({ riskId: rid, job: j, matchScore: score });
      }
    }
  }

  pairs.sort((a, b) => b.matchScore - a.matchScore);
  return { covered, pairs };
}
