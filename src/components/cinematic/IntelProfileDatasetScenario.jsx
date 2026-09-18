/**
 * F177 — IntelProfile × Dataset × Scenario — Threat Intelligence Evidence Readiness (TIER)
 *
 * Parallel-fetches /entities/IntelProfile + /v1/datasets + /v1/scenario/list every 90 s.
 * Keyword-correlates each IntelProfile against the dataset catalog AND active scenarios:
 *
 *   FULLY_ARMED    — cited in ≥1 dataset AND covered by ≥1 scenario
 *   DATA_BACKED    — dataset matched, no scenario coverage
 *   SCENARIO_BACKED — scenario matched, no dataset
 *   UNARMED        — neither — a threat actor with no evidence or simulation coverage
 *
 * Stat tiles: profiles / datasets / scenarios / fully armed / unarmed
 * Filter tabs: ALL | FULLY_ARMED | DATA_BACKED | SCENARIO_BACKED | UNARMED
 * Text search on profile name / type / description.
 * Expand row → matched datasets (green bars) + matched scenarios (amber bars).
 * Red badge + pulse on UNARMED count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence intel readiness brief + TTS.
 *
 * Toggle:  ◈ TIER  at bottom:8 left:971660, zIndex:678.
 * Event:   jarvis:tier-toggle
 * Voice:   "tier / threat intelligence evidence / intel profile dataset / intel scenario /
 *           unarmed intel / threat evidence readiness / intel readiness / profile evidence /
 *           threat coverage / intel dataset coverage"
 * Refresh: 90 s auto-poll.
 */
import { useEffect, useRef, useState } from "react";

const BTN_LEFT = 971_660;
const POLL_MS  = 90_000;

