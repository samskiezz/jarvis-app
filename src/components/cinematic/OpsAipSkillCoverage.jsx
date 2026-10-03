/**
 * F94 — Ops Events × AIP Skill Response Coverage (OPASK)
 *
 * Parallel-fetches /v1/ops/events + /v1/aip/skill every 60 s.
 * Keyword-correlates significant ops events (sev≥50) against JARVIS AI skills:
 *   SKILLED      — ≥1 AI skill keyword-matches this event's domain
 *   UNSUPPORTED  — 0 skills cover this event (AI capability blind-spot)
 *
 * Stat tiles:  events / skills / skilled / unsupported
 * Filter tabs: ALL | SKILLED | UNSUPPORTED
 * Text search: across event type / description / category.
 * Expand row → matched AI skill cards with type badge + relevance score bar.
 * Amber badge on UNSUPPORTED count.
 * ▶ ASSESS AI GAPS: 2-sentence capability gap brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ OPASK  at left:29720, bottom:8, zIndex:94.
 * Event:   jarvis:opask-toggle
 * Voice:   "opask" / "ops skill" / "ai skill gap" / "unsupported events" /
 *          "event skill" / "ops ai coverage" / "ai capability gap" /
 *          "skill ops" / "ops ai gap" / "operational skill coverage"
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF4560";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 29720;
const REFRESH_MS = 60_000;
const SEV_THRESHOLD = 50;
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

function normaliseEvents(raw) {
  return normaliseArray(raw)
    .map((e, i) => ({
      id:       String(e.id ?? e.event_id ?? i),
      title:    e.title ?? e.name ?? e.event_type ?? e.type ?? `Event ${i + 1}`,
      category: e.category ?? e.event_type ?? e.type ?? null,
      severity: Number(e.severity ?? e.sev ?? e.score ?? 0),
      desc:     e.description ?? e.summary ?? e.details ?? "",
      body: [
        e.title, e.name, e.event_type, e.type, e.description,
        e.summary, e.details, e.category, e.tags, e.source,
      ].filter(Boolean).join(" "),
    }))
    .filter(e => e.severity >= SEV_THRESHOLD);
}

function normaliseSkills(raw) {
  return normaliseArray(raw).map((s, i) => ({
    id:       String(s.id ?? s.skill_id ?? i),
    name:     s.name ?? s.skill_name ?? s.title ?? `Skill ${i + 1}`,
    type:     s.type ?? s.category ?? s.skill_type ?? null,
    score:    s.score ?? s.level ?? s.value ?? null,
    body: [
      s.name, s.skill_name, s.title, s.description, s.summary,
      s.type, s.category, s.skill_type, s.tags, s.domain,
      s.capability, s.topic,
    ].filter(Boolean).join(" "),
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
  const [evtRes, skillRes] = await Promise.all([
    fetch(`${base}/v1/ops/events`,  { headers: hdr }),
    fetch(`${base}/v1/aip/skill`,   { headers: hdr }),
  ]);
  return {
    events: normaliseEvents(evtRes.ok    ? await evtRes.json()   : []),
    skills: normaliseSkills(skillRes.ok  ? await skillRes.json() : []),
  };
}

// ─── correlation ──────────────────────────────────────────────────────────────

function correlate(events, skills) {
  return events.map(evt => {
    const kws = buildKeywords([evt.title, evt.category ?? "", evt.desc, evt.body]);
    const matched = skills
      .map(sk => ({ sk, score: scoreMatch(kws, `${sk.name} ${sk.body}`) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);
    const cls = matched.length >= 1 ? "SKILLED" : "UNSUPPORTED";
    return { ...evt, matched, classification: cls };
  });
}

// ─── exported intent helpers ──────────────────────────────────────────────────

const OPASK_RE =
  /\b(opask|ops[\s_-]?skill[s]?|skill[\s_-]?ops|ai[\s_-]?skill[\s_-]?gap|unsupported[\s_-]?event[s]?|event[\s_-]?skill[s]?|ops[\s_-]?ai[\s_-]?coverage|ai[\s_-]?capability[\s_-]?gap|ops[\s_-]?ai[\s_-]?gap|operational[\s_-]?skill[\s_-]?coverage|skill[\s_-]?event[s]?|ops[\s_-]?capability)\b/i;

export function isOpaskQuery(q) { return OPASK_RE.test(q); }

export async function buildOpaskScript() {
  try {
    const { events, skills } = await fetchAll();
    const rows        = correlate(events, skills);
    const skilled     = rows.filter(r => r.classification === "SKILLED").length;
    const unsupported = rows.filter(r => r.classification === "UNSUPPORTED").length;
    const prompt =
      `Ops events AI skill coverage: ${events.length} significant ops events (severity≥${SEV_THRESHOLD}) ` +
      `cross-referenced against ${skills.length} JARVIS AI skills. ` +
      `${skilled} events are SKILLED — at least one AI skill covers the domain — while ` +
      `${unsupported} are UNSUPPORTED, representing AI capability blind-spots. ` +
      `In 2 sentences, assess the operational AI coverage health and identify the most critical ` +
      `unsupported events that require new AI skill development or remediation.`;
    const base = apiBase();
    const res  = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body:    JSON.stringify({ message: prompt }),
    });
    const data = await res.json();
    window.dispatchEvent(new CustomEvent("jarvis:opask-toggle"));
    return (data.answer || "Ops AI skill coverage panel is now open, sir.").replace(/<<ACTION:[^>]*>>/g, "").trim();
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:opask-toggle"));
    return "Ops AI skill coverage panel is standing by, sir.";
  }
}

// ─── sub-components ───────────────────────────────────────────────────────────

function ClsBadge({ cls }) {
  const colour = cls === "SKILLED" ? GREEN : AMBER;
  return (
    <span style={{
      fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: 1,
      padding: "1px 6px", borderRadius: 3,
      border: `1px solid ${colour}`, color: colour,
    }}>{cls}</span>
  );
}

function SevBadge({ sev }) {
  const colour = sev >= 90 ? RED : sev >= 70 ? AMBER : MUTED;
  return (
    <span style={{
      fontFamily: MONO, fontSize: 9, padding: "1px 5px", borderRadius: 3,
      border: `1px solid ${colour}44`, color: colour,
    }}>SEV {sev}</span>
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

export default function OpsAipSkillCoverage() {
  const [open,       setOpen]       = useState(false);
  const [events,     setEvents]     = useState([]);
  const [skills,     setSkills]     = useState([]);
  const [rows,       setRows]       = useState([]);
  const [tab,        setTab]        = useState("ALL");
  const [q,          setQ]          = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [assessing,  setAssessing]  = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { events: ev, skills: sk } = await fetchAll();
      setEvents(ev);
      setSkills(sk);
      setRows(correlate(ev, sk));
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
    window.addEventListener("jarvis:opask-toggle", handler);
    return () => window.removeEventListener("jarvis:opask-toggle", handler);
  }, []);

  const skilled     = rows.filter(r => r.classification === "SKILLED").length;
  const unsupported = rows.filter(r => r.classification === "UNSUPPORTED").length;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r.classification !== tab) return false;
    if (q) {
      const lq = q.toLowerCase();
      return (r.title + (r.category ?? "") + r.desc).toLowerCase().includes(lq);
    }
    return true;
  });

  const maxScore = Math.max(1, ...rows.flatMap(r => r.matched.map(m => m.score)));

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildOpaskScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch { /* silent */ }
    setAssessing(false);
  }

  const TABS = ["ALL", "SKILLED", "UNSUPPORTED"];
  const TAB_COLOUR = { SKILLED: GREEN, UNSUPPORTED: AMBER, ALL: CY };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Ops Events × AIP Skill Coverage"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 94,
          fontFamily: MONO, fontSize: 10, letterSpacing: 1,
          padding: "3px 8px", borderRadius: 4, cursor: "pointer",
          border: `1px solid ${AMBER}`, color: AMBER, background: "rgba(4,7,14,0.7)",
          whiteSpace: "nowrap",
        }}
      >
        ◈ OPASK{unsupported > 0 && <span style={{ marginLeft: 5, color: AMBER }}>({unsupported})</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, left: 220, zIndex: 94,
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
          ◈ OPS EVENTS × AI SKILL COVERAGE
        </span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: MUTED }}>
          {events.length} events · {skills.length} skills · {loading ? "refreshing…" : "live"}
        </span>
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: MUTED,
          cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0,
        }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 10, padding: "10px 16px", flexWrap: "wrap" }}>
        {[
          { label: "EVENTS",      value: events.length,  colour: CY    },
          { label: "AI SKILLS",   value: skills.length,  colour: MUTED },
          { label: "SKILLED",     value: skilled,        colour: GREEN },
          { label: "UNSUPPORTED", value: unsupported,    colour: AMBER },
        ].map(({ label, value, colour }) => (
          <div key={label} style={{
            flex: "1 1 90px", minWidth: 80,
            background: "rgba(10,20,35,0.6)", borderRadius: 8,
            border: `1px solid ${colour}33`, padding: "8px 10px", textAlign: "center",
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: colour }}>{value}</div>
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
          placeholder="search events…"
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
          {assessing ? "assessing…" : "▶ ASSESS AI GAPS"}
        </button>
      </div>

      {/* rows */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px 16px" }}>
        {visible.length === 0 && (
          <div style={{ textAlign: "center", color: MUTED, marginTop: 24, fontSize: 12 }}>
            {loading ? "loading events…" : "no events match current filter"}
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
                <div style={{ fontSize: 12, fontWeight: 600, color: "#DCEBF5" }}>
                  {row.title}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                  {row.category && (
                    <span style={{ fontSize: 10, color: MUTED }}>{row.category}</span>
                  )}
                </div>
              </div>
              <SevBadge sev={row.severity} />
              <span style={{ fontSize: 10, color: MUTED }}>
                {row.matched.length} skill{row.matched.length !== 1 ? "s" : ""}
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
                {row.desc && (
                  <div style={{ fontSize: 10, color: MUTED, marginBottom: 8, lineHeight: 1.5 }}>
                    {row.desc.slice(0, 200)}{row.desc.length > 200 ? "…" : ""}
                  </div>
                )}
                {row.matched.length === 0 ? (
                  <div style={{ fontSize: 11, color: MUTED }}>
                    No AI skills cover this event domain — operational AI blind-spot identified.
                  </div>
                ) : (
                  row.matched.map(({ sk, score }) => (
                    <div key={sk.id} style={{
                      marginBottom: 8, padding: "6px 10px",
                      background: "rgba(10,20,35,0.5)", borderRadius: 6,
                      border: `1px solid ${CY}18`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#DCEBF5", flex: 1 }}>
                          {sk.name}
                        </span>
                        {sk.type && (
                          <span style={{
                            fontSize: 9, padding: "1px 5px", borderRadius: 3,
                            border: `1px solid ${CY}44`, color: CY,
                          }}>{sk.type}</span>
                        )}
                        {sk.score != null && (
                          <span style={{ fontSize: 10, color: MUTED }}>{sk.score}</span>
                        )}
                        <span style={{ fontSize: 10, color: MUTED }}>×{score}</span>
                      </div>
                      <RelevanceBar score={score} max={maxScore} />
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
