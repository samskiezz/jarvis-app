/**
 * F166 — Skill × Ops Events Alignment
 *
 * Parallel-fetches /v1/aip/skill + /v1/ops/events, then
 * keyword-correlates each operational event (title/description/service/severity/tags)
 * against the skill catalog to surface:
 *   ENGAGED  — skill actively matches a live ops event (operational demand)
 *   INACTIVE — skill has no matching ops event right now (idle capability)
 *
 * Stat tiles:  events / skills / engaged / inactive
 * Filter tabs: ALL | ENGAGED | INACTIVE
 * Expand any event → matched skills with category + relevance score.
 * Cyan badge on ENGAGED count.
 * ▶ ASSESS: 2-sentence operational-readiness brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SKLOPS  at bottom:8 left:55080, zIndex 108.
 * Voice:   "skill ops / ops skills / operational skills /
 *           active skills / which skills are needed / sklops"
 * Event:   jarvis:sklops-toggle
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const CY    = "#29E7FF";
const GREEN = "#00c878";
const AMBER = "#F5A623";
const RED   = "#FF3B3B";
const MONO  = "'JetBrains Mono', 'Courier New', monospace";
const SANS  = "'Inter', system-ui, sans-serif";

const BTN_LEFT   = 922080;
const POLL_MS    = 90_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

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

const SKLOPS_RE =
  /\b(skill\s+ops?|ops?\s+skills?|operational\s+skills?|active\s+skills?|which\s+skills?\s+(are\s+)?(needed|active|engaged)|skills?\s+for\s+ops?|sklops)\b/i;

export function isSklopsQuery(q) { return SKLOPS_RE.test(q); }

export async function buildSklopsScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [sRes, eRes] = await Promise.all([
      fetch(`${base}/v1/aip/skill`,    { headers: hdr }),
      fetch(`${base}/v1/ops/events`,   { headers: hdr }),
    ]);
    const skills = normaliseSkills(await sRes.json());
    const events = normaliseEvents(await eRes.json());

    const engaged  = skills.filter((sk) => events.some((ev) => relevance(ev, sk) > 0)).length;
    const inactive = skills.length - engaged;
    const critEvts = events.filter(
      (ev) => ["CRITICAL", "HIGH"].includes((ev.severity || "").toUpperCase()),
    ).length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS skill–ops alignment analysis: ${events.length} live operational events assessed ` +
          `against ${skills.length} skills; ${engaged} skills are operationally engaged, ` +
          `${inactive} skills are currently inactive` +
          (critEvts > 0 ? `, with ${critEvts} CRITICAL or HIGH severity events in scope` : "") +
          `. Give a 2-sentence operational-readiness assessment — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Skill–ops alignment analysis complete, sir.").trim();
  } catch {
    return "Skill–ops alignment analysis unavailable at this time, sir.";
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normaliseSkills(raw) {
  const arr = Array.isArray(raw)         ? raw
    : Array.isArray(raw?.data)           ? raw.data
    : Array.isArray(raw?.items)          ? raw.items
    : Array.isArray(raw?.results)        ? raw.results
    : Array.isArray(raw?.skills)         ? raw.skills
    : [];
  return arr.map((sk, i) => ({
    id:          sk.id          || String(i),
    name:        sk.name        || sk.title      || `Skill ${i + 1}`,
    description: (sk.description || sk.summary   || "").toString().slice(0, 300),
    category:    sk.category    || sk.domain     || sk.type || "",
  }));
}

function normaliseEvents(raw) {
  const arr = Array.isArray(raw)          ? raw
    : Array.isArray(raw?.data)            ? raw.data
    : Array.isArray(raw?.items)           ? raw.items
    : Array.isArray(raw?.results)         ? raw.results
    : Array.isArray(raw?.events)          ? raw.events
    : [];
  return arr.map((e, i) => ({
    id:          e.id          || String(i),
    title:       e.title       || e.name        || e.event_type || `Event ${i + 1}`,
    description: (e.description || e.message    || e.summary   || "").toString().slice(0, 300),
    severity:    e.severity    || e.level       || e.priority   || "UNKNOWN",
    service:     e.service     || e.source      || e.component  || "",
    tags:        Array.isArray(e.tags) ? e.tags.join(" ") : (e.tags || ""),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s,;|/\\()\[\]{}"']+/)
    .filter((w) => w.length > 3);
}

function relevance(event, skill) {
  const evWords = new Set([
    ...keywords(event.title),
    ...keywords(event.description),
    ...keywords(event.service),
    ...keywords(event.tags),
  ]);
  const skWords = [
    ...keywords(skill.name),
    ...keywords(skill.description),
    ...keywords(skill.category),
  ];
  return skWords.filter((w) => evWords.has(w)).length;
}

// ── component ────────────────────────────────────────────────────────────────

export default function SkillOpsAlignment() {
  const [open, setOpen]       = useState(false);
  const [skills, setSkills]   = useState([]);
  const [events, setEvents]   = useState([]);
  const [filter, setFilter]   = useState("ALL");
  const [search, setSearch]   = useState("");
  const [loading, setLoading] = useState(false);
  const [assessing, setAssess] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [badge, setBadge]     = useState(0);
  const timerRef              = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [sRes, eRes] = await Promise.all([
        fetch(`${base}/v1/aip/skill`,  { headers: hdr }),
        fetch(`${base}/v1/ops/events`, { headers: hdr }),
      ]);
      const skRaw = await sRes.json();
      const evRaw = await eRes.json();
      const sk = normaliseSkills(skRaw);
      const ev = normaliseEvents(evRaw);
      setSkills(sk);
      setEvents(ev);
      const eng = sk.filter((s) => ev.some((e) => relevance(e, s) > 0)).length;
      setBadge(eng);
    } catch {
      // silently keep stale data
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = (ev) => {
      if (ev.detail?.query && !isSklopsQuery(ev.detail.query)) return;
      setOpen((o) => !o);
    };
    window.addEventListener("jarvis:sklops-toggle", handler);
    return () => window.removeEventListener("jarvis:sklops-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssess(true);
    const script = await buildSklopsScript();
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    setAssess(false);
  }, []);

  // ── enriched skill rows ──────────────────────────────────────────────────
  const enriched = skills.map((sk) => {
    const matched = events
      .map((ev) => ({ ev, score: relevance(ev, sk) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...sk, matched, engaged: matched.length > 0 };
  });

  const engaged  = enriched.filter((sk) => sk.engaged).length;
  const inactive = enriched.length - engaged;

  const filtered = enriched.filter((sk) => {
    const matchesFilter =
      filter === "ALL" ||
      (filter === "ENGAGED"  && sk.engaged) ||
      (filter === "INACTIVE" && !sk.engaged);
    const matchesSearch = !search ||
      sk.name.toLowerCase().includes(search.toLowerCase()) ||
      sk.category.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Skill × Ops Events Alignment — which skills are operationally engaged"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT,
          zIndex: 616, fontFamily: MONO, fontSize: 10,
          background: "rgba(0,0,0,0.7)", color: CY,
          border: `1px solid ${CY}40`, borderRadius: 4,
          padding: "3px 7px", cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: badge > 0 ? `0 0 6px ${CY}60` : "none",
        }}
      >
        ◈ SKLOPS
        {badge > 0 && (
          <span style={{
            marginLeft: 5, background: CY, color: "#000",
            borderRadius: 8, padding: "1px 5px", fontSize: 9, fontWeight: 700,
          }}>{badge}</span>
        )}
      </button>
    );
  }

  const TABS = ["ALL", "ENGAGED", "INACTIVE"];

  return (
    <div style={{
      position: "fixed", bottom: 40, left: "50%", transform: "translateX(-50%)",
      width: 660, maxHeight: "70vh", zIndex: 9900,
      background: "rgba(6,16,26,0.97)", border: `1px solid ${CY}50`,
      borderRadius: 10, display: "flex", flexDirection: "column",
      fontFamily: SANS, boxShadow: `0 0 30px ${CY}25`,
    }}>
      {/* header */}
      <div style={{
        padding: "10px 14px 8px", borderBottom: `1px solid ${CY}25`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{ color: CY, fontFamily: MONO, fontSize: 11, letterSpacing: 2 }}>
          ◈ SKILL × OPS ALIGNMENT
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={assess}
            disabled={assessing || skills.length === 0}
            style={{
              fontFamily: MONO, fontSize: 10, color: assessing ? AMBER : GREEN,
              background: "transparent", border: `1px solid ${assessing ? AMBER : GREEN}60`,
              borderRadius: 4, padding: "2px 8px", cursor: "pointer",
            }}
          >
            {assessing ? "…" : "▶ ASSESS"}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              fontFamily: MONO, fontSize: 12, color: "#888",
              background: "transparent", border: "none", cursor: "pointer",
            }}
          >✕</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 14px" }}>
        {[
          { label: "EVENTS",   val: events.length,  col: "#aaa" },
          { label: "SKILLS",   val: skills.length,  col: "#aaa" },
          { label: "ENGAGED",  val: engaged,         col: CY },
          { label: "INACTIVE", val: inactive,        col: AMBER },
        ].map(({ label, val, col }) => (
          <div key={label} style={{
            flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 6,
            padding: "6px 8px", textAlign: "center",
          }}>
            <div style={{ color: col, fontFamily: MONO, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#555", fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* filter tabs + search */}
      <div style={{ padding: "0 14px 6px", display: "flex", gap: 8, alignItems: "center" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{
              fontFamily: MONO, fontSize: 9, letterSpacing: 1,
              color: filter === t ? "#000" : CY,
              background: filter === t ? CY : "transparent",
              border: `1px solid ${CY}50`, borderRadius: 4,
              padding: "2px 8px", cursor: "pointer",
            }}
          >{t}</button>
        ))}
        <input
          placeholder="search skills…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1, background: "rgba(255,255,255,0.05)",
            border: `1px solid ${CY}30`, borderRadius: 4,
            color: "#ccc", fontFamily: MONO, fontSize: 10,
            padding: "3px 8px", outline: "none",
          }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 14px" }}>
        {loading && skills.length === 0 ? (
          <div style={{ color: "#555", textAlign: "center", padding: 24, fontFamily: MONO, fontSize: 10 }}>
            loading…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ color: "#555", textAlign: "center", padding: 24, fontFamily: MONO, fontSize: 10 }}>
            no results
          </div>
        ) : filtered.map((sk) => (
          <div key={sk.id} style={{ marginBottom: 4 }}>
            <button
              onClick={() => setExpanded(expanded === sk.id ? null : sk.id)}
              style={{
                width: "100%", textAlign: "left", background: "rgba(255,255,255,0.03)",
                border: `1px solid ${sk.engaged ? CY + "40" : "#ffffff18"}`,
                borderRadius: 6, padding: "6px 10px", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  fontFamily: MONO, fontSize: 9, letterSpacing: 1,
                  color: sk.engaged ? "#000" : "#666",
                  background: sk.engaged ? CY : "#ffffff18",
                  borderRadius: 3, padding: "1px 5px",
                }}>
                  {sk.engaged ? "ENGAGED" : "INACTIVE"}
                </span>
                <span style={{ color: "#ddd", fontSize: 11 }}>{sk.name}</span>
                {sk.category && (
                  <span style={{ color: "#555", fontSize: 9, fontFamily: MONO }}>{sk.category}</span>
                )}
              </div>
              {sk.matched.length > 0 && (
                <span style={{ color: CY, fontFamily: MONO, fontSize: 9 }}>
                  {sk.matched.length} event{sk.matched.length !== 1 ? "s" : ""} ▾
                </span>
              )}
            </button>
            {expanded === sk.id && sk.matched.length > 0 && (
              <div style={{
                background: "rgba(0,0,0,0.3)", borderRadius: "0 0 6px 6px",
                padding: "6px 12px", marginTop: -1,
                border: `1px solid ${CY}20`, borderTop: "none",
              }}>
                {sk.matched.map(({ ev, score }) => (
                  <div key={ev.id} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "3px 0", borderBottom: "1px solid #ffffff08",
                  }}>
                    <span style={{
                      fontFamily: MONO, fontSize: 9,
                      color: ["CRITICAL", "HIGH"].includes((ev.severity || "").toUpperCase()) ? RED : AMBER,
                      background: "rgba(255,255,255,0.05)",
                      borderRadius: 3, padding: "1px 5px", whiteSpace: "nowrap",
                    }}>
                      {(ev.severity || "?").toUpperCase()}
                    </span>
                    <span style={{ color: "#ccc", fontSize: 10, flex: 1 }}>{ev.title}</span>
                    {ev.service && (
                      <span style={{ color: "#555", fontFamily: MONO, fontSize: 9 }}>{ev.service}</span>
                    )}
                    <span style={{ color: CY, fontFamily: MONO, fontSize: 9, whiteSpace: "nowrap" }}>
                      score {score}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
