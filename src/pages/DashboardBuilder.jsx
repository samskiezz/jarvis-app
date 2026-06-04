/**
 * DashboardBuilder — "DASHBOARD BUILDER": compose a board from a palette of
 * widgets (type × source), drop them on a canvas, name it and SAVE, then load
 * any saved board and resolve its widgets to live data.
 *
 * Backend (via kimiClient.request, wrapped by wave1 apiGet/apiPost):
 *   GET  /v1/dashboards               → list saved dashboards
 *   POST /v1/dashboards               → save {name, widgets}
 *   GET  /v1/dashboards/{id}          → one dashboard
 *   POST /v1/dashboards/{id}/resolve  → resolve widgets to live data
 * A widget is {type: stat|chart|list, source: markets|skill|objects|alerts}.
 *
 * DRY via Wave1Kit (Btn, inputStyle) + PageKit (PageShell / PanelCard / StatTile
 * / Grid / Badge / DataState) + wave1 (apiGet/apiPost/asList/useAsync). Inline
 * SVG keeps the mini charts dependency-free. Every fetch degrades gracefully.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { Btn, inputStyle } from "@/components/Wave1Kit";
import { apiGet, apiPost, asList, useAsync } from "@/lib/wave1";

const ACCENT = C.blue;

const WIDGET_TYPES = [
  { id: "stat", label: "Stat" },
  { id: "chart", label: "Chart" },
  { id: "list", label: "List" },
];
const SOURCES = [
  { id: "markets", label: "Markets", color: C.gold },
  { id: "skill", label: "Prediction Skill", color: C.purple },
  { id: "objects", label: "Ontology Objects", color: C.neon },
  { id: "alerts", label: "Alerts", color: C.red },
];
const sourceColor = (s) => (SOURCES.find((x) => x.id === s) || {}).color || ACCENT;

// Pull a representative numeric series + a scalar count out of an arbitrary
// resolved-widget payload. Backends aren't perfectly uniform so we stay
// forgiving: numbers off the body, items off any list-ish key.
function widgetValues(resolved) {
  const body = resolved && typeof resolved === "object" ? resolved : {};
  const data = body.data ?? body.value ?? body;
  const list = asList(data, "items", "rows", "series", "points");
  // Numeric series: either an array of numbers, or numbers pulled off objects.
  let series = [];
  if (Array.isArray(data)) {
    series = data.map((d) => (typeof d === "number" ? d : Number(d?.value ?? d?.y ?? d?.change_pct))).filter(Number.isFinite);
  } else if (list.length) {
    series = list.map((d) => (typeof d === "number" ? d : Number(d?.value ?? d?.y ?? d?.change_pct ?? d?.count))).filter(Number.isFinite);
  }
  // Scalar: explicit count/value/total, else list length, else series length.
  let scalar = [body.count, body.total, body.value, data?.count, data?.total]
    .find((v) => Number.isFinite(Number(v)) && v != null);
  if (scalar == null) scalar = list.length || series.length || (Number.isFinite(Number(data)) ? Number(data) : null);
  return { series, scalar: scalar == null ? null : Number(scalar), list };
}

// Inline SVG bar chart from a numeric series (dependency-free).
function MiniBars({ values, color }) {
  const nums = (values || []).filter(Number.isFinite).slice(0, 24);
  if (!nums.length) return <div style={{ fontSize: 9, color: C.text }}>no series</div>;
  const W = 240, H = 60;
  const max = Math.max(...nums.map(Math.abs), 1e-9);
  const bw = W / nums.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
      <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke={C.border} strokeWidth="1" />
      {nums.map((v, i) => {
        const h = (Math.abs(v) / max) * (H / 2 - 2);
        return <rect key={i} x={i * bw + 1} y={v >= 0 ? H / 2 - h : H / 2} width={Math.max(1, bw - 2)} height={h}
          fill={v >= 0 ? color : C.red} opacity="0.85" />;
      })}
    </svg>
  );
}

// Render one resolved widget per its type.
function WidgetView({ widget, resolved, error }) {
  const color = sourceColor(widget.source);
  if (error) return <div style={{ fontSize: 9, color: C.red }}>⚠ resolve failed: {String(error.message || error)}</div>;
  if (resolved == null) return <div style={{ fontSize: 9, color: C.text }}>◌ not resolved</div>;
  const { series, scalar, list } = widgetValues(resolved);
  if (widget.type === "stat") {
    return (
      <div>
        <div style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1 }}>{scalar == null ? "—" : scalar}</div>
        <div style={{ fontSize: 8, color: C.text, marginTop: 4 }}>{widget.source}</div>
      </div>
    );
  }
  if (widget.type === "chart") return <MiniBars values={series} color={color} />;
  // list
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 150, overflowY: "auto" }}>
      {list.length ? list.slice(0, 12).map((it, i) => (
        <div key={i} style={{ fontSize: 9, color: C.textB, padding: "3px 6px", background: "rgba(0,0,0,0.25)",
          border: `1px solid ${C.border}`, borderRadius: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {it && typeof it === "object"
            ? (it.name || it.label || it.title || it.symbol || it.id || JSON.stringify(it))
            : String(it)}
        </div>
      )) : <div style={{ fontSize: 9, color: C.text }}>empty</div>}
    </div>
  );
}

export default function DashboardBuilder() {
  // Palette selection.
  const [wType, setWType] = useState("stat");
  const [wSource, setWSource] = useState("markets");
  // Canvas: widgets being composed, plus their resolved data keyed by index.
  const [widgets, setWidgets] = useState([]);
  const [resolved, setResolved] = useState({}); // idx -> { data } | { error }
  const [name, setName] = useState("");
  const [saveMsg, setSaveMsg] = useState(null);
  const resolveAsync = useAsync();
  const saveAsync = useAsync();

  // Saved dashboards list.
  const [saved, setSaved] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);
  const [openId, setOpenId] = useState(null);

  const loadSaved = useCallback(async () => {
    setListLoading(true); setListError(null);
    try {
      const body = await apiGet("/v1/dashboards");
      setSaved(asList(body, "dashboards"));
    } catch (e) { setListError(e); setSaved([]); }
    finally { setListLoading(false); }
  }, []);

  useEffect(() => { loadSaved(); }, [loadSaved]);

  const addWidget = () => setWidgets((w) => [...w, { type: wType, source: wSource }]);
  const removeWidget = (idx) => {
    setWidgets((w) => w.filter((_, i) => i !== idx));
    setResolved((r) => { const n = { ...r }; delete n[idx]; return n; });
  };
  const clearCanvas = () => { setWidgets([]); setResolved({}); setOpenId(null); setSaveMsg(null); };

  // Resolve the current canvas widgets to live data. Prefer the bulk resolve
  // endpoint; if it isn't shaped per-widget, resolve each one individually so a
  // single failure degrades to just that tile.
  const resolveCanvas = useCallback(async (list) => {
    const arr = list || widgets;
    if (!arr.length) return;
    const out = {};
    // Resolve each widget independently for graceful per-tile degradation.
    await Promise.all(arr.map(async (w, i) => {
      try {
        const r = await apiPost("/v1/dashboards/resolve", { widget: w });
        out[i] = { data: r };
      } catch (e) {
        out[i] = { error: e };
      }
    }));
    setResolved(out);
  }, [widgets]);

  const refreshCanvas = () => resolveAsync.run(() => resolveCanvas());

  const save = async () => {
    setSaveMsg(null);
    if (!widgets.length) { setSaveMsg({ err: true, text: "Add at least one widget" }); return; }
    const body = { name: name.trim() || "Untitled Board", widgets };
    const res = await saveAsync.run(() => apiPost("/v1/dashboards", body));
    if (res) {
      setSaveMsg({ err: false, text: `Saved ${res.id ? `#${res.id}` : ""} ${body.name}` });
      loadSaved();
    } else {
      setSaveMsg({ err: true, text: "Save failed" });
    }
  };

  // Open a saved dashboard: fetch it, load its widgets onto the canvas, and
  // resolve them via the per-dashboard resolve endpoint.
  const openDashboard = useCallback(async (id) => {
    setOpenId(id); setSaveMsg(null);
    const d = await resolveAsync.run(async () => {
      const dash = await apiGet(`/v1/dashboards/${id}`);
      const dashBody = dash && (dash.dashboard || dash);
      const ws = asList(dashBody, "widgets");
      setWidgets(ws);
      setName(dashBody?.name || "");
      // Resolve the whole board in one call; fall back to per-widget on failure.
      let out = {};
      try {
        const r = await apiPost(`/v1/dashboards/${id}/resolve`, {});
        const resolvedList = asList(r, "widgets", "resolved", "results");
        if (resolvedList.length === ws.length) {
          resolvedList.forEach((rv, i) => { out[i] = { data: rv }; });
        } else {
          throw new Error("shape mismatch");
        }
      } catch {
        await Promise.all(ws.map(async (w, i) => {
          try { out[i] = { data: await apiPost("/v1/dashboards/resolve", { widget: w }) }; }
          catch (e) { out[i] = { error: e }; }
        }));
      }
      setResolved(out);
      return true;
    });
    return d;
  }, [resolveAsync]);

  const sourceCounts = useMemo(() => {
    const m = {};
    for (const w of widgets) m[w.source] = (m[w.source] || 0) + 1;
    return m;
  }, [widgets]);

  return (
    <PageShell
      title="DASHBOARD BUILDER"
      subtitle="COMPOSE WIDGETS · RESOLVE TO LIVE DATA · SAVE & LOAD BOARDS"
      accent={ACCENT}
      actions={
        <>
          <Btn accent={ACCENT} onClick={refreshCanvas} disabled={!widgets.length || resolveAsync.loading}>
            {resolveAsync.loading ? "◌ RESOLVE" : "↻ RESOLVE"}
          </Btn>
          <Btn accent={C.text} onClick={clearCanvas} style={{ marginLeft: 8 }}>✕ CLEAR</Btn>
        </>
      }
    >
      <Grid min={150} style={{ marginBottom: 14 }}>
        <StatTile label="Widgets" value={widgets.length} accent={ACCENT} />
        <StatTile label="Saved Boards" value={listError ? "⚠" : saved.length} accent={C.gold}
          sub={listError ? "list down" : "stored"} />
        <StatTile label="Resolved" value={Object.keys(resolved).length} accent={C.neon} />
        <StatTile label="Editing" value={openId ? `#${openId}` : "new"} accent={C.purple} />
      </Grid>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,0.9fr) minmax(0,2fr)", gap: 14, alignItems: "start" }}>
        {/* LEFT — palette, save, saved list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <PanelCard title="WIDGET PALETTE" accent={ACCENT}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>TYPE</label>
              <select value={wType} onChange={(e) => setWType(e.target.value)} style={inputStyle}>
                {WIDGET_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <label style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>SOURCE</label>
              <select value={wSource} onChange={(e) => setWSource(e.target.value)} style={inputStyle}>
                {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <Btn accent={C.neon} onClick={addWidget} style={{ alignSelf: "flex-start" }}>+ ADD TO CANVAS</Btn>
            </div>
          </PanelCard>

          <PanelCard title="SAVE BOARD" accent={C.gold}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="board name" style={inputStyle} />
              <Btn accent={C.gold} onClick={save} disabled={saveAsync.loading} style={{ alignSelf: "flex-start" }}>
                {saveAsync.loading ? "…" : "💾 SAVE"}
              </Btn>
              {saveMsg && (
                <div style={{ fontSize: 9, color: saveMsg.err ? C.red : C.neon }}>
                  {saveMsg.err ? "⚠ " : "✓ "}{saveMsg.text}
                </div>
              )}
              {saveAsync.error && <div style={{ fontSize: 9, color: C.red }}>⚠ {String(saveAsync.error.message || saveAsync.error)}</div>}
            </div>
          </PanelCard>

          <PanelCard title="SAVED DASHBOARDS" accent={C.purple}
            right={<Badge color={C.purple}>{saved.length}</Badge>}>
            <DataState loading={listLoading} error={listError} empty={saved.length === 0}
              emptyLabel="No saved dashboards">
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 260, overflowY: "auto" }}>
                {saved.map((d) => {
                  const id = d.id ?? d._id ?? d.name;
                  const active = id === openId;
                  return (
                    <button key={id} onClick={() => openDashboard(id)}
                      style={{ textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                        border: `1px solid ${active ? C.purple + "88" : C.border}`,
                        background: active ? C.purple + "1a" : "rgba(0,0,0,0.25)", borderRadius: 5, padding: "6px 9px",
                        color: C.textB }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: active ? C.purple : C.textB }}>
                        {d.name || d.title || `Board ${id}`}
                      </div>
                      <div style={{ fontSize: 8, color: C.text, marginTop: 2 }}>
                        {asList(d, "widgets").length || d.widget_count || 0} widgets · {id}
                      </div>
                    </button>
                  );
                })}
              </div>
            </DataState>
          </PanelCard>
        </div>

        {/* RIGHT — the canvas */}
        <PanelCard title="CANVAS" accent={ACCENT}
          right={
            <span style={{ display: "flex", gap: 6 }}>
              {Object.entries(sourceCounts).map(([s, n]) => <Badge key={s} color={sourceColor(s)}>{s} {n}</Badge>)}
            </span>
          }>
          {widgets.length === 0 ? (
            <div style={{ padding: 30, fontSize: 10, color: C.text, letterSpacing: 1, textAlign: "center" }}>
              Add widgets from the palette, then RESOLVE to pull live data — or open a saved board.
            </div>
          ) : (
            <Grid min={210} gap={12}>
              {widgets.map((w, i) => {
                const color = sourceColor(w.source);
                const r = resolved[i];
                return (
                  <div key={i} style={{ border: `1px solid ${color}33`, borderRadius: 6, background: "rgba(0,0,0,0.25)",
                    boxShadow: `inset 0 0 18px ${color}0d` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 9px",
                      borderBottom: `1px solid ${C.border}`, background: `${color}0d` }}>
                      <Badge color={color}>{w.type}</Badge>
                      <span style={{ fontSize: 9, color: C.textB, flex: 1 }}>{w.source}</span>
                      <button onClick={() => removeWidget(i)} title="remove"
                        style={{ cursor: "pointer", background: "none", border: "none", color: C.text, fontFamily: "inherit", fontSize: 11 }}>✕</button>
                    </div>
                    <div style={{ padding: 10, minHeight: 70 }}>
                      <WidgetView widget={w} resolved={r?.data} error={r?.error} />
                    </div>
                  </div>
                );
              })}
            </Grid>
          )}
          {resolveAsync.error && (
            <div style={{ fontSize: 9, color: C.red, marginTop: 8 }}>⚠ {String(resolveAsync.error.message || resolveAsync.error)}</div>
          )}
        </PanelCard>
      </div>
    </PageShell>
  );
}
