/**
 * WorkshopAnalyticsPanel — F288.
 *
 * Ad-hoc analytics over the live ontology object model using the Workshop
 * aggregation service.
 *
 * Data sources (all real — /v1/workshop):
 *   GET  /v1/ontology/objects?limit=200           (mount — object population)
 *        → {items:[{id,type,props,...}]}
 *   POST /v1/workshop/groupby                      (GROUP BY tab)
 *        body: {field, agg, type}
 *        → {field, agg, groups:{key:number}, n_groups}
 *   POST /v1/workshop/histogram                    (HISTOGRAM tab)
 *        body: {field, bins, type}
 *        → {field, bins, counts:[n], edges:[f], n}
 *   POST /v1/workshop/pivot                        (PIVOT tab)
 *        body: {rows_field, cols_field, agg, type}
 *        → {rows_field, cols_field, agg, rows:[str], cols:[str],
 *            table:{row:{col:number}}, n_rows, n_cols, n_total}
 *
 * Displays:
 *   - Stat tiles: total objects / types / last-run groups / last-run n
 *   - GROUP BY tab: field input + agg selector + type filter → bar chart of groups
 *   - HISTOGRAM tab: numeric field + bins slider + type filter → SVG histogram bars
 *   - PIVOT tab: rows field + cols field + agg + type → cross-tab matrix
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence analytics brief + TTS
 *
 * Toggle: ◈ WKSP at left:333600, bottom:8, zIndex:166.
 * Badge: green=object count, dim=empty.
 *
 * Exported helpers for JarvisBrain:
 *   isWkspQuery(q) / buildWkspScript()
 *
 * Voice triggers: "workshop / analytics panel / group by / histogram /
 *   pivot table / wksp / data analysis / object analytics / explore data /
 *   workshop analytics / field analysis / distribution / data explorer"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const PU   = "#A78BFA";
const DIM  = "#3A4A55";
const GRAY = "#4E6070";

const BTN_LEFT = 333600;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── JarvisBrain exports ──────────────────────────────────────────────────────

const WKSP_RE =
  /\b(workshop\b|analytics\s+panel|group\s+by|histogram\b|pivot\s+table|wksp\b|data\s+analysis|object\s+analytics|explore\s+data|workshop\s+analytics|field\s+analysis|distribution\b|data\s+explorer)\b/i;

export function isWkspQuery(q) {
  return WKSP_RE.test(q || "");
}

export async function buildWkspScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/ontology/objects?limit=200`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = await r.json();
    const items = d?.items ?? d?.objects ?? [];
    const types = [...new Set(items.map((o) => o.type).filter(Boolean))];
    window.dispatchEvent(new CustomEvent("jarvis:wksp-toggle"));
    return (
      `Workshop Analytics: ${items.length} ontology object${items.length !== 1 ? "s" : ""} loaded` +
      (types.length ? `, spanning ${types.length} type${types.length !== 1 ? "s" : ""} (${types.slice(0, 4).join(", ")}${types.length > 4 ? "…" : ""})` : "") +
      ". Use GROUP BY to count by field, HISTOGRAM to visualise distributions, or PIVOT to cross-tabulate."
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:wksp-toggle"));
    return "Workshop Analytics Panel open. Load ontology objects to begin analysis.";
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function hdr() {
  return { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
}

async function fetchObjects() {
  const r = await fetch(`${apiBase()}/v1/ontology/objects?limit=200`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`objects ${r.status}`);
  return r.json();
}

async function postGroupBy(field, agg, type) {
  const body = { field, agg };
  if (type) body.type = type;
  const r = await fetch(`${apiBase()}/v1/workshop/groupby`, {
    method: "POST", headers: hdr(), body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`groupby ${r.status}`);
  return r.json();
}

async function postHistogram(field, bins, type) {
  const body = { field, bins: Number(bins) };
  if (type) body.type = type;
  const r = await fetch(`${apiBase()}/v1/workshop/histogram`, {
    method: "POST", headers: hdr(), body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`histogram ${r.status}`);
  return r.json();
}

async function postPivot(rows_field, cols_field, agg, type) {
  const body = { rows_field, cols_field, agg };
  if (type) body.type = type;
  const r = await fetch(`${apiBase()}/v1/workshop/pivot`, {
    method: "POST", headers: hdr(), body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`pivot ${r.status}`);
  return r.json();
}

async function postAssess(text) {
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: hdr(),
    body: JSON.stringify({ message: text }),
  });
  if (!r.ok) return null;
  const d = await r.json();
  return d?.response ?? d?.message ?? d?.text ?? null;
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StatTile({ label, value, color }) {
  return (
    <div
      style={{
        flex: 1,
        background: "rgba(41,231,255,0.04)",
        border: "1px solid rgba(41,231,255,0.10)",
        borderRadius: 6,
        padding: "8px 10px",
        minWidth: 60,
      }}
    >
      <div style={{ color, fontSize: 16, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      <div
        style={{
          color: GRAY,
          fontSize: 9,
          marginTop: 3,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function TabBtn({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "rgba(41,231,255,0.12)" : "transparent",
        border: `1px solid ${active ? CY : "rgba(41,231,255,0.15)"}`,
        borderRadius: 4,
        color: active ? CY : GRAY,
        cursor: "pointer",
        fontSize: 10,
        fontFamily: "monospace",
        letterSpacing: "0.06em",
        padding: "3px 8px",
      }}
    >
      {label}
    </button>
  );
}

function BarRow({ label, value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 5 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 2,
          color: GRAY,
          fontSize: 9,
        }}
      >
        <span style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </span>
        <span style={{ color: CY, fontWeight: 700 }}>{value}</span>
      </div>
      <div
        style={{
          height: 5,
          background: "rgba(41,231,255,0.08)",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: color,
            borderRadius: 3,
            transition: "width 0.4s ease",
          }}
        />
      </div>
    </div>
  );
}

// ─── GROUP BY tab ─────────────────────────────────────────────────────────────

function GroupByTab({ types }) {
  const [field,   setField]   = useState("type");
  const [agg,     setAgg]     = useState("count");
  const [typeF,   setTypeF]   = useState("");
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState(null);

  async function run() {
    setLoading(true); setErr(null);
    try {
      const d = await postGroupBy(field, agg, typeF || undefined);
      setResult(d);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  const groups   = result?.groups ?? {};
  const entries  = Object.entries(groups).sort((a, b) => b[1] - a[1]);
  const maxVal   = entries.length ? Math.max(...entries.map(([, v]) => v)) : 0;

  return (
    <div style={{ padding: "0 12px 10px" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        <input
          value={field}
          onChange={(e) => setField(e.target.value)}
          placeholder="field (e.g. type, status)"
          style={inputStyle()}
        />
        <select
          value={agg}
          onChange={(e) => setAgg(e.target.value)}
          style={{ ...inputStyle(), width: 90 }}
        >
          {["count", "sum", "mean", "min", "max"].map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select
          value={typeF}
          onChange={(e) => setTypeF(e.target.value)}
          style={{ ...inputStyle(), width: 110 }}
        >
          <option value="">all types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={run} disabled={loading} style={runBtnStyle(loading)}>
          {loading ? "…" : "▶ RUN"}
        </button>
      </div>
      {err && <div style={{ color: "#F87171", fontSize: 10, marginBottom: 6 }}>{err}</div>}
      {entries.length > 0 && (
        <div>
          <div style={{ color: GRAY, fontSize: 9, marginBottom: 6 }}>
            {entries.length} groups · {result?.agg ?? "count"} of {result?.field ?? field}
          </div>
          {entries.map(([k, v]) => (
            <BarRow key={k} label={k} value={v} max={maxVal} color={CY} />
          ))}
        </div>
      )}
      {result && entries.length === 0 && (
        <div style={{ color: GRAY, fontSize: 10 }}>No groups returned — check field name or type filter.</div>
      )}
    </div>
  );
}

// ─── HISTOGRAM tab ────────────────────────────────────────────────────────────

function HistogramTab({ types }) {
  const [field,   setField]   = useState("confidence");
  const [bins,    setBins]    = useState(10);
  const [typeF,   setTypeF]   = useState("");
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState(null);

  async function run() {
    setLoading(true); setErr(null);
    try {
      const d = await postHistogram(field, bins, typeF || undefined);
      setResult(d);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  const counts = result?.counts ?? [];
  const edges  = result?.edges  ?? [];
  const maxC   = counts.length ? Math.max(...counts, 1) : 1;
  const SVG_H  = 80;
  const SVG_W  = 420;
  const barW   = counts.length ? Math.floor(SVG_W / counts.length) - 1 : 0;

  return (
    <div style={{ padding: "0 12px 10px" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        <input
          value={field}
          onChange={(e) => setField(e.target.value)}
          placeholder="numeric field"
          style={inputStyle()}
        />
        <label style={{ color: GRAY, fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}>
          bins
          <input
            type="range"
            min={3}
            max={30}
            value={bins}
            onChange={(e) => setBins(Number(e.target.value))}
            style={{ width: 70 }}
          />
          <span style={{ color: CY, fontSize: 10 }}>{bins}</span>
        </label>
        <select
          value={typeF}
          onChange={(e) => setTypeF(e.target.value)}
          style={{ ...inputStyle(), width: 110 }}
        >
          <option value="">all types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={run} disabled={loading} style={runBtnStyle(loading)}>
          {loading ? "…" : "▶ RUN"}
        </button>
      </div>
      {err && <div style={{ color: "#F87171", fontSize: 10, marginBottom: 6 }}>{err}</div>}
      {counts.length > 0 && (
        <div>
          <div style={{ color: GRAY, fontSize: 9, marginBottom: 6 }}>
            {result?.n ?? 0} values · {counts.length} bins · field: {result?.field ?? field}
          </div>
          <svg
            width={SVG_W}
            height={SVG_H + 16}
            style={{ display: "block", overflow: "visible" }}
          >
            {counts.map((c, i) => {
              const barH = maxC > 0 ? Math.round((c / maxC) * SVG_H) : 0;
              const x    = i * (barW + 1);
              const y    = SVG_H - barH;
              const edge = edges[i] != null ? Number(edges[i]).toFixed(2) : "";
              return (
                <g key={i}>
                  <rect
                    x={x} y={y} width={barW} height={barH}
                    fill={`${CY}88`}
                    stroke={`${CY}44`}
                    strokeWidth={0.5}
                    rx={1}
                  />
                  {i % Math.max(1, Math.floor(counts.length / 5)) === 0 && (
                    <text
                      x={x + barW / 2}
                      y={SVG_H + 12}
                      textAnchor="middle"
                      fill={GRAY}
                      fontSize={7}
                      fontFamily="monospace"
                    >
                      {edge}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      )}
      {result && counts.every((c) => c === 0) && (
        <div style={{ color: GRAY, fontSize: 10 }}>
          No numeric values for field "{field}" — try a different field or type filter.
        </div>
      )}
    </div>
  );
}

// ─── PIVOT tab ────────────────────────────────────────────────────────────────

function PivotTab({ types }) {
  const [rowsF,   setRowsF]   = useState("type");
  const [colsF,   setColsF]   = useState("status");
  const [agg,     setAgg]     = useState("count");
  const [typeF,   setTypeF]   = useState("");
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState(null);

  async function run() {
    setLoading(true); setErr(null);
    try {
      const d = await postPivot(rowsF, colsF, agg, typeF || undefined);
      setResult(d);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  const rows  = result?.rows ?? [];
  const cols  = result?.cols ?? [];
  const table = result?.table ?? {};

  const allVals = rows.flatMap((r) => cols.map((c) => table[r]?.[c] ?? 0));
  const maxVal  = allVals.length ? Math.max(...allVals, 1) : 1;

  function cellColor(v) {
    if (!v) return "transparent";
    const pct = v / maxVal;
    const a   = Math.round(pct * 180);
    return `rgba(41,231,255,${(a / 255).toFixed(2)})`;
  }

  return (
    <div style={{ padding: "0 12px 10px" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        <input
          value={rowsF}
          onChange={(e) => setRowsF(e.target.value)}
          placeholder="rows field"
          style={inputStyle()}
        />
        <input
          value={colsF}
          onChange={(e) => setColsF(e.target.value)}
          placeholder="cols field"
          style={inputStyle()}
        />
        <select
          value={agg}
          onChange={(e) => setAgg(e.target.value)}
          style={{ ...inputStyle(), width: 80 }}
        >
          {["count", "sum", "mean", "min", "max"].map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select
          value={typeF}
          onChange={(e) => setTypeF(e.target.value)}
          style={{ ...inputStyle(), width: 110 }}
        >
          <option value="">all types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={run} disabled={loading} style={runBtnStyle(loading)}>
          {loading ? "…" : "▶ RUN"}
        </button>
      </div>
      {err && <div style={{ color: "#F87171", fontSize: 10, marginBottom: 6 }}>{err}</div>}
      {rows.length > 0 && cols.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <div style={{ color: GRAY, fontSize: 9, marginBottom: 6 }}>
            {result?.n_rows ?? rows.length} rows × {result?.n_cols ?? cols.length} cols · {result?.agg ?? agg} of {result?.rows_field ?? rowsF} × {result?.cols_field ?? colsF}
          </div>
          <table
            style={{
              borderCollapse: "collapse",
              fontSize: 9,
              fontFamily: "monospace",
              minWidth: 200,
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    color: GRAY,
                    padding: "3px 8px",
                    borderBottom: `1px solid ${DIM}`,
                    textAlign: "left",
                    whiteSpace: "nowrap",
                  }}
                >
                  {result?.rows_field ?? rowsF} ↓ / {result?.cols_field ?? colsF} →
                </th>
                {cols.map((c) => (
                  <th
                    key={c}
                    style={{
                      color: CY,
                      padding: "3px 8px",
                      borderBottom: `1px solid ${DIM}`,
                      textAlign: "center",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row}>
                  <td
                    style={{
                      color: AM,
                      padding: "3px 8px",
                      borderBottom: `1px solid ${DIM}22`,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row}
                  </td>
                  {cols.map((col) => {
                    const v = table[row]?.[col] ?? 0;
                    return (
                      <td
                        key={col}
                        style={{
                          background: cellColor(v),
                          color: v ? "#fff" : GRAY,
                          padding: "3px 8px",
                          textAlign: "center",
                          borderBottom: `1px solid ${DIM}22`,
                          borderLeft: `1px solid ${DIM}22`,
                        }}
                      >
                        {v}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result && rows.length === 0 && (
        <div style={{ color: GRAY, fontSize: 10 }}>
          No pivot data — check row/col field names or type filter.
        </div>
      )}
    </div>
  );
}

// ─── style helpers ────────────────────────────────────────────────────────────

function inputStyle() {
  return {
    background: "rgba(41,231,255,0.05)",
    border: "1px solid rgba(41,231,255,0.18)",
    borderRadius: 4,
    color: CY,
    fontFamily: "monospace",
    fontSize: 10,
    outline: "none",
    padding: "3px 7px",
    width: 130,
  };
}

function runBtnStyle(disabled) {
  return {
    background: disabled ? "transparent" : `${GN}11`,
    border: `1px solid ${disabled ? DIM : GN}`,
    borderRadius: 4,
    color: disabled ? GRAY : GN,
    cursor: disabled ? "wait" : "pointer",
    fontFamily: "monospace",
    fontSize: 10,
    padding: "3px 8px",
  };
}

// ─── main component ───────────────────────────────────────────────────────────

export default function WorkshopAnalyticsPanel() {
  const [open,     setOpen]     = useState(false);
  const [tab,      setTab]      = useState("groupby");
  const [objects,  setObjects]  = useState([]);
  const [types,    setTypes]    = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState(null);

  const pollRef = useRef(null);

  const loadObjects = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchObjects();
      const items = d?.items ?? d?.objects ?? [];
      setObjects(items);
      setTypes([...new Set(items.map((o) => o.type).filter(Boolean))].sort());
    } catch {
      /* silently ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && objects.length === 0) loadObjects();
  }, [open, objects.length, loadObjects]);

  useEffect(() => {
    if (!open) return;
    pollRef.current = setInterval(loadObjects, 120_000);
    return () => clearInterval(pollRef.current);
  }, [open, loadObjects]);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    window.addEventListener("jarvis:wksp-toggle", toggle);
    return () => window.removeEventListener("jarvis:wksp-toggle", toggle);
  }, [toggle]);

  async function assess() {
    setAssessing(true); setAssessText(null);
    const msg =
      `Workshop Analytics: ${objects.length} ontology objects loaded, types: ${types.slice(0, 6).join(", ")}. ` +
      "Summarise the distribution of object types and suggest 2 high-value group-by or pivot analyses in 2 sentences.";
    try {
      const txt = await postAssess(msg);
      if (txt) {
        setAssessText(txt);
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: txt }));
      }
    } catch {
      /* ignore */
    } finally {
      setAssessing(false);
    }
  }

  // ── floating button ────────────────────────────────────────────────────────

  const badgeCount = objects.length;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Workshop Analytics (WKSP)"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: 166,
          background: "rgba(6,14,20,0.92)",
          border: `1px solid ${badgeCount > 0 ? GN : DIM}44`,
          borderRadius: 5,
          color: badgeCount > 0 ? GN : GRAY,
          cursor: "pointer",
          fontFamily: "monospace",
          fontSize: 9,
          letterSpacing: "0.06em",
          padding: "3px 8px",
          whiteSpace: "nowrap",
        }}
      >
        ◈ WKSP
        {badgeCount > 0 && (
          <span
            style={{
              marginLeft: 4,
              background: `${GN}22`,
              border: `1px solid ${GN}55`,
              borderRadius: 3,
              color: GN,
              fontSize: 8,
              padding: "0 3px",
            }}
          >
            {badgeCount}
          </span>
        )}
      </button>
    );
  }

  // ── open panel ─────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: "fixed",
        left: 8,
        bottom: 40,
        zIndex: 9200,
        background: "rgba(6,14,20,0.97)",
        border: `1px solid ${CY}33`,
        borderRadius: 10,
        boxShadow: `0 0 32px ${CY}18`,
        width: 500,
        maxHeight: "76vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "monospace",
        overflow: "hidden",
      }}
    >
      {/* header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          borderBottom: `1px solid ${CY}22`,
          padding: "8px 12px",
          gap: 8,
        }}
      >
        <span style={{ color: CY, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em" }}>
          ◈ WORKSHOP ANALYTICS
        </span>
        {loading && (
          <span style={{ color: AM, fontSize: 9 }}>loading…</span>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={assess}
          disabled={assessing}
          style={{
            background: `${CY}11`,
            border: `1px solid ${CY}44`,
            borderRadius: 3,
            color: assessing ? GRAY : CY,
            cursor: assessing ? "wait" : "pointer",
            fontSize: 9,
            padding: "2px 7px",
          }}
        >
          {assessing ? "…" : "▶ ASSESS"}
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: "transparent",
            border: "none",
            color: GRAY,
            cursor: "pointer",
            fontSize: 14,
            lineHeight: 1,
            padding: "0 2px",
          }}
        >
          ×
        </button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
        <StatTile label="objects"  value={objects.length}  color={objects.length > 0 ? GN : GRAY} />
        <StatTile label="types"    value={types.length}    color={types.length > 0 ? PU : GRAY} />
        <StatTile label="analysis" value={tab.toUpperCase()} color={CY} />
        <StatTile label="engine"   value="workshop"        color={AM} />
      </div>

      {/* assess text */}
      {assessText && (
        <div
          style={{
            margin: "0 12px 6px",
            background: `${CY}08`,
            border: `1px solid ${CY}22`,
            borderRadius: 5,
            color: "#C7EEFF",
            fontSize: 10,
            lineHeight: 1.5,
            padding: "6px 10px",
          }}
        >
          {assessText}
        </div>
      )}

      {/* tabs */}
      <div style={{ display: "flex", gap: 6, padding: "0 12px 8px", flexWrap: "wrap" }}>
        {[
          { id: "groupby",   label: "GROUP BY" },
          { id: "histogram", label: "HISTOGRAM" },
          { id: "pivot",     label: "PIVOT" },
        ].map(({ id, label }) => (
          <TabBtn key={id} label={label} active={tab === id} onClick={() => setTab(id)} />
        ))}
      </div>

      {/* tab content */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {tab === "groupby"   && <GroupByTab   types={types} />}
        {tab === "histogram" && <HistogramTab types={types} />}
        {tab === "pivot"     && <PivotTab     types={types} />}
      </div>
    </div>
  );
}
