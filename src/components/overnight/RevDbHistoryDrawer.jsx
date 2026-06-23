/**
 * RevDbHistoryDrawer — Feature 54
 * Right-edge slide-in drawer showing the knowledge revision history from
 * GET /v1/revdb/history?limit=20, polling every 5 min while open.
 * Also fetches GET /v1/revdb/branches for the branch count shown in the header.
 * Tab at 85 % from top on the right edge (between GraphCentralityDrawer 80 %
 * and ActivityFeedPanel 90 %).
 *
 * Mounted in src/Layout.jsx after AutomationRulesPanel.
 *
 * Endpoint: GET /v1/revdb/history?limit=20
 * → { items: [{ id, parent_id, author, message, timestamp, diff_hash, changes: [...] }], count }
 * Endpoint: GET /v1/revdb/branches
 * → { items: [{ name, ... }], count }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000;
const DRAWER_W = 340;
const ACCENT = "#94A3B8";
const AMBER = "#F5A623";

function relAge(ts) {
  if (!ts) return "";
  const diffS = Math.floor((Date.now() - ts) / 1000);
  if (diffS < 60) return `${diffS}s ago`;
  if (diffS < 3600) return `${Math.floor(diffS / 60)}m ago`;
  if (diffS < 86400) return `${Math.floor(diffS / 3600)}h ago`;
  return `${Math.floor(diffS / 86400)}d ago`;
}

function shortId(id) {
  if (!id) return "???";
  return String(id).slice(0, 8);
}

export default function RevDbHistoryDrawer() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [branches, setBranches] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    Promise.all([
      kimiClient.request("/v1/revdb/history?limit=20"),
      kimiClient.request("/v1/revdb/branches"),
    ])
      .then(([hist, br]) => {
        if (!alive) return;
        setData(hist);
        setBranches(br);
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
  const branchCount = branches?.count ?? branches?.items?.length ?? null;

  return (
    <>
      {/* Fixed toggle tab — right edge, 85 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close revision history" : "Open revision history"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "85%",
          transform: open
            ? "translateY(-50%) rotate(180deg)"
            : "translateY(-50%)",
          zIndex: 9000,
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
        {open ? "HIST ▶" : "HIST ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8994,
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
          }}
        >
          <span style={{ fontSize: S.fs.xs, color: ACCENT, letterSpacing: 2, flex: 1 }}>
            REVDB COMMITS
          </span>
          {branchCount !== null && (
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
              {branchCount} {branchCount === 1 ? "BRANCH" : "BRANCHES"}
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {!open ? null : err ? (
            <div style={{ padding: "20px 14px", color: AMBER, fontSize: S.fs.xs, letterSpacing: 1 }}>
              ENDPOINT UNREACHABLE
            </div>
          ) : !data ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              NO COMMITS RECORDED
            </div>
          ) : (
            items.map((commit) => {
              const changeCount = Array.isArray(commit.changes) ? commit.changes.length : 0;
              return (
                <div
                  key={commit.id}
                  style={{
                    padding: "9px 14px",
                    borderBottom: `1px solid ${S.border}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  {/* Commit ID + age */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        fontSize: 9,
                        color: ACCENT,
                        border: `1px solid ${ACCENT}44`,
                        borderRadius: 3,
                        padding: "1px 5px",
                        letterSpacing: 1,
                        flexShrink: 0,
                        fontFamily: "monospace",
                      }}
                    >
                      {shortId(commit.id)}
                    </span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 9, color: S.text, letterSpacing: 0.5 }}>
                      {relAge(commit.timestamp)}
                    </span>
                  </div>

                  {/* Message */}
                  <span
                    style={{
                      color: "#DCEBF5",
                      fontSize: S.fs.xs,
                      letterSpacing: 0.5,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {(commit.message || "(no message)").slice(0, 55)}
                  </span>

                  {/* Author + changes count */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {commit.author && (
                      <span style={{ fontSize: 9, color: S.text, letterSpacing: 0.5 }}>
                        by {commit.author}
                      </span>
                    )}
                    {changeCount > 0 && (
                      <span
                        style={{
                          fontSize: 9,
                          color: `${ACCENT}cc`,
                          border: `1px solid ${ACCENT}33`,
                          borderRadius: 3,
                          padding: "1px 5px",
                          letterSpacing: 1,
                        }}
                      >
                        {changeCount} Δ
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
