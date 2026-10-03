/**
 * SwarmJobRiskCorrelation — F73 (overnight backlog)
 *
 * Data sources (confirmed-real endpoints):
 *   GET /entities/SwarmJob      → running / recent swarm jobs
 *   GET /entities/RiskSignal    → active risk signals
 *
 * For each SwarmJob, keyword-correlates against all active risk signals to classify:
 *   THREATENED — job matches ≥1 risk signal (≥2 keyword hits)
 *   SECURE     — no matching risk signal found
 *
 * Displays:
 *   - Stat tiles: total jobs / risks / threatened / secure
 *   - ALL / THREATENED / SECURE filter tabs + text search
 *   - Per-job row: status dot + name + classification badge; expand → matched risk cards
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence threat brief + TTS
 *
 * Toggle:  ◈ SWRISK  at bottom: 8, left: 20200, zIndex: 77
 * Event:   jarvis:swrisk-toggle
 * Voice:   "swarm risk" / "swrisk" / "threatened jobs" / "swarm threat" / "job risk"
 * Refresh: 90 s while open.
 *
 * Exports isSwriskQuery / buildSwriskScript for JarvisBrain.
 * Mounted in src/App.jsx.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const ACC  = "#22D3EE";
const AM   = "#F59E0B";
const RED  = "#EF4444";
const DIM  = "#0B1420";
const POLL = 90_000;
const MONO = "'JetBrains Mono','Courier New',monospace";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

/* ── keyword helpers ───────────────────────────────────────────────────────── */

