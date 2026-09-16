/**
 * RemindersPanel (F469)
 * Polls /reminders/list every 60 s; shows pending reminders sorted newest-first.
 * Badge on open count. ◈ REM button bottom-left. Wired to JarvisBrain voice.
 * Real endpoint only — no fake data.
 */
import { useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const AM = "#f59e0b";
const GR = "#00c878";
const MONO = "'JetBrains Mono','Courier New',monospace";
const API_KEY =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_KEY) ||
  "dev-key";

const KIND_COLOR = { note: CY, task: AM, alert: "#F43F5E", reminder: GR };

function kindColor(k) {
  return KIND_COLOR[k] || CY;
}

function fmt(ts) {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  const now = new Date();
  const diffH = (now - d) / 3_600_000;
  if (diffH < 24) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffH < 24 * 7) return d.toLocaleDateString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

async function fetchReminders() {
  const r = await fetch(`${apiBase()}/reminders/list?limit=50&include_done=false`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export function isRemindersQuery(q) {
  return /reminder|remind me|my notes|pending note|note list|to.?do list|my tasks.*remind|reminders panel|rem panel|ovremind/i.test(q || "");
}

export async function buildRemindersScript() {
  try {
    const d = await fetchReminders();
    const items = d.items || [];
    if (!items.length) {
      window.dispatchEvent(new CustomEvent("jarvis:reminders-toggle"));
      return "No pending reminders, sir. Your slate is clean.";
    }
    const top = items.slice(0, 3).map((r) => `"${r.text.slice(0, 60)}"`).join(", ");
    window.dispatchEvent(new CustomEvent("jarvis:reminders-toggle"));
    return `You have ${items.length} pending reminder${items.length !== 1 ? "s" : ""}, sir. Most recent: ${top}. Opening the panel now.`;
  } catch {
    return "I was unable to reach the reminders service, sir.";
  }
}

export default function RemindersPanel() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const timerRef = useRef(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const d = await fetchReminders();
      setItems(d.items || []);
    } catch (e) {
      setErr(e.message || "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:reminders-toggle", onToggle);
    return () => window.removeEventListener("jarvis:reminders-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 60_000);
    return () => clearInterval(timerRef.current);
  }, [open]);

  const pending = items.filter((r) => !r.done);

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          position: "fixed",
          left: 119_400,
          bottom: 8,
          zIndex: 120,
          fontFamily: MONO,
          fontSize: 10,
          color: open ? "#000" : CY,
          background: open ? CY : "rgba(41,231,255,0.08)",
          border: `1px solid ${CY}55`,
          borderRadius: 4,
          padding: "3px 8px",
          cursor: "pointer",
          letterSpacing: 1,
        }}
        title="Reminders Panel"
      >
        ◈ REM{pending.length > 0 ? ` [${pending.length}]` : ""}
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            right: 20,
            top: 80,
            width: 380,
            maxHeight: "70vh",
            overflowY: "auto",
            background: "rgba(0,8,20,0.96)",
            border: `1px solid ${CY}33`,
            borderRadius: 10,
            zIndex: 9999,
            fontFamily: MONO,
            padding: "14px 16px",
            boxShadow: `0 0 30px ${CY}18`,
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>◈ REMINDERS</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={load}
                style={{
                  background: "none",
                  border: `1px solid ${CY}44`,
                  color: CY,
                  fontSize: 9,
                  padding: "2px 7px",
                  borderRadius: 3,
                  cursor: "pointer",
                  fontFamily: MONO,
                }}
              >
                ↺ REFRESH
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#fff4",
                  fontSize: 14,
                  cursor: "pointer",
                  padding: "0 4px",
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {loading && !items.length && (
            <div style={{ color: `${CY}88`, fontSize: 10, textAlign: "center", padding: 20 }}>
              LOADING…
            </div>
          )}

          {err && (
            <div style={{ color: "#F43F5E", fontSize: 10, padding: "8px 0" }}>
              ERROR: {err}
            </div>
          )}

          {!loading && !err && items.length === 0 && (
            <div style={{ color: "#fff4", fontSize: 10, textAlign: "center", padding: 20 }}>
              No pending reminders.
            </div>
          )}

          {items.map((item) => (
            <div
              key={item.id}
              style={{
                background: "rgba(255,255,255,0.025)",
                border: `1px solid ${kindColor(item.kind)}22`,
                borderLeft: `3px solid ${kindColor(item.kind)}`,
                borderRadius: 6,
                padding: "7px 10px",
                marginBottom: 7,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span
                  style={{
                    fontSize: 9,
                    letterSpacing: 1,
                    color: kindColor(item.kind),
                    textTransform: "uppercase",
                  }}
                >
                  {item.kind}
                </span>
                <span style={{ fontSize: 9, color: "#fff3" }}>{fmt(item.ts)}</span>
              </div>
              <div style={{ fontSize: 11, color: "#e8f4ff", lineHeight: 1.45 }}>
                {item.text}
              </div>
            </div>
          ))}

          <div
            style={{
              borderTop: `1px solid ${CY}18`,
              marginTop: 10,
              paddingTop: 8,
              fontSize: 9,
              color: "#fff3",
              textAlign: "center",
            }}
          >
            {pending.length} pending · auto-refreshes every 60 s
          </div>
        </div>
      )}
    </>
  );
}
