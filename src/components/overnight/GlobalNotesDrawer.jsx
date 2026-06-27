/**
 * GlobalNotesDrawer — F151
 * Right-edge slide-in at 9 % vertical.
 * Lists and adds collaboration notes via the real collab API:
 *   GET  /v1/notes?resource_type=graph&resource_id=global
 *   POST /v1/notes  { resource_type, resource_id, body, author }
 * Polls every 2 min while open. Expands full body on row click.
 * Gold (#FBBF24) accent.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const GOLD = "#FBBF24";
const DIM = "rgba(251,191,36,0.18)";
const MONO = "'JetBrains Mono','SF Mono',ui-monospace,monospace";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
const RESOURCE_TYPE = "graph";
const RESOURCE_ID = "global";

function rel(ts) {
  if (!ts) return "";
  const d = Date.now() / 1000 - ts;
  if (d < 60) return `${Math.round(d)}s ago`;
  if (d < 3600) return `${Math.round(d / 60)}m ago`;
  if (d < 86400) return `${Math.round(d / 3600)}h ago`;
  return `${Math.round(d / 86400)}d ago`;
}

async function fetchNotes() {
  const r = await fetch(
    `${apiBase()}/v1/notes?resource_type=${RESOURCE_TYPE}&resource_id=${RESOURCE_ID}`,
    { headers: { Authorization: `Bearer ${API_KEY}` } }
  );
  const d = await r.json();
  const items = Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : [];
  return [...items].reverse();
}

async function postNote(body, author) {
  const r = await fetch(`${apiBase()}/v1/notes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ resource_type: RESOURCE_TYPE, resource_id: RESOURCE_ID, body, author }),
  });
  return r.ok;
}

export default function GlobalNotesDrawer() {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("operator");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      setNotes(await fetchNotes());
      setError(null);
    } catch (e) {
      setError(e.message || "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 120_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function handleAdd() {
    if (!text.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const ok = await postNote(text.trim(), author.trim() || "operator");
      if (ok) {
        setText("");
        await load();
      } else {
        setSaveError("Server rejected note.");
      }
    } catch (e) {
      setSaveError(e.message || "Post failed");
    } finally {
      setSaving(false);
    }
  }

  const TAB_TOP = "9%";

  return (
    <>
      {/* Tab button */}
      <div
        onClick={() => setOpen((o) => !o)}
        title="Global Notes Thread"
        style={{
          position: "fixed",
          right: open ? 360 : 0,
          top: TAB_TOP,
          zIndex: 1500,
          background: open ? GOLD : "rgba(10,18,28,0.92)",
          color: open ? "#0A0A0A" : GOLD,
          border: `1px solid ${GOLD}`,
          borderRight: "none",
          borderRadius: "6px 0 0 6px",
          padding: "28px 5px",
          cursor: "pointer",
          writingMode: "vertical-rl",
          fontSize: 9,
          fontFamily: MONO,
          letterSpacing: 2,
          fontWeight: 700,
          transition: "right 0.22s ease, background 0.15s",
          userSelect: "none",
        }}
      >
        NOTES
        {notes.length > 0 && (
          <span
            style={{
              display: "block",
              background: GOLD,
              color: "#0A0A0A",
              borderRadius: "50%",
              width: 14,
              height: 14,
              fontSize: 8,
              textAlign: "center",
              lineHeight: "14px",
              margin: "4px auto 0",
              writingMode: "horizontal-tb",
            }}
          >
            {notes.length > 99 ? "99" : notes.length}
          </span>
        )}
      </div>

      {/* Drawer */}
      {open && (
        <div
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            width: 360,
            height: "100vh",
            zIndex: 1499,
            background: "rgba(6,10,18,0.97)",
            borderLeft: `1px solid ${DIM}`,
            display: "flex",
            flexDirection: "column",
            fontFamily: MONO,
            boxShadow: `-8px 0 40px rgba(251,191,36,0.08)`,
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "12px 14px 10px",
              borderBottom: `1px solid ${DIM}`,
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexShrink: 0,
            }}
          >
            <span style={{ color: GOLD, fontSize: 12, fontWeight: 700, letterSpacing: 2, flex: 1 }}>
              ◈ GLOBAL NOTES
            </span>
            <span style={{ color: "#3A5060", fontSize: 9, letterSpacing: 1 }}>
              {loading ? "…" : `${notes.length} note${notes.length !== 1 ? "s" : ""}`}
            </span>
          </div>

          {/* Quick-add */}
          <div
            style={{
              padding: "10px 12px",
              borderBottom: `1px solid ${DIM}`,
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Author"
              style={{
                background: "rgba(251,191,36,0.06)",
                border: `1px solid ${DIM}`,
                borderRadius: 4,
                color: "#DCEBF5",
                padding: "4px 8px",
                fontSize: 10,
                fontFamily: MONO,
                outline: "none",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAdd();
              }}
              placeholder="Add a note… (⌘↵ to save)"
              rows={3}
              style={{
                background: "rgba(251,191,36,0.06)",
                border: `1px solid ${DIM}`,
                borderRadius: 4,
                color: "#DCEBF5",
                padding: "6px 8px",
                fontSize: 11,
                fontFamily: MONO,
                outline: "none",
                resize: "none",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
            {saveError && (
              <span style={{ color: "#F87171", fontSize: 9, letterSpacing: 1 }}>{saveError}</span>
            )}
            <button
              onClick={handleAdd}
              disabled={saving || !text.trim()}
              style={{
                background: saving || !text.trim() ? "rgba(251,191,36,0.15)" : GOLD,
                color: saving || !text.trim() ? GOLD : "#0A0A0A",
                border: `1px solid ${GOLD}`,
                borderRadius: 4,
                padding: "5px 0",
                fontSize: 10,
                fontFamily: MONO,
                fontWeight: 700,
                letterSpacing: 1,
                cursor: saving || !text.trim() ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "SAVING…" : "ADD NOTE"}
            </button>
          </div>

          {/* Notes list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
            {error && (
              <div
                style={{
                  padding: "12px 14px",
                  color: "#F87171",
                  fontSize: 10,
                  letterSpacing: 1,
                }}
              >
                ⚠ {error}
              </div>
            )}
            {!error && notes.length === 0 && !loading && (
              <div
                style={{
                  padding: "16px 14px",
                  color: "#3A5060",
                  fontSize: 10,
                  letterSpacing: 1,
                  textAlign: "center",
                }}
              >
                NO NOTES YET
              </div>
            )}
            {notes.map((n) => {
              const id = n.id || n.note_id || Math.random();
              const body = n.body || n.text || n.content || "";
              const auth = n.author || n.actor || "—";
              const ts = n.ts || n.created_at || n.created_ts || 0;
              const isExp = expanded === id;
              return (
                <div
                  key={id}
                  onClick={() => setExpanded(isExp ? null : id)}
                  style={{
                    padding: "8px 14px",
                    borderBottom: `1px solid rgba(251,191,36,0.06)`,
                    cursor: "pointer",
                    background: isExp ? "rgba(251,191,36,0.04)" : "transparent",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        background: DIM,
                        border: `1px solid ${GOLD}33`,
                        borderRadius: 3,
                        padding: "1px 5px",
                        color: GOLD,
                        fontSize: 8,
                        letterSpacing: 1,
                        flexShrink: 0,
                      }}
                    >
                      {auth}
                    </span>
                    <span style={{ color: "#3A5060", fontSize: 8, letterSpacing: 1, marginLeft: "auto" }}>
                      {rel(ts)}
                    </span>
                  </div>
                  <div
                    style={{
                      color: isExp ? "#DCEBF5" : "#7A95AB",
                      fontSize: 11,
                      lineHeight: 1.45,
                      maxHeight: isExp ? 220 : 38,
                      overflow: "hidden",
                      whiteSpace: isExp ? "pre-wrap" : "nowrap",
                      textOverflow: isExp ? "unset" : "ellipsis",
                      transition: "max-height 0.2s ease",
                    }}
                  >
                    {body}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "6px 14px",
              borderTop: `1px solid ${DIM}`,
              color: "#2E4050",
              fontSize: 8,
              letterSpacing: 1,
              flexShrink: 0,
            }}
          >
            GET /v1/notes · resource_type=graph · resource_id=global · 2-min poll
          </div>
        </div>
      )}
    </>
  );
}
