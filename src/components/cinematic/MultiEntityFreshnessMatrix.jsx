/**
 * MultiEntityFreshnessMatrix — F96 (MEFMAT).
 *
 * Polls all 6 /entities/ types and classifies each record by age into
 * NEW (≤1 d) / RECENT (2–7 d) / AGING (8–30 d) / STALE (>30 d).
 * Presents a compact 6-row cross-entity freshness table so the operator
 * can see data-health at a glance.
 *
 * Endpoints:  /entities/Task · /entities/RiskSignal · /entities/IntelProfile
 *             /entities/SwarmJob · /entities/Investment · /entities/Contact
 * Stat tiles: TOTAL | NEW | RECENT | AGING | STALE
 * Red pulse:  STALE tile when stale count > 0
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence freshness brief + TTS
 * 120-s auto-refresh
 *
 * Toggle:    ◈ MEFMAT at left:975100, bottom:8, zIndex:120
 * Mounted:   App.jsx
 * Wired:     JarvisBrain.jsx via isMefmatQuery / buildMefmatScript
 *
 * Voice: "mefmat" / "entity freshness" / "data freshness" /
 *        "stale entities" / "freshness matrix" / "data age" /
 *        "entity age" / "how fresh is the data"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const GREEN = "#00c878";
const AMBER = "#FFB347";
const RED   = "#FF3D5A";
const DIM   = "#1a2a38";

const BTN_LEFT   = 975100;
const REFRESH_MS = 120_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const ENTITY_TYPES = [
  { key: "Task",         label: "TASK",    path: "/entities/Task"         },
  { key: "RiskSignal",   label: "RISK",    path: "/entities/RiskSignal"   },
  { key: "IntelProfile", label: "INTEL",   path: "/entities/IntelProfile" },
  { key: "SwarmJob",     label: "SWARM",   path: "/entities/SwarmJob"     },
  { key: "Investment",   label: "INVEST",  path: "/entities/Investment"   },
  { key: "Contact",      label: "CONTACT", path: "/entities/Contact"      },
];

// ─── helpers ─────────────────────────────────────────────────────────────────

function authHdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function normaliseArray(raw) {
  if (Array.isArray(raw))                    return raw;
  if (raw && Array.isArray(raw.items))       return raw.items;
  if (raw && Array.isArray(raw.data))        return raw.data;
  if (raw && Array.isArray(raw.results))     return raw.results;
  if (raw && typeof raw === "object")        return Object.values(raw);
  return [];
}

function ageDays(item) {
  const raw =
    item.updated_at || item.created_at || item.timestamp ||
    item.date || item.start_date || null;
  if (!raw) return null;
  const ms = Date.now() - new Date(raw).getTime();
  if (isNaN(ms) || ms < 0) return null;
  return ms / 86_400_000;
}

function classifyAge(days) {
  if (days === null)  return "UNKNOWN";
  if (days <= 1)      return "NEW";
  if (days <= 7)      return "RECENT";
  if (days <= 30)     return "AGING";
  return "STALE";
}

function classifyItems(items) {
  const counts = { NEW: 0, RECENT: 0, AGING: 0, STALE: 0, UNKNOWN: 0, total: items.length };
  for (const item of items) {
    counts[classifyAge(ageDays(item))]++;
  }
  return counts;
}

// ─── mini freshness bar ───────────────────────────────────────────────────────

function FreshnessBar({ counts }) {
  const total = counts.total || 1;
  const segments = [
    { key: "NEW",    color: GREEN },
    { key: "RECENT", color: CY    },
    { key: "AGING",  color: AMBER },
    { key: "STALE",  color: RED   },
  ];
  return (
    <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", width: "100%" }}>
      {segments.map(({ key, color }) => {
        const w = Math.round((counts[key] / total) * 100);
        return w > 0 ? (
          <div key={key} style={{ width: `${w}%`, background: color }} title={`${key}: ${counts[key]}`} />
        ) : null;
      })}
      {counts.UNKNOWN > 0 && (
        <div style={{ width: `${Math.round((counts.UNKNOWN / total) * 100)}%`, background: "rgba(41,231,255,0.2)" }} />
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function MultiEntityFreshnessMatrix() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState(null);
  const [err,       setErr]       = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const base = apiBase();
      const h = authHdr();
      const results = await Promise.allSettled(
        ENTITY_TYPES.map(({ path }) =>
          fetch(`${base}${path}`, { headers: h }).then(r => r.ok ? r.json() : null)
        )
      );
      const newRows = ENTITY_TYPES.map(({ key, label }, i) => {
        const raw = results[i].status === "fulfilled" ? results[i].value : null;
        const items = normaliseArray(raw);
        return { key, label, counts: classifyItems(items) };
      });
      setRows(newRows);
      setErr(null);
    } catch (e) {
      setErr(String(e));
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:mefmat-toggle", onToggle);
    return () => window.removeEventListener("jarvis:mefmat-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (!rows) return;
    setAssessing(true);
    try {
      const base = apiBase();
      const summary = rows.map(r =>
        `${r.label}: ${r.counts.total} total, ${r.counts.STALE} stale`
      ).join("; ");
      const prompt =
        `JARVIS entity freshness matrix. ${summary}. ` +
        `Provide a 2-sentence data-health assessment and recommended action for the stalest entity type.`;
      const resp = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      if (!resp.ok) throw new Error(resp.status);
      const j = await resp.json();
      const txt = j.response || j.message || j.content || JSON.stringify(j);
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ text: txt.slice(0, 500) }),
      });
    } catch (_) {}
    setAssessing(false);
  }, [rows]);

  // aggregate tiles
  const agg = rows
    ? rows.reduce(
        (a, r) => {
          a.total  += r.counts.total;
          a.NEW    += r.counts.NEW;
          a.RECENT += r.counts.RECENT;
          a.AGING  += r.counts.AGING;
          a.STALE  += r.counts.STALE;
          return a;
        },
        { total: 0, NEW: 0, RECENT: 0, AGING: 0, STALE: 0 }
      )
    : null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 120,
          background: "rgba(41,231,255,0.08)", border: "1px solid rgba(41,231,255,0.3)",
          color: CY, fontSize: 10, padding: "3px 7px", cursor: "pointer",
          borderRadius: 4, fontFamily: "monospace", letterSpacing: 1,
        }}
      >
        ◈ MEFMAT
      </button>
    );
  }

  const tiles = [
    { label: "TOTAL",  val: agg?.total  ?? "…", color: CY    },
    { label: "NEW",    val: agg?.NEW    ?? "…", color: GREEN },
    { label: "RECENT", val: agg?.RECENT ?? "…", color: CY    },
    { label: "AGING",  val: agg?.AGING  ?? "…", color: AMBER },
    { label: "STALE",  val: agg?.STALE  ?? "…", color: RED,  pulse: (agg?.STALE ?? 0) > 0 },
  ];

  return (
    <div style={{
      position: "fixed", bottom: 36, right: 12, zIndex: 120,
      width: 360, background: "rgba(8,18,28,0.96)",
      border: "1px solid rgba(41,231,255,0.3)", borderRadius: 8,
      fontFamily: "monospace", color: CY, fontSize: 11,
      boxShadow: "0 0 24px rgba(41,231,255,0.12)",
    }}>
      {/* header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "8px 10px", borderBottom: "1px solid rgba(41,231,255,0.15)",
      }}>
        <span style={{ fontSize: 12, letterSpacing: 2 }}>◈ ENTITY FRESHNESS MATRIX</span>
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 14,
        }}>✕</button>
      </div>

      {err && (
        <div style={{ padding: 8, color: RED, fontSize: 10 }}>⚠ {err}</div>
      )}

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 4, padding: "8px 8px 4px" }}>
        {tiles.map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            flex: 1, background: DIM, borderRadius: 4, padding: "4px 0",
            textAlign: "center",
            boxShadow: pulse ? `0 0 8px ${RED}` : "none",
            animation: pulse ? "mefpulse 1s infinite alternate" : "none",
          }}>
            <div style={{ fontSize: 14, fontWeight: "bold", color }}>{val}</div>
            <div style={{ fontSize: 8, color: "rgba(41,231,255,0.6)", marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* assess button */}
      <div style={{
        display: "flex", justifyContent: "flex-end",
        padding: "2px 8px 6px",
        borderBottom: "1px solid rgba(41,231,255,0.1)",
      }}>
        <button onClick={assess} disabled={assessing || !rows} style={{
          background: "rgba(0,200,120,0.12)", border: "1px solid rgba(0,200,120,0.4)",
          color: GREEN, fontSize: 9, padding: "2px 8px", cursor: "pointer", borderRadius: 3,
        }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
      </div>

      {/* entity rows */}
      <div style={{ padding: "8px 8px 4px" }}>
        {!rows && (
          <div style={{ color: "rgba(41,231,255,0.4)", textAlign: "center", padding: 16 }}>Loading…</div>
        )}
        {rows && rows.map(({ key, label, counts }) => (
          <div key={key} style={{ marginBottom: 10 }}>
            <div style={{
              display: "flex", justifyContent: "space-between",
              fontSize: 9, color: "rgba(41,231,255,0.7)", letterSpacing: 1, marginBottom: 3,
            }}>
              <span>{label}</span>
              <span style={{ display: "flex", gap: 8 }}>
                <span style={{ color: GREEN }}>new:{counts.NEW}</span>
                <span style={{ color: CY    }}>rec:{counts.RECENT}</span>
                <span style={{ color: AMBER }}>aging:{counts.AGING}</span>
                <span style={{ color: RED   }}>stale:{counts.STALE}</span>
                <span style={{ color: "rgba(41,231,255,0.4)" }}>/{counts.total}</span>
              </span>
            </div>
            <FreshnessBar counts={counts} />
          </div>
        ))}
      </div>

      {/* legend */}
      <div style={{
        display: "flex", gap: 12, justifyContent: "center",
        fontSize: 8, padding: "4px 0 6px", color: "rgba(41,231,255,0.4)",
      }}>
        {[["NEW ≤1d", GREEN], ["RECENT 2-7d", CY], ["AGING 8-30d", AMBER], ["STALE >30d", RED]].map(([lbl, c]) => (
          <span key={lbl} style={{ color: c }}>{lbl}</span>
        ))}
      </div>

      <style>{`@keyframes mefpulse{from{opacity:1}to{opacity:0.4}}`}</style>

      <div style={{
        textAlign: "center", fontSize: 8,
        color: "rgba(41,231,255,0.3)", padding: "0 0 6px",
      }}>
        auto-refresh 120 s
      </div>
    </div>
  );
}

