/**
 * DailyNotePanel — left-edge slide-in at 76% from top.
 *
 * Fetches today's Second Brain daily note from GET /v1/brain/daily on open,
 * then lets the operator append timestamped entries via POST /v1/brain/daily.
 * Manual refresh button in footer. No polling — daily note is fetched on demand.
 *
 * Accent: #BEF264 (lime-300).
 */
import { useEffect, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const LIME = "#BEF264";
const DRAWER_W = 320;

function relTime(ts_s) {
  if (!ts_s) return "—";
  const diff = Math.floor(Date.now() / 1000 - ts_s);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function Badge({ label, color }) {
  return (
    <span
      style={{
        fontFamily: S.mono,
        fontSize: S.fs.xxs,
        color: color ?? LIME,
        border: `1px solid ${color ?? LIME}55`,
        borderRadius: 3,
        padding: "1px 5px",
        letterSpacing: 1,
        flexShrink: 0,
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
  );
}

export default function DailyNotePanel() {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(null);
  const [err, setErr] = useState(false);
  const [loading, setLoading] = useState(false);
  const [appendText, setAppendText] = useState("");
  const [busy, setBusy] = useState(false);
  const [appendErr, setAppendErr] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    load();
  }, [open]);

  function load() {
    setLoading(true);
    setErr(false);
    kimiClient
      .request("/v1/brain/daily")
      .then((d) => {
        setNote(d);
        setErr(false);
      })
      .catch(() => setErr(true))
      .finally(() => setLoading(false));
  }

  function refresh() {
    fetchedRef.current = false;
    setNote(null);
    load();
    fetchedRef.current = true;
  }

  async function handleAppend(e) {
    e.preventDefault();
    const text = appendText.trim();
    if (!text) return;
    setBusy(true);
    setAppendErr(false);
    try {
      const updated = await kimiClient.request("/v1/brain/daily", {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      setNote(updated);
      setAppendText("");
    } catch {
      setAppendErr(true);
    } finally {
      setBusy(false);
    }
  }

  const body = note?.body_md ?? "";
  const lines = body.split("\n").filter((l) => l.trim());
  const wordCount = body.split(/\s+/).filter(Boolean).length;
  const links = Array.isArray(note?.outgoing_links) ? note.outgoing_links : [];

  return (
    <>
      {/* Fixed toggle tab on the left edge at 76% from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close daily note" : "Open today's daily note"}
        style={{
          position: "fixed",
          left: open ? DRAWER_W : 0,
          top: "76%",
          transform: open ? "translateY(-50%) rotate(180deg)" : "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${LIME}55`,
          borderLeft: open ? "none" : `1px solid ${LIME}55`,
          color: LIME,
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
        {open ? "TODAY ▶" : "TODAY ◀"}
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
          background: "rgba(2,6,10,0.97)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderRight: `1px solid ${LIME}33`,
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
          <span style={{ fontSize: S.fs.xs, color: LIME, letterSpacing: 2, flex: 1 }}>
            DAILY NOTE
          </span>
          {note && (
            <>
              <Badge label="daily" />
              <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1 }}>
                {wordCount}w
              </span>
            </>
          )}
        </div>

        {/* Note title + meta */}
        {note && (
          <div
            style={{
              padding: "8px 14px",
              borderBottom: `1px solid ${S.border}`,
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: S.fs.sm, color: LIME, letterSpacing: 1, fontWeight: 600 }}>
              {note.title ?? "—"}
            </div>
            <div
              style={{
                fontSize: S.fs.xxs,
                color: S.text,
                letterSpacing: 1,
                marginTop: 3,
                display: "flex",
                gap: 10,
              }}
            >
              <span>updated {relTime(note.updated_ts)}</span>
              {links.length > 0 && (
                <span style={{ color: `${LIME}99` }}>{links.length} link{links.length !== 1 ? "s" : ""}</span>
              )}
            </div>
          </div>
        )}

        {/* Quick-append form */}
        <form
          onSubmit={handleAppend}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 5,
            padding: "8px 14px",
            borderBottom: `1px solid ${S.border}`,
            flexShrink: 0,
          }}
        >
          <textarea
            value={appendText}
            onChange={(e) => setAppendText(e.target.value)}
            placeholder="Append an entry to today's note…"
            maxLength={1000}
            rows={2}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleAppend(e);
            }}
            style={{
              background: "transparent",
              border: `1px solid ${LIME}44`,
              borderRadius: 3,
              color: S.textHi,
              fontFamily: S.mono,
              fontSize: S.fs.xxs,
              letterSpacing: 0.5,
              padding: "4px 7px",
              outline: "none",
              resize: "none",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="submit"
              disabled={busy || !appendText.trim()}
              style={{
                background: "transparent",
                border: `1px solid ${LIME}66`,
                borderRadius: 3,
                color: LIME,
                fontFamily: S.mono,
                fontSize: S.fs.xxs,
                letterSpacing: 1,
                padding: "4px 9px",
                cursor: busy || !appendText.trim() ? "default" : "pointer",
                opacity: busy || !appendText.trim() ? 0.4 : 1,
              }}
            >
              {busy ? "APPENDING…" : "APPEND"}
            </button>
            {appendErr && (
              <span style={{ fontSize: S.fs.xxs, color: "#e8203c", letterSpacing: 1 }}>
                APPEND FAILED
              </span>
            )}
            <span style={{ fontSize: S.fs.xxs, color: `${S.text}66`, letterSpacing: 0.5, marginLeft: "auto" }}>
              ⌘↵
            </span>
          </div>
        </form>

        {/* Note body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {!open ? null : loading ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          ) : err ? (
            <div style={{ padding: "20px 14px", color: "#e8203c", fontSize: S.fs.xs, letterSpacing: 1 }}>
              ENDPOINT UNREACHABLE
            </div>
          ) : !note ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              NO NOTE LOADED
            </div>
          ) : lines.length === 0 ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              EMPTY NOTE — append an entry above
            </div>
          ) : (
            <pre
              style={{
                margin: 0,
                padding: "10px 14px",
                fontSize: S.fs.xxs,
                color: S.textHi,
                fontFamily: S.mono,
                letterSpacing: 0.5,
                lineHeight: 1.7,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {body}
            </pre>
          )}

          {/* Outgoing links */}
          {note && links.length > 0 && (
            <div
              style={{
                padding: "8px 14px",
                borderTop: `1px solid ${S.border}`,
                marginTop: 4,
              }}
            >
              <div style={{ fontSize: S.fs.xxs, color: `${LIME}99`, letterSpacing: 1, marginBottom: 4 }}>
                OUTGOING LINKS
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {links.map((lnk, i) => (
                  <span
                    key={i}
                    style={{
                      fontSize: S.fs.xxs,
                      color: LIME,
                      border: `1px solid ${LIME}33`,
                      borderRadius: 3,
                      padding: "1px 6px",
                      letterSpacing: 0.5,
                    }}
                  >
                    [[{lnk}]]
                  </span>
                ))}
              </div>
            </div>
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
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ flex: 1 }}>
            {err ? "ERR" : loading ? "…" : note ? `LOADED ${relTime(note.updated_ts)}` : "IDLE"}
          </span>
          <button
            onClick={refresh}
            title="Refresh note"
            style={{
              background: "transparent",
              border: `1px solid ${LIME}44`,
              borderRadius: 3,
              color: `${LIME}99`,
              fontFamily: S.mono,
              fontSize: S.fs.xxs,
              letterSpacing: 1,
              padding: "2px 7px",
              cursor: "pointer",
            }}
          >
            ↻ REFRESH
          </button>
        </div>
      </div>
    </>
  );
}
