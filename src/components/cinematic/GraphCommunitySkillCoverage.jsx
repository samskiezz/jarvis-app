/**
 * F87 — Graph Community × Skill Coverage (GCSK)
 *
 * Parallel-fetches /v1/graph/communities and /v1/aip/skill, then
 * keyword-correlates each network community (label + member metadata) against
 * JARVIS skills (name, title, description, category, domain, tags) to surface:
 *
 *   SKILLED    — at least one JARVIS skill addresses this community's domain
 *   UNSKILLED  — no skill covers this community — capability gap
 *
 * Stat tiles: communities / skills / skilled / unskilled
 * Filter tabs: ALL | SKILLED | UNSKILLED + text search
 * Expand community → matched skills with category + domain badge + relevance score.
 * Lime badge on skilled count.
 * ▶ ASSESS: 2-sentence community-skill readiness brief via /v1/jarvis/agent/chat +
 *   jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ GCSK  at bottom:8 left:693600, zIndex:267.
 * Event:   jarvis:gcsk-toggle
 * Voice:   "community skill / skill community / gcsk / graph skill community /
 *           unskilled community / community capability gap / community skill coverage"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 693600;
const POLL_MS  = 90_000;
const LIME     = "#84CC16";
const SLATE    = "#6E8AA0";
const VIOLET   = "#A78BFA";
const AMBER    = "#F59E0B";
const CYAN     = "#29E7FF";
const GREEN    = "#34D399";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const GCSK_RE =
  /\b(community\s+skill[s]?|skill[s]?\s+communit\w*|gcsk|graph\s+skill\s+communit\w*|unskilled\s+communit\w*|communit\w*\s+(capability|skill)\s+(gap|coverage|map)|communit\w*\s+without\s+skill[s]?|skill[s]?\s+gap\s+communit\w*)\b/i;

export function isGcskQuery(q) { return GCSK_RE.test(q); }

export async function buildGcskScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [commRes, skillRes] = await Promise.all([
      fetch(`${base}/v1/graph/communities`, { headers: hdr }),
      fetch(`${base}/v1/aip/skill`,         { headers: hdr }),
    ]);
    const communities = normaliseCommunities(await commRes.json());
    const skills      = normaliseSkills(await skillRes.json());

    const skilled   = communities.filter(
      (c) => skills.some((s) => relevance(c, s) > 0)
    ).length;
    const unskilled = communities.length - skilled;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS graph-community skill coverage: ${communities.length} network communities ` +
          `cross-referenced against ${skills.length} JARVIS skills. ` +
          `${skilled} communities have at least one skill match (capability covered); ` +
          `${unskilled} communities have no skill alignment (capability gap). ` +
          `Provide a 2-sentence community-skill readiness brief — formal British butler tone, ` +
          `first person, highlight the capability gap if significant.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Community skill coverage analysis complete, sir.").trim();
  } catch {
    return "Community skill coverage assessment unavailable at this time, sir.";
  }
}

// ── normalisers ───────────────────────────────────────────────────────────────

function normaliseCommunities(raw) {
  const arr = Array.isArray(raw)                  ? raw
    : Array.isArray(raw?.communities)             ? raw.communities
    : Array.isArray(raw?.clusters)                ? raw.clusters
    : Array.isArray(raw?.items)                   ? raw.items
    : Array.isArray(raw?.data)                    ? raw.data
    : Array.isArray(raw?.results)                 ? raw.results
    : [];
  return arr.map((c, i) => ({
    id:      c.id           || c.community_id || String(i),
    label:   c.label        || c.name         || c.title       || `Community ${i + 1}`,
    members: Array.isArray(c.members)
      ? c.members.map((m) => (typeof m === "string" ? m : m?.id || m?.label || "")).join(" ")
      : (c.member_count != null ? `size:${c.member_count}` : ""),
    size:    c.size          || c.member_count || c.count       || null,
    type:    c.type          || c.cluster_type || c.category    || "",
    tags:    Array.isArray(c.tags) ? c.tags.join(" ") : (c.tags || ""),
  }));
}

function normaliseSkills(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.skills)              ? raw.skills
    : Array.isArray(raw?.items)               ? raw.items
    : Array.isArray(raw?.data)                ? raw.data
    : Array.isArray(raw?.results)             ? raw.results
    : [];
  return arr.map((s, i) => ({
    id:          s.id          || String(i),
    name:        s.name        || s.title      || s.skill_name  || `Skill ${i + 1}`,
    title:       s.title       || s.name       || "",
    description: (s.description || s.summary   || s.desc        || "").toString().slice(0, 300),
    category:    s.category    || s.type       || s.kind        || "",
    domain:      s.domain      || s.area       || s.field       || "",
    tags:        Array.isArray(s.tags) ? s.tags.join(" ") : (s.tags || ""),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"'%]+/)
    .filter((w) => w.length >= 3);
}

function relevance(community, skill) {
  const cw = keywords(
    `${community.label} ${community.members} ${community.type} ${community.tags}`
  );
  const sw = keywords(
    `${skill.name} ${skill.title} ${skill.description} ${skill.category} ${skill.domain} ${skill.tags}`
  );
  return cw.filter((w) => sw.some((p) => p.includes(w) || w.includes(p))).length;
}

function buildLinked(communities, skills) {
  return communities.map((comm) => {
    const matched = skills
      .map((s) => ({ ...s, score: relevance(comm, s) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...comm, skills: matched, skilled: matched.length > 0 };
  });
}

function fmtSize(size) {
  if (size == null) return null;
  const n = Number(size);
  if (isNaN(n)) return null;
  return `${n} node${n !== 1 ? "s" : ""}`;
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "SKILLED", "UNSKILLED"];

export default function GraphCommunitySkillCoverage() {
  const [open,         setOpen]         = useState(false);
  const [communities,  setCommunities]  = useState([]);
  const [skills,       setSkills]       = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [filter,       setFilter]       = useState("ALL");
  const [search,       setSearch]       = useState("");
  const [expanded,     setExpanded]     = useState(null);
  const [assessing,    setAssessing]    = useState(false);
  const [lastFetch,    setLastFetch]    = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [commRes, skillRes] = await Promise.all([
        fetch(`${base}/v1/graph/communities`, { headers: hdr }),
        fetch(`${base}/v1/aip/skill`,         { headers: hdr }),
      ]);
      setCommunities(normaliseCommunities(await commRes.json()));
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
    window.addEventListener("jarvis:gcsk-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gcsk-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    const text = await buildGcskScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const linked    = buildLinked(communities, skills);
  const skilled   = linked.filter((c) => c.skilled).length;
  const unskilled = linked.length - skilled;

  const displayed = linked.filter((c) => {
    if (filter === "SKILLED"   && !c.skilled) return false;
    if (filter === "UNSKILLED" &&  c.skilled) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      c.label.toLowerCase().includes(q) ||
      c.type.toLowerCase().includes(q)  ||
      c.tags.toLowerCase().includes(q)
    );
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Graph Community × Skill Coverage (GCSK)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 267,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${LIME}55`,
          color: LIME, padding: "3px 10px", borderRadius: 6,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          cursor: "pointer", backdropFilter: "blur(6px)",
          letterSpacing: 1,
        }}
      >
        {skilled > 0
          ? <><span style={{ background: LIME, color: "#000", borderRadius: 4, padding: "0 4px", marginRight: 4, fontWeight: 700 }}>{skilled}</span>◈ GCSK</>
          : "◈ GCSK"
        }
      </button>
    );
  }

  const TILE = { flex: "1 1 100px", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", textAlign: "center" };

  return (
    <div style={{
      position: "fixed", bottom: 52, left: BTN_LEFT - 360, zIndex: 267,
      width: 500, maxHeight: "72vh", display: "flex", flexDirection: "column",
      background: "rgba(6,10,16,0.95)", border: `1px solid ${LIME}44`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: `0 0 40px ${LIME}22`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${LIME}33` }}>
        <span style={{ color: LIME, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ GCSK</span>
        <span style={{ color: SLATE, fontSize: 9, flex: 1 }}>GRAPH COMMUNITY × SKILL COVERAGE</span>
        {lastFetch && <span style={{ color: SLATE, fontSize: 8 }}>{lastFetch.toLocaleTimeString()}</span>}
        {loading && <span style={{ color: LIME, fontSize: 9 }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{ marginLeft: 4, background: "none", border: "none", color: SLATE, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${LIME}22` }}>
        {[
          { label: "COMMUNITIES", value: linked.length,  col: SLATE  },
          { label: "SKILLS",      value: skills.length,  col: VIOLET },
          { label: "SKILLED",     value: skilled,        col: LIME   },
          { label: "UNSKILLED",   value: unskilled,      col: AMBER  },
        ].map(({ label, value, col }) => (
          <div key={label} style={TILE}>
            <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{value}</div>
            <div style={{ color: SLATE, fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${LIME}22`, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setFilter(t)} style={{
            background: filter === t ? `${LIME}22` : "none",
            border: `1px solid ${filter === t ? LIME : SLATE}`,
            color: filter === t ? LIME : SLATE,
            borderRadius: 5, padding: "2px 8px", fontSize: 9,
            cursor: "pointer", letterSpacing: 1,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="search communities…"
          style={{
            flex: 1, minWidth: 100, background: "rgba(255,255,255,0.04)",
            border: "1px solid #6E8AA044", borderRadius: 5, padding: "2px 8px",
            color: "#DCEBF5", fontSize: 9, outline: "none",
          }}
        />
        <button onClick={assess} disabled={assessing} style={{
          background: "none", border: `1px solid ${LIME}`,
          color: LIME, borderRadius: 5, padding: "2px 8px",
          fontSize: 9, cursor: "pointer", letterSpacing: 1,
        }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
      </div>

      {/* community list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
        {displayed.length === 0 && !loading && (
          <div style={{ color: SLATE, fontSize: 10, textAlign: "center", padding: 20 }}>
            No communities match the current filter.
          </div>
        )}
        {displayed.map((comm) => {
          const isExp  = expanded === comm.id;
          const col    = comm.skilled ? LIME : AMBER;
          const badge  = comm.skilled ? "SKILLED" : "UNSKILLED";
          const szStr  = fmtSize(comm.size);
          return (
            <div key={comm.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : comm.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 7, cursor: "pointer",
                  background: isExp ? `${LIME}11` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${comm.skilled ? `${LIME}44` : "#6E8AA022"}`,
                  transition: "background 0.2s",
                }}
              >
                <span style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: 1, padding: "1px 5px",
                  borderRadius: 4, background: `${col}22`, color: col, flexShrink: 0,
                }}>
                  {badge}
                </span>
                <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5" }}>{comm.label}</span>
                {comm.type && (
                  <span style={{
                    fontSize: 8, padding: "1px 5px", borderRadius: 4,
                    background: `${VIOLET}22`, color: VIOLET, letterSpacing: 1,
                  }}>
                    {comm.type.slice(0, 10).toUpperCase()}
                  </span>
                )}
                {szStr && <span style={{ fontSize: 8, color: CYAN }}>{szStr}</span>}
                {comm.skilled && (
                  <span style={{ fontSize: 8, color: LIME }}>
                    {comm.skills.length} skill{comm.skills.length !== 1 ? "s" : ""}
                  </span>
                )}
                <span style={{ color: SLATE, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ margin: "4px 0 4px 12px", padding: "8px 10px", borderRadius: 7, background: "rgba(255,255,255,0.02)", border: `1px solid ${LIME}22` }}>
                  {comm.skills.length === 0 ? (
                    <div style={{ fontSize: 9, color: AMBER }}>
                      No JARVIS skills keyword-correlate with this community — capability gap.
                    </div>
                  ) : (
                    comm.skills.map((sk) => (
                      <div key={sk.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, padding: "4px 8px", borderRadius: 5, background: "rgba(255,255,255,0.03)" }}>
                        <span style={{ flex: 1, fontSize: 9, color: "#DCEBF5" }}>{sk.name}</span>
                        {sk.category && (
                          <span style={{
                            fontSize: 8, padding: "1px 5px", borderRadius: 4,
                            background: `${LIME}22`, color: LIME, letterSpacing: 1,
                          }}>
                            {sk.category.slice(0, 10).toUpperCase()}
                          </span>
                        )}
                        {sk.domain && (
                          <span style={{ fontSize: 8, color: VIOLET }}>{sk.domain.slice(0, 12)}</span>
                        )}
                        <span style={{ fontSize: 8, color: GREEN }}>rel:{sk.score}</span>
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
