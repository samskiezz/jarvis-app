/**
 * SceneAnchorDrillDown — F17
 * Per-scene anchor drill-down. Detects the active /cinematic/:sceneId from the
 * URL, fetches /v1/cinematic/scene/{id}, lists every anchor as a clickable row,
 * and expands the selected anchor into a full structured read-only detail view.
 * Toggle button at bottom-left (left: 908). Alt+A shortcut. Voice: "JARVIS, anchors".
 * Additive only — mounted via App.jsx; intent functions exported for JarvisBrain.
 */
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { fetchScene } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const GRN   = "#29F0A0";
const AMB   = "#FFB020";
const EDGE  = "rgba(41,231,255,0.35)";
const TEXT  = "#DCEBF5";
const MUTED = "#6E8AA0";

/* ── intent helpers exported for JarvisBrain ──────────────────────────── */
const ANCHOR_RE =
  /\b(anchor|anchor.detail|scene.anchor|anchor.data|drill.?down|show.anchor|scene.slot)/i;

export function isAnchorQuery(text) {
  return ANCHOR_RE.test(text || "");
}

export async function buildAnchorScript() {
  const match = window.location.pathname.match(/^\/cinematic\/([^/?]+)/);
  const sceneId = match ? match[1] : null;
  if (!sceneId) return "No active scene detected. Navigate to a cinematic scene first, sir.";
  try {
    const data = await fetchScene(sceneId);
    const anchors = Object.keys(data?.anchors || {}).filter((k) => !k.startsWith("_"));
    const health  = data?.health;
    const named   = anchors.slice(0, 5)
      .map((a) => a.split(".").slice(1).join(".").replace(/_/g, " "))
      .join(", ");
    return (
      `Scene ${sceneId.replace(/_/g, " ")} anchor report: ` +
      `${anchors.length} active data slots. ` +
      (health ? `${health.filled} of ${health.total} bound, ${health.acquiring || 0} still acquiring. ` : "") +
      `Active anchors include: ${named}` +
      (anchors.length > 5 ? ` and ${anchors.length - 5} more.` : ".")
    );
  } catch (_) {
    return "Unable to retrieve anchor data for the current scene, sir.";
  }
}

