import { useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const AM = "#FFB300";
const GN = "#4ADE80";
const RD = "#FF4444";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_KEY) ||
  "dev-key";

const KSTRI_RE =
  /\b(kstri|knowledge[._-]?scenario[._-]?task|scenario[._-]?task[._-]?knowledge|deployed[._-]?knowledge|archival[._-]?knowledge|knowledge[._-]?deployment|knowledge[._-]?action[._-]?coverage|knowledge[._-]?ops[._-]?task|kb[._-]?scenario[._-]?task|task[._-]?scenario[._-]?kb|knowledge[._-]?triple)\b/i;

export function isKstriQuery(t) {
  return KSTRI_RE.test(t || "");
}

function tok(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter((w) => w.length > 2);
}

function overlap(a, b) {
  const sa = new Set(tok(a));
  const sb = new Set(tok(b));
  let hits = 0;
  for (const w of sa) if (sb.has(w)) hits++;
  return sa.size ? hits / sa.size : 0;
}

function articleHaystack(a) {
  return [a.title, a.category, a.summary, a.tags, a.author].join(" ");
}

function scenarioNeedle(s) {
  return [s.title, s.name, s.description, s.summary, s.category, s.type, ...(s.tags || [])].join(" ");
}

function taskNeedle(t) {
  return [t.name, t.title, t.description, t.mission, t.priority, ...(t.tags || [])].join(" ");
}

function bestScore(article, items, needleFn) {
  const hay = articleHaystack(article);
  let best = 0;
  for (const it of items) {
    const s = overlap(hay, needleFn(it));
    if (s > best) best = s;
  }
  return best;
}

function normaliseKB(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw)          ? raw
    : Array.isArray(raw?.articles)        ? raw.articles
    : Array.isArray(raw?.items)           ? raw.items
    : Array.isArray(raw?.results)         ? raw.results
    : Array.isArray(raw?.data)            ? raw.data
    : [];
  return arr.map((a, i) => ({
    id:       a.id       || a.slug      || String(i),
    title:    a.title    || a.name      || a.label || `Article ${i + 1}`,
    category: a.category || a.type      || a.domain || "",
    summary:  (a.summary || a.content   || a.body || a.abstract || a.description || "").toString().slice(0, 400),
    tags:     Array.isArray(a.tags) ? a.tags.join(" ") : (a.tags || ""),
    author:   a.author   || a.created_by || "",
  }));
}

function normaliseScenarios(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ["scenarios", "items", "results", "data", "records"]) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseTasks(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ["tasks", "items", "results", "data", "records"]) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

export async function buildKstriScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [kbR, scR, tkR] = await Promise.allSettled([
      fetch(`${base}/knowledge/`, { headers: hdr }).then((r) => r.json()),
      fetch(`${base}/v1/scenario/list`, { headers: hdr }).then((r) => r.json()),
      fetch(`${base}/entities/Task`, { headers: hdr }).then((r) => r.json()),
    ]);
    const articles = normaliseKB(kbR.status === "fulfilled" ? kbR.value : []).slice(0, 200);
    const scenarios = normaliseScenarios(scR.status === "fulfilled" ? scR.value : []).slice(0, 200);
    const tasks = normaliseTasks(tkR.status === "fulfilled" ? tkR.value : []).slice(0, 200);

    let fullyActionable = 0, planned = 0, tasked = 0, archival = 0;
    for (const a of articles) {
      const hasScenario = bestScore(a, scenarios, scenarioNeedle) > 0.15;
      const hasTask = bestScore(a, tasks, taskNeedle) > 0.15;
      if (hasScenario && hasTask) fullyActionable++;
      else if (hasScenario) planned++;
      else if (hasTask) tasked++;
      else archival++;
    }
    return (
      `Knowledge × Scenario × Task Coverage: ${articles.length} KB articles assessed against ` +
      `${scenarios.length} scenarios and ${tasks.length} tasks — ` +
      `${fullyActionable} FULLY ACTIONABLE (scenario-planned + task-assigned), ` +
      `${planned} PLANNED (scenario exists, no task assigned), ` +
      `${tasked} TASKED (task found, no scenario plan), ` +
      `${archival} ARCHIVAL (no scenario or task coverage — knowledge not operationally deployed). ` +
      `${archival > 0 ? `${archival} KB article${archival > 1 ? "s" : ""} have no scenario or task backing — recommend operational deployment review.` : "All KB articles have at least scenario or task coverage."}`
    );
  } catch {
    return "Knowledge × Scenario × Task coverage assessment unavailable.";
  }
}

