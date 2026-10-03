/**
 * F217: Scene × Graph Node Coverage (SCGN)
 *
 * Parallel-fetches /v1/cinematic/scene/{id} (all 10 scenes) × /v1/graph/centrality,
 * then keyword-correlates each scene's anchor text against top-influence graph
 * nodes to surface NETWORK-BACKED (at least one high-centrality node aligns with
 * this scene's domain) vs DISCONNECTED (no centrality node coverage — scene lacks
 * network backing).
 *
 * Real endpoints:
 *   GET /v1/cinematic/scene/:id   — scene anchor text
 *   GET /v1/graph/centrality      — top-influence graph nodes
 *   POST /v1/jarvis/agent/chat    — ASSESS brief
 *
 * Voice triggers: "scgn" / "scene graph node" / "graph node scene" /
 *   "network backed scene" / "disconnected scene" / "scene centrality" /
 *   "scene network" / "node scene coverage" / "scene influence"
 */

import { useState, useEffect, useRef } from "react";

const API     = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const API_KEY = import.meta.env.VITE_API_KEY ?? "dev-key";
const hdr     = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };

const SCENE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const THRESHOLD = 0.1;

const TE  = "#2DD4BF";  // teal  — network-backed
const RD  = "#EF4444";  // red   — disconnected
const AM  = "#F59E0B";  // amber — badge
const DIM = "#6B7280";  // dim

const SCGN_RE =
  /\b(scgn|scene[._-]?graph[._-]?node|graph[._-]?node[._-]?scene|network[._-]?backed[._-]?scene|disconnected[._-]?scene|scene[._-]?centrality|scene[._-]?network|node[._-]?scene[._-]?coverage|scene[._-]?influence)\b/i;

export function isScgnQuery(t) { return SCGN_RE.test(t || ""); }

// ── normalizers ───────────────────────────────────────────────────────────────

function normaliseScene(raw, id) {
  if (!raw) return null;
  const title =
    raw.title ?? raw.name ?? raw.label ??
    (Array.isArray(raw.anchors) ? raw.anchors[0]?.label : undefined) ??
    `Scene ${id}`;
  const anchors = Array.isArray(raw.anchors)
    ? raw.anchors.map(a => a.label ?? a.title ?? a.text ?? String(a)).join(" ")
    : String(raw.description ?? raw.summary ?? "");
  return { id: String(id), label: `Scene ${String(id).padStart(2, "0")} — ${title}`, anchors };
}

function normaliseNodes(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : (raw?.nodes ?? raw?.results ?? raw?.items ?? raw?.data ?? []);
  return arr.map((n, i) => ({
    id:        n.id ?? String(i),
    label:     String(n.label ?? n.name ?? n.id ?? `Node ${i + 1}`),
    type:      String(n.type ?? n.category ?? n.kind ?? ""),
    score:     Number(n.centrality_score ?? n.score ?? n.weight ?? 0),
  }));
}

// ── token helpers ─────────────────────────────────────────────────────────────

