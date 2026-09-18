/**
 * F169 — Knowledge × Scenario × Task — Operational Knowledge Gap (ORKG)
 *
 * Parallel-fetches /knowledge/ + /v1/scenario/list + /entities/Task every 90 s.
 * Keyword-correlates each knowledge article against active scenarios AND open tasks
 * to surface:
 *   FULLY_APPLIED   — article backs ≥1 scenario AND ≥1 task  (intelligence in use)
 *   SCENARIO_BACKED — article backs ≥1 scenario, no task     (strategic, not tactical)
 *   TASK_BACKED     — article backs ≥1 task, no scenario      (tactical, not strategic)
 *   ORPHAN          — no scenario or task linkage             (dark intelligence — waste)
 *
 * Stat tiles: articles / scenarios / tasks / fully applied / orphan
 * Filter tabs: ALL | FULLY_APPLIED | SCENARIO_BACKED | TASK_BACKED | ORPHAN
 * Text search on article title.
 * Expand row → matched scenarios (amber bars) + matched tasks (cyan bars) with scores.
 * Red badge + pulse on ORPHAN count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence knowledge readiness brief + TTS.
 *
 * Toggle:  ◈ ORKG  at bottom:8 left:964780, zIndex:666.
 * Event:   jarvis:orkg-toggle
 * Voice:   "orkg / knowledge gap / orphan knowledge / operational knowledge /
 *           knowledge readiness / knowledge scenario / knowledge task /
 *           dark knowledge / unlinked knowledge / knowledge coverage"
 * Refresh: 90 s auto-poll.
 */
import { useEffect, useRef, useState } from "react";

const BTN_LEFT = 964_780;
const POLL_MS  = 90_000;

