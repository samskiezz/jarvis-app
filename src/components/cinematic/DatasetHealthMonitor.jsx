/**
 * DatasetHealthMonitor — F290.
 *
 * Dataset health panel: lists every catalog dataset, fetches health
 * checks in parallel (max 10 at a time), and shows a per-dataset badge.
 *
 *   List     — GET /v1/datasets → dataset catalog.
 *   Health   — GET /v1/datasets/{id}/health → status (ok/warn/fail),
 *              checks array, row_count, backed_by_series.
 *   Inspector— click any row → right-side drawer with all check details,
 *              quality metrics, last_updated.
 *   Header   — overall % healthy + counts.
 *   Pulse    — datasets with status "fail" (DOWN) pulse red border.
 *   ASSESS   — POST /v1/jarvis/agent/chat + TTS.
 *
 * Toggle: ◈ DSHLTMON  left:210200  bottom:8  zIndex:386
 * Event:  jarvis:dshltmon-toggle
 * Voice:  "dataset health / dshltmon / dataset health monitor /
 *          data health / dataset status / dataset quality"
 *
 * Exported for JarvisBrain: isDshltmonQuery
 * Mounted via src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

// ─── palette ──────────────────────────────────────────────────────────────────
const CY   = "#29E7FF";
const GN   = "#4ADE80";
const AM   = "#F5A623";
const RD   = "#F87171";
const GRAY = "#4E6070";
const SURF = "rgba(10,18,28,0.97)";
const BORD = "rgba(41,231,255,0.18)";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const BTN_LEFT  = 210200;
const PANEL_W   = 760;
const PANEL_H   = 580;
const MAX_PARALLEL = 10;

// ─── JarvisBrain export ───────────────────────────────────────────────────────
const DSHLTMON_RE =
  /\b(dataset\s+health\b|dshltmon\b|dataset\s+health\s+monitor\b|data\s+health\b|dataset\s+status\b|dataset\s+quality\b)\b/i;

export function isDshltmonQuery(q) {
  return DSHLTMON_RE.test(q || "");
}

// ─── status helpers ────────────────────────────────────────────────────────────
function apiStatusToLabel(s) {
  if (s === "ok")   return "HEALTHY";
  if (s === "warn") return "DEGRADED";
  if (s === "fail") return "DOWN";
  return "UNKNOWN";
}

function statusColor(s) {
  if (s === "ok")   return GN;
  if (s === "warn") return AM;
  if (s === "fail") return RD;
  return GRAY;
}

function statusBg(s) {
  if (s === "ok")   return "rgba(74,222,128,0.12)";
  if (s === "warn") return "rgba(245,166,35,0.12)";
  if (s === "fail") return "rgba(248,113,113,0.12)";
  return "rgba(78,96,112,0.12)";
}

// ─── fetch helpers ─────────────────────────────────────────────────────────────
async function fetchDatasets() {
  const r = await fetch(`${apiBase()}/v1/datasets`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`/v1/datasets ${r.status}`);
  const d = await r.json();
  const items = Array.isArray(d)         ? d
    : Array.isArray(d?.items)            ? d.items
    : Array.isArray(d?.data)             ? d.data
    : Array.isArray(d?.datasets)         ? d.datasets
    : Array.isArray(d?.results)          ? d.results
    : [];
  return items;
}

async function fetchHealth(datasetId) {
  try {
    const r = await fetch(`${apiBase()}/v1/datasets/${encodeURIComponent(datasetId)}/health`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!r.ok) return { dataset_id: datasetId, status: "fail", checks: [], found: false };
    return await r.json();
  } catch {
    return { dataset_id: datasetId, status: "fail", checks: [], found: false };
  }
}

async function fetchAssess(signal) {
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      message:
        "Summarise dataset health: which datasets are DEGRADED or DOWN, " +
        "what is the overall health score, and what immediate actions are needed?",
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
export default function DatasetHealthMonitor() {
  const [open, setOpen]         = useState(false);
  const [datasets, setDatasets] = useState([]);
  const [healthMap, setHealthMap] = useState({});
  const [loading, setLoading]   = useState(false);
  const [selected, setSelected] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");
  const abortRef = useRef(null);

  // toggle listener
  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("jarvis:dshltmon-toggle", handler);
    return () => window.removeEventListener("jarvis:dshltmon-toggle", handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setHealthMap({});
    setSelected(null);
    setAssessment("");
    try {
      const items = await fetchDatasets();
      setDatasets(items);

      // fetch health in parallel batches of MAX_PARALLEL
      const ids = items
        .slice(0, 30)
        .map((d) => d.id || d.name || d.dataset_name || d.dataset_id)
        .filter(Boolean);

      const results = {};
      for (let i = 0; i < ids.length; i += MAX_PARALLEL) {
        const batch = ids.slice(i, i + MAX_PARALLEL);
        const fetched = await Promise.all(batch.map((id) => fetchHealth(id)));
        fetched.forEach((h, idx) => {
          results[batch[idx]] = h;
        });
        setHealthMap((prev) => ({ ...prev, ...results }));
      }
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

  // overall score
  const dsWithId = datasets
    .slice(0, 30)
    .map((d) => ({ ...d, _id: d.id || d.name || d.dataset_name || d.dataset_id }))
    .filter((d) => d._id);

  const healthCount = dsWithId.filter((d) => healthMap[d._id]?.status === "ok").length;
  const totalFetched = dsWithId.filter((d) => healthMap[d._id]).length;
  const pct = totalFetched > 0 ? Math.round((healthCount / totalFetched) * 100) : null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Dataset Health Monitor"
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 386,
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
        ◈ DSHLTMON
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
          zIndex: 385,
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
          zIndex: 386,
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
          padding: "10px 14px", borderBottom: `1px solid ${BORD}`,
          flexShrink: 0,
        }}>
          <span style={{ color: CY, fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>
            ◈ DATASET HEALTH MONITOR
          </span>
          {pct !== null && (
            <span style={{
              marginLeft: "auto",
              color: pct >= 80 ? GN : pct >= 50 ? AM : RD,
              fontSize: 11,
              fontWeight: 700,
            }}>
              {pct}% HEALTHY ({healthCount}/{totalFetched})
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            style={{
              background: "none", border: `1px solid ${BORD}`, color: CY,
              fontSize: 10, padding: "2px 8px", borderRadius: 4, cursor: "pointer",
            }}
          >
            {loading ? "…" : "↺"}
          </button>
          <button
            onClick={handleAssess}
            disabled={assessing}
            style={{
              background: "none", border: `1px solid ${BORD}`, color: AM,
              fontSize: 10, padding: "2px 8px", borderRadius: 4, cursor: "pointer",
            }}
          >
            {assessing ? "…" : "ASSESS"}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "none", border: "none", color: GRAY,
              fontSize: 14, cursor: "pointer", lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* body */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* dataset list */}
          <div style={{
            width: selected ? "46%" : "100%",
            overflowY: "auto",
            borderRight: selected ? `1px solid ${BORD}` : "none",
            flexShrink: 0,
          }}>
            {loading && dsWithId.length === 0 && (
              <div style={{ color: GRAY, fontSize: 11, padding: "16px 14px" }}>
                Loading datasets…
              </div>
            )}
            {!loading && dsWithId.length === 0 && (
              <div style={{ color: GRAY, fontSize: 11, padding: "16px 14px" }}>
                No datasets in catalog.
              </div>
            )}
            {dsWithId.map((ds) => {
              const h = healthMap[ds._id];
              const status = h?.status ?? null;
              const label  = status ? apiStatusToLabel(status) : (loading ? "…" : "—");
              const isDown = status === "fail";
              return (
                <div
                  key={ds._id}
                  onClick={() => setSelected(ds._id === selected ? null : ds._id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 12px",
                    cursor: "pointer",
                    background: selected === ds._id ? "rgba(41,231,255,0.08)" : "transparent",
                    borderBottom: `1px solid rgba(41,231,255,0.07)`,
                    borderLeft: isDown
                      ? `3px solid ${RD}`
                      : `3px solid transparent`,
                    animation: isDown ? "dshlt-pulse 1.6s ease-in-out infinite" : "none",
                  }}
                >
                  <span style={{
                    display: "inline-block",
                    width: 8, height: 8, borderRadius: "50%",
                    background: status ? statusColor(status) : GRAY,
                    flexShrink: 0,
                  }} />
                  <span style={{ color: CY, fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ds.name || ds._id}
                  </span>
                  {ds.kind && (
                    <span style={{ color: GRAY, fontSize: 9, flexShrink: 0 }}>{ds.kind}</span>
                  )}
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
                    color: status ? statusColor(status) : GRAY,
                    background: status ? statusBg(status) : "transparent",
                    padding: "1px 5px", borderRadius: 3, flexShrink: 0,
                  }}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* inspector drawer */}
          {selected && (() => {
            const h = healthMap[selected];
            const ds = dsWithId.find((d) => d._id === selected);
            if (!h) return (
              <div style={{ flex: 1, padding: "16px 14px", color: GRAY, fontSize: 11 }}>
                Loading health…
              </div>
            );
            const rowCount = h.row_count ?? ds?.row_count ?? ds?.rows ?? "—";
            const lastUpdated = ds?.last_updated ?? ds?.freshness_ts ?? ds?.updated_at ?? null;
            const fmtDate = (t) => {
              if (!t) return "—";
              const d = new Date(typeof t === "number" ? t : Date.parse(t));
              if (Number.isNaN(d.getTime())) return String(t).slice(0, 19);
              return d.toISOString().slice(0, 19).replace("T", " ");
            };
            return (
              <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px" }}>
                <div style={{ color: CY, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                  {ds?.name || selected}
                </div>

                {/* summary row */}
                <div style={{ display: "flex", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
                  <Kv label="STATUS" value={apiStatusToLabel(h.status)} color={statusColor(h.status)} />
                  <Kv label="ROWS" value={rowCount !== "—" ? Number(rowCount).toLocaleString() : "—"} />
                  <Kv label="SERIES" value={h.backed_by_series ? "YES" : "NO"} />
                  <Kv label="UPDATED" value={fmtDate(lastUpdated)} />
                </div>

                {/* checks */}
                {h.checks?.length > 0 && (
                  <>
                    <div style={{ color: GRAY, fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                      QUALITY CHECKS
                    </div>
                    {h.checks.map((c, i) => (
                      <CheckRow key={i} check={c} />
                    ))}
                  </>
                )}

                {h.note && (
                  <div style={{ color: GRAY, fontSize: 10, marginTop: 8, fontStyle: "italic" }}>
                    {h.note}
                  </div>
                )}

                {/* schema props */}
                {ds?.owner && (
                  <div style={{ color: GRAY, fontSize: 10, marginTop: 8 }}>
                    Owner: <span style={{ color: CY }}>{ds.owner}</span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* assessment bar */}
        {assessment && (
          <div style={{
            padding: "8px 14px",
            borderTop: `1px solid ${BORD}`,
            color: AM,
            fontSize: 10,
            lineHeight: 1.5,
            flexShrink: 0,
            maxHeight: 72,
            overflowY: "auto",
          }}>
            {assessment}
          </div>
        )}
      </div>

      <style>{`
        @keyframes dshlt-pulse {
          0%, 100% { border-left-color: ${RD}; }
          50%       { border-left-color: rgba(248,113,113,0.2); }
        }
      `}</style>
    </>
  );
}

// ─── sub-components ────────────────────────────────────────────────────────────
function Kv({ label, value, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1 }}>{label}</span>
      <span style={{ color: color || "#29E7FF", fontSize: 11, fontWeight: 700 }}>{value ?? "—"}</span>
    </div>
  );
}

function CheckRow({ check }) {
  const s = check.status ?? "ok";
  const color = s === "ok" ? GN : s === "warn" ? AM : RD;
  const fmtVal = (v) => {
    if (v == null) return "—";
    if (typeof v === "number") return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(4);
    return String(v).slice(0, 40);
  };
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "4px 0",
      borderBottom: "1px solid rgba(41,231,255,0.06)",
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: "50%",
        background: color, display: "inline-block", flexShrink: 0,
      }} />
      <span style={{ color: "#29E7FF", fontSize: 10, flex: 1 }}>{check.name || check.check}</span>
      <span style={{ color, fontSize: 10, fontWeight: 700, width: 60, textAlign: "right" }}>
        {fmtVal(check.value)}
      </span>
      <span style={{ color: "#4E6070", fontSize: 9, width: 80, textAlign: "right" }}>
        {check.sla ? `SLA: ${String(check.sla).slice(0, 16)}` : ""}
      </span>
    </div>
  );
}
