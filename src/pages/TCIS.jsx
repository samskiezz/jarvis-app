import { useCallback, useEffect, useMemo, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { RiskSignal } from "@/api/entities";
import { getLiveIntel } from "@/api/backendFunctions";
import { LINKS, OBJECTS, findObjectById } from "@/domain/ontology";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";

const ACCENT = C.neon;

const KIND_COLOR = { seismic: C.orange, market: C.gold, risk: C.red, signal: C.blue };

const tms = (t) => {
  if (typeof t === "number") return t > 1e12 ? t : t * 1000;
  const p = Date.parse(t);
  return Number.isNaN(p) ? Date.now() : p;
};

// Compose short cause→effect hypotheses from the ontology link graph.
const buildHypotheses = () =>
  LINKS.map((l) => {
    const a = findObjectById(l.a);
    const b = findObjectById(l.b);
    return {
      id: `${l.a}-${l.b}`,
      cause: a?.label || l.a,
      effect: b?.label || l.b,
      relation: l.label,
      strength: l.strength,
      confidence: Math.min(0.99, 0.45 + l.strength * 0.17),
    };
  }).sort((x, y) => y.strength - x.strength);

export default function TCIS() {
  const [quakes, setQuakes] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [risks, setRisks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [intel, rs] = await Promise.all([
        getLiveIntel({ type: "all" }).catch(() => null),
        RiskSignal.list().catch(() => []),
      ]);
      setQuakes(Array.isArray(intel?.earthquakes) ? intel.earthquakes : []);
      setMarkets(Array.isArray(intel?.markets) ? intel.markets : []);
      setRisks(Array.isArray(rs) ? rs : []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Normalize all sources into time-stamped signals on one timeline.
  const events = useMemo(() => {
    const now = Date.now();
    const out = [];
    quakes.forEach((q, i) => out.push({
      id: `eq-${i}`, kind: "seismic", t: tms(q.time ?? now),
      label: `M${Number(q.mag ?? 0).toFixed(1)} ${q.place || "seismic event"}`,
      magnitude: Number(q.mag) || 0,
      detail: `lat ${q.lat ?? "—"}, lng ${q.lng ?? "—"}`,
    }));
    markets.forEach((m, i) => out.push({
      id: `mk-${i}`, kind: "market", t: now - i * 60_000,
      label: `${m.display || "ticker"} ${Number(m.change_pct) >= 0 ? "▲" : "▼"} ${Math.abs(Number(m.change_pct) || 0).toFixed(2)}%`,
      magnitude: Math.abs(Number(m.change_pct) || 0),
      detail: `price ${m.price ?? "—"}`,
    }));
    risks.forEach((r, i) => out.push({
      id: r.id || `rs-${i}`, kind: "risk",
      t: tms(r.created_date || r.timestamp || r.date || now),
      label: r.title || r.signal || r.name || "risk signal",
      magnitude: Number(r.severity) || Number(r.score) || 1,
      detail: r.description || r.level || r.category || "",
    }));
    return out.sort((a, b) => a.t - b.t);
  }, [quakes, markets, risks]);

  const span = useMemo(() => {
    if (!events.length) return { min: 0, max: 1 };
    const ts = events.map((e) => e.t);
    const min = Math.min(...ts);
    const max = Math.max(...ts);
    return { min, max: max === min ? min + 1 : max };
  }, [events]);

  const hypotheses = useMemo(() => buildHypotheses(), []);
  const pos = (t) => ((t - span.min) / (span.max - span.min)) * 100;
  const empty = !loading && !error && events.length === 0;

  return (
    <PageShell
      title="TCIS"
      subtitle="TEMPORAL CAUSAL INTELLIGENCE SYSTEM · SIGNAL TIMELINE × CAUSAL HYPOTHESES"
      accent={ACCENT}
      actions={
        <button onClick={load} disabled={loading} style={{
          background: ACCENT + "11", border: `1px solid ${ACCENT}55`, color: ACCENT, fontFamily: "inherit",
          fontSize: 10, letterSpacing: 2, padding: "7px 14px", borderRadius: 5, cursor: "pointer", fontWeight: 700,
        }}>{loading ? "◌ SYNC" : "↻ REFRESH"}</button>
      }
    >
      <Grid min={150} style={{ marginBottom: 14 }}>
        <StatTile label="Temporal Signals" value={events.length} accent={ACCENT} sub="on timeline" />
        <StatTile label="Seismic" value={quakes.length} accent={C.orange} />
        <StatTile label="Market" value={markets.length} accent={C.gold} />
        <StatTile label="Risk Signals" value={risks.length} accent={C.red} sub="RiskSignal entities" />
        <StatTile label="Causal Links" value={hypotheses.length} accent={C.purple} sub="hypotheses" />
      </Grid>

      <PanelCard title="SIGNAL TIMELINE" accent={ACCENT} style={{ marginBottom: 14 }}>
        <DataState loading={loading} error={error} empty={empty} emptyLabel="No live signals available — backend returned no intel.">
          <div style={{ display: "flex", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
            {Object.entries(KIND_COLOR).map(([k, col]) => (
              <span key={k} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 8, color: C.text, letterSpacing: 1 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: col }} />{k.toUpperCase()}
              </span>
            ))}
          </div>
          <div style={{ position: "relative", height: 130, margin: "6px 4px 0" }}>
            {/* axis */}
            <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: C.border }} />
            {events.map((e) => {
              const left = pos(e.t);
              const up = (e.kind === "seismic" || e.kind === "risk");
              const size = 7 + Math.min(10, e.magnitude * 1.6);
              const col = KIND_COLOR[e.kind] || C.text;
              const active = selected?.id === e.id;
              return (
                <button
                  key={e.id}
                  onClick={() => setSelected(e)}
                  title={e.label}
                  style={{
                    position: "absolute", left: `${left}%`, top: up ? "50%" : "50%",
                    transform: `translate(-50%, ${up ? "-100%" : "0%"})`,
                    background: "transparent", border: "none", cursor: "pointer", padding: 0,
                  }}
                >
                  <div style={{
                    width: 1, height: 24, background: col + "66",
                    margin: up ? "0 auto" : "0 auto", order: up ? 2 : 1,
                  }} />
                  <div style={{
                    width: size, height: size, borderRadius: "50%", margin: "0 auto",
                    background: col, boxShadow: active ? `0 0 10px ${col}` : "none",
                    border: active ? `2px solid ${C.textB}` : `1px solid ${col}`,
                  }} />
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: C.text, marginTop: 6 }}>
            <span>{new Date(span.min).toLocaleString()}</span>
            <span>TEMPORAL AXIS →</span>
            <span>{new Date(span.max).toLocaleString()}</span>
          </div>
        </DataState>
      </PanelCard>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px,1fr) minmax(300px,1.2fr)", gap: 14, alignItems: "start" }}>
        <PanelCard title="SELECTED SIGNAL" accent={selected ? (KIND_COLOR[selected.kind] || ACCENT) : ACCENT}>
          {!selected ? (
            <div style={{ color: C.text, fontSize: 10, padding: 8 }}>Click a node on the timeline to inspect a signal.</div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <Badge color={KIND_COLOR[selected.kind]}>{selected.kind}</Badge>
                <Badge color={C.text}>{new Date(selected.t).toLocaleString()}</Badge>
              </div>
              <div style={{ fontSize: 13, color: C.textB, fontWeight: 700, lineHeight: 1.4 }}>{selected.label}</div>
              <div style={{ fontSize: 10, color: C.text, marginTop: 8 }}>{selected.detail || "No further detail."}</div>
              <div style={{ fontSize: 9, color: KIND_COLOR[selected.kind], marginTop: 10 }}>
                magnitude {selected.magnitude.toFixed(2)}
              </div>
            </>
          )}
        </PanelCard>

        <PanelCard title="CAUSAL HYPOTHESES" accent={C.purple} right={<Badge color={C.purple}>{hypotheses.length}</Badge>}>
          <div style={{ display: "grid", gap: 6, maxHeight: 420, overflowY: "auto" }}>
            {hypotheses.map((h) => (
              <div key={h.id} style={{
                background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`, borderRadius: 5, padding: "8px 10px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 10, color: C.neon, fontWeight: 700 }}>{h.cause}</span>
                  <span style={{ fontSize: 9, color: C.purple }}>──{h.relation}──▶</span>
                  <span style={{ fontSize: 10, color: C.gold, fontWeight: 700, flex: 1 }}>{h.effect}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <div style={{ flex: 1, height: 4, background: "rgba(0,0,0,0.4)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${h.confidence * 100}%`, height: "100%", background: C.purple }} />
                  </div>
                  <span style={{ fontSize: 8, color: C.text }}>conf {Math.round(h.confidence * 100)}%</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 8, color: C.text, marginTop: 8 }}>
            Hypotheses derived from {OBJECTS.length} ontology entities · ranked by relation strength.
          </div>
        </PanelCard>
      </div>
    </PageShell>
  );
}
