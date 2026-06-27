/**
 * RunCorrelatorClustersDrawer — F146
 * Right-edge slide-in showing correlated event clusters from the run-correlator.
 *
 * Endpoints:
 *   GET /v1/run-correlator/clusters?limit=30
 *     → { items: [{ cluster_id, ts, window_s, event_count, max_severity,
 *                   event_ids, summary }] }
 *   GET /v1/run-correlator/cluster/{cluster_id}
 *     → { ok, cluster_id, ts, window_s, event_count, max_severity, events: [...] }
 *
 * Tab sits at 34% from top (gap between existing right-edge drawers).
 * Polls every 3 min while open.
 * Mounted in src/Layout.jsx after A11yDriversPanel.
 * Orange (#F97316) accent for high-severity; green (#4ADE80) for low.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 180_000;
const DRAWER_W = 320;
const ACCENT = "#F97316";
const GREEN = "#4ADE80";
const RED = "#F87171";
const DIM = "#64748B";

const SEV_COLOR = {
  CRITICAL: "#EF4444",
  HIGH: "#F97316",
  MEDIUM: "#FBBF24",
  LOW: "#4ADE80",
  INFO: "#38BDF8",
};

function sevColor(sev) {
  return SEV_COLOR[(sev || "").toUpperCase()] ?? DIM;
}

function relAge(ts) {
  if (!ts) return "—";
  const sec = Math.floor((Date.now() / 1000) - ts);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function SevBadge({ sev }) {
  const c = sevColor(sev);
  return (
    <span style={{
      fontFamily: S.mono, fontSize: S.fs.xxs, color: c,
      border: `1px solid ${c}55`, borderRadius: 3,
      padding: "1px 5px", letterSpacing: 1, flexShrink: 0,
      textTransform: "uppercase",
    }}>
      {sev || "?"}
    </span>
  );
}

function EventCountBadge({ count }) {
  const hi = count >= 10;
  return (
    <span style={{
      fontFamily: S.mono, fontSize: S.fs.xxs,
      color: hi ? ACCENT : DIM,
      border: `1px solid ${hi ? ACCENT : DIM}44`,
      borderRadius: 3, padding: "1px 5px",
      letterSpacing: 0.5, flexShrink: 0,
    }}>
      {count} evt{count !== 1 ? "s" : ""}
    </span>
  );
}

function ClusterRow({ cluster, expanded, onToggle }) {
  const c = sevColor(cluster.max_severity);
  const critical = (cluster.max_severity || "").toUpperCase() === "CRITICAL";

  return (
    <div style={{
      borderBottom: `1px solid ${S.border}`,
      background: critical ? `${RED}08` : "transparent",
    }}>
      {/* Header row */}
      <div
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "flex-start", gap: 8,
          padding: "7px 14px", cursor: "pointer",
          background: expanded ? `${ACCENT}08` : "transparent",
          borderLeft: expanded ? `2px solid ${ACCENT}` : "2px solid transparent",
        }}
      >
        <span style={{
          fontFamily: S.mono, fontSize: 10, color: c, flexShrink: 0,
          paddingTop: 1, letterSpacing: 0.5,
        }}>
          {expanded ? "▼" : "▶"}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: S.fs.xxs, color: S.textHi, letterSpacing: 0.5,
            fontFamily: S.mono,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            marginBottom: 4,
          }}>
            {cluster.cluster_id?.slice(0, 16) ?? "—"}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            <SevBadge sev={cluster.max_severity} />
            <EventCountBadge count={cluster.event_count ?? 0} />
            <span style={{ fontFamily: S.mono, fontSize: S.fs.xxs, color: DIM, letterSpacing: 0.5 }}>
              {relAge(cluster.ts)}
            </span>
          </div>
          {cluster.summary && (
            <div style={{
              marginTop: 4, fontSize: S.fs.xxs, color: `${S.textHi}99`,
              fontFamily: S.sans, letterSpacing: 0.3, lineHeight: 1.4,
              display: "-webkit-box", WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical", overflow: "hidden",
            }}>
              {cluster.summary}
            </div>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && <ClusterDetail clusterId={cluster.cluster_id} />}
    </div>
  );
}

