/**
 * F206 — Knowledge × Scenario × SwarmJob × RiskSignal Defensive Playbook Coverage Index (DPCI)
 *
 * Parallel-fetches /entities/RiskSignal + /knowledge/ + /v1/scenario/list + /entities/SwarmJob
 * and keyword-correlates each risk signal against KB articles AND scenario playbooks AND swarm jobs
 * to classify:
 *
 *   FULLY_COVERED    — matched KB + scenario + swarm (all three)
 *   DUAL_COVERED     — matched any two of the three
 *   SINGLE_LINKED    — matched exactly one
 *   EXPOSED          — no matches (defensive playbook gap)
 *
 * Stat tiles: RISK SIGNALS / KB ARTICLES / SCENARIOS / SWARM JOBS + four class counts + COVERED%.
 * Amber badge on EXPOSED count.
 * Filter tabs ALL / FULLY_COVERED / DUAL_COVERED / SINGLE_LINKED / EXPOSED + text search.
 * Expand signal → matched KB article cards (green) + scenario cards (teal) + swarm job cards
 *   (purple) with relevance bars.
 * ▶ ASSESS COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:dpci-toggle event.
 *
 * Voice triggers:
 *   "dpci / defensive playbook / playbook coverage / risk playbook coverage /
 *    exposed risk signal / defensive coverage / playbook gap / risk coverage index"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_057_720;
const Z_INDEX  = 267;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const DPCI_RE = /\b(dpci|defensive[\s-]playbook|playbook[\s-]coverage|risk[\s-]playbook[\s-]coverage|exposed[\s-]risk[\s-]signal|defensive[\s-]coverage|playbook[\s-]gap|risk[\s-]coverage[\s-]index)\b/i;

export function isDpciQuery(q = "") { return DPCI_RE.test(q); }

function keywords(text = "") {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function scoreText(target = "", kws = []) {
  const t = target.toLowerCase();
  return kws.filter(k => t.includes(k)).length;
}

function signalText(s) {
  return [s.title, s.name, s.description, s.type, s.category, s.severity, (s.tags || []).join(" ")].filter(Boolean).join(" ");
}

function kbText(a) {
  return [a.title, a.name, a.content, a.summary, a.category, (a.tags || []).join(" ")].filter(Boolean).join(" ");
}

function scenarioText(s) {
  return [s.name, s.title, s.description, s.type, s.category, (s.tags || []).join(" ")].filter(Boolean).join(" ");
}

function swarmText(j) {
  return [j.name, j.title, j.description, j.type, j.status, (j.tags || []).join(" ")].filter(Boolean).join(" ");
}

export async function buildDpciScript() {
  const base = apiBase();
  const [sigRes, kbRes, scnRes, swmRes] = await Promise.allSettled([
    fetch(`${base}/entities/RiskSignal`).then(r => r.json()),
    fetch(`${base}/knowledge/`).then(r => r.json()),
    fetch(`${base}/v1/scenario/list`).then(r => r.json()),
    fetch(`${base}/entities/SwarmJob`).then(r => r.json()),
  ]);
  const signals   = (sigRes.status === "fulfilled" ? (sigRes.value?.items    || sigRes.value?.signals   || sigRes.value  || []) : []);
  const articles  = (kbRes.status  === "fulfilled" ? (kbRes.value?.items     || kbRes.value?.articles   || kbRes.value   || []) : []);
  const scenarios = (scnRes.status === "fulfilled" ? (scnRes.value?.items    || scnRes.value?.scenarios  || scnRes.value  || []) : []);
  const swarms    = (swmRes.status === "fulfilled" ? (swmRes.value?.items    || swmRes.value?.jobs       || swmRes.value  || []) : []);

  let exposed = 0, fullyCovered = 0;
  signals.forEach(s => {
    const kws  = keywords(signalText(s));
    const hasK = articles.some(a => scoreText(kbText(a), kws) > 0);
    const hasS = scenarios.some(sc => scoreText(scenarioText(sc), kws) > 0);
    const hasJ = swarms.some(j => scoreText(swarmText(j), kws) > 0);
    if (!hasK && !hasS && !hasJ) exposed++;
    if (hasK && hasS && hasJ)    fullyCovered++;
  });
  const total  = signals.length;
  const covPct = total ? Math.round(((total - exposed) / total) * 100) : 0;
  return `DPCI Defensive Playbook Coverage Index online, sir. I am cross-referencing ${total} active risk signals against ${articles.length} knowledge base articles, ${scenarios.length} scenario playbooks, and ${swarms.length} swarm automation jobs. ${fullyCovered} signal${fullyCovered === 1 ? "" : "s"} have full defensive coverage across knowledge, scenario, and swarm automation. ${exposed} signal${exposed === 1 ? "" : "s"} are completely exposed with no playbook, knowledge base, or swarm coverage — representing critical defensive gaps. Overall defensive coverage stands at ${covPct}%. Immediate action recommended: assign scenario playbooks and swarm jobs to all exposed risk signals.`;
}

const CY     = "#00CFFF";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const GN     = "#22C55E";
const TE     = "#14B8A6";
const PU     = "#A855F7";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_COVERED: GN,
  DUAL_COVERED:  CY,
  SINGLE_LINKED: AM,
  EXPOSED:       RD,
};

const TABS = ["ALL", "FULLY_COVERED", "DUAL_COVERED", "SINGLE_LINKED", "EXPOSED"];

function classify(sig, articles, scenarios, swarms) {
  const kws  = keywords(signalText(sig));
  const hasK = articles.some(a => scoreText(kbText(a), kws) > 0);
  const hasS = scenarios.some(sc => scoreText(scenarioText(sc), kws) > 0);
  const hasJ = swarms.some(j => scoreText(swarmText(j), kws) > 0);
  const count = [hasK, hasS, hasJ].filter(Boolean).length;
  if (count === 3) return "FULLY_COVERED";
  if (count === 2) return "DUAL_COVERED";
  if (count === 1) return "SINGLE_LINKED";
  return "EXPOSED";
}

function getMatches(sig, list, textFn, max = 3) {
  const kws = keywords(signalText(sig));
  return list
    .map(item => ({ item, score: scoreText(textFn(item), kws) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}

const SEV_COLOR = { CRITICAL: RD, HIGH: AM, MEDIUM: "#EAB308", LOW: "#6B7280" };

export default function DefensivePlaybookCoverageIndex() {
  const [open,      setOpen]      = useState(false);
  const [signals,   setSignals]   = useState([]);
  const [articles,  setArticles]  = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [swarms,    setSwarms]    = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const base = apiBase();
    const [sigR, kbR, scnR, swmR] = await Promise.allSettled([
      fetch(`${base}/entities/RiskSignal`).then(r => r.json()),
      fetch(`${base}/knowledge/`).then(r => r.json()),
      fetch(`${base}/v1/scenario/list`).then(r => r.json()),
      fetch(`${base}/entities/SwarmJob`).then(r => r.json()),
    ]);
    setSignals(sigR.status   === "fulfilled" ? (sigR.value?.items    || sigR.value?.signals   || sigR.value  || []) : []);
    setArticles(kbR.status   === "fulfilled" ? (kbR.value?.items     || kbR.value?.articles   || kbR.value   || []) : []);
    setScenarios(scnR.status === "fulfilled" ? (scnR.value?.items    || scnR.value?.scenarios  || scnR.value  || []) : []);
    setSwarms(swmR.status    === "fulfilled" ? (swmR.value?.items    || swmR.value?.jobs       || swmR.value  || []) : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener("jarvis:dpci-toggle", handler);
    return () => window.removeEventListener("jarvis:dpci-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const classified = signals.map(s => ({ s, cls: classify(s, articles, scenarios, swarms) }));
  const counts = { FULLY_COVERED: 0, DUAL_COVERED: 0, SINGLE_LINKED: 0, EXPOSED: 0 };
  classified.forEach(({ cls }) => counts[cls]++);
  const covPct = signals.length ? Math.round(((signals.length - counts.EXPOSED) / signals.length) * 100) : 0;

  const filtered = classified.filter(({ s, cls }) => {
    if (tab !== "ALL" && cls !== tab) return false;
    if (!search) return true;
    return signalText(s).toLowerCase().includes(search.toLowerCase());
  });

  async function assess() {
    setAssessing(true); setBrief("");
    try {
      const base = apiBase();
      const ctx  = `${signals.length} risk signals, ${articles.length} KB articles, ${scenarios.length} scenarios, ${swarms.length} swarm jobs. FULLY_COVERED:${counts.FULLY_COVERED} DUAL_COVERED:${counts.DUAL_COVERED} SINGLE_LINKED:${counts.SINGLE_LINKED} EXPOSED:${counts.EXPOSED} Coverage:${covPct}%`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `DPCI defensive playbook coverage assessment. Data: ${ctx}. Provide a 2-sentence brief identifying the most critical exposed risk signals with no defensive playbook coverage, and the immediate recommended action to close those gaps.` }),
      });
      const d = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "Assessment unavailable.";
      setBrief(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setBrief("Assessment unavailable.");
    }
    setAssessing(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: "rgba(245,158,11,0.13)", border: `1px solid ${AM}`,
          color: AM, fontFamily: FONT, fontSize: 9, padding: "3px 8px",
          cursor: "pointer", borderRadius: 3, letterSpacing: 1,
          whiteSpace: "nowrap",
        }}
      >
        ◈ DPCI
        {counts.EXPOSED > 0 && (
          <span style={{ marginLeft: 4, background: AM, color: "#000", borderRadius: "50%", padding: "0 4px", fontSize: 8 }}>
            {counts.EXPOSED}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 48, left: "50%", transform: "translateX(-50%)",
      width: 700, maxHeight: "82vh", overflowY: "auto", zIndex: Z_INDEX + 1,
      background: BG, border: `1px solid ${BORDER}`, borderRadius: 8,
      padding: 16, fontFamily: FONT, color: "#ccc", fontSize: 11,
      boxShadow: "0 0 40px rgba(0,0,0,0.8)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ color: AM, fontSize: 12, fontWeight: 700, letterSpacing: 2 }}>◈ DPCI — DEFENSIVE PLAYBOOK COVERAGE INDEX</span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {[
          ["RISK SIGNALS",   signals.length,         CY],
          ["KB ARTICLES",    articles.length,         GN],
          ["SCENARIOS",      scenarios.length,        TE],
          ["SWARM JOBS",     swarms.length,            PU],
          ["FULLY COVERED",  counts.FULLY_COVERED,    GN],
          ["DUAL COVERED",   counts.DUAL_COVERED,     CY],
          ["SINGLE LINKED",  counts.SINGLE_LINKED,    AM],
          ["EXPOSED",        counts.EXPOSED,           RD],
          ["COVERED %",      `${covPct}%`,             covPct >= 70 ? GN : covPct >= 40 ? AM : RD],
        ].map(([label, val, col]) => (
          <div key={label} style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${BORDER}`, borderRadius: 5, padding: "5px 10px", minWidth: 78, textAlign: "center" }}>
            <div style={{ fontSize: 8, color: "#555", letterSpacing: 1 }}>{label}</div>
            <div style={{ fontSize: 16, color: col, fontWeight: 700 }}>{loading ? "…" : val}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: "#555", marginBottom: 3 }}>DEFENSIVE PLAYBOOK COVERAGE</div>
        <div style={{ background: "rgba(239,68,68,0.15)", borderRadius: 4, height: 6 }}>
          <div style={{ width: `${covPct}%`, background: covPct >= 70 ? GN : covPct >= 40 ? AM : RD, height: "100%", borderRadius: 4, transition: "width 0.5s" }} />
        </div>
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? `rgba(245,158,11,0.18)` : "transparent",
            border: `1px solid ${tab === t ? AM : "#333"}`,
            color: tab === t ? AM : "#666", fontFamily: FONT, fontSize: 9,
            padding: "2px 8px", cursor: "pointer", borderRadius: 3, letterSpacing: 0.5,
          }}>
            {t.replace(/_/g, " ")}
            {t !== "ALL" && <span style={{ marginLeft: 3, color: CLASS_COLOR[t] }}>{counts[t] ?? ""}</span>}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search signals…"
          style={{ background: "rgba(0,0,0,0.4)", border: `1px solid #333`, color: "#ccc", fontFamily: FONT, fontSize: 10, padding: "2px 8px", borderRadius: 3, width: 140 }}
        />
      </div>

      {/* List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
        {filtered.map(({ s, cls }) => {
          const key      = s.id || s.title || s.name;
          const isExp    = expanded === key;
          const kbHits   = getMatches(s, articles,  kbText);
          const scnHits  = getMatches(s, scenarios, scenarioText);
          const swmHits  = getMatches(s, swarms,    swarmText);
          const maxScore = Math.max(...kbHits.map(m => m.score), ...scnHits.map(m => m.score), ...swmHits.map(m => m.score), 1);
          const sev      = (s.severity || "").toUpperCase();
          return (
            <div key={key} style={{ background: "rgba(0,0,0,0.25)", border: `1px solid ${isExp ? CLASS_COLOR[cls] : "#222"}`, borderRadius: 5, padding: "6px 10px" }}>
              <div
                style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                onClick={() => setExpanded(isExp ? null : key)}
              >
                <span style={{ fontSize: 8, color: CLASS_COLOR[cls], background: "rgba(0,0,0,0.4)", border: `1px solid ${CLASS_COLOR[cls]}`, padding: "1px 5px", borderRadius: 3, minWidth: 90, textAlign: "center", letterSpacing: 0.5 }}>
                  {cls.replace(/_/g, " ")}
                </span>
                <span style={{ fontSize: 10, color: "#ddd", flex: 1, fontWeight: isExp ? 600 : 400 }}>
                  {s.title || s.name || s.id || "(unknown signal)"}
                </span>
                {sev && (
                  <span style={{ fontSize: 9, color: SEV_COLOR[sev] || "#6B7280", background: "rgba(0,0,0,0.4)", padding: "1px 5px", borderRadius: 3 }}>
                    {sev.slice(0, 8)}
                  </span>
                )}
                <span style={{ fontSize: 9, color: "#444" }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  {/* KB Articles */}
                  {kbHits.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: GN, marginBottom: 4, letterSpacing: 1 }}>MATCHED KB ARTICLES ({kbHits.length})</div>
                      {kbHits.map(({ item, score }) => (
                        <div key={item.id || item.title} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 9, color: GN, background: "rgba(34,197,94,0.12)", padding: "1px 5px", borderRadius: 3, minWidth: 50, textAlign: "center" }}>
                            {(item.category || "KB").toUpperCase().slice(0, 6)}
                          </span>
                          <span style={{ fontSize: 10, color: "#ccc", flex: 1 }}>{item.title || item.name || "(untitled)"}</span>
                          <div style={{ width: 60, background: "rgba(34,197,94,0.15)", borderRadius: 2, height: 4 }}>
                            <div style={{ width: `${Math.round((score / maxScore) * 100)}%`, background: GN, height: "100%", borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Scenarios */}
                  {scnHits.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: TE, marginBottom: 4, letterSpacing: 1 }}>MATCHED SCENARIOS ({scnHits.length})</div>
                      {scnHits.map(({ item, score }) => (
                        <div key={item.id || item.name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 9, color: TE, background: "rgba(20,184,166,0.12)", padding: "1px 5px", borderRadius: 3, minWidth: 50, textAlign: "center" }}>
                            {(item.type || "PLAN").toUpperCase().slice(0, 6)}
                          </span>
                          <span style={{ fontSize: 10, color: "#ccc", flex: 1 }}>{item.name || item.title || "(unnamed)"}</span>
                          <div style={{ width: 60, background: "rgba(20,184,166,0.15)", borderRadius: 2, height: 4 }}>
                            <div style={{ width: `${Math.round((score / maxScore) * 100)}%`, background: TE, height: "100%", borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Swarm Jobs */}
                  {swmHits.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: PU, marginBottom: 4, letterSpacing: 1 }}>MATCHED SWARM JOBS ({swmHits.length})</div>
                      {swmHits.map(({ item, score }) => (
                        <div key={item.id || item.name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 9, color: PU, background: "rgba(168,85,247,0.12)", padding: "1px 5px", borderRadius: 3, minWidth: 50, textAlign: "center" }}>
                            {(item.status || item.type || "JOB").toUpperCase().slice(0, 6)}
                          </span>
                          <span style={{ fontSize: 10, color: "#ccc", flex: 1 }}>{item.name || item.title || "(unnamed)"}</span>
                          <div style={{ width: 60, background: "rgba(168,85,247,0.15)", borderRadius: 2, height: 4 }}>
                            <div style={{ width: `${Math.round((score / maxScore) * 100)}%`, background: PU, height: "100%", borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {kbHits.length === 0 && scnHits.length === 0 && swmHits.length === 0 && (
                    <div style={{ fontSize: 10, color: "#555", fontStyle: "italic" }}>No playbook, knowledge, or swarm coverage found for this signal.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", color: "#555", fontSize: 11, padding: 12 }}>No signals match the current filter.</div>
        )}
      </div>

      {/* Assess button */}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          onClick={assess} disabled={assessing}
          style={{
            background: "rgba(0,207,255,0.12)", border: `1px solid ${CY}`,
            color: CY, fontFamily: FONT, fontSize: 10, padding: "5px 14px",
            cursor: assessing ? "default" : "pointer", borderRadius: 4, letterSpacing: 1,
          }}
        >
          {assessing ? "ASSESSING..." : "▶ ASSESS COVERAGE"}
        </button>
        <span style={{ fontSize: 9, color: "#555" }}>auto-refresh 90s · {signals.length} risk signals</span>
      </div>
      {brief && (
        <div style={{ marginTop: 10, background: "rgba(0,207,255,0.06)", border: `1px solid ${BORDER}`, borderRadius: 5, padding: "8px 12px", fontSize: 11, color: "#ccc", lineHeight: 1.5 }}>
          {brief}
        </div>
      )}
    </div>
  );
}
