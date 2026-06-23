/**
 * IntentInboxDrawer — F49
 * Left-edge slide-in at 70 % vertical. Polls GET /v1/intent/list every 2 min.
 * Shows captured idea intents with state + source badges.
 * Quick-capture via POST /v1/intent/capture.
 * Tab: IDEAS ◀  Accent: sky-blue (#0EA5E9)
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 120_000;
const DRAWER_W = 300;
const SKY = "#0EA5E9";

const STATE_COLOR = {
  pending:   "#FFB340",
  ready:     SKY,
  converted: "#22C55E",
  archived:  "#6B7280",
};

function relTime(ts_s) {
  if (!ts_s) return "—";
  const diff = Math.floor(Date.now() / 1000 - ts_s);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function StateBadge({ state }) {
  const col = STATE_COLOR[state] ?? "#6B7280";
  return (
    <span style={{
      fontFamily: S.mono, fontSize: S.fs?.xxs ?? 9, color: col,
      border: `1px solid ${col}55`, borderRadius: 3,
      padding: "1px 5px", letterSpacing: 1,
      textTransform: "uppercase", flexShrink: 0,
    }}>
      {state ?? "pending"}
    </span>
  );
}

function SourceBadge({ source }) {
  if (!source || source === "ui") return null;
  return (
    <span style={{
      fontFamily: S.mono, fontSize: S.fs?.xxs ?? 9, color: "#6B7280",
      border: "1px solid #6B728044", borderRadius: 3,
      padding: "1px 5px", letterSpacing: 1,
      textTransform: "uppercase", flexShrink: 0,
    }}>
      {source}
    </span>
  );
}

export default function IntentInboxDrawer() {
  const [open, setOpen]     = useState(false);
  const [items, setItems]   = useState(null);
  const [err, setErr]       = useState(false);
  const [newText, setNewText] = useState("");
  const [busy, setBusy]     = useState(false);
  const [tick, bump]        = useReducer((n) => n + 1, 0);
  const timerRef            = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    kimiClient
      .request("/v1/intent/list?limit=30")
      .then((d) => {
        if (!alive) return;
        const arr = Array.isArray(d) ? d : (d?.items ?? []);
        setItems(arr);
        setErr(false);
      })
      .catch(() => { if (alive) setErr(true); });

    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => { alive = false; clearTimeout(timerRef.current); };
  }, [open, tick]);

  async function handleCapture(e) {
    e.preventDefault();
    const text = newText.trim();
    if (!text) return;
    setBusy(true);
    try {
      await kimiClient.request("/v1/intent/capture", {
        method: "POST",
        body: JSON.stringify({ text, source: "ui" }),
      });
      setNewText("");
      bump();
    } catch {
      /* capture failed — stay open so user can retry */
    } finally {
      setBusy(false);
    }
  }

  const count = items?.length ?? 0;

  return (
    <>
      {/* Tab toggle */}
      <div
        onClick={() => setOpen((o) => !o)}
        title="Intent Inbox — captured ideas"
        style={{
          position: "fixed", left: open ? DRAWER_W : 0, top: "70%",
          zIndex: 120, cursor: "pointer",
          background: open ? SKY : "rgba(5,8,13,0.82)",
          color: open ? "#04060A" : SKY,
          border: `1px solid ${SKY}77`,
          borderLeft: open ? "none" : `1px solid ${SKY}77`,
          borderRadius: open ? "0 6px 6px 0" : "0 6px 6px 0",
          padding: "6px 5px",
          fontSize: 9, fontFamily: S.mono, letterSpacing: 1.5,
          writingMode: "vertical-rl", textOrientation: "mixed",
          userSelect: "none", backdropFilter: "blur(6px)",
          boxShadow: `0 0 14px ${SKY}33`,
          transition: "left 0.25s ease",
        }}
      >
        IDEAS {count > 0 ? `(${count})` : "◀"}
      </div>

      {/* Drawer */}
      <div style={{
        position: "fixed", left: open ? 0 : -DRAWER_W - 2, top: 0, bottom: 0,
        width: DRAWER_W, zIndex: 119,
        background: "rgba(5,8,13,0.92)", borderRight: `1px solid ${SKY}44`,
        backdropFilter: "blur(12px)", display: "flex", flexDirection: "column",
        transition: "left 0.25s ease",
        fontFamily: S.mono, color: "#DCEBF5",
      }}>
        {/* Header */}
        <div style={{
          padding: "10px 14px 8px",
          borderBottom: `1px solid ${SKY}33`,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ color: SKY, fontSize: 10, letterSpacing: 2, fontWeight: 700 }}>
            INTENT INBOX
          </span>
          <span style={{
            marginLeft: "auto", fontSize: 9, color: "#6B7280",
          }}>
            {items === null ? "…" : `${count} idea${count !== 1 ? "s" : ""}`}
          </span>
        </div>

        {/* Quick-capture */}
        <form onSubmit={handleCapture} style={{
          padding: "8px 12px", borderBottom: `1px solid ${SKY}22`,
          display: "flex", gap: 6,
        }}>
          <input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Capture an idea…"
            disabled={busy}
            style={{
              flex: 1, background: "rgba(14,165,233,0.08)",
              border: `1px solid ${SKY}44`, borderRadius: 4,
              color: "#DCEBF5", fontFamily: S.mono, fontSize: 10,
              padding: "4px 8px", outline: "none",
            }}
          />
          <button type="submit" disabled={busy || !newText.trim()} style={{
            background: SKY, color: "#04060A", border: "none",
            borderRadius: 4, fontFamily: S.mono, fontSize: 10,
            padding: "4px 10px", cursor: "pointer", fontWeight: 700,
            opacity: (busy || !newText.trim()) ? 0.45 : 1,
          }}>
            {busy ? "…" : "+"}
          </button>
        </form>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {err && (
            <div style={{ padding: "14px", color: "#EF4444", fontSize: 10, textAlign: "center" }}>
              ENDPOINT ERROR — /v1/intent/list
            </div>
          )}
          {!err && items === null && (
            <div style={{ padding: "14px", color: "#6B7280", fontSize: 10, textAlign: "center" }}>
              LOADING…
            </div>
          )}
          {!err && items !== null && items.length === 0 && (
            <div style={{ padding: "14px", color: "#6B7280", fontSize: 10, textAlign: "center" }}>
              NO INTENTS CAPTURED
            </div>
          )}
          {!err && items !== null && items.map((item) => {
            const state = item.state ?? item.status ?? "pending";
            const source = item.source ?? "ui";
            const ts = item.ts ?? item.created_ts ?? item.created_at;
            const tsS = typeof ts === "number" ? (ts > 1e10 ? ts / 1000 : ts) : 0;
            return (
              <div key={item.id ?? item.text} style={{
                padding: "8px 14px",
                borderBottom: `1px solid ${SKY}11`,
              }}>
                <div style={{ fontSize: 11, lineHeight: 1.4, marginBottom: 4, wordBreak: "break-word" }}>
                  {item.text}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <StateBadge state={state} />
                  <SourceBadge source={source} />
                  <span style={{ marginLeft: "auto", fontSize: 9, color: "#4B5563" }}>
                    {relTime(tsS)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: "6px 14px",
          borderTop: `1px solid ${SKY}22`,
          fontSize: 9, color: "#374151", letterSpacing: 1,
        }}>
          GET /v1/intent/list · 2 min poll
        </div>
      </div>
    </>
  );
}
