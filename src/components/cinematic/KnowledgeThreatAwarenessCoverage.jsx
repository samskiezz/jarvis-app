/**
 * F102 — Knowledge × IntelProfile × SwarmJob
 *         Threat Awareness Coverage (KIPSWTA)
 *
 * Parallel-fetches /knowledge/ + /entities/IntelProfile + /entities/SwarmJob.
 * Keyword-correlates each knowledge article against intel actor profiles AND
 * swarm operations to classify:
 *   FULLY_CONTEXTUALIZED  (actor + swarm match)
 *   ACTOR_AWARE           (intel profile only)
 *   SWARM_SUPPORTED       (swarm job only)
 *   ISOLATED              (no match)
 *
 * Amber badge on isolated count.
 * Stat tiles ARTICLES / INTEL PROFILES / SWARM JOBS + all four class counts.
 * Filter tabs ALL/FULLY_CONTEXTUALIZED/ACTOR_AWARE/SWARM_SUPPORTED/ISOLATED + text search.
 * Expand article → matched intel actor cards (orange) + swarm job cards (cyan)
 *   with relevance bars.
 * ▶ ASSESS COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Voice trigger: "kipswta/knowledge threat awareness/knowledge intel swarm/
 *   isolated knowledge/threat aware knowledge/knowledge actor coverage/
 *   knowledge swarm coverage".
 * Event: jarvis:kipswta-toggle | 90-s auto-refresh.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_000_040;
const Z_INDEX  = 164;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const KIPSWTA_RE = /\b(kipswta|knowledge[\s-]threat[\s-]awareness|knowledge[\s-]intel[\s-]swarm|isolated[\s-]knowledge|threat[\s-]aware[\s-]knowledge|knowledge[\s-]actor[\s-]coverage|knowledge[\s-]swarm[\s-]coverage|kb[\s-]threat[\s-]coverage|knowledge[\s-]threat[\s-]coverage)\b/i;

const CY  = "#00CFFF";
const GR  = "#22C55E";
const AM  = "#F59E0B";
const RD  = "#EF4444";
const OR  = "#F97316";
const BG  = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_CONTEXTUALIZED: GR,
  ACTOR_AWARE:          OR,
  SWARM_SUPPORTED:      CY,
  ISOLATED:             AM,
};

const TABS = ["ALL","FULLY_CONTEXTUALIZED","ACTOR_AWARE","SWARM_SUPPORTED","ISOLATED"];
const TAB_LABELS = {
  ALL:                  "ALL",
  FULLY_CONTEXTUALIZED: "FULLY CTX",
  ACTOR_AWARE:          "ACTOR AWARE",
  SWARM_SUPPORTED:      "SWARM SUPP.",
  ISOLATED:             "ISOLATED",
};

// ── exports for JarvisBrain ───────────────────────────────────────────────────

export function isKipswatQuery(text) {
  return KIPSWTA_RE.test(text || "");
}

// ── helpers ───────────────────────────────────────────────────────────────────

function norm(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function kwTokens(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function overlap(aStr, bStr) {
  const at = new Set(kwTokens(aStr));
  const bt = kwTokens(bStr);
  if (!at.size || !bt.length) return 0;
  return bt.filter(w => at.has(w)).length / Math.max(at.size, bt.length);
}

function articleStr(a) {
  return [a.title, a.content, a.summary, a.description,
    (a.tags || []).join(" "), a.category, a.source].join(" ");
}

function actorStr(p) {
  return [p.name, p.org, p.role, p.type, p.origin,
    (p.aliases || []).join(" "), (p.tags || []).join(" "),
    p.description, p.motivation].join(" ");
}

function swarmStr(j) {
  return [j.name, j.description, j.type, j.status,
    j.target, j.objective, (j.tags || []).join(" ")].join(" ");
}

const THRESHOLD = 0.04;

async function fetchAll() {
  const base = apiBase();
  const headers = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
  const [kbRaw, actorRaw, swarmRaw] = await Promise.all([
    fetch(`${base}/knowledge/`, { headers }).then(r => r.json()),
    fetch(`${base}/entities/IntelProfile`, { headers }).then(r => r.json()),
    fetch(`${base}/entities/SwarmJob`, { headers }).then(r => r.json()),
  ]);

  const articles = norm(kbRaw,    ["articles","items","data","results","knowledge"]);
  const actors   = norm(actorRaw, ["intel_profiles","profiles","items","data","results"]);
  const swarms   = norm(swarmRaw, ["swarm_jobs","jobs","items","data","results"]);
  return { articles, actors, swarms };
}

function classify(articles, actors, swarms) {
  return articles.map(art => {
    const as = articleStr(art);
    const actorMatches = actors.map(p => ({ ...p, rel: overlap(as, actorStr(p)) }))
      .filter(x => x.rel >= THRESHOLD).sort((a,b) => b.rel - a.rel).slice(0, 4);
    const swarmMatches = swarms.map(j => ({ ...j, rel: overlap(as, swarmStr(j)) }))
      .filter(x => x.rel >= THRESHOLD).sort((a,b) => b.rel - a.rel).slice(0, 4);
    const hasActor = actorMatches.length > 0;
    const hasSwarm = swarmMatches.length > 0;
    let cls;
    if (hasActor && hasSwarm) cls = "FULLY_CONTEXTUALIZED";
    else if (hasActor)        cls = "ACTOR_AWARE";
    else if (hasSwarm)        cls = "SWARM_SUPPORTED";
    else                      cls = "ISOLATED";
    return { ...art, cls, actorMatches, swarmMatches };
  });
}

export async function buildKipswatScript() {
  const { articles, actors, swarms } = await fetchAll();
  const classified = classify(articles, actors, swarms);
  const total    = classified.length;
  const fullCtx  = classified.filter(c => c.cls === "FULLY_CONTEXTUALIZED").length;
  const actOnly  = classified.filter(c => c.cls === "ACTOR_AWARE").length;
  const swrmOnly = classified.filter(c => c.cls === "SWARM_SUPPORTED").length;
  const isolated = classified.filter(c => c.cls === "ISOLATED").length;
  const pct      = total ? Math.round((fullCtx / total) * 100) : 0;

  if (!total) return "No knowledge base articles available at this time, sir.";

  return `KIPSWTA knowledge threat awareness coverage online, sir. Analysed ${total} knowledge base article${total === 1 ? "" : "s"} ` +
    `against ${actors.length} intel actor profiles and ${swarms.length} swarm operations. ` +
    `${fullCtx} article${fullCtx === 1 ? "" : "s"} are fully contextualised — linked to both known threat actors and active swarm operations. ` +
    `${actOnly} actor-aware, ${swrmOnly} swarm-supported, ${isolated} isolated with no operational context. ` +
    `Knowledge threat awareness at ${pct} percent. Recommend reviewing isolated knowledge articles for intelligence gaps, sir.`;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function KnowledgeThreatAwarenessCoverage() {
  const [open, setOpen]           = useState(false);
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState({});
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]         = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { articles, actors, swarms } = await fetchAll();
      const classified = classify(articles, actors, swarms);
      setData({ classified, actors, swarms });
    } catch (e) {
      setError(e.message || "fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:kipswta-toggle", onToggle);
    return () => window.removeEventListener("jarvis:kipswta-toggle", onToggle);
  }, []);

  const classified = data?.classified ?? [];
  const total    = classified.length;
  const fullCtx  = classified.filter(c => c.cls === "FULLY_CONTEXTUALIZED").length;
  const actOnly  = classified.filter(c => c.cls === "ACTOR_AWARE").length;
  const swrmOnly = classified.filter(c => c.cls === "SWARM_SUPPORTED").length;
  const isolated = classified.filter(c => c.cls === "ISOLATED").length;

  const visible = classified.filter(c => {
    if (tab !== "ALL" && c.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      const haystack = [c.title, c.summary, c.content, c.category,
        (c.tags || []).join(" ")].join(" ").toLowerCase();
      if (!haystack.includes(s)) return false;
    }
    return true;
  });

  async function assess() {
    setAssessing(true); setBrief("");
    try {
      const summary = `${total} knowledge articles analysed: ${fullCtx} fully-contextualized (actor+swarm), ` +
        `${actOnly} actor-aware, ${swrmOnly} swarm-supported, ${isolated} isolated.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `KIPSWTA knowledge threat awareness: ${summary} Provide a 2-sentence assessment of the most critical knowledge coverage gaps relative to active threat actors and swarm operations.` }),
      });
      const d = await r.json();
      const b = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "Assessment complete.";
      setBrief(b);
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: b, voice: "onyx" }),
      }).then(async res => {
        if (!res.ok) return;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play();
        audio.onended = () => URL.revokeObjectURL(url);
      }).catch(() => {});
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }

  const s = {
    wrap: { position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX, fontFamily: FONT },
    btn: {
      background: "rgba(6,11,22,0.92)", border: `1px solid ${AM}`,
      color: AM, padding: "4px 10px", borderRadius: 4, cursor: "pointer",
      fontSize: 11, letterSpacing: 1,
    },
    panel: {
      position: "fixed", bottom: 52, left: 8, right: 8, top: 48,
      background: BG, border: `1px solid ${BORDER}`,
      borderRadius: 8, zIndex: Z_INDEX, overflow: "hidden",
      display: "flex", flexDirection: "column",
    },
    header: {
      padding: "12px 16px", borderBottom: `1px solid ${BORDER}`,
      display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
    },
    title: { color: CY, fontSize: 13, fontWeight: 700, letterSpacing: 2, flex: 1 },
    close: {
      background: "none", border: `1px solid ${BORDER}`, color: "#aaa",
      padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontSize: 11,
    },
    tiles: { display: "flex", gap: 8, padding: "8px 16px", flexWrap: "wrap" },
    tile: (col) => ({
      background: `${col}18`, border: `1px solid ${col}44`,
      borderRadius: 6, padding: "6px 12px", textAlign: "center", minWidth: 90,
    }),
    tileVal: (col) => ({ color: col, fontSize: 18, fontWeight: 700, display: "block" }),
    tileLabel: { color: "#888", fontSize: 9, letterSpacing: 1, display: "block" },
    tabs: { display: "flex", gap: 4, padding: "0 16px 8px", flexWrap: "wrap" },
    tabBtn: (active) => ({
      background: active ? `${CY}22` : "transparent",
      border: `1px solid ${active ? CY : BORDER}`,
      color: active ? CY : "#888", padding: "3px 10px",
      borderRadius: 4, cursor: "pointer", fontSize: 10, letterSpacing: 1,
    }),
    searchRow: { padding: "0 16px 8px" },
    searchInput: {
      width: "100%", background: "rgba(0,207,255,0.06)",
      border: `1px solid ${BORDER}`, color: "#ccc", padding: "4px 8px",
      borderRadius: 4, fontSize: 11, fontFamily: FONT, boxSizing: "border-box",
    },
    list: { flex: 1, overflowY: "auto", padding: "0 16px 16px" },
    card: {
      background: "rgba(0,207,255,0.04)", border: `1px solid ${BORDER}`,
      borderRadius: 6, marginBottom: 6, padding: "8px 12px",
    },
    cardRow: { display: "flex", alignItems: "center", gap: 8, cursor: "pointer" },
    clsBadge: (col) => ({
      background: `${col}22`, border: `1px solid ${col}66`,
      color: col, fontSize: 9, padding: "2px 6px", borderRadius: 3, letterSpacing: 1,
    }),
    subCard: (col) => ({
      background: `${col}0d`, border: `1px solid ${col}33`,
      borderRadius: 4, padding: "5px 8px", marginTop: 4,
    }),
    bar: (rel, col) => ({
      height: 4, width: `${Math.round(rel * 100)}%`,
      background: col, borderRadius: 2, marginTop: 4, minWidth: 2,
    }),
    footer: {
      padding: "8px 16px", borderTop: `1px solid ${BORDER}`,
      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
    },
    assessBtn: {
      background: `${CY}22`, border: `1px solid ${CY}66`,
      color: CY, padding: "4px 12px", borderRadius: 4,
      cursor: "pointer", fontSize: 11, letterSpacing: 1,
    },
    briefText: { color: "#ccc", fontSize: 11, flex: 1 },
  };

  return (
    <div style={s.wrap}>
      <button style={s.btn} onClick={() => setOpen(o => !o)}>
        ◈ KIPSWTA {isolated > 0 && <span style={{ color: AM, marginLeft: 4 }}>{isolated}</span>}
      </button>

      {open && (
        <div style={s.panel}>
          <div style={s.header}>
            <span style={s.title}>◈ KNOWLEDGE THREAT AWARENESS COVERAGE</span>
            {loading && <span style={{ color: CY, fontSize: 10 }}>LOADING…</span>}
            {error && <span style={{ color: RD, fontSize: 10 }}>{error}</span>}
            <button style={s.close} onClick={() => setOpen(false)}>✕ CLOSE</button>
          </div>

          <div style={s.tiles}>
            <div style={s.tile(CY)}>
              <span style={s.tileVal(CY)}>{total}</span>
              <span style={s.tileLabel}>ARTICLES</span>
            </div>
            <div style={s.tile("#aaa")}>
              <span style={s.tileVal("#aaa")}>{data?.actors?.length ?? 0}</span>
              <span style={s.tileLabel}>INTEL PROFILES</span>
            </div>
            <div style={s.tile("#aaa")}>
              <span style={s.tileVal("#aaa")}>{data?.swarms?.length ?? 0}</span>
              <span style={s.tileLabel}>SWARM JOBS</span>
            </div>
            <div style={s.tile(GR)}>
              <span style={s.tileVal(GR)}>{fullCtx}</span>
              <span style={s.tileLabel}>FULLY CTX</span>
            </div>
            <div style={s.tile(OR)}>
              <span style={s.tileVal(OR)}>{actOnly}</span>
              <span style={s.tileLabel}>ACTOR AWARE</span>
            </div>
            <div style={s.tile(CY)}>
              <span style={s.tileVal(CY)}>{swrmOnly}</span>
              <span style={s.tileLabel}>SWARM SUPP.</span>
            </div>
            <div style={s.tile(AM)}>
              <span style={s.tileVal(AM)}>{isolated}</span>
              <span style={s.tileLabel}>ISOLATED</span>
            </div>
            {total > 0 && (
              <div style={s.tile(GR)}>
                <span style={s.tileVal(GR)}>{Math.round((fullCtx / total) * 100)}%</span>
                <span style={s.tileLabel}>FULL CTX%</span>
              </div>
            )}
          </div>

          <div style={s.tabs}>
            {TABS.map(t => (
              <button key={t} style={s.tabBtn(tab === t)} onClick={() => setTab(t)}>
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>

          <div style={s.searchRow}>
            <input
              style={s.searchInput}
              placeholder="Search articles…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div style={s.list}>
            {visible.map((art, i) => {
              const id = art.id || art._id || art.title || i;
              const isExp = expanded[id];
              return (
                <div key={id} style={s.card}>
                  <div style={s.cardRow} onClick={() => setExpanded(p => ({ ...p, [id]: !p[id] }))}>
                    <span style={{ color: CLASS_COLOR[art.cls], fontSize: 11 }}>▶</span>
                    <span style={{ color: "#ddd", fontSize: 11, flex: 1 }}>{art.title || `Article ${i + 1}`}</span>
                    <span style={s.clsBadge(CLASS_COLOR[art.cls])}>{art.cls.replace(/_/g, " ")}</span>
                    {art.category && (
                      <span style={{ color: "#888", fontSize: 9 }}>{art.category}</span>
                    )}
                  </div>

                  {isExp && (
                    <div style={{ paddingTop: 6 }}>
                      {art.actorMatches.length > 0 && (
                        <div>
                          <div style={{ color: OR, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHED INTEL ACTORS ({art.actorMatches.length})
                          </div>
                          {art.actorMatches.map((p, j) => (
                            <div key={p.id || p.name || j} style={s.subCard(OR)}>
                              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                <span style={{ color: OR, fontSize: 10, flex: 1 }}>{p.name || "Unknown Actor"}</span>
                                {p.role && (
                                  <span style={{ color: "#aaa", fontSize: 9, background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 3 }}>
                                    {p.role}
                                  </span>
                                )}
                                <span style={{ color: OR, fontSize: 9 }}>{Math.round(p.rel * 100)}%</span>
                              </div>
                              <div style={s.bar(p.rel, OR)} />
                            </div>
                          ))}
                        </div>
                      )}

                      {art.swarmMatches.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                          <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHED SWARM JOBS ({art.swarmMatches.length})
                          </div>
                          {art.swarmMatches.map((j, k) => (
                            <div key={j.id || j.name || k} style={s.subCard(CY)}>
                              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                <span style={{ color: CY, fontSize: 10, flex: 1 }}>{j.name || "Unnamed Job"}</span>
                                {j.status && (
                                  <span style={{ color: "#aaa", fontSize: 9, background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 3 }}>
                                    {j.status}
                                  </span>
                                )}
                                <span style={{ color: CY, fontSize: 9 }}>{Math.round(j.rel * 100)}%</span>
                              </div>
                              <div style={s.bar(j.rel, CY)} />
                            </div>
                          ))}
                        </div>
                      )}

                      {art.actorMatches.length === 0 && art.swarmMatches.length === 0 && (
                        <div style={{ color: AM, fontSize: 10, padding: "4px 0" }}>
                          No matching intel actors or swarm operations found for this article.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {visible.length === 0 && !loading && (
              <div style={{ color: "#666", fontSize: 11, padding: 16 }}>No articles match current filter.</div>
            )}
          </div>

          <div style={s.footer}>
            <button style={s.assessBtn} onClick={assess} disabled={assessing}>
              {assessing ? "ASSESSING…" : "▶ ASSESS COVERAGE"}
            </button>
            {brief && <span style={s.briefText}>{brief}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
