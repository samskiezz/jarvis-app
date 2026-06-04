/**
 * Operations — front end for the Wave-1 Ops service (alerts, rules, cases).
 *
 * Three tabs:
 *   ALERTS — list open alerts and acknowledge them (POST /alerts/{id}/ack).
 *   RULES  — list rules, create a simple rule, and "evaluate now"
 *            (POST /rules/evaluate).
 *   CASES  — list + create cases, then open one to add notes, attach entities,
 *            and change status.
 *
 * Each tab loads independently and degrades gracefully on a failed call.
 */
import { useState, useEffect, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, DataState, Badge } from "@/components/PageKit";
import { Btn, KV, JsonView, Tabs, inputStyle } from "@/components/Wave1Kit";
import { apiGet, apiPost, asList, labelOf, useAsync } from "@/lib/wave1";

const ACCENT = C.red;

const TABS = [
  { id: "alerts", label: "ALERTS" },
  { id: "rules", label: "RULES" },
  { id: "cases", label: "CASES" },
];

const sevColor = (s) =>
  ({ critical: C.red, high: C.red, medium: C.gold, low: C.blue }[String(s || "").toLowerCase()] || C.text);

/* ───────────────────────── ALERTS ───────────────────────── */
function AlertsTab() {
  const [alerts, setAlerts] = useState([]);
  const { loading, error, run } = useAsync();
  const ackAsync = useAsync();

  const load = useCallback(async () => {
    const body = await run(() => apiGet("/v1/alerts"));
    setAlerts(body ? asList(body, "alerts") : []);
  }, [run]);
  useEffect(() => { load(); }, [load]);

  const ack = async (id) => {
    await ackAsync.run(() => apiPost(`/v1/alerts/${id}/ack`, {}));
    load();
  };

  return (
    <PanelCard title="ALERTS" accent={ACCENT}
      right={<Btn accent={ACCENT} onClick={load} style={{ padding: "3px 8px", fontSize: 8 }}>↻</Btn>}>
      <DataState loading={loading} error={error} empty={alerts.length === 0} emptyLabel="No alerts">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {alerts.map((a, i) => {
            const acked = a.acknowledged || a.ack || a.status === "acknowledged";
            return (
              <div key={a.id || i} style={{ border: `1px solid ${C.border}`, background: "rgba(0,0,0,0.25)",
                borderRadius: 5, padding: "8px 10px", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: sevColor(a.severity),
                  boxShadow: `0 0 6px ${sevColor(a.severity)}`, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textB }}>{a.title || a.message || labelOf(a)}</div>
                  <div style={{ fontSize: 8, color: C.text, marginTop: 2 }}>
                    {a.severity && <span style={{ color: sevColor(a.severity) }}>{a.severity} · </span>}
                    {a.id}{a.created_at ? ` · ${a.created_at}` : ""}
                  </div>
                </div>
                {acked
                  ? <Badge color={C.neon}>ACKED</Badge>
                  : <Btn accent={ACCENT} onClick={() => ack(a.id)} disabled={ackAsync.loading}
                      style={{ padding: "4px 10px", fontSize: 8 }}>ACK</Btn>}
              </div>
            );
          })}
        </div>
      </DataState>
    </PanelCard>
  );
}

