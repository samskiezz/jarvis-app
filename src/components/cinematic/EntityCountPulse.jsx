/**
 * EntityCountPulse — F31 Entity Count Pulse.
 * Compact HUD panel that polls all 6 entity endpoints in parallel every 60s
 * and shows live counts with deltas (↑/↓/=) since the previous poll.
 *
 * Button: ◈ PULSE (bottom strip, left:540)
 * Endpoints: /entities/{Task,RiskSignal,IntelProfile,SwarmJob,Investment,Contact}
 * Voice trigger: "entity pulse" | "entity counts" | "how many entities"
 * Additive only — mounted via App.jsx.
 */
import { useEffect, useRef, useState, useCallback } from "react";

const CY  = "#29E7FF";
const GRN = "#00E676";
const RED = "#FF3B6B";
const GLD = "#FFD700";
const GRY = "#6E8AA0";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = (typeof import.meta !== "undefined" && import.meta.env) || {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

const ENTITY_TYPES = [
  { key: "Task",         label: "TASKS",    icon: "◎", color: CY           },
  { key: "RiskSignal",   label: "RISKS",    icon: "⚠", color: RED          },
  { key: "IntelProfile", label: "INTEL",    icon: "◈", color: GLD          },
  { key: "SwarmJob",     label: "SWARM",    icon: "⬡", color: GRN          },
  { key: "Investment",   label: "INVEST",   icon: "◆", color: "#A78BFA"    },
  { key: "Contact",      label: "CONTACTS", icon: "◉", color: "#38BDF8"    },
];

const VOICE_RE = /\bentity\s*(pulse|counts?|total|inventory)|how many entities|entity\s*monitor/i;

async function fetchCount(type) {
  const r = await fetch(`${apiBase()}/entities/${type}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) return null;
  const d = await r.json();
  const arr = Array.isArray(d)       ? d
    : Array.isArray(d?.data)         ? d.data
    : Array.isArray(d?.items)        ? d.items
    : Array.isArray(d?.results)      ? d.results
    : [];
  return arr.length;
}

async function fetchAllCounts() {
  const results = await Promise.allSettled(
    ENTITY_TYPES.map((t) => fetchCount(t.key))
  );
  return ENTITY_TYPES.map((t, i) => ({
    ...t,
    count: results[i].status === "fulfilled" ? results[i].value : null,
  }));
}

function DeltaBadge({ delta }) {
  if (delta === null || delta === 0) {
    return <span style={{ color: GRY, fontSize: 10 }}>—</span>;
  }
  const up = delta > 0;
  return (
    <span style={{ color: up ? GRN : RED, fontSize: 10 }}>
      {up ? "↑" : "↓"}{Math.abs(delta)}
    </span>
  );
}

export default function EntityCountPulse() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [deltas, setDeltas]     = useState({});
  const [lastPoll, setLastPoll] = useState(null);
  const [loading, setLoading]   = useState(false);
  const prevCounts              = useRef({});
  const timerRef                = useRef(null);

  const poll = useCallback(async () => {
    setLoading(true);
    try {
      const fresh = await fetchAllCounts();
      const newDeltas = {};
      for (const r of fresh) {
        const prev = prevCounts.current[r.key];
        newDeltas[r.key] = (prev != null && r.count != null) ? r.count - prev : null;
        if (r.count != null) prevCounts.current[r.key] = r.count;
      }
      setRows(fresh);
      setDeltas(newDeltas);
      setLastPoll(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    poll();
    timerRef.current = setInterval(poll, 60_000);
    return () => clearInterval(timerRef.current);
  }, [open, poll]);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.query || "";
      if (VOICE_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const total = rows.reduce((s, r) => s + (r.count ?? 0), 0);

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Entity Count Pulse — live entity inventory"
        style={{
          position: "fixed",
          bottom: 18,
          left: 540,
          zIndex: 9999,
          background: open ? `${CY}22` : "rgba(5,10,18,0.85)",
          border: `1px solid ${open ? CY : CY + "55"}`,
          borderRadius: 8,
          color: open ? CY : GRY,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          letterSpacing: 1.5,
          padding: "4px 10px",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ◈ PULSE
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 50,
            left: 480,
            zIndex: 10000,
            width: 340,
            background: "rgba(5,10,18,0.96)",
            border: `1px solid ${CY}44`,
            borderTop: `2px solid ${CY}`,
            borderRadius: 12,
            boxShadow: `0 0 60px ${CY}18, 0 20px 40px rgba(0,0,0,0.8)`,
            fontFamily: "'JetBrains Mono', monospace",
            overflow: "hidden",
          }}
        >
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px",
            borderBottom: `1px solid ${CY}22`,
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>
              ◈ ENTITY COUNT PULSE
            </span>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {loading && (
                <span style={{ color: GLD, fontSize: 9, letterSpacing: 1 }}>POLLING…</span>
              )}
              <button
                onClick={poll}
                title="Refresh now"
                style={{
                  background: "transparent", border: `1px solid ${CY}44`,
                  borderRadius: 4, color: CY, fontSize: 9, letterSpacing: 1,
                  padding: "2px 7px", cursor: "pointer",
                }}
              >
                ↺
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "transparent", border: "none",
                  color: GRY, fontSize: 14, cursor: "pointer", lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          </div>

          <div style={{ padding: "8px 0" }}>
            {rows.length === 0 && !loading && (
              <div style={{ padding: "16px 14px", color: GRY, fontSize: 11, textAlign: "center" }}>
                No data yet — polling…
              </div>
            )}
            {rows.map((r) => (
              <div
                key={r.key}
                style={{ display: "flex", alignItems: "center", padding: "6px 14px", gap: 10 }}
              >
                <span style={{ color: r.color, fontSize: 13, width: 18, textAlign: "center" }}>
                  {r.icon}
                </span>
                <span style={{ color: GRY, fontSize: 10, letterSpacing: 1.5, width: 64 }}>
                  {r.label}
                </span>
                <span style={{
                  flex: 1, height: 3, background: `${r.color}22`, borderRadius: 2, overflow: "hidden",
                }}>
                  {r.count != null && total > 0 && (
                    <span style={{
                      display: "block", height: "100%",
                      width: `${Math.round((r.count / total) * 100)}%`,
                      background: r.color, borderRadius: 2,
                      transition: "width 0.6s ease",
                    }} />
                  )}
                </span>
                <span style={{
                  color: r.count != null ? "#DCEBF5" : GRY,
                  fontSize: 13, fontWeight: "bold", width: 36, textAlign: "right",
                }}>
                  {r.count ?? "—"}
                </span>
                <span style={{ width: 28, textAlign: "right" }}>
                  <DeltaBadge delta={deltas[r.key] ?? null} />
                </span>
              </div>
            ))}
          </div>

          <div style={{
            borderTop: `1px solid ${CY}1A`,
            padding: "7px 14px",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ color: GRY, fontSize: 9, letterSpacing: 1 }}>
              {lastPoll
                ? `UPDATED ${lastPoll.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                : "AWAITING FIRST POLL"}
            </span>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 1 }}>
              TOTAL {total}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
