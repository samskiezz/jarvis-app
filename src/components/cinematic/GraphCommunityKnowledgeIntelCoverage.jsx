/**
 * F142 — Graph Community × Knowledge × IntelProfile Network Intelligence Coverage (GCKNIP)
 *
 * Parallel-fetches /v1/graph/communities + /knowledge/ + /entities/IntelProfile
 * Keyword-correlates each network community (label/description/members) against
 * KB articles AND intel actor profiles:
 *   FULLY_MAPPED  — community matched both KB article AND intel actor
 *   KB_BACKED     — community matched KB article only
 *   ACTOR_LINKED  — community matched intel actor profile only
 *   UNMAPPED      — no matches (intelligence gap)
 *
 * Stat tiles: COMMUNITIES / KB ARTICLES / INTEL PROFILES + all four class counts + COVERAGE%.
 * Amber badge on unmapped count.
 * Filter tabs ALL / FULLY_MAPPED / KB_BACKED / ACTOR_LINKED / UNMAPPED + text search.
 * Expand community → matched KB article cards (green) + intel profile cards (orange) with relevance bars.
 * ▶ ASSESS COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:gcknip-toggle event.
 *
 * Voice triggers: "gcknip / graph community knowledge / network intel coverage /
 *                  unmapped community / community knowledge / community actor".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_022_440;
const Z_INDEX  = 204;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const GCKNIP_RE = /\b(gcknip|graph[\s-]community[\s-]knowledge|network[\s-]intel[\s-]coverage|unmapped[\s-]communit(?:y|ies)|community[\s-]knowledge|community[\s-]actor|community[\s-]intelligence[\s-]coverage)\b/i;

const CY     = "#00CFFF";
const GR     = "#22C55E";
const AM     = "#F59E0B";
const RE     = "#EF4444";
const OR     = "#F97316";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_MAPPED:  GR,
  KB_BACKED:     CY,
  ACTOR_LINKED:  OR,
  UNMAPPED:      AM,
};
const TABS = ["ALL", "FULLY_MAPPED", "KB_BACKED", "ACTOR_LINKED", "UNMAPPED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function communityText(c) {
  const members = Array.isArray(c.members) ? c.members.join(" ") : "";
  return `${c.name || c.label || c.id || ""} ${c.description || ""} ${members}`;
}
function kbText(a) {
  return `${a.title || ""} ${a.content || ""} ${a.summary || ""} ${(a.tags || []).join(" ")}`;
}
function actorText(p) {
  const aliases = Array.isArray(p.aliases) ? p.aliases.join(" ") : "";
  return `${p.name || ""} ${p.org || ""} ${p.role || ""} ${p.description || ""} ${aliases} ${(p.tags || []).join(" ")}`;
}

function normaliseArray(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.items)) return raw.items;
  return [];
}

async function loadAll() {
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const [commRes, kbRes, actorRes] = await Promise.allSettled([
    fetch(`${apiBase}/v1/graph/communities`,    { headers }),
    fetch(`${apiBase}/knowledge/`,              { headers }),
    fetch(`${apiBase}/entities/IntelProfile`,   { headers }),
  ]);
  const communities = normaliseArray(
    commRes.status === "fulfilled" && commRes.value.ok ? await commRes.value.json() : [],
    ["communities", "clusters"]
  );
  const kbArticles  = normaliseArray(
    kbRes.status === "fulfilled" && kbRes.value.ok ? await kbRes.value.json() : [],
    ["articles", "knowledge", "items"]
  );
  const intelActors = normaliseArray(
    actorRes.status === "fulfilled" && actorRes.value.ok ? await actorRes.value.json() : [],
    ["profiles", "actors"]
  );
  return { communities, kbArticles, intelActors };
}

function classify(community, kbArticles, intelActors) {
  const kws = keywords(communityText(community));
  const matchedKb    = kbArticles.filter(a => score(kbText(a), kws) > 0);
  const matchedActor = intelActors.filter(p => score(actorText(p), kws) > 0);
  let cls;
  if (matchedKb.length > 0 && matchedActor.length > 0) cls = "FULLY_MAPPED";
  else if (matchedKb.length > 0)                       cls = "KB_BACKED";
  else if (matchedActor.length > 0)                    cls = "ACTOR_LINKED";
  else                                                  cls = "UNMAPPED";
  return { ...community, cls, matchedKb, matchedActor };
}

function RelevanceBar({ score: s, max, color }) {
  const pct = max > 0 ? Math.round((s / max) * 100) : 0;
  return (
    <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginTop: 3 }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.3s" }} />
    </div>
  );
}

export async function buildGcknipScript() {
  const { communities, kbArticles, intelActors } = await loadAll();
  const rows     = communities.map(c => classify(c, kbArticles, intelActors));
  const mapped   = rows.filter(r => r.cls === "FULLY_MAPPED").length;
  const unmapped = rows.filter(r => r.cls === "UNMAPPED").length;
  const ctx = `Graph communities: ${communities.length}. KB articles: ${kbArticles.length}. Intel profiles: ${intelActors.length}. Fully mapped: ${mapped}. Unmapped: ${unmapped}.`;
  const res = await fetch(`${apiBase}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) },
    body: JSON.stringify({ message: `Network Intelligence Coverage (GCKNIP): ${ctx}. Write exactly 2 sentences assessing which network communities lack both knowledge-base and intel-actor coverage, and what the intelligence gap implies for network threat awareness.` }),
  });
  const j = await res.json().catch(() => ({}));
  return j.response || j.message || j.content
    || `GCKNIP online, sir. ${unmapped} network communities have no knowledge-base or intel-actor coverage — immediate network intelligence gaps identified.`;
}

export function isGcknipQuery(q) { return GCKNIP_RE.test(q); }

export default function GraphCommunityKnowledgeIntelCoverage() {
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [classified, setClassified] = useState([]);
  const [kbArticles, setKbArticles] = useState([]);
  const [intelActors, setIntelActors] = useState([]);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [brief, setBrief]       = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { communities, kbArticles: kb, intelActors: actors } = await loadAll();
      setKbArticles(kb);
      setIntelActors(actors);
      setClassified(communities.map(c => classify(c, kb, actors)));
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener("jarvis:gcknip-toggle", toggle);
    return () => window.removeEventListener("jarvis:gcknip-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = await buildGcknipScript();
      setBrief(script);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch { setBrief("Assessment unavailable."); }
    finally { setAssessing(false); }
  }, []);

  const counts = {
    FULLY_MAPPED:  classified.filter(r => r.cls === "FULLY_MAPPED").length,
    KB_BACKED:     classified.filter(r => r.cls === "KB_BACKED").length,
    ACTOR_LINKED:  classified.filter(r => r.cls === "ACTOR_LINKED").length,
    UNMAPPED:      classified.filter(r => r.cls === "UNMAPPED").length,
  };
  const total    = classified.length;
  const covPct   = total > 0 ? Math.round(((total - counts.UNMAPPED) / total) * 100) : 0;
  const unmapped = counts.UNMAPPED;

  const filtered = classified.filter(r => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return communityText(r).toLowerCase().includes(q);
  });

  const maxKb    = Math.max(1, ...filtered.map(r => r.matchedKb.length));
  const maxActor = Math.max(1, ...filtered.map(r => r.matchedActor.length));

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => { setOpen(o => { if (!o) load(); return !o; }); }}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 9, padding: "3px 8px", borderRadius: 5,
          cursor: "pointer", whiteSpace: "nowrap",
          background: open ? `${CY}22` : "rgba(0,0,0,0.6)",
          color: open ? CY : "#5A7A9A",
          border: `1px solid ${open ? CY : "#1A2A3A"}`,
        }}
      >
        ◈ GCKNIP
        {unmapped > 0 && (
          <span style={{ marginLeft: 4, background: AM, color: "#000", borderRadius: 9,
            padding: "0px 5px", fontSize: 8, fontWeight: 700 }}>
            {unmapped}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", left: BTN_LEFT, bottom: 32, zIndex: Z_INDEX + 1,
          width: 440, maxHeight: "72vh", overflowY: "auto",
          background: BG, border: `1px solid ${BORDER}`,
          borderRadius: 10, padding: 14, fontFamily: FONT,
          boxShadow: `0 0 24px ${CY}18`,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>
              ◈ GRAPH COMMUNITY × KB × INTEL COVERAGE
            </span>
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "#5A7A9A", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {error && (
            <div style={{ color: RE, fontSize: 10, marginBottom: 8 }}>⚠ {error}</div>
          )}

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {[
              ["COMMUNITIES", total,          CY],
              ["KB ARTICLES", kbArticles.length, GR],
              ["INTEL PROFS", intelActors.length, OR],
              ["FULLY MAPPED", counts.FULLY_MAPPED,  GR],
              ["KB BACKED",    counts.KB_BACKED,      CY],
              ["ACTOR LINKED", counts.ACTOR_LINKED,   OR],
              ["UNMAPPED",     counts.UNMAPPED,        AM],
              [`${covPct}% COV`, null,                 "#7DD3FC"],
            ].map(([label, val, col]) => (
              <div key={label} style={{ background: `${col}11`, border: `1px solid ${col}33`,
                borderRadius: 5, padding: "3px 8px", fontSize: 9, color: col, textAlign: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{val ?? label}</div>
                {val !== null && <div style={{ opacity: 0.7, marginTop: 1 }}>{label}</div>}
              </div>
            ))}
          </div>

          {/* Coverage bar */}
          <div style={{ marginBottom: 10, background: "rgba(255,255,255,0.04)", borderRadius: 4, height: 6 }}>
            <div style={{ height: "100%", width: `${covPct}%`, background: GR, borderRadius: 4,
              transition: "width 0.4s", boxShadow: `0 0 6px ${GR}66` }} />
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ fontSize: 9, padding: "2px 8px", borderRadius: 4, cursor: "pointer",
                  background: tab === t ? `${CLASS_COLOR[t] || CY}22` : "rgba(255,255,255,0.03)",
                  color: tab === t ? (CLASS_COLOR[t] || CY) : "#5A7A9A",
                  border: `1px solid ${tab === t ? (CLASS_COLOR[t] || CY) + "55" : "#1A2A3A"}` }}>
                {t}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            placeholder="Search communities…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", fontSize: 10, padding: "4px 8px",
              borderRadius: 5, background: "rgba(0,207,255,0.04)", border: `1px solid ${BORDER}`,
              color: "#DCEBF5", outline: "none", marginBottom: 8, fontFamily: FONT }}
          />

          {loading && (
            <div style={{ color: "#5A7A9A", fontSize: 10, textAlign: "center", padding: 10 }}>
              Loading…
            </div>
          )}

          {/* Community rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {filtered.map((c, i) => (
              <div key={c.id || i}
                onClick={() => setExpanded(expanded === i ? null : i)}
                style={{ background: `${CLASS_COLOR[c.cls]}0A`, border: `1px solid ${CLASS_COLOR[c.cls]}33`,
                  borderRadius: 6, padding: "6px 9px", cursor: "pointer",
                  display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4,
                    background: `${CLASS_COLOR[c.cls]}22`, color: CLASS_COLOR[c.cls],
                    border: `1px solid ${CLASS_COLOR[c.cls]}55`, whiteSpace: "nowrap" }}>
                    {c.cls.replace(/_/g, " ")}
                  </span>
                  <span style={{ fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.name || c.label || c.id || "Unnamed Community"}
                  </span>
                  <span style={{ fontSize: 9, color: "#5A7A9A" }}>
                    KB:{c.matchedKb.length} AC:{c.matchedActor.length}
                  </span>
                  <span style={{ fontSize: 10, color: "#5A7A9A" }}>{expanded === i ? "▲" : "▼"}</span>
                </div>

                {expanded === i && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                    {c.matchedKb.length > 0 && (
                      <div>
                        <div style={{ fontSize: 9, color: GR, marginBottom: 3, letterSpacing: 1 }}>
                          KB ARTICLES ({c.matchedKb.length})
                        </div>
                        {c.matchedKb.slice(0, 5).map((a, ai) => (
                          <div key={a.id || ai} style={{ background: `${GR}11`, border: `1px solid ${GR}33`,
                            borderRadius: 5, padding: "4px 7px", marginBottom: 3 }}>
                            <span style={{ fontSize: 10 }}>{a.title || a.id || "Article"}</span>
                            <RelevanceBar score={score(kbText(a), keywords(communityText(c)))} max={maxKb} color={GR} />
                          </div>
                        ))}
                      </div>
                    )}

                    {c.matchedActor.length > 0 && (
                      <div>
                        <div style={{ fontSize: 9, color: OR, marginBottom: 3, letterSpacing: 1 }}>
                          INTEL PROFILES ({c.matchedActor.length})
                        </div>
                        {c.matchedActor.slice(0, 5).map((p, pi) => (
                          <div key={p.id || pi} style={{ background: `${OR}11`, border: `1px solid ${OR}33`,
                            borderRadius: 5, padding: "4px 7px", marginBottom: 3 }}>
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <span style={{ fontSize: 10, flex: 1 }}>{p.name || p.id || "Actor"}</span>
                              {p.role && (
                                <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3,
                                  background: `${OR}22`, color: OR, border: `1px solid ${OR}44` }}>
                                  {p.role.toUpperCase()}
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={score(actorText(p), keywords(communityText(c)))} max={maxActor} color={OR} />
                          </div>
                        ))}
                      </div>
                    )}

                    {c.matchedKb.length === 0 && c.matchedActor.length === 0 && (
                      <div style={{ fontSize: 10, color: "#5A7A9A", fontStyle: "italic" }}>
                        No KB article or intel actor correlated — community is unmapped.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {filtered.length === 0 && !loading && !error && (
            <div style={{ color: "#5A7A9A", fontSize: 11, textAlign: "center", padding: 20 }}>
              No communities match current filter.
            </div>
          )}

          <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={assess} disabled={assessing}
              style={{ fontSize: 10, padding: "4px 12px", borderRadius: 5, cursor: "pointer",
                background: assessing ? "rgba(0,207,255,0.1)" : `${CY}22`,
                color: CY, border: `1px solid ${CY}55` }}>
              {assessing ? "Assessing…" : "▶ ASSESS COVERAGE"}
            </button>
            <button onClick={load} style={{ fontSize: 9, padding: "3px 8px", borderRadius: 5,
              cursor: "pointer", background: "rgba(0,207,255,0.05)",
              color: "#5A7A9A", border: `1px solid ${BORDER}` }}>↺</button>
          </div>

          {brief && (
            <div style={{ marginTop: 8, fontSize: 11, color: "#DCEBF5", lineHeight: 1.5,
              background: `${CY}09`, border: `1px solid ${CY}22`, borderRadius: 6,
              padding: "8px 10px" }}>{brief}</div>
          )}
        </div>
      )}
    </>
  );
}
