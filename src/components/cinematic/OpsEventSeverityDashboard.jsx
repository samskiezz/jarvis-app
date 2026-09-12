import { useState, useEffect, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 55080;
const REFRESH_MS = 45_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function severity(ev) {
  const s = (ev.severity || ev.level || ev.type || "").toUpperCase();
  if (s.includes("CRIT")) return "CRITICAL";
  if (s.includes("WARN") || s.includes("HIGH")) return "WARNING";
  return "INFO";
}

async function fetchEvents() {
  const resp = await fetch(`${apiBase()}/v1/ops/events`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!resp.ok) throw new Error(`ops/events ${resp.status}`);
  const raw = await resp.json();
  return Array.isArray(raw) ? raw : raw.items || raw.data || raw.results || [];
}

export function isSevdashQuery(q) {
  return /ops.sever|event.sever|sever.dash|sevdash|sever.distrib|event.distrib/i.test(
    q || ""
  );
}

export async function buildSevdashScript() {
  try {
    const events = await fetchEvents();
    const counts = { CRITICAL: 0, WARNING: 0, INFO: 0 };
    events.forEach((e) => { counts[severity(e)]++; });
    const total = events.length;
    const resp = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        message: `Ops event severity distribution: ${counts.CRITICAL} CRITICAL, ${counts.WARNING} WARNING, ${counts.INFO} INFO out of ${total} total events. Provide a 2-sentence operational severity assessment and risk posture summary.`,
      }),
    });
    if (!resp.ok) return `Severity — ${counts.CRITICAL} critical, ${counts.WARNING} warning, ${counts.INFO} info across ${total} events.`;
    const data = await resp.json();
    return data.response || data.message || data.answer || `Severity — ${counts.CRITICAL} critical, ${counts.WARNING} warning, ${counts.INFO} info across ${total} events.`;
  } catch {
    return "Unable to assess ops severity at this time.";
  }
}

const SEV_COLORS = {
  CRITICAL: { bg: "rgba(220,38,38,0.18)", border: "#dc2626", text: "#fca5a5" },
  WARNING:  { bg: "rgba(234,179,8,0.15)",  border: "#ca8a04", text: "#fde047" },
  INFO:     { bg: "rgba(59,130,246,0.12)", border: "#2563eb", text: "#93c5fd" },
};