function tokens(str) {
  return String(str || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(t => t.length > 2);
}

function matchScore(aToks, bToks) {
  if (!aToks.length || !bToks.length) return 0;
  const sa = new Set(aToks);
  const hits = bToks.filter(t => sa.has(t)).length;
  return hits / Math.max(sa.size, bToks.length);
}

// ── correlator ────────────────────────────────────────────────────────────────

function correlate(scenes, nodes) {
  return scenes.map(scene => {
    const scToks = tokens(scene.label + " " + scene.anchors);
    const matched = nodes
      .map(n => {
        const nToks = tokens(n.label + " " + n.type);
        const sc = matchScore(scToks, nToks);
        return { ...n, _score: sc };
      })
      .filter(n => n._score >= THRESHOLD)
      .sort((a, b) => b._score - a._score)
      .slice(0, 6);

    return {
      ...scene,
      _nodes:    matched,
      _coverage: matched.length > 0 ? "NETWORK-BACKED" : "DISCONNECTED",
    };
  });
}

// ── data fetcher ──────────────────────────────────────────────────────────────

async function fetchAll() {
  const sceneResults = await Promise.all(
    SCENE_IDS.map(id =>
      fetch(`${API}/v1/cinematic/scene/${id}`, { headers: hdr })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
    )
  );
  const scenes = sceneResults
    .map((raw, i) => normaliseScene(raw, SCENE_IDS[i]))
    .filter(Boolean);

  const nodeRaw = await fetch(`${API}/v1/graph/centrality`, { headers: hdr })
    .then(r => r.ok ? r.json() : [])
    .catch(() => []);
  const nodes = normaliseNodes(nodeRaw);

  return correlate(scenes, nodes);
}

// ── spoken script builder ─────────────────────────────────────────────────────

export async function buildScgnScript() {
  try {
    const rows = await fetchAll();
    if (!rows.length) return "Scene Graph Node coverage unavailable — check endpoints.";
    const backed = rows.filter(r => r._coverage === "NETWORK-BACKED");
    const disconn = rows.filter(r => r._coverage === "DISCONNECTED");
    return (
      `SCGN: ${rows.length} cinematic scenes cross-referenced against top-influence graph nodes. ` +
      `${backed.length} NETWORK-BACKED (high-centrality node aligns with scene domain); ` +
      `${disconn.length} DISCONNECTED (no graph node coverage — scene lacks network backing). ` +
      (disconn.length > 0
        ? `Disconnected scenes: ${disconn.map(s => s.label.split("—")[0].trim()).join(", ")}. ` +
          `Recommend enriching graph ontology or tagging these scenes in the influence network.`
        : `All scenes carry graph node coverage. Network topology is aligned with operational theatre.`)
    );
  } catch {
    return "Scene Graph Node coverage unavailable — check endpoints.";
  }
}

// ── sub-components ────────────────────────────────────────────────────────────

function ScoreBadge({ score }) {
  const pct = Math.round(score * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{
        flex: 1, height: 5, borderRadius: 3, background: "#1f2937",
        overflow: "hidden",
      }}>
        <div style={{ width: `${pct}%`, height: "100%", background: TE, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 10, color: TE, minWidth: 30, textAlign: "right" }}>{pct}%</span>
    </div>
  );
}

function NodeChip({ node }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
        <span style={{ fontSize: 11, color: "#e5e7eb", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {node.label}
        </span>
        {node.type && (
          <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: "#374151", color: "#9ca3af", marginLeft: 4 }}>
            {node.type.toUpperCase().slice(0, 10)}
          </span>
        )}
      </div>
      <ScoreBadge score={node._score} />
    </div>
  );
}

