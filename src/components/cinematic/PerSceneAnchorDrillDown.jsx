/**
 * PerSceneAnchorDrillDown — F17
 * Floating read-only panel that shows every anchor in the current scene,
 * fully expanded. Detects the active scene from window.location.pathname.
 * Fetches /v1/cinematic/scene/{id} on open and refreshes every 60 s.
 * Toggle: Ctrl/Cmd+Shift+A or jarvis:anchor-drill-toggle event.
 * Voice: "scene anchors" | "anchor drill" | "expand scene" | "scene detail".
 * Additive only — mounted in App.jsx; intent helpers imported into JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GN  = "#39FF14";
const AM  = "#F5A623";
const DIM = "#4A6070";
const BG  = "rgba(3,6,12,0.97)";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const SCENE_IDS = [
  "01_command_atrium",
  "02_ai_core_chamber",
  "03_world_control_room",
  "04_intelligence_graph_space",
  "05_operations_war_room",
  "06_data_fusion_reactor",
  "07_document_intelligence_vault",
  "08_simulation_theatre",
  "09_analytics_observatory",
  "10_system_security_core",
];

const SCENE_LABELS = {
  "01_command_atrium": "Command Atrium",
  "02_ai_core_chamber": "AI Core Chamber",
  "03_world_control_room": "World Control Room",
  "04_intelligence_graph_space": "Intelligence Graph Space",
  "05_operations_war_room": "Operations War Room",
  "06_data_fusion_reactor": "Data Fusion Reactor",
  "07_document_intelligence_vault": "Document Intelligence Vault",
  "08_simulation_theatre": "Simulation Theatre",
  "09_analytics_observatory": "Analytics Observatory",
  "10_system_security_core": "System Security Core",
};

const DRILL_RE = /\b(anchor[\s-]?drill|scene[\s-]?anchor|expand[\s-]?scene|scene[\s-]?detail|drill[\s-]?down|anchor[\s-]?detail|scene[\s-]?data)\b/i;

export function isAnchorDrillQuery(t) {
  return DRILL_RE.test(t || "");
}

function currentSceneId() {
  if (typeof window === "undefined") return null;
  const m = window.location.pathname.match(/\/scene\/([^/?#]+)/);
  if (m) return m[1];
  return null;
}

function formatValue(v) {
  if (v == null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return v.toLocaleString();
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    if (v.length === 0) return "[ ]";
    return v.map(item =>
      typeof item === "object" ? JSON.stringify(item) : String(item)
    ).join(" · ");
  }
  return JSON.stringify(v, null, 2);
}

function getValueColor(v) {
  if (v == null) return DIM;
  if (typeof v === "boolean") return v ? GN : "#FF4444";
  if (typeof v === "number") return GN;
  if (typeof v === "string" && (v.toLowerCase() === "online" || v.toLowerCase() === "active")) return GN;
  if (typeof v === "string" && (v.toLowerCase() === "offline" || v.toLowerCase() === "error")) return "#FF4444";
  return "#DCEBF5";
}

function AnchorRow({ name, value }) {
  const [expanded, setExpanded] = useState(false);
  const isComplex = typeof value === "object" && value !== null;
  const formatted = formatValue(value);
  const long = formatted.length > 80 || formatted.includes("\n");
  const label = name.split(".").slice(1).join(".").replace(/_/g, " ") || name;
  const zone  = name.split(".")[0];

  return (
    <div
      style={{
        borderBottom: `1px solid rgba(41,231,255,0.08)`,
        padding: "7px 0",
      }}
    >
      <div
        style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: (isComplex || long) ? "pointer" : "default" }}
        onClick={() => (isComplex || long) && setExpanded(v => !v)}
      >
        <span
          style={{
            fontSize: 8,
            letterSpacing: 1,
            color: CY,
            background: `${CY}14`,
            borderRadius: 3,
            padding: "1px 5px",
            flexShrink: 0,
            marginTop: 2,
            textTransform: "uppercase",
          }}
        >
          {zone}
        </span>
        <span
          style={{
            fontSize: 11,
            color: "#8A9BA8",
            letterSpacing: 0.5,
            flexShrink: 0,
            minWidth: 120,
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 11,
            color: getValueColor(value),
            fontFamily: "'JetBrains Mono',monospace",
            flex: 1,
            wordBreak: "break-word",
            overflow: "hidden",
          }}
        >
          {(isComplex || long) && !expanded
            ? (formatted.slice(0, 70) + "…")
            : (isComplex && expanded
                ? null
                : formatted)}
        </span>
        {(isComplex || long) && (
          <span style={{ fontSize: 10, color: DIM, flexShrink: 0 }}>
            {expanded ? "▴" : "▾"}
          </span>
        )}
      </div>
      {expanded && isComplex && (
        <pre
          style={{
            margin: "6px 0 0 40px",
            fontSize: 10,
            color: AM,
            background: "rgba(245,166,35,0.05)",
            border: `1px solid ${AM}22`,
            borderRadius: 6,
            padding: "8px 10px",
            overflowX: "auto",
            fontFamily: "'JetBrains Mono',monospace",
            lineHeight: 1.6,
          }}
        >
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
      {expanded && !isComplex && long && (
        <div
          style={{
            margin: "4px 0 0 40px",
            fontSize: 11,
            color: getValueColor(value),
            fontFamily: "'JetBrains Mono',monospace",
            wordBreak: "break-word",
          }}
        >
          {formatted}
        </div>
      )}
    </div>
  );
}

export default function PerSceneAnchorDrillDown() {
  const [open, setOpen]       = useState(false);
  const [sceneId, setSceneId] = useState(null);
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [lastFetch, setLastFetch] = useState(null);
  const pollRef = useRef(null);

  const load = useCallback(async (sid) => {
    if (!sid) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${apiBase()}/v1/cinematic/scene/${sid}`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      setData(json);
      setLastFetch(new Date().toLocaleTimeString());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const openDrill = useCallback(() => {
    const sid = currentSceneId() || SCENE_IDS[0];
    setSceneId(sid);
    setOpen(true);
    load(sid);
  }, [load]);

  // jarvis:anchor-drill-toggle event
  useEffect(() => {
    const h = () => setOpen(v => {
      if (!v) {
        const sid = currentSceneId() || SCENE_IDS[0];
        setSceneId(sid);
        load(sid);
        return true;
      }
      return false;
    });
    window.addEventListener("jarvis:anchor-drill-toggle", h);
    return () => window.removeEventListener("jarvis:anchor-drill-toggle", h);
  }, [load]);

  // Keyboard: Ctrl/Cmd+Shift+A
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        openDrill();
      }
      if (e.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, openDrill]);

  // 60 s auto-refresh while open
  useEffect(() => {
    if (open && sceneId) {
      pollRef.current = setInterval(() => load(sceneId), 60_000);
    }
    return () => clearInterval(pollRef.current);
  }, [open, sceneId, load]);

  // Scene picker re-fetch
  const switchScene = useCallback((sid) => {
    setSceneId(sid);
    setData(null);
    load(sid);
  }, [load]);

  if (!open) return null;

  const anchors = data?.anchors || {};
  const entries = Object.entries(anchors).filter(([k]) => !k.startsWith("_"));
  const health  = data?.health;

  return (
    <div
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        zIndex: 82,
        transform: "translate(-50%, -50%)",
        width: "min(680px, 95vw)",
        maxHeight: "min(80vh, 680px)",
        display: "flex",
        flexDirection: "column",
        background: BG,
        border: `1px solid ${CY}44`,
        borderRadius: 14,
        backdropFilter: "blur(18px)",
        boxShadow: `0 0 90px ${CY}18, 0 8px 60px rgba(0,0,0,0.7)`,
        fontFamily: "'JetBrains Mono',monospace",
        color: "#DCEBF5",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 16px",
          borderBottom: `1px solid ${CY}22`,
          flexShrink: 0,
        }}
      >
        <span style={{ color: CY, fontSize: 11, fontWeight: 700, letterSpacing: 3 }}>
          ◈ ANCHOR DRILL-DOWN
        </span>
        {loading && (
          <span style={{ fontSize: 9, color: DIM, letterSpacing: 1 }}>FETCHING…</span>
        )}
        {lastFetch && !loading && (
          <span style={{ fontSize: 9, color: DIM, letterSpacing: 1 }}>
            {entries.length} ANCHORS · {lastFetch}
          </span>
        )}
        {health && (
          <span style={{ fontSize: 9, color: DIM, letterSpacing: 1 }}>
            {health.filled}/{health.total} bound · {health.acquiring || 0} scraping
          </span>
        )}
        <button
          onClick={() => setOpen(false)}
          style={{
            marginLeft: "auto",
            background: "none",
            border: "none",
            color: DIM,
            cursor: "pointer",
            fontSize: 20,
            lineHeight: 1,
            padding: "0 2px",
          }}
        >
          ×
        </button>
      </div>

      {/* Scene picker */}
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: "8px 16px",
          overflowX: "auto",
          borderBottom: `1px solid ${CY}18`,
          flexShrink: 0,
        }}
      >
        {SCENE_IDS.map(sid => (
          <button
            key={sid}
            onClick={() => switchScene(sid)}
            style={{
              padding: "3px 8px",
              fontSize: 9,
              letterSpacing: 1,
              borderRadius: 5,
              border: `1px solid ${sid === sceneId ? CY : DIM + "66"}`,
              background: sid === sceneId ? `${CY}18` : "transparent",
              color: sid === sceneId ? CY : DIM,
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {SCENE_LABELS[sid] || sid}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ overflowY: "auto", flex: 1, padding: "4px 16px 12px" }}>
        {error && (
          <div style={{ color: "#FF4444", fontSize: 12, padding: "16px 0", textAlign: "center" }}>
            {error}
          </div>
        )}
        {!error && !loading && entries.length === 0 && (
          <div style={{ color: DIM, fontSize: 12, padding: "24px 0", textAlign: "center" }}>
            No anchor data returned for this scene
          </div>
        )}
        {entries.map(([k, v]) => (
          <AnchorRow key={k} name={k} value={v} />
        ))}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "6px 16px",
          borderTop: `1px solid ${CY}14`,
          fontSize: 9,
          color: "#2d4050",
          letterSpacing: 1,
          display: "flex",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <span>/v1/cinematic/scene/{sceneId} · 60 s refresh</span>
        <span>Ctrl+Shift+A · Esc to close · click complex values to expand</span>
      </div>
    </div>
  );
}
