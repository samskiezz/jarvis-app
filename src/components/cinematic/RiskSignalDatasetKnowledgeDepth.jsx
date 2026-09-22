/**
 * RiskSignalDatasetKnowledgeDepth — F33 (overnight build 2026-09-16).
 *
 * Cross-references /entities/RiskSignal with /v1/datasets AND /knowledge/
 * to classify each risk signal by intelligence depth:
 *
 *   DEEP_INTEL  — keyword-matches ≥1 dataset AND ≥1 KB article
 *   DATA_ONLY   — matches a dataset but no KB article
 *   KB_ONLY     — matches a KB article but no dataset
 *   SHALLOW     — no dataset or KB article backing (intelligence blind spot)
 *
 * Visual:
 *   • Stat tiles: RISKS / DATASETS / KB ARTS / DEEP INTEL / SHALLOW
 *   • Filter tabs: ALL / DEEP_INTEL / DATA_ONLY / KB_ONLY / SHALLOW
 *   • Text search on risk signal name/category/severity
 *   • Expand row → matched datasets (cyan bars) + KB articles (amber bars)
 *   • Red pulse on SHALLOW count when any exist
 *   • ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence intel-depth brief + TTS
 *
 * Toggle: ◈ RDKIDEP  left:990280  bottom:8  zIndex:138
 * Event:  jarvis:rdkidep-toggle
 * Wired:  App.jsx + JarvisBrain.jsx (isRdkidepQuery / buildRdkidepScript)
 *
 * Voice: "rdkidep" / "risk dataset" / "risk knowledge" / "shallow risk" /
 *        "undocumented risk" / "risk intelligence depth" / "dark risk signal" /
 *        "risk data gap"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const RED   = "#FF3D5A";
const GN    = "#00E5A0";
const MONO  = "'JetBrains Mono','Courier New',monospace";

const BTN_LEFT   = 990280;
const REFRESH_MS = 90_000;
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
  const [riskRaw, dsRaw, kbRaw] = await Promise.all([
    fetch(`${base}/entities/RiskSignal`, { headers: authHdr() })
      .then(r => r.ok ? r.json() : []),
    fetch(`${base}/v1/datasets`, { headers: authHdr() })
      .then(r => r.ok ? r.json() : []),
    fetch(`${base}/knowledge/`, { headers: authHdr() })
      .then(r => r.ok ? r.json() : []),
  ]);

  const risks    = normalise(riskRaw);
  const datasets = normalise(dsRaw);
  const kbArts   = normalise(kbRaw);

  const dsToks = datasets.map(ds => ({
    ds,
    tok: tokens([ds.name, ds.title, ds.description, ds.category, ds.type].join(" ")),
  }));

  const kbToks = kbArts.map(kb => ({
    kb,
    tok: tokens([kb.title, kb.name, kb.content, kb.summary, kb.category, kb.tags].join(" ")),
  }));

  const rows = risks.map(risk => {
    const rTok = tokens([
      risk.name, risk.title, risk.description, risk.category,
      risk.type, risk.severity, risk.source,
    ].join(" "));

    const dsMatches = dsToks
      .map(({ ds, tok }) => {
        const hits = overlap(rTok, tok);
        return hits.length
          ? { ds, hits, score: pct(hits.length, Math.max(rTok.length, tok.length)) }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

    const kbMatches = kbToks
      .map(({ kb, tok }) => {
        const hits = overlap(rTok, tok);
        return hits.length
          ? { kb, hits, score: pct(hits.length, Math.max(rTok.length, tok.length)) }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

    const hasDs = dsMatches.length > 0;
    const hasKb = kbMatches.length > 0;
    const cls =
      hasDs && hasKb ? "DEEP_INTEL" :
      hasDs          ? "DATA_ONLY"  :
      hasKb          ? "KB_ONLY"    :
                       "SHALLOW";

    return { risk, cls, dsMatches, kbMatches };
  });

  rows.sort((a, b) => {
    const order = { SHALLOW: 0, DATA_ONLY: 1, KB_ONLY: 2, DEEP_INTEL: 3 };
    return order[a.cls] - order[b.cls];
  });

  const counts = {
    risks:     rows.length,
    datasets:  datasets.length,
    kbArts:    kbArts.length,
    deepIntel: rows.filter(r => r.cls === "DEEP_INTEL").length,
    shallow:   rows.filter(r => r.cls === "SHALLOW").length,
  };

  return { rows, counts };
}

// ── exported helpers for JarvisBrain ─────────────────────────────────────────

export function isRdkidepQuery(q) {
  const s = String(q).toLowerCase();
  return (
    s.includes("rdkidep") ||
    s.includes("risk dataset") ||
    s.includes("risk knowledge") ||
    s.includes("shallow risk") ||
    s.includes("undocumented risk") ||
    s.includes("risk intelligence depth") ||
    s.includes("dark risk signal") ||
    s.includes("risk data gap")
  );
}

export async function buildRdkidepScript() {
  try {
    const { counts } = await loadData();
    const shallowMsg =
      counts.shallow > 0
        ? `${counts.shallow} risk signal(s) have NO dataset or KB backing — intelligence blind spots requiring immediate attention.`
        : "All risk signals have at least one data or knowledge backing.";
    return (
      `Risk signal intelligence depth: ${counts.risks} risk signals cross-referenced ` +
      `against ${counts.datasets} datasets and ${counts.kbArts} KB articles. ` +
      `Deep intel (both dataset + KB): ${counts.deepIntel}. ` +
      `Shallow (no backing): ${counts.shallow}. ` +
      shallowMsg
    );
  } catch {
    return "Risk signal intelligence depth data unavailable.";
  }
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "DEEP_INTEL", "DATA_ONLY", "KB_ONLY", "SHALLOW"];

const CLS_COLOR = {
  DEEP_INTEL: GN,
  DATA_ONLY:  CY,
  KB_ONLY:    AMBER,
  SHALLOW:    RED,
};

export default function RiskSignalDatasetKnowledgeDepth() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [counts, setCounts]     = useState(null);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [pulse, setPulse]       = useState(false);
  const timerRef = useRef(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await loadData();
      setRows(d.rows);
      setCounts(d.counts);
      if (d.counts.shallow > 0) setPulse(true);
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
    window.addEventListener("jarvis:rdkidep-toggle", handler);
    return () => window.removeEventListener("jarvis:rdkidep-toggle", handler);
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
    const risk = r.risk;
    return [risk.name, risk.title, risk.category, risk.severity, risk.source]
      .some(v => String(v || "").toLowerCase().includes(s));
  });

  function assess() {
    buildRdkidepScript().then(script => {
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
          zIndex:     138,
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
        title="RiskSignal × Dataset × Knowledge Intelligence Depth (RDKIDEP)"
      >
        ◈ RDKIDEP
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position:   "fixed",
          top:        60,
          right:      20,
          width:      540,
          maxHeight:  "78vh",
          zIndex:     9100,
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
              ◈ RISK × DATASET × KNOWLEDGE DEPTH
            </span>
            <div style={{ display: "flex", gap: 6 }}>
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
                { label: "RISKS",      val: counts.risks,     col: CY },
                { label: "DATASETS",   val: counts.datasets,  col: CY },
                { label: "KB ARTS",    val: counts.kbArts,    col: CY },
                { label: "DEEP INTEL", val: counts.deepIntel, col: GN },
                { label: "SHALLOW",    val: counts.shallow,   col: RED, pulse },
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
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 8, marginTop: 1 }}>{t.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Filter tabs + search */}
          <div style={{ padding: "0 14px 8px", flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
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
              placeholder="filter risk signals…"
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

          {/* Rows */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 14px 12px" }}>
            {loading && <div style={{ color: CY, fontSize: 10, padding: "8px 0" }}>Loading…</div>}
            {error   && <div style={{ color: RED, fontSize: 10, padding: "8px 0" }}>{error}</div>}
            {!loading && !error && filtered.length === 0 && (
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, padding: "8px 0" }}>
                No risk signals match current filter.
              </div>
            )}
            {filtered.map((r, i) => {
              const risk  = r.risk;
              const label = risk.name || risk.title || `Risk #${i}`;
              const sev   = risk.severity || risk.level || risk.category || "—";
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
                      minWidth:     72,
                      textAlign:    "center",
                    }}>{r.cls}</span>
                    <span style={{ color: "#fff", fontSize: 10, flex: 1 }} title={label}>
                      {label.length > 35 ? label.slice(0, 32) + "…" : label}
                    </span>
                    <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 9 }}>{sev}</span>
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
                      {r.dsMatches.length === 0 && r.kbMatches.length === 0 ? (
                        <div style={{ color: RED, fontSize: 9 }}>
                          No dataset or KB article matches — shallow intelligence.
                        </div>
                      ) : (
                        <>
                          {r.dsMatches.length > 0 && (
                            <div style={{ marginBottom: 6 }}>
                              <div style={{ color: CY, fontSize: 9, marginBottom: 3 }}>DATASETS</div>
                              {r.dsMatches.slice(0, 4).map((m, mi) => (
                                <div key={mi} style={{ marginBottom: 4 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                                    <span style={{ color: CY, fontSize: 9 }}>
                                      {(m.ds.name || m.ds.title || "Dataset").slice(0, 40)}
                                    </span>
                                    <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 9 }}>
                                      {m.ds.type || m.ds.category || "—"}
                                    </span>
                                  </div>
                                  <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
                                    <div style={{ height: "100%", width: `${m.score}%`, background: CY, borderRadius: 2, transition: "width 0.3s" }} />
                                  </div>
                                  <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 8, marginTop: 1 }}>
                                    match: {m.hits.slice(0, 4).join(", ")} ({m.score}%)
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {r.kbMatches.length > 0 && (
                            <div>
                              <div style={{ color: AMBER, fontSize: 9, marginBottom: 3 }}>KB ARTICLES</div>
                              {r.kbMatches.slice(0, 4).map((m, mi) => (
                                <div key={mi} style={{ marginBottom: 4 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                                    <span style={{ color: AMBER, fontSize: 9 }}>
                                      {(m.kb.title || m.kb.name || "Article").slice(0, 40)}
                                    </span>
                                    <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 9 }}>
                                      {m.kb.category || "—"}
                                    </span>
                                  </div>
                                  <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
                                    <div style={{ height: "100%", width: `${m.score}%`, background: AMBER, borderRadius: 2, transition: "width 0.3s" }} />
                                  </div>
                                  <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 8, marginTop: 1 }}>
                                    match: {m.hits.slice(0, 4).join(", ")} ({m.score}%)
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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
