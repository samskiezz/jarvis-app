/**
 * EntityDeepLinkNavigator — F308.
 *
 * Data sources (all real — backed by server/routes/ontology.py):
 *   GET  /v1/ontology/objects?q={term}        → {items:[...], count}
 *   GET  /v1/ontology/objects/{id}/neighbors  → {center, objects:[...], links:[...]}
 *
 * Displays:
 *   - Search input → entity result list
 *   - Click entity → SVG Verlet force graph of its neighbors (depth=1)
 *   - Breadcrumb trail tracks navigation path (max depth 5)
 *   - "Back" pops the breadcrumb
 *   - Left inspector panel shows current entity's full props
 *   - Click any neighbor node → extend breadcrumb + re-fetch neighbors
 *   - ASSESS speaks about entity relationships + TTS
 *
 * Toggle: ◈ ENTLINK  left:220280  bottom:8  zIndex:404
 * Event:  jarvis:entlink-toggle
 * Voice:  "entity deep-link / entlink / entity navigator / entity graph /
 *          entity links / deep link navigator / ontology links /
 *          entity neighbors / entity relationships"
 *
 * Exported for JarvisBrain: isEntlinkQuery
 * Mounted via src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

// ── palette ────────────────────────────────────────────────────────────────
const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const RD   = "#F87171";
const VI   = "#A78BFA";
const SURF = "rgba(6,11,18,0.97)";
const BORD = "rgba(41,231,255,0.18)";
const DIM  = "rgba(41,231,255,0.40)";

// ── layout constants ───────────────────────────────────────────────────────
const BTN_LEFT  = 220280;
const PANEL_W   = 920;
const PANEL_H   = 640;
const SVG_W     = 460;
const SVG_H     = 400;
const MAX_DEPTH = 5;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── JarvisBrain exports ───────────────────────────────────────────────────
const ENTLINK_RE =
  /\b(entity[\s-]?deep[\s-]?link|entlink\b|entity[\s-]?navigator|entity[\s-]?graph|entity[\s-]?links|deep[\s-]?link[\s-]?navigator|ontology[\s-]?links|entity[\s-]?neighbors|entity[\s-]?relationships)\b/i;

export function isEntlinkQuery(q) {
  return ENTLINK_RE.test(q || "");
}

// ── type colours ───────────────────────────────────────────────────────────
const TYPE_COLORS = [CY, VI, AM, GN, "#FB923C", "#34D399", "#F472B6", "#60A5FA", "#FBBF24"];
function typeColor(type, palette) {
  if (!type) return DIM;
  if (!palette[type]) {
    const idx = Object.keys(palette).length % TYPE_COLORS.length;
    palette[type] = TYPE_COLORS[idx];
  }
  return palette[type];
}

// ── Verlet simulation ──────────────────────────────────────────────────────
function initNodes(objects, center, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const nodes = [{ ...center, x: cx, y: cy, vx: 0, vy: 0, r: 20, isCenter: true }];
  objects.forEach((o, i) => {
    const ang = (2 * Math.PI * i) / Math.max(objects.length, 1);
    nodes.push({
      ...o,
      x:  cx + Math.cos(ang) * 130,
      y:  cy + Math.sin(ang) * 130,
      vx: 0, vy: 0,
      r:  11,
      isCenter: false,
    });
  });
  return nodes;
}

function tickSim(nodes, links, alpha, w, h) {
  const REPEL  = 3800;
  const SPRING = 0.06;
  const LEN    = 100;
  const DAMP   = 0.80;
  const GRAV   = 0.03;
  const cx = w / 2;
  const cy = h / 2;
  const N  = nodes.length;

  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const dx = nodes[j].x - nodes[i].x;
      const dy = nodes[j].y - nodes[i].y;
      const d2 = dx * dx + dy * dy + 1;
      const f  = (REPEL * alpha) / d2;
      nodes[i].vx -= f * dx;
      nodes[i].vy -= f * dy;
      nodes[j].vx += f * dx;
      nodes[j].vy += f * dy;
    }
  }

  const byId = {};
  nodes.forEach((n) => (byId[n.id] = n));
  links.forEach((lk) => {
    const a = byId[lk.a];
    const b = byId[lk.b];
    if (!a || !b) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d  = Math.sqrt(dx * dx + dy * dy) + 0.001;
    const f  = (d - LEN) * SPRING * alpha;
    a.vx += (f * dx) / d;
    a.vy += (f * dy) / d;
    b.vx -= (f * dx) / d;
    b.vy -= (f * dy) / d;
  });

  for (let i = 0; i < N; i++) {
    const n = nodes[i];
    if (n.isCenter) { n.vx = 0; n.vy = 0; continue; }
    n.vx += (cx - n.x) * GRAV * alpha;
    n.vy += (cy - n.y) * GRAV * alpha;
    n.vx *= DAMP;
    n.vy *= DAMP;
    n.x  += n.vx;
    n.y  += n.vy;
    n.x = Math.max(n.r + 4, Math.min(w - n.r - 4, n.x));
    n.y = Math.max(n.r + 4, Math.min(h - n.r - 4, n.y));
  }
}

// ── helpers ────────────────────────────────────────────────────────────────
function normalise(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ["items", "objects", "results", "data"]) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function shortLabel(obj) {
  if (!obj) return "?";
  return obj.label || obj.id?.slice(0, 10) || "?";
}

function typeBadge(type) {
  return (
    <span style={{
      display: "inline-block", padding: "1px 5px", borderRadius: 3,
      border: `1px solid ${VI}55`, background: `${VI}18`,
      color: VI, fontSize: 9, letterSpacing: 1, marginRight: 5,
    }}>{type || "?"}</span>
  );
}

// ── TTS ────────────────────────────────────────────────────────────────────
async function tts(text) {
  try {
    const r = await fetch(`${apiBase}/v1/voice/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ text }),
    });
    const d = await r.json();
    if (d?.audio_url) new Audio(d.audio_url).play().catch(() => {});
  } catch { /* skip */ }
}

