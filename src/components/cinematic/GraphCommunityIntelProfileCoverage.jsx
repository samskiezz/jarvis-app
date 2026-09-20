/**
 * F95 — Graph Community × Intel Profile Coverage (GCIPL)
 *
 * Parallel-fetches /v1/graph/communities + /entities/IntelProfile,
 * then keyword-correlates each network cluster against tracked threat
 * actor intel profiles to surface:
 *
 *   INFILTRATED — at least one threat actor intel profile aligns
 *                 with this community's domain
 *   CLEAN       — no intel profile alignment in this community
 *
 * Stat tiles: communities / profiles / infiltrated / clean
 * Filter tabs: ALL | INFILTRATED | CLEAN + text search
 * Expand any cluster → matched intel profiles with category badge +
 *   nationality chip + relevance score bar.
 * Red badge on INFILTRATED count.
 * ▶ ASSESS: 2-sentence community threat-actor brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ GCIPL  at bottom:8 left:695280, zIndex:270.
 * Event:   jarvis:gcipl-toggle
 * Voice:   "community intel / intel community / gcipl /
 *           infiltrated community / community threat actor /
 *           community adversary / which communities have threat actors /
 *           threat actor community / community intel profile"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 695280;
const POLL_MS  = 90_000;
const RED      = "#F43F5E";
const ORANGE   = "#F97316";
const SLATE    = "#6E8AA0";
const BLUE     = "#60A5FA";
const VIOLET   = "#A78BFA";
const GREEN    = "#34D399";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const GCIPL_RE =
  /\b(communit\w*\s+intel(\s+profile)?|intel(\s+profile)?\s+communit\w*|gcipl|infiltrated\s+communit\w*|communit\w*\s+threat\s+actor[s]?|communit\w*\s+adversar\w*|which\s+communities\s+have\s+threat\s+actors?|threat\s+actor[s]?\s+communit\w*|communit\w*\s+intel\s+profile[s]?|network\s+threat\s+actor[s]?|communit\w*\s+infiltrat\w*)\b/i;

export function isGciplQuery(q) { return GCIPL_RE.test(q); }

export async function buildGciplScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [commRes, profRes] = await Promise.all([
      fetch(`${base}/v1/graph/communities`,  { headers: hdr }),
      fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
    ]);
    const communities = normaliseCommunities(await commRes.json());
    const profiles    = normaliseProfiles(await profRes.json());

    const infiltrated = communities.filter(
      (c) => profiles.some((p) => relevance(c, p) > 0)
    ).length;
    const clean = communities.length - infiltrated;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS community intel profile brief: ${communities.length} graph communities ` +
          `correlated against ${profiles.length} tracked threat actor intel profiles. ` +
          `${infiltrated} communities are INFILTRATED (at least one threat actor profile ` +
          `aligns with their domain); ${clean} communities remain CLEAN ` +
          `(no intel profile alignment detected). ` +
          `Provide a 2-sentence community threat-actor coverage assessment — formal ` +
          `British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Community intel profile analysis complete, sir.").trim();
  } catch {
    return "Community intel profile coverage unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseCommunities(raw) {
  const arr = Array.isArray(raw)                ? raw
    : Array.isArray(raw?.communities)           ? raw.communities
    : Array.isArray(raw?.clusters)              ? raw.clusters
    : Array.isArray(raw?.data)                  ? raw.data
    : Array.isArray(raw?.results)               ? raw.results
    : Array.isArray(raw?.items)                 ? raw.items
    : [];
  return arr.map((c, i) => ({
    id:      c.id        || c.community_id  || String(i),
    label:   c.label     || c.name          || c.title     || `Community ${i + 1}`,
    members: Array.isArray(c.members) ? c.members.join(" ") : (c.members || ""),
    summary: (c.summary  || c.description   || c.notes     || "").toString().slice(0, 300),
    size:    c.size      || (Array.isArray(c.members) ? c.members.length : 0) || 0,
  }));
}

function normaliseProfiles(raw) {
  const arr = Array.isArray(raw)                   ? raw
    : Array.isArray(raw?.items)                   ? raw.items
    : Array.isArray(raw?.data)                    ? raw.data
    : Array.isArray(raw?.results)                 ? raw.results
    : Array.isArray(raw?.intel_profiles)          ? raw.intel_profiles
    : Array.isArray(raw?.profiles)                ? raw.profiles
    : [];
  return arr.map((p, i) => ({
    id:          p.id          || String(i),
    label:       p.name        || p.title       || p.subject    || `Profile ${i + 1}`,
    category:    (p.category   || p.type        || p.kind       || "UNKNOWN").toString().toUpperCase(),
    nationality: p.nationality || p.country     || p.origin     || "",
    tokens: tok(
      `${p.name || ""} ${p.title || ""} ${p.subject || ""} ` +
      `${p.description || ""} ${p.category || ""} ${p.nationality || ""} ` +
      `${(Array.isArray(p.aliases) ? p.aliases.join(" ") : p.aliases || "")} ` +
      `${(Array.isArray(p.tags) ? p.tags.join(" ") : p.tags || "")}`
    ),
  }));
}

function tok(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function relevance(community, profile) {
  const cw = tok(`${community.label} ${community.members} ${community.summary}`);
  const pv = new Set(profile.tokens);
  return cw.filter((w) => pv.has(w)).length;
}

function categoryColor(cat) {
  if (cat.includes("STATE"))   return "#F43F5E";
  if (cat.includes("CRIME"))   return "#F97316";
  if (cat.includes("TERROR"))  return "#EF4444";
  if (cat.includes("CYBER"))   return "#60A5FA";
  if (cat.includes("CORP"))    return "#A78BFA";
  return "#6E8AA0";
}

function buildLinked(communities, profiles) {
  return communities.map((c) => {
    const matched = profiles
      .map((p) => ({ ...p, score: relevance(c, p) }))
      .filter((p) => p.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    return { ...c, profiles: matched, infiltrated: matched.length > 0 };
  });
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "INFILTRATED", "CLEAN"];

export default function GraphCommunityIntelProfileCoverage() {
  const [open,        setOpen]        = useState(false);
  const [communities, setCommunities] = useState([]);
  const [profiles,    setProfiles]    = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [filter,      setFilter]      = useState("ALL");
  const [search,      setSearch]      = useState("");
  const [expanded,    setExpanded]    = useState(null);
  const [assessing,   setAssessing]   = useState(false);
  const [lastFetch,   setLastFetch]   = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [commRes, profRes] = await Promise.all([
        fetch(`${base}/v1/graph/communities`,  { headers: hdr }),
        fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
      ]);
      setCommunities(normaliseCommunities(await commRes.json()));
      setProfiles(normaliseProfiles(await profRes.json()));
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
    window.addEventListener("jarvis:gcipl-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gcipl-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    const text = await buildGciplScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const linked       = buildLinked(communities, profiles);
  const infiltrated  = linked.filter((c) => c.infiltrated).length;
  const clean        = linked.length - infiltrated;

  const displayed = linked.filter((c) => {
    if (filter === "INFILTRATED" && !c.infiltrated) return false;
    if (filter === "CLEAN"       && c.infiltrated)  return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return c.label.toLowerCase().includes(q) || c.members.toLowerCase().includes(q);
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Graph Community × Intel Profile Coverage (GCIPL)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 270,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${RED}55`,
          color: RED, padding: "3px 10px", borderRadius: 6,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          cursor: "pointer", backdropFilter: "blur(6px)",
          letterSpacing: 1,
        }}
      >
        {infiltrated > 0
          ? <><span style={{ background: RED, color: "#04060A", borderRadius: 4, padding: "0 4px", marginRight: 4, fontWeight: 700 }}>{infiltrated}</span>◈ GCIPL</>
          : "◈ GCIPL"
        }
      </button>
    );
  }

  const TILE = { flex: "1 1 100px", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", textAlign: "center" };

  return (
    <div style={{
      position: "fixed", bottom: 52, left: BTN_LEFT - 360, zIndex: 270,
      width: 480, maxHeight: "72vh", display: "flex", flexDirection: "column",
      background: "rgba(6,10,16,0.95)", border: `1px solid ${RED}44`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: `0 0 40px ${RED}22`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${RED}33` }}>
        <span style={{ color: RED, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ GCIPL</span>
        <span style={{ color: SLATE, fontSize: 9, flex: 1 }}>COMMUNITY × INTEL PROFILE COVERAGE</span>
        {lastFetch && <span style={{ color: SLATE, fontSize: 8 }}>{lastFetch.toLocaleTimeString()}</span>}
        {loading && <span style={{ color: RED, fontSize: 9 }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{ marginLeft: 4, background: "none", border: "none", color: SLATE, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${RED}22` }}>
        {[
          { label: "COMMUNITIES", value: linked.length,    col: BLUE   },
          { label: "PROFILES",    value: profiles.length,  col: VIOLET },
          { label: "INFILTRATED", value: infiltrated,      col: RED    },
          { label: "CLEAN",       value: clean,            col: GREEN  },
        ].map(({ label, value, col }) => (
          <div key={label} style={TILE}>
            <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{value}</div>
            <div style={{ color: SLATE, fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${RED}22`, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setFilter(t)} style={{
            background: filter === t ? `${RED}22` : "none",
            border: `1px solid ${filter === t ? RED : SLATE}`,
            color: filter === t ? RED : SLATE,
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
          background: "none", border: `1px solid ${RED}`,
          color: RED, borderRadius: 5, padding: "2px 8px",
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
        {displayed.map((c) => {
          const isExp  = expanded === c.id;
          const col    = c.infiltrated ? RED : GREEN;
          const badge  = c.infiltrated ? "INFILTRATED" : "CLEAN";
          return (
            <div key={c.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : c.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 7, cursor: "pointer",
                  background: isExp ? `${RED}11` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${c.infiltrated ? `${RED}44` : "#34D39944"}`,
                  transition: "background 0.2s",
                }}
              >
                <span style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: 1, padding: "1px 5px",
                  borderRadius: 4, background: `${col}22`, color: col,
                }}>
                  {badge}
                </span>
                <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5" }}>{c.label}</span>
                {c.size > 0 && <span style={{ fontSize: 8, color: SLATE }}>{c.size} nodes</span>}
                {c.infiltrated && (
                  <span style={{ fontSize: 8, color: RED }}>{c.profiles.length} profile{c.profiles.length !== 1 ? "s" : ""}</span>
                )}
                <span style={{ color: SLATE, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ margin: "4px 0 4px 12px", padding: "8px 10px", borderRadius: 7, background: "rgba(255,255,255,0.02)", border: `1px solid ${RED}22` }}>
                  {c.summary && (
                    <div style={{ fontSize: 9, color: SLATE, marginBottom: 6 }}>
                      {c.summary.slice(0, 120)}
                    </div>
                  )}
                  {c.profiles.length === 0 ? (
                    <div style={{ fontSize: 9, color: GREEN }}>No threat actor intel profiles currently align with this community's domain.</div>
                  ) : (
                    c.profiles.map((p, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, padding: "4px 8px", borderRadius: 5, background: "rgba(255,255,255,0.03)" }}>
                        <span style={{
                          fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                          background: `${categoryColor(p.category)}22`, color: categoryColor(p.category),
                          letterSpacing: 1, flexShrink: 0,
                        }}>
                          {p.category.slice(0, 6)}
                        </span>
                        <span style={{ flex: 1, fontSize: 9, color: "#DCEBF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.label}</span>
                        {p.nationality && (
                          <span style={{ fontSize: 8, color: ORANGE, flexShrink: 0, padding: "1px 4px", borderRadius: 3, background: `${ORANGE}11` }}>
                            {p.nationality.slice(0, 6).toUpperCase()}
                          </span>
                        )}
                        <div style={{ width: 60, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)", flexShrink: 0 }}>
                          <div style={{ height: "100%", borderRadius: 2, background: RED, width: `${Math.min(100, p.score * 20)}%` }} />
                        </div>
                        <span style={{ fontSize: 8, color: RED, flexShrink: 0 }}>{p.score}</span>
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
