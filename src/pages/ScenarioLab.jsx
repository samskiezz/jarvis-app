/**
 * ScenarioLab — front end for the Wave-6 Scenario / Modeling service
 * (Palantir-Foundry what-if + model-ops pillar). Three tools:
 *   • WHAT-IF: run a scenario with parameter shocks, see baseline vs scenario.
 *   • MODEL REGISTRY: list trained models in the repo + drift (if available).
 *   • OPTIMIZE: search a bounded space for the best point.
 *
 * The backend reports honestly which engine answered each call
 * (`counterfactual` vs `local-shock`, real GP vs grid/random) — this page
 * surfaces that badge so nothing is dressed up as more than it is.
 * Backed by /v1/scenario/* (run, list, {id}, models, optimize).
 */
import { useState, useEffect, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, DataState, Badge } from "@/components/PageKit";
import { Btn, inputStyle, JsonView, Tabs } from "@/components/Wave1Kit";
import { apiGet, apiPost, asList, useAsync } from "@/lib/wave1";

const ACCENT = C.gold;

function MiniLines({ baseline = [], scenario = [], width = 560, height = 140 }) {
  const all = [...baseline, ...scenario].map((p) => (typeof p === "number" ? p : p.v ?? p.value ?? p.y));
  if (!all.length) return <div style={{ color: C.text, fontSize: 10, padding: 18 }}>no projection</div>;
  const min = Math.min(...all), max = Math.max(...all), span = max - min || 1;
  const path = (arr, color) => {
    const vals = arr.map((p) => (typeof p === "number" ? p : p.v ?? p.value ?? p.y));
    if (!vals.length) return null;
    const x = (i) => (i / Math.max(1, vals.length - 1)) * width;
    const y = (v) => height - ((v - min) / span) * (height - 10) - 5;
    const d = vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    return <path d={d} fill="none" stroke={color} strokeWidth="1.6" />;
  };
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: "block" }}>
      {path(baseline, C.text)}
      {path(scenario, ACCENT)}
    </svg>
  );
}

function WhatIf() {
  const [name, setName] = useState("base case");
  const [params, setParams] = useState('{ "shock_pct": 10, "horizon": 12, "baseline": 100 }');
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const runAsync = useAsync();
  const listAsync = useAsync();

  const refresh = useCallback(async () => {
    const body = await listAsync.run(() => apiGet("/v1/scenario/list"));
    setHistory(asList(body, "scenarios", "items"));
  }, [listAsync]);
  useEffect(() => { refresh(); }, [refresh]);

  const run = async () => {
    let p; try { p = JSON.parse(params); } catch { runAsync.setError(new Error("params must be valid JSON")); return; }
    const body = await runAsync.run(() => apiPost("/v1/scenario/run", { name, params: p }));
    setResult(body);
    refresh();
  };

  const baseline = asList(result?.baseline ?? result?.result?.baseline);
  const scenario = asList(result?.scenario ?? result?.result?.scenario);
  const engine = result?.engine || result?.result?.engine;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
      <PanelCard title="WHAT-IF" accent={ACCENT}
        right={engine ? <Badge color={engine === "counterfactual" ? C.neon : C.gold}>{engine}</Badge> : null}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="scenario name" style={{ ...inputStyle, flex: 1 }} />
          <Btn accent={ACCENT} onClick={run}>RUN</Btn>
        </div>
        <textarea value={params} onChange={(e) => setParams(e.target.value)} rows={3}
          style={{ ...inputStyle, width: "100%", fontFamily: "monospace", resize: "vertical" }} />
        <DataState loading={runAsync.loading} error={runAsync.error} empty={!result} emptyLabel="Run a scenario to see baseline vs shocked projection">
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", gap: 14, fontSize: 9, marginBottom: 4 }}>
              <span style={{ color: C.text }}>— baseline</span>
              <span style={{ color: ACCENT }}>— scenario</span>
            </div>
            <MiniLines baseline={baseline} scenario={scenario} />
            {!baseline.length && <JsonView data={result} />}
          </div>
        </DataState>
      </PanelCard>

      <PanelCard title="SAVED RUNS" accent={C.neon} right={<Badge color={C.neon}>{history.length}</Badge>}>
        <DataState loading={listAsync.loading} empty={!history.length} emptyLabel="No saved scenarios yet">
          <div style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {history.map((s, i) => (
              <div key={i} style={{ fontSize: 10, padding: "5px 7px", borderLeft: `2px solid ${ACCENT}`, background: `${ACCENT}0a` }}>
                <div style={{ color: C.textB }}>{s.name || s.id}</div>
                <div style={{ color: C.text, fontSize: 8 }}>{s.ts ? new Date(s.ts).toLocaleString() : ""} {s.engine ? `· ${s.engine}` : ""}</div>
              </div>
            ))}
          </div>
        </DataState>
      </PanelCard>
    </div>
  );
}

