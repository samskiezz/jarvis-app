/**
 * F188 — Investment × Task × Ops Event Triple Coverage (ITTRI)
 * Parallel-fetches /entities/Investment + /entities/Task + /v1/ops/events.
 * Three-way keyword-correlates each investment to surface:
 *   FULLY ENGAGED  (task assigned + ops event triggered)
 *   TASKED-ONLY    (task found, no ops event alignment)
 *   OPS-TRIGGERED  (ops event found, no task assigned)
 *   DORMANT        (neither — investment with no operational coverage)
 * Cyan badge on fully-engaged count. 90-s auto-refresh.
 */

import { useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const AM = "#FFB300";
const GR = "#4ADE80";
const RD = "#FF4444";
const SL = "#6E8AA0";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_KEY) ||
  "dev-key";

const ITTRI_RE =
  /\b(ittri|investment\s+ops|ops\s+investment|investment\s+task\s+ops|investment\s+task|task\s+investment|engaged\s+invest\w*|invest\w*\s+ops\s+event|invest\w*\s+ops|invest\w*\s+task|dormant\s+invest\w*|portfolio\s+ops|portfolio\s+task|invest\w*\s+operational)\b/i;

export function isIttriQuery(t) {
  return ITTRI_RE.test(t || "");
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function tok(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function normaliseInvestments(raw) {
  const arr = Array.isArray(raw)               ? raw
    : Array.isArray(raw?.investments)           ? raw.investments
    : Array.isArray(raw?.data)                  ? raw.data
    : Array.isArray(raw?.items)                 ? raw.items
    : Array.isArray(raw?.results)               ? raw.results
    : [];
  return arr.map((inv, i) => ({
    id:     inv.id     || String(i),
    name:   inv.name   || inv.title  || inv.label   || `Investment ${i + 1}`,
    sector: inv.sector || inv.type   || inv.category || "",
    ticker: inv.ticker || inv.symbol || "",
    notes:  String(inv.notes || inv.description || inv.summary || "").slice(0, 200),
    tags:   Array.isArray(inv.tags) ? inv.tags.join(" ") : (inv.tags || ""),
  }));
}

function normaliseTasks(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.tasks)            ? raw.tasks
    : Array.isArray(raw?.data)             ? raw.data
    : Array.isArray(raw?.items)            ? raw.items
    : Array.isArray(raw?.results)          ? raw.results
    : [];
  return arr.map((t, i) => ({
    id:       t.id       || String(i),
    title:    t.title    || t.name        || t.mission || `Task ${i + 1}`,
    status:   t.status   || t.state       || "ACTIVE",
    priority: t.priority || t.urgency     || "",
    tokens:   tok([t.title, t.name, t.mission, t.description, t.priority,
                   ...(Array.isArray(t.tags) ? t.tags : [])].join(" ")),
  }));
}

function normaliseOpsEvents(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.events)              ? raw.events
    : Array.isArray(raw?.ops_events)          ? raw.ops_events
    : Array.isArray(raw?.data)                ? raw.data
    : Array.isArray(raw?.items)               ? raw.items
    : Array.isArray(raw?.results)             ? raw.results
    : [];
  return arr.map((e, i) => ({
    id:       e.id       || String(i),
    name:     e.name     || e.title      || e.event   || `Event ${i + 1}`,
    severity: e.severity || e.level      || "INFO",
    type:     e.type     || e.category   || "",
    tokens:   tok([e.name, e.title, e.event, e.description,
                   e.type, e.category, e.severity,
                   ...(Array.isArray(e.tags) ? e.tags : [])].join(" ")),
  }));
}

function invTokens(inv) {
  return tok(`${inv.name} ${inv.sector} ${inv.ticker} ${inv.notes} ${inv.tags}`);
}

function taskRelevance(inv, task) {
  const iw = new Set(invTokens(inv));
  return task.tokens.filter((w) => iw.has(w)).length;
}

function opsRelevance(inv, ev) {
  const iw = new Set(invTokens(inv));
  return ev.tokens.filter((w) => iw.has(w)).length;
}

function correlate(investments, tasks, opsEvents) {
  return investments.map((inv) => {
    const matchedTasks = tasks
      .map((t) => ({ ...t, sc: taskRelevance(inv, t) }))
      .filter((t) => t.sc > 0)
      .sort((a, b) => b.sc - a.sc)
      .slice(0, 6);
    const matchedOps = opsEvents
      .map((e) => ({ ...e, sc: opsRelevance(inv, e) }))
      .filter((e) => e.sc > 0)
      .sort((a, b) => b.sc - a.sc)
      .slice(0, 6);
    const hasTasks = matchedTasks.length > 0;
    const hasOps   = matchedOps.length   > 0;
    const cls =
      hasTasks && hasOps ? "FULLY ENGAGED"
      : hasTasks          ? "TASKED-ONLY"
      : hasOps            ? "OPS-TRIGGERED"
      :                     "DORMANT";
    return { ...inv, _tasks: matchedTasks, _ops: matchedOps, _class: cls };
  });
}

