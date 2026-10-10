import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_059_400;
const Z_INDEX  = 270;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const SPIAM_RE = /\b(spiam|strategic[\s-]priority|task[\s-]investment|aligned[\s-]task|unanchored[\s-]task|priority[\s-]alignment|strategic[\s-]alignment[\s-]map)\b/i;
export function isSpiamQuery(q = "") { return SPIAM_RE.test(q); }

function keywords(text = "") {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3);
}

function scoreText(target = "", kws = []) {
  if (!kws.length || !target) return 0;
  const t = target.toLowerCase();
  return kws.reduce((n, k) => n + (t.includes(k) ? 1 : 0), 0) / kws.length;
}

function taskText(t = {}) {
  return [t.title, t.description, t.task_type, t.type, t.tags?.join(" ")].filter(Boolean).join(" ");
}
function investText(i = {}) {
  return [i.name, i.description, i.investment_type, i.type, i.sector, i.tags?.join(" ")].filter(Boolean).join(" ");
}
function signalText(s = {}) {
  return [s.title, s.description, s.signal_type, s.category, s.tags?.join(" ")].filter(Boolean).join(" ");
}

const THRESHOLD = 0.08;

function classifyTask(task, investments, signals) {
  const kws = keywords(taskText(task));
  const matchedInvestments = investments.filter(i => scoreText(investText(i), kws) >= THRESHOLD);
  const matchedSignals     = signals.filter(s => scoreText(signalText(s), kws) >= THRESHOLD);
  const hasInv = matchedInvestments.length > 0;
  const hasSig = matchedSignals.length > 0;
  const category =
    hasInv && hasSig ? "STRATEGICALLY_ALIGNED" :
    hasInv           ? "INVESTMENT_DRIVEN"     :
    hasSig           ? "RISK_TRIGGERED"        :
                       "UNANCHORED";
  return { ...task, category, matchedInvestments, matchedSignals };
}

