/**
 * TemporalAnomalyDrawer — F58
 * Left-edge slide-in at 15% vertical.
 * Fetches GET /v1/history/series to list available time-series;
 * clicking a series loads GET /v1/temporal/patterns?series_id=X
 * to show z-score spike anomalies + rolling volatility.
 */
import { useEffect, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const ROSE = "#F43F5E";
const MONO = "'JetBrains Mono',monospace";

function relTime(ms) {
  if (!ms) return "—";
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function TemporalAnomalyDrawer() {
  const [open, setOpen] = useState(false);
  const [series, setSeries] = useState([]);
  const [selected, setSelected] = useState(null);
  const [patterns, setPatterns] = useState(null);
  const [loading, setLoading] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!open || loadedRef.current) return;
    loadedRef.current = true;
    kimiClient
      .request("/v1/history/series")
      .then((d) => setSeries(d?.items ?? []))
      .catch(() => {});
  }, [open]);

  function selectSeries(id) {
    setSelected(id);
    setPatterns(null);
    setLoading(true);
    kimiClient
      .request(`/v1/temporal/patterns?series_id=${encodeURIComponent(id)}`)
      .then((d) => { setPatterns(d); setLoading(false); })
      .catch(() => setLoading(false));
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Temporal Anomaly Scanner"
        style={{
          position: "fixed",
          left: 0,
          top: "15%",
          zIndex: 60,
          writingMode: "vertical-rl",
          background: `${ROSE}12`,
          border: `1px solid ${ROSE}44`,
          borderLeft: "none",
          borderRadius: "0 6px 6px 0",
          color: ROSE,
          cursor: "pointer",
          fontFamily: MONO,
          fontSize: 9,
          letterSpacing: 2,
          padding: "10px 5px",
        }}
      >
        △ ANOMALY
      </button>
    );
  }

  const anomalies = patterns?.anomalies ?? [];
  const volatility = patterns?.volatility ?? 0;
  const nAnomalies = patterns?.n_anomalies ?? anomalies.length;

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        bottom: 0,
        width: "min(380px, 88vw)",
        zIndex: 1000,
        background: "rgba(5,10,18,0.97)",
        backdropFilter: S.blur,
        WebkitBackdropFilter: S.blur,
        border: `1px solid ${ROSE}44`,
        borderLeft: "none",
        display: "flex",
        flexDirection: "column",
        fontFamily: MONO,
        boxShadow: `4px 0 32px ${ROSE}18`,
      }}
    >
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 14px",
        borderBottom: `1px solid ${ROSE}33`,
        flexShrink: 0,
      }}>
        <span style={{ color: ROSE, fontSize: 12 }}>△</span>
        <span style={{ color: ROSE, fontSize: 10, letterSpacing: 2, flex: 1 }}>TEMPORAL ANOMALIES</span>
        <button
          onClick={() => setOpen(false)}
          style={{ background: "transparent", border: "none", color: S.text, cursor: "pointer", fontSize: 16, lineHeight: 1 }}
        >
          ×
        </button>
      </div>

      {/* Series picker */}
      <div style={{ padding: "8px 14px", borderBottom: `1px solid ${ROSE}22`, flexShrink: 0 }}>
        <div style={{ color: S.text, fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
          SELECT SERIES ({series.length})
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, maxHeight: 90, overflowY: "auto" }}>
          {series.length === 0 && (
            <span style={{ color: S.text, fontSize: 10 }}>no series available</span>
          )}
          {series.map((s) => {
            const id = s.id || s.series_id || s.name;
            const label = s.name || id;
            const isSelected = selected === id;
            return (
              <button
                key={id}
                onClick={() => selectSeries(id)}
                style={{
                  background: isSelected ? `${ROSE}22` : "transparent",
                  border: `1px solid ${isSelected ? ROSE : S.border}`,
                  borderRadius: 4,
                  color: isSelected ? ROSE : S.textHi,
                  cursor: "pointer",
                  fontFamily: MONO,
                  fontSize: 9,
                  letterSpacing: 1,
                  padding: "3px 7px",
                  maxWidth: 160,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={label}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Patterns output */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 14px" }}>
        {!selected && (
          <div style={{ color: S.text, fontSize: 11, textAlign: "center", marginTop: 40 }}>
            Select a series above to scan for anomalies
          </div>
        )}
        {selected && loading && (
          <div style={{ color: S.text, fontSize: 11, textAlign: "center", marginTop: 40 }}>
            scanning…
          </div>
        )}
        {selected && !loading && patterns && (
          <>
            {/* Summary stats */}
            <div style={{ display: "flex", gap: 24, marginBottom: 12 }}>
              <div>
                <div style={{ color: S.text, fontSize: 9, letterSpacing: 1 }}>ANOMALIES</div>
                <div style={{ color: nAnomalies > 0 ? ROSE : S.textHi, fontSize: 20, fontWeight: 700 }}>
                  {nAnomalies}
                </div>
              </div>
              <div>
                <div style={{ color: S.text, fontSize: 9, letterSpacing: 1 }}>VOLATILITY</div>
                <div style={{ color: S.textHi, fontSize: 20, fontWeight: 700 }}>
                  {typeof volatility === "number" ? volatility.toFixed(3) : "—"}
                </div>
              </div>
            </div>

            {anomalies.length === 0 && (
              <div style={{ color: S.text, fontSize: 11, textAlign: "center", marginTop: 16 }}>
                No anomalies detected
              </div>
            )}

            {anomalies.map((a, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "5px 0",
                  borderBottom: `1px solid ${ROSE}11`,
                }}
              >
                <span style={{ color: a.kind === "spike_up" ? "#22C55E" : ROSE, fontSize: 11, width: 12, flexShrink: 0 }}>
                  {a.kind === "spike_up" ? "▲" : "▼"}
                </span>
                <span style={{ color: S.text, fontSize: 9, letterSpacing: 1, width: 28, flexShrink: 0 }}>
                  {relTime(a.t)}
                </span>
                <span style={{ color: S.textHi, fontSize: 10, flex: 1, fontVariantNumeric: "tabular-nums" }}>
                  {typeof a.value === "number" ? a.value.toFixed(3) : String(a.value)}
                </span>
                <span style={{
                  background: `${ROSE}18`,
                  border: `1px solid ${ROSE}44`,
                  borderRadius: 4,
                  color: ROSE,
                  fontSize: 9,
                  letterSpacing: 1,
                  padding: "1px 5px",
                  flexShrink: 0,
                }}>
                  z={typeof a.z === "number" ? a.z.toFixed(2) : String(a.z)}
                </span>
              </div>
            ))}
          </>
        )}
        {selected && !loading && !patterns && (
          <div style={{ color: S.text, fontSize: 11, textAlign: "center", marginTop: 40 }}>
            No data
          </div>
        )}
      </div>
    </div>
  );
}
