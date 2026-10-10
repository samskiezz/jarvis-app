/**
 * F143 — Task × IntelProfile × Dataset × Knowledge Operational Intelligence Coverage (TIKDOI)
 *
 * Parallel-fetches /entities/Task + /entities/IntelProfile + /v1/datasets + /knowledge/
 * Keyword-correlates each task (name/description/status/priority) against
 * intel actor profiles AND datasets AND KB articles:
 *   FULLY_COVERED  — task matched intel profile AND dataset AND KB article
 *   DUAL_COVERED   — task matched any two of the three sources
 *   SINGLE_COVERED — task matched exactly one source
 *   UNCOVERED      — no matches (operational intelligence gap)
 *
 * Stat tiles: TASKS / INTEL PROFILES / DATASETS / KB ARTICLES + all four class counts + COVERAGE%.
 * Amber badge on uncovered count.
 * Filter tabs ALL / FULLY_COVERED / DUAL_COVERED / SINGLE_COVERED / UNCOVERED + text search.
 * Expand task → matched intel profile cards (orange) + dataset cards (purple) + KB article cards (green).
 * ▶ ASSESS COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:tikdoi-toggle event.
 *
 * Voice triggers: "tikdoi / task intelligence coverage / uncovered tasks /
 *                  task intel data / task full coverage / task knowledge intel".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_023_000;
const Z_INDEX  = 205;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const TIKDOI_RE = /\b(tikdoi|task[\s-]intelligence[\s-]coverage|uncovered[\s-]tasks?|task[\s-]intel[\s-]data|task[\s-]full[\s-]coverage|task[\s-]knowledge[\s-]intel)\b/i;

const CY     = "#00CFFF";
const GR     = "#22C55E";
const AM     = "#F59E0B";
const RE     = "#EF4444";
const OR     = "#F97316";
const PU     = "#A855F7";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_COVERED:  GR,
  DUAL_COVERED:   CY,
  SINGLE_COVERED: AM,
  UNCOVERED:      RE,
};
const TABS = ["ALL", "FULLY_COVERED", "DUAL_COVERED", "SINGLE_COVERED", "UNCOVERED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function taskText(t) {
  return `${t.name || t.title || ""} ${t.description || ""} ${t.status || ""} ${t.priority || ""} ${(t.tags || []).join(" ")}`;
}
function actorText(p) {
  const aliases = Array.isArray(p.aliases) ? p.aliases.join(" ") : "";
  return `${p.name || ""} ${p.org || ""} ${p.role || ""} ${p.description || ""} ${aliases} ${(p.tags || []).join(" ")}`;
}
function datasetText(d) {
  return `${d.name || d.title || ""} ${d.description || ""} ${d.type || ""} ${(d.tags || []).join(" ")}`;
}
function kbText(a) {
  return `${a.title || ""} ${a.content || ""} ${a.summary || ""} ${(a.tags || []).join(" ")}`;
}

function normaliseArray(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.items)) return raw.items;
  return [];
}

async function loadAll() {
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const [taskRes, actorRes, datasetRes, kbRes] = await Promise.allSettled([
    fetch(`${apiBase}/entities/Task`,          { headers }),
    fetch(`${apiBase}/entities/IntelProfile`,  { headers }),
    fetch(`${apiBase}/v1/datasets`,            { headers }),
    fetch(`${apiBase}/knowledge/`,             { headers }),
  ]);
  const tasks    = normaliseArray(
    taskRes.status === "fulfilled" && taskRes.value.ok ? await taskRes.value.json() : [],
    ["tasks", "items"]
  );
  const actors   = normaliseArray(
    actorRes.status === "fulfilled" && actorRes.value.ok ? await actorRes.value.json() : [],
    ["profiles", "actors"]
  );
  const datasets = normaliseArray(
    datasetRes.status === "fulfilled" && datasetRes.value.ok ? await datasetRes.value.json() : [],
    ["datasets", "items"]
  );
  const kbArticles = normaliseArray(
    kbRes.status === "fulfilled" && kbRes.value.ok ? await kbRes.value.json() : [],
    ["articles", "knowledge", "items"]
  );
  return { tasks, actors, datasets, kbArticles };
}

function classify(task, actors, datasets, kbArticles) {
  const kws          = keywords(taskText(task));
  const matchedActor   = actors.filter(p => score(actorText(p), kws) > 0);
  const matchedDataset = datasets.filter(d => score(datasetText(d), kws) > 0);
  const matchedKb      = kbArticles.filter(a => score(kbText(a), kws) > 0);
  const hits = (matchedActor.length > 0 ? 1 : 0)
             + (matchedDataset.length > 0 ? 1 : 0)
             + (matchedKb.length > 0 ? 1 : 0);
  let cls;
  if (hits === 3)      cls = "FULLY_COVERED";
  else if (hits === 2) cls = "DUAL_COVERED";
  else if (hits === 1) cls = "SINGLE_COVERED";
  else                 cls = "UNCOVERED";
  return { ...task, cls, matchedActor, matchedDataset, matchedKb };
}

function RelevanceBar({ score: s, max, color }) {
  const pct = max > 0 ? Math.round((s / max) * 100) : 0;
  return (
    <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginTop: 3 }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.3s" }} />
    </div>
  );
}

export async function buildTikdoiScript() {
  const { tasks, actors, datasets, kbArticles } = await loadAll();
  const rows      = tasks.map(t => classify(t, actors, datasets, kbArticles));
  const fully     = rows.filter(r => r.cls === "FULLY_COVERED").length;
  const uncovered = rows.filter(r => r.cls === "UNCOVERED").length;
  const ctx = `Tasks: ${tasks.length}. Intel profiles: ${actors.length}. Datasets: ${datasets.length}. KB articles: ${kbArticles.length}. Fully covered: ${fully}. Uncovered: ${uncovered}.`;
  const res = await fetch(`${apiBase}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) },
    body: JSON.stringify({ message: `Task Operational Intelligence Coverage (TIKDOI): ${ctx}. Write exactly 2 sentences assessing which tasks lack intel-profile, dataset, and knowledge-base coverage, and what the operational intelligence gap implies for mission execution.` }),
  });
  const j = await res.json().catch(() => ({}));
  return j.response || j.message || j.content
    || `TIKDOI online, sir. ${uncovered} tasks have no intel-profile, dataset, or knowledge-base coverage — operational intelligence gaps identified.`;
}

export function isTikdoiQuery(q) { return TIKDOI_RE.test(q); }

export default function TaskIntelDatasetKnowledgeCoverage() {
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [classified, setClassified] = useState([]);
  const [actors, setActors]         = useState([]);
  const [datasets, setDatasets]     = useState([]);
  const [kbArticles, setKbArticles] = useState([]);
  const [tab, setTab]               = useState("ALL");
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState(null);
  const [brief, setBrief]           = useState("");
  const [assessing, setAssessing]   = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { tasks, actors: a, datasets: d, kbArticles: kb } = await loadAll();
      setActors(a);
      setDatasets(d);
      setKbArticles(kb);
      setClassified(tasks.map(t => classify(t, a, d, kb)));
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener("jarvis:tikdoi-toggle", toggle);
    return () => window.removeEventListener("jarvis:tikdoi-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = await buildTikdoiScript();
      setBrief(script);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch { setBrief("Assessment unavailable."); }
    finally { setAssessing(false); }
  }, []);

  const counts = {
    FULLY_COVERED:  classified.filter(r => r.cls === "FULLY_COVERED").length,
    DUAL_COVERED:   classified.filter(r => r.cls === "DUAL_COVERED").length,
    SINGLE_COVERED: classified.filter(r => r.cls === "SINGLE_COVERED").length,
    UNCOVERED:      classified.filter(r => r.cls === "UNCOVERED").length,
  };
  const total    = classified.length;
  const covPct   = total > 0 ? Math.round(((total - counts.UNCOVERED) / total) * 100) : 0;
  const uncovered = counts.UNCOVERED;

  const filtered = classified.filter(r => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (!search) return true;
    return taskText(r).toLowerCase().includes(search.toLowerCase());
  });

  const maxActor   = Math.max(1, ...filtered.map(r => r.matchedActor.length));
  const maxDataset = Math.max(1, ...filtered.map(r => r.matchedDataset.length));
  const maxKb      = Math.max(1, ...filtered.map(r => r.matchedKb.length));

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => { setOpen(o => { if (!o) load(); return !o; }); }}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 9, padding: "3px 8px", borderRadius: 5,
          cursor: "pointer", whiteSpace: "nowrap",
          background: open ? `${CY}22` : "rgba(0,0,0,0.6)",
          color: open ? CY : "#5A7A9A",
          border: `1px solid ${open ? CY : "#1A2A3A"}`,
        }}
      >
        ◈ TIKDOI
        {uncovered > 0 && (
          <span style={{ marginLeft: 4, background: AM, color: "#000", borderRadius: 9,
            padding: "0px 5px", fontSize: 8, fontWeight: 700 }}>
            {uncovered}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", left: BTN_LEFT, bottom: 32, zIndex: Z_INDEX + 1,
          width: 460, maxHeight: "72vh", overflowY: "auto",
          background: BG, border: `1px solid ${BORDER}`,
          borderRadius: 10, padding: 14, fontFamily: FONT,
          boxShadow: `0 0 24px ${CY}18`,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>
              ◈ TASK × INTEL × DATASET × KNOWLEDGE COVERAGE
            </span>
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "#5A7A9A", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {error && (
            <div style={{ color: RE, fontSize: 10, marginBottom: 8 }}>⚠ {error}</div>
          )}

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {[
              ["TASKS",          total,                 CY],
              ["INTEL PROFS",    actors.length,         OR],
              ["DATASETS",       datasets.length,       PU],
              ["KB ARTICLES",    kbArticles.length,     GR],
              ["FULLY COV.",     counts.FULLY_COVERED,  GR],
              ["DUAL COV.",      counts.DUAL_COVERED,   CY],
              ["SINGLE COV.",    counts.SINGLE_COVERED, AM],
              ["UNCOVERED",      counts.UNCOVERED,      RE],
              [`${covPct}% COV`, null,                  "#7DD3FC"],
            ].map(([label, val, col]) => (
              <div key={label} style={{ background: `${col}11`, border: `1px solid ${col}33`,
                borderRadius: 5, padding: "3px 8px", fontSize: 9, color: col, textAlign: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{val ?? label}</div>
                {val !== null && <div style={{ opacity: 0.7, marginTop: 1 }}>{label}</div>}
              </div>
            ))}
          </div>

          {/* Coverage bar */}
          <div style={{ marginBottom: 10, background: "rgba(255,255,255,0.04)", borderRadius: 4, height: 6 }}>
            <div style={{ height: "100%", width: `${covPct}%`, background: GR, borderRadius: 4,
              transition: "width 0.4s", boxShadow: `0 0 6px ${GR}66` }} />
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ fontSize: 9, padding: "2px 8px", borderRadius: 4, cursor: "pointer",
                  background: tab === t ? `${CLASS_COLOR[t] || CY}22` : "rgba(255,255,255,0.03)",
                  color: tab === t ? (CLASS_COLOR[t] || CY) : "#5A7A9A",
                  border: `1px solid ${tab === t ? (CLASS_COLOR[t] || CY) + "55" : "#1A2A3A"}` }}>
                {t}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            placeholder="Search tasks…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", fontSize: 10, padding: "4px 8px",
              borderRadius: 5, background: "rgba(0,207,255,0.04)", border: `1px solid ${BORDER}`,
              color: "#DCEBF5", outline: "none", marginBottom: 8, fontFamily: FONT }}
          />

          {loading && (
            <div style={{ color: "#5A7A9A", fontSize: 10, textAlign: "center", padding: 10 }}>
              Loading…
            </div>
          )}

          {/* Task rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {filtered.map((t, i) => (
              <div key={t.id || i}
                onClick={() => setExpanded(expanded === i ? null : i)}
                style={{ background: `${CLASS_COLOR[t.cls]}0A`, border: `1px solid ${CLASS_COLOR[t.cls]}33`,
                  borderRadius: 6, padding: "6px 9px", cursor: "pointer",
                  display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4,
                    background: `${CLASS_COLOR[t.cls]}22`, color: CLASS_COLOR[t.cls],
                    border: `1px solid ${CLASS_COLOR[t.cls]}55`, whiteSpace: "nowrap" }}>
                    {t.cls.replace(/_/g, " ")}
                  </span>
                  <span style={{ fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.name || t.title || t.id || "Unnamed Task"}
                  </span>
                  <span style={{ fontSize: 9, color: "#5A7A9A" }}>
                    AC:{t.matchedActor.length} DS:{t.matchedDataset.length} KB:{t.matchedKb.length}
                  </span>
                  <span style={{ fontSize: 10, color: "#5A7A9A" }}>{expanded === i ? "▲" : "▼"}</span>
                </div>

                {expanded === i && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                    {t.matchedActor.length > 0 && (
                      <div>
                        <div style={{ fontSize: 9, color: OR, marginBottom: 3, letterSpacing: 1 }}>
                          INTEL PROFILES ({t.matchedActor.length})
                        </div>
                        {t.matchedActor.slice(0, 4).map((p, pi) => (
                          <div key={p.id || pi} style={{ background: `${OR}11`, border: `1px solid ${OR}33`,
                            borderRadius: 5, padding: "4px 7px", marginBottom: 3 }}>
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <span style={{ fontSize: 10, flex: 1 }}>{p.name || p.id || "Actor"}</span>
                              {p.role && (
                                <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3,
                                  background: `${OR}22`, color: OR, border: `1px solid ${OR}44` }}>
                                  {p.role.toUpperCase()}
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={score(actorText(p), keywords(taskText(t)))} max={maxActor} color={OR} />
                          </div>
                        ))}
                      </div>
                    )}

                    {t.matchedDataset.length > 0 && (
                      <div>
                        <div style={{ fontSize: 9, color: PU, marginBottom: 3, letterSpacing: 1 }}>
                          DATASETS ({t.matchedDataset.length})
                        </div>
                        {t.matchedDataset.slice(0, 4).map((d, di) => (
                          <div key={d.id || di} style={{ background: `${PU}11`, border: `1px solid ${PU}33`,
                            borderRadius: 5, padding: "4px 7px", marginBottom: 3 }}>
                            <span style={{ fontSize: 10 }}>{d.name || d.title || d.id || "Dataset"}</span>
                            <RelevanceBar score={score(datasetText(d), keywords(taskText(t)))} max={maxDataset} color={PU} />
                          </div>
                        ))}
                      </div>
                    )}

                    {t.matchedKb.length > 0 && (
                      <div>
                        <div style={{ fontSize: 9, color: GR, marginBottom: 3, letterSpacing: 1 }}>
                          KB ARTICLES ({t.matchedKb.length})
                        </div>
                        {t.matchedKb.slice(0, 4).map((a, ai) => (
                          <div key={a.id || ai} style={{ background: `${GR}11`, border: `1px solid ${GR}33`,
                            borderRadius: 5, padding: "4px 7px", marginBottom: 3 }}>
                            <span style={{ fontSize: 10 }}>{a.title || a.id || "Article"}</span>
                            <RelevanceBar score={score(kbText(a), keywords(taskText(t)))} max={maxKb} color={GR} />
                          </div>
                        ))}
                      </div>
                    )}

                    {t.matchedActor.length === 0 && t.matchedDataset.length === 0 && t.matchedKb.length === 0 && (
                      <div style={{ fontSize: 10, color: "#5A7A9A", fontStyle: "italic" }}>
                        No intel-profile, dataset, or KB article correlated — task is operationally uncovered.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {filtered.length === 0 && !loading && !error && (
            <div style={{ color: "#5A7A9A", fontSize: 11, textAlign: "center", padding: 20 }}>
              No tasks match current filter.
            </div>
          )}

          <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={assess} disabled={assessing}
              style={{ fontSize: 10, padding: "4px 12px", borderRadius: 5, cursor: "pointer",
                background: assessing ? "rgba(0,207,255,0.1)" : `${CY}22`,
                color: CY, border: `1px solid ${CY}55` }}>
              {assessing ? "Assessing…" : "▶ ASSESS COVERAGE"}
            </button>
            <button onClick={load} style={{ fontSize: 9, padding: "3px 8px", borderRadius: 5,
              cursor: "pointer", background: "rgba(0,207,255,0.05)",
              color: "#5A7A9A", border: `1px solid ${BORDER}` }}>↺</button>
          </div>

          {brief && (
            <div style={{ marginTop: 8, fontSize: 11, color: "#DCEBF5", lineHeight: 1.5,
              background: `${CY}09`, border: `1px solid ${CY}22`, borderRadius: 6,
              padding: "8px 10px" }}>{brief}</div>
          )}
        </div>
      )}
    </>
  );
}
