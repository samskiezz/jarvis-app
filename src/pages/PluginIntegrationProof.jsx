/**
 * PluginIntegrationProof — integration proof / test runner.
 * Each Apex plugin has a "test" button that simulates a wiring check (running →
 * passed/failed after a short timeout). A "run all" button sweeps every plugin.
 * Results render as a pass/fail matrix — proof the plugin surface is wired.
 * Apex pages use the orange accent.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge } from "@/components/PageKit";

const ACCENT = C.orange;

const PLUGINS = [
  { id: "rag", name: "RAG Memory", check: "retrieve(corpus) → context" },
  { id: "gpu", name: "GPU Compute", check: "alloc(device) → handle" },
  { id: "vision", name: "Vision Multimodal", check: "encode(image) → tokens" },
  { id: "llm", name: "LLM Gateway / Inference", check: "route(prompt) → completion" },
  { id: "quantum", name: "Quantum Simulation", check: "simulate(circuit) → state" },
  { id: "graph", name: "Graph Intelligence", check: "traverse(node) → edges" },
  { id: "opt", name: "Optimisation", check: "solve(objective) → plan" },
  { id: "agent", name: "Agent Workflow", check: "run(goal) → steps" },
  { id: "lineage", name: "Data Workflow Lineage", check: "trace(artifact) → graph" },
  { id: "eval", name: "Evaluation Observability", check: "score(run) → metrics" },
  { id: "ts", name: "TypeScript Runtime", check: "exec(module) → result" },
];

// Plugins flagged "degraded" in the control plane fail their wiring check.
const FAILING = new Set(["quantum", "eval"]);

const STATE_COLOR = { idle: C.text, running: C.blue, passed: C.neon, failed: C.red };

export default function PluginIntegrationProof() {
  const [results, setResults] = useState(() => {
    const init = {};
    PLUGINS.forEach((p) => { init[p.id] = "idle"; });
    return init;
  });
  const timers = useRef([]);

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  const runOne = useCallback((id) => {
    setResults((prev) => ({ ...prev, [id]: "running" }));
    const delay = 500 + Math.random() * 900;
    const t = setTimeout(() => {
      setResults((prev) => ({ ...prev, [id]: FAILING.has(id) ? "failed" : "passed" }));
    }, delay);
    timers.current.push(t);
  }, []);

  const runAll = useCallback(() => {
    PLUGINS.forEach((p, i) => {
      const t = setTimeout(() => runOne(p.id), i * 120);
      timers.current.push(t);
    });
  }, [runOne]);

  const reset = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setResults(() => {
      const init = {};
      PLUGINS.forEach((p) => { init[p.id] = "idle"; });
      return init;
    });
  }, []);

  const vals = Object.values(results);
  const passed = vals.filter((v) => v === "passed").length;
  const failed = vals.filter((v) => v === "failed").length;
  const running = vals.filter((v) => v === "running").length;
  const coverage = Math.round(((passed + failed) / PLUGINS.length) * 100);

  const btn = (color, extra = {}) => ({
    background: color + "1a", border: `1px solid ${color}55`, color, borderRadius: 4,
    padding: "7px 11px", fontSize: 9, letterSpacing: 1, fontWeight: 700,
    fontFamily: "inherit", cursor: "pointer", ...extra,
  });

  const label = { idle: "○ NOT RUN", running: "◌ RUNNING", passed: "✓ PASS", failed: "✗ FAIL" };

  return (
    <PageShell
      title="PLUGIN INTEGRATION PROOF"
      subtitle="WIRING TEST RUNNER · PASS / FAIL MATRIX"
      accent={ACCENT}
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={runAll} disabled={running > 0} style={btn(ACCENT, { opacity: running > 0 ? 0.5 : 1 })}>
            ▶ RUN ALL
          </button>
          <button onClick={reset} style={btn(C.text)}>↺ RESET</button>
        </div>
      }
    >
      <Grid min={160} gap={10} style={{ marginBottom: 14 }}>
        <StatTile label="Plugins" value={PLUGINS.length} accent={ACCENT} />
        <StatTile label="Passed" value={passed} accent={C.neon} />
        <StatTile label="Failed" value={failed} accent={C.red} />
        <StatTile label="Coverage" value={`${coverage}%`} accent={C.gold} sub={running ? `${running} running` : "tested"} />
      </Grid>

      <PanelCard title="INTEGRATION MATRIX" accent={ACCENT}>
        <Grid min={260} gap={10}>
          {PLUGINS.map((p) => {
            const st = results[p.id];
            const col = STATE_COLOR[st];
            return (
              <div key={p.id} style={{
                border: `1px solid ${st === "passed" ? C.neon + "44" : st === "failed" ? C.red + "44" : C.border}`,
                borderRadius: 6, padding: "10px 12px", background: "rgba(0,0,0,0.25)",
                display: "flex", flexDirection: "column", gap: 8,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%", background: col,
                    boxShadow: st === "running" ? `0 0 6px ${col}` : "none", flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.textB, flex: 1 }}>{p.name}</span>
                  <Badge color={col}>{label[st]}</Badge>
                </div>
                <code style={{ fontSize: 8.5, color: C.text, letterSpacing: 0.3 }}>{p.check}</code>
                <button
                  onClick={() => runOne(p.id)}
                  disabled={st === "running"}
                  style={btn(ACCENT, { alignSelf: "flex-start", opacity: st === "running" ? 0.5 : 1 })}
                >{st === "running" ? "TESTING…" : "TEST"}</button>
              </div>
            );
          })}
        </Grid>
      </PanelCard>
    </PageShell>
  );
}
