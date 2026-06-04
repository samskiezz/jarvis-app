/**
 * LinkAnalysis — front end for the Wave-4 link-graph service.
 *
 * An interactive 2D node-link graph of the ontology, rendered dependency-free in
 * SVG. We seed from /v1/graph/subgraph (a seed id or "all"), lay the result out
 * with a cheap force-directed simulation (the same idea NeuralCore uses in 3D,
 * here in 2D for clarity), and let the analyst explore:
 *   • CLICK a node      → /v1/graph/expand/{id} merges its neighbours in.
 *   • PATH tool         → pick two nodes → /v1/graph/path highlights the route.
 *   • COLOR communities → /v1/graph/communities recolours nodes by cluster.
 *   • SIZE centrality   → /v1/graph/centrality scales node radius.
 * The side panel shows the selected node's detail plus its notes (/v1/notes).
 *
 * Every backend call degrades gracefully — a failure surfaces inline and the
 * graph keeps working with what it already has.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, DataState, Badge } from "@/components/PageKit";
import { Btn, KV, inputStyle } from "@/components/Wave1Kit";
import { apiGet, qs, asList, labelOf, useAsync } from "@/lib/wave1";

const ACCENT = C.neon;
const W = 760, H = 540;

// Deterministic PRNG so initial layouts are stable across renders.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COMMUNITY_COLORS = [C.neon, C.blue, C.gold, C.purple, C.orange, C.red, "#19c0c0", "#c0c019"];

const nid = (n) => (n && (n.id ?? n.node ?? n.key ?? n.name)) ?? null;
const edgeEnds = (e) => [
  e.a ?? e.source ?? e.from ?? e.src ?? (e[0] ?? null),
  e.b ?? e.target ?? e.to ?? e.dst ?? (e[1] ?? null),
];

/**
 * Cheap 2D force-directed layout: ring seed → repulsion + spring iterations.
 * Positions that already exist (carried across expansions) are preserved so the
 * graph doesn't jump every time we add neighbours.
 */
function layout(nodes, edges, prevPos) {
  const N = nodes.length;
  if (!N) return new Map();
  const rng = mulberry32(0x51e6 ^ N);
  const idx = new Map(nodes.map((n, i) => [nid(n), i]));
  const P = nodes.map((n, i) => {
    const prev = prevPos && prevPos.get(nid(n));
    if (prev) return { x: prev.x, y: prev.y };
    const ang = (i / N) * Math.PI * 2;
    const rad = 120 + (i % 4) * 28;
    return {
      x: W / 2 + Math.cos(ang) * rad + (rng() - 0.5) * 30,
      y: H / 2 + Math.sin(ang) * rad + (rng() - 0.5) * 30,
    };
  });
  const E = edges
    .map((e) => {
      const [a, b] = edgeEnds(e);
      return [idx.get(a), idx.get(b)];
    })
    .filter(([a, b]) => a != null && b != null && a !== b);

  const ITER = 140, K_REP = 9000, K_SPRING = 0.02, REST = 90;
  const disp = P.map(() => ({ x: 0, y: 0 }));
  for (let it = 0; it < ITER; it++) {
    for (let i = 0; i < N; i++) { disp[i].x = 0; disp[i].y = 0; }
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        let dx = P[i].x - P[j].x, dy = P[i].y - P[j].y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) d2 = 1;
        const f = K_REP / d2;
        const inv = 1 / Math.sqrt(d2);
        const fx = dx * inv * f, fy = dy * inv * f;
        disp[i].x += fx; disp[i].y += fy;
        disp[j].x -= fx; disp[j].y -= fy;
      }
    }
    for (const [a, b] of E) {
      const dx = P[b].x - P[a].x, dy = P[b].y - P[a].y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
      const f = K_SPRING * (d - REST);
      const fx = (dx / d) * f, fy = (dy / d) * f;
      disp[a].x += fx; disp[a].y += fy;
      disp[b].x -= fx; disp[b].y -= fy;
    }
    const cool = 1 - it / ITER;
    for (let i = 0; i < N; i++) {
      const len = Math.hypot(disp[i].x, disp[i].y) || 0.001;
      const cap = Math.min(len, 16) * cool;
      P[i].x += (disp[i].x / len) * cap;
      P[i].y += (disp[i].y / len) * cap;
      P[i].x = Math.max(24, Math.min(W - 24, P[i].x));
      P[i].y = Math.max(24, Math.min(H - 24, P[i].y));
    }
  }
  const pos = new Map();
  nodes.forEach((n, i) => pos.set(nid(n), P[i]));
  return pos;
}

