/**
 * OntologyActionAuditor — F283
 * ◈ ONTACT button: left 206280, bottom 8, zIndex 379
 * Toggle: window.dispatchEvent(new Event("jarvis:ontact-toggle"))
 * Voice triggers: "ontology auditor", "ontact", "object actions", "action audit", "ontology audit"
 * Data: GET /v1/ontology/objects/{id} | GET /v1/ontology/objects/{id}/actions
 * ASSESS: speaks about governance health + TTS via /v1/voice/tts
 */
import { useState, useEffect, useCallback } from "react";

const CY  = "#29E7FF";
const AM  = "#F5A623";
const GN  = "#4ADE80";
const RD  = "#F87171";
const PU  = "#A78BFA";
const SURF = "rgba(10,18,28,0.97)";
const BORD = "rgba(41,231,255,0.18)";

const BTN_LEFT = 206280;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function apiBase() {
  return (
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE) ||
    "http://localhost:8000"
  );
}

const ONTACT_RE =
  /\b(ontology\s+audit(?:or)?|ontact\b|object\s+actions?|action\s+audit|ontology\s+audit|governance\s+audit|audit\s+object)\b/i;

export function isOntactQuery(q) {
  return ONTACT_RE.test(q || "");
}

const ACTION_COLORS = {
  CREATE: GN,
  UPDATE: CY,
  DELETE: RD,
  LINK:   PU,
  UNLINK: AM,
  PATCH:  "#7C86FF",
};

function actionColor(type) {
  return ACTION_COLORS[(type || "").toUpperCase()] || CY;
}

function fmtTs(ts) {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return String(ts).slice(0, 19);
    return d.toISOString().slice(0, 19).replace("T", " ");
  } catch {
    return String(ts).slice(0, 19);
  }
}