const API_KEY =
  (typeof window !== "undefined" && window.__JARVIS_API_KEY__) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function apiBase() {
  if (typeof window !== "undefined" && window.__JARVIS_API_BASE__) return window.__JARVIS_API_BASE__;
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    return `${window.location.protocol}//${window.location.hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── Exported intent helpers ───────────────────────────────────────────────────

const TIER_RE =
  /\b(tier|threat\s+intelligence\s+evidence|intel\s+profile\s+dataset|intel\s+scenario|unarmed\s+intel|threat\s+evidence\s+readiness|intel\s+readiness|profile\s+evidence|threat\s+coverage|intel\s+dataset\s+coverage)\b/i;

export function isTierQuery(q) { return TIER_RE.test(q || ""); }

export async function buildTierScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [pRes, dRes, sRes] = await Promise.all([
      fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
      fetch(`${base}/v1/datasets`,           { headers: hdr }),
      fetch(`${base}/v1/scenario/list`,      { headers: hdr }),
    ]);
    const profiles  = normArr(await pRes.json(), ["profiles","data","items","results"]);
    const datasets  = normArr(await dRes.json(), ["datasets","data","items","results"]);
    const scenarios = normArr(await sRes.json(), ["scenarios","data","items","results"]);

    const rows    = classifyProfiles(profiles, datasets, scenarios);
    const unarmed = rows.filter((r) => r.cls === "UNARMED").length;
    const full    = rows.filter((r) => r.cls === "FULLY_ARMED").length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS threat intelligence evidence readiness audit (TIER): ${profiles.length} intel profiles ` +
          `cross-referenced against ${datasets.length} datasets and ${scenarios.length} active scenarios — ` +
          `${full} fully armed (dataset + scenario), ${unarmed} unarmed (no evidence or simulation). ` +
          `Give a 2-sentence intel readiness brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return d?.response || d?.answer || d?.message || "Threat intelligence evidence readiness audit complete.";
  } catch (e) {
    return `TIER audit error: ${e.message}`;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normArr(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function tokens(str) {
  return String(str || "").toLowerCase().split(/\W+/).filter((t) => t.length > 2);
}

function hasOverlap(pToks, candidate) {
  const cToks = tokens(
    `${candidate.name || ""} ${candidate.title || ""} ${candidate.description || ""} ` +
    `${candidate.type || ""} ${candidate.category || ""} ${candidate.tags || ""} ` +
    `${candidate.topic || ""} ${candidate.subject || ""}`
  );
  return pToks.some((t) => cToks.includes(t));
}

function classifyProfiles(profiles, datasets, scenarios) {
  return profiles.map((profile) => {
    const pToks = tokens(
      `${profile.name || ""} ${profile.title || ""} ${profile.description || ""} ` +
      `${profile.type || ""} ${profile.category || ""} ${profile.tags || ""} ` +
      `${profile.aliases || ""} ${profile.subject || ""}`
    );
    const matchedDatasets  = datasets.filter((d) => hasOverlap(pToks, d));
    const matchedScenarios = scenarios.filter((s) => hasOverlap(pToks, s));
    const hasData     = matchedDatasets.length  > 0;
    const hasScenario = matchedScenarios.length > 0;
    let cls = "UNARMED";
    if (hasData && hasScenario) cls = "FULLY_ARMED";
    else if (hasData)           cls = "DATA_BACKED";
    else if (hasScenario)       cls = "SCENARIO_BACKED";
    return { profile, cls, matchedDatasets, matchedScenarios };
  });
}

// ── Colours ───────────────────────────────────────────────────────────────────

const CY = "#29E7FF";
const GR = "#2ECC71";
const AM = "#F39C12";
const RD = "#E74C3C";

const CLS_COLOR = {
  FULLY_ARMED:      GR,
  DATA_BACKED:      CY,
  SCENARIO_BACKED:  AM,
  UNARMED:          RD,
};

const TABS = ["ALL", "FULLY_ARMED", "DATA_BACKED", "SCENARIO_BACKED", "UNARMED"];

// ── Component ─────────────────────────────────────────────────────────────────

export default function IntelProfileDatasetScenario() {
  const [visible,      setVisible]      = useState(false);
  const [rows,         setRows]         = useState([]);
  const [profileCnt,   setProfileCnt]   = useState(0);
  const [datasetCnt,   setDatasetCnt]   = useState(0);
  const [scenarioCnt,  setScenarioCnt]  = useState(0);
  const [tab,          setTab]          = useState("ALL");
  const [search,       setSearch]       = useState("");
  const [expanded,     setExpanded]     = useState(null);
  const [answer,       setAnswer]       = useState("");
  const [loading,      setLoading]      = useState(false);
  const [assessing,    setAssessing]    = useState(false);
  const timer = useRef(null);

  const unarmedCount = rows.filter((r) => r.cls === "UNARMED").length;
  const fullCount    = rows.filter((r) => r.cls === "FULLY_ARMED").length;

  async function load() {
    try {
      setLoading(true);
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [pRes, dRes, sRes] = await Promise.all([
        fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
        fetch(`${base}/v1/datasets`,           { headers: hdr }),
        fetch(`${base}/v1/scenario/list`,      { headers: hdr }),
      ]);
      const profiles  = normArr(await pRes.json(), ["profiles","data","items","results"]);
      const datasets  = normArr(await dRes.json(), ["datasets","data","items","results"]);
      const scenarios = normArr(await sRes.json(), ["scenarios","data","items","results"]);
      setProfileCnt(profiles.length);
      setDatasetCnt(datasets.length);
      setScenarioCnt(scenarios.length);
      setRows(classifyProfiles(profiles, datasets, scenarios));
    } catch (_) { /* silent — panel stays stale */ }
    finally    { setLoading(false); }
  }

  useEffect(() => {
    const toggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:tier-toggle", toggle);
    return () => window.removeEventListener("jarvis:tier-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [visible]);

  async function assess() {
    setAssessing(true);
    const text = await buildTierScript();
    setAnswer(text);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const filtered = rows.filter((r) => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    const p = r.profile;
    return (
      String(p.name        || "").toLowerCase().includes(q) ||
      String(p.title       || "").toLowerCase().includes(q) ||
      String(p.type        || "").toLowerCase().includes(q) ||
      String(p.description || "").toLowerCase().includes(q)
    );
  });

  // ── Styles ──────────────────────────────────────────────────────────────────

  const S = {
    overlay: {
      position: "fixed", inset: 0, background: "rgba(0,8,16,.72)",
      zIndex: 9400, display: "flex", alignItems: "center", justifyContent: "center",
    },
    panel: {
      background: "#060e18", border: "1px solid #1a3a50",
      borderRadius: 10, width: "min(900px,95vw)", maxHeight: "88vh",
      display: "flex", flexDirection: "column", overflow: "hidden",
      boxShadow: "0 0 60px #E74C3C22",
    },
    header: {
      padding: "12px 18px", borderBottom: "1px solid #1a2e3a",
      display: "flex", alignItems: "center", justifyContent: "space-between",
    },
    title: { color: RD, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: 3 },
    close: {
      background: "none", border: "none", color: "#3a5a6a",
      fontSize: 14, cursor: "pointer", padding: "0 4px",
    },
    tiles: { display: "flex", gap: 8, padding: "10px 18px", flexWrap: "wrap" },
    tile: (col) => ({
      flex: "1 1 90px", background: `${col}0d`, border: `1px solid ${col}33`,
      borderRadius: 6, padding: "8px 12px", textAlign: "center",
    }),
    tileVal: (col) => ({
      color: col, fontFamily: "'JetBrains Mono',monospace",
      fontSize: 18, fontWeight: 700, lineHeight: 1,
    }),
    tileLabel: { color: "#3a5a6a", fontSize: 8, letterSpacing: 2, marginTop: 4 },
    tabs: { display: "flex", gap: 4, padding: "0 18px 8px", flexWrap: "wrap" },
    tabBtn: (active) => ({
      background: active ? "#0d2030" : "none",
      border: `1px solid ${active ? "#2a6a8a" : "#1a2e3a"}`,
      color: active ? CY : "#3a5a6a",
      borderRadius: 4, padding: "4px 10px", fontSize: 9,
      letterSpacing: 2, cursor: "pointer",
    }),
    search: {
      margin: "0 18px 8px", padding: "6px 10px",
      background: "#0a1520", border: "1px solid #1a2e3a",
      borderRadius: 5, color: "#80b0c8", fontSize: 10, outline: "none",
    },
    list: { flex: 1, overflowY: "auto", padding: "0 18px 8px" },
    row: (col) => ({
      border: `1px solid ${col}22`, borderRadius: 6, marginBottom: 6,
      padding: "8px 12px", cursor: "pointer",
      background: `${col}08`, transition: "background .2s",
    }),
    rowHead: { display: "flex", alignItems: "center", justifyContent: "space-between" },
    rowName: {
      color: "#b0d0e8", fontFamily: "'JetBrains Mono',monospace",
      fontSize: 10, letterSpacing: 1,
    },
    clsBadge: (col) => ({
      background: `${col}22`, border: `1px solid ${col}55`,
      color: col, borderRadius: 3, padding: "1px 7px",
      fontSize: 8, letterSpacing: 2,
    }),
    expand: {
      marginTop: 10, display: "flex", gap: 16,
      borderTop: "1px solid #1a2e3a", paddingTop: 10,
    },
    subCol: { flex: 1, minWidth: 200 },
    subTitle: { color: "#4a6a7a", fontSize: 9, letterSpacing: 2, marginBottom: 4 },
    bar: (col) => ({
      height: 14, background: `${col}22`, borderRadius: 3,
      marginBottom: 3, overflow: "hidden", position: "relative",
    }),
    barFill: (col, pct) => ({
      width: `${Math.min(pct, 100)}%`, height: "100%",
      background: `${col}66`, transition: "width .4s",
    }),
    barLabel: {
      position: "absolute", top: 0, left: 4,
      color: "#b0c8d8", fontSize: 9, lineHeight: "14px",
      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      maxWidth: "90%",
    },
    footer: {
      padding: "10px 18px", borderTop: "1px solid #1a2e3a",
      display: "flex", gap: 10, alignItems: "flex-start",
    },
    assessBtn: (busy) => ({
      background: busy ? "#1a2a3a" : "#0d2030",
      border: "1px solid #2a6a8a", color: busy ? "#4a6a7a" : CY,
      borderRadius: 5, padding: "5px 14px", fontSize: 10,
      letterSpacing: 2, cursor: busy ? "not-allowed" : "pointer",
      whiteSpace: "nowrap",
    }),
    answer: {
      flex: 1, color: "#80b0c8", fontSize: 10, lineHeight: 1.5,
      fontStyle: "italic",
    },
  };

  useEffect(() => {
    if (document.getElementById("tier-pulse-style")) return;
    const st = document.createElement("style");
    st.id = "tier-pulse-style";
    st.textContent = `
      @keyframes tier-pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
      .tier-pulse { animation: tier-pulse 1.4s ease-in-out infinite; }
    `;
    document.head.appendChild(st);
  }, []);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("jarvis:tier-toggle"))}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 678,
          background: "#0a1520", border: "1px solid #1a3a50",
          color: unarmedCount > 0 ? RD : "#3a5a6a",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 2, padding: "3px 8px",
          borderRadius: 4, cursor: "pointer", userSelect: "none",
        }}
        title="Threat Intelligence Evidence Readiness (TIER)"
      >
        <span
          className={unarmedCount > 0 ? "tier-pulse" : ""}
          style={{ marginRight: unarmedCount > 0 ? 4 : 0, color: RD }}
        >
          {unarmedCount > 0 ? `${unarmedCount}⚠` : ""}
        </span>
        ◈ TIER
      </button>

      {/* Panel overlay */}
      {visible && (
        <div style={S.overlay} onClick={(e) => { if (e.target === e.currentTarget) setVisible(false); }}>
          <div style={S.panel}>
            {/* Header */}
            <div style={S.header}>
              <span style={S.title}>◈ THREAT INTELLIGENCE EVIDENCE READINESS — INTELPROFILE × DATASET × SCENARIO</span>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {loading && <span style={{ color: "#3a5a6a", fontSize: 9, letterSpacing: 2 }}>POLLING…</span>}
                <button style={S.close} onClick={() => setVisible(false)}>✕</button>
              </div>
            </div>

            {/* Stat tiles */}
            <div style={S.tiles}>
              <div style={S.tile(CY)}>
                <div style={S.tileVal(CY)}>{profileCnt}</div>
                <div style={S.tileLabel}>PROFILES</div>
              </div>
              <div style={S.tile(GR)}>
                <div style={S.tileVal(GR)}>{datasetCnt}</div>
                <div style={S.tileLabel}>DATASETS</div>
              </div>
              <div style={S.tile(AM)}>
                <div style={S.tileVal(AM)}>{scenarioCnt}</div>
                <div style={S.tileLabel}>SCENARIOS</div>
              </div>
              <div style={S.tile(GR)}>
                <div style={S.tileVal(GR)}>{fullCount}</div>
                <div style={S.tileLabel}>FULLY ARMED</div>
              </div>
              <div style={S.tile(RD)} className={unarmedCount > 0 ? "tier-pulse" : ""}>
                <div style={S.tileVal(RD)}>{unarmedCount}</div>
                <div style={S.tileLabel}>UNARMED</div>
              </div>
            </div>

            {/* Filter tabs */}
            <div style={S.tabs}>
              {TABS.map((t) => (
                <button key={t} style={S.tabBtn(tab === t)} onClick={() => setTab(t)}>{t}</button>
              ))}
            </div>

            {/* Search */}
            <input
              style={S.search}
              placeholder="search profile name / type / description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            {/* List */}
            <div style={S.list}>
              {filtered.length === 0 && (
                <div style={{ color: "#2a4a5a", fontSize: 10, padding: "20px 0", textAlign: "center" }}>
                  {loading ? "LOADING…" : "NO RESULTS"}
                </div>
              )}
              {filtered.map((r, i) => {
                const col     = CLS_COLOR[r.cls];
                const profile = r.profile;
                const key     = profile.id || profile.name || i;
                const open    = expanded === key;
                const maxMatch = Math.max(
                  r.matchedDatasets.length,
                  r.matchedScenarios.length,
                  1
                );
                return (
                  <div key={key} style={S.row(col)} onClick={() => setExpanded(open ? null : key)}>
                    <div style={S.rowHead}>
                      <span style={S.rowName}>
                        {profile.name || profile.title || profile.id || `profile-${i}`}
                        {profile.type
                          ? <span style={{ color: "#3a6a8a", fontSize: 9, marginLeft: 6 }}>[{profile.type}]</span>
                          : null}
                      </span>
                      <span style={S.clsBadge(col)}>{r.cls}</span>
                    </div>
                    {profile.description && (
                      <div style={{ color: "#3a6a7a", fontSize: 9, marginTop: 3, letterSpacing: 1 }}>
                        {String(profile.description).slice(0, 90)}{String(profile.description).length > 90 ? "…" : ""}
                      </div>
                    )}
                    {open && (
                      <div style={S.expand}>
                        {/* Datasets */}
                        <div style={S.subCol}>
                          <div style={S.subTitle}>DATASETS ({r.matchedDatasets.length})</div>
                          {r.matchedDatasets.length === 0
                            ? <div style={{ color: "#2a4a5a", fontSize: 9 }}>— none —</div>
                            : r.matchedDatasets.slice(0, 6).map((ds, di) => (
                              <div key={di} style={S.bar(GR)}>
                                <div style={S.barFill(GR, (r.matchedDatasets.length / maxMatch) * 100)} />
                                <span style={S.barLabel}>{ds.name || ds.title || ds.id || `dataset-${di}`}</span>
                              </div>
                            ))
                          }
                        </div>
                        {/* Scenarios */}
                        <div style={S.subCol}>
                          <div style={S.subTitle}>SCENARIOS ({r.matchedScenarios.length})</div>
                          {r.matchedScenarios.length === 0
                            ? <div style={{ color: "#2a4a5a", fontSize: 9 }}>— none —</div>
                            : r.matchedScenarios.slice(0, 6).map((sc, si) => (
                              <div key={si} style={S.bar(AM)}>
                                <div style={S.barFill(AM, (r.matchedScenarios.length / maxMatch) * 100)} />
                                <span style={S.barLabel}>{sc.name || sc.title || sc.id || `scenario-${si}`}</span>
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

            {/* Footer / Assess */}
            <div style={S.footer}>
              <button style={S.assessBtn(assessing)} onClick={assess} disabled={assessing}>
                {assessing ? "ANALYSING…" : "▶ ASSESS"}
              </button>
              {answer && <div style={S.answer}>{answer}</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
