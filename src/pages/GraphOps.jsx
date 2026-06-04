/**
 * GraphOps — front end for the Wave-1 Bridge graph-analytics service.
 *
 * Runs graph algorithms (POST /v1/bridge/graph, e.g. pagerank), optimization
 * (POST /v1/bridge/optimize), and shows the returned results. Counterfactual /
 * temporal endpoints are exposed as additional algorithm options against the
 * same JSON-params form, since they share the same request shape.
 *
 * Each run degrades gracefully and renders both a numeric mini-chart (for scalar
 * results / ranked scores) and the raw JSON.
 */
import { useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, DataState } from "@/components/PageKit";
import { Btn, JsonView, Tabs, inputStyle } from "@/components/Wave1Kit";
import { apiPost, asList, labelOf, useAsync } from "@/lib/wave1";

const ACCENT = C.neon;

const OPS = [
  { id: "graph", label: "GRAPH", path: "/v1/bridge/graph",
    placeholder: '{"algorithm":"pagerank","top":10}' },
  { id: "optimize", label: "OPTIMIZE", path: "/v1/bridge/optimize",
    placeholder: '{"objective":"min_cost"}' },
  { id: "counterfactual", label: "COUNTERFACTUAL", path: "/v1/bridge/counterfactual",
    placeholder: '{"intervention":{}}' },
  { id: "temporal", label: "TEMPORAL", path: "/v1/bridge/temporal",
    placeholder: '{"window":"30d"}' },
];

// Pull ranked {id/node, score} rows out of common bridge result shapes.
function rankedRows(result) {
  if (!result) return [];
  const rows = asList(result, "ranking", "scores", "nodes", "results");
  return rows
    .map((r) => {
      if (Array.isArray(r) && r.length === 2) return [String(r[0]), Number(r[1])];
      const score = r.score ?? r.value ?? r.rank ?? r.weight;
      if (typeof score === "number") return [labelOf(r), score];
      return null;
    })
    .filter(Boolean)
    .slice(0, 20);
}

function MiniChart({ rows, accent }) {
  const max = Math.max(...rows.map(([, v]) => Math.abs(v)), 1e-12);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 6 }}>
      {rows.map(([k, v], i) => (
        <div key={k + i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 8, color: C.text, width: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k}</span>
          <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${Math.min(100, (Math.abs(v) / max) * 100)}%`, height: "100%", background: accent }} />
          </div>
          <span style={{ fontSize: 8, color: C.textB, width: 80, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
            {Math.abs(v) < 1e-3 || Math.abs(v) >= 1e6 ? v.toExponential(2) : v.toPrecision(5)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function GraphOps() {
  const [op, setOp] = useState("graph");
  const [paramsText, setParamsText] = useState("");
  const [result, setResult] = useState(null);
  const { loading, error, setError, run } = useAsync();

  const current = OPS.find((o) => o.id === op);

  const execute = async () => {
    setResult(null);
    let params = {};
    const raw = paramsText.trim();
    if (raw) {
      try { params = JSON.parse(raw); }
      catch { setError(new Error("Params must be valid JSON")); return; }
    }
    const res = await run(() => apiPost(current.path, params));
    setResult(res);
  };

  const rows = rankedRows(result);

  return (
    <PageShell
      title="GRAPH OPS"
      subtitle="WAVE-1 BRIDGE — GRAPH · OPTIMIZE · COUNTERFACTUAL · TEMPORAL"
      accent={ACCENT}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
        <StatTile label="Operation" value={current.label} accent={ACCENT} />
        <StatTile label="Ranked Rows" value={rows.length} accent={C.blue} />
        <StatTile label="Status" value={loading ? "RUNNING" : result ? "DONE" : "IDLE"}
          accent={loading ? C.gold : result ? C.neon : C.text} />
      </div>

      <Tabs tabs={OPS} active={op} onChange={(id) => { setOp(id); setResult(null); setParamsText(""); }} accent={ACCENT} />

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.3fr)", gap: 14, alignItems: "start" }}>
        <PanelCard title="PARAMETERS" accent={ACCENT}>
          <div style={{ fontSize: 9, color: C.text, marginBottom: 8, lineHeight: 1.5 }}>
            POST {current.path} — provide a JSON params body (optional).
          </div>
          <textarea value={paramsText} onChange={(e) => setParamsText(e.target.value)}
            placeholder={current.placeholder} rows={5}
            style={{ ...inputStyle, resize: "vertical", marginBottom: 10 }} />
          <Btn accent={ACCENT} onClick={execute} disabled={loading}>
            {loading ? "…" : "▶ RUN"}
          </Btn>
        </PanelCard>

        <PanelCard title="RESULT" accent={C.blue}>
          <DataState loading={loading} error={error} empty={!result} emptyLabel="Run an operation to see results">
            {result && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {rows.length > 0 && (
                  <div>
                    <div style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>RANKED</div>
                    <MiniChart rows={rows} accent={ACCENT} />
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, marginBottom: 4 }}>RAW</div>
                  <JsonView data={result} max={360} />
                </div>
              </div>
            )}
          </DataState>
        </PanelCard>
      </div>
    </PageShell>
  );
}
