/**
 * ActionRunner — a Foundry-style ONTOLOGY ACTIONS / WRITEBACK console over the
 * LIVE ontology service. "Actions" here are governed, schema-validated edits that
 * mutate ontology objects (write-back): pick an object, choose an action type,
 * fill a dynamic parameter form, apply it, and inspect the audited before→after
 * change. A BULK tab fans the same governed action across a filtered set.
 *
 * ── Backend contract (read from server/, not guessed) ───────────────────────────
 *   GET  /v1/ontology/objects?type=&limit=      → {items:[{id,type,label,mark,
 *                                                  props,created_ts,updated_ts}],count}
 *   GET  /v1/ontology/objects/{id}              → one object (+ links)
 *   GET  /v1/ontology/objects/{id}/actions      → {items:[{id,object_id,action,
 *                                                  payload,actor,ts}],count}  (AUDIT)
 *   POST /v1/ontology/objects/{id}/actions       body {action, payload}
 *                                                → {ok, action, audit_id, object}
 *   POST /v1/ontology-ext/bulk-action            body {query|set_id, action, payload}
 *                                                → {ok, action, count, capped,
 *                                                   results:[{id, ok, error?}]}
 *
 * The GET .../actions endpoint returns the AUDIT TRAIL, not an action catalog —
 * the governed action set is the store's fixed allow-list (ontology_store.
 * ALLOWED_ACTIONS): set_property / remove_property / set_label / set_mark /
 * add_link / flag. Each action's declared parameters are mirrored below in
 * ACTION_SPECS and drive the dynamic, validated parameter form. We additionally
 * fetch the per-object audit to seed the object's history timeline.
 *
 * DRY via Wave1Kit + PageKit + wave1; every fetch degrades gracefully via
 * DataState. Cyberpunk-glass house style, matching ObjectView / ObjectExplorer.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { Btn, inputStyle, Tabs, JsonView } from "@/components/Wave1Kit";
import { apiGet, apiPost, qs, asList, useAsync } from "@/lib/wave1";

const ACCENT = C.purple;

// ── Governed action catalog ─────────────────────────────────────────────────────
// Mirrors ontology_store.ALLOWED_ACTIONS and the payload each action declares in
// apply_action(). Each `params` entry generates one field in the dynamic form.
//   kind: text | number | select | bool | object-ref  (drives the input widget)
//   required: enforced client-side before APPLY
const ACTION_SPECS = [
  {
    id: "set_property",
    label: "Set Property",
    accent: C.blue,
    desc: "Set props[key] = value on the object.",
    params: [
      { name: "key", kind: "text", required: true, placeholder: "property name (e.g. status)" },
      { name: "value", kind: "text", required: false, placeholder: "value (string / number / true / false)" },
    ],
  },
  {
    id: "remove_property",
    label: "Remove Property",
    accent: C.red,
    desc: "Delete props[key] from the object.",
    params: [{ name: "key", kind: "select-prop", required: true, placeholder: "property to remove" }],
  },
  {
    id: "set_label",
    label: "Rename (Set Label)",
    accent: C.gold,
    desc: "Rename the object's display label.",
    params: [{ name: "label", kind: "text", required: true, placeholder: "new label" }],
  },
  {
    id: "set_mark",
    label: "Set Classification",
    accent: C.orange,
    desc: "Set the object's classification mark.",
    params: [
      {
        name: "mark",
        kind: "select",
        required: false,
        options: ["", "INTERNAL", "FINANCIAL", "PII", "LEGAL", "RESTRICTED"],
        placeholder: "classification",
      },
    ],
  },
  {
    id: "add_link",
    label: "Add Link",
    accent: C.neon,
    desc: "Create a typed link from this object to another.",
    params: [
      { name: "to", kind: "object-ref", required: true, placeholder: "target object id" },
      { name: "relation", kind: "text", required: false, placeholder: "relation (default RELATED)" },
      { name: "strength", kind: "number", required: false, placeholder: "strength (0–1, default 1)" },
    ],
  },
  {
    id: "flag",
    label: "Flag",
    accent: C.red,
    desc: "Set props['flag:<name>'] = value (governance flag).",
    params: [
      { name: "flag", kind: "text", required: false, placeholder: "flag name (default flagged)" },
      { name: "value", kind: "bool", required: false },
    ],
  },
];
const specFor = (id) => ACTION_SPECS.find((a) => a.id === id) || ACTION_SPECS[0];

// ── Small normalizers (mirror ObjectView's forgiving accessors) ──────────────────
const labelOf = (o) =>
  (o && (o.label || o.name || o.title || o.display_name || o.id)) || "(unnamed)";
const propsOf = (o) => (o && (o.props || o.properties)) || {};
const markOf = (o) => {
  const p = propsOf(o);
  return o?.mark || o?.classification || p.mark || p.classification || null;
};
const markColor = (m) => (m && C.mark[String(m).toUpperCase()]) || C.text;

const fmtTs = (v) => {
  if (!v) return null;
  const n = typeof v === "number" ? v : Number(v);
  const d = new Date(Number.isFinite(n) && n > 1e11 ? n : v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
};

// Coerce a raw form string into the value the backend expects: numbers parse to
// numbers, true/false to booleans, blank to undefined; everything else is text.
const coerceValue = (raw) => {
  if (raw === undefined || raw === null) return undefined;
  const s = String(raw).trim();
  if (s === "") return undefined;
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return raw;
};

// Build the POST payload from the form fields for a given action spec, applying
// per-action coercion (value/strength numeric-aware, flag value boolean).
const buildPayload = (spec, fields) => {
  const out = {};
  for (const p of spec.params) {
    const raw = fields[p.name];
    if (p.kind === "bool") {
      out[p.name] = !!raw;
      continue;
    }
    if (raw === undefined || raw === null || String(raw).trim() === "") continue;
    if (p.name === "value") out[p.name] = coerceValue(raw);
    else if (p.kind === "number") out[p.name] = Number(raw);
    else out[p.name] = raw;
  }
  return out;
};

// Validate the form against the spec's required fields. Returns an error string or
// null. Mirrors the backend's own rejections (missing key / missing to) so the UI
// fails fast before the POST.
const validate = (spec, fields) => {
  for (const p of spec.params) {
    if (!p.required) continue;
    const v = fields[p.name];
    if (v === undefined || v === null || String(v).trim() === "") {
      return `"${p.name}" is required`;
    }
  }
  if (spec.id === "add_link" && fields.strength !== undefined && String(fields.strength).trim() !== "") {
    const n = Number(fields.strength);
    if (!Number.isFinite(n)) return "strength must be a number";
  }
  return null;
};

// Diff two prop maps → [{key, before, after, change}] where change is
// added | removed | changed. Used for the before→after writeback view.
const diffProps = (before, after) => {
  const a = before || {};
  const b = after || {};
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const rows = [];
  for (const k of keys) {
    const bv = a[k];
    const av = b[k];
    if (JSON.stringify(bv) === JSON.stringify(av)) continue;
    let change = "changed";
    if (!(k in a)) change = "added";
    else if (!(k in b)) change = "removed";
    rows.push({ key: k, before: bv, after: av, change });
  }
  return rows;
};

const show = (v) =>
  v === undefined ? "—" : typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);

export default function ActionRunner() {
  const [tab, setTab] = useState("single");

  // ── Shared object pool (object picker + bulk target preview) ──────────────────
  const [objects, setObjects] = useState([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [query, setQuery] = useState("");
  const list = useAsync();

  const loadObjects = useCallback(async () => {
    const body = await list.run(() =>
      apiGet(`/v1/ontology/objects${qs({ type: typeFilter || undefined, limit: 500 })}`),
    );
    setObjects(asList(body, "objects"));
  }, [list, typeFilter]);

  useEffect(() => {
    loadObjects();
  }, [loadObjects]);

  const types = useMemo(() => {
    const counts = new Map();
    for (const o of objects) {
      const t = o?.type || "untyped";
      counts.set(t, (counts.get(t) || 0) + 1);
    }
    return [...counts.entries()].sort((x, y) => y[1] - x[1]);
  }, [objects]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return objects;
    return objects.filter(
      (o) =>
        labelOf(o).toLowerCase().includes(q) ||
        String(o.id || "").toLowerCase().includes(q) ||
        String(o.type || "").toLowerCase().includes(q),
    );
  }, [objects, query]);

  // ── Session audit log (every action applied this session) ─────────────────────
  const [log, setLog] = useState([]);
  const pushLog = useCallback((entry) => {
    setLog((l) => [{ at: Date.now(), ...entry }, ...l].slice(0, 200));
  }, []);

  return (
    <PageShell
      title="ACTION RUNNER"
      subtitle="ONTOLOGY — GOVERNED WRITE-BACK ACTIONS · DYNAMIC PARAMETER FORMS · BEFORE→AFTER · BULK · AUDIT"
      accent={ACCENT}
      actions={<Btn accent={ACCENT} onClick={loadObjects}>↻ REFRESH</Btn>}
    >
      <Grid min={150} style={{ marginBottom: 14 }}>
        <StatTile label="Objects" value={objects.length} accent={C.blue} />
        <StatTile label="Types" value={types.length} accent={C.gold} />
        <StatTile label="Action Types" value={ACTION_SPECS.length} accent={ACCENT} />
        <StatTile label="Applied (session)" value={log.length} accent={C.neon} />
      </Grid>

      <Tabs
        accent={ACCENT}
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "single", label: "SINGLE OBJECT" },
          { id: "bulk", label: "BULK ACTIONS" },
          { id: "audit", label: `SESSION AUDIT (${log.length})` },
        ]}
      />

      {tab === "single" && (
        <SingleTab
          objects={filtered}
          allObjects={objects}
          listLoading={list.loading}
          listError={list.error}
          types={types}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          query={query}
          setQuery={setQuery}
          pushLog={pushLog}
        />
      )}

      {tab === "bulk" && (
        <BulkTab
          types={types}
          objects={objects}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          pushLog={pushLog}
        />
      )}

      {tab === "audit" && <AuditTab log={log} clear={() => setLog([])} />}
    </PageShell>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// SINGLE-OBJECT TAB — picker · current props · action palette · dynamic form ·
// before→after diff · per-object history.
// ════════════════════════════════════════════════════════════════════════════════
function SingleTab({
  objects,
  allObjects,
  listLoading,
  listError,
  types,
  typeFilter,
  setTypeFilter,
  query,
  setQuery,
  pushLog,
}) {
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const detailA = useAsync();

  const [actionId, setActionId] = useState(ACTION_SPECS[0].id);
  const [fields, setFields] = useState({});
  const apply = useAsync();

  const [audit, setAudit] = useState([]);
  const [result, setResult] = useState(null); // {before, after, audit_id, action, payload}

  const spec = specFor(actionId);

  const loadDetail = useCallback(
    async (id) => {
      const d = await detailA.run(() => apiGet(`/v1/ontology/objects/${id}`));
      const obj = (d && (d.object || d)) || null;
      setDetail(obj);
      return obj;
    },
    [detailA],
  );

  const loadAudit = useCallback(async (id) => {
    try {
      const body = await apiGet(`/v1/ontology/objects/${id}/actions`);
      setAudit(asList(body, "items", "actions", "audit"));
    } catch {
      setAudit([]);
    }
  }, []);

  const openObject = useCallback(
    async (id) => {
      if (!id) return;
      setSelectedId(id);
      setDetail(null);
      setResult(null);
      setFields({});
      apply.setError(null);
      await loadDetail(id);
      loadAudit(id);
    },
    [apply, loadDetail, loadAudit],
  );

  const onApply = async () => {
    if (!selectedId) return;
    const err = validate(spec, fields);
    if (err) {
      apply.setError(new Error(err));
      return;
    }
    const payload = buildPayload(spec, fields);
    const before = propsOf(detail);
    const beforeLabel = labelOf(detail);
    const beforeMark = markOf(detail);

    const res = await apply.run(() =>
      apiPost(`/v1/ontology/objects/${selectedId}/actions`, { action: spec.id, payload }),
    );
    if (!res) return; // useAsync captured the error

    // Prefer the object the POST returns; fall back to a re-fetch.
    let after = (res && res.object) || null;
    if (!after) after = await loadDetail(selectedId);
    else setDetail(after);

    setResult({
      action: spec.id,
      payload,
      audit_id: res.audit_id || null,
      ok: res.ok !== false,
      before,
      after: propsOf(after),
      beforeLabel,
      afterLabel: labelOf(after),
      beforeMark,
      afterMark: markOf(after),
    });
    pushLog({
      scope: "single",
      object_id: selectedId,
      object_label: labelOf(after),
      action: spec.id,
      payload,
      audit_id: res.audit_id || null,
      ok: res.ok !== false,
    });
    setFields({});
    loadAudit(selectedId);
  };

  const before = propsOf(detail);
  const curProps = Object.entries(before);
  const mark = markOf(detail);
  const diff = result ? diffProps(result.before, result.after) : [];
  const labelChanged = result && result.beforeLabel !== result.afterLabel;
  const markChanged = result && result.beforeMark !== result.afterMark;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0,0.9fr) minmax(0,1.3fr) minmax(0,1.1fr)",
        gap: 14,
        alignItems: "start",
      }}
    >
      {/* LEFT — object picker */}
      <PanelCard
        title="OBJECT PICKER"
        accent={C.blue}
        right={<span style={{ fontSize: 8, color: C.text }}>{objects.length}/{allObjects.length}</span>}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search label / id / type…"
          style={{ ...inputStyle, marginBottom: 10 }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
          <Chip label="all" count={allObjects.length} active={!typeFilter} accent={C.blue}
            onClick={() => setTypeFilter("")} />
          {types.map(([t, n]) => (
            <Chip key={t} label={t} count={n} active={typeFilter === t}
              accent={C.type[t] || C.gold}
              onClick={() => setTypeFilter((cur) => (cur === t ? "" : t))} />
          ))}
        </div>
        <DataState loading={listLoading} error={listError} empty={objects.length === 0}
          emptyLabel={query || typeFilter ? "No objects match" : "No objects"}>
          <div style={{ maxHeight: 520, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {objects.map((o) => {
              const active = o.id === selectedId;
              const m = markOf(o);
              return (
                <button key={o.id} onClick={() => openObject(o.id)}
                  style={{
                    textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                    border: `1px solid ${active ? C.blue + "88" : C.border}`,
                    background: active ? C.blue + "1a" : "rgba(0,0,0,0.25)",
                    borderRadius: 5, padding: "6px 9px", color: C.textB,
                  }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: active ? C.blue : C.textB,
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

      {/* CENTER — current object + action palette + dynamic form */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <PanelCard
          title="CURRENT OBJECT"
          accent={C.blue}
          right={detail && <Badge color={markColor(mark)}>{mark || "UNCLASSIFIED"}</Badge>}
        >
          {!selectedId ? (
            <div style={{ padding: 18, fontSize: 10, color: C.text, letterSpacing: 1 }}>
              ← Pick an object to act on.
            </div>
          ) : (
            <DataState loading={detailA.loading} error={detailA.error} empty={!detail}>
              {detail && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: C.blue }}>{labelOf(detail)}</span>
                      {detail.type && <Badge color={C.type[detail.type] || C.gold}>{detail.type}</Badge>}
                    </div>
                    <div style={{ fontSize: 8, color: C.text, marginTop: 3 }}>{detail.id}</div>
                  </div>
                  <div>
                    <Section>PROPERTIES ({curProps.length})</Section>
                    {curProps.length ? (
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <tbody>
                          {curProps.map(([k, v]) => (
                            <tr key={k} style={{ borderBottom: `1px solid ${C.border}` }}>
                              <td style={{ padding: "5px 8px 5px 0", fontSize: 8, color: C.text,
                                textTransform: "uppercase", letterSpacing: 0.5, verticalAlign: "top",
                                whiteSpace: "nowrap", width: 1 }}>{k}</td>
                              <td style={{ padding: "5px 0", fontSize: 10, color: C.textB, wordBreak: "break-word" }}>
                                {show(v)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : <div style={{ fontSize: 9, color: C.text }}>no properties</div>}
                  </div>
                </div>
              )}
            </DataState>
          )}
        </PanelCard>

        {/* ACTION PALETTE + dynamic parameter form */}
        <PanelCard title="ACTION PALETTE" accent={ACCENT}>
          {!selectedId ? (
            <div style={{ fontSize: 9, color: C.text }}>Select an object to enable actions.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {ACTION_SPECS.map((a) => {
                  const on = a.id === actionId;
                  return (
                    <button key={a.id}
                      onClick={() => { setActionId(a.id); setFields({}); apply.setError(null); setResult(null); }}
                      style={{
                        cursor: "pointer", fontFamily: "inherit", fontSize: 9, fontWeight: 700,
                        letterSpacing: 0.5, padding: "5px 10px", borderRadius: 4,
                        border: `1px solid ${on ? a.accent + "aa" : C.border}`,
                        background: on ? a.accent + "22" : "rgba(0,0,0,0.25)",
                        color: on ? a.accent : C.textB,
                      }}>
                      {a.label}
                    </button>
                  );
                })}
              </div>

              <div style={{ fontSize: 8, color: C.text, letterSpacing: 0.5 }}>{spec.desc}</div>

              {/* DYNAMIC PARAMETER FORM — generated from spec.params */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {spec.params.map((p) => (
                  <ParamField
                    key={p.name}
                    param={p}
                    value={fields[p.name]}
                    onChange={(v) => setFields((s) => ({ ...s, [p.name]: v }))}
                    objects={allObjects}
                    currentProps={before}
                    selfId={selectedId}
                  />
                ))}
              </div>

              {/* live payload preview — exactly what POSTs */}
              <div>
                <Section>POST BODY</Section>
                <JsonView data={{ action: spec.id, payload: buildPayload(spec, fields) }} max={140} />
              </div>

              <Btn accent={spec.accent} onClick={onApply} disabled={apply.loading}
                style={{ alignSelf: "flex-start" }}>
                {apply.loading ? "…" : "▶ APPLY ACTION"}
              </Btn>
              {apply.error && (
                <div style={{ fontSize: 9, color: C.red }}>⚠ {String(apply.error.message || apply.error)}</div>
              )}
            </div>
          )}
        </PanelCard>
      </div>

      {/* RIGHT — writeback result (before→after) + object history */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <PanelCard
          title="WRITE-BACK RESULT"
          accent={C.neon}
          right={result && <Badge color={result.ok ? C.neon : C.red}>{result.ok ? "OK" : "REJECTED"}</Badge>}
        >
          {!result ? (
            <div style={{ fontSize: 9, color: C.text }}>
              Apply an action to see the before→after diff and audit id.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <Badge color={specFor(result.action).accent}>{result.action}</Badge>
                {result.audit_id && (
                  <span style={{ fontSize: 8, color: C.text }}>audit · {result.audit_id}</span>
                )}
              </div>

              {(labelChanged || markChanged) && (
                <div>
                  <Section>OBJECT FIELDS</Section>
                  {labelChanged && (
                    <DiffRow k="label" before={result.beforeLabel} after={result.afterLabel} change="changed" />
                  )}
                  {markChanged && (
                    <DiffRow k="mark" before={result.beforeMark} after={result.afterMark} change="changed" />
                  )}
                </div>
              )}

              <div>
                <Section>PROPERTY DIFF ({diff.length})</Section>
                {diff.length ? (
                  diff.map((d) => (
                    <DiffRow key={d.key} k={d.key} before={d.before} after={d.after} change={d.change} />
                  ))
                ) : (
                  <div style={{ fontSize: 9, color: C.text }}>
                    {labelChanged || markChanged ? "no property changes" : "no observable change"}
                  </div>
                )}
              </div>
            </div>
          )}
        </PanelCard>

        <PanelCard
          title="OBJECT HISTORY"
          accent={C.gold}
          right={<span style={{ fontSize: 8, color: C.text }}>{audit.length}</span>}
        >
          {!selectedId ? (
            <div style={{ fontSize: 9, color: C.text }}>—</div>
          ) : audit.length ? (
            <div style={{ display: "flex", flexDirection: "column", maxHeight: 360, overflowY: "auto" }}>
              {audit.map((a, i) => (
                <AuditRow key={a.id || i} a={a} last={i === audit.length - 1} />
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 9, color: C.text }}>no actions recorded</div>
          )}
        </PanelCard>
      </div>
    </div>
  );
}

// One field of the dynamic parameter form, widget chosen by param.kind.
function ParamField({ param, value, onChange, objects, currentProps, selfId }) {
  const label = (
    <div style={{ fontSize: 8, color: param.required ? C.gold : C.text, letterSpacing: 0.5, marginBottom: 3 }}>
      {param.name.toUpperCase()}
      {param.required && <span style={{ color: C.red }}> *</span>}
      <span style={{ color: C.text, marginLeft: 6, textTransform: "none" }}>· {param.kind}</span>
    </div>
  );

  let input;
  if (param.kind === "bool") {
    input = (
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: C.textB, cursor: "pointer" }}>
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        {value ? "true" : "false"}
      </label>
    );
  } else if (param.kind === "number") {
    input = (
      <input type="number" value={value ?? ""} placeholder={param.placeholder}
        onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    );
  } else if (param.kind === "select") {
    input = (
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        {param.options.map((o) => (
          <option key={o} value={o}>{o === "" ? `— ${param.placeholder} —` : o}</option>
        ))}
      </select>
    );
  } else if (param.kind === "select-prop") {
    const keys = Object.keys(currentProps || {});
    input = keys.length ? (
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        <option value="">— {param.placeholder} —</option>
        {keys.map((k) => <option key={k} value={k}>{k}</option>)}
      </select>
    ) : (
      <div style={{ fontSize: 9, color: C.text }}>object has no properties to remove</div>
    );
  } else if (param.kind === "object-ref") {
    input = (
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        <option value="">— {param.placeholder} —</option>
        {objects.filter((o) => o.id !== selfId).map((o) => (
          <option key={o.id} value={o.id}>{labelOf(o)} · {o.id}</option>
        ))}
      </select>
    );
  } else {
    input = (
      <input value={value ?? ""} placeholder={param.placeholder}
        onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    );
  }
  return <div>{label}{input}</div>;
}

// A before→after diff row.
function DiffRow({ k, before, after, change }) {
  const col = change === "added" ? C.neon : change === "removed" ? C.red : C.gold;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "5px 0",
      borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 8, color: C.text, textTransform: "uppercase", letterSpacing: 0.5 }}>{k}</span>
        <Badge color={col}>{change}</Badge>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
        <span style={{ color: C.text, textDecoration: change === "added" ? "none" : "line-through",
          wordBreak: "break-word", flex: 1 }}>
          {change === "added" ? "—" : show(before)}
        </span>
        <span style={{ color: C.text }}>→</span>
        <span style={{ color: col, wordBreak: "break-word", flex: 1 }}>
          {change === "removed" ? "—" : show(after)}
        </span>
      </div>
    </div>
  );
}

// A single audit-trail entry from GET .../actions.
function AuditRow({ a, last }) {
  const act = a.action || a.type || "action";
  const when = fmtTs(a.ts || a.at || a.timestamp);
  const actor = a.actor || a.user;
  const payload = a.payload || a.args;
  return (
    <div style={{ display: "flex", gap: 8, paddingBottom: 10 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.gold,
          boxShadow: `0 0 5px ${C.gold}`, marginTop: 3 }} />
        {!last && <span style={{ flex: 1, width: 1, background: C.border, marginTop: 2 }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.gold }}>{act}</span>
        <div style={{ fontSize: 8, color: C.text, marginTop: 2 }}>
          {when || "—"}{actor ? ` · ${actor}` : ""}
        </div>
        {payload && typeof payload === "object" && Object.keys(payload).length > 0 && (
          <div style={{ marginTop: 4 }}><JsonView data={payload} max={110} /></div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// BULK TAB — choose an action + a query/type filter, preview the target set, apply
// across all of them via /v1/ontology-ext/bulk-action, show succeeded/failed.
// ════════════════════════════════════════════════════════════════════════════════
function BulkTab({ types, objects, typeFilter, setTypeFilter, pushLog }) {
  const [bType, setBType] = useState(typeFilter || "");
  const [limit, setLimit] = useState("");
  const [actionId, setActionId] = useState(ACTION_SPECS[0].id);
  const [fields, setFields] = useState({});
  const apply = useAsync();
  const [summary, setSummary] = useState(null); // {count, capped, succeeded, failed, results, action}

  const spec = specFor(actionId);

  // The query body that bulk-action receives (mirrors BulkActionIn.query →
  // {type?, where?, limit?}). We keep it simple: type + limit.
  const query = useMemo(() => {
    const q = {};
    if (bType) q.type = bType;
    if (String(limit).trim() !== "" && Number(limit) > 0) q.limit = Number(limit);
    return q;
  }, [bType, limit]);

  // Preview: which loaded objects this query would target (client-side mirror).
  const targets = useMemo(() => {
    let t = objects;
    if (bType) t = t.filter((o) => (o.type || "untyped") === bType);
    if (query.limit) t = t.slice(0, query.limit);
    return t;
  }, [objects, bType, query.limit]);

  const onApply = async () => {
    const err = validate(spec, fields);
    if (err) {
      apply.setError(new Error(err));
      return;
    }
    const payload = buildPayload(spec, fields);
    const res = await apply.run(() =>
      apiPost("/v1/ontology-ext/bulk-action", { query, action: spec.id, payload }),
    );
    if (!res) return;
    const results = asList(res, "results");
    const succeeded = results.filter((r) => r.ok).length;
    const failed = results.length - succeeded;
    setSummary({
      action: spec.id,
      count: res.count ?? results.length,
      capped: !!res.capped,
      succeeded,
      failed,
      results,
    });
    pushLog({
      scope: "bulk",
      action: spec.id,
      payload,
      query,
      count: res.count ?? results.length,
      succeeded,
      failed,
      capped: !!res.capped,
      ok: res.ok !== false,
    });
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.1fr)", gap: 14, alignItems: "start" }}>
      {/* LEFT — target set + action + form */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <PanelCard title="TARGET SET" accent={C.blue}
          right={<Badge color={C.blue}>{targets.length} match</Badge>}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
            <select value={bType}
              onChange={(e) => { setBType(e.target.value); setTypeFilter(e.target.value); }}
              style={{ ...inputStyle, width: 180 }}>
              <option value="">all types</option>
              {types.map(([t, n]) => <option key={t} value={t}>{t} ({n})</option>)}
            </select>
            <label style={{ fontSize: 8, color: C.text }}>LIMIT</label>
            <input type="number" min={1} value={limit} onChange={(e) => setLimit(e.target.value)}
              placeholder="all" style={{ ...inputStyle, width: 80 }} />
          </div>
          <div style={{ fontSize: 8, color: C.text, marginBottom: 8 }}>
            Query sent to bulk-action: <code style={{ color: C.textB }}>{JSON.stringify(query)}</code>
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexWrap: "wrap", gap: 5 }}>
            {targets.length ? (
              targets.slice(0, 200).map((o) => (
                <span key={o.id} style={{ fontSize: 8, color: C.textB, padding: "3px 7px",
                  background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`, borderRadius: 3 }}>
                  {labelOf(o)}
                </span>
              ))
            ) : <div style={{ fontSize: 9, color: C.text }}>no objects match this filter</div>}
          </div>
        </PanelCard>

        <PanelCard title="BULK ACTION" accent={ACCENT}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {ACTION_SPECS.map((a) => {
              const on = a.id === actionId;
              return (
                <button key={a.id}
                  onClick={() => { setActionId(a.id); setFields({}); apply.setError(null); }}
                  style={{
                    cursor: "pointer", fontFamily: "inherit", fontSize: 9, fontWeight: 700,
                    letterSpacing: 0.5, padding: "5px 10px", borderRadius: 4,
                    border: `1px solid ${on ? a.accent + "aa" : C.border}`,
                    background: on ? a.accent + "22" : "rgba(0,0,0,0.25)",
                    color: on ? a.accent : C.textB,
                  }}>
                  {a.label}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 8, color: C.text, letterSpacing: 0.5, marginBottom: 10 }}>{spec.desc}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {spec.params.map((p) => (
              <ParamField
                key={p.name}
                param={p.kind === "select-prop" ? { ...p, kind: "text" } : p}
                value={fields[p.name]}
                onChange={(v) => setFields((s) => ({ ...s, [p.name]: v }))}
                objects={objects}
                currentProps={{}}
                selfId={null}
              />
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <Section>POST BODY</Section>
            <JsonView data={{ query, action: spec.id, payload: buildPayload(spec, fields) }} max={140} />
          </div>
          <Btn accent={spec.accent} onClick={onApply} disabled={apply.loading || targets.length === 0}
            style={{ alignSelf: "flex-start", marginTop: 10 }}>
            {apply.loading ? "…" : `▶ APPLY TO ${targets.length}`}
          </Btn>
          {apply.error && (
            <div style={{ fontSize: 9, color: C.red, marginTop: 8 }}>
              ⚠ {String(apply.error.message || apply.error)}
            </div>
          )}
        </PanelCard>
      </div>

      {/* RIGHT — results summary */}
      <PanelCard title="BULK RESULT" accent={C.neon}
        right={summary && <Badge color={summary.failed ? C.gold : C.neon}>
          {summary.succeeded}/{summary.count} OK
        </Badge>}>
        {!summary ? (
          <div style={{ fontSize: 9, color: C.text }}>
            Choose a target set + action, then apply to see a per-object result summary.
          </div>
        ) : (
          <DataState loading={apply.loading} error={apply.error} empty={summary.count === 0}
            emptyLabel="No objects were targeted">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Grid min={110}>
                <StatTile label="Targeted" value={summary.count} accent={C.blue} />
                <StatTile label="Succeeded" value={summary.succeeded} accent={C.neon} />
                <StatTile label="Failed" value={summary.failed} accent={summary.failed ? C.red : C.text} />
              </Grid>
              {summary.capped && (
                <div style={{ fontSize: 9, color: C.gold }}>
                  ⚠ result was capped server-side (BULK_CAP) — narrow the set to cover all objects.
                </div>
              )}
              <div>
                <Section>PER-OBJECT RESULTS ({summary.results.length})</Section>
                <div style={{ maxHeight: 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
                  {summary.results.map((r, i) => (
                    <div key={r.id || i} style={{ display: "flex", alignItems: "center", gap: 8,
                      padding: "4px 8px", borderRadius: 4,
                      background: r.ok ? "rgba(0,200,120,0.06)" : "rgba(232,32,60,0.08)",
                      border: `1px solid ${r.ok ? C.neon + "33" : C.red + "44"}` }}>
                      <span style={{ fontSize: 8, color: r.ok ? C.neon : C.red, fontWeight: 700, width: 28 }}>
                        {r.ok ? "OK" : "FAIL"}
                      </span>
                      <span style={{ fontSize: 9, color: C.textB, flex: 1, overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.id}</span>
                      {r.error && <span style={{ fontSize: 8, color: C.red }}>{r.error}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </DataState>
        )}
      </PanelCard>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// SESSION AUDIT TAB — every action applied this session (single + bulk).
// ════════════════════════════════════════════════════════════════════════════════
function AuditTab({ log, clear }) {
  return (
    <PanelCard
      title="SESSION AUDIT LOG"
      accent={C.gold}
      right={log.length ? <Btn accent={C.red} onClick={clear} style={{ padding: "3px 10px", fontSize: 9 }}>CLEAR</Btn> : null}
    >
      {log.length === 0 ? (
        <div style={{ fontSize: 10, color: C.text, padding: 14, letterSpacing: 1 }}>
          No actions applied yet this session. Apply a single or bulk action to populate this log.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 560, overflowY: "auto" }}>
          {log.map((e, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 10px",
              borderRadius: 5, border: `1px solid ${C.border}`, background: "rgba(0,0,0,0.25)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Badge color={e.scope === "bulk" ? C.gold : C.blue}>{e.scope}</Badge>
                <Badge color={specFor(e.action).accent}>{e.action}</Badge>
                <Badge color={e.ok ? C.neon : C.red}>{e.ok ? "OK" : "REJECTED"}</Badge>
                <span style={{ fontSize: 8, color: C.text, marginLeft: "auto" }}>{fmtTs(e.at)}</span>
              </div>
              <div style={{ fontSize: 9, color: C.textB }}>
                {e.scope === "bulk" ? (
                  <span>
                    target <code style={{ color: C.text }}>{JSON.stringify(e.query)}</code> · {e.succeeded}/{e.count} ok
                    {e.failed ? `, ${e.failed} failed` : ""}{e.capped ? " · capped" : ""}
                  </span>
                ) : (
                  <span>
                    {e.object_label} <span style={{ color: C.text }}>({e.object_id})</span>
                    {e.audit_id ? <span style={{ color: C.text }}> · audit {e.audit_id}</span> : null}
                  </span>
                )}
              </div>
              {e.payload && Object.keys(e.payload).length > 0 && <JsonView data={e.payload} max={110} />}
            </div>
          ))}
        </div>
      )}
    </PanelCard>
  );
}

// ── Small shared bits ────────────────────────────────────────────────────────────
function Chip({ label, count, active, accent = C.gold, onClick }) {
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

function Section({ children }) {
  return (
    <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, marginBottom: 6, textTransform: "uppercase" }}>
      {children}
    </div>
  );
}
