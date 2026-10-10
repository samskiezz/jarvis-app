import { useState, useEffect, useCallback } from "react";

const API = "";

export function isIptscntriQuery(q) {
  const t = q.toLowerCase();
  return (
    t.includes("iptscntri") ||
    t.includes("intel profile task scenario") ||
    t.includes("intel task scenario") ||
    t.includes("threat actor task") ||
    t.includes("intel profile scenario") ||
    t.includes("tracked subject coverage") ||
    t.includes("intel triple nexus") ||
    t.includes("subject task scenario") ||
    t.includes("intel operational coverage") ||
    t.includes("profile coverage triple")
  );
}

export async function buildIptscntriScript() {
  try {
    const [ipRes, tRes, sRes] = await Promise.all([
      fetch(`${API}/entities/IntelProfile`),
      fetch(`${API}/entities/Task`),
      fetch(`${API}/v1/scenario/list`),
    ]);
    const ipj = ipRes.ok ? await ipRes.json() : [];
    const tj = tRes.ok ? await tRes.json() : [];
    const sj = sRes.ok ? await sRes.json() : [];

    const profiles = Array.isArray(ipj) ? ipj : ipj.items ?? ipj.data ?? [];
    const tasks = Array.isArray(tj) ? tj : tj.items ?? tj.data ?? [];
    const scenarios = Array.isArray(sj) ? sj : sj.items ?? sj.data ?? sj.scenarios ?? [];

    let fullyCovered = 0, taskOnly = 0, scenarioOnly = 0, dark = 0;
    profiles.forEach((p) => {
      const text = (p.name || p.subject || p.title || p.description || p.actor_type || "").toLowerCase();
      const words = text.split(/[\s,._-]+/).filter((w) => w.length >= 3);
      const hasT = words.some((w) => tasks.some((t) => (t.title || t.name || t.description || t.summary || "").toLowerCase().includes(w)));
      const hasS = words.some((w) => scenarios.some((s) => (s.name || s.title || s.description || s.kind || "").toLowerCase().includes(w)));
      if (hasT && hasS) fullyCovered++;
      else if (hasT) taskOnly++;
      else if (hasS) scenarioOnly++;
      else dark++;
    });

    const total = profiles.length;
    const pct = total ? ((fullyCovered / total) * 100).toFixed(1) : "0.0";
    return `IPTSCNTRI Intel Profile × Task × Scenario Triple Nexus: ${total} intel profiles | ${tasks.length} tasks | ${scenarios.length} scenarios | ${fullyCovered} fully covered (${pct}%) | ${taskOnly} task-only | ${scenarioOnly} scenario-only | ${dark} dark (no operational coverage).`;
  } catch (e) {
    return `IPTSCNTRI: fetch error — ${e.message}`;
  }
}

function classify(profile, tasks, scenarios) {
  const text = (profile.name || profile.subject || profile.title || profile.description || profile.actor_type || "").toLowerCase();
  const words = text.split(/[\s,._-]+/).filter((w) => w.length >= 3);
  const tMatches = tasks.filter((t) => words.some((w) => (t.title || t.name || t.description || t.summary || "").toLowerCase().includes(w)));
  const sMatches = scenarios.filter((s) => words.some((w) => (s.name || s.title || s.description || s.kind || "").toLowerCase().includes(w)));
  const hasT = tMatches.length > 0;
  const hasS = sMatches.length > 0;
  if (hasT && hasS) return { type: "FULLY_COVERED", tMatches, sMatches };
  if (hasT) return { type: "TASK_ONLY", tMatches, sMatches };
  if (hasS) return { type: "SCENARIO_ONLY", tMatches, sMatches };
  return { type: "DARK", tMatches, sMatches };
}

const TYPE_COLOR = {
  FULLY_COVERED: "#00ff88",
  TASK_ONLY: "#38bdf8",
  SCENARIO_ONLY: "#a78bfa",
  DARK: "#334155",
};

const THREAT_COLOR = { CRITICAL: "#ef4444", HIGH: "#f97316", MEDIUM: "#eab308", LOW: "#22c55e" };
const STATUS_COLOR = { DONE: "#22c55e", IN_PROGRESS: "#38bdf8", PENDING: "#eab308", BLOCKED: "#ef4444" };

