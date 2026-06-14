/**
 * EntityActivityHeatmap — F83.
 *
 * Parallel-fetches all 6 entity types in a single round-trip and renders a
 * domain-wide activity density heatmap. Each type gets an "activity ratio"
 * (0-100) derived from type-specific active-state detection:
 *
 *   Task        → % IN_PROGRESS / TODO / PENDING
 *   RiskSignal  → % severity HIGH or CRITICAL
 *   IntelProfile→ % threat_level HIGH or CRITICAL
 *   SwarmJob    → % status RUNNING or QUEUED
 *   Investment  → % items with non-zero value/amount
 *   Contact     → % contacts with ≥1 tag
 *
 * Stat tiles: total entities · most active type · least active · avg score.
 * Filter tabs: ALL / HIGH (≥70) / MID (30-69) / LOW (<30).
 * Click ▶ ASSESS → /v1/jarvis/agent/chat AI 2-sentence domain-activity
 *   assessment + TTS via jarvis:speak-dossier.
 * 60 s auto-refresh.
 *
 * Intent: "entity activity" / "activity heatmap" / "domain activity" /
 *         "entity density" / "entity load" / "eactv"
 *   → jarvis:eactv-toggle + TTS brief via buildEntityActivityScript()
 *
 * Toggle: ◈ EACTV at left:7356, zIndex 65. Badge shows total entity count.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const GREEN  = "#00c878";
const AMBER  = "#F5A623";
const RED    = "#FF3B6B";
const PURPLE = "#A855F7";
const GOLD   = "#E8A800";
const BLUE   = "#0096D4";

const BTN_LEFT   = 7356;
const REFRESH_MS = 60_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── entity type descriptors ─────────────────────────────────────────────────

const ENTITY_TYPES = [
  {
    type: "Task",
    path: "/entities/Task",
    color: CY,
    icon: "⊕",
    activeLabel: "active tasks",
    isActive: (e) => {
      const s = String(e.status || e.state || e.task_status || "").toUpperCase();
      return ["IN_PROGRESS", "TODO", "PENDING", "OPEN", "ACTIVE"].includes(s);
    },
  },
  {
    type: "RiskSignal",
    path: "/entities/RiskSignal",
    color: RED,
    icon: "⚠",
    activeLabel: "high/critical risks",
    isActive: (e) => {
      const sv = e.severity || e.severity_level || e.level || e.risk_score || 0;
      if (typeof sv === "number") return sv >= 50;
      return ["HIGH", "CRITICAL", "SEVERE"].includes(String(sv).toUpperCase());
    },
  },
  {
    type: "IntelProfile",
    path: "/entities/IntelProfile",
    color: PURPLE,
    icon: "◉",
    activeLabel: "high-threat profiles",
    isActive: (e) => {
      const tl = String(
        e.threat_level || e.threatLevel || e.classification || e.clearance || ""
      ).toUpperCase();
      return ["HIGH", "CRITICAL", "SECRET", "TOP SECRET", "TS", "EXTREME"].includes(tl);
    },
  },
  {
    type: "SwarmJob",
    path: "/entities/SwarmJob",
    color: GREEN,
    icon: "⬡",
    activeLabel: "running/queued jobs",
    isActive: (e) => {
      const s = String(e.status || e.state || e.job_status || "").toUpperCase();
      return ["RUNNING", "QUEUED", "PROCESSING", "ACTIVE", "IN_PROGRESS"].includes(s);
    },
  },
  {
    type: "Investment",
    path: "/entities/Investment",
    color: GOLD,
    icon: "◆",
    activeLabel: "funded investments",
    isActive: (e) => {
      const v = e.value || e.amount || e.current_value || e.balance || e.invested || 0;
      return Number(v) > 0;
    },
  },
  {
    type: "Contact",
    path: "/entities/Contact",
    color: BLUE,
    icon: "◈",
    activeLabel: "tagged contacts",
    isActive: (e) => Array.isArray(e.tags) && e.tags.length > 0,
  },
];

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

function computeScore(items, isActiveFn) {
  if (!items.length) return 0;
  const active = items.filter(isActiveFn).length;
  return Math.round((active / items.length) * 100);
}

// ─── exported intent helpers (consumed by JarvisBrain) ───────────────────────

const EACTV_RE =
  /entity.{0,15}activit|activit.{0,15}heatmap|domain.{0,15}activit|entity.{0,15}densit|entity.{0,15}load|eactv\b/i;

export function isEntityActivityQuery(q) {
  return EACTV_RE.test(q || "");
}

export async function buildEntityActivityScript() {
  try {
    const results = await Promise.all(
      ENTITY_TYPES.map((et) =>
        fetch(`${apiBase()}${et.path}`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        })
          .then((r) => r.json())
          .then((raw) => {
            const items = normaliseArray(raw);
            const score = computeScore(items, et.isActive);
            const active = items.filter(et.isActive).length;
            return { type: et.type, total: items.length, active, score };
          })
          .catch(() => ({ type: et.type, total: 0, active: 0, score: 0 }))
      )
    );
    const total = results.reduce((s, r) => s + r.total, 0);
    const topType = [...results].sort((a, b) => b.score - a.score)[0];
    const avgScore = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length);
    window.dispatchEvent(new CustomEvent("jarvis:eactv-toggle"));
    return `Entity activity heatmap online, sir. ${total} total entities across ${results.length} domain types. Most active domain is ${topType.type} at ${topType.score}% activity ratio. Overall system entity engagement stands at ${avgScore}% on average — select any domain row to request a full AI assessment.`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:eactv-toggle"));
    return "Entity activity heatmap is online, sir. Awaiting entity data to render the cross-domain activity view.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function EntityActivityHeatmap() {
  const [visible, setVisible]   = useState(false);
  const [rows, setRows]         = useState([]); // [{ type, total, active, score, color, icon, activeLabel }]
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState("ALL");
  const [assessing, setAssessing] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    const results = await Promise.all(
      ENTITY_TYPES.map((et) =>
        fetch(`${apiBase()}${et.path}`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        })
          .then((r) => r.json())
          .then((raw) => {
            const items = normaliseArray(raw);
            const score = computeScore(items, et.isActive);
            const active = items.filter(et.isActive).length;
            return { ...et, total: items.length, active, score };
          })
          .catch(() => ({ ...et, total: 0, active: 0, score: 0 }))
      )
    );
    setRows(results);
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:eactv-toggle", onToggle);
    return () => window.removeEventListener("jarvis:eactv-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assess(row) {
    setAssessing(row.type);
    const prompt = `As JARVIS, provide a 2-sentence domain-activity assessment for the ${row.type} entity domain. There are ${row.total} total ${row.type} entities, ${row.active} are currently active (activity ratio: ${row.score}%). Note what this ratio implies operationally and whether any action is warranted.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        `${row.type} domain assessment unavailable at this time, sir.`;
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", {
          detail: { text: `Assessment of the ${row.type} domain is temporarily unavailable, sir.` },
        })
      );
    }
    setAssessing(null);
  }

  const totalEntities = rows.reduce((s, r) => s + r.total, 0);
  const avgScore = rows.length
    ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length)
    : 0;
  const topRow = rows.length
    ? [...rows].sort((a, b) => b.score - a.score)[0]
    : null;

  const filtered =
    tab === "HIGH"
      ? rows.filter((r) => r.score >= 70)
      : tab === "MID"
      ? rows.filter((r) => r.score >= 30 && r.score < 70)
      : tab === "LOW"
      ? rows.filter((r) => r.score < 30)
      : rows;

  const scoreColor = (s) => (s >= 70 ? RED : s >= 30 ? AMBER : GREEN);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Entity Activity Heatmap (F83)"
        style={{
          position: "fixed", bottom: 6, left: BTN_LEFT, zIndex: 65,
          background: visible ? `${CY}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? CY : CY}44`,
          color: visible ? CY : `${CY}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ EACTV
        {totalEntities > 0 && (
          <span style={{
            marginLeft: 4, background: CY, color: "#04060A",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{totalEntities}</span>
        )}
      </button>

      {visible && (
        <div style={{
          position: "fixed", bottom: 32, left: BTN_LEFT - 300, zIndex: 65,
          width: 580, maxHeight: "72vh", overflowY: "auto",
          background: "rgba(6,11,18,0.93)",
          border: `1px solid ${CY}44`,
          borderRadius: 10, padding: "14px 16px",
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${CY}18`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>◈ ENTITY ACTIVITY HEATMAP</span>
            <button
              onClick={() => { setLoading(true); fetchData().finally(() => setLoading(false)); }}
              style={{
                marginLeft: "auto", background: "transparent",
                border: `1px solid ${CY}33`, borderRadius: 3,
                color: `${CY}88`, padding: "2px 6px", fontSize: 7,
                cursor: "pointer", letterSpacing: 1,
              }}
            >↻ REFRESH</button>
            <button
              onClick={() => setVisible(false)}
              style={{ background: "transparent", border: "none", color: "#445566", cursor: "pointer", fontSize: 14, lineHeight: 1 }}
            >✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              ["TOTAL ENTITIES", loading ? "…" : totalEntities, CY],
              ["AVG ACTIVITY",   loading ? "…" : `${avgScore}%`,  AMBER],
              ["MOST ACTIVE",    loading ? "…" : (topRow?.type || "—"), RED],
              ["DOMAINS",        ENTITY_TYPES.length, PURPLE],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 5, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 15, fontWeight: "bold" }}>{val}</div>
                <div style={{ color: "#445566", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
            {[["ALL", CY], ["HIGH ≥70", RED], ["MID 30-69", AMBER], ["LOW <30", GREEN]].map(([t, col]) => {
              const key = t.split(" ")[0];
              return (
                <button
                  key={t}
                  onClick={() => setTab(key)}
                  style={{
                    background: tab === key ? `${col}22` : "transparent",
                    border: `1px solid ${tab === key ? col : "#1e3040"}`,
                    color: tab === key ? col : "#445566",
                    borderRadius: 4, padding: "3px 10px",
                    fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                    letterSpacing: 1, cursor: "pointer",
                  }}
                >{t}</button>
              );
            })}
          </div>

          {/* Heatmap rows */}
          {loading && rows.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "24px 0" }}>
              fetching entity domains…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "24px 0" }}>
              No domains match this activity filter.
            </div>
          ) : (
            filtered.map((row) => {
              const barCol = row.color;
              const ratioBgCol = scoreColor(row.score);
              return (
                <div
                  key={row.type}
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: `1px solid ${row.color}22`,
                    borderLeft: `3px solid ${row.color}`,
                    borderRadius: 6, padding: "10px 12px", marginBottom: 8,
                  }}
                >
                  {/* Row header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ color: row.color, fontSize: 13, flexShrink: 0 }}>{row.icon}</span>
                    <span style={{ color: "#DCEBF5", fontSize: 11, fontWeight: "bold", flex: 1 }}>{row.type}</span>
                    <span style={{
                      fontSize: 7, color: ratioBgCol, border: `1px solid ${ratioBgCol}55`,
                      borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                    }}>
                      {row.score}%
                    </span>
                    <button
                      onClick={() => assess(row)}
                      disabled={assessing === row.type}
                      style={{
                        background: assessing === row.type ? "#1a2530" : `${row.color}18`,
                        color: assessing === row.type ? "#445566" : row.color,
                        border: `1px solid ${row.color}44`,
                        borderRadius: 3, padding: "2px 8px",
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                        letterSpacing: 1, cursor: assessing === row.type ? "default" : "pointer",
                      }}
                    >{assessing === row.type ? "…" : "▶ ASSESS"}</button>
                  </div>

                  {/* Activity bar */}
                  <div style={{
                    height: 6, background: "rgba(255,255,255,0.06)",
                    borderRadius: 3, overflow: "hidden", marginBottom: 6,
                  }}>
                    <div style={{
                      height: "100%", width: `${row.score}%`,
                      background: `linear-gradient(90deg, ${barCol}88, ${barCol})`,
                      borderRadius: 3,
                      transition: "width 0.6s ease",
                    }} />
                  </div>

                  {/* Counts */}
                  <div style={{ display: "flex", gap: 16, fontSize: 8, color: "#556677" }}>
                    <span>
                      <span style={{ color: row.color }}>{row.active}</span> {row.activeLabel}
                    </span>
                    <span>
                      <span style={{ color: "#7A8F9E" }}>{row.total}</span> total
                    </span>
                    {row.total > 0 && (
                      <span>
                        <span style={{ color: "#445566" }}>{row.total - row.active}</span> inactive
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}

          <div style={{ marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right" }}>
            /entities/{"{Task,RiskSignal,IntelProfile,SwarmJob,Investment,Contact}"} · 60 s auto-refresh · click ▶ ASSESS for AI domain analysis
          </div>
        </div>
      )}
    </>
  );
}
