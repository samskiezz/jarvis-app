/**
 * AgentToolScenarioCoverage — F167
 *
 * Parallel-fetches /v1/jarvis/agent/tools + /v1/scenario/list.
 * Keyword-correlates each available JARVIS tool against scenario descriptions
 * to surface EXERCISED (at least one scenario references this tool capability)
 * vs IDLE (no scenario references this tool — capability gap).
 *
 * Stat tiles:   tools / scenarios / exercised / idle
 * Filter tabs:  ALL / EXERCISED / IDLE
 * Text search:  on tool name + description.
 * Amber badge:  on idle count.
 * Expand tool → matched scenario cards (name + type + status + relevance bar).
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence capability-gap brief + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ ATSCEN  at left:1760 bottom:18, zIndex:68.
 * Event:   jarvis:atscen-toggle
 * Voice:   "tool scenario / tool coverage / idle tools / capability gap /
 *           atscen / unused tools / tool gap / tool exercise"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3B6B";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 1760;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise helpers ────────────────────────────────────────────────────────

function normaliseTools(raw) {
  const arr = Array.isArray(raw?.tools)  ? raw.tools
    : Array.isArray(raw)                 ? raw
    : Array.isArray(raw?.items)          ? raw.items
    : Array.isArray(raw?.data)           ? raw.data
    : raw && typeof raw === "object"     ? Object.values(raw)
    : [];
  return arr.map((t, i) => ({
    id:          String(t.id ?? t.tool_id ?? t.name ?? i),
    name:        t.name ?? t.tool_name ?? `Tool ${i + 1}`,
    description: t.description ?? t.desc ?? "",
    category:    t.category ?? t.type ?? "general",
  }));
}

function normaliseScenarios(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.scenarios)           ? raw.scenarios
    : Array.isArray(raw?.items)               ? raw.items
    : Array.isArray(raw?.data)                ? raw.data
    : raw && typeof raw === "object"          ? Object.values(raw)
    : [];
  return arr.map((s, i) => ({
    id:     String(s.id ?? s.scenario_id ?? i),
    name:   s.name ?? s.title ?? s.scenario_name ?? `Scenario ${i + 1}`,
    type:   s.type ?? s.category ?? "",
    status: s.status ?? s.state ?? "",
    body:   `${s.name ?? ""} ${s.description ?? s.desc ?? ""} ${s.type ?? ""} ${
      s.steps ? JSON.stringify(s.steps) : ""
    }`.toLowerCase(),
  }));
}

function keywords(tool) {
  const words = `${tool.name} ${tool.description} ${tool.category}`
    .toLowerCase()
    .split(/[\s_\-./,;:!?()[\]{}]+/)
    .filter(w => w.length > 2);
  return [...new Set(words)];
}

function scoreMatch(tool, scenario) {
  let score = 0;
  for (const kw of keywords(tool)) {
    if (scenario.body.includes(kw)) score += 1;
  }
  return score;
}

// ─── fetch ───────────────────────────────────────────────────────────────────

async function fetchAll() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [tRes, sRes] = await Promise.all([
    fetch(`${base}/v1/jarvis/agent/tools`, { headers: hdr }),
    fetch(`${base}/v1/scenario/list`,      { headers: hdr }),
  ]);
  const tools     = normaliseTools(await tRes.json());
  const scenarios = normaliseScenarios(await sRes.json());

  const rows = tools.map(tool => {
    const matched = scenarios
      .map(s => ({ ...s, score: scoreMatch(tool, s) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...tool, matched, status: matched.length > 0 ? "EXERCISED" : "IDLE" };
  });

  return { rows, scenarioCount: scenarios.length };
}

// ─── exported intent helpers (JarvisBrain) ───────────────────────────────────

export function isAtscenQuery(q) {
  return /tool.?scenario|scenario.?tool|idle.?tool|tool.?coverage|capability.?gap|atscen|unused.?tool|tool.?gap|tool.?exercise/i.test(q);
}

export async function buildAtscenScript() {
  try {
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const base = apiBase();
    const [tRes, sRes] = await Promise.all([
      fetch(`${base}/v1/jarvis/agent/tools`, { headers: hdr }),
      fetch(`${base}/v1/scenario/list`,      { headers: hdr }),
    ]);
    const tools     = normaliseTools(await tRes.json());
    const scenarios = normaliseScenarios(await sRes.json());

    const rows = tools.map(tool => {
      const matched = scenarios.filter(s => scoreMatch(tool, s) > 0);
      return { name: tool.name, exercised: matched.length > 0 };
    });

    const total     = rows.length;
    const exercised = rows.filter(r => r.exercised).length;
    const idle      = total - exercised;
    const idleNames = rows.filter(r => !r.exercised).map(r => r.name).slice(0, 3).join(", ");

    const prompt =
      `JARVIS agent tool-scenario coverage report: ${total} tools available across ${scenarios.length} scenarios. ` +
      `${exercised} tools are exercised by at least one scenario; ${idle} tools are idle (no scenario references them). ` +
      `Idle tools include: ${idleNames || "none"}. ` +
      `Summarise the capability gap in exactly 2 sentences and recommend the highest-priority idle tool to integrate into a scenario.`;

    const aiRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method:  "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body:    JSON.stringify({ message: prompt }),
    });
    const aiData = await aiRes.json();
    return (
      aiData.response ?? aiData.reply ?? aiData.answer ?? aiData.message ??
      `Tool-scenario coverage: ${exercised}/${total} tools exercised — ${idle} idle tools unmatched by any scenario.`
    );
  } catch {
    return "Agent tool scenario coverage data unavailable at this time, sir.";
  }
}

// ─── Stat Tile ────────────────────────────────────────────────────────────────

function StatTile({ label, value, accent, badge }) {
  return (
    <div style={{
      flex: 1, textAlign: "center", padding: "8px 4px",
      background: "rgba(41,231,255,0.03)",
      border: `1px solid ${accent ?? CY}22`,
      borderRadius: 4, position: "relative",
    }}>
      {badge > 0 && (
        <span style={{
          position: "absolute", top: -5, right: -5,
          background: AMBER, color: "#000", borderRadius: 8,
          fontSize: 7, padding: "0 4px", fontWeight: 700,
        }}>
          {badge}
        </span>
      )}
      <div style={{ fontSize: 16, fontWeight: 700, color: accent ?? CY, fontFamily: MONO }}>
        {value ?? "—"}
      </div>
      <div style={{ fontSize: 7, color: MUTED, letterSpacing: 1, textTransform: "uppercase", marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AgentToolScenarioCoverage() {
  const [open,      setOpen]      = useState(false);
  const [data,      setData]      = useState(null);
  const [error,     setError]     = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [query,     setQuery]     = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const result = await fetchAll();
      setData(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener("jarvis:atscen-toggle", h);
    return () => window.removeEventListener("jarvis:atscen-toggle", h);
  }, []);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildAtscenScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } finally {
      setAssessing(false);
    }
  }, [assessing]);

  const rows          = data?.rows ?? [];
  const total         = rows.length;
  const exercised     = rows.filter(r => r.status === "EXERCISED").length;
  const idle          = total - exercised;
  const scenarioCount = data?.scenarioCount ?? 0;

  const visible = rows.filter(r => {
    if (filter === "EXERCISED" && r.status !== "EXERCISED") return false;
    if (filter === "IDLE"      && r.status !== "IDLE")      return false;
    if (query) {
      const q = query.toLowerCase();
      if (!r.name.toLowerCase().includes(q) && !r.description.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const TAB_STYLE = (active) => ({
    padding: "3px 10px", fontSize: 8, fontFamily: MONO, cursor: "pointer", letterSpacing: 1,
    borderRadius: 2, border: "none",
    background: active ? CY : "rgba(41,231,255,0.08)",
    color:      active ? "#000" : MUTED,
    fontWeight: active ? 700 : 400,
  });

  const ROW_ACCENT = (status) => status === "EXERCISED" ? GREEN : AMBER;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Agent Tool × Scenario Coverage (ATSCEN)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
          background: "rgba(4,7,14,0.82)", border: `1px solid ${CY}55`,
          color: CY, fontFamily: MONO, fontSize: 9, fontWeight: 700,
          padding: "4px 8px", borderRadius: 3, cursor: "pointer", letterSpacing: 1,
        }}
      >
        ◈ ATSCEN
        {idle > 0 && (
          <span style={{
            marginLeft: 5, background: AMBER, color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 8, fontWeight: 700,
          }}>
            {idle}
          </span>
        )}
      </button>
    );
  }

  return (
    <>
      {/* toggle button */}
      <button
        onClick={() => setOpen(false)}
        title="Close ATSCEN"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 69,
          background: CY, border: "none",
          color: "#000", fontFamily: MONO, fontSize: 9, fontWeight: 700,
          padding: "4px 8px", borderRadius: 3, cursor: "pointer", letterSpacing: 1,
        }}
      >
        ◈ ATSCEN ▲
      </button>

      {/* panel */}
      <div style={{
        position: "fixed", left: 10, bottom: 55, zIndex: 68,
        width: 480, maxHeight: "74vh",
        background: BG, border: `1px solid ${CY}44`,
        borderRadius: 6, fontFamily: MONO, display: "flex", flexDirection: "column",
        boxShadow: `0 0 30px ${CY}22`,
      }}>
        {/* header */}
        <div style={{
          padding: "8px 12px", borderBottom: `1px solid ${CY}33`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <span style={{ fontSize: 10, fontWeight: 700, color: CY, letterSpacing: 2 }}>
              ◈ AGENT TOOL × SCENARIO COVERAGE
            </span>
            {loading && <span style={{ fontSize: 7, color: MUTED, marginLeft: 8 }}>polling…</span>}
          </div>
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              background: assessing ? "rgba(41,231,255,0.1)" : "rgba(41,231,255,0.15)",
              border: `1px solid ${CY}66`, color: CY,
              fontFamily: MONO, fontSize: 8, padding: "3px 8px",
              borderRadius: 3, cursor: assessing ? "wait" : "pointer",
            }}
          >
            {assessing ? "…" : "▶ ASSESS"}
          </button>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
          <StatTile label="TOOLS"     value={total}         accent={CY} />
          <StatTile label="SCENARIOS" value={scenarioCount} accent={MUTED} />
          <StatTile label="EXERCISED" value={exercised}     accent={GREEN} />
          <StatTile label="IDLE"      value={idle}          accent={AMBER} badge={idle} />
        </div>

        {/* filter tabs + search */}
        <div style={{ padding: "0 12px 8px", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["ALL", "EXERCISED", "IDLE"].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={TAB_STYLE(filter === f)}>{f}</button>
          ))}
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="search tools…"
            style={{
              flex: 1, minWidth: 100, background: "rgba(41,231,255,0.06)",
              border: `1px solid ${CY}33`, color: CY, fontFamily: MONO,
              fontSize: 8, padding: "3px 8px", borderRadius: 3, outline: "none",
            }}
          />
        </div>

        {/* error */}
        {error && <div style={{ padding: "4px 12px", fontSize: 8, color: RED }}>{error}</div>}

        {/* tool list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 12px" }}>
          {loading && !data ? (
            <div style={{ padding: 16, textAlign: "center", fontSize: 8, color: MUTED }}>
              Loading tool × scenario correlation…
            </div>
          ) : visible.length === 0 ? (
            <div style={{ padding: 12, fontSize: 8, color: MUTED }}>
              {query
                ? "No tools match the search."
                : `No ${filter !== "ALL" ? filter.toLowerCase() + " " : ""}tools.`}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {visible.map(tool => {
                const accent     = ROW_ACCENT(tool.status);
                const isExpanded = expanded === tool.id;
                return (
                  <div key={tool.id} style={{
                    border: `1px solid ${accent}22`, borderRadius: 4,
                    background: `rgba(${tool.status === "EXERCISED" ? "0,200,120" : "245,166,35"},0.03)`,
                    overflow: "hidden",
                  }}>
                    {/* row header */}
                    <div
                      onClick={() => setExpanded(isExpanded ? null : tool.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "6px 10px", cursor: "pointer",
                      }}
                    >
                      <span style={{
                        fontSize: 7, fontWeight: 700, letterSpacing: 1,
                        color: accent, border: `1px solid ${accent}66`,
                        padding: "1px 5px", borderRadius: 2, whiteSpace: "nowrap",
                        width: 64, textAlign: "center",
                      }}>
                        {tool.status}
                      </span>
                      <span style={{
                        fontSize: 8, color: CY, flex: 1, minWidth: 0,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {tool.name}
                      </span>
                      {tool.category && (
                        <span style={{ fontSize: 7, color: MUTED, flexShrink: 0 }}>
                          {tool.category}
                        </span>
                      )}
                      <span style={{ fontSize: 9, color: CY, flexShrink: 0 }}>
                        {isExpanded ? "▲" : "▼"}
                      </span>
                    </div>

                    {/* expanded: description + matched scenarios */}
                    {isExpanded && (
                      <div style={{
                        borderTop: `1px solid ${accent}22`,
                        padding: "8px 10px",
                        background: "rgba(0,0,0,0.3)",
                      }}>
                        {tool.description && (
                          <div style={{
                            fontSize: 7.5, color: MUTED, marginBottom: 8, lineHeight: 1.4,
                          }}>
                            {tool.description}
                          </div>
                        )}
                        {tool.matched.length === 0 ? (
                          <div style={{ fontSize: 7.5, color: AMBER, padding: "4px 0" }}>
                            No scenario references this tool — capability gap identified.
                          </div>
                        ) : (
                          <>
                            <div style={{
                              fontSize: 7, color: MUTED, letterSpacing: 1, marginBottom: 5,
                            }}>
                              {tool.matched.length} MATCHED SCENARIO
                              {tool.matched.length !== 1 ? "S" : ""}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                              {tool.matched.slice(0, 5).map(s => (
                                <div key={s.id} style={{
                                  display: "flex", alignItems: "center", gap: 6,
                                  padding: "4px 7px", borderRadius: 3,
                                  background: "rgba(41,231,255,0.04)",
                                  border: `1px solid ${CY}22`,
                                }}>
                                  <span style={{
                                    fontSize: 8, color: CY, flex: 1, minWidth: 0,
                                    whiteSpace: "nowrap", overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}>
                                    {s.name}
                                  </span>
                                  {s.type && (
                                    <span style={{ fontSize: 7, color: MUTED, flexShrink: 0 }}>
                                      {s.type}
                                    </span>
                                  )}
                                  {s.status && (
                                    <span style={{
                                      fontSize: 7, flexShrink: 0,
                                      color: s.status === "active" ? GREEN : MUTED,
                                      border: `1px solid ${s.status === "active" ? GREEN : MUTED}44`,
                                      padding: "0 4px", borderRadius: 2,
                                    }}>
                                      {s.status}
                                    </span>
                                  )}
                                  <div style={{
                                    width: 40, height: 3, background: `${GREEN}11`,
                                    borderRadius: 2, flexShrink: 0,
                                  }}>
                                    <div style={{
                                      width: `${Math.min(100, (s.score / 5) * 100)}%`,
                                      height: "100%", background: GREEN, borderRadius: 2,
                                    }} />
                                  </div>
                                </div>
                              ))}
                              {tool.matched.length > 5 && (
                                <div style={{ fontSize: 7, color: MUTED, padding: "2px 0" }}>
                                  +{tool.matched.length - 5} more scenarios
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
