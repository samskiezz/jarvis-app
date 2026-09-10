import { useState, useEffect, useCallback } from "react";

const API = "";

export function isTsknowQuery(q) {
  const t = q.toLowerCase();
  return (
    t.includes("tsknow") ||
    t.includes("task scenario knowledge") ||
    t.includes("scenario knowledge task") ||
    t.includes("knowledge task scenario") ||
    t.includes("fully grounded task") ||
    t.includes("grounded mission") ||
    t.includes("task triple nexus") ||
    t.includes("mission knowledge scenario") ||
    t.includes("task playbook coverage") ||
    t.includes("task scenario coverage")
  );
}

export async function buildTsknowScript() {
  try {
    const [tRes, sRes, kRes] = await Promise.all([
      fetch(`${API}/entities/Task`),
      fetch(`${API}/v1/scenario/list`),
      fetch(`${API}/knowledge/`),
    ]);
    const tasks = tRes.ok ? await tRes.json() : [];
    const scenarios = sRes.ok ? await sRes.json() : [];
    const knowledge = kRes.ok ? await kRes.json() : [];

    const tList = Array.isArray(tasks) ? tasks : tasks.items ?? tasks.data ?? [];
    const sList = Array.isArray(scenarios) ? scenarios : scenarios.items ?? scenarios.data ?? [];
    const kList = Array.isArray(knowledge) ? knowledge : knowledge.items ?? knowledge.data ?? [];

    let fullyGrounded = 0, scenarioOnly = 0, knowledgeOnly = 0, dark = 0;
    tList.forEach((t) => {
      const name = (t.title || t.name || t.id || "").toLowerCase();
      const token = name.split(" ")[0];
      if (token.length < 3) { dark++; return; }
      const hasS = sList.some((s) => (s.name || s.title || s.description || "").toLowerCase().includes(token));
      const hasK = kList.some((k) => (k.title || k.content || "").toLowerCase().includes(token));
      if (hasS && hasK) fullyGrounded++;
      else if (hasS) scenarioOnly++;
      else if (hasK) knowledgeOnly++;
      else dark++;
    });

    const total = tList.length;
    const pct = total ? ((fullyGrounded / total) * 100).toFixed(1) : "0.0";
    return `TSKNOW Task × Scenario × Knowledge Triple Nexus: ${total} tasks | ${sList.length} scenarios | ${kList.length} articles | ${fullyGrounded} fully grounded (${pct}%) | ${scenarioOnly} scenario-only | ${knowledgeOnly} knowledge-only | ${dark} dark tasks with no coverage.`;
  } catch (e) {
    return `TSKNOW: fetch error — ${e.message}`;
  }
}

function classify(task, sList, kList) {
  const name = (task.title || task.name || task.id || "").toLowerCase();
  const token = name.split(" ")[0];
  if (token.length < 3) return { type: "DARK", sMatches: [], kMatches: [] };
  const sMatches = sList.filter((s) => (s.name || s.title || s.description || "").toLowerCase().includes(token));
  const kMatches = kList.filter((k) => (k.title || k.content || "").toLowerCase().includes(token));
  const hasS = sMatches.length > 0;
  const hasK = kMatches.length > 0;
  if (hasS && hasK) return { type: "FULLY_GROUNDED", sMatches, kMatches };
  if (hasS) return { type: "SCENARIO_ONLY", sMatches, kMatches };
  if (hasK) return { type: "KNOWLEDGE_ONLY", sMatches, kMatches };
  return { type: "DARK", sMatches, kMatches };
}

const TYPE_COLOR = {
  FULLY_GROUNDED: "#00ff88",
  SCENARIO_ONLY: "#a78bfa",
  KNOWLEDGE_ONLY: "#38bdf8",
  DARK: "#64748b",
};

