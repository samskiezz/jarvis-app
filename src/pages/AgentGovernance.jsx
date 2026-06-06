/**
 * AgentGovernance — AIP plane operator view of governed agent actions, tools and
 * models. Shows the catalogue of governed actions (permission/risk/layer), the
 * available AI models (capabilities/risk/cost) and the live AIP/Llama backend.
 * Backed by /v1/jarvis/actions, /v1/jarvis/ai/models and /v1/jarvis/research/status.
 */
import { useState, useEffect, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, Badge, DataState } from "@/components/PageKit";
import { apiGet, asList, useAsync } from "@/lib/wave1";

const ACCENT = C.purple || C.neon;

const riskColor = (r) =>
  ({ LOW: C.green || C.neon, MEDIUM: C.gold, HIGH: C.red }[String(r || "").toUpperCase()] || C.text);

export default function AgentGovernance() {
  const [actions, setActions] = useState([]);
  const [models, setModels] = useState([]);
  const [llm, setLlm] = useState(null);
  const acAsync = useAsync();
  const mdAsync = useAsync();

  const loadActions = useCallback(async () => {
    const b = await acAsync.run(() => apiGet("/v1/jarvis/actions"));
    setActions(asList(b, "actions"));
  }, [acAsync]);
  const loadModels = useCallback(async () => {
    const b = await mdAsync.run(() => apiGet("/v1/jarvis/ai/models"));
    setModels(asList(b, "models"));
  }, [mdAsync]);
  const loadLlm = useCallback(async () => {
    const b = await apiGet("/v1/jarvis/research/status").catch(() => null);
    setLlm(b);
  }, []);
  useEffect(() => { loadActions(); loadModels(); loadLlm(); }, [loadActions, loadModels, loadLlm]);

  return (
    <PageShell title="Agent Governance" subtitle="AIP · Tools & Models" accent={ACCENT}
      actions={<Badge color={llm?.available ? (C.green || C.neon) : C.red}>
        AIP: {llm?.backend || "offline"}
      </Badge>}>

      <PanelCard title="Governed actions" accent={ACCENT}
        right={<Badge color={ACCENT}>{actions.length} actions</Badge>}>
        <DataState loading={acAsync.loading} error={acAsync.error} empty={!actions.length}>
          <div style={{ overflowX: "auto", maxHeight: 360 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: "left", color: C.dim || "#8aa", position: "sticky", top: 0 }}>
                  <th style={{ padding: "6px 8px" }}>Action</th>
                  <th style={{ padding: "6px 8px" }}>Permission</th>
                  <th style={{ padding: "6px 8px" }}>Risk</th>
                  <th style={{ padding: "6px 8px" }}>Layer</th>
                </tr>
              </thead>
              <tbody>
                {actions.map((a, i) => (
                  <tr key={a?.name || i} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={{ padding: "6px 8px" }}>
                      <div>{a?.name || "(unnamed)"}</div>
                      {a?.description && (
                        <div style={{ fontSize: 9, color: C.text, marginTop: 2 }}>{a.description}</div>
                      )}
                    </td>
                    <td style={{ padding: "6px 8px" }}>{a?.permission || "—"}</td>
                    <td style={{ padding: "6px 8px" }}>
                      <Badge color={riskColor(a?.risk)}>{a?.risk || "—"}</Badge>
                    </td>
                    <td style={{ padding: "6px 8px" }}>{a?.layer || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataState>
      </PanelCard>

      <PanelCard title="AI models" accent={C.blue || C.neon}
        right={<Badge color={C.blue || C.neon}>{models.length} models</Badge>}
        style={{ marginTop: 12 }}>
        <DataState loading={mdAsync.loading} error={mdAsync.error} empty={!models.length}>
          <div style={{ overflowX: "auto", maxHeight: 360 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: "left", color: C.dim || "#8aa", position: "sticky", top: 0 }}>
                  <th style={{ padding: "6px 8px" }}>Model</th>
                  <th style={{ padding: "6px 8px" }}>Capabilities</th>
                  <th style={{ padding: "6px 8px" }}>Risk</th>
                  <th style={{ padding: "6px 8px" }}>Cost / 1k</th>
                  <th style={{ padding: "6px 8px" }}>Max tokens</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m, i) => {
                  const caps = Array.isArray(m?.capabilities)
                    ? m.capabilities.join(", ")
                    : (m?.capabilities || "—");
                  return (
                    <tr key={m?.name || i} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      <td style={{ padding: "6px 8px" }}>{m?.name || "(unnamed)"}</td>
                      <td style={{ padding: "6px 8px", maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{caps}</td>
                      <td style={{ padding: "6px 8px" }}>
                        <Badge color={riskColor(m?.risk)}>{m?.risk || "—"}</Badge>
                      </td>
                      <td style={{ padding: "6px 8px", fontVariantNumeric: "tabular-nums" }}>
                        {m?.cost_per_1k != null ? `$${m.cost_per_1k}` : "—"}
                      </td>
                      <td style={{ padding: "6px 8px", fontVariantNumeric: "tabular-nums" }}>
                        {(m?.max_tokens || 0).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </DataState>
      </PanelCard>
    </PageShell>
  );
}
