/**
 * F93 — Swarm Job × Risk Signal Coverage
 *
 * Parallel-fetches /entities/SwarmJob + /entities/RiskSignal, then
 * keyword-correlates each active risk signal against swarm jobs to surface
 * whether the signal is MITIGATING (at least one job is targeting it) or
 * UNADDRESSED (no swarm job covers it — operational gap).
 *
 * Stat tiles: jobs / signals / mitigating / unaddressed.
 * Filter tabs: ALL | MITIGATING | UNADDRESSED.
 * Expand any signal → matched jobs with status + progress + relevance score.
 * Red badge on unaddressed CRITICAL/HIGH count.
 * ▶ ASSESS: 2-sentence risk-mitigation brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SWRSK  at bottom:8 left:25600, zIndex 69.
 * Voice:   "swarm risk / job risk coverage / risk mitigation jobs /
 *           unaddressed risks / swrsk"
 * Event:   jarvis:swrsk-toggle
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 25600;
const POLL_MS  = 60_000;

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ──────────────────────────────────────────────────

const SWRSK_RE =
  /\b(swarm\s+risk|job\s+risk\s+(coverage|map)|risk\s+mitigation\s+jobs?|unaddressed\s+risks?|swarm\s+coverage|which\s+(jobs?|swarms?)\s+(cover|address|mitigate)|swrsk)\b/i;

export function isSwrskQuery(q) { return SWRSK_RE.test(q); }

export async function buildSwrskScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [jRes, rRes] = await Promise.all([
      fetch(`${base}/entities/SwarmJob`,    { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`,  { headers: hdr }),
    ]);
    const jobs    = normaliseJobs(await jRes.json());
    const signals = normaliseSignals(await rRes.json());

    const mitigating  = signals.filter((s) =>
      jobs.some((j) => relevance(s, j) > 0)
    ).length;
    const unaddressed = signals.length - mitigating;
    const critHigh    = signals.filter(
      (s) => !jobs.some((j) => relevance(s, j) > 0) &&
             ["CRITICAL", "HIGH"].includes((s.severity || "").toUpperCase())
    ).length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS swarm-to-risk coverage analysis: ${jobs.length} swarm jobs active, ` +
          `${signals.length} risk signals in catalog, ${mitigating} signals have at least one ` +
          `swarm job addressing them, ${unaddressed} risk signals are unaddressed (${critHigh} ` +
          `are CRITICAL or HIGH severity with no swarm coverage). ` +
          `Give a 2-sentence operational risk-mitigation assessment — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Swarm risk coverage analysis complete, sir.").trim();
  } catch {
    return "Swarm risk coverage analysis unavailable at this time, sir.";
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normaliseJobs(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.results)            ? raw.results
    : Array.isArray(raw?.swarm_jobs)         ? raw.swarm_jobs
    : [];
  return arr.map((j, i) => ({
    id:        j.id        || String(i),
    name:      j.name      || j.title     || `Job ${i + 1}`,
    objective: (j.objective || j.description || j.goal || "").toString().slice(0, 300),
    type:      j.type      || j.job_type  || "",
    status:    j.status    || j.state     || "unknown",
    progress:  typeof j.progress === "number" ? j.progress
               : typeof j.completion === "number" ? j.completion : null,
  }));
}

function normaliseSignals(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.results)            ? raw.results
    : Array.isArray(raw?.risk_signals)       ? raw.risk_signals
    : [];
  return arr.map((s, i) => ({
    id:          s.id          || String(i),
    title:       s.title       || s.name        || `Signal ${i + 1}`,
    description: (s.description || s.summary    || s.details || "").toString().slice(0, 300),
    severity:    s.severity    || s.level       || s.risk_level || "UNKNOWN",
    type:        s.type        || s.signal_type || s.category   || "",
    tags:        Array.isArray(s.tags) ? s.tags.join(" ") : (s.tags || ""),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()[\]]+/)
    .filter((w) => w.length >= 3);
}

function relevance(signal, job) {
  const sw = keywords(`${signal.title} ${signal.description} ${signal.type} ${signal.tags}`);
  const jw = keywords(`${job.name} ${job.objective} ${job.type}`);
  return sw.filter((w) => jw.some((jj) => jj.includes(w) || w.includes(jj))).length;
}

function buildCorrelated(signals, jobs) {
  return signals.map((s) => {
    const matched = jobs
      .map((j) => ({ ...j, score: relevance(s, j) }))
      .filter((j) => j.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...s, jobs: matched, mitigating: matched.length > 0 };
  });
}

function sevColor(sev) {
  const u = (sev || "").toUpperCase();
  if (u === "CRITICAL") return "#FF3030";
  if (u === "HIGH")     return "#FF8C00";
  if (u === "MEDIUM")   return "#FFD700";
  if (u === "LOW")      return "#4ADE80";
  return S.textMuted;
}

function statusColor(st) {
  const u = (st || "").toUpperCase();
  if (u === "RUNNING")   return "#4ADE80";
  if (u === "COMPLETED") return C.blue;
  if (u === "FAILED")    return "#FF3030";
  if (u === "QUEUED")    return "#FFD700";
  return S.textMuted;
}

// ── component ────────────────────────────────────────────────────────────────

const TABS = ["ALL", "MITIGATING", "UNADDRESSED"];

export default function SwarmRiskCoverage() {
  const [open,      setOpen]      = useState(false);
  const [jobs,      setJobs]      = useState([]);
  const [signals,   setSignals]   = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [query,     setQuery]     = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [jRes, rRes] = await Promise.all([
        fetch(`${base}/entities/SwarmJob`,   { headers: hdr }),
        fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
      ]);
      setJobs(normaliseJobs(await jRes.json()));
      setSignals(normaliseSignals(await rRes.json()));
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:swrsk-toggle", onToggle);
    return () => window.removeEventListener("jarvis:swrsk-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isSwrskQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const correlated  = buildCorrelated(signals, jobs);
  const mitigating  = correlated.filter((s) => s.mitigating).length;
  const unaddressed = correlated.filter((s) => !s.mitigating).length;
  const critHighBadge = correlated.filter(
    (s) => !s.mitigating && ["CRITICAL", "HIGH"].includes(s.severity.toUpperCase())
  ).length;

  const visible = correlated.filter((s) => {
    if (filter === "MITIGATING")  return s.mitigating;
    if (filter === "UNADDRESSED") return !s.mitigating;
    const q = query.toLowerCase();
    return !q || s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
  });

  async function assess() {
    setAssessing(true);
    const text = await buildSwrskScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Swarm Job × Risk Signal Coverage (◈ SWRSK)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 69,
          background: open ? "rgba(0,200,120,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? C.neon : S.border}`,
          borderRadius: S.radius, color: open ? C.neon : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${C.neon}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ SWRSK{critHighBadge > 0 && (
          <span style={{
            marginLeft: 4, background: "#FF3030", color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{critHighBadge}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 68,
          bottom: 36, left: Math.max(8, BTN_LEFT - 260),
          width: 340,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${C.neon}`,
          borderRadius: S.radius,
          boxShadow: "0 4px 28px rgba(0,0,0,0.55)",
          fontFamily: S.mono, fontSize: S.fs.xs,
          display: "flex", flexDirection: "column",
          maxHeight: "68vh", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            <span style={{ color: C.neon, letterSpacing: 2, fontWeight: 700 }}>
              SWARM–RISK COVERAGE
            </span>
            <button
              onClick={assess}
              disabled={assessing || signals.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || signals.length === 0) ? 0.4 : 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 6, padding: "8px 12px",
          }}>
            {[
              { label: "JOBS",        val: jobs.length,      color: C.blue    },
              { label: "SIGNALS",     val: signals.length,   color: C.neon    },
              { label: "MITIGATING",  val: mitigating,       color: "#4ADE80" },
              { label: "UNADDRESSED", val: unaddressed,      color: "#FF3030" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                background: "rgba(0,0,0,0.3)", borderRadius: 6,
                padding: "5px 4px", textAlign: "center",
              }}>
                <div style={{ color, fontSize: S.fs.lg, fontWeight: 700 }}>{val}</div>
                <div style={{ color: S.text, fontSize: "8px", letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{
            display: "flex", gap: 4, padding: "0 12px 8px",
            borderBottom: `1px solid ${S.border}`,
          }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setFilter(t)} style={{
                background: filter === t ? `${C.neon}22` : "transparent",
                border: `1px solid ${filter === t ? C.neon : S.border}`,
                color: filter === t ? C.neon : S.textMuted,
                borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Search (ALL tab only) */}
          {filter === "ALL" && (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search risk signals…"
              style={{
                margin: "6px 12px 2px",
                background: "rgba(0,0,0,0.4)", border: `1px solid ${S.border}`,
                borderRadius: S.radius, color: S.textHi,
                fontFamily: S.mono, fontSize: S.fs.xxs,
                padding: "4px 8px", outline: "none",
              }}
            />
          )}

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 12px 10px" }}>
            {loading && signals.length === 0 && (
              <div style={{ color: S.textMuted, padding: "12px 0" }}>◌ loading…</div>
            )}
            {!loading && visible.length === 0 && (
              <div style={{ color: S.textMuted, padding: "12px 0" }}>no signals in this filter</div>
            )}
            {visible.map((s) => (
              <div key={s.id} style={{
                borderBottom: `1px solid ${S.border}`, paddingBottom: 6, marginBottom: 6,
              }}>
                <div
                  style={{
                    display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                    gap: 6, cursor: "pointer",
                  }}
                  onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 5, marginBottom: 2,
                    }}>
                      <span style={{
                        color: s.mitigating ? "#4ADE80" : "#FF3030",
                        fontWeight: 600, fontSize: "9px",
                      }}>
                        {s.mitigating ? "● MIT" : "○ UNADDR"}
                      </span>
                      <span style={{
                        fontSize: "8px", fontWeight: 700, letterSpacing: 1,
                        color: sevColor(s.severity),
                      }}>
                        {s.severity.toUpperCase()}
                      </span>
                      <span style={{ color: S.textHi, fontWeight: 500, fontSize: S.fs.xxs }}>
                        {s.title.slice(0, 34)}{s.title.length > 34 ? "…" : ""}
                      </span>
                    </div>
                    {s.description && (
                      <div style={{ color: S.textMuted, fontSize: "9px" }}>
                        {s.description.slice(0, 72)}{s.description.length > 72 ? "…" : ""}
                      </div>
                    )}
                  </div>
                  <span style={{ color: S.textMuted, fontSize: "9px", flexShrink: 0 }}>
                    {s.jobs.length > 0 ? `${s.jobs.length} job${s.jobs.length > 1 ? "s" : ""}` : "—"}
                  </span>
                </div>

                {expanded === s.id && s.jobs.length > 0 && (
                  <div style={{ marginTop: 6, paddingLeft: 8 }}>
                    {s.jobs.slice(0, 4).map((j) => (
                      <div key={j.id} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "3px 0", borderTop: `1px solid ${S.border}`,
                      }}>
                        <div style={{ flex: 1 }}>
                          <span style={{ color: C.blue, fontSize: "9px" }}>
                            {j.name.slice(0, 28)}{j.name.length > 28 ? "…" : ""}
                          </span>
                          <span style={{
                            marginLeft: 5, color: statusColor(j.status),
                            fontSize: "8px", letterSpacing: 1,
                          }}>
                            {j.status.toUpperCase()}
                          </span>
                          {j.progress !== null && (
                            <span style={{ marginLeft: 5, color: S.textMuted, fontSize: "8px" }}>
                              {j.progress}%
                            </span>
                          )}
                        </div>
                        <span style={{
                          color: S.textMuted, fontSize: "9px",
                          background: "rgba(0,200,120,0.12)",
                          borderRadius: 4, padding: "0 4px", flexShrink: 0,
                        }}>
                          {j.score}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {expanded === s.id && s.jobs.length === 0 && (
                  <div style={{
                    marginTop: 6, paddingLeft: 8,
                    color: "#FF3030", fontSize: "9px",
                  }}>
                    ⚠ no swarm jobs found targeting this risk signal
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
