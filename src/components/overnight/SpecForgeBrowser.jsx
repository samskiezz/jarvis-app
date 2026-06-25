/**
 * SpecForgeBrowser — left-edge slide-in at 16 % from top.
 * Lists all specs from GET /v1/spec/list (kind=spec notes).
 * Click a row to expand and read the full spec body inline.
 * Polls every 5 minutes while open.
 *
 * Accent: #14B8A6 (teal-500).
 * Mounted in src/Layout.jsx after TemporalAnomalyDrawer.
 *
 * Real endpoints:
 *   GET /v1/spec/list           → { items: [{ id, title, kind, body, created_ts, ... }] }
 *   GET /v1/spec/{spec_id}      → { spec: { id, title, body, created_ts, approved, ... } }
 */
import { useEffect, useReducer, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000;
const DRAWER_W = 360;
const ACCENT = "#14B8A6";

function relAge(ts) {
  if (!ts) return "";
  const ms = typeof ts === "number" && ts < 1e12 ? ts * 1000 : ts;
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function statusBadge(spec) {
  const approved = spec.approved === true || spec.status === "approved";
  const color = approved ? "#22C55E" : ACCENT;
  const label = approved ? "APPROVED" : "DRAFT";
  return (
    <span
      style={{
        fontSize: S.fs.xxs,
        color,
        fontFamily: S.mono,
        letterSpacing: 1,
        background: `${color}18`,
        border: `1px solid ${color}44`,
        borderRadius: 3,
        padding: "1px 5px",
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

function SpecRow({ spec }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);

  function toggle() {
    if (!expanded && !detail && !loading) {
      setLoading(true);
      kimiClient
        .request(`/v1/spec/${spec.id}`)
        .then((d) => {
          const s = d?.spec ?? d;
          setDetail(s);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
    setExpanded((v) => !v);
  }

  const title = spec.title ?? spec.id ?? "Untitled Spec";
  const ts = spec.created_ts ?? spec.created_at ?? spec.updated_ts ?? null;

  return (
    <div style={{ borderBottom: `1px solid ${S.border}` }}>
      <button
        onClick={toggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px",
          width: "100%",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: ACCENT,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            flex: 1,
            fontSize: S.fs.xs,
            color: S.textHi,
            fontFamily: S.mono,
            letterSpacing: 0.5,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </span>
        {statusBadge(spec)}
        {ts && (
          <span
            style={{
              fontSize: S.fs.xxs,
              color: S.text,
              fontFamily: S.mono,
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            {relAge(ts)}
          </span>
        )}
        <span style={{ fontSize: S.fs.xxs, color: S.text, fontFamily: S.mono, flexShrink: 0 }}>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div
          style={{
            padding: "4px 14px 10px 29px",
          }}
        >
          {loading ? (
            <div style={{ fontSize: S.fs.xxs, color: S.text, fontFamily: S.mono, letterSpacing: 1 }}>
              LOADING SPEC…
            </div>
          ) : detail ? (
            <div
              style={{
                fontSize: S.fs.xxs,
                color: S.text,
                fontFamily: S.mono,
                letterSpacing: 0.3,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                maxHeight: 320,
                overflowY: "auto",
                borderLeft: `2px solid ${ACCENT}44`,
                paddingLeft: 8,
              }}
            >
              {detail.body ?? detail.description ?? JSON.stringify(detail, null, 2)}
            </div>
          ) : spec.body ? (
            <div
              style={{
                fontSize: S.fs.xxs,
                color: S.text,
                fontFamily: S.mono,
                letterSpacing: 0.3,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                maxHeight: 320,
                overflowY: "auto",
                borderLeft: `2px solid ${ACCENT}44`,
                paddingLeft: 8,
              }}
            >
              {spec.body}
            </div>
          ) : (
            <div style={{ fontSize: S.fs.xxs, color: S.text, fontFamily: S.mono, letterSpacing: 1 }}>
              NO BODY
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SpecForgeBrowser() {
  const [open, setOpen] = useState(false);
  const [specs, setSpecs] = useState(null);
  const [err, setErr] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [tick, bump] = useReducer((n) => n + 1, 0);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request("/v1/spec/list")
      .then((d) => {
        if (!alive) return;
        const list = Array.isArray(d)
          ? d
          : d?.items ?? d?.specs ?? d?.results ?? [];
        setSpecs(list);
        setErr(false);
        setFetchedAt(Date.now());
      })
      .catch(() => {
        if (alive) setErr(true);
      });

    const timer = setTimeout(() => {
      if (alive) bump();
    }, POLL_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [open, tick]);

  return (
    <>
      {/* Toggle tab — left edge at 16 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close spec forge browser" : "Open spec forge browser"}
        style={{
          position: "fixed",
          left: open ? DRAWER_W : 0,
          top: "16%",
          zIndex: 9000,
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
        {open ? "SPEC ▶" : "SPEC ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          left: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8995,
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
          <span style={{ fontSize: S.fs.xs, color: ACCENT, letterSpacing: 2, flex: 1 }}>
            SPEC FORGE
          </span>
          {specs && (
            <span style={{ fontSize: S.fs.xxs, color: `${ACCENT}CC`, fontFamily: S.mono, letterSpacing: 1 }}>
              {specs.length} spec{specs.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {!open ? null : err ? (
            <div style={{ padding: "20px 14px", color: "#F43F5E", fontSize: S.fs.xs, letterSpacing: 1 }}>
              ENDPOINT UNREACHABLE
            </div>
          ) : !specs ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          ) : specs.length === 0 ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              NO SPECS FORGED YET
            </div>
          ) : (
            specs.map((s) => <SpecRow key={s.id ?? s.title} spec={s} />)
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
          {fetchedAt ? `UPDATED ${relAge(fetchedAt)} · 5 MIN POLL` : err ? "ERR" : "…"}
        </div>
      </div>
    </>
  );
}
