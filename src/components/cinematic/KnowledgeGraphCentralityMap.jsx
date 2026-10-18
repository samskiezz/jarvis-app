/**
 * KnowledgeGraphCentralityMap — F309
 * Fetches /knowledge/ + /v1/graph/centrality and keyword-matches each knowledge
 * article against graph centrality node names/labels.
 * Articles that match at least one high-centrality node are ANCHORED; others are FLOATING.
 * Stat tiles: knowledge / anchored / floating / centrality nodes.
 * Floating count amber-pulses when ≥ 1.
 * Expandable rows show matched nodes with centrality score badge.
 * Filter tabs: ALL / ANCHORED / FLOATING.
 * Text search on article title.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS.
 * ◈ KGCMAP toggle (left:63480, bottom:8, zIndex:122).
 * Voice: "knowledge graph"/"graph coverage"/"knowledge anchor"/"kgcmap"/"knowledge centrality".
 * jarvis:kgcmap-toggle event.
 * 90-s auto-refresh.
 * Additive-only — no edits to CinematicShell/CinematicHome/JarvisLoader.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const GR = "#00FF9F";
const AM = "#FFB800";
const PRP = "#A855F7";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";
const POLL_MS = 90_000;

const KGCMAP_RE =
  /\bknowledge.?graph\b|\bgraph.?coverage\b|\bknowledge.?anchor\b|\bkgcmap\b|\bknowledge.?centralit\b|\banchor.?knowledge\b|\bgraph.?knowledge\b|\bknowledge.?node\b|\bknowledge.?influence\b/i;

export function isKgcmapQuery(text) {
  return KGCMAP_RE.test(text || "");
}

const TAG = {
  background: "rgba(0,0,0,0.75)",
  border: `1px solid ${CY}33`,
  borderRadius: 6,
  padding: "2px 7px",
  fontSize: 10,
  color: CY,
};
const STAT_BOX = {
  background: "rgba(0,0,0,0.55)",
  border: `1px solid ${CY}33`,
  borderRadius: 8,
  padding: "10px 16px",
  minWidth: 78,
  textAlign: "center",
};

function tokenize(str) {
  return (str || "")
    .toLowerCase()
    .split(/[\s\-_\/,.;:()[\]{}]+/)
    .filter((t) => t.length >= 3);
}

function matchScore(articleTokens, targetStr) {
  const targetTokens = tokenize(targetStr);
  return articleTokens.filter((t) => targetTokens.includes(t)).length;
}

async function fetchKnowledge(base, headers) {
  const res = await fetch(`${base}/knowledge/`, { headers });
  if (!res.ok) return [];
  const d = await res.json();
  return Array.isArray(d)
    ? d
    : Array.isArray(d?.data)
    ? d.data
    : Array.isArray(d?.items)
    ? d.items
    : [];
}

async function fetchCentrality(base, headers) {
  const res = await fetch(`${base}/v1/graph/centrality`, { headers });
  if (!res.ok) return [];
  const d = await res.json();
  return Array.isArray(d)
    ? d
    : Array.isArray(d?.data)
    ? d.data
    : Array.isArray(d?.nodes)
    ? d.nodes
    : [];
}

function buildRows(articles, nodes) {
  return articles.map((a) => {
    const title = a.title || a.name || a.label || "";
    const summary = a.summary || a.description || a.content || "";
    const tokens = tokenize(title + " " + summary);
    const matches = nodes
      .map((n) => {
        const nodeLabel = n.label || n.name || n.id || "";
        const score = matchScore(tokens, nodeLabel);
        return score > 0 ? { ...n, _score: score } : null;
      })
      .filter(Boolean)
      .sort((a, b) => (b.centrality ?? 0) - (a.centrality ?? 0))
      .slice(0, 5);
    return {
      id: a.id || title,
      title,
      type: a.type || a.category || "article",
      status: a.status || "active",
      anchored: matches.length > 0,
      matches,
    };
  });
}

export async function buildKgcmapScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [articles, nodes] = await Promise.all([
    fetchKnowledge(base, headers),
    fetchCentrality(base, headers),
  ]);
  const rows = buildRows(articles, nodes);
  const anchored = rows.filter((r) => r.anchored).length;
  const floating = rows.length - anchored;
  const rate = rows.length > 0 ? Math.round((anchored / rows.length) * 100) : 0;
  return (
    `Knowledge graph centrality coverage analysis complete, sir. ` +
    `${rows.length} knowledge articles assessed against ${nodes.length} centrality nodes. ` +
    `${anchored} articles are anchored to high-influence graph nodes — a ${rate}% anchor rate. ` +
    `${floating} articles are floating with no direct graph anchor. ` +
    (floating > 0
      ? `These floating articles may lack operational context. Consider linking them to key entities.`
      : `All knowledge articles have graph anchors. Coverage is solid.`)
  );
}

export default function KnowledgeGraphCentralityMap() {
  const [open, setOpen] = useState(false);
  const [articles, setArticles] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assessResult, setAssessResult] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const base = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [arts, nds] = await Promise.all([
        fetchKnowledge(base, headers),
        fetchCentrality(base, headers),
      ]);
      setArticles(arts);
      setNodes(nds);
      setRows(buildRows(arts, nds));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("jarvis:kgcmap-toggle", handler);
    return () => window.removeEventListener("jarvis:kgcmap-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const anchored = rows.filter((r) => r.anchored).length;
  const floating = rows.length - anchored;

  const filtered = rows.filter((r) => {
    if (tab === "ANCHORED" && !r.anchored) return false;
    if (tab === "FLOATING" && r.anchored) return false;
    if (search && !r.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  async function handleAssess() {
    setAssessing(true);
    setAssessResult(null);
    try {
      const base = apiBase();
      const prompt = `Analyze the knowledge graph centrality coverage: ${articles.length} articles, ${nodes.length} centrality nodes, ${anchored} anchored, ${floating} floating. Identify gaps and recommend which floating articles should be linked to key graph entities.`;
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await res.json();
      const text = d.response || d.message || d.content || d.text || "Assessment complete.";
      setAssessResult(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak", { detail: { text } }));
    } catch (e) {
      setAssessResult("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }

  const floatPulse =
    floating > 0
      ? {
          animation: "kgcmap-pulse 2s ease-in-out infinite",
        }
      : {};

  if (!open) {
    return (
      <>
        <style>{`
          @keyframes kgcmap-pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        `}</style>
        <button
          onClick={() => setOpen(true)}
          title="Knowledge Graph Centrality Map"
          style={{
            position: "fixed",
            left: 63480,
            bottom: 8,
            zIndex: 122,
            background: "rgba(0,0,0,0.75)",
            border: `1px solid ${CY}55`,
            borderRadius: 6,
            color: CY,
            fontSize: 10,
            padding: "3px 8px",
            cursor: "pointer",
            fontFamily: "monospace",
            letterSpacing: 1,
            whiteSpace: "nowrap",
          }}
        >
          ◈ KGCMAP
        </button>
      </>
    );
  }

  return (
    <>
      <style>{`
        @keyframes kgcmap-pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        .kgcmap-row:hover { background: rgba(41,231,255,0.07) !important; }
      `}</style>
      <div
        style={{
          position: "fixed",
          right: 24,
          bottom: 56,
          width: 560,
          maxHeight: "80vh",
          overflowY: "auto",
          background: "rgba(6,10,20,0.97)",
          border: `1px solid ${CY}55`,
          borderRadius: 12,
          zIndex: 9500,
          fontFamily: "monospace",
          color: CY,
          padding: 16,
          boxShadow: `0 0 32px ${CY}22`,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2 }}>◈ KNOWLEDGE × GRAPH CENTRALITY MAP</span>
          <button
            onClick={() => setOpen(false)}
            style={{ background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 16 }}
          >
            ✕
          </button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={STAT_BOX}>
            <div style={{ fontSize: 20, fontWeight: 700, color: CY }}>{articles.length}</div>
            <div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>KNOWLEDGE</div>
          </div>
          <div style={STAT_BOX}>
            <div style={{ fontSize: 20, fontWeight: 700, color: GR }}>{anchored}</div>
            <div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>ANCHORED</div>
          </div>
          <div style={{ ...STAT_BOX, ...floatPulse, borderColor: floating > 0 ? `${AM}55` : `${CY}33` }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: floating > 0 ? AM : "#666" }}>{floating}</div>
            <div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>FLOATING</div>
          </div>
          <div style={STAT_BOX}>
            <div style={{ fontSize: 20, fontWeight: 700, color: PRP }}>{nodes.length}</div>
            <div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>NODES</div>
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {["ALL", "ANCHORED", "FLOATING"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? `${CY}22` : "transparent",
                border: `1px solid ${tab === t ? CY : CY + "44"}`,
                borderRadius: 4,
                color: tab === t ? CY : "#666",
                fontSize: 10,
                padding: "2px 10px",
                cursor: "pointer",
              }}
            >
              {t}
            </button>
          ))}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search title…"
            style={{
              marginLeft: "auto",
              background: "rgba(0,0,0,0.5)",
              border: `1px solid ${CY}44`,
              borderRadius: 4,
              color: CY,
              fontSize: 10,
              padding: "2px 8px",
              outline: "none",
              width: 140,
            }}
          />
        </div>

        {/* Rows */}
        {loading && <div style={{ fontSize: 11, color: "#555", marginBottom: 8 }}>Loading…</div>}
        {err && <div style={{ fontSize: 10, color: "#FF4444", marginBottom: 8 }}>Error: {err}</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ fontSize: 11, color: "#555" }}>No articles match current filter.</div>
        )}
        {filtered.map((row) => (
          <div key={row.id} className="kgcmap-row" style={{ borderBottom: `1px solid ${CY}22`, padding: "6px 0" }}>
            <div
              style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}
              onClick={() => setExpanded((p) => ({ ...p, [row.id]: !p[row.id] }))}
            >
              <span style={{ fontSize: 10, color: row.anchored ? GR : AM, minWidth: 64 }}>
                {row.anchored ? "ANCHORED" : "FLOATING"}
              </span>
              <span style={{ flex: 1, fontSize: 11, color: CY }}>{row.title || "(untitled)"}</span>
              <span style={{ ...TAG }}>{row.type}</span>
              <span style={{ fontSize: 10, color: "#555" }}>
                {row.matches.length > 0 ? `${row.matches.length} node${row.matches.length > 1 ? "s" : ""}` : "—"}
              </span>
              <span style={{ fontSize: 10, color: "#555" }}>{expanded[row.id] ? "▲" : "▼"}</span>
            </div>
            {expanded[row.id] && row.matches.length > 0 && (
              <div style={{ paddingLeft: 72, paddingTop: 6 }}>
                {row.matches.map((n, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 3 }}>
                    <span style={{ fontSize: 10, color: PRP }}>
                      {n.label || n.name || n.id || "node"}
                    </span>
                    {n.centrality != null && (
                      <span style={{ fontSize: 9, color: "#888" }}>
                        centrality {typeof n.centrality === "number" ? n.centrality.toFixed(3) : n.centrality}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {expanded[row.id] && row.matches.length === 0 && (
              <div style={{ paddingLeft: 72, paddingTop: 4, fontSize: 10, color: "#555" }}>
                No matching centrality nodes found.
              </div>
            )}
          </div>
        ))}

        {/* Assess */}
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={handleAssess}
            disabled={assessing}
            style={{
              background: assessing ? "rgba(41,231,255,0.1)" : `${CY}22`,
              border: `1px solid ${CY}`,
              borderRadius: 5,
              color: CY,
              fontSize: 10,
              padding: "4px 14px",
              cursor: assessing ? "default" : "pointer",
              letterSpacing: 1,
            }}
          >
            {assessing ? "ASSESSING…" : "▶ ASSESS"}
          </button>
          <button
            onClick={load}
            style={{
              background: "transparent",
              border: `1px solid ${CY}44`,
              borderRadius: 5,
              color: "#888",
              fontSize: 10,
              padding: "4px 10px",
              cursor: "pointer",
            }}
          >
            ↺
          </button>
          <span style={{ fontSize: 9, color: "#555", marginLeft: "auto" }}>
            auto-refresh 90s
          </span>
        </div>

        {assessResult && (
          <div
            style={{
              marginTop: 10,
              padding: 10,
              background: "rgba(41,231,255,0.07)",
              border: `1px solid ${CY}33`,
              borderRadius: 6,
              fontSize: 10,
              color: CY,
              lineHeight: 1.6,
              maxHeight: 140,
              overflowY: "auto",
            }}
          >
            {assessResult}
          </div>
        )}
      </div>

      {/* Collapsed toggle button */}
      <button
        onClick={() => setOpen(false)}
        title="Knowledge Graph Centrality Map"
        style={{
          position: "fixed",
          left: 63480,
          bottom: 8,
          zIndex: 122,
          background: `${CY}22`,
          border: `1px solid ${CY}`,
          borderRadius: 6,
          color: CY,
          fontSize: 10,
          padding: "3px 8px",
          cursor: "pointer",
          fontFamily: "monospace",
          letterSpacing: 1,
          whiteSpace: "nowrap",
        }}
      >
        ◈ KGCMAP
      </button>
    </>
  );
}
