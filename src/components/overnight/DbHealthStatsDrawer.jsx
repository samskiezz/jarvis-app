/**
 * DbHealthStatsDrawer — F127
 * Right-edge slide-in drawer at 29 % from top.
 * Shows active database backend health + live note counts.
 *
 * Endpoints polled on open (every 60 s):
 *   GET /v1/jarvis/db/health → { backend, active, postgres, sqlite_brain_path }
 *   GET /v1/jarvis/db/stats  → { backend, active, sqlite: { total }, postgres: { available, total } }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS  = 60_000;
const DRAWER_W = 300;
const EMERALD  = "#10B981";
const RED      = "#E8203C";
const AMBER    = "#F59E0B";
const SLATE    = "#64748B";
const CYAN     = "#22D3EE";

function StatusDot({ ok }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: ok ? EMERALD : RED,
        flexShrink: 0,
        boxShadow: ok ? `0 0 5px ${EMERALD}88` : `0 0 5px ${RED}88`,
      }}
    />
  );
}

function Tile({ label, value, accent }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${accent ?? EMERALD}22`,
        borderRadius: 4,
        padding: "6px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1 }}>
        {label}
      </span>
      <span style={{ fontSize: S.fs.sm, color: accent ?? EMERALD, letterSpacing: 1 }}>
        {value ?? "—"}
      </span>
    </div>
  );
}

export default function DbHealthStatsDrawer() {
  const [open, setOpen]     = useState(false);
  const [health, setHealth] = useState(null);
  const [stats, setStats]   = useState(null);
  const [err, setErr]       = useState(false);
  const [tick, bump]        = useReducer((n) => n + 1, 0);
  const timerRef            = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    Promise.all([
      kimiClient.request("/v1/jarvis/db/health"),
      kimiClient.request("/v1/jarvis/db/stats"),
    ])
      .then(([h, s]) => {
        if (!alive) return;
        setHealth(h);
        setStats(s);
        setErr(false);
      })
      .catch(() => { if (alive) setErr(true); });

    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => {
      alive = false;
      clearTimeout(timerRef.current);
    };
  }, [open, tick]);

  const active  = health?.active ?? stats?.active ?? "—";
  const isLive  = active === "postgres" || active === "sqlite";
  const pgOk    = health?.postgres?.available ?? false;
  const sqliteNotes  = stats?.sqlite?.total ?? "—";
  const postgresNotes = stats?.postgres?.total ?? "—";

  return (
    <>
      {/* Fixed toggle tab — right edge, 29 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close DB health" : "Open DB health"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "29%",
          transform: open
            ? "translateY(-50%) rotate(180deg)"
            : "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${EMERALD}55`,
          borderRight: open ? "none" : `1px solid ${EMERALD}55`,
          color: EMERALD,
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
        {open ? "DB HEALTH ▶" : "DB HEALTH ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8988,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderLeft: `1px solid ${EMERALD}33`,
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
          }}
        >
          <StatusDot ok={isLive && !err} />
          <span style={{ fontSize: S.fs.xs, color: EMERALD, letterSpacing: 2, flex: 1 }}>
            DB HEALTH
          </span>
          {health && (
            <span
              style={{
                fontSize: S.fs.xxs,
                color: active === "postgres" ? CYAN : AMBER,
                letterSpacing: 1,
                border: `1px solid ${active === "postgres" ? CYAN : AMBER}44`,
                borderRadius: 3,
                padding: "1px 5px",
                textTransform: "uppercase",
              }}
            >
              {active}
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
          {!open ? null : err ? (
            <div style={{ color: RED, fontSize: S.fs.xs, letterSpacing: 1, padding: "16px 0" }}>
              ENDPOINT UNREACHABLE
            </div>
          ) : !health ? (
            <div style={{ color: S.text, fontSize: S.fs.xxs, letterSpacing: 1, padding: "16px 0" }}>
              LOADING…
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Backend tiles */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Tile
                  label="CONFIGURED"
                  value={(health.backend ?? "—").toUpperCase()}
                  accent={AMBER}
                />
                <Tile
                  label="ACTIVE"
                  value={(active).toUpperCase()}
                  accent={EMERALD}
                />
              </div>

              {/* SQLite section */}
              <div>
                <div
                  style={{
                    fontSize: S.fs.xxs,
                    color: S.text,
                    letterSpacing: 2,
                    marginBottom: 6,
                    borderBottom: `1px solid ${S.border}`,
                    paddingBottom: 4,
                  }}
                >
                  SQLITE
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <Tile label="BRAIN NOTES" value={String(sqliteNotes)} accent={EMERALD} />
                  <div
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: `1px solid ${EMERALD}22`,
                      borderRadius: 4,
                      padding: "6px 10px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1 }}>
                      PATH
                    </span>
                    <span
                      style={{
                        fontSize: S.fs.xxs,
                        color: EMERALD,
                        letterSpacing: 0,
                        wordBreak: "break-all",
                        lineHeight: 1.4,
                      }}
                    >
                      {health.sqlite_brain_path
                        ? health.sqlite_brain_path.split("/").pop()
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>

              {/* PostgreSQL section */}
              <div>
                <div
                  style={{
                    fontSize: S.fs.xxs,
                    color: S.text,
                    letterSpacing: 2,
                    marginBottom: 6,
                    borderBottom: `1px solid ${S.border}`,
                    paddingBottom: 4,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  POSTGRESQL
                  <StatusDot ok={pgOk} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <Tile
                    label="STATUS"
                    value={pgOk ? "ONLINE" : "OFFLINE"}
                    accent={pgOk ? EMERALD : RED}
                  />
                  <Tile
                    label="BRAIN NOTES"
                    value={pgOk ? String(postgresNotes) : "—"}
                    accent={pgOk ? CYAN : SLATE}
                  />
                </div>
                {health.postgres?.error && (
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: S.fs.xxs,
                      color: RED,
                      letterSpacing: 0,
                      lineHeight: 1.4,
                      padding: "4px 6px",
                      background: `${RED}11`,
                      borderRadius: 3,
                      wordBreak: "break-word",
                    }}
                  >
                    {health.postgres.error}
                  </div>
                )}
              </div>

              {/* Poll hint */}
              <div
                style={{
                  fontSize: S.fs.xxs,
                  color: S.text,
                  letterSpacing: 1,
                  textAlign: "right",
                  marginTop: 4,
                }}
              >
                GET /v1/jarvis/db/health+stats · 60 s poll
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
