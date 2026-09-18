/**
 * OntologyObjectBrowser — F283.
 *
 * Live browser for the Jarvis ontology object store.
 *
 * Data sources (all real — endpoints in /v1/ontology):
 *   GET  /v1/ontology/types               (poll 120 s)
 *        → { items: [{id, label, props, count}], count: int }
 *   GET  /v1/ontology/objects?limit=200   (fetch on open / type filter change)
 *        → { items: [{id, type, label, mark, props, links}], count: int }
 *   GET  /v1/ontology/objects/{id}        (lazy on row expand)
 *        → { id, type, label, mark, props, links:[{rel,target}] }
 *   GET  /v1/ontology/objects/{id}/neighbors?depth=1  (lazy on row expand)
 *        → { objects:[...], links:[...] }
 *
 * Displays:
 *   - Stat tiles: total-objects / type-count / links (from expanded obj) / registered-types
 *   - OBJECTS | TYPES tab switcher + text search + type filter chips
 *   - OBJECTS: each row shows type chip + label/id; expand → props table + neighbor summary
 *   - TYPES: per-type count bar with proportion visualisation
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence knowledge model brief + TTS
 *
 * Toggle: ◈ ONTO at left:310800, bottom:8, zIndex:161.
 * Badge: green=total-object-count.
 * Auto-refresh: types 120 s; objects fetched when panel opens or filter changes.
 *
 * Exported helpers for JarvisBrain:
 *   isOntoQuery(q) / buildOntoScript()
 *
 * Voice triggers: "ontology / object model / knowledge model / entity types /
 *   object types / onto / ontology browser / ontology objects / object catalog /
 *   type catalog / what types exist / ontology types / knowledge objects"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const RD   = "#F87171";
const PU   = "#A78BFA";
const DIM  = "#3A4A55";
const GRAY = "#4E6070";

const BTN_LEFT    = 310800;
const POLL_MS     = 120_000;
const OBJ_LIMIT   = 200;
const API_KEY     =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── JarvisBrain exports ──────────────────────────────────────────────────────

const ONTO_RE =
  /\b(ontology|object\s+model|knowledge\s+model|entity\s+types?|object\s+types?|onto\b|ontology\s+browser|ontology\s+objects?|object\s+catalog|type\s+catalog|what\s+types\s+exist|ontology\s+types?|knowledge\s+objects?)\b/i;

export function isOntoQuery(q) {
  return ONTO_RE.test(q || "");
}

export async function buildOntoScript() {
  try {
    const [typesR, objsR] = await Promise.all([
      fetch(`${apiBase()}/v1/ontology/types`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/v1/ontology/objects?limit=50`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const types = await typesR.json();
    const objs  = await objsR.json();
    window.dispatchEvent(new CustomEvent("jarvis:onto-toggle"));
    const typeCnt = types?.count ?? types?.items?.length ?? 0;
    const objCnt  = objs?.count ?? objs?.items?.length ?? 0;
    const typeNames = (types?.items ?? []).slice(0, 4).map((t) => t.label ?? t.id).join(", ");
    return (
      `Ontology object store: ${typeCnt} type${typeCnt !== 1 ? "s" : ""} registered` +
      (typeNames ? ` (${typeNames}${typeCnt > 4 ? ", …" : ""})` : "") +
      `, ${objCnt} object${objCnt !== 1 ? "s" : ""} in the store. ` +
      (objCnt === 0
        ? "No objects have been ingested yet — push data via POST /v1/ontology/objects."
        : "Open the Ontology Object Browser for type breakdown and object inspection.")
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:onto-toggle"));
    return "Ontology Object Browser open, sir.";
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function hdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function age(ts) {
  if (!ts) return "—";
  const raw =
    typeof ts === "number"
      ? ts > 1e10 ? ts / 1000 : ts
      : new Date(ts).getTime() / 1000;
  if (isNaN(raw)) return "—";
  const s = Math.max(0, Math.floor(Date.now() / 1000 - raw));
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const TYPE_COLORS = [CY, PU, AM, GN, "#FB923C", "#34D399", "#F472B6", "#60A5FA"];

function typeColor(typeName, allTypes) {
  if (!typeName) return GRAY;
  const idx = allTypes.findIndex(
    (t) => (t.id ?? t.label ?? "").toLowerCase() === typeName.toLowerCase(),
  );
  return idx >= 0 ? TYPE_COLORS[idx % TYPE_COLORS.length] : GRAY;
}

// ─── fetch helpers ────────────────────────────────────────────────────────────

async function fetchTypes() {
  const r = await fetch(`${apiBase()}/v1/ontology/types`, { headers: hdr() });
  if (!r.ok) throw new Error(`types ${r.status}`);
  return r.json();
}

async function fetchObjects(type) {
  const url = type
    ? `${apiBase()}/v1/ontology/objects?limit=${OBJ_LIMIT}&type=${encodeURIComponent(type)}`
    : `${apiBase()}/v1/ontology/objects?limit=${OBJ_LIMIT}`;
  const r = await fetch(url, { headers: hdr() });
  if (!r.ok) throw new Error(`objects ${r.status}`);
  return r.json();
}

async function fetchObject(id) {
  const r = await fetch(`${apiBase()}/v1/ontology/objects/${encodeURIComponent(id)}`, { headers: hdr() });
  if (!r.ok) throw new Error(`object ${r.status}`);
  return r.json();
}

async function fetchNeighbors(id) {
  const r = await fetch(
    `${apiBase()}/v1/ontology/objects/${encodeURIComponent(id)}/neighbors?depth=1`,
    { headers: hdr() },
  );
  if (!r.ok) throw new Error(`neighbors ${r.status}`);
  return r.json();
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
        minWidth: 56,
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

function TabBtn({ label, active, count, onClick }) {
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
        display: "flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {label}
      {count != null && (
        <span
          style={{
            background: count > 0 ? `${CY}22` : `${DIM}44`,
            border: `1px solid ${count > 0 ? CY : DIM}`,
            borderRadius: 3,
            color: count > 0 ? CY : GRAY,
            fontSize: 9,
            padding: "0 3px",
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function Chip({ label, color }) {
  return (
    <span
      style={{
        background: `${color}22`,
        border: `1px solid ${color}55`,
        borderRadius: 3,
        color,
        fontSize: 9,
        fontFamily: "monospace",
        padding: "1px 5px",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function ObjectRow({ obj, allTypes }) {
  const [expanded, setExpanded]   = useState(false);
  const [detail, setDetail]       = useState(null);
  const [neighbors, setNeighbors] = useState(null);
  const [loading, setLoading]     = useState(false);

  function toggle() {
    if (!expanded && !detail && !loading) {
      setLoading(true);
      Promise.all([fetchObject(obj.id), fetchNeighbors(obj.id)])
        .then(([d, n]) => { setDetail(d); setNeighbors(n); })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
    setExpanded((v) => !v);
  }

  const tColor = typeColor(obj.type, allTypes);
  const label  = obj.label ?? obj.id ?? "—";
  const props  = detail?.props ?? obj.props ?? null;
  const links  = detail?.links ?? obj.links ?? [];
  const nbObjs = neighbors?.objects ?? [];

  return (
    <div style={{ borderBottom: "1px solid rgba(41,231,255,0.07)", padding: "6px 8px", cursor: "pointer" }}>
      <div
        onClick={toggle}
        style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
      >
        {obj.type && <Chip label={obj.type.toUpperCase()} color={tColor} />}
        <span
          style={{
            color: CY,
            fontSize: 11,
            fontFamily: "monospace",
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
        {obj.mark && <Chip label={obj.mark} color={obj.mark === "PUBLIC" ? GN : obj.mark === "PII" ? RD : AM} />}
        <span style={{ color: GRAY, fontSize: 9 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div
          style={{
            background: "rgba(0,0,0,0.18)",
            borderRadius: 4,
            marginTop: 6,
            padding: "7px 9px",
            display: "flex",
            flexDirection: "column",
            gap: 5,
          }}
        >
          {loading && (
            <div style={{ color: GRAY, fontSize: 9 }}>loading…</div>
          )}

          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            <Chip label={`id: ${obj.id}`} color={GRAY} />
            {detail?.mark && <Chip label={`mark: ${detail.mark}`} color={AM} />}
          </div>

          {props && Object.keys(props).length > 0 && (
            <div>
              <div style={{ color: GRAY, fontSize: 9, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                props
              </div>
              {Object.entries(props).slice(0, 10).map(([k, v]) => (
                <div
                  key={k}
                  style={{ display: "flex", gap: 6, fontSize: 9, color: GRAY, lineHeight: 1.5 }}
                >
                  <span style={{ color: CY, minWidth: 80, flexShrink: 0 }}>{k}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {typeof v === "object" ? JSON.stringify(v) : String(v)}
                  </span>
                </div>
              ))}
              {Object.keys(props).length > 10 && (
                <div style={{ color: GRAY, fontSize: 9 }}>… +{Object.keys(props).length - 10} more</div>
              )}
            </div>
          )}

          {links.length > 0 && (
            <div>
              <div style={{ color: GRAY, fontSize: 9, marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                links ({links.length})
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {links.slice(0, 6).map((lk, i) => (
                  <Chip
                    key={i}
                    label={`${lk.rel ?? "—"} → ${lk.target ?? "?"}`}
                    color={PU}
                  />
                ))}
                {links.length > 6 && (
                  <span style={{ color: GRAY, fontSize: 9 }}>+{links.length - 6}</span>
                )}
              </div>
            </div>
          )}

          {nbObjs.length > 0 && (
            <div>
              <div style={{ color: GRAY, fontSize: 9, marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                neighbors ({nbObjs.length})
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {nbObjs.slice(0, 5).map((n, i) => (
                  <Chip key={i} label={n.label ?? n.id ?? "?"} color={typeColor(n.type, allTypes)} />
                ))}
                {nbObjs.length > 5 && (
                  <span style={{ color: GRAY, fontSize: 9 }}>+{nbObjs.length - 5}</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TypeRow({ typeItem, total }) {
  const count = typeItem.count ?? 0;
  const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
  const label = typeItem.label ?? typeItem.id ?? "—";
  const color = TYPE_COLORS[(label.length + (typeItem.id ?? "").length) % TYPE_COLORS.length];

  return (
    <div
      style={{
        borderBottom: "1px solid rgba(41,231,255,0.07)",
        padding: "7px 10px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ color, fontSize: 11, fontFamily: "monospace", flex: 1 }}>{label}</span>
        <span style={{ color: GRAY, fontSize: 9 }}>{count} obj{count !== 1 ? "s" : ""}</span>
        <span style={{ color: GRAY, fontSize: 9 }}>{pct}%</span>
      </div>
      <div
        style={{
          background: `${color}18`,
          border: `1px solid ${color}33`,
          borderRadius: 3,
          height: 4,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: color,
            height: "100%",
            width: `${pct}%`,
            borderRadius: 3,
            transition: "width 0.4s ease",
          }}
        />
      </div>
      {typeItem.props && Object.keys(typeItem.props).length > 0 && (
        <div style={{ color: GRAY, fontSize: 8, marginTop: 3 }}>
          schema: {Object.keys(typeItem.props).join(", ")}
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function OntologyObjectBrowser() {
  const [open, setOpen]           = useState(false);
  const [typesData, setTypesData] = useState(null);
  const [objsData, setObjsData]   = useState(null);
  const [tab, setTab]             = useState("OBJECTS");
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch]       = useState("");
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState("");
  const typePollRef = useRef(null);

  const loadTypes = useCallback(async () => {
    try {
      const d = await fetchTypes();
      setTypesData(d);
    } catch { /* keep stale */ }
  }, []);

  const loadObjects = useCallback(async (type) => {
    try {
      const d = await fetchObjects(type || "");
      setObjsData(d);
    } catch { /* keep stale */ }
  }, []);

  useEffect(() => {
    loadTypes();
    typePollRef.current = setInterval(loadTypes, POLL_MS);
    return () => clearInterval(typePollRef.current);
  }, [loadTypes]);

  useEffect(() => {
    if (open) loadObjects(typeFilter);
  }, [open, typeFilter, loadObjects]);

  useEffect(() => {
    const toggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:onto-toggle", toggle);
    return () => window.removeEventListener("jarvis:onto-toggle", toggle);
  }, []);

  const types   = typesData?.items ?? [];
  const typeCnt = typesData?.count ?? types.length;
  const objects = objsData?.items ?? [];
  const objCnt  = objsData?.count ?? objects.length;

  const totalObjsFromTypes = types.reduce((sum, t) => sum + (t.count ?? 0), 0);

  const filteredObjects = objects.filter((o) => {
    if (!search) return true;
    const hay = `${o.id ?? ""} ${o.label ?? ""} ${o.type ?? ""}`.toLowerCase();
    return hay.includes(search.toLowerCase());
  });

  const filteredTypes = types.filter((t) => {
    if (!search) return true;
    const hay = `${t.id ?? ""} ${t.label ?? ""}`.toLowerCase();
    return hay.includes(search.toLowerCase());
  });

  async function assess() {
    setAssessing(true);
    setAssessText("");
    try {
      const script = await buildOntoScript();
      setAssessText(script);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch {
      setAssessText("Assessment unavailable.");
    }
    setAssessing(false);
  }

  const badgeVal = objCnt > 0 ? objCnt : typeCnt;
  const badgeColor = badgeVal > 0 ? GN : GRAY;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Ontology Object Browser"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: 161,
          background: "rgba(10,18,24,0.85)",
          border: `1px solid ${badgeColor}55`,
          borderRadius: 4,
          color: badgeColor,
          cursor: "pointer",
          fontFamily: "monospace",
          fontSize: 9,
          letterSpacing: "0.07em",
          padding: "3px 7px",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        ◈ ONTO
        {badgeVal > 0 && (
          <span
            style={{
              background: `${badgeColor}33`,
              border: `1px solid ${badgeColor}`,
              borderRadius: 3,
              color: badgeColor,
              fontSize: 8,
              padding: "0 3px",
            }}
          >
            {badgeVal}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        left: 8,
        bottom: 40,
        zIndex: 9201,
        background: "rgba(6,14,20,0.97)",
        border: `1px solid ${CY}33`,
        borderRadius: 10,
        boxShadow: `0 0 32px ${CY}18`,
        width: 480,
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
          ◈ ONTOLOGY BROWSER
        </span>
        {typeCnt > 0 && <Chip label={`${typeCnt} types`} color={PU} />}
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
        <StatTile label="objects"  value={objCnt}              color={objCnt > 0 ? CY : GRAY} />
        <StatTile label="types"    value={typeCnt}             color={typeCnt > 0 ? PU : GRAY} />
        <StatTile label="in-types" value={totalObjsFromTypes}  color={totalObjsFromTypes > 0 ? AM : GRAY} />
        <StatTile label="filtered" value={tab === "OBJECTS" ? filteredObjects.length : filteredTypes.length}
          color={GN} />
      </div>

      {/* type filter chips (OBJECTS tab) */}
      {tab === "OBJECTS" && types.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 4,
            padding: "0 12px 6px",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() => setTypeFilter("")}
            style={{
              background: typeFilter === "" ? `${CY}22` : "transparent",
              border: `1px solid ${typeFilter === "" ? CY : DIM}`,
              borderRadius: 3,
              color: typeFilter === "" ? CY : GRAY,
              cursor: "pointer",
              fontSize: 9,
              padding: "2px 6px",
              fontFamily: "monospace",
            }}
          >
            ALL
          </button>
          {types.slice(0, 8).map((t) => {
            const tId = t.id ?? t.label ?? "";
            const color = typeColor(tId, types);
            const active = typeFilter === tId;
            return (
              <button
                key={tId}
                onClick={() => setTypeFilter(active ? "" : tId)}
                style={{
                  background: active ? `${color}22` : "transparent",
                  border: `1px solid ${active ? color : DIM}`,
                  borderRadius: 3,
                  color: active ? color : GRAY,
                  cursor: "pointer",
                  fontSize: 9,
                  padding: "2px 6px",
                  fontFamily: "monospace",
                }}
              >
                {(t.label ?? tId).toUpperCase()}
                {t.count != null && (
                  <span style={{ color: GRAY, marginLeft: 3 }}>{t.count}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* tabs + search */}
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: "0 12px 8px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {[
          { key: "OBJECTS", count: objects.length },
          { key: "TYPES",   count: types.length   },
        ].map(({ key, count }) => (
          <TabBtn
            key={key}
            label={key}
            active={tab === key}
            count={count}
            onClick={() => setTab(key)}
          />
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tab === "TYPES" ? "search types…" : "search objects…"}
          style={{
            background: "rgba(41,231,255,0.05)",
            border: "1px solid rgba(41,231,255,0.15)",
            borderRadius: 4,
            color: CY,
            fontFamily: "monospace",
            fontSize: 10,
            outline: "none",
            padding: "3px 8px",
            flex: 1,
            minWidth: 100,
          }}
        />
      </div>

      {/* assess text */}
      {assessText && (
        <div
          style={{
            background: "rgba(41,231,255,0.06)",
            borderTop: `1px solid ${CY}22`,
            color: CY,
            fontSize: 10,
            lineHeight: 1.5,
            padding: "7px 12px",
          }}
        >
          {assessText}
        </div>
      )}

      {/* content area */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {tab === "OBJECTS" ? (
          objsData === null ? (
            <div style={{ color: GRAY, fontSize: 10, padding: "16px 12px", textAlign: "center" }}>
              Loading objects…
            </div>
          ) : filteredObjects.length === 0 ? (
            <div style={{ color: GRAY, fontSize: 10, padding: "16px 12px", textAlign: "center" }}>
              {objects.length === 0 ? "No objects in store." : "No objects match."}
            </div>
          ) : (
            filteredObjects.map((o) => (
              <ObjectRow key={o.id} obj={o} allTypes={types} />
            ))
          )
        ) : typesData === null ? (
          <div style={{ color: GRAY, fontSize: 10, padding: "16px 12px", textAlign: "center" }}>
            Loading types…
          </div>
        ) : filteredTypes.length === 0 ? (
          <div style={{ color: GRAY, fontSize: 10, padding: "16px 12px", textAlign: "center" }}>
            {types.length === 0 ? "No types registered." : "No types match."}
          </div>
        ) : (
          filteredTypes.map((t) => (
            <TypeRow key={t.id ?? t.label} typeItem={t} total={totalObjsFromTypes || objCnt} />
          ))
        )}
      </div>

      {/* footer */}
      <div
        style={{
          borderTop: `1px solid ${CY}22`,
          color: GRAY,
          fontSize: 9,
          padding: "5px 12px",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>
          {tab === "TYPES"
            ? `${filteredTypes.length}/${types.length} types`
            : `${filteredObjects.length}/${objects.length} objects${typeFilter ? ` · type: ${typeFilter}` : ""}`}
        </span>
        <span>poll 120 s · /v1/ontology</span>
      </div>
    </div>
  );
}
