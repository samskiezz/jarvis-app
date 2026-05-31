import { useCallback, useEffect, useState } from "react";
import { COLORS as C, earthquakeColor } from "@/domain/colors";
import { getLiveIntel } from "@/api/backendFunctions";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";

const ACCENT = C.neon;

export default function GlobalIntel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getLiveIntel({ type: "all" });
      setData(res || {});
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const earthquakes = Array.isArray(data?.earthquakes) ? data.earthquakes : [];
  const markets = Array.isArray(data?.markets) ? data.markets : [];
  const corpus = data?.corpus?.totals || {};
  const empty = !loading && !error && !earthquakes.length && !markets.length && !Object.keys(corpus).length;

  const fmtTime = (t) => {
    if (!t) return "—";
    const d = new Date(typeof t === "number" ? t : Date.parse(t));
    return Number.isNaN(d.getTime()) ? String(t) : d.toLocaleString();
  };

  return (
    <PageShell
      title="GLOBAL INTEL"
      subtitle="LIVE WORLD SIGNALS · SEISMIC · MARKETS · CORPUS"
      accent={ACCENT}
      actions={
        <button
          onClick={load}
          disabled={loading}
          style={{
            background: ACCENT + "1a", border: `1px solid ${ACCENT}55`, color: ACCENT,
            fontFamily: "inherit", fontSize: 10, letterSpacing: 2, padding: "7px 14px",
            borderRadius: 5, cursor: loading ? "wait" : "pointer", fontWeight: 700,
          }}
        >
          {loading ? "◌ SYNC" : "↻ REFRESH"}
        </button>
      }
    >
      <DataState loading={loading} error={error} empty={empty} emptyLabel="No live intel returned from feeds.">
        <Grid min={170} style={{ marginBottom: 14 }}>
          <StatTile label="Earthquakes" value={earthquakes.length} accent={C.orange} sub="USGS significant feed" />
          <StatTile label="Markets Tracked" value={markets.length} accent={C.gold} sub="live tickers" />
          <StatTile label="Corpus Emails" value={corpus.emails ?? "—"} accent={C.blue} />
          <StatTile label="Corpus Facts" value={corpus.facts ?? "—"} accent={ACCENT} sub={`${corpus.timeline ?? 0} timeline`} />
        </Grid>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "start" }}>
          <PanelCard title="SEISMIC ACTIVITY" accent={C.orange} right={<Badge color={C.orange}>{earthquakes.length}</Badge>}>
            {earthquakes.length === 0 ? (
              <div style={{ color: C.text, fontSize: 10, padding: 8 }}>No significant quakes on the feed.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                <thead>
                  <tr style={{ color: C.text, textAlign: "left" }}>
                    <th style={{ padding: "4px 6px", fontWeight: 600 }}>PLACE</th>
                    <th style={{ padding: "4px 6px", fontWeight: 600 }}>MAG</th>
                    <th style={{ padding: "4px 6px", fontWeight: 600 }}>TIME</th>
                  </tr>
                </thead>
                <tbody>
                  {earthquakes.slice(0, 40).map((q, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{ padding: "5px 6px", color: C.textB }}>{q.place || "—"}</td>
                      <td style={{ padding: "5px 6px", color: earthquakeColor(Number(q.mag)), fontWeight: 700 }}>
                        {Number(q.mag).toFixed(1)}
                      </td>
                      <td style={{ padding: "5px 6px", color: C.text }}>{fmtTime(q.time)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </PanelCard>

          <PanelCard title="LIVE MARKETS" accent={C.gold} right={<Badge color={C.gold}>{markets.length}</Badge>}>
            {markets.length === 0 ? (
              <div style={{ color: C.text, fontSize: 10, padding: 8 }}>No market data available.</div>
            ) : (
              <Grid min={130} gap={8}>
                {markets.map((m, i) => {
                  const ch = Number(m.change_pct);
                  const up = ch >= 0;
                  const col = up ? ACCENT : C.red;
                  return (
                    <div key={i} style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`, borderRadius: 5, padding: "9px 11px" }}>
                      <div style={{ fontSize: 9, color: C.text, letterSpacing: 1 }}>{m.display}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: C.textB, marginTop: 3 }}>{m.price}</div>
                      <div style={{ fontSize: 10, color: col, marginTop: 2, fontWeight: 700 }}>
                        {Number.isFinite(ch) ? `${up ? "▲" : "▼"} ${Math.abs(ch).toFixed(2)}%` : "—"}
                      </div>
                    </div>
                  );
                })}
              </Grid>
            )}
          </PanelCard>
        </div>
      </DataState>
    </PageShell>
  );
}
