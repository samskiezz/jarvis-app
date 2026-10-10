/**
 * F90 — Dataset × Graph Centrality Coverage (DGCC)
 *
 * Parallel-fetches /v1/datasets + /v1/graph/centrality every 90 s.
 * Keyword-correlates each dataset (name/description/category/tags) against
 * top-centrality graph nodes (id/label/type) to classify:
 *   DATA_CENTERED  — at least one high-centrality graph node matches
 *   PERIPHERAL     — no centrality node representation
 *
 * Amber badge on PERIPHERAL count.
 *
 * Voice intents: "dataset graph / graph dataset / dgcc /
 *                centered datasets / peripheral datasets /
 *                which datasets are graph-linked / dataset centrality /
 *                graph dataset coverage / dataset graph coverage /
 *                centrality dataset"
 * Strip button: ◈ DGCC  left:2880 bottom:18 zIndex:68
 * Custom event: jarvis:dgcc-toggle
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const AMB  = "#FFD700";
const GRN  = "#00E5A0";
const DIM  = "#5A7A9A";
const POLL = 90_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
const hdrs = { Authorization: `Bearer ${API_KEY}` };

const DGCC_RE =
  /\b(dataset[._\s]?graph|graph[._\s]?dataset|dgcc|centered[._\s]?dataset|peripheral[._\s]?dataset|which[._\s]?datasets?[._\s]?are[._\s]?graph[._\s]?link|dataset[._\s]?centralit|graph[._\s]?dataset[._\s]?coverage|dataset[._\s]?graph[._\s]?coverage|centralit[._\s]?dataset)\b/i;

export function isDgccQuery(t) { return DGCC_RE.test(t || ""); }

function tokenize(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function relevance(dataset, node) {
  const a = tokenize([
    dataset.name, dataset.description, dataset.category,
    (dataset.tags || []).join(" "), dataset.source || "",
  ].join(" "));
  const b = tokenize([
    node.id, node.label, node.type,
    (node.properties ? Object.values(node.properties).join(" ") : ""),
  ].join(" "));
  const setB = new Set(b);
  const hits = a.filter(w => setB.has(w)).length;
  return hits / Math.max(a.length, 1);
}

async function fetchAll() {
  const base = apiBase();
  const [dr, gr] = await Promise.all([
    fetch(`${base}/v1/datasets`,           { headers: hdrs }),
    fetch(`${base}/v1/graph/centrality`,   { headers: hdrs }),
  ]);
  const dd = dr.ok ? await dr.json() : {};
  const gd = gr.ok ? await gr.json() : {};

  const datasets = (Array.isArray(dd) ? dd : dd?.data || dd?.items || dd?.results || dd?.datasets || []).map(d => ({
    id:          d.id || d._id || String(Math.random()),
    name:        d.name || d.title || "Unnamed Dataset",
    description: d.description || d.desc || "",
    category:    d.category || d.type || d.kind || "",
    source:      d.source || d.origin || "",
    tags:        Array.isArray(d.tags) ? d.tags : [],
    rows:        d.row_count || d.rows || d.count || null,
  }));

  const nodes = (Array.isArray(gd) ? gd : gd?.data || gd?.nodes || gd?.results || gd?.centrality || []).map(n => ({
    id:         n.id || n.node_id || String(Math.random()),
    label:      n.label || n.name || n.id || "node",
    type:       n.type || n.entity_type || "",
    centrality: typeof n.centrality === "number" ? n.centrality
               : typeof n.score     === "number" ? n.score : 0,
    properties: n.properties || {},
  }));

  return { datasets, nodes };
}

export async function buildDgccScript() {
  try {
    const base = apiBase();
    const { datasets, nodes } = await fetchAll();
    const threshold = 0.04;
    const centered   = datasets.filter(d => nodes.some(n => relevance(d, n) >= threshold));
    const peripheral = datasets.filter(d => !nodes.some(n => relevance(d, n) >= threshold));
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...hdrs },
      body: JSON.stringify({
        message:
          `Dataset × Graph Centrality Coverage (DGCC): ${datasets.length} datasets, ` +
          `${nodes.length} high-centrality graph nodes analysed. ` +
          `${centered.length} datasets are DATA_CENTERED (matched to graph), ` +
          `${peripheral.length} are PERIPHERAL (no graph node coverage). ` +
          `Peripheral datasets (sample): ${peripheral.slice(0, 3).map(d => d.name).join("; ") || "none"}. ` +
          "Assess the graph-dataset coverage gap in exactly 2 sentences.",
      }),
    });
    const d = r.ok ? await r.json() : null;
    return (
      d?.response || d?.reply || d?.content || d?.text ||
      `DGCC: ${centered.length}/${datasets.length} datasets mapped to high-centrality graph nodes; ${peripheral.length} peripheral.`
    );
  } catch {
    return "DGCC: unable to fetch assessment.";
  }
}

/* ── Styles ─────────────────────────────────────────────────────── */
const PANEL = {
  position: "fixed",
  bottom: 48,
  left: 2880,
  width: 440,
  height: 520,
  background: "rgba(7,18,28,0.97)",
  border: "1px solid #29E7FF44",
  borderRadius: 10,
  boxShadow: "0 0 28px #29E7FF22",
  display: "flex",
  flexDirection: "column",
  zIndex: 68,
  fontFamily: "'Share Tech Mono','Courier New',monospace",
  color: "#DCEBF5",
  backdropFilter: "blur(14px)",
};

