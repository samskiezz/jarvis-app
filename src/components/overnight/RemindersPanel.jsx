/**
 * RemindersPanel — slide-in left-edge drawer listing pending reminders from
 * GET /reminders/list. Supports quick-add (POST /reminders/save) and
 * mark-done (POST /reminders/done/{rid}). Polls every 2 minutes while open.
 *
 * Tab fixed at 75% from top (below OpsCasesPanel at 60%, ScenarioRunsPanel at 35%).
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 120_000;
const DRAWER_W = 300;
const AMBER = "#FFB340";

function relTime(ts_s) {
  if (!ts_s) return "—";
  const diff = Math.floor(Date.now() / 1000 - ts_s);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function KindBadge({ kind }) {
  return (
    <span
      style={{
        fontFamily: S.mono,
        fontSize: S.fs.xxs,
        color: AMBER,
        border: `1px solid ${AMBER}55`,
        borderRadius: 3,
        padding: "1px 5px",
        letterSpacing: 1,
        flexShrink: 0,
        textTransform: "uppercase",
      }}
    >
      {kind ?? "note"}
    </span>
  );
}

export default function RemindersPanel() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newText, setNewText] = useState("");
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    kimiClient
      .request("/reminders/list")
      .then((d) => { if (alive) { setData(d); setErr(false); } })
      .catch(() => { if (alive) setErr(true); });

    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => {
      alive = false;
      clearTimeout(timerRef.current);
    };
  }, [open, tick]);

  async function handleAdd(e) {
    e.preventDefault();
    const text = newText.trim();
    if (!text) return;
    setBusy(true);
    try {
      await kimiClient.request("/reminders/save", {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      setNewText("");
      bump();
    } catch {
      // silent — bump on next poll
    } finally {
      setBusy(false);
    }
  }

  async function handleDone(rid) {
    try {
      await kimiClient.request(`/reminders/done/${rid}`, { method: "POST" });
      setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.filter((r) => r.id !== rid),
              count: (prev.count ?? prev.items.length) - 1,
            }
          : prev
      );
    } catch {
      // silent
    }
  }

  const items = data?.items ?? [];

  return (
    <>
      {/* Fixed toggle tab on the left edge at 75% from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close reminders" : "Open reminders"}
        style={{
          position: "fixed",
          left: open ? DRAWER_W : 0,
          top: "75%",
          transform: open ? "translateY(-50%) rotate(180deg)" : "translateY(-50%)",
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
        {open ? "NOTES ▶" : "NOTES ◀"}
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
          <span style={{ fontSize: S.fs.xs, color: AMBER, letterSpacing: 2, flex: 1 }}>
            REMINDERS
          </span>
          {data && (
            <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1 }}>
              {items.length} pending
            </span>
          )}
        </div>

        {/* Quick-add form */}
        <form
          onSubmit={handleAdd}
          style={{
            display: "flex",
            gap: 6,
            padding: "8px 14px",
            borderBottom: `1px solid ${S.border}`,
            flexShrink: 0,
          }}
        >
          <input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Add reminder…"
            maxLength={400}
            style={{
              flex: 1,
              background: "transparent",
              border: `1px solid ${AMBER}44`,
              borderRadius: 3,
              color: S.textHi,
              fontFamily: S.mono,
              fontSize: S.fs.xxs,
              letterSpacing: 0.5,
              padding: "4px 7px",
              outline: "none",
            }}
          />
          <button
            type="submit"
            disabled={busy || !newText.trim()}
            style={{
              background: "transparent",
              border: `1px solid ${AMBER}66`,
              borderRadius: 3,
              color: AMBER,
              fontFamily: S.mono,
              fontSize: S.fs.xxs,
              letterSpacing: 1,
              padding: "4px 9px",
              cursor: busy || !newText.trim() ? "default" : "pointer",
              opacity: busy || !newText.trim() ? 0.4 : 1,
            }}
          >
            ADD
          </button>
        </form>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {!open ? null : err ? (
            <div style={{ padding: "20px 14px", color: "#e8203c", fontSize: S.fs.xs, letterSpacing: 1 }}>
              ENDPOINT UNREACHABLE
            </div>
          ) : !data ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              NO PENDING REMINDERS
            </div>
          ) : (
            items.map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "7px 14px",
                  borderBottom: `1px solid ${S.border}`,
                }}
              >
                {/* Done button */}
                <button
                  onClick={() => handleDone(r.id)}
                  title="Mark done"
                  style={{
                    flexShrink: 0,
                    marginTop: 2,
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    border: `1px solid ${AMBER}88`,
                    background: "transparent",
                    cursor: "pointer",
                    padding: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: S.fs.xs,
                      color: S.textHi,
                      letterSpacing: 0.5,
                      wordBreak: "break-word",
                    }}
                  >
                    {r.text}
                  </div>
                  <div style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1, marginTop: 2 }}>
                    {relTime(r.ts)}
                  </div>
                </div>
                <KindBadge kind={r.kind} />
              </div>
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
          {data ? "LIVE · 2 MIN POLL" : err ? "ERR" : "…"}
        </div>
      </div>
    </>
  );
}
