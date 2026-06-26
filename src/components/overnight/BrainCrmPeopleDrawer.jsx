/**
 * BrainCrmPeopleDrawer — left-edge slide-in drawer showing the JARVIS
 * second-brain CRM people roster from GET /v1/brain/people, polling
 * every 5 min while open.
 *
 * Tab sits at 22 % from top (left edge, between SourceConnectorsDrawer 20 %
 * and IntelProfileDirectory 24 %).
 * Mounted in src/Layout.jsx after IntelProfileDirectory.
 *
 * Endpoint: GET /v1/brain/people
 * → { items: [{ person, tier, mention_count }], count }
 *
 * Tier values: "full" | "moderate" | "brief" | "none"
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS  = 300_000; // 5 min
const DRAWER_W = 300;
const ACCENT   = "#6366F1"; // indigo
const GREY     = "#4e6070";

const TIER_COLORS = {
  full:     "#22C55E", // green — deep relationship
  moderate: "#F59E0B", // amber — growing
  brief:    "#38BDF8", // sky-blue — light touch
  none:     GREY,
};

function tierMeta(raw = "") {
  const key = (raw || "none").toLowerCase();
  return {
    label: key.toUpperCase().slice(0, 8),
    color: TIER_COLORS[key] ?? GREY,
  };
}

export default function BrainCrmPeopleDrawer() {
  const [open,    setOpen]   = useState(false);
  const [people,  setPeople] = useState(null);
  const [err,     setErr]    = useState(false);
  const [query,   setQuery]  = useState("");
  const [tick,    bump]      = useReducer((n) => n + 1, 0);
  const timerRef             = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request("/v1/brain/people")
      .then((raw) => {
        if (!alive) return;
        const items = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.items)
          ? raw.items
          : [];
        setPeople(items);
        setErr(false);
      })
      .catch(() => {
        if (alive) setErr(true);
      });

    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => { alive = false; clearTimeout(timerRef.current); };
  }, [open, tick]);

  const items    = people ?? [];
  const filtered = query.trim()
    ? items.filter((p) =>
        (p.person ?? "").toLowerCase().includes(query.toLowerCase())
      )
    : items;

  return (
    <>
      {/* Fixed toggle tab — left edge, 22 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close CRM people" : "Open brain CRM people roster"}
        style={{
          position:      "fixed",
          left:          open ? DRAWER_W : 0,
          top:           "22%",
          transform:     "translateY(-50%)",
          zIndex:        9001,
          writingMode:   "vertical-rl",
          textOrientation: "mixed",
          background:    "rgba(2,6,10,0.92)",
          border:        `1px solid ${ACCENT}55`,
          borderLeft:    open ? "none" : `1px solid ${ACCENT}55`,
          color:         ACCENT,
          fontFamily:    S.mono,
          fontSize:      S.fs.xxs,
          letterSpacing: 2,
          padding:       "10px 5px",
          cursor:        "pointer",
          borderRadius:  "0 4px 4px 0",
          transition:    "left 0.2s ease",
          userSelect:    "none",
        }}
      >
        {open ? "◀ CRM" : "CRM ▶"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position:        "fixed",
          left:            open ? 0 : -DRAWER_W,
          top:             0,
          bottom:          0,
          width:           DRAWER_W,
          zIndex:          8991,
          background:      "rgba(2,6,10,0.96)",
          backdropFilter:  S.blur,
          WebkitBackdropFilter: S.blur,
          borderRight:     `1px solid ${ACCENT}33`,
          display:         "flex",
          flexDirection:   "column",
          transition:      "left 0.2s ease",
          fontFamily:      S.mono,
        }}
      >
        {/* Header */}
        <div
          style={{
            display:       "flex",
            alignItems:    "center",
            gap:           8,
            padding:       "10px 14px",
            borderBottom:  `1px solid ${S.border}`,
            flexShrink:    0,
          }}
        >
          <span style={{ fontSize: S.fs.xs, color: ACCENT, letterSpacing: 2, flex: 1 }}>
            BRAIN CRM
          </span>
          {people !== null && (
            <span style={{ fontSize: S.fs.xxs, color: GREY, letterSpacing: 1 }}>
              {items.length} PEOPLE
            </span>
          )}
        </div>

        {/* Filter input */}
        {open && (
          <div
            style={{
              padding:      "6px 14px",
              borderBottom: `1px solid ${S.border}`,
              flexShrink:   0,
            }}
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="filter by name…"
              style={{
                width:        "100%",
                background:   "transparent",
                border:       `1px solid ${ACCENT}33`,
                borderRadius: 3,
                color:        S.textHi,
                fontFamily:   S.mono,
                fontSize:     S.fs.xxs,
                letterSpacing: 1,
                padding:      "3px 8px",
                outline:      "none",
                boxSizing:    "border-box",
              }}
            />
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {!open ? null : err ? (
            <div
              style={{
                padding:      "20px 14px",
                color:        "#e8203c",
                fontSize:     S.fs.xs,
                letterSpacing: 1,
              }}
            >
              ENDPOINT UNREACHABLE
            </div>
          ) : people === null ? (
            <div
              style={{
                padding:      "20px 14px",
                color:        S.text,
                fontSize:     S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              LOADING…
            </div>
          ) : filtered.length === 0 ? (
            <div
              style={{
                padding:      "20px 14px",
                color:        S.text,
                fontSize:     S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              {query ? "NO MATCH" : "NO PEOPLE IN CRM"}
            </div>
          ) : (
            filtered.map((p, idx) => {
              const name  = p.person ?? `Person #${idx + 1}`;
              const tier  = tierMeta(p.tier);
              const count = p.mention_count ?? 0;

              return (
                <div
                  key={name}
                  style={{
                    padding:      "7px 14px",
                    borderBottom: `1px solid ${S.border}`,
                    borderLeft:   `3px solid ${tier.color}`,
                  }}
                >
                  {/* name row */}
                  <div
                    style={{
                      display:    "flex",
                      alignItems: "center",
                      gap:        8,
                    }}
                  >
                    <span
                      style={{
                        flex:          1,
                        fontSize:      S.fs.xs,
                        color:         S.textHi,
                        letterSpacing: 0.5,
                        whiteSpace:    "nowrap",
                        overflow:      "hidden",
                        textOverflow:  "ellipsis",
                      }}
                    >
                      {name}
                    </span>
                    {/* tier badge */}
                    <span
                      style={{
                        fontSize:     S.fs.xxs,
                        color:        tier.color,
                        border:       `1px solid ${tier.color}55`,
                        borderRadius: 3,
                        padding:      "1px 5px",
                        letterSpacing: 1,
                        flexShrink:   0,
                      }}
                    >
                      {tier.label}
                    </span>
                  </div>

                  {/* mention count */}
                  <div
                    style={{
                      display:       "flex",
                      alignItems:    "center",
                      gap:           6,
                      marginTop:     3,
                      fontSize:      S.fs.xxs,
                      color:         GREY,
                      letterSpacing: 0.5,
                    }}
                  >
                    <span style={{ color: ACCENT, opacity: 0.7 }}>◆</span>
                    <span>{count} mention{count !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding:      "6px 14px",
            borderTop:    `1px solid ${S.border}`,
            fontSize:     S.fs.xxs,
            color:        S.text,
            letterSpacing: 1,
            flexShrink:   0,
          }}
        >
          {people !== null
            ? `${filtered.length}${query ? `/${items.length}` : ""} PERSON${filtered.length !== 1 ? "S" : ""} · 5 MIN POLL`
            : err
            ? "ERR"
            : "…"}
        </div>
      </div>
    </>
  );
}