/* ───────────────────────── RULES ───────────────────────── */
function RulesTab() {
  const [rules, setRules] = useState([]);
  const { loading, error, run } = useAsync();
  const createAsync = useAsync();
  const evalAsync = useAsync();
  const [name, setName] = useState("");
  const [condition, setCondition] = useState("");
  const [evalResult, setEvalResult] = useState(null);

  const load = useCallback(async () => {
    const body = await run(() => apiGet("/v1/rules"));
    setRules(body ? asList(body, "rules") : []);
  }, [run]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!name.trim()) return;
    await createAsync.run(() => apiPost("/v1/rules", { name: name.trim(), condition: condition.trim() }));
    setName(""); setCondition("");
    load();
  };

  const evaluate = async () => {
    setEvalResult(null);
    const res = await evalAsync.run(() => apiPost("/v1/rules/evaluate", {}));
    setEvalResult(res);
    load();
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 14, alignItems: "start" }}>
      <PanelCard title="RULES" accent={ACCENT}
        right={<span style={{ fontSize: 8, color: C.text }}>{rules.length}</span>}>
        <DataState loading={loading} error={error} empty={rules.length === 0} emptyLabel="No rules">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {rules.map((r, i) => (
              <div key={r.id || i} style={{ border: `1px solid ${C.border}`, background: "rgba(0,0,0,0.25)",
                borderRadius: 5, padding: "8px 10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.textB, flex: 1 }}>{r.name || labelOf(r)}</span>
                  {r.enabled === false ? <Badge color={C.text}>OFF</Badge> : <Badge color={C.neon}>ON</Badge>}
                </div>
                {(r.condition || r.expr) && (
                  <div style={{ fontSize: 9, color: C.text, marginTop: 3, fontFamily: "inherit" }}>{r.condition || r.expr}</div>
                )}
              </div>
            ))}
          </div>
        </DataState>
      </PanelCard>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <PanelCard title="CREATE RULE" accent={C.neon}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="rule name" style={inputStyle} />
            <input value={condition} onChange={(e) => setCondition(e.target.value)}
              placeholder='condition  (e.g. amount > 10000)' style={inputStyle} />
            <Btn accent={C.neon} onClick={create} disabled={createAsync.loading} style={{ alignSelf: "flex-start" }}>
              {createAsync.loading ? "…" : "+ CREATE RULE"}
            </Btn>
            {createAsync.error && <div style={{ fontSize: 9, color: C.red }}>⚠ {String(createAsync.error.message || createAsync.error)}</div>}
          </div>
        </PanelCard>

        <PanelCard title="EVALUATE" accent={C.purple}>
          <Btn accent={C.purple} onClick={evaluate} disabled={evalAsync.loading}>
            {evalAsync.loading ? "…" : "▶ EVALUATE NOW"}
          </Btn>
          {evalAsync.error && <div style={{ fontSize: 9, color: C.red, marginTop: 8 }}>⚠ {String(evalAsync.error.message || evalAsync.error)}</div>}
          {evalResult && <div style={{ marginTop: 10 }}><JsonView data={evalResult} max={240} /></div>}
        </PanelCard>
      </div>
    </div>
  );
}

