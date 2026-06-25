/**
 * InfSwarmAgentsDrawer — Feature 106
 * Right-edge slide-in at 83 % from top (between GraphCentralityDrawer 80 %
 * and RevDbHistoryDrawer 85 %).
 *
 * Polls GET /v1/inf-swarm/agents every 30 s while open.
 * → { ok, items: [{ agent_id, kind, status, queue_depth, spawned_ts,
 *                    last_heartbeat, error }],
 *      count, supported_kinds, source }
 *
 * Mounted in src/Layout.jsx after RevDbHistoryDrawer.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 30_000;
const DRAWER_W = 340;
const ACCENT = "#34D399"; // emerald-400

const STATUS_COLORS = {
  declared: "#F59E0B",
  running: "#4ADE80",
  stopped: "#64748B",
  error: "#EF4444",
};

const KIND_COLORS = {
  scraper: "#22D3EE",
  summarizer: "#A78BFA",
  classifier: "#38BDF8",
  translator: "#84CC16",
  vision: "#F472B6",
  research: "#FB923C",
};

function relAge(tsMs) {
  if (!tsMs) return "";
  const diffS = Math.floor((Date.now() - tsMs * (tsMs < 1e10 ? 1000 : 1)) / 1000);
  if (diffS < 0) return "";
  if (diffS < 60) return `${diffS}s ago`;
  if (diffS < 3600) return `${Math.floor(diffS / 60)}m ago`;
  if (diffS < 86400) return `${Math.floor(diffS / 3600)}h ago`;
  return `${Math.floor(diffS / 86400)}d ago`;
}

function shortId(id) {
  if (!id) return "???";
  return String(id).slice(0, 10);
}

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] ?? "#64748B";
  return (
    <span
      style={{
        fontSize: 9,
        color,
        border: `1px solid ${color}55`,
        borderRadius: 3,
        padding: "1px 5px",
        letterSpacing: 1,
        flexShrink: 0,
      }}
    >
      {(status ?? "unknown").toUpperCase()}
    </span>
  );
}

function KindBadge({ kind }) {
  const color = KIND_COLORS[kind] ?? "#94A3B8";
  return (
    <span
      style={{
        fontSize: 9,
        color,
        border: `1px solid ${color}44`,
        borderRadius: 3,
        padding: "1px 5px",
        letterSpacing: 1,
        flexShrink: 0,
      }}
    >
      {(kind ?? "?").toUpperCase()}
    </span>
  );
}

export default function InfSwarmAgentsDrawer() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request("/v1/inf-swarm/agents")
      .then((res) => {
        if (!alive) return;
        setData(res);
        setErr(false);
      })
      .catch(() => {
        if (alive) setErr(true);
      });

    timerRef.current = setTimeout(() => {
      if (alive) bump();
    }, POLL_MS);

    return () => {
      alive = false;
      clearTimeout(timerRef.current);
    };
  }, [open, tick]);

  const items = data?.items ?? [];
  const count = data?.count ?? items.length;
  const isSeeded = data?.source === "default-schema";

  return (
    <>
      {/* Fixed toggle tab — right edge, 83 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close inference swarm" : "Open inference swarm agents"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "83%",
          transform: "translateY(-50%)",
          zIndex: 9001,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${ACCENT}55`,
          borderRight: open ? "none" : `1px solid ${ACCENT}55`,
          color: ACCENT,
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
        {open ? "SWARM ▶" : "SWARM ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8993,
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderBottom: `1px solid ${S.border}`,
            flexShrink: 0,
            flexWrap: "wrap",
            rowGap: 4,
          }}
        >
          <span style={{ fontSize: S.fs.xs, color: ACCENT, letterSpacing: 2, flex: 1 }}>
            INF SWARM AGENTS
          </span>
          {data && (
            <span
              style={{
                fontSize: 9,
                color: ACCENT,
                border: `1px solid ${ACCENT}55`,
                borderRadius: 3,
                padding: "1px 6px",
                letterSpacing: 1,
              }}
            >
              {count} {count === 1 ? "AGENT" : "AGENTS"}
            </span>
          )}
          {isSeeded && (
            <span
              style={{
                fontSize: 9,
                color: "#F59E0B",
                border: "1px solid #F59E0B44",
                borderRadius: 3,
                padding: "1px 6px",
                letterSpacing: 1,
              }}
            >
              SEED
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {!open ? null : err ? (
            <div
              style={{
                padding: "20px 14px",
                color: "#F59E0B",
                fontSize: S.fs.xs,
                letterSpacing: 1,
              }}
            >
              ENDPOINT UNREACHABLE
            </div>
          ) : !data ? (
            <div
              style={{
                padding: "20px 14px",
                color: S.text,
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              LOADING…
            </div>
          ) : items.length === 0 ? (
            <div
              style={{
                padding: "20px 14px",
                color: S.text,
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              NO SWARM AGENTS REGISTERED
            </div>
          ) : (
            items.map((agent) => {
              const spawnAge = relAge(agent.spawned_ts);
              const hbAge = relAge(agent.last_heartbeat);
              return (
                <div
                  key={agent.agent_id}
                  style={{
                    padding: "9px 14px",
                    borderBottom: `1px solid ${S.border}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: 5,
                  }}
                >
                  {/* Row 1: short id + status badge + queue depth */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span
                      style={{
                        fontSize: 9,
                        color: "#94A3B8",
                        border: "1px solid #94A3B844",
                        borderRadius: 3,
                        padding: "1px 5px",
                        letterSpacing: 1,
                        flexShrink: 0,
                        fontFamily: "monospace",
                      }}
                    >
                      {shortId(agent.agent_id)}
                    </span>
                    <StatusBadge status={agent.status} />
                    {(agent.queue_depth ?? 0) > 0 && (
                      <span
                        style={{
                          fontSize: 9,
                          color: ACCENT,
                          border: `1px solid ${ACCENT}44`,
                          borderRadius: 3,
                          padding: "1px 5px",
                          letterSpacing: 1,
                        }}
                      >
                        Q:{agent.queue_depth}
                      </span>
                    )}
                    <span style={{ flex: 1 }} />
                    {spawnAge && (
                      <span style={{ fontSize: 9, color: S.text, letterSpacing: 0.5 }}>
                        {spawnAge}
                      </span>
                    )}
                  </div>

                  {/* Row 2: kind badge + heartbeat age */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <KindBadge kind={agent.kind} />
                    {hbAge && (
                      <span style={{ fontSize: 9, color: S.text, letterSpacing: 0.5 }}>
                        hb {hbAge}
                      </span>
                    )}
                    {agent.error && (
                      <span
                        style={{
                          fontSize: 9,
                          color: "#EF4444",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          flex: 1,
                        }}
                      >
                        {String(agent.error).slice(0, 40)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "8px 14px",
            borderTop: `1px solid ${S.border}`,
            fontSize: 9,
            color: S.text,
            letterSpacing: 1,
            flexShrink: 0,
          }}
        >
          POLL 30 S · GET /v1/inf-swarm/agents
        </div>
      </div>
    </>
  );
}
