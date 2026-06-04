/**
 * AIPLogic — a visual AIP Logic / Agent Studio plan builder (Palantir AIP Logic).
 *
 * A three-column "build a governed plan over tools" workspace:
 *   • LEFT   — the tool PALETTE from /v1/aip/tools, grouped by kind. Each tool is
 *     a clickable card showing its name, description and params_schema. Write
 *     tools wear an amber "GOVERNED" badge (they don't mutate without approval).
 *   • CENTER — the PLAN: an ordered list of steps the user assembles by clicking
 *     palette tools. Each step renders an editable params form (generated from the
 *     tool's params_schema, JSON-textarea fallback). Reorder / remove steps, then
 *     RUN PLAN → POST /v1/aip/plan/run and show the per-step execution TRACE.
 *   • RIGHT  — the PROPOSALS inbox (/v1/aip/proposals): pending governed write-
 *     backs the plan produced, each Approve/Reject — closing the governance loop.
 *
 * The working plan persists to localStorage ("apex.aiplogic.v1").
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { Btn, inputStyle, JsonView } from "@/components/Wave1Kit";
import { apiGet, apiPost, asList } from "@/lib/wave1";

const ACCENT = C.purple;
const STORE_KEY = "apex.aiplogic.v1";
const STATUS_COLOR = { pending: C.gold, approved: C.neon, rejected: C.red };

// A write tool mutates the ontology and is therefore governed (proposal-gated).
const isWrite = (kind = "") => /write|create|update|delete|mutat|action/i.test(kind);
const kindColor = (kind) => (isWrite(kind) ? C.gold : C.blue);

// Pull the field map out of a JSON-schema-ish params_schema. We stay forgiving:
// {properties:{...}} (real JSON schema) or a flat {field:{type}} object both work.
function schemaFields(schema) {
  if (!schema || typeof schema !== "object") return null;
  const props = schema.properties && typeof schema.properties === "object" ? schema.properties : schema;
  const entries = Object.entries(props).filter(([, v]) => v && typeof v === "object");
  return entries.length ? entries : null;
}

const fieldType = (def) => (Array.isArray(def?.type) ? def.type[0] : def?.type) || "string";

// Coerce a raw input string back to the schema type for the plan payload.
function coerce(raw, def) {
  const t = fieldType(def);
  if (raw === "" || raw == null) return "";
  if (t === "number" || t === "integer") {
    const n = Number(raw);
    return Number.isNaN(n) ? raw : n;
  }
  if (t === "boolean") return raw === "true" || raw === true;
  if (t === "object" || t === "array") {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw;
}

let SEQ = 0;
const nextId = () => `s${Date.now().toString(36)}${(SEQ++).toString(36)}`;

export default function AIPLogic() {
  const [tools, setTools] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [steps, setSteps] = useState([]);
  const [trace, setTrace] = useState(null);

  const [toolsState, setToolsState] = useState({ loading: false, error: null });
  const [propState, setPropState] = useState({ loading: false, error: null });
  const [runState, setRunState] = useState({ loading: false, error: null });

  // ── load plan from localStorage on mount ──────────────────────────────────
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (saved && Array.isArray(saved.steps)) setSteps(saved.steps);
    } catch { /* ignore corrupt saved plan */ }
  }, []);

  // ── persist plan whenever it changes ──────────────────────────────────────
  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ steps })); } catch { /* quota */ }
  }, [steps]);

  const loadTools = useCallback(async () => {
    setToolsState({ loading: true, error: null });
    try {
      const b = await apiGet("/v1/aip/tools");
      setTools(asList(b, "tools"));
      setToolsState({ loading: false, error: null });
    } catch (e) {
      setToolsState({ loading: false, error: e });
    }
  }, []);

  const loadProposals = useCallback(async () => {
    setPropState({ loading: true, error: null });
    try {
      const b = await apiGet("/v1/aip/proposals");
      setProposals(asList(b, "proposals"));
      setPropState({ loading: false, error: null });
    } catch (e) {
      setPropState({ loading: false, error: e });
    }
  }, []);

  useEffect(() => { loadTools(); loadProposals(); }, [loadTools, loadProposals]);

  const toolByName = useMemo(() => {
    const m = {};
    for (const t of tools) m[t.name] = t;
    return m;
  }, [tools]);

  // Group palette tools by kind (read tools first, then governed writes).
  const grouped = useMemo(() => {
    const g = {};
    for (const t of tools) {
      const k = t.kind || "tool";
      (g[k] ||= []).push(t);
    }
    return Object.entries(g).sort((a, b) => Number(isWrite(a[0])) - Number(isWrite(b[0])));
  }, [tools]);

  // ── plan mutations ────────────────────────────────────────────────────────
  const addStep = (tool) => {
    const fields = schemaFields(tool.params_schema);
    const params = {};
    if (fields) for (const [k, def] of fields) params[k] = def.default ?? "";
    setSteps((s) => [
      ...s,
      { id: nextId(), tool: tool.name, kind: tool.kind, params, raw: fields ? null : "{}" },
    ]);
    setTrace(null);
  };
  const removeStep = (id) => setSteps((s) => s.filter((x) => x.id !== id));
  const moveStep = (i, dir) => setSteps((s) => {
    const j = i + dir;
    if (j < 0 || j >= s.length) return s;
    const next = s.slice();
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const setParam = (id, key, val) => setSteps((s) =>
    s.map((x) => (x.id === id ? { ...x, params: { ...x.params, [key]: val } } : x)));
  const setRaw = (id, val) => setSteps((s) =>
    s.map((x) => (x.id === id ? { ...x, raw: val } : x)));
  const clearPlan = () => { setSteps([]); setTrace(null); };

  // ── run the assembled plan ────────────────────────────────────────────────
  const runPlan = async () => {
    setRunState({ loading: true, error: null });
    let payloadSteps;
    try {
      payloadSteps = steps.map((st) => {
        const tool = toolByName[st.tool];
        const fields = schemaFields(tool?.params_schema);
        let params;
        if (fields) {
          params = {};
          for (const [k, def] of fields) {
            const v = coerce(st.params?.[k], def);
            if (v !== "") params[k] = v;
          }
        } else {
          params = JSON.parse(st.raw || "{}");
        }
        return { tool: st.tool, params };
      });
    } catch (e) {
      setRunState({ loading: false, error: new Error(`Invalid step params: ${e.message}`) });
      return;
    }
    try {
      const r = await apiPost("/v1/aip/plan/run", { steps: payloadSteps });
      setTrace(r);
      setRunState({ loading: false, error: null });
      loadProposals();
    } catch (e) {
      setRunState({ loading: false, error: e });
    }
  };

  const decide = async (id, action) => {
    try {
      await apiPost(`/v1/aip/proposals/${encodeURIComponent(id)}/${action}`, {});
    } finally {
      loadProposals();
    }
  };

  // Per-step execution results from the trace (forgiving about wrapper keys).
  const traceSteps = useMemo(() => asList(trace, "steps", "trace", "results"), [trace]);
  const pending = proposals.filter((p) => (p.status || "pending") === "pending");
  const writeCount = steps.filter((s) => isWrite(s.kind)).length;

  return (
    <PageShell title="AIP LOGIC" subtitle="visual plan builder · governed tool-use · agent studio" accent={ACCENT}
      actions={<Badge color={C.gold}>{pending.length} PENDING</Badge>}>

      <Grid min={150} style={{ marginBottom: 14 }}>
        <StatTile label="Tools" value={tools.length} accent={C.blue} sub="palette catalog" />
        <StatTile label="Plan Steps" value={steps.length} accent={ACCENT} sub={`${writeCount} governed write${writeCount === 1 ? "" : "s"}`} />
        <StatTile label="Trace" value={traceSteps.length || "—"} accent={C.neon} sub="last run" />
        <StatTile label="Pending" value={pending.length} accent={C.gold} sub="awaiting approval" />
      </Grid>

      <div style={{ display: "grid", gridTemplateColumns: "0.95fr 1.3fr 0.95fr", gap: 12, alignItems: "start" }}>

        {/* ── LEFT: TOOL PALETTE ─────────────────────────────────────────── */}
        <PanelCard title="TOOL PALETTE" accent={C.blue} right={<Badge color={C.blue}>{tools.length}</Badge>}>
          <DataState loading={toolsState.loading} error={toolsState.error} empty={!tools.length} emptyLabel="No tools registered">
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 540, overflowY: "auto" }}>
              {grouped.map(([kind, list]) => (
                <div key={kind}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "0 0 5px 2px" }}>
                    <span style={{ fontSize: 8, letterSpacing: 1.5, color: kindColor(kind), fontWeight: 700, textTransform: "uppercase" }}>{kind}</span>
                    {isWrite(kind) && <Badge color={C.gold}>GOVERNED</Badge>}
                    <span style={{ fontSize: 8, color: C.text, marginLeft: "auto" }}>{list.length}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {list.map((t, i) => (
                      <ToolCard key={`${t.name}-${i}`} tool={t} onAdd={() => addStep(t)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </DataState>
        </PanelCard>

        {/* ── CENTER: THE PLAN ───────────────────────────────────────────── */}
        <PanelCard title="PLAN" accent={ACCENT}
          right={
            <span style={{ display: "flex", gap: 6 }}>
              <Btn accent={C.text} onClick={clearPlan} disabled={!steps.length}>CLEAR</Btn>
              <Btn accent={ACCENT} onClick={runPlan} disabled={!steps.length || runState.loading}>
                {runState.loading ? "RUNNING…" : "▶ RUN PLAN"}
              </Btn>
            </span>
          }>
          {runState.error && (
            <div style={{ color: C.red, fontSize: 9, marginBottom: 8 }}>⚠ {String(runState.error.message || runState.error)}</div>
          )}
          {!steps.length ? (
            <div style={{ padding: "26px 10px", color: C.text, fontSize: 10, lineHeight: 1.6, textAlign: "center" }}>
              Click tools from the palette to assemble a plan.<br />
              Read steps execute; <span style={{ color: C.gold }}>governed writes</span> become approval proposals.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {steps.map((st, i) => (
                <StepCard
                  key={st.id} step={st} index={i} last={i === steps.length - 1}
                  tool={toolByName[st.tool]} result={traceSteps[i]}
                  onUp={() => moveStep(i, -1)} onDown={() => moveStep(i, +1)}
                  onRemove={() => removeStep(st.id)}
                  onParam={(k, v) => setParam(st.id, k, v)}
                  onRaw={(v) => setRaw(st.id, v)}
                />
              ))}
            </div>
          )}
        </PanelCard>

        {/* ── RIGHT: PROPOSALS INBOX ─────────────────────────────────────── */}
        <PanelCard title="PROPOSALS" accent={C.gold}
          right={<Btn accent={C.gold} onClick={loadProposals}>↻</Btn>}>
          <DataState loading={propState.loading} error={propState.error} empty={!proposals.length}
            emptyLabel="No proposals — governed writes from the plan land here for approval.">
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 540, overflowY: "auto" }}>
              {proposals.map((p, i) => {
                const st = p.status || "pending";
                return (
                  <div key={p.id || i} style={{ padding: "9px 10px", border: `1px solid ${C.border}`, borderRadius: 5,
                    background: `${STATUS_COLOR[st] || C.text}0d` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, flexWrap: "wrap" }}>
                      <Badge color={STATUS_COLOR[st] || C.text}>{st}</Badge>
                      <span style={{ color: C.textB, fontWeight: 700 }}>{p.action}</span>
                      {p.object_id && <span style={{ color: C.text, fontSize: 9 }}>→ {p.object_id}</span>}
                    </div>
                    {p.rationale && <div style={{ fontSize: 8, color: C.text, marginTop: 4, fontStyle: "italic" }}>“{p.rationale}”</div>}
                    {p.payload != null && (
                      <pre style={{ fontSize: 8, color: C.text, margin: "5px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {typeof p.payload === "string" ? p.payload : JSON.stringify(p.payload)}
                      </pre>
                    )}
                    {st === "pending" && (
                      <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                        <Btn accent={C.neon} onClick={() => decide(p.id, "approve")}>APPROVE</Btn>
                        <Btn accent={C.red} onClick={() => decide(p.id, "reject")}>REJECT</Btn>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </DataState>
        </PanelCard>
      </div>
    </PageShell>
  );
}

// ── A palette tool card: name + kind badge + description + schema field hints ─
function ToolCard({ tool, onAdd }) {
  const write = isWrite(tool.kind);
  const fields = schemaFields(tool.params_schema);
  return (
    <button onClick={onAdd} title="Add to plan"
      style={{ textAlign: "left", cursor: "pointer", fontFamily: "inherit", padding: "8px 9px", borderRadius: 5,
        border: `1px solid ${write ? C.gold + "55" : C.border}`,
        background: write ? `${C.gold}0d` : "rgba(0,0,0,0.22)", color: C.textB, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.textB }}>{tool.name}</span>
        <span style={{ marginLeft: "auto", color: write ? C.gold : C.blue, fontSize: 14, lineHeight: 1 }}>+</span>
      </div>
      {tool.description && <div style={{ fontSize: 8, color: C.text, marginTop: 3, lineHeight: 1.4 }}>{tool.description}</div>}
      {fields && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
          {fields.map(([k, def]) => (
            <span key={k} style={{ fontSize: 7.5, letterSpacing: 0.3, padding: "1px 5px", borderRadius: 3,
              border: `1px solid ${C.border}`, color: C.text }}>
              {k}<span style={{ opacity: 0.6 }}>:{fieldType(def)}</span>{def.required ? "*" : ""}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

// ── A plan step: header + editable params form + inline per-step trace ───────
function StepCard({ step, index, last, tool, result, onUp, onDown, onRemove, onParam, onRaw }) {
  const write = isWrite(step.kind);
  const fields = schemaFields(tool?.params_schema);
  const ok = result == null ? null : result.ok !== false && !result.error;
  return (
    <div style={{ border: `1px solid ${write ? C.gold + "44" : C.border}`, borderRadius: 6, overflow: "hidden",
      background: "rgba(0,0,0,0.18)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 9px",
        background: write ? `${C.gold}0d` : `${ACCENT}0a`, borderBottom: `1px solid ${C.border}` }}>
        <span style={{ width: 18, height: 18, borderRadius: 4, display: "grid", placeItems: "center",
          fontSize: 9, fontWeight: 700, color: ACCENT, border: `1px solid ${ACCENT}55`, background: `${ACCENT}14` }}>{index + 1}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.textB }}>{step.tool}</span>
        {write && <Badge color={C.gold}>GOVERNED</Badge>}
        {result != null && <Badge color={ok ? C.neon : C.red}>{ok ? "OK" : "ERROR"}</Badge>}
        <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <MiniBtn onClick={onUp} disabled={index === 0}>↑</MiniBtn>
          <MiniBtn onClick={onDown} disabled={last}>↓</MiniBtn>
          <MiniBtn onClick={onRemove} accent={C.red}>✕</MiniBtn>
        </span>
      </div>

      <div style={{ padding: "8px 9px" }}>
        {fields ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {fields.map(([k, def]) => {
              const t = fieldType(def);
              const val = step.params?.[k] ?? "";
              return (
                <label key={k} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontSize: 8, letterSpacing: 0.5, color: C.text, textTransform: "uppercase" }}>
                    {k}{def.required ? <span style={{ color: C.red }}> *</span> : null}
                    <span style={{ opacity: 0.6, marginLeft: 5 }}>{t}</span>
                  </span>
                  {Array.isArray(def.enum) ? (
                    <select value={val} onChange={(e) => onParam(k, e.target.value)} style={{ ...inputStyle }}>
                      <option value="">—</option>
                      {def.enum.map((o) => <option key={String(o)} value={o}>{String(o)}</option>)}
                    </select>
                  ) : t === "boolean" ? (
                    <select value={String(val)} onChange={(e) => onParam(k, e.target.value)} style={{ ...inputStyle }}>
                      <option value="">—</option>
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  ) : t === "object" || t === "array" ? (
                    <textarea value={typeof val === "string" ? val : JSON.stringify(val)} rows={2}
                      onChange={(e) => onParam(k, e.target.value)} placeholder={def.description || `JSON ${t}`}
                      style={{ ...inputStyle, fontFamily: "monospace", resize: "vertical" }} />
                  ) : (
                    <input value={val} onChange={(e) => onParam(k, e.target.value)}
                      type={t === "number" || t === "integer" ? "number" : "text"}
                      placeholder={def.description || def.example || ""} style={{ ...inputStyle }} />
                  )}
                </label>
              );
            })}
          </div>
        ) : (
          <textarea value={step.raw ?? "{}"} onChange={(e) => onRaw(e.target.value)} rows={3}
            placeholder='{ "param": "value" }'
            style={{ ...inputStyle, fontFamily: "monospace", resize: "vertical" }} />
        )}

        {result != null && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 7.5, letterSpacing: 1, color: C.text, marginBottom: 3 }}>RESULT</div>
            <JsonView data={result} max={180} />
          </div>
        )}
      </div>
    </div>
  );
}

function MiniBtn({ children, accent = C.text, disabled, onClick }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 10, lineHeight: 1,
        width: 20, height: 20, borderRadius: 4, border: `1px solid ${C.border}`,
        background: "rgba(0,0,0,0.3)", color: accent, opacity: disabled ? 0.35 : 1 }}>
      {children}
    </button>
  );
}
