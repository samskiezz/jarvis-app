/**
 * Sci3dCatalogDrawer — left-edge slide-in drawer listing the 3D science geometry
 * datasets from GET /v1/sci/3d/catalog.
 *
 * Tab sits at 26 % from top, between IntelProfileDirectory (24 %) and
 * GeoObjectsDrawer (28 %). Catalog is fetched once per open (static data).
 *
 * Type badges: molecule (cyan), orbital (sky-blue), trajectory (lime).
 * Count badge shows atoms / points / waypoints per dataset.
 * Accent colour: #A78BFA (violet-400).
 *
 * Real endpoint:
 *   GET /v1/sci/3d/catalog
 *   → { datasets: [{ id, type, label, atoms?, points?, waypoints? }], total: N }
 *
 * Mounted in src/Layout.jsx after <BrainCrmPeopleDrawer />.
 */
import { useEffect, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const DRAWER_W = 340;
const ACCENT = "#A78BFA";

const TYPE_COLORS = {
  molecule: "#22D3EE",
  orbital: "#38BDF8",
  trajectory: "#84CC16",
};

function typeColor(t) {
  return TYPE_COLORS[t] ?? ACCENT;
}

function countLabel(dataset) {
  if (dataset.atoms != null) return `${dataset.atoms} atoms`;
  if (dataset.points != null) return `${dataset.points} pts`;
  if (dataset.waypoints != null) return `${dataset.waypoints} wpts`;
  return null;
}

export default function Sci3dCatalogDrawer() {
  const [open, setOpen] = useState(false);
  const [datasets, setDatasets] = useState(null);
  const [err, setErr] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (!open || fetched) return;
    let alive = true;
    kimiClient
      .request("/v1/sci/3d/catalog")
      .then((d) => {
        if (!alive) return;
        const list = Array.isArray(d)
          ? d
          : d?.datasets ?? d?.items ?? d?.results ?? [];
        setDatasets(list);
        setFetched(true);
      })
      .catch(() => {
        if (alive) setErr(true);
      });
    return () => {
      alive = false;
    };
  }, [open, fetched]);

  return (
    <>
      {/* Toggle tab — left edge, 26 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close 3D geometry catalog" : "Open 3D science geometry catalog"}
        style={{
          position: "fixed",
          left: open ? DRAWER_W : 0,
          top: "26%",
          zIndex: 8985,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${ACCENT}55`,
          borderLeft: open ? "none" : `1px solid ${ACCENT}55`,
          color: ACCENT,
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
        {open ? "3D ▶" : "3D ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          left: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8980,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderRight: `1px solid ${ACCENT}33`,
          display: "flex",
          flexDirection: "column",
          transition: "left 0.2s ease",
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
          <span
            style={{
              fontSize: S.fs.xs,
              color: ACCENT,
              letterSpacing: 2,
              flex: 1,
            }}
          >
            3D GEOMETRY CATALOG
          </span>
          {datasets != null && (
            <span
              style={{
                fontSize: S.fs.xxs,
                color: `${ACCENT}CC`,
                fontFamily: S.mono,
                letterSpacing: 1,
                background: `${ACCENT}18`,
                border: `1px solid ${ACCENT}44`,
                borderRadius: 3,
                padding: "1px 6px",
              }}
            >
              {datasets.length} datasets
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {!open ? null : err ? (
            <div
              style={{
                padding: "20px 14px",
                color: "#F43F5E",
                fontSize: S.fs.xs,
                letterSpacing: 1,
              }}
            >
              ENDPOINT UNREACHABLE
            </div>
          ) : !datasets ? (
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
          ) : datasets.length === 0 ? (
            <div
              style={{
                padding: "20px 14px",
                color: S.text,
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              NO 3D DATASETS FOUND
            </div>
          ) : (
            datasets.map((ds, i) => {
              const tc = typeColor(ds.type);
              const cnt = countLabel(ds);
              return (
                <div
                  key={ds.id ?? i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 14px",
                    borderBottom: `1px solid ${S.border}`,
                  }}
                >
                  {/* type badge */}
                  <span
                    style={{
                      fontSize: S.fs.xxs,
                      color: tc,
                      background: `${tc}18`,
                      border: `1px solid ${tc}44`,
                      borderRadius: 3,
                      padding: "1px 5px",
                      letterSpacing: 1,
                      flexShrink: 0,
                      textTransform: "uppercase",
                    }}
                  >
                    {ds.type ?? "?"}
                  </span>

                  {/* label */}
                  <span
                    style={{
                      flex: 1,
                      fontSize: S.fs.xs,
                      color: S.textHi,
                      letterSpacing: 0.5,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {ds.label ?? ds.id}
                  </span>

                  {/* count badge */}
                  {cnt && (
                    <span
                      style={{
                        fontSize: S.fs.xxs,
                        color: S.text,
                        fontFamily: S.mono,
                        letterSpacing: 0.5,
                        flexShrink: 0,
                        opacity: 0.75,
                      }}
                    >
                      {cnt}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "6px 14px",
            borderTop: `1px solid ${S.border}`,
            fontSize: S.fs.xxs,
            color: S.text,
            letterSpacing: 1,
            flexShrink: 0,
          }}
        >
          /v1/sci/3d/catalog · STATIC CATALOG
        </div>
      </div>
    </>
  );
}
