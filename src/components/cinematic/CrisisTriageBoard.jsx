/**
 * CrisisTriageBoard (CTRIAGE) — unified severity-sorted view of all active
 * criticals across four real data sources:
 *   /entities/RiskSignal   → critical + high signals
 *   /v1/ops/alerts         → critical + high alerts (also /v1/alerts fallback)
 *   /entities/Task         → blocked or overdue tasks
 *   /v1/investigations     → open investigations
 *
 * Shows a single ranked triage list. ▶ ASSESS sends the worst item to
 * /v1/jarvis/agent/chat + TTS. Polls every 60 s.
 * Mount: App.jsx (additive only). Toggle: jarvis:ctriage-toggle CustomEvent.
 * Voice: crisis triage / triage / ctriage / urgent items / all criticals.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const API = "";
const CY = "#29E7FF";
const RD = "#ff4444";
const AM = "#ffaa00";
const PU = "#a855f7";
const GR = "#00c878";
const MONO = "'JetBrains Mono', 'Courier New', monospace";
const SANS = "'Inter', system-ui, sans-serif";
const POLL = 60_000;

function sev(item) {
  const s = (item.severity || item.priority || item.status || "").toLowerCase();
  if (s === "critical" || s === "blocked")  return 0;
  if (s === "high")                          return 1;
  if (s === "medium")                        return 2;
  return 3;
}

function sevLabel(item) {
  const s = (item.severity || item.priority || item.status || "").toLowerCase();
  if (s === "critical") return { label: "CRITICAL", col: RD };
  if (s === "blocked")  return { label: "BLOCKED",  col: RD };
  if (s === "high")     return { label: "HIGH",     col: AM };
  if (s === "medium")   return { label: "MEDIUM",   col: PU };
  return                       { label: "LOW",      col: GR };
}

async function fetchRisks() {
  const r = await fetch(`${API}/entities/RiskSignal`);
  if (!r.ok) return [];
  const d = await r.json();
  const items = Array.isArray(d) ? d : d.data || d.items || [];
  return items
    .filter((x) => ["critical", "high"].includes((x.severity || "").toLowerCase()))
    .map((x) => ({ id: `risk-${x.id || x.name}`, kind: "RISK", name: x.name || x.title || "Signal", severity: x.severity, detail: x.description || x.source || "" }));
}

async function fetchAlerts() {
  let url = `${API}/v1/ops/alerts`;
  let r = await fetch(url);
  if (!r.ok) { r = await fetch(`${API}/v1/alerts`); }
  if (!r.ok) return [];
  const d = await r.json();
  const items = Array.isArray(d) ? d : d.data || d.alerts || d.items || [];
  return items
    .filter((x) => ["critical", "high"].includes((x.severity || x.level || "").toLowerCase()))
    .map((x) => ({ id: `alert-${x.id || x.name}`, kind: "ALERT", name: x.name || x.title || x.message || "Alert", severity: x.severity || x.level, detail: x.source || x.rule || x.description || "" }));
}

async function fetchTasks() {
  const r = await fetch(`${API}/entities/Task`);
  if (!r.ok) return [];
  const d = await r.json();
  const items = Array.isArray(d) ? d : d.data || d.items || [];
  const now = Date.now();
  return items
    .filter((x) => {
      const st = (x.status || "").toLowerCase();
      if (st === "blocked") return true;
      if (x.due_date && new Date(x.due_date).getTime() < now) return true;
      return false;
    })
    .map((x) => {
      const st = (x.status || "").toLowerCase();
      return { id: `task-${x.id || x.name}`, kind: "TASK", name: x.name || x.title || "Task", severity: st === "blocked" ? "blocked" : "high", detail: x.description || x.assignee || "" };
    });
}

async function fetchInvestigations() {
  const r = await fetch(`${API}/v1/investigations`);
  if (!r.ok) return [];
  const d = await r.json();
  const items = Array.isArray(d) ? d : d.data || d.investigations || d.items || [];
  return items
    .filter((x) => (x.status || "").toLowerCase() === "open")
    .slice(0, 20)
    .map((x) => ({ id: `inv-${x.id || x.title}`, kind: "INVEST", name: x.title || x.name || "Investigation", severity: x.priority || "medium", detail: x.description || x.type || "" }));
}

const KIND_COL = { RISK: RD, ALERT: AM, TASK: PU, INVEST: CY };

export function isCtiageQuery(q) {
  return /\b(crisis\s*triage|ctriage|triage|all\s*criticals?|urgent\s*items?|emergency\s*board)\b/i.test(q);
}

export function buildCtriageScript(data) {
  const top = (data || []).slice(0, 5);
  if (!top.length) return "No critical items detected. All clear.";
  const lines = top.map((x, i) => `${i + 1}. [${x.kind}] ${x.severity?.toUpperCase()} — ${x.name}`).join(". ");
  return `JARVIS crisis triage: ${top.length} critical items. ${lines}.`;
}

export default function CrisisTriageBoard() {
  const [open, setOpen]       = useState(false);
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState(null);
  const [filter, setFilter]   = useState("ALL");
  const [search, setSearch]   = useState("");
  const [assessing, setAssessing] = useState(false);
  const [aiText, setAiText]   = useState("");
  const timerRef              = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [risks, alerts, tasks, invs] = await Promise.all([
        fetchRisks(), fetchAlerts(), fetchTasks(), fetchInvestigations(),
      ]);
      const all = [...risks, ...alerts, ...tasks, ...invs];
      all.sort((a, b) => sev(a) - sev(b));
      setItems(all);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => { setOpen((v) => !v); };
    window.addEventListener("jarvis:ctriage-toggle", h);
    return () => window.removeEventListener("jarvis:ctriage-toggle", h);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing || !items.length) return;
    setAssessing(true); setAiText("");
    const script = buildCtriageScript(items);
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `Crisis triage — top critical items:\n${items.slice(0, 10).map((x) => `[${x.kind}] ${(x.severity || "").toUpperCase()} ${x.name}: ${x.detail}`).join("\n")}\n\nProvide a 3-sentence prioritised action plan.` }),
      });
      if (r.ok) {
        const d = await r.json();
        const txt = d.response || d.content || d.message || JSON.stringify(d);
        setAiText(txt);
        await fetch(`${API}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: script }),
        });
      }
    } catch (_) {}
    setAssessing(false);
  }, [assessing, items]);

  if (!open) return null;

  const TABS = ["ALL", "RISK", "ALERT", "TASK", "INVEST"];
  const filtered = items.filter((x) => {
    if (filter !== "ALL" && x.kind !== filter) return false;
    if (search && !`${x.name} ${x.detail}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const critCount  = items.filter((x) => ["critical", "blocked"].includes((x.severity || "").toLowerCase())).length;
  const highCount  = items.filter((x) => (x.severity || "").toLowerCase() === "high").length;
  const riskCount  = items.filter((x) => x.kind === "RISK").length;
  const alertCount = items.filter((x) => x.kind === "ALERT").length;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 900,
        background: "rgba(0,4,8,0.82)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: SANS,
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div style={{
        width: "min(900px, 96vw)", maxHeight: "88vh",
        background: "rgba(5,12,20,0.97)", border: `1px solid ${RD}`,
        borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: `0 0 40px rgba(255,68,68,0.18)`,
      }}>
        {/* Header */}
        <div style={{ padding: "14px 18px 10px", borderBottom: `1px solid rgba(255,68,68,0.25)`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: MONO, color: RD, fontSize: 13, letterSpacing: 2 }}>
            ⚡ CRISIS TRIAGE BOARD
          </div>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 8, padding: "10px 18px", borderBottom: `1px solid rgba(255,68,68,0.12)` }}>
          {[
            { label: "TOTAL", val: items.length, col: CY },
            { label: "CRITICAL", val: critCount, col: RD },
            { label: "HIGH", val: highCount, col: AM },
            { label: "RISKS", val: riskCount, col: RD },
            { label: "ALERTS", val: alertCount, col: AM },
          ].map((s) => (
            <div key={s.label} style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
              <div style={{ color: s.col, fontFamily: MONO, fontSize: 18, fontWeight: 700 }}>{loading ? "…" : s.val}</div>
              <div style={{ color: "#555", fontSize: 9, letterSpacing: 1.2, fontFamily: MONO, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div style={{ padding: "8px 18px", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {TABS.map((t) => (
            <button key={t} onClick={() => setFilter(t)} style={{
              background: filter === t ? `${RD}22` : "transparent",
              border: `1px solid ${filter === t ? RD : "#333"}`,
              color: filter === t ? RD : "#666", fontFamily: MONO, fontSize: 9,
              padding: "3px 8px", borderRadius: 4, cursor: "pointer", letterSpacing: 1,
            }}>{t}</button>
          ))}
          <input
            placeholder="search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1, minWidth: 120, background: "rgba(255,255,255,0.05)", border: "1px solid #333",
              color: "#ccc", fontFamily: MONO, fontSize: 10, padding: "4px 8px", borderRadius: 4, outline: "none",
            }}
          />
          <button onClick={load} style={{ background: "transparent", border: `1px solid #333`, color: "#555", fontFamily: MONO, fontSize: 9, padding: "3px 8px", borderRadius: 4, cursor: "pointer" }}>↺</button>
          <button
            onClick={assess}
            disabled={assessing || !items.length}
            style={{
              background: assessing ? "rgba(255,68,68,0.1)" : "rgba(255,68,68,0.15)",
              border: `1px solid ${RD}`, color: RD, fontFamily: MONO, fontSize: 9,
              padding: "3px 8px", borderRadius: 4, cursor: "pointer", letterSpacing: 1,
              opacity: assessing ? 0.6 : 1,
            }}
          >{assessing ? "…" : "▶ ASSESS"}</button>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 18px 14px" }}>
          {err && <div style={{ color: RD, fontFamily: MONO, fontSize: 10, padding: "8px 0" }}>ERROR: {err}</div>}
          {!loading && !err && filtered.length === 0 && (
            <div style={{ color: GR, fontFamily: MONO, fontSize: 11, padding: "16px 0", textAlign: "center" }}>
              ✓ ALL CLEAR — no critical items
            </div>
          )}
          {filtered.map((item) => {
            const { label, col } = sevLabel(item);
            const kc = KIND_COL[item.kind] || CY;
            return (
              <div key={item.id} style={{
                borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "8px 0",
                display: "flex", alignItems: "flex-start", gap: 10,
              }}>
                <div style={{ flexShrink: 0, width: 56, fontFamily: MONO, fontSize: 9, color: kc, letterSpacing: 0.8, paddingTop: 1 }}>
                  {item.kind}
                </div>
                <div style={{ flexShrink: 0, width: 68, fontFamily: MONO, fontSize: 9, color: col, letterSpacing: 0.8, paddingTop: 1 }}>
                  {label}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#e0e0e0", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {item.name}
                  </div>
                  {item.detail && (
                    <div style={{ color: "#555", fontSize: 10, fontFamily: MONO, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.detail}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* AI output */}
        {aiText && (
          <div style={{ borderTop: `1px solid rgba(255,68,68,0.2)`, padding: "10px 18px", background: "rgba(255,68,68,0.05)" }}>
            <div style={{ color: "#888", fontFamily: MONO, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>JARVIS ASSESSMENT</div>
            <div style={{ color: "#ccc", fontSize: 11, lineHeight: 1.6 }}>{aiText}</div>
          </div>
        )}
      </div>
    </div>
  );
}
