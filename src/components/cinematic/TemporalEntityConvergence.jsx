/**
 * TemporalEntityConvergence — F91 (TECVIEW).
 *
 * Groups entity events by hour over the last 24 hours to surface operational
 * surges and convergence windows.
 *
 * Data sources (real endpoints only):
 *   /entities/Task          — task creation/update timestamps
 *   /entities/RiskSignal    — risk signal timestamps
 *   /v1/ops/alerts          — ops alert timestamps
 *   /v1/investigations      — investigation open timestamps
 *
 * Displays:
 *   24-column heatmap — event density per hour, colour-coded by peak severity
 *   Stat tiles: TOTAL EVENTS / PEAK HOUR / ENTITY TYPES / SURGE WINDOWS
 *   Surge window = any hour where ≥3 entity types have ≥1 event
 *   Scrollable event list sorted by timestamp desc
 *   Filter tabs: ALL / TASK / RISK / ALERT / INVESTIGATION
 *
 * ▶ ASSESS → /v1/jarvis/agent/chat (2-sentence assessment) + TTS
 * ◈ TECVIEW button at left:970800, bottom:8, zIndex:115
 * 120-s auto-refresh
 *
 * Exported: isTecviewQuery, buildTecviewScript (wired in JarvisBrain.jsx)
 * Event: jarvis:tecview-toggle
 *
 * Voice: "temporal view" / "convergence" / "tecview" / "entity timeline" /
 *        "hourly activity" / "surge detection" / "operational surge"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const GREEN  = "#00c878";
const AMBER  = "#FFB347";
const RED    = "#FF3D5A";
const PURPLE = "#B97AFF";
const BTN_LEFT   = 970800;
const REFRESH_MS = 120_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ── normalise helpers ─────────────────────────────────────────────────────────

function arr(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

function toTs(v) {
  if (!v) return 0;
  const d = new Date(v);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function normaliseTasks(raw) {
  return arr(raw).map((t) => ({
    id: t.id || String(Math.random()),
    label: t.name || t.title || "Task",
    type: "TASK",
    ts: toTs(t.created_at || t.updated_at || t.due_date),
    severity: t.priority === "high" || t.urgent ? "high" : "medium",
  }));
}

function normaliseRisks(raw) {
  return arr(raw).map((r) => ({
    id: r.id || String(Math.random()),
    label: r.name || r.title || "RiskSignal",
    type: "RISK",
    ts: toTs(r.created_at || r.detected_at || r.updated_at),
    severity: r.severity || "medium",
  }));
}

function normaliseAlerts(raw) {
  return arr(raw).map((a) => ({
    id: a.id || String(Math.random()),
    label: a.title || a.name || a.message || "Alert",
    type: "ALERT",
    ts: toTs(a.created_at || a.triggered_at || a.timestamp),
    severity: a.severity || a.level || "medium",
  }));
}

function normaliseInvestigations(raw) {
  return arr(raw).map((i) => ({
    id: i.id || String(Math.random()),
    label: i.title || i.name || "Investigation",
    type: "INVESTIGATION",
    ts: toTs(i.created_at || i.opened_at || i.updated_at),
    severity: i.priority || i.severity || "medium",
  }));
}

// ── exported intent helpers ───────────────────────────────────────────────────

export function isTecviewQuery(q) {
  const s = q.toLowerCase();
  return (
    s.includes("tecview") ||
    s.includes("temporal view") ||
    s.includes("convergence") ||
    s.includes("entity timeline") ||
    s.includes("hourly activity") ||
    s.includes("surge detection") ||
    s.includes("operational surge") ||
    s.includes("event heatmap") ||
    s.includes("entity heatmap") ||
    s.includes("24 hour")
  );
}

export async function buildTecviewScript() {
  try {
    const [tasks, risks, alerts, invs] = await Promise.all([
      fetch(`${apiBase()}/entities/Task`, { headers: { Authorization: `Bearer ${API_KEY}` } })
        .then((r) => r.json()).then(normaliseTasks).catch(() => []),
      fetch(`${apiBase()}/entities/RiskSignal`, { headers: { Authorization: `Bearer ${API_KEY}` } })
        .then((r) => r.json()).then(normaliseRisks).catch(() => []),
      fetch(`${apiBase()}/v1/ops/alerts`, { headers: { Authorization: `Bearer ${API_KEY}` } })
        .then((r) => r.json()).then(normaliseAlerts).catch(() => []),
      fetch(`${apiBase()}/v1/investigations`, { headers: { Authorization: `Bearer ${API_KEY}` } })
        .then((r) => r.json()).then(normaliseInvestigations).catch(() => []),
    ]);
    const all = [...tasks, ...risks, ...alerts, ...invs];
    const now = Date.now();
    const window24h = all.filter((e) => e.ts > 0 && now - e.ts < 86400000);
    const surgeCount = countSurgeWindows(window24h);
    const peak = getPeakHour(window24h);
    return `Temporal entity convergence last 24 hours: ${window24h.length} events across ${countTypes(window24h)} entity types. Peak activity at ${peak}. ${surgeCount} surge window${surgeCount !== 1 ? "s" : ""} detected (hours with 3+ active entity types). ${surgeCount > 0 ? "Coordinated activity or operational pressure indicated." : "Activity spread normally across the day."}`;
  } catch {
    return "Temporal entity convergence data unavailable.";
  }
}

function countTypes(events) {
  return new Set(events.map((e) => e.type)).size;
}

function getPeakHour(events) {
  const counts = {};
  for (const e of events) {
    const h = new Date(e.ts).getHours();
    counts[h] = (counts[h] || 0) + 1;
  }
  const peak = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return peak ? `${peak[0].padStart(2, "0")}:00 UTC (${peak[1]} events)` : "N/A";
}

function countSurgeWindows(events) {
  const hourTypes = {};
  for (const e of events) {
    const h = new Date(e.ts).getHours();
    if (!hourTypes[h]) hourTypes[h] = new Set();
    hourTypes[h].add(e.type);
  }
  return Object.values(hourTypes).filter((s) => s.size >= 3).length;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function TemporalEntityConvergence() {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tasks, risks, alerts, invs] = await Promise.all([
        fetch(`${apiBase()}/entities/Task`, { headers: { Authorization: `Bearer ${API_KEY}` } })
          .then((r) => r.json()).then(normaliseTasks).catch(() => []),
        fetch(`${apiBase()}/entities/RiskSignal`, { headers: { Authorization: `Bearer ${API_KEY}` } })
          .then((r) => r.json()).then(normaliseRisks).catch(() => []),
        fetch(`${apiBase()}/v1/ops/alerts`, { headers: { Authorization: `Bearer ${API_KEY}` } })
          .then((r) => r.json()).then(normaliseAlerts).catch(() => []),
        fetch(`${apiBase()}/v1/investigations`, { headers: { Authorization: `Bearer ${API_KEY}` } })
          .then((r) => r.json()).then(normaliseInvestigations).catch(() => []),
      ]);
      const all = [...tasks, ...risks, ...alerts, ...invs];
      all.sort((a, b) => b.ts - a.ts);
      setEvents(all);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:tecview-toggle", toggle);
    return () => window.removeEventListener("jarvis:tecview-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 115,
          background: "transparent", border: `1px solid ${CY}`, color: CY,
          fontFamily: "monospace", fontSize: 10, padding: "3px 8px",
          cursor: "pointer", borderRadius: 3,
        }}
        title="F91 Temporal Entity Convergence (TECVIEW)"
      >
        ◈ TECVIEW
      </button>
    );
  }

  const now = Date.now();
  const last24 = events.filter((e) => e.ts > 0 && now - e.ts < 86400000);

  // heatmap — 24 buckets
  const buckets = Array.from({ length: 24 }, (_, i) => ({ hour: i, items: [] }));
  for (const e of last24) {
    const h = new Date(e.ts).getHours();
    buckets[h].items.push(e);
  }
  const maxBucket = Math.max(...buckets.map((b) => b.items.length), 1);

  // surge windows
  const surgeHours = buckets.filter((b) => new Set(b.items.map((i) => i.type)).size >= 3);

  // filtered list
  const listItems = filter === "ALL" ? last24 : last24.filter((e) => e.type === filter);

  // stat tiles
  const totalEvents = last24.length;
  const entityTypes = new Set(last24.map((e) => e.type)).size;
  const peakHourBucket = [...buckets].sort((a, b) => b.items.length - a.items.length)[0];
  const peakHourLabel = peakHourBucket.items.length > 0
    ? `${String(peakHourBucket.hour).padStart(2, "0")}:00`
    : "—";

  const bucketColor = (b) => {
    if (!b.items.length) return "#1a1a1a";
    const hasCrit = b.items.some((i) => i.severity === "critical");
    const hasHigh = b.items.some((i) => i.severity === "high");
    if (hasCrit) return RED;
    if (hasHigh) return AMBER;
    return CY;
  };

  const typeColor = (t) => {
    if (t === "TASK") return PURPLE;
    if (t === "RISK") return RED;
    if (t === "ALERT") return AMBER;
    if (t === "INVESTIGATION") return GREEN;
    return CY;
  };

  const assess = async () => {
    setAssessing(true);
    try {
      const script = await buildTecviewScript();
      await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: script }),
      });
    } catch { /* best-effort */ } finally {
      setAssessing(false);
    }
  };

  const panelStyle = {
    position: "fixed", top: 60, left: 320, width: 700, maxHeight: "80vh",
    background: "#0a0a0f", border: `1px solid ${CY}`, borderRadius: 6,
    padding: 16, zIndex: 9000, overflow: "auto",
    fontFamily: "monospace", color: "#e0e0e0",
    boxShadow: `0 0 24px ${CY}33`,
  };

  return (
    <div style={panelStyle}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ color: CY, fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
          ◈ TEMPORAL ENTITY CONVERGENCE — TECVIEW
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={assess} disabled={assessing} style={btnStyle(GREEN)}>
            {assessing ? "…" : "▶ ASSESS"}
          </button>
          <button onClick={load} disabled={loading} style={btnStyle(CY)}>
            {loading ? "…" : "⟳"}
          </button>
          <button onClick={() => setOpen(false)} style={btnStyle(RED)}>✕</button>
        </div>
      </div>

      {error && (
        <div style={{ color: RED, fontSize: 10, marginBottom: 8 }}>⚠ {error}</div>
      )}

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {[
          { label: "TOTAL EVENTS", val: totalEvents, col: CY },
          { label: "PEAK HOUR", val: peakHourLabel, col: AMBER },
          { label: "ENTITY TYPES", val: entityTypes, col: PURPLE },
          { label: "SURGE WINDOWS", val: surgeHours.length, col: surgeHours.length > 0 ? RED : GREEN },
        ].map((t) => (
          <div key={t.label} style={{
            background: "#111", border: `1px solid ${t.col}33`, borderRadius: 4,
            padding: "6px 12px", minWidth: 100, textAlign: "center",
          }}>
            <div style={{ fontSize: 16, color: t.col, fontWeight: 700 }}>{t.val}</div>
            <div style={{ fontSize: 8, color: "#888", marginTop: 2 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* 24h heatmap */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: "#666", marginBottom: 6 }}>
          24-HOUR EVENT HEATMAP (current local hours 00–23)
        </div>
        <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 48 }}>
          {buckets.map((b) => {
            const h = Math.max(4, Math.round((b.items.length / maxBucket) * 44));
            const isSurge = new Set(b.items.map((i) => i.type)).size >= 3;
            return (
              <div
                key={b.hour}
                title={`${String(b.hour).padStart(2, "0")}:00 — ${b.items.length} events${isSurge ? " ⚡ SURGE" : ""}`}
                style={{
                  flex: 1, height: h, background: bucketColor(b), borderRadius: 2,
                  border: isSurge ? `1px solid ${RED}` : "none",
                  cursor: "default", transition: "height 0.3s",
                }}
              />
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: "#555", marginTop: 2 }}>
          <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
        </div>
      </div>

      {/* surge callout */}
      {surgeHours.length > 0 && (
        <div style={{ background: `${RED}11`, border: `1px solid ${RED}44`, borderRadius: 4, padding: "6px 10px", marginBottom: 10 }}>
          <span style={{ color: RED, fontSize: 10, fontWeight: 700 }}>
            ⚡ {surgeHours.length} SURGE WINDOW{surgeHours.length !== 1 ? "S" : ""} DETECTED
          </span>
          <span style={{ color: "#aaa", fontSize: 10 }}>
            {" "}— hours {surgeHours.map((b) => `${String(b.hour).padStart(2, "0")}:00`).join(", ")} had ≥3 entity types active
          </span>
        </div>
      )}

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {["ALL", "TASK", "RISK", "ALERT", "INVESTIGATION"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={tabStyle(filter === f, typeColor(f))}>
            {f}
          </button>
        ))}
      </div>

      {/* event list */}
      <div style={{ maxHeight: 320, overflowY: "auto" }}>
        {listItems.length === 0 && !loading && (
          <div style={{ fontSize: 11, color: "#555", textAlign: "center", padding: 20 }}>
            No events in the last 24 hours for this filter.
          </div>
        )}
        {listItems.map((e) => (
          <div key={`${e.type}-${e.id}`} style={{
            borderBottom: "1px solid #1a1a1a", padding: "6px 0",
            display: "flex", gap: 8, alignItems: "center",
          }}>
            <div style={{
              width: 70, textAlign: "center", fontSize: 9, color: typeColor(e.type),
              border: `1px solid ${typeColor(e.type)}44`, borderRadius: 3, padding: "1px 4px",
              flexShrink: 0,
            }}>
              {e.type}
            </div>
            <div style={{ flex: 1, fontSize: 11, color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {e.label}
            </div>
            <div style={{ fontSize: 9, color: severityColor(e.severity), flexShrink: 0 }}>
              {e.severity?.toUpperCase()}
            </div>
            <div style={{ fontSize: 9, color: "#555", flexShrink: 0, minWidth: 80, textAlign: "right" }}>
              {e.ts > 0 ? new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "no ts"}
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 8, color: "#444", marginTop: 8, textAlign: "right" }}>
        auto-refresh 120s · /entities/Task · /entities/RiskSignal · /v1/ops/alerts · /v1/investigations
      </div>
    </div>
  );
}

function severityColor(s) {
  if (!s) return "#666";
  const l = s.toLowerCase();
  if (l === "critical") return RED;
  if (l === "high") return AMBER;
  if (l === "medium") return CY;
  return GREEN;
}

function btnStyle(col) {
  return {
    background: "transparent", border: `1px solid ${col}`, color: col,
    fontFamily: "monospace", fontSize: 10, padding: "3px 8px",
    cursor: "pointer", borderRadius: 3,
  };
}

function tabStyle(active, col = CY) {
  return {
    background: active ? `${col}22` : "transparent",
    border: `1px solid ${active ? col : "#333"}`,
    color: active ? col : "#888",
    fontFamily: "monospace", fontSize: 10, padding: "3px 7px",
    cursor: "pointer", borderRadius: 3,
  };
}
