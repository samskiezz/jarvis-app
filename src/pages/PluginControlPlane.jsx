/**
 * PluginControlPlane — detailed plugin management table.
 * The full Apex plugin set in a styled table: name, category, status, version,
 * actions. Filter by category, toggle enable/disable per row, plus a bulk filter
 * summary. Apex pages use the orange accent.
 */
import { useState, useMemo } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge } from "@/components/PageKit";

const ACCENT = C.orange;

const PLUGINS = [
  { id: "rag", name: "RAG Memory", category: "Memory", version: "2.4.1", health: "healthy" },
  { id: "gpu", name: "GPU Compute", category: "Compute", version: "3.1.0", health: "healthy" },
  { id: "vision", name: "Vision Multimodal", category: "Perception", version: "1.9.2", health: "healthy" },
  { id: "llm", name: "LLM Gateway / Inference", category: "Inference", version: "4.0.3", health: "healthy" },
  { id: "quantum", name: "Quantum Simulation", category: "Compute", version: "0.7.0", health: "degraded" },
  { id: "graph", name: "Graph Intelligence", category: "Reasoning", version: "2.0.5", health: "healthy" },
  { id: "opt", name: "Optimisation", category: "Reasoning", version: "1.6.0", health: "healthy" },
  { id: "agent", name: "Agent Workflow", category: "Orchestration", version: "3.3.1", health: "healthy" },
  { id: "lineage", name: "Data Workflow Lineage", category: "Orchestration", version: "1.2.4", health: "healthy" },
  { id: "eval", name: "Evaluation Observability", category: "Observability", version: "0.9.8", health: "degraded" },
  { id: "ts", name: "TypeScript Runtime", category: "Runtime", version: "5.4.0", health: "healthy" },
];

const HEALTH_COLOR = { healthy: C.neon, degraded: C.gold, down: C.red };
const CATEGORIES = ["all", ...Array.from(new Set(PLUGINS.map((p) => p.category)))];

export default function PluginControlPlane() {
  const [enabled, setEnabled] = useState(() => {
    const init = {};
    PLUGINS.forEach((p) => { init[p.id] = p.health !== "degraded"; });
    return init;
  });
  const [filter, setFilter] = useState("all");

  const toggle = (id) => setEnabled((prev) => ({ ...prev, [id]: !prev[id] }));

  const rows = useMemo(
    () => (filter === "all" ? PLUGINS : PLUGINS.filter((p) => p.category === filter)),
    [filter],
  );
  const activeCount = PLUGINS.filter((p) => enabled[p.id]).length;

  const th = {
    textAlign: "left", fontSize: 8, letterSpacing: 1.5, color: C.text,
    textTransform: "uppercase", padding: "8px 10px", borderBottom: `1px solid ${C.border}`,
  };
  const td = {
    fontSize: 10, color: C.textB, padding: "9px 10px", borderBottom: `1px solid ${C.borderB}`,
  };
  const filterBtn = (cat) => ({
    background: filter === cat ? ACCENT + "22" : "rgba(0,0,0,0.4)",
    border: `1px solid ${filter === cat ? ACCENT + "77" : C.border}`,
    color: filter === cat ? ACCENT : C.text, borderRadius: 4, padding: "5px 10px",
    fontSize: 9, letterSpacing: 1, fontFamily: "inherit", cursor: "pointer", fontWeight: 700,
  });

  return (
    <PageShell
      title="PLUGIN CONTROL PLANE"
      subtitle="DETAILED PLUGIN MANAGEMENT · FILTER · TOGGLE · VERSIONS"
      accent={ACCENT}
    >
      <Grid min={160} gap={10} style={{ marginBottom: 14 }}>
        <StatTile label="Registered" value={PLUGINS.length} accent={ACCENT} />
        <StatTile label="Enabled" value={activeCount} accent={C.neon} />
        <StatTile label="Showing" value={rows.length} accent={C.blue} sub={filter} />
        <StatTile label="Categories" value={CATEGORIES.length - 1} accent={C.gold} />
      </Grid>

      <PanelCard
        title="PLUGIN REGISTRY"
        accent={ACCENT}
        right={
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {CATEGORIES.map((cat) => (
              <button key={cat} onClick={() => setFilter(cat)} style={filterBtn(cat)}>
                {cat.toUpperCase()}
              </button>
            ))}
          </div>
        }
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
            <thead>
              <tr>
                <th style={th}>Plugin</th>
                <th style={th}>Category</th>
                <th style={th}>Health</th>
                <th style={th}>Status</th>
                <th style={th}>Version</th>
                <th style={{ ...th, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const on = enabled[p.id];
                const hc = HEALTH_COLOR[p.health] || C.text;
                return (
                  <tr key={p.id}>
                    <td style={{ ...td, fontWeight: 700 }}>{p.name}</td>
                    <td style={td}><Badge color={ACCENT}>{p.category}</Badge></td>
                    <td style={td}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: hc }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: hc, boxShadow: `0 0 5px ${hc}` }} />
                        {p.health}
                      </span>
                    </td>
                    <td style={td}><Badge color={on ? C.neon : C.text}>{on ? "ENABLED" : "DISABLED"}</Badge></td>
                    <td style={{ ...td, color: C.text }}>v{p.version}</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <button
                        onClick={() => toggle(p.id)}
                        style={{
                          background: (on ? C.red : C.neon) + "1a",
                          border: `1px solid ${(on ? C.red : C.neon)}55`,
                          color: on ? C.red : C.neon, borderRadius: 4, padding: "4px 10px",
                          fontSize: 8, letterSpacing: 1, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
                        }}
                      >{on ? "DISABLE" : "ENABLE"}</button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={6} style={{ ...td, color: C.text, textAlign: "center", padding: 24 }}>
                  No plugins in this category.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </PanelCard>
    </PageShell>
  );
}
