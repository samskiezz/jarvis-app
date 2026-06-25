import { useState, useEffect, useRef, useCallback } from "react";

const ACC = "#38BDF8"; // sky-blue
const POLL_MS = 2 * 60 * 1000;

const LAYER_LABELS = {
  capture: { label: "CAPTURE", hint: "OpenCV camera frame grab" },
  detect:  { label: "DETECT",  hint: "YOLO object detection"    },
  describe:{ label: "DESCRIBE",hint: "Claude vision narration"   },
};

function relAge(ts) {
  if (!ts) return "";
  const s = Math.floor(Date.now() / 1000) - ts;
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function LayerRow({ name, info }) {
  const meta = LAYER_LABELS[name] || { label: name.toUpperCase(), hint: "" };
  const ok = info?.available;
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 8,
      padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.06)",
    }}>
      <div style={{
        width: 8, height: 8, borderRadius: "50%", marginTop: 4, flexShrink: 0,
        background: ok ? "#22C55E" : "#EF4444",
        boxShadow: ok ? "0 0 6px #22C55E" : "none",
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: "monospace", fontSize: 11, color: ok ? ACC : "#94A3B8", letterSpacing: 1 }}>
            {meta.label}
          </span>
          <span style={{
            fontSize: 9, padding: "1px 5px", borderRadius: 3,
            background: ok ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
            color: ok ? "#22C55E" : "#EF4444",
            fontFamily: "monospace", letterSpacing: 1,
          }}>
            {ok ? "READY" : "UNAVAILABLE"}
          </span>
        </div>
        <div style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>{meta.hint}</div>
        {!ok && info?.reason && (
          <div style={{ fontSize: 9, color: "#94A3B8", marginTop: 3, fontFamily: "monospace", opacity: 0.8 }}>
            {info.reason}
          </div>
        )}
        {ok && name === "capture" && info?.default_camera_id !== undefined && (
          <div style={{ fontSize: 9, color: "#475569", marginTop: 2, fontFamily: "monospace" }}>
            cam id: {info.default_camera_id}
          </div>
        )}
        {ok && name === "detect" && info?.default_model && (
          <div style={{ fontSize: 9, color: "#475569", marginTop: 2, fontFamily: "monospace" }}>
            model: {info.default_model}
          </div>
        )}
        {ok && name === "describe" && info?.default_model && (
          <div style={{ fontSize: 9, color: "#475569", marginTop: 2, fontFamily: "monospace" }}>
            model: {info.default_model}
          </div>
        )}
      </div>
    </div>
  );
}

