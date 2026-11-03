/**
 * CrossDomainEntityPivot — F318.
 *
 * Data sources (all real):
 *   GET  /v1/ontology/objects?q={term}          → {items:[...], count}
 *   GET  /v1/ontology/objects/{id}/neighbors    → {center, objects:[...], links:[...]}
 *   GET  /v1/gotham/cases                       → [...] or {items:[...]}
 *   GET  /v1/investigations                     → [...] or {items:[...]}
 *   GET  /v1/cases                              → [...] or {items:[...]}
 *   POST /v1/jarvis/agent/chat                  → ASSESS
 *
 * Displays:
 *   - Search input → ontology entity result list (seed selection)
 *   - Multi-domain SVG Verlet force graph:
 *       Ontology nodes  = blue  (#29E7FF)
 *       Gotham nodes    = red   (#F87171)
 *       Investigation   = green (#4ADE80)
 *       Ops/Cases       = orange(#F5A623)
 *   - Click any node → pivot: re-fetch neighbors for that entity
 *   - Right inspector shows hovered/selected node properties
 *   - ASSESS + TTS about cross-domain entity reach
 *
 * Toggle: ◈ CDPIVOT  left:225880  bottom:8  zIndex:414
 * Event:  jarvis:cdpivot-toggle
 * Voice:  "cross domain pivot / cdpivot / entity pivot / cross domain graph /
 *          multi domain / domain pivot / cross domain entity / pivot graph"
 *
 * Exported for JarvisBrain: isCdpivotQuery, buildCdpivotScript
 * Mounted via src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

// ── palette ────────────────────────────────────────────────────────────────
const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const RD   = "#F87171";
const SURF = "rgba(6,11,18,0.97)";
const BORD = "rgba(41,231,255,0.18)";
const DIM  = "rgba(41,231,255,0.35)";

// Domain colour map
const DOMAIN_COLOR = {
  ontology:    CY,
  gotham:      RD,
  investigation: GN,
  ops:         AM,
};

// ── layout constants ───────────────────────────────────────────────────────
const BTN_LEFT = 225880;
const PANEL_W  = 980;
const PANEL_H  = 660;
const SVG_W    = 620;
const SVG_H    = 520;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── JarvisBrain exports ───────────────────────────────────────────────────
const CDPIVOT_RE =
  /\b(cross[\s-]?domain[\s-]?pivot|cdpivot\b|entity[\s-]?pivot|cross[\s-]?domain[\s-]?graph|multi[\s-]?domain|domain[\s-]?pivot|cross[\s-]?domain[\s-]?entity|pivot[\s-]?graph)\b/i;

export function isCdpivotQuery(q) {
  return CDPIVOT_RE.test(q || "");
}

export function buildCdpivotScript(q) {
  return `Open the Cross-Domain Entity Pivot panel and search for entities related to: "${q}". Show cross-domain connections.`;
}

// ── Verlet simulation ──────────────────────────────────────────────────────
function initNodes(allNodes, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  return allNodes.map((n, i) => {
    if (n.isCenter) return { ...n, x: cx, y: cy, vx: 0, vy: 0 };
    const ang = (2 * Math.PI * i) / Math.max(allNodes.length - 1, 1);
    const rad = 150 + Math.random() * 60;
    return {
      ...n,
      x:  cx + Math.cos(ang) * rad,
      y:  cy + Math.sin(ang) * rad,
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
    };
  });
}

function tickSim(nodes, links, alpha, w, h) {
  const REPEL  = 4500;
  const SPRING = 0.05;
  const LEN    = 110;
  const DAMP   = 0.80;
  const GRAV   = 0.03;
  const cx = w / 2;
  const cy = h / 2;
  const N  = nodes.length;

  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const dx = nodes[j].x - nodes[i].x;
      const dy = nodes[j].y - nodes[i].y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
      const force = (REPEL * alpha) / (dist * dist);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      nodes[i].vx -= fx;
      nodes[i].vy -= fy;
      nodes[j].vx += fx;
      nodes[j].vy += fy;
    }
  }

  links.forEach(({ source, target }) => {
    const s = nodes[source];
    const t = nodes[target];
    if (!s || !t) return;
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
    const stretch = (dist - LEN) * SPRING * alpha;
    const fx = (dx / dist) * stretch;
    const fy = (dy / dist) * stretch;
    s.vx += fx; s.vy += fy;
    t.vx -= fx; t.vy -= fy;
  });

  nodes.forEach((n) => {
    if (n.isCenter) return;
    n.vx += (cx - n.x) * GRAV * alpha;
    n.vy += (cy - n.y) * GRAV * alpha;
    n.vx *= DAMP;
    n.vy *= DAMP;
    n.x  += n.vx;
    n.y  += n.vy;
    const r = n.r || 10;
    n.x = Math.max(r + 4, Math.min(w - r - 4, n.x));
    n.y = Math.max(r + 4, Math.min(h - r - 4, n.y));
  });
}

// ── helpers ────────────────────────────────────────────────────────────────
function toArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (v.items && Array.isArray(v.items)) return v.items;
  if (v.results && Array.isArray(v.results)) return v.results;
  return [];
}

function speak(text) {
  try {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-GB";
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
  } catch (_) {}
}

// ── main component ────────────────────────────────────────────────────────
export default function CrossDomainEntityPivot() {
  const [open, setOpen]         = useState(false);
  const [query, setQuery]       = useState("");
  const [results, setResults]   = useState([]);
  const [seed, setSeed]         = useState(null);
  const [nodes, setNodes]       = useState([]);
  const [links, setLinks]       = useState([]);
  const [hovered, setHovered]   = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [assess, setAssess]     = useState("");
  const [assessing, setAssessing] = useState(false);

  const rafRef   = useRef(null);
  const nodesRef = useRef([]);
  const linksRef = useRef([]);
  const svgRef   = useRef(null);

  // ── toggle via event ────────────────────────────────────────────────────
  useEffect(() => {
    const h = () => setOpen((v) => !v);
    window.addEventListener("jarvis:cdpivot-toggle", h);
    return () => window.removeEventListener("jarvis:cdpivot-toggle", h);
  }, []);

  // ── search ontology objects ─────────────────────────────────────────────
  const handleSearch = useCallback(async (e) => {
    e && e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResults([]);
    setSeed(null);
    setNodes([]);
    setLinks([]);
    setAssess("");
    try {
      const r = await fetch(
        `${apiBase()}/v1/ontology/objects?q=${encodeURIComponent(query.trim())}`,
        { headers: { Authorization: `Bearer ${API_KEY}` } }
      );
      if (!r.ok) throw new Error(`Search error ${r.status}`);
      const d = await r.json();
      setResults(toArray(d.items || d));
    } catch (e2) {
      setError(e2.message);
    } finally {
      setLoading(false);
    }
  }, [query]);

  // ── fetch cross-domain data for a seed entity ──────────────────────────
  const handleSelectSeed = useCallback(async (entity) => {
    setSeed(entity);
    setResults([]);
    setNodes([]);
    setLinks([]);
    setAssess("");
    setLoading(true);
    setError(null);

    try {
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [neighborsRes, gothamRes, invRes, opsRes] = await Promise.allSettled([
        fetch(`${apiBase()}/v1/ontology/objects/${entity.id}/neighbors`, { headers }),
        fetch(`${apiBase()}/v1/gotham/cases`, { headers }),
        fetch(`${apiBase()}/v1/investigations`, { headers }),
        fetch(`${apiBase()}/v1/cases`, { headers }),
      ]);

      // Build node/link arrays
      const allNodes = [];
      const allLinks = [];

      // center node
      allNodes.push({
        id:       entity.id,
        label:    entity.name || entity.label || entity.id,
        domain:   "ontology",
        r:        20,
        isCenter: true,
        data:     entity,
      });
      const centerIdx = 0;

      // ontology neighbors
      if (neighborsRes.status === "fulfilled" && neighborsRes.value.ok) {
        const nd = await neighborsRes.value.json();
        const nbrs = toArray(nd.objects || nd.neighbors || nd.items || []);
        nbrs.forEach((obj) => {
          const idx = allNodes.length;
          allNodes.push({
            id:       obj.id,
            label:    obj.name || obj.label || obj.id,
            domain:   "ontology",
            r:        11,
            isCenter: false,
            data:     obj,
          });
          allLinks.push({ source: centerIdx, target: idx });
        });
      }

      // gotham cases — keep those that reference this entity id
      if (gothamRes.status === "fulfilled" && gothamRes.value.ok) {
        const gd = await gothamRes.value.json();
        const cases = toArray(gd);
        const linked = cases.filter((c) => {
          const linked_objects = c.linked_objects || c.entities || c.objects || [];
          return (
            String(c.id) === String(entity.id) ||
            linked_objects.some(
              (lo) => String(lo.id || lo) === String(entity.id)
            )
          );
        });
        linked.forEach((c) => {
          const idx = allNodes.length;
          allNodes.push({
            id:       `gotham-${c.id}`,
            label:    c.title || c.name || c.case_number || `Gotham #${c.id}`,
            domain:   "gotham",
            r:        12,
            isCenter: false,
            data:     c,
          });
          allLinks.push({ source: centerIdx, target: idx });
        });
      }

      // investigations
      if (invRes.status === "fulfilled" && invRes.value.ok) {
        const id2 = await invRes.value.json();
        const invs = toArray(id2);
        const linked = invs.filter((inv) => {
          const seeds = inv.seeds || inv.entities || inv.objects || [];
          return (
            String(inv.id) === String(entity.id) ||
            seeds.some((s) => String(s.id || s) === String(entity.id))
          );
        });
        linked.forEach((inv) => {
          const idx = allNodes.length;
          allNodes.push({
            id:       `inv-${inv.id}`,
            label:    inv.title || inv.name || `Investigation #${inv.id}`,
            domain:   "investigation",
            r:        12,
            isCenter: false,
            data:     inv,
          });
          allLinks.push({ source: centerIdx, target: idx });
        });
      }

      // ops cases
      if (opsRes.status === "fulfilled" && opsRes.value.ok) {
        const od = await opsRes.value.json();
        const opsCases = toArray(od);
        const linked = opsCases.filter((c) => {
          const ents = c.linked_entities || c.entities || c.objects || [];
          return (
            String(c.id) === String(entity.id) ||
            ents.some((e2) => String(e2.id || e2) === String(entity.id))
          );
        });
        linked.forEach((c) => {
          const idx = allNodes.length;
          allNodes.push({
            id:       `ops-${c.id}`,
            label:    c.title || c.name || c.case_number || `Ops #${c.id}`,
            domain:   "ops",
            r:        12,
            isCenter: false,
            data:     c,
          });
          allLinks.push({ source: centerIdx, target: idx });
        });
      }

      const initialised = initNodes(allNodes, SVG_W, SVG_H);
      nodesRef.current = initialised;
      linksRef.current = allLinks;
      setNodes([...initialised]);
      setLinks([...allLinks]);
    } catch (e2) {
      setError(e2.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Verlet animation loop ───────────────────────────────────────────────
  useEffect(() => {
    if (!nodes.length) return;
    let alpha = 1.0;
    let tick  = 0;
    const MAX_TICKS = 300;

    function frame() {
      if (tick > MAX_TICKS) return;
      alpha *= 0.985;
      tickSim(nodesRef.current, linksRef.current, alpha, SVG_W, SVG_H);
      setNodes([...nodesRef.current]);
      tick++;
      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [nodes.length]);

  // ── pivot: click a non-center node → make it new seed ──────────────────
  const handlePivot = useCallback((node) => {
    if (node.isCenter) return;
    // Pivot only works for ontology nodes (have real ontology id)
    if (node.domain !== "ontology") {
      setSelected(node);
      return;
    }
    handleSelectSeed(node.data);
  }, [handleSelectSeed]);

  // ── ASSESS ─────────────────────────────────────────────────────────────
  const handleAssess = useCallback(async () => {
    if (!seed) return;
    setAssessing(true);
    setAssess("");
    try {
      const domainCounts = {};
      nodes.forEach((n) => {
        if (n.isCenter) return;
        domainCounts[n.domain] = (domainCounts[n.domain] || 0) + 1;
      });
      const summary = Object.entries(domainCounts)
        .map(([d, c]) => `${c} ${d}`)
        .join(", ");
      const prompt = `Cross-domain pivot analysis for entity "${seed.name || seed.id}": ` +
        `found connections to ${summary || "no linked records"}. ` +
        `Summarise the operational significance of this entity's cross-domain reach in 2 sentences.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body:    JSON.stringify({ message: prompt }),
      });
      if (!r.ok) throw new Error(`ASSESS ${r.status}`);
      const d  = await r.json();
      const txt = d.response || d.message || d.answer || JSON.stringify(d);
      setAssess(txt);
      speak(txt);
    } catch (e2) {
      setAssess(`ASSESS error: ${e2.message}`);
    } finally {
      setAssessing(false);
    }
  }, [seed, nodes]);

  // ── keyboard close ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  const inspectNode = hovered || selected;

  // ── render ─────────────────────────────────────────────────────────────
  return (
    <>
      {/* ◈ button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Cross-Domain Entity Pivot"
        style={{
          position:   "fixed",
          bottom:     8,
          left:       BTN_LEFT,
          zIndex:     414,
          background: open ? CY : "rgba(6,11,18,0.85)",
          border:     `1px solid ${open ? CY : BORD}`,
          color:      open ? "#060B12" : CY,
          fontFamily: "monospace",
          fontSize:   11,
          padding:    "3px 7px",
          cursor:     "pointer",
          borderRadius: 3,
          letterSpacing: "0.04em",
          whiteSpace: "nowrap",
        }}
      >
        ◈ CDPIVOT
      </button>

      {/* panel */}
      {open && (
        <div
          style={{
            position:   "fixed",
            bottom:     36,
            left:       Math.min(BTN_LEFT, window.innerWidth - PANEL_W - 12),
            width:      PANEL_W,
            height:     PANEL_H,
            background: SURF,
            border:     `1px solid ${BORD}`,
            borderRadius: 6,
            zIndex:     414,
            display:    "flex",
            flexDirection: "column",
            overflow:   "hidden",
            boxShadow:  "0 0 32px rgba(41,231,255,0.10)",
          }}
        >
          {/* header */}
          <div style={{
            display:    "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding:    "8px 12px",
            borderBottom: `1px solid ${BORD}`,
          }}>
            <span style={{ color: CY, fontFamily: "monospace", fontSize: 12, letterSpacing: "0.08em" }}>
              ◈ CROSS-DOMAIN ENTITY PIVOT
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 16 }}
            >✕</button>
          </div>

          {/* search bar */}
          <form
            onSubmit={handleSearch}
            style={{ display: "flex", gap: 6, padding: "8px 12px", borderBottom: `1px solid ${BORD}` }}
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search seed entity…"
              style={{
                flex:       1,
                background: "rgba(41,231,255,0.07)",
                border:     `1px solid ${BORD}`,
                borderRadius: 3,
                color:      CY,
                fontFamily: "monospace",
                fontSize:   12,
                padding:    "4px 8px",
                outline:    "none",
              }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                background: "rgba(41,231,255,0.12)",
                border:     `1px solid ${BORD}`,
                borderRadius: 3,
                color:      CY,
                fontFamily: "monospace",
                fontSize:   11,
                padding:    "4px 10px",
                cursor:     "pointer",
              }}
            >
              {loading ? "…" : "SEARCH"}
            </button>
          </form>

          {/* search results (seed selection) */}
          {results.length > 0 && (
            <div style={{
              maxHeight:  140,
              overflowY:  "auto",
              borderBottom: `1px solid ${BORD}`,
              padding:    "4px 8px",
            }}>
              {results.map((r) => (
                <div
                  key={r.id}
                  onClick={() => handleSelectSeed(r)}
                  style={{
                    padding:    "4px 6px",
                    cursor:     "pointer",
                    color:      CY,
                    fontFamily: "monospace",
                    fontSize:   11,
                    borderRadius: 3,
                    marginBottom: 2,
                    background: "transparent",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(41,231,255,0.08)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{ color: DIM }}>[{r.type || "obj"}]</span>{" "}
                  {r.name || r.label || r.id}
                </div>
              ))}
            </div>
          )}

          {error && (
            <div style={{ color: RD, fontFamily: "monospace", fontSize: 11, padding: "4px 12px" }}>
              {error}
            </div>
          )}

          {/* main area: graph + inspector */}
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            {/* SVG force graph */}
            <svg
              ref={svgRef}
              width={SVG_W}
              height={SVG_H}
              style={{ background: "rgba(0,0,0,0.25)", flexShrink: 0 }}
            >
              {/* domain legend */}
              {Object.entries(DOMAIN_COLOR).map(([domain, col], i) => (
                <g key={domain} transform={`translate(8,${16 + i * 16})`}>
                  <circle cx={5} cy={5} r={5} fill={col} fillOpacity={0.8} />
                  <text x={14} y={9} fill={col} fontFamily="monospace" fontSize={9}>
                    {domain}
                  </text>
                </g>
              ))}

              {/* links */}
              {links.map((lk, i) => {
                const s = nodes[lk.source];
                const t = nodes[lk.target];
                if (!s || !t) return null;
                return (
                  <line
                    key={i}
                    x1={s.x} y1={s.y}
                    x2={t.x} y2={t.y}
                    stroke={DIM}
                    strokeWidth={1}
                    strokeOpacity={0.5}
                  />
                );
              })}

              {/* nodes */}
              {nodes.map((n, i) => {
                const col   = DOMAIN_COLOR[n.domain] || DIM;
                const isHov = hovered?.id === n.id;
                const isSel = selected?.id === n.id;
                return (
                  <g
                    key={n.id}
                    transform={`translate(${n.x},${n.y})`}
                    style={{ cursor: "pointer" }}
                    onClick={() => handlePivot(n)}
                    onMouseEnter={() => setHovered(n)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    {/* ring for center node */}
                    {n.isCenter && (
                      <circle
                        r={n.r + 5}
                        fill="none"
                        stroke={col}
                        strokeWidth={2}
                        strokeOpacity={0.5}
                      />
                    )}
                    <circle
                      r={n.r}
                      fill={col}
                      fillOpacity={isHov || isSel ? 0.9 : 0.55}
                      stroke={col}
                      strokeWidth={isHov || isSel ? 2 : 1}
                    />
                    {(isHov || n.isCenter || n.r >= 14) && (
                      <text
                        dy={n.r + 11}
                        textAnchor="middle"
                        fill={col}
                        fontFamily="monospace"
                        fontSize={9}
                        style={{ pointerEvents: "none" }}
                      >
                        {(n.label || "").slice(0, 22)}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* empty state */}
              {nodes.length === 0 && !loading && (
                <text
                  x={SVG_W / 2} y={SVG_H / 2}
                  textAnchor="middle"
                  fill={DIM}
                  fontFamily="monospace"
                  fontSize={12}
                >
                  {seed ? "No cross-domain links found" : "Search and select a seed entity"}
                </text>
              )}
              {loading && (
                <text
                  x={SVG_W / 2} y={SVG_H / 2}
                  textAnchor="middle"
                  fill={CY}
                  fontFamily="monospace"
                  fontSize={12}
                >
                  Loading…
                </text>
              )}
            </svg>

            {/* right inspector */}
            <div style={{
              flex:       1,
              overflowY:  "auto",
              padding:    "8px 10px",
              fontFamily: "monospace",
              fontSize:   11,
              color:      DIM,
            }}>
              {seed && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ color: CY, marginBottom: 4, fontSize: 12 }}>SEED ENTITY</div>
                  <div style={{ color: CY }}>{seed.name || seed.label || seed.id}</div>
                  <div style={{ color: DIM }}>{seed.type || ""}</div>
                  <div style={{ color: DIM, marginTop: 4 }}>
                    {Object.entries(DOMAIN_COLOR).map(([dom, col]) => {
                      const cnt = nodes.filter((n) => !n.isCenter && n.domain === dom).length;
                      return cnt > 0 ? (
                        <span key={dom} style={{ color: col, marginRight: 8 }}>
                          {dom}: {cnt}
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>
              )}

              {inspectNode && (
                <div style={{ marginBottom: 10, borderTop: `1px solid ${BORD}`, paddingTop: 8 }}>
                  <div style={{
                    color: DOMAIN_COLOR[inspectNode.domain] || DIM,
                    marginBottom: 4,
                    fontSize: 11,
                    textTransform: "uppercase",
                  }}>
                    {inspectNode.domain}
                  </div>
                  <div style={{ color: CY, marginBottom: 4 }}>{inspectNode.label}</div>
                  {inspectNode.data && Object.entries(inspectNode.data).slice(0, 8).map(([k, v]) => (
                    <div key={k} style={{ marginBottom: 2 }}>
                      <span style={{ color: DIM }}>{k}: </span>
                      <span style={{ color: "#94A3B8" }}>{String(v).slice(0, 60)}</span>
                    </div>
                  ))}
                  {inspectNode.domain !== "ontology" && (
                    <div style={{ color: DIM, marginTop: 4, fontSize: 10 }}>
                      (Click ontology nodes to pivot)
                    </div>
                  )}
                </div>
              )}

              {/* ASSESS */}
              <div style={{ borderTop: `1px solid ${BORD}`, paddingTop: 8 }}>
                <button
                  onClick={handleAssess}
                  disabled={!seed || assessing}
                  style={{
                    background:   "rgba(41,231,255,0.10)",
                    border:       `1px solid ${BORD}`,
                    borderRadius: 3,
                    color:        seed ? CY : DIM,
                    fontFamily:   "monospace",
                    fontSize:     10,
                    padding:      "3px 8px",
                    cursor:       seed ? "pointer" : "default",
                    marginBottom: 6,
                  }}
                >
                  {assessing ? "ASSESSING…" : "ASSESS + TTS"}
                </button>
                {assess && (
                  <div style={{
                    color:      "#94A3B8",
                    fontSize:   11,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                  }}>
                    {assess}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