const BTN = {
  position: "fixed",
  left: 2880,
  bottom: 18,
  zIndex: 68,
  background: "rgba(7,18,28,0.88)",
  border: "1px solid #29E7FF55",
  borderRadius: 6,
  color: CY,
  fontFamily: "'Share Tech Mono',monospace",
  fontSize: 11,
  padding: "3px 8px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 5,
};

/* ── Component ─────────────────────────────────────────────────── */
export default function DatasetGraphCentralityCoverage() {
  const [open,      setOpen]      = useState(false);
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState(null);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assess,    setAssess]    = useState("");
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { datasets, nodes } = await fetchAll();
      const threshold = 0.04;
      const enriched = datasets.map(d => {
        const matches = nodes
          .map(n => ({ ...n, score: relevance(d, n) }))
          .filter(n => n.score >= threshold)
          .sort((x, y) => y.score - x.score);
        return { ...d, status: matches.length > 0 ? "DATA_CENTERED" : "PERIPHERAL", matches };
      });
      enriched.sort((a, b) => a.status.localeCompare(b.status));
      setData({ datasets: enriched, nodes });
    } catch (e) {
      setErr(e.message || "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:dgcc-toggle", toggle);
    return () => window.removeEventListener("jarvis:dgcc-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    pollRef.current = setInterval(load, POLL);
    return () => clearInterval(pollRef.current);
  }, [open, load]);

  const runAssess = async () => {
    setAssessing(true); setAssess("");
    const txt = await buildDgccScript();
    setAssess(txt); setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
  };

  if (!open) {
    const peripheralCount = data ? data.datasets.filter(d => d.status === "PERIPHERAL").length : 0;
    return (
      <button style={BTN} onClick={() => setOpen(true)} title="Dataset × Graph Centrality Coverage">
        ◈ DGCC
        {peripheralCount > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 3, fontSize: 9, padding: "1px 4px", fontWeight: 700 }}>
            {peripheralCount}
          </span>
        )}
      </button>
    );
  }

  const datasets    = data?.datasets || [];
  const nodes       = data?.nodes    || [];
  const centered    = datasets.filter(d => d.status === "DATA_CENTERED");
  const peripheral  = datasets.filter(d => d.status === "PERIPHERAL");

  const visible = datasets.filter(d => {
    if (filter === "DATA_CENTERED" && d.status !== "DATA_CENTERED") return false;
    if (filter === "PERIPHERAL"    && d.status !== "PERIPHERAL")    return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (d.name + d.category + d.source).toLowerCase().includes(q);
  });

  const toggleRow = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  return (
    <div style={PANEL}>
      {/* Header */}
      <div style={{ padding: "10px 14px 6px", borderBottom: "1px solid #29E7FF22", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 12, letterSpacing: 1 }}>◈ DATASET × GRAPH CENTRALITY</span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: "1px solid #29E7FF11" }}>
        {[
          { label: "DATASETS",  val: datasets.length,  color: CY  },
          { label: "NODES",     val: nodes.length,     color: CY  },
          { label: "CENTERED",  val: centered.length,  color: GRN },
          { label: "PERIPHERAL",val: peripheral.length, color: AMB },
        ].map(t => (
          <div key={t.label} style={{ flex: 1, background: "rgba(41,231,255,0.04)", borderRadius: 5, padding: "5px 4px", textAlign: "center" }}>
            <div style={{ color: t.color, fontSize: 14, fontWeight: 700 }}>{t.val}</div>
            <div style={{ color: DIM, fontSize: 8, letterSpacing: 0.5 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: "flex", gap: 4, padding: "6px 14px 4px", flexWrap: "wrap" }}>
        {["ALL", "DATA_CENTERED", "PERIPHERAL"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ background: filter === f ? CY : "rgba(41,231,255,0.08)", color: filter === f ? "#000" : DIM, border: "none", borderRadius: 4, padding: "2px 8px", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>
            {f}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="search datasets…"
          style={{ marginLeft: "auto", background: "rgba(41,231,255,0.05)", border: "1px solid #29E7FF22", borderRadius: 4, color: "#DCEBF5", fontFamily: "inherit", fontSize: 10, padding: "2px 8px", width: 120 }} />
      </div>

      {/* Dataset list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 14px" }}>
        {loading && !data && <div style={{ color: DIM, fontSize: 11, textAlign: "center", marginTop: 20 }}>loading…</div>}
        {err && <div style={{ color: "#FF4D6D", fontSize: 11, textAlign: "center", marginTop: 10 }}>{err}</div>}
        {visible.map(d => (
          <div key={d.id} style={{ marginBottom: 6, background: "rgba(41,231,255,0.03)", borderRadius: 6, border: "1px solid #29E7FF18" }}>
            <div onClick={() => toggleRow(d.id)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", cursor: "pointer" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: d.status === "DATA_CENTERED" ? GRN : AMB, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {d.name}
              </span>
              {d.category && <span style={{ fontSize: 9, color: DIM }}>{d.category}</span>}
              <span style={{ fontSize: 9, color: d.status === "DATA_CENTERED" ? GRN : AMB, marginLeft: "auto" }}>
                {d.status}
              </span>
              <span style={{ color: DIM, fontSize: 10 }}>{expanded[d.id] ? "▲" : "▼"}</span>
            </div>

            {expanded[d.id] && (
              <div style={{ padding: "4px 12px 8px", borderTop: "1px solid #29E7FF11" }}>
                {d.description && (
                  <div style={{ color: DIM, fontSize: 9, marginBottom: 6, lineHeight: 1.4 }}>
                    {d.description.slice(0, 160)}{d.description.length > 160 ? "…" : ""}
                  </div>
                )}
                {d.rows != null && (
                  <div style={{ color: DIM, fontSize: 9, marginBottom: 4 }}>rows: {d.rows.toLocaleString()}</div>
                )}
                {d.matches.length === 0 && (
                  <div style={{ color: AMB, fontSize: 10 }}>No matching graph nodes found.</div>
                )}
                {d.matches.slice(0, 5).map(n => (
                  <div key={n.id} style={{ marginBottom: 5 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 2 }}>
                      <span style={{ color: "#DCEBF5" }}>{n.label || n.id}</span>
                      <span style={{ color: DIM }}>{n.type}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <div style={{ flex: 1, height: 4, background: "#29E7FF22", borderRadius: 2 }}>
                        <div style={{ width: `${Math.min(100, Math.round(n.score * 400))}%`, height: "100%", background: GRN, borderRadius: 2 }} />
                      </div>
                      <span style={{ color: DIM, fontSize: 8 }}>cent: {n.centrality.toFixed ? n.centrality.toFixed(3) : n.centrality}</span>
                    </div>
                  </div>
                ))}
                {d.matches.length > 5 && (
                  <div style={{ color: DIM, fontSize: 9 }}>+{d.matches.length - 5} more nodes…</div>
                )}
              </div>
            )}
          </div>
        ))}
        {!loading && visible.length === 0 && data && (
          <div style={{ color: DIM, fontSize: 11, textAlign: "center", marginTop: 20 }}>No datasets match filter.</div>
        )}
      </div>

      {/* Assess */}
      <div style={{ padding: "6px 14px 10px", borderTop: "1px solid #29E7FF11" }}>
        {assess && (
          <div style={{ color: "#C0D8F0", fontSize: 10, marginBottom: 6, lineHeight: 1.4 }}>{assess}</div>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={runAssess} disabled={assessing}
            style={{ background: "rgba(41,231,255,0.1)", border: "1px solid #29E7FF44", borderRadius: 4, color: CY, fontSize: 10, padding: "3px 10px", cursor: "pointer", fontFamily: "inherit" }}>
            {assessing ? "…" : "▶ ASSESS"}
          </button>
          <button onClick={load} style={{ background: "none", border: "1px solid #29E7FF22", borderRadius: 4, color: DIM, fontSize: 10, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit" }}>
            ↻
          </button>
          <span style={{ color: DIM, fontSize: 9, marginLeft: "auto" }}>
            {centered.length}/{datasets.length} centered · 90 s poll
          </span>
        </div>
      </div>
    </div>
  );
}
