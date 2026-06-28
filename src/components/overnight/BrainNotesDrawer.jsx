import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000; // 5 min
const DRAWER_W = 380;
const ACCENT = "#818CF8"; // indigo-400
const LIMIT = 60;

const KIND_COLORS = {
  fact: "#38BDF8",
  insight: "#A78BFA",
  hypothesis: "#FB923C",
  risk: "#F87171",
  action: "#4ADE80",
  reference: "#94A3B8",
};

function kindColor(kind) {
  return KIND_COLORS[kind] ?? "#64748B";
}

function relAge(tsMs) {
  const s = Math.floor((Date.now() - tsMs) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function confDot(conf) {
  const c = conf == null ? 0 : Math.max(0, Math.min(1, conf));
  const col = c >= 0.75 ? "#4ADE80" : c >= 0.45 ? "#FCD34D" : "#F87171";
  return (
    <span
      title={`confidence ${(c * 100).toFixed(0)}%`}
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: col,
        flexShrink: 0,
      }}
    />
  );
}

export default function BrainNotesDrawer() {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    kimiClient
      .request(`/v1/brain/notes?limit=${LIMIT}`)
      .then((res) => {
        if (!alive) return;
        setNotes(res?.items ?? []);
        setErr(false);
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

  const visible = notes
    ? notes.filter((n) => {
        if (!filter) return true;
        const q = filter.toLowerCase();
        return (
          (n.title ?? "").toLowerCase().includes(q) ||
          (n.kind ?? "").toLowerCase().includes(q) ||
          (n.body_md ?? "").toLowerCase().includes(q)
        );
      })
    : [];

  return (
    <>
      {/* Toggle tab — right edge at 55% */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "55%",
          transform: "translateY(-50%)",
          zIndex: 1500,
          background: ACCENT,
          color: "#0F172A",
          border: "none",
          borderRadius: "6px 0 0 6px",
          padding: "6px 10px",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.05em",
          cursor: "pointer",
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          transition: "right 0.25s ease",
          boxShadow: `-2px 0 12px ${ACCENT}55`,
        }}
        aria-label={open ? "Close Brain Notes drawer" : "Open Brain Notes drawer"}
      >
        {open ? "NOTES ▶" : "NOTES ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          background: S?.bg ?? "#0B1120",
          borderLeft: `1px solid ${ACCENT}44`,
          boxShadow: open ? `-4px 0 32px ${ACCENT}22` : "none",
          transition: "right 0.25s ease",
          zIndex: 1499,
          display: "flex",
          flexDirection: "column",
          fontFamily: "monospace",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 14px 8px",
            borderBottom: `1px solid ${ACCENT}33`,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <span style={{ color: ACCENT, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em" }}>
              BRAIN NOTES
            </span>
            <span style={{ color: "#475569", fontSize: 10 }}>
              {notes == null ? "…" : `${visible.length}/${notes.length}`}
            </span>
          </div>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter by kind, title, body…"
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: "#1E293B",
              border: `1px solid ${ACCENT}44`,
              borderRadius: 4,
              color: "#CBD5E1",
              fontSize: 11,
              padding: "4px 8px",
              outline: "none",
            }}
          />
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "6px 0",
          }}
        >
          {!open ? null : err ? (
            <div style={{ color: "#F87171", fontSize: 11, padding: "12px 14px" }}>
              ⚠ /v1/brain/notes unreachable
            </div>
          ) : notes == null ? (
            <div style={{ color: "#475569", fontSize: 11, padding: "12px 14px" }}>Loading…</div>
          ) : visible.length === 0 ? (
            <div style={{ color: "#475569", fontSize: 11, padding: "12px 14px" }}>
              {filter ? "No matches." : "No notes found."}
            </div>
          ) : (
            visible.map((note) => {
              const isExp = expanded === note.id;
              const excerpt = (note.body_md ?? "").slice(0, 80) + ((note.body_md ?? "").length > 80 ? "…" : "");
              return (
                <div
                  key={note.id}
                  onClick={() => setExpanded(isExp ? null : note.id)}
                  style={{
                    padding: "7px 14px",
                    borderBottom: "1px solid #1E293B",
                    cursor: "pointer",
                    background: isExp ? "#1E293B" : "transparent",
                    transition: "background 0.15s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        color: kindColor(note.kind),
                        border: `1px solid ${kindColor(note.kind)}66`,
                        borderRadius: 3,
                        padding: "1px 4px",
                        flexShrink: 0,
                      }}
                    >
                      {(note.kind ?? "?").toUpperCase()}
                    </span>
                    {confDot(note.confidence)}
                    <span
                      style={{
                        color: "#94A3B8",
                        fontSize: 10,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                      }}
                    >
                      {note.title ?? "(untitled)"}
                    </span>
                    <span style={{ color: "#475569", fontSize: 9, flexShrink: 0 }}>
                      {note.updated_ts ? relAge(note.updated_ts) : ""}
                    </span>
                  </div>
                  {isExp ? (
                    <div
                      style={{
                        color: "#CBD5E1",
                        fontSize: 10,
                        lineHeight: 1.55,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        marginTop: 4,
                        paddingLeft: 2,
                        borderLeft: `2px solid ${ACCENT}55`,
                        paddingRight: 4,
                      }}
                    >
                      {note.body_md ?? ""}
                    </div>
                  ) : (
                    <div style={{ color: "#64748B", fontSize: 10, lineHeight: 1.4 }}>{excerpt}</div>
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
            borderTop: `1px solid ${ACCENT}22`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <span style={{ color: "#475569", fontSize: 9 }}>GET /v1/brain/notes · 5 min poll</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              bump();
            }}
            style={{
              background: "none",
              border: `1px solid ${ACCENT}44`,
              color: ACCENT,
              fontSize: 9,
              borderRadius: 3,
              padding: "2px 6px",
              cursor: "pointer",
            }}
          >
            ↺
          </button>
        </div>
      </div>
    </>
  );
}