export default function VisionMonitorDrawer() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(null);
  const [statusErr, setStatusErr] = useState(null);
  const [statusAge, setStatusAge] = useState(null);
  const [detecting, setDetecting] = useState(false);
  const [detResult, setDetResult] = useState(null);
  const [detErr, setDetErr] = useState(null);
  const timerRef = useRef(null);

  const fetchStatus = useCallback(() => {
    fetch("/v1/vision/status")
      .then((r) => r.json())
      .then((d) => { setStatus(d); setStatusAge(d.ts || null); setStatusErr(null); })
      .catch((e) => setStatusErr(e.message));
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchStatus();
    timerRef.current = setInterval(fetchStatus, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetchStatus]);

  const detect = () => {
    setDetecting(true);
    setDetResult(null);
    setDetErr(null);
    fetch("/v1/vision/detect", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then((r) => r.json())
      .then((d) => { setDetResult(d); })
      .catch((e) => setDetErr(e.message))
      .finally(() => setDetecting(false));
  };

  const layers = status?.layers || {};
  const captureReady = layers.capture?.available;
  const detectReady = layers.detect?.available;

  return (
    <>
      {/* Tab */}
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed", right: open ? 320 : 0, top: "14%",
          zIndex: 220, cursor: "pointer",
          background: open ? ACC : "rgba(15,23,42,0.85)",
          border: `1px solid ${open ? ACC : "rgba(56,189,248,0.3)"}`,
          borderRight: open ? "none" : undefined,
          borderRadius: open ? "6px 0 0 6px" : "6px 0 0 6px",
          padding: "10px 5px", writingMode: "vertical-rl",
          fontFamily: "monospace", fontSize: 9, letterSpacing: 2,
          color: open ? "#0F172A" : ACC, fontWeight: 700,
          userSelect: "none", transition: "right 0.28s",
        }}
      >
        VISION {open ? "▶" : "◀"}
      </div>

      {/* Panel */}
      <div style={{
        position: "fixed", right: open ? 0 : -320, top: "10%",
        width: 320, maxHeight: "76vh", zIndex: 219,
        background: "rgba(8,12,24,0.97)",
        border: `1px solid rgba(56,189,248,0.25)`,
        borderRight: "none", borderRadius: "8px 0 0 8px",
        display: "flex", flexDirection: "column",
        transition: "right 0.28s ease",
        backdropFilter: "blur(12px)",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "10px 14px 8px", borderBottom: `1px solid rgba(56,189,248,0.2)`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div>
            <span style={{ fontFamily: "monospace", fontSize: 11, color: ACC, letterSpacing: 2, fontWeight: 700 }}>
              ◈ VISION SYSTEM
            </span>
            {statusAge && (
              <span style={{ fontSize: 9, color: "#475569", marginLeft: 8 }}>
                {relAge(statusAge)}
              </span>
            )}
          </div>
          <button
            onClick={fetchStatus}
            style={{
              background: "none", border: `1px solid rgba(56,189,248,0.3)`,
              color: ACC, borderRadius: 4, padding: "2px 8px",
              fontFamily: "monospace", fontSize: 9, cursor: "pointer",
            }}
          >
            ↻
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "10px 14px", overflowY: "auto", flex: 1 }}>
          {statusErr && (
            <div style={{ fontSize: 10, color: "#EF4444", fontFamily: "monospace", marginBottom: 8 }}>
              ERROR: {statusErr}
            </div>
          )}

          {!status && !statusErr && (
            <div style={{ fontSize: 10, color: "#475569", fontFamily: "monospace" }}>Loading…</div>
          )}

          {status && (
            <>
              <div style={{ marginBottom: 4 }}>
                {Object.entries(layers).map(([name, info]) => (
                  <LayerRow key={name} name={name} info={info} />
                ))}
              </div>

              {/* Detect Now button */}
              <div style={{ marginTop: 12, marginBottom: 4 }}>
                <button
                  onClick={detect}
                  disabled={detecting || !captureReady || !detectReady}
                  style={{
                    width: "100%", padding: "6px 0",
                    background: (captureReady && detectReady) ? `rgba(56,189,248,0.12)` : "rgba(71,85,105,0.2)",
                    border: `1px solid ${(captureReady && detectReady) ? ACC : "#334155"}`,
                    borderRadius: 4, color: (captureReady && detectReady) ? ACC : "#475569",
                    fontFamily: "monospace", fontSize: 10, letterSpacing: 1,
                    cursor: (captureReady && detectReady) ? "pointer" : "not-allowed",
                    transition: "opacity 0.2s",
                    opacity: detecting ? 0.6 : 1,
                  }}
                >
                  {detecting ? "⏳ DETECTING…" : "⊙ DETECT NOW"}
                </button>
                {(!captureReady || !detectReady) && (
                  <div style={{ fontSize: 9, color: "#475569", marginTop: 4, fontFamily: "monospace", textAlign: "center" }}>
                    Requires CAPTURE + DETECT layers
                  </div>
                )}
              </div>

              {/* Detection results */}
              {detErr && (
                <div style={{ fontSize: 10, color: "#EF4444", fontFamily: "monospace", marginTop: 8 }}>
                  DETECT ERROR: {detErr}
                </div>
              )}
              {detResult && (
                <div style={{ marginTop: 10 }}>
                  <div style={{
                    fontSize: 9, fontFamily: "monospace", letterSpacing: 1,
                    color: "#64748B", marginBottom: 6, textTransform: "uppercase",
                  }}>
                    {detResult.ok
                      ? `▸ ${detResult.detections?.length ?? 0} object(s) via ${detResult.model || "yolo"}`
                      : `▸ DETECT FAILED`}
                  </div>
                  {detResult.ok && (detResult.detections || []).length === 0 && (
                    <div style={{ fontSize: 10, color: "#475569", fontFamily: "monospace" }}>No objects detected</div>
                  )}
                  {detResult.ok && (detResult.detections || []).map((d, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.05)",
                    }}>
                      <span style={{
                        fontSize: 9, padding: "1px 5px", borderRadius: 3,
                        background: "rgba(56,189,248,0.15)", color: ACC,
                        fontFamily: "monospace", letterSpacing: 1,
                      }}>
                        {(d.class || d.name || "OBJ").toUpperCase()}
                      </span>
                      <span style={{ fontSize: 10, color: "#94A3B8", fontFamily: "monospace" }}>
                        {d.confidence !== undefined ? `${(d.confidence * 100).toFixed(0)}%` : ""}
                      </span>
                    </div>
                  ))}
                  {!detResult.ok && detResult.error && (
                    <div style={{ fontSize: 9, color: "#94A3B8", fontFamily: "monospace" }}>
                      {detResult.error}
                    </div>
                  )}
                  {detResult.shape && (
                    <div style={{ fontSize: 9, color: "#334155", fontFamily: "monospace", marginTop: 6 }}>
                      frame: {detResult.shape.join("×")}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
