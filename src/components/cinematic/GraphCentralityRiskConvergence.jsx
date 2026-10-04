/**
 * F89 — Graph Centrality × Risk Signal Convergence (CNTRKRSK)
 *
 * Parallel-fetches /v1/graph/centrality + /entities/RiskSignal every 90 s.
 * Keyword-correlates each high-influence graph node against active risk
 * signals to classify:
 *   AT_RISK — ≥1 risk signal matches this node (high-influence + active risk)
 *   SECURE  — 0 risk signals match (influence present, no known risk)
 *
 * Stat tiles:  nodes / signals / at-risk / secure
 * Filter tabs: ALL | AT_RISK | SECURE
 * Text search: across node label / type / entity.
 * Expand row → matched risk signal cards with severity + relevance score.
 * Red badge on AT_RISK count.
 * ▶ ASSESS: 2-sentence centrality-risk convergence brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ CNTRKRSK  at left:27480, bottom:8, zIndex:90.
 * Event:   jarvis:cntrkrsk-toggle
 * Voice:   "cntrkrsk" / "centrality risk" / "graph risk convergence" /
 *          "high risk nodes" / "influential risk" / "node risk" /
 *          "risk centrality" / "central risk" / "graph centrality risk"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const RED   = "#FF4560";
const GREEN = "#00c878";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 27480;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise ────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseNodes(raw) {
  return normaliseArray(raw).map((n, i) => ({
    id:         String(n.id ?? n.node_id ?? i),
    label:      n.label ?? n.name ?? n.entity ?? n.entity_id ?? `Node ${i + 1}`,
    type:       n.type ?? n.entity_type ?? null,
    centrality: typeof n.centrality === "number" ? n.centrality
               : typeof n.score     === "number" ? n.score : 0,
    body: [n.label, n.name, n.entity, n.entity_id, n.type, n.entity_type]
            .filter(Boolean).join(" "),
  }));
}

function normaliseSignals(raw) {
  return normaliseArray(raw).map((s, i) => ({
    id:       String(s.id ?? s.signal_id ?? i),
    title:    s.title ?? s.name ?? s.signal ?? `Signal ${i + 1}`,
    category: s.category ?? s.type ?? null,
    severity: typeof s.severity === "number" ? s.severity
            : typeof s.sev      === "number" ? s.sev : 0,
    body: [s.title, s.name, s.signal, s.description, s.category, s.tags]
            .filter(Boolean).join(" "),
  }));
}

// ─── keyword scoring ──────────────────────────────────────────────────────────

function buildKeywords(strings) {
  return strings
    .flatMap(s => String(s).toLowerCase().split(/[^a-z0-9]+/))
    .filter(t => t.length >= 3);
}

function scoreMatch(keywords, haystack) {
  const h = haystack.toLowerCase();
  let hits = 0;
  for (const kw of keywords) if (h.includes(kw)) hits++;
  return hits;
}

// ─── fetch ────────────────────────────────────────────────────────────────────

async function fetchAll() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [nodeRes, sigRes] = await Promise.all([
    fetch(`${base}/v1/graph/centrality`, { headers: hdr }),
    fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
  ]);
  return {
    nodes:   normaliseNodes(nodeRes.ok   ? await nodeRes.json() : []),
    signals: normaliseSignals(sigRes.ok  ? await sigRes.json()  : []),
  };
}

// ─── correlation ──────────────────────────────────────────────────────────────

function correlate(nodes, signals) {
  return nodes.map(node => {
    const kws = buildKeywords([node.label, node.type ?? "", node.body]);
    const matched = signals
      .map(s => ({ s, score: scoreMatch(kws, `${s.title} ${s.body}`) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);
    const cls = matched.length >= 1 ? "AT_RISK" : "SECURE";
    return { ...node, matched, classification: cls };
  });
}

// ─── exported intent helpers ──────────────────────────────────────────────────

const CNTRKRSK_RE =
  /\b(cntrkrsk|centrality[\s_-]?risk|graph[\s_-]?risk[\s_-]?convergence|high[\s_-]?risk[\s_-]?node[s]?|influential[\s_-]?risk|node[\s_-]?risk|risk[\s_-]?centrality|central[\s_-]?risk|graph[\s_-]?centrality[\s_-]?risk|at[\s_-]?risk[\s_-]?node[s]?|risky[\s_-]?node[s]?)\b/i;

export function isCntrkrskQuery(q) { return CNTRKRSK_RE.test(q); }

export async function buildCntrkrskScript() {
  try {
    const { nodes, signals } = await fetchAll();
    const rows    = correlate(nodes, signals);
    const atRisk  = rows.filter(r => r.classification === "AT_RISK").length;
    const secure  = rows.filter(r => r.classification === "SECURE").length;
    const prompt =
      `Graph centrality risk convergence: ${nodes.length} high-influence graph nodes ` +
      `cross-referenced against ${signals.length} active risk signals. ` +
      `${atRisk} nodes are AT_RISK — influential entities that directly overlap with active ` +
      `risk signals — while ${secure} are SECURE with no matching risk signal. ` +
      `In 2 sentences, assess the strategic risk concentration among influential nodes ` +
      `and identify which AT_RISK nodes pose the greatest compounded threat.`;
    const base = apiBase();
    const res  = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body:    JSON.stringify({ message: prompt }),
    });
    const data = await res.json();
    window.dispatchEvent(new CustomEvent("jarvis:cntrkrsk-toggle"));
    return (data.answer || "Graph centrality risk convergence panel is now open, sir.")
      .replace(/<<ACTION:[^>]*>>/g, "").trim();
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:cntrkrsk-toggle"));
    return "Graph centrality risk convergence panel is standing by, sir.";
  }
}

// ─── sub-components ───────────────────────────────────────────────────────────

function ClsBadge({ cls }) {
  const colour = cls === "AT_RISK" ? RED : GREEN;
  return (
    <span style={{
      fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: 1,
      padding: "1px 6px", borderRadius: 3,
      border: `1px solid ${colour}`, color: colour,
    }}>{cls}</span>
  );
}

function SevBar({ sev }) {
  const pct = Math.min(100, Math.round((sev / 100) * 100));
  const colour = sev >= 75 ? RED : sev >= 40 ? "#F5A623" : GREEN;
  return (
    <div style={{ height: 3, background: "#0d1927", borderRadius: 2, marginTop: 3 }}>
      <div style={{ height: 3, width: `${pct}%`, borderRadius: 2, background: colour }} />
    </div>
  );
}

function RelevanceBar({ score, max }) {
  const pct = max > 0 ? Math.min(100, Math.round((score / max) * 100)) : 0;
  return (
    <div style={{ height: 3, background: "#0d1927", borderRadius: 2, marginTop: 3 }}>
      <div style={{ height: 3, width: `${pct}%`, borderRadius: 2, background: CY }} />
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function GraphCentralityRiskConvergence() {
  const [open,      setOpen]      = useState(false);
  const [nodes,     setNodes]     = useState([]);
  const [signals,   setSignals]   = useState([]);
  const [rows,      setRows]      = useState([]);
  const [tab,       setTab]       = useState("ALL");
  const [q,         setQ]         = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { nodes: n, signals: s } = await fetchAll();
      setNodes(n);
      setSignals(s);
      setRows(correlate(n, s));
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:cntrkrsk-toggle", handler);
    return () => window.removeEventListener("jarvis:cntrkrsk-toggle", handler);
  }, []);

  const atRisk = rows.filter(r => r.classification === "AT_RISK").length;
  const secure = rows.filter(r => r.classification === "SECURE").length;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r.classification !== tab) return false;
    if (q) {
      const lq = q.toLowerCase();
      return (r.label + (r.type ?? "")).toLowerCase().includes(lq);
    }
    return true;
  });

  const maxScore = Math.max(1, ...rows.flatMap(r => r.matched.map(m => m.score)));

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildCntrkrskScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch { /* silent */ }
    setAssessing(false);
  }

  const TABS = ["ALL", "AT_RISK", "SECURE"];
  const TAB_COLOUR = { AT_RISK: RED, SECURE: GREEN, ALL: CY };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Graph Centrality × Risk Signal Convergence"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 90,
          fontFamily: MONO, fontSize: 10, letterSpacing: 1,
          padding: "3px 8px", borderRadius: 4, cursor: "pointer",
          border: `1px solid ${atRisk > 0 ? RED : MUTED}`,
          color: atRisk > 0 ? RED : MUTED,
          background: "rgba(4,7,14,0.7)",
          whiteSpace: "nowrap",
        }}
      >
        ◈ CNTRKRSK{atRisk > 0 && <span style={{ marginLeft: 5, color: RED }}>({atRisk})</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, left: 220, zIndex: 90,
      width: "min(680px,92vw)", maxHeight: "82vh",
      background: BG, border: `1px solid ${CY}44`,
      borderRadius: 12, display: "flex", flexDirection: "column",
      fontFamily: MONO, color: "#DCEBF5",
      boxShadow: `0 0 60px ${CY}18`,
    }}>

      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 16px", borderBottom: `1px solid ${CY}22`,
      }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 13 }}>
          ◈ GRAPH CENTRALITY × RISK CONVERGENCE
        </span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: MUTED }}>
          {nodes.length} nodes · {signals.length} signals · {loading ? "refreshing…" : "live"}
        </span>
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: MUTED,
          cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0,
        }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 10, padding: "10px 16px", flexWrap: "wrap" }}>
        {[
          { label: "NODES",    value: nodes.length,   colour: CY    },
          { label: "SIGNALS",  value: signals.length,  colour: MUTED },
          { label: "AT_RISK",  value: atRisk,           colour: RED   },
          { label: "SECURE",   value: secure,            colour: GREEN },
        ].map(({ label, value, colour }) => (
          <div key={label} style={{
            flex: "1 1 100px", minWidth: 90,
            background: "rgba(10,20,35,0.6)", borderRadius: 8,
            border: `1px solid ${colour}33`, padding: "8px 10px", textAlign: "center",
          }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: colour }}>{value}</div>
            <div style={{ fontSize: 9, color: MUTED, letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ display: "flex", gap: 8, padding: "6px 16px", alignItems: "center", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            fontFamily: MONO, fontSize: 10, letterSpacing: 1,
            padding: "2px 10px", borderRadius: 3, cursor: "pointer",
            border: `1px solid ${tab === t ? TAB_COLOUR[t] : MUTED + "55"}`,
            color: tab === t ? TAB_COLOUR[t] : MUTED,
            background: tab === t ? `${TAB_COLOUR[t]}18` : "transparent",
          }}>{t}</button>
        ))}
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="search nodes…"
          style={{
            flex: 1, minWidth: 140, fontFamily: MONO, fontSize: 11,
            background: "rgba(10,20,35,0.7)", border: `1px solid ${CY}33`,
            borderRadius: 4, color: "#DCEBF5", padding: "3px 8px", outline: "none",
          }}
        />
        <button onClick={assess} disabled={assessing} style={{
          fontFamily: MONO, fontSize: 10, letterSpacing: 1,
          padding: "3px 12px", borderRadius: 4, cursor: "pointer",
          border: `1px solid ${CY}`, color: CY, background: "transparent",
          opacity: assessing ? 0.5 : 1,
        }}>
          {assessing ? "assessing…" : "▶ ASSESS"}
        </button>
      </div>

      {/* rows */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px 16px" }}>
        {visible.length === 0 && (
          <div style={{ textAlign: "center", color: MUTED, marginTop: 24, fontSize: 12 }}>
            {loading ? "loading graph nodes…" : "no nodes match current filter"}
          </div>
        )}
        {visible.map(row => (
          <div key={row.id} style={{ marginBottom: 6 }}>
            <div
              onClick={() => setExpanded(expanded === row.id ? null : row.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                background: "rgba(10,20,35,0.5)", borderRadius: 8,
                border: `1px solid ${row.classification === "AT_RISK" ? RED + "44" : CY + "22"}`,
                padding: "8px 12px", cursor: "pointer",
              }}
            >
              <ClsBadge cls={row.classification} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#DCEBF5" }}>
                  {row.label}
                </div>
                {row.type && (
                  <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>{row.type}</div>
                )}
              </div>
              <span style={{ fontSize: 10, color: MUTED, flexShrink: 0 }}>
                c={row.centrality.toFixed ? row.centrality.toFixed(3) : row.centrality}
              </span>
              <span style={{ fontSize: 10, color: MUTED }}>
                {row.matched.length} signal{row.matched.length !== 1 ? "s" : ""}
              </span>
              <span style={{ color: MUTED, fontSize: 12 }}>
                {expanded === row.id ? "▲" : "▼"}
              </span>
            </div>

            {expanded === row.id && (
              <div style={{
                background: "rgba(5,10,20,0.7)", borderRadius: "0 0 8px 8px",
                border: `1px solid ${CY}18`, borderTop: "none",
                padding: "10px 12px",
              }}>
                {row.matched.length === 0 ? (
                  <div style={{ fontSize: 11, color: MUTED }}>
                    No risk signals match this node — centrality is high but risk exposure is clear.
                  </div>
                ) : (
                  row.matched.map(({ s, score }) => (
                    <div key={s.id} style={{
                      marginBottom: 8, padding: "6px 10px",
                      background: "rgba(10,20,35,0.5)", borderRadius: 6,
                      border: `1px solid ${RED}22`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#DCEBF5", flex: 1 }}>
                          {s.title}
                        </span>
                        {s.category && (
                          <span style={{
                            fontSize: 9, padding: "1px 5px", borderRadius: 3,
                            border: `1px solid ${RED}44`, color: RED,
                          }}>{s.category}</span>
                        )}
                        {s.severity > 0 && (
                          <span style={{ fontSize: 10, color: RED }}>sev {s.severity}</span>
                        )}
                        <span style={{ fontSize: 10, color: MUTED }}>×{score}</span>
                      </div>
                      <SevBar sev={s.severity} />
                      <RelevanceBar score={score} max={maxScore} />
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
