/**
 * PriorityActionQueue — F45
 * Parallel-fetches /entities/Task + /entities/RiskSignal + /v1/investigations,
 * scores every item by urgency, and renders a unified ranked "what needs attention
 * now" list. Clicking an item sends it to /v1/jarvis/agent/chat for an AI action
 * recommendation spoken via jarvis:speak-dossier.
 * "JARVIS, priority queue" | "what needs attention" | "urgent items" → opens panel + TTS.
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const RED  = "#FF4D6D";
const AMB  = "#FFD700";
const GRN  = "#00E5A0";
const PURP = "#b18cff";
const POLL = 45_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const QUEUE_RE =
  /\b(priority.queue|action.queue|what.needs.attention|needs.attention|urgent.items|urgent.tasks|action.items|top.priorities|what.*urgent|attention.needed)\b/i;

export function isPriorityQueueQuery(t) {
  return QUEUE_RE.test(t || "");
}

/* ── fetchers ───────────────────────────────────────────────────────────────── */
const hdrs = { Authorization: `Bearer ${API_KEY}` };

async function fetchTasks() {
  try {
    const r = await fetch(`${apiBase()}/entities/Task`, { headers: hdrs });
    if (!r.ok) return [];
    const d = await r.json();
    return (Array.isArray(d) ? d : d?.items ?? d?.data ?? []).map(t => ({
      id:       t.id || t._id || String(Math.random()),
      label:    t.title || t.name || t.label || "Task",
      status:   (t.status || "").toLowerCase(),
      priority: (t.priority || "").toLowerCase(),
      source:   "TASK",
      raw:      t,
    }));
  } catch (_) { return []; }
}

async function fetchRisks() {
  try {
    const r = await fetch(`${apiBase()}/entities/RiskSignal`, { headers: hdrs });
    if (!r.ok) return [];
    const d = await r.json();
    return (Array.isArray(d) ? d : d?.items ?? d?.data ?? []).map(r2 => ({
      id:       r2.id || r2._id || String(Math.random()),
      label:    r2.title || r2.name || r2.signal || "Risk Signal",
      severity: Number(r2.severity ?? r2.score ?? 0),
      source:   "RISK",
      raw:      r2,
    }));
  } catch (_) { return []; }
}

async function fetchInvestigations() {
  try {
    const r = await fetch(`${apiBase()}/v1/investigations`, { headers: hdrs });
    if (!r.ok) return [];
    const d = await r.json();
    return (Array.isArray(d) ? d : d?.items ?? d?.investigations ?? []).map(i => ({
      id:       i.id || i._id || String(Math.random()),
      label:    i.title || i.name || i.case_id || "Investigation",
      status:   (i.status || "").toLowerCase(),
      priority: (i.priority || "").toLowerCase(),
      source:   "CASE",
      raw:      i,
    }));
  } catch (_) { return []; }
}

/* ── urgency scoring ────────────────────────────────────────────────────────── */
function urgencyScore(item) {
  let score = 0;
  if (item.source === "RISK") {
    score = item.severity || 0;
  } else {
    const p = item.priority || "";
    if (p.includes("critical") || p.includes("p0")) score = 95;
    else if (p.includes("high") || p.includes("p1")) score = 75;
    else if (p.includes("medium") || p.includes("p2")) score = 45;
    else if (p.includes("low") || p.includes("p3")) score = 20;
    else score = 30;
    const s = item.status || "";
    if (s.includes("blocked")) score += 15;
    if (s.includes("open") || s.includes("todo")) score += 5;
    if (s.includes("done") || s.includes("closed") || s.includes("resolved")) score -= 60;
  }
  return Math.max(0, Math.min(100, score));
}

/* ── TTS script ─────────────────────────────────────────────────────────────── */
export async function buildPriorityQueueScript() {
  try {
    const [tasks, risks, cases] = await Promise.all([
      fetchTasks(), fetchRisks(), fetchInvestigations(),
    ]);
    const all = [...tasks, ...risks, ...cases]
      .map(i => ({ ...i, urgency: urgencyScore(i) }))
      .sort((a, b) => b.urgency - a.urgency);
    const critical = all.filter(i => i.urgency >= 80);
    const top = all.slice(0, 3);
    const topLabels = top.map(i => `${i.source}: ${i.label}`).join("; ");
    return (
      `Priority action queue loaded, sir. ${all.length} items across tasks, risk signals, and investigations. ` +
      `${critical.length} critical item${critical.length !== 1 ? "s" : ""} require immediate attention. ` +
      `Top priorities: ${topLabels || "none outstanding"}. Standing by for your command.`
    );
  } catch (_) {
    return "Priority action queue online. Aggregating tasks, risk signals, and open investigations. Standing by, sir.";
  }
}

