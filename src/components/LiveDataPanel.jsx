/**
 * LiveDataPanel — fetches real-time topic-mapped data for the current page.
 *
 * GETs /v1/jarvis/page-data/{pageName} every 30s and renders:
 *   • Measurements (weather, air quality, crypto, etc.)
 *   • Events (earthquakes, weather alerts, etc.)
 *   • Assets (flights, etc.)
 *   • Places (cities with geo)
 *   • Documents (recently scraped)
 *
 * Minimal, theme-consistent, never breaks the layout.
 */
import { useState, useEffect, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { appParams } from "@/lib/app-params";

const API_BASE = appParams.apiBaseUrl || "";

const fmt = (v) =>
  typeof v === "number"
    ? Math.abs(v) >= 1e6
      ? v.toExponential(2)
      : Number(v.toPrecision(4)).toString()
    : String(v ?? "—");

const cardStyle = {
  background: "rgba(0,0,0,0.35)",
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  padding: "8px 10px",
  fontSize: 10,
  color: C.textB,
};

const headerStyle = {
  fontSize: 9,
  textTransform: "uppercase",
  letterSpacing: 1,
  color: C.text,
  marginBottom: 6,
  borderBottom: `1px solid ${C.border}`,
  paddingBottom: 4,
};

function MeasurementCard({ m }) {
  const p = m.props || {};
  return (
    <div style={{ ...cardStyle, marginBottom: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 600, color: C.cyan }}>{p.metric || p.label || m.id}</span>
        <span style={{ fontSize: 8, color: C.text }}>{p.source || "—"}</span>
      </div>
      <div style={{ marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
        <span style={{ fontSize: 14, color: C.textB }}>{fmt(p.value)}</span>
        <span style={{ fontSize: 9, color: C.text, marginLeft: 4 }}>{p.unit || ""}</span>
      </div>
      {p.city_id && (
        <div style={{ fontSize: 8, color: C.text, marginTop: 2 }}>
          {p.city_id.replace(/city:/g, "").replace(/_/g, " ")}
        </div>
      )}
    </div>
  );
}

function EventCard({ e }) {
  const p = e.props || {};
  return (
    <div style={{ ...cardStyle, marginBottom: 4, borderLeft: `3px solid ${C.red}` }}>
      <div style={{ fontWeight: 600, color: C.red }}>{p.label || p.event || e.id}</div>
      <div style={{ fontSize: 8, color: C.text, marginTop: 2 }}>
        {p.place || p.area || ""} {p.severity ? `· ${p.severity}` : ""}
      </div>
      {p.magnitude !== undefined && (
        <div style={{ fontSize: 12, marginTop: 2 }}>M {fmt(p.magnitude)}</div>
      )}
    </div>
  );
}

function AssetCard({ a }) {
  const p = a.props || {};
  return (
    <div style={{ ...cardStyle, marginBottom: 4, borderLeft: `3px solid ${C.green}` }}>
      <div style={{ fontWeight: 600, color: C.green }}>{p.label || p.callsign || a.id}</div>
      <div style={{ fontSize: 8, color: C.text }}>
        {p.origin_country || ""} {p.altitude_m ? `· ${fmt(p.altitude_m)}m` : ""} {p.velocity_m_s ? `· ${fmt(p.velocity_m_s)}m/s` : ""}
      </div>
    </div>
  );
}

export default function LiveDataPanel({ pageName, limit = 50, refreshMs = 30000 }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/v1/jarvis/page-data/${encodeURIComponent(pageName)}?limit=${limit}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = await r.json();
      setData(body);
      setError(null);
      setLastFetch(Date.now());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [pageName, limit]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const id = setInterval(fetchData, refreshMs);
    return () => clearInterval(id);
  }, [fetchData, refreshMs]);

  if (loading && !data) {
    return (
      <div style={{ padding: 12, fontSize: 10, color: C.text }}>
        ◌ Loading live data…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={{ padding: 12, fontSize: 10, color: C.red }}>
        ⚠ {error}
      </div>
    );
  }

  const measurements = (data?.measurements || []).filter((m) => m.type === "Measurement");
  const events = (data?.events || []).filter((e) => e.type === "Event");
  const assets = (data?.assets || []).filter((a) => a.type === "Asset");
  const places = data?.places || [];
  const topics = data?.topics || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: C.cyan }}>
          Live Data · {pageName}
        </span>
        <span style={{ fontSize: 8, color: C.text }}>
          {data?.mapped_topics || 0} topics · {measurements.length} measurements · {events.length} events · {assets.length} assets
          {lastFetch ? ` · refreshed ${Math.round((Date.now() - lastFetch) / 1000)}s ago` : ""}
        </span>
      </div>

      {measurements.length > 0 && (
        <div>
          <div style={headerStyle}>Measurements ({measurements.length})</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 6 }}>
            {measurements.slice(0, 12).map((m) => (
              <MeasurementCard key={m.id} m={m} />
            ))}
          </div>
        </div>
      )}

      {events.length > 0 && (
        <div>
          <div style={headerStyle}>Events ({events.length})</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 6 }}>
            {events.slice(0, 8).map((e) => (
              <EventCard key={e.id} e={e} />
            ))}
          </div>
        </div>
      )}

      {assets.length > 0 && (
        <div>
          <div style={headerStyle}>Assets ({assets.length})</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 6 }}>
            {assets.slice(0, 8).map((a) => (
              <AssetCard key={a.id} a={a} />
            ))}
          </div>
        </div>
      )}

      {places.length > 0 && (
        <div>
          <div style={headerStyle}>Places ({places.length})</div>
          <div style={{ fontSize: 8, color: C.text, lineHeight: 1.6 }}>
            {places.slice(0, 20).map((p) => {
              const props = p.props || {};
              return `${props.label || p.id} (${props.type || ""})`;
            }).join(" · ")}
          </div>
        </div>
      )}

      {topics.length > 0 && (
        <div>
          <div style={headerStyle}>Topics ({topics.length})</div>
          <div style={{ fontSize: 8, color: C.text, lineHeight: 1.6 }}>
            {topics.slice(0, 15).map((t) => {
              const props = t.props || {};
              return `${props.topic_name || t.id} (P${props.priority || "?"})`;
            }).join(" · ")}
          </div>
        </div>
      )}
    </div>
  );
}
