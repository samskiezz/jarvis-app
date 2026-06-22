/**
 * ThoughtPacksDrawer — Feature 27
 * Right-edge slide-in drawer listing compressed memory packs from
 * GET /v1/compress/list. Polls every 5 minutes while open.
 *
 * Tab sits at 95 % from top (below ActivityFeedPanel at 90 %).
 * Each row shows: pack title, source_type badge, short_summary excerpt,
 * and relative creation age. Clicking a row expands the full structured
 * content inline (key_facts, decisions, next_actions).
 *
 * Mounted in src/Layout.jsx after ReportsBrowserDrawer.
 *
 * Endpoint: GET /v1/compress/list?limit=20
 * → { items: [{ id, kind, title, frontmatter: { source_type, structured:
 *     { short_summary, full_brief, key_facts, decisions, next_actions } },
 *     body_md, created_ts, updated_ts }] }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000;
const DRAWER_W = 330;
const INDIGO = "#6366F1";
const RED = "#e8203c";

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

function cleanTitle(title) {
  if (!title) return "Untitled Pack";
  // Strip leading "pack:timestamp:" prefix that the compressor adds.
  const m = title.match(/^pack:\d+:(.+)$/);
  if (m) {
    return m[1].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return title.length > 36 ? title.slice(0, 36) + "…" : title;
}

function summaryExcerpt(fm) {
  const s = fm?.structured?.short_summary || fm?.short_summary || "";
  return s.length > 72 ? s.slice(0, 72) + "…" : s;
}

function SourceBadge({ type }) {
  const labels = {
    text: "TXT",
    url: "URL",
    email: "MAIL",
    chat: "CHAT",
    doc: "DOC",
    note: "NOTE",
  };
  const label = labels[type] || (type ? type.toUpperCase().slice(0, 5) : "PACK");
  return (
    <span
      style={{
        fontSize: S.fs.xxs,
        color: INDIGO,
        border: `1px solid ${INDIGO}55`,
        borderRadius: 2,
        padding: "1px 4px",
        letterSpacing: 1,
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

function BulletList({ label, items }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div style={{ marginBottom: 6 }}>
      <div
        style={{
          fontSize: S.fs.xxs,
          color: `${INDIGO}CC`,
          letterSpacing: 1,
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      {items.slice(0, 4).map((item, i) => (
        <div
          key={i}
          style={{
            fontSize: S.fs.xxs,
            color: "#A8C0CC",
            letterSpacing: 0.3,
            lineHeight: 1.5,
            paddingLeft: 8,
          }}
        >
          · {typeof item === "string" ? item : JSON.stringify(item)}
        </div>
      ))}
    </div>
  );
}

export default function ThoughtPacksDrawer() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request("/v1/compress/list?limit=20")
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

  const packs = data?.items ?? [];

  return (
    <>
      {/* Fixed toggle tab — right edge, 95 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close thought packs" : "Open thought packs"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "95%",
          transform: open
            ? "translateY(-50%) rotate(180deg)"
            : "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${INDIGO}55`,
          borderRight: open ? "none" : `1px solid ${INDIGO}55`,
          color: INDIGO,
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
        {open ? "PACKS ◀" : "PACKS ▶"}
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
          borderLeft: `1px solid ${INDIGO}33`,
          display: "flex",
          flexDirection: "column",
          transition: "right 0.2s ease",
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
              color: INDIGO,
              letterSpacing: 2,
              flex: 1,
            }}
          >
            THOUGHT PACKS
          </span>
          {data && (
            <span
              style={{
                fontSize: S.fs.xxs,
                color: S.text,
                letterSpacing: 1,
              }}
            >
              {packs.length}
            </span>
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
          ) : packs.length === 0 ? (
            <div
              style={{
                padding: "20px 14px",
                color: S.text,
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              NO PACKS FOUND
            </div>
          ) : (
            packs.map((p) => {
              const isExpanded = expandedId === p.id;
              const fm = p.frontmatter || {};
              const structured = fm.structured || {};
              const srcType = fm.source_type || "text";
              const ts = p.created_ts || fm.created_at || null;

              return (
                <div
                  key={p.id}
                  onClick={() => setExpandedId(isExpanded ? null : p.id)}
                  style={{
                    padding: "8px 14px",
                    borderBottom: `1px solid ${S.border}`,
                    cursor: "pointer",
                    background: isExpanded ? `${INDIGO}0A` : "transparent",
                    borderLeft: isExpanded
                      ? `2px solid ${INDIGO}`
                      : "2px solid transparent",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 3,
                    }}
                  >
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
                      {cleanTitle(p.title)}
                    </span>
                    <SourceBadge type={srcType} />
                  </div>

                  {!isExpanded && (
                    <div
                      style={{
                        fontSize: S.fs.xxs,
                        color: S.text,
                        letterSpacing: 0.3,
                        lineHeight: 1.4,
                        marginBottom: 3,
                      }}
                    >
                      {summaryExcerpt(fm) || "—"}
                    </div>
                  )}

                  {isExpanded && (
                    <div
                      style={{
                        marginBottom: 4,
                        maxHeight: 240,
                        overflowY: "auto",
                        paddingRight: 4,
                      }}
                    >
                      {structured.full_brief && (
                        <div
                          style={{
                            fontSize: S.fs.xxs,
                            color: "#A8C0CC",
                            letterSpacing: 0.3,
                            lineHeight: 1.6,
                            marginBottom: 8,
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {structured.full_brief}
                        </div>
                      )}
                      <BulletList label="KEY FACTS" items={structured.key_facts} />
                      <BulletList label="DECISIONS" items={structured.decisions} />
                      <BulletList label="NEXT ACTIONS" items={structured.next_actions} />
                    </div>
                  )}

                  <div
                    style={{
                      fontSize: S.fs.xxs,
                      color: `${INDIGO}88`,
                      letterSpacing: 1,
                    }}
                  >
                    {relAge(ts)}
                  </div>
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
          {data ? "LIVE · 5 MIN POLL" : err ? "ERR" : "…"}
        </div>
      </div>
    </>
  );
}
