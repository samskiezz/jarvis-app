/**
 * F73 — Skill × Investigation Coverage Advisor
 *
 * Parallel-fetches /v1/aip/skill and /v1/investigations, then
 * keyword-correlates each skill against open cases to surface whether
 * the skill is NEEDED (at least one open investigation references it)
 * or IDLE (no open case draws on it — a potential training surplus).
 *
 * Stat tiles: skills / cases / needed / idle.
 * Filter tabs: ALL | NEEDED | IDLE.
 * Expand any skill → matched investigations with relevance score + status.
 * ▶ ASSESS: 2-sentence AI capability-gap brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SKIINV  at bottom:8 left:9436, zIndex 69.
 * Voice:   "skill investigation / investigation skill / case skill gap / skiinv / skills for cases"
 * Event:   jarvis:skiinv-toggle
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 9436;
const POLL_MS  = 90_000;
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

const SKIINV_RE =
  /\b(skill\s+invest|invest\w*\s+skill|case\s+skill\s+gap|skiinv|skills\s+for\s+cases|skill\s+coverage\s+(for\s+)?invest|which\s+skills\s+(cover|help|address)\s+invest)\b/i;

export function isSkiinvQuery(q) { return SKIINV_RE.test(q); }

export async function buildSkiinvScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [skillRes, invRes] = await Promise.all([
      fetch(`${base}/v1/aip/skill`,       { headers: hdr }),
      fetch(`${base}/v1/investigations`,  { headers: hdr }),
    ]);
    const skills = normaliseSkills(await skillRes.json());
    const cases  = normaliseCases(await invRes.json());

    const needed = skills.filter((sk) => cases.some((c) => relevance(sk, c) > 0)).length;
    const idle   = skills.length - needed;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS skill-investigation coverage: ${skills.length} skills catalogued, ` +
          `${cases.length} open investigations on file, ${needed} skills are referenced ` +
          `by at least one active case, ${idle} skills have no matching investigation — ` +
          `potential training surplus or coverage gap. ` +
          `Give a 2-sentence capability-gap brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Skill-investigation coverage analysis complete, sir.").trim();
  } catch {
    return "Skill-investigation coverage analysis is unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseSkills(raw) {
  const arr = Array.isArray(raw)               ? raw
    : Array.isArray(raw?.data)                 ? raw.data
    : Array.isArray(raw?.skills)               ? raw.skills
    : Array.isArray(raw?.items)                ? raw.items
    : Array.isArray(raw?.results)              ? raw.results
    : [];
  return arr.map((sk, i) => ({
    id:       sk.id          || String(i),
    name:     sk.name        || sk.skill_name || sk.title || `Skill ${i + 1}`,
    category: (sk.category   || sk.domain     || sk.type  || "").toLowerCase(),
    score:    Number(sk.score || sk.level      || sk.proficiency || 0),
    desc:     (sk.description || sk.summary   || sk.tags  || "").toString(),
  }));
}

function normaliseCases(raw) {
  const arr = Array.isArray(raw)                  ? raw
    : Array.isArray(raw?.data)                    ? raw.data
    : Array.isArray(raw?.investigations)          ? raw.investigations
    : Array.isArray(raw?.items)                   ? raw.items
    : Array.isArray(raw?.results)                 ? raw.results
    : [];
  return arr.map((c, i) => ({
    id:     c.id      || String(i),
    title:  c.title   || c.name  || c.case_name || `Case ${i + 1}`,
    status: (c.status || c.state || "").toLowerCase(),
    desc:   (c.description || c.summary || c.tags || "").toString(),
  }));
}

function skillKeywords(sk) {
  return String(`${sk.name} ${sk.desc}`)
    .toLowerCase()
    .split(/[\s_\-.,/|:@()"']+/)
    .filter((w) => w.length >= 3);
}

function caseKeywords(c) {
  return String(`${c.title} ${c.desc}`)
    .toLowerCase()
    .split(/[\s_\-.,/|:@()"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(sk, c) {
  const sw = skillKeywords(sk);
  const cw = caseKeywords(c);
  return sw.filter((w) => cw.some((s) => s.includes(w) || w.includes(s))).length;
}

function buildLinked(skills, cases) {
  return skills.map((sk) => {
    const matched = cases
      .map((c) => ({ ...c, score: relevance(sk, c) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...sk, cases: matched, needed: matched.length > 0 };
  });
}

// ── colours ───────────────────────────────────────────────────────────────────

function statusColor(s) {
  if (s === "closed"   || s === "resolved")   return "#4ADE80";
  if (s === "open"     || s === "active")     return C.neon;
  if (s === "pending"  || s === "review")     return "#F59E0B";
  if (s === "critical" || s === "escalated")  return "#EF4444";
  return S.text;
}

function scoreColor(v) {
  if (v >= 80) return "#4ADE80";
  if (v >= 50) return C.neon;
  if (v >= 25) return "#F97316";
  return "#EF4444";
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "NEEDED", "IDLE"];

export default function SkillInvestigationAdvisor() {
  const [open,      setOpen]      = useState(false);
  const [skills,    setSkills]    = useState([]);
  const [cases,     setCases]     = useState([]);
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
      const [skillRes, invRes] = await Promise.all([
        fetch(`${base}/v1/aip/skill`,      { headers: hdr }),
        fetch(`${base}/v1/investigations`, { headers: hdr }),
      ]);
      setSkills(normaliseSkills(await skillRes.json()));
      setCases(normaliseCases(await invRes.json()));
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
    window.addEventListener("jarvis:skiinv-toggle", onToggle);
    return () => window.removeEventListener("jarvis:skiinv-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isSkiinvQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const linked   = buildLinked(skills, cases);
  const neededCnt = linked.filter((sk) => sk.needed).length;
  const idleCnt   = linked.filter((sk) => !sk.needed).length;

  const visible = linked.filter((sk) => {
    if (filter === "NEEDED") return sk.needed;
    if (filter === "IDLE")   return !sk.needed;
    return true;
  });

  async function assess() {
    setAssessing(true);
    const text = await buildSkiinvScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Skill × Investigation Advisor (◈ SKIINV)"
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
        ◈ SKIINV{idleCnt > 0 && (
          <span style={{
            marginLeft: 4, background: "#F97316", color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{idleCnt}</span>
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
              SKILLS × INVESTIGATIONS
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
              { label: "SKILLS",  val: skills.length, color: C.blue    },
              { label: "CASES",   val: cases.length,  color: C.gold    },
              { label: "NEEDED",  val: neededCnt,     color: "#4ADE80" },
              { label: "IDLE",    val: idleCnt,       color: "#F97316" },
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
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${sk.needed ? "#4ADE80" : "#F97316"}`,
                  }}
                >
                  <span style={{ color: sk.needed ? "#4ADE80" : "#F97316", fontSize: 10, width: 10 }}>
                    {sk.needed ? "●" : "○"}
                  </span>
                  <span style={{ flex: 1, color: S.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "9px" }}>
                    {sk.name}
                  </span>
                  {sk.score > 0 && (
                    <span style={{
                      fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                      background: `${scoreColor(sk.score)}22`, color: scoreColor(sk.score),
                      border: `1px solid ${scoreColor(sk.score)}44`,
                      whiteSpace: "nowrap",
                    }}>
                      {Math.round(sk.score)}
                    </span>
                  )}
                  <span style={{ color: sk.needed ? "#4ADE80" : "#F97316", fontSize: "9px", minWidth: 48, textAlign: "right" }}>
                    {sk.needed ? `${sk.cases.length} CASE${sk.cases.length !== 1 ? "S" : ""}` : "IDLE"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9 }}>{expanded === sk.id ? "▴" : "▾"}</span>
                </div>

                {expanded === sk.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {sk.needed ? sk.cases.map((c) => (
                      <div key={c.id} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "2px 0", borderBottom: `1px solid ${S.border}33`,
                      }}>
                        <span style={{ color: S.textHi, fontSize: "9px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.title}
                        </span>
                        <span style={{ fontSize: "9px", marginLeft: 6, whiteSpace: "nowrap", color: c.status ? statusColor(c.status) : S.text }}>
                          {c.status ? `${c.status} ` : ""}rel:{c.score}
                        </span>
                      </div>
                    )) : (
                      <div style={{ color: S.text, fontSize: "9px", padding: "2px 0" }}>
                        No open investigations reference this skill — potential training surplus.
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
            /v1/aip/skill · /v1/investigations · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
