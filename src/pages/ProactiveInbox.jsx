/**
 * ProactiveInbox — F13
 * Full-page proactive notification inbox from GET /v1/jarvis/notifications.
 * Shows severity badges (action/info/...), category tag, title, body, relative ts.
 * Per-item Ack button posts to /v1/jarvis/notifications/ack.
 * Tabs for Unread (acked=false) and Recent (acked=true). 30 s auto-poll.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { apiGet, apiPost } from "@/lib/wave1";

const ACCENT = "#f97316";  // JARVIS orange
const POLL_MS = 30_000;

// ── helpers ─────────────────────────────────────────────────────────────────

function relativeTime(ts) {
  if (!ts) return "—";
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function sevColor(sev) {
  const s = String(sev || "").toLowerCase();
  if (s === "action") return C.red || "#ef4444";
  if (s === "warn" || s === "warning") return C.gold || "#f59e0b";
  if (s === "ok" || s === "success") return C.green || "#10b981";
  return ACCENT;  // info default
}

// ── NotificationRow ──────────────────────────────────────────────────────────

function NotificationRow({ notif, onAck, acking }) {
  const [expanded, setExpanded] = useState(false);
  const col = sevColor(notif.severity);
  const isAcked = !!notif.acked;

  return (
    <div style={{
      borderLeft: `3px solid ${isAcked ? "#334155" : col}`,
      border: `1px solid ${isAcked ? "#1e293b" : col + "44"}`,
      borderRadius: 6,
      marginBottom: 8,
      opacity: isAcked ? 0.6 : 1,
      transition: "opacity 0.2s",
    }}>
      {/* header row */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px",
        fontFamily: "'JetBrains Mono',monospace",
      }}>
        {/* severity */}
        <span style={{
          color: col, fontSize: 9, fontWeight: 700, textTransform: "uppercase",
          minWidth: 52, letterSpacing: 1,
        }}>
          {notif.severity || "info"}
        </span>

        {/* category */}
        {notif.category && notif.category !== "general" && (
          <span style={{
            fontSize: 9, padding: "1px 6px",
            border: `1px solid #334155`, borderRadius: 3,
            color: "#64748b", textTransform: "uppercase", letterSpacing: 1,
          }}>
            {notif.category}
          </span>
        )}

        {/* title */}
        <span style={{
          color: isAcked ? "#475569" : "#e2e8f0",
          fontSize: 13, flex: 1, fontWeight: isAcked ? 400 : 600,
        }}>
          {notif.title || "(no title)"}
        </span>

        {/* timestamp */}
        <span style={{ color: "#475569", fontSize: 10 }}>
          {relativeTime(notif.ts)}
        </span>

        {/* expand toggle */}
        <button
          onClick={() => setExpanded(x => !x)}
          style={{
            background: "transparent", border: "none", cursor: "pointer",
            color: "#475569", fontSize: 11, padding: "2px 6px",
            fontFamily: "'JetBrains Mono',monospace",
          }}
          title="Toggle body"
        >
          {expanded ? "▲" : "▼"}
        </button>

        {/* ack button */}
        {!isAcked && (
          <button
            onClick={() => onAck(notif.id)}
            disabled={acking === notif.id}
            style={{
              background: "transparent",
              border: `1px solid ${col}66`,
              borderRadius: 4,
              color: col,
              cursor: acking === notif.id ? "not-allowed" : "pointer",
              fontSize: 10,
              fontFamily: "'JetBrains Mono',monospace",
              padding: "3px 8px",
              opacity: acking === notif.id ? 0.5 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {acking === notif.id ? "…" : "ACK"}
          </button>
        )}
        {isAcked && (
          <span style={{ fontSize: 9, color: "#334155", padding: "3px 8px" }}>ACKED</span>
        )}
      </div>

      {/* body */}
      {expanded && (
        <div style={{
          padding: "0 14px 12px 14px",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 11, color: "#94a3b8", lineHeight: 1.7,
          whiteSpace: "pre-wrap",
        }}>
          {notif.body || "—"}
          {notif.meta && Object.keys(notif.meta || {}).length > 0 && (
            <pre style={{
              marginTop: 8, padding: "8px",
              background: "rgba(0,0,0,0.3)", borderRadius: 4,
              fontSize: 10, color: "#64748b", overflowX: "auto",
            }}>
              {JSON.stringify(notif.meta, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function ProactiveInbox() {
  const [unread, setUnread]   = useState([]);
  const [recent, setRecent]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [tab, setTab]         = useState("unread");   // "unread" | "recent"
  const [acking, setAcking]   = useState(null);
  const [lastTs, setLastTs]   = useState(null);
  const [severityFilter, setSeverityFilter] = useState("all");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [uData, rData] = await Promise.all([
        apiGet("/v1/jarvis/notifications?acked=false&limit=50"),
        apiGet("/v1/jarvis/notifications?acked=true&limit=20"),
      ]);
      setUnread(Array.isArray(uData?.notifications) ? uData.notifications : []);
      setRecent(Array.isArray(rData?.notifications) ? rData.notifications : []);
      setLastTs(new Date().toLocaleTimeString());
      setError(null);
    } catch (e) {
      setError(e.message || "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  const handleAck = useCallback(async (id) => {
    setAcking(id);
    try {
      await apiPost("/v1/jarvis/notifications/ack", { notification_id: id });
      await load();
    } catch {
      // best effort
    } finally {
      setAcking(null);
    }
  }, [load]);

  // stats
  const actionCount = unread.filter(n => String(n.severity || "").toLowerCase() === "action").length;
  const warnCount   = unread.filter(n => String(n.severity || "").toLowerCase() === "warn").length;

  // filtered list for active tab
  const rawList = tab === "unread" ? unread : recent;
  const list = severityFilter === "all"
    ? rawList
    : rawList.filter(n => String(n.severity || "").toLowerCase() === severityFilter);

  // unique severities for filter bar
  const severities = ["all", ...new Set(unread.map(n => String(n.severity || "info").toLowerCase()))];

  const subtitle = lastTs
    ? `Last polled ${lastTs} · 30 s refresh`
    : "Connecting…";

  return (
    <PageShell
      title="Proactive Inbox"
      subtitle={`JARVIS · ${subtitle}`}
      accent={ACCENT}
      actions={
        <Badge color={unread.length > 0 ? (actionCount > 0 ? C.red : ACCENT) : "#334155"}>
          {unread.length} unread
        </Badge>
      }
    >
      <DataState loading={loading} error={error} empty={false}>
        {/* stat tiles */}
        <Grid cols={4} style={{ marginBottom: 24 }}>
          <StatTile label="Unread"  value={unread.length}        accent={ACCENT} />
          <StatTile label="Action"  value={actionCount}          accent={C.red || "#ef4444"} />
          <StatTile label="Warn"    value={warnCount}            accent={C.gold || "#f59e0b"} />
          <StatTile label="Acked"   value={recent.length}        accent="#334155" />
        </Grid>

        {/* tab bar */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[
            { key: "unread", label: `UNREAD (${unread.length})` },
            { key: "recent", label: `RECENTLY ACKED (${recent.length})` },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setSeverityFilter("all"); }}
              style={{
                background: tab === t.key ? ACCENT + "22" : "transparent",
                border: `1px solid ${tab === t.key ? ACCENT : "#334155"}`,
                borderRadius: 4,
                color: tab === t.key ? ACCENT : "#64748b",
                cursor: "pointer",
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 11,
                letterSpacing: 1,
                padding: "5px 14px",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* severity filter — only for unread tab */}
        {tab === "unread" && severities.length > 2 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            {severities.map(s => (
              <button
                key={s}
                onClick={() => setSeverityFilter(s)}
                style={{
                  background: "transparent",
                  border: `1px solid ${severityFilter === s ? sevColor(s) : "#1e293b"}`,
                  borderRadius: 3,
                  color: severityFilter === s ? sevColor(s) : "#475569",
                  cursor: "pointer",
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: 10,
                  letterSpacing: 1,
                  padding: "3px 10px",
                  textTransform: "uppercase",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <PanelCard
          title={tab === "unread" ? "Unread Notifications" : "Recently Acknowledged"}
          accent={ACCENT}
          right={<Badge color="#334155">{list.length} shown</Badge>}
        >
          {list.length === 0 ? (
            <div style={{
              color: "#475569", fontSize: 12, padding: "24px 0", textAlign: "center",
              fontFamily: "'JetBrains Mono',monospace",
            }}>
              {tab === "unread" ? "No unread notifications — all clear" : "No recently acked notifications"}
            </div>
          ) : (
            list.map(n => (
              <NotificationRow
                key={n.id}
                notif={n}
                onAck={handleAck}
                acking={acking}
              />
            ))
          )}
        </PanelCard>
      </DataState>
    </PageShell>
  );
}
