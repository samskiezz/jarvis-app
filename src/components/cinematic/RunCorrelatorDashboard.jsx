/**
 * RunCorrelatorDashboard — F230.
 *
 * Polls GET /v1/run-correlator/clusters?limit=50 every 90 s for badge update.
 * On panel open, fetches the full cluster list; click a cluster row to expand
 * and load GET /v1/run-correlator/cluster/{cluster_id} for per-event detail.
 *
 * Stat tiles: total clusters / critical / high / avg events per cluster.
 * Filter tabs: ALL | CRITICAL | HIGH | LOW + text search.
 * Expand cluster → summary + event list (ts, sensor_id, kind, severity).
 *
 * ⚡ RCOR button left:86800 bottom:8 zIndex:112.
 * Badge: red if critical > 0, amber if total > 0.
 * jarvis:rcor-toggle event.
 *
 * Intent: "run correlator / correlated events / event clusters / rcor /
 *          incident clusters / correlation engine / event correlation /
 *          correlated incidents / cluster incidents / security clusters /
 *          sensor correlation"
 *   → isRcorQuery() + buildRcorScript() wired in JarvisBrain.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00C878";
const RED    = "#FF3B3B";
const PURPLE = "#B06EFF";
const DIM    = "#445A6A";

const BTN_LEFT  = 86800;
const POLL_MS   = 90_000;
const API_KEY   =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── intent exports ───────────────────────────────────────────────────────────

const RCOR_RE =
  /\b(run.?correlat|correlat.?event|event.?cluster|rcor|incident.?cluster|correlat.?engine|event.?correlat|correlat.?incident|cluster.?incident|security.?cluster|sensor.?correlat|correlation.?report|correlated.?alert)\b/i;

export function isRcorQuery(t) { return RCOR_RE.test(t || ""); }

export async function buildRcorScript() {
  try {
    const r = await fetch(
      `${apiBase()}/v1/run-correlator/clusters?limit=50`,
      { headers: { Authorization: `Bearer ${API_KEY}` } },
    );
    const d = r.ok ? await r.json() : null;
    const items  = d?.items ?? [];
    const total  = items.length;
    const crit   = items.filter((c) => (c.max_severity || "").toLowerCase() === "critical").length;
    const high   = items.filter((c) => (c.max_severity || "").toLowerCase() === "high").length;
    window.dispatchEvent(new CustomEvent("jarvis:rcor-toggle"));
    if (crit > 0) {
      return (
        `Sir, Run Correlator: ${total} event cluster${total !== 1 ? "s" : ""} detected — ` +
        `${crit} CRITICAL, ${high} high severity. Immediate correlation review recommended. ` +
        "Opening cluster dashboard now."
      );
    }
    if (total > 0) {
      return (
        `Run Correlator online. ${total} correlated cluster${total !== 1 ? "s" : ""} on record, ` +
        `${high} high severity. Opening dashboard, sir.`
      );
    }
    return "Run Correlator: no clusters on record yet. Panel is open — POST event IDs to correlate.";
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:rcor-toggle"));
    return "Run Correlator online. Opening now, sir.";
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const SEV_RANK = { critical: 4, high: 3, med: 2, low: 1 };

function sevColor(s) {
  const k = (s || "low").toLowerCase();
  if (k === "critical") return RED;
  if (k === "high")     return AMBER;
  if (k === "med")      return "#FBBF24";
  if (k === "low")      return GREEN;
  return DIM;
}

function fmtTs(ts) {
  if (!ts) return "—";
  try {
    const n = Number(ts);
    const d = new Date(n > 1e12 ? n : n * 1000);
    return d.toLocaleString("en-GB", {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch { return "—"; }
}

function normItems(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  return [];
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StatTile({ label, value, color }) {
  return (
    <div style={{
      flex: "1 1 70px", textAlign: "center",
      background: "rgba(255,255,255,0.03)", borderRadius: 8,
      border: `1px solid ${color}33`, padding: "10px 6px",
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color, letterSpacing: 1 }}>{value}</div>
      <div style={{
        fontSize: 9, color: DIM, letterSpacing: 1.5,
        marginTop: 3, textTransform: "uppercase",
      }}>{label}</div>
    </div>
  );
}

function EventRow({ ev }) {
  const sc = sevColor(ev.severity);
  return (
    <div style={{
      display: "flex", gap: 8, alignItems: "flex-start",
      padding: "4px 0", borderBottom: `1px solid ${CY}11`,
      fontSize: 9, flexWrap: "wrap",
    }}>
      <span style={{ color: sc, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", width: 52, flexShrink: 0 }}>
        {(ev.severity || "?").toUpperCase()}
      </span>
      <span style={{ color: "#9BBBD0", width: 36, flexShrink: 0 }}>#{ev.id ?? "?"}</span>
      <span style={{ color: "#DCEBF5", flex: 1, minWidth: 60 }}>{ev.kind || ev.sensor_id || "event"}</span>
      <span style={{ color: DIM, flexShrink: 0 }}>{fmtTs(ev.ts)}</span>
    </div>
  );
}

function ClusterRow({ item, onExpand, expanded, detail, loadingDetail }) {
  const sc = sevColor(item.max_severity);
  return (
    <div style={{
      borderRadius: 8,
      border: `1px solid ${sc}33`,
      borderLeft: `3px solid ${sc}`,
      background: expanded ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.015)",
      padding: "9px 12px", marginBottom: 7,
      transition: "background 0.15s",
    }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", cursor: "pointer" }}
        onClick={() => onExpand(item.cluster_id)}
      >
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: 1.5,
          color: sc, textTransform: "uppercase", width: 60, flexShrink: 0,
        }}>{(item.max_severity || "low").toUpperCase()}</span>
        <span style={{ fontSize: 11, color: "#DCEBF5", flex: 1, minWidth: 0 }}>
          {item.summary || `Cluster ${item.cluster_id?.slice(0, 8) ?? "?"}`}
        </span>
        <span style={{ fontSize: 9, color: DIM, flexShrink: 0 }}>
          {item.event_count ?? 0} evt{(item.event_count ?? 0) !== 1 ? "s" : ""}
        </span>
        <span style={{ fontSize: 9, color: DIM, flexShrink: 0 }}>{fmtTs(item.ts)}</span>
        <span style={{ fontSize: 10, color: CY, flexShrink: 0 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 9, color: DIM, marginBottom: 6 }}>
            window: {item.window_s ?? "?"}s &nbsp;·&nbsp; id: {item.cluster_id}
          </div>
          {loadingDetail && (
            <div style={{ fontSize: 10, color: DIM, padding: "6px 0" }}>Loading events…</div>
          )}
          {!loadingDetail && detail && Array.isArray(detail.events) && detail.events.length > 0 && (
            <div>
              <div style={{ fontSize: 9, color: CY, letterSpacing: 1.5, marginBottom: 4 }}>EVENTS</div>
              {detail.events.map((ev, i) => <EventRow key={i} ev={ev} />)}
            </div>
          )}
          {!loadingDetail && detail && (!detail.events || detail.events.length === 0) && (
            <div style={{ fontSize: 9, color: DIM }}>
              {item.event_count ?? 0} event IDs in cluster — raw events not yet available in Guardian DB.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function RunCorrelatorDashboard() {
  const [open, setOpen]         = useState(false);
  const [clusters, setClusters] = useState([]);
  const [badgeCount, setBadgeCount] = useState(0);
  const [critCount, setCritCount]   = useState(0);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [filter, setFilter]         = useState("ALL");
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState(null);
  const [detail, setDetail]         = useState({});
  const [loadingDetail, setLoadingDetail] = useState(null);
  const pollTimer = useRef(null);

  // badge poll
  const pollBadge = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase()}/v1/run-correlator/clusters?limit=50`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) return;
      const d = await r.json();
      const items = normItems(d);
      setBadgeCount(items.length);
      setCritCount(items.filter((c) => (c.max_severity || "").toLowerCase() === "critical").length);
    } catch {}
  }, []);

  useEffect(() => {
    pollBadge();
    pollTimer.current = setInterval(pollBadge, POLL_MS);
    return () => clearInterval(pollTimer.current);
  }, [pollBadge]);

  // panel data
  const fetchClusters = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${apiBase()}/v1/run-correlator/clusters?limit=50`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setClusters(normItems(d));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (open) fetchClusters();
  }, [open, fetchClusters]);

  // toggle via event
  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:rcor-toggle", onToggle);
    return () => window.removeEventListener("jarvis:rcor-toggle", onToggle);
  }, []);

  // expand + load cluster detail
  async function handleExpand(id) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (detail[id]) return;
    setLoadingDetail(id);
    try {
      const r = await fetch(`${apiBase()}/v1/run-correlator/cluster/${id}`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setDetail((prev) => ({ ...prev, [id]: d }));
    } catch {}
    setLoadingDetail(null);
  }

  // derived stats
  const total    = clusters.length;
  const crit     = clusters.filter((c) => (c.max_severity || "").toLowerCase() === "critical").length;
  const high     = clusters.filter((c) => (c.max_severity || "").toLowerCase() === "high").length;
  const avgEvts  = total > 0
    ? Math.round(clusters.reduce((s, c) => s + (c.event_count ?? 0), 0) / total)
    : 0;

  // filtered list
  const visible = clusters.filter((c) => {
    const sev = (c.max_severity || "low").toLowerCase();
    if (filter === "CRITICAL" && sev !== "critical") return false;
    if (filter === "HIGH"     && sev !== "high")     return false;
    if (filter === "LOW"      && sev !== "low")      return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        (c.summary        || "").toLowerCase().includes(q) ||
        (c.max_severity   || "").toLowerCase().includes(q) ||
        (c.cluster_id     || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const sorted = [...visible].sort(
    (a, b) =>
      (SEV_RANK[(b.max_severity || "low").toLowerCase()] ?? 0) -
      (SEV_RANK[(a.max_severity || "low").toLowerCase()] ?? 0),
  );

  const badgeColor = critCount > 0 ? RED : badgeCount > 0 ? AMBER : null;

  return (
    <>
      <style>{`
        @keyframes rcpulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.5);opacity:.5}}
        @keyframes rcfade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      {/* dock button */}
      <div style={{
        position: "fixed",
        left: `min(${BTN_LEFT}px, calc(100vw - 120px))`,
        bottom: 8, zIndex: 112,
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        <button
          onClick={() => setOpen((v) => !v)}
          title="Run Correlator Dashboard"
          style={{
            position: "relative",
            background: open ? AMBER : "rgba(5,8,13,0.8)",
            color: open ? "#04060A" : AMBER,
            border: `1px solid ${AMBER}`,
            borderRadius: 6, padding: "3px 10px",
            fontSize: 11, letterSpacing: 1.5, cursor: "pointer",
            boxShadow: `0 0 18px ${AMBER}${open ? "99" : "44"}`,
            backdropFilter: "blur(6px)",
          }}
        >
          ⚡ RCOR
          {badgeColor && (
            <span style={{
              position: "absolute", top: -5, right: -6,
              background: badgeColor, color: "#fff",
              borderRadius: "50%", width: 16, height: 16,
              fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, boxShadow: `0 0 8px ${badgeColor}`,
              animation: "rcpulse 1.5s ease-in-out infinite",
            }}>{badgeCount > 9 ? "9+" : badgeCount}</span>
          )}
        </button>
      </div>

      {/* panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 44, right: 18, zIndex: 111,
          width: "min(580px, 96vw)",
          maxHeight: "82vh",
          background: "rgba(5,9,16,0.96)",
          border: `1px solid ${AMBER}44`,
          borderRadius: 14, overflow: "hidden",
          boxShadow: `0 0 60px ${AMBER}18`,
          display: "flex", flexDirection: "column",
          fontFamily: "'JetBrains Mono', monospace",
          animation: "rcfade 0.2s ease-out",
        }}>
          {/* header */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 16px",
            borderBottom: `1px solid ${AMBER}22`,
            background: "rgba(245,166,35,0.04)",
            flexShrink: 0,
          }}>
            <span style={{ color: AMBER, fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>⚡ RUN</span>
            <span style={{ fontSize: 9, color: DIM, letterSpacing: 1 }}>CORRELATOR DASHBOARD</span>
            <button
              onClick={() => fetchClusters()}
              disabled={loading}
              style={{
                marginLeft: "auto",
                background: "none", border: `1px solid ${AMBER}44`,
                borderRadius: 4, color: AMBER, cursor: loading ? "default" : "pointer",
                fontSize: 10, padding: "2px 8px", opacity: loading ? 0.5 : 1,
              }}
            >{loading ? "…" : "↺"}</button>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 16, padding: 0, marginLeft: 4 }}
            >×</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "12px 16px 0", flexShrink: 0 }}>
            <StatTile label="Clusters"  value={total}   color={total > 0 ? AMBER : CY}    />
            <StatTile label="Critical"  value={crit}    color={crit > 0  ? RED   : CY}    />
            <StatTile label="High"      value={high}    color={high > 0  ? AMBER : CY}    />
            <StatTile label="Avg Events" value={avgEvts} color={PURPLE}                   />
          </div>

          {/* filter tabs + search */}
          <div style={{
            display: "flex", gap: 6, padding: "10px 16px 0",
            flexShrink: 0, alignItems: "center", flexWrap: "wrap",
          }}>
            {["ALL", "CRITICAL", "HIGH", "LOW"].map((f) => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: "3px 10px", borderRadius: 5, fontSize: 10, letterSpacing: 1,
                border: `1px solid ${filter === f ? AMBER : AMBER + "33"}`,
                background: filter === f ? AMBER + "22" : "transparent",
                color: filter === f ? AMBER : DIM, cursor: "pointer",
              }}>{f}</button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search clusters…"
              style={{
                marginLeft: "auto",
                background: "rgba(245,166,35,0.06)",
                border: `1px solid ${AMBER}33`, borderRadius: 5,
                color: "#DCEBF5", fontSize: 10, padding: "3px 8px",
                outline: "none", width: 120,
              }}
            />
          </div>

          {/* list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 16px 14px" }}>
            {loading && (
              <div style={{ textAlign: "center", color: DIM, fontSize: 12, padding: "28px 0" }}>
                Loading correlation clusters…
              </div>
            )}
            {!loading && error && (
              <div style={{ color: RED, fontSize: 11, padding: "12px 0" }}>Error: {error}</div>
            )}
            {!loading && !error && sorted.length === 0 && (
              <div style={{ textAlign: "center", color: DIM, fontSize: 12, padding: "28px 0" }}>
                {clusters.length === 0
                  ? "No clusters yet — POST event IDs to /v1/run-correlator/correlate to generate."
                  : "No clusters match current filter."}
              </div>
            )}
            {!loading && sorted.map((c) => (
              <ClusterRow
                key={c.cluster_id}
                item={c}
                onExpand={handleExpand}
                expanded={expanded === c.cluster_id}
                detail={detail[c.cluster_id] ?? null}
                loadingDetail={loadingDetail === c.cluster_id}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
