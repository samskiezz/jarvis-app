import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { appParams } from "@/lib/app-params";
import { IntelProfile } from "@/api/entities";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";

const ACCENT = C.blue;
const POLL_MS = 15000;

const dot = (col, glow) => ({
  width: 9, height: 9, borderRadius: "50%", background: col,
  boxShadow: glow ? `0 0 8px ${col}` : "none", flexShrink: 0,
});

export default function SystemHealth() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);
  const timerRef = useRef(null);
  const mountedRef = useRef(true);

  const probe = useCallback(async () => {
    const headers = { "Content-Type": "application/json" };
    if (appParams.apiKey) headers.Authorization = `Bearer ${appParams.apiKey}`;

    const result = {
      apiUp: false,
      latencyMs: null,
      feeds: { earthquakes: false, markets: false, corpus: false },
      entityStore: false,
    };

    // 1. Probe getLiveIntel and time it.
    const t0 = performance.now();
    try {
      const res = await fetch(`${appParams.apiBaseUrl}/functions/getLiveIntel`, {
        method: "POST",
        headers,
        body: JSON.stringify({ type: "all" }),
      });
      result.latencyMs = Math.round(performance.now() - t0);
      result.apiUp = res.ok;
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const d = data?.data || data || {};
        result.feeds.earthquakes = Array.isArray(d.earthquakes) && d.earthquakes.length > 0;
        result.feeds.markets = Array.isArray(d.markets) && d.markets.length > 0;
        const totals = d?.corpus?.totals || {};
        result.feeds.corpus = Object.values(totals).some((v) => Number(v) > 0);
      }
    } catch {
      result.latencyMs = Math.round(performance.now() - t0);
      result.apiUp = false;
    }

    // 2. Probe the entity store independently.
    try {
      const profiles = await IntelProfile.list();
      result.entityStore = Array.isArray(profiles);
    } catch {
      result.entityStore = false;
    }

    if (!mountedRef.current) return;
    setHealth(result);
    setError(null);
    setUpdatedAt(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    probe();
    timerRef.current = setInterval(probe, POLL_MS);
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [probe]);

  const feedsOnline = health ? Object.values(health.feeds).filter(Boolean).length : 0;
  const feedsTotal = health ? Object.keys(health.feeds).length : 3;

  const latencyColor = (ms) => (ms == null ? C.text : ms < 400 ? C.neon : ms < 1500 ? C.gold : C.red);

  // Derived service rows (depends on the live probe result).
  const services = health
    ? [
        { label: "Backend API (getLiveIntel)", ok: health.apiUp, detail: health.latencyMs != null ? `${health.latencyMs} ms` : "no response" },
        { label: "Live Intel Feeds", ok: feedsOnline > 0, detail: `${feedsOnline}/${feedsTotal} feeds` },
        { label: "Earthquakes (USGS)", ok: health.feeds.earthquakes, detail: health.feeds.earthquakes ? "data present" : "no data" },
        { label: "Markets Tickers", ok: health.feeds.markets, detail: health.feeds.markets ? "data present" : "no data" },
        { label: "Corpus Index", ok: health.feeds.corpus, detail: health.feeds.corpus ? "indexed" : "empty" },
        { label: "Entity Store (IntelProfile)", ok: health.entityStore, detail: health.entityStore ? "reachable" : "unreachable" },
        { label: "Analyst / LLM Stream", ok: health.apiUp, detail: health.apiUp ? "endpoint reachable" : "endpoint down" },
      ]
    : [];

  return (
    <PageShell
      title="SYSTEM HEALTH"
      subtitle={`BACKEND PROBE · ${POLL_MS / 1000}s POLL · ${appParams.apiBaseUrl}`}
      accent={ACCENT}
      actions={
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>
            {updatedAt ? `CHECKED ${updatedAt.toLocaleTimeString()}` : "—"}
          </span>
          <button
            onClick={probe}
            style={{
              background: ACCENT + "1a", border: `1px solid ${ACCENT}55`, color: ACCENT,
              fontFamily: "inherit", fontSize: 10, letterSpacing: 2, padding: "7px 14px",
              borderRadius: 5, cursor: "pointer", fontWeight: 700,
            }}
          >↻ PROBE NOW</button>
        </div>
      }
    >
      <Grid min={170} style={{ marginBottom: 14 }}>
        <StatTile
          label="API Status"
          value={health?.apiUp ? "UP" : loading ? "…" : "DOWN"}
          accent={health?.apiUp ? C.neon : loading ? C.text : C.red}
          sub="getLiveIntel"
        />
        <StatTile
          label="API Latency"
          value={health?.latencyMs != null ? `${health.latencyMs} ms` : "—"}
          accent={latencyColor(health?.latencyMs)}
          sub="round-trip"
        />
        <StatTile
          label="Feeds Online"
          value={`${feedsOnline}/${feedsTotal}`}
          accent={feedsOnline === feedsTotal ? C.neon : feedsOnline > 0 ? C.gold : C.red}
          sub="earthquakes · markets · corpus"
        />
        <StatTile
          label="Entity Store"
          value={health?.entityStore ? "OK" : loading ? "…" : "ERR"}
          accent={health?.entityStore ? C.neon : loading ? C.text : C.red}
          sub="IntelProfile.list()"
        />
      </Grid>

      <PanelCard
        title="SERVICE HEALTH"
        accent={ACCENT}
        right={<Badge color={ACCENT}>{`${POLL_MS / 1000}s POLL`}</Badge>}
      >
        <DataState loading={loading && !health} error={error} empty={false}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {services.map((s) => {
              const col = s.ok ? C.neon : C.red;
              return (
                <div key={s.label} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "9px 12px",
                  background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`, borderRadius: 5,
                }}>
                  <span style={dot(col, s.ok)} />
                  <span style={{ flex: 1, color: C.textB, fontSize: 11, letterSpacing: 1 }}>{s.label}</span>
                  <span style={{ fontSize: 9, color: C.text }}>{s.detail}</span>
                  <Badge color={col}>{s.ok ? "HEALTHY" : "DEGRADED"}</Badge>
                </div>
              );
            })}
          </div>
        </DataState>
      </PanelCard>
    </PageShell>
  );
}
