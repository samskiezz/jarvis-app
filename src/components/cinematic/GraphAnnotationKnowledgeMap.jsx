/**
 * F113 — Graph Annotation × Knowledge × IntelProfile Contextual Intelligence Map (GAKCIMAP)
 *
 * Parallel-fetches /v1/graph/annotations + /knowledge/ + /entities/IntelProfile.
 * Keyword-correlates each graph annotation against KB articles AND intel actor profiles to classify:
 *   FULLY_CONTEXTUALIZED  (KB article + intel profile match)
 *   KB_BACKED             (KB article match only)
 *   ACTOR_TAGGED          (intel profile match only)
 *   UNCONTEXTUALIZED      (neither — annotation has no KB or actor grounding)
 *
 * Amber badge on uncontextualized count.
 * Stat tiles ANNOTATIONS / KB ARTICLES / INTEL PROFILES + all four class counts + CTX%.
 * Filter tabs ALL/FULLY_CONTEXTUALIZED/KB_BACKED/ACTOR_TAGGED/UNCONTEXTUALIZED + text search.
 * Expand annotation → matched KB article cards (teal) + intel profile cards (orange) with relevance bars.
 * ▶ ASSESS CONTEXT → /v1/jarvis/agent/chat 2-sentence contextual grounding brief + TTS.
 * Voice trigger: "gakcimap/graph annotation/annotation context/annotation knowledge/actor annotation/uncontextualized annotation".
 * Event: jarvis:gakcimap-toggle | 90-s auto-refresh.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_006_200;
const Z_INDEX  = 175;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const GAKCIMAP_RE = /\b(gakcimap|graph[\s-]annotation|annotation[\s-]context|annotation[\s-]knowledge|actor[\s-]annotation|uncontextualized[\s-]annotation)\b/i;

const CY    = "#00CFFF";
const OR    = "#F97316";
const TE    = "#14B8A6";
const GR    = "#22C55E";
const AM    = "#F59E0B";
const RD    = "#EF4444";
const BG    = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT  = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_CONTEXTUALIZED: GR,
  KB_BACKED:            TE,
  ACTOR_TAGGED:         OR,
  UNCONTEXTUALIZED:     AM,
};

const TABS = ["ALL","FULLY_CONTEXTUALIZED","KB_BACKED","ACTOR_TAGGED","UNCONTEXTUALIZED"];

// ── exports for JarvisBrain ───────────────────────────────────────────────────

export function isGakcimapQuery(text) {
  return GAKCIMAP_RE.test(text || "");
}

// ── helpers ───────────────────────────────────────────────────────────────────

function norm(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function txt(...vals) {
  return vals.map(v => String(v || "").toLowerCase()).join(" ");
}

function tokens(str) {
  return String(str || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(t => t.length > 2);
}

function relevance(ann, target) {
  const atoks = tokens(txt(ann.label, ann.text, ann.content, ann.entity, ann.type, ann.description));
  const btoks = tokens(txt(target.name, target.title, target.aliases, target.org, target.role, target.tags, target.description, target.content));
  if (!atoks.length || !btoks.length) return 0;
  const bset = new Set(btoks);
  const hits = atoks.filter(t => bset.has(t)).length;
  return Math.round((hits / atoks.length) * 100);
}

function classify(ann, kbMatches, actorMatches) {
  const hasKb    = kbMatches.length > 0;
  const hasActor = actorMatches.length > 0;
  if (hasKb && hasActor) return "FULLY_CONTEXTUALIZED";
  if (hasKb)             return "KB_BACKED";
  if (hasActor)          return "ACTOR_TAGGED";
  return "UNCONTEXTUALIZED";
}

async function fetchAll() {
  const headers = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
  const base = apiBase();

  const [annRes, kbRes, actorRes] = await Promise.allSettled([
    fetch(`${base}/v1/graph/annotations`, { headers }).then(r => r.json()),
    fetch(`${base}/knowledge/`,            { headers }).then(r => r.json()),
    fetch(`${base}/entities/IntelProfile`, { headers }).then(r => r.json()),
  ]);

  const annotations = norm(annRes.status === "fulfilled" ? annRes.value : [], ["annotations","items","data","results"]);
  const kbArticles  = norm(kbRes.status  === "fulfilled" ? kbRes.value  : [], ["articles","items","data","results"]);
  const actors      = norm(actorRes.status === "fulfilled" ? actorRes.value : [], ["profiles","items","data","results"]);

  const rows = annotations.map(ann => {
    const kbMatches    = kbArticles.map(a => ({ ...a, _rel: relevance(ann, a) })).filter(a => a._rel > 0).sort((a,b) => b._rel - a._rel).slice(0,4);
    const actorMatches = actors.map(a => ({ ...a, _rel: relevance(ann, a) })).filter(a => a._rel > 0).sort((a,b) => b._rel - a._rel).slice(0,4);
    return { ann, kbMatches, actorMatches, cls: classify(ann, kbMatches, actorMatches) };
  });

  return { rows, kbArticles, actors };
}

export async function buildGakcimapScript() {
  const headers = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
  const base = apiBase();

  const { rows } = await fetchAll();
  const total       = rows.length;
  const fullCtx     = rows.filter(r => r.cls === "FULLY_CONTEXTUALIZED").length;
  const kbOnly      = rows.filter(r => r.cls === "KB_BACKED").length;
  const actorOnly   = rows.filter(r => r.cls === "ACTOR_TAGGED").length;
  const unctx       = rows.filter(r => r.cls === "UNCONTEXTUALIZED").length;

  const pct = total ? Math.round((fullCtx / total) * 100) : 0;
  const ctxPct = total ? Math.round(((fullCtx + kbOnly + actorOnly) / total) * 100) : 0;

  const context = `Graph annotation contextual intelligence map: ${total} annotations total. Fully contextualized (KB + actor): ${fullCtx}. KB-backed only: ${kbOnly}. Actor-tagged only: ${actorOnly}. Uncontextualized: ${unctx}. Overall context coverage: ${ctxPct}%.`;

  const chatHeaders = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const resp = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: chatHeaders,
    body: JSON.stringify({ message: `In exactly 2 sentences, summarise the contextual grounding state of JARVIS graph annotations based on this data: ${context}. Focus on the uncontextualized gap and recommended enrichment priority.` }),
  });
  const data = await resp.json();
  return data?.response || data?.message || data?.content || context;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function GraphAnnotationKnowledgeMap() {
  const [open, setOpen]     = useState(false);
  const [rows, setRows]     = useState([]);
  const [kbCount, setKbCount]     = useState(0);
  const [actorCount, setActorCount] = useState(0);
  const [tab, setTab]       = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]   = useState("");
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { rows: r, kbArticles, actors } = await fetchAll();
      setRows(r);
      setKbCount(kbArticles.length);
      setActorCount(actors.length);
    } catch { /* ignore fetch errors */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener("jarvis:gakcimap-toggle", handler);
    return () => window.removeEventListener("jarvis:gakcimap-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    FULLY_CONTEXTUALIZED: rows.filter(r => r.cls === "FULLY_CONTEXTUALIZED").length,
    KB_BACKED:            rows.filter(r => r.cls === "KB_BACKED").length,
    ACTOR_TAGGED:         rows.filter(r => r.cls === "ACTOR_TAGGED").length,
    UNCONTEXTUALIZED:     rows.filter(r => r.cls === "UNCONTEXTUALIZED").length,
  };
  const total   = rows.length;
  const ctxPct  = total ? Math.round(((counts.FULLY_CONTEXTUALIZED + counts.KB_BACKED + counts.ACTOR_TAGGED) / total) * 100) : 0;
  const unctx   = counts.UNCONTEXTUALIZED;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      const label = String(r.ann.label || r.ann.text || r.ann.entity || r.ann.id || "").toLowerCase();
      if (!label.includes(q)) return false;
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const script = await buildGakcimapScript();
      setBrief(script);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch { setBrief("Unable to generate assessment at this time."); }
    setAssessing(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${CY}44`,
          color: CY, fontFamily: FONT, fontSize: 10, padding: "3px 8px",
          cursor: "pointer", borderRadius: 3, letterSpacing: "0.08em",
        }}
      >
        {unctx > 0 && (
          <span style={{ background: AM, color: "#000", borderRadius: 2, padding: "0 4px", marginRight: 4, fontSize: 9, fontWeight: 700 }}>
            {unctx}
          </span>
        )}
        ◈ GAKCIMAP
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 48, left: "50%", transform: "translateX(-50%)",
      width: 780, maxHeight: "70vh", zIndex: Z_INDEX + 100,
      background: BG, border: `1px solid ${BORDER}`,
      borderRadius: 6, fontFamily: FONT, fontSize: 11,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: `1px solid ${BORDER}` }}>
        <span style={{ color: CY, fontSize: 12, letterSpacing: "0.1em" }}>◈ GAKCIMAP — Graph Annotation × Knowledge × Intel Context Map</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={assess} disabled={assessing} style={{ background: "none", border: `1px solid ${CY}55`, color: CY, fontFamily: FONT, fontSize: 10, padding: "2px 8px", cursor: "pointer", borderRadius: 3 }}>
            {assessing ? "…" : "▶ ASSESS CONTEXT"}
          </button>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#64748B", fontSize: 14, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "6px 12px", flexWrap: "wrap" }}>
        {[
          ["ANNOTATIONS",           total,                    CY],
          ["KB ARTICLES",           kbCount,                  TE],
          ["INTEL PROFILES",        actorCount,               OR],
          ["FULLY CTX",             counts.FULLY_CONTEXTUALIZED, GR],
          ["KB BACKED",             counts.KB_BACKED,         TE],
          ["ACTOR TAGGED",          counts.ACTOR_TAGGED,      OR],
          ["UNCONTEXTUALIZED",      counts.UNCONTEXTUALIZED,  AM],
          [`CTX ${ctxPct}%`,        null,                     ctxPct >= 70 ? GR : ctxPct >= 40 ? AM : RD],
        ].map(([label, val, clr]) => (
          <div key={label} style={{ background: "rgba(0,0,0,0.4)", border: `1px solid ${clr}33`, borderRadius: 3, padding: "3px 8px", textAlign: "center" }}>
            <div style={{ color: clr, fontSize: 13, fontWeight: 700 }}>{val ?? ""}</div>
            <div style={{ color: "#64748B", fontSize: 9 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* brief */}
      {brief && (
        <div style={{ margin: "0 12px 6px", padding: "6px 10px", background: "rgba(0,207,255,0.06)", border: `1px solid ${CY}33`, borderRadius: 4, color: "#CBD5E1", fontSize: 10, lineHeight: 1.5 }}>
          {brief}
        </div>
      )}

      {/* filter tabs + search */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 12px 6px", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? `${CLASS_COLOR[t] || CY}22` : "none",
            border: `1px solid ${tab === t ? (CLASS_COLOR[t] || CY) : "#334155"}`,
            color: tab === t ? (CLASS_COLOR[t] || CY) : "#64748B",
            fontFamily: FONT, fontSize: 9, padding: "2px 7px", cursor: "pointer", borderRadius: 3,
          }}>{t.replace(/_/g," ")}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search annotations…"
          style={{ marginLeft: "auto", background: "rgba(0,0,0,0.4)", border: `1px solid ${BORDER}`, color: "#CBD5E1", fontFamily: FONT, fontSize: 10, padding: "2px 8px", borderRadius: 3, width: 140 }}
        />
      </div>

      {/* rows */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 12px" }}>
        {loading && <div style={{ color: "#64748B", padding: 12, textAlign: "center" }}>Loading…</div>}
        {!loading && visible.length === 0 && (
          <div style={{ color: "#64748B", padding: 12, textAlign: "center" }}>No annotations match current filter.</div>
        )}
        {visible.map((row, i) => {
          const label = row.ann.label || row.ann.text || row.ann.entity || row.ann.id || `Annotation ${i+1}`;
          const isExp = expanded === i;
          const clr   = CLASS_COLOR[row.cls];
          return (
            <div key={i} style={{ marginBottom: 4, border: `1px solid ${clr}33`, borderRadius: 4, background: "rgba(0,0,0,0.25)" }}>
              <div
                onClick={() => setExpanded(isExp ? null : i)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", cursor: "pointer" }}
              >
                <span style={{ color: clr, fontSize: 9, fontWeight: 700, minWidth: 120 }}>{row.cls.replace(/_/g," ")}</span>
                <span style={{ color: "#CBD5E1", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                <span style={{ color: "#64748B", fontSize: 9 }}>{row.kbMatches.length} KB · {row.actorMatches.length} actors</span>
                <span style={{ color: "#475569", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ padding: "6px 12px", borderTop: `1px solid ${BORDER}` }}>
                  {row.ann.description && (
                    <div style={{ color: "#94A3B8", fontSize: 10, marginBottom: 6 }}>{row.ann.description}</div>
                  )}
                  {row.kbMatches.length > 0 && (
                    <>
                      <div style={{ color: TE, fontSize: 9, marginBottom: 4, letterSpacing: "0.08em" }}>KB ARTICLES</div>
                      {row.kbMatches.map((a, j) => (
                        <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                          <span style={{ color: "#CBD5E1", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10 }}>
                            {a.title || a.name || `Article ${j+1}`}
                          </span>
                          <div style={{ width: 80, height: 4, background: "#1E293B", borderRadius: 2 }}>
                            <div style={{ width: `${a._rel}%`, height: "100%", background: TE, borderRadius: 2 }} />
                          </div>
                          <span style={{ color: "#64748B", fontSize: 9, minWidth: 28, textAlign: "right" }}>{a._rel}%</span>
                        </div>
                      ))}
                    </>
                  )}
                  {row.actorMatches.length > 0 && (
                    <>
                      <div style={{ color: OR, fontSize: 9, marginBottom: 4, marginTop: 6, letterSpacing: "0.08em" }}>INTEL PROFILES</div>
                      {row.actorMatches.map((a, j) => (
                        <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                          <span style={{ color: "#CBD5E1", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10 }}>
                            {a.name || `Profile ${j+1}`}
                          </span>
                          {a.role && <span style={{ color: OR, fontSize: 9, border: `1px solid ${OR}44`, borderRadius: 2, padding: "0 4px" }}>{a.role}</span>}
                          <div style={{ width: 80, height: 4, background: "#1E293B", borderRadius: 2 }}>
                            <div style={{ width: `${a._rel}%`, height: "100%", background: OR, borderRadius: 2 }} />
                          </div>
                          <span style={{ color: "#64748B", fontSize: 9, minWidth: 28, textAlign: "right" }}>{a._rel}%</span>
                        </div>
                      ))}
                    </>
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
