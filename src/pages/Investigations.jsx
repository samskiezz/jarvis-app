/**
 * Investigations — front end for the Wave-9 graph investigations + temporal
 * graph playback services (P5 #41/#43). Save a graph investigation (seeds +
 * notes), annotate it, share it, and scrub a PLAYBACK of how the link graph
 * grew over time. Backed by /v1/investigations/* and /v1/graph-time/*.
 */
import { useState, useEffect, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { Btn, inputStyle } from "@/components/Wave1Kit";
import { apiGet, apiPost, asList, useAsync } from "@/lib/wave1";

const ACCENT = C.neon;

function MiniGraph({ nodes = [], edges = [], height = 240 }) {
  if (!nodes.length) return <div style={{ color: C.text, fontSize: 10, padding: 20 }}>empty graph</div>;
  const W = 520, H = height, R = Math.min(W, H) / 2 - 30;
  const pos = {};
  nodes.slice(0, 120).forEach((n, i, arr) => {
    const a = (i / arr.length) * Math.PI * 2;
    pos[n.id ?? n] = { x: W / 2 + R * Math.cos(a), y: H / 2 + R * Math.sin(a) };
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ background: "#04080c", borderRadius: 4 }}>
      {edges.map((e, i) => { const a = pos[e.a ?? e.src ?? e.source], b = pos[e.b ?? e.dst ?? e.target];
        return a && b ? <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={`${ACCENT}40`} strokeWidth="0.7" /> : null; })}
      {Object.values(pos).map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3.5" fill={ACCENT} />)}
    </svg>
  );
}

export default function Investigations() {
  const [list, setList] = useState([]);
  const [sel, setSel] = useState(null);
  const [name, setName] = useState("");
  const [seeds, setSeeds] = useState("");
  const [annTarget, setAnnTarget] = useState("");
  const [annText, setAnnText] = useState("");
  const [frames, setFrames] = useState([]);
  const [frameIdx, setFrameIdx] = useState(0);
  const listAsync = useAsync(); const getAsync = useAsync(); const playAsync = useAsync();

  const load = useCallback(async () => { const b = await listAsync.run(() => apiGet("/v1/investigations")); setList(asList(b, "items", "investigations")); }, [listAsync]);
  useEffect(() => { load(); }, [load]);

  const open = async (inv) => { const b = await getAsync.run(() => apiGet(`/v1/investigations/${encodeURIComponent(inv.id)}`)); setSel(b || inv); };
  const create = async () => {
    if (!name.trim()) return;
    const seedList = seeds.split(",").map((s) => s.trim()).filter(Boolean);
    await apiPost("/v1/investigations", { name: name.trim(), seeds: seedList, notes: "" }); setName(""); setSeeds(""); load();
  };
  const annotate = async () => { if (!sel || !annText.trim()) return; await apiPost(`/v1/investigations/${encodeURIComponent(sel.id)}/annotations`, { target: annTarget || "case", text: annText.trim() }); setAnnText(""); open(sel); };
  const playback = async () => { const b = await playAsync.run(() => apiPost("/v1/graph-time/playback", { frames: 24 })); const f = asList(b, "frames"); setFrames(f); setFrameIdx(Math.max(0, f.length - 1)); };

  const subgraph = sel?.subgraph || sel || {};
  const cur = frames[frameIdx] || {};
  const annotations = sel ? asList(sel, "annotations") : [];

  return (
    <PageShell title="INVESTIGATIONS" subtitle="saved graph cases · annotate · share · temporal playback" accent={ACCENT}
      actions={<Badge color={ACCENT}>{list.length} CASES</Badge>}>
      <Grid min={150} style={{ marginBottom: 14 }}>
        <StatTile label="investigations" value={list.length} accent={ACCENT} />
        <StatTile label="selected" value={sel?.name || "—"} accent={C.gold} />
        <StatTile label="annotations" value={annotations.length} accent={C.neon} />
        <StatTile label="playback frames" value={frames.length} accent={C.gold} />
      </Grid>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 12 }}>
        <PanelCard title="CASES" accent={ACCENT}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="case name" style={inputStyle} />
            <input value={seeds} onChange={(e) => setSeeds(e.target.value)} placeholder="seed object ids (comma-sep)" style={inputStyle} />
            <Btn accent={ACCENT} onClick={create}>+ CREATE</Btn>
          </div>
          <DataState loading={listAsync.loading} empty={!list.length} emptyLabel="No investigations yet">
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {list.map((inv, i) => (
                <button key={i} onClick={() => open(inv)} style={{ textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                  fontSize: 10, padding: "7px 9px", borderRadius: 4, border: `1px solid ${sel?.id === inv.id ? ACCENT : C.border}`,
                  background: sel?.id === inv.id ? `${ACCENT}14` : "rgba(0,0,0,0.2)", color: C.textB }}>
                  <span style={{ fontWeight: 700 }}>{inv.name}</span>
                  <div style={{ fontSize: 8, color: C.text }}>{(inv.seeds || []).length} seeds · {inv.owner || "—"}</div>
                </button>
              ))}
            </div>
          </DataState>
        </PanelCard>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <PanelCard title={sel ? `GRAPH · ${sel.name}` : "GRAPH"} accent={C.neon}>
            <DataState loading={getAsync.loading} empty={!sel} emptyLabel="Open a case to see its subgraph">
              <MiniGraph nodes={asList(subgraph, "nodes")} edges={asList(subgraph, "edges")} />
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <input value={annTarget} onChange={(e) => setAnnTarget(e.target.value)} placeholder="annotate target (node/edge/case)" style={{ ...inputStyle, flex: 1 }} />
                <input value={annText} onChange={(e) => setAnnText(e.target.value)} placeholder="note" style={{ ...inputStyle, flex: 1 }} />
                <Btn accent={C.gold} onClick={annotate}>ANNOTATE</Btn>
              </div>
              {annotations.length > 0 && (
                <div style={{ marginTop: 8, maxHeight: 90, overflowY: "auto" }}>
                  {annotations.map((a, i) => (
                    <div key={i} style={{ fontSize: 9, color: C.text, padding: "2px 0" }}>
                      <Badge color={C.gold}>{a.target}</Badge> {a.text}
                    </div>
                  ))}
                </div>
              )}
            </DataState>
          </PanelCard>
          <PanelCard title="TEMPORAL PLAYBACK" accent={C.gold} right={<Btn accent={C.gold} onClick={playback}>{playAsync.loading ? "…" : "BUILD"}</Btn>}>
            <DataState loading={playAsync.loading} empty={!frames.length} emptyLabel="BUILD a playback of the graph growing over time">
              <div style={{ fontSize: 11, color: C.textB, marginBottom: 6 }}>
                frame <b style={{ color: C.gold }}>{frameIdx + 1}</b>/{frames.length} · {cur.n_nodes ?? 0} nodes · {cur.n_edges ?? 0} edges
                {cur.ts ? ` · ${new Date(cur.ts).toLocaleDateString()}` : ""}
              </div>
              <input type="range" min={0} max={Math.max(0, frames.length - 1)} value={frameIdx}
                onChange={(e) => setFrameIdx(Number(e.target.value))} style={{ width: "100%" }} />
              <MiniGraph nodes={asList(cur, "nodes")} edges={asList(cur, "edges")} height={160} />
            </DataState>
          </PanelCard>
        </div>
      </div>
    </PageShell>
  );
}
