/**
 * F86 – Scenario × Knowledge × Ops Event Mission Readiness Index (SKOPRI)
 * Cross-correlates /v1/scenario/list × /knowledge/ × /v1/ops/events.
 * Classifies each scenario by mission context coverage:
 *   FULLY_PRIMED – KB article match AND ops event match
 *   KB_BACKED    – knowledge-backed, no ops event
 *   OPS_LINKED   – ops-event-linked, no KB article
 *   UNPRIMED     – no KB or ops backing (readiness gap)
 * UNPRIMED rows pulse amber.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const BTN_LEFT   = 991080;
const Z          = 148;
const REFRESH_MS = 90_000;

const CY   = "#29E7FF";
const GR   = "#00c878";
const AM   = "#F5A623";
const RD   = "#FF3B3B";
const BL   = "#4DA6FF";
const DIM  = "#3a5060";
const MONO = "'JetBrains Mono', 'Courier New', monospace";
const SANS = "'Inter', system-ui, sans-serif";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
function authHdr() { return { Authorization: `Bearer ${API_KEY}` }; }

function kw(item) {
  return [
    item.name, item.title, item.description,
    item.subject, item.topic, item.category,
    item.type, item.kind, item.tags, item.source,
    item.summary, item.notes, item.role,
    item.alias, item.symbol, item.org, item.content,
    item.location, item.place, item.region,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function overlap(a, b) {
  const wa = a.split(/\W+/).filter(w => w.length > 3);
  const wb = new Set(b.split(/\W+/).filter(w => w.length > 3));
  return wa.filter(w => wb.has(w)).length;
}

function classifyScenario(scenario, kbArticles, opsEvents) {
  const sk       = kw(scenario);
  const matchedKb  = kbArticles.filter(a => overlap(sk, kw(a)) >= 2);
  const matchedOps = opsEvents.filter(e => overlap(sk, kw(e)) >= 2);

  const hasKb  = matchedKb.length > 0;
  const hasOps = matchedOps.length > 0;
  let cls;
  if (hasKb && hasOps) cls = "FULLY_PRIMED";
  else if (hasKb)      cls = "KB_BACKED";
  else if (hasOps)     cls = "OPS_LINKED";
  else                 cls = "UNPRIMED";

  return {
    id: scenario.id || scenario.name || Math.random().toString(36).slice(2),
    scenario,
    cls,
    matchedKb:  matchedKb.slice(0, 5).map(a => ({
      name:  a.name || a.title || a.subject || a.description || "?",
      score: overlap(sk, kw(a)),
    })),
    matchedOps: matchedOps.slice(0, 5).map(e => ({
      name:  e.name || e.title || e.description || e.event_type || "?",
      type:  e.type || e.event_type || e.kind || "",
      score: overlap(sk, kw(e)),
    })),
  };
}

async function loadAll(base) {
  const [sr, kr, or_] = await Promise.allSettled([
    fetch(`${base}/v1/scenario/list`, { headers: authHdr() }),
    fetch(`${base}/knowledge/`,        { headers: authHdr() }),
    fetch(`${base}/v1/ops/events`,     { headers: authHdr() }),
  ]);
  const parse = async (r) => {
    if (r.status !== "fulfilled" || !r.value.ok) return [];
    try {
      const d = await r.value.json();
      return Array.isArray(d) ? d : (d.items || d.results || d.data || d.scenarios || d.events || d.articles || []);
    } catch { return []; }
  };
  const [scenarios, kbArticles, opsEvents] = await Promise.all([sr, kr, or_].map(parse));
  return { scenarios, kbArticles, opsEvents };
}

// ─── exported helpers for JarvisBrain ────────────────────────────────────────
export function isSkopriQuery(q) {
  return /\b(skopri|scenario\s+knowledge\s+ops|mission\s+readiness(\s+index)?|unprimed\s+scenarios?|scenario\s+readiness(\s+index)?|ops\s+knowledge\s+scenario|scenario\s+ops\s+knowledge)\b/i.test(q);
}

export async function buildSkopriScript() {
  const base = apiBase();
  try {
    const { scenarios, kbArticles, opsEvents } = await loadAll(base);
    const rows       = scenarios.map(s => classifyScenario(s, kbArticles, opsEvents));
    const total      = rows.length;
    const primed     = rows.filter(r => r.cls === "FULLY_PRIMED").length;
    const kbOnly     = rows.filter(r => r.cls === "KB_BACKED").length;
    const opsOnly    = rows.filter(r => r.cls === "OPS_LINKED").length;
    const unprimed   = rows.filter(r => r.cls === "UNPRIMED").length;
    return (
      `Scenario Mission Readiness Index: ${total} scenarios — ${primed} fully primed with KB and ops context, ` +
      `${kbOnly} knowledge-backed only, ${opsOnly} ops-event-linked only, ` +
      `${unprimed} completely unprimed with no mission context. ` +
      (unprimed > 0
        ? `${unprimed} scenarios have neither knowledge backing nor operational context — mission readiness gaps requiring immediate attention, sir.`
        : "All scenarios have at least some mission context coverage.")
    );
  } catch {
    return "Scenario Mission Readiness Index: unable to load data.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────
export default function ScenarioKnowledgeOpsReadiness() {
  const base = apiBase();

  const [rows, setRows]           = useState([]);
  const [kbCount, setKbCount]     = useState(0);
  const [opsCount, setOpsCount]   = useState(0);
  const [filter, setFilter]       = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [open, setOpen]           = useState(false);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { scenarios, kbArticles, opsEvents } = await loadAll(base);
      setKbCount(kbArticles.length);
      setOpsCount(opsEvents.length);
      setRows(scenarios.map(s => classifyScenario(s, kbArticles, opsEvents)));
    } catch {}
  }, [base]);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:skopri-toggle", toggle);
    return () => window.removeEventListener("jarvis:skopri-toggle", toggle);
  }, []);

  const assess = async () => {
    setAssessing(true);
    try {
      const script = await buildSkopriScript();
      const voice  = getActiveVoice?.() ?? "ash";
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ text: script, voice }),
      });
    } catch {}
    setAssessing(false);
  };

  const total    = rows.length;
  const primed   = rows.filter(r => r.cls === "FULLY_PRIMED").length;
  const kbOnly   = rows.filter(r => r.cls === "KB_BACKED").length;
  const opsOnly  = rows.filter(r => r.cls === "OPS_LINKED").length;
  const unprimed = rows.filter(r => r.cls === "UNPRIMED").length;

  const TABS = ["ALL", "FULLY_PRIMED", "KB_BACKED", "OPS_LINKED", "UNPRIMED"];

  const visible = rows.filter(r => {
    const matchTab    = filter === "ALL" || r.cls === filter;
    const matchSearch = !search || kw(r.scenario).includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  const readinessPct = total > 0 ? Math.round(((primed + kbOnly + opsOnly) / total) * 100) : 0;

  const clsColor = { FULLY_PRIMED: GR, KB_BACKED: CY, OPS_LINKED: BL, UNPRIMED: AM };
  const clsLabel = {
    FULLY_PRIMED: "FULLY PRIMED",
    KB_BACKED:    "KB BACKED",
    OPS_LINKED:   "OPS LINKED",
    UNPRIMED:     "UNPRIMED",
  };

  const badge = (
    <button
      onClick={() => setOpen(o => !o)}
      title="Scenario Knowledge Ops Readiness Index (SKOPRI)"
      style={{
        position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z,
        fontFamily: MONO, fontSize: 10, padding: "3px 8px", cursor: "pointer",
        background: "rgba(5,8,13,0.82)", border: `1px solid ${AM}66`,
        borderRadius: 4, color: AM, letterSpacing: 1,
        boxShadow: unprimed > 0 ? `0 0 10px ${AM}55` : "none",
      }}
    >
      ◈ SKOPRI
      {unprimed > 0 && (
        <span style={{
          marginLeft: 5, background: AM, color: "#04060A",
          borderRadius: 9, padding: "0 5px", fontSize: 9, fontWeight: 700,
        }}>{unprimed}</span>
      )}
    </button>
  );

  if (!open) return badge;

  return (
    <>
      {badge}
      <div style={{
        position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)",
        width: "min(900px,96vw)", maxHeight: "80vh",
        background: "rgba(6,10,16,0.97)", border: `1px solid ${AM}55`,
        borderRadius: 12, padding: "18px 20px", zIndex: Z + 1,
        fontFamily: MONO, color: "#DCEBF5",
        boxShadow: `0 0 60px ${AM}22`, display: "flex", flexDirection: "column", gap: 12,
        overflow: "hidden",
      }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ color: AM, fontWeight: 700, letterSpacing: 2, fontSize: 13 }}>◈ SCENARIO MISSION READINESS INDEX</span>
          <span style={{ fontSize: 10, color: "#6E8AA0", marginLeft: "auto" }}>
            {kbCount} KB · {opsCount} OPS EVENTS · 90s auto-refresh
          </span>
          <button onClick={() => setOpen(false)} style={{
            background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 16,
          }}>✕</button>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            ["SCENARIOS",    total,    CY ],
            ["FULLY PRIMED", primed,   GR ],
            ["KB BACKED",    kbOnly,   CY ],
            ["OPS LINKED",   opsOnly,  BL ],
            ["UNPRIMED",     unprimed, AM ],
          ].map(([lbl, val, col]) => (
            <div key={lbl} style={{
              background: "rgba(255,255,255,0.04)", border: `1px solid ${col}33`,
              borderRadius: 6, padding: "6px 12px", minWidth: 80, textAlign: "center",
            }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: col }}>{val}</div>
              <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>{lbl}</div>
            </div>
          ))}
          {/* readiness bar */}
          <div style={{
            flex: 1, minWidth: 140, background: "rgba(255,255,255,0.04)",
            border: `1px solid ${GR}33`, borderRadius: 6, padding: "6px 12px",
          }}>
            <div style={{ fontSize: 11, color: "#6E8AA0", letterSpacing: 1, marginBottom: 4 }}>READINESS</div>
            <div style={{ background: "#0d1e2e", borderRadius: 3, height: 8, overflow: "hidden" }}>
              <div style={{ width: `${readinessPct}%`, height: "100%", background: GR, borderRadius: 3,
                transition: "width 0.6s ease" }} />
            </div>
            <div style={{ fontSize: 12, color: GR, marginTop: 3 }}>{readinessPct}%</div>
          </div>
        </div>

        {/* controls */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setFilter(t)} style={{
              fontFamily: MONO, fontSize: 9, padding: "3px 8px", cursor: "pointer",
              background: filter === t ? AM : "rgba(255,255,255,0.04)",
              border: `1px solid ${AM}55`, borderRadius: 4,
              color: filter === t ? "#04060A" : "#6E8AA0", fontWeight: filter === t ? 700 : 400,
            }}>{t.replace("_", " ")}</button>
          ))}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="search scenarios…"
            style={{
              fontFamily: MONO, fontSize: 11, padding: "3px 8px", marginLeft: "auto",
              background: "rgba(255,255,255,0.04)", border: `1px solid ${DIM}`,
              borderRadius: 4, color: "#DCEBF5", outline: "none", width: 160,
            }}
          />
          <button onClick={load} style={{
            fontFamily: MONO, fontSize: 9, padding: "3px 8px", cursor: "pointer",
            background: "rgba(255,255,255,0.04)", border: `1px solid ${DIM}`,
            borderRadius: 4, color: "#6E8AA0",
          }}>↺</button>
          <button onClick={assess} disabled={assessing} style={{
            fontFamily: MONO, fontSize: 10, padding: "4px 12px", cursor: assessing ? "default" : "pointer",
            background: assessing ? DIM : AM, border: "none", borderRadius: 4,
            color: assessing ? "#DCEBF5" : "#04060A", fontWeight: 700,
          }}>{assessing ? "assessing…" : "▶ ASSESS READINESS"}</button>
        </div>

        {/* rows */}
        <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          {visible.length === 0 && (
            <div style={{ color: "#6E8AA0", fontSize: 12, textAlign: "center", padding: "30px 0" }}>
              {rows.length === 0 ? "loading scenarios…" : "no matches"}
            </div>
          )}
          {visible.map(row => {
            const isExpanded   = expanded === row.id;
            const isUnprimed   = row.cls === "UNPRIMED";
            const col          = clsColor[row.cls];
            const scenarioName = row.scenario.name || row.scenario.title || row.scenario.description || row.id;
            const scenarioType = row.scenario.type || row.scenario.kind || row.scenario.category || "";
            return (
              <div key={row.id} style={{
                background: "rgba(255,255,255,0.03)", borderRadius: 7,
                border: `1px solid ${col}33`,
                animation: isUnprimed ? "skopriPulse 2s ease-in-out infinite" : "none",
              }}>
                <div
                  onClick={() => setExpanded(isExpanded ? null : row.id)}
                  style={{
                    padding: "8px 12px", cursor: "pointer", display: "flex",
                    alignItems: "center", gap: 10,
                  }}
                >
                  <span style={{
                    fontSize: 9, padding: "2px 6px", borderRadius: 3,
                    background: `${col}22`, color: col, fontWeight: 700, letterSpacing: 1, whiteSpace: "nowrap",
                  }}>{clsLabel[row.cls]}</span>
                  <span style={{ flex: 1, fontSize: 12, color: "#DCEBF5", fontFamily: SANS }}>{scenarioName}</span>
                  {scenarioType && <span style={{ fontSize: 9, color: "#6E8AA0" }}>{scenarioType}</span>}
                  <span style={{ fontSize: 10, color: "#6E8AA0" }}>
                    {row.matchedKb.length  > 0 ? `${row.matchedKb.length} KB`  : ""}
                    {row.matchedOps.length > 0 ? ` ${row.matchedOps.length} OPS` : ""}
                    {" "}{isExpanded ? "▲" : "▼"}
                  </span>
                </div>

                {isExpanded && (
                  <div style={{ padding: "0 12px 12px", display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {/* KB matches */}
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 10, color: GR, letterSpacing: 1, marginBottom: 6 }}>
                        ◆ KB ARTICLES ({row.matchedKb.length})
                      </div>
                      {row.matchedKb.length === 0
                        ? <div style={{ fontSize: 11, color: "#6E8AA0" }}>no KB matches</div>
                        : row.matchedKb.map((m, i) => (
                          <div key={i} style={{ marginBottom: 6 }}>
                            <div style={{ fontSize: 11, color: "#DCEBF5", fontFamily: SANS }}>{m.name}</div>
                            <div style={{ marginTop: 3, background: "#0d1e2e", borderRadius: 2, height: 4, overflow: "hidden" }}>
                              <div style={{ width: `${Math.min(100, m.score * 12)}%`, height: "100%", background: GR }} />
                            </div>
                          </div>
                        ))
                      }
                    </div>
                    {/* Ops event matches */}
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 10, color: BL, letterSpacing: 1, marginBottom: 6 }}>
                        ◆ OPS EVENTS ({row.matchedOps.length})
                      </div>
                      {row.matchedOps.length === 0
                        ? <div style={{ fontSize: 11, color: "#6E8AA0" }}>no ops event matches</div>
                        : row.matchedOps.map((m, i) => (
                          <div key={i} style={{ marginBottom: 6 }}>
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <span style={{ fontSize: 11, color: "#DCEBF5", fontFamily: SANS, flex: 1 }}>{m.name}</span>
                              {m.type && <span style={{ fontSize: 9, color: BL, padding: "1px 5px", border: `1px solid ${BL}44`, borderRadius: 3 }}>{m.type}</span>}
                            </div>
                            <div style={{ marginTop: 3, background: "#0d1e2e", borderRadius: 2, height: 4, overflow: "hidden" }}>
                              <div style={{ width: `${Math.min(100, m.score * 12)}%`, height: "100%", background: BL }} />
                            </div>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <style>{`
        @keyframes skopriPulse {
          0%, 100% { border-color: ${AM}33; }
          50%       { border-color: ${AM}99; box-shadow: 0 0 12px ${AM}44; }
        }
      `}</style>
    </>
  );
}
