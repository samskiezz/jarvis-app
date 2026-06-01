import { useCallback, useEffect, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { getLiveIntel } from "@/api/backendFunctions";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";

const ACCENT = C.blue;

// Map each known intel feed to a probe over the live snapshot.
const FEEDS = [
  { id: "earthquakes", label: "USGS Seismic", count: (d) => (Array.isArray(d?.earthquakes) ? d.earthquakes.length : 0) },
  { id: "markets", label: "Market Tickers", count: (d) => (Array.isArray(d?.markets) ? d.markets.length : 0) },
  { id: "corpus", label: "Corpus Index", count: (d) => {
    const t = d?.corpus?.totals || {};
    return Object.values(t).reduce((s, v) => s + (Number(v) || 0), 0);
  } },
  { id: "panopticon", label: "Panopticon", count: (d) => {
    const p = d?.panopticon;
    return Array.isArray(p) ? p.length : p ? Object.keys(p).length : 0;
  } },
  { id: "counterstrike", label: "Counterstrike", count: (d) => {
    const cs = d?.counterstrike;
    return Array.isArray(cs) ? cs.length : cs ? Object.keys(cs).length : 0;
  } },
];

export default function SystemIntel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await getLiveIntel({ type: "all" });
      setData(res || {});
      setUpdatedAt(new Date());
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll every 30s for a live feed-health view.
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const feeds = FEEDS.map((f) => ({ ...f, n: f.count(data) }));
  const live = feeds.filter((f) => f.n > 0).length;
  const totalSignals = feeds.reduce((s, f) => s + f.n, 0);
  const empty = !loading && !error && totalSignals === 0;

  return (
    <PageShell
      title="SYSTEM INTEL"
      subtitle="FEED HEALTH · SIGNAL THROUGHPUT · 30s POLL"
      accent={ACCENT}
      actions={
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>
            UPDATED {updatedAt ? updatedAt.toLocaleTimeString() : "—"}
          </span>
          <button
            onClick={load}
            style={{
              background: ACCENT + "1a", border: `1px solid ${ACCENT}55`, color: ACCENT,
              fontFamily: "inherit", fontSize: 10, letterSpacing: 2, padding: "7px 14px",
              borderRadius: 5, cursor: "pointer", fontWeight: 700,
            }}
          >↻ POLL</button>
        </div>
      }
    >
      <Grid min={170} style={{ marginBottom: 14 }}>
        <StatTile label="Feeds Online" value={`${live}/${feeds.length}`} accent={live === feeds.length ? C.neon : C.gold} />
        <StatTile label="Raw Signals" value={totalSignals} accent={ACCENT} />
        <StatTile label="Poll Interval" value="30s" accent={C.text} sub="auto-refresh" />
        <StatTile label="Last Sync" value={updatedAt ? updatedAt.toLocaleTimeString() : "—"} accent={C.gold} />
      </Grid>

      <PanelCard title="FEED STATUS BOARD" accent={ACCENT}>
        <DataState loading={loading && !data} error={error} empty={empty} emptyLabel="No feeds reporting signals.">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {feeds.map((f) => {
              const online = f.n > 0;
              const col = online ? C.neon : C.text;
              return (
                <div key={f.id} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "9px 12px",
                  background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`, borderRadius: 5,
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: col, boxShadow: online ? `0 0 8px ${col}` : "none", flexShrink: 0 }} />
                  <span style={{ flex: 1, color: C.textB, fontSize: 11, letterSpacing: 1 }}>{f.label}</span>
                  <span style={{ fontSize: 10, color: C.text }}>{f.n} signals</span>
                  <Badge color={col}>{online ? "ONLINE" : "IDLE"}</Badge>
                </div>
              );
            })}
          </div>
        </DataState>
      </PanelCard>
    </PageShell>
  );
}
