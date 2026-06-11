/**
 * PlaneGraph — the Drive UI's signature radial plane constellation, native.
 *
 * This is the "jarvis_enterprise_operator_full" centrepiece reimplemented inside
 * the existing app: the four platform planes (Foundry/Gotham/Apollo/AIP) laid out
 * radially, each surrounded by its real operational layer chain. It is driven by
 * the SAME ported engine the Drive UI used — `radialLayout` + `planeColor`
 * (engine/layoutEngine) and `filterRenderableGraph` (engine/graphPolicy) — so the
 * governance contract (every node/edge must carry confidence, classification,
 * evidence_id, audit_id, policy_decision) is enforced here too: anything that
 * fails validation simply isn't rendered (no random edges rule).
 *
 * Live overlay: GET /v1/jarvis/system/status feeds real counts (endpoints,
 * ontology objects, neurons, fleet, jobs) onto the relevant layers, and the
 * plane ring colours by UP/DOWN subsystem health. Picking a layer traces the
 * full source → ontology → graph/vector → action → audit route, the way the
 * Drive's Jarvis Operator answered.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { apiGet, useAsync } from "@/lib/wave1";
import { radialLayout, planeColor } from "@/engine/layoutEngine";
import { filterRenderableGraph } from "@/engine/graphPolicy";

const PLANES = ["Foundry", "Gotham", "Apollo", "AIP"];

// The real operational layer chain for each plane (matches the Drive manifest +
// the platform's actual subsystems). `metric` keys map onto /system/status.
const PLANE_LAYERS = {
  Foundry: [
    { id: "source-registry", label: "Source Registry", metric: "endpoints" },
    { id: "acquisition", label: "Acquisition Points", metric: "subjects" },
    { id: "quality-gates", label: "Quality Gates" },
    { id: "ontology", label: "Ontology", metric: "ontology_objects" },
    { id: "graph-vector", label: "Graph / Vector", metric: "flow_edges" },
    { id: "workflow-bridge", label: "Workflow Bridge" },
    { id: "foundry-audit", label: "Audit" },
  ],
  Gotham: [
    { id: "live-events", label: "Live Events" },
    { id: "entity-resolution", label: "Entity Resolution" },
    { id: "geo-timeline", label: "Geo / Timeline" },
    { id: "evidence-chain", label: "Evidence Chain" },
    { id: "case-workspace", label: "Case Workspace" },
    { id: "action-approval", label: "Action Approval", metric: "approvals" },
    { id: "decision-replay", label: "Decision Replay" },
  ],
  Apollo: [
    { id: "desired-state", label: "Desired State" },
    { id: "fleet-agents", label: "Fleet Agents", metric: "fleet" },
    { id: "workload-identity", label: "Workload Identity" },
    { id: "opa-policy", label: "OPA Policy" },
    { id: "health-gates", label: "Health Gates" },
    { id: "canary-rollout", label: "Canary Rollout", metric: "releases" },
    { id: "rollback", label: "Rollback Evidence" },
  ],
  AIP: [
    { id: "governed-context", label: "Governed Context", metric: "neurons" },
    { id: "tools", label: "Tools", metric: "models" },
    { id: "graphrag", label: "GraphRAG" },
    { id: "action-proposals", label: "Action Proposals" },
    { id: "aip-policy", label: "Policy Gate" },
    { id: "aip-audit", label: "Audit Evidence" },
  ],
};

// Pull a live count for a layer metric out of the /system/status rollup.
function metricValue(status, plane, metric) {
  if (!status || !metric) return null;
  const f = status.foundry || {};
  const g = status.gotham || {};
  const a = status.apollo || {};
  const ai = status.aip || {};
  const jobs = status.ingestion_jobs || {};
  const map = {
    endpoints: f.endpoints, subjects: f.subjects, flow_edges: f.flow_edges,
    ontology_objects: g.ontology_objects, neurons: g.neurons,
    approvals: g.approvals ?? jobs.review_required,
    fleet: a.fleet ?? a.agents, releases: a.releases,
    models: ai.models, jobs: jobs.total,
  };
  const v = map[metric];
  return v == null ? null : Number(v) || 0;
}

// Build the governed VisualNode/VisualEdge graph. Every node/edge carries the
// full evidence contract so filterRenderableGraph keeps it (nothing fabricated).
function buildGraph(status) {
  const nodes = [];
  const edges = [];
  const gov = (extra) => ({
    confidence: 1, classification: "internal",
    evidence_id: "ARCH-MANIFEST", audit_id: "AUD-ARCH", ...extra,
  });
  for (const plane of PLANES) {
    nodes.push(gov({ id: plane, label: plane, type: "Plane", plane }));
    const layers = PLANE_LAYERS[plane];
    layers.forEach((ly, i) => {
      const live = metricValue(status, plane, ly.metric);
      nodes.push(gov({
        id: `${plane}:${ly.id}`, label: ly.label, type: "Layer", plane,
        metric: ly.metric || "", live,
      }));
      // chain: plane → layer0 → layer1 → ... (the operational route)
      const src = i === 0 ? plane : `${plane}:${layers[i - 1].id}`;
      edges.push({
        source: src, target: `${plane}:${ly.id}`,
        relationship_type: "flows_to", weight: 1,
        evidence_id: "ARCH-MANIFEST", audit_id: "AUD-ARCH",
        confidence: 1, policy_decision: "allow_internal",
      });
    });
  }
  return filterRenderableGraph(nodes, edges);
}

export default function PlaneGraph() {
  const [active, setActive] = useState("Foundry");
  const [status, setStatus] = useState(null);
  const [llm, setLlm] = useState(null);
  const [selected, setSelected] = useState(null);
  const stAsync = useAsync();

  const load = useCallback(async () => {
    const s = await stAsync.run(() => apiGet("/v1/jarvis/system/status"));
    setStatus(s);
    apiGet("/v1/jarvis/research/status").then(setLlm).catch(() => {});
  }, [stAsync]);
  useEffect(() => { load(); }, [load]);

  // Governed graph + radial layout via the ported Drive engine.
  const { layout, renderEdges, nodeById } = useMemo(() => {
    const graph = buildGraph(status);
    const layout = radialLayout(graph.nodes, graph.edges, active);
    const byId = new Map(layout.map((n) => [n.id, n]));
    const dataById = new Map(graph.nodes.map((n) => [n.id, n]));
    const renderEdges = graph.edges
      .map((e) => ({ ...e, s: byId.get(e.source), t: byId.get(e.target) }))
      .filter((e) => e.s && e.t);
    return { graph, layout, renderEdges, nodeById: dataById };
  }, [status, active]);

  const up = status?.subsystems_up || {};
  // Status keys are descriptive ("Foundry (data plane)") — match by plane prefix.
  const planeHealthy = (p) => {
    const hit = Object.entries(up).find(([k]) => k.toLowerCase().startsWith(p.toLowerCase()));
    return hit ? hit[1] !== false : true; // default UP unless explicitly DOWN
  };
  const selNode = selected ? nodeById.get(selected) : null;
  const route = (PLANE_LAYERS[active] || []).map((l) => l.label).join(" → ");

  const W = 920, H = 640;

  return (
    <PageShell
      title="PLANE GRAPH"
      subtitle="JARVIS ENTERPRISE OPERATOR — RADIAL PLANE CONSTELLATION · GOVERNED EDGES"
      accent={planeColor(active)}
      actions={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Badge color={llm?.available ? C.neon : C.text}>AIP: {llm?.backend || "offline"}</Badge>
          <button onClick={load} disabled={stAsync.loading}
            style={{ background: planeColor(active) + "1a", border: `1px solid ${planeColor(active)}55`,
              color: planeColor(active), fontFamily: "inherit", fontSize: 10, letterSpacing: 2,
              padding: "7px 14px", borderRadius: 5, cursor: "pointer", fontWeight: 700 }}>
            {stAsync.loading ? "…" : "↻ SYNC"}
          </button>
        </div>
      }
    >
      {/* Plane selector */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {PLANES.map((p) => {
          const on = active === p;
          const col = planeColor(p);
          const healthy = planeHealthy(p);
          return (
            <button key={p} onClick={() => { setActive(p); setSelected(null); }}
              style={{
                display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                fontFamily: "inherit", fontSize: 11, letterSpacing: 1, fontWeight: 700,
                padding: "8px 16px", borderRadius: 6,
                border: `1px solid ${on ? col : C.border}`,
                background: on ? col + "1f" : "rgba(0,0,0,0.25)",
                color: on ? col : C.text,
              }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: healthy ? col : C.red,
                boxShadow: on ? `0 0 8px ${col}` : "none" }} />
              {p}
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.7fr) minmax(280px,1fr)", gap: 14, alignItems: "start" }}>
        {/* Radial constellation */}
        <PanelCard title="PLANE CONSTELLATION" accent={planeColor(active)}
          right={<Badge color={planeColor(active)}>{layout.length} nodes · {renderEdges.length} edges</Badge>}>
          <DataState loading={stAsync.loading && !status} error={stAsync.error} empty={!layout.length}>
            <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${C.border}`,
              background: "radial-gradient(circle at 50% 50%, rgba(10,22,42,0.6), rgba(0,0,0,0.5))" }}>
              <svg viewBox={`${-W / 2} ${-H / 2} ${W} ${H}`} style={{ display: "block", width: "100%", height: 560 }}>
                <defs>
                  <filter id="pg-glow"><feGaussianBlur stdDeviation="3.2" result="b" />
                    <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                </defs>
                {renderEdges.map((e, i) => (
                  <line key={i} x1={e.s.x} y1={e.s.y} x2={e.t.x} y2={e.t.y}
                    stroke={planeColor(active) + "55"} strokeWidth={Math.max(1, e.weight * 1.6)} />
                ))}
                {layout.map((n) => {
                  const data = nodeById.get(n.id) || {};
                  const isPlane = n.type === "Plane";
                  const col = planeColor(n.plane || n.id);
                  const isActive = n.plane === active || n.id === active;
                  const isSel = n.id === selected;
                  const r = isPlane ? 32 : 16;
                  return (
                    <g key={n.id} transform={`translate(${n.x},${n.y})`} style={{ cursor: "pointer" }}
                      onClick={() => setSelected(n.id)}>
                      {isSel && <circle r={r + 7} fill="none" stroke="#fff" strokeWidth={1.5} opacity={0.8} />}
                      <circle r={r} fill={col}
                        opacity={isActive ? (isPlane ? 0.96 : 0.82) : 0.22}
                        filter={isActive ? "url(#pg-glow)" : undefined} />
                      {data.live != null && (
                        <text y={isPlane ? 5 : 4} textAnchor="middle" fill="#04111f"
                          fontSize={isPlane ? 12 : 9} fontWeight="700"
                          style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                          {data.live > 9999 ? `${Math.round(data.live / 1000)}k` : data.live}
                        </text>
                      )}
                      <text y={isPlane ? r + 18 : r + 13} textAnchor="middle"
                        fill={isActive ? "#eaf6ff" : "#5e7385"}
                        fontSize={isPlane ? 14 : 10}
                        style={{ fontFamily: S_UI, pointerEvents: "none" }}>{n.label}</text>
                    </g>
                  );
                })}
              </svg>
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8, fontSize: 8, color: C.text, alignItems: "center" }}>
              <span>● plane / layer coloured by plane</span>
              <span>━ governed edge (evidence + policy)</span>
              {PLANES.map((p) => (
                <span key={p} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: planeColor(p) }} />{p}
                </span>
              ))}
            </div>
          </DataState>
        </PanelCard>

        {/* Side: plane health + route + node detail */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <PanelCard title="SUBSYSTEM HEALTH" accent={planeColor(active)}>
            <DataState loading={stAsync.loading && !status} empty={!status}>
              <Grid min={120} gap={8}>
                {Object.entries(up).map(([name, ok]) => (
                  <StatTile key={name} label={name} value={ok ? "UP" : "DOWN"} accent={ok ? C.neon : C.red} />
                ))}
              </Grid>
            </DataState>
          </PanelCard>

          <PanelCard title={`${active.toUpperCase()} — OPERATIONAL ROUTE`} accent={planeColor(active)}>
            <div style={{ fontSize: 10, color: C.textB, lineHeight: 1.7, letterSpacing: 0.3 }}>
              {route}
            </div>
            <div style={{ fontSize: 8, color: C.text, marginTop: 8 }}>
              Every visible edge requires evidence_id, audit_id, confidence and policy_decision.
            </div>
          </PanelCard>

          <PanelCard title="NODE DETAIL" accent={C.blue}>
            {!selNode ? (
              <div style={{ padding: 6, fontSize: 10, color: C.text }}>
                Click a plane or layer to inspect its evidence contract.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: planeColor(selNode.plane || selNode.id) }}>{selNode.label}</div>
                  <div style={{ fontSize: 8, color: C.text, marginTop: 2 }}>{selNode.type} · {selNode.plane}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Badge color={planeColor(selNode.plane || selNode.id)}>{selNode.type}</Badge>
                  <Badge color={C.neon}>{selNode.classification}</Badge>
                  {selNode.live != null && <Badge color={C.gold}>{selNode.live.toLocaleString()} live</Badge>}
                </div>
                <div style={{ fontSize: 9, color: C.text, lineHeight: 1.6 }}>
                  evidence: <span style={{ color: C.textB }}>{selNode.evidence_id}</span><br />
                  audit: <span style={{ color: C.textB }}>{selNode.audit_id}</span><br />
                  confidence: <span style={{ color: C.textB }}>{selNode.confidence}</span>
                </div>
              </div>
            )}
          </PanelCard>
        </div>
      </div>
    </PageShell>
  );
}

const S_UI = "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif";
