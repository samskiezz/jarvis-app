/**
 * SkillOpsGapDetector — F205
 *
 * Parallel-fetches /v1/aip/skill + /v1/ops/events then keyword-correlates
 * each ops event (service / component / type / description) against the skill
 * catalog to surface:
 *   SKILLED    — at least one JARVIS skill matches this event type (can handle it)
 *   SKILL-GAP  — no skill covers this event (capability gap exposed by live ops)
 *
 * Stat tiles: events / skills / skilled / skill-gap
 * Filter tabs: ALL / SKILLED / SKILL-GAP
 * Search across events and skills.
 * Expand event → matched skills with score bar.
 * Amber badge on skill-gap count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence capability-gap brief
 *   + jarvis:speak-dossier TTS.
 * 90 s auto-refresh.
 *
 * Intent: "skill ops gap" / "ops skill gap" / "can jarvis handle" /
 *         "capability gap" / "skopsgap" / "ops skill coverage"
 *   → jarvis:skopsgap-toggle event
 *
 * Toggle: ◈ SKOPSGAP at left:55640, bottom:8, zIndex:109.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const RED    = "#FF4444";
const DIM    = "#4A6070";
const BG     = "rgba(3,5,9,0.97)";
const BTN_LEFT   = 55640;
const REFRESH_MS = 90_000;
const MONO = "'JetBrains Mono','SF Mono',ui-monospace,monospace";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── intent exports ───────────────────────────────────────────────────────────

const SKOPSGAP_RE =
  /\b(skill\s+ops(\s+gap)?|ops\s+skill(\s+gap)?|capability\s+gap|skopsgap|ops\s+skill\s+coverage|can\s+jarvis\s+handle|ops\s+coverage\s+gap|skill\s+coverage\s+gap|what\s+skills\s+(are\s+)?missing|ops\s+skill\s+map)\b/i;

export function isSkopsgapQuery(t) { return SKOPSGAP_RE.test(t || ""); }

export async function buildSkopsgapScript() {
  const [sRaw, oRaw] = await Promise.allSettled([
    fetch(`${apiBase()}/v1/aip/skill`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then((r) => r.json()),
    fetch(`${apiBase()}/v1/ops/events`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then((r) => r.json()),
  ]);
  const skills = normaliseSkills(sRaw.status === "fulfilled" ? sRaw.value : []);
  const events = normaliseEvents(oRaw.status === "fulfilled" ? oRaw.value : []);
  const pairs  = correlate(events, skills);
  const skilled   = pairs.filter((p) => p.matches.length > 0).length;
  const skillGap  = pairs.filter((p) => p.matches.length === 0).length;
  const gapTypes  = pairs
    .filter((p) => p.matches.length === 0)
    .slice(0, 3)
    .map((p) => p.event.service || p.event.title)
    .join(", ") || "none identified";
  return (
    `Assess JARVIS skill-to-ops-event coverage in 2 sentences. ` +
    `${events.length} live ops events analysed against ${skills.length} JARVIS skills: ` +
    `${skilled} SKILLED (capability match found), ${skillGap} SKILL-GAP (no matching skill — ` +
    `capability shortfall exposed by live operations). Top uncovered areas: ${gapTypes}.`
  );
}

// ─── normalise helpers ────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))               return raw;
  if (raw && Array.isArray(raw.skills)) return raw.skills;
  if (raw && Array.isArray(raw.events)) return raw.events;
  if (raw && Array.isArray(raw.items))  return raw.items;
  if (raw && Array.isArray(raw.data))   return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  return [];
}

function normaliseSkills(raw) {
  return normaliseArray(raw).map((s, i) => ({
    id:          s.id || s.skill_id || String(i),
    name:        s.name || s.skill_name || s.title || `Skill ${i + 1}`,
    description: s.description || s.summary || s.details || "",
    category:    s.category || s.type || s.domain || "",
    score:       typeof s.score === "number" ? s.score : 0,
    keywords:    [
      s.name, s.title, s.description, s.summary, s.category, s.type, s.domain,
      ...(s.tags || []),
    ].filter(Boolean).join(" ").toLowerCase(),
  }));
}

function normaliseEvents(raw) {
  return normaliseArray(raw)
    .slice(0, 50)
    .map((e, i) => ({
      id:          e.id || e.event_id || String(i),
      title:       e.title || e.name || e.message || e.description || `Event ${i + 1}`,
      service:     e.service || e.source || e.component || e.origin || "",
      type:        e.type || e.event_type || e.category || "",
      severity:    e.severity || e.level || e.priority || "info",
      description: e.description || e.message || e.summary || e.details || "",
      keywords:    [
        e.title, e.name, e.message, e.description, e.service, e.source,
        e.component, e.type, e.event_type, e.category,
        ...(e.tags || []),
      ].filter(Boolean).join(" ").toLowerCase(),
    }));
}

// ─── correlation ──────────────────────────────────────────────────────────────

function tokenise(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length > 2);
}

function scoreMatch(event, skill) {
  const eToks = tokenise(event.keywords);
  const sToks = tokenise(skill.keywords);
  if (!eToks.length || !sToks.length) return 0;
  const hits = eToks.filter((t) => sToks.includes(t)).length;
  return hits / Math.max(eToks.length, 1);
}

function correlate(events, skills) {
  return events.map((event) => {
    const scored = skills
      .map((skill) => ({ skill, score: scoreMatch(event, skill) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    return { event, matches: scored };
  });
}

// ─── small sub-components ─────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{
      flex: 1, background: "rgba(0,0,0,0.35)", borderRadius: 6,
      border: `1px solid ${color}33`, padding: "6px 8px", textAlign: "center",
    }}>
      <div style={{ color, fontSize: 16, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      <div style={{ color: DIM, fontSize: 8, letterSpacing: 1.5, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function ScoreBar({ score, color }) {
  return (
    <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2 }}>
      <div style={{
        height: "100%", borderRadius: 2,
        width: `${Math.min(100, Math.round(score * 100))}%`,
        background: color, minWidth: 4,
      }} />
    </div>
  );
}

function severityColor(s) {
  const v = (s || "").toLowerCase();
  if (v === "critical")                     return RED;
  if (v === "high" || v === "error")        return "#FF6B35";
  if (v === "medium" || v === "warning")    return AMBER;
  return DIM;
}

// ─── main component ───────────────────────────────────────────────────────────

export default function SkillOpsGapDetector() {
  const [open, setOpen]         = useState(false);
  const [pairs, setPairs]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sRes, oRes] = await Promise.allSettled([
        fetch(`${apiBase()}/v1/aip/skill`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
        fetch(`${apiBase()}/v1/ops/events`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
      ]);
      const skills = normaliseSkills(sRes.status === "fulfilled" ? sRes.value : []);
      const events = normaliseEvents(oRes.status === "fulfilled" ? oRes.value : []);
      setPairs(correlate(events, skills));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:skopsgap-toggle", onToggle);
    return () => window.removeEventListener("jarvis:skopsgap-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const skilled  = pairs.filter((p) => p.matches.length > 0);
  const skillGap = pairs.filter((p) => p.matches.length === 0);

  const visible = pairs
    .filter((p) => {
      if (tab === "SKILLED")    return p.matches.length > 0;
      if (tab === "SKILL-GAP")  return p.matches.length === 0;
      return true;
    })
    .filter((p) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        p.event.title.toLowerCase().includes(q) ||
        p.event.service.toLowerCase().includes(q) ||
        p.event.type.toLowerCase().includes(q) ||
        p.matches.some((m) => m.skill.name.toLowerCase().includes(q))
      );
    });

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildSkopsgapScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const answer = (d.answer || d.response || "No assessment available.").trim();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: "Unable to generate assessment at this time." },
      }));
    } finally {
      setAssessing(false);
    }
  }

  const badgeCount = skillGap.length;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Skill × Ops Event Gap Detector"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 109,
          background: "rgba(3,5,9,0.82)", border: `1px solid ${AMBER}55`,
          color: AMBER, fontFamily: MONO, fontSize: 9, letterSpacing: 1.5,
          padding: "4px 8px", borderRadius: 5, cursor: "pointer",
          backdropFilter: "blur(6px)",
        }}
      >
        ◈ SKOPSGAP
        {badgeCount > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#0A0D14",
            borderRadius: 8, fontSize: 9, padding: "1px 4px", fontWeight: 700,
          }}>{badgeCount}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 44, left: BTN_LEFT - 400, zIndex: 109,
      width: 540, maxHeight: "76vh",
      background: BG, border: `1px solid ${AMBER}55`, borderRadius: 10,
      display: "flex", flexDirection: "column",
      boxShadow: `0 0 40px ${AMBER}18`, fontFamily: MONO, overflow: "hidden",
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px", borderBottom: `1px solid ${AMBER}33`,
        background: "rgba(0,0,0,0.4)",
      }}>
        <span style={{ color: AMBER, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
          ◈ SKILL × OPS EVENT GAP DETECTOR
        </span>
        <span style={{ marginLeft: "auto", fontSize: 9, color: DIM }}>
          {loading ? "refreshing…" : `${pairs.length} events`}
        </span>
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14,
        }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
        <Tile label="OPS EVENTS" value={pairs.length}       color={AMBER} />
        <Tile label="SKILLS"     value={
          pairs.flatMap((p) => p.matches).length > 0
            ? new Set(pairs.flatMap((p) => p.matches.map((m) => m.skill.id))).size
            : "—"
        }                                                   color={CY} />
        <Tile label="SKILLED"    value={skilled.length}     color={GREEN} />
        <Tile label="SKILL-GAP"  value={skillGap.length}    color={AMBER} />
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 6, padding: "0 12px 6px" }}>
        {["ALL", "SKILLED", "SKILL-GAP"].map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? AMBER : "rgba(0,0,0,0.3)",
            color: tab === t ? "#0A0D14" : AMBER,
            border: `1px solid ${AMBER}55`, borderRadius: 4,
            fontSize: 9, letterSpacing: 1, padding: "3px 8px", cursor: "pointer",
          }}>{t}</button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search events / skills…"
          style={{
            marginLeft: "auto", background: "rgba(0,0,0,0.4)", border: `1px solid ${DIM}44`,
            borderRadius: 4, color: "#DCEBF5", fontSize: 10, padding: "3px 8px",
            fontFamily: MONO, width: 160, outline: "none",
          }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 10px" }}>
        {error && (
          <div style={{ color: RED, fontSize: 11, padding: "8px 0" }}>Error: {error}</div>
        )}
        {!error && visible.length === 0 && !loading && (
          <div style={{ color: DIM, fontSize: 11, padding: "8px 0" }}>No results.</div>
        )}
        {visible.map((pair) => {
          const isOpen    = expanded[pair.event.id];
          const isCovered = pair.matches.length > 0;
          return (
            <div key={pair.event.id} style={{
              borderBottom: `1px solid rgba(255,255,255,0.05)`, marginBottom: 2,
            }}>
              {/* row */}
              <div
                onClick={() => setExpanded((prev) => ({ ...prev, [pair.event.id]: !prev[pair.event.id] }))}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 4px", cursor: "pointer", borderRadius: 4,
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(245,166,35,0.06)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >
                {/* severity dot */}
                <div style={{
                  width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                  background: severityColor(pair.event.severity),
                  boxShadow: `0 0 4px ${severityColor(pair.event.severity)}`,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 11, color: "#DCEBF5",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {pair.event.title}
                  </div>
                  <div style={{ fontSize: 9, color: DIM, marginTop: 1 }}>
                    {[pair.event.service, pair.event.type].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <span style={{
                  fontSize: 9, letterSpacing: 1, padding: "2px 6px", borderRadius: 3,
                  background: isCovered ? `${GREEN}22` : `${AMBER}22`,
                  color: isCovered ? GREEN : AMBER,
                  border: `1px solid ${isCovered ? GREEN : AMBER}55`,
                  flexShrink: 0,
                }}>
                  {isCovered ? "SKILLED" : "SKILL-GAP"}
                </span>
                <span style={{ color: DIM, fontSize: 10 }}>{isOpen ? "▲" : "▼"}</span>
              </div>

              {/* expanded matches */}
              {isOpen && (
                <div style={{ paddingLeft: 22, paddingBottom: 6 }}>
                  {pair.matches.length === 0 ? (
                    <div style={{ fontSize: 10, color: DIM, padding: "4px 0" }}>
                      No skill coverage — this ops event type exposes a capability gap.
                    </div>
                  ) : (
                    pair.matches.map(({ skill, score }) => (
                      <div key={skill.id} style={{
                        padding: "4px 0",
                        borderBottom: `1px solid rgba(255,255,255,0.04)`,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1 }}>{skill.name}</span>
                          {skill.category && (
                            <span style={{
                              fontSize: 8, padding: "1px 4px", borderRadius: 3,
                              background: `${CY}22`, color: CY, border: `1px solid ${CY}33`,
                            }}>{skill.category}</span>
                          )}
                          {skill.score > 0 && (
                            <span style={{
                              fontSize: 8, padding: "1px 4px", borderRadius: 3,
                              background: "rgba(0,200,120,0.1)", color: GREEN,
                            }}>{Math.round(skill.score)}</span>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <ScoreBar score={score} color={AMBER} />
                          <span style={{ fontSize: 9, color: DIM, flexShrink: 0 }}>
                            {Math.round(score * 100)}%
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{
        padding: "8px 12px", borderTop: `1px solid ${AMBER}33`,
        background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", gap: 8,
      }}>
        <button
          onClick={assess}
          disabled={assessing || pairs.length === 0}
          style={{
            background: assessing ? "rgba(0,0,0,0.4)" : `${AMBER}22`,
            border: `1px solid ${AMBER}66`, color: AMBER,
            fontFamily: MONO, fontSize: 10, letterSpacing: 1,
            padding: "4px 12px", borderRadius: 4, cursor: assessing ? "default" : "pointer",
          }}
        >
          {assessing ? "assessing…" : "▶ ASSESS"}
        </button>
        <span style={{ marginLeft: "auto", fontSize: 9, color: DIM }}>
          auto-refresh 90 s
        </span>
        <button
          onClick={load}
          style={{
            background: "none", border: `1px solid ${DIM}44`, color: DIM,
            fontFamily: MONO, fontSize: 9, padding: "2px 6px", borderRadius: 4, cursor: "pointer",
          }}
        >↺</button>
      </div>
    </div>
  );
}
