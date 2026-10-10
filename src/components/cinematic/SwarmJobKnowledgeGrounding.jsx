/**
 * F83 — SwarmJob × Knowledge Grounding (SJKG)
 *
 * Parallel-fetches /entities/SwarmJob + /knowledge/ every 90 s.
 * Keyword-correlates each running swarm job against KB articles:
 *   GROUNDED — ≥2 articles match this job (knowledge-backed)
 *   PARTIAL  — 1 article matches
 *   BARE     — 0 articles match (knowledge blind-spot)
 *
 * Stat tiles:  jobs / articles / grounded / bare
 * Filter tabs: ALL | GROUNDED | PARTIAL | BARE
 * Text search: across job name / type / status.
 * Expand row → matched KB article cards.
 * Amber badge on BARE count.
 * ▶ ASSESS: 2-sentence swarm knowledge brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SJKG  at left:24680, bottom:8, zIndex:85.
 * Event:   jarvis:sjkg-toggle
 * Voice:   "swarm knowledge" / "sjkg" / "job knowledge" /
 *          "knowledge jobs" / "bare jobs" / "swarm kb" /
 *          "job grounding" / "ungrounded swarm"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 24680;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise ────────────────────────────────────────────────────────────────

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
    id:     String(j.id ?? j.job_id ?? i),
    name:   j.name ?? j.title ?? j.job_name ?? `Job ${i + 1}`,
    type:   j.type ?? j.job_type ?? j.category ?? null,
    status: j.status ?? j.state ?? null,
    body:   [j.name, j.title, j.description, j.type, j.job_type,
             j.tags, j.target, j.objective]
              .filter(Boolean).join(" "),
  }));
}

function normaliseArticles(raw) {
  return normaliseArray(raw).map((a, i) => ({
    id:      String(a.id ?? a.article_id ?? i),
    title:   a.title ?? a.name ?? `Article ${i + 1}`,
    summary: a.summary ?? a.content ?? a.body ?? "",
    cat:     a.category ?? a.type ?? null,
    body:    [a.title, a.name, a.summary, a.content, a.category,
              a.tags, a.topic, a.subject]
               .filter(Boolean).join(" "),
  }));
}

// ─── keyword scoring ──────────────────────────────────────────────────────────

function buildKeywords(strings) {
  return strings
    .flatMap(s => String(s).toLowerCase().split(/[^a-z0-9]+/))
    .filter(t => t.length >= 3);
}

function scoreMatch(keywords, haystack) {
  const h = haystack.toLowerCase();
  let hits = 0;
  for (const kw of keywords) if (h.includes(kw)) hits++;
  return hits;
}

// ─── fetch ────────────────────────────────────────────────────────────────────

async function fetchAll() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [jobRes, artRes] = await Promise.all([
    fetch(`${base}/entities/SwarmJob`, { headers: hdr }),
    fetch(`${base}/knowledge/`,        { headers: hdr }),
  ]);
  return {
    jobs:     normaliseJobs(jobRes.ok     ? await jobRes.json() : []),
    articles: normaliseArticles(artRes.ok ? await artRes.json() : []),
  };
}

// ─── correlation ──────────────────────────────────────────────────────────────

function correlate(jobs, articles) {
  return jobs.map(job => {
    const kws = buildKeywords([job.name, job.type ?? "", job.body]);
    const matched = articles
      .map(a => ({ a, score: scoreMatch(kws, `${a.title} ${a.body}`) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);
    const cls =
      matched.length >= 2 ? "GROUNDED" :
      matched.length === 1 ? "PARTIAL" :
      "BARE";
    return { ...job, matched, classification: cls };
  });
}

// ─── exported intent helpers ──────────────────────────────────────────────────

const SJKG_RE =
  /\b(sjkg|swarm[\s_-]?knowledge|knowledge[\s_-]?job[s]?|job[\s_-]?knowledge|bare[\s_-]?job[s]?|swarm[\s_-]?kb|job[\s_-]?grounding|ungrounded[\s_-]?swarm|knowledge[\s_-]?swarm|swarm[\s_-]?knowledge[\s_-]?gap|job[\s_-]?kb)\b/i;

export function isSjkgQuery(q) { return SJKG_RE.test(q); }

export async function buildSjkgScript() {
  try {
    const { jobs, articles } = await fetchAll();
    const rows     = correlate(jobs, articles);
    const grounded = rows.filter(r => r.classification === "GROUNDED").length;
    const partial  = rows.filter(r => r.classification === "PARTIAL").length;
    const bare     = rows.filter(r => r.classification === "BARE").length;
    const prompt =
      `Swarm job knowledge grounding: ${jobs.length} running swarm jobs cross-referenced ` +
      `against ${articles.length} knowledge base articles. ` +
      `${grounded} jobs are fully grounded (≥2 KB articles), ` +
      `${partial} have partial coverage (1 article), ` +
      `and ${bare} are BARE — running with zero knowledge backing, which are operational blind-spots. ` +
      `In 2 sentences, assess the overall swarm knowledge coverage and flag the highest-risk ` +
      `bare jobs that most urgently require knowledge article creation.`;
    const base = apiBase();
    const res  = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body:    JSON.stringify({ message: prompt }),
    });
    const data = await res.json();
    window.dispatchEvent(new CustomEvent("jarvis:sjkg-toggle"));
    return (data.answer || "Swarm job knowledge grounding panel is now open, sir.").replace(/<<ACTION:[^>]*>>/g, "").trim();
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:sjkg-toggle"));
    return "Swarm job knowledge grounding panel is standing by, sir.";
  }
}

// ─── sub-components ───────────────────────────────────────────────────────────

function ClsBadge({ cls }) {
  const colour =
    cls === "GROUNDED" ? GREEN :
    cls === "PARTIAL"  ? AMBER :
    "#e05";
  return (
    <span style={{
      fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: 1,
      padding: "1px 6px", borderRadius: 3,
      border: `1px solid ${colour}`, color: colour,
    }}>{cls}</span>
  );
}

function RelevanceBar({ score, max }) {
  const pct = max > 0 ? Math.min(100, Math.round((score / max) * 100)) : 0;
  return (
    <div style={{ height: 3, background: "#0d1927", borderRadius: 2, marginTop: 3 }}>
      <div style={{ height: 3, width: `${pct}%`, borderRadius: 2, background: CY }} />
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function SwarmJobKnowledgeGrounding() {
  const [open,     setOpen]     = useState(false);
  const [jobs,     setJobs]     = useState([]);
  const [articles, setArticles] = useState([]);
  const [rows,     setRows]     = useState([]);
  const [tab,      setTab]      = useState("ALL");
  const [q,        setQ]        = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { jobs: j, articles: a } = await fetchAll();
      setJobs(j);
      setArticles(a);
      setRows(correlate(j, a));
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:sjkg-toggle", handler);
    return () => window.removeEventListener("jarvis:sjkg-toggle", handler);
  }, []);

  const grounded = rows.filter(r => r.classification === "GROUNDED").length;
  const partial  = rows.filter(r => r.classification === "PARTIAL").length;
  const bare     = rows.filter(r => r.classification === "BARE").length;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r.classification !== tab) return false;
    if (q) {
      const lq = q.toLowerCase();
      return (r.name + r.type + r.status).toLowerCase().includes(lq);
    }
    return true;
  });

  const maxScore = Math.max(1, ...rows.flatMap(r => r.matched.map(m => m.score)));

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildSjkgScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch { /* silent */ }
    setAssessing(false);
  }

  const TABS = ["ALL", "GROUNDED", "PARTIAL", "BARE"];
  const TAB_COLOUR = { GROUNDED: GREEN, PARTIAL: AMBER, BARE: "#e05", ALL: CY };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Swarm Job Knowledge Grounding"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 85,
          fontFamily: MONO, fontSize: 10, letterSpacing: 1,
          padding: "3px 8px", borderRadius: 4, cursor: "pointer",
          border: `1px solid ${AMBER}`, color: AMBER, background: "rgba(4,7,14,0.7)",
          whiteSpace: "nowrap",
        }}
      >
        ◈ SJKG{bare > 0 && <span style={{ marginLeft: 5, color: AMBER }}>({bare})</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, left: 220, zIndex: 85,
      width: "min(680px,92vw)", maxHeight: "82vh",
      background: BG, border: `1px solid ${CY}44`,
      borderRadius: 12, display: "flex", flexDirection: "column",
      fontFamily: MONO, color: "#DCEBF5",
      boxShadow: `0 0 60px ${CY}18`,
    }}>

      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 16px", borderBottom: `1px solid ${CY}22`,
      }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 13 }}>
          ◈ SWARM JOB × KNOWLEDGE GROUNDING
        </span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: MUTED }}>
          {jobs.length} jobs · {articles.length} articles · {loading ? "refreshing…" : "live"}
        </span>
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: MUTED,
          cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0,
        }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 10, padding: "10px 16px", flexWrap: "wrap" }}>
        {[
          { label: "JOBS",     value: jobs.length,     colour: CY    },
          { label: "ARTICLES", value: articles.length,  colour: MUTED },
          { label: "GROUNDED", value: grounded,          colour: GREEN },
          { label: "PARTIAL",  value: partial,           colour: AMBER },
          { label: "BARE",     value: bare,              colour: "#e05" },
        ].map(({ label, value, colour }) => (
          <div key={label} style={{
            flex: "1 1 90px", minWidth: 80,
            background: "rgba(10,20,35,0.6)", borderRadius: 8,
            border: `1px solid ${colour}33`, padding: "8px 10px", textAlign: "center",
          }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: colour }}>{value}</div>
            <div style={{ fontSize: 9, color: MUTED, letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ display: "flex", gap: 8, padding: "6px 16px", alignItems: "center", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            fontFamily: MONO, fontSize: 10, letterSpacing: 1,
            padding: "2px 10px", borderRadius: 3, cursor: "pointer",
            border: `1px solid ${tab === t ? TAB_COLOUR[t] : MUTED + "55"}`,
            color: tab === t ? TAB_COLOUR[t] : MUTED,
            background: tab === t ? `${TAB_COLOUR[t]}18` : "transparent",
          }}>{t}</button>
        ))}
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="search jobs…"
          style={{
            flex: 1, minWidth: 140, fontFamily: MONO, fontSize: 11,
            background: "rgba(10,20,35,0.7)", border: `1px solid ${CY}33`,
            borderRadius: 4, color: "#DCEBF5", padding: "3px 8px", outline: "none",
          }}
        />
        <button onClick={assess} disabled={assessing} style={{
          fontFamily: MONO, fontSize: 10, letterSpacing: 1,
          padding: "3px 12px", borderRadius: 4, cursor: "pointer",
          border: `1px solid ${CY}`, color: CY, background: "transparent",
          opacity: assessing ? 0.5 : 1,
        }}>
          {assessing ? "assessing…" : "▶ ASSESS"}
        </button>
      </div>

      {/* rows */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px 16px" }}>
        {visible.length === 0 && (
          <div style={{ textAlign: "center", color: MUTED, marginTop: 24, fontSize: 12 }}>
            {loading ? "loading swarm jobs…" : "no jobs match current filter"}
          </div>
        )}
        {visible.map(row => (
          <div key={row.id} style={{ marginBottom: 6 }}>
            <div
              onClick={() => setExpanded(expanded === row.id ? null : row.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                background: "rgba(10,20,35,0.5)", borderRadius: 8,
                border: `1px solid ${CY}22`, padding: "8px 12px", cursor: "pointer",
              }}
            >
              <ClsBadge cls={row.classification} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#DCEBF5", truncate: "ellipsis" }}>
                  {row.name}
                </div>
                {row.type && (
                  <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>{row.type}</div>
                )}
              </div>
              {row.status && (
                <span style={{ fontSize: 10, color: MUTED }}>{row.status}</span>
              )}
              <span style={{ fontSize: 10, color: MUTED }}>
                {row.matched.length} article{row.matched.length !== 1 ? "s" : ""}
              </span>
              <span style={{ color: MUTED, fontSize: 12 }}>
                {expanded === row.id ? "▲" : "▼"}
              </span>
            </div>

            {expanded === row.id && (
              <div style={{
                background: "rgba(5,10,20,0.7)", borderRadius: "0 0 8px 8px",
                border: `1px solid ${CY}18`, borderTop: "none",
                padding: "10px 12px",
              }}>
                {row.matched.length === 0 ? (
                  <div style={{ fontSize: 11, color: MUTED }}>
                    No knowledge articles match this job — consider creating KB documentation.
                  </div>
                ) : (
                  row.matched.map(({ a, score }) => (
                    <div key={a.id} style={{
                      marginBottom: 8, padding: "6px 10px",
                      background: "rgba(10,20,35,0.5)", borderRadius: 6,
                      border: `1px solid ${CY}18`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#DCEBF5", flex: 1 }}>
                          {a.title}
                        </span>
                        {a.cat && (
                          <span style={{
                            fontSize: 9, padding: "1px 5px", borderRadius: 3,
                            border: `1px solid ${CY}44`, color: CY,
                          }}>{a.cat}</span>
                        )}
                        <span style={{ fontSize: 10, color: MUTED }}>×{score}</span>
                      </div>
                      <RelevanceBar score={score} max={maxScore} />
                      {a.summary && (
                        <div style={{ fontSize: 10, color: MUTED, marginTop: 4, lineHeight: 1.4 }}>
                          {a.summary.slice(0, 140)}{a.summary.length > 140 ? "…" : ""}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
