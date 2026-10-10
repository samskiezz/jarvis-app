/**
 * EntityPulseDashboard — F557 (EPULSE)
 * "JARVIS, entity pulse / pulse dashboard / epulse / live counts / all entities"
 * Polls all six entity endpoints in parallel every 30 s.
 * Shows animated count tiles + delta (change vs prior poll) from localStorage.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence operational-posture brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4444";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 30_000;
const BTN_LEFT = 53_920;
const Z_INDEX  = 121;
const LS_KEY   = "jarvis_epulse_prev";

const EPULSE_RE =
  /\bepulse\b|\bentity.?pulse\b|\bpulse.?dashboard\b|\blive.?counts?\b|\ball.?entit\w*\b|\bentit\w*.?counts?\b|\bentit\w*.?monitor\b|\bentit\w*.?totals?\b|\bcount.?all\b/i;

export function isEpulseQuery(text) {
  return EPULSE_RE.test(text || "");
}

const ENTITY_DEFS = [
  { key: "Task",         label: "TASKS",    endpoint: "/entities/Task",         color: CY  },
  { key: "Contact",      label: "CONTACTS", endpoint: "/entities/Contact",       color: GRN },
  { key: "RiskSignal",   label: "RISKS",    endpoint: "/entities/RiskSignal",    color: RED },
  { key: "IntelProfile", label: "INTEL",    endpoint: "/entities/IntelProfile",  color: AMB },
  { key: "SwarmJob",     label: "SWARM",    endpoint: "/entities/SwarmJob",      color: "#AA88FF" },
  { key: "Investment",   label: "INVEST",   endpoint: "/entities/Investment",    color: "#FFD700" },
];

function extractCount(data) {
  if (!data) return 0;
  if (typeof data.total === "number") return data.total;
  if (typeof data.count === "number") return data.count;
  if (Array.isArray(data)) return data.length;
  const arr =
    data.items || data.results || data.data ||
    data.tasks || data.contacts || data.risks ||
    data.profiles || data.jobs || data.investments ||
    data.entities || [];
  if (Array.isArray(arr)) return arr.length;
  return 0;
}

async function fetchCounts(base) {
  const results = {};
  await Promise.all(
    ENTITY_DEFS.map(async ({ key, endpoint }) => {
      try {
        const r = await fetch(`${base}${endpoint}`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        });
        if (!r.ok) { results[key] = 0; return; }
        const d = await r.json();
        results[key] = extractCount(d);
      } catch {
        results[key] = 0;
      }
    })
  );
  return results;
}

function loadPrev() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function savePrev(counts) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(counts)); } catch {}
}

export async function buildEpulseScript() {
  const base = apiBase();
  const counts = await fetchCounts(base);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const lines = ENTITY_DEFS.map(({ key, label }) => `${label}: ${counts[key] ?? 0}`).join("; ");
  try {
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `Entity pulse summary — total ${total} entities across six types: ${lines}. Provide a 2-sentence operational posture brief.`,
      }),
    });
    if (r.ok) {
      const d = await r.json();
      return d.response || d.message || d.answer ||
        `Entity pulse: ${total} total entities tracked. ${lines}.`;
    }
  } catch {}
  return `Entity pulse: ${total} total entities tracked. ${lines}.`;
}

export default function EntityPulseDashboard() {
  const [open, setOpen]   = useState(false);
  const [counts, setCounts] = useState(null);
  const [prev, setPrev]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState("");
  const timerRef = useRef(null);

  const refresh = useCallback(async () => {
    const base = apiBase();
    const c = await fetchCounts(base);
    const oldPrev = loadPrev();
    setPrev(oldPrev);
    setCounts(c);
    savePrev(c);
  }, []);

  useEffect(() => {
    refresh();
    timerRef.current = setInterval(refresh, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [refresh]);

  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("jarvis:epulse-toggle", handler);
    return () => window.removeEventListener("jarvis:epulse-toggle", handler);
  }, []);

  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : null;

  async function assess() {
    setAssessing(true); setBrief("");
    const text = await buildEpulseScript();
    setBrief(text);
    setAssessing(false);
    try {
      const r = await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (r.ok) {
        const url = URL.createObjectURL(await r.blob());
        new Audio(url).play().catch(() => {});
      }
    } catch {}
  }

  function delta(key) {
    if (!prev || prev[key] == null || !counts) return null;
    return counts[key] - prev[key];
  }

  return (
    <>
      {/* floating button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Entity Pulse Dashboard (EPULSE)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: open ? CY : "rgba(5,8,13,0.72)",
          color: open ? "#04060A" : CY,
          border: `1px solid ${CY}55`, borderRadius: 6,
          padding: "3px 8px", fontSize: 10, fontFamily: "JetBrains Mono,monospace",
          cursor: "pointer", letterSpacing: 1,
          boxShadow: `0 0 14px ${CY}${open ? "" : "44"}`,
        }}
      >
        ◈ EPULSE
        {total !== null && (
          <span style={{
            marginLeft: 5, background: CY, color: "#04060A",
            borderRadius: 4, padding: "1px 5px", fontSize: 9, fontWeight: 700,
          }}>
            {total}
          </span>
        )}
      </button>

      {/* panel */}
      {open && (
        <div style={{
          position: "fixed", left: Math.min(BTN_LEFT, window.innerWidth - 460), bottom: 40,
          zIndex: Z_INDEX + 1, width: 440,
          background: "rgba(6,10,18,0.94)", border: `1px solid ${CY}44`,
          borderRadius: 12, padding: "14px 16px",
          backdropFilter: "blur(10px)", boxShadow: `0 0 40px ${CY}22`,
          fontFamily: "JetBrains Mono,monospace", color: "#DCEBF5",
        }}>
          {/* header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ ENTITY PULSE</span>
            <span style={{ marginLeft: "auto", fontSize: 10, color: DIM }}>30-s poll</span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14,
            }}>✕</button>
          </div>

          {/* tiles */}
          {counts ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
              {ENTITY_DEFS.map(({ key, label, color }) => {
                const d = delta(key);
                return (
                  <div key={key} style={{
                    background: "rgba(10,16,26,0.7)", border: `1px solid ${color}33`,
                    borderRadius: 8, padding: "10px 12px", textAlign: "center",
                    boxShadow: `0 0 12px ${color}18`,
                  }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>
                      {counts[key] ?? 0}
                    </div>
                    <div style={{ fontSize: 9, color: DIM, letterSpacing: 2, marginTop: 3 }}>{label}</div>
                    {d !== null && d !== 0 && (
                      <div style={{
                        fontSize: 9, marginTop: 4,
                        color: d > 0 ? GRN : RED,
                        fontWeight: 700,
                      }}>
                        {d > 0 ? `+${d}` : d}
                      </div>
                    )}
                    {d === 0 && <div style={{ fontSize: 8, color: DIM, marginTop: 4 }}>—</div>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: "center", color: DIM, fontSize: 11, padding: "20px 0" }}>
              loading entity counts…
            </div>
          )}

          {/* total */}
          {total !== null && (
            <div style={{
              textAlign: "center", fontSize: 11, color: CY, marginBottom: 10,
              letterSpacing: 2, borderTop: `1px solid ${CY}22`, paddingTop: 8,
            }}>
              TOTAL ENTITIES: <b>{total}</b>
            </div>
          )}

          {/* assess */}
          <button onClick={assess} disabled={assessing} style={{
            width: "100%", padding: "7px 0", background: "transparent",
            border: `1px solid ${CY}55`, borderRadius: 6, color: CY,
            cursor: assessing ? "wait" : "pointer", fontSize: 11, letterSpacing: 1,
          }}>
            {assessing ? "consulting JARVIS…" : "▶ ASSESS"}
          </button>
          {brief && (
            <div style={{ marginTop: 10, fontSize: 11, color: "#BBCCDD", lineHeight: 1.55 }}>
              {brief}
            </div>
          )}
        </div>
      )}
    </>
  );
}
