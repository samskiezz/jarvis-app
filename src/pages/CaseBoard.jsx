/**
 * CaseBoard — a Gotham-style CASE / INVESTIGATION BOARD for APEX.
 *
 * Two tabs over the Wave-1 ops + saved-investigations backends:
 *
 *   CASES          — a KANBAN board of investigation cases grouped by status
 *                    (columns derived from the live data, with sane defaults).
 *                    Each case is a card (title, status, # linked entities,
 *                    note count, created). Create-case button. Clicking a card
 *                    opens a detail drawer: status selector (POST .../status),
 *                    linked entities (POST .../entities), and notes
 *                    (POST .../notes).
 *
 *   INVESTIGATIONS — saved graph investigations (seeds + annotations + shares).
 *                    List shows seed + annotation counts; opening one reveals its
 *                    annotations (add one via POST .../annotations) and shares.
 *
 * Endpoints (all real, verified against server/routes/ops.py +
 * server/routes/investigations.py):
 *   GET  /v1/cases                          → { items, count }
 *   POST /v1/cases                          { title, status, entity_ids } → { id, case }
 *   GET  /v1/cases/{id}                     → case
 *   POST /v1/cases/{id}/notes               { text, by }    → case
 *   POST /v1/cases/{id}/entities            { entity_id }   → case
 *   POST /v1/cases/{id}/status              { status }      → case
 *   GET  /v1/investigations                 → { items, count }
 *   POST /v1/investigations                 { name, seeds, notes } → investigation
 *   GET  /v1/investigations/{id}            → { ..., annotations, shares, subgraph }
 *   POST /v1/investigations/{id}/annotations { target, text } → annotation
 *
 * Each tab loads independently and degrades gracefully via DataState / useAsync.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { apiGet, apiPost, qs, asList, useAsync } from "@/lib/wave1";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { Btn, inputStyle, Tabs, JsonView } from "@/components/Wave1Kit";
import { COLORS as C } from "@/domain/colors";

const ACCENT = C.gold;

const TABS = [
  { id: "cases", label: "CASE BOARD" },
  { id: "investigations", label: "INVESTIGATIONS" },
];

// Default kanban columns when the store is empty / sparse. Live statuses are
// merged in so any status the backend invents still gets a column.
const DEFAULT_STATUSES = ["open", "in_progress", "resolved", "closed"];

const STATUS_COLOR = (s) =>
  ({
    open: C.blue,
    in_progress: C.gold,
    investigating: C.gold,
    resolved: C.neon,
    closed: C.text,
  }[String(s || "").toLowerCase()] || C.purple);

const prettyStatus = (s) => String(s || "—").replace(/_/g, " ").toUpperCase();

const fmtTs = (ts) => {
  const n = Number(ts);
  if (!n) return "";
  try {
    return new Date(n).toLocaleString();
  } catch {
    return String(ts);
  }
};

/* ─────────────────────────── CASE BOARD ─────────────────────────── */
function CaseBoardTab() {
  const [cases, setCases] = useState([]);
  const { loading, error, run } = useAsync();
  const createAsync = useAsync();
  const detailAsync = useAsync();

  const [newTitle, setNewTitle] = useState("");
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);

  const [note, setNote] = useState("");
  const [entity, setEntity] = useState("");
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
    const res = await createAsync.run(() =>
      apiPost("/v1/cases", { title: newTitle.trim(), status: "open", entity_ids: [] })
    );
    setNewTitle("");
    await load();
    if (res && res.id != null) openCase(res.id);
  };

  // Move a case to a new status, then refresh the board + drawer.
  const setStatus = async (id, status) => {
    await statusAsync.run(() => apiPost(`/v1/cases/${id}/status`, { status }));
    await load();
    if (id === openId) openCase(id);
  };

  const addNote = async () => {
    if (!note.trim() || openId == null) return;
    await noteAsync.run(() => apiPost(`/v1/cases/${openId}/notes`, { text: note.trim() }));
    setNote("");
    openCase(openId);
  };

  const addEntity = async () => {
    if (!entity.trim() || openId == null) return;
    await entityAsync.run(() =>
      apiPost(`/v1/cases/${openId}/entities`, { entity_id: entity.trim() })
    );
    setEntity("");
    openCase(openId);
    load();
  };

  // Columns = default statuses ∪ any status seen in the data (preserves order).
  const columns = useMemo(() => {
    const seen = [];
    for (const s of DEFAULT_STATUSES) seen.push(s);
    for (const c of cases) {
      const s = String(c.status || "open").toLowerCase();
      if (!seen.includes(s)) seen.push(s);
    }
    return seen;
  }, [cases]);

  const byStatus = useMemo(() => {
    const m = {};
    for (const s of columns) m[s] = [];
    for (const c of cases) {
      const s = String(c.status || "open").toLowerCase();
      (m[s] = m[s] || []).push(c);
    }
    return m;
  }, [cases, columns]);

  const notes = detail ? asList(detail, "notes") : [];
  const entities = detail ? asList(detail, "entity_ids", "entities") : [];

  const stats = {
    total: cases.length,
    open: cases.filter((c) => String(c.status).toLowerCase() === "open").length,
    closed: cases.filter((c) => String(c.status).toLowerCase() === "closed").length,
    cols: columns.length,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Grid min={150} gap={12}>
        <StatTile label="cases" value={stats.total} accent={ACCENT} />
        <StatTile label="open" value={stats.open} accent={C.blue} />
        <StatTile label="closed" value={stats.closed} accent={C.text} />
        <StatTile label="columns" value={stats.cols} accent={C.purple} />
      </Grid>

      <PanelCard
        title="NEW CASE"
        accent={C.neon}
        right={<Btn accent={ACCENT} onClick={load} style={{ padding: "3px 8px", fontSize: 8 }}>↻</Btn>}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createCase()}
            placeholder="case title (e.g. Falcone shipment manifest)"
            style={inputStyle}
          />
          <Btn accent={C.neon} onClick={createCase} disabled={createAsync.loading}>
            {createAsync.loading ? "…" : "+ OPEN CASE"}
          </Btn>
        </div>
        {createAsync.error && (
          <div style={{ fontSize: 9, color: C.red, marginTop: 8 }}>
            ⚠ {String(createAsync.error.message || createAsync.error)}
          </div>
        )}
      </PanelCard>

      <PanelCard title="CASE BOARD" accent={ACCENT}>
        <DataState
          loading={loading}
          error={error}
          empty={cases.length === 0}
          emptyLabel="No cases yet — open one above to start the board."
        >
          <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
            {columns.map((col) => {
              const items = byStatus[col] || [];
              const color = STATUS_COLOR(col);
              return (
                <div
                  key={col}
                  style={{
                    flex: "0 0 240px", minWidth: 240, display: "flex", flexDirection: "column",
                    gap: 8, border: `1px solid ${C.border}`, borderRadius: 7,
                    background: "rgba(0,0,0,0.22)", padding: 9,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: color,
                      boxShadow: `0 0 7px ${color}` }} />
                    <span style={{ fontSize: 9, letterSpacing: 1.4, fontWeight: 700, color, flex: 1 }}>
                      {prettyStatus(col)}
                    </span>
                    <Badge color={color}>{items.length}</Badge>
                  </div>

                  {items.length === 0 && (
                    <div style={{ fontSize: 8, color: C.text, padding: "10px 4px", letterSpacing: 1 }}>
                      empty
                    </div>
                  )}

                  {items.map((c, i) => {
                    const active = c.id === openId;
                    const nEnt = asList(c, "entity_ids", "entities").length;
                    const nNote = asList(c, "notes").length;
                    return (
                      <button
                        key={c.id ?? i}
                        onClick={() => openCase(c.id)}
                        style={{
                          textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                          border: `1px solid ${active ? color + "99" : C.border}`,
                          background: active ? color + "1f" : "rgba(0,0,0,0.34)",
                          borderRadius: 6, padding: "8px 9px", color: C.textB,
                        }}
                      >
                        <div style={{ fontSize: 11, fontWeight: 700, color: active ? color : C.textB }}>
                          {c.title || `case #${c.id}`}
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 5 }}>
                          <Badge color={C.gold}>◇ {nEnt} ent</Badge>
                          <Badge color={C.neon}>✎ {nNote} notes</Badge>
                          <Badge color={C.text}>#{c.id}</Badge>
                        </div>
                        {c.created_ts != null && (
                          <div style={{ fontSize: 8, color: C.text, marginTop: 5 }}>
                            {fmtTs(c.created_ts)}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </DataState>
      </PanelCard>

      {/* Detail drawer */}
      {openId != null && (
        <PanelCard
          title={`CASE DETAIL · #${openId}`}
          accent={C.purple}
          right={
            <Btn accent={C.text} onClick={() => { setOpenId(null); setDetail(null); }}
              style={{ padding: "3px 8px", fontSize: 8 }}>✕ CLOSE</Btn>
          }
        >
          <DataState loading={detailAsync.loading} error={detailAsync.error} empty={!detail}>
            {detail && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.purple }}>
                    {detail.title || `case #${detail.id}`}
                  </div>
                  <div style={{ fontSize: 8, color: C.text, marginTop: 3 }}>
                    #{detail.id}{detail.created_ts ? ` · opened ${fmtTs(detail.created_ts)}` : ""}
                  </div>
                </div>

                {/* Status selector — moves the card across the board */}
                <div>
                  <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, marginBottom: 5 }}>
                    STATUS
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {columns.map((s) => {
                      const on = String(detail.status).toLowerCase() === s;
                      const color = STATUS_COLOR(s);
                      return (
                        <button
                          key={s}
                          onClick={() => setStatus(detail.id, s)}
                          disabled={statusAsync.loading || on}
                          style={{
                            cursor: on ? "default" : "pointer", fontFamily: "inherit",
                            fontSize: 8, letterSpacing: 1, fontWeight: 700, padding: "5px 10px",
                            borderRadius: 4, border: `1px solid ${on ? color + "99" : C.border}`,
                            background: on ? color + "1f" : "rgba(0,0,0,0.3)",
                            color: on ? color : C.text, opacity: statusAsync.loading ? 0.6 : 1,
                          }}
                        >
                          {prettyStatus(s)}
                        </button>
                      );
                    })}
                  </div>
                  {statusAsync.error && (
                    <div style={{ fontSize: 9, color: C.red, marginTop: 6 }}>
                      ⚠ {String(statusAsync.error.message || statusAsync.error)}
                    </div>
                  )}
                </div>

                {/* Linked entities */}
                <div>
                  <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, marginBottom: 5 }}>
                    LINKED ENTITIES ({entities.length})
                  </div>
                  {entities.length ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 7 }}>
                      {entities.map((e, i) => (
                        <Badge key={i} color={C.gold}>{typeof e === "object" ? (e.id || e.name || JSON.stringify(e)) : String(e)}</Badge>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 9, color: C.text, marginBottom: 7 }}>none linked</div>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      value={entity}
                      onChange={(e) => setEntity(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addEntity()}
                      placeholder="entity id to link"
                      style={inputStyle}
                    />
                    <Btn accent={C.gold} onClick={addEntity} disabled={entityAsync.loading}>LINK</Btn>
                  </div>
                  {entityAsync.error && (
                    <div style={{ fontSize: 9, color: C.red, marginTop: 6 }}>
                      ⚠ {String(entityAsync.error.message || entityAsync.error)}
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, marginBottom: 5 }}>
                    NOTES ({notes.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 7,
                    maxHeight: 220, overflowY: "auto" }}>
                    {notes.length === 0 && (
                      <div style={{ fontSize: 9, color: C.text }}>no notes yet</div>
                    )}
                    {notes.map((n, i) => (
                      <div key={i} style={{ border: `1px solid ${C.borderB}`, borderRadius: 4,
                        padding: "6px 9px", background: "rgba(0,0,0,0.25)" }}>
                        <div style={{ fontSize: 10, color: C.textB }}>
                          {typeof n === "string" ? n : (n.text || JSON.stringify(n))}
                        </div>
                        {n && typeof n === "object" && (n.by || n.ts) && (
                          <div style={{ fontSize: 8, color: C.text, marginTop: 3 }}>
                            {n.by || "operator"}{n.ts ? ` · ${fmtTs(n.ts)}` : ""}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addNote()}
                      placeholder="add a note…"
                      style={inputStyle}
                    />
                    <Btn accent={C.neon} onClick={addNote} disabled={noteAsync.loading}>ADD</Btn>
                  </div>
                  {noteAsync.error && (
                    <div style={{ fontSize: 9, color: C.red, marginTop: 6 }}>
                      ⚠ {String(noteAsync.error.message || noteAsync.error)}
                    </div>
                  )}
                </div>
              </div>
            )}
          </DataState>
        </PanelCard>
      )}
    </div>
  );
}

/* ─────────────────────────── INVESTIGATIONS ─────────────────────────── */
function InvestigationsTab() {
  const [invs, setInvs] = useState([]);
  const { loading, error, run } = useAsync();
  const createAsync = useAsync();
  const detailAsync = useAsync();
  const annAsync = useAsync();

  const [newName, setNewName] = useState("");
  const [newSeeds, setNewSeeds] = useState("");
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [annText, setAnnText] = useState("");
  const [annTarget, setAnnTarget] = useState("case");

  const load = useCallback(async () => {
    const body = await run(() => apiGet(`/v1/investigations${qs({})}`));
    setInvs(body ? asList(body, "investigations") : []);
  }, [run]);
  useEffect(() => { load(); }, [load]);

  const openInv = useCallback(async (id) => {
    setOpenId(id);
    setDetail(null);
    const d = await detailAsync.run(() => apiGet(`/v1/investigations/${id}`));
    if (d) setDetail(d);
  }, [detailAsync]);

  const createInv = async () => {
    if (!newName.trim()) return;
    const res = await createAsync.run(() =>
      apiPost("/v1/investigations", {
        name: newName.trim(),
        seeds: newSeeds.trim(),
        notes: "",
      })
    );
    setNewName("");
    setNewSeeds("");
    await load();
    if (res && res.id) openInv(res.id);
  };

  const addAnnotation = async () => {
    if (!annText.trim() || !openId) return;
    await annAsync.run(() =>
      apiPost(`/v1/investigations/${openId}/annotations`, {
        target: annTarget.trim() || "case",
        text: annText.trim(),
      })
    );
    setAnnText("");
    openInv(openId);
  };

  const annotations = detail ? asList(detail, "annotations") : [];
  const shares = detail ? asList(detail, "shares") : [];
  const seeds = detail ? asList(detail, "seeds") : [];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.3fr)",
      gap: 14, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <PanelCard
          title="SAVED INVESTIGATIONS"
          accent={ACCENT}
          right={<Btn accent={ACCENT} onClick={load} style={{ padding: "3px 8px", fontSize: 8 }}>↻</Btn>}
        >
          <DataState
            loading={loading}
            error={error}
            empty={invs.length === 0}
            emptyLabel="No saved investigations — create one below."
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 5,
              maxHeight: 460, overflowY: "auto" }}>
              {invs.map((inv, i) => {
                const active = inv.id === openId;
                const nSeed = asList(inv, "seeds").length;
                const nAnn = asList(inv, "annotations").length;
                return (
                  <button
                    key={inv.id || i}
                    onClick={() => openInv(inv.id)}
                    style={{
                      textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                      border: `1px solid ${active ? ACCENT + "99" : C.border}`,
                      background: active ? ACCENT + "1f" : "rgba(0,0,0,0.28)",
                      borderRadius: 6, padding: "8px 10px", color: C.textB,
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 700, color: active ? ACCENT : C.textB }}>
                      {inv.name || `investigation ${inv.id}`}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 5 }}>
                      <Badge color={C.blue}>◉ {nSeed} seeds</Badge>
                      <Badge color={C.neon}>✎ {nAnn} notes</Badge>
                      {inv.owner && <Badge color={C.purple}>{inv.owner}</Badge>}
                    </div>
                    {inv.updated_ts != null && (
                      <div style={{ fontSize: 8, color: C.text, marginTop: 5 }}>
                        updated {fmtTs(inv.updated_ts)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </DataState>
        </PanelCard>

        <PanelCard title="NEW INVESTIGATION" accent={C.neon}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="investigation name"
              style={inputStyle}
            />
            <input
              value={newSeeds}
              onChange={(e) => setNewSeeds(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createInv()}
              placeholder="seed entity ids (comma / space separated)"
              style={inputStyle}
            />
            <Btn accent={C.neon} onClick={createInv} disabled={createAsync.loading}
              style={{ alignSelf: "flex-start" }}>
              {createAsync.loading ? "…" : "+ SAVE INVESTIGATION"}
            </Btn>
            {createAsync.error && (
              <div style={{ fontSize: 9, color: C.red }}>
                ⚠ {String(createAsync.error.message || createAsync.error)}
              </div>
            )}
          </div>
        </PanelCard>
      </div>

      <PanelCard title="INVESTIGATION DETAIL" accent={C.purple}>
        {openId == null ? (
          <div style={{ padding: 18, fontSize: 10, color: C.text, letterSpacing: 1 }}>
            ← Select or create an investigation.
          </div>
        ) : (
          <DataState loading={detailAsync.loading} error={detailAsync.error} empty={!detail}>
            {detail && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.purple }}>
                    {detail.name || `investigation ${detail.id}`}
                  </div>
                  <div style={{ fontSize: 8, color: C.text, marginTop: 3 }}>
                    {detail.id}{detail.owner ? ` · ${detail.owner}` : ""}
                    {detail.updated_ts ? ` · updated ${fmtTs(detail.updated_ts)}` : ""}
                  </div>
                </div>

                <Grid min={120} gap={10}>
                  <StatTile label="seeds" value={seeds.length} accent={C.blue} />
                  <StatTile label="annotations" value={annotations.length} accent={C.neon} />
                  <StatTile label="nodes" value={detail.subgraph?.n_nodes ?? 0} accent={C.gold} />
                  <StatTile label="edges" value={detail.subgraph?.n_edges ?? 0} accent={C.purple} />
                </Grid>

                {/* Seeds */}
                <div>
                  <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, marginBottom: 5 }}>
                    SEED ENTITIES ({seeds.length})
                  </div>
                  {seeds.length ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {seeds.map((s, i) => (
                        <Badge key={i} color={C.blue}>{String(s)}</Badge>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 9, color: C.text }}>no seeds pinned</div>
                  )}
                </div>

                {/* Shares */}
                <div>
                  <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, marginBottom: 5 }}>
                    SHARES ({shares.length})
                  </div>
                  {shares.length ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {shares.map((sh, i) => (
                        <Badge key={i} color={C.gold}>
                          {(sh.principal || "?")} · {sh.role || "viewer"}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 9, color: C.text }}>not shared</div>
                  )}
                </div>

                {/* Annotations */}
                <div>
                  <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, marginBottom: 5 }}>
                    ANNOTATIONS ({annotations.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 7,
                    maxHeight: 220, overflowY: "auto" }}>
                    {annotations.length === 0 && (
                      <div style={{ fontSize: 9, color: C.text }}>no annotations yet</div>
                    )}
                    {annotations.map((a, i) => (
                      <div key={a.id || i} style={{ border: `1px solid ${C.borderB}`, borderRadius: 4,
                        padding: "6px 9px", background: "rgba(0,0,0,0.25)" }}>
                        <div style={{ fontSize: 10, color: C.textB }}>{a.text || JSON.stringify(a)}</div>
                        <div style={{ fontSize: 8, color: C.text, marginTop: 3 }}>
                          <span style={{ color: C.gold }}>{a.target || "case"}</span>
                          {a.actor ? ` · ${a.actor}` : ""}{a.ts ? ` · ${fmtTs(a.ts)}` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      value={annTarget}
                      onChange={(e) => setAnnTarget(e.target.value)}
                      placeholder="target (case / node:id / edge:a|b|rel)"
                      style={{ ...inputStyle, maxWidth: 180 }}
                    />
                    <input
                      value={annText}
                      onChange={(e) => setAnnText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addAnnotation()}
                      placeholder="annotation text…"
                      style={inputStyle}
                    />
                    <Btn accent={C.neon} onClick={addAnnotation} disabled={annAsync.loading}>ADD</Btn>
                  </div>
                  {annAsync.error && (
                    <div style={{ fontSize: 9, color: C.red, marginTop: 6 }}>
                      ⚠ {String(annAsync.error.message || annAsync.error)}
                    </div>
                  )}
                </div>

                {/* Raw subgraph for the analyst who wants the wire shape */}
                {detail.subgraph && (detail.subgraph.n_nodes || detail.subgraph.n_edges) ? (
                  <div>
                    <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, marginBottom: 5 }}>
                      RESOLVED SUBGRAPH
                    </div>
                    <JsonView data={detail.subgraph} max={200} />
                  </div>
                ) : null}
              </div>
            )}
          </DataState>
        )}
      </PanelCard>
    </div>
  );
}

/* ─────────────────────────── SHELL ─────────────────────────── */
export default function CaseBoard() {
  const [tab, setTab] = useState("cases");
  return (
    <PageShell
      title="CASE BOARD"
      subtitle="INVESTIGATION CASEWORK — KANBAN · ENTITIES · NOTES · SAVED INVESTIGATIONS"
      accent={ACCENT}
    >
      <Tabs tabs={TABS} active={tab} onChange={setTab} accent={ACCENT} />
      {tab === "cases" && <CaseBoardTab />}
      {tab === "investigations" && <InvestigationsTab />}
    </PageShell>
  );
}