// ── script (called by JarvisBrain) ───────────────────────────────────────────

export async function buildIttriScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [ir, tr, or_] = await Promise.allSettled([
      fetch(`${base}/entities/Investment`, { headers: hdr }).then((r) => r.json()),
      fetch(`${base}/entities/Task`,       { headers: hdr }).then((r) => r.json()),
      fetch(`${base}/v1/ops/events`,       { headers: hdr }).then((r) => r.json()),
    ]);
    const investments = normaliseInvestments(ir.status  === "fulfilled" ? ir.value  : []);
    const tasks       = normaliseTasks      (tr.status  === "fulfilled" ? tr.value  : []);
    const opsEvents   = normaliseOpsEvents  (or_.status === "fulfilled" ? or_.value : []);
    const linked      = correlate(investments, tasks, opsEvents);

    const fullyEngaged  = linked.filter((i) => i._class === "FULLY ENGAGED").length;
    const taskedOnly    = linked.filter((i) => i._class === "TASKED-ONLY").length;
    const opsTriggered  = linked.filter((i) => i._class === "OPS-TRIGGERED").length;
    const dormant       = linked.filter((i) => i._class === "DORMANT").length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS investment operational triple coverage: ${investments.length} investments ` +
          `correlated against ${tasks.length} active tasks and ${opsEvents.length} ops events. ` +
          `${fullyEngaged} FULLY ENGAGED (task + ops coverage), ` +
          `${taskedOnly} TASKED-ONLY, ${opsTriggered} OPS-TRIGGERED, ${dormant} DORMANT. ` +
          `Provide a 2-sentence investment operational coverage assessment — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Investment operational triple coverage analysis complete, sir.").trim();
  } catch {
    return "Investment task and ops triple coverage assessment unavailable at this time, sir.";
  }
}

// ── UI helpers ────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'JetBrains Mono', monospace" };

const ScoreBar = ({ sc, color }) => (
  <div style={{ background: "#111", borderRadius: 2, height: 3, width: "100%", overflow: "hidden", marginTop: 2 }}>
    <div style={{ width: `${Math.min(100, Math.round(sc * 33))}%`, background: color, height: "100%" }} />
  </div>
);

const Chip = ({ label, color = CY }) => (
  <span style={{ display: "inline-block", padding: "1px 5px", border: `1px solid ${color}`,
    borderRadius: 3, color, fontSize: 9, letterSpacing: 0.8, marginRight: 3 }}>
    {label}
  </span>
);

function classColor(cls) {
  if (cls === "FULLY ENGAGED")  return CY;
  if (cls === "TASKED-ONLY")    return GR;
  if (cls === "OPS-TRIGGERED")  return AM;
  return "#444";
}

function sevColor(sev) {
  if (!sev) return SL;
  const s = sev.toUpperCase();
  if (s === "CRITICAL" || s === "HIGH") return RD;
  if (s === "MEDIUM")                   return AM;
  return "#555";
}

function priColor(pri) {
  if (!pri) return SL;
  const p = pri.toUpperCase();
  if (p === "HIGH" || p === "CRITICAL") return RD;
  if (p === "MEDIUM")                   return AM;
  return SL;
}

const TABS = ["ALL", "FULLY ENGAGED", "TASKED-ONLY", "OPS-TRIGGERED", "DORMANT"];

