/**
 * F75 — Swarm × Scenario Coverage
 *
 * Parallel-fetches /entities/SwarmJob and /v1/scenario/list, then
 * keyword-correlates each scenario against the active swarm catalog to
 * surface which scenarios have automated swarm backing (BACKED) vs which
 * are running without agent support (SOLO).
 *
 * Stat tiles: scenarios / jobs / backed / solo.
 * Filter tabs: ALL | BACKED | SOLO.
 * Expand any scenario → matched swarm jobs with status + progress badge.
 * ▶ ASSESS: 2-sentence AI automation-coverage brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SWSCEN  at bottom:8 left:9644, zIndex 69.
 * Voice:   "swarm scenario / scenario swarm / automated scenarios / swscen / which scenarios have swarm"
 * Event:   jarvis:swscen-toggle
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 9644;
const POLL_MS  = 60_000;
const API_KEY  = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ───────────────────────────────────────────────────

const SWSCEN_RE =
  /\b(swarm\s+scenario|scenario\s+swarm|automated\s+scenarios?|swscen|which\s+scenarios?\s+have\s+swarm|swarm\s+backed\s+scenarios?|scenario\s+automation\s+coverage)\b/i;

export function isSwscenQuery(q) { return SWSCEN_RE.test(q); }

export async function buildSwscenScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [jobRes, scenRes] = await Promise.all([
      fetch(`${base}/entities/SwarmJob`,    { headers: hdr }),
      fetch(`${base}/v1/scenario/list`,     { headers: hdr }),
    ]);
    const jobs      = normaliseJobs(await jobRes.json());
    const scenarios = normaliseScenarios(await scenRes.json());

    const backed = scenarios.filter((sc) => jobs.some((j) => relevance(sc, j) > 0)).length;
    const solo   = scenarios.length - backed;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS swarm-scenario coverage: ${scenarios.length} scenarios catalogued, ` +
          `${jobs.length} swarm jobs active, ${backed} scenarios have at least one ` +
          `keyword-matched swarm job providing automated agent support, ${solo} scenarios ` +
          `are operating without swarm backing — potential automation gaps. ` +
          `Give a 2-sentence automation-coverage brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Swarm-scenario coverage analysis complete, sir.").trim();
  } catch {
    return "Swarm-scenario coverage analysis is unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseJobs(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.jobs)               ? raw.jobs
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.results)            ? raw.results
    : [];
  return arr.map((j, i) => ({
    id:       j.id        || String(i),
    name:     j.name      || j.job_name   || j.title    || `Job ${i + 1}`,
    status:   (j.status   || j.state      || "").toLowerCase(),
    progress: j.progress  != null ? Number(j.progress) : null,
    desc:     (j.description || j.summary || j.tags || "").toString(),
  }));
}

function normaliseScenarios(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.scenarios)          ? raw.scenarios
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.results)            ? raw.results
    : [];
  return arr.map((sc, i) => ({
    id:     sc.id          || String(i),
    title:  sc.title       || sc.name     || sc.scenario_name || `Scenario ${i + 1}`,
    status: (sc.status     || sc.state    || "").toLowerCase(),
    desc:   (sc.description || sc.summary || sc.tags || "").toString(),
  }));
}

function scKeywords(sc) {
  return String(`${sc.title} ${sc.desc}`)
    .toLowerCase()
    .split(/[\s_\-.,/|:@()"']+/)
    .filter((w) => w.length >= 3);
}

function jobKeywords(j) {
  return String(`${j.name} ${j.desc}`)
    .toLowerCase()
    .split(/[\s_\-.,/|:@()"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(scenario, job) {
  const sw = scKeywords(scenario);
  const jw = jobKeywords(job);
  return sw.filter((w) => jw.some((s) => s.includes(w) || w.includes(s))).length;
}

function buildLinked(scenarios, jobs) {
  return scenarios.map((sc) => {
    const matched = jobs
      .map((j) => ({ ...j, score: relevance(sc, j) }))
      .filter((j) => j.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...sc, jobs: matched, backed: matched.length > 0 };
  }).sort((a, b) => (b.backed ? 1 : 0) - (a.backed ? 1 : 0) || b.jobs.length - a.jobs.length);
}

// ── colours ───────────────────────────────────────────────────────────────────

function statusColor(s) {
  if (s === "completed" || s === "done")        return "#4ADE80";
  if (s === "running"   || s === "active")      return C.neon;
  if (s === "pending"   || s === "queued")      return "#F59E0B";
  if (s === "failed"    || s === "error")       return "#EF4444";
  return S.text;
}

function progressBar(val) {
  if (val == null) return null;
  const pct = Math.min(100, Math.max(0, val));
  return (
    <div style={{ height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2, marginTop: 2 }}>
      <div style={{ height: "100%", width: `${pct}%`, background: C.neon, borderRadius: 2, transition: "width 0.3s" }} />
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "BACKED", "SOLO"];

export default function SwarmScenarioCoverage() {
  const [open,      setOpen]      = useState(false);
  const [scenarios, setScenarios] = useState([]);
  const [jobs,      setJobs]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [jobRes, scenRes] = await Promise.all([
        fetch(`${base}/entities/SwarmJob`,  { headers: hdr }),
        fetch(`${base}/v1/scenario/list`,   { headers: hdr }),
      ]);
      setJobs(normaliseJobs(await jobRes.json()));
      setScenarios(normaliseScenarios(await scenRes.json()));
      setLastFetch(new Date());
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
    window.addEventListener("jarvis:swscen-toggle", onToggle);
    return () => window.removeEventListener("jarvis:swscen-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isSwscenQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const linked   = buildLinked(scenarios, jobs);
  const backedCnt = linked.filter((sc) => sc.backed).length;
  const soloCnt   = linked.filter((sc) => !sc.backed).length;

  const visible = linked.filter((sc) => {
    if (filter === "BACKED") return sc.backed;
    if (filter === "SOLO")   return !sc.backed;
    return true;
  });

  async function assess() {
    setAssessing(true);
    const text = await buildSwscenScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Swarm × Scenario Coverage (◈ SWSCEN)"
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
        ◈ SWSCEN{soloCnt > 0 && (
          <span style={{
            marginLeft: 4, background: "#F59E0B", color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{soloCnt}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 68,
          bottom: 36, left: Math.max(8, BTN_LEFT - 280),
          width: 360,
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
              SWARM × SCENARIOS
            </span>
            <button
              onClick={assess}
              disabled={assessing || scenarios.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || scenarios.length === 0) ? 0.4 : 1,
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
              { label: "SCEN",   val: scenarios.length, color: C.blue    },
              { label: "JOBS",   val: jobs.length,      color: C.gold    },
              { label: "BACKED", val: backedCnt,        color: "#4ADE80" },
              { label: "SOLO",   val: soloCnt,          color: "#F59E0B" },
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
          <div style={{ display: "flex", gap: 4, padding: "0 12px 6px" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setFilter(t)} style={{
                flex: 1, background: filter === t ? `${C.neon}22` : "transparent",
                border: `1px solid ${filter === t ? C.neon : S.border}`,
                color: filter === t ? C.neon : S.text,
                borderRadius: S.radius, padding: "2px 0",
                fontFamily: S.mono, fontSize: "8px", letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Scenario list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && scenarios.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No scenarios match.</div>
            ) : visible.map((sc) => (
              <div key={sc.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === sc.id ? null : sc.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${sc.backed ? "#4ADE80" : "#F59E0B"}`,
                  }}
                >
                  <span style={{ color: sc.backed ? "#4ADE80" : "#F59E0B", fontSize: 10, width: 10 }}>
                    {sc.backed ? "●" : "○"}
                  </span>
                  <span style={{
                    flex: 1, color: S.textHi,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    fontSize: "9px",
                  }}>
                    {sc.title}
                  </span>
                  {sc.status && (
                    <span style={{
                      fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                      background: `${statusColor(sc.status)}22`, color: statusColor(sc.status),
                      border: `1px solid ${statusColor(sc.status)}44`,
                      whiteSpace: "nowrap",
                    }}>
                      {sc.status}
                    </span>
                  )}
                  <span style={{
                    color: sc.backed ? "#4ADE80" : "#F59E0B",
                    fontSize: "9px", minWidth: 42, textAlign: "right",
                  }}>
                    {sc.backed ? `${sc.jobs.length} JOB${sc.jobs.length !== 1 ? "S" : ""}` : "SOLO"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9 }}>{expanded === sc.id ? "▴" : "▾"}</span>
                </div>

                {expanded === sc.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {sc.backed ? sc.jobs.map((j) => (
                      <div key={j.id} style={{
                        padding: "3px 0", borderBottom: `1px solid ${S.border}33`,
                      }}>
                        <div style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                        }}>
                          <span style={{
                            color: S.textHi, fontSize: "9px", flex: 1,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {j.name}
                          </span>
                          <span style={{
                            fontSize: "8px", marginLeft: 6, whiteSpace: "nowrap",
                            color: statusColor(j.status),
                          }}>
                            {j.status || "—"}
                          </span>
                        </div>
                        {j.progress != null && progressBar(j.progress)}
                      </div>
                    )) : (
                      <div style={{ color: S.text, fontSize: "9px", padding: "2px 0" }}>
                        No swarm jobs match this scenario — running without automated agent support.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding: "4px 12px", borderTop: `1px solid ${S.border}`,
            color: S.text, fontSize: "8px", letterSpacing: 0.5,
          }}>
            /entities/SwarmJob · /v1/scenario/list · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
