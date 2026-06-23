/**
 * WorkshopAppsDrawer — F50
 * Right-edge slide-in at 31 % vertical. Polls GET /v1/workshop/apps every 5 min.
 * Each row shows: app name, published badge, owner, layout widget count, relative age.
 * Tab: APPS ▶  Accent: teal (#14B8A6)
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000;
const DRAWER_W = 300;
const TEAL = "#14B8A6";

function relTime(ts_ms) {
  if (!ts_ms) return "—";
  const ts = ts_ms > 1e12 ? ts_ms : ts_ms * 1000;
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function widgetCount(layout) {
  if (!layout || typeof layout !== "object") return 0;
  if (Array.isArray(layout.widgets)) return layout.widgets.length;
  if (Array.isArray(layout.items)) return layout.items.length;
  if (Array.isArray(layout.panels)) return layout.panels.length;
  return Object.keys(layout).length;
}

function PublishedBadge({ published }) {
  const col = published ? "#22C55E" : "#4B5563";
  return (
    <span style={{
      fontFamily: S.mono, fontSize: S.fs?.xxs ?? 9,
      color: col, border: `1px solid ${col}55`, borderRadius: 3,
      padding: "1px 5px", letterSpacing: 1, textTransform: "uppercase", flexShrink: 0,
    }}>
      {published ? "PUB" : "DRAFT"}
    </span>
  );
}

export default function WorkshopAppsDrawer() {
  const [open, setOpen]   = useState(false);
  const [items, setItems] = useState(null);
  const [err, setErr]     = useState(false);
  const [tick, bump]      = useReducer((n) => n + 1, 0);
  const timerRef          = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    kimiClient
      .request("/v1/workshop/apps")
      .then((d) => {
        if (!alive) return;
        const arr = Array.isArray(d) ? d : (d?.apps ?? d?.items ?? []);
        setItems(arr);
        setErr(false);
      })
      .catch(() => { if (alive) setErr(true); });

    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => { alive = false; clearTimeout(timerRef.current); };
  }, [open, tick]);

  const count = items?.length ?? 0;

  return (
    <>
      {/* Tab toggle */}
      <div
        onClick={() => setOpen((o) => !o)}
        title="Workshop Apps — GET /v1/workshop/apps"
        style={{
          position: "fixed", right: open ? DRAWER_W : 0, top: "31%",
          zIndex: 120, cursor: "pointer",
          background: open ? TEAL : "rgba(5,8,13,0.82)",
          color: open ? "#04060A" : TEAL,
          border: `1px solid ${TEAL}77`,
          borderRight: open ? "none" : `1px solid ${TEAL}77`,
          borderRadius: open ? "6px 0 0 6px" : "6px 0 0 6px",
          padding: "6px 5px",
          fontSize: 9, fontFamily: S.mono, letterSpacing: 1.5,
          writingMode: "vertical-rl", textOrientation: "mixed",
          userSelect: "none", backdropFilter: "blur(6px)",
          boxShadow: `0 0 14px ${TEAL}33`,
          transition: "right 0.25s ease",
        }}
      >
        APPS {count > 0 ? `(${count})` : "▶"}
      </div>

      {/* Drawer */}
      <div style={{
        position: "fixed", right: open ? 0 : -DRAWER_W - 2, top: 0, bottom: 0,
        width: DRAWER_W, zIndex: 119,
        background: "rgba(5,8,13,0.92)", borderLeft: `1px solid ${TEAL}44`,
        backdropFilter: "blur(12px)", display: "flex", flexDirection: "column",
        transition: "right 0.25s ease",
        fontFamily: S.mono, color: "#DCEBF5",
      }}>
        {/* Header */}
        <div style={{
          padding: "10px 14px 8px", borderBottom: `1px solid ${TEAL}33`,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ color: TEAL, fontSize: 10, letterSpacing: 2, fontWeight: 700 }}>
            WORKSHOP APPS
          </span>
          <span style={{ marginLeft: "auto", fontSize: 9, color: "#6B7280" }}>
            {items === null ? "…" : `${count} app${count !== 1 ? "s" : ""}`}
          </span>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {err && (
            <div style={{ padding: "14px", color: "#EF4444", fontSize: 10, textAlign: "center" }}>
              ENDPOINT ERROR — /v1/workshop/apps
            </div>
          )}
          {!err && items === null && (
            <div style={{ padding: "14px", color: "#6B7280", fontSize: 10, textAlign: "center" }}>
              LOADING…
            </div>
          )}
          {!err && items !== null && items.length === 0 && (
            <div style={{ padding: "14px", color: "#6B7280", fontSize: 10, textAlign: "center" }}>
              NO WORKSHOP APPS FOUND
            </div>
          )}
          {!err && items !== null && items.map((app) => {
            const ts = app.updated_at ?? app.created_at ?? 0;
            const wc = widgetCount(app.layout);
            return (
              <div key={app.id} style={{
                padding: "8px 14px", borderBottom: `1px solid ${TEAL}11`,
              }}>
                <div style={{
                  fontSize: 11, marginBottom: 5, whiteSpace: "nowrap",
                  overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {app.name || app.id}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <PublishedBadge published={app.is_published} />
                  {app.owner_id && (
                    <span style={{
                      fontSize: 9, color: "#9CA3AF",
                      whiteSpace: "nowrap", overflow: "hidden",
                      textOverflow: "ellipsis", maxWidth: 90,
                    }}>
                      {app.owner_id}
                    </span>
                  )}
                  {wc > 0 && (
                    <span style={{ fontSize: 9, color: TEAL }}>
                      {wc}w
                    </span>
                  )}
                  <span style={{ marginLeft: "auto", fontSize: 9, color: "#4B5563", flexShrink: 0 }}>
                    {relTime(ts)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: "6px 14px", borderTop: `1px solid ${TEAL}22`,
          fontSize: 9, color: "#374151", letterSpacing: 1,
        }}>
          GET /v1/workshop/apps · 5 min poll
        </div>
      </div>
    </>
  );
}
