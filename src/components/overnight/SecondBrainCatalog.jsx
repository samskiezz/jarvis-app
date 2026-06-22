/**
 * SecondBrainCatalog — Feature 33
 * Left-edge slide-in drawer showing the JARVIS Second Brain vault overview
 * from GET /v1/brain/catalog. Polls every 5 minutes while open.
 *
 * Tab sits at 13 % from top (between ReportsBrowserDrawer at 8 % and
 * SourceConnectorsDrawer at 20 %).
 *
 * Sections:
 *   - Header: total note count + kind breakdown badges (note / daily / log)
 *   - RECENT: 10 most recently updated notes (title + kind badge + age)
 *   - ORPHANS: notes with no in/out links, flagged ⚠ (collapsed by default)
 *
 * Mounted in src/Layout.jsx after ReportsBrowserDrawer.
 *
 * Endpoint: GET /v1/brain/catalog
 * → { total: number, counts: { note: N, daily: N, log: N, ... },
 *     recent: [{ id, title, kind, updated_ts, ... }],
 *     orphans: [{ id, title, kind, updated_ts, ... }] }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000;
const DRAWER_W = 340;
const TEAL = "#0D9488";
const AMBER = "#F59E0B";
const RED = "#e8203c";

const KIND_COLOR = {
  note: "#29E7FF",
  daily: "#22C55E",
  log: "#F97316",
};

function relAge(tsMs) {
  if (!tsMs) return "—";
  const sec = Math.floor((Date.now() - tsMs) / 1000);
  if (sec < 0) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function NoteRow({ note, accent }) {
  const kindColor = KIND_COLOR[note.kind] ?? S.text;
  return (
    <div
      style={{
        padding: "7px 14px",
        borderBottom: `1px solid ${S.border}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 6,
          marginBottom: 2,
        }}
      >
        <span
          style={{
            fontSize: S.fs.xxs,
            color: kindColor,
            letterSpacing: 1,
            textTransform: "uppercase",
            flexShrink: 0,
          }}
        >
          {note.kind ?? "note"}
        </span>
        <span
          style={{
            fontSize: S.fs.xs,
            color: S.textHi,
            letterSpacing: 0.5,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {note.title || `#${note.id}`}
        </span>
      </div>
      <div
        style={{
          fontSize: S.fs.xxs,
          color: `${accent}88`,
          letterSpacing: 1,
        }}
      >
        {relAge(note.updated_ts)}
      </div>
    </div>
  );
}

export default function SecondBrainCatalog() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [showOrphans, setShowOrphans] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request("/v1/brain/catalog")
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

  const recent = data?.recent ?? [];
  const orphans = data?.orphans ?? [];
  const counts = data?.counts ?? {};
  const kindEntries = Object.entries(counts).filter(([, n]) => n > 0);

  return (
    <>
      {/* Fixed toggle tab — left edge, 13 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close second brain catalog" : "Open second brain catalog"}
        style={{
          position: "fixed",
          left: open ? DRAWER_W : 0,
          top: "13%",
          transform: open
            ? "translateY(-50%) rotate(180deg)"
            : "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${TEAL}55`,
          borderLeft: open ? "none" : `1px solid ${TEAL}55`,
          color: TEAL,
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
        {open ? "BRAIN ▶" : "BRAIN ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          left: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8998,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderRight: `1px solid ${TEAL}33`,
          display: "flex",
          flexDirection: "column",
          transition: "left 0.2s ease",
          fontFamily: S.mono,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "10px 14px",
            borderBottom: `1px solid ${S.border}`,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: data ? 7 : 0,
            }}
          >
            <span
              style={{
                fontSize: S.fs.xs,
                color: TEAL,
                letterSpacing: 2,
                flex: 1,
              }}
            >
              SECOND BRAIN
            </span>
            {data != null && (
              <span
                style={{
                  fontSize: S.fs.xxs,
                  color: S.text,
                  letterSpacing: 1,
                }}
              >
                {data.total ?? 0} notes
              </span>
            )}
          </div>

          {/* Kind breakdown badges */}
          {kindEntries.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {kindEntries.map(([kind, n]) => (
                <span
                  key={kind}
                  style={{
                    fontSize: S.fs.xxs,
                    color: KIND_COLOR[kind] ?? S.text,
                    border: `1px solid ${KIND_COLOR[kind] ?? S.border}55`,
                    borderRadius: 3,
                    padding: "1px 6px",
                    letterSpacing: 1,
                    textTransform: "uppercase",
                  }}
                >
                  {kind} {n}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {!open ? null : err ? (
            <div
              style={{
                padding: "20px 14px",
                color: RED,
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
          ) : (
            <>
              {/* Section: Recent */}
              <div
                style={{
                  padding: "5px 14px 3px",
                  fontSize: S.fs.xxs,
                  color: TEAL,
                  letterSpacing: 2,
                  borderBottom: `1px solid ${S.border}`,
                }}
              >
                RECENT
              </div>
              {recent.length === 0 ? (
                <div
                  style={{
                    padding: "10px 14px",
                    color: S.text,
                    fontSize: S.fs.xxs,
                    letterSpacing: 1,
                  }}
                >
                  NO NOTES YET
                </div>
              ) : (
                recent.map((note) => (
                  <NoteRow key={note.id} note={note} accent={TEAL} />
                ))
              )}

              {/* Section: Orphans (collapsible) */}
              {orphans.length > 0 && (
                <>
                  <button
                    onClick={() => setShowOrphans((v) => !v)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      width: "100%",
                      padding: "5px 14px 3px",
                      background: "transparent",
                      border: "none",
                      borderBottom: `1px solid ${S.border}`,
                      cursor: "pointer",
                      textAlign: "left",
                      fontFamily: S.mono,
                    }}
                  >
                    <span
                      style={{
                        fontSize: S.fs.xxs,
                        color: AMBER,
                        letterSpacing: 2,
                      }}
                    >
                      ⚠ ORPHANS
                    </span>
                    <span
                      style={{
                        fontSize: S.fs.xxs,
                        color: `${AMBER}88`,
                        letterSpacing: 1,
                      }}
                    >
                      {orphans.length}
                    </span>
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: S.fs.xxs,
                        color: S.text,
                      }}
                    >
                      {showOrphans ? "▲" : "▼"}
                    </span>
                  </button>
                  {showOrphans &&
                    orphans.map((note) => (
                      <NoteRow key={note.id} note={note} accent={AMBER} />
                    ))}
                </>
              )}
            </>
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
          {data
            ? `LIVE · 5 MIN POLL`
            : err
            ? "ERR"
            : "…"}
        </div>
      </div>
    </>
  );
}
