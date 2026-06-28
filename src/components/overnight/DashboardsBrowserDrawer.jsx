/**
 * F160: Dashboards Browser Drawer
 * Right-edge slide-in at 43%; polls GET /v1/dashboards every 5 min.
 * Click a row → fetches GET /v1/dashboards/{id} and expands widget list inline.
 * Teal (#2DD4BF) accent.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const ACCENT = "#2DD4BF";
const DRAWER_W = 340;
const POLL_MS = 300_000; // 5 min

function relAge(ts) {
  if (!ts) return "";
  const secs = Math.floor((Date.now() - Number(ts)) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function widgetTypeBadge(type) {
  const colors = {
    stat: "#38BDF8",
    chart: "#A78BFA",
    list: "#4ADE80",
    objects: "#FB923C",
    table: "#FBBF24",
  };
  const c = colors[type] ?? ACCENT;
  return (
    <span
      style={{
        background: `${c}22`,
        border: `1px solid ${c}55`,
        color: c,
        borderRadius: 3,
        padding: "1px 5px",
        fontSize: 8,
        fontFamily: S.mono,
        letterSpacing: 1,
        textTransform: "uppercase",
        flexShrink: 0,
      }}
    >
      {type ?? "?"}
    </span>
  );
}

export default function DashboardsBrowserDrawer() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState({});
  const [detailLoading, setDetailLoading] = useState({});
  const cache = useRef({});

  const fetchList = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await kimiClient.request("/v1/dashboards");
      setItems(Array.isArray(res?.items) ? res.items : []);
    } catch (e) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const run = async () => { if (alive) await fetchList(); };
    run();
    const id = setInterval(() => { if (alive) fetchList(); }, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [open, fetchList]);

  async function toggleExpand(dash) {
    if (expanded === dash.id) { setExpanded(null); return; }
    setExpanded(dash.id);
    if (cache.current[dash.id]) { setDetail((p) => ({ ...p, [dash.id]: cache.current[dash.id] })); return; }
    setDetailLoading((p) => ({ ...p, [dash.id]: true }));
    try {
      const res = await kimiClient.request(`/v1/dashboards/${dash.id}`);
      cache.current[dash.id] = res;
      setDetail((p) => ({ ...p, [dash.id]: res }));
    } catch (_) {}
    finally { setDetailLoading((p) => ({ ...p, [dash.id]: false })); }
  }

  return (
    <>
      {/* Tab */}
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "43%",
          zIndex: 9000,
          writingMode: "vertical-rl",
          background: `${ACCENT}22`,
          border: `1px solid ${ACCENT}66`,
          borderRight: open ? "none" : `1px solid ${ACCENT}66`,
          borderRadius: open ? "6px 0 0 6px" : "0 6px 6px 0",
          padding: "10px 5px",
          cursor: "pointer",
          color: ACCENT,
          fontSize: S.fs?.xxs ?? 10,
          fontFamily: S.mono,
          letterSpacing: 2,
          transition: "right 0.2s ease",
          userSelect: "none",
        }}
      >
        DASH
      </div>

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: open ? 0 : -DRAWER_W,
          width: DRAWER_W,
          height: "100vh",
          zIndex: 8996,
          background: "rgba(5,10,18,0.97)",
          borderLeft: `1px solid ${ACCENT}44`,
          backdropFilter: S.blur ?? "blur(12px)",
          transition: "right 0.2s ease",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 14px 10px",
            borderBottom: `1px solid ${ACCENT}33`,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <span style={{ color: ACCENT, fontSize: 13, fontFamily: S.mono }}>◈</span>
          <span
            style={{
              color: S.textHi ?? "#DCEBF5",
              fontFamily: S.mono,
              fontSize: S.fs?.xs ?? 11,
              letterSpacing: 1,
              flex: 1,
            }}
          >
            DASHBOARDS
          </span>
          {loading && (
            <span style={{ color: `${ACCENT}88`, fontSize: 9, fontFamily: S.mono }}>
              POLLING…
            </span>
          )}
          <span
            style={{
              color: `${ACCENT}88`,
              fontSize: 9,
              fontFamily: S.mono,
              background: `${ACCENT}22`,
              border: `1px solid ${ACCENT}44`,
              borderRadius: 3,
              padding: "1px 5px",
            }}
          >
            {items.length}
          </span>
          <span
            onClick={() => setOpen(false)}
            style={{ color: S.text ?? "#7A95AB", cursor: "pointer", fontSize: 14, lineHeight: 1 }}
          >
            ✕
          </span>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
          {err && (
            <div style={{ color: "#EF4444", fontSize: 10, fontFamily: S.mono, marginBottom: 8 }}>
              {err}
            </div>
          )}

          {!loading && items.length === 0 && !err && (
            <div
              style={{
                color: S.text ?? "#7A95AB",
                fontSize: 10,
                fontFamily: S.mono,
                textAlign: "center",
                marginTop: 28,
              }}
            >
              No dashboards saved
            </div>
          )}

          {items.map((dash) => {
            const isOpen = expanded === dash.id;
            const widgets = Array.isArray(dash.widgets) ? dash.widgets : [];
            const det = detail[dash.id];
            const detWidgets = det && Array.isArray(det.widgets) ? det.widgets : widgets;

            return (
              <div
                key={dash.id}
                style={{
                  marginBottom: 6,
                  background: `${ACCENT}08`,
                  border: `1px solid ${isOpen ? ACCENT + "66" : ACCENT + "22"}`,
                  borderRadius: 6,
                  overflow: "hidden",
                  transition: "border-color 0.15s",
                }}
              >
                {/* Row */}
                <div
                  onClick={() => toggleExpand(dash)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 10px",
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <span
                    style={{
                      color: ACCENT,
                      fontSize: 9,
                      fontFamily: S.mono,
                      flexShrink: 0,
                      opacity: 0.6,
                    }}
                  >
                    #{dash.id}
                  </span>
                  <span
                    style={{
                      color: S.textHi ?? "#DCEBF5",
                      fontFamily: S.mono,
                      fontSize: 11,
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {dash.name ?? "Unnamed"}
                  </span>
                  <span
                    style={{
                      color: `${ACCENT}99`,
                      fontFamily: S.mono,
                      fontSize: 9,
                      flexShrink: 0,
                    }}
                  >
                    {widgets.length}w
                  </span>
                  <span
                    style={{
                      color: S.text ?? "#7A95AB",
                      fontFamily: S.mono,
                      fontSize: 9,
                      flexShrink: 0,
                    }}
                  >
                    {relAge(dash.created_ts)}
                  </span>
                  <span
                    style={{
                      color: `${ACCENT}88`,
                      fontSize: 10,
                      fontFamily: S.mono,
                      flexShrink: 0,
                    }}
                  >
                    {isOpen ? "▲" : "▼"}
                  </span>
                </div>

                {/* Expanded widget list */}
                {isOpen && (
                  <div
                    style={{
                      borderTop: `1px solid ${ACCENT}22`,
                      padding: "6px 10px 8px",
                    }}
                  >
                    {detailLoading[dash.id] && (
                      <div
                        style={{
                          color: `${ACCENT}88`,
                          fontSize: 9,
                          fontFamily: S.mono,
                          marginBottom: 4,
                        }}
                      >
                        loading…
                      </div>
                    )}
                    {detWidgets.length === 0 && !detailLoading[dash.id] && (
                      <div
                        style={{ color: S.text ?? "#7A95AB", fontSize: 9, fontFamily: S.mono }}
                      >
                        No widgets
                      </div>
                    )}
                    {detWidgets.map((w, wi) => (
                      <div
                        key={wi}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          marginBottom: 4,
                        }}
                      >
                        {widgetTypeBadge(w.type ?? w.kind)}
                        <span
                          style={{
                            color: S.text ?? "#7A95AB",
                            fontFamily: S.mono,
                            fontSize: 9,
                            flex: 1,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {w.title ?? w.source ?? w.label ?? `widget ${wi + 1}`}
                        </span>
                        {w.source && w.title && (
                          <span
                            style={{
                              color: `${ACCENT}66`,
                              fontFamily: S.mono,
                              fontSize: 8,
                              flexShrink: 0,
                            }}
                          >
                            {w.source}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "6px 12px",
            borderTop: `1px solid ${ACCENT}22`,
            display: "flex",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <span style={{ color: `${ACCENT}66`, fontFamily: S.mono, fontSize: 9 }}>
            GET /v1/dashboards · 5 min poll
          </span>
          <span style={{ color: `${ACCENT}66`, fontFamily: S.mono, fontSize: 9 }}>
            {items.length} dashboard{items.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </>
  );
}
