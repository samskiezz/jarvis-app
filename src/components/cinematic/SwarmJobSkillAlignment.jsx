/**
 * F193 — Swarm Job × Skill Domain Alignment (SWARMSKILL)
 *
 * Parallel-fetches /entities/SwarmJob + /v1/aip/skill, then
 * keyword-correlates each operator skill domain against active swarm jobs
 * to surface:
 *   DEPLOYED — at least one active swarm job exercises this skill domain
 *   DORMANT  — no swarm job coverage (skill capability not being actively deployed)
 *
 * Stat tiles: skills / jobs / deployed / dormant
 * Filter tabs: ALL | DEPLOYED | DORMANT
 * Expand any skill → matched swarm jobs with status badge + relevance score.
 * Lime badge on DEPLOYED count.
 * ▶ ASSESS: 2-sentence skill deployment coverage brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SWARMSKILL  at bottom:8 left:69640, zIndex:134.
 * Event:   jarvis:swarmskill-toggle
 * Voice:   "swarm skill / swarmskill / skill deployment / deployed skills /
 *           which skills have swarm jobs / dormant skills / skill swarm /
 *           active skill deployment / swarm capability"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 69640;
const POLL_MS  = 90_000;
const LIME     = "#84CC16";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

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

const SWARMSKILL_RE =
  /\b(swarm\s+skill|swarmskill|skill\s+deployment|deployed\s+skill|which\s+skills?\s+(have|lack)\s+swarm|dormant\s+skill|skill\s+swarm|active\s+skill\s+deployment|swarm\s+capabilit|swarm\s+domain|capability\s+deployment|skill\s+in\s+(play|use|operation))\b/i;

export function isSwarmskillQuery(q) { return SWARMSKILL_RE.test(q); }

export async function buildSwarmskillScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [swarmRes, skillRes] = await Promise.all([
      fetch(`${base}/entities/SwarmJob`, { headers: hdr }),
      fetch(`${base}/v1/aip/skill`,      { headers: hdr }),
    ]);
    const jobs   = normaliseJobs(await swarmRes.json());
    const skills = normaliseSkills(await skillRes.json());

    const deployed = skills.filter((sk) => jobs.some((j) => relevance(sk, j) > 0)).length;
    const dormant  = skills.length - deployed;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS swarm job × skill domain alignment: ${skills.length} operator skill domains, ` +
          `${jobs.length} swarm jobs active, ${deployed} skill domains are actively exercised ` +
          `by running swarm operations, ${dormant} skill domains are dormant with no swarm ` +
          `job coverage — capability deployment gap. ` +
          `Give a 2-sentence skill deployment coverage brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Swarm skill domain alignment analysis complete, sir.").trim();
  } catch {
    return "Swarm skill domain alignment unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseJobs(raw) {
  const arr = Array.isArray(raw)         ? raw
    : Array.isArray(raw?.jobs)          ? raw.jobs
    : Array.isArray(raw?.swarm_jobs)    ? raw.swarm_jobs
    : Array.isArray(raw?.data)          ? raw.data
    : Array.isArray(raw?.results)       ? raw.results
    : Array.isArray(raw?.items)         ? raw.items
    : [];
  return arr.map((j, i) => ({
    id:          j.id          || j.job_id     || String(i),
    title:       j.title       || j.name       || j.objective || `SwarmJob ${i + 1}`,
    status:      j.status      || j.state      || "",
    tags:        Array.isArray(j.tags) ? j.tags.join(" ") : (j.tags || ""),
    objective:   (j.objective  || j.description || j.goal || j.details || "").toString().slice(0, 300),
    target:      (j.target     || j.target_entity || j.focus || "").toString().slice(0, 100),
  }));
}

function normaliseSkills(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.skills)          ? raw.skills
    : Array.isArray(raw?.dimensions)      ? raw.dimensions
    : Array.isArray(raw?.data)            ? raw.data
    : Array.isArray(raw?.results)         ? raw.results
    : Array.isArray(raw?.items)           ? raw.items
    : [];
  return arr.map((s, i) => ({
    id:          s.id          || s.skill_id   || String(i),
    name:        s.name        || s.title      || s.domain || s.dimension || `Skill ${i + 1}`,
    category:    s.category    || s.type       || s.area   || "",
    tags:        Array.isArray(s.tags) ? s.tags.join(" ") : (s.tags || ""),
    description: (s.description || s.summary  || s.details || "").toString().slice(0, 300),
    score:       s.score       || s.level      || s.proficiency || null,
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(skill, job) {
  const sw = keywords(`${skill.name} ${skill.category} ${skill.description} ${skill.tags}`.slice(0, 400));
  const jw = keywords(`${job.title} ${job.objective} ${job.target} ${job.tags}`.slice(0, 400));
  return sw.filter((w) => jw.some((a) => a.includes(w) || w.includes(a))).length;
}

function buildLinked(skills, jobs) {
  return skills.map((sk) => {
    const matched = jobs
      .map((j) => ({ ...j, score: relevance(sk, j) }))
      .filter((j) => j.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...sk, jobs: matched, deployed: matched.length > 0 };
  });
}

function statusColor(st) {
  const s = String(st || "").toLowerCase();
  if (s.includes("active") || s.includes("running"))  return LIME;
  if (s.includes("pend")   || s.includes("queue"))    return "#FACC15";
  if (s.includes("complet") || s.includes("done"))    return "#94A3B8";
  if (s.includes("fail")   || s.includes("error"))    return "#F87171";
  return "#94A3B8";
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "DEPLOYED", "DORMANT"];

export default function SwarmJobSkillAlignment() {
  const [open,      setOpen]      = useState(false);
  const [jobs,      setJobs]      = useState([]);
  const [skills,    setSkills]    = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [swarmRes, skillRes] = await Promise.all([
        fetch(`${base}/entities/SwarmJob`, { headers: hdr }),
        fetch(`${base}/v1/aip/skill`,      { headers: hdr }),
      ]);
      setJobs(normaliseJobs(await swarmRes.json()));
      setSkills(normaliseSkills(await skillRes.json()));
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
    window.addEventListener("jarvis:swarmskill-toggle", onToggle);
    return () => window.removeEventListener("jarvis:swarmskill-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "");
      if (isSwarmskillQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const linked   = buildLinked(skills, jobs);
  const deployed = linked.filter((sk) => sk.deployed).length;
  const dormant  = linked.filter((sk) => !sk.deployed).length;

  const visible = linked
    .filter((sk) => {
      if (filter === "DEPLOYED") return sk.deployed;
      if (filter === "DORMANT")  return !sk.deployed;
      return true;
    })
    .filter((sk) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        sk.name.toLowerCase().includes(q) ||
        sk.category.toLowerCase().includes(q) ||
        sk.description.toLowerCase().includes(q)
      );
    });

  async function assess() {
    setAssessing(true);
    const text = await buildSwarmskillScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Swarm Job × Skill Domain Alignment (◈ SWARMSKILL)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 134,
          background: open ? `${LIME}22` : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? LIME : S.border}`,
          borderRadius: S.radius, color: open ? LIME : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${LIME}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ SWARMSKILL{deployed > 0 && (
          <span style={{
            marginLeft: 4,
            background: LIME,
            color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{deployed}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 134,
          bottom: 36, left: Math.max(8, BTN_LEFT - 280),
          width: 360,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${LIME}`,
          borderRadius: S.radius,
          boxShadow: "0 4px 28px rgba(0,0,0,0.55)",
          fontFamily: S.mono, fontSize: S.fs.xs,
          display: "flex", flexDirection: "column",
          maxHeight: "70vh", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            <span style={{ color: LIME, letterSpacing: 2, fontWeight: 700, fontSize: S.fs.xxs }}>
              SWARM JOB — SKILL DOMAIN ALIGNMENT
            </span>
            <button
              onClick={assess}
              disabled={assessing || skills.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || skills.length === 0) ? 0.4 : 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 6, padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            {[
              { label: "SKILLS",   value: skills.length, color: S.textLo },
              { label: "JOBS",     value: jobs.length,   color: S.textLo },
              { label: "DEPLOYED", value: deployed,      color: LIME     },
              { label: "DORMANT",  value: dormant,       color: "#94A3B8" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                background: "rgba(255,255,255,0.04)", borderRadius: 4,
                padding: "4px 6px", textAlign: "center",
              }}>
                <div style={{ color, fontSize: 15, fontWeight: 700 }}>{value}</div>
                <div style={{ color: S.textLo, fontSize: 8, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{
            display: "flex", gap: 4, padding: "6px 12px",
            borderBottom: `1px solid ${S.border}`,
          }}>
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                style={{
                  background: filter === t ? `${LIME}22` : "transparent",
                  border: `1px solid ${filter === t ? LIME : S.border}`,
                  color: filter === t ? LIME : S.textLo,
                  borderRadius: 4, padding: "2px 8px",
                  fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                }}
              >{t}</button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="filter…"
              style={{
                marginLeft: "auto", background: "rgba(255,255,255,0.06)",
                border: `1px solid ${S.border}`, borderRadius: 4,
                color: S.textHi, fontFamily: S.mono, fontSize: S.fs.xxs,
                padding: "2px 6px", width: 80, outline: "none",
              }}
            />
          </div>

          {/* Skill list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 12px" }}>
            {loading && skills.length === 0 && (
              <div style={{ color: S.textLo, textAlign: "center", padding: 16 }}>Loading…</div>
            )}
            {!loading && visible.length === 0 && (
              <div style={{ color: S.textLo, textAlign: "center", padding: 16 }}>No skills match.</div>
            )}
            {visible.map((sk) => (
              <div key={sk.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === sk.id ? null : sk.id)}
                  style={{
                    background: "rgba(255,255,255,0.04)", borderRadius: 4,
                    padding: "6px 8px", cursor: "pointer",
                    border: `1px solid ${sk.deployed ? `${LIME}44` : S.border}`,
                    display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      color: sk.deployed ? LIME : S.textHi,
                      fontWeight: 600, fontSize: S.fs.xxs,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {sk.name}
                    </div>
                    {sk.category && (
                      <div style={{ color: S.textLo, fontSize: 9, marginTop: 2 }}>{sk.category}</div>
                    )}
                    {sk.score != null && (
                      <div style={{ color: S.textLo, fontSize: 9 }}>score: {sk.score}</div>
                    )}
                  </div>
                  <span style={{
                    fontSize: 9, borderRadius: 3, padding: "1px 5px", flexShrink: 0,
                    background: sk.deployed ? `${LIME}22` : "rgba(148,163,184,0.12)",
                    color: sk.deployed ? LIME : "#94A3B8",
                    border: `1px solid ${sk.deployed ? `${LIME}44` : "#94A3B844"}`,
                  }}>
                    {sk.deployed ? "DEPLOYED" : "DORMANT"}
                  </span>
                </div>

                {/* Expanded: matched swarm jobs */}
                {expanded === sk.id && sk.jobs.length > 0 && (
                  <div style={{
                    marginTop: 2, marginLeft: 8,
                    borderLeft: `2px solid ${LIME}44`, paddingLeft: 8,
                  }}>
                    {sk.jobs.slice(0, 5).map((j) => (
                      <div key={j.id} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "3px 0", borderBottom: `1px solid ${S.border}11`,
                      }}>
                        <span style={{
                          color: S.textHi, fontSize: S.fs.xxs,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          maxWidth: "65%",
                        }}>
                          {j.title}
                        </span>
                        <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                          {j.status && (
                            <span style={{
                              fontSize: 8, borderRadius: 3, padding: "1px 4px",
                              background: `${statusColor(j.status)}22`,
                              color: statusColor(j.status),
                              border: `1px solid ${statusColor(j.status)}44`,
                            }}>
                              {j.status.toUpperCase()}
                            </span>
                          )}
                          <span style={{
                            fontSize: 8, color: S.textLo,
                            background: "rgba(255,255,255,0.06)",
                            borderRadius: 3, padding: "1px 4px",
                          }}>
                            rel:{j.score}
                          </span>
                        </div>
                      </div>
                    ))}
                    {sk.jobs.length > 5 && (
                      <div style={{ color: S.textLo, fontSize: 9, padding: "2px 0" }}>
                        +{sk.jobs.length - 5} more swarm jobs
                      </div>
                    )}
                  </div>
                )}
                {expanded === sk.id && sk.jobs.length === 0 && (
                  <div style={{
                    marginTop: 2, marginLeft: 8,
                    borderLeft: `2px solid #94A3B844`, paddingLeft: 8,
                    color: S.textLo, fontSize: 9, padding: "4px 0 4px 8px",
                  }}>
                    No swarm jobs exercise this skill domain.
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding: "4px 12px", borderTop: `1px solid ${S.border}`,
            color: S.textLo, fontSize: 8, letterSpacing: 1, display: "flex",
            justifyContent: "space-between", alignItems: "center",
          }}>
            <span>SWARMSKILL · 90s AUTO-REFRESH</span>
            <span>{lastFetch ? lastFetch.toLocaleTimeString() : "—"}</span>
          </div>
        </div>
      )}
    </>
  );
}