function ModelRegistry() {
  const [models, setModels] = useState([]);
  const a = useAsync();
  useEffect(() => { (async () => { const b = await a.run(() => apiGet("/v1/scenario/models")); setModels(asList(b, "models")); })(); }, []);
  return (
    <PanelCard title="MODEL REGISTRY" accent={ACCENT} right={<Badge color={ACCENT}>{models.length}</Badge>}>
      <DataState loading={a.loading} error={a.error} empty={!models.length} emptyLabel="No model artifacts found">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {models.map((m, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 10, padding: "7px 9px",
              border: `1px solid ${C.border}`, borderRadius: 4, background: `${ACCENT}06` }}>
              <Badge color={m.trained ? C.neon : C.text}>{m.trained ? "TRAINED" : "—"}</Badge>
              <div style={{ flex: 1 }}>
                <div style={{ color: C.textB, fontWeight: 700 }}>{m.name}</div>
                <div style={{ color: C.text, fontSize: 8 }}>{m.kind}{m.size ? ` · ${(m.size / 1024).toFixed(0)}KB` : ""}{m.path ? ` · ${m.path}` : ""}</div>
              </div>
              {m.drift != null ? <Badge color={C.gold}>drift {typeof m.drift === "object" ? JSON.stringify(m.drift) : m.drift}</Badge>
                : <span style={{ fontSize: 8, color: C.text }}>drift n/a</span>}
            </div>
          ))}
        </div>
      </DataState>
    </PanelCard>
  );
}

function Optimize() {
  const [bounds, setBounds] = useState('{ "x": [0, 10], "y": [-5, 5] }');
  const [nIter, setNIter] = useState(20);
  const [result, setResult] = useState(null);
  const a = useAsync();
  const run = async () => {
    let b; try { b = JSON.parse(bounds); } catch { a.setError(new Error("bounds must be valid JSON")); return; }
    const body = await a.run(() => apiPost("/v1/scenario/optimize", { bounds: b, n_iter: Number(nIter) || 20 }));
    setResult(body);
  };
  const best = result?.best || result?.best_point || result?.result?.best;
  const engine = result?.engine || result?.result?.engine;
  return (
    <PanelCard title="OPTIMIZE" accent={ACCENT} right={engine ? <Badge color={engine.includes("gp") || engine.includes("bayes") ? C.neon : C.gold}>{engine}</Badge> : null}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
        <input value={bounds} onChange={(e) => setBounds(e.target.value)} style={{ ...inputStyle, flex: 1, fontFamily: "monospace" }} />
        <span style={{ fontSize: 9, color: C.text }}>iters</span>
        <input type="number" value={nIter} onChange={(e) => setNIter(e.target.value)} style={{ ...inputStyle, width: 70 }} />
        <Btn accent={ACCENT} onClick={run}>SEARCH</Btn>
      </div>
      <DataState loading={a.loading} error={a.error} empty={!result} emptyLabel="Define bounds and search for the best point">
        {best && (
          <Grid min={120} style={{ marginBottom: 10 }}>
            {Object.entries(best).map(([k, v]) => (
              <StatTile key={k} label={k} value={typeof v === "number" ? v.toFixed(3) : String(v)} accent={ACCENT} />
            ))}
          </Grid>
        )}
        <JsonView data={result} />
      </DataState>
    </PanelCard>
  );
}

export default function ScenarioLab() {
  const [tab, setTab] = useState("whatif");
  return (
    <PageShell title="SCENARIO LAB" subtitle="what-if · model registry · optimization — honest engine reporting" accent={ACCENT}
      actions={<Tabs tabs={[{ id: "whatif", label: "WHAT-IF" }, { id: "models", label: "MODELS" }, { id: "optimize", label: "OPTIMIZE" }]}
        active={tab} onChange={setTab} accent={ACCENT} />}>
      {tab === "whatif" && <WhatIf />}
      {tab === "models" && <ModelRegistry />}
      {tab === "optimize" && <Optimize />}
    </PageShell>
  );
}