export default function OpsEventSeverityDashboard() {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState("");
  const [err, setErr] = useState("");
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const data = await fetchEvents();
      setEvents(data);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    window.addEventListener("jarvis:sevdash-toggle", handler);
    return () => window.removeEventListener("jarvis:sevdash-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    intervalRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  const grouped = { CRITICAL: [], WARNING: [], INFO: [] };
  events.forEach((e) => grouped[severity(e)].push(e));
  const latest = {};
  Object.entries(grouped).forEach(([sev, evs]) => {
    if (evs.length > 0) latest[sev] = evs[0];
  });

  async function assess() {
    setAssessing(true);
    setBrief("");
    const script = await buildSevdashScript();
    setBrief(script);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
  }

  const W = 520;
  const H = 460;

  return (
    <>
      {/* Bottom strip toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 65,
          background: grouped.CRITICAL.length > 0
            ? "rgba(220,38,38,0.22)"
            : "rgba(15,23,42,0.82)",
          border: `1px solid ${grouped.CRITICAL.length > 0 ? "#dc2626" : "#1e3a5f"}`,
          color: grouped.CRITICAL.length > 0 ? "#fca5a5" : "#38bdf8",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9,
          letterSpacing: 1.5,
          padding: "3px 8px",
          cursor: "pointer",
          borderRadius: 2,
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
        title="Ops Event Severity Dashboard"
      >
        ◈ SEVDASH
        {grouped.CRITICAL.length > 0 && (
          <span
            style={{
              marginLeft: 5,
              background: "#dc2626",
              color: "#fff",
              borderRadius: 2,
              padding: "1px 4px",
              fontSize: 8,
              fontWeight: 700,
            }}
          >
            {grouped.CRITICAL.length}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 36,
            left: Math.min(BTN_LEFT, window.innerWidth - W - 12),
            width: W,
            maxHeight: H,
            overflowY: "auto",
            background: "rgba(8,15,30,0.97)",
            border: "1px solid #1e3a5f",
            borderRadius: 6,
            zIndex: 107,
            padding: 16,
            fontFamily: "'JetBrains Mono',monospace",
            color: "#e2e8f0",
            fontSize: 11,
            boxShadow: "0 0 40px rgba(56,189,248,0.08)",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ color: "#38bdf8", fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>
              ◈ OPS EVENT SEVERITY DASHBOARD
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{
                  background: "rgba(56,189,248,0.12)",
                  border: "1px solid #1e3a5f",
                  color: "#38bdf8",
                  fontFamily: "inherit",
                  fontSize: 9,
                  padding: "2px 8px",
                  cursor: assessing ? "wait" : "pointer",
                  borderRadius: 2,
                  letterSpacing: 1,
                }}
              >
                {assessing ? "ASSESSING…" : "▶ ASSESS"}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#64748b",
                  cursor: "pointer",
                  fontSize: 14,
                  lineHeight: 1,
                  padding: "0 2px",
                }}
              >
                ×
              </button>
            </div>
          </div>

          {/* Status row */}
          {loading && (
            <div style={{ color: "#38bdf8", fontSize: 10, marginBottom: 10 }}>
              ◌ LOADING EVENTS…
            </div>
          )}
          {err && (
            <div style={{ color: "#f87171", fontSize: 10, marginBottom: 10 }}>
              ✗ {err}
            </div>
          )}

          {/* Severity tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
            {["CRITICAL", "WARNING", "INFO"].map((sev) => {
              const c = SEV_COLORS[sev];
              return (
                <div
                  key={sev}
                  style={{
                    background: c.bg,
                    border: `1px solid ${c.border}`,
                    borderRadius: 4,
                    padding: "10px 12px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ color: c.text, fontSize: 22, fontWeight: 700, lineHeight: 1 }}>
                    {grouped[sev].length}
                  </div>
                  <div style={{ color: c.text, fontSize: 9, letterSpacing: 1.5, marginTop: 4, opacity: 0.85 }}>
                    {sev}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Total */}
          <div style={{ color: "#64748b", fontSize: 10, marginBottom: 12 }}>
            TOTAL EVENTS: {events.length}
          </div>

          {/* Most-recent per severity */}
          {["CRITICAL", "WARNING", "INFO"].map((sev) => {
            const ev = latest[sev];
            if (!ev) return null;
            const c = SEV_COLORS[sev];
            const ts = ev.timestamp || ev.created_at || ev.time || "";
            const title = ev.title || ev.name || ev.message || ev.description || "—";
            const service = ev.service || ev.source || ev.component || "";
            return (
              <div
                key={sev}
                style={{
                  background: c.bg,
                  border: `1px solid ${c.border}44`,
                  borderRadius: 4,
                  padding: "8px 10px",
                  marginBottom: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ color: c.text, fontSize: 9, letterSpacing: 1.5, marginBottom: 4 }}>
                    LATEST {sev}
                  </div>
                  {ts && (
                    <div style={{ color: "#475569", fontSize: 9 }}>
                      {String(ts).slice(0, 19).replace("T", " ")}
                    </div>
                  )}
                </div>
                <div style={{ color: "#e2e8f0", fontSize: 10, lineHeight: 1.4 }}>{title}</div>
                {service && (
                  <div style={{ color: "#475569", fontSize: 9, marginTop: 3 }}>
                    {service}
                  </div>
                )}
              </div>
            );
          })}

          {/* AI brief */}
          {brief && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 12px",
                background: "rgba(56,189,248,0.06)",
                border: "1px solid #1e3a5f",
                borderRadius: 4,
                color: "#bae6fd",
                fontSize: 10,
                lineHeight: 1.6,
              }}
            >
              <div style={{ color: "#38bdf8", fontSize: 9, letterSpacing: 1.5, marginBottom: 6 }}>
                ▸ JARVIS SEVERITY ASSESSMENT
              </div>
              {brief}
            </div>
          )}

          {/* Empty state */}
          {!loading && !err && events.length === 0 && (
            <div style={{ color: "#475569", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              No ops events found.
            </div>
          )}
        </div>
      )}
    </>
  );
}
