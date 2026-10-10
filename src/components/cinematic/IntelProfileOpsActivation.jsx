/**
 * F91 — IntelProfile × Ops Events Activation (IPOPS)
 *
 * Parallel-fetches /entities/IntelProfile + /v1/ops/events every 90 s.
 * Keyword-correlates each threat intel profile against significant ops events:
 *   ACTIVATED — ≥1 live ops event matches this threat actor's keywords
 *   DORMANT   — 0 ops events match (no live activation detected)
 *
 * Stat tiles:  profiles / events / activated / dormant
 * Filter tabs: ALL | ACTIVATED | DORMANT
 * Text search: across profile name / threat type / summary.
 * Expand row → matched ops event cards with severity badge + relevance bar.
 * Amber badge on ACTIVATED count.
 * ▶ ASSESS: 2-sentence threat activation brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ IPOPS  at left:28600, bottom:8, zIndex:92.
 * Event:   jarvis:ipops-toggle
 * Voice:   "intel ops" / "ipops" / "activated threats" /
 *          "threat in ops" / "intel activation" /
 *          "ops threat match" / "threat operations" /
 *          "live threat activation" / "threat active"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const RED   = "#FF4D4D";
const GREEN = "#00c878";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 28600;
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

function normaliseProfiles(raw) {
  return normaliseArray(raw).map((p, i) => ({
    id:          String(p.id ?? p.profile_id ?? i),
    name:        p.name ?? p.actor_name ?? p.title ?? `Profile ${i + 1}`,
    threatType:  p.threat_type ?? p.type ?? p.category ?? null,
    summary:     p.summary ?? p.description ?? p.overview ?? "",
    body: [
      p.name, p.actor_name, p.title, p.description, p.summary,
      p.overview, p.threat_type, p.type, p.category, p.tags,
      p.aliases, p.techniques,
    ].filter(Boolean).join(" "),
  }));
}

function normaliseEvents(raw) {
  return normaliseArray(raw).map((e, i) => ({
    id:       String(e.id ?? e.event_id ?? i),
    title:    e.title ?? e.name ?? e.event_name ?? `Event ${i + 1}`,
    severity: typeof e.severity === "number" ? e.severity
            : typeof e.sev === "number" ? e.sev : null,
    type:     e.type ?? e.event_type ?? e.category ?? null,
    body: [
      e.title, e.name, e.description, e.message, e.summary,
      e.type, e.event_type, e.category, e.tags, e.source,
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
  const [profRes, evRes] = await Promise.all([
    fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
    fetch(`${base}/v1/ops/events`,         { headers: hdr }),
  ]);
  return {
    profiles: normaliseProfiles(profRes.ok ? await profRes.json() : []),
    events:   normaliseEvents(evRes.ok     ? await evRes.json()   : []),
  };
}

// ─── correlation ──────────────────────────────────────────────────────────────

function correlate(profiles, events) {
  return profiles.map(prof => {
    const kws = buildKeywords([prof.name, prof.threatType ?? "", prof.body]);
    const matched = events
      .map(ev => ({ ev, score: scoreMatch(kws, `${ev.title} ${ev.body}`) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);
    const cls = matched.length >= 1 ? "ACTIVATED" : "DORMANT";
    return { ...prof, matched, classification: cls };
  });
}

// ─── exported intent helpers ──────────────────────────────────────────────────

const IPOPS_RE =
  /\b(ipops|intel[\s_-]?ops|ops[\s_-]?intel|activated[\s_-]?threat[s]?|threat[s]?[\s_-]?in[\s_-]?ops|intel[\s_-]?activation|ops[\s_-]?threat[\s_-]?match|threat[\s_-]?operation[s]?|live[\s_-]?threat[\s_-]?activation|threat[s]?[\s_-]?active|threat[\s_-]?ops[\s_-]?link|intel[\s_-]?ops[\s_-]?map)\b/i;

export function isIpopsQuery(q) { return IPOPS_RE.test(q); }

export async function buildIpopsScript() {
  try {
    const { profiles, events } = await fetchAll();
    const rows      = correlate(profiles, events);
    const activated = rows.filter(r => r.classification === "ACTIVATED").length;
    const dormant   = rows.filter(r => r.classification === "DORMANT").length;
    const prompt =
      `Intel profile ops activation: ${profiles.length} threat intel profiles cross-referenced ` +
      `against ${events.length} live ops events. ` +
      `${activated} profiles are ACTIVATED — at least one live operational event matches ` +
      `the threat actor's keywords — while ${dormant} profiles are DORMANT (no live ops correlation). ` +
      `In 2 sentences, assess the overall threat activation level and identify the highest-severity ` +
      `activated threat profiles that most urgently require operational response.`;
    const base = apiBase();
    const res  = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body:    JSON.stringify({ message: prompt }),
    });
    const data = await res.json();
    window.dispatchEvent(new CustomEvent("jarvis:ipops-toggle"));
    return (data.answer || "Intel profile ops activation panel is now open, sir.").replace(/<<ACTION:[^>]*>>/g, "").trim();
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:ipops-toggle"));
    return "Intel profile ops activation panel is standing by, sir.";
  }
}

// ─── sub-components ───────────────────────────────────────────────────────────

function ClsBadge({ cls }) {
  const colour = cls === "ACTIVATED" ? AMBER : GREEN;
  return (
    <span style={{
      fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: 1,
      padding: "1px 6px", borderRadius: 3,
      border: `1px solid ${colour}`, color: colour,
    }}>{cls}</span>
  );
}

function SevBadge({ sev }) {
  if (sev == null) return null;
  const colour = sev >= 80 ? RED : sev >= 50 ? AMBER : MUTED;
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

export default function IntelProfileOpsActivation() {
  const [open,      setOpen]      = useState(false);
  const [profiles,  setProfiles]  = useState([]);
  const [events,    setEvents]    = useState([]);
  const [rows,      setRows]      = useState([]);
  const [tab,       setTab]       = useState("ALL");
  const [q,         setQ]         = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { profiles: p, events: e } = await fetchAll();
      setProfiles(p);
      setEvents(e);
      setRows(correlate(p, e));
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
    window.addEventListener("jarvis:ipops-toggle", handler);
    return () => window.removeEventListener("jarvis:ipops-toggle", handler);
  }, []);

  const activated = rows.filter(r => r.classification === "ACTIVATED").length;
  const dormant   = rows.filter(r => r.classification === "DORMANT").length;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r.classification !== tab) return false;
    if (q) {
      const lq = q.toLowerCase();
      return (r.name + (r.threatType ?? "") + r.summary).toLowerCase().includes(lq);
    }
    return true;
  });

  const maxScore = Math.max(1, ...rows.flatMap(r => r.matched.map(m => m.score)));

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildIpopsScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch { /* silent */ }
    setAssessing(false);
  }

  const TABS = ["ALL", "ACTIVATED", "DORMANT"];
  const TAB_COLOUR = { ACTIVATED: AMBER, DORMANT: GREEN, ALL: CY };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="IntelProfile × Ops Events Activation"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 92,
          fontFamily: MONO, fontSize: 10, letterSpacing: 1,
          padding: "3px 8px", borderRadius: 4, cursor: "pointer",
          border: `1px solid ${AMBER}`, color: AMBER, background: "rgba(4,7,14,0.7)",
          whiteSpace: "nowrap",
        }}
      >
        ◈ IPOPS{activated > 0 && <span style={{ marginLeft: 5, color: AMBER }}>({activated})</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, left: 220, zIndex: 92,
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
          ◈ INTEL PROFILE × OPS ACTIVATION
        </span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: MUTED }}>
          {profiles.length} profiles · {events.length} events · {loading ? "refreshing…" : "live"}
        </span>
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: MUTED,
          cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0,
        }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 10, padding: "10px 16px", flexWrap: "wrap" }}>
        {[
          { label: "PROFILES",  value: profiles.length, colour: CY    },
          { label: "OPS EVENTS",value: events.length,   colour: MUTED },
          { label: "ACTIVATED", value: activated,        colour: AMBER },
          { label: "DORMANT",   value: dormant,          colour: GREEN },
        ].map(({ label, value, colour }) => (
          <div key={label} style={{
            flex: "1 1 100px", minWidth: 90,
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
          placeholder="search profiles…"
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
            {loading ? "loading intel profiles…" : "no profiles match current filter"}
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
                  {row.name}
                </div>
                {row.threatType && (
                  <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>{row.threatType}</div>
                )}
              </div>
              <span style={{ fontSize: 10, color: MUTED }}>
                {row.matched.length} event{row.matched.length !== 1 ? "s" : ""}
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
                {row.summary && (
                  <div style={{ fontSize: 10, color: MUTED, marginBottom: 8, lineHeight: 1.5 }}>
                    {row.summary.slice(0, 200)}{row.summary.length > 200 ? "…" : ""}
                  </div>
                )}
                {row.matched.length === 0 ? (
                  <div style={{ fontSize: 11, color: MUTED }}>
                    No live ops events match this threat profile — actor is currently dormant.
                  </div>
                ) : (
                  row.matched.map(({ ev, score }) => (
                    <div key={ev.id} style={{
                      marginBottom: 8, padding: "6px 10px",
                      background: "rgba(10,20,35,0.5)", borderRadius: 6,
                      border: `1px solid ${CY}18`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#DCEBF5", flex: 1 }}>
                          {ev.title}
                        </span>
                        {ev.type && (
                          <span style={{
                            fontSize: 9, padding: "1px 5px", borderRadius: 3,
                            border: `1px solid ${CY}44`, color: CY,
                          }}>{ev.type}</span>
                        )}
                        <SevBadge sev={ev.severity} />
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