/* ── sub-components ─────────────────────────────────────────────────────────── */
const SOURCE_COLORS = { TASK: CY, RISK: RED, CASE: PURP };
const URGENCY_COLOR = (u) =>
  u >= 80 ? RED : u >= 50 ? AMB : u >= 25 ? CY : "#6E8AA0";

function UrgencyBar({ value }) {
  return (
    <div style={{ height: 3, background: "#1A2535", borderRadius: 2, overflow: "hidden", width: 60 }}>
      <div style={{
        height: "100%", width: `${value}%`,
        background: URGENCY_COLOR(value),
        transition: "width 0.4s",
      }} />
    </div>
  );
}

function QueueItem({ item, onSelect, selected }) {
  const col = SOURCE_COLORS[item.source] || CY;
  const urg = item.urgency;
  const urgent = urg >= 80;
  return (
    <div
      onClick={() => onSelect(item)}
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "5px 8px",
        background: selected ? `${col}18` : urgent ? `${RED}0A` : `${col}07`,
        border: `1px solid ${selected ? col : (urgent ? RED + "55" : col + "22")}`,
        borderRadius: 5, marginBottom: 3, cursor: "pointer",
        animation: (urgent && !selected) ? "qpulse 2s ease-in-out infinite" : "none",
      }}
    >
      <span style={{ fontSize: 8, color: col, minWidth: 36, fontWeight: "bold", letterSpacing: 0.5 }}>
        {item.source}
      </span>
      <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {item.label}
      </span>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
        <span style={{ fontSize: 8, color: URGENCY_COLOR(urg), minWidth: 26, textAlign: "right" }}>
          {urg}
        </span>
        <UrgencyBar value={urg} />
      </div>
    </div>
  );
}

