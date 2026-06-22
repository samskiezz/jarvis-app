/**
 * HistoryLakeCatalog — compact LAKE pill in the APEX breadcrumb strip.
 * Polls GET /v1/history/series every 5 min; shows total series count.
 * Clicking the pill opens a floating catalog of all tracked time-series.
 * Mounted in src/Layout.jsx inside the breadcrumb strip div.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000;
const LIME = "#84CC16";
const CY = "#29E7FF";

function relTime(ts_ms) {
  if (!ts_ms) return "—";
  const diff = Math.floor((Date.now() - ts_ms) / 1000);
  if (diff < 0) return "just now";
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function HistoryLakeCatalog() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    let alive = true;
    kimiClient
      .request("/v1/history/series")
      .then((d) => {
        if (alive) { setData(d); setErr(false); }
      })
      .catch(() => {
        if (alive) setErr(true);
      });

    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => {
      alive = false;
      clearTimeout(timerRef.current);
    };
  }, [tick]);

  const items = data?.items ?? [];
  const count = data?.count ?? items.length;

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="History Lake series catalog"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          background: err ? "#450A0A" : open ? `${LIME}18` : "transparent",
          border: `1px solid ${err ? "#EF444444" : LIME + "44"}`,
          borderRadius: 10,
          padding: "1px 8px",
          fontFamily: S.mono,
          cursor: "pointer",
          color: err ? "#FCA5A5" : LIME,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: err ? "#EF4444" : LIME,
            flexShrink: 0,
            boxShadow: err ? "none" : `0 0 4px ${LIME}`,
          }}
        />
        <span style={{ fontSize: S.fs.xxs, letterSpacing: 1 }}>
          {err ? "LAKE ERR" : data ? `LAKE ${count}` : "LAKE …"}
        </span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: 360,
            maxHeight: "60vh",
            overflowY: "auto",
            zIndex: 9999,
            background: "rgba(4,8,14,0.97)",
            border: `1px solid ${LIME}33`,
            borderRadius: 10,
            fontFamily: S.mono,
            boxShadow: `0 8px 32px rgba(0,0,0,0.7), 0 0 0 1px ${LIME}18`,
          }}
        >
          <div
            style={{
              padding: "8px 12px",
              borderBottom: `1px solid ${S.border}`,
              display: "flex",
              alignItems: "center",
              gap: 8,
              position: "sticky",
              top: 0,
              background: "rgba(4,8,14,0.98)",
            }}
          >
            <span style={{ fontSize: S.fs.xs, color: LIME, letterSpacing: 2, flex: 1 }}>
              HISTORY LAKE
            </span>
            <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1 }}>
              {count} series
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "transparent",
                border: "none",
                color: S.text,
                cursor: "pointer",
                fontSize: 14,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {err ? (
            <div
              style={{
                padding: "16px 12px",
                color: "#EF4444",
                fontSize: S.fs.xs,
                letterSpacing: 1,
              }}
            >
              ENDPOINT UNREACHABLE
            </div>
          ) : !data ? (
            <div
              style={{
                padding: "16px 12px",
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
                padding: "16px 12px",
                color: S.text,
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              NO SERIES RECORDED
            </div>
          ) : (
            items.map((s) => (
              <div
                key={s.series_id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "6px 12px",
                  borderBottom: `1px solid ${S.border}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: S.fs.xxs,
                      color: S.textHi,
                      letterSpacing: 0.5,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {s.entity} / {s.metric}
                    {s.unit ? ` (${s.unit})` : ""}
                  </div>
                  <div
                    style={{
                      fontSize: S.fs.xxs,
                      color: S.text,
                      letterSpacing: 1,
                      marginTop: 1,
                    }}
                  >
                    {s.source} · {s.freq} · {s.n_obs ?? 0} obs
                  </div>
                </div>
                <div
                  style={{
                    fontSize: S.fs.xxs,
                    color: `${CY}88`,
                    letterSpacing: 1,
                    flexShrink: 0,
                    textAlign: "right",
                  }}
                >
                  {relTime(s.last_ts)}
                </div>
              </div>
            ))
          )}

          <div
            style={{
              padding: "5px 12px",
              borderTop: `1px solid ${S.border}`,
              fontSize: S.fs.xxs,
              color: S.text,
              letterSpacing: 1,
            }}
          >
            5 MIN POLL · /v1/history/series
          </div>
        </div>
      )}
    </div>
  );
}
