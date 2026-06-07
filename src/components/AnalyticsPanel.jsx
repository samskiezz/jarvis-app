/**
 * AnalyticsPanel — billion-dollar data architecture visible in the UI.
 *
 * Fetches per-page analytics (influence, trending measurements, anomalies,
 * top objects) and renders them as a compact intelligence strip. Embeddable
 * in any page that wants advanced correlation."""
 */
import { useCallback, useEffect, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { apiGet } from "@/lib/wave1";

const ACCENT = C.neon;

function MiniSpark({ values, color = ACCENT, height = 24 }) {
  const nums = (values || []).filter((v) => Number.isFinite(v));
  if (nums.length < 2) return null;
  const W = 120;
  const max = Math.max(...nums.map(Math.abs), 1e-9);
  const step = W / (nums.length - 1);
  const y = (v) => height / 2 - (v / max) * (height / 2 - 2);
  const pts = nums.map((v, i) => `${i * step},${y(v)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width={W} height={height} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.2" />
    </svg>
  );
}

export default function AnalyticsPanel({ pageName, limit = 20, refreshMs = 30000 }) {
  const [state, setState] = useState({
    page: null,
    top: null,
    anomalies: null,
    loading: true,
  });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    const [page, top, anomalies] = await Promise.allSettled([
      apiGet(`/v1/jarvis/analytics/page/${encodeURIComponent(pageName)}`),
      apiGet(`/v1/jarvis/analytics/top-objects?kind=pagerank&limit=${limit}`),
      apiGet("/v1/jarvis/analytics/anomalies?limit=5"),
    ]);
    setState({
      loading: false,
      page: page.status === "fulfilled" ? page.value : null,
      pageErr: page.status === "rejected" ? page.reason : null,
      top: top.status === "fulfilled" ? top.value : null,
      anomalies: anomalies.status === "fulfilled" ? anomalies.value : null,
    });
  }, [pageName, limit]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!refreshMs) return;
    const id = setInterval(load, refreshMs);
    return () => clearInterval(id);
  }, [load, refreshMs]);

  const { page, top, anomalies, loading, pageErr } = state;
  const inf = page?.influence || {};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10,
      background: "rgba(0,0,0,0.25)", border: `1px solid ${C.border}`, borderRadius: 6, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 9, letterSpacing: 1.5, color: ACCENT, fontWeight: 700 }}>
          ◆ INTELLIGENCE
        </span>
        <span style={{ fontSize: 8, color: C.text }}>{pageName.toUpperCase()}</span>
        <div style={{ flex: 1 }} />
        <button onClick={load} disabled={loading}
          style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.text,
            fontSize: 8, letterSpacing: 1, padding: "2px 7px", borderRadius: 4, cursor: "pointer" }}>
          {loading ? "◌" : "↻"}
        </button>
      </div>

      {pageErr && (
        <div style={{ fontSize: 9, color: C.red }}>⚠ analytics unavailable</div>
      )}

      {/* Influence scores */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>PAGERANK</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: ACCENT }}>
            {(inf.pagerank || 0).toExponential(2)}
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>CENTRALITY</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.blue }}>
            {(inf.centrality || 0).toExponential(2)}
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>CONNECT</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.gold }}>
            {Math.round(inf.connectivity || 0)}
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>COMMUNITIES</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.purple }}>
            {page?.communities || 0}
          </div>
        </div>
      </div>

      {/* Anomalies */}
      {anomalies?.anomalies?.length > 0 && (
        <div>
          <div style={{ fontSize: 8, color: C.red, letterSpacing: 1, marginBottom: 4 }}>⚠ ANOMALIES</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {anomalies.anomalies.map((a) => (
              <div key={a.metric} style={{ display: "flex", alignItems: "center", gap: 8,
                background: C.red + "11", border: `1px solid ${C.red}33`, borderRadius: 4, padding: "4px 8px" }}>
                <span style={{ fontSize: 9, color: C.textB, fontWeight: 700 }}>{a.metric}</span>
                <span style={{ fontSize: 8, color: C.red }}>z={a.zscore}</span>
                <span style={{ fontSize: 8, color: C.text }}>latest={a.latest}</span>
                <span style={{ fontSize: 8, color: C.text }}>mean={a.mean}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top objects */}
      {top?.results?.length > 0 && (
        <div>
          <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, marginBottom: 4 }}>TOP OBJECTS (PAGERANK)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {top.results.slice(0, 5).map((o) => (
              <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 8, color: ACCENT, width: 60, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {o.type}
                </span>
                <span style={{ fontSize: 9, color: C.textB, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {o.label}
                </span>
                <span style={{ fontSize: 8, color: C.text, width: 50, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {o.score.toExponential(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
