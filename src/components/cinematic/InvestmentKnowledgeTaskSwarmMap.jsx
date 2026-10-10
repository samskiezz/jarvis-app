/**
 * F219 — Investment × Knowledge × Task × SwarmJob Strategic Autonomy Coverage Map (SACMAP)
 *
 * Parallel-fetches /entities/Investment + /knowledge/ + /entities/Task + /entities/SwarmJob
 * and keyword-correlates each investment against KB articles AND tasks AND swarm jobs to classify:
 *
 *   FULLY_AUTOMATED — matched KB articles + tasks + swarm jobs (full autonomous coverage)
 *   DUAL_RESOURCED  — matched any two of three sources
 *   SINGLE_LINKED   — matched exactly one source
 *   UNMANAGED       — no matches in any source (portfolio automation gap)
 *
 * Stat tiles: INVESTMENTS / KB ARTICLES / TASKS / SWARM JOBS + four class counts + AUTOMATION%.
 * Amber badge on UNMANAGED count.
 * Filter tabs ALL / FULLY_AUTOMATED / DUAL_RESOURCED / SINGLE_LINKED / UNMANAGED + text search.
 * Expand investment → matched KB article cards (green) + task cards (cyan) + swarm job cards (purple).
 * ▶ ASSESS COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:sacmap-toggle event.
 *
 * Voice triggers:
 *   "sacmap / investment autonomy / strategic autonomy / unmanaged investment /
 *    investment task swarm / portfolio automation / strategic coverage map"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_065_000;
const Z_INDEX  = 280;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const SACMAP_RE = /\b(sacmap|investment[\s-]autonomy|strategic[\s-]autonomy|unmanaged[\s-]investment|investment[\s-]task[\s-]swarm|portfolio[\s-]automation|strategic[\s-]coverage[\s-]map)\b/i;

export function isSacmapQuery(q = "") { return SACMAP_RE.test(q); }

export async function buildSacmapScript() {
  const base = apiBase();
  const [invRes, kbRes, tskRes, swmRes] = await Promise.allSettled([
    fetch(`${base}/entities/Investment`).then(r => r.json()),
    fetch(`${base}/knowledge/`).then(r => r.json()),
    fetch(`${base}/entities/Task`).then(r => r.json()),
    fetch(`${base}/entities/SwarmJob`).then(r => r.json()),
  ]);
  const investments = invRes.status === "fulfilled" ? (invRes.value?.items || invRes.value || []) : [];
  const articles    = kbRes.status  === "fulfilled" ? (kbRes.value?.items  || kbRes.value  || []) : [];
  const tasks       = tskRes.status === "fulfilled" ? (tskRes.value?.items || tskRes.value || []) : [];
  const swarmJobs   = swmRes.status === "fulfilled" ? (swmRes.value?.items || swmRes.value || []) : [];

  let fullyAutomated = 0, unmanaged = 0;
  for (const inv of investments) {
    const kws    = keywords(investText(inv));
    const hasKb  = articles.some(a => scoreText(kbText(a), kws) > 0);
    const hasTsk = tasks.some(t => scoreText(taskText(t), kws) > 0);
    const hasSwm = swarmJobs.some(s => scoreText(swarmText(s), kws) > 0);
    if (hasKb && hasTsk && hasSwm) fullyAutomated++;
    else if (!hasKb && !hasTsk && !hasSwm) unmanaged++;
  }
  const total        = investments.length;
  const automationPct = total ? Math.round((fullyAutomated / total) * 100) : 0;
  return `SACMAP Strategic Autonomy Coverage Map online, sir. I have cross-referenced ${total} investments against ${articles.length} knowledge base articles, ${tasks.length} active tasks, and ${swarmJobs.length} swarm jobs. ${fullyAutomated} investments are fully automated across all three operational dimensions, representing ${automationPct}% strategic coverage. ${unmanaged} investments have no linked knowledge, tasks, or swarm automation — these are unmanaged portfolio positions requiring immediate strategic review, sir.`;
}

const GD   = "#F59E0B";
const CY   = "#00CFFF";
const AM   = "#F59E0B";
const RD   = "#EF4444";
const GR   = "#22C55E";
const PU   = "#A855F7";
const BG   = "rgba(6,11,22,0.97)";
const FONT = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_AUTOMATED: GR,
  DUAL_RESOURCED:  CY,
  SINGLE_LINKED:   GD,
  UNMANAGED:       AM,
};

const TABS = ["ALL", "FULLY_AUTOMATED", "DUAL_RESOURCED", "SINGLE_LINKED", "UNMANAGED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function investText(i) {
  return [i.name, i.title, i.type, i.sector, i.description, i.tags, i.category, i.ticker, i.currency].filter(Boolean).join(" ");
}
function kbText(a) {
  return [a.name, a.title, a.description, a.content, a.tags, a.category, a.topic].filter(Boolean).join(" ");
}
function taskText(t) {
  return [t.name, t.title, t.description, t.type, t.tags, t.priority, t.status, t.category].filter(Boolean).join(" ");
}
function swarmText(s) {
  return [s.name, s.title, s.description, s.type, s.tags, s.status, s.category, s.target].filter(Boolean).join(" ");
}

function classify(investment, articles, tasks, swarmJobs) {
  const kws      = keywords(investText(investment));
  const matchedKb  = articles
    .map(a => ({ ...a, _score: scoreText(kbText(a), kws) }))
    .filter(a => a._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const matchedTsk = tasks
    .map(t => ({ ...t, _score: scoreText(taskText(t), kws) }))
    .filter(t => t._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const matchedSwm = swarmJobs
    .map(s => ({ ...s, _score: scoreText(swarmText(s), kws) }))
    .filter(s => s._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);

  const hasKb  = matchedKb.length > 0;
  const hasTsk = matchedTsk.length > 0;
  const hasSwm = matchedSwm.length > 0;
  const matchCount = [hasKb, hasTsk, hasSwm].filter(Boolean).length;

  let cls;
  if (matchCount === 3)      cls = "FULLY_AUTOMATED";
  else if (matchCount === 2) cls = "DUAL_RESOURCED";
  else if (matchCount === 1) cls = "SINGLE_LINKED";
  else                       cls = "UNMANAGED";

  return { ...investment, _cls: cls, _kb: matchedKb, _tasks: matchedTsk, _swarm: matchedSwm };
}

function smallBtn(col) {
  return {
    fontFamily: FONT, fontSize: 10, background: "transparent",
    border: `1px solid ${col}55`, color: col, padding: "2px 7px",
    borderRadius: 3, cursor: "pointer",
  };
}

function RelevanceBar({ score, max, col }) {
  const pct = max > 0 ? Math.min(100, Math.round((score / max) * 100)) : 0;
  return (
    <div style={{ height: 3, background: "#1A2A3A", borderRadius: 2, marginTop: 3, width: "100%" }}>
      <div style={{ height: 3, width: pct + "%", background: col, borderRadius: 2, transition: "width 0.4s" }} />
    </div>
  );
}

export default function InvestmentKnowledgeTaskSwarmMap() {
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [investments, setInvestments] = useState([]);
  const [articles, setArticles]       = useState([]);
  const [tasks, setTasks]             = useState([]);
  const [swarmJobs, setSwarmJobs]     = useState([]);
  const [classified, setClassified]   = useState([]);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [brief, setBrief]       = useState("");
  const [assessing, setAssessing] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = apiBase();
      const [invRes, kbRes, tskRes, swmRes] = await Promise.allSettled([
        fetch(`${base}/entities/Investment`).then(r => r.json()),
        fetch(`${base}/knowledge/`).then(r => r.json()),
        fetch(`${base}/entities/Task`).then(r => r.json()),
        fetch(`${base}/entities/SwarmJob`).then(r => r.json()),
      ]);
      const inv = invRes.status === "fulfilled" ? (invRes.value?.items || invRes.value || []) : [];
      const kb  = kbRes.status  === "fulfilled" ? (kbRes.value?.items  || kbRes.value  || []) : [];
      const tsk = tskRes.status === "fulfilled" ? (tskRes.value?.items || tskRes.value || []) : [];
      const swm = swmRes.status === "fulfilled" ? (swmRes.value?.items || swmRes.value || []) : [];
      setInvestments(inv);
      setArticles(kb);
      setTasks(tsk);
      setSwarmJobs(swm);
      setClassified(inv.map(i => classify(i, kb, tsk, swm)));
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
    window.addEventListener("jarvis:sacmap-toggle", onToggle);
    return () => window.removeEventListener("jarvis:sacmap-toggle", onToggle);
  }, []);

  const fullyAutomated = classified.filter(c => c._cls === "FULLY_AUTOMATED").length;
  const dualResourced  = classified.filter(c => c._cls === "DUAL_RESOURCED").length;
  const singleLinked   = classified.filter(c => c._cls === "SINGLE_LINKED").length;
  const unmanaged      = classified.filter(c => c._cls === "UNMANAGED").length;
  const total          = classified.length;
  const automationPct  = total ? Math.round((fullyAutomated / total) * 100) : 0;

  const visible = classified
    .filter(c => tab === "ALL" || c._cls === tab)
    .filter(c => !search || investText(c).toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const ctx = `SACMAP: ${total} investments — FULLY_AUTOMATED: ${fullyAutomated}, DUAL_RESOURCED: ${dualResourced}, SINGLE_LINKED: ${singleLinked}, UNMANAGED: ${unmanaged} (${automationPct}% full automation). KB articles: ${articles.length}. Tasks: ${tasks.length}. Swarm jobs: ${swarmJobs.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `SACMAP strategic autonomy coverage assessment. Context: ${ctx}. Provide a 2-sentence brief identifying which unmanaged investments present the highest strategic exposure and what immediate automation or monitoring actions should be prioritised. Be concise and direct.` }),
      });
      const d = await r.json();
      const txt = (d.answer || "Coverage assessment unavailable.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(txt);
      const tts = await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: txt }),
      });
      if (tts.ok) {
        const blob = await tts.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play().catch(() => {});
      }
    } catch (e) {
      setBrief("Assessment unavailable: " + e.message);
    } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Investment × Knowledge × Task × SwarmJob Strategic Autonomy Coverage Map (SACMAP)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 10, letterSpacing: 1,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${AM}55`,
          color: AM, padding: "3px 7px", borderRadius: 4, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {unmanaged > 0 && (
          <span style={{ background: AM, color: "#000", borderRadius: 3, padding: "0 4px", marginRight: 4, fontSize: 9 }}>
            {unmanaged}
          </span>
        )}
        ◈ SACMAP
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: Z_INDEX,
      background: BG, fontFamily: FONT, overflowY: "auto", padding: "18px 20px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ color: AM, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>◈ SACMAP</span>
        <span style={{ color: "#6E8AA0", fontSize: 10, flex: 1 }}>
          Investment × Knowledge × Task × SwarmJob Strategic Autonomy Coverage Map
        </span>
        {loading && <span style={{ color: AM, fontSize: 10 }}>◌ loading…</span>}
        <button onClick={load} style={smallBtn(CY)} title="Refresh">↺</button>
        <button onClick={() => setOpen(false)} style={smallBtn(RD)}>✕</button>
      </div>

      {error && (
        <div style={{ color: RD, fontSize: 11, marginBottom: 10, padding: "6px 10px", border: `1px solid ${RD}44`, borderRadius: 4 }}>
          {error}
        </div>
      )}

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {[
          ["INVESTMENTS",     total,             AM],
          ["KB ARTICLES",     articles.length,   GR],
          ["TASKS",           tasks.length,      CY],
          ["SWARM JOBS",      swarmJobs.length,  PU],
          ["FULLY AUTOMATED", fullyAutomated,    GR],
          ["DUAL RESOURCED",  dualResourced,     CY],
          ["SINGLE LINKED",   singleLinked,      AM],
          ["UNMANAGED",       unmanaged,         RD],
          ["AUTOMATION%",     automationPct + "%", automationPct >= 70 ? GR : automationPct >= 40 ? AM : RD],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: "rgba(245,158,11,0.04)", border: `1px solid ${col}33`,
            borderRadius: 5, padding: "5px 10px", minWidth: 80, textAlign: "center",
          }}>
            <div style={{ color: col, fontSize: 14, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#4A6A80", fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Automation coverage bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: "#4A6A80", letterSpacing: 1, marginBottom: 3 }}>
          STRATEGIC AUTOMATION COVERAGE — {automationPct}%
        </div>
        <div style={{ height: 6, background: "#0D1825", borderRadius: 3 }}>
          <div style={{
            height: 6, borderRadius: 3, transition: "width 0.6s",
            width: automationPct + "%",
            background: automationPct >= 70 ? GR : automationPct >= 40 ? AM : RD,
          }} />
        </div>
      </div>

      {/* Assess button */}
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={assess} disabled={assessing || loading} style={{
          ...smallBtn(AM), fontSize: 11, padding: "4px 12px",
          opacity: assessing ? 0.5 : 1,
        }}>
          {assessing ? "◌ assessing…" : "▶ ASSESS COVERAGE"}
        </button>
        {brief && (
          <div style={{ color: "#DCEBF5", fontSize: 11, lineHeight: 1.5, flex: 1, minWidth: 200 }}>
            {brief}
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            ...smallBtn(tab === t ? AM : "#4A6A80"),
            background: tab === t ? AM + "22" : "transparent",
          }}>
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search investments…"
          style={{
            background: "rgba(245,158,11,0.05)", border: `1px solid ${AM}33`,
            color: "#DCEBF5", fontFamily: FONT, fontSize: 10, padding: "2px 8px",
            borderRadius: 3, outline: "none", width: 170,
          }}
        />
        <span style={{ color: "#4A6A80", fontSize: 9, marginLeft: "auto" }}>
          {visible.length}/{total} investments
        </span>
      </div>

      {/* Investment list */}
      {loading && !classified.length ? (
        <div style={{ color: "#4A6A80", fontSize: 11, padding: 20 }}>◌ loading investments…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {visible.map((inv, i) => {
            const col    = CLASS_COLOR[inv._cls] || "#6E8AA0";
            const isExp  = expanded === i;
            const maxKb  = inv._kb[0]?._score || 1;
            const maxTsk = inv._tasks[0]?._score || 1;
            const maxSwm = inv._swarm[0]?._score || 1;
            return (
              <div key={i} style={{
                border: `1px solid ${col}33`, borderRadius: 5,
                background: "rgba(245,158,11,0.02)", overflow: "hidden",
              }}>
                <div
                  onClick={() => setExpanded(isExp ? null : i)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer" }}
                >
                  <span style={{
                    fontSize: 9, letterSpacing: 1, color: col,
                    border: `1px solid ${col}55`, borderRadius: 3, padding: "1px 5px",
                    whiteSpace: "nowrap",
                  }}>
                    {inv._cls}
                  </span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {inv.name || inv.title || `Investment ${i + 1}`}
                  </span>
                  {inv.type && (
                    <span style={{ fontSize: 9, color: "#4A6A80" }}>{inv.type}</span>
                  )}
                  {inv.sector && (
                    <span style={{ fontSize: 9, color: "#4A6A80", marginLeft: 4 }}>{inv.sector}</span>
                  )}
                  <span style={{ color: "#4A6A80", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                </div>

                {isExp && (
                  <div style={{ padding: "0 10px 10px" }}>
                    {inv.description && (
                      <div style={{ color: "#6E8AA0", fontSize: 10, marginBottom: 6 }}>
                        {inv.description}
                      </div>
                    )}

                    {/* Matched KB articles */}
                    {inv._kb.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ color: GR, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          ◈ MATCHED KB ARTICLES ({inv._kb.length})
                        </div>
                        {inv._kb.map((a, ai) => (
                          <div key={ai} style={{
                            background: GR + "11", border: `1px solid ${GR}33`,
                            borderRadius: 4, padding: "5px 8px", marginBottom: 4,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: GR, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {a.name || a.title || `Article ${ai + 1}`}
                              </span>
                              {a.category && (
                                <span style={{ fontSize: 8, color: GR, border: `1px solid ${GR}55`, borderRadius: 2, padding: "0 3px" }}>
                                  {a.category}
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={a._score} max={maxKb} col={GR} />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Matched tasks */}
                    {inv._tasks.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          ◈ MATCHED TASKS ({inv._tasks.length})
                        </div>
                        {inv._tasks.map((t, ti) => (
                          <div key={ti} style={{
                            background: CY + "11", border: `1px solid ${CY}33`,
                            borderRadius: 4, padding: "5px 8px", marginBottom: 4,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: CY, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {t.name || t.title || `Task ${ti + 1}`}
                              </span>
                              {t.priority && (
                                <span style={{ fontSize: 8, color: CY, border: `1px solid ${CY}55`, borderRadius: 2, padding: "0 3px" }}>
                                  {t.priority}
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={t._score} max={maxTsk} col={CY} />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Matched swarm jobs */}
                    {inv._swarm.length > 0 && (
                      <div>
                        <div style={{ color: PU, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          ◈ MATCHED SWARM JOBS ({inv._swarm.length})
                        </div>
                        {inv._swarm.map((s, si) => (
                          <div key={si} style={{
                            background: PU + "11", border: `1px solid ${PU}33`,
                            borderRadius: 4, padding: "5px 8px", marginBottom: 4,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: PU, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {s.name || s.title || `Swarm Job ${si + 1}`}
                              </span>
                              {s.status && (
                                <span style={{ fontSize: 8, color: PU, border: `1px solid ${PU}55`, borderRadius: 2, padding: "0 3px" }}>
                                  {s.status}
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={s._score} max={maxSwm} col={PU} />
                          </div>
                        ))}
                      </div>
                    )}

                    {inv._cls === "UNMANAGED" && (
                      <div style={{ color: "#6E8AA0", fontSize: 10, fontStyle: "italic", marginTop: 4 }}>
                        No matching KB articles, tasks, or swarm jobs found. Investment has no automated operational coverage.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {visible.length === 0 && !loading && (
            <div style={{ color: "#4A6A80", fontSize: 11, padding: "20px 0", textAlign: "center" }}>
              No investments match current filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