/* ── tiny recursive value renderer ───────────────────────────────────── */
function ValueView({ val, depth }) {
  const [open, setOpen] = useState(depth < 1);

  if (val == null)             return <span style={{ color: MUTED }}>null</span>;
  if (typeof val === "boolean") return <span style={{ color: AMB }}>{String(val)}</span>;
  if (typeof val === "number")  return <span style={{ color: GRN }}>{val.toLocaleString()}</span>;
  if (typeof val === "string")  return (
    <span style={{ color: TEXT, wordBreak: "break-all" }}>
      {val.length > 200 ? val.slice(0, 200) + "…" : val}
    </span>
  );

  if (Array.isArray(val)) {
    if (!val.length) return <span style={{ color: MUTED }}>[ ]</span>;
    return (
      <div>
        <span
          style={{ color: CY, cursor: "pointer", fontSize: 10, userSelect: "none" }}
          onClick={() => setOpen((o) => !o)}
        >
          [{open ? "−" : "+"} {val.length} items]
        </span>
        {open && (
          <div style={{ paddingLeft: 10, borderLeft: `1px solid ${EDGE}`, marginTop: 2 }}>
            {val.slice(0, 40).map((item, i) => (
              <div key={i} style={{ marginBottom: 2, fontSize: 10 }}>
                <span style={{ color: MUTED }}>{i}: </span>
                <ValueView val={item} depth={depth + 1} />
              </div>
            ))}
            {val.length > 40 && (
              <span style={{ color: MUTED, fontSize: 9 }}>…and {val.length - 40} more</span>
            )}
          </div>
        )}
      </div>
    );
  }

  const entries = Object.entries(val);
  if (!entries.length) return <span style={{ color: MUTED }}>{"{ }"}</span>;
  return (
    <div>
      <span
        style={{ color: CY, cursor: "pointer", fontSize: 10, userSelect: "none" }}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "▾" : "▸"} {entries.length} fields
      </span>
      {open && (
        <div style={{ paddingLeft: 10, borderLeft: `1px solid ${EDGE}`, marginTop: 2 }}>
          {entries.map(([k, v]) => (
            <div key={k} style={{ marginBottom: 3, fontSize: 10 }}>
              <span style={{ color: AMB }}>{k}: </span>
              <ValueView val={v} depth={depth + 1} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── single anchor row in the list ───────────────────────────────────── */
function AnchorRow({ name, value, active, onClick }) {
  const label = name.split(".").slice(1).join(".").replace(/_/g, " ");
  const zone  = name.split(".")[0];

  const acquiring = value && typeof value === "object" && value.status === "acquiring";

  const summary = (() => {
    if (value == null)  return "—";
    if (acquiring)      return `◌ scraping: ${value.topic}`;
    if (Array.isArray(value)) return `${value.length} items`;
    if (typeof value === "object") {
      if (value.control) return `control: ${value.control}`;
      const nums = Object.entries(value).filter(([, v]) => typeof v === "number");
      if (nums.length)
        return nums.slice(0, 3).map(([k, v]) => `${k}: ${v.toLocaleString()}`).join(" · ");
      return Object.keys(value).slice(0, 3).join(", ");
    }
    return String(value).slice(0, 60);
  })();

  return (
    <div
      onClick={onClick}
      style={{
        padding: "7px 10px",
        borderRadius: 5,
        cursor: "pointer",
        marginBottom: 3,
        background: active ? "rgba(41,231,255,0.10)" : "rgba(14,27,42,0.45)",
        border: `1px solid ${active ? CY : EDGE}`,
        transition: "border-color 0.15s",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: CY, letterSpacing: 1, textTransform: "uppercase" }}>
          {label}
        </span>
        <span style={{ fontSize: 8, color: MUTED, letterSpacing: 0.5, textTransform: "uppercase" }}>
          {zone}
        </span>
      </div>
      <div
        style={{
          fontSize: 10,
          color: acquiring ? AMB : MUTED,
          marginTop: 2,
          fontFamily: "'JetBrains Mono',monospace",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {summary}
      </div>
    </div>
  );
}

/* ── main component ───────────────────────────────────────────────────── */
export default function SceneAnchorDrillDown() {
  const location = useLocation();
  const [open,     setOpen]     = useState(false);
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [err,      setErr]      = useState(null);
  const [selected, setSelected] = useState(null);

  const match   = location.pathname.match(/^\/cinematic\/([^/?]+)/);
  const sceneId = match ? match[1] : null;
  const onScene = !!sceneId;

  // Fetch fresh scene data whenever the panel opens or the scene changes
  useEffect(() => {
    if (!open || !sceneId) return;
    let alive = true;
    setLoading(true);
    setErr(null);
    setSelected(null);
    fetchScene(sceneId)
      .then((d)  => { if (alive) { setData(d);       setLoading(false); } })
      .catch((e) => { if (alive) { setErr(String(e)); setLoading(false); } });
    return () => { alive = false; };
  }, [open, sceneId]);

  // Alt+A keyboard toggle (skip inputs)
  useEffect(() => {
    const handler = (e) => {
      if (e.altKey && e.key === "a" && !["INPUT", "TEXTAREA"].includes(e.target.tagName)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Voice intent listener — open panel when "JARVIS, anchors" detected
  useEffect(() => {
    const handler = (e) => {
      if (isAnchorQuery(e.detail?.text)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", handler);
    return () => window.removeEventListener("jarvis:ask", handler);
  }, []);

  if (!onScene) return null;

  const anchors      = Object.entries(data?.anchors || {}).filter(([k]) => !k.startsWith("_"));
  const selectedPair = selected != null ? anchors[selected] : null;
  const health       = data?.health;

  return (
    <>
      {/* ── toggle button ── */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Anchor drill-down (Alt+A)"
        style={{
          position: "fixed",
          left: 908,
          bottom: 18,
          zIndex: 68,
          background: open ? CY : "rgba(14,27,42,0.82)",
          color: open ? "#05080D" : CY,
          border: `1px solid ${CY}`,
          borderRadius: 5,
          padding: "4px 10px",
          fontSize: 10,
          letterSpacing: 1.5,
          cursor: "pointer",
          fontFamily: "'JetBrains Mono',monospace",
          textTransform: "uppercase",
        }}
      >
        ⚓ ANCHORS
      </button>

      {/* ── panel ── */}
      {open && (
        <div
          style={{
            position: "fixed",
            left: 18,
            bottom: 72,
            zIndex: 68,
            width: "min(460px,93vw)",
            maxHeight: "min(620px,78vh)",
            background: "rgba(5,8,13,0.96)",
            border: `1px solid ${EDGE}`,
            borderRadius: 8,
            backdropFilter: "blur(12px)",
            boxShadow: "0 0 40px rgba(41,231,255,0.12)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            fontFamily: "'JetBrains Mono',monospace",
          }}
        >
          {/* header */}
          <div
            style={{
              padding: "10px 14px",
              borderBottom: `1px solid ${EDGE}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            <div>
              <div style={{ color: CY, fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>
                ⚓ SCENE ANCHORS
              </div>
              <div style={{ color: MUTED, fontSize: 9, letterSpacing: 1, marginTop: 2 }}>
                {sceneId.replace(/_/g, " ")}
                {data   ? ` · ${anchors.length} anchors` : ""}
                {health ? ` · ${health.filled}/${health.total} bound` : ""}
                {health?.acquiring ? ` · ${health.acquiring} acquiring` : ""}
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 16 }}
            >
              ×
            </button>
          </div>

          {/* loading / error states */}
          {loading && (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: CY,
                fontSize: 11,
                letterSpacing: 1,
              }}
            >
              ◌ LOADING ANCHORS…
            </div>
          )}
          {err && (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#FF4438",
                fontSize: 10,
                padding: 16,
                textAlign: "center",
              }}
            >
              {err}
            </div>
          )}

          {/* body: list + detail pane */}
          {!loading && !err && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* anchor list */}
              <div
                style={{
                  flex: selectedPair ? "0 0 42%" : 1,
                  overflowY: "auto",
                  padding: "8px 10px",
                }}
              >
                {anchors.length === 0 && (
                  <div style={{ color: MUTED, fontSize: 10, textAlign: "center", paddingTop: 20 }}>
                    No anchors in this scene yet.
                  </div>
                )}
                {anchors.map(([k, v], i) => (
                  <AnchorRow
                    key={k}
                    name={k}
                    value={v}
                    active={selected === i}
                    onClick={() => setSelected(selected === i ? null : i)}
                  />
                ))}
              </div>

              {/* expanded detail */}
              {selectedPair && (
                <div
                  style={{
                    flex: 1,
                    borderTop: `1px solid ${EDGE}`,
                    overflowY: "auto",
                    padding: "10px 12px",
                  }}
                >
                  <div
                    style={{
                      color: CY,
                      fontSize: 10,
                      letterSpacing: 1.5,
                      textTransform: "uppercase",
                      marginBottom: 8,
                    }}
                  >
                    {selectedPair[0].replace(/_/g, " ")}
                  </div>
                  <div style={{ fontSize: 11, lineHeight: 1.6 }}>
                    <ValueView val={selectedPair[1]} depth={0} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