function kw(obj) {
  return JSON.stringify(obj)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function classify(job, risks) {
  const jk = kw(job);
  for (const r of risks) {
    const rk = kw(r);
    const hits = jk.filter((w) => rk.includes(w)).length;
    if (hits >= 2) return "THREATENED";
  }
  return "SECURE";
}

function matchedRisks(job, risks) {
  const jk = kw(job);
  return risks
    .map((r) => {
      const rk = kw(r);
      const score = jk.filter((w) => rk.includes(w)).length;
      return { r, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function norm(raw, hint) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    for (const k of [hint, "data", "items", "results", "records", "risks", "signals"]) {
      if (Array.isArray(raw[k])) return raw[k];
    }
    for (const v of Object.values(raw)) {
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

/* ── exported helpers for JarvisBrain ─────────────────────────────────────── */

export function isSwriskQuery(q) {
  return /\b(swarm[\s_-]*risk|swrisk|threatened[\s_-]*jobs|swarm[\s_-]*threat|job[\s_-]*risk|risk[\s_-]*swarm|swarm[\s_-]*danger|job[\s_-]*threat)\b/i.test(
    q || ""
  );
}

export async function buildSwriskScript() {
  try {
    const [jr, rr] = await Promise.all([
      fetch(`${apiBase()}/entities/SwarmJob`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
      fetch(`${apiBase()}/entities/RiskSignal`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    const jobs  = norm(jr.ok ? await jr.json() : [], "swarm_jobs");
    const risks = norm(rr.ok ? await rr.json() : [], "risks");
    window.dispatchEvent(new CustomEvent("jarvis:swrisk-toggle"));
    if (!jobs.length)
      return "No swarm jobs on record, sir. Swarm risk correlation panel is open.";
    const threatened = jobs.filter((j) => classify(j, risks) === "THREATENED").length;
    const secure     = jobs.filter((j) => classify(j, risks) === "SECURE").length;
    return (
      `Swarm risk correlation online, sir. ${jobs.length} swarm job${jobs.length !== 1 ? "s" : ""} ` +
      `cross-referenced against ${risks.length} active risk signal${risks.length !== 1 ? "s" : ""}. ` +
      `${threatened} job${threatened !== 1 ? "s" : ""} threatened; ${secure} secure. Panel is open.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:swrisk-toggle"));
    return "Swarm risk correlation panel open, sir.";
  }
}

/* ── TTS helper ────────────────────────────────────────────────────────────── */

async function tts(text) {
  try {
    const r = await fetch(`${apiBase()}/v1/voice/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ text: text.slice(0, 500), voice: "onyx" }),
    });
    if (!r.ok) return;
    const url = URL.createObjectURL(await r.blob());
    const a = new Audio(url);
    a.play();
    a.onended = () => URL.revokeObjectURL(url);
  } catch { /* TTS unavailable */ }
}

/* ── ASSESS helper ─────────────────────────────────────────────────────────── */

async function assessJob(job, risks, onSpeak) {
  const matched = matchedRisks(job, risks)
    .map(({ r }) => r.title ?? r.name ?? r.signal_type ?? r.id ?? "unknown")
    .join(", ");
  const prompt =
    `In exactly 2 sentences, summarise this swarm job's risk exposure for a senior operator. ` +
    `Job: ${JSON.stringify(job).slice(0, 400)}. ` +
    (matched ? `Matched risk signals: ${matched}.` : "No matching risk signals found.");
  try {
    const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ message: prompt }),
    });
    const j = r.ok ? await r.json() : null;
    const text = j?.response ?? j?.reply ?? j?.message ?? j?.content ?? j?.answer ?? null;
    if (text) onSpeak(text);
    return text ?? "No assessment available.";
  } catch {
    return "Assessment unavailable.";
  }
}

const CLASS_COLOR = {
  THREATENED: RED,
  SECURE:     ACC,
};

/* ── component ─────────────────────────────────────────────────────────────── */

export default function SwarmJobRiskCorrelation() {
  const [open, setOpen]             = useState(false);
  const [jobs, setJobs]             = useState([]);
  const [risks, setRisks]           = useState([]);
  const [loading, setLoading]       = useState(false);
  const [err, setErr]               = useState(null);
  const [search, setSearch]         = useState("");
  const [filter, setFilter]         = useState("ALL");
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(null);
  const [assessText, setAssessText] = useState({});
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setErr(null);
    try {
      const [jr, rr] = await Promise.all([
        fetch(`${apiBase()}/entities/SwarmJob`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
        fetch(`${apiBase()}/entities/RiskSignal`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
      ]);
      setJobs(norm(jr.ok ? await jr.json() : [], "swarm_jobs"));
      setRisks(norm(rr.ok ? await rr.json() : [], "risks"));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, POLL);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  useEffect(() => {
    const toggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:swrisk-toggle", toggle);
    return () => window.removeEventListener("jarvis:swrisk-toggle", toggle);
  }, []);

  const handleAssess = async (job) => {
    const key = job.id ?? job.job_id ?? JSON.stringify(job).slice(0, 40);
    setAssessing(key);
    const text = await assessJob(job, risks, tts);
    setAssessText((prev) => ({ ...prev, [String(key)]: text }));
    setAssessing(null);
  };

  const classified = jobs.map((j) => ({
    job:     j,
    status:  classify(j, risks),
    matches: matchedRisks(j, risks),
  }));

  const filtered = classified.filter(({ job, status }) => {
    if (filter !== "ALL" && status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!JSON.stringify(job).toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const counts = {
    THREATENED: classified.filter((c) => c.status === "THREATENED").length,
    SECURE:     classified.filter((c) => c.status === "SECURE").length,
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Swarm Job Risk Correlation"
        style={{
          position: "fixed", bottom: 8, left: 20200, zIndex: 77,
          fontFamily: MONO, fontSize: 10, letterSpacing: 1,
          background: `${DIM}CC`, border: `1px solid ${ACC}44`,
          color: ACC, borderRadius: 4, padding: "3px 7px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 4,
        }}
      >
        ◈ SWRISK
        {counts.THREATENED > 0 && (
          <span style={{
            background: RED, color: "#fff", borderRadius: "50%",
            fontSize: 8, padding: "1px 4px", minWidth: 14, textAlign: "center",
            fontWeight: 700,
          }}>
            {counts.THREATENED}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 50, right: 24, zIndex: 77,
      width: 500, maxHeight: "72vh",
      background: `${DIM}F2`, border: `1px solid ${ACC}33`,
      borderRadius: 10, display: "flex", flexDirection: "column",
      fontFamily: MONO, fontSize: 12, color: "#C0D0E0",
      boxShadow: `0 0 32px ${ACC}18`,
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", borderBottom: `1px solid ${ACC}22`,
      }}>
        <span style={{ color: ACC, letterSpacing: 2, fontSize: 11, fontWeight: 700 }}>
          ◈ SWARM JOB RISK CORRELATION
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {loading && <span style={{ fontSize: 9, color: "#4E6070" }}>SYNCING…</span>}
          <button
            onClick={() => setOpen(false)}
            style={{ background: "none", border: "none", color: "#4E6070", cursor: "pointer", fontSize: 16 }}
          >
            ×
          </button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${ACC}18` }}>
        {[["THREATENED", RED], ["SECURE", ACC]].map(([label, c]) => (
          <div key={label} style={{
            flex: 1, textAlign: "center",
            background: `${c}11`, border: `1px solid ${c}33`, borderRadius: 6, padding: "4px 0",
          }}>
            <div style={{ color: c, fontSize: 14, fontWeight: 700 }}>{counts[label]}</div>
            <div style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
        <div style={{
          flex: 1, textAlign: "center",
          background: `${AM}11`, border: `1px solid ${AM}33`, borderRadius: 6, padding: "4px 0",
        }}>
          <div style={{ color: AM, fontSize: 14, fontWeight: 700 }}>{jobs.length}</div>
          <div style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1 }}>JOBS</div>
        </div>
        <div style={{
          flex: 1, textAlign: "center",
          background: `${RED}11`, border: `1px solid ${RED}33`, borderRadius: 6, padding: "4px 0",
        }}>
          <div style={{ color: RED, fontSize: 14, fontWeight: 700 }}>{risks.length}</div>
          <div style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1 }}>RISKS</div>
        </div>
      </div>

      {/* filter tabs + search */}
      <div style={{
        display: "flex", gap: 6, padding: "6px 14px",
        borderBottom: `1px solid ${ACC}18`, alignItems: "center",
      }}>
        {["ALL", "THREATENED", "SECURE"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: 1,
            background: filter === f ? `${ACC}22` : "none",
            border: `1px solid ${filter === f ? ACC : "#1E2E40"}`,
            color: filter === f ? ACC : "#4E6070",
            borderRadius: 4, padding: "2px 6px", cursor: "pointer",
          }}>{f}</button>
        ))}
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: "auto", background: "#0D1826", border: `1px solid ${ACC}33`,
            borderRadius: 4, color: "#C0D0E0", fontFamily: MONO,
            fontSize: 10, padding: "2px 8px", outline: "none", width: 100,
          }}
        />
      </div>

      {/* job list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
        {err && (
          <div style={{ color: RED, fontSize: 10, padding: 8 }}>Error: {err}</div>
        )}
        {!err && filtered.length === 0 && !loading && (
          <div style={{ color: "#4E6070", fontSize: 10, padding: 8 }}>
            No swarm jobs match the current filter.
          </div>
        )}
        {filtered.map(({ job, status, matches }, i) => {
          const key  = job.id ?? job.job_id ?? i;
          const sKey = String(key);
          const name  = job.name ?? job.title ?? job.job_type ?? job.type ?? `Job ${i + 1}`;
          const state = job.status ?? job.state ?? job.progress ?? null;
          const statusColor = CLASS_COLOR[status];
          const isExp = expanded === key;
          return (
            <div
              key={key}
              style={{
                marginBottom: 6,
                borderLeft: `3px solid ${statusColor}66`,
                background: isExp ? `${statusColor}08` : "transparent",
                borderRadius: "0 6px 6px 0", padding: "6px 8px",
                cursor: "pointer",
              }}
              onClick={() => setExpanded(isExp ? null : key)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: statusColor, flexShrink: 0,
                  boxShadow: status === "THREATENED"
                    ? `0 0 6px ${statusColor}, 0 0 12px ${statusColor}66`
                    : "none",
                  animation: status === "THREATENED" ? "swrisk-pulse 1.4s ease-in-out infinite" : "none",
                }} />
                <span style={{ flex: 1, color: "#D0E0F0", fontSize: 11 }}>{name}</span>
                {state && <span style={{ color: "#4E6070", fontSize: 9 }}>{state}</span>}
                <span style={{
                  fontFamily: MONO, fontSize: 9, color: statusColor,
                  border: `1px solid ${statusColor}55`, borderRadius: 3,
                  padding: "1px 5px", letterSpacing: 1, flexShrink: 0,
                }}>
                  {status}
                </span>
                {matches.length > 0 && (
                  <span style={{ color: "#4E6070", fontSize: 9 }}>
                    {matches.length} risk{matches.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {isExp && (
                <div style={{ marginTop: 8, paddingLeft: 14 }}>
                  {matches.length > 0 ? (
                    <>
                      <div style={{ color: "#7090A0", fontSize: 9, marginBottom: 4, letterSpacing: 1 }}>
                        MATCHED RISK SIGNALS
                      </div>
                      {matches.map(({ r, score }) => {
                        const rName = r.title ?? r.name ?? r.signal_type ?? r.id ?? JSON.stringify(r).slice(0, 50);
                        const sev   = r.severity ?? r.score ?? r.level ?? null;
                        const sevColor = sev >= 80 ? RED : sev >= 50 ? AM : ACC;
                        return (
                          <div key={rName} style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            fontSize: 10, color: "#8090A0", marginBottom: 3,
                            padding: "2px 6px", background: "#0D1826", borderRadius: 4,
                          }}>
                            <span>{rName}</span>
                            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              {sev != null && (
                                <span style={{
                                  color: sevColor, fontSize: 8,
                                  border: `1px solid ${sevColor}44`, borderRadius: 3,
                                  padding: "1px 4px", letterSpacing: 1,
                                }}>
                                  SEV {sev}
                                </span>
                              )}
                              <span style={{ color: ACC, fontSize: 9 }}>score {score}</span>
                            </span>
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    <div style={{ color: "#3E5060", fontSize: 10, marginBottom: 4 }}>
                      No matching risk signals found.
                    </div>
                  )}

                  <button
                    onClick={(e) => { e.stopPropagation(); handleAssess(job); }}
                    disabled={assessing === sKey}
                    style={{
                      fontFamily: MONO, fontSize: 9, letterSpacing: 1,
                      background: `${ACC}18`, border: `1px solid ${ACC}44`,
                      color: ACC, borderRadius: 4, padding: "3px 8px",
                      cursor: assessing === sKey ? "wait" : "pointer", marginTop: 6,
                    }}
                  >
                    {assessing === sKey ? "ASSESSING…" : "▶ ASSESS RISK"}
                  </button>

                  {assessText[sKey] && (
                    <div style={{
                      marginTop: 6, padding: "6px 8px",
                      background: `${ACC}0A`, border: `1px solid ${ACC}22`,
                      borderRadius: 4, color: "#A0C0D0", fontSize: 10, lineHeight: 1.5,
                    }}>
                      {assessText[sKey]}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* keyframe animation injected once */}
      <style>{`
        @keyframes swrisk-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>

      {/* footer */}
      <div style={{
        padding: "6px 14px", borderTop: `1px solid ${ACC}18`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ color: "#2E4060", fontSize: 9, letterSpacing: 1 }}>
          {filtered.length}/{jobs.length} JOBS · AUTO-REFRESH 90s
        </span>
        <button
          onClick={fetchData}
          style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: 1,
            background: "none", border: `1px solid ${ACC}33`,
            color: ACC, borderRadius: 3, padding: "2px 7px", cursor: "pointer",
          }}
        >
          ↻ SYNC
        </button>
      </div>
    </div>
  );
}
