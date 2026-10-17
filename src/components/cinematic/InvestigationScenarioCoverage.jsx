/**
 * InvestigationScenarioCoverage — F297
 * Dual-fetches /v1/investigations + /v1/scenario/list, keyword-matches each
 * open investigation against scenario names/types to surface COVERED vs GAP cases.
 *
 * Stat tiles: total investigations, scenarios, covered, gap.
 * Filter tabs: ALL / COVERED / GAP + text search.
 * Each row expands to show matched scenario(s) with relevance bar.
 * ▶ ASSESS → /v1/jarvis/agent/chat for a 2-sentence AI coverage brief + TTS.
 * Auto-refreshes every 90 s.
 *
 * Toggle:  jarvis:inv-scenario-coverage-toggle event
 * Voice:   "JARVIS, investigation scenarios" / "case scenarios" / "response coverage"
 *          / "investigation response" / "case coverage" / "inv scenario"
 * Button:  positioned off-screen (left:56760); panel opens at right:20,bottom:48.
 * Additive — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFB830";
const RED = "#FF3B3B";
const PRP = "#A78BFA";
const DIM = "#4A5568";

const POLL_MS  = 90_000;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const INV_SIM_RE =
  /\binv(?:estigation)?.scen(?:ario)?\b|\bcase.scen(?:ario)?\b|\bresponse.coverage\b|\binv(?:estigation)?.response\b|\bcase.coverage\b|\binv.sim\b/i;

// ── data helpers ──────────────────────────────────────────────────────────────

function normaliseInvestigations(raw) {
  const arr = Array.isArray(raw)          ? raw
    : Array.isArray(raw?.data)            ? raw.data
    : Array.isArray(raw?.investigations)  ? raw.investigations
    : Array.isArray(raw?.items)           ? raw.items
    : Array.isArray(raw?.results)         ? raw.results
    : [];
  return arr.map((x, i) => ({
    id:       x.id          || String(i),
    title:    x.title       || x.name         || x.subject || `Investigation ${i + 1}`,
    status:   (x.status     || "open").toLowerCase(),
    priority: (x.priority   || x.severity     || "").toLowerCase(),
    summary:  x.summary     || x.description  || x.notes   || "",
    tags:     Array.isArray(x.tags) ? x.tags : [],
  }));
}

function normaliseScenarios(raw) {
  const arr = Array.isArray(raw)        ? raw
    : Array.isArray(raw?.data)          ? raw.data
    : Array.isArray(raw?.scenarios)     ? raw.scenarios
    : Array.isArray(raw?.items)         ? raw.items
    : Array.isArray(raw?.results)       ? raw.results
    : [];
  return arr.map((x, i) => ({
    id:     x.id     || String(i),
    name:   x.name   || x.title || `Scenario ${i + 1}`,
    type:   x.type   || x.category || "",
    status: (x.status || "active").toLowerCase(),
    tags:   Array.isArray(x.tags) ? x.tags : [],
  }));
}

function tokenise(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(s => s.length > 2);
}

function matchScore(inv, scenario) {
  const invTokens = new Set([
    ...tokenise(inv.title),
    ...tokenise(inv.summary),
    ...inv.tags.map(t => t.toLowerCase()),
  ]);
  const simTokens = [
    ...tokenise(scenario.name),
    ...tokenise(scenario.type),
    ...scenario.tags.map(t => t.toLowerCase()),
  ];
  if (!invTokens.size || !simTokens.length) return 0;
  const hits = simTokens.filter(t => invTokens.has(t)).length;
  return Math.round((hits / Math.max(invTokens.size, simTokens.length)) * 100);
}

async function fetchAll() {
  const base = apiBase();
  const hdrs = { Authorization: `Bearer ${API_KEY}` };
  const sig  = AbortSignal.timeout(12_000);

  const [invRes, simRes] = await Promise.all([
    fetch(`${base}/v1/investigations`, { headers: hdrs, signal: sig }),
    fetch(`${base}/v1/scenario/list`,  { headers: hdrs, signal: sig }),
  ]);

  if (!invRes.ok) throw new Error(`Investigations HTTP ${invRes.status}`);
  if (!simRes.ok) throw new Error(`Scenarios HTTP ${simRes.status}`);

  const [invJson, simJson] = await Promise.all([invRes.json(), simRes.json()]);
  return {
    investigations: normaliseInvestigations(invJson),
    scenarios:      normaliseScenarios(simJson),
  };
}

function buildCoverage(investigations, scenarios) {
  return investigations.map(inv => {
    const scored = scenarios
      .map(s => ({ ...s, score: matchScore(inv, s) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...inv, matches: scored, covered: scored.length > 0 };
  });
}

// ── exported voice intents ────────────────────────────────────────────────────

export function isInvSimQuery(text) {
  return INV_SIM_RE.test(text || "");
}

export async function buildInvSimScript() {
  try {
    const { investigations, scenarios } = await fetchAll();
    const rows = buildCoverage(investigations, scenarios);
    const open    = rows.filter(r => r.status !== "closed" && r.status !== "resolved");
    const covered = open.filter(r => r.covered).length;
    const gap     = open.length - covered;

    if (!open.length) return "No open investigations found at this time, sir.";

    let script = `Investigation Scenario Coverage, sir. ${open.length} open cases, ${scenarios.length} response scenarios. `;
    script += `${covered} cases have a matched scenario. `;
    if (gap > 0) script += `${gap} cases lack a response scenario. `;
    const urgent = open.filter(r => !r.covered && (r.priority === "critical" || r.priority === "high")).slice(0, 2);
    if (urgent.length)
      script += `Unprotected high-priority cases include: ${urgent.map(r => r.title).join("; ")}.`;
    return script;
  } catch {
    return "Investigation scenario coverage data unavailable at this time, sir.";
  }
}

// ── component ─────────────────────────────────────────────────────────────────

export default function InvestigationScenarioCoverage() {
  const [open,    setOpen]    = useState(false);
  const [rows,    setRows]    = useState([]);
  const [simCount, setSimCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [tab,     setTab]     = useState("ALL");
  const [search,  setSearch]  = useState("");
  const [expanded, setExpanded] = useState(null);
  const [aiStatus, setAiStatus] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { investigations, scenarios } = await fetchAll();
      setSimCount(scenarios.length);
      const openInvs = investigations.filter(inv => inv.status !== "closed" && inv.status !== "resolved");
      setRows(buildCoverage(openInvs, scenarios));
    } catch (err) {
      setError(err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const fn = () => setOpen(v => !v);
    window.addEventListener("jarvis:inv-scenario-coverage-toggle", fn);
    return () => window.removeEventListener("jarvis:inv-scenario-coverage-toggle", fn);
  }, []);

  const covered = rows.filter(r => r.covered).length;
  const gap     = rows.length - covered;

  const visible = rows
    .filter(r => tab === "ALL" || (tab === "COVERED" ? r.covered : !r.covered))
    .filter(r => !search || `${r.title} ${r.summary}`.toLowerCase().includes(search.toLowerCase()));

  async function handleAssess() {
    setAiStatus("…");
    try {
      const base = apiBase();
      const prompt = `Briefly summarise (2 sentences) the investigation-to-scenario coverage: ${covered} of ${rows.length} open cases have a matched response scenario. ${gap} cases are unprotected. Top unprotected: ${rows.filter(r=>!r.covered).slice(0,3).map(r=>r.title).join(", ")}.`;
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      const brief = j.response || j.message || j.content || JSON.stringify(j).slice(0, 200);
      setAiStatus(brief);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: brief }));
    } catch (err) {
      setAiStatus(`Error: ${err.message}`);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Investigation Scenario Coverage"
        style={{
          position:    "fixed",
          left:        56760,
          bottom:      8,
          zIndex:      110,
          background:  gap > 0 ? `${AMB}22` : "#0a0a0f",
          border:      `1px solid ${gap > 0 ? AMB : DIM}`,
          borderRadius: 4,
          color:       gap > 0 ? AMB : CY,
          fontFamily:  "monospace",
          fontSize:    10,
          padding:     "3px 7px",
          cursor:      "pointer",
          whiteSpace:  "nowrap",
        }}
      >
        ◈ INV-SIM{gap > 0 ? ` ⚠${gap}` : ""}
        {loading && <span style={{ marginLeft: 4, opacity: 0.6 }}>…</span>}
      </button>
    );
  }

  return (
    <div style={{
      position:   "fixed",
      right:       20,
      bottom:      48,
      zIndex:      1100,
      width:       520,
      maxHeight:   580,
      background:  "#0a0a0fee",
      border:      `1px solid ${CY}44`,
      borderRadius: 8,
      fontFamily:  "monospace",
      color:       "#DCEBF5",
      display:     "flex",
      flexDirection: "column",
      overflow:    "hidden",
    }}>
      {/* Header */}
      <div style={{
        display:        "flex",
        justifyContent: "space-between",
        alignItems:     "center",
        padding:        "12px 16px 8px",
        borderBottom:   `1px solid ${CY}22`,
      }}>
        <span style={{ fontSize: 11, letterSpacing: 2, color: CY }}>◈ INV × SCENARIO COVERAGE</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: DIM, fontSize: 9 }}>
            {rows.length} cases · {simCount} scenarios · {POLL_MS / 1000}s
          </span>
          <button
            onClick={load}
            disabled={loading}
            style={{
              background: "none",
              border:     `1px solid ${CY}55`,
              borderRadius: 3,
              color:      CY,
              fontSize:   9,
              padding:    "2px 6px",
              cursor:     loading ? "not-allowed" : "pointer",
              opacity:    loading ? 0.5 : 1,
            }}
          >{loading ? "…" : "↻"}</button>
          <button
            onClick={() => setOpen(false)}
            style={{ background: "none", border: "none", color: DIM, fontSize: 14, cursor: "pointer", lineHeight: 1 }}
          >×</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{
        display: "flex",
        gap:     8,
        padding: "8px 16px",
      }}>
        {[
          { label: "CASES",     val: rows.length,  clr: "#DCEBF5" },
          { label: "SCENARIOS", val: simCount,      clr: CY       },
          { label: "COVERED",   val: covered,       clr: GRN      },
          { label: "GAP",       val: gap,           clr: gap > 0 ? AMB : DIM },
        ].map(({ label, val, clr }) => (
          <div key={label} style={{
            flex:        1,
            background:  "#ffffff08",
            borderRadius: 4,
            padding:     "5px 8px",
            textAlign:   "center",
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: clr }}>{val}</div>
            <div style={{ fontSize: 8, color: DIM, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: "0 16px 6px" }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search investigations…"
          style={{
            width:       "100%",
            background:  "#ffffff08",
            border:      `1px solid ${CY}33`,
            borderRadius: 4,
            color:       "#DCEBF5",
            fontFamily:  "monospace",
            fontSize:    10,
            padding:     "4px 8px",
            outline:     "none",
            boxSizing:   "border-box",
          }}
        />
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 16px 8px" }}>
        {["ALL", "COVERED", "GAP"].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background:   tab === t ? `${CY}22` : "transparent",
              border:       `1px solid ${tab === t ? CY : DIM}`,
              borderRadius: 3,
              color:        tab === t ? CY : "#A0AEC0",
              fontSize:     9,
              padding:      "2px 10px",
              cursor:       "pointer",
            }}
          >{t}{t === "GAP" && gap > 0 ? ` (${gap})` : ""}</button>
        ))}
      </div>

      {/* List */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 16px 8px" }}>
        {error && (
          <div style={{ color: RED, fontSize: 10, padding: "8px 0" }}>Error: {error}</div>
        )}
        {!error && !loading && visible.length === 0 && (
          <div style={{ color: DIM, fontSize: 10, padding: "12px 0", textAlign: "center" }}>
            No cases match the current filter.
          </div>
        )}
        {visible.map((row, idx) => (
          <div
            key={row.id}
            style={{
              borderTop:  idx === 0 ? "none" : `1px solid #ffffff08`,
              padding:    "8px 0",
              cursor:     "pointer",
            }}
            onClick={() => setExpanded(expanded === row.id ? null : row.id)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {/* Coverage badge */}
              <span style={{
                background:   row.covered ? `${GRN}22` : `${AMB}22`,
                border:       `1px solid ${row.covered ? GRN : AMB}55`,
                color:        row.covered ? GRN : AMB,
                borderRadius: 3,
                fontSize:     8,
                padding:      "1px 5px",
                letterSpacing: 1,
                flexShrink:   0,
              }}>
                {row.covered ? "COVERED" : "GAP"}
              </span>

              {/* Priority badge */}
              {row.priority && (
                <span style={{
                  background:   "#ffffff08",
                  border:       `1px solid ${DIM}`,
                  color:        row.priority === "critical" ? RED : row.priority === "high" ? AMB : "#A0AEC0",
                  borderRadius: 3,
                  fontSize:     8,
                  padding:      "1px 5px",
                  flexShrink:   0,
                }}>
                  {row.priority.toUpperCase()}
                </span>
              )}

              {/* Title */}
              <span style={{
                fontSize:     11,
                color:        "#DCEBF5",
                flex:         1,
                overflow:     "hidden",
                textOverflow: "ellipsis",
                whiteSpace:   "nowrap",
              }}>
                {row.title}
              </span>

              {/* Expand arrow */}
              <span style={{ color: DIM, fontSize: 9, flexShrink: 0 }}>
                {expanded === row.id ? "▲" : "▼"}
              </span>
            </div>

            {/* Match count bar */}
            {row.covered && (
              <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{
                  flex:         1,
                  height:       3,
                  background:   "#ffffff10",
                  borderRadius: 2,
                  overflow:     "hidden",
                }}>
                  <div style={{
                    width:      `${Math.min(100, row.matches[0]?.score ?? 0)}%`,
                    height:     "100%",
                    background: GRN,
                    borderRadius: 2,
                  }} />
                </div>
                <span style={{ fontSize: 8, color: GRN, flexShrink: 0 }}>
                  {row.matches.length} match{row.matches.length !== 1 ? "es" : ""}
                </span>
              </div>
            )}

            {/* Expanded: matched scenarios */}
            {expanded === row.id && (
              <div style={{ marginTop: 6, paddingLeft: 8 }}>
                {row.summary && (
                  <div style={{
                    fontSize:   9,
                    color:      "#718096",
                    marginBottom: 4,
                    lineHeight: 1.4,
                  }}>
                    {row.summary.slice(0, 120)}{row.summary.length > 120 ? "…" : ""}
                  </div>
                )}
                {row.covered ? (
                  row.matches.slice(0, 3).map(m => (
                    <div key={m.id} style={{
                      display:      "flex",
                      alignItems:   "center",
                      gap:          6,
                      marginBottom: 3,
                    }}>
                      <div style={{
                        width:      `${Math.min(100, m.score)}%`,
                        maxWidth:   80,
                        height:     4,
                        background: `${GRN}88`,
                        borderRadius: 2,
                      }} />
                      <span style={{ fontSize: 9, color: GRN }}>{m.score}%</span>
                      <span style={{ fontSize: 9, color: "#A0AEC0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.name}
                      </span>
                      {m.type && (
                        <span style={{
                          background:   "#ffffff08",
                          border:       `1px solid ${DIM}`,
                          color:        DIM,
                          borderRadius: 2,
                          fontSize:     8,
                          padding:      "1px 4px",
                          flexShrink:   0,
                        }}>{m.type}</span>
                      )}
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 9, color: AMB }}>
                    No matching response scenario found. Consider creating one.
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* AI assessment */}
      <div style={{ padding: "8px 16px", borderTop: `1px solid ${CY}22` }}>
        <button
          onClick={handleAssess}
          disabled={!!aiStatus && aiStatus !== "…"}
          style={{
            background:   `${CY}22`,
            border:       `1px solid ${CY}55`,
            borderRadius: 4,
            color:        CY,
            fontFamily:   "monospace",
            fontSize:     9,
            padding:      "4px 12px",
            cursor:       aiStatus && aiStatus !== "…" ? "not-allowed" : "pointer",
            opacity:      aiStatus && aiStatus !== "…" ? 0.5 : 1,
          }}
        >
          ▶ ASSESS COVERAGE
        </button>
        {aiStatus && (
          <div style={{
            marginTop:  6,
            fontSize:   9,
            color:      "#A0AEC0",
            lineHeight: 1.4,
            maxHeight:  48,
            overflow:   "hidden",
          }}>
            {aiStatus}
          </div>
        )}
      </div>
    </div>
  );
}
