/**
 * F185 — Intel Profile × Skill Domain Alignment (INTELSKILL)
 *
 * Parallel-fetches /entities/IntelProfile and /v1/aip/skill, then
 * keyword-correlates each intel profile (name, category, tags, description)
 * against operator skill domains to surface:
 *
 *   COVERED — at least one skill domain keyword-matches this intel profile,
 *             meaning the operator has relevant expertise to engage this actor/entity
 *   BLIND   — no skill domain aligns with this profile — a response capability gap
 *
 * Stat tiles: profiles / skill domains / covered / blind
 * Filter tabs: ALL | COVERED | BLIND + text search
 * Expand intel profile → matched skill domains with score badge.
 * Orange badge on blind count.
 * ▶ ASSESS: 2-sentence skill-coverage brief via /v1/jarvis/agent/chat +
 *   jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ INTELSKILL  at bottom:8 left:65160, zIndex:126.
 * Event:   jarvis:intelskill-toggle
 * Voice:   "intel skill / threat skill / intelskill / skill threat gap /
 *           actor skill gap / operator skill coverage / which profiles lack skill"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 65160;
const POLL_MS  = 90_000;
const ORANGE   = "#FB923C";
const GREEN    = "#34D399";
const SLATE    = "#6E8AA0";
const CYAN     = "#29E7FF";
const VIOLET   = "#A78BFA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const INTELSKILL_RE =
  /\b(intel\s+skill[s]?|threat\s+skill[s]?|actor\s+skill[s]?|intelskill|skill\s+threat[s]?|skill\s+intel[s]?|operator\s+skill\s+coverage|which\s+(profiles?|actors?|threats?)\s+(lack|have|need)\s+skill[s]?|profile\s+skill\s+gap[s]?|threat\s+response\s+gap[s]?|skill\s+gap\s+(for\s+)?(threat|actor|intel)|blind\s+(intel|threat|actor|profile)[s]?)\b/i;

export function isIntelskillQuery(q) { return INTELSKILL_RE.test(q); }

export async function buildIntelskillScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [profRes, skillRes] = await Promise.all([
      fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
      fetch(`${base}/v1/aip/skill`,          { headers: hdr }),
    ]);
    const profiles = normaliseProfiles(await profRes.json());
    const skills   = normaliseSkills(await skillRes.json());

    const covered = profiles.filter(
      (p) => skills.some((s) => relevance(p, s) > 0)
    ).length;
    const blind = profiles.length - covered;

    const topBlind = profiles.find(
      (p) => !skills.some((s) => relevance(p, s) > 0)
    );

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS intel profile skill alignment analysis: ${profiles.length} intel profiles ` +
          `cross-referenced against ${skills.length} operator skill domains. ` +
          `${covered} profiles have skill domain coverage; ${blind} profiles are blind spots ` +
          `with no operator skill alignment — these represent unaddressed threat response gaps. ` +
          `${topBlind ? `First unaddressed profile: "${topBlind.name}" (${topBlind.category || "unknown category"}). ` : ""}` +
          `Provide a 2-sentence skill-coverage brief — formal British butler tone, first person, ` +
          `highlight the most critical capability gaps.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Intel profile skill alignment analysis complete, sir.").trim();
  } catch {
    return "Intel profile skill alignment assessment unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseProfiles(raw) {
  const arr = Array.isArray(raw)                    ? raw
    : Array.isArray(raw?.profiles)                  ? raw.profiles
    : Array.isArray(raw?.intel_profiles)            ? raw.intel_profiles
    : Array.isArray(raw?.items)                     ? raw.items
    : Array.isArray(raw?.data)                      ? raw.data
    : Array.isArray(raw?.results)                   ? raw.results
    : [];
  return arr.map((p, i) => ({
    id:          p.id           || p.profile_id     || String(i),
    name:        p.name         || p.handle         || p.alias          || `Profile ${i + 1}`,
    category:    p.category     || p.type           || p.actor_type     || "",
    tags:        Array.isArray(p.tags) ? p.tags.join(" ") : (p.tags     || ""),
    description: (p.description || p.summary        || p.bio            || p.notes || "").toString().slice(0, 300),
    threat_level: p.threat_level || p.risk_level    || p.severity       || "",
  }));
}

function normaliseSkills(raw) {
  const arr = Array.isArray(raw)                    ? raw
    : Array.isArray(raw?.skills)                    ? raw.skills
    : Array.isArray(raw?.dimensions)                ? raw.dimensions
    : Array.isArray(raw?.items)                     ? raw.items
    : Array.isArray(raw?.data)                      ? raw.data
    : Array.isArray(raw?.results)                   ? raw.results
    : [];
  return arr.map((s, i) => ({
    id:      s.id          || String(i),
    name:    s.name        || s.domain       || s.skill       || s.title  || `Skill ${i + 1}`,
    domain:  s.domain      || s.category     || s.area        || "",
    tags:    Array.isArray(s.tags) ? s.tags.join(" ") : (s.tags          || ""),
    score:   s.score       || s.level        || s.proficiency || s.value  || 0,
    summary: (s.description || s.summary     || s.notes       || "").toString().slice(0, 200),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"'%+]+/)
    .filter((w) => w.length >= 3);
}

function relevance(profile, skill) {
  const pw = keywords(
    `${profile.name} ${profile.category} ${profile.tags} ${profile.description}`
  );
  const sw = keywords(`${skill.name} ${skill.domain} ${skill.tags} ${skill.summary}`);
  return pw.filter((w) => sw.some((p) => p.includes(w) || w.includes(p))).length;
}

function buildLinked(profiles, skills) {
  return profiles.map((p) => {
    const matched = skills
      .map((s) => ({ ...s, score: relevance(p, s) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...p, skills: matched, covered: matched.length > 0 };
  });
}

function threatColor(level) {
  const lc = String(level || "").toLowerCase();
  if (lc === "critical" || lc === "severe") return "#FF4444";
  if (lc === "high")                         return "#FF8C42";
  if (lc === "medium")                       return "#F59E0B";
  if (lc === "low")                          return GREEN;
  return SLATE;
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "COVERED", "BLIND"];

export default function IntelProfileSkillAlignment() {
  const [open,      setOpen]      = useState(false);
  const [profiles,  setProfiles]  = useState([]);
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
      const [profRes, skillRes] = await Promise.all([
        fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
        fetch(`${base}/v1/aip/skill`,          { headers: hdr }),
      ]);
      setProfiles(normaliseProfiles(await profRes.json()));
      setSkills(normaliseSkills(await skillRes.json()));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const onToggle = () => {
      setOpen((v) => {
        if (!v) load();
        return !v;
      });
    };
    window.addEventListener("jarvis:intelskill-toggle", onToggle);
    return () => window.removeEventListener("jarvis:intelskill-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    const text = await buildIntelskillScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const linked  = buildLinked(profiles, skills);
  const covered = linked.filter((p) => p.covered).length;
  const blind   = linked.length - covered;

  const displayed = linked.filter((p) => {
    if (filter === "COVERED" && !p.covered) return false;
    if (filter === "BLIND"   && p.covered)  return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q)
    );
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Intel Profile × Skill Domain Alignment (INTELSKILL)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 126,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${ORANGE}55`,
          color: ORANGE, padding: "3px 10px", borderRadius: 6,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          cursor: "pointer", backdropFilter: "blur(6px)",
          letterSpacing: 1,
        }}
      >
        {blind > 0
          ? <><span style={{ background: ORANGE, color: "#000", borderRadius: 4, padding: "0 4px", marginRight: 4, fontWeight: 700 }}>{blind}</span>◈ INTELSKILL</>
          : "◈ INTELSKILL"
        }
      </button>
    );
  }

  const TILE = { flex: "1 1 100px", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", textAlign: "center" };

  return (
    <div style={{
      position: "fixed", bottom: 52, left: BTN_LEFT - 360, zIndex: 126,
      width: 500, maxHeight: "72vh", display: "flex", flexDirection: "column",
      background: "rgba(6,10,16,0.95)", border: `1px solid ${ORANGE}44`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: `0 0 40px ${ORANGE}22`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${ORANGE}33` }}>
        <span style={{ color: ORANGE, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ INTELSKILL</span>
        <span style={{ color: SLATE, fontSize: 9, flex: 1 }}>INTEL PROFILE × SKILL DOMAIN ALIGNMENT</span>
        {lastFetch && <span style={{ color: SLATE, fontSize: 8 }}>{lastFetch.toLocaleTimeString()}</span>}
        {loading && <span style={{ color: ORANGE, fontSize: 9 }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{ marginLeft: 4, background: "none", border: "none", color: SLATE, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${ORANGE}22` }}>
        {[
          { label: "INTEL PROFILES", value: linked.length, col: SLATE   },
          { label: "SKILL DOMAINS",  value: skills.length, col: CYAN    },
          { label: "COVERED",        value: covered,       col: GREEN   },
          { label: "BLIND",          value: blind,         col: ORANGE  },
        ].map(({ label, value, col }) => (
          <div key={label} style={TILE}>
            <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{value}</div>
            <div style={{ color: SLATE, fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${ORANGE}22`, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setFilter(t)} style={{
            background: filter === t ? `${ORANGE}22` : "none",
            border: `1px solid ${filter === t ? ORANGE : SLATE}`,
            color: filter === t ? ORANGE : SLATE,
            borderRadius: 5, padding: "2px 8px", fontSize: 9,
            cursor: "pointer", letterSpacing: 1,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="search intel profiles…"
          style={{
            flex: 1, minWidth: 100, background: "rgba(255,255,255,0.04)",
            border: "1px solid #6E8AA044", borderRadius: 5, padding: "2px 8px",
            color: "#DCEBF5", fontSize: 9, outline: "none",
          }}
        />
        <button onClick={assess} disabled={assessing} style={{
          background: "none", border: `1px solid ${ORANGE}`,
          color: ORANGE, borderRadius: 5, padding: "2px 8px",
          fontSize: 9, cursor: "pointer", letterSpacing: 1,
        }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
      </div>

      {/* profile list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
        {displayed.length === 0 && !loading && (
          <div style={{ color: SLATE, fontSize: 10, textAlign: "center", padding: 20 }}>
            No intel profiles match the current filter.
          </div>
        )}
        {displayed.map((p) => {
          const isExp = expanded === p.id;
          const col   = p.covered ? GREEN : ORANGE;
          const badge = p.covered ? "COVERED" : "BLIND";
          return (
            <div key={p.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : p.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 7, cursor: "pointer",
                  background: isExp ? `${ORANGE}11` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${!p.covered ? `${ORANGE}44` : "#6E8AA022"}`,
                  transition: "background 0.2s",
                }}
              >
                <span style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: 1, padding: "1px 5px",
                  borderRadius: 4, background: `${col}22`, color: col, flexShrink: 0,
                }}>
                  {badge}
                </span>
                <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5" }}>{p.name}</span>
                {p.category && (
                  <span style={{
                    fontSize: 8, padding: "1px 5px", borderRadius: 4,
                    background: `${VIOLET}22`, color: VIOLET, letterSpacing: 1,
                  }}>
                    {p.category.slice(0, 10).toUpperCase()}
                  </span>
                )}
                {p.threat_level && (
                  <span style={{
                    fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                    background: `${threatColor(p.threat_level)}22`,
                    color: threatColor(p.threat_level), letterSpacing: 1,
                  }}>
                    {String(p.threat_level).toUpperCase().slice(0, 4)}
                  </span>
                )}
                {p.covered && (
                  <span style={{ fontSize: 8, color: GREEN }}>{p.skills.length} skill{p.skills.length !== 1 ? "s" : ""}</span>
                )}
                <span style={{ color: SLATE, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ margin: "4px 0 4px 12px", padding: "8px 10px", borderRadius: 7, background: "rgba(255,255,255,0.02)", border: `1px solid ${ORANGE}22` }}>
                  {p.description && (
                    <div style={{ fontSize: 9, color: SLATE, marginBottom: 6 }}>
                      {p.description.slice(0, 120)}
                    </div>
                  )}
                  {p.skills.length === 0 ? (
                    <div style={{ fontSize: 9, color: ORANGE }}>
                      No operator skill domain aligns with this profile — capability gap identified.
                    </div>
                  ) : (
                    p.skills.map((s) => (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, padding: "4px 8px", borderRadius: 5, background: "rgba(255,255,255,0.03)" }}>
                        <span style={{
                          fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                          background: `${CYAN}22`, color: CYAN, letterSpacing: 1, flexShrink: 0,
                        }}>
                          SKILL
                        </span>
                        <span style={{ flex: 1, fontSize: 9, color: "#DCEBF5" }}>{s.name}</span>
                        {s.domain && (
                          <span style={{ fontSize: 8, color: VIOLET }}>{s.domain.slice(0, 12)}</span>
                        )}
                        <span style={{ fontSize: 8, color: GREEN }}>rel:{s.score}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
