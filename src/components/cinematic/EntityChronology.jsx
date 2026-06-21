/**
 * EntityChronology — F54
 * Unified chronological feed of ALL entity types sorted by creation/update timestamp.
 * Merges /entities/Task + /entities/RiskSignal + /entities/IntelProfile +
 *         /entities/SwarmJob + /entities/Investment + /entities/Contact.
 * Filter tabs: ALL / TASK / RISK / INTEL / SWARM / INVEST / CONTACT.
 * "JARVIS, entity chronology / all entities timeline / what's new" opens panel + speaks brief.
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const GRN  = "#00E5A0";
const OR   = "#FF8C00";
const RED  = "#FF3B3B";
const PRP  = "#C070FF";
const BLU  = "#4A9EFF";
const GLD  = "#FFD700";

const POLL_MS = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CHRON_RE = /\b(entity.?chronolog|all.?entities|entities.?timeline|what.?(?:is|are).?new|recent.?entities|entity.?feed|echron)\b/i;

export function isEntityChronologyQuery(text) {
  return CHRON_RE.test(text || "");
}

// ── helpers ──────────────────────────────────────────────────────────────────

function extractArr(d, keys) {
  if (Array.isArray(d)) return d;
  for (const k of keys) if (Array.isArray(d?.[k])) return d[k];
  return [];
}

function coerceTs(v) {
  if (!v) return 0;
  const n = typeof v === "number" ? v : Date.parse(v);
  return Number.isNaN(n) ? 0 : n;
}

function fmtAge(ts) {
  if (!ts) return "—";
  const diff = Date.now() - coerceTs(ts);
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// ── per-entity fetchers ───────────────────────────────────────────────────────

async function fetchTasks() {
  try {
    const r = await fetch(`${apiBase()}/entities/Task`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!r.ok) return [];
    const d = await r.json();
    return extractArr(d, ["data", "tasks", "items", "results"]).map((t) => ({
      id: `task-${t.id ?? Math.random()}`,
      kind: "TASK",
      title: t.name || t.title || t.task_name || "Task",
      detail: t.status || t.description || "",
      ts: t.created_at || t.updated_at || t.due_date || null,
    }));
  } catch (_) { return []; }
}

async function fetchRisks() {
  try {
    const r = await fetch(`${apiBase()}/entities/RiskSignal`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!r.ok) return [];
    const d = await r.json();
    return extractArr(d, ["data", "items", "results"]).map((s) => ({
      id: `risk-${s.id ?? Math.random()}`,
      kind: "RISK",
      title: s.name || s.title || s.signal_name || "Risk Signal",
      detail: s.severity || s.level || s.description || "",
      ts: s.created_at || s.detected_at || s.timestamp || null,
    }));
  } catch (_) { return []; }
}

async function fetchIntel() {
  try {
    const r = await fetch(`${apiBase()}/entities/IntelProfile`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!r.ok) return [];
    const d = await r.json();
    return extractArr(d, ["data", "profiles", "items", "results"]).map((p) => ({
      id: `intel-${p.id ?? Math.random()}`,
      kind: "INTEL",
      title: p.name || p.alias || p.entity_name || "Profile",
      detail: p.type || p.threat_level || p.description || "",
      ts: p.created_at || p.last_seen || p.updated_at || null,
    }));
  } catch (_) { return []; }
}

async function fetchSwarm() {
  try {
    const r = await fetch(`${apiBase()}/entities/SwarmJob`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!r.ok) return [];
    const d = await r.json();
    return extractArr(d, ["data", "jobs", "items", "results"]).map((j) => ({
      id: `swarm-${j.id ?? Math.random()}`,
      kind: "SWARM",
      title: j.name || j.job_name || j.task || "Swarm Job",
      detail: j.status || j.type || "",
      ts: j.created_at || j.started_at || j.updated_at || null,
    }));
  } catch (_) { return []; }
}

async function fetchInvestments() {
  try {
    const r = await fetch(`${apiBase()}/entities/Investment`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!r.ok) return [];
    const d = await r.json();
    return extractArr(d, ["data", "investments", "items", "results"]).map((i) => ({
      id: `invest-${i.id ?? Math.random()}`,
      kind: "INVEST",
      title: i.name || i.asset || i.ticker || i.title || "Investment",
      detail: i.type || i.status || "",
      ts: i.created_at || i.purchase_date || i.updated_at || null,
    }));
  } catch (_) { return []; }
}

async function fetchContacts() {
  try {
    const r = await fetch(`${apiBase()}/entities/Contact`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!r.ok) return [];
    const d = await r.json();
    return extractArr(d, ["data", "contacts", "people", "items", "results"]).map((c) => ({
      id: `contact-${c.id ?? Math.random()}`,
      kind: "CONTACT",
      title: c.name || c.full_name || c.email || "Contact",
      detail: c.role || c.department || c.organisation || "",
      ts: c.created_at || c.added_at || c.updated_at || null,
    }));
  } catch (_) { return []; }
}

async function fetchAll() {
  const [tasks, risks, intel, swarm, investments, contacts] = await Promise.all([
    fetchTasks(), fetchRisks(), fetchIntel(), fetchSwarm(), fetchInvestments(), fetchContacts(),
  ]);
  return [...tasks, ...risks, ...intel, ...swarm, ...investments, ...contacts].sort(
    (a, b) => coerceTs(b.ts) - coerceTs(a.ts)
  );
}

// ── TTS brief ─────────────────────────────────────────────────────────────────

export async function buildEntityChronologyScript() {
  try {
    const items = await fetchAll();
    if (!items.length)
      return "Entity chronology is empty, sir. No timestamped entities found across any type.";
    const total = items.length;
    const counts = {};
    for (const it of items) counts[it.kind] = (counts[it.kind] || 0) + 1;
    const summary = Object.entries(counts)
      .map(([k, v]) => `${v} ${k.toLowerCase()}${v !== 1 ? "s" : ""}`)
      .join(", ");
    const latest = items.slice(0, 2).map((i) => i.title).join(", ");
    return (
      `Entity chronology shows ${total} total entities across all types: ${summary}. ` +
      `Most recent: ${latest}. Opening the chronological feed now, sir.`
    );
  } catch (_) {
    return "Entity chronology is available. Opening the panel now, sir.";
  }
}

// ── kind config ───────────────────────────────────────────────────────────────

const KIND_META = {
  TASK:    { color: GRN, icon: "✓" },
  RISK:    { color: RED, icon: "⚠" },
  INTEL:   { color: OR,  icon: "◈" },
  SWARM:   { color: PRP, icon: "◎" },
  INVEST:  { color: GLD, icon: "◆" },
  CONTACT: { color: BLU, icon: "◉" },
};

const TABS = ["ALL", "TASK", "RISK", "INTEL", "SWARM", "INVEST", "CONTACT"];

// ── component ─────────────────────────────────────────────────────────────────

export default function EntityChronology() {
  const [open, setOpen]     = useState(false);
  const [items, setItems]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab]       = useState("ALL");
  const [query, setQuery]   = useState("");
  const [error, setError]   = useState(null);
  const timerRef            = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await fetchAll();
      setItems(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:entity-chronology-toggle", onToggle);
    return () => window.removeEventListener("jarvis:entity-chronology-toggle", onToggle);
  }, []);

  const visible = items.filter((it) => {
    if (tab !== "ALL" && it.kind !== tab) return false;
    if (query) {
      const q = query.toLowerCase();
      return (it.title + it.detail).toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Entity Chronology — all entities by time"
        style={{
          position: "fixed", left: 5512, bottom: 18, zIndex: 68,
          background: open ? CY : "rgba(5,9,16,0.82)",
          color: open ? "#04060A" : CY,
          border: `1px solid ${CY}55`,
          borderRadius: 6, padding: "3px 8px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          letterSpacing: 1, cursor: "pointer",
          boxShadow: open ? `0 0 14px ${CY}` : "none",
        }}
      >
        ⊕ CHRON
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", left: 5344, bottom: 52, zIndex: 69,
          width: 440, maxHeight: "70vh",
          background: "rgba(5,9,16,0.93)", backdropFilter: "blur(16px)",
          border: `1px solid ${CY}33`, borderTop: `2px solid ${CY}`,
          borderRadius: 10,
          boxShadow: `0 0 50px rgba(41,231,255,0.12)`,
          display: "flex", flexDirection: "column",
          fontFamily: "'JetBrains Mono',monospace",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px 6px", borderBottom: `1px solid ${CY}22`,
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>
              ⊕ ENTITY CHRONOLOGY
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {loading && (
                <span style={{ color: `${CY}88`, fontSize: 9, letterSpacing: 1 }}>SYNCING</span>
              )}
              <span style={{ color: `${CY}55`, fontSize: 10 }}>{visible.length} entries</span>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none", border: "none", color: `${CY}88`,
                  cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0,
                }}
              >×</button>
            </div>
          </div>

          {/* Filter tabs */}
          <div style={{
            display: "flex", gap: 4, padding: "6px 14px",
            borderBottom: `1px solid ${CY}22`, flexWrap: "wrap",
          }}>
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? CY : "transparent",
                  color: tab === t ? "#04060A" : `${CY}99`,
                  border: `1px solid ${tab === t ? CY : `${CY}44`}`,
                  borderRadius: 4, padding: "2px 7px", fontSize: 9,
                  cursor: "pointer", letterSpacing: 1,
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "6px 14px", borderBottom: `1px solid ${CY}22` }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter entities…"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(41,231,255,0.05)",
                border: `1px solid ${CY}33`, borderRadius: 5,
                color: "#DCEBF5", fontSize: 11, padding: "4px 8px",
                fontFamily: "'JetBrains Mono',monospace", outline: "none",
              }}
            />
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
            {error && (
              <div style={{ color: RED, fontSize: 11, padding: "10px 14px" }}>
                Error loading entities: {error}
              </div>
            )}
            {!error && visible.length === 0 && !loading && (
              <div style={{ color: `${CY}55`, fontSize: 11, padding: "14px 16px" }}>
                No entities match this filter.
              </div>
            )}
            {visible.map((it) => {
              const meta = KIND_META[it.kind] || { color: CY, icon: "◇" };
              return (
                <div
                  key={it.id}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    padding: "7px 14px",
                    borderBottom: `1px solid rgba(41,231,255,0.06)`,
                  }}
                >
                  <span style={{
                    color: meta.color, fontSize: 13, minWidth: 16, marginTop: 1,
                    textShadow: `0 0 8px ${meta.color}`,
                  }}>
                    {meta.icon}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "#DCEBF5", fontSize: 11, marginBottom: 2 }}>
                      {it.title}
                    </div>
                    {it.detail && (
                      <div style={{ color: `${CY}66`, fontSize: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {it.detail}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
                    <span style={{
                      color: meta.color, fontSize: 9, letterSpacing: 1,
                      background: `${meta.color}18`, borderRadius: 3, padding: "1px 5px",
                    }}>
                      {it.kind}
                    </span>
                    <span style={{ color: `${CY}44`, fontSize: 9 }}>
                      {fmtAge(it.ts)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "5px 14px", borderTop: `1px solid ${CY}22`,
            fontSize: 9, color: `${CY}40`, letterSpacing: 1,
          }}>
            /entities/Task · /entities/RiskSignal · /entities/IntelProfile ·
            /entities/SwarmJob · /entities/Investment · /entities/Contact · auto-refresh {POLL_MS / 1000}s
          </div>
        </div>
      )}
    </>
  );
}
