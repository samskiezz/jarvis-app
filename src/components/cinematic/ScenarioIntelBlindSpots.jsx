/**
 * ScenarioIntelBlindSpots — F34 (overnight build 2026-09-16).
 *
 * Cross-references /v1/scenario/list with /entities/IntelProfile to classify
 * each scenario by intelligence backing:
 *
 *   COVERED    — scenario keyword-matches ≥1 IntelProfile
 *   BLIND_SPOT — no IntelProfile backs this scenario (intelligence gap)
 *
 * Also surfaces ORPHAN intel profiles not linked to any scenario.
 *
 * Visual:
 *   • Stat tiles: SCENARIOS / INTEL PROFILES / COVERED / BLIND SPOTS / ORPHAN INTEL
 *   • Filter tabs: ALL / COVERED / BLIND_SPOT
 *   • Text search on scenario name/type/status
 *   • Expand row → matched IntelProfile bars (green) or "no coverage" warning
 *   • Orphan panel: IntelProfiles not backing any scenario
 *   • Red pulse on BLIND SPOTS count when any exist
 *   • ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *
 * Toggle: ◈ SIPBS  left:991140  bottom:8  zIndex:139
 * Event:  jarvis:sipbs-toggle
 * Wired:  App.jsx + JarvisBrain.jsx (isSipbsQuery / buildSipbsScript)
 *
 * Voice: "sipbs" / "scenario intel" / "scenario coverage" / "blind spot scenario" /
 *        "scenario intelligence gap" / "uncovered scenario" / "orphan intel" /
 *        "intel profile gap"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const RED   = "#FF3D5A";
const GN    = "#00E5A0";
const AMBER = "#F5A623";
const MONO  = "'JetBrains Mono','Courier New',monospace";

const BTN_LEFT   = 991140;
const REFRESH_MS = 75_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function authHdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function normalise(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function tokens(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(t => t.length > 2);
}

function overlap(tokA, tokB) {
  const setB = new Set(tokB);
  return tokA.filter(t => setB.has(t));
}

function pct(hits, total) {
  if (!total) return 0;
  return Math.round((hits / total) * 100);
}

async function loadData() {
  const base = apiBase();
  const [scenRaw, intelRaw] = await Promise.all([
    fetch(`${base}/v1/scenario/list`, { headers: authHdr() })
      .then(r => r.ok ? r.json() : []),
    fetch(`${base}/entities/IntelProfile`, { headers: authHdr() })
      .then(r => r.ok ? r.json() : []),
  ]);

  const scenarios = normalise(scenRaw);
  const intelProfiles = normalise(intelRaw);

  const ipToks = intelProfiles.map(ip => ({
    ip,
    tok: tokens([
      ip.name, ip.title, ip.description, ip.category,
      ip.type, ip.subject, ip.tags, ip.keywords,
    ].join(" ")),
  }));

  const backedIpIds = new Set();

  const rows = scenarios.map(scen => {
    const sTok = tokens([
      scen.name, scen.title, scen.description, scen.type,
      scen.status, scen.category, scen.tags,
    ].join(" "));

    const ipMatches = ipToks
      .map(({ ip, tok }) => {
        const hits = overlap(sTok, tok);
        return hits.length
          ? { ip, hits, score: pct(hits.length, Math.max(sTok.length, tok.length)) }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

    const isCovered = ipMatches.length > 0;
    if (isCovered) {
      ipMatches.forEach(m => {
        const id = m.ip.id || m.ip.name || m.ip.title;
        if (id) backedIpIds.add(id);
      });
    }

    return {
      scen,
      cls: isCovered ? "COVERED" : "BLIND_SPOT",
      ipMatches,
    };
  });

  rows.sort((a, b) => {
    const order = { BLIND_SPOT: 0, COVERED: 1 };
    return order[a.cls] - order[b.cls];
  });

  const orphanIps = intelProfiles.filter(ip => {
    const id = ip.id || ip.name || ip.title;
    return id && !backedIpIds.has(id);
  });

  const counts = {
    scenarios:     rows.length,
    intelProfiles: intelProfiles.length,
    covered:       rows.filter(r => r.cls === "COVERED").length,
    blindSpots:    rows.filter(r => r.cls === "BLIND_SPOT").length,
    orphanIntel:   orphanIps.length,
  };

  return { rows, counts, orphanIps };
}

// ── exported helpers for JarvisBrain ─────────────────────────────────────────

export function isSipbsQuery(q) {
  const s = String(q).toLowerCase();
  return (
    s.includes("sipbs") ||
    s.includes("scenario intel") ||
    s.includes("scenario coverage") ||
    s.includes("blind spot scenario") ||
    s.includes("scenario intelligence gap") ||
    s.includes("uncovered scenario") ||
    s.includes("orphan intel") ||
    s.includes("intel profile gap")
  );
}

export async function buildSipbsScript() {
  try {
    const { counts } = await loadData();
    const blindMsg =
      counts.blindSpots > 0
        ? `${counts.blindSpots} scenario(s) have NO intel profile backing — intelligence blind spots requiring immediate analyst assignment.`
        : "All scenarios have at least one backing intel profile.";
    return (
      `Scenario intelligence coverage: ${counts.scenarios} scenarios cross-referenced ` +
      `against ${counts.intelProfiles} intel profiles. ` +
      `Covered: ${counts.covered}. Blind spots: ${counts.blindSpots}. ` +
      `Orphan intel profiles (not backing any scenario): ${counts.orphanIntel}. ` +
      blindMsg
    );
  } catch {
    return "Scenario intel coverage data unavailable.";
  }
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "COVERED", "BLIND_SPOT"];

const CLS_COLOR = {
  COVERED:    GN,
  BLIND_SPOT: RED,
};

export default function ScenarioIntelBlindSpots() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [orphanIps, setOrphanIps]   = useState([]);
  const [counts, setCounts]         = useState(null);
  const [tab, setTab]               = useState("ALL");
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState(null);
  const [showOrphans, setShowOrphans] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [pulse, setPulse]           = useState(false);
  const timerRef = useRef(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await loadData();
      setRows(d.rows);
      setOrphanIps(d.orphanIps);
      setCounts(d.counts);
      if (d.counts.blindSpots > 0) setPulse(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    fetch_();
    timerRef.current = setInterval(fetch_, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetch_]);

  useEffect(() => {
    function handler() { setOpen(o => !o); }
    window.addEventListener("jarvis:sipbs-toggle", handler);
    return () => window.removeEventListener("jarvis:sipbs-toggle", handler);
  }, []);

  useEffect(() => {
    if (!pulse) return;
    const id = setTimeout(() => setPulse(false), 2000);
    return () => clearTimeout(id);
  }, [pulse]);

  const filtered = rows.filter(r => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    const sc = r.scen;
    return [sc.name, sc.title, sc.type, sc.status, sc.category]
      .some(v => String(v || "").toLowerCase().includes(s));
  });

  function assess() {
    buildSipbsScript().then(script => {
      const base = apiBase();
      fetch(`${base}/v1/jarvis/agent/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...authHdr() },
        body:    JSON.stringify({ message: script }),
      })
        .then(r => r.json())
        .then(d => {
          const txt = (d.answer || "").trim();
          if (txt) window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
        })
        .catch(() => {});
    });
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position:   "fixed",
          bottom:     8,
          left:       BTN_LEFT,
          zIndex:     139,
          background: open ? "rgba(41,231,255,0.18)" : "rgba(0,0,0,0.55)",
          border:     `1px solid ${pulse ? RED : (open ? CY : "rgba(41,231,255,0.3)")}`,
          borderRadius: 4,
          color:      pulse ? RED : CY,
          fontFamily: MONO,
          fontSize:   10,
          padding:    "3px 7px",
          cursor:     "pointer",
          transition: "all 0.2s",
          boxShadow:  pulse ? `0 0 8px ${RED}` : "none",
        }}
        title="Scenario × IntelProfile Blind Spots (SIPBS)"
      >
        ◈ SIPBS
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position:   "fixed",
          top:        60,
          right:      20,
          width:      550,
          maxHeight:  "80vh",
          zIndex:     9200,
          background: "rgba(3,5,9,0.97)",
          border:     `1px solid ${CY}33`,
          borderRadius: 8,
          overflow:   "hidden",
          display:    "flex",
          flexDirection: "column",
          fontFamily: MONO,
          boxShadow:  "0 4px 32px rgba(0,0,0,0.7)",
        }}>
          {/* Header */}
          <div style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
            padding:        "10px 14px 8px",
            borderBottom:   `1px solid ${CY}22`,
            flexShrink:     0,
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 1 }}>
              ◈ SCENARIO × INTEL BLIND SPOTS
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setShowOrphans(v => !v)} style={btnStyle(AMBER, 9)}>
                {showOrphans ? "SCENARIOS" : "ORPHAN INTEL"}
              </button>
              <button onClick={assess} style={btnStyle(AMBER, 10)}>▶ ASSESS</button>
              <button onClick={fetch_} style={btnStyle(CY, 10)}>↻</button>
              <button onClick={() => setOpen(false)} style={btnStyle(RED, 10)}>✕</button>
            </div>
          </div>

          {/* Stat tiles */}
          {counts && (
            <div style={{
              display:     "grid",
              gridTemplate: "1fr / repeat(5, 1fr)",
              gap:         6,
              padding:     "8px 14px",
              flexShrink:  0,
            }}>
              {[
                { label: "SCENARIOS",      val: counts.scenarios,     col: CY },
                { label: "INTEL PROFILES", val: counts.intelProfiles, col: CY },
                { label: "COVERED",        val: counts.covered,       col: GN },
                { label: "BLIND SPOTS",    val: counts.blindSpots,    col: RED, pulse },
                { label: "ORPHAN INTEL",   val: counts.orphanIntel,   col: AMBER },
              ].map(t => (
                <div key={t.label} style={{
                  background:   "rgba(255,255,255,0.04)",
                  border:       `1px solid ${t.col}44`,
                  borderRadius: 5,
                  padding:      "5px 6px",
                  textAlign:    "center",
                  boxShadow:    t.pulse ? `0 0 8px ${RED}` : "none",
                }}>
                  <div style={{ color: t.col, fontSize: 16, fontWeight: 700 }}>{t.val}</div>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 7, marginTop: 1 }}>{t.label}</div>
                </div>
              ))}
            </div>
          )}

          {showOrphans ? (
            /* Orphan Intel Profiles view */
            <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px 12px" }}>
              <div style={{ color: AMBER, fontSize: 10, marginBottom: 8 }}>
                ORPHAN INTEL PROFILES — not linked to any scenario
              </div>
              {loading && <div style={{ color: CY, fontSize: 10 }}>Loading…</div>}
              {!loading && orphanIps.length === 0 && (
                <div style={{ color: GN, fontSize: 10 }}>All intel profiles back at least one scenario.</div>
              )}
              {orphanIps.map((ip, i) => {
                const label = ip.name || ip.title || `Profile #${i}`;
                const cat   = ip.category || ip.type || "—";
                return (
                  <div key={i} style={{
                    display:       "flex",
                    alignItems:    "center",
                    gap:           8,
                    padding:       "4px 0",
                    borderBottom:  "1px solid rgba(255,255,255,0.04)",
                  }}>
                    <span style={{
                      background:   `${AMBER}22`,
                      border:       `1px solid ${AMBER}55`,
                      borderRadius: 3,
                      color:        AMBER,
                      fontSize:     8,
                      padding:      "1px 5px",
                      minWidth:     52,
                      textAlign:    "center",
                    }}>ORPHAN</span>
                    <span style={{ color: "#fff", fontSize: 10, flex: 1 }}>
                      {label.length > 38 ? label.slice(0, 35) + "…" : label}
                    </span>
                    <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 9 }}>{cat}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Scenario rows view */
            <>
              {/* Filter tabs + search */}
              <div style={{ padding: "0 14px 8px", flexShrink: 0 }}>
                <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                  {TABS.map(t => (
                    <button key={t} onClick={() => setTab(t)} style={{
                      background:   tab === t ? `${CY}22` : "transparent",
                      border:       `1px solid ${tab === t ? CY : CY + "33"}`,
                      borderRadius: 3,
                      color:        tab === t ? CY : "rgba(255,255,255,0.4)",
                      fontFamily:   MONO,
                      fontSize:     9,
                      padding:      "2px 8px",
                      cursor:       "pointer",
                    }}>{t}</button>
                  ))}
                </div>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="filter scenarios…"
                  style={{
                    width:        "100%",
                    background:   "rgba(255,255,255,0.05)",
                    border:       `1px solid ${CY}33`,
                    borderRadius: 3,
                    color:        "#fff",
                    fontFamily:   MONO,
                    fontSize:     10,
                    padding:      "3px 8px",
                    boxSizing:    "border-box",
                    outline:      "none",
                  }}
                />
              </div>

              {/* Scenario rows */}
              <div style={{ overflowY: "auto", flex: 1, padding: "0 14px 12px" }}>
                {loading && <div style={{ color: CY, fontSize: 10, padding: "8px 0" }}>Loading…</div>}
                {error   && <div style={{ color: RED, fontSize: 10, padding: "8px 0" }}>{error}</div>}
                {!loading && !error && filtered.length === 0 && (
                  <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, padding: "8px 0" }}>
                    No scenarios match current filter.
                  </div>
                )}
                {filtered.map((r, i) => {
                  const sc    = r.scen;
                  const label = sc.name || sc.title || `Scenario #${i}`;
                  const typ   = sc.type || sc.status || sc.category || "—";
                  const isExp = expanded === i;
                  const col   = CLS_COLOR[r.cls] || CY;
                  return (
                    <div key={i} style={{
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      paddingBottom: 5,
                      marginBottom:  5,
                    }}>
                      <div
                        onClick={() => setExpanded(isExp ? null : i)}
                        style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                      >
                        <span style={{
                          background:   `${col}22`,
                          border:       `1px solid ${col}55`,
                          borderRadius: 3,
                          color:        col,
                          fontSize:     8,
                          padding:      "1px 5px",
                          minWidth:     70,
                          textAlign:    "center",
                        }}>{r.cls}</span>
                        <span style={{ color: "#fff", fontSize: 10, flex: 1 }} title={label}>
                          {label.length > 34 ? label.slice(0, 31) + "…" : label}
                        </span>
                        <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 9 }}>{typ}</span>
                        <span style={{ color: CY, fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
                      </div>

                      {isExp && (
                        <div style={{
                          marginTop:    6,
                          marginLeft:   8,
                          padding:      8,
                          background:   "rgba(41,231,255,0.04)",
                          borderLeft:   `2px solid ${CY}44`,
                          borderRadius: 3,
                        }}>
                          {r.ipMatches.length === 0 ? (
                            <div style={{ color: RED, fontSize: 9 }}>
                              No intel profile matches — scenario is a blind spot with no intelligence backing.
                            </div>
                          ) : (
                            <div>
                              <div style={{ color: GN, fontSize: 9, marginBottom: 3 }}>INTEL PROFILES</div>
                              {r.ipMatches.slice(0, 5).map((m, mi) => (
                                <div key={mi} style={{ marginBottom: 4 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                                    <span style={{ color: GN, fontSize: 9 }}>
                                      {(m.ip.name || m.ip.title || "Profile").slice(0, 40)}
                                    </span>
                                    <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 9 }}>
                                      {m.ip.category || m.ip.type || "—"}
                                    </span>
                                  </div>
                                  <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
                                    <div style={{ height: "100%", width: `${m.score}%`, background: GN, borderRadius: 2, transition: "width 0.3s" }} />
                                  </div>
                                  <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 8, marginTop: 1 }}>
                                    match: {m.hits.slice(0, 4).join(", ")} ({m.score}%)
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

function btnStyle(col, fs = 10) {
  return {
    background:   `${col}22`,
    border:       `1px solid ${col}55`,
    borderRadius: 3,
    color:        col,
    fontFamily:   MONO,
    fontSize:     fs,
    padding:      "2px 8px",
    cursor:       "pointer",
  };
}
