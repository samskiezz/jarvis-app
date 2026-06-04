/**
 * OntologyManager — front end for the Wave-1 Ontology service.
 *
 * Left: a list of ontology objects, filterable by type and a free-text search.
 * Right: the selected object's properties + links/neighbors, an Actions panel
 * that POSTs {action,payload} to /objects/{id}/actions (set_property / add_link
 * / flag) and shows the returned audit trail, plus a create-object form.
 *
 * All calls go through the shared kimiClient API base. Every fetch degrades
 * gracefully — a failing call surfaces an error in its panel rather than
 * breaking the page.
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, DataState, Badge } from "@/components/PageKit";
import { Btn, KV, JsonView, inputStyle } from "@/components/Wave1Kit";
import { apiGet, apiPost, qs, asList, labelOf, useAsync } from "@/lib/wave1";

const ACCENT = C.blue;

const ACTIONS = [
  { id: "set_property", label: "Set Property",
    fields: [["key", "property name"], ["value", "value"]] },
  { id: "add_link", label: "Add Link",
    fields: [["target", "target object id"], ["rel", "relationship"]] },
  { id: "flag", label: "Flag",
    fields: [["reason", "reason"]] },
];

export default function OntologyManager() {
  const [types, setTypes] = useState([]);
  const [objects, setObjects] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);

  const [typeFilter, setTypeFilter] = useState("");
  const [query, setQuery] = useState("");
  const [limit] = useState(100);

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [neighbors, setNeighbors] = useState([]);
  const detailAsync = useAsync();

  // Actions panel state.
  const [actionId, setActionId] = useState("set_property");
  const [actionFields, setActionFields] = useState({});
  const [audit, setAudit] = useState([]);
  const actionAsync = useAsync();

  // Create form state.
  const [createType, setCreateType] = useState("");
  const [createName, setCreateName] = useState("");
  const [createProps, setCreateProps] = useState("");
  const createAsync = useAsync();
  const [createMsg, setCreateMsg] = useState(null);

  const loadTypes = useCallback(async () => {
    try {
      const body = await apiGet("/v1/ontology/types");
      setTypes(asList(body, "types").map((t) => (typeof t === "string" ? t : (t.name || t.id || t.type))));
    } catch {
      setTypes([]);
    }
  }, []);

  const loadObjects = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const body = await apiGet(`/v1/ontology/objects${qs({ type: typeFilter, limit })}`);
      setObjects(asList(body, "objects"));
    } catch (e) {
      setListError(e);
      setObjects([]);
    } finally {
      setListLoading(false);
    }
  }, [typeFilter, limit]);

  useEffect(() => { loadTypes(); }, [loadTypes]);
  useEffect(() => { loadObjects(); }, [loadObjects]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return objects;
    return objects.filter((o) =>
      labelOf(o).toLowerCase().includes(q) ||
      String(o.id || "").toLowerCase().includes(q) ||
      String(o.type || "").toLowerCase().includes(q)
    );
  }, [objects, query]);

  const openObject = useCallback(async (id) => {
    setSelectedId(id);
    setDetail(null);
    setNeighbors([]);
    setAudit([]);
    setActionFields({});
    const d = await detailAsync.run(() => apiGet(`/v1/ontology/objects/${id}`));
    if (d) setDetail(d.object || d);
    // Neighbors fetched separately so its failure doesn't blank the detail.
    try {
      const nb = await apiGet(`/v1/ontology/objects/${id}/neighbors`);
      setNeighbors(asList(nb, "neighbors", "edges"));
    } catch { setNeighbors([]); }
  }, [detailAsync]);

  const runAction = async () => {
    if (!selectedId) return;
    const payload = { ...actionFields };
    const res = await actionAsync.run(() =>
      apiPost(`/v1/ontology/objects/${selectedId}/actions`, { action: actionId, payload }));
    if (res) {
      // Surface whatever audit trail the backend returns; append latest first.
      const trail = asList(res, "audit", "trail", "history");
      setAudit(trail.length ? trail : [{ action: actionId, payload, at: new Date().toISOString(), result: res.status || "ok" }]);
      // Refresh detail to reflect mutation.
      openObject(selectedId);
    }
  };

  const createObject = async () => {
    setCreateMsg(null);
    let props = {};
    const raw = createProps.trim();
    if (raw) {
      try { props = JSON.parse(raw); }
      catch { setCreateMsg({ err: true, text: "Properties must be valid JSON" }); return; }
    }
    const body = { type: createType || undefined, name: createName || undefined, properties: props };
    const res = await createAsync.run(() => apiPost("/v1/ontology/objects", body));
    if (res) {
      setCreateMsg({ err: false, text: `Created ${res.id || labelOf(res)}` });
      setCreateName(""); setCreateProps("");
      loadObjects();
      if (res.id) openObject(res.id);
    }
  };

  const props = detail && (detail.properties || detail.props || {});
  const propPairs = props && typeof props === "object" ? Object.entries(props) : [];
  const curAction = ACTIONS.find((a) => a.id === actionId);

  return (
    <PageShell
      title="ONTOLOGY MANAGER"
      subtitle="WAVE-1 ONTOLOGY — OBJECTS · PROPERTIES · LINKS · ACTIONS · AUDIT"
      accent={ACCENT}
      actions={<Btn accent={ACCENT} onClick={loadObjects}>↻ REFRESH</Btn>}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
        <StatTile label="Objects" value={objects.length} accent={ACCENT} />
        <StatTile label="Types" value={types.length} accent={C.gold} />
        <StatTile label="Showing" value={filtered.length} accent={C.neon} />
        <StatTile label="Selected" value={detail ? labelOf(detail) : "—"} accent={C.purple} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.2fr)", gap: 14, alignItems: "start" }}>
        {/* LEFT — list + create */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <PanelCard title="OBJECTS" accent={ACCENT}
            right={<span style={{ fontSize: 8, color: C.text }}>{filtered.length}/{objects.length}</span>}>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
                style={{ ...inputStyle, width: 130 }}>
                <option value="">all types</option>
                {types.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="search name / id / type…" style={inputStyle} />
            </div>
            <DataState loading={listLoading} error={listError} empty={filtered.length === 0}
              emptyLabel={query || typeFilter ? "No objects match" : "No objects"}>
              <div style={{ maxHeight: 460, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                {filtered.map((o) => {
                  const active = o.id === selectedId;
                  return (
                    <button key={o.id} onClick={() => openObject(o.id)}
                      style={{ textAlign: "left", cursor: "pointer",
                        border: `1px solid ${active ? ACCENT + "88" : C.border}`,
                        background: active ? ACCENT + "1a" : "rgba(0,0,0,0.25)", borderRadius: 5,
                        padding: "6px 9px", color: C.textB, fontFamily: "inherit" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: active ? ACCENT : C.textB, flex: 1 }}>{labelOf(o)}</span>
                        {o.type && <Badge color={C.gold}>{o.type}</Badge>}
                      </div>
                      <div style={{ fontSize: 8, color: C.text, marginTop: 2 }}>{o.id}</div>
                    </button>
                  );
                })}
              </div>
            </DataState>
          </PanelCard>

          <PanelCard title="CREATE OBJECT" accent={C.neon}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <select value={createType} onChange={(e) => setCreateType(e.target.value)} style={inputStyle}>
                <option value="">select type…</option>
                {types.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input value={createName} onChange={(e) => setCreateName(e.target.value)}
                placeholder="name" style={inputStyle} />
              <textarea value={createProps} onChange={(e) => setCreateProps(e.target.value)}
                placeholder='properties JSON  {"key":"value"}' rows={3}
                style={{ ...inputStyle, resize: "vertical" }} />
              <Btn accent={C.neon} onClick={createObject} disabled={createAsync.loading}
                style={{ alignSelf: "flex-start" }}>
                {createAsync.loading ? "…" : "+ CREATE"}
              </Btn>
              {createMsg && (
                <div style={{ fontSize: 9, color: createMsg.err ? C.red : C.neon }}>
                  {createMsg.err ? "⚠ " : "✓ "}{createMsg.text}
                </div>
              )}
              {createAsync.error && (
                <div style={{ fontSize: 9, color: C.red }}>⚠ {String(createAsync.error.message || createAsync.error)}</div>
              )}
            </div>
          </PanelCard>
        </div>

        {/* RIGHT — detail + actions + audit */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <PanelCard title="OBJECT DETAIL" accent={ACCENT}>
            {!selectedId ? (
              <div style={{ padding: 18, fontSize: 10, color: C.text, letterSpacing: 1 }}>← Select an object.</div>
            ) : (
              <DataState loading={detailAsync.loading} error={detailAsync.error} empty={!detail}>
                {detail && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: ACCENT }}>{labelOf(detail)}</div>
                      <div style={{ fontSize: 8, color: C.text, marginTop: 2 }}>{detail.type} · {detail.id}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, marginBottom: 4 }}>PROPERTIES</div>
                      {propPairs.length
                        ? propPairs.map(([k, v]) => <KV key={k} k={k} v={v} />)
                        : <div style={{ fontSize: 9, color: C.text }}>no properties</div>}
                    </div>
                    <div>
                      <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, marginBottom: 4 }}>
                        LINKS / NEIGHBORS ({neighbors.length})
                      </div>
                      {neighbors.length ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {neighbors.map((n, i) => {
                            const nid = n.id || n.target || n.to || (n.object && n.object.id);
                            return (
                              <button key={nid || i} onClick={() => nid && openObject(nid)}
                                style={{ cursor: nid ? "pointer" : "default", fontFamily: "inherit",
                                  border: `1px solid ${C.border}`, background: "rgba(0,0,0,0.25)",
                                  borderRadius: 4, padding: "4px 8px", color: C.textB, fontSize: 9 }}>
                                {n.rel || n.relationship ? <span style={{ color: C.gold }}>{n.rel || n.relationship} · </span> : null}
                                {labelOf(n.object || n)}
                              </button>
                            );
                          })}
                        </div>
                      ) : <div style={{ fontSize: 9, color: C.text }}>no links</div>}
                    </div>
                  </div>
                )}
              </DataState>
            )}
          </PanelCard>

          {selectedId && (
            <PanelCard title="ACTIONS" accent={C.purple}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <select value={actionId} onChange={(e) => { setActionId(e.target.value); setActionFields({}); }}
                  style={inputStyle}>
                  {ACTIONS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
                {curAction.fields.map(([f, ph]) => (
                  <input key={f} value={actionFields[f] || ""}
                    onChange={(e) => setActionFields((s) => ({ ...s, [f]: e.target.value }))}
                    placeholder={ph} style={inputStyle} />
                ))}
                <Btn accent={C.purple} onClick={runAction} disabled={actionAsync.loading}
                  style={{ alignSelf: "flex-start" }}>
                  {actionAsync.loading ? "…" : "▶ APPLY ACTION"}
                </Btn>
                {actionAsync.error && (
                  <div style={{ fontSize: 9, color: C.red }}>⚠ {String(actionAsync.error.message || actionAsync.error)}</div>
                )}
                {audit.length > 0 && (
                  <div>
                    <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, margin: "6px 0 4px" }}>AUDIT TRAIL</div>
                    <JsonView data={audit} max={220} />
                  </div>
                )}
              </div>
            </PanelCard>
          )}
        </div>
      </div>
    </PageShell>
  );
}
