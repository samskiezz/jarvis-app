/**
 * SavedSearchesDrawer — Feature 102
 * Right-edge slide-in drawer at 91 % from top showing all saved faceted
 * searches from GET /v1/search-plus/saved. Click a row runs the search
 * (GET /v1/search-plus/saved/{id}/run) and shows the live result count
 * inline. Polls every 5 minutes while open.
 *
 * Endpoint used:  GET /v1/search-plus/saved
 *   → { count: number, searches: [{ id, name, spec, created_ts, updated_ts }] }
 * Run endpoint:   GET /v1/search-plus/saved/{id}/run
 *   → { count: number, results: [...], ... }
 *
 * Mounted in src/Layout.jsx after WorldPackBrowser.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000;
const DRAWER_W = 340;
const ACCENT = "#FB923C"; // warm orange
const RED = "#e8203c";

function relAge(tsMs) {
  if (!tsMs) return "—";
  const sec = Math.floor((Date.now() - tsMs) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function specSummary(spec) {
  if (!spec || typeof spec !== "object") return null;
  const parts = [];
  if (spec.type) parts.push(spec.type);
  if (spec.q) parts.push(`"${spec.q}"`);
  if (spec.mark) parts.push(`mark:${spec.mark}`);
  return parts.length ? parts.join(" · ") : null;
}

function SearchRow({ search, onRun, running, resultCount }) {
  const summary = specSummary(search.spec);
  return (
    <button
      onClick={() => onRun(search.id)}
      title={`Run: ${search.name}`}
      style={{
        display: "block",
        width: "100%",
        padding: "8px 14px",
        borderBottom: `1px solid ${S.border}`,
        background: "transparent",
        border: "none",
        borderBottom: `1px solid ${S.border}`,
        textAlign: "left",
        cursor: "pointer",
        fontFamily: S.mono,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 2 }}>
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
          {search.name || search.id}
        </span>
        {running ? (
          <span style={{ fontSize: S.fs.xxs, color: ACCENT, letterSpacing: 1 }}>…</span>
        ) : resultCount != null ? (
          <span
            style={{
              fontSize: S.fs.xxs,
              color: resultCount > 0 ? ACCENT : S.text,
              letterSpacing: 1,
              border: `1px solid ${ACCENT}44`,
              borderRadius: 3,
              padding: "1px 5px",
            }}
          >
            {resultCount}
          </span>
        ) : null}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {summary && (
          <span
            style={{
              fontSize: S.fs.xxs,
              color: `${ACCENT}88`,
              letterSpacing: 0.5,
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {summary}
          </span>
        )}
        <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1, flexShrink: 0 }}>
          {relAge(search.updated_ts)}
        </span>
      </div>
    </button>
  );
}

export default function SavedSearchesDrawer() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);
  const [runState, setRunState] = useState({}); // id → { running, count }

  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request("/v1/search-plus/saved")
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

  function runSearch(id) {
    setRunState((prev) => ({ ...prev, [id]: { running: true, count: null } }));
    kimiClient
      .request(`/v1/search-plus/saved/${id}/run`)
      .then((res) => {
        setRunState((prev) => ({
          ...prev,
          [id]: { running: false, count: res?.count ?? (res?.results?.length ?? 0) },
        }));
      })
      .catch(() => {
        setRunState((prev) => ({ ...prev, [id]: { running: false, count: null } }));
      });
  }

  const searches = data?.searches ?? [];

  return (
    <>
      {/* Fixed toggle tab — right edge, 91 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close saved searches" : "Open saved searches"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "91%",
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
        {open ? "SRCH ▶" : "SRCH ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8998,
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
            padding: "10px 14px",
            borderBottom: `1px solid ${S.border}`,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: S.fs.xs, color: ACCENT, letterSpacing: 2, flex: 1 }}>
              SAVED SEARCHES
            </span>
            {data != null && (
              <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1 }}>
                {data.count ?? searches.length}
              </span>
            )}
          </div>
          {data != null && (
            <div
              style={{
                fontSize: S.fs.xxs,
                color: `${ACCENT}66`,
                letterSpacing: 1,
                marginTop: 4,
              }}
            >
              click row to run · results shown inline
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {!open ? null : err ? (
            <div style={{ padding: "20px 14px", color: RED, fontSize: S.fs.xs, letterSpacing: 1 }}>
              ENDPOINT UNREACHABLE
            </div>
          ) : !data ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          ) : searches.length === 0 ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              NO SAVED SEARCHES
            </div>
          ) : (
            searches.map((s) => (
              <SearchRow
                key={s.id}
                search={s}
                onRun={runSearch}
                running={runState[s.id]?.running ?? false}
                resultCount={runState[s.id]?.count ?? null}
              />
            ))
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
          {data ? "LIVE · 5 MIN POLL" : err ? "ERR" : "…"}
        </div>
      </div>
    </>
  );
}
