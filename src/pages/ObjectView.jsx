/**
 * ObjectView — a Foundry-grade Object View / Object Explorer for the Wave-1
 * Ontology service. This is the object-centric workspace: pick an object on the
 * left, study it in the center, act on it and trace its lineage on the right.
 *
 *   LEFT    a searchable, type-faceted object list (GET /v1/ontology/objects).
 *           Type facets (counts per type) are computed from the result set and
 *           rendered as filter chips; a free-text box narrows further.
 *   CENTER  the selected object's rich detail (GET /v1/ontology/objects/{id}) —
 *           header (label · type badge · classification mark badge), a
 *           PROPERTIES table, computed values (GET /v1/ontology-ext/objects/
 *           {id}/computed), and created/updated timestamps.
 *   RELATED  linked objects grouped by relation (GET .../neighbors); clicking a
 *           neighbor navigates to it.
 *   ACTIONS  Foundry governed write-backs — set_property / add_link / flag POST
 *           {action,payload} to .../actions (bearer via apiPost). After an
 *           action the object refreshes; the audit trail is shown as a timeline.
 *
 * Every fetch degrades gracefully via DataState; a failing call surfaces in its
 * own panel rather than breaking the page.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { Btn, inputStyle, JsonView } from "@/components/Wave1Kit";
import { apiGet, apiPost, qs, asList } from "@/lib/wave1";

const ACCENT = C.blue;

// Standard Foundry-governed write-back actions and their payload fields.
const ACTIONS = [
  { id: "set_property", label: "Set Property", accent: C.blue,
    fields: [["key", "property name"], ["value", "value"]] },
  { id: "add_link", label: "Add Link", accent: C.gold,
    fields: [["target", "target object id"], ["rel", "relationship"]] },
  { id: "flag", label: "Flag", accent: C.red,
    fields: [["reason", "reason"]] },
];

// Human label for an object / hit — id is the reliable fallback.
const labelOf = (o) =>
  (o && (o.name || o.label || o.title || o.display_name || o.id)) || "(unnamed)";

// An object's classification mark, if any (props or top-level).
const markOf = (o) => {
  const p = (o && (o.properties || o.props)) || {};
  return o?.mark || o?.classification || p.mark || p.classification || null;
};

const markColor = (m) => (m && C.mark[String(m).toUpperCase()]) || C.text;

// Best-effort timestamp resolution across the slightly non-uniform backends.
const tsOf = (o, ...keys) => {
  for (const k of keys) if (o && o[k]) return o[k];
  const p = (o && (o.properties || o.props)) || {};
  for (const k of keys) if (p[k]) return p[k];
  return null;
};

const fmtTs = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
};

export default function ObjectView() {
  // LEFT — object list.
  const [objects, setObjects] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [query, setQuery] = useState("");

  // CENTER — selected object.
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [computed, setComputed] = useState(null);

  // RELATED — neighbors.
  const [neighbors, setNeighbors] = useState([]);

  // ACTIONS / HISTORY — write-backs + audit trail.
  const [actionId, setActionId] = useState("set_property");
  const [actionFields, setActionFields] = useState({});
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [audit, setAudit] = useState([]);

  // The list query sends type + q to the backend; we still re-filter client-side
  // so the facet chips and search feel instant against the loaded set.
  const loadObjects = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const body = await apiGet(`/v1/ontology/objects${qs({ type: typeFilter, q: query })}`);
      setObjects(asList(body, "objects"));
    } catch (e) {
      setListError(e);
      setObjects([]);
    } finally {
      setListLoading(false);
    }
  }, [typeFilter, query]);

  useEffect(() => { loadObjects(); }, [loadObjects]);

  // Type facets — counts per type over the loaded result set.
  const facets = useMemo(() => {
    const counts = new Map();
    for (const o of objects) {
      const t = o?.type || "untyped";
      counts.set(t, (counts.get(t) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [objects]);

  // Client-side narrowing by the active type chip + free-text query.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return objects.filter((o) => {
      if (typeFilter && (o?.type || "untyped") !== typeFilter) return false;
      if (!q) return true;
      return (
        labelOf(o).toLowerCase().includes(q) ||
        String(o.id || "").toLowerCase().includes(q) ||
        String(o.type || "").toLowerCase().includes(q)
      );
    });
  }, [objects, typeFilter, query]);

  // Load the audit trail for an object (drives the ACTIONS list + HISTORY timeline).
  const loadAudit = useCallback(async (id) => {
    try {
      const body = await apiGet(`/v1/ontology/objects/${id}/actions`);
      setAudit(asList(body, "actions", "audit", "trail", "history"));
    } catch {
      setAudit([]);
    }
  }, []);

  // Navigate to / open an object: detail + computed + neighbors + audit, each
  // isolated so one failing fetch doesn't blank the others.
  const openObject = useCallback(async (id) => {
    if (!id) return;
    setSelectedId(id);
    setDetail(null);
    setComputed(null);
    setNeighbors([]);
    setActionFields({});
    setActionError(null);
    setAudit([]);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const d = await apiGet(`/v1/ontology/objects/${id}`);
      setDetail((d && (d.object || d)) || null);
    } catch (e) {
      setDetailError(e);
    } finally {
      setDetailLoading(false);
    }
    try {
      const cv = await apiGet(`/v1/ontology-ext/objects/${id}/computed`);
      setComputed((cv && (cv.computed || cv.values || cv)) || null);
    } catch { setComputed(null); }
    try {
      const nb = await apiGet(`/v1/ontology/objects/${id}/neighbors`);
      setNeighbors(asList(nb, "neighbors", "edges", "links"));
    } catch { setNeighbors([]); }
    loadAudit(id);
  }, [loadAudit]);

  // Apply a governed write-back, then refresh the object to reflect the mutation.
  const runAction = async () => {
    if (!selectedId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await apiPost(`/v1/ontology/objects/${selectedId}/actions`,
        { action: actionId, payload: { ...actionFields } });
      setActionFields({});
      await openObject(selectedId);
    } catch (e) {
      setActionError(e);
    } finally {
      setActionLoading(false);
    }
  };

  // PROPERTIES table rows.
  const props = detail && (detail.properties || detail.props);
  const propPairs = props && typeof props === "object" ? Object.entries(props) : [];

  // Computed values normalized to entries (object map or list of {key,value}).
  const computedPairs = useMemo(() => {
    if (!computed) return [];
    if (Array.isArray(computed)) {
      return computed.map((r, i) => [r.key ?? r.name ?? r.label ?? String(i), r.value ?? r.val ?? r]);
    }
    if (typeof computed === "object") return Object.entries(computed);
    return [];
  }, [computed]);

  // Neighbors grouped by relation for the RELATED panel.
  const neighborGroups = useMemo(() => {
    const groups = new Map();
    for (const n of neighbors) {
      const rel = n.rel || n.relationship || n.relation || n.type || "linked";
      if (!groups.has(rel)) groups.set(rel, []);
      groups.get(rel).push(n);
    }
    return [...groups.entries()];
  }, [neighbors]);

  const mark = markOf(detail);
  const created = fmtTs(tsOf(detail, "created_at", "createdAt", "created"));
  const updated = fmtTs(tsOf(detail, "updated_at", "updatedAt", "updated", "modified_at"));
  const curAction = ACTIONS.find((a) => a.id === actionId) || ACTIONS[0];

  return (
    <PageShell
      title="OBJECT VIEW"
      subtitle="ONTOLOGY — OBJECT-CENTRIC WORKSPACE · PROPERTIES · RELATIONS · GOVERNED ACTIONS · AUDIT"
      accent={ACCENT}
      actions={<Btn accent={ACCENT} onClick={loadObjects}>↻ REFRESH</Btn>}
    >
      <Grid min={150} style={{ marginBottom: 14 }}>
        <StatTile label="Objects" value={objects.length} accent={ACCENT} />
        <StatTile label="Types" value={facets.length} accent={C.gold} />
        <StatTile label="Showing" value={filtered.length} accent={C.neon} />
        <StatTile label="Selected" value={detail ? labelOf(detail) : "—"} accent={C.purple} />
      </Grid>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,0.9fr) minmax(0,1.5fr) minmax(0,1fr)",
        gap: 14, alignItems: "start" }}>

        {/* ─────────── LEFT — searchable, type-faceted object list ─────────── */}
        <PanelCard title="OBJECTS" accent={ACCENT}
          right={<span style={{ fontSize: 8, color: C.text }}>{filtered.length}/{objects.length}</span>}>
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="search name / id / type…" style={{ ...inputStyle, marginBottom: 10 }} />

          {/* Type facet chips (counts per type). */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
            <FacetChip label="all" count={objects.length} active={!typeFilter}
              accent={ACCENT} onClick={() => setTypeFilter("")} />
            {facets.map(([t, n]) => (
              <FacetChip key={t} label={t} count={n} active={typeFilter === t}
                accent={C.type[t] || C.gold}
                onClick={() => setTypeFilter((cur) => (cur === t ? "" : t))} />
            ))}
          </div>

          <DataState loading={listLoading} error={listError} empty={filtered.length === 0}
            emptyLabel={query || typeFilter ? "No objects match" : "No objects"}>
            <div style={{ maxHeight: 540, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
              {filtered.map((o) => {
                const active = o.id === selectedId;
                const m = markOf(o);
                return (
                  <button key={o.id} onClick={() => openObject(o.id)}
                    style={{ textAlign: "left", cursor: "pointer",
                      border: `1px solid ${active ? ACCENT + "88" : C.border}`,
                      background: active ? ACCENT + "1a" : "rgba(0,0,0,0.25)", borderRadius: 5,
                      padding: "6px 9px", color: C.textB, fontFamily: "inherit" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: active ? ACCENT : C.textB,
                        flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {labelOf(o)}
                      </span>
                      {o.type && <Badge color={C.type[o.type] || C.gold}>{o.type}</Badge>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <span style={{ fontSize: 8, color: C.text, flex: 1, overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.id}</span>
                      {m && <Badge color={markColor(m)}>{m}</Badge>}
                    </div>
                  </button>
                );
              })}
            </div>
          </DataState>
        </PanelCard>

        {/* ─────────── CENTER — the Object View ─────────── */}
        <PanelCard title="OBJECT VIEW" accent={ACCENT}
          right={detail && <Badge color={markColor(mark)}>{mark || "UNCLASSIFIED"}</Badge>}>
          {!selectedId ? (
            <div style={{ padding: 24, fontSize: 10, color: C.text, letterSpacing: 1 }}>
              ← Select an object to inspect.
            </div>
          ) : (
            <DataState loading={detailLoading} error={detailError} empty={!detail}>
              {detail && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* Header */}
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: ACCENT }}>{labelOf(detail)}</span>
                      {detail.type && <Badge color={C.type[detail.type] || C.gold}>{detail.type}</Badge>}
                      {mark && <Badge color={markColor(mark)}>{mark}</Badge>}
                    </div>
                    <div style={{ fontSize: 8, color: C.text, marginTop: 3 }}>{detail.id}</div>
                    {(created || updated) && (
                      <div style={{ display: "flex", gap: 14, marginTop: 6, fontSize: 8, color: C.text }}>
                        {created && <span>CREATED · {created}</span>}
                        {updated && <span>UPDATED · {updated}</span>}
                      </div>
                    )}
                  </div>

                  {/* PROPERTIES table */}
                  <div>
                    <SectionLabel>PROPERTIES ({propPairs.length})</SectionLabel>
                    {propPairs.length ? (
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <tbody>
                          {propPairs.map(([k, v]) => (
                            <tr key={k} style={{ borderBottom: `1px solid ${C.border}` }}>
                              <td style={{ padding: "5px 8px 5px 0", fontSize: 8, color: C.text,
                                textTransform: "uppercase", letterSpacing: 0.5, verticalAlign: "top",
                                whiteSpace: "nowrap", width: 1 }}>{k}</td>
                              <td style={{ padding: "5px 0", fontSize: 10, color: C.textB,
                                wordBreak: "break-word" }}>
                                {typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? "—")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : <div style={{ fontSize: 9, color: C.text }}>no properties</div>}
                  </div>

                  {/* COMPUTED values (ontology-ext) */}
                  {computedPairs.length > 0 && (
                    <div>
                      <SectionLabel>COMPUTED ({computedPairs.length})</SectionLabel>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <tbody>
                          {computedPairs.map(([k, v], i) => (
                            <tr key={`${k}-${i}`} style={{ borderBottom: `1px solid ${C.border}` }}>
                              <td style={{ padding: "5px 8px 5px 0", fontSize: 8, color: C.gold,
                                textTransform: "uppercase", letterSpacing: 0.5, verticalAlign: "top",
                                whiteSpace: "nowrap", width: 1 }}>{k}</td>
                              <td style={{ padding: "5px 0", fontSize: 10, color: C.textB,
                                wordBreak: "break-word" }}>
                                {typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? "—")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </DataState>
          )}
        </PanelCard>

        {/* ─────────── RIGHT — related + actions + history ─────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* RELATED — neighbors grouped by relation */}
          <PanelCard title="RELATED" accent={C.neon}
            right={<span style={{ fontSize: 8, color: C.text }}>{neighbors.length}</span>}>
            {!selectedId ? (
              <div style={{ fontSize: 9, color: C.text }}>—</div>
            ) : neighborGroups.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 240, overflowY: "auto" }}>
                {neighborGroups.map(([rel, items]) => (
                  <div key={rel}>
                    <div style={{ fontSize: 8, color: C.gold, letterSpacing: 1, marginBottom: 4 }}>
                      {rel} ({items.length})
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {items.map((n, i) => {
                        const obj = n.object || n.target_object || n;
                        const nid = n.id || n.target || n.to || obj.id;
                        return (
                          <button key={nid || i} onClick={() => nid && openObject(nid)}
                            disabled={!nid}
                            style={{ cursor: nid ? "pointer" : "default", fontFamily: "inherit",
                              border: `1px solid ${C.border}`, background: "rgba(0,0,0,0.25)",
                              borderRadius: 4, padding: "4px 8px", color: C.textB, fontSize: 9 }}>
                            {labelOf(obj)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : <div style={{ fontSize: 9, color: C.text }}>no related objects</div>}
          </PanelCard>

          {/* ACTIONS — governed write-backs */}
          <PanelCard title="ACTIONS" accent={C.purple}>
            {!selectedId ? (
              <div style={{ fontSize: 9, color: C.text }}>Select an object to act on it.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <select value={actionId}
                  onChange={(e) => { setActionId(e.target.value); setActionFields({}); setActionError(null); }}
                  style={inputStyle}>
                  {ACTIONS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
                {curAction.fields.map(([f, ph]) => (
                  <input key={f} value={actionFields[f] || ""}
                    onChange={(e) => setActionFields((s) => ({ ...s, [f]: e.target.value }))}
                    placeholder={ph} style={inputStyle} />
                ))}
                <Btn accent={curAction.accent} onClick={runAction} disabled={actionLoading}
                  style={{ alignSelf: "flex-start" }}>
                  {actionLoading ? "…" : "▶ APPLY ACTION"}
                </Btn>
                {actionError && (
                  <div style={{ fontSize: 9, color: C.red }}>
                    ⚠ {String(actionError.message || actionError)}
                  </div>
                )}
              </div>
            )}
          </PanelCard>

          {/* HISTORY — action audit as a timeline */}
          <PanelCard title="HISTORY" accent={C.gold}
            right={<span style={{ fontSize: 8, color: C.text }}>{audit.length}</span>}>
            {!selectedId ? (
              <div style={{ fontSize: 9, color: C.text }}>—</div>
            ) : audit.length ? (
              <div style={{ display: "flex", flexDirection: "column", maxHeight: 280, overflowY: "auto" }}>
                {audit.map((a, i) => {
                  const act = a.action || a.type || a.name || "action";
                  const when = fmtTs(a.at || a.timestamp || a.created_at || a.time);
                  const actor = a.actor || a.user || a.by;
                  const result = a.result || a.status;
                  const payload = a.payload || a.body || a.args;
                  return (
                    <div key={i} style={{ display: "flex", gap: 8, paddingBottom: 10 }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.gold,
                          boxShadow: `0 0 5px ${C.gold}`, marginTop: 3 }} />
                        {i < audit.length - 1 && (
                          <span style={{ flex: 1, width: 1, background: C.border, marginTop: 2 }} />
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: C.gold }}>{act}</span>
                          {result && <Badge color={C.neon}>{result}</Badge>}
                        </div>
                        <div style={{ fontSize: 8, color: C.text, marginTop: 2 }}>
                          {when || "—"}{actor ? ` · ${actor}` : ""}
                        </div>
                        {payload && typeof payload === "object" && Object.keys(payload).length > 0 && (
                          <div style={{ marginTop: 4 }}><JsonView data={payload} max={120} /></div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : <div style={{ fontSize: 9, color: C.text }}>no actions recorded</div>}
          </PanelCard>
        </div>
      </div>
    </PageShell>
  );
}

// A type facet filter chip: label + count, accented and highlighted when active.
function FacetChip({ label, count, active, accent = C.gold, onClick }) {
  return (
    <button onClick={onClick}
      style={{ cursor: "pointer", fontFamily: "inherit", fontSize: 8, letterSpacing: 0.5,
        fontWeight: 700, padding: "3px 8px", borderRadius: 12,
        border: `1px solid ${active ? accent + "aa" : C.border}`,
        background: active ? accent + "26" : "rgba(0,0,0,0.25)",
        color: active ? accent : C.textB, display: "inline-flex", gap: 5, alignItems: "center" }}>
      <span>{label}</span>
      <span style={{ color: active ? accent : C.text, fontVariantNumeric: "tabular-nums" }}>{count}</span>
    </button>
  );
}

// Small uppercase section label used inside the center detail panel.
function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, marginBottom: 6,
      textTransform: "uppercase" }}>{children}</div>
  );
}
