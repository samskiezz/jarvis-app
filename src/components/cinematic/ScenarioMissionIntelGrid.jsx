/**
 * F174 — Scenario × Knowledge × Contact × SwarmJob Mission Intelligence Grid (MKCSIG)
 *
 * Parallel-fetches /v1/scenario/list + /knowledge/ + /entities/Contact + /entities/SwarmJob
 * and keyword-correlates each scenario against KB articles AND contacts AND swarm jobs to classify:
 *
 *   FULLY_OPERATIONAL — matched all three resource types (maximum mission coverage)
 *   DUAL_RESOURCED    — matched any two resource types
 *   SINGLE_LINKED     — matched exactly one resource type
 *   UNRESOURCED       — no matches (mission intelligence gap)
 *
 * Stat tiles: SCENARIOS / KB ARTICLES / CONTACTS / SWARM JOBS + four class counts + COVERAGE%.
 * Amber badge on unresourced count.
 * Filter tabs ALL / FULLY_OPERATIONAL / DUAL_RESOURCED / SINGLE_LINKED / UNRESOURCED + text search.
 * Expand scenario → matched KB article cards (green) + contact cards (orange) + swarm job cards (cyan)
 *                   with relevance bars.
 * ▶ ASSESS MISSION INTELLIGENCE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:mkcsig-toggle event.
 *
 * Voice triggers: "mkcsig / scenario mission / mission grid / unresourced scenario /
 *                  scenario ops grid / mission intelligence grid"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_039_800;
const Z_INDEX  = 235;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const MKCSIG_RE = /\b(mkcsig|scenario[\s-]mission|mission[\s-]grid|unresourced[\s-]scenario|scenario[\s-]ops[\s-]grid|mission[\s-]intelligence[\s-]grid)\b/i;

const CY     = "#00CFFF";
const OR     = "#F97316";
const GR     = "#22C55E";
const CY2    = "#06B6D4";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_OPERATIONAL: GR,
  DUAL_RESOURCED:    CY,
  SINGLE_LINKED:     AM,
  UNRESOURCED:       RD,
};

const TABS = ["ALL", "FULLY_OPERATIONAL", "DUAL_RESOURCED", "SINGLE_LINKED", "UNRESOURCED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function scenText(s) {
  return `${s.name || s.title || ""} ${s.description || s.summary || ""} ${s.type || s.category || ""} ${(s.tags || []).join(" ")}`;
}
function kbText(a) {
  return `${a.title || a.name || ""} ${a.content || a.summary || a.description || ""} ${a.category || ""} ${(a.tags || []).join(" ")}`;
}
function contactText(c) {
  return `${c.name || c.full_name || ""} ${c.role || c.title || ""} ${c.org || c.organization || ""} ${c.email || ""} ${(c.tags || []).join(" ")}`;
}
function swarmText(j) {
  return `${j.name || j.title || ""} ${j.description || j.objective || ""} ${j.type || j.status || ""} ${(j.tags || []).join(" ")}`;
}

function normaliseArray(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw?.results)) return raw.results;
  return [];
}

async function loadAll() {
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const [scenRes, kbRes, conRes, swmRes] = await Promise.allSettled([
    fetch(`${apiBase}/v1/scenario/list`,    { headers }),
    fetch(`${apiBase}/knowledge/`,          { headers }),
    fetch(`${apiBase}/entities/Contact`,    { headers }),
    fetch(`${apiBase}/entities/SwarmJob`,   { headers }),
  ]);
  const scenarios = scenRes.status === "fulfilled" && scenRes.value.ok
    ? normaliseArray(await scenRes.value.json(), ["scenarios", "items"]) : [];
  const articles  = kbRes.status  === "fulfilled" && kbRes.value.ok
    ? normaliseArray(await kbRes.value.json(),  ["articles", "knowledge", "items"]) : [];
  const contacts  = conRes.status === "fulfilled" && conRes.value.ok
    ? normaliseArray(await conRes.value.json(), ["contacts", "items"]) : [];
  const swarmJobs = swmRes.status === "fulfilled" && swmRes.value.ok
    ? normaliseArray(await swmRes.value.json(), ["jobs", "swarm_jobs", "items"]) : [];
  return { scenarios, articles, contacts, swarmJobs };
}

function correlate(scenarios, articles, contacts, swarmJobs) {
  return scenarios.map(sc => {
    const kws = keywords(scenText(sc));
    const matchedArticles = articles
      .map(a => ({ a, rel: score(kbText(a), kws) }))
      .filter(x => x.rel > 0).sort((a, b) => b.rel - a.rel).slice(0, 4);
    const matchedContacts = contacts
      .map(c => ({ c, rel: score(contactText(c), kws) }))
      .filter(x => x.rel > 0).sort((a, b) => b.rel - a.rel).slice(0, 4);
    const matchedSwarm = swarmJobs
      .map(j => ({ j, rel: score(swarmText(j), kws) }))
      .filter(x => x.rel > 0).sort((a, b) => b.rel - a.rel).slice(0, 4);
    const hasA = matchedArticles.length > 0;
    const hasC = matchedContacts.length > 0;
    const hasS = matchedSwarm.length > 0;
    const matchCount = (hasA ? 1 : 0) + (hasC ? 1 : 0) + (hasS ? 1 : 0);
    const cls = matchCount === 3 ? "FULLY_OPERATIONAL"
              : matchCount === 2 ? "DUAL_RESOURCED"
              : matchCount === 1 ? "SINGLE_LINKED"
              :                    "UNRESOURCED";
    return { ...sc, _cls: cls, _articles: matchedArticles, _contacts: matchedContacts, _swarm: matchedSwarm };
  });
}

export function isMkcsigQuery(q = "") { return MKCSIG_RE.test(q); }

export async function buildMkcsigScript() {
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const [scenRes, kbRes, conRes, swmRes] = await Promise.allSettled([
    fetch(`${apiBase}/v1/scenario/list`,    { headers }),
    fetch(`${apiBase}/knowledge/`,          { headers }),
    fetch(`${apiBase}/entities/Contact`,    { headers }),
    fetch(`${apiBase}/entities/SwarmJob`,   { headers }),
  ]);
  const scenarios = scenRes.status === "fulfilled" && scenRes.value.ok
    ? normaliseArray(await scenRes.value.json(), ["scenarios", "items"]) : [];
  const articles  = kbRes.status  === "fulfilled" && kbRes.value.ok
    ? normaliseArray(await kbRes.value.json(),  ["articles", "knowledge", "items"]) : [];
  const contacts  = conRes.status === "fulfilled" && conRes.value.ok
    ? normaliseArray(await conRes.value.json(), ["contacts", "items"]) : [];
  const swarmJobs = swmRes.status === "fulfilled" && swmRes.value.ok
    ? normaliseArray(await swmRes.value.json(), ["jobs", "swarm_jobs", "items"]) : [];
  const rows     = correlate(scenarios, articles, contacts, swarmJobs);
  const fully    = rows.filter(r => r._cls === "FULLY_OPERATIONAL").length;
  const unres    = rows.filter(r => r._cls === "UNRESOURCED").length;
  const pct      = rows.length ? Math.round((rows.length - unres) / rows.length * 100) : 0;
  return `Mission Intelligence Grid online, sir. Across ${rows.length} scenarios cross-referenced against ${articles.length} knowledge articles, ${contacts.length} contacts, and ${swarmJobs.length} swarm jobs, ${fully} scenarios are fully operational. ${unres} remain unresourced — ${pct}% overall mission intelligence coverage. Opening the MKCSIG panel for full visibility now.`;
}

export default function ScenarioMissionIntelGrid() {
  const [open,       setOpen]       = useState(false);
  const [tab,        setTab]        = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [rows,       setRows]       = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [expanded,   setExpanded]   = useState(null);
  const [totals,     setTotals]     = useState({ scenarios: 0, articles: 0, contacts: 0, swarmJobs: 0 });
  const [assessing,  setAssessing]  = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { scenarios, articles, contacts, swarmJobs } = await loadAll();
      setTotals({ scenarios: scenarios.length, articles: articles.length, contacts: contacts.length, swarmJobs: swarmJobs.length });
      setRows(correlate(scenarios, articles, contacts, swarmJobs));
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(v => { if (!v) load(); return !v; }); };
    window.addEventListener("jarvis:mkcsig-toggle", toggle);
    return () => window.removeEventListener("jarvis:mkcsig-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true); setAssessment("");
    try {
      const body = await buildMkcsigScript();
      const res  = await fetch(`${apiBase}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
        },
        body: JSON.stringify({ message: `You are JARVIS. In exactly 2 sentences, assess this mission intelligence grid:\n${body}` }),
      });
      const data = await res.json();
      const txt  = data?.response || data?.message || data?.content || "";
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setAssessment("Unable to assess mission intelligence grid at this time, sir.");
    } finally {
      setAssessing(false);
    }
  }

  const counts = {
    FULLY_OPERATIONAL: rows.filter(r => r._cls === "FULLY_OPERATIONAL").length,
    DUAL_RESOURCED:    rows.filter(r => r._cls === "DUAL_RESOURCED").length,
    SINGLE_LINKED:     rows.filter(r => r._cls === "SINGLE_LINKED").length,
    UNRESOURCED:       rows.filter(r => r._cls === "UNRESOURCED").length,
  };
  const coveragePct = rows.length ? Math.round((rows.length - counts.UNRESOURCED) / rows.length * 100) : 0;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r._cls !== tab) return false;
    if (!search) return true;
    return scenText(r).toLowerCase().includes(search.toLowerCase());
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: "rgba(6,11,22,0.85)", border: "1px solid rgba(0,207,255,0.35)",
          color: CY, fontFamily: FONT, fontSize: 10, padding: "3px 7px",
          cursor: "pointer", borderRadius: 3, letterSpacing: 1,
        }}
      >
        ◈ MKCSIG{counts.UNRESOURCED > 0 && <span style={{ color: AM, marginLeft: 4 }}>{counts.UNRESOURCED}</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 50, right: 20, zIndex: Z_INDEX,
      width: 660, maxHeight: "78vh", display: "flex", flexDirection: "column",
      background: BG, border: `1px solid ${BORDER}`, borderRadius: 8,
      fontFamily: FONT, color: CY, boxShadow: "0 0 32px rgba(0,207,255,0.15)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", borderBottom: `1px solid ${BORDER}` }}>
        <span style={{ fontSize: 11, letterSpacing: 2, color: CY }}>◈ MKCSIG — MISSION INTELLIGENCE GRID</span>
        <button onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: RD, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", flexWrap: "wrap" }}>
        {[
          ["SCENARIOS",    totals.scenarios,          CY],
          ["KB ARTICLES",  totals.articles,            GR],
          ["CONTACTS",     totals.contacts,            OR],
          ["SWARM JOBS",   totals.swarmJobs,           CY2],
          ["FULLY OPS.",   counts.FULLY_OPERATIONAL,   GR],
          ["DUAL RES.",    counts.DUAL_RESOURCED,      CY],
          ["SINGLE",       counts.SINGLE_LINKED,       AM],
          ["UNRESOURCED",  counts.UNRESOURCED,         RD],
          [`COV ${coveragePct}%`, coveragePct,         coveragePct >= 80 ? GR : coveragePct >= 50 ? AM : RD],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: "rgba(0,0,0,0.35)", border: `1px solid ${col}33`,
            borderRadius: 4, padding: "4px 10px", textAlign: "center", minWidth: 66,
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: col }}>{val}</div>
            <div style={{ fontSize: 8, color: "#888", letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: "0 14px 8px" }}>
        <div style={{ height: 4, background: "#111", borderRadius: 2 }}>
          <div style={{ height: 4, width: `${coveragePct}%`,
            background: coveragePct >= 80 ? GR : AM,
            borderRadius: 2, transition: "width 0.4s" }} />
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 14px 8px", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? "rgba(0,207,255,0.15)" : "rgba(0,0,0,0.3)",
            border: `1px solid ${tab === t ? CY : "#333"}`,
            color: tab === t ? CY : "#666", fontSize: 9, padding: "3px 8px",
            cursor: "pointer", borderRadius: 3, letterSpacing: 1,
          }}>{t.replace(/_/g, " ")}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: "0 14px 8px" }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search scenarios..."
          style={{
            width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid #333",
            color: CY, fontFamily: FONT, fontSize: 10, padding: "4px 8px",
            borderRadius: 3, boxSizing: "border-box", outline: "none",
          }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 14px 8px" }}>
        {loading && <div style={{ color: "#555", fontSize: 10, padding: 8 }}>Loading…</div>}
        {error   && <div style={{ color: RD,   fontSize: 10, padding: 8 }}>{error}</div>}
        {!loading && visible.length === 0 && (
          <div style={{ color: "#555", fontSize: 10, padding: 8 }}>No scenarios match.</div>
        )}
        {visible.map((sc, i) => {
          const id    = sc.id || sc._id || i;
          const title = sc.name || sc.title || `Scenario ${i + 1}`;
          const type  = sc.type || sc.category || "";
          const isExp  = expanded === id;
          const col    = CLASS_COLOR[sc._cls] || CY;
          return (
            <div key={id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "rgba(0,0,0,0.3)", border: `1px solid ${col}33`,
                  borderRadius: 4, padding: "6px 10px", cursor: "pointer",
                }}
              >
                <div>
                  <span style={{ fontSize: 11, color: CY }}>{title}</span>
                  {type && <span style={{ fontSize: 9, color: "#666", marginLeft: 8 }}>{type}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 9, color: col, letterSpacing: 1 }}>{sc._cls.replace(/_/g, " ")}</span>
                  <span style={{ fontSize: 9, color: "#555" }}>{isExp ? "▲" : "▼"}</span>
                </div>
              </div>

              {isExp && (
                <div style={{ padding: "6px 10px", background: "rgba(0,0,0,0.2)",
                  borderLeft: `2px solid ${col}`, marginLeft: 4 }}>
                  {/* Matched KB articles */}
                  {sc._articles.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: GR, marginBottom: 4, letterSpacing: 1 }}>KB ARTICLES</div>
                      {sc._articles.map(({ a, rel }, k) => (
                        <div key={k} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ fontSize: 10, color: "#ccc" }}>{a.title || a.name || `Article ${k + 1}`}</span>
                            <span style={{ fontSize: 9, color: GR, padding: "1px 5px",
                              background: "rgba(34,197,94,0.1)", borderRadius: 2 }}>
                              {(a.category || "KB").toUpperCase()}
                            </span>
                          </div>
                          <div style={{ height: 3, background: "#111", borderRadius: 2 }}>
                            <div style={{ height: 3, width: `${Math.min(rel * 20, 100)}%`,
                              background: GR, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Matched contacts */}
                  {sc._contacts.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: OR, marginBottom: 4, letterSpacing: 1 }}>CONTACTS</div>
                      {sc._contacts.map(({ c, rel }, k) => (
                        <div key={k} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ fontSize: 10, color: "#ccc" }}>{c.name || c.full_name || `Contact ${k + 1}`}</span>
                            <span style={{ fontSize: 9, color: OR, padding: "1px 5px",
                              background: "rgba(249,115,22,0.1)", borderRadius: 2 }}>{c.role || c.title || "CONTACT"}</span>
                          </div>
                          <div style={{ height: 3, background: "#111", borderRadius: 2 }}>
                            <div style={{ height: 3, width: `${Math.min(rel * 20, 100)}%`,
                              background: OR, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Matched swarm jobs */}
                  {sc._swarm.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: CY2, marginBottom: 4, letterSpacing: 1 }}>SWARM JOBS</div>
                      {sc._swarm.map(({ j, rel }, k) => (
                        <div key={k} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ fontSize: 10, color: "#ccc" }}>{j.name || j.title || `Job ${k + 1}`}</span>
                            <span style={{ fontSize: 9, color: CY2, padding: "1px 5px",
                              background: "rgba(6,182,212,0.1)", borderRadius: 2 }}>
                              {(j.status || j.type || "SWARM").toUpperCase()}
                            </span>
                          </div>
                          <div style={{ height: 3, background: "#111", borderRadius: 2 }}>
                            <div style={{ height: 3, width: `${Math.min(rel * 20, 100)}%`,
                              background: CY2, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {sc._articles.length === 0 && sc._contacts.length === 0 && sc._swarm.length === 0 && (
                    <div style={{ fontSize: 9, color: "#555" }}>No KB articles, contacts, or swarm jobs matched this scenario.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assess */}
      <div style={{ padding: "8px 14px", borderTop: `1px solid ${BORDER}` }}>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? "rgba(0,0,0,0.3)" : "rgba(0,207,255,0.08)",
          border: `1px solid ${assessing ? "#333" : CY}`,
          color: assessing ? "#555" : CY, fontFamily: FONT, fontSize: 10,
          padding: "4px 12px", cursor: assessing ? "not-allowed" : "pointer", borderRadius: 3,
        }}>
          {assessing ? "Assessing…" : "▶ ASSESS MISSION INTELLIGENCE"}
        </button>
        {assessment && (
          <div style={{ marginTop: 8, fontSize: 10, color: "#aaa", lineHeight: 1.5,
            padding: "6px 10px", background: "rgba(0,207,255,0.05)",
            border: "1px solid rgba(0,207,255,0.15)", borderRadius: 4 }}>
            {assessment}
          </div>
        )}
      </div>
    </div>
  );
}