export default function TaskScenarioKnowledgeTriple() {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [knowledge, setKnowledge] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [tRes, sRes, kRes] = await Promise.all([
        fetch(`${API}/entities/Task`),
        fetch(`${API}/v1/scenario/list`),
        fetch(`${API}/knowledge/`),
      ]);
      const tj = tRes.ok ? await tRes.json() : [];
      const sj = sRes.ok ? await sRes.json() : [];
      const kj = kRes.ok ? await kRes.json() : [];
      setTasks(Array.isArray(tj) ? tj : tj.items ?? tj.data ?? []);
      setScenarios(Array.isArray(sj) ? sj : sj.items ?? sj.data ?? []);
      setKnowledge(Array.isArray(kj) ? kj : kj.items ?? kj.data ?? []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 90000);
    return () => clearInterval(id);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    window.addEventListener("jarvis:tsknow-toggle", handler);
    return () => window.removeEventListener("jarvis:tsknow-toggle", handler);
  }, []);

  const classified = tasks.map((t) => ({ ...t, ...classify(t, scenarios, knowledge) }));

  const fullyGrounded = classified.filter((t) => t.type === "FULLY_GROUNDED").length;
  const scenarioOnly = classified.filter((t) => t.type === "SCENARIO_ONLY").length;
  const knowledgeOnly = classified.filter((t) => t.type === "KNOWLEDGE_ONLY").length;
  const dark = classified.filter((t) => t.type === "DARK").length;
  const pct = tasks.length ? ((fullyGrounded / tasks.length) * 100).toFixed(1) : "0.0";

  const visible = classified.filter((t) => {
    if (filter !== "ALL" && t.type !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (t.title || t.name || t.id || "").toLowerCase().includes(s);
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    try {
      const brief = await buildTsknowScript();
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `TSKNOW assessment: ${brief}. Identify dark tasks with no scenario or knowledge grounding and propose 2 remediation actions.` }),
      });
      const data = res.ok ? await res.json() : {};
      const text = data.response || data.message || brief;
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      // silent
    } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Task × Scenario × Knowledge Triple Nexus (TSKNOW)"
        style={{
          position: "fixed",
          left: 892640,
          bottom: 8,
          zIndex: 252,
          background: "#0f172a",
          border: "1px solid #334155",
          color: "#94a3b8",
          fontSize: 10,
          padding: "3px 7px",
          borderRadius: 4,
          cursor: "pointer",
          letterSpacing: "0.05em",
          fontFamily: "monospace",
        }}
      >
        ◈ TSKNOW
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 60,
        right: 20,
        width: 520,
        maxHeight: "82vh",
        overflowY: "auto",
        background: "#0a0f1e",
        border: "1px solid #166534",
        borderRadius: 8,
        zIndex: 2520,
        fontFamily: "monospace",
        color: "#e2e8f0",
        boxShadow: "0 0 40px #16653455",
      }}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #14532d", background: "#052e16" }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: "#4ade80", letterSpacing: "0.08em" }}>◈ TSKNOW — Task × Scenario × Knowledge</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={load} disabled={loading} style={{ background: "none", border: "1px solid #334155", color: "#94a3b8", fontSize: 10, padding: "2px 8px", borderRadius: 3, cursor: "pointer" }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#64748b", fontSize: 14, cursor: "pointer" }}>✕</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6, padding: "10px 14px" }}>
        {[
          { label: "Tasks", val: tasks.length, color: "#4ade80" },
          { label: "Fully Grounded", val: fullyGrounded, color: "#00ff88" },
          { label: "Scenario Only", val: scenarioOnly, color: "#a78bfa" },
          { label: "Knowledge Only", val: knowledgeOnly, color: "#38bdf8" },
          { label: "Coverage %", val: `${pct}%`, color: dark > 0 ? "#f59e0b" : "#00ff88" },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: "#0f172a", border: "1px solid #14532d", borderRadius: 5, padding: "6px 4px", textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 9, color: "#64748b", marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* dark badge */}
      {dark > 0 && (
        <div style={{ margin: "0 14px 8px", background: "#1c1917", border: "1px solid #78716c", borderRadius: 4, padding: "5px 10px", fontSize: 11, color: "#a8a29e" }}>
          ⬛ {dark} dark tasks — no scenario or knowledge cross-reference found
        </div>
      )}

      {err && <div style={{ margin: "0 14px 8px", color: "#f87171", fontSize: 11 }}>Error: {err}</div>}
      {loading && <div style={{ margin: "0 14px 8px", color: "#4ade80", fontSize: 11 }}>Loading…</div>}

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 14px 8px", flexWrap: "wrap" }}>
        {["ALL", "FULLY_GROUNDED", "SCENARIO_ONLY", "KNOWLEDGE_ONLY", "DARK"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? "#14532d" : "#0f172a",
              border: `1px solid ${filter === f ? "#22c55e" : "#334155"}`,
              color: filter === f ? "#86efac" : "#64748b",
              fontSize: 10,
              padding: "3px 9px",
              borderRadius: 3,
              cursor: "pointer",
            }}
          >
            {f}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search tasks…"
          style={{ flex: 1, minWidth: 100, background: "#0f172a", border: "1px solid #334155", color: "#e2e8f0", fontSize: 10, padding: "3px 8px", borderRadius: 3, outline: "none" }}
        />
      </div>

      {/* task list */}
      <div style={{ padding: "0 14px 14px" }}>
        {visible.slice(0, 80).map((t, i) => {
          const id = t.id || t.title || i;
          const isExp = expanded === id;
          return (
            <div
              key={id}
              onClick={() => setExpanded(isExp ? null : id)}
              style={{ cursor: "pointer", padding: "6px 8px", marginBottom: 4, background: "#0f172a", border: "1px solid #14532d", borderRadius: 4 }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, color: "#e2e8f0" }}>{t.title || t.name || t.id || `Task ${i + 1}`}</span>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  {t.status && <span style={{ fontSize: 9, color: "#94a3b8", background: "#0a0f1e", padding: "1px 5px", borderRadius: 3, border: "1px solid #334155" }}>{t.status}</span>}
                  <span style={{ fontSize: 10, fontWeight: 700, color: TYPE_COLOR[t.type] ?? "#94a3b8", background: "#0a0f1e", padding: "1px 6px", borderRadius: 3, border: `1px solid ${TYPE_COLOR[t.type] ?? "#334155"}` }}>{t.type}</span>
                </div>
              </div>
              {isExp && (
                <div style={{ marginTop: 8 }}>
                  {t.sMatches?.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 10, color: "#a78bfa", marginBottom: 3 }}>Scenarios ({t.sMatches.length})</div>
                      {t.sMatches.slice(0, 5).map((s, si) => (
                        <div key={si} style={{ fontSize: 10, color: "#94a3b8", padding: "2px 6px", background: "#1a0a28", borderRadius: 3, marginBottom: 2 }}>
                          <span style={{ fontSize: 9, color: "#a78bfa", border: "1px solid #6d28d9", borderRadius: 2, padding: "0 4px", marginRight: 5 }}>{s.kind || s.type || "scn"}</span>
                          {s.name || s.title || s.id}
                        </div>
                      ))}
                    </div>
                  )}
                  {t.kMatches?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: "#38bdf8", marginBottom: 3 }}>Knowledge Articles ({t.kMatches.length})</div>
                      {t.kMatches.slice(0, 5).map((k, ki) => (
                        <div key={ki} style={{ fontSize: 10, color: "#94a3b8", padding: "2px 6px", background: "#0a1628", borderRadius: 3, marginBottom: 2 }}>
                          <span style={{ fontSize: 9, color: "#38bdf8", border: "1px solid #1e40af", borderRadius: 2, padding: "0 4px", marginRight: 5 }}>{k.kind || k.type || "article"}</span>
                          {k.title || k.id}
                        </div>
                      ))}
                    </div>
                  )}
                  {t.sMatches?.length === 0 && t.kMatches?.length === 0 && (
                    <div style={{ fontSize: 10, color: "#64748b" }}>No scenario or knowledge cross-references found.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {visible.length === 0 && !loading && <div style={{ fontSize: 11, color: "#64748b", textAlign: "center", padding: 12 }}>No tasks match filter.</div>}
        {visible.length > 80 && <div style={{ fontSize: 10, color: "#64748b", textAlign: "center", padding: 4 }}>Showing 80 of {visible.length} — use search to narrow</div>}
      </div>

      {/* assess */}
      <div style={{ padding: "0 14px 14px" }}>
        <button
          onClick={assess}
          disabled={assessing}
          style={{ width: "100%", background: assessing ? "#0f172a" : "#14532d", border: "1px solid #22c55e", color: assessing ? "#64748b" : "#86efac", fontSize: 11, padding: "7px 0", borderRadius: 4, cursor: assessing ? "default" : "pointer", letterSpacing: "0.06em" }}
        >
          {assessing ? "▶ ASSESSING…" : "▶ ASSESS — Task Playbook Coverage Brief"}
        </button>
      </div>
    </div>
  );
}
