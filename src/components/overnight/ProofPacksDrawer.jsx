/**
 * ProofPacksDrawer — Feature 39
 * Left-edge slide-in drawer listing evidence proof packs from
 * GET /v1/proofpack/list. Polls every 5 minutes while open.
 *
 * Tab sits at 60 % from top (between SkillScorecardPanel 50 % and
 * RemindersPanel 75 %).
 * Each row shows: pack title, linked spec ID (if any), decision count,
 * and relative creation age. Clicking a row expands the body excerpt.
 *
 * Mounted in src/Layout.jsx after SkillScorecardPanel.
 *
 * Endpoint: GET /v1/proofpack/list?limit=30
 * → { items: [{ id, title, body_md, frontmatter: { spec_id, decision_ids }, created_ts }] }
 * created_ts is unix milliseconds.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000;
const DRAWER_W = 340;
const AMBER = "#D97706";
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

function bodyExcerpt(md) {
  if (!md) return "";
  const text = md.replace(/#+\s*/g, "").replace(/\n+/g, " ").trim();
  return text.length > 90 ? text.slice(0, 90) + "…" : text;
}

export default function ProofPacksDrawer() {
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
      .request("/v1/proofpack/list?limit=30")
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
      {/* Fixed toggle tab — left edge, 60 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close proof packs" : "Open proof packs"}
        style={{
          position: "fixed",
          left: open ? DRAWER_W : 0,
          top: "60%",
          transform: open
            ? "translateY(-50%) rotate(180deg)"
            : "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${AMBER}55`,
          borderLeft: open ? "none" : `1px solid ${AMBER}55`,
          color: AMBER,
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
        {open ? "PROOFS ▶" : "PROOFS ◀"}
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
          borderRight: `1px solid ${AMBER}33`,
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
              color: AMBER,
              letterSpacing: 2,
              flex: 1,
            }}
          >
            PROOF PACKS
          </span>
          {data && (
            <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1 }}>
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
              NO PROOF PACKS FOUND
            </div>
          ) : (
            packs.map((pack) => {
              const fm = pack.frontmatter || {};
              const specId = fm.spec_id || "";
              const decisions = Array.isArray(fm.decision_ids) ? fm.decision_ids : [];
              const isExpanded = expandedId === pack.id;

              return (
                <div
                  key={pack.id}
                  onClick={() => setExpandedId(isExpanded ? null : pack.id)}
                  style={{
                    padding: "8px 14px",
                    borderBottom: `1px solid ${S.border}`,
                    cursor: "pointer",
                    background: isExpanded ? `${AMBER}0A` : "transparent",
                    borderLeft: isExpanded
                      ? `2px solid ${AMBER}`
                      : "2px solid transparent",
                  }}
                >
                  {/* Title */}
                  <div
                    style={{
                      fontSize: S.fs.xs,
                      color: S.textHi,
                      letterSpacing: 0.5,
                      marginBottom: 3,
                    }}
                  >
                    {pack.title || `Pack #${pack.id}`}
                  </div>

                  {/* Spec + decision count row */}
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      marginBottom: 3,
                      flexWrap: "wrap",
                    }}
                  >
                    {specId && (
                      <span
                        style={{
                          fontSize: S.fs.xxs,
                          color: `${AMBER}CC`,
                          letterSpacing: 1,
                          background: `${AMBER}18`,
                          border: `1px solid ${AMBER}33`,
                          borderRadius: 3,
                          padding: "1px 5px",
                        }}
                      >
                        SPEC {specId}
                      </span>
                    )}
                    {decisions.length > 0 && (
                      <span
                        style={{
                          fontSize: S.fs.xxs,
                          color: "#94A3B8",
                          letterSpacing: 1,
                        }}
                      >
                        {decisions.length} decision{decisions.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>

                  {/* Expanded body excerpt */}
                  {isExpanded && (
                    <div
                      style={{
                        fontSize: S.fs.xxs,
                        color: "#A8C0CC",
                        letterSpacing: 0.3,
                        lineHeight: 1.5,
                        marginBottom: 4,
                        whiteSpace: "pre-wrap",
                        maxHeight: 200,
                        overflowY: "auto",
                        paddingRight: 4,
                      }}
                    >
                      {bodyExcerpt(pack.body_md) || "—"}
                    </div>
                  )}

                  {/* Age */}
                  <div
                    style={{
                      fontSize: S.fs.xxs,
                      color: `${AMBER}88`,
                      letterSpacing: 1,
                    }}
                  >
                    {relAge(pack.created_ts)}
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