/* ───────────────────────── CASES ───────────────────────── */
function CasesTab() {
  const [cases, setCases] = useState([]);
  const { loading, error, run } = useAsync();
  const createAsync = useAsync();
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const detailAsync = useAsync();

  const [newTitle, setNewTitle] = useState("");
  const [note, setNote] = useState("");
  const [entity, setEntity] = useState("");
  const [status, setStatus] = useState("");
  const noteAsync = useAsync();
  const entityAsync = useAsync();
  const statusAsync = useAsync();

  const load = useCallback(async () => {
    const body = await run(() => apiGet("/v1/cases"));
    setCases(body ? asList(body, "cases") : []);
  }, [run]);
  useEffect(() => { load(); }, [load]);

  const openCase = useCallback(async (id) => {
    setOpenId(id);
    setDetail(null);
    const d = await detailAsync.run(() => apiGet(`/v1/cases/${id}`));
    if (d) setDetail(d.case || d);
  }, [detailAsync]);

  const createCase = async () => {
    if (!newTitle.trim()) return;
    const res = await createAsync.run(() => apiPost("/v1/cases", { title: newTitle.trim() }));
    setNewTitle("");
    await load();
    if (res && res.id) openCase(res.id);
  };

  const addNote = async () => {
    if (!note.trim() || !openId) return;
    await noteAsync.run(() => apiPost(`/v1/cases/${openId}/notes`, { note: note.trim(), text: note.trim() }));
    setNote("");
    openCase(openId);
  };
  const addEntity = async () => {
    if (!entity.trim() || !openId) return;
    await entityAsync.run(() => apiPost(`/v1/cases/${openId}/entities`, { entity: entity.trim(), id: entity.trim() }));
    setEntity("");
    openCase(openId);
  };
  const setCaseStatus = async () => {
    if (!status.trim() || !openId) return;
    await statusAsync.run(() => apiPost(`/v1/cases/${openId}/status`, { status: status.trim() }));
    openCase(openId);
  };

  const notes = detail ? asList(detail, "notes") : [];
  const entities = detail ? asList(detail, "entities") : [];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.3fr)", gap: 14, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <PanelCard title="CASES" accent={ACCENT}
          right={<Btn accent={ACCENT} onClick={load} style={{ padding: "3px 8px", fontSize: 8 }}>↻</Btn>}>
          <DataState loading={loading} error={error} empty={cases.length === 0} emptyLabel="No cases">
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 420, overflowY: "auto" }}>
              {cases.map((c, i) => {
                const active = c.id === openId;
                return (
                  <button key={c.id || i} onClick={() => openCase(c.id)}
                    style={{ textAlign: "left", cursor: "pointer",
                      border: `1px solid ${active ? ACCENT + "88" : C.border}`,
                      background: active ? ACCENT + "1a" : "rgba(0,0,0,0.25)", borderRadius: 5,
                      padding: "6px 9px", color: C.textB, fontFamily: "inherit" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: active ? ACCENT : C.textB, flex: 1 }}>
                        {c.title || labelOf(c)}
                      </span>
                      {c.status && <Badge color={C.blue}>{c.status}</Badge>}
                    </div>
                    <div style={{ fontSize: 8, color: C.text, marginTop: 2 }}>{c.id}</div>
                  </button>
                );
              })}
            </div>
          </DataState>
        </PanelCard>

        <PanelCard title="NEW CASE" accent={C.neon}>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createCase()}
              placeholder="case title" style={inputStyle} />
            <Btn accent={C.neon} onClick={createCase} disabled={createAsync.loading}>+ ADD</Btn>
          </div>
          {createAsync.error && <div style={{ fontSize: 9, color: C.red, marginTop: 8 }}>⚠ {String(createAsync.error.message || createAsync.error)}</div>}
        </PanelCard>
      </div>

      <PanelCard title="CASE DETAIL" accent={C.purple}>
        {!openId ? (
          <div style={{ padding: 18, fontSize: 10, color: C.text, letterSpacing: 1 }}>← Select or create a case.</div>
        ) : (
          <DataState loading={detailAsync.loading} error={detailAsync.error} empty={!detail}>
            {detail && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.purple }}>{detail.title || labelOf(detail)}</div>
                  <div style={{ fontSize: 8, color: C.text, marginTop: 2 }}>{detail.id}</div>
                </div>
                <KV k="status" v={detail.status || "—"} accent={C.blue} />

                {/* Status change */}
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={status} onChange={(e) => setStatus(e.target.value)}
                    placeholder="new status (open / investigating / closed)" style={inputStyle} />
                  <Btn accent={C.blue} onClick={setCaseStatus} disabled={statusAsync.loading}>SET</Btn>
                </div>

                {/* Entities */}
                <div>
                  <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, marginBottom: 4 }}>ATTACHED ENTITIES ({entities.length})</div>
                  {entities.length ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                      {entities.map((e, i) => <Badge key={i} color={C.gold}>{labelOf(e)}</Badge>)}
                    </div>
                  ) : <div style={{ fontSize: 9, color: C.text, marginBottom: 6 }}>none</div>}
                  <div style={{ display: "flex", gap: 8 }}>
                    <input value={entity} onChange={(e) => setEntity(e.target.value)}
                      placeholder="entity id / name" style={inputStyle} />
                    <Btn accent={C.gold} onClick={addEntity} disabled={entityAsync.loading}>ATTACH</Btn>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, marginBottom: 4 }}>NOTES ({notes.length})</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6, maxHeight: 200, overflowY: "auto" }}>
                    {notes.map((n, i) => (
                      <div key={i} style={{ fontSize: 9, color: C.textB, border: `1px solid ${C.borderB}`,
                        borderRadius: 4, padding: "5px 8px", background: "rgba(0,0,0,0.2)" }}>
                        {typeof n === "string" ? n : (n.note || n.text || JSON.stringify(n))}
                      </div>
                    ))}
                    {!notes.length && <div style={{ fontSize: 9, color: C.text }}>no notes</div>}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input value={note} onChange={(e) => setNote(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addNote()}
                      placeholder="add a note…" style={inputStyle} />
                    <Btn accent={C.neon} onClick={addNote} disabled={noteAsync.loading}>ADD</Btn>
                  </div>
                </div>
              </div>
            )}
          </DataState>
        )}
      </PanelCard>
    </div>
  );
}

export default function Operations() {
  const [tab, setTab] = useState("alerts");
  return (
    <PageShell
      title="OPERATIONS"
      subtitle="WAVE-1 OPS — ALERTS · RULES · CASES"
      accent={ACCENT}
    >
      <Tabs tabs={TABS} active={tab} onChange={setTab} accent={ACCENT} />
      {tab === "alerts" && <AlertsTab />}
      {tab === "rules" && <RulesTab />}
      {tab === "cases" && <CasesTab />}
    </PageShell>
  );
}
