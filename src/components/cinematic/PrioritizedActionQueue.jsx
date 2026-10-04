/**
 * PrioritizedActionQueue — F620
 * "JARVIS, action queue / priority queue / paq / what needs attention / top priorities / urgent queue"
 * Merges /entities/Task + /entities/RiskSignal + /v1/investigations into a unified priority-scored
 * action list. Items are ranked by urgency score. Each item has a ▶ HANDLE button that fires
 * /v1/jarvis/agent/chat for a 2-sentence action suggestion + TTS.
 * ▶ BRIEF → full queue spoken summary.
 * 60-s auto-refresh. Additive only — mounted via App.jsx.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const RED = "#FF4444";
const AMB = "#FFA500";
const GRN = "#00E5A0";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 60_000;
const BTN_LEFT = 96_780;
const Z_INDEX  = 171;

const PAQ_RE =
  /\bpaq\b|\baction.?queue\b|\bpriority.?queue\b|\bwhat.?needs.?attention\b|\btop.?priorit\w*\b|\bpriority.?action\b|\burgent.?queue\b|\bprioritized.?action\b/i;

export function isPaqQuery(text) {
  return PAQ_RE.test(text || "");
}

// ─── score helpers ────────────────────────────────────────────────────────────

function scoreTask(t) {
  const st = (t.status || "").toUpperCase();
  if (st === "BLOCKED")     return 90;
  if (st === "IN_PROGRESS") return 60;
  if (st === "PENDING")     return 30;
  return 10;
}

function scoreRisk(r) {
  const sv = (r.severity || r.level || "").toUpperCase();
  if (sv === "CRITICAL") return 95;
  if (sv === "HIGH")     return 75;
  if (sv === "MEDIUM")   return 45;
  return 15;
}

function scoreInvestigation(i) {
  const st = (i.status || "").toUpperCase();
  if (st === "ESCALATED") return 85;
  if (st === "ACTIVE")    return 65;
  if (st === "OPEN")      return 50;
  return 10;
}

function normalizeTasks(raw) {
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.tasks) ? raw.tasks : Array.isArray(raw?.data) ? raw.data : [];
  return arr.map((t, i) => ({
    id:     `TASK-${t.id || i}`,
    kind:   "TASK",
    title:  t.title || t.name || t.summary || `Task ${i + 1}`,
    status: (t.status || "PENDING").toUpperCase(),
    score:  scoreTask(t),
    raw:    t,
  }));
}

function normalizeRisks(raw) {
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.risks) ? raw.risks : Array.isArray(raw?.signals) ? raw.signals : Array.isArray(raw?.data) ? raw.data : [];
  return arr.map((r, i) => ({
    id:     `RISK-${r.id || i}`,
    kind:   "RISK",
    title:  r.title || r.name || r.signal || `Signal ${i + 1}`,
    status: (r.severity || r.level || "LOW").toUpperCase(),
    score:  scoreRisk(r),
    raw:    r,
  }));
}

function normalizeInvestigations(raw) {
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.investigations) ? raw.investigations : Array.isArray(raw?.cases) ? raw.cases : Array.isArray(raw?.data) ? raw.data : [];
  return arr.map((c, i) => ({
    id:     `CASE-${c.id || i}`,
    kind:   "CASE",
    title:  c.title || c.name || c.summary || `Case ${i + 1}`,
    status: (c.status || "OPEN").toUpperCase(),
    score:  scoreInvestigation(c),
    raw:    c,
  }));
}

// ─── voice script ─────────────────────────────────────────────────────────────

export async function buildPaqScript() {
  try {
    const base = apiBase();
    const [rt, rr, ri] = await Promise.all([
      fetch(`${base}/entities/Task`,           { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()).catch(() => []),
      fetch(`${base}/entities/RiskSignal`,     { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()).catch(() => []),
      fetch(`${base}/v1/investigations`,       { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()).catch(() => []),
    ]);
    const items = [
      ...normalizeTasks(rt),
      ...normalizeRisks(rr),
      ...normalizeInvestigations(ri),
    ].sort((a, b) => b.score - a.score).slice(0, 15);
    const critical = items.filter(i => i.score >= 85);
    const top = items.slice(0, 3).map(i => `${i.kind}: ${i.title}`).join("; ");
    return `Priority Action Queue: ${items.length} items queued, ${critical.length} critical. Top three: ${top || "queue is clear"}.`;
  } catch {
    return "Priority action queue is unavailable right now, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function PrioritizedActionQueue() {
  const [open, setOpen]       = useState(false);
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch]   = useState("");
  const [filter, setFilter]   = useState("ALL");
  const [expanded, setExpanded] = useState(null);
  const [handling, setHandling] = useState(null);
  const [handleMsg, setHandleMsg] = useState({});
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const [rt, rr, ri] = await Promise.all([
        fetch(`${base}/entities/Task`,         { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()).catch(() => []),
        fetch(`${base}/entities/RiskSignal`,   { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()).catch(() => []),
        fetch(`${base}/v1/investigations`,     { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()).catch(() => []),
      ]);
      const merged = [
        ...normalizeTasks(rt),
        ...normalizeRisks(rr),
        ...normalizeInvestigations(ri),
      ].sort((a, b) => b.score - a.score);
      setItems(merged);
    } catch {
      // silently fail — network may be down
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const toggle = () => { setOpen(o => !o); };
    window.addEventListener("jarvis:paq-toggle", toggle);
    return () => window.removeEventListener("jarvis:paq-toggle", toggle);
  }, []);

  const critCount = items.filter(i => i.score >= 85).length;

  const filtered = items.filter(i => {
    const matchFilter = filter === "ALL" || i.kind === filter;
    const matchSearch = !search || i.title.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  async function handleItem(item) {
    setHandling(item.id);
    try {
      const base = apiBase();
      const prompt = `In 2 sentences, what is the best immediate action for this ${item.kind.toLowerCase()}: "${item.title}" (status: ${item.status}, priority score: ${item.score})?`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const advice = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setHandleMsg(m => ({ ...m, [item.id]: advice }));
      if (advice) {
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: advice } }));
      }
    } catch {
      setHandleMsg(m => ({ ...m, [item.id]: "Unable to retrieve action advice." }));
    } finally {
      setHandling(null);
    }
  }

  async function brief() {
    const text = await buildPaqScript();
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  function kindColor(kind) {
    if (kind === "RISK") return RED;
    if (kind === "CASE") return AMB;
    return CY;
  }

  function scoreColor(score) {
    if (score >= 85) return RED;
    if (score >= 60) return AMB;
    return GRN;
  }

  const PANEL = {
    position: "fixed", left: BTN_LEFT, bottom: 48, zIndex: Z_INDEX,
    width: 520, maxHeight: "78vh", overflow: "hidden",
    background: "rgba(4,6,10,0.97)", border: `1px solid ${CY}33`,
    borderRadius: 10, display: "flex", flexDirection: "column",
    fontFamily: "monospace", boxShadow: `0 0 30px ${CY}22`,
  };

  const HDR = {
    padding: "10px 14px 8px", borderBottom: `1px solid ${CY}22`,
    display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
  };

  const SCROLL = { overflowY: "auto", flex: 1, padding: "8px 10px" };

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Prioritized Action Queue"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          padding: "2px 7px", fontSize: 10, fontFamily: "monospace",
          background: "rgba(4,6,10,0.85)", border: `1px solid ${critCount > 0 ? RED : CY}44`,
          color: critCount > 0 ? RED : CY, borderRadius: 4, cursor: "pointer",
          boxShadow: critCount > 0 ? `0 0 8px ${RED}66` : "none",
          letterSpacing: "0.04em",
        }}
      >
        ◈ PAQ{critCount > 0 ? ` [${critCount}]` : ""}
      </button>

      {open && (
        <div style={PANEL}>
          <div style={HDR}>
            <span style={{ color: CY, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", flex: 1 }}>
              ◈ PRIORITIZED ACTION QUEUE
            </span>
            {loading && <span style={{ color: DIM, fontSize: 9 }}>LOADING…</span>}
            <button onClick={brief} style={{ background: "none", border: `1px solid ${CY}44`, color: CY, padding: "2px 8px", borderRadius: 3, cursor: "pointer", fontSize: 10 }}>
              ▶ BRIEF
            </button>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          <div style={{ padding: "6px 10px", borderBottom: `1px solid ${CY}11`, display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
            {["ALL", "TASK", "RISK", "CASE"].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                background: filter === f ? `${CY}22` : "none",
                border: `1px solid ${filter === f ? CY : CY + "33"}`,
                color: filter === f ? CY : DIM, padding: "2px 8px",
                borderRadius: 3, cursor: "pointer", fontSize: 10,
              }}>{f}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search…"
              style={{ flex: 1, minWidth: 100, background: "rgba(41,231,255,0.05)", border: `1px solid ${CY}22`, color: CY, padding: "2px 6px", borderRadius: 3, fontSize: 10, outline: "none" }}
            />
          </div>

          <div style={{ padding: "4px 14px 4px", fontSize: 10, color: DIM, flexShrink: 0 }}>
            {items.length} items · {critCount > 0 ? <span style={{ color: RED }}>{critCount} critical</span> : "no critical"} · showing {filtered.length}
          </div>

          <div style={SCROLL}>
            {filtered.length === 0 && !loading && (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: "20px 0" }}>Queue is clear.</div>
            )}
            {filtered.map(item => (
              <div key={item.id} style={{
                marginBottom: 6, borderRadius: 6, border: `1px solid ${kindColor(item.kind)}22`,
                background: expanded === item.id ? `${kindColor(item.kind)}09` : "transparent",
                overflow: "hidden",
              }}>
                <div
                  onClick={() => setExpanded(e => e === item.id ? null : item.id)}
                  style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 10px", cursor: "pointer" }}
                >
                  <span style={{ fontSize: 9, color: kindColor(item.kind), border: `1px solid ${kindColor(item.kind)}55`, borderRadius: 3, padding: "1px 5px", letterSpacing: "0.06em", flexShrink: 0 }}>
                    {item.kind}
                  </span>
                  <span style={{ fontSize: 10, color: "#C8D8E8", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.title}
                  </span>
                  <span style={{ fontSize: 9, color: scoreColor(item.score), fontWeight: 700, flexShrink: 0 }}>
                    {item.score}
                  </span>
                  <span style={{ fontSize: 9, color: DIM, flexShrink: 0 }}>
                    {item.status}
                  </span>
                </div>

                {expanded === item.id && (
                  <div style={{ borderTop: `1px solid ${kindColor(item.kind)}22`, padding: "8px 10px", fontSize: 10 }}>
                    <div style={{ color: DIM, marginBottom: 6 }}>
                      Priority score: <span style={{ color: scoreColor(item.score) }}>{item.score}</span>
                      {" · "}Status: <span style={{ color: CY }}>{item.status}</span>
                    </div>
                    <button
                      onClick={() => handleItem(item)}
                      disabled={handling === item.id}
                      style={{ background: "none", border: `1px solid ${kindColor(item.kind)}55`, color: kindColor(item.kind), padding: "3px 10px", borderRadius: 3, cursor: "pointer", fontSize: 10 }}
                    >
                      {handling === item.id ? "THINKING…" : "▶ HANDLE"}
                    </button>
                    {handleMsg[item.id] && (
                      <div style={{ marginTop: 6, color: "#C8D8E8", fontSize: 10, lineHeight: 1.5, borderLeft: `2px solid ${kindColor(item.kind)}44`, paddingLeft: 8 }}>
                        {handleMsg[item.id]}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
