/**
 * F137 — Task × Graph Annotations × Ops Event × Knowledge
 *         Operational Intelligence Nexus (TGOKNEX)
 *
 * Parallel-fetches:
 *   /entities/Task          → mission tasks
 *   /v1/graph/annotations   → graph annotation context
 *   /v1/ops/events          → live operational events
 *   /knowledge/             → knowledge base articles
 *
 * Keyword-correlates each task (name/description/tags/status) against
 * graph annotations AND ops events AND KB articles to classify:
 *   FULLY_GROUNDED  — matched an annotation + ops event + KB article
 *   DUAL_GROUNDED   — matched any two sources
 *   SINGLE_LINKED   — matched exactly one source
 *   BARE            — no match in any dimension
 *
 * Amber badge on bare count.
 * ▶ ASSESS NEXUS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh.  jarvis:tgoknex-toggle event.
 * Voice: "tgoknex / task graph ops knowledge / task operational nexus /
 *         bare tasks / task annotation ops / task knowledge ops".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_019_640;
const Z_INDEX  = 199;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const TGOKNEX_RE =
  /\b(tgoknex|task[\s-]graph[\s-]ops[\s-]knowledge|task[\s-]operational[\s-]nexus|bare[\s-]tasks|task[\s-]annotation[\s-]ops|task[\s-]knowledge[\s-]ops)\b/i;

// ── colours ───────────────────────────────────────────────────────────────────
const CY     = "#00CFFF";
const AM     = "#F59E0B";
const GR     = "#22C55E";
const OR     = "#F97316";
const PU     = "#A855F7";
const TE     = "#14B8A6";
const BL     = "#3B82F6";
const DIM    = "#6E8AA0";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOUR = {
  FULLY_GROUNDED: GR,
  DUAL_GROUNDED:  CY,
  SINGLE_LINKED:  AM,
  BARE:           OR,
};

// ── exports for JarvisBrain ───────────────────────────────────────────────────
export function isTgoknexQuery(text) {
  return TGOKNEX_RE.test(text || "");
}

export async function buildTgoknexScript() {
  const base    = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [tasks, annotations, ops, kb] = await Promise.all([
    fetch(`${base}/entities/Task`,        { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/v1/graph/annotations`, { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/v1/ops/events`,        { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/knowledge/`,           { headers }).then(r => r.json()).catch(() => []),
  ]);

  const tsks  = Array.isArray(tasks)       ? tasks       : (tasks?.tasks || tasks?.items || []);
  const anns  = Array.isArray(annotations) ? annotations : (annotations?.annotations || annotations?.items || []);
  const evts  = Array.isArray(ops)         ? ops         : (ops?.events || ops?.items || []);
  const kbs   = Array.isArray(kb)          ? kb          : (kb?.articles || kb?.items || []);

  let fullyGrounded = 0;
  let dualGrounded  = 0;
  let singleLinked  = 0;
  let bare          = 0;

  tsks.forEach(t => {
    const kws = extractKeywords(t, ["name","title","description","tags","status","type"]);
    const hasAnn = anns.some(a => matchesKeywords(kws, a, ["title","text","label","entity","tags"]));
    const hasOps = evts.some(e => matchesKeywords(kws, e, ["title","description","type","severity","tags"]));
    const hasKb  = kbs.some(k  => matchesKeywords(kws, k, ["title","content","summary","tags","category"]));
    const hits = (hasAnn ? 1 : 0) + (hasOps ? 1 : 0) + (hasKb ? 1 : 0);
    if (hits >= 3) fullyGrounded++;
    else if (hits === 2) dualGrounded++;
    else if (hits === 1) singleLinked++;
    else bare++;
  });

  const total   = tsks.length;
  const pct     = total ? Math.round(((fullyGrounded + dualGrounded) / total) * 100) : 0;
  return `TGOKNEX Operational Intelligence Nexus — ${total} tasks cross-referenced against ${anns.length} graph annotations, ${evts.length} ops events, and ${kbs.length} KB articles. Coverage: ${fullyGrounded} FULLY GROUNDED, ${dualGrounded} DUAL GROUNDED, ${singleLinked} SINGLE LINKED, ${bare} BARE (${pct}% dual+ coverage). ${bare > 0 ? `${bare} tasks have no annotation, ops, or KB grounding — recommend prioritising context linkage.` : "All tasks have at least one intelligence source grounding."}`;
}

// ── helpers ───────────────────────────────────────────────────────────────────
function extractKeywords(obj, fields) {
  const words = new Set();
  fields.forEach(f => {
    const v = obj?.[f];
    if (!v) return;
    const str = Array.isArray(v) ? v.join(" ") : String(v);
    str.toLowerCase().split(/\W+/).filter(w => w.length > 3).forEach(w => words.add(w));
  });
  return words;
}

function matchesKeywords(kws, obj, fields) {
  const target = fields
    .map(f => { const v = obj?.[f]; return v ? (Array.isArray(v) ? v.join(" ") : String(v)) : ""; })
    .join(" ").toLowerCase();
  for (const kw of kws) {
    if (target.includes(kw)) return true;
  }
  return false;
}

function relevanceScore(kws, obj, fields) {
  const target = fields
    .map(f => { const v = obj?.[f]; return v ? (Array.isArray(v) ? v.join(" ") : String(v)) : ""; })
    .join(" ").toLowerCase();
  let score = 0;
  for (const kw of kws) {
    const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    const matches = target.match(re);
    if (matches) score += matches.length;
  }
  return Math.min(score, 10);
}

// ── main component ────────────────────────────────────────────────────────────
export default function TaskGraphOpsKnowledgeNexus() {
  const [open,       setOpen]       = useState(false);
  const [tasks,      setTasks]      = useState([]);
  const [annotations,setAnnotations]= useState([]);
  const [opsEvents,  setOpsEvents]  = useState([]);
  const [kb,         setKb]         = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [filter,     setFilter]     = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const [brief,      setBrief]      = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const base    = apiBase();
    const headers = { Authorization: `Bearer ${API_KEY}` };
    try {
      const [t, a, o, k] = await Promise.all([
        fetch(`${base}/entities/Task`,        { headers }).then(r => r.json()).catch(() => []),
        fetch(`${base}/v1/graph/annotations`, { headers }).then(r => r.json()).catch(() => []),
        fetch(`${base}/v1/ops/events`,        { headers }).then(r => r.json()).catch(() => []),
        fetch(`${base}/knowledge/`,           { headers }).then(r => r.json()).catch(() => []),
      ]);
      setTasks(      Array.isArray(t) ? t : (t?.tasks || t?.items || []));
      setAnnotations(Array.isArray(a) ? a : (a?.annotations || a?.items || []));
      setOpsEvents(  Array.isArray(o) ? o : (o?.events || o?.items || []));
      setKb(         Array.isArray(k) ? k : (k?.articles || k?.items || []));
    } catch (e) {
      setError(e?.message || "Fetch failed");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:tgoknex-toggle", onToggle);
    return () => window.removeEventListener("jarvis:tgoknex-toggle", onToggle);
  }, []);

  // ── classify ──────────────────────────────────────────────────────────────
  const classified = tasks.map(t => {
    const kws    = extractKeywords(t, ["name","title","description","tags","status","type"]);
    const annMatches = annotations.filter(a => matchesKeywords(kws, a, ["title","text","label","entity","tags"]));
    const opsMatches = opsEvents.filter(e  => matchesKeywords(kws, e, ["title","description","type","severity","tags"]));
    const kbMatches  = kb.filter(k         => matchesKeywords(kws, k, ["title","content","summary","tags","category"]));
    const hits = (annMatches.length > 0 ? 1 : 0)
               + (opsMatches.length > 0 ? 1 : 0)
               + (kbMatches.length  > 0 ? 1 : 0);
    const cls = hits >= 3 ? "FULLY_GROUNDED"
              : hits === 2 ? "DUAL_GROUNDED"
              : hits === 1 ? "SINGLE_LINKED"
              : "BARE";
    return { ...t, _cls: cls, _annMatches: annMatches, _opsMatches: opsMatches, _kbMatches: kbMatches, _kws: kws };
  });

  const counts = {
    FULLY_GROUNDED: classified.filter(t => t._cls === "FULLY_GROUNDED").length,
    DUAL_GROUNDED:  classified.filter(t => t._cls === "DUAL_GROUNDED").length,
    SINGLE_LINKED:  classified.filter(t => t._cls === "SINGLE_LINKED").length,
    BARE:           classified.filter(t => t._cls === "BARE").length,
  };
  const total  = classified.length;
  const pct    = total ? Math.round(((counts.FULLY_GROUNDED + counts.DUAL_GROUNDED) / total) * 100) : 0;

  const visible = classified.filter(t => {
    if (filter !== "ALL" && t._cls !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      const name = (t.name || t.title || "").toLowerCase();
      const desc = (t.description || "").toLowerCase();
      if (!name.includes(s) && !desc.includes(s)) return false;
    }
    return true;
  });

  async function assess() {
    setAssessing(true); setBrief("");
    const base    = apiBase();
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
    const ctx = `TGOKNEX: ${total} tasks analysed. FULLY_GROUNDED=${counts.FULLY_GROUNDED}, DUAL_GROUNDED=${counts.DUAL_GROUNDED}, SINGLE_LINKED=${counts.SINGLE_LINKED}, BARE=${counts.BARE}. ${counts.BARE} tasks lack any graph annotation, ops event, or KB grounding. Summarise the key operational intelligence gap in 2 sentences.`;
    try {
      const r   = await fetch(`${base}/v1/jarvis/agent/chat`, { method: "POST", headers, body: JSON.stringify({ message: ctx }) });
      const d   = await r.json();
      const txt = (d.answer || "").trim();
      setBrief(txt);
      // TTS
      await fetch(`${base}/v1/voice/tts`, { method: "POST", headers, body: JSON.stringify({ text: txt }) })
        .then(async tr => { if (tr.ok) { const ab = await tr.arrayBuffer(); new Audio(URL.createObjectURL(new Blob([ab], { type: "audio/mpeg" }))).play(); } })
        .catch(() => {});
    } catch { setBrief("Unable to reach assessment engine."); }
    setAssessing(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Task × Graph Annotations × Ops Event × Knowledge Nexus (TGOKNEX)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: "rgba(6,11,22,0.84)", border: `1px solid ${AM}55`,
          color: AM, fontFamily: FONT, fontSize: 10, letterSpacing: 1,
          padding: "3px 8px", borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        ◈ TGOKNEX
        {counts.BARE > 0 && (
          <span style={{
            marginLeft: 5, background: AM, color: "#000", borderRadius: 8,
            padding: "0 5px", fontSize: 9, fontWeight: 700,
          }}>{counts.BARE}</span>
        )}
      </button>
    );
  }

  // ── expanded panel ────────────────────────────────────────────────────────
  return (
    <div style={{
      position: "fixed", left: 8, bottom: 50, zIndex: Z_INDEX + 100,
      width: "min(860px,96vw)", maxHeight: "82vh", overflow: "hidden",
      display: "flex", flexDirection: "column",
      background: BG, border: `1px solid ${BORDER}`,
      borderRadius: 12, fontFamily: FONT, color: "#DCEBF5",
      boxShadow: `0 0 60px ${CY}18`,
    }}>

      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
        borderBottom: `1px solid ${BORDER}`, flexWrap: "wrap" }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ TGOKNEX</span>
        <span style={{ color: DIM, fontSize: 10 }}>Task × Graph Annot. × Ops × Knowledge Nexus</span>
        {loading && <span style={{ color: CY, fontSize: 10, marginLeft: "auto" }}>loading…</span>}
        {error   && <span style={{ color: OR,  fontSize: 10, marginLeft: "auto" }}>{error}</span>}
        <button onClick={() => setOpen(false)}
          style={{ marginLeft: "auto", background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 14px", flexWrap: "wrap" }}>
        {[
          ["TASKS",           total,                  CY],
          ["ANNOTATIONS",     annotations.length,     PU],
          ["OPS EVENTS",      opsEvents.length,       BL],
          ["KB ARTICLES",     kb.length,              GR],
          ["FULLY GROUNDED",  counts.FULLY_GROUNDED,  GR],
          ["DUAL GROUNDED",   counts.DUAL_GROUNDED,   CY],
          ["SINGLE LINKED",   counts.SINGLE_LINKED,   AM],
          ["BARE",            counts.BARE,             OR],
        ].map(([lbl, val, col]) => (
          <div key={lbl} style={{
            background: "rgba(0,207,255,0.04)", border: `1px solid ${col}33`,
            borderRadius: 6, padding: "4px 10px", textAlign: "center", minWidth: 80,
          }}>
            <div style={{ color: col, fontSize: 14, fontWeight: 700 }}>{val}</div>
            <div style={{ color: DIM, fontSize: 8, letterSpacing: 1 }}>{lbl}</div>
          </div>
        ))}
        <div style={{
          background: "rgba(0,207,255,0.04)", border: `1px solid ${GR}33`,
          borderRadius: 6, padding: "4px 10px", textAlign: "center", minWidth: 80,
        }}>
          <div style={{ color: GR, fontSize: 14, fontWeight: 700 }}>{pct}%</div>
          <div style={{ color: DIM, fontSize: 8, letterSpacing: 1 }}>DUAL+ COV.</div>
        </div>
      </div>

      {/* coverage bar */}
      <div style={{ padding: "0 14px 8px" }}>
        <div style={{ height: 4, background: "#0F1929", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg,${GR},${CY})`, transition: "width 0.6s" }} />
        </div>
      </div>

      {/* filter + search */}
      <div style={{ display: "flex", gap: 6, padding: "0 14px 8px", flexWrap: "wrap", alignItems: "center" }}>
        {["ALL","FULLY_GROUNDED","DUAL_GROUNDED","SINGLE_LINKED","BARE"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? CY : "rgba(0,207,255,0.07)",
            color: filter === f ? "#04060A" : DIM,
            border: `1px solid ${CY}33`, borderRadius: 4, fontSize: 9,
            padding: "2px 8px", cursor: "pointer", letterSpacing: 1,
          }}>{f.replace(/_/g," ")}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search tasks…"
          style={{ marginLeft: "auto", background: "rgba(0,207,255,0.07)", border: `1px solid ${CY}33`,
            color: "#DCEBF5", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontFamily: FONT, width: 160 }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 8px" }}>
        {visible.length === 0 && (
          <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: "20px 0" }}>
            {loading ? "Loading…" : "No tasks match."}
          </div>
        )}
        {visible.map((t, i) => {
          const id    = t.id || t._id || i;
          const name  = t.name || t.title || `Task ${id}`;
          const isExp = expanded === id;
          const col   = CLASS_COLOUR[t._cls] || DIM;
          return (
            <div key={id} style={{ marginBottom: 4, borderRadius: 6,
              border: `1px solid ${col}33`, overflow: "hidden" }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
                  cursor: "pointer", background: "rgba(0,207,255,0.03)" }}>
                <span style={{ color: col, fontSize: 9, minWidth: 80, letterSpacing: 1 }}>{t._cls.replace(/_/g," ")}</span>
                <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>{name}</span>
                {t.status && <span style={{ color: DIM, fontSize: 9 }}>{t.status}</span>}
                <span style={{ color: DIM, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ padding: "8px 12px", borderTop: `1px solid ${col}22`,
                  background: "rgba(0,0,0,0.18)", display: "flex", gap: 12, flexWrap: "wrap" }}>

                  {/* annotations */}
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ color: PU, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                      GRAPH ANNOTATIONS ({t._annMatches.length})
                    </div>
                    {t._annMatches.length === 0
                      ? <div style={{ color: DIM, fontSize: 10 }}>No annotation match</div>
                      : t._annMatches.slice(0,4).map((a, ai) => {
                          const s = relevanceScore(t._kws, a, ["title","text","label","entity","tags"]);
                          return (
                            <div key={ai} style={{ marginBottom: 3, padding: "3px 6px",
                              background: "rgba(168,85,247,0.08)", borderRadius: 4,
                              border: `1px solid ${PU}33` }}>
                              <div style={{ color: "#E9D5FF", fontSize: 10 }}>{a.title || a.label || a.entity || "Annotation"}</div>
                              <div style={{ height: 3, background: "#1F2937", borderRadius: 2, marginTop: 3 }}>
                                <div style={{ height: "100%", width: `${s * 10}%`, background: PU, borderRadius: 2 }} />
                              </div>
                            </div>
                          );
                        })}
                  </div>

                  {/* ops events */}
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ color: BL, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                      OPS EVENTS ({t._opsMatches.length})
                    </div>
                    {t._opsMatches.length === 0
                      ? <div style={{ color: DIM, fontSize: 10 }}>No ops match</div>
                      : t._opsMatches.slice(0,4).map((e, ei) => {
                          const s = relevanceScore(t._kws, e, ["title","description","type","severity","tags"]);
                          return (
                            <div key={ei} style={{ marginBottom: 3, padding: "3px 6px",
                              background: "rgba(59,130,246,0.08)", borderRadius: 4,
                              border: `1px solid ${BL}33` }}>
                              <div style={{ color: "#BFDBFE", fontSize: 10 }}>{e.title || e.name || e.type || "Ops Event"}</div>
                              <div style={{ height: 3, background: "#1F2937", borderRadius: 2, marginTop: 3 }}>
                                <div style={{ height: "100%", width: `${s * 10}%`, background: BL, borderRadius: 2 }} />
                              </div>
                            </div>
                          );
                        })}
                  </div>

                  {/* kb articles */}
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ color: GR, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                      KB ARTICLES ({t._kbMatches.length})
                    </div>
                    {t._kbMatches.length === 0
                      ? <div style={{ color: DIM, fontSize: 10 }}>No KB match</div>
                      : t._kbMatches.slice(0,4).map((k, ki) => {
                          const s = relevanceScore(t._kws, k, ["title","content","summary","tags","category"]);
                          return (
                            <div key={ki} style={{ marginBottom: 3, padding: "3px 6px",
                              background: "rgba(34,197,94,0.08)", borderRadius: 4,
                              border: `1px solid ${GR}33` }}>
                              <div style={{ color: "#BBF7D0", fontSize: 10 }}>{k.title || k.name || "KB Article"}</div>
                              <div style={{ height: 3, background: "#1F2937", borderRadius: 2, marginTop: 3 }}>
                                <div style={{ height: "100%", width: `${s * 10}%`, background: GR, borderRadius: 2 }} />
                              </div>
                            </div>
                          );
                        })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{ padding: "8px 14px", borderTop: `1px solid ${BORDER}`, display: "flex",
        alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? DIM : CY, color: assessing ? "#222" : "#04060A",
          border: "none", borderRadius: 5, padding: "5px 14px",
          fontFamily: FONT, fontSize: 10, cursor: assessing ? "not-allowed" : "pointer",
          letterSpacing: 1, fontWeight: 700,
        }}>
          {assessing ? "◍ ASSESSING…" : "▶ ASSESS NEXUS"}
        </button>
        {brief && <div style={{ color: "#DCEBF5", fontSize: 10, flex: 1, lineHeight: 1.5 }}>{brief}</div>}
      </div>
    </div>
  );
}
