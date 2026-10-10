/**
 * KnowledgeGraphCentralityNexus — F715
 *
 * Polls /knowledge/ × /v1/graph/centrality every 90 s.
 * Keyword cross-reference classifies knowledge articles as:
 *   GRAPH-GROUNDED — ≥1 centrality node keyword-match (title/label/type)
 *   UNGROUNDED     — no graph node backing
 *
 * Voice: "knogph" | "knowledge graph" | "graph knowledge"
 *        | "knowledge grounded" | "graph grounded articles"
 *        | "knowledge centrality" | "graph backed knowledge"
 * Strip button: ◈ KNOGPH   left:890920  bottom:8  zIndex:250
 * Custom event: jarvis:knogph-toggle
 *
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFB347";
const RED = "#e8203c";
const PRP = "#a78bfa";
const DIM = "#566878";
const POLL = 90_000;
const BTN_LEFT = 890920;
const ZIDX = 250;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const KNOGPH_RE =
  /\b(knogph|knowledge[.\s-]*graph|graph[.\s-]*knowledge|knowledge[.\s-]*grounded|graph[.\s-]*grounded[.\s-]*articles?|knowledge[.\s-]*centrality|graph[.\s-]*backed[.\s-]*knowledge)\b/i;

export function isKnogphQuery(q) {
  return KNOGPH_RE.test(q || "");
}

export async function buildKnogphScript() {
  try {
    const [kr, gr] = await Promise.all([
      fetch(`${apiBase()}/knowledge/`,            { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/v1/graph/centrality`,   { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const kd = kr.ok ? await kr.json() : {};
    const gd = gr.ok ? await gr.json() : {};

    const articles = Array.isArray(kd) ? kd : (kd?.results ?? kd?.articles ?? []);
    const nodes    = Array.isArray(gd) ? gd : (gd?.results ?? gd?.nodes ?? []);

    if (!articles.length)
      return "Knowledge article data is unavailable at present, sir.";

    const nodeTokens = new Set(
      nodes.flatMap(n =>
        `${n.label||""} ${n.title||""} ${n.type||""} ${n.name||""}`
          .toLowerCase().split(/\W+/).filter(t => t.length > 3)
      )
    );

    let grounded = 0, ungrounded = 0;
    for (const a of articles) {
      const words = `${a.title||""} ${a.summary||""} ${a.category||""} ${a.kind||""}`
        .toLowerCase().split(/\W+/).filter(w => w.length > 3);
      if (words.some(w => nodeTokens.has(w))) grounded++;
      else ungrounded++;
    }

    const pct = articles.length
      ? Math.round((grounded / articles.length) * 100) : 0;

    const brief = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Knowledge × Graph Centrality Nexus: ${articles.length} knowledge articles cross-referenced against ${nodes.length} graph centrality nodes. ${grounded} articles (${pct}%) are graph-grounded. ${ungrounded} have no graph node backing. Provide a 2-sentence knowledge graph coverage assessment.`,
      }),
    }).then(r => r.ok ? r.json() : null).then(d => d?.response || d?.reply || "").catch(() => "");

    return (
      `Knowledge Graph Centrality Nexus, sir. ${articles.length} articles evaluated against ${nodes.length} graph nodes. ` +
      `${grounded} (${pct}%) are graph-grounded. ${ungrounded} articles have no graph centrality backing. ` +
      (brief || "")
    ).trim();
  } catch {
    return "I was unable to retrieve the knowledge graph centrality nexus at this time, sir.";
  }
}

const PANEL = {
  position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)",
  zIndex: ZIDX + 10, width: "min(600px,95vw)",
  background: "rgba(4,8,14,0.94)", border: `1px solid ${CY}44`, borderRadius: 12,
  backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
  boxShadow: `0 0 48px ${CY}18`, fontFamily: "'JetBrains Mono',monospace",
  color: "#DCEBF5", overflow: "hidden",
};
const HDR = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
  background: "rgba(41,231,255,0.05)",
};

function kw(str) {
  return str.toLowerCase().split(/\W+/).filter(t => t.length > 3);
}

function nodeTypeColor(type) {
  if (!type) return DIM;
  const t = type.toUpperCase();
  if (t.includes("PERSON") || t.includes("CONTACT")) return CY;
  if (t.includes("RISK") || t.includes("THREAT"))    return RED;
  if (t.includes("INVEST"))                          return GRN;
  if (t.includes("TASK") || t.includes("JOB"))      return AMB;
  return PRP;
}

export default function KnowledgeGraphCentralityNexus() {
  const [open, setOpen]       = useState(false);
  const [articles, setArticles] = useState([]);
  const [nodes,    setNodes]    = useState([]);
  const [loading,  setLoad]     = useState(false);
  const [err,      setErr]      = useState(null);
  const [tab,      setTab]      = useState("ALL");
  const [q,        setQ]        = useState("");
  const [expanded, setExp]      = useState(null);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoad(true); setErr(null);
    try {
      const [kr, gr] = await Promise.all([
        fetch(`${apiBase()}/knowledge/`,           { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${apiBase()}/v1/graph/centrality`,  { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const kd = kr.ok ? await kr.json() : {};
      setArticles(Array.isArray(kd) ? kd : (kd?.results ?? kd?.articles ?? []));
      const gd = gr.ok ? await gr.json() : {};
      setNodes(Array.isArray(gd) ? gd : (gd?.results ?? gd?.nodes ?? []));
    } catch (e) { setErr(e.message); }
    finally { setLoad(false); }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, POLL);
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener("jarvis:knogph-toggle", h);
    return () => window.removeEventListener("jarvis:knogph-toggle", h);
  }, []);

  const nodeTokenSet = new Set(
    nodes.flatMap(n => kw(`${n.label||""} ${n.title||""} ${n.type||""} ${n.name||""}`))
  );

  const enriched = articles.map(a => {
    const words = kw(`${a.title||""} ${a.summary||""} ${a.category||""} ${a.kind||""}`);
    const hits  = words.filter(w => nodeTokenSet.has(w)).length;
    const grounded = hits > 0;
    const matchedNodes = grounded
      ? nodes.filter(n => {
          const nw = new Set(kw(`${n.label||""} ${n.title||""} ${n.type||""} ${n.name||""}`));
          return words.some(w => nw.has(w));
        })
      : [];
    return { ...a, hits, grounded, matchedNodes };
  });

  const groundedItems   = enriched.filter(a => a.grounded);
  const ungroundedItems = enriched.filter(a => !a.grounded);
  const pct = articles.length ? Math.round((groundedItems.length / articles.length) * 100) : 0;

  const TABS = ["ALL", "GRAPH-GROUNDED", "UNGROUNDED"];
  const visible = enriched
    .filter(a => {
      if (tab === "GRAPH-GROUNDED") return a.grounded;
      if (tab === "UNGROUNDED")     return !a.grounded;
      return true;
    })
    .filter(a => !q || (a.title || "").toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Knowledge × Graph Centrality Nexus"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: ZIDX,
          padding: "4px 10px", background: open ? CY : "rgba(5,8,13,0.75)",
          color: open ? "#04060A" : CY, border: `1px solid ${CY}`,
          borderRadius: 6, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 1, cursor: "pointer",
          backdropFilter: "blur(6px)",
        }}
      >
        ◈ KNOGPH
        {ungroundedItems.length > 0 && (
          <span style={{
            marginLeft: 5, background: AMB, color: "#04060A",
            borderRadius: 3, fontSize: 7, padding: "1px 4px", fontWeight: 700,
          }}>{ungroundedItems.length}</span>
        )}
      </button>

      {open && (
        <div style={PANEL}>
          <div style={HDR}>
            <span style={{ color: CY, fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}>
              ◈ Knowledge × Graph Centrality Nexus
            </span>
            <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
              {TABS.map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  fontSize: 7, padding: "2px 6px", borderRadius: 4,
                  border: `1px solid ${tab===t ? CY : "#2a3a4a"}`,
                  background: tab===t ? `${CY}22` : "transparent",
                  color: tab===t ? CY : DIM, cursor: "pointer",
                  fontFamily: "inherit", textTransform: "uppercase", letterSpacing: 1,
                }}>{t.replace("-"," ")}</button>
              ))}
              <button onClick={() => setOpen(false)} style={{
                background:"none", border:"none", color: DIM,
                cursor:"pointer", fontSize:14, marginLeft:4, lineHeight:1,
              }}>×</button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "10px 14px", flexWrap: "wrap" }}>
            {[
              ["ARTICLES",      articles.length,           CY],
              ["NODES",         nodes.length,              PRP],
              ["GRAPH-GROUNDED",groundedItems.length,      GRN],
              ["UNGROUNDED",    ungroundedItems.length,    AMB],
              ["COVERAGE",      `${pct}%`, pct >= 60 ? GRN : pct >= 30 ? AMB : RED],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                flex: "1 1 80px", background: "rgba(41,231,255,0.04)",
                border: `1px solid ${CY}18`, borderRadius: 8, padding: "6px 8px", textAlign:"center",
              }}>
                <div style={{ fontSize: 15, color: col, fontVariantNumeric: "tabular-nums" }}>{val}</div>
                <div style={{ fontSize: 7, color: DIM, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "0 14px 8px" }}>
            <input
              value={q} onChange={e => setQ(e.target.value)}
              placeholder="Filter articles…"
              style={{
                width: "100%", boxSizing: "border-box", background: "rgba(41,231,255,0.04)",
                border: `1px solid ${CY}22`, borderRadius: 6, color: "#DCEBF5",
                fontFamily: "inherit", fontSize: 10, padding: "5px 9px", outline: "none",
              }}
            />
          </div>

          {/* List */}
          <div style={{ padding: "0 14px 10px", maxHeight: 300, overflowY: "auto" }}>
            {loading && !articles.length && (
              <div style={{ color: DIM, fontSize: 10 }}>◌ Loading…</div>
            )}
            {err && <div style={{ color: RED, fontSize: 10 }}>⚠ {err}</div>}
            {visible.map((a, i) => (
              <div key={a.id || i}>
                <div
                  onClick={() => setExp(exp => exp === i ? null : i)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "5px 0",
                    borderBottom: "1px solid rgba(41,231,255,0.06)", cursor: "pointer",
                  }}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                    background: a.grounded ? GRN : DIM,
                  }} />
                  <span style={{
                    fontSize: 7, padding: "1px 4px", borderRadius: 3,
                    border: `1px solid ${a.grounded ? GRN : DIM}55`,
                    color: a.grounded ? GRN : DIM,
                    textTransform: "uppercase", letterSpacing: 1, flexShrink: 0,
                  }}>{a.grounded ? "GROUNDED" : "UNGROUNDED"}</span>
                  {a.kind && (
                    <span style={{
                      fontSize: 7, padding: "1px 4px", borderRadius: 3,
                      border: `1px solid ${PRP}44`, color: PRP,
                      textTransform: "uppercase", letterSpacing: 1, flexShrink: 0,
                    }}>{a.kind}</span>
                  )}
                  <span style={{ flex: 1, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.title || a.id || "Unnamed Article"}
                  </span>
                  <span style={{ fontSize: 8, color: DIM, minWidth: 30, textAlign: "right" }}>
                    {a.hits > 0
                      ? <span style={{ color: GRN }}>{a.hits}n</span>
                      : <span style={{ color: DIM }}>—</span>}
                  </span>
                </div>
                {expanded === i && (
                  <div style={{ padding: "6px 10px 6px 18px", background: "rgba(41,231,255,0.03)", borderRadius: 6, marginBottom: 4 }}>
                    {a.summary && (
                      <div style={{ fontSize: 10, color: "#DCEBF5", marginBottom: 6 }}>{a.summary}</div>
                    )}
                    {a.matchedNodes.length > 0 ? (
                      <div>
                        <div style={{ fontSize: 8, color: CY, marginBottom: 3 }}>
                          ⬡ {a.matchedNodes.length} graph node{a.matchedNodes.length !== 1 ? "s" : ""}:
                        </div>
                        {a.matchedNodes.slice(0, 4).map((n, j) => (
                          <div key={j} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            {n.type && (
                              <span style={{
                                fontSize: 7, padding: "1px 5px", borderRadius: 3,
                                border: `1px solid ${nodeTypeColor(n.type)}55`,
                                color: nodeTypeColor(n.type), textTransform: "uppercase", letterSpacing: 1,
                              }}>{n.type}</span>
                            )}
                            <span style={{ fontSize: 9, color: "#DCEBF5" }}>
                              {n.label || n.title || n.name || n.id || "Unknown Node"}
                            </span>
                            {n.score != null && (
                              <span style={{ fontSize: 8, color: DIM, marginLeft: "auto" }}>
                                {n.score.toFixed ? n.score.toFixed(3) : n.score}
                              </span>
                            )}
                          </div>
                        ))}
                        {a.matchedNodes.length > 4 && (
                          <div style={{ fontSize: 8, color: DIM }}>+{a.matchedNodes.length - 4} more</div>
                        )}
                      </div>
                    ) : (
                      <div style={{ fontSize: 9, color: DIM }}>No matching graph centrality nodes</div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {!loading && !err && visible.length === 0 && (
              <div style={{ color: DIM, fontSize: 10 }}>No articles match.</div>
            )}
          </div>

          <div style={{
            padding: "6px 14px", borderTop: `1px solid rgba(41,231,255,0.06)`,
            fontSize: 8, color: DIM, display: "flex", justifyContent: "space-between",
          }}>
            <span>Source: /knowledge/ × /v1/graph/centrality</span>
            <span style={{ color: loading ? AMB : GRN }}>
              {loading ? "◌ updating" : `${visible.length} shown · ${tab.replace("-"," ")}`}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