/* ── main component ─────────────────────────────────────────────────────────── */
export default function PriorityActionQueue() {
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [items, setItems]       = useState([]);
  const [filter, setFilter]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const [selected, setSelected] = useState(null);
  const [advice, setAdvice]     = useState("");
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [error, setError]       = useState(null);
  const timerRef = useRef(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [tasks, risks, cases] = await Promise.all([
        fetchTasks(), fetchRisks(), fetchInvestigations(),
      ]);
      const all = [...tasks, ...risks, ...cases]
        .map(i => ({ ...i, urgency: urgencyScore(i) }))
        .sort((a, b) => b.urgency - a.urgency);
      setItems(all);
    } catch (e) {
      setError("Failed to load queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    refresh();
    timerRef.current = setInterval(refresh, POLL);
    return () => clearInterval(timerRef.current);
  }, [open, refresh]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:queue-toggle", onToggle);
    return () => window.removeEventListener("jarvis:queue-toggle", onToggle);
  }, []);

  async function selectItem(item) {
    setSelected(item);
    setAdvice(""); setAdviceLoading(true);
    try {
      const prompt =
        `You are JARVIS, a British AI butler. Give a concise 2-sentence action recommendation ` +
        `for this ${item.source} item: "${item.label}". Urgency score: ${item.urgency}/100. ` +
        `Be direct and specific about what should be done.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      if (!r.ok) throw new Error("chat failed");
      const d = await r.json();
      const text = (d.answer || d.response || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAdvice(text);
      if (text) {
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
      }
    } catch (_) {
      setAdvice("Unable to generate recommendation at this time.");
    } finally {
      setAdviceLoading(false);
    }
  }

  const sourceTabs = ["ALL", "TASK", "RISK", "CASE"];
  const critical = items.filter(i => i.urgency >= 80);

  const visible = items.filter(i => {
    if (filter !== "ALL" && i.source !== filter) return false;
    if (search && !i.label.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const statTiles = [
    { label: "TOTAL",    value: items.length,            col: CY },
    { label: "CRITICAL", value: critical.length,          col: RED },
    { label: "TASKS",    value: items.filter(i => i.source === "TASK").length, col: CY },
    { label: "RISKS",    value: items.filter(i => i.source === "RISK").length, col: RED },
    { label: "CASES",    value: items.filter(i => i.source === "CASE").length, col: PURP },
  ];

  return (
    <>
      {/* Bottom-strip toggle */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Priority Action Queue (F45)"
        style={{
          position: "fixed", bottom: 8, left: 3404, zIndex: 60,
          background: open ? CY : "rgba(5,8,13,0.75)",
          color: open ? "#04060A" : CY,
          border: `1px solid ${CY}55`, borderRadius: 4,
          padding: "3px 7px", fontSize: 9, letterSpacing: 1, cursor: "pointer",
          backdropFilter: "blur(4px)", whiteSpace: "nowrap",
          fontFamily: "'JetBrains Mono',monospace",
        }}
      >
        {critical.length > 0 && !open && (
          <span style={{
            display: "inline-block", background: RED, color: "#fff",
            borderRadius: "50%", width: 13, height: 13, fontSize: 8,
            lineHeight: "13px", textAlign: "center", marginRight: 4,
          }}>
            {critical.length > 9 ? "9+" : critical.length}
          </span>
        )}
        ⚡ QUEUE
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 34, left: 3404, zIndex: 65,
          width: 360, maxHeight: "70vh",
          background: "rgba(6,10,18,0.93)", border: `1px solid ${CY}44`,
          borderRadius: 10, padding: "12px 14px",
          backdropFilter: "blur(12px)", boxShadow: `0 0 40px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          display: "flex", flexDirection: "column", gap: 8,
          overflowY: "auto",
        }}>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: "bold",
              textShadow: `0 0 10px ${CY}` }}>
              ⚡ PRIORITY ACTION QUEUE
            </span>
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "#6E8AA0",
                cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {statTiles.map(t => (
              <div key={t.label} style={{
                flex: "1 1 60px", background: `${t.col}12`,
                border: `1px solid ${t.col}33`, borderRadius: 5,
                padding: "4px 6px", textAlign: "center",
              }}>
                <div style={{ fontSize: 14, color: t.col, fontWeight: "bold" }}>{t.value}</div>
                <div style={{ fontSize: 7, color: "#6E8AA0", letterSpacing: 1 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4 }}>
            {sourceTabs.map(tab => (
              <button key={tab} onClick={() => setFilter(tab)} style={{
                flex: 1, padding: "3px 0", fontSize: 8, letterSpacing: 0.5,
                background: filter === tab ? CY : "transparent",
                color: filter === tab ? "#04060A" : "#6E8AA0",
                border: `1px solid ${filter === tab ? CY : "#1A2535"}`,
                borderRadius: 3, cursor: "pointer",
              }}>{tab}</button>
            ))}
          </div>

          {/* Search */}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="filter items…"
            style={{
              background: "#0D1520", border: `1px solid ${CY}33`, borderRadius: 4,
              color: "#DCEBF5", fontSize: 10, padding: "4px 8px",
              fontFamily: "'JetBrains Mono',monospace", outline: "none",
            }}
          />

          {/* Item list */}
          {loading && <div style={{ color: "#6E8AA0", fontSize: 10, textAlign: "center" }}>
            loading queue…
          </div>}
          {error && <div style={{ color: RED, fontSize: 10 }}>{error}</div>}
          {!loading && !error && visible.length === 0 && (
            <div style={{ color: "#6E8AA0", fontSize: 10, textAlign: "center" }}>
              no items match
            </div>
          )}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {visible.map(item => (
              <QueueItem
                key={item.id}
                item={item}
                onSelect={selectItem}
                selected={selected?.id === item.id}
              />
            ))}
          </div>

          {/* AI advice panel */}
          {selected && (
            <div style={{
              background: `${PURP}10`, border: `1px solid ${PURP}33`,
              borderRadius: 6, padding: "8px 10px",
            }}>
              <div style={{ fontSize: 8, color: PURP, letterSpacing: 1, marginBottom: 4 }}>
                ◈ AI RECOMMENDATION — {selected.source}: {selected.label.slice(0, 40)}
              </div>
              {adviceLoading
                ? <div style={{ color: "#6E8AA0", fontSize: 10 }}>consulting knowledge graph…</div>
                : <div style={{ fontSize: 10, lineHeight: 1.5, color: "#DCEBF5" }}>{advice}</div>
              }
            </div>
          )}

          <div style={{ fontSize: 8, color: "#6E8AA0", textAlign: "right" }}>
            auto-refresh 45s · click item for AI recommendation
          </div>
        </div>
      )}

      <style>{`
        @keyframes qpulse {
          0%,100% { box-shadow: none; }
          50% { box-shadow: 0 0 8px ${RED}88; }
        }
      `}</style>
    </>
  );
}
