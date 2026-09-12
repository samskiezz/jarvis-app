/**
 * F172 — Graph Community × Scenario Coverage (GCSCEN)
 *
 * Parallel-fetches /v1/graph/communities + /v1/scenario/list, then
 * keyword-correlates each network cluster (label + member metadata) against
 * active operational scenarios (name / description / objective) to surface:
 *
 *   SCENARIO  — at least one scenario targets / involves this community
 *   GAP       — no operational scenario coverage (planning blind spot)
 *
 * Stat tiles: clusters / scenarios / covered / gaps
 * Filter tabs: ALL / SCENARIO / GAP + text search
 * Expand cluster → matched scenarios with status badge + relevance score
 * Red badge on gap count; amber when no critical gaps
 *
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence cluster-scenario brief
 *            + TTS via jarvis:speak-dossier
 *
 * Toggle:  ◈ GCSCEN at bottom:8, left:57880, zIndex:113
 * Event:   jarvis:gcscen-toggle
 * Voice:   "community scenario"/"graph community scenario"/"scenario community"/
 *          "scenario gap"/"cluster scenario"/"gcscen"
 * Refresh: 90 s
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const RED    = "#FF3D5A";

const BTN_LEFT   = 57880;
const REFRESH_MS = 90_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ── parse helpers ──────────────────────────────────────────────────────────────

function parseCommunities(raw) {
  if (Array.isArray(raw))                return raw;
  if (Array.isArray(raw?.communities))   return raw.communities;
  if (Array.isArray(raw?.clusters))      return raw.clusters;
  if (Array.isArray(raw?.data))          return raw.data;
  return [];
}

function parseScenarios(raw) {
  if (Array.isArray(raw))                return raw;
  if (Array.isArray(raw?.scenarios))     return raw.scenarios;
  if (Array.isArray(raw?.items))         return raw.items;
  if (Array.isArray(raw?.data))          return raw.data;
  return [];
}

// ── keyword correlation ────────────────────────────────────────────────────────

function tokenise(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 2);
}

function relevanceScore(communityTokens, scenarioText) {
  const sTokens = tokenise(scenarioText);
  if (!communityTokens.length || !sTokens.length) return 0;
  const matches = communityTokens.filter(ct => sTokens.includes(ct));
  return Math.round((matches.length / Math.max(communityTokens.length, sTokens.length)) * 100);
}

function matchScenarios(community, scenarios) {
  const label   = community.label ?? community.name ?? community.id ?? "";
  const members = Array.isArray(community.members) ? community.members.join(" ") : "";
  const cTokens = tokenise(`${label} ${members}`);

  return scenarios
    .map(s => {
      const sText = [s.name, s.title, s.description, s.objective].filter(Boolean).join(" ");
      const score = relevanceScore(cTokens, sText);
      return score > 0 ? { ...s, score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

// ── scenario status colour ─────────────────────────────────────────────────────

function scenarioStatusColor(status) {
  const s = String(status || "").toUpperCase();
  if (s === "ACTIVE" || s === "RUNNING")  return GREEN;
  if (s === "FAILED" || s === "ABORTED")  return RED;
  if (s === "QUEUED" || s === "PENDING")  return AMBER;
  if (s === "COMPLETED" || s === "DONE")  return CY;
  return CY;
}

// ── JarvisBrain exports ────────────────────────────────────────────────────────

const GCSCEN_RE =
  /\b(community\s+scenario|graph\s+community\s+scenario|scenario\s+communit|scenario\s+gap|cluster\s+scenario|gcscen)\b/i;

export function isGcscenQuery(q) {
  return GCSCEN_RE.test(q || "");
}

export async function buildGcscenScript() {
  try {
    const hdrs = { Authorization: `Bearer ${API_KEY}` };
    const [commRaw, scenRaw] = await Promise.all([
      fetch(`${apiBase()}/v1/graph/communities`, { headers: hdrs }).then(r => r.json()).catch(() => []),
      fetch(`${apiBase()}/v1/scenario/list`,     { headers: hdrs }).then(r => r.json()).catch(() => []),
    ]);
    const communities = parseCommunities(commRaw);
    const scenarios   = parseScenarios(scenRaw);
    const covered  = communities.filter(c => matchScenarios(c, scenarios).length > 0);
    const gaps     = communities.filter(c => matchScenarios(c, scenarios).length === 0);

    if (!communities.length) {
      return "Graph Community Scenario Coverage: no community data available at this time, sir.";
    }
    const covPct   = Math.round((covered.length / communities.length) * 100);
    const gapNames = gaps.slice(0, 3).map(c => c.label ?? c.name ?? c.id ?? "Unknown").join(", ");
    return (
      `Graph Community Scenario Coverage online, sir. ${covered.length} of ${communities.length} ` +
      `network communities (${covPct}%) have active scenario alignment. ` +
      `${gaps.length} cluster${gaps.length !== 1 ? "s" : ""} remain without any operational ` +
      `scenario coverage` +
      (gaps.length ? ` — including ${gapNames}${gaps.length > 3 ? " and others" : ""}` : "") +
      ". Gap clusters represent unplanned operational exposure."
    );
  } catch (_) {
    return "Graph Community Scenario Coverage online. Unable to retrieve full data at this time, sir.";
  }
}

// ── component ─────────────────────────────────────────────────────────────────

export default function GraphCommunityScenarioCoverage() {
  const [open,       setOpen]       = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [err,        setErr]        = useState(null);
  const [communities, setCommunities] = useState([]);
  const [scenarios,  setScenarios]  = useState([]);
  const [assessing,  setAssessing]  = useState(false);
  const [tab,        setTab]        = useState("ALL");
  const [query,      setQuery]      = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [commRaw, scenRaw] = await Promise.all([
        fetch(`${apiBase()}/v1/graph/communities`, { headers: hdrs }).then(r => r.json()).catch(() => []),
        fetch(`${apiBase()}/v1/scenario/list`,     { headers: hdrs }).then(r => r.json()).catch(() => []),
      ]);
      setCommunities(parseCommunities(commRaw));
      setScenarios(parseScenarios(scenRaw));
    } catch (e) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:gcscen-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gcscen-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e.detail?.text || e.detail?.query || "";
      if (isGcscenQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const handleAssess = useCallback(async () => {
    setAssessing(true);
    try {
      const hdrs  = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
      const covered  = communities.filter(c => matchScenarios(c, scenarios).length > 0);
      const gaps     = communities.filter(c => matchScenarios(c, scenarios).length === 0);
      const covPct   = communities.length
        ? Math.round((covered.length / communities.length) * 100)
        : 0;
      const gapNames = gaps.slice(0, 3).map(c => c.label ?? c.name ?? c.id ?? "Unknown").join(", ");
      const prompt =
        `We have ${communities.length} network communities and ${scenarios.length} active scenarios. ` +
        `${covered.length} communities (${covPct}%) have operational scenario coverage. ` +
        `${gaps.length} communities have no scenario alignment` +
        (gaps.length ? `, including: ${gapNames}` : "") +
        `. Give a 2-sentence assessment of the scenario coverage gap and priority planning actions.`;
      const resp = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST", headers: hdrs, body: JSON.stringify({ message: prompt }),
      });
      const data = await resp.json().catch(() => ({}));
      const text = data?.answer ?? data?.response ?? data?.reply ?? data?.message ?? "No assessment available.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (_) {}
    finally { setAssessing(false); }
  }, [communities, scenarios]);

  const enriched = communities.map(c => {
    const matched = matchScenarios(c, scenarios);
    return { ...c, matched, covered: matched.length > 0 };
  });

  const q = query.trim().toLowerCase();
  const filtered = enriched.filter(c => {
    const label = [c.label, c.name, c.id].filter(Boolean).join(" ").toLowerCase();
    const matchesQ = !q || label.includes(q);
    if (tab === "SCENARIO") return c.covered  && matchesQ;
    if (tab === "GAP")      return !c.covered && matchesQ;
    return matchesQ;
  });

  const coveredCount = enriched.filter(c => c.covered).length;
  const gapCount     = enriched.filter(c => !c.covered).length;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Graph Community × Scenario Coverage — planning blind spots"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 113,
          background: "rgba(5,10,18,0.85)",
          border: `1px solid ${gapCount > 0 ? RED : CY}44`,
          borderRadius: 6, padding: "3px 9px", cursor: "pointer",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
          color: gapCount > 0 ? RED : CY,
          letterSpacing: 1, display: "flex", alignItems: "center", gap: 5,
        }}
      >
        ◈ GCSCEN
        {gapCount > 0 && (
          <span style={{
            background: RED, color: "#000",
            borderRadius: 4, padding: "1px 5px", fontSize: 8, fontWeight: 700,
          }}>
            {gapCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <>
      <div
        onClick={() => setOpen(false)}
        style={{ position: "fixed", inset: 0, zIndex: 112, background: "rgba(0,4,10,0.55)" }}
      />
      <div style={{
        position: "fixed", bottom: 50, left: Math.max(8, BTN_LEFT - 400), zIndex: 113,
        width: 540, maxHeight: "72vh", display: "flex", flexDirection: "column",
        background: "rgba(5,10,20,0.97)", border: `1px solid ${CY}33`,
        borderRadius: 12, overflow: "hidden",
        boxShadow: `0 0 60px ${CY}10, 0 24px 48px rgba(0,0,0,0.8)`,
        fontFamily: "'JetBrains Mono',monospace",
      }}>
        {/* header */}
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${CY}22`,
          display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: CY, fontSize: 13 }}>◈</span>
          <span style={{ color: "#DCEBF5", fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>
            GRAPH COMMUNITY SCENARIO COVERAGE
          </span>
          {loading && (
            <span style={{ color: CY, fontSize: 9, marginLeft: "auto", letterSpacing: 1 }}>
              LOADING…
            </span>
          )}
          {err && <span style={{ color: RED, fontSize: 9, marginLeft: "auto" }}>ERR</span>}
          <button onClick={() => setOpen(false)} style={{
            marginLeft: loading || err ? 0 : "auto",
            background: "none", border: "none", color: "#4E6070", cursor: "pointer", fontSize: 14,
          }}>×</button>
        </div>

        {/* stat tiles */}
        <div style={{ padding: "8px 16px", borderBottom: `1px solid ${CY}18`,
          display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
          {[
            { label: "CLUSTERS",  value: communities.length, color: CY                           },
            { label: "SCENARIOS", value: scenarios.length,   color: CY                           },
            { label: "COVERED",   value: coveredCount,        color: GREEN                        },
            { label: "GAPS",      value: gapCount,            color: gapCount > 0 ? RED : CY     },
          ].map(t => (
            <div key={t.label} style={{
              textAlign: "center", background: "rgba(255,255,255,0.03)",
              borderRadius: 6, padding: "6px 4px",
            }}>
              <div style={{ color: t.color, fontSize: 16, fontWeight: 700 }}>{t.value}</div>
              <div style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{t.label}</div>
            </div>
          ))}
        </div>

        {/* controls */}
        <div style={{ padding: "8px 16px", borderBottom: `1px solid ${CY}18`,
          display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {["ALL", "SCENARIO", "GAP"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? `${CY}22` : "transparent",
              border: `1px solid ${tab === t ? CY : CY + "33"}`,
              borderRadius: 4, padding: "2px 8px", cursor: "pointer",
              color: tab === t ? CY : "#4E6070", fontSize: 9, letterSpacing: 1,
            }}>{t}</button>
          ))}
          <input
            value={query} onChange={e => setQuery(e.target.value)}
            placeholder="filter clusters…"
            style={{
              marginLeft: "auto", background: "rgba(255,255,255,0.04)",
              border: `1px solid ${CY}22`, borderRadius: 4, padding: "2px 8px",
              color: "#DCEBF5", fontSize: 9, outline: "none",
              fontFamily: "inherit", width: 140,
            }}
          />
        </div>

        {/* cluster list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "#4E6070", fontSize: 11 }}>
              No clusters match this filter.
            </div>
          )}
          {filtered.map((c, i) => {
            const id    = c.id ?? c.name ?? i;
            const label = c.label ?? c.name ?? c.id ?? "Cluster";
            const size  = c.size ?? (Array.isArray(c.members) ? c.members.length : null);
            const isEx  = expanded === id;
            const col   = c.covered ? GREEN : RED;
            const badge = c.covered ? "SCENARIO" : "GAP";

            return (
              <div key={id} style={{
                borderBottom: `1px solid ${CY}0F`,
                borderLeft: `2px solid ${col}`,
              }}>
                <div
                  onClick={() => setExpanded(isEx ? null : id)}
                  style={{
                    padding: "8px 16px", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 8,
                  }}
                >
                  <span style={{
                    color: col, fontSize: 9, fontWeight: 700, letterSpacing: 1,
                    background: `${col}18`, borderRadius: 4, padding: "1px 6px",
                    flexShrink: 0,
                  }}>
                    {badge}
                  </span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {label}
                  </span>
                  {size !== null && (
                    <span style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1,
                      border: `1px solid ${CY}22`, borderRadius: 4, padding: "1px 5px",
                      flexShrink: 0 }}>
                      {size} nodes
                    </span>
                  )}
                  {c.covered && (
                    <span style={{ color: "#4E6070", fontSize: 8, flexShrink: 0 }}>
                      {c.matched.length} scenario{c.matched.length !== 1 ? "s" : ""}
                    </span>
                  )}
                  <span style={{ color: "#4E6070", fontSize: 10, flexShrink: 0 }}>
                    {isEx ? "▲" : "▼"}
                  </span>
                </div>

                {isEx && (
                  <div style={{ padding: "0 16px 10px 32px" }}>
                    {c.covered ? (
                      c.matched.map((s, si) => (
                        <div key={s.id ?? s.name ?? si} style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "4px 0", borderTop: `1px solid ${CY}0A`,
                        }}>
                          <span style={{
                            color: scenarioStatusColor(s.status ?? s.state), fontSize: 8,
                            border: `1px solid ${scenarioStatusColor(s.status ?? s.state)}55`,
                            borderRadius: 4, padding: "1px 5px", flexShrink: 0,
                          }}>
                            {String(s.status ?? s.state ?? "?").toUpperCase()}
                          </span>
                          <span style={{ color: "#9DBBD0", fontSize: 10, flex: 1,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {s.name ?? s.title ?? s.id ?? "Unnamed scenario"}
                          </span>
                          <div style={{ width: 48, height: 4, background: "rgba(255,255,255,0.08)",
                            borderRadius: 2, overflow: "hidden", flexShrink: 0 }}>
                            <div style={{
                              width: `${s.score}%`, height: "100%",
                              background: CY, borderRadius: 2,
                            }} />
                          </div>
                          <span style={{ color: "#4E6070", fontSize: 8, flexShrink: 0 }}>
                            {s.score}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div style={{ padding: "6px 0", color: RED, fontSize: 9, letterSpacing: 0.5 }}>
                        ⚠ No active scenarios found for this community — planning gap
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* footer */}
        <div style={{ padding: "8px 16px", borderTop: `1px solid ${CY}18`,
          display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={handleAssess}
            disabled={assessing}
            style={{
              background: assessing ? "transparent" : `${CY}18`,
              border: `1px solid ${CY}44`, borderRadius: 6,
              padding: "4px 12px", cursor: assessing ? "not-allowed" : "pointer",
              color: assessing ? "#4E6070" : CY, fontSize: 9, letterSpacing: 1,
            }}
          >
            {assessing ? "ASSESSING…" : "▶ ASSESS"}
          </button>
          <button onClick={fetchData} style={{
            background: "transparent", border: `1px solid ${CY}22`,
            borderRadius: 6, padding: "4px 10px", cursor: "pointer",
            color: "#4E6070", fontSize: 9, letterSpacing: 1,
          }}>↻</button>
          <span style={{ marginLeft: "auto", color: "#2E4050", fontSize: 8, letterSpacing: 1 }}>
            /v1/graph/communities · /v1/scenario/list · 90 s
          </span>
        </div>
      </div>
    </>
  );
}
