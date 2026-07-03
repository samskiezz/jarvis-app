/**
 * InvestmentSwarmCoverage — F121.
 *
 * Parallel-fetches /entities/Investment + /entities/SwarmJob and
 * keyword-correlates each holding against the active swarm job catalog
 * to surface investments with automated monitoring/analysis coverage
 * (MONITORED) vs those flying dark with no swarm attention (UNMONITORED).
 *
 * Stat tiles: holdings / active jobs / monitored / unmonitored.
 * Filter tabs: ALL / MONITORED / UNMONITORED + text search.
 * Expand holding → matched swarm jobs with status badge + progress bar.
 * Amber badge on unmonitored count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence portfolio-automation brief + TTS.
 *
 * Toggle: ◈ INVSWM at left:35720, bottom:8, zIndex:75.
 * Event:  jarvis:invswm-toggle
 * Voice:  "investment swarm" / "portfolio monitoring" / "which investments are monitored"
 *         / "invswm" / "portfolio swarm coverage"
 * Refresh: 90s auto-refresh while open.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const GREEN  = "#00c878";
const AMBER  = "#F5A623";
const RED    = "#FF3D5A";
const VIOLET = "#A78BFA";
const BTN_LEFT = 35720;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isInvSwmQuery(q) {
  return /invest.{0,20}swarm|swarm.{0,20}invest|portfolio\s+(monitor|swarm|coverage|automat)|which\s+invest.{0,15}(monitor|swarm|cover)|invswm\b|portfolio\s+swarm/i.test(
    q || ""
  );
}

export async function buildInvSwmScript() {
  try {
    const [ir, sr] = await Promise.all([
      fetch(`${apiBase()}/entities/Investment`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
      fetch(`${apiBase()}/entities/SwarmJob`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    const investments = normaliseArray(ir.ok ? await ir.json() : []);
    const jobs        = normaliseArray(sr.ok ? await sr.json() : []);
    const activeJobs  = jobs.filter((j) =>
      ["running", "active", "in_progress", "queued", "scheduled"].includes(
        (j.status || "").toLowerCase()
      )
    );
    const { monitored } = buildCoverage(investments, activeJobs);
    const unmonitored   = investments.length - monitored.size;
    window.dispatchEvent(new CustomEvent("jarvis:invswm-toggle"));
    if (!investments.length)
      return "No investment holdings on record, sir. The portfolio is empty.";
    return `Investment swarm-coverage map active, sir. ${investments.length} holding${investments.length !== 1 ? "s" : ""} cross-referenced against ${activeJobs.length} active swarm job${activeJobs.length !== 1 ? "s" : ""}. ${monitored.size} holding${monitored.size !== 1 ? "s" : ""} ${monitored.size !== 1 ? "have" : "has"} automated monitoring coverage. ${unmonitored} holding${unmonitored !== 1 ? "s are" : " is"} running without swarm attention — consider deploying monitoring agents.`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:invswm-toggle"));
    return "Investment swarm-coverage panel open, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function InvestmentSwarmCoverage() {
  const [visible,      setVisible]      = useState(false);
  const [investments,  setInvestments]  = useState([]);
  const [jobs,         setJobs]         = useState([]);
  const [coverage,     setCoverage]     = useState({ monitored: new Set(), pairs: [] });
  const [loading,      setLoading]      = useState(false);
  const [search,       setSearch]       = useState("");
  const [filter,       setFilter]       = useState("all");
  const [selected,     setSelected]     = useState(null);
  const [aiMap,        setAiMap]        = useState({});
  const [aiLoading,    setAiLoading]    = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [ir, sr] = await Promise.all([
        fetch(`${apiBase()}/entities/Investment`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
        fetch(`${apiBase()}/entities/SwarmJob`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
      ]);
      const rawInv  = normaliseArray(ir.ok ? await ir.json() : []);
      const rawJobs = normaliseArray(sr.ok ? await sr.json() : []);
      setInvestments(rawInv);
      setJobs(rawJobs);
      setCoverage(buildCoverage(rawInv, rawJobs));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:invswm-toggle", onToggle);
    return () => window.removeEventListener("jarvis:invswm-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, 90_000);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function getAiAssessment(inv, matchedJobs) {
    const iid = inv.id || inv._id || inv.name || inv.ticker || inv.symbol;
    if (aiMap[iid] || aiLoading === iid) return;
    setAiLoading(iid);
    const name      = inv.name || inv.ticker || inv.symbol || inv.type || "Investment";
    const sector    = inv.sector || inv.type || "";
    const jobNames  = matchedJobs.map((j) => j.name || j.title || j.id || "Job").join(", ");
    const hasCover  = matchedJobs.length > 0;
    const prompt = hasCover
      ? `As JARVIS, provide a 2-sentence portfolio automation assessment for holding "${name}"${sector ? ` (${sector})` : ""}. Currently monitored by ${matchedJobs.length} swarm job${matchedJobs.length !== 1 ? "s" : ""}: ${jobNames}. Evaluate coverage adequacy and any monitoring gaps.`
      : `As JARVIS, provide a 2-sentence portfolio automation assessment for holding "${name}"${sector ? ` (${sector})` : ""}, which currently has NO active swarm job monitoring. Recommend an appropriate automated surveillance action.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAiMap((prev) => ({ ...prev, [iid]: answer }));
      if (answer)
        window.dispatchEvent(
          new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } })
        );
    } catch (_) {
      setAiMap((prev) => ({ ...prev, [iid]: "Unable to reach reasoning core." }));
    } finally {
      setAiLoading(null);
    }
  }

  const activeJobs      = jobs.filter((j) =>
    ["running", "active", "in_progress", "queued", "scheduled"].includes(
      (j.status || "").toLowerCase()
    )
  );
  const unmonitoredCount = investments.length - coverage.monitored.size;

  const filtered = investments
    .filter((inv) => {
      const iid = inv.id || inv._id || inv.name || inv.ticker || inv.symbol;
      if (filter === "monitored"   && !coverage.monitored.has(iid)) return false;
      if (filter === "unmonitored" &&  coverage.monitored.has(iid)) return false;
      if (search) {
        const s = search.toLowerCase();
        const text = [inv.name, inv.ticker, inv.symbol, inv.sector, inv.type, inv.description]
          .filter(Boolean).join(" ").toLowerCase();
        if (!text.includes(s)) return false;
      }
      return true;
    });

  const selectedMatches = selected
    ? coverage.pairs
        .filter((p) => p.invId === (selected.id || selected._id || selected.name || selected.ticker || selected.symbol))
        .map((p) => p.job)
    : [];

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Investment × Swarm Coverage"
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 75,
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
        {unmonitoredCount > 0 && !visible && (
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
            {unmonitoredCount > 9 ? "9+" : unmonitoredCount}
          </span>
        )}
        ◈ INVSWM
      </button>

      {/* Panel */}
      {visible && (
        <div
          style={{
            position: "fixed",
            bottom: 44,
            left: Math.min(BTN_LEFT, window.innerWidth - 660),
            zIndex: 75,
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
              INVESTMENT × SWARM COVERAGE
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
              { label: "HOLDINGS",    val: investments.length,        col: CY     },
              { label: "ACTIVE JOBS", val: activeJobs.length,         col: VIOLET },
              { label: "MONITORED",   val: coverage.monitored.size,   col: GREEN  },
              { label: "UNMONITORED", val: unmonitoredCount,          col: AMBER  },
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
            {["all", "monitored", "unmonitored"].map((f) => (
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
              placeholder="search holdings…"
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
            {/* Holdings list */}
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
                  No holdings in this filter.
                </div>
              )}
              {filtered.map((inv) => {
                const iid         = inv.id || inv._id || inv.name || inv.ticker || inv.symbol;
                const isMonitored = coverage.monitored.has(iid);
                const isActive    = selected && (selected.id || selected._id || selected.name || selected.ticker || selected.symbol) === iid;
                const label       = inv.name || inv.ticker || inv.symbol || iid;
                const sub         = [inv.sector, inv.type].filter(Boolean).join(" · ");
                return (
                  <div
                    key={iid}
                    onClick={() => setSelected(inv)}
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
                          background: isMonitored ? GREEN : AMBER,
                          flexShrink: 0,
                          boxShadow: !isMonitored ? `0 0 4px ${AMBER}` : undefined,
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
                        {label}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 5, paddingLeft: 12 }}>
                      {sub && (
                        <span style={{ fontSize: 8, color: "#4E8A9A", letterSpacing: 1 }}>
                          {sub}
                        </span>
                      )}
                      <span style={{ fontSize: 8, color: isMonitored ? GREEN : AMBER, letterSpacing: 1 }}>
                        {isMonitored
                          ? `${coverage.pairs.filter((p) => p.invId === iid).length} job${coverage.pairs.filter((p) => p.invId === iid).length !== 1 ? "s" : ""}`
                          : "unmonitored"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Detail pane */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {!selected && (
                <div style={{ padding: 20, color: "#6E8AA0", fontSize: 10, lineHeight: 1.6 }}>
                  Select a holding to see matched swarm jobs and request an AI assessment.
                </div>
              )}
              {selected && (() => {
                const iid   = selected.id || selected._id || selected.name || selected.ticker || selected.symbol;
                const label = selected.name || selected.ticker || selected.symbol || iid;
                return (
                  <div>
                    {/* Holding header + assess button */}
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
                          {label}
                        </div>
                        {selected.description && (
                          <div style={{ fontSize: 10, color: "#4E8A9A", lineHeight: 1.4, maxHeight: 36, overflow: "hidden" }}>
                            {String(selected.description).slice(0, 160)}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                          {[selected.sector, selected.type, selected.ticker, selected.symbol]
                            .filter(Boolean)
                            .map((tag, i) => (
                              <span
                                key={i}
                                style={{
                                  fontSize: 8,
                                  color: AMBER,
                                  letterSpacing: 1,
                                  padding: "1px 5px",
                                  border: `1px solid ${AMBER}44`,
                                  borderRadius: 3,
                                }}
                              >
                                {String(tag).toUpperCase()}
                              </span>
                            ))}
                        </div>
                      </div>
                      <button
                        onClick={() => getAiAssessment(selected, selectedMatches)}
                        disabled={!!aiMap[iid] || aiLoading === iid}
                        style={{
                          flexShrink: 0,
                          padding: "3px 10px",
                          borderRadius: 4,
                          border: `1px solid ${aiMap[iid] ? GREEN + "66" : VIOLET + "66"}`,
                          background: aiMap[iid]
                            ? `${GREEN}12`
                            : aiLoading === iid
                            ? `${VIOLET}22`
                            : "transparent",
                          color: aiMap[iid] ? GREEN : VIOLET,
                          fontSize: 9,
                          letterSpacing: 1,
                          cursor: aiMap[iid] || aiLoading === iid ? "default" : "pointer",
                          fontFamily: "inherit",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {aiMap[iid] ? "✓ ASSESSED" : aiLoading === iid ? "consulting…" : "▶ ASSESS"}
                      </button>
                    </div>

                    {/* AI assessment */}
                    {aiMap[iid] && (
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
                        {aiMap[iid]}
                      </div>
                    )}

                    {/* Matched jobs or no-coverage message */}
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
                        No active swarm jobs are monitoring this holding.
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
                          {selectedMatches.length} MATCHING JOB{selectedMatches.length !== 1 ? "S" : ""}
                        </div>
                        {selectedMatches.map((job, i) => {
                          const jid       = job.id || job._id || job.name;
                          const jStatus   = (job.status || "unknown").toUpperCase();
                          const statusCol =
                            jStatus === "RUNNING" || jStatus === "ACTIVE" ? GREEN
                            : jStatus === "QUEUED" || jStatus === "SCHEDULED" ? CY
                            : jStatus === "FAILED"  ? RED
                            : VIOLET;
                          const progress  = Math.min(100, Number(job.progress) || 0);
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
                                    color: statusCol,
                                    letterSpacing: 1,
                                    padding: "1px 5px",
                                    border: `1px solid ${statusCol}44`,
                                    borderRadius: 3,
                                    flexShrink: 0,
                                  }}
                                >
                                  {jStatus}
                                </span>
                              </div>
                              {job.description && (
                                <div style={{ paddingLeft: 19, fontSize: 10, color: "#4E8A9A", lineHeight: 1.4, marginBottom: 4 }}>
                                  {String(job.description).slice(0, 110)}
                                </div>
                              )}
                              {job.progress !== undefined && (
                                <div style={{ paddingLeft: 19 }}>
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
                                        width: `${progress}%`,
                                        background: statusCol,
                                        borderRadius: 2,
                                      }}
                                    />
                                  </div>
                                  <div style={{ fontSize: 9, color: "#4E6A7A", marginTop: 2 }}>
                                    {progress}% complete
                                  </div>
                                </div>
                              )}
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
            /entities/Investment + /entities/SwarmJob · 90s auto-refresh · click ▶ ASSESS for AI analysis
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
    for (const k of ["items", "results", "data", "investments", "jobs", "records", "nodes"]) {
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
    .filter((w) => w.length > 2);
}

function buildCoverage(investments, jobs) {
  const activeJobs = jobs.filter((j) =>
    ["running", "active", "in_progress", "queued", "scheduled"].includes(
      (j.status || "").toLowerCase()
    )
  );

  const monitored = new Set();
  const pairs     = [];

  for (const inv of investments) {
    const iid   = inv.id || inv._id || inv.name || inv.ticker || inv.symbol;
    const iText = [
      inv.name || "",
      inv.ticker || "",
      inv.symbol || "",
      inv.sector || "",
      inv.type || "",
      inv.description || "",
      ...(Array.isArray(inv.tags) ? inv.tags : []),
    ].join(" ");
    const iKws = keywords(iText);
    if (!iKws.length) continue;

    for (const j of activeJobs) {
      const jText = [
        j.name || "",
        j.title || "",
        j.description || "",
        j.type || "",
        j.category || "",
        j.objective || "",
        ...(Array.isArray(j.tags) ? j.tags : []),
      ].join(" ");
      const jKws  = keywords(jText);
      const score = iKws.filter((w) => jKws.includes(w)).length;
      if (score >= 1) {
        monitored.add(iid);
        pairs.push({ invId: iid, job: j, matchScore: score });
      }
    }
  }

  pairs.sort((a, b) => b.matchScore - a.matchScore);
  return { monitored, pairs };
}