function ClusterDetail({ clusterId }) {
  const [detail, setDetail] = useState(null);
  const [err, setErr] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    kimiClient.request(`/v1/run-correlator/cluster/${clusterId}`)
      .then((d) => { if (mounted.current) { setDetail(d); setErr(false); } })
      .catch(() => { if (mounted.current) setErr(true); });
    return () => { mounted.current = false; };
  }, [clusterId]);

  if (err) return (
    <div style={{ padding: "6px 14px 8px 34px", fontSize: S.fs.xxs, color: RED, fontFamily: S.mono }}>
      DETAIL UNAVAILABLE
    </div>
  );
  if (!detail) return (
    <div style={{ padding: "6px 14px 8px 34px", fontSize: S.fs.xxs, color: DIM, fontFamily: S.mono }}>
      LOADING…
    </div>
  );

  const events = detail.events ?? [];
  if (!detail.found && events.length === 0) return (
    <div style={{ padding: "6px 14px 8px 34px", fontSize: S.fs.xxs, color: DIM, fontFamily: S.mono }}>
      CLUSTER NOT IN DB
    </div>
  );

  return (
    <div style={{ padding: "4px 14px 8px 34px" }}>
      <div style={{
        display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap",
        fontSize: S.fs.xxs, color: DIM, fontFamily: S.mono, letterSpacing: 0.5,
      }}>
        <span>WIN {detail.window_s ?? "?"}s</span>
        <span>·</span>
        <span>{detail.event_count ?? events.length} events</span>
      </div>
      {events.length > 0 ? events.slice(0, 6).map((ev, i) => (
        <div key={ev.id ?? i} style={{
          fontSize: S.fs.xxs, color: `${S.textHi}BB`, fontFamily: S.mono,
          padding: "2px 0", letterSpacing: 0.3,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          <span style={{ color: sevColor(ev.severity), marginRight: 5 }}>◆</span>
          {ev.summary ?? ev.event_type ?? ev.id ?? "—"}
        </div>
      )) : (
        <div style={{ fontSize: S.fs.xxs, color: DIM, fontFamily: S.mono }}>
          {detail.event_ids?.length ?? 0} event id{detail.event_ids?.length !== 1 ? "s" : ""} (not fetched)
        </div>
      )}
      {events.length > 6 && (
        <div style={{ fontSize: S.fs.xxs, color: DIM, fontFamily: S.mono, marginTop: 3 }}>
          +{events.length - 6} more
        </div>
      )}
    </div>
  );
}

export default function RunCorrelatorClustersDrawer() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    kimiClient
      .request("/v1/run-correlator/clusters?limit=30")
      .then((d) => { if (alive) { setData(d); setErr(false); } })
      .catch(() => { if (alive) setErr(true); });
    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => { alive = false; clearTimeout(timerRef.current); };
  }, [open, tick]);

  const toggle = useCallback((id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const items = data?.items ?? [];
  const critCount = items.filter((i) => (i.max_severity || "").toUpperCase() === "CRITICAL").length;

  return (
    <>
      {/* Fixed tab — right edge, 34% from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close run correlator clusters" : "Open run correlator clusters"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "34%",
          transform: "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: critCount > 0
            ? `rgba(239,68,68,0.18)`
            : "rgba(2,6,10,0.92)",
          border: `1px solid ${critCount > 0 ? RED : ACCENT}55`,
          borderRight: open ? "none" : `1px solid ${critCount > 0 ? RED : ACCENT}55`,
          color: critCount > 0 ? RED : ACCENT,
          fontFamily: S.mono,
          fontSize: S.fs.xxs,
          letterSpacing: 2,
          padding: "10px 5px",
          cursor: "pointer",
          borderRadius: "4px 0 0 4px",
          transition: "right 0.2s ease",
          userSelect: "none",
        }}
      >
        {critCount > 0 ? `CLSTR ×${critCount}` : open ? "CLSTR ▶" : "CLSTR ◀"}
      </button>

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8996,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderLeft: `1px solid ${ACCENT}33`,
          display: "flex",
          flexDirection: "column",
          transition: "right 0.2s ease",
          fontFamily: S.mono,
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px",
          borderBottom: `1px solid ${S.border}`,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: S.fs.xs, color: ACCENT, letterSpacing: 2, flex: 1 }}>
            RUN CORRELATOR
          </span>
          {data && (
            <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1 }}>
              {items.length} cluster{items.length !== 1 ? "s" : ""}
              {critCount > 0 && (
                <span style={{ color: RED, marginLeft: 6 }}>·{critCount} CRIT</span>
              )}
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {!open ? null : err ? (
            <div style={{ padding: "20px 14px", color: RED, fontSize: S.fs.xs, letterSpacing: 1 }}>
              ENDPOINT UNREACHABLE
            </div>
          ) : !data ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              NO CLUSTERS
            </div>
          ) : (
            items.map((cluster) => (
              <ClusterRow
                key={cluster.cluster_id}
                cluster={cluster}
                expanded={expandedId === cluster.cluster_id}
                onToggle={() => toggle(cluster.cluster_id)}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "6px 14px",
          borderTop: `1px solid ${S.border}`,
          fontSize: S.fs.xxs, color: S.text,
          letterSpacing: 1, flexShrink: 0,
        }}>
          {data ? "LIVE · 3 MIN POLL" : err ? "ERR" : "…"}
        </div>
      </div>
    </>
  );
}
