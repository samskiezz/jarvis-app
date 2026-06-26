/**
 * PageDataLensDrawer — Feature 117
 * Right-edge slide-in drawer at 93 % from top showing live topic-mapped
 * data for every JARVIS app page.
 *
 * Endpoints used:
 *   GET /v1/jarvis/page-data/summary
 *     → { pages: [{ name, topic_count }], total_pages, total_topics }
 *   GET /v1/jarvis/page-data/{page_name}?limit=100
 *     → { page, measurements: [...], events: [...], documents: [...], topics: [...] }
 *
 * Mounted in src/Layout.jsx after <ScienceMethodsCatalog />.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000; // 5 min
const DRAWER_W = 360;
const ACCENT = "#22D3EE"; // cyan

function relAge(ts) {
  if (!ts) return "—";
  const ms = typeof ts === "number" && ts < 1e12 ? ts * 1000 : ts;
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function countBadge(n, color) {
  if (n == null) return null;
  return (
    <span
      style={{
        fontSize: S.fs.xxs,
        color: color || S.text,
        border: `1px solid ${color ? color + "55" : S.border}`,
        borderRadius: 3,
        padding: "1px 5px",
        letterSpacing: 1,
        flexShrink: 0,
      }}
    >
      {n}
    </span>
  );
}

function SectionLabel({ label, count }) {
  return (
    <div
      style={{
        padding: "6px 14px 3px",
        fontSize: S.fs.xxs,
        color: `${ACCENT}99`,
        letterSpacing: 2,
        borderBottom: `1px solid ${S.border}`,
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {label}
      {count != null && countBadge(count, ACCENT)}
    </div>
  );
}

function DataRow({ item }) {
  const name = item.name || item.title || item.id || "—";
  const value =
    item.value != null
      ? `${item.value}${item.unit ? " " + item.unit : ""}`
      : item.content || item.body || "";
  const ts = item.ts || item.timestamp || item.created_at || null;
  return (
    <div
      style={{
        padding: "5px 14px",
        borderBottom: `1px solid ${S.border}22`,
        display: "flex",
        alignItems: "baseline",
        gap: 6,
      }}
    >
      <span
        style={{
          fontSize: S.fs.xxs,
          color: S.textHi,
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </span>
      {value && (
        <span
          style={{
            fontSize: S.fs.xxs,
            color: ACCENT,
            letterSpacing: 0.5,
            flexShrink: 0,
            maxWidth: 100,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {value}
        </span>
      )}
      {ts && (
        <span style={{ fontSize: S.fs.xxs, color: S.text, flexShrink: 0, letterSpacing: 0.5 }}>
          {relAge(ts)}
        </span>
      )}
    </div>
  );
}

function PageDetailView({ pageName, onBack }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    setData(null);
    setErr(false);
    kimiClient
      .request(`/v1/jarvis/page-data/${encodeURIComponent(pageName)}?limit=100`)
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [pageName]);

  const measurements = data?.measurements ?? [];
  const events = data?.events ?? [];
  const documents = data?.documents ?? [];
  const topics = data?.topics ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* Sub-header */}
      <div
        style={{
          padding: "8px 14px",
          borderBottom: `1px solid ${S.border}`,
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: "none",
            border: `1px solid ${ACCENT}44`,
            color: ACCENT,
            fontFamily: S.mono,
            fontSize: S.fs.xxs,
            letterSpacing: 1,
            cursor: "pointer",
            padding: "2px 8px",
            borderRadius: 3,
          }}
        >
          ◀ BACK
        </button>
        <span
          style={{
            fontSize: S.fs.xs,
            color: ACCENT,
            letterSpacing: 2,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {pageName.toUpperCase()}
        </span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {err ? (
          <div style={{ padding: "20px 14px", color: "#e8203c", fontSize: S.fs.xs, letterSpacing: 1 }}>
            ENDPOINT UNREACHABLE
          </div>
        ) : !data ? (
          <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
            LOADING…
          </div>
        ) : (
          <>
            {measurements.length > 0 && (
              <>
                <SectionLabel label="MEASUREMENTS" count={measurements.length} />
                {measurements.map((m, i) => <DataRow key={i} item={m} />)}
              </>
            )}
            {events.length > 0 && (
              <>
                <SectionLabel label="EVENTS" count={events.length} />
                {events.map((e, i) => <DataRow key={i} item={e} />)}
              </>
            )}
            {documents.length > 0 && (
              <>
                <SectionLabel label="DOCUMENTS" count={documents.length} />
                {documents.map((d, i) => <DataRow key={i} item={d} />)}
              </>
            )}
            {topics.length > 0 && (
              <>
                <SectionLabel label="TOPICS" count={topics.length} />
                {topics.slice(0, 40).map((t, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "3px 14px",
                      fontSize: S.fs.xxs,
                      color: S.text,
                      borderBottom: `1px solid ${S.border}11`,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {typeof t === "string" ? t : t.name || t.label || JSON.stringify(t)}
                  </div>
                ))}
              </>
            )}
            {measurements.length === 0 &&
              events.length === 0 &&
              documents.length === 0 &&
              topics.length === 0 && (
                <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
                  NO DATA FOR THIS PAGE
                </div>
              )}
          </>
        )}
      </div>
    </div>
  );
}

