/**
 * F129 — SwarmJob × Knowledge Alignment (SJKA)
 *
 * Parallel-fetches /entities/SwarmJob and /knowledge/ every 90 s.
 * Keyword-correlates each swarm job (name, description, target, objective,
 * tags) against KB articles (title, content, topic, tags) to classify:
 *
 *  SUPPORTED   — swarm job keywords match at least one KB article
 *  UNSUPPORTED — no knowledge-base coverage found
 *
 * Stat tiles: jobs / articles / supported / unsupported
 * Amber badge on unsupported count.
 * Filter tabs: ALL / SUPPORTED / UNSUPPORTED + text search.
 * Expand job row → matched KB articles with topic badge + relevance score bar.
 * ▶ ASSESS: 2-sentence brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SJKA  at left:4440 bottom:18, zIndex:68.
 * Event:   jarvis:sjka-toggle
 * Voice:   "swarm knowledge / knowledge swarm / sjka / swarm kb / unsupported swarm /
 *           swarm knowledge alignment / swarm article / swarm documentation /
 *           which swarm jobs have knowledge / swarm kb coverage"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3B6B";
const MUTED = "#6E8AA0";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 4440;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseJobs(raw) {
  return normaliseArray(raw).map((j, i) => ({
    id:          String(j.id ?? j.job_id ?? i),
    name:        j.name ?? j.job_name ?? j.title ?? `Job ${i + 1}`,
    description: j.description ?? j.details ?? j.body ?? "",
    target:      j.target ?? j.target_host ?? "",
    objective:   j.objective ?? j.goal ?? "",
    status:      j.status ?? j.state ?? "unknown",
    tags:        Array.isArray(j.tags) ? j.tags : [],
  }));
}

function normaliseArticles(raw) {
  return normaliseArray(raw).map((a, i) => ({
    id:      String(a.id ?? a.article_id ?? i),
    title:   a.title ?? a.name ?? `Article ${i + 1}`,
    content: a.content ?? a.body ?? a.summary ?? a.text ?? "",
    topic:   a.topic ?? a.category ?? a.type ?? "",
    tags:    Array.isArray(a.tags) ? a.tags : [],
  }));
}

function tokenise(text) {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3);
}

function correlate(job, articles) {
  const jobTokens = new Set([
    ...tokenise(job.name),
    ...tokenise(job.description),
    ...tokenise(job.target),
    ...tokenise(job.objective),
    ...job.tags.flatMap(t => tokenise(t)),
  ]);
  const matches = [];
  for (const art of articles) {
    const artTokens = tokenise(
      `${art.title} ${art.content.slice(0, 500)} ${art.topic} ${art.tags.join(" ")}`
    );
    const hits = artTokens.filter(t => jobTokens.has(t)).length;
    if (hits > 0) matches.push({ ...art, score: hits });
  }
  matches.sort((a, b) => b.score - a.score);
  return matches;
}

// ─── fetch ───────────────────────────────────────────────────────────────────

async function fetchAll() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [jRes, kRes] = await Promise.all([
    fetch(`${base}/entities/SwarmJob`, { headers: hdr }),
    fetch(`${base}/knowledge/`,        { headers: hdr }),
  ]);
  const jobs     = normaliseJobs(await jRes.json());
  const articles = normaliseArticles(await kRes.json());
  const enriched = jobs.map(j => {
    const matches = correlate(j, articles);
    return { ...j, matches, coverage: matches.length > 0 ? "SUPPORTED" : "UNSUPPORTED" };
  });
  return { jobs: enriched, articles };
}

// ─── exported intent helpers (JarvisBrain) ───────────────────────────────────

export function isSjkaQuery(q) {
  return /swarm.?knowledge|knowledge.?swarm|sjka|swarm.?kb|unsupported.?swarm|swarm.?knowledge.?alignment|swarm.?article|swarm.?documentation|which.?swarm.?jobs.?have.?knowledge|swarm.?kb.?coverage/i.test(q);
}

export async function buildSjkaScript() {
  try {
    const { jobs, articles } = await fetchAll();
    const unsupported = jobs.filter(j => j.coverage === "UNSUPPORTED");
    const topSupported = jobs.filter(j => j.coverage === "SUPPORTED")[0];
    const prompt =
      `JARVIS swarm-knowledge alignment report: ${jobs.length} swarm jobs checked against ` +
      `${articles.length} KB articles. ${unsupported.length} jobs classified UNSUPPORTED — ` +
      `no knowledge-base coverage found for their objectives.` +
      (topSupported
        ? ` Best-covered job: ${topSupported.name} with ${topSupported.matches.length} matching KB article(s).`
        : "") +
      ` Summarise the knowledge coverage gap in exactly 2 sentences and recommend the next action.`;
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const base = apiBase();
    const aiRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method:  "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body:    JSON.stringify({ message: prompt }),
    });
    const aiData = await aiRes.json();
    return (
      aiData.response ?? aiData.reply ?? aiData.message ??
      `${unsupported.length}/${jobs.length} swarm jobs UNSUPPORTED against ${articles.length} KB articles.`
    );
  } catch {
    return "Swarm-knowledge alignment data unavailable.";
  }
}

// ─── Stat Tile ────────────────────────────────────────────────────────────────

function StatTile({ label, value, accent, pulse }) {
  return (
    <div style={{
      flex: 1, textAlign: "center", padding: "8px 4px",
      background: `rgba(${accent === RED ? "255,59,107" : accent === AMBER ? "245,166,35" : "41,231,255"},0.04)`,
      border:     `1px solid ${accent ?? CY}22`, borderRadius: 4, position: "relative",
    }}>
      {pulse && (
        <div style={{
          position: "absolute", inset: -1, borderRadius: 4,
          border: `1px solid ${AMBER}`,
          animation: "sjka-pulse 1.4s ease-in-out infinite",
          pointerEvents: "none",
        }} />
      )}
      <div style={{ fontSize: 16, fontWeight: 700, color: accent ?? CY, fontFamily: MONO }}>
        {value ?? "—"}
      </div>
      <div style={{ fontSize: 7, color: MUTED, letterSpacing: 1, textTransform: "uppercase", marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

// ─── Job Row ──────────────────────────────────────────────────────────────────

function JobRow({ job }) {
  const [expanded, setExpanded] = useState(false);
  const maxScore = Math.max(1, ...job.matches.map(m => m.score));

  return (
    <div style={{
      borderRadius: 3, marginBottom: 3,
      border:     `1px solid ${job.coverage === "UNSUPPORTED" ? AMBER : MUTED}22`,
      background: job.coverage === "UNSUPPORTED"
        ? "rgba(245,166,35,0.03)"
        : "rgba(41,231,255,0.02)",
    }}>
      <div
        onClick={() => setExpanded(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", cursor: "pointer" }}
      >
        <span style={{
          fontSize: 7, fontWeight: 700, letterSpacing: 1,
          color:  job.coverage === "UNSUPPORTED" ? AMBER : GREEN,
          border: `1px solid ${job.coverage === "UNSUPPORTED" ? AMBER : GREEN}66`,
          padding: "1px 5px", borderRadius: 2, whiteSpace: "nowrap",
          width: 72, textAlign: "center",
        }}>
          {job.coverage === "UNSUPPORTED" ? "UNSUPPORTED" : "SUPPORTED"}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 9, color: CY, fontWeight: 600,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {job.name}
          </div>
          {(job.status ?? job.target) && (
            <div style={{ fontSize: 7, color: MUTED, marginTop: 1 }}>
              {[job.status, job.target].filter(Boolean).join(" · ").slice(0, 40)}
            </div>
          )}
        </div>

        {job.matches.length > 0 && (
          <span style={{ fontSize: 8, color: GREEN, fontWeight: 700, flexShrink: 0 }}>
            {job.matches.length} article{job.matches.length !== 1 ? "s" : ""}
          </span>
        )}
        <span style={{ fontSize: 8, color: MUTED }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div style={{ padding: "0 8px 8px 8px" }}>
          {job.matches.length === 0 ? (
            <div style={{ fontSize: 8, color: AMBER, padding: "4px 0" }}>
              No KB articles found for this swarm job.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
              <div style={{ fontSize: 7, color: MUTED, letterSpacing: 1, marginBottom: 2 }}>
                MATCHED KB ARTICLES
              </div>
              {job.matches.slice(0, 6).map(m => {
                const barPct = Math.round((m.score / maxScore) * 100);
                return (
                  <div key={m.id} style={{
                    background: "rgba(41,231,255,0.03)",
                    border:     `1px solid ${CY}22`,
                    borderRadius: 3, padding: "4px 8px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      {m.topic && (
                        <span style={{
                          fontSize: 7, fontWeight: 700,
                          color:  CY,
                          border: `1px solid ${CY}44`,
                          padding: "1px 4px", borderRadius: 2,
                          whiteSpace: "nowrap", flexShrink: 0,
                        }}>
                          {m.topic.slice(0, 10).toUpperCase()}
                        </span>
                      )}
                      <span style={{
                        fontSize: 8, color: CY, flex: 1, minWidth: 0,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {m.title}
                      </span>
                      <span style={{ fontSize: 7, color: GREEN, fontWeight: 700, flexShrink: 0 }}>
                        {m.score}pt
                      </span>
                    </div>
                    {m.content && (
                      <div style={{
                        fontSize: 7, color: MUTED, marginBottom: 3,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {m.content.slice(0, 60)}
                      </div>
                    )}
                    <div style={{ height: 3, background: `${CY}11`, borderRadius: 2 }}>
                      <div style={{
                        width: `${barPct}%`, height: "100%",
                        background: GREEN, borderRadius: 2,
                      }} />
                    </div>
                  </div>
                );
              })}
              {job.matches.length > 6 && (
                <div style={{ fontSize: 7, color: MUTED, textAlign: "center" }}>
                  +{job.matches.length - 6} more article{job.matches.length - 6 !== 1 ? "s" : ""}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const TABS = ["ALL", "SUPPORTED", "UNSUPPORTED"];

export default function SwarmJobKnowledgeAlignment() {
  const [open,      setOpen]      = useState(false);
  const [data,      setData]      = useState(null);
  const [error,     setError]     = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setData(await fetchAll());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener("jarvis:sjka-toggle", h);
    return () => window.removeEventListener("jarvis:sjka-toggle", h);
  }, []);

  async function assess() {
    setAssessing(true);
    const script = await buildSjkaScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
  }

  const jobs        = data?.jobs ?? [];
  const articles    = data?.articles ?? [];
  const supported   = jobs.filter(j => j.coverage === "SUPPORTED");
  const unsupported = jobs.filter(j => j.coverage === "UNSUPPORTED");

  const visible = jobs.filter(j => {
    if (tab === "SUPPORTED"   && j.coverage !== "SUPPORTED")   return false;
    if (tab === "UNSUPPORTED" && j.coverage !== "UNSUPPORTED") return false;
    if (search) {
      const q = search.toLowerCase();
      return j.name.toLowerCase().includes(q) || j.description.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="SwarmJob × Knowledge Alignment (SJKA)"
        style={{
          position:        "fixed",
          left:            BTN_LEFT,
          bottom:          18,
          zIndex:          68,
          padding:         "4px 10px",
          background:      open ? AMBER : "rgba(4,7,14,0.85)",
          border:          `1px solid ${AMBER}`,
          color:           open ? "#04060A" : AMBER,
          borderRadius:    4,
          cursor:          "pointer",
          fontFamily:      MONO,
          fontSize:        9,
          fontWeight:      700,
          letterSpacing:   1,
          backdropFilter:  "blur(6px)",
          whiteSpace:      "nowrap",
        }}
      >
        ◈ SJKA
        {unsupported.length > 0 && (
          <span style={{
            marginLeft:    5,
            background:    AMBER,
            color:         "#04060A",
            borderRadius:  8,
            padding:       "0 5px",
            fontSize:      8,
            fontWeight:    900,
          }}>
            {unsupported.length}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position:       "fixed",
          left:           BTN_LEFT - 320,
          bottom:         48,
          zIndex:         68,
          width:          420,
          maxHeight:      "min(520px,78vh)",
          background:     "rgba(4,7,14,0.97)",
          border:         `1px solid ${AMBER}44`,
          borderRadius:   8,
          display:        "flex",
          flexDirection:  "column",
          overflow:       "hidden",
          boxShadow:      `0 0 40px ${AMBER}18`,
          fontFamily:     MONO,
        }}>
          {/* Header */}
          <div style={{
            display:         "flex",
            alignItems:      "center",
            gap:             8,
            padding:         "8px 12px",
            borderBottom:    `1px solid ${AMBER}22`,
            background:      `rgba(245,166,35,0.04)`,
            flexShrink:      0,
          }}>
            <span style={{ color: AMBER, fontSize: 10, fontWeight: 700, letterSpacing: 2 }}>
              ◈ SWARMJOB × KNOWLEDGE ALIGNMENT
            </span>
            <button
              onClick={assess}
              disabled={assessing || !data}
              style={{
                marginLeft:   "auto",
                padding:      "2px 8px",
                background:   assessing ? AMBER : "transparent",
                border:       `1px solid ${AMBER}`,
                color:        assessing ? "#04060A" : AMBER,
                borderRadius: 3,
                cursor:       assessing ? "default" : "pointer",
                fontSize:     8,
                fontWeight:   700,
                letterSpacing: 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "transparent", border: "none",
                color: MUTED, cursor: "pointer", fontSize: 14, padding: 0,
              }}
            >×</button>
          </div>

          {/* Stat tiles */}
          {data && (
            <div style={{ display: "flex", gap: 6, padding: "8px 12px", flexShrink: 0 }}>
              <StatTile label="JOBS"        value={jobs.length}        accent={CY}   />
              <StatTile label="KB ARTICLES" value={articles.length}    accent={MUTED} />
              <StatTile label="SUPPORTED"   value={supported.length}   accent={GREEN} />
              <StatTile label="UNSUPPORTED" value={unsupported.length} accent={AMBER} pulse={unsupported.length > 0} />
            </div>
          )}

          {/* Filter tabs + search */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "0 12px 8px", flexShrink: 0,
          }}>
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding:      "2px 8px",
                  background:   tab === t ? AMBER : "transparent",
                  border:       `1px solid ${tab === t ? AMBER : MUTED + "44"}`,
                  color:        tab === t ? "#04060A" : MUTED,
                  borderRadius: 3,
                  cursor:       "pointer",
                  fontSize:     8,
                  fontWeight:   700,
                  letterSpacing: 1,
                }}
              >
                {t}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                marginLeft:   "auto",
                padding:      "2px 7px",
                background:   "rgba(41,231,255,0.04)",
                border:       `1px solid ${CY}22`,
                borderRadius: 3,
                color:        CY,
                fontSize:     8,
                fontFamily:   MONO,
                outline:      "none",
                width:        90,
              }}
            />
          </div>

          {/* Content */}
          <div style={{ overflowY: "auto", padding: "0 12px 12px", flex: 1 }}>
            {loading && !data && (
              <div style={{ color: MUTED, fontSize: 9, textAlign: "center", padding: "20px 0" }}>
                Loading…
              </div>
            )}
            {error && (
              <div style={{ color: RED, fontSize: 9, padding: "12px 0" }}>
                Error: {error}
              </div>
            )}
            {data && visible.length === 0 && (
              <div style={{ color: MUTED, fontSize: 9, textAlign: "center", padding: "20px 0" }}>
                No jobs match the current filter.
              </div>
            )}
            {data && visible.map(j => <JobRow key={j.id} job={j} />)}
          </div>

          {/* Footer */}
          {data && (
            <div style={{
              borderTop:  `1px solid ${AMBER}22`,
              padding:    "5px 12px",
              fontSize:   7,
              color:      MUTED,
              flexShrink: 0,
              display:    "flex",
              alignItems: "center",
              gap:        8,
            }}>
              <span>
                {supported.length}/{jobs.length} SUPPORTED · {articles.length} KB articles checked
              </span>
              <button
                onClick={load}
                disabled={loading}
                style={{
                  marginLeft:   "auto",
                  background:   "transparent",
                  border:       `1px solid ${CY}33`,
                  color:        CY,
                  padding:      "1px 6px",
                  borderRadius: 3,
                  cursor:       loading ? "default" : "pointer",
                  fontSize:     7,
                  fontFamily:   MONO,
                }}
              >
                {loading ? "…" : "↻"}
              </button>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes sjka-pulse {
          0%, 100% { opacity: 0.8; }
          50%       { opacity: 0.2; }
        }
      `}</style>
    </>
  );
}