export default function LinkAnalysis() {
  const [seed, setSeed] = useState("");
  const [depth, setDepth] = useState(2);

  const [nodes, setNodes] = useState([]);   // [{id,label,type,...}]
  const [edges, setEdges] = useState([]);    // [{a,b,rel?}]
  const [pos, setPos] = useState(new Map());

  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [notes, setNotes] = useState([]);
  const detailAsync = useAsync();

  // Community / centrality overlays.
  const [communities, setCommunities] = useState(null); // Map id -> communityIdx
  const [centrality, setCentrality] = useState(null);   // Map id -> score 0..1

  // Path tool.
  const [pathMode, setPathMode] = useState(false);
  const [pathPicks, setPathPicks] = useState([]); // [idA, idB]
  const [pathSet, setPathSet] = useState(new Set());
  const pathAsync = useAsync();

  const subAsync = useAsync();
  const expandAsync = useAsync();
  const overlayAsync = useAsync();

  // Merge helper — add nodes/edges without duplicating, preserving positions.
  const merge = useCallback((newNodes, newEdges) => {
    setNodes((prev) => {
      const seen = new Set(prev.map(nid));
      const merged = [...prev];
      for (const n of newNodes) {
        const id = nid(n);
        if (id == null || seen.has(id)) continue;
        seen.add(id);
        merged.push(n);
      }
      setEdges((pe) => {
        const ek = new Set(pe.map((e) => edgeEnds(e).join("→")));
        const me = [...pe];
        for (const e of newEdges) {
          const [a, b] = edgeEnds(e);
          if (a == null || b == null) continue;
          const k = [a, b].join("→");
          if (ek.has(k)) continue;
          ek.add(k);
          me.push({ a, b, rel: e.rel || e.relationship || e.label });
        }
        setPos((pp) => layout(merged, me, pp));
        return me;
      });
      return merged;
    });
  }, []);

  const loadSubgraph = useCallback(async () => {
    setSelected(null); setDetail(null); setNotes([]);
    setCommunities(null); setCentrality(null);
    setPathPicks([]); setPathSet(new Set());
    const body = await subAsync.run(() =>
      apiGet(`/v1/graph/subgraph${qs({ seeds: seed.trim(), depth })}`));
    if (!body) { setNodes([]); setEdges([]); setPos(new Map()); return; }
    const ns = asList(body, "nodes", "vertices");
    const es = asList(body, "edges", "links");
    const cleanEdges = es.map((e) => {
      const [a, b] = edgeEnds(e);
      return { a, b, rel: e.rel || e.relationship || e.label };
    });
    setNodes(ns);
    setEdges(cleanEdges);
    setPos(layout(ns, cleanEdges, null));
  }, [seed, depth, subAsync]);

  useEffect(() => { loadSubgraph(); }, []); // initial: all/seed empty

  const openNode = useCallback(async (id) => {
    setSelected(id);
    setDetail(null); setNotes([]);
    const d = await detailAsync.run(() => apiGet(`/v1/ontology/objects/${id}`).catch(() => null));
    setDetail(d ? (d.object || d) : null);
    try {
      const nb = await apiGet(`/v1/notes${qs({ resource_type: "node", resource_id: id })}`);
      setNotes(asList(nb, "notes"));
    } catch { setNotes([]); }
  }, [detailAsync]);

  const expand = useCallback(async (id) => {
    const body = await expandAsync.run(() => apiGet(`/v1/graph/expand/${id}`));
    if (!body) return;
    merge(asList(body, "nodes", "vertices"), asList(body, "edges", "links"));
  }, [expandAsync, merge]);

  const onNodeClick = useCallback((id) => {
    if (pathMode) {
      setPathPicks((prev) => {
        const next = prev.includes(id) ? prev : [...prev, id].slice(-2);
        return next;
      });
      return;
    }
    openNode(id);
    expand(id);
  }, [pathMode, openNode, expand]);

  // Run path query once two nodes are picked.
  useEffect(() => {
    if (!pathMode || pathPicks.length < 2) return;
    const [a, b] = pathPicks;
    (async () => {
      const body = await pathAsync.run(() => apiGet(`/v1/graph/path${qs({ a, b })}`));
      const seq = body
        ? (Array.isArray(body.path) ? body.path
          : Array.isArray(body.nodes) ? body.nodes
            : asList(body, "path", "nodes"))
        : [];
      const ids = seq.map((s) => (typeof s === "object" ? nid(s) : s)).filter((x) => x != null);
      setPathSet(new Set(ids.length ? ids : [a, b]));
    })();
  }, [pathPicks, pathMode, pathAsync]);

  const loadCommunities = useCallback(async () => {
    const body = await overlayAsync.run(() => apiGet("/v1/graph/communities"));
    if (!body) return;
    const map = new Map();
    const groups = asList(body, "communities", "clusters", "groups");
    if (groups.length && (Array.isArray(groups[0]) || groups[0].members || groups[0].nodes)) {
      groups.forEach((g, ci) => {
        const members = Array.isArray(g) ? g : asList(g, "members", "nodes");
        members.forEach((m) => map.set(typeof m === "object" ? nid(m) : m, ci));
      });
    } else {
      // flat {id, community} list, or object map id->community
      const flat = asList(body, "assignments", "nodes");
      if (flat.length) flat.forEach((x) => map.set(nid(x), x.community ?? x.cluster ?? 0));
      else if (body && typeof body === "object") {
        Object.entries(body).forEach(([k, v]) => { if (typeof v === "number") map.set(k, v); });
      }
    }
    setCommunities(map.size ? map : null);
  }, [overlayAsync]);

  const loadCentrality = useCallback(async () => {
    const body = await overlayAsync.run(() => apiGet("/v1/graph/centrality"));
    if (!body) return;
    const map = new Map();
    const list = asList(body, "centrality", "scores", "nodes");
    if (list.length) {
      list.forEach((x) => map.set(nid(x), Number(x.score ?? x.centrality ?? x.value ?? 0)));
    } else if (body && typeof body === "object") {
      Object.entries(body).forEach(([k, v]) => { if (typeof v === "number") map.set(k, v); });
    }
    // Normalise to 0..1.
    const vals = [...map.values()];
    const max = Math.max(1e-9, ...vals);
    for (const [k, v] of map) map.set(k, v / max);
    setCentrality(map.size ? map : null);
  }, [overlayAsync]);

  const clearOverlays = () => { setCommunities(null); setCentrality(null); };
  const exitPath = () => { setPathMode(false); setPathPicks([]); setPathSet(new Set()); };

  const colorOf = useCallback((id, type) => {
    if (communities && communities.has(id)) return COMMUNITY_COLORS[communities.get(id) % COMMUNITY_COLORS.length];
    return C.type[type] || C.neon;
  }, [communities]);

  const radiusOf = useCallback((id) => {
    if (centrality && centrality.has(id)) return 4 + centrality.get(id) * 12;
    return 6;
  }, [centrality]);

  const detailProps = useMemo(() => {
    const p = detail && (detail.properties || detail.props);
    return p && typeof p === "object" ? Object.entries(p) : [];
  }, [detail]);

  // Pan/zoom via a simple viewBox (keeps it dependency-free).
  const [view, setView] = useState({ x: 0, y: 0, w: W, h: H });
  const dragRef = useRef(null);
  const onWheel = (e) => {
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    setView((v) => {
      const nw = Math.max(160, Math.min(W * 2.5, v.w * factor));
      const nh = nw * (H / W);
      return { x: v.x + (v.w - nw) / 2, y: v.y + (v.h - nh) / 2, w: nw, h: nh };
    });
  };
  const onDown = (e) => { dragRef.current = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y }; };
  const onMove = (e) => {
    if (!dragRef.current) return;
    const sx = view.w / W, sy = view.h / H;
    setView((v) => ({ ...v,
      x: dragRef.current.vx - (e.clientX - dragRef.current.px) * sx,
      y: dragRef.current.vy - (e.clientY - dragRef.current.py) * sy }));
  };
  const onUp = () => { dragRef.current = null; };

  return (
    <PageShell
      title="LINK ANALYSIS"
      subtitle="WAVE-4 GRAPH — SUBGRAPH · EXPAND · PATH · COMMUNITIES · CENTRALITY"
      accent={ACCENT}
      actions={<Btn accent={ACCENT} onClick={loadSubgraph}>↻ RELOAD</Btn>}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
        <StatTile label="Nodes" value={nodes.length} accent={ACCENT} />
        <StatTile label="Edges" value={edges.length} accent={C.blue} />
        <StatTile label="Communities" value={communities ? new Set(communities.values()).size : "—"} accent={C.purple} />
        <StatTile label="Mode" value={pathMode ? `path ${pathPicks.length}/2` : "explore"} accent={C.gold} />
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <input value={seed} onChange={(e) => setSeed(e.target.value)}
          placeholder="seed id(s) — blank = all" style={{ ...inputStyle, width: 220 }} />
        <input value={depth} onChange={(e) => setDepth(e.target.value.replace(/\D/g, "") || "")}
          placeholder="depth" style={{ ...inputStyle, width: 70 }} />
        <Btn accent={ACCENT} onClick={loadSubgraph} disabled={subAsync.loading}>
          {subAsync.loading ? "…" : "SEED"}
        </Btn>
        <span style={{ width: 1, height: 22, background: C.border }} />
        <Btn accent={C.purple} onClick={loadCommunities} disabled={overlayAsync.loading}>COLOR: COMMUNITIES</Btn>
        <Btn accent={C.gold} onClick={loadCentrality} disabled={overlayAsync.loading}>SIZE: CENTRALITY</Btn>
        {(communities || centrality) && <Btn accent={C.text} onClick={clearOverlays}>CLEAR</Btn>}
        <span style={{ width: 1, height: 22, background: C.border }} />
        {!pathMode
          ? <Btn accent={C.blue} onClick={() => { setPathMode(true); setPathPicks([]); setPathSet(new Set()); }}>PATH TOOL</Btn>
          : <Btn accent={C.red} onClick={exitPath}>EXIT PATH</Btn>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)", gap: 14, alignItems: "start" }}>
        {/* GRAPH */}
        <PanelCard title="ONTOLOGY GRAPH" accent={ACCENT}
          right={<span style={{ fontSize: 8, color: C.text }}>scroll = zoom · drag = pan · click = expand</span>}>
          <DataState loading={subAsync.loading} error={subAsync.error}
            empty={!subAsync.loading && nodes.length === 0} emptyLabel="No graph — seed an id or reload">
            <div style={{ position: "relative" }}>
              {pathMode && (
                <div style={{ position: "absolute", top: 6, left: 6, zIndex: 2, fontSize: 9, color: C.blue,
                  background: "rgba(0,0,0,0.6)", border: `1px solid ${C.border}`, borderRadius: 4, padding: "4px 8px" }}>
                  PATH: pick two nodes {pathAsync.loading ? "· routing…" : ""}
                </div>
              )}
              <svg viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} width="100%" height={H}
                onWheel={onWheel} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
                style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${C.border}`, borderRadius: 6,
                  cursor: dragRef.current ? "grabbing" : "grab", touchAction: "none" }}>
                {/* edges */}
                {edges.map((e, i) => {
                  const [a, b] = edgeEnds(e);
                  const pa = pos.get(a), pb = pos.get(b);
                  if (!pa || !pb) return null;
                  const onPath = pathSet.has(a) && pathSet.has(b);
                  return (
                    <line key={i} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                      stroke={onPath ? C.gold : "rgba(140,170,190,0.18)"}
                      strokeWidth={onPath ? 2.2 : 1} />
                  );
                })}
                {/* nodes */}
                {nodes.map((n) => {
                  const id = nid(n);
                  const p = pos.get(id);
                  if (!p) return null;
                  const isSel = id === selected;
                  const isPick = pathPicks.includes(id);
                  const onPath = pathSet.has(id);
                  const r = radiusOf(id);
                  const col = colorOf(id, n.type);
                  return (
                    <g key={id} transform={`translate(${p.x},${p.y})`}
                      style={{ cursor: "pointer" }}
                      onClick={(ev) => { ev.stopPropagation(); onNodeClick(id); }}>
                      <circle r={r}
                        fill={col + (isSel || onPath ? "" : "cc")}
                        stroke={isPick ? C.blue : isSel ? "#fff" : onPath ? C.gold : "rgba(0,0,0,0.5)"}
                        strokeWidth={isSel || isPick || onPath ? 2 : 1} />
                      {(isSel || r > 9) && (
                        <text x={r + 3} y={3} fontSize={8} fill={C.textB}
                          style={{ pointerEvents: "none", fontFamily: "monospace" }}>
                          {labelOf(n).slice(0, 22)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
            {/* Legend */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8, fontSize: 8, color: C.text }}>
              {communities && <span>● color = community</span>}
              {!communities && <span>● color = type</span>}
              {centrality && <span>◯ size = centrality</span>}
              <span style={{ color: C.gold }}>━ path</span>
              {(expandAsync.loading) && <span style={{ color: C.neon }}>expanding…</span>}
              {expandAsync.error && <span style={{ color: C.red }}>expand failed</span>}
              {overlayAsync.error && <span style={{ color: C.red }}>overlay failed</span>}
              {pathAsync.error && <span style={{ color: C.red }}>path failed</span>}
            </div>
          </DataState>
        </PanelCard>

        {/* SIDE PANEL */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <PanelCard title="NODE DETAIL" accent={C.blue}>
            {!selected ? (
              <div style={{ padding: 14, fontSize: 10, color: C.text, letterSpacing: 1 }}>
                Click a node to inspect it (and pull its neighbours).
              </div>
            ) : (
              <DataState loading={detailAsync.loading} error={detailAsync.error} empty={!detail && !detailAsync.loading}
                emptyLabel="No detail for this node">
                {detail && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.blue }}>{labelOf(detail)}</div>
                      <div style={{ fontSize: 8, color: C.text, marginTop: 2 }}>{detail.type || "—"} · {selected}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Btn accent={C.neon} onClick={() => expand(selected)} style={{ fontSize: 8, padding: "4px 8px" }}>＋ EXPAND</Btn>
                      {detail.type && <Badge color={C.type[detail.type] || C.neon}>{detail.type}</Badge>}
                    </div>
                    {detailProps.length > 0 && (
                      <div>
                        <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, marginBottom: 4 }}>PROPERTIES</div>
                        {detailProps.map(([k, v]) => <KV key={k} k={k} v={v} />)}
                      </div>
                    )}
                  </div>
                )}
              </DataState>
            )}
          </PanelCard>

          {selected && (
            <PanelCard title="NOTES" accent={C.gold}
              right={<span style={{ fontSize: 8, color: C.text }}>{notes.length}</span>}>
              {notes.length === 0 ? (
                <div style={{ fontSize: 9, color: C.text }}>No notes on this node.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto" }}>
                  {notes.map((n, i) => (
                    <div key={n.id || i} style={{ border: `1px solid ${C.border}`, background: "rgba(0,0,0,0.25)",
                      borderRadius: 5, padding: "7px 9px" }}>
                      <div style={{ fontSize: 9, color: C.textB, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                        {n.text || n.body || n.content || labelOf(n)}
                      </div>
                      <div style={{ fontSize: 8, color: C.text, marginTop: 3 }}>
                        {n.author || n.user || "—"}{n.created_at ? ` · ${n.created_at}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </PanelCard>
          )}

          {pathMode && (
            <PanelCard title="PATH" accent={C.blue}>
              <div style={{ fontSize: 9, color: C.text, lineHeight: 1.6 }}>
                <div>A: <span style={{ color: C.textB }}>{pathPicks[0] || "—"}</span></div>
                <div>B: <span style={{ color: C.textB }}>{pathPicks[1] || "—"}</span></div>
                <div style={{ marginTop: 6 }}>
                  Highlighted: <span style={{ color: C.gold }}>{pathSet.size}</span> node(s)
                </div>
                {pathAsync.error && <div style={{ color: C.red, marginTop: 6 }}>⚠ no path found</div>}
              </div>
            </PanelCard>
          )}
        </div>
      </div>
    </PageShell>
  );
}
