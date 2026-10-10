/**
 * F195 — Report × Graph Node × Contact — Intelligence Publication Network (IPNET)
 *
 * Parallel-fetches /v1/reports + /v1/graph/centrality + /entities/Contact every 90 s.
 * Keyword-correlates each report against the graph node catalog AND the contacts roster:
 *
 *   FULLY_MAPPED   — graph node + contact coverage exist (report is fully anchored)
 *   GRAPH_LINKED   — graph node reference found, no contact linkage
 *   CONTACT_LINKED — contact reference found, no graph node
 *   DARK           — neither graph node nor contact match (unanchored intelligence)
 *
 * Stat tiles: reports / nodes / contacts / fully mapped / dark
 * Filter tabs: ALL | FULLY_MAPPED | GRAPH_LINKED | CONTACT_LINKED | DARK
 * Text search on report title/type/status.
 * Expand row → matched graph nodes (cyan bars) + matched contacts (green bars).
 * Red badge + pulse on DARK count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 *
 * Toggle:  ◈ IPNET  at bottom:8 left:987140, zIndex:696.
 * Event:   jarvis:ipnet-toggle
 * Voice:   "ipnet / intel network / report graph / report contact / publication network / intelligence network"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const BTN_LEFT = 987_140;
const POLL_MS  = 90_000;
const GREEN    = "#00FF88";
const AMBER    = "#FFB020";
const CY       = "#29E7FF";
const RED      = "#FF4545";
const MONO     = "'JetBrains Mono',monospace";

const API_KEY =
  (typeof window !== "undefined" && window.__JARVIS_API_KEY__) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function apiBase() {
  if (typeof window !== "undefined" && window.__JARVIS_API_BASE__) return window.__JARVIS_API_BASE__;
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    return `${window.location.protocol}//${window.location.hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── Exported intent helpers ───────────────────────────────────────────────────

const IPNET_RE =
  /\b(ipnet|intel(?:ligence)?\s+(?:pub(?:lication)?\s+)?network|report\s+graph|report\s+contact(?:s)?|publication\s+network|intelligence\s+network|report\s+network)\b/i;

export function isIpnetQuery(q) {
  return IPNET_RE.test(q || "");
}

function toArr(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  const keys = ["reports","nodes","contacts","items","data","results","records","centrality"];
  for (const k of keys) if (Array.isArray(v[k])) return v[k];
  return [];
}

function keywords(obj) {
  if (!obj) return [];
  const raw = [
    obj.name, obj.title, obj.type, obj.category,
    obj.description, obj.summary, obj.tags, obj.status,
    obj.label, obj.entity_type, obj.node_id, obj.id,
  ].filter(Boolean).join(" ").toLowerCase();
  return raw.split(/[\s,;|_/.-]+/).filter(w => w.length > 2);
}

function matchKws(kws, obj) {
  if (!kws.length) return false;
  const hay = [
    obj.name, obj.title, obj.type, obj.description, obj.summary,
    obj.tags, obj.status, obj.category, obj.label, obj.entity_type,
    obj.node_id, obj.email, obj.role, obj.organization,
  ].filter(Boolean).join(" ").toLowerCase();
  return kws.some(k => hay.includes(k));
}

export async function buildIpnetScript() {
  const base = apiBase();
  const h = { Authorization: `Bearer ${API_KEY}` };
  try {
    const [rpR, grR, ctR] = await Promise.allSettled([
      fetch(`${base}/v1/reports`,            { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/v1/graph/centrality`,   { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/entities/Contact`,      { headers: h }).then(r => r.ok ? r.json() : []),
    ]);
    const reports  = toArr(rpR.value);
    const nodes    = toArr(grR.value);
    const contacts = toArr(ctR.value);
    let dark = 0;

    for (const rep of reports) {
      const kws = keywords(rep);
      const hasNode    = nodes.some(n => matchKws(kws, n));
      const hasContact = contacts.some(c => matchKws(kws, c));
      if (!hasNode && !hasContact) dark++;
    }

    window.dispatchEvent(new CustomEvent("jarvis:ipnet-toggle"));
    return `IPNET analysis: ${reports.length} report${reports.length !== 1 ? "s" : ""} cross-referenced against ` +
      `${nodes.length} graph node${nodes.length !== 1 ? "s" : ""} × ${contacts.length} contact${contacts.length !== 1 ? "s" : ""}. ` +
      `${dark} report${dark !== 1 ? "s are" : " is"} dark — no graph node or contact anchor found. ` +
      `Recommend linking unanchored intelligence to graph entities and responsible contacts.`;
  } catch (e) {
    window.dispatchEvent(new CustomEvent("jarvis:ipnet-toggle"));
    return `IPNET panel open, sir. Error: ${e.message}`;
  }
}

// ── Classification helpers ────────────────────────────────────────────────────

const CLASS_COLOR = {
  FULLY_MAPPED:   GREEN,
  GRAPH_LINKED:   CY,
  CONTACT_LINKED: AMBER,
  DARK:           RED,
};

function classify(rep, nodes, contacts) {
  const kws = keywords(rep);
  const hasNode    = nodes.some(n => matchKws(kws, n));
  const hasContact = contacts.some(c => matchKws(kws, c));
  if (hasNode && hasContact)  return "FULLY_MAPPED";
  if (hasNode && !hasContact) return "GRAPH_LINKED";
  if (!hasNode && hasContact) return "CONTACT_LINKED";
  return "DARK";
}

function topMatches(kws, pool, n = 4) {
  return pool
    .map(obj => {
      const hay = [
        obj.name, obj.title, obj.type, obj.description, obj.summary,
        obj.tags, obj.status, obj.category, obj.label, obj.entity_type,
        obj.node_id, obj.email, obj.role, obj.organization,
      ].filter(Boolean).join(" ").toLowerCase();
      const score = kws.filter(k => hay.includes(k)).length;
      return { obj, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(x => x.obj);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReportGraphContactNetwork() {
  const [open,     setOpen]     = useState(false);
  const [rows,     setRows]     = useState([]);
  const [reports,  setReports]  = useState([]);
  const [nodes,    setNodes]    = useState([]);
  const [contacts, setContacts] = useState([]);
  const [filter,   setFilter]   = useState("ALL");
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing,setAssessing]= useState(null);
  const [assessTxt,setAssessTxt]= useState({});
  const [loading,  setLoading]  = useState(false);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const base = apiBase();
    const h = { Authorization: `Bearer ${API_KEY}` };
    try {
      const [rpR, grR, ctR] = await Promise.allSettled([
        fetch(`${base}/v1/reports`,          { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/v1/graph/centrality`, { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/entities/Contact`,    { headers: h }).then(r => r.ok ? r.json() : []),
      ]);
      const reps  = toArr(rpR.value);
      const nds   = toArr(grR.value);
      const cts   = toArr(ctR.value);
      setReports(reps);
      setNodes(nds);
      setContacts(cts);
      setRows(reps.map(rep => ({ rep, cls: classify(rep, nds, cts) })));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => {
      const next = !o;
      if (next) load();
      return next;
    });
    window.addEventListener("jarvis:ipnet-toggle", toggle);
    return () => window.removeEventListener("jarvis:ipnet-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (open) {
      pollRef.current = setInterval(load, POLL_MS);
    } else {
      clearInterval(pollRef.current);
    }
    return () => clearInterval(pollRef.current);
  }, [open, load]);

  const handleAssess = useCallback(async (rep) => {
    const key = rep.id || rep.title || JSON.stringify(rep).slice(0, 32);
    setAssessing(key);
    try {
      const base = apiBase();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message: `Assess the graph and contact anchoring for this intelligence report: ${JSON.stringify(rep)}. ` +
            `Identify what graph nodes and contacts should link to it. Respond in 2 sentences.`,
        }),
      });
      const d = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssessTxt(prev => ({ ...prev, [key]: txt }));
      if (txt && window.speechSynthesis) {
        const u = new SpeechSynthesisUtterance(txt);
        u.rate = 1.0; u.pitch = 0.85;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      }
    } catch {
      setAssessTxt(prev => ({ ...prev, [key]: "Assessment unavailable." }));
    } finally {
      setAssessing(null);
    }
  }, []);

  const TABS = ["ALL", "FULLY_MAPPED", "GRAPH_LINKED", "CONTACT_LINKED", "DARK"];
  const counts = Object.fromEntries(TABS.map(t => [t, t === "ALL" ? rows.length : rows.filter(r => r.cls === t).length]));
  const darkCount = counts["DARK"] || 0;

  const filtered = rows.filter(({ rep, cls }) => {
    if (filter !== "ALL" && cls !== filter) return false;
    if (!search) return true;
    const hay = [rep.title, rep.name, rep.type, rep.status, rep.category, rep.description]
      .filter(Boolean).join(" ").toLowerCase();
    return hay.includes(search.toLowerCase());
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Intelligence Publication Network (IPNET)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 696,
          fontFamily: MONO, fontSize: 9, letterSpacing: 1,
          background: "#0A1525E8", border: `1px solid ${RED}55`,
          color: RED, borderRadius: 4, padding: "3px 7px",
          cursor: "pointer", userSelect: "none",
          boxShadow: darkCount > 0 ? `0 0 6px ${RED}66` : "none",
          animation: darkCount > 0 ? "ipnet-pulse 2s ease-in-out infinite" : "none",
        }}
      >
        <style>{`@keyframes ipnet-pulse{0%,100%{opacity:1}50%{opacity:.55}}`}</style>
        ◈ IPNET{darkCount > 0 ? ` [${darkCount}]` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 8, left: BTN_LEFT - 460, zIndex: 696,
      width: 520, maxHeight: "74vh", display: "flex", flexDirection: "column",
      background: "#080F1CF2", border: `1px solid ${RED}44`,
      borderRadius: 8, fontFamily: MONO, fontSize: 11,
      boxShadow: `0 0 24px ${RED}22`,
      backdropFilter: "blur(12px)",
    }}>
      {/* header */}
      <div style={{
        padding: "8px 14px", borderBottom: `1px solid ${RED}28`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ color: RED, letterSpacing: 2, fontSize: 10 }}>
          ◈ INTELLIGENCE PUBLICATION NETWORK
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {loading && <span style={{ color: "#3E5060", fontSize: 9 }}>LOADING…</span>}
          <button onClick={load} style={{ background: "none", border: `1px solid ${RED}33`, color: RED, borderRadius: 3, padding: "2px 6px", cursor: "pointer", fontSize: 9 }}>↻</button>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#3E5060", cursor: "pointer", fontSize: 13, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", flexWrap: "wrap" }}>
        {[
          { label: "REPORTS",      val: reports.length,              color: AMBER },
          { label: "GRAPH NODES",  val: nodes.length,                color: CY   },
          { label: "CONTACTS",     val: contacts.length,             color: GREEN },
          { label: "FULLY MAPPED", val: counts["FULLY_MAPPED"] || 0, color: GREEN },
          { label: "DARK",         val: darkCount, color: RED, pulse: darkCount > 0 },
        ].map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            flex: "1 1 80px", background: "#0B1420", border: `1px solid ${color}33`,
            borderRadius: 5, padding: "5px 8px", textAlign: "center",
            boxShadow: pulse ? `0 0 8px ${color}44` : "none",
          }}>
            <div style={{ color, fontSize: 14, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#2E4060", fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* search */}
      <div style={{ padding: "0 14px 6px" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search reports…"
          style={{
            width: "100%", background: "#0B1420", border: `1px solid ${RED}33`,
            color: "#A0C0D0", borderRadius: 4, padding: "4px 8px",
            fontFamily: MONO, fontSize: 10, outline: "none", boxSizing: "border-box",
          }}
        />
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 14px 8px", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setFilter(t)} style={{
            fontFamily: MONO, fontSize: 8, letterSpacing: 1,
            background: filter === t ? `${CLASS_COLOR[t] || RED}22` : "transparent",
            border: `1px solid ${filter === t ? (CLASS_COLOR[t] || RED) : "#1E3040"}`,
            color: filter === t ? (CLASS_COLOR[t] || RED) : "#3E5060",
            borderRadius: 3, padding: "2px 6px", cursor: "pointer",
          }}>
            {t} ({counts[t] || 0})
          </button>
        ))}
      </div>

      {/* rows */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 14px 8px" }}>
        {filtered.length === 0 && (
          <div style={{ color: "#2E4060", fontSize: 10, textAlign: "center", padding: "16px 0" }}>
            {loading ? "Fetching intelligence reports…" : "No reports match filter."}
          </div>
        )}
        {filtered.map(({ rep, cls }, i) => {
          const key = rep.id || rep.title || String(i);
          const kws = keywords(rep);
          const matchedNodes    = topMatches(kws, nodes, 4);
          const matchedContacts = topMatches(kws, contacts, 4);
          const clrC  = CLASS_COLOR[cls] || RED;
          const isExp = expanded === key;
          const aKey  = rep.id || rep.title || key;

          return (
            <div key={key} style={{
              marginBottom: 5, borderRadius: 5,
              border: `1px solid ${isExp ? clrC + "55" : "#1A2A3A"}`,
              background: isExp ? "#0C1520" : "transparent",
            }}>
              <div
                onClick={() => setExpanded(isExp ? null : key)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 10px", cursor: "pointer",
                }}
              >
                <span style={{
                  fontSize: 8, letterSpacing: 1, color: clrC,
                  border: `1px solid ${clrC}55`, borderRadius: 3,
                  padding: "1px 5px", whiteSpace: "nowrap", flexShrink: 0,
                }}>
                  {cls}
                </span>
                <span style={{ color: "#A0C0D0", flex: 1, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {rep.title || rep.name || key}
                </span>
                {rep.type && (
                  <span style={{ color: "#2E4060", fontSize: 8, flexShrink: 0 }}>{rep.type}</span>
                )}
                <span style={{ color: "#2E4060", fontSize: 9 }}>{isExp ? "▴" : "▾"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "0 10px 10px", borderTop: `1px solid #1A2A3A` }}>
                  {/* graph node matches */}
                  <div style={{ color: "#3E5060", fontSize: 8, letterSpacing: 1, margin: "6px 0 4px" }}>
                    GRAPH NODES ({matchedNodes.length})
                  </div>
                  {matchedNodes.length > 0 ? matchedNodes.map((n, ni) => (
                    <div key={ni} style={{ marginBottom: 3 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9 }}>
                        <span style={{ color: CY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "75%" }}>
                          {n.name || n.label || n.node_id || n.title || `node-${ni + 1}`}
                        </span>
                        <span style={{ color: "#2E4060", fontSize: 8, flexShrink: 0 }}>{n.entity_type || n.type || ""}</span>
                      </div>
                      <div style={{ height: 3, background: "#0B1420", borderRadius: 2, marginTop: 2 }}>
                        <div style={{ height: "100%", width: `${Math.min(100, 40 + (kws.filter(k => JSON.stringify(n).toLowerCase().includes(k)).length * 15))}%`, background: CY, borderRadius: 2 }} />
                      </div>
                    </div>
                  )) : (
                    <div style={{ color: "#2E4060", fontSize: 9, marginBottom: 4 }}>No graph node matches.</div>
                  )}

                  {/* contact matches */}
                  <div style={{ color: "#3E5060", fontSize: 8, letterSpacing: 1, margin: "6px 0 4px" }}>
                    CONTACTS ({matchedContacts.length})
                  </div>
                  {matchedContacts.length > 0 ? matchedContacts.map((c, ci) => (
                    <div key={ci} style={{ marginBottom: 3 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9 }}>
                        <span style={{ color: GREEN, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "75%" }}>
                          {c.name || c.title || c.email || `contact-${ci + 1}`}
                        </span>
                        <span style={{ color: "#2E4060", fontSize: 8, flexShrink: 0 }}>{c.role || c.organization || c.type || ""}</span>
                      </div>
                      <div style={{ height: 3, background: "#0B1420", borderRadius: 2, marginTop: 2 }}>
                        <div style={{ height: "100%", width: `${Math.min(100, 40 + (kws.filter(k => JSON.stringify(c).toLowerCase().includes(k)).length * 15))}%`, background: GREEN, borderRadius: 2 }} />
                      </div>
                    </div>
                  )) : (
                    <div style={{ color: "#2E4060", fontSize: 9, marginBottom: 4 }}>No contact matches.</div>
                  )}

                  {/* ASSESS */}
                  <button
                    onClick={e => { e.stopPropagation(); handleAssess(rep); }}
                    disabled={assessing === aKey}
                    style={{
                      fontFamily: MONO, fontSize: 9, letterSpacing: 1,
                      background: `${RED}18`, border: `1px solid ${RED}44`,
                      color: RED, borderRadius: 4, padding: "3px 8px",
                      cursor: assessing === aKey ? "wait" : "pointer", marginTop: 6,
                    }}
                  >
                    {assessing === aKey ? "ASSESSING…" : "▶ ASSESS"}
                  </button>

                  {assessTxt[aKey] && (
                    <div style={{
                      marginTop: 6, padding: "6px 8px",
                      background: `${RED}0A`, border: `1px solid ${RED}22`,
                      borderRadius: 4, color: "#A0C0D0", fontSize: 10, lineHeight: 1.5,
                    }}>
                      {assessTxt[aKey]}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{
        padding: "6px 14px", borderTop: `1px solid ${RED}18`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ color: "#2E4060", fontSize: 9, letterSpacing: 1 }}>
          {filtered.length}/{rows.length} REPORTS · AUTO-REFRESH 90s
        </span>
        <button
          onClick={load}
          style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: 1,
            background: "none", border: `1px solid ${RED}33`,
            color: RED, borderRadius: 3, padding: "2px 7px", cursor: "pointer",
          }}
        >
          ↻ SYNC
        </button>
      </div>
    </div>
  );
}
