/**
 * TaskScenarioCoverage — F61
 * ◈ TSCOV button (left:2300, bottom:18, zIndex:69)
 * parallel-fetches /entities/Task + /v1/scenario/list
 * keyword-correlates task names/descriptions against scenario names/descriptions
 * classifies SCENARIO_BACKED (≥1 match) vs UNPLANNED (no playbook coverage)
 * amber badge on unplanned count; filter tabs ALL/SCENARIO_BACKED/UNPLANNED
 * expand task → matched scenario cards with relevance bar
 * ▶ ASSESS COVERAGE → /v1/jarvis/agent/chat 2-sentence coverage brief + TTS
 * voice trigger: "tscov/task scenario/unplanned tasks/task coverage/playbook coverage/task playbook"
 * jarvis:tscov-toggle event; 90-s auto-refresh
 */
import { useEffect, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const AM = "#F59E0B";
const GR = "#10B981";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const TSCOV_RE =
  /\btscov\b|\btask.scenario\b|\bunplanned.task|\bscenario.coverage\b|\btask.playbook\b|\bplaybook.coverage\b|\btask.cover|\bcover.task/i;

export function isTscovQuery(text) {
  return TSCOV_RE.test(text || "");
}

function tokenise(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function relevance(taskTokens, scenario) {
  const haystack = tokenise(
    `${scenario.name || ""} ${scenario.description || ""} ${scenario.objective || ""}`
  );
  let hits = 0;
  for (const t of taskTokens) if (haystack.includes(t)) hits++;
  return haystack.length ? Math.min(1, hits / Math.max(1, taskTokens.length)) : 0;
}

async function fetchData(base, headers) {
  const [tr, sr] = await Promise.allSettled([
    fetch(`${base}/entities/Task`, { headers }).then((r) => (r.ok ? r.json() : [])),
    fetch(`${base}/v1/scenario/list`, { headers }).then((r) => (r.ok ? r.json() : [])),
  ]);
  const tasks = Array.isArray(tr.value) ? tr.value : tr.value?.items || [];
  const scenarios = Array.isArray(sr.value) ? sr.value : sr.value?.scenarios || sr.value?.items || [];
  return { tasks, scenarios };
}

export async function buildTscovScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const { tasks, scenarios } = await fetchData(base, headers);
  let backed = 0;
  for (const task of tasks) {
    const tt = tokenise(`${task.title || task.name || ""} ${task.description || ""}`);
    if (scenarios.some((s) => relevance(tt, s) >= 0.1)) backed++;
  }
  const unplanned = tasks.length - backed;
  return `Task scenario coverage analysis complete, sir. ${backed} of ${tasks.length} tasks have matching scenario playbooks. ${unplanned > 0 ? `${unplanned} tasks remain unplanned — I recommend reviewing those for playbook gaps.` : "All tasks are scenario-backed. Operational coverage looks strong."}`;
}

export default function TaskScenarioCoverage() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState("");

  async function refresh() {
    setLoading(true);
    const base = apiBase();
    const headers = { Authorization: `Bearer ${API_KEY}` };
    try {
      const { tasks, scenarios: sc } = await fetchData(base, headers);
      setScenarios(sc);
      const enriched = tasks.map((task) => {
        const tt = tokenise(`${task.title || task.name || ""} ${task.description || ""}`);
        const matches = sc
          .map((s) => ({ ...s, score: relevance(tt, s) }))
          .filter((s) => s.score >= 0.1)
          .sort((a, b) => b.score - a.score);
        return {
          ...task,
          _label: task.title || task.name || task.id || "—",
          _backed: matches.length > 0,
          _matches: matches,
        };
      });
      setRows(enriched);
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    if (open) refresh();
    const id = setInterval(() => { if (open) refresh(); }, 90_000);
    return () => clearInterval(id);
  }, [open]);

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:tscov-toggle", toggle);
    return () => window.removeEventListener("jarvis:tscov-toggle", toggle);
  }, []);

  async function assess() {
    setAssessing(true);
    setBrief("");
    const base = apiBase();
    const headers = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
    const backed = rows.filter((r) => r._backed).length;
    const unplanned = rows.length - backed;
    try {
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: `Task-to-scenario coverage: ${backed}/${rows.length} tasks are scenario-backed, ${unplanned} unplanned. Provide a 2-sentence operational coverage brief and top recommendation.`,
        }),
      });
      const d = await r.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setBrief("Assessment unavailable — agent offline.");
    }
    setAssessing(false);
  }

  const filtered = rows.filter((r) => {
    if (tab === "SCENARIO_BACKED" && !r._backed) return false;
    if (tab === "UNPLANNED" && r._backed) return false;
    if (search && !r._label.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const backedCount = rows.filter((r) => r._backed).length;
  const unplanned = rows.length - backedCount;

  const pill = (label, active) => ({
    padding: "3px 10px", borderRadius: 10, fontSize: 10, letterSpacing: 1,
    cursor: "pointer", fontFamily: "inherit",
    background: active ? `${CY}22` : "transparent",
    color: active ? CY : "#4E6070",
    border: `1px solid ${active ? CY + "55" : "#1E2D3D"}`,
  });

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      style={{
        position: "fixed", left: 2300, bottom: 18, zIndex: 69,
        background: "rgba(5,10,18,0.82)", border: `1px solid ${unplanned > 0 ? AM : CY}44`,
        borderRadius: 8, padding: "4px 10px", cursor: "pointer",
        color: unplanned > 0 ? AM : CY, fontSize: 10, letterSpacing: 1,
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      ◈ TSCOV{unplanned > 0 && rows.length > 0 ? ` (${unplanned})` : ""}
    </button>
  );

  return (
    <div style={{
      position: "fixed", bottom: 60, left: "50%", transform: "translateX(-50%)",
      width: "min(700px, 94vw)", zIndex: 300,
      background: "rgba(5,10,18,0.97)", border: `1px solid ${CY}33`,
      borderRadius: 14, fontFamily: "'JetBrains Mono', monospace",
      boxShadow: `0 0 60px ${CY}14, 0 24px 48px rgba(0,0,0,0.8)`,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${CY}22`, gap: 10 }}>
        <span style={{ color: CY, fontSize: 12, letterSpacing: 2, flex: 1 }}>◈ TASK × SCENARIO COVERAGE</span>
        <span style={{ fontSize: 10, color: "#4E6070" }}>{rows.length} tasks · {scenarios.length} scenarios</span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#4E6070", cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 10, padding: "10px 16px" }}>
        {[
          { label: "TASKS", val: rows.length, col: CY },
          { label: "SCENARIOS", val: scenarios.length, col: "#A78BFA" },
          { label: "BACKED", val: backedCount, col: GR },
          { label: "UNPLANNED", val: unplanned, col: unplanned > 0 ? AM : "#4E6070" },
        ].map((t) => (
          <div key={t.label} style={{
            flex: 1, background: "rgba(41,231,255,0.04)", border: `1px solid ${t.col}22`,
            borderRadius: 8, padding: "8px 10px", textAlign: "center",
          }}>
            <div style={{ fontSize: 16, color: t.col, fontWeight: 700 }}>{loading ? "…" : t.val}</div>
            <div style={{ fontSize: 9, color: "#4E6070", letterSpacing: 1, marginTop: 2 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, padding: "0 16px 10px", flexWrap: "wrap" }}>
        {["ALL", "SCENARIO_BACKED", "UNPLANNED"].map((t) => (
          <button key={t} onClick={() => setTab(t)} style={pill(t, tab === t)}>{t.replace("_", " ")}</button>
        ))}
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="search tasks…"
          style={{
            marginLeft: "auto", background: "transparent", border: `1px solid ${CY}22`,
            borderRadius: 6, padding: "3px 8px", color: "#DCEBF5", fontSize: 10,
            outline: "none", fontFamily: "inherit",
          }}
        />
      </div>

      {/* List */}
      <div style={{ maxHeight: "38vh", overflowY: "auto", padding: "0 16px 10px" }}>
        {loading && <div style={{ color: "#4E6070", fontSize: 11, textAlign: "center", padding: 16 }}>Loading…</div>}
        {!loading && filtered.length === 0 && <div style={{ color: "#4E6070", fontSize: 11, textAlign: "center", padding: 16 }}>No tasks found</div>}
        {!loading && filtered.map((row) => (
          <div key={row.id || row._label} style={{ marginBottom: 6 }}>
            <div
              onClick={() => setExpanded(expanded === row.id ? null : row.id)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "7px 10px", borderRadius: 8, cursor: "pointer",
                background: expanded === row.id ? `${CY}0A` : "rgba(255,255,255,0.02)",
                border: `1px solid ${row._backed ? GR + "33" : AM + "33"}`,
              }}
            >
              <span style={{ fontSize: 10, color: row._backed ? GR : AM, width: 80, flexShrink: 0 }}>
                {row._backed ? "◉ BACKED" : "◌ UNPLANNED"}
              </span>
              <span style={{ fontSize: 11, color: "#DCEBF5", flex: 1 }}>{row._label}</span>
              <span style={{ fontSize: 9, color: "#4E6070" }}>{row._matches.length} match{row._matches.length !== 1 ? "es" : ""}</span>
              <span style={{ color: "#4E6070", fontSize: 10 }}>{expanded === row.id ? "▲" : "▼"}</span>
            </div>
            {expanded === row.id && row._matches.length > 0 && (
              <div style={{ marginTop: 4, paddingLeft: 10 }}>
                {row._matches.slice(0, 4).map((s) => (
                  <div key={s.id || s.name} style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "4px 8px",
                    borderLeft: `2px solid ${CY}33`, marginBottom: 3,
                  }}>
                    <span style={{ fontSize: 10, color: "#7A95AB", flex: 1 }}>{s.name || s.title || s.id}</span>
                    <div style={{ width: 80, height: 4, background: "#1E2D3D", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${Math.round(s.score * 100)}%`, height: "100%", background: CY, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 9, color: "#4E6070", width: 28, textAlign: "right" }}>{Math.round(s.score * 100)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Brief */}
      {brief && (
        <div style={{ margin: "0 16px 10px", padding: "8px 12px", background: `${CY}0A`, borderRadius: 8, border: `1px solid ${CY}22`, fontSize: 10, color: "#DCEBF5", lineHeight: 1.6 }}>
          {brief}
        </div>
      )}

      {/* Footer */}
      <div style={{ padding: "8px 16px", borderTop: `1px solid ${CY}1A`, display: "flex", gap: 8, alignItems: "center" }}>
        <button
          onClick={assess}
          disabled={assessing || rows.length === 0}
          style={{
            background: assessing ? "transparent" : `${CY}18`, border: `1px solid ${CY}44`,
            borderRadius: 6, padding: "4px 12px", color: CY, fontSize: 10,
            cursor: assessing ? "default" : "pointer", letterSpacing: 1, fontFamily: "inherit",
          }}
        >
          {assessing ? "▸ ASSESSING…" : "▶ ASSESS COVERAGE"}
        </button>
        <button onClick={refresh} style={{ background: "none", border: `1px solid ${CY}22`, borderRadius: 6, padding: "4px 10px", color: "#4E6070", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>↺ REFRESH</button>
        <span style={{ marginLeft: "auto", fontSize: 9, color: "#2E4050" }}>auto-refresh 90 s · /entities/Task × /v1/scenario/list</span>
      </div>
    </div>
  );
}