// ─── JarvisBrain intent helpers ───────────────────────────────────────────────

export function isMefmatQuery(q) {
  const s = q.toLowerCase();
  return (
    s.includes("mefmat") ||
    s.includes("entity freshness") ||
    s.includes("data freshness") ||
    s.includes("freshness matrix") ||
    s.includes("stale entities") ||
    s.includes("entity age") ||
    s.includes("data age") ||
    s.includes("how fresh is the data") ||
    s.includes("freshness report") ||
    s.includes("stale data")
  );
}

export async function buildMefmatScript() {
  try {
    const base = apiBase();
    const h = { Authorization: `Bearer ${API_KEY}` };
    const results = await Promise.allSettled(
      ENTITY_TYPES.map(({ path }) =>
        fetch(`${base}${path}`, { headers: h }).then(r => r.ok ? r.json() : null)
      )
    );
    let totalStale = 0;
    let stalestType = "";
    let maxStale = -1;
    const parts = ENTITY_TYPES.map(({ key, label }, i) => {
      const items = normaliseArray(results[i].status === "fulfilled" ? results[i].value : []);
      const counts = classifyItems(items);
      totalStale += counts.STALE;
      if (counts.STALE > maxStale) { maxStale = counts.STALE; stalestType = label; }
      return `${label}: ${counts.total} records (${counts.STALE} stale)`;
    });
    return (
      `JARVIS entity freshness matrix. ${parts.join("; ")}. ` +
      `Total stale records: ${totalStale}. ` +
      (totalStale > 0
        ? `Stalest entity type: ${stalestType} with ${maxStale} stale records. Recommend data refresh.`
        : `All entity data is current. No stale records detected.`)
    );
  } catch {
    return "JARVIS entity freshness matrix is loading data.";
  }
}
