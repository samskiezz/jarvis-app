/**
 * DatasetsCatalogDrawer — F85: Datasets Catalog
 * Left-edge slide-in drawer listing every indexed dataset from
 * GET /v1/datasets. Polls every 5 minutes while open.
 *
 * Tab sits at 62 % from top (between ProofPacksDrawer 60 % and
 * TaskMissionsPanel 65 %).
 * Each row shows: dataset name, row count badge, source type, and
 * relative last-updated timestamp. A client-side filter input narrows
 * the list.
 *
 * Mounted in src/Layout.jsx after GraphTimeScrubber.
 *
 * Endpoint: GET /v1/datasets
 * → array  OR  { datasets: [...] }  OR  { items: [...] }
 * Each item: { id, name|title|dataset_name, row_count|rows|count,
 *              source|source_type|type, updated_at|last_updated|created_at,
 *              description? }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000;
const DRAWER_W = 340;
const LIME = "#84CC16";

function relAge(ts) {
  if (!ts) return "—";
  const epoch = typeof ts === "number" ? ts : Date.parse(ts);
  if (isNaN(epoch)) return "—";
  const sec = Math.floor((Date.now() - epoch) / 1000);
  if (sec < 0) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function fmtRows(n) {
  if (n == null) return null;
  const v = typeof n === "number" ? n : parseInt(n, 10);
  if (isNaN(v)) return null;
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString();
}

function toRows(d) {
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.datasets)) return d.datasets;
  if (Array.isArray(d?.items)) return d.items;
  if (Array.isArray(d?.data)) return d.data;
  return [];
}

export default function DatasetsCatalogDrawer() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [filter, setFilter] = useState("");
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request("/v1/datasets")
      .then((d) => {
        if (alive) {
          setData(d);
          setErr(false);
        }
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

  const all = toRows(data);
  const q = filter.trim().toLowerCase();
  const visible = q
    ? all.filter((ds) => {
        const hay = [
          ds.name, ds.title, ds.dataset_name,
          ds.source, ds.source_type, ds.type,
          ds.description, ds.id,
        ].join(" ").toLowerCase();
        return hay.includes(q);
      })
    : all;

  return (
    <>
      {/* Fixed toggle tab — left edge, 62 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close datasets catalog" : "Open datasets catalog"}
        style={{
          position: "fixed",
          left: open ? DRAWER_W : 0,
          top: "62%",
          transform: open
            ? "translateY(-50%) rotate(180deg)"
            : "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${LIME}55`,
          borderLeft: open ? "none" : `1px solid ${LIME}55`,
          color: LIME,
          fontFamily: S.mono,
          fontSize: S.fs.xxs,
          letterSpacing: 2,
          padding: "10px 5px",
          cursor: "pointer",
          borderRadius: "0 4px 4px 0",
          transition: "left 0.2s ease",
          userSelect: "none",
        }}
      >
        {open ? `DATASETS ▶` : `DATASETS ◀`}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          left: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8999,
          background: "rgba(3,8,18,0.97)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderRight: `1px solid ${LIME}44`,
          display: "flex",
          flexDirection: "column",
          fontFamily: S.mono,
          fontSize: S.fs.xs,
          transition: "left 0.2s ease",
          overflowY: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 14px 8px",
            borderBottom: `1px solid ${LIME}33`,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ color: LIME, letterSpacing: 2, fontWeight: 700 }}>
            DATASETS CATALOG
          </span>
          <span
            style={{
              marginLeft: "auto",
              background: `${LIME}22`,
              color: LIME,
              borderRadius: 3,
              padding: "1px 5px",
              fontSize: S.fs.xxs,
              letterSpacing: 1,
            }}
          >
            {visible.length} / {all.length}
          </span>
          <button
            onClick={() => bump()}
            title="Reload"
            style={{
              background: "transparent",
              border: `1px solid ${LIME}44`,
              borderRadius: 3,
              color: LIME,
              cursor: "pointer",
              fontSize: S.fs.xxs,
              letterSpacing: 1,
              padding: "1px 5px",
              fontFamily: "inherit",
            }}
          >
            ↺
          </button>
        </div>

        {/* Filter */}
        <div
          style={{
            padding: "7px 14px",
            borderBottom: `1px solid ${LIME}22`,
            flexShrink: 0,
          }}
        >
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter datasets…"
            style={{
              width: "100%",
              background: `${LIME}08`,
              border: `1px solid ${LIME}33`,
              borderRadius: 3,
              color: "#C8DDE8",
              fontSize: S.fs.xxs,
              fontFamily: "inherit",
              letterSpacing: 0.5,
              padding: "4px 8px",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {err && (
            <div
              style={{
                padding: "12px 14px",
                color: "#FF5555",
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              ERROR — /v1/datasets unreachable
            </div>
          )}
          {!err && !data && (
            <div
              style={{
                padding: "16px 14px",
                color: "#4E6070",
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              LOADING…
            </div>
          )}
          {!err && data && visible.length === 0 && (
            <div
              style={{
                padding: "16px 14px",
                color: "#4E6070",
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              NO DATASETS
            </div>
          )}
          {visible.map((ds, i) => {
            const name =
              ds.name || ds.title || ds.dataset_name || String(ds.id || `dataset-${i}`);
            const rowCount = fmtRows(
              ds.row_count ?? ds.rows ?? ds.count ?? ds.record_count ?? null
            );
            const src = ds.source || ds.source_type || ds.type || null;
            const ts = ds.updated_at || ds.last_updated || ds.created_at || null;
            const desc = ds.description;

            return (
              <div
                key={ds.id ?? i}
                style={{
                  padding: "8px 14px",
                  borderBottom: `1px solid ${LIME}11`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      color: "#ADC1CD",
                      fontSize: S.fs.xs,
                      flex: 1,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {name}
                  </span>
                  {rowCount != null && (
                    <span
                      style={{
                        background: `${LIME}22`,
                        color: LIME,
                        borderRadius: 3,
                        padding: "1px 5px",
                        fontSize: S.fs.xxs,
                        letterSpacing: 0.5,
                        flexShrink: 0,
                        border: `1px solid ${LIME}33`,
                      }}
                    >
                      {rowCount} rows
                    </span>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {src && (
                    <span
                      style={{
                        background: "rgba(132,204,22,0.08)",
                        color: LIME,
                        borderRadius: 3,
                        padding: "1px 4px",
                        fontSize: S.fs.xxs,
                        letterSpacing: 0.8,
                        border: `1px solid ${LIME}22`,
                        textTransform: "uppercase",
                      }}
                    >
                      {String(src).slice(0, 12)}
                    </span>
                  )}
                  {desc && (
                    <span
                      style={{
                        color: "#4E6070",
                        fontSize: S.fs.xxs,
                        flex: 1,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {desc}
                    </span>
                  )}
                  <span
                    style={{
                      color: "#4E6070",
                      fontSize: S.fs.xxs,
                      letterSpacing: 0.5,
                      marginLeft: "auto",
                      flexShrink: 0,
                    }}
                  >
                    {relAge(ts)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: `1px solid ${LIME}22`,
            padding: "5px 14px",
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <span style={{ color: "#2E4050", fontSize: S.fs.xxs, letterSpacing: 1 }}>
            GET /v1/datasets · 5 min poll
          </span>
        </div>
      </div>
    </>
  );
}