async function speak(text) {
  try {
    const res = await fetch(`${apiBase()}/v1/voice/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    audio.play().catch(() => {});
  } catch {}
}

export default function OntologyActionAuditor() {
  const [open, setOpen]           = useState(false);
  const [objectId, setObjectId]   = useState("");
  const [inputVal, setInputVal]   = useState("");
  const [obj, setObj]             = useState(null);
  const [objErr, setObjErr]       = useState("");
  const [actions, setActions]     = useState([]);
  const [actErr, setActErr]       = useState("");
  const [loading, setLoading]     = useState(false);
  const [filterType, setFilterType] = useState("ALL");
  const [assessing, setAssessing] = useState(false);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:ontact-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ontact-toggle", onToggle);
  }, []);

  const loadObject = useCallback(async (id) => {
    if (!id.trim()) return;
    setLoading(true);
    setObj(null);
    setActions([]);
    setObjErr("");
    setActErr("");
    try {
      const res = await fetch(`${apiBase()}/v1/ontology/objects/${encodeURIComponent(id.trim())}`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!res.ok) {
        setObjErr(`Object not found (${res.status})`);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setObj(data);
    } catch (e) {
      setObjErr("Failed to load object");
    }

    try {
      const res2 = await fetch(
        `${apiBase()}/v1/ontology/objects/${encodeURIComponent(id.trim())}/actions?limit=200`,
        { headers: { Authorization: `Bearer ${API_KEY}` } }
      );
      if (!res2.ok) {
        setActErr(`Actions unavailable (${res2.status})`);
      } else {
        const d2 = await res2.json();
        const list = Array.isArray(d2)
          ? d2
          : Array.isArray(d2.items)
          ? d2.items
          : [];
        setActions(list);
      }
    } catch {
      setActErr("Failed to load actions");
    }
    setLoading(false);
  }, []);

  async function handleLoad() {
    const id = inputVal.trim();
    if (!id) return;
    setObjectId(id);
    await loadObject(id);
  }

  // Derived stats
  const actionTypes  = [...new Set(actions.map(a => (a.action_type || a.action || "UNKNOWN").toUpperCase()))];
  const filteredActs = filterType === "ALL"
    ? actions
    : actions.filter(a => (a.action_type || a.action || "").toUpperCase() === filterType);

  const actorCounts = actions.reduce((acc, a) => {
    const actor = a.actor || "unknown";
    acc[actor] = (acc[actor] || 0) + 1;
    return acc;
  }, {});
  const mostActiveActor = Object.entries(actorCounts).sort((a, b) => b[1] - a[1])[0];

  // Props display
  const propsEntries = obj
    ? Object.entries(obj).filter(([k]) => !["id", "links"].includes(k))
    : [];

  async function handleAssess() {
    if (assessing || !obj) return;
    setAssessing(true);
    try {
      const summary = `Object: ${obj.label || obj.id}, type: ${obj.type || "unknown"}, mark: ${obj.mark || "PUBLIC"}. Total actions: ${actions.length}. Most active actor: ${mostActiveActor ? mostActiveActor[0] + " (" + mostActiveActor[1] + " actions)" : "none"}.`;
      const res = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message: `Assess governance health for this ontology object: ${summary} Respond in 2 sentences.`,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        const text = d.response || d.content || d.text || "Assessment complete.";
        await speak(text);
      }
    } catch {}
    setAssessing(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 379,
          background: "rgba(10,18,28,0.88)",
          border: `1px solid ${BORD}`,
          color: CY,
          fontFamily: "monospace",
          fontSize: 11,
          padding: "3px 8px",
          borderRadius: 4,
          cursor: "pointer",
          letterSpacing: "0.05em",
        }}
      >
        ◈ ONTACT
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 44,
        left: BTN_LEFT - 200,
        width: 620,
        maxHeight: "70vh",
        background: SURF,
        border: `1px solid ${BORD}`,
        borderRadius: 8,
        zIndex: 379,
        display: "flex",
        flexDirection: "column",
        fontFamily: "monospace",
        fontSize: 12,
        color: "#cde",
        boxShadow: "0 4px 32px rgba(0,0,0,0.7)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: `1px solid ${BORD}`,
          flexShrink: 0,
        }}
      >
        <span style={{ color: CY, fontWeight: "bold", letterSpacing: "0.1em" }}>
          ◈ ONTOLOGY ACTION AUDITOR
        </span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {obj && (
            <span style={{ color: AM, fontSize: 11 }}>
              {actions.length} actions
              {mostActiveActor && ` · top: ${mostActiveActor[0]}`}
            </span>
          )}
          <button
            onClick={handleAssess}
            disabled={assessing || !obj}
            style={{
              background: assessing ? "#333" : "rgba(41,231,255,0.1)",
              border: `1px solid ${CY}`,
              color: CY,
              borderRadius: 4,
              padding: "2px 8px",
              cursor: obj ? "pointer" : "not-allowed",
              fontSize: 11,
            }}
          >
            {assessing ? "…" : "▶ ASSESS"}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "none",
              border: "none",
              color: "#888",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            ×
          </button>
        </div>
      </div>

      {/* Load Input */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px", borderBottom: `1px solid ${BORD}`, flexShrink: 0 }}>
        <input
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLoad()}
          placeholder="Enter object_id…"
          style={{
            flex: 1,
            background: "rgba(255,255,255,0.05)",
            border: `1px solid ${BORD}`,
            color: "#cde",
            borderRadius: 4,
            padding: "4px 8px",
            fontFamily: "monospace",
            fontSize: 12,
            outline: "none",
          }}
        />
        <button
          onClick={handleLoad}
          disabled={loading}
          style={{
            background: loading ? "#333" : "rgba(41,231,255,0.12)",
            border: `1px solid ${CY}`,
            color: CY,
            borderRadius: 4,
            padding: "4px 14px",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          {loading ? "…" : "Load"}
        </button>
      </div>

      {/* Error */}
      {(objErr) && (
        <div style={{ color: RD, padding: "6px 12px", fontSize: 11 }}>{objErr}</div>
      )}

      {/* Object Detail Panel */}
      {obj && (
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${BORD}`, flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <span style={{ color: CY, fontWeight: "bold", fontSize: 13 }}>
              {obj.label || obj.id}
            </span>
            {obj.type && (
              <span style={{ background: "rgba(41,231,255,0.1)", color: CY, borderRadius: 3, padding: "1px 6px", fontSize: 10 }}>
                {obj.type}
              </span>
            )}
            {obj.mark && (
              <span style={{
                background: obj.mark === "TOP_SECRET" ? "rgba(248,113,113,0.2)" : "rgba(245,166,35,0.12)",
                color: obj.mark === "TOP_SECRET" ? RD : AM,
                borderRadius: 3,
                padding: "1px 6px",
                fontSize: 10,
              }}>
                {obj.mark}
              </span>
            )}
          </div>
          {/* Props accordion */}
          {propsEntries.length > 0 && (
            <details style={{ marginTop: 4 }}>
              <summary style={{ cursor: "pointer", color: "#7a9", fontSize: 11, userSelect: "none" }}>
                Properties ({propsEntries.length})
              </summary>
              <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
                {propsEntries.map(([k, v]) => (
                  <span key={k} style={{ fontSize: 10, color: "#9ac", background: "rgba(255,255,255,0.04)", borderRadius: 3, padding: "1px 5px" }}>
                    <span style={{ color: CY }}>{k}</span>: {typeof v === "object" ? JSON.stringify(v) : String(v)}
                  </span>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Action Filter Bar */}
      {actions.length > 0 && (
        <div style={{ display: "flex", gap: 4, padding: "6px 12px", borderBottom: `1px solid ${BORD}`, flexWrap: "wrap", flexShrink: 0 }}>
          {["ALL", ...actionTypes].map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              style={{
                background: filterType === t ? "rgba(41,231,255,0.15)" : "transparent",
                border: `1px solid ${filterType === t ? CY : BORD}`,
                color: filterType === t ? CY : "#789",
                borderRadius: 3,
                padding: "2px 7px",
                cursor: "pointer",
                fontSize: 10,
              }}
            >
              {t}
              {t !== "ALL" && (
                <span style={{ marginLeft: 4, color: actionColor(t) }}>
                  {actions.filter((a) => (a.action_type || a.action || "").toUpperCase() === t).length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Action Log */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {actErr && <div style={{ color: RD, padding: "6px 12px", fontSize: 11 }}>{actErr}</div>}
        {!loading && objectId && actions.length === 0 && !actErr && (
          <div style={{ color: "#678", padding: "12px", textAlign: "center" }}>No actions recorded for this object.</div>
        )}
        {filteredActs.map((act, i) => {
          const atype = (act.action_type || act.action || "UNKNOWN").toUpperCase();
          const col = actionColor(atype);
          const before = act.before || act.before_props || null;
          const after  = act.after  || act.after_props  || null;
          return (
            <div
              key={i}
              style={{
                padding: "6px 12px",
                borderBottom: "1px solid rgba(41,231,255,0.06)",
                display: "flex",
                flexDirection: "column",
                gap: 3,
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ color: "#567", fontSize: 10, minWidth: 130 }}>
                  {fmtTs(act.ts || act.timestamp || act.created_at)}
                </span>
                <span style={{
                  background: `${col}22`,
                  color: col,
                  borderRadius: 3,
                  padding: "1px 6px",
                  fontSize: 10,
                  fontWeight: "bold",
                  minWidth: 50,
                  textAlign: "center",
                }}>
                  {atype}
                </span>
                <span style={{ color: "#9ab", fontSize: 11 }}>{act.actor || "unknown"}</span>
              </div>
              {/* Before/after diff chips */}
              {(before || after) && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingLeft: 8 }}>
                  {before && (
                    <span style={{ fontSize: 10, color: RD, background: "rgba(248,113,113,0.1)", borderRadius: 3, padding: "1px 5px" }}>
                      ← {typeof before === "object" ? JSON.stringify(before) : String(before)}
                    </span>
                  )}
                  {after && (
                    <span style={{ fontSize: 10, color: GN, background: "rgba(74,222,128,0.1)", borderRadius: 3, padding: "1px 5px" }}>
                      → {typeof after === "object" ? JSON.stringify(after) : String(after)}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Button */}
      <div style={{ padding: "4px 12px", borderTop: `1px solid ${BORD}`, flexShrink: 0 }}>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: "none",
            border: `1px solid ${BORD}`,
            color: "#567",
            borderRadius: 4,
            padding: "2px 10px",
            cursor: "pointer",
            fontSize: 11,
            width: "100%",
          }}
        >
          ◈ ONTACT
        </button>
      </div>
    </div>
  );
}