export default function InvestmentTaskOpsTriple() {
  const [open,        setOpen]        = useState(false);
  const [investments, setInvestments] = useState([]);
  const [tasks,       setTasks]       = useState([]);
  const [opsEvents,   setOpsEvents]   = useState([]);
  const [linked,      setLinked]      = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [tab,         setTab]         = useState("ALL");
  const [search,      setSearch]      = useState("");
  const [expanded,    setExpanded]    = useState(null);
  const [assessing,   setAssessing]   = useState(false);
  const [assessText,  setAssessText]  = useState("");
  const [err,         setErr]         = useState("");
  const timerRef = useRef(null);

  async function load() {
    setLoading(true); setErr("");
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [ir, tr, or_] = await Promise.allSettled([
        fetch(`${base}/entities/Investment`, { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/entities/Task`,       { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/v1/ops/events`,       { headers: hdr }).then((r) => r.json()),
      ]);
      const inv = normaliseInvestments(ir.status  === "fulfilled" ? ir.value  : []);
      const tsk = normaliseTasks      (tr.status  === "fulfilled" ? tr.value  : []);
      const ops = normaliseOpsEvents  (or_.status === "fulfilled" ? or_.value : []);
      setInvestments(inv);
      setTasks(tsk);
      setOpsEvents(ops);
      setLinked(correlate(inv, tsk, ops));
    } catch (e) {
      setErr(String(e));
    }
    setLoading(false);
  }

  useEffect(() => {
    const handler = () => { setOpen((o) => !o); };
    window.addEventListener("jarvis:ittri-toggle", handler);
    return () => window.removeEventListener("jarvis:ittri-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open]);

  async function assess() {
    setAssessing(true); setAssessText("");
    const script = await buildIttriScript();
    setAssessText(script);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    setAssessing(false);
  }

  const fullyEngagedCount = linked.filter((i) => i._class === "FULLY ENGAGED").length;
  const taskedOnlyCount   = linked.filter((i) => i._class === "TASKED-ONLY").length;
  const opsTriggeredCount = linked.filter((i) => i._class === "OPS-TRIGGERED").length;
  const dormantCount      = linked.filter((i) => i._class === "DORMANT").length;

  const filtered = linked
    .filter((inv) => {
      if (tab === "ALL") return true;
      return inv._class === tab;
    })
    .filter((inv) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (inv.name + inv.sector + inv.ticker + inv.notes).toLowerCase().includes(q);
    });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          bottom: 8,
          left: 732240,
          zIndex: 336,
          background: fullyEngagedCount > 0 ? "#041218" : "#0b0b0f",
          border: `1px solid ${fullyEngagedCount > 0 ? CY : "#1e2a38"}`,
          color: fullyEngagedCount > 0 ? CY : SL,
          borderRadius: 4,
          padding: "3px 7px",
          fontSize: 9,
          letterSpacing: 1,
          cursor: "pointer",
          ...mono,
        }}
      >
        ◈ ITTRI{fullyEngagedCount > 0 ? ` [${fullyEngagedCount}]` : ""}
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 40,
        right: 20,
        width: 640,
        maxHeight: "80vh",
        overflowY: "auto",
        background: "#070b10",
        border: `1px solid ${CY}44`,
        borderRadius: 8,
        zIndex: 9500,
        padding: 16,
        ...mono,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ color: CY, fontSize: 11, letterSpacing: 1.5 }}>
          ◈ INVESTMENT × TASK × OPS EVENT — ITTRI
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={assess}
            disabled={assessing}
            style={{ background: "#0d2030", border: `1px solid ${CY}`, color: CY,
              borderRadius: 3, padding: "2px 8px", fontSize: 9, cursor: "pointer", letterSpacing: 1 }}
          >
            {assessing ? "…" : "▶ ASSESS"}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{ background: "transparent", border: "none", color: SL,
              fontSize: 14, cursor: "pointer", lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 12 }}>
        {[
          { label: "INVESTMENTS", val: investments.length, col: "#aaa" },
          { label: "TASKS",       val: tasks.length,       col: GR  },
          { label: "OPS EVENTS",  val: opsEvents.length,   col: AM  },
          { label: "FULLY ENGAGED", val: fullyEngagedCount, col: CY },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ background: "#0d1520", border: `1px solid #1e2a38`,
            borderRadius: 4, padding: "6px 8px", textAlign: "center" }}>
            <div style={{ color: col, fontSize: 14, fontWeight: 700 }}>{loading ? "…" : val}</div>
            <div style={{ color: SL, fontSize: 8, letterSpacing: 0.8, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage breakdown bar */}
      {linked.length > 0 && (
        <div style={{ display: "flex", height: 4, borderRadius: 2, overflow: "hidden", marginBottom: 12 }}>
          <div style={{ flex: fullyEngagedCount, background: CY }} />
          <div style={{ flex: taskedOnlyCount,   background: GR }} />
          <div style={{ flex: opsTriggeredCount, background: AM }} />
          <div style={{ flex: dormantCount,      background: "#222" }} />
        </div>
      )}

      {/* Secondary stats */}
      <div style={{ display: "flex", gap: 16, marginBottom: 10, fontSize: 9, color: SL }}>
        <span><span style={{ color: GR }}>{taskedOnlyCount}</span> TASKED-ONLY</span>
        <span><span style={{ color: AM }}>{opsTriggeredCount}</span> OPS-TRIGGERED</span>
        <span><span style={{ color: "#555" }}>{dormantCount}</span> DORMANT</span>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? "#0d2030" : "transparent",
              border: `1px solid ${tab === t ? CY : "#1e2a38"}`,
              color: tab === t ? CY : SL,
              borderRadius: 3,
              padding: "2px 6px",
              fontSize: 8,
              letterSpacing: 0.8,
              cursor: "pointer",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search investments…"
        style={{ width: "100%", background: "#0d1520", border: `1px solid #1e2a38`,
          color: "#ccc", borderRadius: 4, padding: "4px 8px", fontSize: 9,
          marginBottom: 10, boxSizing: "border-box", ...mono }}
      />

      {/* Assessment text */}
      {assessText && (
        <div style={{ background: "#0d1f30", border: `1px solid ${CY}44`, borderRadius: 4,
          padding: "8px 10px", fontSize: 9, color: "#ccc", marginBottom: 10, lineHeight: 1.6 }}>
          {assessText}
        </div>
      )}

      {/* Error */}
      {err && (
        <div style={{ color: RD, fontSize: 9, marginBottom: 8 }}>{err}</div>
      )}

      {/* Investment list */}
      {loading && linked.length === 0 ? (
        <div style={{ color: SL, fontSize: 9, textAlign: "center", padding: 20 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: SL, fontSize: 9, textAlign: "center", padding: 20 }}>No investments match.</div>
      ) : (
        filtered.map((inv) => {
          const isExp = expanded === inv.id;
          return (
            <div
              key={inv.id}
              style={{ marginBottom: 6, border: `1px solid #1a2538`, borderRadius: 4,
                background: "#0a0f18", overflow: "hidden" }}
            >
              {/* Row */}
              <div
                onClick={() => setExpanded(isExp ? null : inv.id)}
                style={{ display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 10px", cursor: "pointer" }}
              >
                <span style={{ color: classColor(inv._class), fontSize: 8, minWidth: 100, letterSpacing: 0.6 }}>
                  {inv._class}
                </span>
                <span style={{ color: "#ccc", fontSize: 9, flex: 1, overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {inv.name}
                  {inv.ticker && (
                    <span style={{ color: SL, marginLeft: 6, fontSize: 8 }}>[{inv.ticker}]</span>
                  )}
                </span>
                {inv.sector && (
                  <Chip label={inv.sector.slice(0, 14)} color={CY} />
                )}
                <span style={{ color: SL, fontSize: 8 }}>
                  T:{inv._tasks.length} O:{inv._ops.length}
                </span>
                <span style={{ color: SL, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {/* Expanded split pane */}
              {isExp && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr",
                  gap: 0, borderTop: "1px solid #1a2538" }}>
                  {/* Tasks pane */}
                  <div style={{ padding: "8px 10px", borderRight: "1px solid #1a2538" }}>
                    <div style={{ color: GR, fontSize: 8, letterSpacing: 1, marginBottom: 6 }}>
                      TASKS ({inv._tasks.length})
                    </div>
                    {inv._tasks.length === 0 ? (
                      <div style={{ color: "#333", fontSize: 8 }}>No task alignment</div>
                    ) : inv._tasks.map((t, idx) => (
                      <div key={idx} style={{ marginBottom: 6 }}>
                        <div style={{ color: "#ccc", fontSize: 8, marginBottom: 2,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {t.title}
                        </div>
                        <div style={{ display: "flex", gap: 4, marginBottom: 2 }}>
                          <Chip label={t.status.slice(0, 10)} color={GR} />
                          {t.priority && <Chip label={t.priority.slice(0, 8)} color={priColor(t.priority)} />}
                        </div>
                        <ScoreBar sc={t.sc} color={GR} />
                      </div>
                    ))}
                  </div>

                  {/* Ops Events pane */}
                  <div style={{ padding: "8px 10px" }}>
                    <div style={{ color: AM, fontSize: 8, letterSpacing: 1, marginBottom: 6 }}>
                      OPS EVENTS ({inv._ops.length})
                    </div>
                    {inv._ops.length === 0 ? (
                      <div style={{ color: "#333", fontSize: 8 }}>No ops event alignment</div>
                    ) : inv._ops.map((e, idx) => (
                      <div key={idx} style={{ marginBottom: 6 }}>
                        <div style={{ color: "#ccc", fontSize: 8, marginBottom: 2,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {e.name}
                        </div>
                        <div style={{ display: "flex", gap: 4, marginBottom: 2 }}>
                          <Chip label={e.severity.slice(0, 10)} color={sevColor(e.severity)} />
                          {e.type && <Chip label={e.type.slice(0, 10)} color={SL} />}
                        </div>
                        <ScoreBar sc={e.sc} color={AM} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Footer */}
      <div style={{ marginTop: 10, color: "#1e2a38", fontSize: 8, textAlign: "right" }}>
        90-s refresh · /entities/Investment × /entities/Task × /v1/ops/events
      </div>
    </div>
  );
}
