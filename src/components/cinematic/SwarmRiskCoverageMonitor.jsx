/**
 * SwarmRiskCoverageMonitor — F488
 * "JARVIS, swarm risk / risk coverage / swarm coverage / srisk /
 *  which risks have swarm / automated risk / unmitigated risks / risk automation"
 * Cross-references /entities/SwarmJob + /entities/RiskSignal to surface
 * COVERED risks (≥1 active swarm job keyword-matches the signal) vs
 * UNMITIGATED risks (no automation is actively running against them).
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const RED = "#FF4444";
const ORG = "#FF8C42";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS = 90_000;

const SRISK_RE =
  /\bsrisk\b|\bswarm.?risk\b|\brisk.?coverage\b|\bswarm.?coverage\b|\bwhich.risks.have.swarm\b|\bautomated.risk\b|\bunmitigated.risks?\b|\brisk.automation\b|\bswarm.mitigation\b|\bactive.coverage\b/i;

export function isSwarmRiskQuery(text) {
  return SRISK_RE.test(text || "");
}

function normaliseJobs(data) {
  if (!data) return [];
  const raw = data.jobs || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((j, i) => ({
    id:     j.id || `j-${i}`,
    name:   (j.name || j.title || j.job_name || j.label || `Job ${i + 1}`).trim(),
    status: (j.status || j.state || "RUNNING").toUpperCase(),
    kind:   (j.kind || j.type || j.category || "").toLowerCase(),
    tags:   [...(j.tags || []), j.kind, j.type, j.category, j.target]
              .filter(Boolean).map(x => String(x).toLowerCase()),
  })).filter(j => ["RUNNING", "ACTIVE", "IN_PROGRESS", "PENDING"].includes(j.status));
}

function normaliseSignals(data) {
  if (!data) return [];
  const raw = data.signals || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((s, i) => ({
    id:       s.id || `s-${i}`,
    title:    (s.title || s.name || s.signal || s.label || `Signal ${i + 1}`).trim(),
    severity: (s.severity || s.level || s.priority || "LOW").toUpperCase(),
    source:   (s.source || s.origin || "").toLowerCase(),
    tags:     [...(s.tags || []), s.kind, s.type, s.category, s.source]
                .filter(Boolean).map(x => String(x).toLowerCase()),
  }));
}

function severityOrder(s) {
  if (s === "CRITICAL") return 0;
  if (s === "HIGH")     return 1;
  if (s === "MEDIUM")   return 2;
  return 3;
}

function severityColor(s) {
  if (s === "CRITICAL") return RED;
  if (s === "HIGH")     return ORG;
  if (s === "MEDIUM")   return "#FFD700";
  return GRN;
}

function tokenise(str) {
  return (str || "").toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function matchScore(signal, job) {
  const sigWords  = new Set([...tokenise(signal.title), ...signal.tags]);
  const jobWords  = new Set([...tokenise(job.name),   ...job.tags, ...tokenise(job.kind)]);
  let hits = 0;
  for (const w of jobWords) {
    if (sigWords.has(w)) hits++;
  }
  return hits;
}

function classify(signals, jobs) {
  return signals
    .map(s => {
      const matched = jobs
        .map(j => ({ ...j, score: matchScore(s, j) }))
        .filter(j => j.score > 0)
        .sort((a, b) => b.score - a.score);
      return { ...s, matched, covered: matched.length > 0 };
    })
    .sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity));
}

export async function buildSwarmRiskScript() {
  let jobs = [], signals = [];
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [jr, sr] = await Promise.all([
      fetch(`${base}/entities/SwarmJob`,    { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`,  { headers: hdr }),
    ]);
    if (jr.ok) jobs    = normaliseJobs(await jr.json());
    if (sr.ok) signals = normaliseSignals(await sr.json());
  } catch (_) {}

  if (!signals.length) return "Unable to retrieve swarm risk coverage data at this time, sir.";

  const rows        = classify(signals, jobs);
  const covered     = rows.filter(r => r.covered).length;
  const unmitigated = rows.length - covered;
  const pct         = rows.length ? Math.round((covered / rows.length) * 100) : 0;

  const parts = [
    `Swarm risk coverage: ${signals.length} active risk signal${signals.length !== 1 ? "s" : ""} cross-referenced against ${jobs.length} running swarm job${jobs.length !== 1 ? "s" : ""}.`,
    `${covered} signal${covered !== 1 ? "s are" : " is"} COVERED by active automation — ${pct}% coverage.`,
  ];
  if (unmitigated > 0) {
    const top = rows.filter(r => !r.covered).slice(0, 2).map(r => r.title).join(", ");
    parts.push(`${unmitigated} signal${unmitigated !== 1 ? "s are" : " is"} UNMITIGATED — no active swarm job is targeting ${unmitigated === 1 ? "it" : "them"}. Top unmitigated: ${top}.`);
  } else {
    parts.push("All active risk signals have swarm coverage, sir.");
  }

  return parts.join(" ");
}

export default function SwarmRiskCoverageMonitor() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [jobCount,  setJobCount]  = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [lastTs,    setLastTs]    = useState(null);
  const [tab,       setTab]       = useState("ALL");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [jr, sr] = await Promise.all([
        fetch(`${base}/entities/SwarmJob`,   { headers: hdr }),
        fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
      ]);
      const jobs    = jr.ok ? normaliseJobs(await jr.json())    : [];
      const signals = sr.ok ? normaliseSignals(await sr.json()) : [];
      setJobCount(jobs.length);
      setRows(classify(signals, jobs));
      setLastTs(Date.now());
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, POLL_MS);
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (SRISK_RE.test(q)) { setOpen(true); load(); }
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:srisk-toggle", onToggle);
    return () => window.removeEventListener("jarvis:srisk-toggle", onToggle);
  }, []);

  const covered     = rows.filter(r => r.covered).length;
  const unmitigated = rows.length - covered;
  const pct         = rows.length ? Math.round((covered / rows.length) * 100) : 0;

  const filtered = rows.filter(r => {
    if (tab === "COVERED")     return r.covered;
    if (tab === "UNMITIGATED") return !r.covered;
    return true;
  });

  const ts = lastTs ? new Date(lastTs).toLocaleTimeString("en-GB", { hour12: false }) : null;

  async function assess() {
    setAssessing(true); setBrief("");
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message: `SRISK assessment: ${rows.length} risk signals cross-referenced against ${jobCount} active swarm jobs. ${covered} are COVERED (${pct}% coverage); ${unmitigated} are UNMITIGATED. In 2 sentences, identify the most critical unmitigated signals and recommend the swarm job strategy needed to close the coverage gap.`,
        }),
      });
      const d = await r.json();
      setBrief((d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim());
    } catch (_) {
      setBrief("Assessment unavailable — check agent endpoint.");
    }
    setAssessing(false);
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Swarm × Risk Coverage Monitor — F488"
        style={{
          position: "fixed", left: 16940, bottom: 8, zIndex: 78,
          background: open ? CY + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${open ? CY : CY + "44"}`,
          borderRadius: 8,
          color: open ? "#04060A" : CY,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${CY}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 12 }}>◈</span>
        SRISK
        {unmitigated > 0 && (
          <span style={{
            background: RED + "33", color: RED,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {unmitigated}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 78,
          width: "min(620px,96vw)", maxHeight: "min(680px,84vh)",
          background: "rgba(4,6,14,0.97)",
          border: `1px solid ${CY}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%",
              background: CY, boxShadow: `0 0 10px ${CY}`,
              display: "inline-block",
              animation: loading ? "sriskpulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: CY, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              SWARM × RISK COVERAGE MONITOR
            </span>
            <span style={{ marginLeft: "auto", color: DIM, fontSize: 9 }}>
              {loading ? "SYNCING" : ts ? `UPDATED ${ts}` : "—"} · {POLL_MS / 1000}s
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: DIM,
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>✕</button>
          </div>

          {/* Stats tiles */}
          <div style={{
            display: "flex", gap: 8, padding: "10px 14px",
            borderBottom: `1px solid ${CY}11`,
          }}>
            {[
              { label: "SIGNALS",     val: rows.length,    col: CY },
              { label: "SWARM JOBS",  val: jobCount,       col: "#A78BFA" },
              { label: "COVERED",     val: covered,        col: GRN },
              { label: "UNMITIGATED", val: unmitigated,    col: unmitigated > 0 ? RED : DIM },
              { label: "COVERAGE",    val: `${pct}%`,      col: pct >= 80 ? GRN : pct >= 50 ? ORG : RED },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                flex: 1, background: "rgba(255,255,255,0.03)",
                border: `1px solid ${col}22`, borderRadius: 8,
                padding: "8px 6px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 14, fontWeight: 900 }}>{val}</div>
                <div style={{ color: DIM, fontSize: 7, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{
            display: "flex", gap: 6, padding: "8px 14px",
            borderBottom: `1px solid ${CY}11`,
          }}>
            {["ALL", "COVERED", "UNMITIGATED"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? CY + "22" : "none",
                border: `1px solid ${tab === t ? CY + "88" : CY + "22"}`,
                borderRadius: 6, color: tab === t ? CY : DIM,
                cursor: "pointer", padding: "4px 10px",
                fontSize: 9, letterSpacing: 1, fontWeight: 700,
              }}>{t}</button>
            ))}
            <button onClick={assess} disabled={assessing} style={{
              marginLeft: "auto",
              background: assessing ? CY + "33" : "none",
              border: `1px solid ${CY}55`, borderRadius: 6,
              color: CY, cursor: assessing ? "not-allowed" : "pointer",
              padding: "4px 10px", fontSize: 9, letterSpacing: 1,
            }}>
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* Brief */}
          {brief && (
            <div style={{
              padding: "8px 14px", borderBottom: `1px solid ${CY}11`,
              color: "#DCEBF5", fontSize: 11, lineHeight: 1.55,
              background: "rgba(41,231,255,0.04)",
            }}>{brief}</div>
          )}

          {/* Signal list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
            {loading && !rows.length ? (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>
                Loading swarm risk coverage…
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>
                No signals match this filter.
              </div>
            ) : filtered.map(row => (
              <div key={row.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                  style={{
                    background: row.covered ? "rgba(0,229,160,0.06)" : "rgba(255,68,68,0.06)",
                    border: `1px solid ${row.covered ? GRN + "33" : RED + "22"}`,
                    borderRadius: 8, padding: "8px 12px",
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                  }}
                >
                  <span style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: severityColor(row.severity),
                    boxShadow: `0 0 6px ${severityColor(row.severity)}`,
                    flexShrink: 0,
                  }} />
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1, wordBreak: "break-word" }}>
                    {row.title}
                  </span>
                  <span style={{
                    fontSize: 8, letterSpacing: 1, fontWeight: 700,
                    color: severityColor(row.severity),
                    background: severityColor(row.severity) + "22",
                    borderRadius: 4, padding: "2px 5px", flexShrink: 0,
                  }}>
                    {row.severity}
                  </span>
                  <span style={{
                    fontSize: 8, letterSpacing: 1, fontWeight: 700,
                    color: row.covered ? GRN : RED,
                    background: (row.covered ? GRN : RED) + "22",
                    borderRadius: 4, padding: "2px 6px", flexShrink: 0,
                  }}>
                    {row.covered ? `${row.matched.length} JOB${row.matched.length !== 1 ? "S" : ""}` : "UNMITIGATED"}
                  </span>
                  <span style={{ color: DIM, fontSize: 9, flexShrink: 0 }}>
                    {expanded === row.id ? "▲" : "▼"}
                  </span>
                </div>

                {expanded === row.id && (
                  <div style={{
                    background: "rgba(255,255,255,0.02)", borderRadius: "0 0 8px 8px",
                    border: `1px solid ${CY}11`, borderTop: "none",
                    padding: "8px 12px",
                  }}>
                    {row.source && (
                      <div style={{ color: DIM, fontSize: 9, marginBottom: 6, letterSpacing: 1 }}>
                        SOURCE: {row.source}
                      </div>
                    )}
                    {row.covered ? (
                      <>
                        <div style={{ color: GRN, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          COVERING SWARM JOBS:
                        </div>
                        {row.matched.map(j => (
                          <div key={j.id} style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "4px 0", borderBottom: `1px solid ${CY}09`,
                          }}>
                            <span style={{
                              fontSize: 8, color: CY,
                              background: CY + "22",
                              borderRadius: 4, padding: "1px 5px", flexShrink: 0,
                            }}>{j.status}</span>
                            <span style={{ color: "#DCEBF5", fontSize: 10 }}>{j.name}</span>
                            {j.kind && (
                              <span style={{ color: DIM, fontSize: 9, marginLeft: "auto" }}>
                                {j.kind}
                              </span>
                            )}
                          </div>
                        ))}
                      </>
                    ) : (
                      <div style={{ color: RED, fontSize: 10, fontStyle: "italic" }}>
                        No active swarm job covers this risk signal — manual intervention required.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{
            padding: "6px 14px", borderTop: `1px solid ${CY}11`,
            color: DIM, fontSize: 9, letterSpacing: 1,
          }}>
            /entities/SwarmJob · /entities/RiskSignal · /v1/jarvis/agent/chat
          </div>
        </div>
      )}

      <style>{`@keyframes sriskpulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.4)}}`}</style>
    </>
  );
}