export default function PageDataLensDrawer() {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);
  const [selectedPage, setSelectedPage] = useState(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request("/v1/jarvis/page-data/summary")
      .then((d) => { if (alive) { setSummary(d); setErr(false); } })
      .catch(() => { if (alive) setErr(true); });

    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);

    return () => {
      alive = false;
      clearTimeout(timerRef.current);
    };
  }, [open, tick]);

  // Reset selected page when drawer closes
  useEffect(() => {
    if (!open) setSelectedPage(null);
  }, [open]);

  const pages = summary?.pages ?? [];
  const totalTopics = summary?.total_topics ?? null;

  return (
    <>
      {/* Fixed toggle tab — right edge, 93 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close page data lens" : "Open page data lens"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "93%",
          transform: open ? "translateY(-50%) rotate(180deg)" : "translateY(-50%)",
          zIndex: 9001,
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
        {open ? "LENS ▶" : "LENS ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8999,
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
              PAGE DATA LENS
            </span>
            {summary != null && pages.length > 0 && (
              <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1 }}>
                {pages.length} pages
              </span>
            )}
            {totalTopics != null && (
              <span
                style={{
                  fontSize: S.fs.xxs,
                  color: ACCENT,
                  border: `1px solid ${ACCENT}44`,
                  borderRadius: 3,
                  padding: "1px 5px",
                  letterSpacing: 1,
                }}
              >
                {totalTopics} topics
              </span>
            )}
          </div>
          {!selectedPage && (
            <div
              style={{
                fontSize: S.fs.xxs,
                color: `${ACCENT}66`,
                letterSpacing: 1,
                marginTop: 4,
              }}
            >
              click page to inspect live data
            </div>
          )}
        </div>

        {/* Body */}
        {selectedPage ? (
          <PageDetailView pageName={selectedPage} onBack={() => setSelectedPage(null)} />
        ) : (
          <div style={{ flex: 1, overflowY: "auto" }}>
            {!open ? null : err ? (
              <div style={{ padding: "20px 14px", color: "#e8203c", fontSize: S.fs.xs, letterSpacing: 1 }}>
                ENDPOINT UNREACHABLE
              </div>
            ) : !summary ? (
              <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
                LOADING…
              </div>
            ) : pages.length === 0 ? (
              <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
                NO PAGES REGISTERED
              </div>
            ) : (
              pages.map((p) => {
                const name = p.name || p.page || p;
                const count = p.topic_count ?? p.topics ?? null;
                return (
                  <button
                    key={name}
                    onClick={() => setSelectedPage(name)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
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
                    <span
                      style={{
                        fontSize: S.fs.xxs,
                        color: S.textHi,
                        letterSpacing: 0.5,
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {name}
                    </span>
                    {count != null && countBadge(count, ACCENT)}
                    <span style={{ fontSize: S.fs.xxs, color: `${ACCENT}66`, letterSpacing: 0 }}>
                      ▶
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}

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
          {summary ? "LIVE · 5 MIN POLL" : err ? "ERR" : "…"}
        </div>
      </div>
    </>
  );
}
