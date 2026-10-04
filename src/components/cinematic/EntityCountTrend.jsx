/**
 * EntityCountTrend — F31 (overnight 2026-09-13)
 * Polls all 6 /entities/ types every 5 minutes; stores a rolling count history
 * in localStorage (max 48 readings ≈ 4 hours at 5-min intervals); renders 6 mini
 * SVG sparklines with trend arrows (▲ / — / ▼) per entity type.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence growth-trend brief + TTS.
 * Voice triggers: "entity trend" / "count trend" / "entity growth" / "etrend".
 * Toggle: jarvis:etrend-toggle event | ◈ ETREND button in bottom strip.
 * Additive only — mounted via App.jsx.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const LS_KEY = "jarvis_entity_count_history";
const MAX_READINGS = 48;
const POLL_MS = 5 * 60 * 1000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const ENTITY_TYPES = [
  { name: "Task",         label: "Tasks",         color: "#7cff7c" },
  { name: "RiskSignal",   label: "Risk",           color: "#FF4D6D" },
  { name: "IntelProfile", label: "Intel",          color: CY },
  { name: "SwarmJob",     label: "Swarm",          color: "#FFD700" },
  { name: "Investment",   label: "Invest",         color: "#b18cff" },
  { name: "Contact",      label: "Contacts",       color: "#00E5A0" },
];

const ETREND_RE = /\b(entity.?trend|count.?trend|entity.?growth|entity.?history|etrend|type.?growth)\b/i;

// ── localStorage helpers ──────────────────────────────────────────────────────

function loadHistory() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(history) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(history.slice(-MAX_READINGS)));
  } catch {}
}

// ── fetch helpers ─────────────────────────────────────────────────────────────

async function fetchCount(entityName) {
  try {
    const r = await fetch(`${apiBase()}/entities/${entityName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ limit: 1 }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    if (typeof d?.total === "number") return d.total;
    if (typeof d?.count === "number") return d.count;
    const arr = Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : (Array.isArray(d?.items) ? d.items : (Array.isArray(d?.results) ? d.results : null)));
    return arr ? arr.length : null;
  } catch {
    return null;
  }
}

async function fetchAllCounts() {
  const counts = await Promise.all(ENTITY_TYPES.map(({ name }) => fetchCount(name)));
  const entry = { ts: Date.now(), counts: {} };
  ENTITY_TYPES.forEach(({ name }, i) => { entry.counts[name] = counts[i]; });
  return entry;
}

// ── SVG sparkline ─────────────────────────────────────────────────────────────

function Sparkline({ values, color, width = 60, height = 22 }) {
  const valid = values.filter((v) => v != null);
  if (valid.length < 2) {
    return <svg width={width} height={height}><line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke={color} strokeWidth={1} strokeOpacity={0.35} /></svg>;
  }
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = Math.max(max - min, 1);
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((((v ?? min) - min) / range) * (height - 4) + 2);
    return `${x},${y}`;
  });
  return (
    <svg width={width} height={height}>
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

// ── trend arrow ───────────────────────────────────────────────────────────────

function trendArrow(values) {
  const valid = values.filter((v) => v != null);
  if (valid.length < 2) return { arrow: "—", color: "#6E8AA0" };
  const last = valid[valid.length - 1];
  const prev = valid[Math.max(0, valid.length - 4)]; // compare to ~15 min ago
  if (last > prev * 1.02) return { arrow: "▲", color: "#7cff7c" };
  if (last < prev * 0.98) return { arrow: "▼", color: "#FF4D6D" };
  return { arrow: "—", color: "#6E8AA0" };
}

// ── exported helpers for JarvisBrain ─────────────────────────────────────────

export function isEntityTrendQuery(text) {
  return ETREND_RE.test(text || "");
}

export async function buildEntityTrendScript() {
  const history = loadHistory();
  if (history.length < 2) {
    return "Entity count trend data is still being collected, sir. Check back in a few minutes.";
  }
  const latest = history[history.length - 1];
  const oldest = history[0];
  const lines = ENTITY_TYPES.map(({ name, label }) => {
    const now = latest.counts[name];
    const then = oldest.counts[name];
    if (now == null) return `${label}: unavailable`;
    if (then == null) return `${label}: ${now}`;
    const delta = now - then;
    const sign = delta > 0 ? "+" : "";
    return `${label}: ${now} (${sign}${delta} over ${history.length} readings)`;
  });
  return (
    `Entity count trend over ${history.length} readings: ` +
    lines.join("; ") +
    ". Growth indicates live data accumulation across the JARVIS data plane, sir."
  );
}

// ── component ─────────────────────────────────────────────────────────────────

export default function EntityCountTrend() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [history, setHistory] = useState(() => loadHistory());
  const [aiText, setAiText] = useState("");
  const pollRef = useRef(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const entry = await fetchAllCounts();
      setHistory((prev) => {
        const updated = [...prev, entry].slice(-MAX_READINGS);
        saveHistory(updated);
        return updated;
      });
    } catch {}
    setLoading(false);
  }, []);

  // Initial fetch + polling
  useEffect(() => {
    refresh();
    pollRef.current = setInterval(refresh, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [refresh]);

  // Toggle event
  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:etrend-toggle", toggle);
    return () => window.removeEventListener("jarvis:etrend-toggle", toggle);
  }, []);

  // Voice trigger
  useEffect(() => {
    const onAsk = async (e) => {
      if (window.location.pathname.startsWith("/apex")) return;
      const q = e?.detail?.text || e?.detail?.query || "";
      if (!isEntityTrendQuery(q)) return;
      setOpen(true);
      const script = await buildEntityTrendScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  async function assess() {
    if (assessing) return;
    setAssessing(true);
    setAiText("");
    try {
      const script = await buildEntityTrendScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "Analysis complete, sir.";
      setAiText(answer);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch {
      setAiText("Unable to reach reasoning core, sir.");
    }
    setAssessing(false);
  }

  // Build per-entity sparkline data
  const sparkData = ENTITY_TYPES.map(({ name }) => history.map((h) => h.counts[name] ?? null));
  const latest = history.length > 0 ? history[history.length - 1] : null;

  return (
    <>
      {/* Bottom-strip toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Entity Count Trend"
        style={{
          position: "fixed", bottom: 8, left: 55200, zIndex: 110,
          background: open ? CY : "rgba(5,8,13,0.82)",
          color: open ? "#04060A" : CY,
          border: `1px solid ${CY}55`, borderRadius: 6,
          padding: "3px 10px", fontSize: 11, fontFamily: "'JetBrains Mono',monospace",
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: open ? `0 0 14px ${CY}99` : "none",
        }}
      >
        ◈ ETREND
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 46, right: 80, zIndex: 200,
          width: "min(480px,92vw)",
          background: "rgba(5,10,18,0.92)", border: `1px solid ${CY}44`,
          borderRadius: 12, padding: "14px 16px",
          backdropFilter: "blur(12px)", boxShadow: `0 0 60px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ color: CY, letterSpacing: 3, fontSize: 11, fontWeight: 700 }}>◈ ENTITY COUNT TREND</span>
            <span style={{ marginLeft: "auto", fontSize: 10, color: "#6E8AA0" }}>
              {history.length} readings
            </span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* Sparklines grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px", marginBottom: 12 }}>
            {ENTITY_TYPES.map(({ name, label, color }, idx) => {
              const vals = sparkData[idx];
              const cur = latest?.counts[name];
              const { arrow, color: ac } = trendArrow(vals);
              return (
                <div key={name} style={{
                  background: "rgba(255,255,255,0.03)", borderRadius: 8,
                  padding: "8px 10px", border: `1px solid ${color}22`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ color, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>{label}</span>
                    <span style={{ marginLeft: "auto", color: "#6E8AA0", fontSize: 11 }}>
                      {cur != null ? cur.toLocaleString() : "—"}
                    </span>
                    <span style={{ color: ac, fontSize: 13, fontWeight: 700 }}>{arrow}</span>
                  </div>
                  <Sparkline values={vals} color={color} width={196} height={28} />
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={refresh} disabled={loading} style={{
              background: "none", border: `1px solid ${CY}44`, color: loading ? "#6E8AA0" : CY,
              borderRadius: 5, padding: "3px 10px", fontSize: 11, cursor: loading ? "default" : "pointer",
              fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1,
            }}>
              {loading ? "…" : "↻ REFRESH"}
            </button>
            <button onClick={assess} disabled={assessing} style={{
              background: assessing ? `${CY}22` : "none",
              border: `1px solid ${CY}44`, color: assessing ? "#6E8AA0" : CY,
              borderRadius: 5, padding: "3px 10px", fontSize: 11, cursor: assessing ? "default" : "pointer",
              fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1,
            }}>
              {assessing ? "…assessing" : "▶ ASSESS"}
            </button>
            <span style={{ fontSize: 10, color: "#6E8AA0", marginLeft: "auto" }}>
              5-min poll · {MAX_READINGS} max readings
            </span>
          </div>

          {aiText && (
            <div style={{
              marginTop: 10, padding: "8px 10px", background: `${CY}0a`,
              border: `1px solid ${CY}33`, borderRadius: 7, fontSize: 12, lineHeight: 1.5, color: "#DCEBF5",
            }}>
              {aiText}
            </div>
          )}
        </div>
      )}
    </>
  );
}
