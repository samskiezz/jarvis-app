/**
 * ConnectorRegistry — F301.
 *
 * Connector type catalog panel: lists every registered connector kind,
 * shows kind badge + adapter integration status, inspector drawer with
 * params schema + description.
 *
 *   Catalog  — GET /v1/connectors → {connectors: [...], transforms: [...]}
 *   Inspector— click any row → right-side drawer: description, params,
 *              adapter name, network flag.
 *   Header   — total count + INTEGRATED count.
 *   ASSESS   — POST /v1/jarvis/agent/chat + TTS.
 *
 * Toggle: ◈ CNCTRREG  left:216360  bottom:8  zIndex:397
 * Event:  jarvis:cnctrreg-toggle
 * Voice:  "connector registry / cnctrreg / connector catalog /
 *          connector types / source connectors / data connectors"
 *
 * Exported for JarvisBrain: isCnctrrQuery
 * Mounted via src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

// ─── palette ──────────────────────────────────────────────────────────────────
const CY   = "#29E7FF";
const GN   = "#4ADE80";
const AM   = "#F5A623";
const GRAY = "#4E6070";
const SURF = "rgba(10,18,28,0.97)";
const BORD = "rgba(41,231,255,0.18)";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const BTN_LEFT = 216360;
const PANEL_W  = 760;
const PANEL_H  = 580;

// ─── JarvisBrain export ───────────────────────────────────────────────────────
const CNCTRREG_RE =
  /\b(connector\s+registry\b|cnctrreg\b|connector\s+catalog\b|connector\s+types?\b|source\s+connectors?\b|data\s+connectors?\b)\b/i;

export function isCnctrrQuery(q) {
  return CNCTRREG_RE.test(q || "");
}

// ─── kind colour ──────────────────────────────────────────────────────────────
const KIND_COLOR = {
  crypto:  "#A78BFA",
  seismic: AM,
  fx:      GN,
  equity:  CY,
  generic: GRAY,
};

function kindColor(kind) {
  return KIND_COLOR[kind] || GRAY;
}

// ─── fetch helpers ─────────────────────────────────────────────────────────────
async function fetchCatalog() {
  const r = await fetch(`${apiBase()}/v1/connectors`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`/v1/connectors ${r.status}`);
  const d = await r.json();
  const connectors = Array.isArray(d?.connectors) ? d.connectors : [];
  const transforms = Array.isArray(d?.transforms) ? d.transforms : [];
  return { connectors, transforms };
}

async function fetchAssess(signal) {
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      message:
        "Summarise the registered source connectors: which kinds are available, " +
        "which have native adapters integrated vs generic HTTP, " +
        "and what data sources are missing or could be added?",
    }),
    signal,
  });
  if (!r.ok) throw new Error(`chat ${r.status}`);
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
}

// ─── TTS ───────────────────────────────────────────────────────────────────────
function speak(text) {
  if (!text) return;
  try {
    fetch(`${apiBase()}/v1/voice/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ text, voice: "onyx" }),
    })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = new Audio(url);
        a.onended = () => URL.revokeObjectURL(url);
        a.play().catch(() => {});
      })
      .catch(() => {});
  } catch {}
}

// ─── component ─────────────────────────────────────────────────────────────────
export default function ConnectorRegistry() {
  const [open, setOpen]           = useState(false);
  const [connectors, setConnectors] = useState([]);
  const [transforms, setTransforms] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [selected, setSelected]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");
  const abortRef = useRef(null);

  // toggle listener
  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("jarvis:cnctrreg-toggle", handler);
    return () => window.removeEventListener("jarvis:cnctrreg-toggle", handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setSelected(null);
    setAssessment("");
    try {
      const { connectors: c, transforms: t } = await fetchCatalog();
      setConnectors(c);
      setTransforms(t);
    } catch {
      // silently skip
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const handleAssess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    setAssessment("");
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const text = await fetchAssess(ctrl.signal);
      setAssessment(text);
      speak(text);
    } catch {
      setAssessment("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }, [assessing]);

  const integratedCount = connectors.filter((c) => c.adapter).length;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Connector Registry"
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 397,
          background: "rgba(10,18,28,0.82)",
          border: `1px solid ${BORD}`,
          color: CY,
          fontSize: 10,
          fontFamily: "monospace",
          padding: "3px 8px",
          borderRadius: 4,
          cursor: "pointer",
          letterSpacing: 1,
          whiteSpace: "nowrap",
        }}
      >
        ◈ CNCTRREG
      </button>
    );
  }

  return (
    <>
      {/* backdrop */}
      <div
        onClick={() => setOpen(false)}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          zIndex: 396,
        }}
      />

      {/* panel */}
      <div
        style={{
          position: "fixed",
          bottom: 40,
          left: Math.min(BTN_LEFT, window.innerWidth - PANEL_W - 16),
          width: PANEL_W,
          height: PANEL_H,
          background: SURF,
          border: `1.5px solid ${BORD}`,
          borderRadius: 10,
          zIndex: 397,
          display: "flex",
          flexDirection: "column",
          fontFamily: "monospace",
          overflow: "hidden",
          boxShadow: "0 8px 48px rgba(0,0,0,0.7)",
        }}
      >
        {/* header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px 8px",
          borderBottom: `1px solid ${BORD}`,
        }}>
          <span style={{ color: CY, fontSize: 11, fontWeight: 700, letterSpacing: 1.5 }}>
            ◈ CONNECTOR REGISTRY
          </span>
          <span style={{ color: GRAY, fontSize: 10, marginLeft: 4 }}>
            {loading
              ? "loading…"
              : `${connectors.length} connectors · ${integratedCount} integrated`}
          </span>
          <span style={{ flex: 1 }} />
          <button
            onClick={load}
            style={{
              background: "transparent", border: `1px solid ${BORD}`,
              color: CY, fontSize: 10, padding: "2px 8px", borderRadius: 3,
              cursor: "pointer",
            }}
          >
            REFRESH
          </button>
          <button
            onClick={handleAssess}
            disabled={assessing}
            style={{
              background: assessing ? "rgba(41,231,255,0.08)" : "transparent",
              border: `1px solid ${BORD}`,
              color: CY, fontSize: 10, padding: "2px 8px", borderRadius: 3,
              cursor: assessing ? "default" : "pointer",
            }}
          >
            {assessing ? "ASSESSING…" : "ASSESS"}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "transparent", border: "none",
              color: GRAY, fontSize: 14, cursor: "pointer", lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* assessment bar */}
        {assessment && (
          <div style={{
            padding: "6px 14px",
            borderBottom: `1px solid ${BORD}`,
            color: CY, fontSize: 10, lineHeight: 1.5,
            background: "rgba(41,231,255,0.04)",
          }}>
            {assessment}
          </div>
        )}

        {/* body */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

          {/* connector list */}
          <div style={{
            width: selected ? "55%" : "100%",
            overflowY: "auto",
            borderRight: selected ? `1px solid ${BORD}` : "none",
          }}>
            {loading && (
              <div style={{ color: GRAY, fontSize: 10, padding: 14 }}>
                Fetching connector catalog…
              </div>
            )}
            {!loading && connectors.length === 0 && (
              <div style={{ color: GRAY, fontSize: 10, padding: 14 }}>
                No connectors returned.
              </div>
            )}
            {connectors.map((c) => {
              const isIntegrated = Boolean(c.adapter);
              const isSel = selected?.connector === c.connector;
              return (
                <div
                  key={c.connector}
                  onClick={() => setSelected(isSel ? null : c)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "7px 14px",
                    borderBottom: `1px solid rgba(41,231,255,0.07)`,
                    cursor: "pointer",
                    background: isSel ? "rgba(41,231,255,0.07)" : "transparent",
                  }}
                >
                  {/* kind badge */}
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: 1,
                    color: kindColor(c.kind),
                    border: `1px solid ${kindColor(c.kind)}44`,
                    background: `${kindColor(c.kind)}14`,
                    padding: "1px 5px", borderRadius: 3,
                    minWidth: 54, textAlign: "center",
                  }}>
                    {(c.kind || "GENERIC").toUpperCase()}
                  </span>

                  {/* name */}
                  <span style={{ color: CY, fontSize: 11, flex: 1 }}>
                    {c.connector}
                  </span>

                  {/* integration badge */}
                  <span style={{
                    fontSize: 9, letterSpacing: 1,
                    color: isIntegrated ? GN : GRAY,
                    border: `1px solid ${isIntegrated ? GN : GRAY}44`,
                    padding: "1px 5px", borderRadius: 3,
                  }}>
                    {isIntegrated ? "INTEGRATED" : "GENERIC"}
                  </span>

                  {/* network indicator */}
                  {c.network && (
                    <span style={{ fontSize: 9, color: AM }}>NET</span>
                  )}
                </div>
              );
            })}

            {/* transforms count */}
            {!loading && transforms.length > 0 && (
              <div style={{
                padding: "8px 14px",
                color: GRAY, fontSize: 10,
                borderTop: `1px solid ${BORD}`,
              }}>
                {transforms.length} transform operations available
              </div>
            )}
          </div>

          {/* inspector drawer */}
          {selected && (
            <div style={{
              flex: 1, overflowY: "auto",
              padding: "10px 14px",
              display: "flex", flexDirection: "column", gap: 10,
            }}>
              <div style={{ color: CY, fontSize: 12, fontWeight: 700 }}>
                {selected.connector}
              </div>
              <div style={{ color: GRAY, fontSize: 10, lineHeight: 1.5 }}>
                {selected.description || "No description."}
              </div>

              {/* meta row */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={{
                  fontSize: 9, padding: "1px 6px", borderRadius: 3,
                  color: kindColor(selected.kind),
                  border: `1px solid ${kindColor(selected.kind)}44`,
                  background: `${kindColor(selected.kind)}14`,
                }}>
                  {(selected.kind || "generic").toUpperCase()}
                </span>
                {selected.adapter && (
                  <span style={{
                    fontSize: 9, padding: "1px 6px", borderRadius: 3,
                    color: GN, border: `1px solid ${GN}44`, background: `${GN}14`,
                  }}>
                    ADAPTER: {selected.adapter}
                  </span>
                )}
                {selected.network && (
                  <span style={{
                    fontSize: 9, padding: "1px 6px", borderRadius: 3,
                    color: AM, border: `1px solid ${AM}44`, background: `${AM}14`,
                  }}>
                    NETWORK REQUIRED
                  </span>
                )}
              </div>

              {/* params */}
              {selected.params && Object.keys(selected.params).length > 0 && (
                <div>
                  <div style={{ color: GRAY, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                    PARAMETERS
                  </div>
                  {Object.entries(selected.params).map(([key, def]) => (
                    <div key={key} style={{
                      padding: "5px 8px", marginBottom: 3,
                      background: "rgba(41,231,255,0.04)",
                      border: `1px solid ${BORD}`,
                      borderRadius: 4,
                    }}>
                      <span style={{ color: CY, fontSize: 10 }}>{key}</span>
                      {def?.default !== undefined && (
                        <span style={{ color: GRAY, fontSize: 9, marginLeft: 6 }}>
                          default: {String(def.default)}
                        </span>
                      )}
                      {def?.description && (
                        <div style={{ color: GRAY, fontSize: 9, marginTop: 2 }}>
                          {def.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => setSelected(null)}
                style={{
                  marginTop: "auto", background: "transparent",
                  border: `1px solid ${BORD}`, color: GRAY,
                  fontSize: 10, padding: "3px 8px", borderRadius: 3,
                  cursor: "pointer", alignSelf: "flex-start",
                }}
              >
                CLOSE
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