// ── ASSESS ─────────────────────────────────────────────────────────────────
async function assess(entity, neighborCount, linkCount, setBrief, setAssessing) {
  setAssessing(true);
  setBrief("");
  try {
    const snap = entity
      ? `Entity "${shortLabel(entity)}" (type: ${entity.type || "unknown"}) has ${neighborCount} neighbor(s) and ${linkCount} link(s).`
      : "No entity selected.";
    const r = await fetch(`${apiBase}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `Assess entity relationships: ${snap} Summarise in 2 sentences what this entity's connections suggest and any notable patterns.`,
      }),
    });
    const d = await r.json();
    const txt = d?.response || d?.reply || d?.text || "No assessment available.";
    setBrief(txt);
    tts(txt.slice(0, 300));
  } catch {
    setBrief("Assessment unavailable.");
  }
  setAssessing(false);
}

// ─────────────────────────────────────────────────────────────────────────────
export default function EntityDeepLinkNavigator() {
  const [open, setOpen]                 = useState(false);
  const [query, setQuery]               = useState("");
  const [searching, setSearching]       = useState(false);
  const [results, setResults]           = useState([]);
  const [searchErr, setSearchErr]       = useState("");

  // breadcrumb: array of {entity, neighbors, links}
  const [crumbs, setCrumbs]             = useState([]);
  const [loadingNeighbors, setLoadingN] = useState(false);
  const [neighborErr, setNeighborErr]   = useState("");

  // force graph state
  const [simNodes, setSimNodes]         = useState([]);
  const [graphLinks, setGraphLinks]     = useState([]);
  const simRef                          = useRef(null);
  const rafRef                          = useRef(null);
  const colorPalRef                     = useRef({});

  // inspector tooltip
  const [hovered, setHovered]           = useState(null);

  // assess
  const [brief, setBrief]               = useState("");
  const [assessing, setAssessing]       = useState(false);

  // ── derived ─────────────────────────────────────────────────────────────
  const currentCrumb = crumbs[crumbs.length - 1] || null;
  const currentEntity = currentCrumb?.entity || null;
  const depth = crumbs.length;

  // ── search ───────────────────────────────────────────────────────────────
  const doSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearchErr("");
    setResults([]);
    try {
      const r = await fetch(`${apiBase}/v1/ontology/objects?q=${encodeURIComponent(q)}`);
      if (!r.ok) { setSearchErr(`Server ${r.status}`); setSearching(false); return; }
      const d = await r.json();
      setResults(normalise(d));
    } catch (e) {
      setSearchErr(e?.message || "Search failed.");
    }
    setSearching(false);
  }, [query]);

  // ── load neighbors ────────────────────────────────────────────────────────
  const loadNeighbors = useCallback(async (entity) => {
    setLoadingN(true);
    setNeighborErr("");
    try {
      const r = await fetch(`${apiBase}/v1/ontology/objects/${encodeURIComponent(entity.id)}/neighbors?depth=1`);
      if (!r.ok) { setNeighborErr(`Server ${r.status}`); setLoadingN(false); return; }
      const d = await r.json();
      const neighbors = d?.objects || [];
      const links     = d?.links    || [];
      setCrumbs((prev) => {
        const next = [...prev, { entity, neighbors, links }];
        return next.slice(-MAX_DEPTH);
      });
    } catch (e) {
      setNeighborErr(e?.message || "Load failed.");
    }
    setLoadingN(false);
  }, []);

  // ── build simulation ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentCrumb) { setSimNodes([]); setGraphLinks([]); return; }
    const { entity, neighbors, links } = currentCrumb;
    colorPalRef.current = {};
    const nodes = initNodes(neighbors, entity, SVG_W, SVG_H);
    simRef.current = nodes;
    setSimNodes([...nodes]);
    setGraphLinks(links);

    let tick = 0;
    const alpha0 = 1.0;

    function loop() {
      tick++;
      const alpha = Math.max(0.02, alpha0 * Math.pow(0.96, tick));
      tickSim(simRef.current, links, alpha, SVG_W, SVG_H);
      if (tick % 2 === 0) setSimNodes([...simRef.current]);
      if (tick < 200) rafRef.current = requestAnimationFrame(loop);
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [currentCrumb]);

  // ── toggle ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:entlink-toggle", onToggle);
    return () => window.removeEventListener("jarvis:entlink-toggle", onToggle);
  }, []);

  // ── node click ────────────────────────────────────────────────────────────
  const onNodeClick = useCallback((nodeId) => {
    const node = simRef.current?.find((n) => n.id === nodeId);
    if (!node || node.isCenter) return;
    if (depth >= MAX_DEPTH) return;
    const entity = { id: node.id, type: node.type, label: node.label, props: node.props };
    loadNeighbors(entity);
  }, [depth, loadNeighbors]);

  const goBack = useCallback(() => {
    setCrumbs((prev) => prev.slice(0, -1));
  }, []);

  const selectFromResults = useCallback((item) => {
    setCrumbs([]);
    setResults([]);
    setQuery("");
    loadNeighbors(item);
  }, [loadNeighbors]);

  // ── render guard ──────────────────────────────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="F308 Entity Deep-Link Navigator"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 404,
          background: "rgba(6,11,18,0.82)", border: `1px solid ${CY}55`,
          color: CY, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 1, padding: "3px 7px", cursor: "pointer",
          borderRadius: 3, whiteSpace: "nowrap",
        }}
      >◈ ENTLINK</button>
    );
  }

  const pal = colorPalRef.current;
  const centerNode = simNodes.find((n) => n.isCenter);

  return (
    <>
      <button
        onClick={() => setOpen(false)}
        title="Close Entity Deep-Link Navigator"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 404,
          background: CY, border: `1px solid ${CY}`,
          color: "#04060A", fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 1, padding: "3px 7px", cursor: "pointer",
          borderRadius: 3, whiteSpace: "nowrap",
        }}
      >◈ ENTLINK</button>

      <div style={{
        position: "fixed",
        left: Math.min(BTN_LEFT, window.innerWidth - PANEL_W - 12),
        bottom: 42,
        width: PANEL_W,
        maxWidth: "calc(100vw - 24px)",
        height: PANEL_H,
        zIndex: 404,
        background: SURF,
        border: `1px solid ${BORD}`,
        borderRadius: 10,
        boxShadow: `0 0 60px ${CY}18`,
        fontFamily: "'JetBrains Mono',monospace",
        color: "#DCEBF5",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* ── header ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px 8px", borderBottom: `1px solid ${BORD}`,
          flexShrink: 0,
        }}>
          <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
            ◈ ENTITY DEEP-LINK NAVIGATOR
          </span>
          <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button
              onClick={() => assess(
                currentEntity,
                currentCrumb?.neighbors?.length ?? 0,
                currentCrumb?.links?.length ?? 0,
                setBrief, setAssessing,
              )}
              disabled={assessing || !currentEntity}
              style={{
                background: "transparent", border: `1px solid ${AM}88`,
                color: AM, fontSize: 9, padding: "2px 7px", borderRadius: 3,
                cursor: "pointer", letterSpacing: 1,
              }}
            >{assessing ? "◌ ASSESSING…" : "▶ ASSESS"}</button>
            <button
              onClick={() => { setCrumbs([]); setResults([]); setQuery(""); setBrief(""); }}
              style={{
                background: "transparent", border: `1px solid ${DIM}`,
                color: DIM, fontSize: 9, padding: "2px 7px", borderRadius: 3, cursor: "pointer",
              }}
            >RESET</button>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "transparent", border: `1px solid ${DIM}`,
                color: DIM, fontSize: 9, padding: "2px 6px", borderRadius: 3, cursor: "pointer",
              }}
            >✕</button>
          </span>
        </div>

        {/* ── ASSESS brief ── */}
        {brief && (
          <div style={{
            padding: "7px 14px", background: `${AM}12`,
            borderBottom: `1px solid ${AM}33`,
            fontSize: 10, color: AM, lineHeight: 1.5, flexShrink: 0,
          }}>{brief}</div>
        )}

        {/* ── search bar ── */}
        <div style={{
          display: "flex", gap: 6, alignItems: "center",
          padding: "8px 14px", borderBottom: `1px solid ${BORD}`,
          flexShrink: 0,
        }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }}
            placeholder="Search entities by name / keyword…"
            style={{
              flex: 1, background: "rgba(41,231,255,0.06)",
              border: `1px solid ${CY}44`, color: "#DCEBF5",
              padding: "4px 8px", borderRadius: 4, fontSize: 10,
              fontFamily: "'JetBrains Mono',monospace",
            }}
          />
          <button
            onClick={doSearch}
            disabled={searching || !query.trim()}
            style={{
              background: searching ? "transparent" : CY,
              border: `1px solid ${CY}88`,
              color: searching ? CY : "#04060A",
              fontSize: 9, padding: "4px 10px", borderRadius: 4,
              cursor: "pointer", letterSpacing: 1,
              fontFamily: "'JetBrains Mono',monospace",
            }}
          >{searching ? "◌…" : "SEARCH"}</button>
        </div>

        {/* ── breadcrumb trail ── */}
        {crumbs.length > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap",
            padding: "5px 14px", borderBottom: `1px solid ${BORD}`,
            flexShrink: 0, background: "rgba(41,231,255,0.03)",
          }}>
            {depth > 1 && (
              <button
                onClick={goBack}
                style={{
                  background: "transparent", border: `1px solid ${CY}55`,
                  color: CY, fontSize: 9, padding: "1px 6px", borderRadius: 3,
                  cursor: "pointer", letterSpacing: 1, marginRight: 4,
                }}
              >← BACK</button>
            )}
            {crumbs.map((c, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {i > 0 && <span style={{ color: DIM, fontSize: 9 }}>→</span>}
                <span style={{
                  color: i === crumbs.length - 1 ? CY : DIM,
                  fontSize: 9, padding: "1px 5px",
                  background: i === crumbs.length - 1 ? `${CY}14` : "transparent",
                  borderRadius: 3,
                }}>
                  {c.entity?.type ? `${c.entity.type}:` : ""}{shortLabel(c.entity)}
                </span>
              </span>
            ))}
            <span style={{ color: DIM, fontSize: 8, marginLeft: 4 }}>
              depth {depth}/{MAX_DEPTH}
            </span>
          </div>
        )}

        {/* ── body: search results / inspector + graph ── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* left panel */}
          <div style={{
            width: 260, flexShrink: 0, overflowY: "auto",
            borderRight: `1px solid ${BORD}`,
          }}>
            {/* search results */}
            {results.length > 0 && !currentEntity && (
              <>
                <div style={{ padding: "6px 12px 4px", color: DIM, fontSize: 9, letterSpacing: 1 }}>
                  RESULTS ({results.length})
                </div>
                {searchErr && (
                  <div style={{ padding: "4px 12px", color: RD, fontSize: 9 }}>{searchErr}</div>
                )}
                {results.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => selectFromResults(item)}
                    style={{
                      padding: "7px 12px", borderBottom: `1px solid ${BORD}`,
                      cursor: "pointer",
                      transition: "background 0.12s",
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = `${CY}0e`}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <div style={{ display: "flex", alignItems: "center" }}>
                      {typeBadge(item.type)}
                      <span style={{ color: "#DCEBF5", fontSize: 10 }}>
                        {shortLabel(item)}
                      </span>
                    </div>
                    <div style={{ color: DIM, fontSize: 9, marginTop: 2 }}>
                      id: {item.id?.slice(0, 16)}
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* no results / search error */}
            {results.length === 0 && !searching && !currentEntity && (
              <div style={{ padding: 16, color: DIM, fontSize: 10 }}>
                {searchErr
                  ? <span style={{ color: RD }}>{searchErr}</span>
                  : "Search for an entity to begin exploring."}
              </div>
            )}
            {searching && (
              <div style={{ padding: 16, color: DIM, fontSize: 10 }}>◌ searching…</div>
            )}

            {/* entity inspector */}
            {currentEntity && (
              <div style={{ padding: "10px 12px" }}>
                <div style={{ color: CY, fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
                  {shortLabel(currentEntity)}
                </div>
                <div style={{ marginBottom: 6 }}>{typeBadge(currentEntity.type)}</div>
                <div style={{ color: DIM, fontSize: 9, marginBottom: 8 }}>
                  id: {currentEntity.id}
                </div>
                {currentCrumb && (
                  <div style={{ color: DIM, fontSize: 9, marginBottom: 8 }}>
                    {currentCrumb.neighbors.length} neighbor(s) · {currentCrumb.links.length} link(s)
                  </div>
                )}
                {currentEntity.props && typeof currentEntity.props === "object" && (
                  <div>
                    <div style={{ color: VI, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>PROPS</div>
                    {Object.entries(currentEntity.props).map(([k, v]) => (
                      <div key={k} style={{
                        display: "flex", gap: 6, marginBottom: 3,
                        fontSize: 9, color: "#BEDCF0",
                      }}>
                        <span style={{ color: DIM, minWidth: 80, flexShrink: 0 }}>{k}</span>
                        <span style={{ wordBreak: "break-all" }}>
                          {typeof v === "object" ? JSON.stringify(v) : String(v)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {loadingNeighbors && (
                  <div style={{ color: DIM, fontSize: 9, marginTop: 8 }}>◌ loading neighbors…</div>
                )}
                {neighborErr && (
                  <div style={{ color: RD, fontSize: 9, marginTop: 8 }}>{neighborErr}</div>
                )}
              </div>
            )}
          </div>

          {/* graph pane */}
          <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
            {!currentEntity && (
              <div style={{
                position: "absolute", inset: 0, display: "flex",
                alignItems: "center", justifyContent: "center",
                color: DIM, fontSize: 10,
              }}>
                Select an entity to explore its graph.
              </div>
            )}
            {loadingNeighbors && (
              <div style={{
                position: "absolute", inset: 0, display: "flex",
                alignItems: "center", justifyContent: "center",
                color: DIM, fontSize: 10,
              }}>◌ loading neighbors…</div>
            )}
            {currentEntity && !loadingNeighbors && (
              <svg
                width={SVG_W}
                height={SVG_H}
                style={{ display: "block", background: "transparent" }}
              >
                {/* edges */}
                {graphLinks.map((lk, i) => {
                  const a = simNodes.find((n) => n.id === lk.a);
                  const b = simNodes.find((n) => n.id === lk.b);
                  if (!a || !b) return null;
                  return (
                    <g key={lk.id || i}>
                      <line
                        x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                        stroke={`${CY}40`} strokeWidth={1.2}
                      />
                      {lk.relation && (
                        <text
                          x={(a.x + b.x) / 2}
                          y={(a.y + b.y) / 2 - 4}
                          textAnchor="middle"
                          fill={DIM}
                          fontSize={7}
                          style={{ pointerEvents: "none" }}
                        >{lk.relation}</text>
                      )}
                    </g>
                  );
                })}

                {/* nodes */}
                {simNodes.map((node) => {
                  const col = node.isCenter ? CY : typeColor(node.type, pal);
                  const isHov = hovered?.id === node.id;
                  return (
                    <g
                      key={node.id}
                      onClick={() => { if (!node.isCenter) onNodeClick(node.id); }}
                      style={{ cursor: node.isCenter ? "default" : depth < MAX_DEPTH ? "pointer" : "not-allowed" }}
                      onMouseEnter={() => setHovered(node)}
                      onMouseLeave={() => setHovered(null)}
                    >
                      <circle
                        cx={node.x} cy={node.y} r={node.r}
                        fill={`${col}22`}
                        stroke={isHov ? col : `${col}88`}
                        strokeWidth={node.isCenter ? 2.5 : 1.5}
                      />
                      <text
                        x={node.x}
                        y={node.y + node.r + 10}
                        textAnchor="middle"
                        fill={col}
                        fontSize={8}
                        style={{ pointerEvents: "none" }}
                      >
                        {shortLabel(node).slice(0, 12)}
                      </text>
                      {node.type && (
                        <text
                          x={node.x}
                          y={node.y + 3}
                          textAnchor="middle"
                          fill={col}
                          fontSize={7}
                          style={{ pointerEvents: "none" }}
                        >{node.type.slice(0, 6)}</text>
                      )}
                    </g>
                  );
                })}

                {/* hover tooltip */}
                {hovered && !hovered.isCenter && (
                  <g>
                    <rect
                      x={Math.min(hovered.x + 14, SVG_W - 170)}
                      y={Math.max(hovered.y - 28, 4)}
                      width={160}
                      height={42}
                      rx={4}
                      fill="rgba(6,11,18,0.96)"
                      stroke={`${CY}44`}
                    />
                    <text
                      x={Math.min(hovered.x + 22, SVG_W - 162)}
                      y={Math.max(hovered.y - 14, 16)}
                      fill={CY}
                      fontSize={9}
                      style={{ pointerEvents: "none" }}
                    >{shortLabel(hovered)}</text>
                    <text
                      x={Math.min(hovered.x + 22, SVG_W - 162)}
                      y={Math.max(hovered.y + 2, 32)}
                      fill={DIM}
                      fontSize={8}
                      style={{ pointerEvents: "none" }}
                    >{hovered.type || "unknown"} · {hovered.id?.slice(0, 14)}</text>
                    {depth < MAX_DEPTH && (
                      <text
                        x={Math.min(hovered.x + 22, SVG_W - 162)}
                        y={Math.max(hovered.y + 14, 44)}
                        fill={GN}
                        fontSize={7}
                        style={{ pointerEvents: "none" }}
                      >click to explore →</text>
                    )}
                  </g>
                )}

                {/* depth guard overlay */}
                {depth >= MAX_DEPTH && simNodes.length > 1 && (
                  <text
                    x={SVG_W / 2} y={SVG_H - 10}
                    textAnchor="middle"
                    fill={`${AM}99`}
                    fontSize={9}
                  >max depth {MAX_DEPTH} reached — use BACK or RESET</text>
                )}
              </svg>
            )}

            {/* no neighbors info */}
            {currentEntity && !loadingNeighbors && simNodes.length <= 1 && (
              <div style={{
                position: "absolute", top: "50%", left: "50%",
                transform: "translate(-50%,-50%)",
                color: DIM, fontSize: 10, textAlign: "center",
              }}>
                No neighbors found for this entity.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