function SceneRow({ row, expanded, onToggle }) {
  const isNetworked = row._coverage === "NETWORK-BACKED";
  const color = isNetworked ? TE : RD;
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
          borderRadius: 8, cursor: "pointer", userSelect: "none",
          background: expanded ? "#1e293b" : "#111827",
          borderLeft: `3px solid ${color}`,
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, color, minWidth: 110, whiteSpace: "nowrap" }}>
          {row._coverage}
        </span>
        <span style={{ fontSize: 12, color: "#e5e7eb", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.label}
        </span>
        <span style={{ fontSize: 10, color: DIM }}>
          {row._nodes.length > 0 ? `${row._nodes.length} node${row._nodes.length !== 1 ? "s" : ""}` : "none"}
        </span>
        <span style={{ fontSize: 12, color: DIM }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div style={{ padding: "8px 12px", background: "#0f172a", borderRadius: "0 0 8px 8px", marginTop: 2 }}>
          {row._nodes.length === 0 ? (
            <p style={{ fontSize: 11, color: RD, margin: 0 }}>
              No high-centrality graph node aligns with this scene's domain. Network blind spot.
            </p>
          ) : (
            row._nodes.map(n => <NodeChip key={n.id} node={n} />)
          )}
        </div>
      )}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function SceneGraphNodeCoverage() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState(null);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState({});
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  async function load() {
    setLoading(true); setErr(null);
    try {
      setRows(await fetchAll());
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const onToggle = () => setOpen(o => { if (!o) load(); return !o; });
    window.addEventListener("jarvis:scgn-toggle", onToggle);
    return () => window.removeEventListener("jarvis:scgn-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, 120_000);
    return () => clearInterval(timerRef.current);
  }, [open]);

  if (!open) return null;

  const backed  = rows.filter(r => r._coverage === "NETWORK-BACKED").length;
  const disconn = rows.filter(r => r._coverage === "DISCONNECTED").length;

  const visible = rows.filter(r => {
    if (filter === "NETWORK-BACKED" && r._coverage !== "NETWORK-BACKED") return false;
    if (filter === "DISCONNECTED"   && r._coverage !== "DISCONNECTED")   return false;
    if (search && !r.label.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function toggleExpand(id) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildScgnScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: "POST", headers: hdr,
        body: JSON.stringify({ message: `Scene Graph Node Coverage assessment: ${script}` }),
      });
      const d = await r.json();
      const brief = d.response ?? d.message ?? d.text ?? script;
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: brief }));
    } catch {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: await buildScgnScript().catch(() => "Assessment unavailable.") }));
    } finally {
      setAssessing(false);
    }
  }

  const TABS = ["ALL", "NETWORK-BACKED", "DISCONNECTED"];

  return (
    <div style={{
      position: "fixed", bottom: 8, left: 748480, zIndex: 365,
      width: 480, maxHeight: 580, display: "flex", flexDirection: "column",
      background: "#0a0f1a", border: "1px solid #1e293b", borderRadius: 12,
      boxShadow: "0 4px 32px rgba(0,0,0,0.7)", fontFamily: "monospace",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", background: "#0f172a", borderBottom: "1px solid #1e293b",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: TE, letterSpacing: 1 }}>◈ SCGN</span>
          <span style={{ fontSize: 10, color: "#6b7280" }}>Scene × Graph Node Coverage</span>
          {disconn > 0 && (
            <span style={{
              fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 20,
              background: `${RD}22`, color: RD, border: `1px solid ${RD}55`,
            }}>{disconn} DISCONNECTED</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={assess}
            disabled={assessing || loading}
            style={{
              fontSize: 10, padding: "3px 10px", borderRadius: 6, cursor: "pointer",
              background: assessing ? "#1e293b" : "#0d2b1f", color: "#4ade80",
              border: "1px solid #166534",
            }}
          >
            {assessing ? "…" : "▶ ASSESS"}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{ fontSize: 12, background: "transparent", border: "none", color: "#6b7280", cursor: "pointer" }}
          >✕</button>
        </div>
      </div>

      {/* Stat tiles */}
      {rows.length > 0 && (
        <div style={{
          display: "flex", gap: 8, padding: "8px 14px",
          background: "#0f172a", borderBottom: "1px solid #1e293b", flexShrink: 0,
        }}>
          {[
            { label: "SCENES",          value: rows.length,  color: "#9ca3af" },
            { label: "NETWORK-BACKED",  value: backed,       color: TE        },
            { label: "DISCONNECTED",    value: disconn,      color: RD        },
          ].map(t => (
            <div key={t.label} style={{ flex: 1, textAlign: "center", padding: "5px 4px", background: "#111827", borderRadius: 8 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: t.color }}>{t.value}</div>
              <div style={{ fontSize: 8, color: "#4b5563", marginTop: 1 }}>{t.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{
        display: "flex", gap: 4, padding: "6px 14px",
        background: "#0a0f1a", borderBottom: "1px solid #1e293b", flexShrink: 0,
      }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            style={{
              fontSize: 9, padding: "3px 10px", borderRadius: 12, cursor: "pointer",
              background: filter === tab ? TE : "#1e293b",
              color:      filter === tab ? "#000" : "#9ca3af",
              border:     "none", fontWeight: filter === tab ? 700 : 400,
            }}
          >{tab}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: "6px 14px", background: "#0a0f1a", flexShrink: 0 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search scenes…"
          style={{
            width: "100%", fontSize: 11, padding: "5px 10px", borderRadius: 6,
            background: "#111827", border: "1px solid #1e293b", color: "#e5e7eb",
            outline: "none", boxSizing: "border-box",
          }}
        />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px 10px" }}>
        {loading && (
          <div style={{ color: TE, fontSize: 11, textAlign: "center", padding: 20 }}>Loading…</div>
        )}
        {err && (
          <div style={{ color: RD, fontSize: 11, padding: 10 }}>Error: {err}</div>
        )}
        {!loading && !err && visible.length === 0 && (
          <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>
            {rows.length === 0 ? "No data. Endpoints may be offline." : "No scenes match filter."}
          </div>
        )}
        {visible.map(row => (
          <SceneRow
            key={row.id}
            row={row}
            expanded={!!expanded[row.id]}
            onToggle={() => toggleExpand(row.id)}
          />
        ))}
      </div>

      {/* Footer */}
      <div style={{
        padding: "6px 14px", background: "#0f172a", borderTop: "1px solid #1e293b",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        fontSize: 9, color: "#4b5563", flexShrink: 0,
      }}>
        <span>SCGN · /v1/cinematic/scene/{"{id}"} × /v1/graph/centrality</span>
        <span>↻ 120 s</span>
      </div>
    </div>
  );
}
