/**
 * AnomalyRadar — live two-panel dashboard.
 *
 * Left:  /v1/jarvis/analytics/anomalies   — measurements with |z-score| > 2σ
 * Right: /v1/jarvis/analytics/top-objects — top PageRank objects in the graph
 *
 * Both panels auto-refresh every 30 s. Wires only to real endpoints in
 * server/routes/jarvis_analytics.py; no mocked data.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { apiGet } from "@/lib/wave1";
import { PageShell, PanelCard } from "@/components/PageKit";
import { Btn } from "@/components/Wave1Kit";

const ACCENT = C.red;
const REFRESH_MS = 30_000;

// ── Severity badge ────────────────────────────────────────────────────────────
function SevBadge({ severity }) {
  const color = severity === "high" ? C.red : C.orange;
  return (
    <span style={{
      fontSize: 8, fontWeight: 700, letterSpacing: 1.5,
      color, border: `1px solid ${color}`, borderRadius: 2,
      padding: "1px 5px", lineHeight: 1.6, textTransform: "uppercase",
    }}>
      {severity}
    </span>
  );
}

// ── Z-score bar (±4σ range, centered) ────────────────────────────────────────
function ZBar({ zscore }) {
  const pct = Math.min(100, (Math.abs(zscore) / 4) * 100);
  const color = Math.abs(zscore) > 3 ? C.red : C.orange;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 80, height: 5, background: "rgba(255,255,255,0.07)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 9, color: C.textB, fontVariantNumeric: "tabular-nums", minWidth: 40 }}>
        {zscore > 0 ? "+" : ""}{zscore.toFixed(2)}σ
      </span>
    </div>
  );
}

// ── PageRank bar (relative to max) ───────────────────────────────────────────
function RankBar({ score, max }) {
  const pct = max > 0 ? Math.min(100, (score / max) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 80, height: 5, background: "rgba(255,255,255,0.07)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: C.blue, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 9, color: C.textB, fontVariantNumeric: "tabular-nums", minWidth: 50 }}>
        {score.toFixed(4)}
      </span>
    </div>
  );
}

// ── Anomaly row ───────────────────────────────────────────────────────────────
function AnomalyRow({ item, idx }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "22px 1fr auto",
      alignItems: "start", gap: 10, padding: "8px 0",
      borderBottom: `1px solid ${C.border}`,
    }}>
      <span style={{ fontSize: 9, color: C.text, paddingTop: 2 }}>#{idx + 1}</span>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: C.textB, fontWeight: 600 }}>{item.metric}</span>
          <SevBadge severity={item.severity} />
        </div>
        <ZBar zscore={item.zscore} />
        <div style={{ marginTop: 4, fontSize: 9, color: C.text, display: "flex", gap: 14 }}>
          <span>latest <span style={{ color: C.textB }}>{item.latest}</span></span>
          <span>mean <span style={{ color: C.textB }}>{item.mean}</span></span>
          <span>σ <span style={{ color: C.textB }}>{item.std}</span></span>
        </div>
      </div>
    </div>
  );
}

// ── Top-object row ────────────────────────────────────────────────────────────
function TopObjRow({ item, idx, maxScore }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "22px 1fr auto",
      alignItems: "start", gap: 10, padding: "8px 0",
      borderBottom: `1px solid ${C.border}`,
    }}>
      <span style={{ fontSize: 9, color: C.text, paddingTop: 2 }}>#{idx + 1}</span>
      <div>
        <div style={{ fontSize: 10, color: C.textB, fontWeight: 600, marginBottom: 4 }}>
          {item.label}
        </div>
        <RankBar score={item.score} max={maxScore} />
        <div style={{ marginTop: 4, fontSize: 9, color: C.text }}>
          type: <span style={{ color: C.blue }}>{item.type}</span>
        </div>
      </div>
    </div>
  );
}

// ── Countdown indicator ───────────────────────────────────────────────────────
function Countdown({ nextMs }) {
  const [rem, setRem] = useState(0);
  useEffect(() => {
    const tick = () => setRem(Math.max(0, Math.round((nextMs - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextMs]);
  return <span style={{ fontSize: 9, color: C.text }}>next refresh in {rem}s</span>;
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AnomalyRadar() {
  const [anomalies, setAnomalies] = useState(null);
  const [topObjs, setTopObjs] = useState(null);
  const [aErr, setAErr] = useState(null);
  const [tErr, setTErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState(0);
  const nextMs = lastFetch + REFRESH_MS;
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [aRes, tRes] = await Promise.allSettled([
      apiGet("/v1/jarvis/analytics/anomalies?limit=20"),
      apiGet("/v1/jarvis/analytics/top-objects?kind=pagerank&limit=15"),
    ]);
    setAnomalies(aRes.status === "fulfilled" ? (aRes.value?.anomalies ?? []) : null);
    setAErr(aRes.status === "rejected" ? String(aRes.reason) : null);
    setTopObjs(tRes.status === "fulfilled" ? (tRes.value?.results ?? []) : null);
    setTErr(tRes.status === "rejected" ? String(tRes.reason) : null);
    setLastFetch(Date.now());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  const maxScore = topObjs ? Math.max(...topObjs.map((o) => o.score), 1e-9) : 1;
  const anomalyCount = anomalies?.length ?? 0;
  const highCount = anomalies?.filter((a) => a.severity === "high").length ?? 0;

  return (
    <PageShell
      title="ANOMALY RADAR"
      subtitle="LIVE STATISTICAL ANOMALY DETECTION · MEASUREMENT Z-SCORES · GRAPH PAGERANK"
      accent={ACCENT}
      actions={
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {lastFetch > 0 && <Countdown nextMs={nextMs} />}
          <Btn
            label={loading ? "REFRESHING…" : "REFRESH"}
            accent={ACCENT}
            onClick={load}
            disabled={loading}
          />
        </div>
      }
    >
      {/* Summary stat row */}
      <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
        {[
          { label: "ANOMALIES DETECTED", value: anomalies ? anomalyCount : "—", color: ACCENT },
          { label: "HIGH SEVERITY", value: anomalies ? highCount : "—", color: C.red },
          { label: "TOP OBJECTS RANKED", value: topObjs ? topObjs.length : "—", color: C.blue },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            flex: 1, padding: "12px 16px",
            background: "rgba(4,10,18,0.82)",
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            backdropFilter: "blur(12px)",
          }}>
            <div style={{ fontSize: 8, color: C.text, letterSpacing: 1.5, marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color, letterSpacing: 1 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

        {/* Left: Anomalies */}
        <PanelCard title="ANOMALOUS MEASUREMENTS" accent={ACCENT}>
          {aErr && (
            <div style={{ fontSize: 10, color: C.red, padding: "8px 0" }}>
              ⚠ {aErr}
            </div>
          )}
          {!aErr && anomalies === null && (
            <div style={{ fontSize: 10, color: C.text, padding: "8px 0" }}>Loading…</div>
          )}
          {!aErr && anomalies?.length === 0 && (
            <div style={{ fontSize: 10, color: C.text, padding: "8px 0" }}>
              No anomalies detected — all metrics within 2σ.
            </div>
          )}
          {anomalies?.map((item, idx) => (
            <AnomalyRow key={item.metric} item={item} idx={idx} />
          ))}
        </PanelCard>

        {/* Right: Top PageRank objects */}
        <PanelCard title="TOP PAGERANK OBJECTS" accent={C.blue}>
          {tErr && (
            <div style={{ fontSize: 10, color: C.red, padding: "8px 0" }}>
              ⚠ {tErr}
            </div>
          )}
          {!tErr && topObjs === null && (
            <div style={{ fontSize: 10, color: C.text, padding: "8px 0" }}>Loading…</div>
          )}
          {!tErr && topObjs?.length === 0 && (
            <div style={{ fontSize: 10, color: C.text, padding: "8px 0" }}>
              No scored objects found — run the graph compute job first.
            </div>
          )}
          {topObjs?.map((item, idx) => (
            <TopObjRow key={item.id} item={item} idx={idx} maxScore={maxScore} />
          ))}
        </PanelCard>

      </div>
    </PageShell>
  );
}
