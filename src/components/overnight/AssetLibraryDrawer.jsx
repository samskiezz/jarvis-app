/**
 * AssetLibraryDrawer — Feature 163
 * Right-edge slide-in drawer at 6 % from top showing the JARVIS 3D render-asset
 * pipeline: status tiles, searchable model library, and manifest render gaps.
 *
 * Endpoints:
 *   GET /v1/jarvis/assets/status  → { library_models, wired_models, gaps, tripo_generation }
 *   GET /v1/jarvis/assets/library → { models: string[], total }  (q=QUERY)
 *   GET /v1/jarvis/assets/gaps    → { gaps: [{ surface, plane, gen }] }
 *
 * Accent: sky-blue (#38BDF8). Tab: ASSETS ▶.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const SKY   = "#38BDF8";
const GREEN = "#22C55E";
const AMBER = "#F59E0B";
const SLATE = "#94A3B8";
const DRAWER_W = 340;
const DEBOUNCE_MS = 350;

export default function AssetLibraryDrawer() {
  const [open, setOpen]       = useState(false);
  const [status, setStatus]   = useState(null);
  const [gaps, setGaps]       = useState(null);
  const [query, setQuery]     = useState("");
  const [models, setModels]   = useState(null);
  const [modErr, setModErr]   = useState(false);
  const [statErr, setStatErr] = useState(false);
  const debRef   = useRef(null);
  const [tick, bump] = useReducer((n) => n + 1, 0);

  /* Fetch status + gaps once when drawer opens */
  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request("/v1/jarvis/assets/status")
      .then((d) => { if (alive) { setStatus(d); setStatErr(false); } })
      .catch(() => { if (alive) setStatErr(true); });

    kimiClient
      .request("/v1/jarvis/assets/gaps")
      .then((d) => { if (alive) setGaps(d?.gaps ?? []); })
      .catch(() => { if (alive) setGaps([]); });

    return () => { alive = false; };
  }, [open, tick]);

  /* Debounced library search */
  useEffect(() => {
    if (!open) return;
    clearTimeout(debRef.current);
    debRef.current = setTimeout(() => {
      let alive = true;
      const qs = query.trim();
      kimiClient
        .request(`/v1/jarvis/assets/library${qs ? `?q=${encodeURIComponent(qs)}` : ""}`)
        .then((d) => {
          if (alive) { setModels(d?.models ?? []); setModErr(false); }
        })
        .catch(() => { if (alive) setModErr(true); });
      return () => { alive = false; };
    }, DEBOUNCE_MS);

    return () => clearTimeout(debRef.current);
  }, [open, query]);

  const planeBadgeColor = (plane) => {
    const p = (plane || "").toLowerCase();
    if (p === "gotham") return "#7C3AED";
    if (p === "jarvis") return SKY;
    if (p === "audit")  return AMBER;
    return SLATE;
  };

  return (
    <>
      {/* Fixed tab — right edge, 6 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close asset library" : "Open render asset library"}
        style={{
          position:        "fixed",
          right:           open ? DRAWER_W : 0,
          top:             "6%",
          transform:       "translateY(-50%)",
          zIndex:          9000,
          writingMode:     "vertical-rl",
          textOrientation: "mixed",
          background:      "rgba(2,6,10,0.92)",
          border:          `1px solid ${SKY}55`,
          borderRight:     open ? "none" : `1px solid ${SKY}55`,
          color:           SKY,
          fontFamily:      S.mono,
          fontSize:        S.fs.xxs,
          letterSpacing:   2,
          padding:         "10px 5px",
          cursor:          "pointer",
          borderRadius:    "4px 0 0 4px",
          transition:      "right 0.2s ease",
          userSelect:      "none",
        }}
      >
        {open ? "ASSETS ▶" : "ASSETS ◀"}
      </button>

      {/* Drawer */}
      <div
        style={{
          position:          "fixed",
          right:             open ? 0 : -DRAWER_W,
          top:               0,
          bottom:            0,
          width:             DRAWER_W,
          zIndex:            8995,
          background:        "rgba(2,6,10,0.96)",
          backdropFilter:    S.blur,
          WebkitBackdropFilter: S.blur,
          borderLeft:        `1px solid ${SKY}33`,
          display:           "flex",
          flexDirection:     "column",
          transition:        "right 0.2s ease",
          fontFamily:        S.mono,
        }}
      >
        {/* Header */}
        <div
          style={{
            display:      "flex",
            alignItems:   "center",
            gap:          8,
            padding:      "10px 14px",
            borderBottom: `1px solid ${S.border}`,
            flexShrink:   0,
          }}
        >
          <span style={{ fontSize: S.fs.xs, color: SKY, letterSpacing: 2, flex: 1 }}>
            RENDER ASSET LIBRARY
          </span>
          <button
            onClick={() => bump()}
            title="Refresh"
            style={{
              background: "none",
              border:     "none",
              color:      `${SKY}88`,
              cursor:     "pointer",
              fontSize:   S.fs.xs,
              padding:    0,
            }}
          >
            ↻
          </button>
        </div>

        {/* Status tiles */}
        {open && (
          <div
            style={{
              display:      "flex",
              gap:          6,
              padding:      "8px 14px",
              borderBottom: `1px solid ${S.border}`,
              flexShrink:   0,
              flexWrap:     "wrap",
            }}
          >
            {statErr ? (
              <span style={{ fontSize: 9, color: AMBER, letterSpacing: 1 }}>
                STATUS UNAVAILABLE
              </span>
            ) : !status ? (
              <span style={{ fontSize: 9, color: S.text, letterSpacing: 1 }}>
                LOADING…
              </span>
            ) : (
              <>
                <Tile label="LIBRARY" value={status.library_models ?? "—"} color={SKY} />
                <Tile label="WIRED"   value={status.wired_models  ?? "—"} color={GREEN} />
                <Tile label="GAPS"    value={status.gaps          ?? "—"} color={AMBER} />
                <Tile
                  label="TRIPO"
                  value={status.tripo_generation ? "ON" : "OFF"}
                  color={status.tripo_generation ? GREEN : SLATE}
                />
              </>
            )}
          </div>
        )}

        {/* Search input */}
        {open && (
          <div style={{ padding: "8px 14px", flexShrink: 0, borderBottom: `1px solid ${S.border}` }}>
            <input
              type="text"
              placeholder="Search 3D models…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                width:       "100%",
                background:  "rgba(255,255,255,0.04)",
                border:      `1px solid ${SKY}44`,
                borderRadius: 3,
                color:       "#DCEBF5",
                fontFamily:  S.mono,
                fontSize:    S.fs.xs,
                padding:     "5px 8px",
                outline:     "none",
                boxSizing:   "border-box",
              }}
            />
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {!open ? null : (
            <>
              {/* Library results */}
              {modErr ? (
                <SectionLabel text="LIBRARY ENDPOINT UNREACHABLE" color={AMBER} />
              ) : !models ? (
                <SectionLabel text="LOADING LIBRARY…" color={S.text} />
              ) : models.length === 0 ? (
                <SectionLabel
                  text={query ? "NO MODELS MATCH QUERY" : "LIBRARY EMPTY"}
                  color={S.text}
                />
              ) : (
                <>
                  <SectionLabel
                    text={`${models.length} MODEL${models.length === 1 ? "" : "S"}${query ? " MATCHING" : ""}`}
                    color={SKY}
                  />
                  {models.map((name) => (
                    <div
                      key={name}
                      style={{
                        padding:      "5px 14px",
                        borderBottom: `1px solid ${S.border}22`,
                        color:        "#DCEBF5",
                        fontSize:     S.fs.xxs,
                        letterSpacing: 0.5,
                        overflow:     "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace:   "nowrap",
                      }}
                      title={name}
                    >
                      {name.replace(/_/g, " ")}
                    </div>
                  ))}
                </>
              )}

              {/* Manifest gaps */}
              {gaps !== null && gaps.length > 0 && (
                <>
                  <SectionLabel text={`${gaps.length} RENDER GAP${gaps.length === 1 ? "" : "S"}`} color={AMBER} />
                  {gaps.map((g) => (
                    <div
                      key={g.gen || g.surface}
                      style={{
                        padding:       "7px 14px",
                        borderBottom:  `1px solid ${S.border}`,
                        display:       "flex",
                        flexDirection: "column",
                        gap:           3,
                      }}
                    >
                      <span
                        style={{
                          color:        "#DCEBF5",
                          fontSize:     S.fs.xxs,
                          letterSpacing: 0.5,
                          overflow:     "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace:   "nowrap",
                        }}
                        title={g.surface}
                      >
                        {g.surface}
                      </span>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {g.plane && (
                          <span
                            style={{
                              fontSize:     9,
                              color:        planeBadgeColor(g.plane),
                              border:       `1px solid ${planeBadgeColor(g.plane)}55`,
                              borderRadius: 3,
                              padding:      "1px 5px",
                              letterSpacing: 1,
                              textTransform: "uppercase",
                            }}
                          >
                            {g.plane}
                          </span>
                        )}
                        {g.gen && (
                          <span
                            style={{
                              fontSize:     9,
                              color:        `${AMBER}99`,
                              letterSpacing: 0.5,
                              overflow:     "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace:   "nowrap",
                            }}
                          >
                            gen: {g.gen}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding:    "8px 14px",
            borderTop:  `1px solid ${S.border}`,
            fontSize:   9,
            color:      `${S.text}66`,
            letterSpacing: 0.5,
            flexShrink: 0,
          }}
        >
          GET /v1/jarvis/assets/status · library · gaps
        </div>
      </div>
    </>
  );
}

function Tile({ label, value, color }) {
  return (
    <div
      style={{
        background:   `${color}11`,
        border:       `1px solid ${color}44`,
        borderRadius: 3,
        padding:      "4px 8px",
        display:      "flex",
        flexDirection: "column",
        alignItems:   "center",
        minWidth:     52,
      }}
    >
      <span style={{ fontSize: 10, color, fontWeight: 700, letterSpacing: 1 }}>
        {value}
      </span>
      <span style={{ fontSize: 8, color: `${color}88`, letterSpacing: 1 }}>
        {label}
      </span>
    </div>
  );
}

function SectionLabel({ text, color }) {
  return (
    <div
      style={{
        padding:      "6px 14px 4px",
        fontSize:     9,
        color:        color || "#94A3B8",
        letterSpacing: 1.5,
        textTransform: "uppercase",
      }}
    >
      {text}
    </div>
  );
}
