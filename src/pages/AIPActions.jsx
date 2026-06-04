/**
 * AIPActions — front end for the Wave-7 AIP tool-use + governed AI-actions +
 * agent-workflow service (Palantir AIP P9 #63/#64/#65).
 *   • TOOLS   — the callable tool catalog (ontology actions, science methods,
 *     search); run one directly (/v1/aip/call).
 *   • PROPOSALS — AI-proposed governed write-backs that DON'T mutate until a
 *     human approves/rejects (/v1/aip/proposals[, /approve, /reject]).
 *   • PLAN    — run a multi-step agent plan (read tools auto-run; writes become
 *     proposals) (/v1/aip/plan/run).
 * Governance is real: nothing writes to the ontology without explicit approval.
 */
import { useState, useEffect, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, Badge, DataState } from "@/components/PageKit";
import { Btn, inputStyle, JsonView, Tabs } from "@/components/Wave1Kit";
import { apiGet, apiPost, asList, useAsync } from "@/lib/wave1";

const ACCENT = C.purple;
const STATUS_COLOR = { pending: C.gold, approved: C.neon, rejected: C.red };

export default function AIPActions() {
  const [tab, setTab] = useState("tools");
  const [tools, setTools] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [callName, setCallName] = useState("");
  const [callParams, setCallParams] = useState("{}");
  const [callResult, setCallResult] = useState(null);
  const [planSteps, setPlanSteps] = useState('[\n  { "tool": "search", "params": { "q": "risk" } }\n]');
  const [planResult, setPlanResult] = useState(null);
  const toolsAsync = useAsync();
  const callAsync = useAsync();
  const propAsync = useAsync();
  const actAsync = useAsync();
  const planAsync = useAsync();

  const loadTools = useCallback(async () => {
    const b = await toolsAsync.run(() => apiGet("/v1/aip/tools"));
    setTools(asList(b, "tools"));
  }, [toolsAsync]);
  const loadProposals = useCallback(async () => {
    const b = await propAsync.run(() => apiGet("/v1/aip/proposals"));
    setProposals(asList(b, "proposals"));
  }, [propAsync]);

  useEffect(() => { loadTools(); loadProposals(); }, [loadTools, loadProposals]);

  const call = async () => {
    let p; try { p = JSON.parse(callParams); } catch { callAsync.setError(new Error("params must be JSON")); return; }
    const r = await callAsync.run(() => apiPost("/v1/aip/call", { name: callName, params: p }));
    setCallResult(r);
  };
  const decide = async (id, action) => {
    await actAsync.run(() => apiPost(`/v1/aip/proposals/${encodeURIComponent(id)}/${action}`, {}));
    loadProposals();
  };
  const runPlan = async () => {
    let steps; try { steps = JSON.parse(planSteps); } catch { planAsync.setError(new Error("steps must be a JSON array")); return; }
    const r = await planAsync.run(() => apiPost("/v1/aip/plan/run", { steps }));
    setPlanResult(r);
    loadProposals();
  };

  const pending = proposals.filter((p) => (p.status || "pending") === "pending");

  return (
    <PageShell title="AIP ACTIONS" subtitle="tool-use · governed AI write-backs · agent workflows" accent={ACCENT}
      actions={<Badge color={C.gold}>{pending.length} PENDING</Badge>}>
      <Tabs tabs={[{ id: "tools", label: "TOOLS" }, { id: "proposals", label: "PROPOSALS" }, { id: "plan", label: "AGENT PLAN" }]}
        active={tab} onChange={setTab} accent={ACCENT} />

      {tab === "tools" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12 }}>
          <PanelCard title="TOOL CATALOG" accent={ACCENT} right={<Badge color={ACCENT}>{tools.length}</Badge>}>
            <DataState loading={toolsAsync.loading} error={toolsAsync.error} empty={!tools.length} emptyLabel="No tools registered">
              <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 380, overflowY: "auto" }}>
                {tools.map((t, i) => (
                  <button key={i} onClick={() => { setCallName(t.name); setCallResult(null); }}
                    style={{ textAlign: "left", cursor: "pointer", fontFamily: "inherit", fontSize: 10, padding: "7px 9px",
                      borderRadius: 4, border: `1px solid ${callName === t.name ? ACCENT : C.border}`,
                      background: callName === t.name ? `${ACCENT}14` : "rgba(0,0,0,0.2)", color: C.textB }}>
                    <div style={{ fontWeight: 700 }}>{t.name} <Badge color={C.gold}>{t.kind}</Badge></div>
                    <div style={{ fontSize: 8, color: C.text, marginTop: 2 }}>{t.description || t.doc}</div>
                  </button>
                ))}
              </div>
            </DataState>
          </PanelCard>
          <PanelCard title="CALL TOOL" accent={C.neon}>
            <input value={callName} onChange={(e) => setCallName(e.target.value)} placeholder="tool name"
              style={{ ...inputStyle, width: "100%", marginBottom: 6 }} />
            <textarea value={callParams} onChange={(e) => setCallParams(e.target.value)} rows={4}
              style={{ ...inputStyle, width: "100%", fontFamily: "monospace", resize: "vertical" }} />
            <div style={{ marginTop: 6 }}><Btn accent={C.neon} onClick={call}>EXECUTE</Btn></div>
            <DataState loading={callAsync.loading} error={callAsync.error} empty={!callResult} emptyLabel="">
              <div style={{ marginTop: 8 }}>
                {callResult && <Badge color={callResult.ok ? C.neon : C.red}>{callResult.ok ? "OK" : "ERROR"}</Badge>}
                <div style={{ marginTop: 6 }}><JsonView data={callResult} /></div>
              </div>
            </DataState>
          </PanelCard>
        </div>
      )}

      {tab === "proposals" && (
        <PanelCard title="GOVERNED WRITE-BACK PROPOSALS" accent={ACCENT}
          right={<Btn accent={ACCENT} onClick={loadProposals}>↻</Btn>}>
          <DataState loading={propAsync.loading} error={propAsync.error} empty={!proposals.length}
            emptyLabel="No proposals — AI/agent-proposed writes appear here for human approval.">
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {proposals.map((p, i) => {
                const st = p.status || "pending";
                return (
                  <div key={i} style={{ padding: "9px 11px", border: `1px solid ${C.border}`, borderRadius: 5,
                    background: `${STATUS_COLOR[st]}0a` }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 10 }}>
                      <Badge color={STATUS_COLOR[st]}>{st}</Badge>
                      <span style={{ color: C.textB, fontWeight: 700 }}>{p.action}</span>
                      <span style={{ color: C.text }}>→ {p.object_id}</span>
                      {st === "pending" && (
                        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                          <Btn accent={C.neon} onClick={() => decide(p.id, "approve")}>APPROVE</Btn>
                          <Btn accent={C.red} onClick={() => decide(p.id, "reject")}>REJECT</Btn>
                        </span>
                      )}
                    </div>
                    {p.rationale && <div style={{ fontSize: 8, color: C.text, marginTop: 4 }}>“{p.rationale}”</div>}
                    {p.payload && <pre style={{ fontSize: 8, color: C.text, marginTop: 4 }}>{JSON.stringify(p.payload)}</pre>}
                  </div>
                );
              })}
            </div>
          </DataState>
        </PanelCard>
      )}

      {tab === "plan" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <PanelCard title="AGENT PLAN (steps)" accent={ACCENT}>
            <textarea value={planSteps} onChange={(e) => setPlanSteps(e.target.value)} rows={10}
              style={{ ...inputStyle, width: "100%", fontFamily: "monospace", resize: "vertical" }} />
            <div style={{ marginTop: 6 }}><Btn accent={ACCENT} onClick={runPlan}>RUN PLAN</Btn></div>
            <div style={{ fontSize: 8, color: C.text, marginTop: 6 }}>Read tools auto-run; write actions become proposals for approval.</div>
          </PanelCard>
          <PanelCard title="EXECUTION TRACE" accent={C.neon}>
            <DataState loading={planAsync.loading} error={planAsync.error} empty={!planResult} emptyLabel="Run a plan to see the step trace">
              <JsonView data={planResult} max={500} />
            </DataState>
          </PanelCard>
        </div>
      )}
    </PageShell>
  );
}
