/**
 * F185 — SwarmJob × Scenario × Knowledge Autonomous Mission Coverage (AMCOV)
 *
 * Parallel-fetches /entities/SwarmJob + /v1/scenario/list + /knowledge/
 * and keyword-correlates each swarm job against scenario playbooks AND KB
 * articles to classify:
 *
 *   FULLY_AUTONOMOUS  — matched scenario + KB article (full coverage)
 *   PLAYBOOK_ONLY     — scenario match, no KB article
 *   KNOWLEDGE_ONLY    — KB match, no scenario playbook
 *   DARK              — no matches (autonomy gap)
 *
 * Stat tiles: SWARM JOBS / SCENARIOS / KB ARTICLES + four class counts + COVERED%.
 * Amber badge on DARK count.
 * Filter tabs ALL / FULLY_AUTONOMOUS / PLAYBOOK_ONLY / KNOWLEDGE_ONLY / DARK + text search.
 * Expand job → matched scenario cards (cyan) + KB article cards (green) with relevance bars.
 * ▶ ASSESS MISSION COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:amcov-toggle event.
 *
 * Voice triggers:
 *   "amcov / swarm coverage / autonomous mission / swarm scenario knowledge /
 *    dark swarm / swarm playbook / swarm knowledge coverage / mission coverage swarm"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_045_960;
const Z_INDEX  = 246;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const AMCOV_RE = /\b(amcov|swarm[\s-]coverage|autonomous[\s-]mission|swarm[\s-]scenario[\s-]knowledge|dark[\s-]swarm|swarm[\s-]playbook|swarm[\s-]knowledge[\s-]coverage|mission[\s-]coverage[\s-]swarm)\b/i;

export function isAmcovQuery(q = "") { return AMCOV_RE.test(q); }

export async function buildAmcovScript() {
  const base = apiBase();
  const [jobsRes, scenRes, kbRes] = await Promise.allSettled([
    fetch(`${base}/entities/SwarmJob`).then(r => r.json()),
    fetch(`${base}/v1/scenario/list`).then(r => r.json()),
    fetch(`${base}/knowledge/`).then(r => r.json()),
  ]);
  const jobs      = (jobsRes.status === "fulfilled" ? (jobsRes.value?.items || jobsRes.value || []) : []);
  const scenarios = (scenRes.status === "fulfilled" ? (scenRes.value?.items || scenRes.value || []) : []);
  const articles  = (kbRes.status  === "fulfilled"  ? (kbRes.value?.items  || kbRes.value  || []) : []);
  const dark = jobs.filter(j => {
    const kws = keywords(jobText(j));
    const hasSc = scenarios.some(s => scoreText(scenText(s), kws) > 0);
    const hasKb = articles.some(a  => scoreText(artText(a),  kws) > 0);
    return !hasSc && !hasKb;
  }).length;
  const total   = jobs.length;
  const covered = total - dark;
  const pct     = total ? Math.round((covered / total) * 100) : 0;
  return `AMCOV Autonomous Mission Coverage online, sir. I am correlating ${total} swarm jobs against ${scenarios.length} scenario playbooks and ${articles.length} KB articles. ${covered} jobs have coverage — ${pct}% autonomous readiness. ${dark} swarm job${dark === 1 ? "" : "s"} remain dark with no playbook and no knowledge backing. Recommend assigning playbooks or knowledge resources to those dark missions immediately.`;
}

const CY     = "#00CFFF";
const GR     = "#22C55E";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const BL     = "#3B82F6";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_AUTONOMOUS: GR,
  PLAYBOOK_ONLY:    CY,
  KNOWLEDGE_ONLY:   BL,
  DARK:             AM,
};

const STATUS_COLOR = {
  running:   GR,
  completed: CY,
  pending:   AM,
  failed:    RD,
};

const TABS = ["ALL", "FULLY_AUTONOMOUS", "PLAYBOOK_ONLY", "KNOWLEDGE_ONLY", "DARK"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function jobText(j) {
  return [j.name, j.title, j.description, j.objective, j.type, j.status, j.tags].filter(Boolean).join(" ");
}
function scenText(s) {
  return [s.name, s.title, s.description, s.type, s.tags].filter(Boolean).join(" ");
}
function artText(a) {
  return [a.title, a.name, a.content, a.summary, a.category, a.tags].filter(Boolean).join(" ");
}

function classify(job, scenarios, articles) {
  const kws = keywords(jobText(job));
  const matchedSc = scenarios
    .map(s => ({ ...s, _score: scoreText(scenText(s), kws) }))
    .filter(s => s._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 4);
  const matchedKb = articles
    .map(a => ({ ...a, _score: scoreText(artText(a), kws) }))
    .filter(a => a._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 4);
  const hasSc = matchedSc.length > 0;
  const hasKb = matchedKb.length > 0;
  let cls;
  if (hasSc && hasKb)  cls = "FULLY_AUTONOMOUS";
  else if (hasSc)      cls = "PLAYBOOK_ONLY";
  else if (hasKb)      cls = "KNOWLEDGE_ONLY";
  else                 cls = "DARK";
  return { ...job, _cls: cls, _sc: matchedSc, _kb: matchedKb };
}

export default function SwarmScenarioKnowledgeCoverage() {
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [jobs, setJobs]       = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [articles, setArticles]   = useState([]);
  const [classified, setClassified] = useState([]);
  const [tab, setTab]         = useState("ALL");
  const [search, setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [brief, setBrief]     = useState("");
  const [assessing, setAssessing] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = apiBase();
      const [jobsRes, scenRes, kbRes] = await Promise.allSettled([
        fetch(`${base}/entities/SwarmJob`).then(r => r.json()),
        fetch(`${base}/v1/scenario/list`).then(r => r.json()),
        fetch(`${base}/knowledge/`).then(r => r.json()),
      ]);
      const js = jobsRes.status === "fulfilled" ? (jobsRes.value?.items || jobsRes.value || []) : [];
      const sc = scenRes.status === "fulfilled"  ? (scenRes.value?.items || scenRes.value || []) : [];
      const kb = kbRes.status  === "fulfilled"   ? (kbRes.value?.items  || kbRes.value  || []) : [];
      setJobs(js);
      setScenarios(sc);
      setArticles(kb);
      setClassified(js.map(j => classify(j, sc, kb)));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:amcov-toggle", onToggle);
    return () => window.removeEventListener("jarvis:amcov-toggle", onToggle);
  }, []);

  const fully    = classified.filter(s => s._cls === "FULLY_AUTONOMOUS").length;
  const playbk   = classified.filter(s => s._cls === "PLAYBOOK_ONLY").length;
  const knowl    = classified.filter(s => s._cls === "KNOWLEDGE_ONLY").length;
  const dark     = classified.filter(s => s._cls === "DARK").length;
  const total    = classified.length;
  const covPct   = total ? Math.round(((fully + playbk + knowl) / total) * 100) : 0;

  const visible = classified
    .filter(s => tab === "ALL" || s._cls === tab)
    .filter(s => !search || jobText(s).toLowerCase().includes(search.toLowerCase()));

  const assess = async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const base = apiBase();
      const ctx = `SwarmJobs:${total} Scenarios:${scenarios.length} KBArticles:${articles.length} FullyAutonomous:${fully} PlaybookOnly:${playbk} KnowledgeOnly:${knowl} Dark:${dark} Coverage:${covPct}%`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `In 2 sentences, assess the autonomous mission coverage for these swarm jobs: ${ctx}` }),
      });
      const d = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(txt);
      if (txt) {
        await fetch(`${base}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: txt }),
        }).then(async res => {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.play().catch(() => {});
        }).catch(() => {});
      }
    } catch (e) {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  };

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="SwarmJob × Scenario × Knowledge Autonomous Mission Coverage (AMCOV)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: open ? AM : "rgba(5,8,13,0.85)",
          border: `1px solid ${AM}`,
          color: open ? "#000" : AM,
          fontFamily: FONT, fontSize: 9, letterSpacing: 1,
          padding: "3px 7px", borderRadius: 3, cursor: "pointer",
          boxShadow: dark > 0 ? `0 0 8px ${AM}88` : "none",
          whiteSpace: "nowrap",
        }}
      >
        ◈ AMCOV
        {dark > 0 && (
          <span style={{
            marginLeft: 4, background: AM, color: "#000",
            borderRadius: 8, fontSize: 8, padding: "0 4px", fontWeight: 700,
          }}>{dark}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 36, left: Math.max(8, BTN_LEFT - 300),
          zIndex: Z_INDEX + 100, width: 800, maxHeight: "82vh",
          background: BG, border: `1px solid ${BORDER}`,
          borderRadius: 8, fontFamily: FONT, fontSize: 11,
          color: "#DCEBF5", overflow: "hidden", display: "flex", flexDirection: "column",
          boxShadow: `0 0 40px rgba(0,207,255,0.12)`,
        }}>
          {/* Header */}
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ color: AM, fontWeight: 700, letterSpacing: 2 }}>AMCOV</span>
              <span style={{ color: "#6B7280", marginLeft: 8, fontSize: 10 }}>SwarmJob × Scenario × Knowledge — Autonomous Mission Coverage</span>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ padding: "8px 14px", display: "flex", gap: 8, flexWrap: "wrap", borderBottom: `1px solid ${BORDER}` }}>
            {[
              { label: "SWARM JOBS",       val: jobs.length,      clr: CY },
              { label: "SCENARIOS",         val: scenarios.length, clr: BL },
              { label: "KB ARTICLES",       val: articles.length,  clr: GR },
              { label: "FULLY AUTONOMOUS",  val: fully,            clr: GR },
              { label: "PLAYBOOK ONLY",     val: playbk,           clr: CY },
              { label: "KNOWLEDGE ONLY",    val: knowl,            clr: BL },
              { label: "DARK",              val: dark,             clr: AM },
              { label: "COVERAGE%",         val: `${covPct}%`,     clr: covPct >= 70 ? GR : covPct >= 40 ? AM : RD },
            ].map(t => (
              <div key={t.label} style={{
                background: "rgba(0,0,0,0.3)", border: `1px solid ${t.clr}33`,
                borderRadius: 4, padding: "4px 8px", minWidth: 80, textAlign: "center",
              }}>
                <div style={{ color: t.clr, fontSize: 14, fontWeight: 700 }}>{loading ? "…" : t.val}</div>
                <div style={{ color: "#6B7280", fontSize: 8, letterSpacing: 1 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* Coverage bar */}
          {!loading && total > 0 && (
            <div style={{ padding: "4px 14px", borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ height: 4, background: "#1e2936", borderRadius: 2 }}>
                <div style={{ height: "100%", width: `${covPct}%`, background: covPct >= 70 ? GR : covPct >= 40 ? AM : RD, borderRadius: 2, transition: "width 0.4s" }} />
              </div>
            </div>
          )}

          {/* Controls */}
          <div style={{ padding: "6px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? AM : "rgba(0,0,0,0.4)",
                border: `1px solid ${tab === t ? AM : "#334155"}`,
                color: tab === t ? "#000" : "#94A3B8",
                fontFamily: FONT, fontSize: 9, padding: "2px 8px", borderRadius: 3, cursor: "pointer",
              }}>{t.replace(/_/g, " ")}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search swarm jobs…"
              style={{
                marginLeft: "auto", background: "rgba(0,0,0,0.4)", border: `1px solid #334155`,
                color: "#DCEBF5", fontFamily: FONT, fontSize: 10, padding: "2px 8px", borderRadius: 3,
                width: 160, outline: "none",
              }}
            />
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px" }}>
            {error && <div style={{ color: RD, padding: 8 }}>Error: {error}</div>}
            {!loading && !error && visible.length === 0 && (
              <div style={{ color: "#6B7280", padding: 12, textAlign: "center" }}>No swarm jobs match current filter.</div>
            )}
            {visible.map((j, i) => {
              const clr     = CLASS_COLOR[j._cls] || AM;
              const statClr = STATUS_COLOR[(j.status || "").toLowerCase()] || AM;
              const isExp   = expanded === i;
              return (
                <div key={j.id || i} style={{ marginBottom: 4 }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "5px 8px",
                      background: "rgba(0,0,0,0.3)", borderRadius: 4,
                      border: `1px solid ${isExp ? clr : "transparent"}`,
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ color: clr, fontSize: 9, letterSpacing: 1, minWidth: 130 }}>{j._cls.replace(/_/g, " ")}</span>
                    <span style={{ flex: 1, color: "#DCEBF5", fontSize: 10 }}>{j.name || j.title || "Unknown Job"}</span>
                    {j.status && <span style={{ color: statClr, fontSize: 8, border: `1px solid ${statClr}44`, borderRadius: 2, padding: "0 4px" }}>{j.status}</span>}
                    <span style={{ color: "#334155", fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{ padding: "6px 12px", background: "rgba(0,0,0,0.2)", borderRadius: "0 0 4px 4px", marginTop: 1 }}>
                      {j._sc.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>SCENARIOS ({j._sc.length})</div>
                          {j._sc.map((s, k) => (
                            <div key={k} style={{ marginBottom: 3, padding: "3px 6px", background: "rgba(0,207,255,0.06)", borderRadius: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{s.name || s.title || "Scenario"}</span>
                                {s.type && <span style={{ color: CY, fontSize: 8, border: `1px solid ${CY}33`, borderRadius: 2, padding: "0 3px" }}>{s.type}</span>}
                              </div>
                              <div style={{ marginTop: 2, height: 3, background: "#1e2936", borderRadius: 2 }}>
                                <div style={{ height: "100%", width: `${Math.min(100, (s._score / 5) * 100)}%`, background: CY, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {j._kb.length > 0 && (
                        <div>
                          <div style={{ color: GR, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>KB ARTICLES ({j._kb.length})</div>
                          {j._kb.map((a, k) => (
                            <div key={k} style={{ marginBottom: 3, padding: "3px 6px", background: "rgba(34,197,94,0.06)", borderRadius: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{a.title || a.name || "Article"}</span>
                                {a.category && <span style={{ color: GR, fontSize: 8, border: `1px solid ${GR}33`, borderRadius: 2, padding: "0 3px" }}>{a.category}</span>}
                              </div>
                              <div style={{ marginTop: 2, height: 3, background: "#1e2936", borderRadius: 2 }}>
                                <div style={{ height: "100%", width: `${Math.min(100, (a._score / 5) * 100)}%`, background: GR, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {j._sc.length === 0 && j._kb.length === 0 && (
                        <div style={{ color: "#6B7280", fontSize: 10, padding: "4px 0" }}>No scenario or KB coverage — autonomous mission gap.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ padding: "8px 14px", borderTop: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? "#1e2936" : AM, color: assessing ? "#6B7280" : "#000",
                border: "none", fontFamily: FONT, fontSize: 9, letterSpacing: 1,
                padding: "4px 12px", borderRadius: 3, cursor: assessing ? "not-allowed" : "pointer",
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS MISSION COVERAGE"}
            </button>
            {brief && <div style={{ flex: 1, color: "#94A3B8", fontSize: 10, lineHeight: 1.4 }}>{brief}</div>}
            <span style={{ color: "#334155", fontSize: 9, marginLeft: "auto" }}>
              auto-refresh 90s · /entities/SwarmJob · /v1/scenario/list · /knowledge/
            </span>
          </div>
        </div>
      )}
    </>
  );
}
