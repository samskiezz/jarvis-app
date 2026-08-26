/**
 * F191 — Report × Skill Domain Coverage (RSKILL)
 *
 * Parallel-fetches /v1/reports + /v1/aip/skill, then keyword-correlates
 * each operator skill domain (name/description/tags) against the report
 * catalog (title/topic/summary/tags) to surface:
 *   INFORMED   — at least one report backs this skill domain
 *   UNINFORMED — no report found (knowledge-production gap)
 *
 * Stat tiles: skills / reports / informed / uninformed
 * Filter tabs: ALL | INFORMED | UNINFORMED
 * Expand any skill → matched reports with topic badge + relevance score.
 * Orange badge on uninformed count.
 * ▶ ASSESS: 2-sentence skill-report coverage brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ RSKILL  at bottom:8 left:68520, zIndex:132.
 * Event:   jarvis:rskill-toggle
 * Voice:   "report skill / skill report / rskill / skill coverage reports /
 *           which skills have reports / skill knowledge production /
 *           skill documentation / uninformed skills"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 68520;
const POLL_MS  = 90_000;
const ORANGE   = "#FB923C";

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

const RSKILL_RE =
  /\b(report\s+skill|skill\s+report|rskill|skill\s+coverage\s+report|which\s+skills?\s+(have|lack)\s+report|skill\s+knowledge\s+prod|skill\s+doc(umentation)?|uninformed\s+skill|report.backed\s+skill|skill\s+intel\s+report)\b/i;

export function isRskillQuery(q) { return RSKILL_RE.test(q); }

export async function buildRskillScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [repRes, skilRes] = await Promise.all([
      fetch(`${base}/v1/reports`,   { headers: hdr }),
      fetch(`${base}/v1/aip/skill`, { headers: hdr }),
    ]);
    const reports = normaliseReports(await repRes.json());
    const skills  = normaliseSkills(await skilRes.json());

    const informed   = skills.filter((sk) => reports.some((r) => relevance(sk, r) > 0)).length;
    const uninformed = skills.length - informed;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS report × skill domain coverage: ${skills.length} operator skill domains, ` +
          `${reports.length} intelligence reports available, ${informed} skill domains have ` +
          `backing report coverage, ${uninformed} skill domains lack any report documentation. ` +
          `Give a 2-sentence skill-report knowledge-production coverage brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Report and skill domain coverage analysis complete, sir.").trim();
  } catch {
    return "Report and skill domain coverage analysis unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseReports(raw) {
  const arr = Array.isArray(raw)          ? raw
    : Array.isArray(raw?.reports)        ? raw.reports
    : Array.isArray(raw?.data)           ? raw.data
    : Array.isArray(raw?.items)          ? raw.items
    : Array.isArray(raw?.results)        ? raw.results
    : [];
  return arr.map((r, i) => ({
    id:      r.id      || String(i),
    title:   r.title   || r.name    || `Report ${i + 1}`,
    topic:   r.topic   || r.type    || r.category || r.subject || "",
    summary: (r.summary || r.description || r.abstract || r.notes || "").toString(),
    tags:    Array.isArray(r.tags) ? r.tags.join(" ") : (r.tags || ""),
  }));
}

function normaliseSkills(raw) {
  const arr = Array.isArray(raw)         ? raw
    : Array.isArray(raw?.skills)        ? raw.skills
    : Array.isArray(raw?.data)          ? raw.data
    : Array.isArray(raw?.items)         ? raw.items
    : Array.isArray(raw?.results)       ? raw.results
    : typeof raw === "object" && raw !== null
      ? Object.entries(raw).map(([k, v]) => ({
          id: k,
          name: k,
          score: typeof v === "number" ? v : (v?.score ?? 0),
          description: typeof v === "object" ? (v?.description || v?.notes || "") : "",
        }))
      : [];
  return arr.map((sk, i) => ({
    id:          sk.id          || String(i),
    name:        sk.name        || sk.domain   || sk.skill || sk.title || `Skill ${i + 1}`,
    score:       sk.score       ?? sk.level    ?? sk.rating ?? 0,
    description: (sk.description || sk.notes  || sk.summary || "").toString(),
    tags:        Array.isArray(sk.tags) ? sk.tags.join(" ") : (sk.tags || ""),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(skill, report) {
  const sw = keywords(`${skill.name} ${skill.description} ${skill.tags}`.slice(0, 400));
  const rw = keywords(`${report.title} ${report.topic} ${report.summary.slice(0, 400)} ${report.tags}`);
  return sw.filter((w) => rw.some((a) => a.includes(w) || w.includes(a))).length;
}

function buildLinked(skills, reports) {
  return skills.map((sk) => {
    const matched = reports
      .map((r) => ({ ...r, score: relevance(sk, r) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...sk, reports: matched, informed: matched.length > 0 };
  });
}

function fmtScore(v) {
  const n = Number(v);
  if (!n && n !== 0) return "—";
  if (n <= 1)  return `${Math.round(n * 100)}%`;
  return String(n);
}

function topicColor(topic) {
  const t = String(topic || "").toLowerCase();
  if (t.includes("threat") || t.includes("risk"))   return "#F87171";
  if (t.includes("intel")  || t.includes("signal")) return "#C084FC";
  if (t.includes("finance") || t.includes("invest")) return "#4ADE80";
  if (t.includes("tech")   || t.includes("infra"))  return "#60A5FA";
  if (t.includes("ops")    || t.includes("mission")) return ORANGE;
  return "#94A3B8";
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "INFORMED", "UNINFORMED"];

export default function ReportSkillCoverage() {
  const [open,      setOpen]      = useState(false);
  const [skills,    setSkills]    = useState([]);
  const [reports,   setReports]   = useState([]);
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
      const [repRes, skilRes] = await Promise.all([
        fetch(`${base}/v1/reports`,   { headers: hdr }),
        fetch(`${base}/v1/aip/skill`, { headers: hdr }),
      ]);
      setReports(normaliseReports(await repRes.json()));
      setSkills(normaliseSkills(await skilRes.json()));
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
    window.addEventListener("jarvis:rskill-toggle", onToggle);
    return () => window.removeEventListener("jarvis:rskill-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "");
      if (isRskillQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const linked     = buildLinked(skills, reports);
  const informed   = linked.filter((sk) => sk.informed).length;
  const uninformed = linked.filter((sk) => !sk.informed).length;

  const visible = linked
    .filter((sk) => {
      if (filter === "INFORMED")   return sk.informed;
      if (filter === "UNINFORMED") return !sk.informed;
      return true;
    })
    .filter((sk) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return sk.name.toLowerCase().includes(q) || sk.description.toLowerCase().includes(q);
    });

  async function assess() {
    setAssessing(true);
    const text = await buildRskillScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Report × Skill Domain Coverage (◈ RSKILL)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 132,
          background: open ? `${ORANGE}22` : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? ORANGE : S.border}`,
          borderRadius: S.radius, color: open ? ORANGE : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${ORANGE}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ RSKILL{uninformed > 0 && (
          <span style={{
            marginLeft: 4,
            background: ORANGE,
            color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{uninformed}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 132,
          bottom: 36, left: Math.max(8, BTN_LEFT - 280),
          width: 360,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${ORANGE}`,
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
            <span style={{ color: ORANGE, letterSpacing: 2, fontWeight: 700, fontSize: S.fs.xxs }}>
              REPORT — SKILL DOMAIN COVERAGE
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
            gap: 6, padding: "8px 12px",
          }}>
            {[
              { label: "SKILLS",     val: skills.length,  color: C.blue    },
              { label: "REPORTS",    val: reports.length,  color: C.neon   },
              { label: "INFORMED",   val: informed,        color: "#4ADE80" },
              { label: "UNINFORMED", val: uninformed,      color: ORANGE    },
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
          <div style={{ display: "flex", gap: 4, padding: "0 12px 4px" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setFilter(t)} style={{
                flex: 1,
                background: filter === t ? `${ORANGE}22` : "transparent",
                border: `1px solid ${filter === t ? ORANGE : S.border}`,
                color: filter === t ? ORANGE : S.text,
                borderRadius: S.radius, padding: "2px 0",
                fontFamily: S.mono, fontSize: "8px", letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "0 12px 6px" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search skills…"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(0,0,0,0.3)",
                border: `1px solid ${S.border}`, borderRadius: S.radius,
                color: S.textHi, fontFamily: S.mono, fontSize: "9px",
                padding: "3px 7px", outline: "none",
              }}
            />
          </div>

          {/* Skill list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && skills.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No skills match.</div>
            ) : visible.map((sk) => (
              <div key={sk.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === sk.id ? null : sk.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${sk.informed ? "#4ADE80" : ORANGE}`,
                  }}
                >
                  <span style={{ color: sk.informed ? "#4ADE80" : ORANGE, fontSize: 10, width: 10 }}>
                    {sk.informed ? "●" : "○"}
                  </span>
                  <span style={{ flex: 1, color: S.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {sk.name}
                  </span>
                  {sk.score !== 0 && (
                    <span style={{
                      fontSize: "7px", padding: "1px 4px", borderRadius: 4,
                      color: C.blue, border: `1px solid ${C.blue}55`,
                      background: `${C.blue}11`, whiteSpace: "nowrap",
                    }}>
                      {fmtScore(sk.score)}
                    </span>
                  )}
                  <span style={{
                    fontSize: "9px", whiteSpace: "nowrap",
                    color: sk.informed ? "#4ADE80" : ORANGE,
                    minWidth: 72, textAlign: "right",
                  }}>
                    {sk.informed ? `${sk.reports.length} RPT.` : "UNINFORMED"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9 }}>{expanded === sk.id ? "▴" : "▾"}</span>
                </div>

                {expanded === sk.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {sk.description && (
                      <div style={{ color: S.text, fontSize: "8px", marginBottom: 4, lineHeight: 1.4 }}>
                        {sk.description.slice(0, 120)}{sk.description.length > 120 ? "…" : ""}
                      </div>
                    )}
                    {sk.informed ? sk.reports.map((r) => (
                      <div key={r.id} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "3px 0", borderBottom: `1px solid ${S.border}22`,
                      }}>
                        {r.topic && (
                          <span style={{
                            fontSize: "7px", padding: "1px 4px", borderRadius: 4,
                            background: `${topicColor(r.topic)}22`,
                            color: topicColor(r.topic),
                            border: `1px solid ${topicColor(r.topic)}44`,
                            whiteSpace: "nowrap",
                          }}>
                            {String(r.topic).toUpperCase().slice(0, 12)}
                          </span>
                        )}
                        <span style={{ flex: 1, color: S.textHi, fontSize: "9px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.title}
                        </span>
                        <span style={{ color: S.text, fontSize: "8px", whiteSpace: "nowrap" }}>
                          rel:{r.score}
                        </span>
                      </div>
                    )) : (
                      <div style={{ color: ORANGE, fontSize: "9px", padding: "2px 0" }}>
                        No intelligence reports found for this skill domain.
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
            /v1/reports · /v1/aip/skill · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