const ScoreBar = ({ sc, color }) => (
  <div style={{ background: "#111", borderRadius: 2, height: 3, width: "100%", overflow: "hidden" }}>
    <div style={{ width: `${Math.round(sc * 100)}%`, background: color, height: "100%", transition: "width .3s" }} />
  </div>
);

const chip = (label, color = CY) => (
  <span style={{ display: "inline-block", padding: "1px 6px", border: `1px solid ${color}`, borderRadius: 3, color, fontSize: 9, letterSpacing: 1, marginRight: 4 }}>
    {label}
  </span>
);

const TABS = ["ALL", "FULLY ACTIONABLE", "PLANNED", "TASKED", "ARCHIVAL"];

export default function KnowledgeScenarioTaskTriple() {
  const [open, setOpen] = useState(false);
  const [articles, setArticles] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState("");
  const [err, setErr] = useState("");
  const timerRef = useRef(null);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [kbR, scR, tkR] = await Promise.allSettled([
        fetch(`${base}/knowledge/`, { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/v1/scenario/list`, { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/entities/Task`, { headers: hdr }).then((r) => r.json()),
      ]);
      setArticles(normaliseKB(kbR.status === "fulfilled" ? kbR.value : []).slice(0, 200));
      setScenarios(normaliseScenarios(scR.status === "fulfilled" ? scR.value : []).slice(0, 200));
      setTasks(normaliseTasks(tkR.status === "fulfilled" ? tkR.value : []).slice(0, 200));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    function onToggle() {
      setOpen((o) => {
        if (!o) load();
        return !o;
      });
    }
    window.addEventListener("jarvis:kstri-toggle", onToggle);
    return () => window.removeEventListener("jarvis:kstri-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open]);

  function classify(a) {
    const hasScenario = bestScore(a, scenarios, scenarioNeedle) > 0.15;
    const hasTask = bestScore(a, tasks, taskNeedle) > 0.15;
    if (hasScenario && hasTask) return "FULLY ACTIONABLE";
    if (hasScenario) return "PLANNED";
    if (hasTask) return "TASKED";
    return "ARCHIVAL";
  }

  function matchedScenarios(a) {
    const hay = articleHaystack(a);
    return scenarios
      .map((s) => ({ s, sc: overlap(hay, scenarioNeedle(s)) }))
      .filter((x) => x.sc > 0.05)
      .sort((a, b) => b.sc - a.sc)
      .slice(0, 6);
  }

  function matchedTasks(a) {
    const hay = articleHaystack(a);
    return tasks
      .map((t) => ({ t, sc: overlap(hay, taskNeedle(t)) }))
      .filter((x) => x.sc > 0.05)
      .sort((a, b) => b.sc - a.sc)
      .slice(0, 6);
  }

  const enriched = articles.map((a) => ({ ...a, _class: classify(a) }));

  const fullyCount = enriched.filter((a) => a._class === "FULLY ACTIONABLE").length;
  const plannedCount = enriched.filter((a) => a._class === "PLANNED").length;
  const taskedCount = enriched.filter((a) => a._class === "TASKED").length;
  const archivalCount = enriched.filter((a) => a._class === "ARCHIVAL").length;

  const filtered = enriched.filter((a) => {
    if (tab !== "ALL" && a._class !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (a.title || "").toLowerCase().includes(q) ||
        (a.category || "").toLowerCase().includes(q) ||
        (a.summary || "").toLowerCase().includes(q) ||
        (a.tags || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    setAssessText("");
    try {
      const script = await buildKstriScript();
      const base = apiBase();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const answer = (d.answer || script).replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssessText(answer);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch {
      setAssessText(await buildKstriScript());
    } finally {
      setAssessing(false);
    }
  }

  const classColor = (cl) => {
    if (cl === "FULLY ACTIONABLE") return GN;
    if (cl === "PLANNED") return AM;
    if (cl === "TASKED") return CY;
    return RD;
  };

  const mono = { fontFamily: "'JetBrains Mono',monospace" };

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Knowledge × Scenario × Task Triple Coverage (KSTRI)"
        style={{
          position: "fixed",
          left: 729440,
          bottom: 8,
          zIndex: 331,
          background: archivalCount > 0 ? `${AM}22` : "#0a0a0a",
          border: `1px solid ${archivalCount > 0 ? AM : "#333"}`,
          color: archivalCount > 0 ? AM : "#888",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9,
          padding: "3px 7px",
          borderRadius: 3,
          cursor: "pointer",
          letterSpacing: 1,
        }}
      >
        ◈ KSTRI{archivalCount > 0 ? ` ▲${archivalCount}` : ""}
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 40,
        left: "50%",
        transform: "translateX(-50%)",
        width: 780,
        maxHeight: "85vh",
        overflowY: "auto",
        background: "#060810",
        border: "1px solid #1a2a3a",
        borderRadius: 6,
        zIndex: 9501,
        ...mono,
        fontSize: 11,
        color: "#ccc",
      }}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #1a2a3a", gap: 8 }}>
        <span style={{ color: AM, fontSize: 13, fontWeight: 700, flex: 1 }}>
          ◈ KNOWLEDGE × SCENARIO × TASK TRIPLE COVERAGE
        </span>
        {loading && <span style={{ color: "#555", fontSize: 9 }}>LOADING…</span>}
        <button
          onClick={assess}
          disabled={assessing}
          style={{ background: "#111", border: `1px solid ${CY}`, color: CY, fontSize: 9, padding: "2px 8px", borderRadius: 3, cursor: "pointer" }}
        >
          {assessing ? "ASSESSING…" : "▶ ASSESS"}
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: "#555", fontSize: 13, cursor: "pointer" }}
        >
          ✕
        </button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "10px 14px", borderBottom: "1px solid #111" }}>
        {[
          ["KB ARTICLES", articles.length, "#888"],
          ["SCENARIOS", scenarios.length, "#888"],
          ["TASKS", tasks.length, "#888"],
          ["FULLY ACTIONABLE", fullyCount, GN],
          ["PLANNED", plannedCount, AM],
          ["TASKED", taskedCount, CY],
          ["ARCHIVAL", archivalCount, RD],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: 1, background: "#0c0c0c", border: "1px solid #1a1a1a", borderRadius: 3, padding: "6px 4px", textAlign: "center" }}>
            <div style={{ color, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#555", fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* coverage bar */}
      {articles.length > 0 && (
        <div style={{ padding: "6px 14px", borderBottom: "1px solid #111" }}>
          <div style={{ display: "flex", height: 5, borderRadius: 3, overflow: "hidden" }}>
            {[
              [fullyCount, GN],
              [plannedCount, AM],
              [taskedCount, CY],
              [archivalCount, RD],
            ].map(([count, color], i) => (
              <div key={i} style={{ width: `${(count / articles.length) * 100}%`, background: color }} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 4, fontSize: 8, color: "#555" }}>
            {[["FULLY ACTIONABLE", GN], ["PLANNED", AM], ["TASKED", CY], ["ARCHIVAL", RD]].map(([label, color]) => (
              <span key={label} style={{ color }}>{label}</span>
            ))}
          </div>
        </div>
      )}

      {/* assess text */}
      {assessText && (
        <div style={{ padding: "8px 14px", borderBottom: "1px solid #111", color: "#aaa", fontSize: 10, lineHeight: 1.6, background: "#080808" }}>
          {assessText}
        </div>
      )}

      {/* search + tabs */}
      <div style={{ padding: "8px 14px", borderBottom: "1px solid #111", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search KB articles…"
          style={{ background: "#0c0c0c", border: "1px solid #222", color: "#ccc", padding: "3px 8px", borderRadius: 3, fontSize: 10, flex: 1, minWidth: 120, outline: "none" }}
        />
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? `${AM}22` : "none",
              border: `1px solid ${tab === t ? AM : "#222"}`,
              color: tab === t ? AM : "#555",
              fontSize: 8,
              padding: "2px 6px",
              borderRadius: 3,
              cursor: "pointer",
              letterSpacing: 1,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* error */}
      {err && (
        <div style={{ padding: "6px 14px", color: RD, fontSize: 9 }}>ERROR: {err}</div>
      )}

      {/* rows */}
      <div style={{ padding: "6px 0" }}>
        {filtered.length === 0 && (
          <div style={{ padding: "16px 14px", color: "#444", textAlign: "center", fontSize: 10 }}>
            {loading ? "Loading…" : "No KB articles match the current filter."}
          </div>
        )}
        {filtered.map((a) => {
          const isExp = expanded === a.id;
          const ms = matchedScenarios(a);
          const mt = matchedTasks(a);
          return (
            <div key={a.id} style={{ borderBottom: "1px solid #0d0d0d" }}>
              <div
                onClick={() => setExpanded(isExp ? null : a.id)}
                style={{ display: "flex", alignItems: "center", padding: "7px 14px", gap: 8, cursor: "pointer" }}
              >
                <span style={{ color: classColor(a._class), fontSize: 9, minWidth: 130, letterSpacing: 1 }}>
                  {a._class}
                </span>
                <span style={{ flex: 1, color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.title}
                </span>
                {a.category && chip(a.category, "#666")}
                <span style={{ color: "#333", fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "0 14px 10px", display: "flex", gap: 10 }}>
                  {/* scenarios pane */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: AM, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>
                      SCENARIOS ({ms.length})
                    </div>
                    {ms.length === 0 ? (
                      <div style={{ color: "#333", fontSize: 9 }}>No scenario alignment</div>
                    ) : (
                      ms.map(({ s, sc }, i) => (
                        <div key={i} style={{ marginBottom: 6 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ color: "#bbb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
                              {s.title || s.name || "Scenario"}
                            </span>
                            <span style={{ color: AM, fontSize: 9 }}>{Math.round(sc * 100)}%</span>
                          </div>
                          {(s.status || s.category) && (
                            <div style={{ marginBottom: 2 }}>
                              {s.status && chip(s.status, "#666")}
                              {s.category && chip(s.category, "#555")}
                            </div>
                          )}
                          <ScoreBar sc={sc} color={AM} />
                        </div>
                      ))
                    )}
                  </div>

                  {/* tasks pane */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: CY, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>
                      TASKS ({mt.length})
                    </div>
                    {mt.length === 0 ? (
                      <div style={{ color: "#333", fontSize: 9 }}>No task alignment</div>
                    ) : (
                      mt.map(({ t, sc }, i) => (
                        <div key={i} style={{ marginBottom: 6 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ color: "#bbb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
                              {t.name || t.title || "Task"}
                            </span>
                            <span style={{ color: CY, fontSize: 9 }}>{Math.round(sc * 100)}%</span>
                          </div>
                          {(t.status || t.priority) && (
                            <div style={{ marginBottom: 2 }}>
                              {t.status && chip(t.status, "#666")}
                              {t.priority && chip(t.priority, t.priority === "high" || t.priority === "critical" ? RD : "#555")}
                            </div>
                          )}
                          <ScoreBar sc={sc} color={CY} />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
