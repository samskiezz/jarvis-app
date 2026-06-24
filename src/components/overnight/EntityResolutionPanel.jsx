/**
 * EntityResolutionPanel — F78
 * Left-edge slide-in at 73 % vertical.
 * Polls GET /v1/jarvis/er/stats + GET /v1/jarvis/er/queue?status=pending&limit=50
 * every 5 min while open. Shows pending entity dedup candidates with similarity
 * score bars, entity type badges, and truncated ID pairs.
 * Tab: ER ◀  Accent: rose (#E11D48)
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000;
const DRAWER_W = 310;
const ROSE = "#E11D48";

function relTime(ts) {
  if (!ts) return "—";
  const tsMs = ts > 1e10 ? ts : ts * 1000;
  const diff = Math.floor((Date.now() - tsMs) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function trunc(s, n = 22) {
  if (!s) return "—";
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function TypeBadge({ type }) {
  const colors = {
    Person: "#06B6D4", Organization: "#A855F7", Location: "#22C55E",
    Event: "#F59E0B", Asset: "#3B82F6", Risk: ROSE,
  };
  const col = colors[type] ?? "#6B7280";
  return (
    <span style={{
      fontFamily: S.mono, fontSize: 9, color: col,
      border: `1px solid ${col}55`, borderRadius: 3,
      padding: "1px 5px", letterSpacing: 1,
      textTransform: "uppercase", flexShrink: 0,
    }}>
      {type ?? "?"}
    </span>
  );
}

function ScoreBar({ score }) {
  const pct = Math.min(1, Math.max(0, score ?? 0));
  const col = pct >= 0.85 ? "#22C55E" : pct >= 0.7 ? "#F59E0B" : ROSE;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, flex: 1, minWidth: 0 }}>
      <div style={{
        height: 4, flex: 1, background: "rgba(255,255,255,0.08)",
        borderRadius: 2, overflow: "hidden",
      }}>
        <div style={{ width: `${pct * 100}%`, height: "100%", background: col, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 9, color: col, fontFamily: S.mono, flexShrink: 0 }}>
        {(pct * 100).toFixed(0)}%
      </span>
    </div>
  );
}

export default function EntityResolutionPanel() {
  const [open, setOpen]   = useState(false);
  const [stats, setStats] = useState(null);
  const [queue, setQueue] = useState(null);
  const [err, setErr]     = useState(false);
  const [tick, bump]      = useReducer((n) => n + 1, 0);
  const timerRef          = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    Promise.all([
      kimiClient.request("/v1/jarvis/er/stats"),
      kimiClient.request("/v1/jarvis/er/queue?status=pending&limit=50"),
    ])
      .then(([s, q]) => {
        if (!alive) return;
        setStats(s ?? {});
        const arr = Array.isArray(q?.queue) ? q.queue : [];
        setQueue(arr);
        setErr(false);
      })
      .catch(() => { if (alive) setErr(true); });

    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => { alive = false; clearTimeout(timerRef.current); };
  }, [open, tick]);

  const pending = stats?.pending ?? 0;

  return (
    <>
      {/* Tab toggle */}
      <div
        onClick={() => setOpen((o) => !o)}
        title="Entity Resolution — pending dedup candidates"
        style={{
          position: "fixed", left: open ? DRAWER_W : 0, top: "73%",
          zIndex: 120, cursor: "pointer",
          background: open ? ROSE : "rgba(5,8,13,0.82)",
          color: open ? "#fff" : ROSE,
          border: `1px solid ${ROSE}77`,
          borderLeft: open ? "none" : `1px solid ${ROSE}77`,
          borderRadius: "0 6px 6px 0",
          padding: "6px 5px",
          fontSize: 9, fontFamily: S.mono, letterSpacing: 1.5,
          writingMode: "vertical-rl", textOrientation: "mixed",
          userSelect: "none", backdropFilter: "blur(6px)",
          boxShadow: `0 0 14px ${ROSE}33`,
          transition: "left 0.25s ease",
        }}
      >
        ER {pending > 0 ? `(${pending})` : "◀"}
      </div>

      {/* Drawer */}
      <div style={{
        position: "fixed", left: open ? 0 : -DRAWER_W - 2, top: 0, bottom: 0,
        width: DRAWER_W, zIndex: 119,
        background: "rgba(5,8,13,0.92)", borderRight: `1px solid ${ROSE}44`,
        backdropFilter: "blur(12px)", display: "flex", flexDirection: "column",
        transition: "left 0.25s ease",
        fontFamily: S.mono, color: "#DCEBF5",
      }}>
        {/* Header */}
        <div style={{
          padding: "10px 14px 8px",
          borderBottom: `1px solid ${ROSE}33`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ color: ROSE, fontSize: 10, letterSpacing: 2, fontWeight: 700 }}>
              ENTITY RESOLUTION
            </span>
            <span style={{ marginLeft: "auto", fontSize: 9, color: "#6B7280" }}>
              {stats === null ? "…" : `${pending} pending`}
            </span>
          </div>
          {/* Stats tiles */}
          {stats && (
            <div style={{ display: "flex", gap: 6 }}>
              {[
                { label: "PENDING",   val: stats.pending ?? 0,          col: ROSE },
                { label: "MERGED",    val: stats.merged ?? 0,           col: "#22C55E" },
                { label: "SEEN",      val: stats.candidates_seen ?? 0,  col: "#6B7280" },
              ].map(({ label, val, col }) => (
                <div key={label} style={{
                  flex: 1, textAlign: "center",
                  background: `${col}15`, borderRadius: 4,
                  padding: "4px 0", border: `1px solid ${col}33`,
                }}>
                  <div style={{ fontSize: 13, color: col, fontWeight: 700 }}>{val}</div>
                  <div style={{ fontSize: 8, color: "#6B7280", letterSpacing: 1, marginTop: 1 }}>{label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Queue list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {err && (
            <div style={{ padding: 14, color: "#EF4444", fontSize: 10, textAlign: "center" }}>
              ENDPOINT ERROR — /v1/jarvis/er/queue
            </div>
          )}
          {!err && queue === null && (
            <div style={{ padding: 14, color: "#6B7280", fontSize: 10, textAlign: "center" }}>
              LOADING…
            </div>
          )}
          {!err && queue !== null && queue.length === 0 && (
            <div style={{ padding: 14, color: "#6B7280", fontSize: 10, textAlign: "center" }}>
              NO PENDING CANDIDATES
            </div>
          )}
          {!err && queue !== null && queue.map((item) => {
            const tsS = item.ts ?? 0;
            return (
              <div key={item.id ?? `${item.a_id}-${item.b_id}`} style={{
                padding: "8px 14px",
                borderBottom: `1px solid ${ROSE}11`,
              }}>
                {/* Type + age */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                  <TypeBadge type={item.type} />
                  <span style={{ marginLeft: "auto", fontSize: 9, color: "#4B5563" }}>
                    {relTime(tsS)}
                  </span>
                </div>
                {/* ID pair */}
                <div style={{
                  fontSize: 10, color: "#94A3B8", marginBottom: 5,
                  display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 4, alignItems: "center",
                }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    title={item.a_id}>
                    {trunc(item.a_id)}
                  </span>
                  <span style={{ color: ROSE, fontSize: 9 }}>≈</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}
                    title={item.b_id}>
                    {trunc(item.b_id)}
                  </span>
                </div>
                {/* Score bar */}
                <ScoreBar score={item.score} />
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: "6px 14px",
          borderTop: `1px solid ${ROSE}22`,
          fontSize: 9, color: "#374151", letterSpacing: 1,
        }}>
          GET /v1/jarvis/er/stats · /er/queue · 5 min poll
        </div>
      </div>
    </>
  );
}
