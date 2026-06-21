/**
 * F65 — Skill-Dataset Coverage Advisor
 *
 * Parallel-fetches /v1/aip/skill + /v1/datasets, then keyword-correlates each
 * self-improvement skill against the dataset catalog to surface whether JARVIS
 * has the raw data needed to improve each skill (BACKED) or not (DARK).
 *
 * Stat tiles: skills / datasets / backed / dark.
 * Filter tabs: ALL | BACKED | DARK.
 * Expand a skill row to see which datasets match and their relevance score.
 * ▶ ASSESS: sends a two-sentence AI readiness brief to /v1/jarvis/agent/chat + TTS
 *   via jarvis:speak-dossier.
 *
 * Toggle:  ◈ SKDS  at bottom:8 left:8500, zIndex 65.
 * Voice:   "skill dataset / skill data gap / data for skills / skds"
 * Event:   jarvis:skds-toggle
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 8500;
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

const SKDS_RE =
  /\b(skill\s+dataset|skill\s+data\s+gap|data\s+for\s+skills?|dataset\s+skill|skds|skill\s+data\s+coverage|data.backed\s+skill)\b/i;

export function isSkdsQuery(q) { return SKDS_RE.test(q); }

export async function buildSkdsScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [sRes, dRes] = await Promise.all([
      fetch(`${base}/v1/aip/skill`, { headers: hdr }),
      fetch(`${base}/v1/datasets`,  { headers: hdr }),
    ]);
    const sRaw  = await sRes.json();
    const dRaw  = await dRes.json();
    const skills   = normaliseSkills(sRaw);
    const datasets = normaliseDatasets(dRaw);

    const { backed, dark } = correlate(skills, datasets);
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS skill-dataset coverage: ${skills.length} skills, ` +
          `${datasets.length} datasets, ${backed} data-backed, ${dark} data-dark. ` +
          `Give a 2-sentence readiness brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Skill-dataset coverage analysis complete, sir.").trim();
  } catch {
    return "Skill-dataset coverage analysis unavailable at this time, sir.";
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normaliseSkills(raw) {
  const arr = Array.isArray(raw)       ? raw
    : Array.isArray(raw?.data)         ? raw.data
    : Array.isArray(raw?.skills)       ? raw.skills
    : Array.isArray(raw?.items)        ? raw.items
    : Array.isArray(raw?.results)      ? raw.results
    : [];
  return arr.map((s, i) => ({
    id:    s.id    || s.skill_id   || String(i),
    name:  s.name  || s.skill_name || s.label || `Skill ${i + 1}`,
    score: s.score != null ? parseFloat(s.score)
         : s.value != null ? parseFloat(s.value)
         : null,
    tags:  (s.tags || s.keywords || s.category || "").toString(),
  }));
}

function normaliseDatasets(raw) {
  const arr = Array.isArray(raw)       ? raw
    : Array.isArray(raw?.data)         ? raw.data
    : Array.isArray(raw?.datasets)     ? raw.datasets
    : Array.isArray(raw?.items)        ? raw.items
    : Array.isArray(raw?.results)      ? raw.results
    : [];
  return arr.map((d, i) => ({
    id:    d.id      || String(i),
    name:  d.name    || d.title || d.dataset_name || `Dataset ${i + 1}`,
    rows:  d.rows    ?? d.row_count ?? d.record_count ?? null,
    desc:  (d.description || d.desc || d.topic || d.subject || "").toString(),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|]+/)
    .filter((w) => w.length >= 3);
}

function relevance(skill, dataset) {
  const sw = keywords(skill.name + " " + skill.tags);
  const dw = keywords(dataset.name + " " + dataset.desc);
  return sw.filter((w) => dw.some((d) => d.includes(w) || w.includes(d))).length;
}

function correlate(skills, datasets) {
  let backed = 0, dark = 0;
  for (const sk of skills) {
    const matched = datasets.some((ds) => relevance(sk, ds) > 0);
    matched ? backed++ : dark++;
  }
  return { backed, dark };
}

function buildCorrelatedSkills(skills, datasets) {
  return skills.map((sk) => {
    const matched = datasets
      .map((ds) => ({ ...ds, score: relevance(sk, ds) }))
      .filter((ds) => ds.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...sk, datasets: matched, backed: matched.length > 0 };
  });
}

// ── component ────────────────────────────────────────────────────────────────

const TABS = ["ALL", "BACKED", "DARK"];

export default function SkillDatasetCoverageAdvisor() {
  const [open,      setOpen]      = useState(false);
  const [skills,    setSkills]    = useState([]);
  const [datasets,  setDatasets]  = useState([]);
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
      const [sRes, dRes] = await Promise.all([
        fetch(`${base}/v1/aip/skill`, { headers: hdr }),
        fetch(`${base}/v1/datasets`,  { headers: hdr }),
      ]);
      const sRaw = await sRes.json();
      const dRaw = await dRes.json();
      setSkills(normaliseSkills(sRaw));
      setDatasets(normaliseDatasets(dRaw));
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
    window.addEventListener("jarvis:skds-toggle", onToggle);
    return () => window.removeEventListener("jarvis:skds-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isSkdsQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const correlated = buildCorrelatedSkills(skills, datasets);

  const backed = correlated.filter((s) => s.backed).length;
  const dark   = correlated.filter((s) => !s.backed).length;

  const visible = correlated.filter((s) => {
    if (filter === "BACKED") return s.backed;
    if (filter === "DARK")   return !s.backed;
    return true;
  });

  async function assess() {
    setAssessing(true);
    const text = await buildSkdsScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Skill-Dataset Coverage Advisor (◈ SKDS)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 65,
          background: open ? "rgba(0,200,120,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? C.neon : S.border}`,
          borderRadius: S.radius, color: open ? C.neon : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${C.neon}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ SKDS{dark > 0 && (
          <span style={{
            marginLeft: 4, background: C.red, color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{dark}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 64,
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
              SKILL–DATASET COVERAGE
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
              { label: "SKILLS",   val: skills.length,    color: C.neon  },
              { label: "DATASETS", val: datasets.length,  color: C.blue  },
              { label: "BACKED",   val: backed,           color: "#4ADE80" },
              { label: "DARK",     val: dark,             color: C.red   },
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
                    borderLeft: `3px solid ${sk.backed ? "#4ADE80" : C.red}`,
                  }}
                >
                  <span style={{ color: sk.backed ? "#4ADE80" : C.red, fontSize: 10, width: 10 }}>
                    {sk.backed ? "●" : "○"}
                  </span>
                  <span style={{ flex: 1, color: S.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {sk.name}
                  </span>
                  {sk.score != null && (
                    <span style={{ color: C.gold, fontSize: "9px" }}>{sk.score.toFixed(1)}</span>
                  )}
                  <span style={{ color: sk.backed ? "#4ADE80" : C.red, fontSize: "9px", minWidth: 36, textAlign: "right" }}>
                    {sk.backed ? `${sk.datasets.length} DS` : "DARK"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9 }}>{expanded === sk.id ? "▴" : "▾"}</span>
                </div>

                {expanded === sk.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {sk.backed ? sk.datasets.map((ds) => (
                      <div key={ds.id} style={{
                        display: "flex", justifyContent: "space-between",
                        padding: "2px 0", borderBottom: `1px solid ${S.border}33`,
                      }}>
                        <span style={{ color: S.textHi, fontSize: "9px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {ds.name}
                        </span>
                        <span style={{ color: C.blue, fontSize: "9px", marginLeft: 6 }}>
                          rel:{ds.score}
                          {ds.rows != null && ` · ${ds.rows.toLocaleString()}r`}
                        </span>
                      </div>
                    )) : (
                      <div style={{ color: S.text, fontSize: "9px", padding: "2px 0" }}>
                        No matching datasets found for this skill.
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
            /v1/aip/skill · /v1/datasets · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
