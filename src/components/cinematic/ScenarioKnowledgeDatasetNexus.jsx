/**
 * ScenarioKnowledgeDatasetNexus — F53.
 * Polls /v1/scenario/list + /knowledge/ + /v1/datasets → keyword cross-reference.
 * Classification:
 *   FULLY_GROUNDED — scenario has ≥1 KB article AND ≥1 dataset match
 *   KB_ONLY        — matched KB but no dataset
 *   DATA_ONLY      — matched dataset but no KB
 *   UNGROUNDED     — no knowledge or data backing
 * Stat tiles: SCENARIOS / KB ARTICLES / DATASETS / FULLY GROUNDED / UNGROUNDED.
 * Filter tabs: ALL / FULLY_GROUNDED / KB_ONLY / DATA_ONLY / UNGROUNDED. Full text search.
 * Expand row → matched KB cards (amber bars) + matched dataset cards (cyan bars).
 * ▶ ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts.
 * ◈ SKDNEX button left:938980 bottom:8 zIndex:636.
 * Voice: "skdnex"/"scenario knowledge"/"scenario dataset"/"grounded scenario"/
 *        "scenario grounding"/"scenario data".
 * 90-s auto-refresh. Additive only — mounted via App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const CY  = "#29E7FF";
const GR  = "#4ADE80";
const AM  = "#F59E0B";
const RD  = "#EF4444";
const BG  = "rgba(0,10,20,0.96)";
const MN  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
const REFRESH_MS = 90_000;
const BTN_LEFT   = 938980;
const Z          = 636;

const SKDNEX_RE =
  /\bskdnex\b|scenario\s+knowledge|scenario\s+dataset|grounded\s+scenario|scenario\s+grounding|scenario\s+data\b|ungrounded\s+scenario|scenario\s+intelligence\s+nexus/i;

export function isSkdnexQuery(text) {
  return SKDNEX_RE.test(text || "");
}

function authHdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function tokenize(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function scenarioTokens(s) {
  return tokenize(
    [s.name, s.title, s.description, s.type, s.category, s.tags?.join?.(" ")].join(" ")
  );
}

function kbTokens(a) {
  return tokenize(
    [a.title, a.name, a.description, a.kind, a.category, a.tags?.join?.(" ")].join(" ")
  );
}

function datasetTokens(d) {
  return tokenize(
    [d.name, d.title, d.description, d.type, d.kind, d.category].join(" ")
  );
}

function scoreMatch(aToks, bToks) {
  if (!aToks.length || !bToks.length) return 0;
  const bSet = new Set(bToks);
  const hits = aToks.filter((t) => bSet.has(t)).length;
  return Math.round((hits / Math.max(aToks.length, bToks.length)) * 100);
}

async function fetchScenarios() {
  const r = await fetch(`${apiBase()}/v1/scenario/list`, { headers: authHdr() });
  if (!r.ok) throw new Error(`/v1/scenario/list ${r.status}`);
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.data)      ? d.data
    : Array.isArray(d?.scenarios) ? d.scenarios
    : Array.isArray(d?.items)     ? d.items
    : [];
}

async function fetchKnowledge() {
  const r = await fetch(`${apiBase()}/knowledge/`, { headers: authHdr() });
  if (!r.ok) throw new Error(`/knowledge/ ${r.status}`);
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.data)     ? d.data
    : Array.isArray(d?.articles) ? d.articles
    : Array.isArray(d?.items)    ? d.items
    : [];
}

async function fetchDatasets() {
  const r = await fetch(`${apiBase()}/v1/datasets`, { headers: authHdr() });
  if (!r.ok) throw new Error(`/v1/datasets ${r.status}`);
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.data)     ? d.data
    : Array.isArray(d?.datasets) ? d.datasets
    : Array.isArray(d?.items)    ? d.items
    : [];
}

function classify(hasKb, hasData) {
  if (hasKb && hasData) return "FULLY_GROUNDED";
  if (hasKb)            return "KB_ONLY";
  if (hasData)          return "DATA_ONLY";
  return "UNGROUNDED";
}

function buildRows(scenarios, knowledge, datasets) {
  const kbData = knowledge.map((a) => ({
    a,
    toks: kbTokens(a),
    label: a.title || a.name || `Article ${a.id ?? ""}`,
  }));
  const dsData = datasets.map((d) => ({
    d,
    toks: datasetTokens(d),
    label: d.name || d.title || `Dataset ${d.id ?? ""}`,
    rows: d.row_count ?? d.rows ?? d.count ?? null,
  }));

  return scenarios.map((s) => {
    const sToks = scenarioTokens(s);
    const kbMatches = kbData
      .map(({ a, toks, label }) => ({ a, label, score: scoreMatch(sToks, toks) }))
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    const dsMatches = dsData
      .map(({ d, toks, label, rows }) => ({ d, label, rows, score: scoreMatch(sToks, toks) }))
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    const tag = classify(kbMatches.length > 0, dsMatches.length > 0);
    return {
      s,
      label: s.name || s.title || `Scenario ${s.id ?? ""}`,
      kbMatches,
      dsMatches,
      tag,
    };
  });
}

export async function buildSkdnexScript() {
  try {
    const [scenarios, knowledge, datasets] = await Promise.all([
      fetchScenarios(),
      fetchKnowledge(),
      fetchDatasets(),
    ]);
    if (!scenarios.length)
      return "No scenarios found in the scenario catalog.";
    const rows = buildRows(scenarios, knowledge, datasets);
    const fullyGrounded = rows.filter((r) => r.tag === "FULLY_GROUNDED").length;
    const kbOnly        = rows.filter((r) => r.tag === "KB_ONLY").length;
    const dataOnly      = rows.filter((r) => r.tag === "DATA_ONLY").length;
    const ungrounded    = rows.filter((r) => r.tag === "UNGROUNDED").length;
    const pct = rows.length ? Math.round((fullyGrounded / rows.length) * 100) : 0;
    return (
      `Scenario Knowledge Dataset Nexus: ${scenarios.length} scenarios, ${knowledge.length} KB articles, ${datasets.length} datasets. ` +
      `${fullyGrounded} fully grounded (${pct}%), ${kbOnly} KB-only, ${dataOnly} data-only, ${ungrounded} ungrounded. ` +
      (ungrounded > 0
        ? `${ungrounded} scenarios have no knowledge or data backing — recommend sourcing documentation or datasets for these, sir.`
        : "All scenarios are grounded in knowledge or data. Excellent intelligence coverage.")
    );
  } catch {
    return "Scenario Knowledge Dataset Nexus is unavailable. Backend may be offline.";
  }
}

const TILE_STYLE = {
  background: "rgba(0,255,200,0.05)",
  border: "1px solid rgba(41,231,255,0.2)",
  borderRadius: 6,
  padding: "6px 14px",
  minWidth: 80,
  textAlign: "center",
};

function Tile({ label, value, color = CY }) {
  return (
    <div style={TILE_STYLE}>
      <div style={{ color, fontSize: 20, fontWeight: 700, fontFamily: MN }}>{value}</div>
      <div style={{ color: "#6B8CA3", fontSize: 9, letterSpacing: 1 }}>{label}</div>
    </div>
  );
}

const TAG_COLORS = {
  FULLY_GROUNDED: GR,
  KB_ONLY:        AM,
  DATA_ONLY:      CY,
  UNGROUNDED:     RD,
};

function ScenarioRow({ row, expanded, onToggle }) {
  const tc = TAG_COLORS[row.tag] || "#6B8CA3";
  return (
    <div
      style={{
        background: row.tag === "UNGROUNDED" ? "rgba(239,68,68,0.04)" : "rgba(74,222,128,0.03)",
        border: `1px solid ${tc}22`,
        borderRadius: 6,
        padding: "8px 10px",
        marginBottom: 5,
        cursor: "pointer",
      }}
      onClick={onToggle}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            background: tc,
            color: "#000",
            borderRadius: 3,
            fontSize: 8,
            padding: "1px 5px",
            fontFamily: MN,
            fontWeight: 700,
            letterSpacing: 1,
            whiteSpace: "nowrap",
          }}
        >
          {row.tag.replace("_", " ")}
        </span>
        <span
          style={{
            flex: 1,
            color: "#B0C8D8",
            fontSize: 10,
            fontFamily: MN,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {row.label}
        </span>
        <span style={{ color: "#4A6070", fontSize: 9, fontFamily: MN }}>
          {row.kbMatches.length}kb / {row.dsMatches.length}ds
        </span>
      </div>

      {expanded && (
        <div style={{ marginTop: 8, paddingLeft: 4 }}>
          {row.kbMatches.length > 0 && (
            <>
              <div style={{ color: AM, fontSize: 8, letterSpacing: 1, marginBottom: 4, fontFamily: MN }}>
                KB ARTICLES
              </div>
              {row.kbMatches.map((m, i) => (
                <div key={m.a?.id || i} style={{ marginBottom: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                    <span style={{ color: AM, fontSize: 9, fontFamily: MN, overflow: "hidden", textOverflow: "ellipsis", maxWidth: "75%", whiteSpace: "nowrap" }}>
                      {m.label}
                    </span>
                    <span style={{ color: "#4A6070", fontSize: 9, fontFamily: MN }}>{m.score}%</span>
                  </div>
                  <div style={{ height: 3, background: "rgba(245,158,11,0.15)", borderRadius: 2 }}>
                    <div style={{ height: "100%", width: `${m.score}%`, background: AM, borderRadius: 2 }} />
                  </div>
                </div>
              ))}
            </>
          )}

          {row.dsMatches.length > 0 && (
            <>
              <div style={{ color: CY, fontSize: 8, letterSpacing: 1, marginTop: 6, marginBottom: 4, fontFamily: MN }}>
                DATASETS
              </div>
              {row.dsMatches.map((m, i) => (
                <div key={m.d?.id || i} style={{ marginBottom: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                    <span style={{ color: CY, fontSize: 9, fontFamily: MN, overflow: "hidden", textOverflow: "ellipsis", maxWidth: "75%", whiteSpace: "nowrap" }}>
                      {m.label}
                      {m.rows != null && (
                        <span style={{ color: "#4A6070", marginLeft: 5 }}>{m.rows.toLocaleString()} rows</span>
                      )}
                    </span>
                    <span style={{ color: "#4A6070", fontSize: 9, fontFamily: MN }}>{m.score}%</span>
                  </div>
                  <div style={{ height: 3, background: "rgba(41,231,255,0.15)", borderRadius: 2 }}>
                    <div style={{ height: "100%", width: `${m.score}%`, background: CY, borderRadius: 2 }} />
                  </div>
                </div>
              ))}
            </>
          )}

          {row.kbMatches.length === 0 && row.dsMatches.length === 0 && (
            <div style={{ color: RD, fontSize: 9, marginTop: 4, fontFamily: MN }}>
              No knowledge or dataset matches found for this scenario.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const TABS = ["ALL", "FULLY_GROUNDED", "KB_ONLY", "DATA_ONLY", "UNGROUNDED"];

export default function ScenarioKnowledgeDatasetNexus() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [kbCount,   setKbCount]   = useState(0);
  const [dsCount,   setDsCount]   = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState("");
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState({});
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [scenarios, knowledge, datasets] = await Promise.all([
        fetchScenarios(),
        fetchKnowledge(),
        fetchDatasets(),
      ]);
      setRows(buildRows(scenarios, knowledge, datasets));
      setKbCount(knowledge.length);
      setDsCount(datasets.length);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => {
      setOpen((o) => {
        if (!o) load();
        return !o;
      });
    };
    window.addEventListener("jarvis:skdnex-toggle", toggle);
    return () => window.removeEventListener("jarvis:skdnex-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const handleAssess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = await buildSkdnexScript();
      const voice  = getActiveVoice();
      const res = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method:  "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body:    JSON.stringify({ message: `Scenario Knowledge Dataset Nexus: ${script}` }),
      });
      const j = await res.json();
      const reply = j.response || j.message || j.answer || script;
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: reply, voice } }));
    } catch {
      const fallback = await buildSkdnexScript().catch(
        () => "Scenario intelligence grounding assessment unavailable."
      );
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", { detail: { text: fallback, voice: getActiveVoice() } })
      );
    } finally {
      setAssessing(false);
    }
  }, []);

  const fullyGrounded = rows.filter((r) => r.tag === "FULLY_GROUNDED").length;
  const ungrounded    = rows.filter((r) => r.tag === "UNGROUNDED").length;
  const pct = rows.length ? Math.round((fullyGrounded / rows.length) * 100) : 0;
  const hasGap = ungrounded > 0;

  const visible = rows.filter((r) => {
    if (tab !== "ALL" && r.tag !== tab) return false;
    if (search) return r.label.toLowerCase().includes(search.toLowerCase());
    return true;
  });

  return (
    <>
      <button
        onClick={() => { setOpen((o) => { if (!o) load(); return !o; }); }}
        style={{
          position:   "fixed",
          left:       BTN_LEFT,
          bottom:     8,
          zIndex:     Z,
          background: open ? "rgba(41,231,255,0.12)" : "rgba(0,10,20,0.7)",
          border:     `1px solid ${open ? CY : "rgba(41,231,255,0.3)"}`,
          color:      open ? CY : "#6B8CA3",
          borderRadius: 4,
          padding:    "3px 8px",
          fontSize:   10,
          cursor:     "pointer",
          fontFamily: MN,
          letterSpacing: 1,
          whiteSpace: "nowrap",
          animation:  hasGap && !open ? "skdnex-pulse 1.6s ease-in-out infinite" : "none",
        }}
        title="Scenario × Knowledge × Dataset Intelligence Nexus (SKDNEX)"
      >
        ◈ SKDNEX
        {rows.length > 0 && (
          <span style={{ color: hasGap ? RD : GR, marginLeft: 4 }}>
            {ungrounded > 0 ? `${ungrounded}⚠` : `${pct}%`}
          </span>
        )}
      </button>

      <style>{`
        @keyframes skdnex-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
          50%      { box-shadow: 0 0 0 5px rgba(239,68,68,0); }
        }
      `}</style>

      {open && (
        <div
          style={{
            position:      "fixed",
            left:          "50%",
            top:           "50%",
            transform:     "translate(-50%,-50%)",
            zIndex:        Z + 1,
            width:         580,
            maxHeight:     660,
            background:    BG,
            border:        `1px solid ${CY}44`,
            borderRadius:  10,
            boxShadow:     `0 0 40px ${CY}22`,
            display:       "flex",
            flexDirection: "column",
            overflow:      "hidden",
            fontFamily:    MN,
          }}
        >
          {/* Header */}
          <div style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
            padding:        "10px 16px",
            borderBottom:   `1px solid ${CY}33`,
          }}>
            <span style={{ color: CY, fontSize: 12, letterSpacing: 2 }}>
              ◈ SCENARIO × KNOWLEDGE × DATASET NEXUS
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleAssess}
                disabled={assessing}
                style={{
                  background:    assessing ? "#0A2030" : "rgba(41,231,255,0.1)",
                  border:        `1px solid ${CY}55`,
                  color:         assessing ? "#6B8CA3" : CY,
                  borderRadius:  4,
                  padding:       "3px 10px",
                  fontSize:      10,
                  cursor:        assessing ? "default" : "pointer",
                  letterSpacing: 1,
                  fontFamily:    MN,
                }}
              >
                {assessing ? "…" : "▶ ASSESS"}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "transparent", border: "none", color: "#6B8CA3", fontSize: 16, cursor: "pointer", lineHeight: 1 }}
              >
                ×
              </button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "10px 16px", flexWrap: "wrap" }}>
            <Tile label="SCENARIOS"      value={loading ? "…" : rows.length}     color={CY} />
            <Tile label="KB ARTICLES"    value={loading ? "…" : kbCount}          color={AM} />
            <Tile label="DATASETS"       value={loading ? "…" : dsCount}          color="#29B6F6" />
            <Tile label="FULLY GROUNDED" value={loading ? "…" : fullyGrounded}    color={GR} />
            <Tile label="UNGROUNDED"     value={loading ? "…" : ungrounded}       color={ungrounded > 0 ? RD : "#4A6070"} />
          </div>

          {/* Coverage bar */}
          {rows.length > 0 && (
            <div style={{ padding: "0 16px 8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ color: "#6B8CA3", fontSize: 9, letterSpacing: 1 }}>
                  FULL INTELLIGENCE GROUNDING
                </span>
                <span style={{ color: pct >= 70 ? GR : pct >= 40 ? AM : RD, fontSize: 9, fontFamily: MN }}>
                  {pct}%
                </span>
              </div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                <div
                  style={{
                    height: "100%",
                    width: `${pct}%`,
                    background: pct >= 70 ? GR : pct >= 40 ? AM : RD,
                    borderRadius: 2,
                    transition: "width 0.5s ease",
                  }}
                />
              </div>
            </div>
          )}

          {/* Tabs + search */}
          <div style={{ display: "flex", gap: 4, padding: "0 16px 8px", alignItems: "center", flexWrap: "wrap" }}>
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background:    tab === t ? "rgba(41,231,255,0.12)" : "transparent",
                  border:        `1px solid ${tab === t ? CY : "rgba(41,231,255,0.2)"}`,
                  color:         tab === t ? CY : "#6B8CA3",
                  borderRadius:  4,
                  padding:       "2px 7px",
                  fontSize:      8,
                  cursor:        "pointer",
                  fontFamily:    MN,
                  letterSpacing: 1,
                  whiteSpace:    "nowrap",
                }}
              >
                {t.replace(/_/g, " ")}
              </button>
            ))}
            <input
              placeholder="Search scenarios…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                flex:          1,
                minWidth:      80,
                background:    "rgba(0,20,30,0.5)",
                border:        "1px solid rgba(41,231,255,0.15)",
                borderRadius:  4,
                color:         "#B0C8D8",
                fontSize:      9,
                padding:       "3px 8px",
                fontFamily:    MN,
                outline:       "none",
              }}
            />
          </div>

          {/* Error */}
          {err && (
            <div style={{ color: RD, fontSize: 10, padding: "4px 16px" }}>⚠ {err}</div>
          )}

          {/* List */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 12px" }}>
            {loading && rows.length === 0 ? (
              <div style={{ color: "#6B8CA3", fontSize: 11, padding: "20px 0", textAlign: "center" }}>
                Loading scenarios…
              </div>
            ) : visible.length === 0 ? (
              <div style={{ color: "#4A6070", fontSize: 10, padding: "20px 0", textAlign: "center" }}>
                No scenarios match current filter.
              </div>
            ) : (
              visible.map((row, i) => (
                <ScenarioRow
                  key={row.s?.id || i}
                  row={row}
                  expanded={!!expanded[row.s?.id || i]}
                  onToggle={() =>
                    setExpanded((e) => ({ ...e, [row.s?.id || i]: !e[row.s?.id || i] }))
                  }
                />
              ))
            )}
          </div>

          {/* Footer */}
          <div style={{
            borderTop:     `1px solid ${CY}22`,
            padding:       "6px 16px",
            color:         "#6B8CA3",
            fontSize:      9,
            letterSpacing: 1,
          }}>
            AUTO-REFRESH 90 s · /v1/scenario/list × /knowledge/ × /v1/datasets · Click row to expand
            {loading && " · LOADING…"}
          </div>
        </div>
      )}
    </>
  );
}
