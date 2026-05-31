/**
 * ApexCore — the Apex plugin control core.
 * A plugin control-plane overview: every Apex plugin rendered as a card with a
 * health dot, description and an enable/disable toggle (local state). StatTiles
 * summarise total / active / degraded plugins. Apex pages use the orange accent.
 */
import { useState, useMemo } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge } from "@/components/PageKit";

const ACCENT = C.orange;

// The real Apex plugin set. `health` simulates an availability signal.
const PLUGINS = [
  { id: "rag", name: "RAG Memory", category: "Memory", health: "healthy",
    desc: "Retrieval-augmented memory store grounding answers in real corpus facts." },
  { id: "gpu", name: "GPU Compute", category: "Compute", health: "healthy",
    desc: "Elastic accelerator pool powering training, embeddings and batch inference." },
  { id: "vision", name: "Vision Multimodal", category: "Perception", health: "healthy",
    desc: "Image and document understanding feeding multimodal context to the gateway." },
  { id: "llm", name: "LLM Gateway / Inference", category: "Inference", health: "healthy",
    desc: "Unified inference router across model providers — root of every reasoning task." },
  { id: "quantum", name: "Quantum Simulation", category: "Compute", health: "degraded",
    desc: "Quantum circuit simulation for hard combinatorial optimisation problems." },
  { id: "graph", name: "Graph Intelligence", category: "Reasoning", health: "healthy",
    desc: "Entity-relationship graph for traversal and relationship inference." },
  { id: "opt", name: "Optimisation", category: "Reasoning", health: "healthy",
    desc: "Solver and scheduler that optimises resource and workflow allocation." },
  { id: "agent", name: "Agent Workflow", category: "Orchestration", health: "healthy",
    desc: "Autonomous multi-step agents orchestrating tools over graph and memory." },
  { id: "lineage", name: "Data Workflow Lineage", category: "Orchestration", health: "healthy",
    desc: "End-to-end lineage tracking across every data and workflow transformation." },
  { id: "eval", name: "Evaluation Observability", category: "Observability", health: "degraded",
    desc: "Eval harness and telemetry capturing model and pipeline quality signals." },
  { id: "ts", name: "TypeScript Runtime", category: "Runtime", health: "healthy",
    desc: "Sandboxed TypeScript runtime executing plugin code and user functions." },
];

const HEALTH_COLOR = { healthy: C.neon, degraded: C.gold, down: C.red };

export default function ApexCore() {
  // Enable/disable is local control-plane state. Quantum/eval start disabled (degraded).
  const [enabled, setEnabled] = useState(() => {
    const init = {};
    PLUGINS.forEach((p) => { init[p.id] = p.health !== "degraded"; });
    return init;
  });

  const toggle = (id) => setEnabled((prev) => ({ ...prev, [id]: !prev[id] }));

  const { active, degraded } = useMemo(() => {
    let a = 0, d = 0;
    PLUGINS.forEach((p) => {
      if (enabled[p.id]) a += 1;
      if (p.health === "degraded") d += 1;
    });
    return { active: a, degraded: d };
  }, [enabled]);

  const setAll = (val) => {
    const next = {};
    PLUGINS.forEach((p) => { next[p.id] = val; });
    setEnabled(next);
  };

  const btn = (color) => ({
    background: color + "1a", border: `1px solid ${color}55`, color, borderRadius: 4,
    padding: "7px 11px", fontSize: 9, letterSpacing: 1, fontWeight: 700,
    fontFamily: "inherit", cursor: "pointer",
  });

  return (
    <PageShell
      title="APEX CORE"
      subtitle="PLUGIN CONTROL PLANE · ENABLE / DISABLE · HEALTH OVERVIEW"
      accent={ACCENT}
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setAll(true)} style={btn(C.neon)}>ENABLE ALL</button>
          <button onClick={() => setAll(false)} style={btn(C.red)}>DISABLE ALL</button>
        </div>
      }
    >
      <Grid min={160} gap={10} style={{ marginBottom: 14 }}>
        <StatTile label="Total Plugins" value={PLUGINS.length} accent={ACCENT} />
        <StatTile label="Active" value={active} accent={C.neon} sub="enabled now" />
        <StatTile label="Inactive" value={PLUGINS.length - active} accent={C.text} />
        <StatTile label="Degraded" value={degraded} accent={C.gold} sub="health signals" />
      </Grid>

      <PanelCard title="PLUGIN CONTROL CARDS" accent={ACCENT}>
        <Grid min={260} gap={12}>
          {PLUGINS.map((p) => {
            const on = enabled[p.id];
            const hc = HEALTH_COLOR[p.health] || C.text;
            return (
              <div key={p.id} style={{
                border: `1px solid ${on ? ACCENT + "44" : C.border}`, borderRadius: 6,
                padding: "11px 12px", background: on ? ACCENT + "0d" : "rgba(0,0,0,0.25)",
                display: "flex", flexDirection: "column", gap: 8, transition: "border .2s,background .2s",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span title={p.health} style={{
                    width: 8, height: 8, borderRadius: "50%", background: hc,
                    boxShadow: `0 0 6px ${hc}`, flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.textB, flex: 1 }}>{p.name}</span>
                  <Badge color={ACCENT}>{p.category.toUpperCase()}</Badge>
                </div>
                <div style={{ fontSize: 9, color: C.text, lineHeight: 1.55, minHeight: 28 }}>{p.desc}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Badge color={on ? C.neon : C.text}>{on ? "ENABLED" : "DISABLED"}</Badge>
                  <span style={{ fontSize: 8, color: hc, letterSpacing: 1, flex: 1 }}>
                    {p.health.toUpperCase()}
                  </span>
                  <button
                    onClick={() => toggle(p.id)}
                    style={btn(on ? C.red : C.neon)}
                  >{on ? "◼ DISABLE" : "▶ ENABLE"}</button>
                </div>
              </div>
            );
          })}
        </Grid>
      </PanelCard>
    </PageShell>
  );
}