export async function buildSpiamScript() {
  const base = apiBase();
  const [tRes, iRes, sRes] = await Promise.allSettled([
    fetch(`${base}/entities/Task`,       { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${base}/entities/Investment`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${base}/entities/RiskSignal`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
  ]);
  const rawTasks    = tRes.status === "fulfilled" ? (tRes.value?.items || tRes.value?.data || []) : [];
  const rawInvests  = iRes.status === "fulfilled" ? (iRes.value?.items || iRes.value?.data || []) : [];
  const rawSignals  = sRes.status === "fulfilled" ? (sRes.value?.items || sRes.value?.data || []) : [];
  const tasks       = rawTasks.map(t => classifyTask(t, rawInvests, rawSignals));
  const unanchored  = tasks.filter(t => t.category === "UNANCHORED").length;
  const aligned     = tasks.filter(t => t.category === "STRATEGICALLY_ALIGNED").length;
  const pct         = tasks.length ? Math.round((aligned / tasks.length) * 100) : 0;
  return `SPIAM Strategic Priority Alignment Map online, sir. Correlating ${tasks.length} tasks against ` +
    `${rawInvests.length} investments and ${rawSignals.length} risk signals. ` +
    `Strategic alignment: ${pct}%. ${unanchored} task${unanchored === 1 ? "" : "s"} unanchored — ` +
    `no matching investment or risk signal. Priority gap review recommended.`;
}

const CAT_LABEL = {
  STRATEGICALLY_ALIGNED: "STRATEGICALLY ALIGNED",
  INVESTMENT_DRIVEN:     "INVESTMENT DRIVEN",
  RISK_TRIGGERED:        "RISK TRIGGERED",
  UNANCHORED:            "UNANCHORED",
};
const CAT_COLOR = {
  STRATEGICALLY_ALIGNED: "#29E7FF",
  INVESTMENT_DRIVEN:     "#34D399",
  RISK_TRIGGERED:        "#F87171",
  UNANCHORED:            "#6B7280",
};
const TABS = ["ALL", "STRATEGICALLY_ALIGNED", "INVESTMENT_DRIVEN", "RISK_TRIGGERED", "UNANCHORED"];
const SEV_COLOR = { CRITICAL: "#EF4444", HIGH: "#F97316", MEDIUM: "#FCD34D", LOW: "#6EE7B7" };

export default function TaskInvestmentRiskAlignmentMap() {
  const [open, setOpen]       = useState(false);
  const [tasks, setTasks]     = useState([]);
  const [invests, setInvests] = useState([]);
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab]         = useState("ALL");
  const [search, setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]     = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const [tR, iR, sR] = await Promise.allSettled([
        fetch(`${base}/entities/Task`,       { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${base}/entities/Investment`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${base}/entities/RiskSignal`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
      ]);
      const rawTasks   = tR.status === "fulfilled" ? (tR.value?.items || tR.value?.data || []) : [];
      const rawInvests = iR.status === "fulfilled" ? (iR.value?.items || iR.value?.data || []) : [];
      const rawSignals = sR.status === "fulfilled" ? (sR.value?.items || sR.value?.data || []) : [];
      setInvests(rawInvests);
      setSignals(rawSignals);
      setTasks(rawTasks.map(t => classifyTask(t, rawInvests, rawSignals)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      load();
      timer.current = setInterval(load, POLL_MS);
    } else {
      clearInterval(timer.current);
    }
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener("jarvis:spiam-toggle", h);
    return () => window.removeEventListener("jarvis:spiam-toggle", h);
  }, []);

  const assess = useCallback(async () => {
    if (!tasks.length) return;
    setAssessing(true);
    setBrief("");
    try {
      const base       = apiBase();
      const unanchored = tasks.filter(t => t.category === "UNANCHORED").length;
      const aligned    = tasks.filter(t => t.category === "STRATEGICALLY_ALIGNED").length;
      const pct        = tasks.length ? Math.round((aligned / tasks.length) * 100) : 0;
      const ctx        = `SPIAM: ${tasks.length} tasks, ${aligned} strategically aligned (${pct}%), ${unanchored} unanchored with no investment or risk signal match.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `In 2 sentences, assess strategic priority alignment of these tasks: ${ctx}` }),
      });
      const d   = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(txt);
      if (txt) {
        await fetch(`${base}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text: txt }),
        });
      }
    } finally {
      setAssessing(false);
    }
  }, [tasks]);

  const classified  = tasks.reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + 1; return acc; }, {});
  const unanchored  = classified["UNANCHORED"] || 0;
  const aligned     = classified["STRATEGICALLY_ALIGNED"] || 0;
  const total       = tasks.length;
  const pct         = total ? Math.round((aligned / total) * 100) : 0;

  const filtered = tasks.filter(t => {
    if (tab !== "ALL" && t.category !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return (t.title || t.id || "").toLowerCase().includes(s) ||
             (t.description || "").toLowerCase().includes(s);
    }
    return true;
  });

  const barColor = pct >= 70 ? "#29E7FF" : pct >= 40 ? "#FCD34D" : "#F87171";

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: "rgba(15,25,40,0.85)", border: "1px solid rgba(41,231,255,0.35)",
          color: "#29E7FF", fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
          letterSpacing: 1, padding: "4px 10px", borderRadius: 3, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 5,
        }}
      >
        {unanchored > 0 && (
          <span style={{ background: "#F59E0B", color: "#000", borderRadius: "50%", fontSize: 8, minWidth: 14, height: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>
            {unanchored}
          </span>
        )}
        ◈ SPIAM
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 52, left: BTN_LEFT - 280, zIndex: Z_INDEX,
      width: 620, maxHeight: "72vh", background: "rgba(8,18,30,0.97)",
      border: "1px solid rgba(41,231,255,0.3)", borderRadius: 6,
      display: "flex", flexDirection: "column", fontFamily: "'JetBrains Mono',monospace",
      boxShadow: "0 0 24px rgba(41,231,255,0.08)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid rgba(41,231,255,0.15)", flexShrink: 0 }}>
        <span style={{ color: "#29E7FF", fontSize: 9, letterSpacing: 2 }}>◈ SPIAM — STRATEGIC PRIORITY ALIGNMENT MAP</span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#6B9BAF", cursor: "pointer", fontSize: 11 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px", flexShrink: 0, flexWrap: "wrap" }}>
        {[
          { label: "TASKS",         val: total,                                    color: "#29E7FF" },
          { label: "INVESTMENTS",   val: invests.length,                           color: "#34D399" },
          { label: "RISK SIGNALS",  val: signals.length,                           color: "#F87171" },
          { label: "ALIGNED",       val: aligned,                                  color: "#29E7FF" },
          { label: "INV DRIVEN",    val: classified["INVESTMENT_DRIVEN"]  || 0,    color: "#34D399" },
          { label: "RISK TRIGGERED",val: classified["RISK_TRIGGERED"]     || 0,    color: "#F87171" },
          { label: "UNANCHORED",    val: unanchored,                               color: "#F59E0B" },
          { label: "ALIGNMENT%",    val: `${pct}%`,                                color: barColor  },
        ].map(t => (
          <div key={t.label} style={{ background: "rgba(41,231,255,0.05)", border: "1px solid rgba(41,231,255,0.12)", borderRadius: 4, padding: "4px 8px", minWidth: 64 }}>
            <div style={{ fontSize: 7, color: "#6B9BAF", letterSpacing: 1 }}>{t.label}</div>
            <div style={{ fontSize: 13, color: t.color, fontWeight: 700 }}>{loading ? "…" : t.val}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {total > 0 && (
        <div style={{ margin: "0 12px 6px", height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, flexShrink: 0 }}>
          <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 2, transition: "width 0.5s" }} />
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "4px 12px", flexShrink: 0, overflowX: "auto" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? "rgba(41,231,255,0.18)" : "rgba(41,231,255,0.04)",
            border: `1px solid ${tab === t ? "rgba(41,231,255,0.5)" : "rgba(41,231,255,0.12)"}`,
            color: tab === t ? "#29E7FF" : "#6B9BAF", fontFamily: "'JetBrains Mono',monospace",
            fontSize: 8, letterSpacing: 1, padding: "3px 8px", borderRadius: 3, cursor: "pointer", whiteSpace: "nowrap",
          }}>
            {CAT_LABEL[t] || t}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: "4px 12px", flexShrink: 0 }}>
        <input
          placeholder="SEARCH TASKS…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: "100%", background: "rgba(41,231,255,0.06)", border: "1px solid rgba(41,231,255,0.2)",
            color: "#C0D8E8", fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
            padding: "4px 8px", borderRadius: 3, outline: "none", boxSizing: "border-box",
          }}
        />
      </div>

      {/* Task list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "4px 12px" }}>
        {loading && <div style={{ textAlign: "center", padding: 16, color: "#29E7FF", fontSize: 9 }}>◌ LOADING…</div>}
        {filtered.map((task, i) => {
          const isExp = expanded === (task.id || i);
          return (
            <div key={task.id || i} style={{
              marginBottom: 4, background: "rgba(41,231,255,0.03)",
              border: `1px solid ${task.category === "UNANCHORED" ? "rgba(245,158,11,0.3)" : "rgba(41,231,255,0.12)"}`,
              borderRadius: 4, padding: "6px 8px",
              animation: task.category === "UNANCHORED" ? "spiam-unanchored-pulse 2s infinite" : undefined,
            }}>
              <div
                onClick={() => setExpanded(isExp ? null : (task.id || i))}
                style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
              >
                <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 2, background: `${CAT_COLOR[task.category]}22`, color: CAT_COLOR[task.category], letterSpacing: 1, flexShrink: 0 }}>
                  {CAT_LABEL[task.category]}
                </span>
                <span style={{ fontSize: 9, color: "#C0D8E8", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {task.title || task.id || "Unnamed Task"}
                </span>
                {task.priority && (
                  <span style={{ fontSize: 7, color: "#6B9BAF", flexShrink: 0 }}>{String(task.priority).toUpperCase()}</span>
                )}
                <span style={{ fontSize: 8, color: "#29E7FF", flexShrink: 0 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ marginTop: 6, paddingLeft: 8, fontSize: 8, color: "#8AA8B8", lineHeight: 1.6 }}>
                  {task.description || "No description available."}
                  {task.matchedInvestments?.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ color: "#34D399", letterSpacing: 1, marginBottom: 3 }}>INVESTMENTS ({task.matchedInvestments.length})</div>
                      {task.matchedInvestments.slice(0, 4).map((inv, ii) => (
                        <div key={ii} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ fontSize: 7, padding: "1px 4px", borderRadius: 2, background: "rgba(52,211,153,0.12)", color: "#34D399" }}>
                            {(inv.investment_type || inv.type || "INV").toUpperCase().slice(0, 8)}
                          </span>
                          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.name || inv.id}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {task.matchedSignals?.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ color: "#F87171", letterSpacing: 1, marginBottom: 3 }}>RISK SIGNALS ({task.matchedSignals.length})</div>
                      {task.matchedSignals.slice(0, 4).map((s, si) => (
                        <div key={si} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ fontSize: 7, padding: "1px 4px", borderRadius: 2, background: `${SEV_COLOR[s.severity?.toUpperCase()] || "#F87171"}22`, color: SEV_COLOR[s.severity?.toUpperCase()] || "#F87171" }}>
                            {(s.severity || "UNK").toUpperCase()}
                          </span>
                          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title || s.id}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 24, color: "#6B9BAF", fontSize: 9 }}>NO TASKS MATCH CURRENT FILTER</div>
        )}
      </div>

      {/* AI Assess */}
      <div style={{ borderTop: "1px solid rgba(41,231,255,0.15)", padding: "8px 12px", flexShrink: 0 }}>
        {brief && (
          <div style={{ marginBottom: 6, fontSize: 8, color: "#A0C8D8", lineHeight: 1.6, maxHeight: 80, overflowY: "auto", background: "rgba(41,231,255,0.05)", borderRadius: 4, padding: "4px 8px" }}>
            {brief}
          </div>
        )}
        <button
          onClick={assess}
          disabled={assessing || tasks.length === 0}
          style={{
            background: assessing ? "rgba(41,231,255,0.08)" : "rgba(41,231,255,0.14)",
            border: "1px solid rgba(41,231,255,0.4)", color: assessing ? "#6B9BAF" : "#29E7FF",
            fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: 1,
            padding: "5px 14px", borderRadius: 3, cursor: assessing ? "not-allowed" : "pointer",
          }}
        >
          {assessing ? "◌ ASSESSING…" : "⬡ ASSESS ALIGNMENT"}
        </button>
      </div>

      <style>{`@keyframes spiam-unanchored-pulse { 0%,100% { border-color: rgba(245,158,11,0.3); } 50% { border-color: rgba(245,158,11,0.7); } }`}</style>
    </div>
  );
}
