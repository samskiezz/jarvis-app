/**
 * DeepHealthMonitor — F11
 * Dedicated full-page health dashboard from GET /v1/health/deep.
 * Polls every 30 s; shows per-component status cards, overall health score,
 * OK / DEGRADED / DOWN badge, and a snapshot of the last response.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { apiGet } from "@/lib/wave1";

const ACCENT = "#10b981";   // emerald — health green
const POLL_MS = 30_000;

// ── helpers ─────────────────────────────────────────────────────────────────

function toStatus(val) {
  if (val == null) return "unknown";
  if (typeof val === "boolean") return val ? "ok" : "down";
  if (typeof val === "string") {
    const s = val.toLowerCase().trim();
    if (/^(ok|up|healthy|pass|green|true)$/.test(s)) return "ok";
    if (/^(degraded|warn|partial)$/.test(s)) return "degraded";
    return "down";
  }
  if (typeof val === "object") {
    const inner = val.status ?? val.state ?? val.health ?? val.ok;
    return toStatus(inner);
  }
  return "unknown";
}

function statusColor(status) {
  return { ok: ACCENT, degraded: C.gold || "#f59e0b", down: C.red || "#ef4444", unknown: "#475569" }[status] || "#475569";
}

function statusLabel(status) {
  return { ok: "OK", degraded: "DEGRADED", down: "DOWN", unknown: "UNKNOWN" }[status] || "UNKNOWN";
}

function componentRows(data) {
  if (!data || typeof data !== "object") return [];
  return Object.entries(data)
    .filter(([k]) => !["status", "timestamp", "version", "uptime", "ok"].includes(k))
    .map(([name, val]) => ({
      name,
      status: toStatus(val),
      raw: typeof val === "object" ? JSON.stringify(val, null, 2) : String(val ?? ""),
    }));
}

// ── sub-components ───────────────────────────────────────────────────────────

function ComponentCard({ comp, expanded, onToggle }) {
  const col = statusColor(comp.status);
  const lbl = statusLabel(comp.status);
  return (
    <div style={{
      border: `1px solid ${col}44`,
      borderLeft: `3px solid ${col}`,
      borderRadius: 6,
      marginBottom: 8,
      background: expanded ? "rgba(255,255,255,0.025)" : "transparent",
      transition: "background 0.15s",
    }}>
      <button
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          width: "100%", padding: "10px 14px",
          background: "transparent", border: "none", cursor: "pointer",
          fontFamily: "'JetBrains Mono',monospace", textAlign: "left",
        }}
      >
        <span style={{ color: col, fontSize: 10, fontWeight: 700, minWidth: 72 }}>{lbl}</span>
        <span style={{ color: "#e2e8f0", fontSize: 13, flex: 1 }}>
          {comp.name.replace(/_/g, " ")}
        </span>
        <span style={{ color: "#475569", fontSize: 11 }}>{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div style={{
          padding: "0 14px 12px",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 11, color: "#94a3b8", whiteSpace: "pre-wrap", lineHeight: 1.6,
        }}>
          {comp.raw || "—"}
        </div>
      )}
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function DeepHealthMonitor() {
  const [probe, setProbe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [lastTs, setLastTs] = useState(null);
  const timerRef = useRef(null);

  const fetch = useCallback(async () => {
    try {
      const data = await apiGet("/v1/health/deep");
      setProbe(data);
      setLastTs(new Date().toLocaleTimeString());
      setError(null);
    } catch (e) {
      setError(e.message || "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
    timerRef.current = setInterval(fetch, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [fetch]);

  const comps = componentRows(probe);
  const okCount      = comps.filter(c => c.status === "ok").length;
  const degradedCount = comps.filter(c => c.status === "degraded").length;
  const downCount    = comps.filter(c => c.status === "down").length;
  const unknownCount = comps.filter(c => c.status === "unknown").length;

  const overallStatus =
    downCount > 0 ? "down" :
    degradedCount > 0 ? "degraded" :
    comps.length > 0 ? "ok" : "unknown";
  const overallCol = statusColor(overallStatus);

  const toggle = (name) =>
    setExpanded(prev => ({ ...prev, [name]: !prev[name] }));

  // Sort: down first, then degraded, then unknown, then ok
  const sorted = [...comps].sort((a, b) => {
    const order = { down: 0, degraded: 1, unknown: 2, ok: 3 };
    return (order[a.status] ?? 4) - (order[b.status] ?? 4);
  });

  const subtitle = lastTs ? `Last polled ${lastTs} · 30 s refresh` : "Connecting…";

  return (
    <PageShell
      title="Deep Health Monitor"
      subtitle={`Apollo · ${subtitle}`}
      accent={ACCENT}
      actions={
        <Badge color={overallCol}>{statusLabel(overallStatus)}</Badge>
      }
    >
      <DataState loading={loading} error={error} empty={!probe && !loading}>
        <Grid cols={4} style={{ marginBottom: 24 }}>
          <StatTile label="Components" value={comps.length} accent={ACCENT} />
          <StatTile label="OK" value={okCount} accent={ACCENT} />
          <StatTile label="Degraded" value={degradedCount} accent={C.gold || "#f59e0b"} />
          <StatTile label="Down" value={downCount} accent={C.red || "#ef4444"} />
        </Grid>

        {unknownCount > 0 && (
          <div style={{
            marginBottom: 12, padding: "6px 12px",
            background: "rgba(71,85,105,0.2)", borderRadius: 4,
            fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "#475569",
          }}>
            {unknownCount} component{unknownCount !== 1 ? "s" : ""} with unknown status
          </div>
        )}

        <PanelCard title="Component Health" accent={ACCENT}>
          {sorted.length === 0 ? (
            <div style={{ color: "#475569", fontSize: 12, padding: "12px 0" }}>
              No components reported
            </div>
          ) : (
            sorted.map(c => (
              <ComponentCard
                key={c.name}
                comp={c}
                expanded={!!expanded[c.name]}
                onToggle={() => toggle(c.name)}
              />
            ))
          )}
        </PanelCard>

        {probe?.timestamp || probe?.version || probe?.uptime ? (
          <PanelCard title="Probe Metadata" accent={ACCENT} style={{ marginTop: 16 }}>
            <div style={{
              fontFamily: "'JetBrains Mono',monospace", fontSize: 11,
              color: "#94a3b8", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 24px",
            }}>
              {probe.timestamp && <><span style={{ color: "#64748b" }}>timestamp</span><span>{probe.timestamp}</span></>}
              {probe.version   && <><span style={{ color: "#64748b" }}>version</span><span>{probe.version}</span></>}
              {probe.uptime    && <><span style={{ color: "#64748b" }}>uptime</span><span>{probe.uptime}</span></>}
            </div>
          </PanelCard>
        ) : null}
      </DataState>
    </PageShell>
  );
}