export default function IntelProfileTaskScenarioTriple() {
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [scenarios, setScenarios] = useState([]);
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
      const [ipRes, tRes, sRes] = await Promise.all([
        fetch(`${API}/entities/IntelProfile`),
        fetch(`${API}/entities/Task`),
        fetch(`${API}/v1/scenario/list`),
      ]);
      const ipj = ipRes.ok ? await ipRes.json() : [];
      const tj = tRes.ok ? await tRes.json() : [];
      const sj = sRes.ok ? await sRes.json() : [];
      setProfiles(Array.isArray(ipj) ? ipj : ipj.items ?? ipj.data ?? []);
      setTasks(Array.isArray(tj) ? tj : tj.items ?? tj.data ?? []);
      setScenarios(Array.isArray(sj) ? sj : sj.items ?? sj.data ?? sj.scenarios ?? []);
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
    window.addEventListener("jarvis:iptscntri-toggle", handler);
    return () => window.removeEventListener("jarvis:iptscntri-toggle", handler);
  }, []);

  const classified = profiles.map((p) => ({ ...p, ...classify(p, tasks, scenarios) }));

  const fullyCovered = classified.filter((p) => p.type === "FULLY_COVERED").length;
  const taskOnly = classified.filter((p) => p.type === "TASK_ONLY").length;
  const scenarioOnly = classified.filter((p) => p.type === "SCENARIO_ONLY").length;
  const dark = classified.filter((p) => p.type === "DARK").length;
  const pct = profiles.length ? ((fullyCovered / profiles.length) * 100).toFixed(1) : "0.0";

  const visible = classified.filter((p) => {
    if (filter !== "ALL" && p.type !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (p.name || p.subject || p.title || "").toLowerCase().includes(s);
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    try {
      const brief = await buildIptscntriScript();
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `IPTSCNTRI intel profile operational coverage: ${brief}. Identify dark intel profiles and the top 2 operational priorities.` }),
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
        title="Intel Profile × Task × Scenario Triple Nexus (IPTSCNTRI)"
        style={{
          position: "fixed",
          left: 896080,
          bottom: 8,
          zIndex: 256,
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
        ◈ IPTSCNTRI
        {dark > 0 && (
          <span style={{ marginLeft: 5, background: "#1e1b4b", color: "#a5b4fc", borderRadius: 3, padding: "1px 5px", fontSize: 9 }}>
            {dark}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 60,
        right: 20,
        width: 540,
        maxHeight: "82vh",
        overflowY: "auto",
        background: "#0a0f1e",
        border: "1px solid #1e3a5f",
        borderRadius: 8,
        zIndex: 2560,
        fontFamily: "monospace",
        color: "#e2e8f0",
        boxShadow: "0 0 40px #1e3a5f55",
      }}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #1e3a5f", background: "#050d1a" }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: "#00ff88", letterSpacing: "0.08em" }}>◈ IPTSCNTRI — Intel Profile × Task × Scenario</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={load} disabled={loading} style={{ background: "none", border: "1px solid #334155", color: "#94a3b8", fontSize: 10, padding: "2px 8px", borderRadius: 3, cursor: "pointer" }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#64748b", fontSize: 14, cursor: "pointer" }}>✕</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6, padding: "10px 14px" }}>
        {[
          { label: "Intel Profiles", val: profiles.length, color: "#38bdf8" },
          { label: "Fully Covered", val: fullyCovered, color: "#00ff88" },
          { label: "Task Only", val: taskOnly, color: "#38bdf8" },
          { label: "Scenario Only", val: scenarioOnly, color: "#a78bfa" },
          { label: "Coverage %", val: `${pct}%`, color: fullyCovered > 0 ? "#00ff88" : "#64748b" },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: "#0f172a", border: "1px solid #1e3a5f", borderRadius: 5, padding: "6px 4px", textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 9, color: "#64748b", marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {dark > 0 && (
        <div style={{ margin: "0 14px 8px", background: "#0c0a1a", border: "1px solid #4338ca", borderRadius: 4, padding: "5px 10px", fontSize: 11, color: "#a5b4fc" }}>
          ⚠ {dark} intel profiles have no task or scenario operational coverage (dark)
        </div>
      )}

      {err && <div style={{ margin: "0 14px 8px", color: "#f87171", fontSize: 11 }}>Error: {err}</div>}
      {loading && <div style={{ margin: "0 14px 8px", color: "#38bdf8", fontSize: 11 }}>Loading…</div>}

      {/* assess */}
      <div style={{ padding: "0 14px 8px" }}>
        <button
          onClick={assess}
          disabled={assessing}
          style={{ background: "#0f172a", border: "1px solid #334155", color: "#94a3b8", fontSize: 10, padding: "4px 12px", borderRadius: 3, cursor: "pointer" }}
        >
          {assessing ? "Assessing…" : "▶ ASSESS"}
        </button>
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 14px 8px", flexWrap: "wrap" }}>
        {["ALL", "FULLY_COVERED", "TASK_ONLY", "SCENARIO_ONLY", "DARK"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? "#1e3a5f" : "#0f172a",
              border: `1px solid ${filter === f ? "#38bdf8" : "#334155"}`,
              color: filter === f ? "#7dd3fc" : "#64748b",
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
          placeholder="search profiles…"
          style={{ flex: 1, minWidth: 100, background: "#0f172a", border: "1px solid #334155", color: "#e2e8f0", fontSize: 10, padding: "3px 8px", borderRadius: 3, outline: "none" }}
        />
      </div>

      {/* profile list */}
      <div style={{ padding: "0 14px 14px" }}>
        {visible.slice(0, 80).map((p, i) => {
          const id = p.id || p.name || i;
          const isExp = expanded === id;
          const label = p.name || p.subject || p.title || `Profile ${i + 1}`;
          return (
            <div
              key={id}
              onClick={() => setExpanded(isExp ? null : id)}
              style={{ cursor: "pointer", padding: "6px 8px", marginBottom: 4, background: "#0f172a", border: "1px solid #1e3a5f", borderRadius: 4 }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 11, color: "#e2e8f0" }}>{label}</span>
                  {p.threat_level && (
                    <span style={{ marginLeft: 6, fontSize: 9, color: THREAT_COLOR[p.threat_level] ?? "#94a3b8", background: "#0a0f1e", border: `1px solid ${THREAT_COLOR[p.threat_level] ?? "#334155"}`, borderRadius: 2, padding: "0 4px" }}>
                      {p.threat_level}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: TYPE_COLOR[p.type] ?? "#94a3b8", background: "#0a0f1e", padding: "1px 6px", borderRadius: 3, border: `1px solid ${TYPE_COLOR[p.type] ?? "#334155"}`, whiteSpace: "nowrap", marginLeft: 6 }}>
                  {p.type}
                </span>
              </div>
              {isExp && (
                <div style={{ marginTop: 8 }}>
                  {p.tMatches?.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 10, color: "#38bdf8", marginBottom: 3 }}>Tasks ({p.tMatches.length})</div>
                      {p.tMatches.slice(0, 5).map((t, ti) => (
                        <div key={ti} style={{ fontSize: 10, color: "#94a3b8", padding: "2px 6px", background: "#021220", borderRadius: 3, marginBottom: 2, display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{ fontSize: 9, color: STATUS_COLOR[t.status] ?? "#94a3b8", border: `1px solid ${STATUS_COLOR[t.status] ?? "#334155"}`, borderRadius: 2, padding: "0 4px" }}>{t.status || "?"}</span>
                          {t.title || t.name || t.id}
                        </div>
                      ))}
                    </div>
                  )}
                  {p.sMatches?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: "#a78bfa", marginBottom: 3 }}>Scenarios ({p.sMatches.length})</div>
                      {p.sMatches.slice(0, 5).map((s, si) => (
                        <div key={si} style={{ fontSize: 10, color: "#94a3b8", padding: "2px 6px", background: "#1a0828", borderRadius: 3, marginBottom: 2, display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{ fontSize: 9, color: "#a78bfa", border: "1px solid #4338ca", borderRadius: 2, padding: "0 4px" }}>{s.kind || "SIM"}</span>
                          {s.name || s.title || s.id}
                        </div>
                      ))}
                    </div>
                  )}
                  {p.tMatches?.length === 0 && p.sMatches?.length === 0 && (
                    <div style={{ fontSize: 10, color: "#475569", fontStyle: "italic" }}>No operational cross-references found</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {visible.length === 0 && !loading && (
          <div style={{ color: "#475569", fontSize: 11, textAlign: "center", padding: "20px 0" }}>No profiles match filter</div>
        )}
        {visible.length > 80 && (
          <div style={{ color: "#475569", fontSize: 10, textAlign: "center", padding: "8px 0" }}>Showing 80 of {visible.length}</div>
        )}
      </div>
    </div>
  );
}
