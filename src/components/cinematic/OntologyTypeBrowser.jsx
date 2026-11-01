/**
 * OntologyTypeBrowser — F267.
 *
 * TREE-VIEW accordion of all ontology types, with top-10 objects nested under each.
 *
 * Data sources:
 *   GET /v1/ontology/types                        → { items:[{id,label,count,props}] }
 *   GET /v1/ontology/objects?type={t}&limit=10    → { items:[{id,label,type,mark,props,links}] }
 *   GET /v1/ontology/objects/{id}                 → full object detail
 *
 * Features:
 *   - Accordion: each type row is collapsible; expand → lazy-load top-10 objects
 *   - Click object row → inline inspector pane: full props + link count
 *   - Type filter text input at top
 *   - Header stat tiles: total objects / type count
 *   - ▶ ASSESS → /v1/jarvis/agent/chat brief + TTS
 *
 * Toggle: ◈ ONTBR  left:197320  bottom:8  zIndex:363
 * Event:  jarvis:ontbr-toggle
 * Voice:  "ontology type browser / type tree / type accordion / ontbr /
 *          browse ontology types / object types tree / type hierarchy"
 *
 * Exported for JarvisBrain: isOntbrQuery
 * Mounted via src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const RD   = "#F87171";
const PU   = "#A78BFA";
const DIM  = "#2A3A45";
const GRAY = "#4E6070";
const SURF = "rgba(12,22,30,0.97)";
const BORD = "rgba(41,231,255,0.18)";

const BTN_LEFT = 197320;
const POLL_MS  = 120_000;
const OBJ_LIMIT = 10;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const TYPE_PALETTE = [CY, PU, AM, GN, "#FB923C", "#34D399", "#F472B6", "#60A5FA", "#FBBF24", "#A3E635"];

function typeColor(idx) {
  return TYPE_PALETTE[idx % TYPE_PALETTE.length];
}

// ─── JarvisBrain exports ──────────────────────────────────────────────────────

const ONTBR_RE =
  /\b(ontology\s+type\s+browser|type\s+tree|type\s+accordion|ontbr\b|browse\s+ontology\s+types?|object\s+types?\s+tree|type\s+hierarchy|ontology\s+accordion)\b/i;

export function isOntbrQuery(q) {
  return ONTBR_RE.test(q || "");
}

// ─── fetch helpers ────────────────────────────────────────────────────────────

function hdrs() {
  return { Authorization: `Bearer ${API_KEY}` };
}

async function fetchTypes() {
  const r = await fetch(`${apiBase()}/v1/ontology/types`, { headers: hdrs() });
  if (!r.ok) throw new Error(`types ${r.status}`);
  return r.json();
}

async function fetchObjectsForType(typeId) {
  const url = `${apiBase()}/v1/ontology/objects?type=${encodeURIComponent(typeId)}&limit=${OBJ_LIMIT}`;
  const r = await fetch(url, { headers: hdrs() });
  if (!r.ok) throw new Error(`objects ${r.status}`);
  return r.json();
}

async function fetchObjectDetail(id) {
  const r = await fetch(`${apiBase()}/v1/ontology/objects/${encodeURIComponent(id)}`, { headers: hdrs() });
  if (!r.ok) throw new Error(`object ${r.status}`);
  return r.json();
}

// ─── normalise ────────────────────────────────────────────────────────────────

function normaliseTypes(raw) {
  const arr = Array.isArray(raw?.items) ? raw.items
    : Array.isArray(raw?.types)         ? raw.types
    : Array.isArray(raw)                ? raw
    : [];
  return arr.map((t) => ({
    id:    t.id    || t.type_id || t.name || "unknown",
    label: t.label || t.name   || t.id   || "Unknown",
    count: t.count ?? t.object_count ?? 0,
  }));
}

function normaliseObjects(raw) {
  const arr = Array.isArray(raw?.items) ? raw.items
    : Array.isArray(raw?.objects)       ? raw.objects
    : Array.isArray(raw)                ? raw
    : [];
  return arr.map((o) => ({
    id:    o.id    || "?",
    label: o.label || o.name  || o.id || "—",
    type:  o.type  || "—",
    mark:  o.mark  || "",
    props: o.props || {},
    links: Array.isArray(o.links) ? o.links : [],
  }));
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StatTile({ label, value, color }) {
  return (
    <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "6px 10px", textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || CY, fontFamily: "monospace" }}>{value}</div>
      <div style={{ fontSize: 9, color: GRAY, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
    </div>
  );
}

function ObjectInspector({ obj, onClose }) {
  const propEntries = Object.entries(obj.props || {});
  return (
    <div style={{
      background: "rgba(20,35,45,0.98)", border: `1px solid ${BORD}`, borderRadius: 8,
      padding: 12, marginTop: 4, position: "relative",
    }}>
      <button onClick={onClose} style={{ position: "absolute", top: 6, right: 8, background: "none", border: "none", color: GRAY, cursor: "pointer", fontSize: 13 }}>✕</button>
      <div style={{ fontSize: 11, color: CY, fontWeight: 700, marginBottom: 6 }}>{obj.label}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        <span style={{ fontSize: 9, background: "rgba(41,231,255,0.12)", color: CY, padding: "2px 6px", borderRadius: 3 }}>{obj.type}</span>
        {obj.mark && <span style={{ fontSize: 9, background: "rgba(167,139,250,0.15)", color: PU, padding: "2px 6px", borderRadius: 3 }}>{obj.mark}</span>}
        <span style={{ fontSize: 9, color: GRAY }}>Links: {obj.links.length}</span>
      </div>
      {propEntries.length > 0 ? (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
          <tbody>
            {propEntries.slice(0, 12).map(([k, v]) => (
              <tr key={k}>
                <td style={{ color: GRAY, paddingRight: 8, paddingBottom: 3, whiteSpace: "nowrap", fontFamily: "monospace" }}>{k}</td>
                <td style={{ color: "#cdd6f4", wordBreak: "break-all" }}>{String(v).slice(0, 80)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ fontSize: 10, color: GRAY }}>No props recorded.</div>
      )}
    </div>
  );
}

function ObjectRow({ obj, onSelect, selected }) {
  return (
    <div
      onClick={() => onSelect(obj)}
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "5px 8px",
        cursor: "pointer", borderRadius: 4,
        background: selected ? "rgba(41,231,255,0.08)" : "transparent",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ fontSize: 9, color: GRAY, fontFamily: "monospace", minWidth: 24 }}>○</span>
      <span style={{ fontSize: 11, color: "#cdd6f4", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{obj.label}</span>
      {obj.mark && <span style={{ fontSize: 9, color: PU }}>{obj.mark}</span>}
      <span style={{ fontSize: 9, color: GRAY }}>{obj.links.length} lnk</span>
    </div>
  );
}

function TypeRow({ type, idx, filter, onAssessType }) {
  const [expanded, setExpanded]   = useState(false);
  const [objects,  setObjects]    = useState([]);
  const [loading,  setLoading]    = useState(false);
  const [err,      setErr]        = useState(null);
  const [selected, setSelected]   = useState(null);
  const [detail,   setDetail]     = useState(null);
  const [detailLoading, setDL]    = useState(false);

  const expand = useCallback(async () => {
    if (!expanded) {
      setExpanded(true);
      if (objects.length === 0) {
        setLoading(true);
        setErr(null);
        try {
          const raw = await fetchObjectsForType(type.id);
          setObjects(normaliseObjects(raw));
        } catch (e) {
          setErr(e.message);
        } finally {
          setLoading(false);
        }
      }
    } else {
      setExpanded(false);
    }
  }, [expanded, objects.length, type.id]);

  const selectObj = useCallback(async (obj) => {
    if (selected?.id === obj.id) {
      setSelected(null);
      setDetail(null);
      return;
    }
    setSelected(obj);
    setDL(true);
    try {
      const raw = await fetchObjectDetail(obj.id);
      setDetail({
        id:    raw.id    || obj.id,
        label: raw.label || obj.label,
        type:  raw.type  || obj.type,
        mark:  raw.mark  || obj.mark,
        props: raw.props || {},
        links: Array.isArray(raw.links) ? raw.links : obj.links,
      });
    } catch {
      setDetail(obj);
    } finally {
      setDL(false);
    }
  }, [selected]);

  const color = typeColor(idx);
  const pct   = type.count > 0 ? Math.min(100, (type.count / Math.max(type.count, 1)) * 100) : 0;

  return (
    <div style={{ borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
      {/* Type header row */}
      <div
        onClick={expand}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer" }}
        onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
      >
        <span style={{ fontSize: 10, color: GRAY, width: 12 }}>{expanded ? "▾" : "▸"}</span>
        <span style={{ fontSize: 11, color, fontWeight: 600, fontFamily: "monospace", minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{type.label}</span>
        <div style={{ width: 60, height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, flexShrink: 0 }}>
          <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.3s" }} />
        </div>
        <span style={{ fontSize: 10, color, fontFamily: "monospace", minWidth: 30, textAlign: "right" }}>{type.count}</span>
      </div>

      {/* Expanded objects */}
      {expanded && (
        <div style={{ paddingLeft: 20, paddingBottom: 4 }}>
          {loading && <div style={{ fontSize: 10, color: GRAY, padding: "4px 8px" }}>Loading…</div>}
          {err     && <div style={{ fontSize: 10, color: RD,   padding: "4px 8px" }}>Error: {err}</div>}
          {!loading && !err && objects.length === 0 && (
            <div style={{ fontSize: 10, color: GRAY, padding: "4px 8px" }}>No objects of this type.</div>
          )}
          {objects.map((obj) => (
            <div key={obj.id}>
              <ObjectRow obj={obj} onSelect={selectObj} selected={selected?.id === obj.id} />
              {selected?.id === obj.id && (
                detailLoading
                  ? <div style={{ fontSize: 10, color: GRAY, padding: "4px 8px 4px 16px" }}>Loading detail…</div>
                  : detail && <ObjectInspector obj={detail} onClose={() => { setSelected(null); setDetail(null); }} />
              )}
            </div>
          ))}
          {objects.length === OBJ_LIMIT && (
            <div style={{ fontSize: 9, color: GRAY, padding: "4px 8px" }}>Showing top {OBJ_LIMIT}. Filter via search.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function OntologyTypeBrowser() {
  const [open,    setOpen]    = useState(false);
  const [types,   setTypes]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter,  setFilter]  = useState("");
  const [assess,  setAssess]  = useState("");
  const [assessing, setAss]   = useState(false);
  const panelRef = useRef(null);

  const loadTypes = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await fetchTypes();
      setTypes(normaliseTypes(raw));
    } catch {
      /* silent — server may be unavailable */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTypes();
    const id = setInterval(loadTypes, POLL_MS);
    return () => clearInterval(id);
  }, [loadTypes]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:ontbr-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ontbr-toggle", onToggle);
  }, []);

  const runAssess = useCallback(async () => {
    setAss(true);
    setAssess("");
    try {
      const totalObj = types.reduce((s, t) => s + t.count, 0);
      const topTypes = types.slice(0, 5).map((t) => `${t.label}(${t.count})`).join(", ");
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message:
            `Ontology type browser: ${types.length} type${types.length !== 1 ? "s" : ""} registered, ` +
            `${totalObj} objects total. Top types: ${topTypes || "none"}. ` +
            `Deliver a 2-sentence type-distribution and knowledge-model brief — formal butler tone.`,
        }),
      });
      const d = await r.json();
      const text = (d.answer || "Ontology type distribution reviewed, sir.").trim();
      setAssess(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setAssess("Ontology type data unavailable, sir.");
    } finally {
      setAss(false);
    }
  }, [types]);

  if (!open) {
    const totalObj = types.reduce((s, t) => s + t.count, 0);
    const badge = totalObj > 0 ? (totalObj >= 1000 ? `${(totalObj / 1000).toFixed(1)}k` : String(totalObj)) : null;
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 363,
          background: "rgba(12,22,30,0.90)", border: `1px solid ${BORD}`,
          borderRadius: 6, padding: "4px 10px", cursor: "pointer",
          color: CY, fontSize: 10, fontFamily: "monospace", letterSpacing: 1,
          display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
        }}
      >
        ◈ ONTBR
        {badge && (
          <span style={{ background: GN, color: "#000", borderRadius: 3, padding: "1px 5px", fontSize: 9, fontWeight: 700 }}>{badge}</span>
        )}
      </button>
    );
  }

  const filtered = filter.trim()
    ? types.filter((t) => t.label.toLowerCase().includes(filter.toLowerCase()) || t.id.toLowerCase().includes(filter.toLowerCase()))
    : types;

  const totalObj = types.reduce((s, t) => s + t.count, 0);

  return (
    <div
      ref={panelRef}
      style={{
        position: "fixed", bottom: 50, left: Math.min(BTN_LEFT, window.innerWidth - 500),
        width: 480, maxHeight: 580, zIndex: 363,
        background: SURF, border: `1px solid ${BORD}`, borderRadius: 10,
        display: "flex", flexDirection: "column",
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)", fontFamily: "monospace",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", padding: "10px 12px", borderBottom: `1px solid ${BORD}`, gap: 8, flexShrink: 0 }}>
        <span style={{ color: CY, fontSize: 11, fontWeight: 700, flex: 1 }}>◈ ONTOLOGY TYPE BROWSER</span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: GRAY, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 12px", flexShrink: 0 }}>
        <StatTile label="Types" value={types.length} color={CY} />
        <StatTile label="Total Objects" value={totalObj.toLocaleString()} color={GN} />
        {loading && <StatTile label="Status" value="Polling…" color={AM} />}
      </div>

      {/* Search */}
      <div style={{ padding: "0 12px 8px", flexShrink: 0 }}>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter types…"
          style={{
            width: "100%", background: "rgba(255,255,255,0.06)", border: `1px solid ${BORD}`,
            borderRadius: 5, padding: "5px 10px", color: CY, fontSize: 11, outline: "none",
            fontFamily: "monospace", boxSizing: "border-box",
          }}
        />
      </div>

      {/* Type tree */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {filtered.length === 0 && !loading && (
          <div style={{ padding: 16, color: GRAY, fontSize: 11 }}>
            {filter ? "No types match the filter." : "No types registered yet."}
          </div>
        )}
        {filtered.map((type, idx) => (
          <TypeRow key={type.id} type={type} idx={idx} filter={filter} />
        ))}
      </div>

      {/* ASSESS */}
      <div style={{ borderTop: `1px solid ${BORD}`, padding: "8px 12px", flexShrink: 0 }}>
        {assess && (
          <div style={{ fontSize: 10, color: "#cdd6f4", marginBottom: 6, lineHeight: 1.5 }}>{assess}</div>
        )}
        <button
          onClick={runAssess}
          disabled={assessing}
          style={{
            background: assessing ? "rgba(41,231,255,0.05)" : "rgba(41,231,255,0.12)",
            border: `1px solid ${assessing ? GRAY : CY}`,
            color: assessing ? GRAY : CY, borderRadius: 5, padding: "4px 14px",
            cursor: assessing ? "not-allowed" : "pointer", fontSize: 10,
          }}
        >
          {assessing ? "Assessing…" : "▶ ASSESS"}
        </button>
      </div>
    </div>
  );
}
