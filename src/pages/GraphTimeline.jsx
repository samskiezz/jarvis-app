/**
 * GraphTimeline — Palantir Gotham "graph over time" scrubber.
 *
 * Plays back the knowledge graph as it grows / changes over time. On load we POST
 * /v1/graph-time/playback to get a stack of frames, then render the graph for the
 * current frame on a <canvas> using a STABLE deterministic layout: each node's
 * position is seeded by a hash of its id, so nodes never jump around as the graph
 * grows — new nodes simply appear in place. Nodes are coloured by COLORS.type,
 * sized by their degree within the current frame, and edges are drawn with an
 * opacity proportional to their strength.
 *
 * The TIME SCRUBBER is a range slider over the frames plus Play/Pause and a speed
 * control (0.5x / 1x / 2x). Auto-advance runs on a setInterval (~1.2s / speed) and
 * is fully torn down on unmount. Live stat tiles show the current frame timestamp
 * and node/edge counts, and a tiny growth sparkline plots n_nodes across all
 * frames with the current frame marked.
 *
 * Honest degradation: if the backend hands back a `note` (e.g. link timestamps are
 * absent so it falls back to the current graph), we surface it as a Badge so the
 * analyst knows playback is degraded rather than real.
 *
 * Backend contract:
 *   POST /v1/graph-time/playback {frames, t0?, t1?}
 *        -> { frames:[{ts, n_nodes, n_edges, nodes:[{id,label,type,mark}],
 *                       edges:[{a,b,strength,relation}]}], note? }
 *   GET  /v1/graph-time/at?ts=<ms> -> { ts, nodes, edges, note? }  (single frame)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { Btn } from "@/components/Wave1Kit";
import { apiGet, apiPost, asList } from "@/lib/wave1";

const ACCENT = C.purple;
const FRAME_COUNT = 24;
const BASE_MS = 1200; // ms per frame at 1x

const colorForType = (type) => C.type[type] || C.blue;

// Tolerant accessors — the backend isn't perfectly uniform across its frames.
const nodeId = (n) => (n && (n.id ?? n.node ?? n.key ?? n.name)) ?? null;
const edgeEnds = (e) => [
  e.a ?? e.source ?? e.from ?? e.src ?? (Array.isArray(e) ? e[0] : null),
  e.b ?? e.target ?? e.to ?? e.dst ?? (Array.isArray(e) ? e[1] : null),
];
const edgeStrength = (e) => Number(e.strength ?? e.weight ?? e.value ?? 1) || 1;

// Deterministic 32-bit string hash (FNV-1a) → stable per-id seed.
function hashId(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Map a hashed id → a stable {x,y} in [0,1]² (two decorrelated angles on a disc
// so the layout reads as a graph spread, not a square grid).
function seedPosition(id) {
  const h = hashId(id);
  const a = (h & 0xffff) / 0xffff;          // radius factor
  const b = ((h >>> 16) & 0xffff) / 0xffff; // angle factor
  const r = 0.08 + 0.42 * Math.sqrt(a);      // sqrt → even disc fill
  const ang = b * Math.PI * 2;
  return { x: 0.5 + r * Math.cos(ang), y: 0.5 + r * Math.sin(ang) };
}

export default function GraphTimeline() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const timerRef = useRef(null);

  const [frames, setFrames] = useState([]);
  const [note, setNote] = useState(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [size, setSize] = useState({ w: 800, h: 460 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── Load the playback stack once on mount ────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const body = await apiPost("/v1/graph-time/playback", { frames: FRAME_COUNT });
        if (!alive) return;
        const fs = asList(body, "frames");
        setFrames(fs);
        setNote(body && body.note ? body.note : null);
        setIdx(0);
      } catch (e) {
        if (alive) setError(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Keep idx in-bounds if the frame count ever shrinks.
  useEffect(() => {
    if (frames.length && idx > frames.length - 1) setIdx(frames.length - 1);
  }, [frames.length, idx]);

  // ── Auto-advance loop (setInterval, cleaned up on every dep change) ───────
  useEffect(() => {
    if (!playing || frames.length < 2) return undefined;
    const step = Math.max(120, BASE_MS / speed);
    timerRef.current = setInterval(() => {
      setIdx((i) => (i + 1) % frames.length);
    }, step);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [playing, speed, frames.length]);

  // Stop playing when we run out of frames.
  useEffect(() => {
    if (frames.length < 2 && playing) setPlaying(false);
  }, [frames.length, playing]);

  // ── Responsive canvas sizing ─────────────────────────────────────────────
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0].contentRect;
      setSize({ w: Math.max(320, Math.floor(cr.width)), h: 460 });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const frame = frames[idx] || null;

  // Build a render model for the current frame: stable seeded positions + degree.
  const model = useMemo(() => {
    if (!frame) return { nodes: [], edges: [], maxDeg: 1 };
    const rawNodes = asList(frame, "nodes");
    const rawEdges = asList(frame, "edges");
    const deg = new Map();
    const valid = new Set();
    const nodes = rawNodes
      .map((n) => {
        const id = nodeId(n);
        if (id == null) return null;
        valid.add(String(id));
        const p = seedPosition(id);
        return { id: String(id), label: n.label || String(id), type: n.type, mark: n.mark, x: p.x, y: p.y };
      })
      .filter(Boolean);
    const edges = [];
    for (const e of rawEdges) {
      const [a, b] = edgeEnds(e).map((v) => (v == null ? null : String(v)));
      if (a == null || b == null || !valid.has(a) || !valid.has(b)) continue;
      deg.set(a, (deg.get(a) || 0) + 1);
      deg.set(b, (deg.get(b) || 0) + 1);
      edges.push({ a, b, strength: edgeStrength(e) });
    }
    let maxDeg = 1;
    for (const n of nodes) {
      n.deg = deg.get(n.id) || 0;
      if (n.deg > maxDeg) maxDeg = n.deg;
    }
    return { nodes, edges, maxDeg };
  }, [frame]);

  // ── Canvas paint ─────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const { w, h } = size;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const pad = 28;
    const X = (nx) => pad + nx * (w - pad * 2);
    const Y = (ny) => pad + ny * (h - pad * 2);

    const byId = new Map(model.nodes.map((n) => [n.id, n]));

    // Edges first (under nodes), opacity by strength.
    for (const e of model.edges) {
      const A = byId.get(e.a);
      const B = byId.get(e.b);
      if (!A || !B) continue;
      const op = 0.1 + 0.5 * Math.min(1, e.strength);
      ctx.strokeStyle = `rgba(168,85,247,${op.toFixed(3)})`;
      ctx.lineWidth = 0.6 + 1.4 * Math.min(1, e.strength);
      ctx.beginPath();
      ctx.moveTo(X(A.x), Y(A.y));
      ctx.lineTo(X(B.x), Y(B.y));
      ctx.stroke();
    }

    // Nodes, sized by degree within this frame, coloured by type.
    for (const n of model.nodes) {
      const r = 3 + 7 * Math.sqrt((n.deg || 0) / model.maxDeg);
      const col = colorForType(n.type);
      const cx = X(n.x);
      const cy = Y(n.y);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.92;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.stroke();
    }
  }, [model, size]);

  useEffect(() => { draw(); }, [draw]);

  // ── Optional refinement: confirm a single frame against /at (best-effort) ──
  // Kept thin: tap the GET endpoint for the active timestamp so the contract is
  // exercised; failures are swallowed and never disturb playback.
  const [atProbe, setAtProbe] = useState(null);
  const probeAt = useCallback(async () => {
    if (!frame || frame.ts == null) return;
    try {
      const body = await apiGet(`/v1/graph-time/at?ts=${encodeURIComponent(frame.ts)}`);
      const nodes = asList(body, "nodes");
      const edges = asList(body, "edges");
      setAtProbe({ ts: body?.ts ?? frame.ts, n_nodes: nodes.length, n_edges: edges.length, note: body?.note || null });
    } catch {
      setAtProbe(null);
    }
  }, [frame]);

  const ts = frame ? frame.ts : null;
  const tsLabel = ts != null ? new Date(ts).toLocaleString() : "—";
  const nNodes = frame ? (frame.n_nodes ?? model.nodes.length) : 0;
  const nEdges = frame ? (frame.n_edges ?? model.edges.length) : 0;

  // Sparkline data — n_nodes across frames.
  const counts = useMemo(
    () => frames.map((f) => Number(f?.n_nodes ?? asList(f, "nodes").length) || 0),
    [frames],
  );
  const maxCount = Math.max(1, ...counts);

  const togglePlay = useCallback(() => setPlaying((p) => !p), []);

  return (
    <PageShell
      title="GRAPH TIMELINE"
      subtitle="temporal graph playback · seeded-stable layout · scrub the graph over time"
      accent={ACCENT}
      actions={
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {note && <Badge color={C.gold}>DEGRADED: {String(note)}</Badge>}
          <Badge color={ACCENT}>{frames.length} FRAMES</Badge>
        </div>
      }
    >
      <Grid min={160} style={{ marginBottom: 12 }}>
        <StatTile label="frame" value={frames.length ? `${idx + 1}/${frames.length}` : "—"} accent={ACCENT} />
        <StatTile label="timestamp" value={ts != null ? new Date(ts).toLocaleDateString() : "—"} sub={tsLabel} accent={C.blue} />
        <StatTile label="nodes" value={nNodes} accent={C.neon} />
        <StatTile label="edges" value={nEdges} accent={C.gold} />
      </Grid>

      {/* ── Transport / scrubber ─────────────────────────────────────────── */}
      <PanelCard title="TRANSPORT" accent={ACCENT} style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Btn accent={ACCENT} onClick={togglePlay} disabled={frames.length < 2} style={{ minWidth: 86 }}>
            {playing ? "❚❚ PAUSE" : "▶ PLAY"}
          </Btn>
          <Btn
            accent={C.text}
            onClick={() => { setPlaying(false); setIdx((i) => Math.max(0, i - 1)); }}
            disabled={!frames.length}
          >
            ◀ PREV
          </Btn>
          <Btn
            accent={C.text}
            onClick={() => { setPlaying(false); setIdx((i) => Math.min(frames.length - 1, i + 1)); }}
            disabled={!frames.length}
          >
            NEXT ▶
          </Btn>

          <input
            type="range"
            min={0}
            max={Math.max(0, frames.length - 1)}
            value={idx}
            onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }}
            disabled={frames.length < 2}
            style={{ flex: 1, minWidth: 200, accentColor: ACCENT, cursor: frames.length < 2 ? "default" : "pointer" }}
          />

          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ fontSize: 8, letterSpacing: 1, color: C.text }}>SPEED</span>
            {[0.5, 1, 2].map((s) => (
              <Btn
                key={s}
                accent={s === speed ? ACCENT : C.text}
                style={s === speed ? {} : { opacity: 0.55 }}
                onClick={() => setSpeed(s)}
              >
                {s}x
              </Btn>
            ))}
          </div>
        </div>
      </PanelCard>

      <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 12 }}>
        {/* ── The graph canvas ───────────────────────────────────────────── */}
        <PanelCard
          title="GRAPH"
          accent={ACCENT}
          right={frame ? <Badge color={C.blue}>{model.nodes.length} drawn · {model.edges.length} links</Badge> : null}
        >
          <DataState loading={loading} error={error} empty={!loading && !error && !frames.length}
            emptyLabel="No playback frames returned">
            <div ref={wrapRef} style={{ width: "100%", borderRadius: 6, overflow: "hidden",
              border: `1px solid ${C.border}`, background: "#04070c" }}>
              <canvas ref={canvasRef} style={{ display: "block" }} />
            </div>
            <div style={{ fontSize: 8, color: C.text, marginTop: 6 }}>
              Position seeded by hash(id) → stable across frames · size = degree · colour = type · edge opacity = strength
            </div>
          </DataState>
        </PanelCard>

        {/* ── Side: growth sparkline + at-probe ──────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <PanelCard title="GROWTH · n_nodes" accent={C.neon}>
            {counts.length ? (
              <>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 70 }}>
                  {counts.map((c, i) => {
                    const on = i === idx;
                    return (
                      <div
                        key={i}
                        onClick={() => { setPlaying(false); setIdx(i); }}
                        title={`frame ${i + 1}: ${c} nodes`}
                        style={{
                          flex: 1,
                          minWidth: 2,
                          height: `${Math.max(4, (c / maxCount) * 100)}%`,
                          background: on ? ACCENT : C.neon + "55",
                          borderRadius: 1,
                          cursor: "pointer",
                          boxShadow: on ? `0 0 6px ${ACCENT}` : "none",
                        }}
                      />
                    );
                  })}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 8, color: C.text }}>
                  <span>min {Math.min(...counts)}</span>
                  <span style={{ color: ACCENT }}>now {nNodes}</span>
                  <span>max {maxCount}</span>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 10, color: C.text, padding: 8 }}>No frames</div>
            )}
          </PanelCard>

          <PanelCard title="FRAME @ TS" accent={C.blue}>
            <Btn accent={C.blue} onClick={probeAt} disabled={!frame || frame.ts == null} style={{ marginBottom: 8 }}>
              VERIFY /at
            </Btn>
            {atProbe ? (
              <div style={{ fontSize: 10, color: C.textB, lineHeight: 1.7 }}>
                <div style={{ color: C.text, fontSize: 8 }}>{new Date(atProbe.ts).toLocaleString()}</div>
                <div>nodes <b style={{ color: C.neon }}>{atProbe.n_nodes}</b> · edges <b style={{ color: C.gold }}>{atProbe.n_edges}</b></div>
                {atProbe.note && <Badge color={C.gold}>{String(atProbe.note)}</Badge>}
              </div>
            ) : (
              <div style={{ fontSize: 9, color: C.text }}>
                Cross-checks the single-frame endpoint for the active timestamp.
              </div>
            )}
          </PanelCard>
        </div>
      </div>
    </PageShell>
  );
}
