/**
 * ScenarioContactTaskCoverage — F89.
 *
 * Triple-nexus: /v1/scenario/list × /entities/Contact × /entities/Task
 *
 * Keyword-correlates each scenario against:
 *   - contacts (who is assigned / owns the scenario)
 *   - tasks    (what concrete actions exist for it)
 *
 * Classification per scenario:
 *   FULLY_SUPPORTED — matched ≥1 contact AND ≥1 task
 *   CONTACT_ONLY    — has a contact owner but no task
 *   TASK_ONLY       — has tasks but no contact owner
 *   UNSUPPORTED     — no contact or task match (execution blind spot)
 *
 * Stat tiles: SCENARIOS / CONTACTS / TASKS / FULLY SUPPORTED / UNSUPPORTED
 * Filter tabs: ALL / FULLY_SUPPORTED / CONTACT_ONLY / TASK_ONLY / UNSUPPORTED
 * List: scenarios sorted by classification (UNSUPPORTED first), each expandable.
 * Click ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence execution brief + TTS.
 * 90s auto-refresh.
 *
 * Intent: "sctexcov" / "scenario execution" / "scenario contact task" /
 *         "unsupported scenario" / "scenario coverage" / "execution coverage" /
 *         "scenario task contact"
 *   → jarvis:sctexcov-toggle + TTS via buildSctexcovScript()
 *
 * Toggle: ◈ SCTEXCOV at left:969080, bottom:8, zIndex:113.
 * Mounted in App.jsx; wired in JarvisBrain.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const PURPLE = "#A855F7";
const GREEN = "#00c878";
const RED   = "#FF3D5A";
const BTN_LEFT   = 969080;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise helpers ────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

function normaliseScenarios(raw) {
  return normaliseArray(raw).map((s) => ({
    id: s.id || s.scenario_id || String(Math.random()),
    name: s.name || s.title || s.label || "Unnamed Scenario",
    description: s.description || s.summary || s.objective || "",
    status: s.status || s.state || "unknown",
  }));
}

function normaliseContacts(raw) {
  return normaliseArray(raw).map((c) => ({
    id: c.id || c.contact_id || String(Math.random()),
    name: c.name || c.full_name || c.display_name || "Unknown Contact",
    role: c.role || c.title || c.position || "",
    org: c.org || c.organisation || c.organization || c.company || "",
  }));
}

function normaliseTasks(raw) {
  return normaliseArray(raw).map((t) => ({
    id: t.id || t.task_id || String(Math.random()),
    name: t.name || t.title || t.label || "Unnamed Task",
    status: t.status || t.state || "pending",
    priority: t.priority || t.urgency || "medium",
    description: t.description || t.summary || "",
  }));
}

// ─── keyword scorer ───────────────────────────────────────────────────────────

function keywords(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function scoreMatch(scenarioKws, itemText) {
  const iKws = keywords(itemText);
  const hits = scenarioKws.filter((k) => iKws.includes(k)).length;
  if (!hits) return 0;
  const union = new Set([...scenarioKws, ...iKws]).size;
  return Math.round((hits / union) * 100);
}

// ─── exported intent helpers ──────────────────────────────────────────────────

export function isSctexcovQuery(q) {
  const l = q.toLowerCase();
  return (
    l.includes("sctexcov") ||
    l.includes("scenario execution") ||
    l.includes("scenario contact task") ||
    l.includes("unsupported scenario") ||
    (l.includes("scenario") && l.includes("coverage") && l.includes("task")) ||
    (l.includes("execution coverage") && l.includes("scenario")) ||
    l.includes("scenario task contact")
  );
}

export async function buildSctexcovScript() {
  const base = apiBase();
  try {
    const [sr, cr, tr] = await Promise.all([
      fetch(`${base}/v1/scenario/list`).then((r) => r.json()).catch(() => []),
      fetch(`${base}/entities/Contact`).then((r) => r.json()).catch(() => []),
      fetch(`${base}/entities/Task`).then((r) => r.json()).catch(() => []),
    ]);
    const scenarios = normaliseScenarios(sr);
    const contacts  = normaliseContacts(cr);
    const tasks     = normaliseTasks(tr);
    let unsupported = 0;
    scenarios.forEach((s) => {
      const kws = keywords(`${s.name} ${s.description}`);
      const hasC = contacts.some((c) => scoreMatch(kws, `${c.name} ${c.role} ${c.org}`) > 0);
      const hasT = tasks.some((t) => scoreMatch(kws, `${t.name} ${t.description}`) > 0);
      if (!hasC && !hasT) unsupported++;
    });
    return (
      `Scenario execution coverage: ${scenarios.length} scenarios, ` +
      `${contacts.length} contacts, ${tasks.length} tasks. ` +
      `${unsupported} scenario${unsupported !== 1 ? "s" : ""} are UNSUPPORTED — ` +
      `no contact owner or task action found. Recommend assigning owners and creating tasks for unsupported scenarios.`
    );
  } catch {
    return "Scenario execution coverage data unavailable.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

const CLASS_ORDER = ["UNSUPPORTED", "CONTACT_ONLY", "TASK_ONLY", "FULLY_SUPPORTED"];

export default function ScenarioContactTaskCoverage() {
  const [open,     setOpen]     = useState(false);
  const [rows,     setRows]     = useState([]);
  const [stats,    setStats]    = useState({ scenarios: 0, contacts: 0, tasks: 0, fully: 0, unsupported: 0 });
  const [tab,      setTab]      = useState("ALL");
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [assessing,setAssessing]= useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const [sr, cr, tr] = await Promise.all([
        fetch(`${base}/v1/scenario/list`).then((r) => r.json()).catch(() => []),
        fetch(`${base}/entities/Contact`).then((r) => r.json()).catch(() => []),
        fetch(`${base}/entities/Task`).then((r) => r.json()).catch(() => []),
      ]);
      const scenarios = normaliseScenarios(sr);
      const contacts  = normaliseContacts(cr);
      const tasks     = normaliseTasks(tr);

      const built = scenarios.map((s) => {
        const kws = keywords(`${s.name} ${s.description}`);
        const matchedC = contacts
          .map((c) => ({ ...c, score: scoreMatch(kws, `${c.name} ${c.role} ${c.org}`) }))
          .filter((c) => c.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);
        const matchedT = tasks
          .map((t) => ({ ...t, score: scoreMatch(kws, `${t.name} ${t.description}`) }))
          .filter((t) => t.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);
        const hasC = matchedC.length > 0;
        const hasT = matchedT.length > 0;
        const cls = hasC && hasT
          ? "FULLY_SUPPORTED"
          : hasC
          ? "CONTACT_ONLY"
          : hasT
          ? "TASK_ONLY"
          : "UNSUPPORTED";
        return { ...s, cls, matchedC, matchedT };
      });

      built.sort((a, b) => CLASS_ORDER.indexOf(a.cls) - CLASS_ORDER.indexOf(b.cls));

      const fully      = built.filter((r) => r.cls === "FULLY_SUPPORTED").length;
      const unsupported = built.filter((r) => r.cls === "UNSUPPORTED").length;
      setRows(built);
      setStats({ scenarios: scenarios.length, contacts: contacts.length, tasks: tasks.length, fully, unsupported });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => {
      setOpen((v) => !v);
    };
    window.addEventListener("jarvis:sctexcov-toggle", toggle);
    return () => window.removeEventListener("jarvis:sctexcov-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = await buildSctexcovScript();
      const base = apiBase();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const text = (d.answer || script).replace(/<<ACTION:[^>]*>>/g, "").trim();
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text }),
      });
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } finally {
      setAssessing(false);
    }
  }, []);

  const visible = rows.filter((r) => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q);
    }
    return true;
  });

  const clsColour = (cls) => {
    if (cls === "FULLY_SUPPORTED") return GREEN;
    if (cls === "CONTACT_ONLY")    return CY;
    if (cls === "TASK_ONLY")       return PURPLE;
    return RED;
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 113,
          background: "rgba(0,0,0,0.7)", border: "1px solid #29E7FF44",
          color: "#29E7FF", fontFamily: "monospace", fontSize: 10,
          padding: "3px 7px", cursor: "pointer", borderRadius: 3,
        }}
        title="Scenario × Contact × Task Execution Coverage"
      >
        ◈ SCTEXCOV
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 113,
      background: "rgba(0,0,0,0.92)", display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: "#e0e0e0",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid #29E7FF22" }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 13 }}>◈ SCENARIO × CONTACT × TASK — EXECUTION COVERAGE</span>
        <button onClick={assess} disabled={assessing} style={btnStyle(GREEN)}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#888" }}>{loading ? "↻ loading…" : "90 s refresh"}</span>
        <button onClick={() => setOpen(false)} style={btnStyle("#555")}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 16px", flexWrap: "wrap" }}>
        {[
          ["SCENARIOS",       stats.scenarios,  "#888"],
          ["CONTACTS",        stats.contacts,   CY],
          ["TASKS",           stats.tasks,      PURPLE],
          ["FULLY SUPPORTED", stats.fully,      GREEN],
          ["UNSUPPORTED",     stats.unsupported, RED],
        ].map(([label, val, col]) => (
          <div key={label} style={{ background: "#111", border: `1px solid ${col}44`, borderRadius: 4, padding: "6px 14px", minWidth: 90, textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: col }}>{val}</div>
            <div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>{label}</div>
            {label === "UNSUPPORTED" && val > 0 && (
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: RED, margin: "4px auto 0", animation: "jarvis-pulse 1.2s infinite" }} />
            )}
          </div>
        ))}
      </div>

      {/* filter tabs + search */}
      <div style={{ display: "flex", gap: 6, padding: "0 16px 8px", flexWrap: "wrap", alignItems: "center" }}>
        {["ALL", "FULLY_SUPPORTED", "CONTACT_ONLY", "TASK_ONLY", "UNSUPPORTED"].map((t) => (
          <button key={t} onClick={() => setTab(t)} style={tabStyle(tab === t)}>
            {t.replace("_", " ")}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search scenarios…"
          style={{ marginLeft: "auto", background: "#111", border: "1px solid #444", color: "#ddd", padding: "4px 8px", borderRadius: 3, fontSize: 11, fontFamily: "monospace", width: 200 }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>
        {visible.length === 0 && (
          <div style={{ color: "#555", textAlign: "center", marginTop: 40, fontSize: 12 }}>
            {loading ? "Loading scenarios…" : "No scenarios match."}
          </div>
        )}
        {visible.map((row) => (
          <div key={row.id} style={{ marginBottom: 6, background: "#0a0a0a", border: `1px solid ${clsColour(row.cls)}33`, borderRadius: 4 }}>
            <div
              onClick={() => setExpanded(expanded === row.id ? null : row.id)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", cursor: "pointer" }}
            >
              <span style={{ fontSize: 10, fontWeight: 700, color: clsColour(row.cls), minWidth: 100 }}>
                {row.cls.replace("_", " ")}
              </span>
              <span style={{ flex: 1, fontSize: 11, color: "#ddd", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row.name}
              </span>
              <span style={{ fontSize: 9, color: "#666" }}>
                {row.matchedC.length}C · {row.matchedT.length}T
              </span>
              <span style={{ color: "#555", fontSize: 11 }}>{expanded === row.id ? "▲" : "▼"}</span>
            </div>

            {expanded === row.id && (
              <div style={{ padding: "0 10px 10px", borderTop: "1px solid #1a1a1a" }}>
                {row.description && (
                  <p style={{ fontSize: 10, color: "#888", margin: "6px 0 8px" }}>{row.description}</p>
                )}

                {row.matchedC.length > 0 && (
                  <>
                    <div style={{ fontSize: 9, color: CY, marginBottom: 4 }}>CONTACTS ({row.matchedC.length})</div>
                    {row.matchedC.map((c) => (
                      <div key={c.id} style={{ marginBottom: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#ccc" }}>
                          <span>{c.name}{c.role ? ` — ${c.role}` : ""}</span>
                          <span style={{ color: CY }}>{c.score}%</span>
                        </div>
                        <div style={{ height: 3, background: "#111", borderRadius: 2, marginTop: 2 }}>
                          <div style={{ height: "100%", width: `${c.score}%`, background: CY, borderRadius: 2 }} />
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {row.matchedT.length > 0 && (
                  <>
                    <div style={{ fontSize: 9, color: PURPLE, marginBottom: 4, marginTop: 8 }}>TASKS ({row.matchedT.length})</div>
                    {row.matchedT.map((t) => (
                      <div key={t.id} style={{ marginBottom: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#ccc" }}>
                          <span>{t.name}</span>
                          <span style={{ color: PURPLE }}>{t.score}%</span>
                        </div>
                        <div style={{ height: 3, background: "#111", borderRadius: 2, marginTop: 2 }}>
                          <div style={{ height: "100%", width: `${t.score}%`, background: PURPLE, borderRadius: 2 }} />
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {row.matchedC.length === 0 && row.matchedT.length === 0 && (
                  <div style={{ fontSize: 10, color: RED, marginTop: 6 }}>
                    ⚠ No contact or task match found — execution blind spot.
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function btnStyle(col) {
  return {
    background: "transparent", border: `1px solid ${col}`, color: col,
    fontFamily: "monospace", fontSize: 10, padding: "3px 8px",
    cursor: "pointer", borderRadius: 3,
  };
}

function tabStyle(active) {
  return {
    background: active ? "#29E7FF22" : "transparent",
    border: `1px solid ${active ? "#29E7FF" : "#333"}`,
    color: active ? "#29E7FF" : "#888",
    fontFamily: "monospace", fontSize: 10, padding: "3px 7px",
    cursor: "pointer", borderRadius: 3,
  };
}
