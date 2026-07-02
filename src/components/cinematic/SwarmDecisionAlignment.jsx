/**
 * F109 — Swarm Job × Decision Alignment
 *
 * Parallel-fetches /entities/SwarmJob + /v1/decision/list, then
 * keyword-correlates each swarm job against strategic decisions to surface
 * MANDATED (at least one decision authorizes it) vs AUTONOMOUS (no decision
 * record — potential governance gap).
 *
 * Stat tiles: jobs / decisions / mandated / autonomous.
 * Filter tabs: ALL | MANDATED | AUTONOMOUS.
 * Expand any job → matched decisions with rationale snippet + relevance score.
 * Amber badge on autonomous count.
 * ▶ ASSESS: 2-sentence governance-gap brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SWDEC  at bottom:8 left:30680, zIndex 69.
 * Voice:   "swarm decision / mandated swarms / autonomous swarm /
 *           swarm governance / swdec"
 * Event:   jarvis:swdec-toggle
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 30680;
const POLL_MS  = 90_000;

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

const SWDEC_RE =
  /\b(swarm\s+decision|mandated\s+swarm|autonomous\s+swarm|swarm\s+governance|which\s+(swarm|job)s?\s+(have|match)\s+decisions?|decision[- ]backed\s+swarm|swdec)\b/i;

export function isSwdecQuery(q) { return SWDEC_RE.test(q); }

export async function buildSwdecScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [jRes, dRes] = await Promise.all([
      fetch(`${base}/entities/SwarmJob`,   { headers: hdr }),
      fetch(`${base}/v1/decision/list`,    { headers: hdr }),
    ]);
    const jobs      = normaliseJobs(await jRes.json());
    const decisions = normaliseDecisions(await dRes.json());

    const mandated  = jobs.filter((j) => decisions.some((d) => relevance(j, d) > 0)).length;
    const autonomous = jobs.length - mandated;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS swarm-decision governance analysis: ${jobs.length} swarm jobs active, ` +
          `${decisions.length} strategic decisions on record, ${mandated} swarm jobs are ` +
          `decision-backed (governance documented), ${autonomous} are running autonomously ` +
          `(no matching strategic decision found). ` +
          `Give a 2-sentence governance-gap assessment — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Swarm decision alignment analysis complete, sir.").trim();
  } catch {
    return "Swarm decision alignment analysis unavailable at this time, sir.";
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normaliseJobs(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.data)            ? raw.data
    : Array.isArray(raw?.items)           ? raw.items
    : Array.isArray(raw?.results)         ? raw.results
    : Array.isArray(raw?.swarm_jobs)      ? raw.swarm_jobs
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

function normaliseDecisions(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.results)            ? raw.results
    : Array.isArray(raw?.decisions)          ? raw.decisions
    : [];
  return arr.map((d, i) => ({
    id:              d.id              || String(i),
    title:           d.title           || d.name     || `Decision ${i + 1}`,
    reason:          (d.reason         || d.rationale || d.justification || "").toString().slice(0, 200),
    alternatives:    (d.alternatives   || "").toString().slice(0, 120),
    expected_outcome:(d.expected_outcome || d.outcome || "").toString().slice(0, 120),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()[\]]+/)
    .filter((w) => w.length >= 3);
}

function relevance(job, decision) {
  const jw = keywords(`${job.name} ${job.objective} ${job.type}`);
  const dw = keywords(`${decision.title} ${decision.reason} ${decision.alternatives} ${decision.expected_outcome}`);
  return jw.filter((w) => dw.some((dv) => dv.includes(w) || w.includes(dv))).length;
}

function buildCorrelated(jobs, decisions) {
  return jobs.map((j) => {
    const matched = decisions
      .map((d) => ({ ...d, score: relevance(j, d) }))
      .filter((d) => d.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...j, decisions: matched, mandated: matched.length > 0 };
  });
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

const TABS = ["ALL", "MANDATED", "AUTONOMOUS"];

export default function SwarmDecisionAlignment() {
  const [open,      setOpen]      = useState(false);
  const [jobs,      setJobs]      = useState([]);
  const [decisions, setDecisions] = useState([]);
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
      const [jRes, dRes] = await Promise.all([
        fetch(`${base}/entities/SwarmJob`,  { headers: hdr }),
        fetch(`${base}/v1/decision/list`,   { headers: hdr }),
      ]);
      setJobs(normaliseJobs(await jRes.json()));
      setDecisions(normaliseDecisions(await dRes.json()));
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
    window.addEventListener("jarvis:swdec-toggle", onToggle);
    return () => window.removeEventListener("jarvis:swdec-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isSwdecQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const correlated  = buildCorrelated(jobs, decisions);
  const mandated    = correlated.filter((j) => j.mandated).length;
  const autonomous  = correlated.filter((j) => !j.mandated).length;

  const visible = correlated.filter((j) => {
    if (filter === "MANDATED")  return j.mandated;
    if (filter === "AUTONOMOUS") return !j.mandated;
    const q = query.toLowerCase();
    return !q || j.name.toLowerCase().includes(q) || j.objective.toLowerCase().includes(q);
  });

  async function assess() {
    setAssessing(true);
    const text = await buildSwdecScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const AMBER = "#FFB347";

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Swarm Job × Decision Alignment (◈ SWDEC)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 69,
          background: open ? "rgba(255,179,71,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? AMBER : S.border}`,
          borderRadius: S.radius, color: open ? AMBER : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${AMBER}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ SWDEC{autonomous > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{autonomous}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 68,
          bottom: 36, left: Math.max(8, BTN_LEFT - 260),
          width: 340,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${AMBER}`,
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
            <span style={{ color: AMBER, letterSpacing: 2, fontWeight: 700 }}>
              SWARM–DECISION ALIGNMENT
            </span>
            <button
              onClick={assess}
              disabled={assessing || jobs.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || jobs.length === 0) ? 0.4 : 1,
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
              { label: "JOBS",       val: jobs.length,      color: C.blue    },
              { label: "DECISIONS",  val: decisions.length, color: C.neon    },
              { label: "MANDATED",   val: mandated,         color: "#4ADE80" },
              { label: "AUTONOMOUS", val: autonomous,        color: AMBER     },
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
                background: filter === t ? `${AMBER}22` : "transparent",
                border: `1px solid ${filter === t ? AMBER : S.border}`,
                color: filter === t ? AMBER : S.textMuted,
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
              placeholder="search swarm jobs…"
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
            {loading && jobs.length === 0 && (
              <div style={{ color: S.textMuted, padding: "12px 0" }}>◌ loading…</div>
            )}
            {!loading && visible.length === 0 && (
              <div style={{ color: S.textMuted, padding: "12px 0" }}>no jobs in this filter</div>
            )}
            {visible.map((j) => (
              <div key={j.id} style={{
                borderBottom: `1px solid ${S.border}`, paddingBottom: 6, marginBottom: 6,
              }}>
                <div
                  style={{
                    display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                    gap: 6, cursor: "pointer",
                  }}
                  onClick={() => setExpanded(expanded === j.id ? null : j.id)}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 5, marginBottom: 2,
                    }}>
                      <span style={{
                        color: j.mandated ? "#4ADE80" : AMBER,
                        fontWeight: 600, fontSize: "9px",
                      }}>
                        {j.mandated ? "● MANDATE" : "○ AUTO"}
                      </span>
                      <span style={{
                        color: statusColor(j.status),
                        fontSize: "8px", letterSpacing: 1, fontWeight: 700,
                      }}>
                        {j.status.toUpperCase()}
                      </span>
                      <span style={{ color: S.textHi, fontWeight: 500, fontSize: S.fs.xxs }}>
                        {j.name.slice(0, 30)}{j.name.length > 30 ? "…" : ""}
                      </span>
                    </div>
                    {j.objective && (
                      <div style={{ color: S.textMuted, fontSize: "9px" }}>
                        {j.objective.slice(0, 72)}{j.objective.length > 72 ? "…" : ""}
                      </div>
                    )}
                  </div>
                  <span style={{ color: S.textMuted, fontSize: "9px", flexShrink: 0 }}>
                    {j.decisions.length > 0
                      ? `${j.decisions.length} dec${j.decisions.length > 1 ? "s" : ""}`
                      : "—"}
                  </span>
                </div>

                {expanded === j.id && j.decisions.length > 0 && (
                  <div style={{ marginTop: 6, paddingLeft: 8 }}>
                    {j.decisions.slice(0, 4).map((d) => (
                      <div key={d.id} style={{
                        padding: "4px 0", borderTop: `1px solid ${S.border}`,
                      }}>
                        <div style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                        }}>
                          <span style={{ color: C.blue, fontSize: "9px" }}>
                            {d.title.slice(0, 30)}{d.title.length > 30 ? "…" : ""}
                          </span>
                          <span style={{
                            color: S.textMuted, fontSize: "9px",
                            background: `${AMBER}22`,
                            borderRadius: 4, padding: "0 4px", flexShrink: 0,
                          }}>
                            {d.score}
                          </span>
                        </div>
                        {d.reason && (
                          <div style={{ color: S.textMuted, fontSize: "8px", marginTop: 1 }}>
                            {d.reason.slice(0, 60)}{d.reason.length > 60 ? "…" : ""}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {expanded === j.id && j.decisions.length === 0 && (
                  <div style={{
                    marginTop: 6, paddingLeft: 8,
                    color: AMBER, fontSize: "9px",
                  }}>
                    ⚠ no strategic decisions found for this swarm job
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