const API_KEY =
  (typeof window !== "undefined" && window.__JARVIS_API_KEY__) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function apiBase() {
  if (typeof window !== "undefined" && window.__JARVIS_API_BASE__) return window.__JARVIS_API_BASE__;
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    return `${window.location.protocol}//${window.location.hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── Exported intent helpers ────────────────────────────────────────────────────

const ORKG_RE =
  /\b(orkg|knowledge\s+gap|orphan\s+knowledge|operational\s+knowledge|knowledge\s+readiness|knowledge\s+scenario|knowledge\s+task|dark\s+knowledge|unlinked\s+knowledge|knowledge\s+coverage|knowledge\s+operational|orphaned\s+intel|unlinked\s+articles?)\b/i;

export function isOrkgQuery(q) { return ORKG_RE.test(q || ""); }

export async function buildOrkgScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [kbRes, scRes, tkRes] = await Promise.all([
      fetch(`${base}/knowledge/`,        { headers: hdr }),
      fetch(`${base}/v1/scenario/list`,  { headers: hdr }),
      fetch(`${base}/entities/Task`,     { headers: hdr }),
    ]);
    const articles  = normaliseKb(await kbRes.json());
    const scenarios = normArr(await scRes.json(), ["scenarios", "data", "items", "results"]);
    const tasks     = normArr(await tkRes.json(), ["tasks", "data", "items", "results"]);

    const rows     = classify(articles, scenarios, tasks);
    const orphans  = rows.filter((r) => r.cls === "ORPHAN").length;
    const applied  = rows.filter((r) => r.cls === "FULLY_APPLIED").length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS operational knowledge gap analysis (ORKG): ${articles.length} knowledge articles ` +
          `cross-referenced against ${scenarios.length} scenarios and ${tasks.length} tasks — ` +
          `${applied} fully applied (scenario + task), ${orphans} orphaned (no operational linkage found). ` +
          `Give a 2-sentence knowledge readiness brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    window.dispatchEvent(new CustomEvent("jarvis:orkg-toggle"));
    return (d.answer || "Operational knowledge gap analysis complete, sir.").trim();
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:orkg-toggle"));
    return "Operational knowledge gap analysis unavailable at this time, sir.";
  }
}

// ── Normalisers ────────────────────────────────────────────────────────────────

function normaliseKb(raw) {
  const arr = normArr(raw, ["articles", "knowledge", "docs", "documents", "data", "items", "results"]);
  return arr.map((a, i) => ({
    id:      a.id || a._id || a.slug || String(i),
    title:   a.title || a.name || a.label || a.subject || `Article ${i + 1}`,
    content: a.content || a.summary || a.body || a.description || "",
    tags:    Array.isArray(a.tags) ? a.tags : [],
    updated: a.updated_at || a.updatedAt || a.date || "",
    extra:   a,
  }));
}

function normArr(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    for (const k of keys) {
      if (Array.isArray(raw[k])) return raw[k];
    }
    for (const v of Object.values(raw)) {
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

function kw(obj) {
  return JSON.stringify(obj)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function score(articleKws, other) {
  const otherKws = new Set(kw(other));
  return articleKws.filter((w) => otherKws.has(w)).length;
}

function classify(articles, scenarios, tasks) {
  return articles.map((a) => {
    const aKws = kw(a);
    const matchedScenarios = scenarios
      .map((s) => ({ ...s, score: score(aKws, s) }))
      .filter((s) => s.score >= 2)
      .sort((x, y) => y.score - x.score)
      .slice(0, 5);
    const matchedTasks = tasks
      .map((t) => ({ ...t, score: score(aKws, t) }))
      .filter((t) => t.score >= 2)
      .sort((x, y) => y.score - x.score)
      .slice(0, 5);

    const hasScenario = matchedScenarios.length > 0;
    const hasTask     = matchedTasks.length > 0;
    const cls =
      hasScenario && hasTask ? "FULLY_APPLIED" :
      hasScenario             ? "SCENARIO_BACKED" :
      hasTask                 ? "TASK_BACKED" :
                                "ORPHAN";

    return { ...a, cls, matchedScenarios, matchedTasks };
  });
}

// ── Colour map ─────────────────────────────────────────────────────────────────

const CLS_COLOR = {
  FULLY_APPLIED:   "#22D3EE",
  SCENARIO_BACKED: "#F59E0B",
  TASK_BACKED:     "#8B5CF6",
  ORPHAN:          "#EF4444",
};
const CLS_LABEL = {
  FULLY_APPLIED:   "FULLY APPLIED",
  SCENARIO_BACKED: "SCENARIO BACKED",
  TASK_BACKED:     "TASK BACKED",
  ORPHAN:          "ORPHAN",
};

const TABS = ["ALL", "FULLY_APPLIED", "SCENARIO_BACKED", "TASK_BACKED", "ORPHAN"];

// ── Main component ─────────────────────────────────────────────────────────────

export default function KnowledgeScenarioTaskGap() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [tasks, setTasks]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab]         = useState("ALL");
  const [search, setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [kbRes, scRes, tkRes] = await Promise.all([
        fetch(`${base}/knowledge/`,        { headers: hdr }),
        fetch(`${base}/v1/scenario/list`,  { headers: hdr }),
        fetch(`${base}/entities/Task`,     { headers: hdr }),
      ]);
      const articles  = normaliseKb(await kbRes.json());
      const scArr     = normArr(await scRes.json(), ["scenarios", "data", "items", "results"]);
      const tkArr     = normArr(await tkRes.json(), ["tasks", "data", "items", "results"]);
      setScenarios(scArr);
      setTasks(tkArr);
      setRows(classify(articles, scArr, tkArr));
    } catch {
      /* network unavailable — leave previous data */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:orkg-toggle", toggle);
    return () => window.removeEventListener("jarvis:orkg-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open]);

  const orphanCount  = rows.filter((r) => r.cls === "ORPHAN").length;
  const appliedCount = rows.filter((r) => r.cls === "FULLY_APPLIED").length;
  const scBackCount  = rows.filter((r) => r.cls === "SCENARIO_BACKED").length;
  const tkBackCount  = rows.filter((r) => r.cls === "TASK_BACKED").length;

  const visible = rows.filter((r) => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (search && !r.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment("");
    try {
      const base = apiBase();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message:
            `JARVIS operational knowledge gap (ORKG): ${rows.length} articles — ` +
            `${appliedCount} fully applied, ${scBackCount} scenario-backed, ` +
            `${tkBackCount} task-backed, ${orphanCount} orphaned. ` +
            `Give a 2-sentence intelligence coverage brief — formal British butler tone, first person.`,
        }),
      });
      const d = await r.json();
      const txt = (d.answer || "").trim();
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setAssessment("Assessment unavailable, sir.");
    } finally {
      setAssessing(false);
    }
  };

  return (
    <>
      {/* ◈ ORKG toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 666,
          background: open ? "#22D3EE22" : "#0B142088",
          border: `1px solid ${open ? "#22D3EE" : "#334155"}`,
          color: open ? "#22D3EE" : "#64748B",
          fontSize: 9,
          fontFamily: "monospace",
          padding: "3px 7px",
          borderRadius: 4,
          cursor: "pointer",
          letterSpacing: 1,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
        title="Knowledge × Scenario × Task — Operational Knowledge Gap"
      >
        {orphanCount > 0 && (
          <span style={{
            background: "#EF4444",
            color: "#fff",
            borderRadius: "50%",
            fontSize: 8,
            fontWeight: 700,
            minWidth: 14,
            height: 14,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            animation: "pulse 1.5s infinite",
          }}>
            {orphanCount}
          </span>
        )}
        ◈ ORKG
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          zIndex: 8000,
          width: 780,
          maxHeight: "82vh",
          overflowY: "auto",
          background: "linear-gradient(135deg,#060D1A 0%,#0A1628 100%)",
          border: "1px solid #22D3EE44",
          borderRadius: 12,
          boxShadow: "0 0 60px #22D3EE22",
          fontFamily: "monospace",
          color: "#CBD5E1",
        }}>
          {/* Header */}
          <div style={{
            padding: "16px 20px 12px",
            borderBottom: "1px solid #1E3050",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <div>
              <span style={{ color: "#22D3EE", fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>
                ◈ OPERATIONAL KNOWLEDGE GAP
              </span>
              <span style={{ color: "#475569", fontSize: 10, marginLeft: 10 }}>
                Knowledge × Scenario × Task
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "#64748B", fontSize: 18, cursor: "pointer" }}
            >
              ×
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "12px 20px" }}>
            {[
              { label: "ARTICLES",  val: rows.length,   col: "#22D3EE" },
              { label: "SCENARIOS", val: scenarios.length, col: "#F59E0B" },
              { label: "TASKS",     val: tasks.length,  col: "#8B5CF6" },
              { label: "APPLIED",   val: appliedCount,  col: "#10B981" },
              { label: "ORPHAN",    val: orphanCount,   col: "#EF4444" },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                flex: 1,
                background: "#0D1F35",
                border: `1px solid ${col}44`,
                borderRadius: 8,
                padding: "8px 10px",
                textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{val}</div>
                <div style={{ color: "#475569", fontSize: 8, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "0 20px 8px" }}>
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? "#22D3EE22" : "transparent",
                  border: `1px solid ${tab === t ? "#22D3EE" : "#1E3050"}`,
                  color: tab === t ? "#22D3EE" : "#475569",
                  fontSize: 8,
                  fontFamily: "monospace",
                  padding: "3px 8px",
                  borderRadius: 4,
                  cursor: "pointer",
                  letterSpacing: 1,
                }}
              >
                {t === "ALL" ? "ALL" : CLS_LABEL[t] || t}
              </button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "0 20px 10px" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search articles…"
              style={{
                width: "100%",
                background: "#0D1F35",
                border: "1px solid #1E3050",
                borderRadius: 6,
                padding: "5px 10px",
                color: "#CBD5E1",
                fontSize: 11,
                fontFamily: "monospace",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Loading */}
          {loading && rows.length === 0 && (
            <div style={{ padding: "20px", textAlign: "center", color: "#475569", fontSize: 11 }}>
              Loading knowledge corpus…
            </div>
          )}

          {/* Rows */}
          <div style={{ padding: "0 20px 8px" }}>
            {visible.slice(0, 80).map((row) => {
              const col   = CLS_COLOR[row.cls];
              const isExp = expanded === row.id;
              return (
                <div key={row.id} style={{ marginBottom: 4 }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : row.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "7px 10px",
                      background: "#0D1F3580",
                      border: `1px solid ${isExp ? col : "#1E3050"}`,
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    <span style={{
                      fontSize: 8,
                      fontWeight: 700,
                      color: col,
                      background: `${col}22`,
                      border: `1px solid ${col}44`,
                      borderRadius: 3,
                      padding: "1px 5px",
                      whiteSpace: "nowrap",
                      minWidth: 90,
                      textAlign: "center",
                    }}>
                      {CLS_LABEL[row.cls]}
                    </span>
                    <span style={{ flex: 1, fontSize: 11, color: "#CBD5E1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.title}
                    </span>
                    {row.updated && (
                      <span style={{ fontSize: 8, color: "#475569", whiteSpace: "nowrap" }}>
                        {row.updated.slice(0, 10)}
                      </span>
                    )}
                    <span style={{ fontSize: 9, color: "#475569" }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {/* Expanded detail */}
                  {isExp && (
                    <div style={{
                      background: "#06101E",
                      border: `1px solid ${col}44`,
                      borderTop: "none",
                      borderRadius: "0 0 6px 6px",
                      padding: "10px 12px",
                      display: "flex",
                      gap: 16,
                    }}>
                      {/* Matched scenarios */}
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "#F59E0B", fontSize: 9, marginBottom: 6, letterSpacing: 1 }}>
                          ▸ MATCHED SCENARIOS ({row.matchedScenarios.length})
                        </div>
                        {row.matchedScenarios.length === 0 ? (
                          <div style={{ color: "#334155", fontSize: 10 }}>None</div>
                        ) : row.matchedScenarios.map((s, i) => (
                          <div key={i} style={{ marginBottom: 4 }}>
                            <div style={{ fontSize: 10, color: "#CBD5E1", marginBottom: 2 }}>
                              {s.title || s.name || s.label || `Scenario ${i + 1}`}
                            </div>
                            <div style={{ background: "#1E3050", borderRadius: 3, height: 4, overflow: "hidden" }}>
                              <div style={{
                                width: `${Math.min(100, (s.score / 10) * 100)}%`,
                                background: "#F59E0B",
                                height: "100%",
                              }} />
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Matched tasks */}
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "#22D3EE", fontSize: 9, marginBottom: 6, letterSpacing: 1 }}>
                          ▸ MATCHED TASKS ({row.matchedTasks.length})
                        </div>
                        {row.matchedTasks.length === 0 ? (
                          <div style={{ color: "#334155", fontSize: 10 }}>None</div>
                        ) : row.matchedTasks.map((t, i) => (
                          <div key={i} style={{ marginBottom: 4 }}>
                            <div style={{ fontSize: 10, color: "#CBD5E1", marginBottom: 2 }}>
                              {t.title || t.name || t.label || `Task ${i + 1}`}
                            </div>
                            <div style={{ background: "#1E3050", borderRadius: 3, height: 4, overflow: "hidden" }}>
                              <div style={{
                                width: `${Math.min(100, (t.score / 10) * 100)}%`,
                                background: "#22D3EE",
                                height: "100%",
                              }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {visible.length === 0 && !loading && (
              <div style={{ color: "#475569", fontSize: 11, textAlign: "center", padding: 20 }}>
                No articles match the current filter.
              </div>
            )}
          </div>

          {/* Assess + result */}
          <div style={{ padding: "8px 20px 16px", borderTop: "1px solid #1E3050" }}>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? "#1E3050" : "#22D3EE22",
                border: "1px solid #22D3EE55",
                color: assessing ? "#475569" : "#22D3EE",
                fontSize: 10,
                fontFamily: "monospace",
                padding: "5px 14px",
                borderRadius: 5,
                cursor: assessing ? "not-allowed" : "pointer",
                letterSpacing: 1,
              }}
            >
              {assessing ? "ASSESSING…" : "▶ ASSESS"}
            </button>
            {assessment && (
              <div style={{
                marginTop: 8,
                padding: "8px 10px",
                background: "#0D1F35",
                border: "1px solid #22D3EE33",
                borderRadius: 6,
                color: "#CBD5E1",
                fontSize: 11,
                lineHeight: 1.5,
              }}>
                {assessment}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
