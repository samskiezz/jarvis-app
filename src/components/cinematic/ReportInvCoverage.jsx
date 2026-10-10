/**
 * ReportInvCoverage — F32 (overnight build).
 *
 * Cross-references /v1/reports with /v1/investigations to surface:
 *   SUPPORTING  — report keyword-matches ≥1 open investigation (report backs a case)
 *   UNLINKED    — report matches no investigation (orphaned intelligence)
 *
 * And surfaces the inverse view per investigation:
 *   BACKED   — ≥1 report supports this investigation
 *   DARK     — investigation has no report coverage (intelligence gap)
 *
 * Visual:
 *   • Stat tiles: REPORTS / INVESTIGATIONS / SUPPORTING / UNLINKED / DARK CASES
 *   • Filter tabs: ALL / SUPPORTING / UNLINKED
 *   • Text search on report title/source
 *   • Expand report → matched investigation list (cyan score bars + status badge)
 *   • Red pulse on DARK CASES count when any exist
 *   • ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence coverage brief + TTS
 *
 * Toggle: ◈ RICOV  left:989420  bottom:8  zIndex:137
 * Event:  jarvis:ricov-toggle
 * Wired:  App.jsx + JarvisBrain.jsx (isRicovQuery / buildRicovScript)
 *
 * Voice: "rinv" / "report investigation" / "report coverage" / "dark case" /
 *        "unlinked report" / "investigation without report" / "report gap" /
 *        "intelligence gap" / "unsupported investigation"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const RED   = "#FF3D5A";
const GN    = "#00E5A0";
const MONO  = "'JetBrains Mono','Courier New',monospace";

const BTN_LEFT   = 989420;
const REFRESH_MS = 60_000;
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
  const [repRaw, invRaw] = await Promise.all([
    fetch(`${base}/v1/reports`, { headers: authHdr() })
      .then(r => r.ok ? r.json() : []),
    fetch(`${base}/v1/investigations`, { headers: authHdr() })
      .then(r => r.ok ? r.json() : []),
  ]);

  const reports       = normalise(repRaw);
  const investigations = normalise(invRaw);

  const invToks = investigations.map(inv => ({
    inv,
    tok: tokens([inv.title, inv.name, inv.description, inv.subject].join(" ")),
  }));

  const rows = reports.map(rep => {
    const repTok = tokens([
      rep.title, rep.name, rep.summary, rep.description,
      rep.source, rep.category, rep.type,
    ].join(" "));

    const matches = invToks
      .map(({ inv, tok }) => {
        const hits = overlap(repTok, tok);
        return hits.length
          ? { inv, hits, score: pct(hits.length, Math.max(repTok.length, tok.length)) }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

    return {
      rep,
      cls: matches.length ? "SUPPORTING" : "UNLINKED",
      matches,
    };
  });

  rows.sort((a, b) => {
    if (a.cls !== b.cls) return a.cls === "UNLINKED" ? -1 : 1;
    return 0;
  });

  const backedInvIds = new Set(
    rows.flatMap(r => r.matches.map(m => m.inv.id || m.inv.title || m.inv.name))
  );
  const darkCases = investigations.filter(
    inv => !backedInvIds.has(inv.id || inv.title || inv.name)
  ).length;

  const counts = {
    reports:       rows.length,
    investigations: investigations.length,
    supporting:    rows.filter(r => r.cls === "SUPPORTING").length,
    unlinked:      rows.filter(r => r.cls === "UNLINKED").length,
    darkCases,
  };

  return { rows, counts };
}

// ── exported helpers for JarvisBrain ─────────────────────────────────────────

export function isRicovQuery(q) {
  const s = String(q).toLowerCase();
  return (
    s.includes("rinv") ||
    s.includes("report investigation") ||
    s.includes("report coverage") ||
    s.includes("dark case") ||
    s.includes("unlinked report") ||
    s.includes("investigation without report") ||
    s.includes("report gap") ||
    s.includes("intelligence gap") ||
    s.includes("unsupported investigation")
  );
}

export async function buildRicovScript() {
  try {
    const { counts } = await loadData();
    const darkMsg =
      counts.darkCases > 0
        ? `${counts.darkCases} investigation(s) have NO supporting report — intelligence gaps require immediate attention.`
        : "All open investigations have at least one supporting report.";
    return (
      `Report-investigation coverage: ${counts.reports} reports cross-referenced ` +
      `against ${counts.investigations} open investigations. ` +
      `Supporting (linked to a case): ${counts.supporting}. ` +
      `Unlinked (orphaned intelligence): ${counts.unlinked}. ` +
      darkMsg
    );
  } catch {
    return "Report-investigation coverage data unavailable.";
  }
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "SUPPORTING", "UNLINKED"];

export default function ReportInvCoverage() {
  const [open, setOpen]     = useState(false);
  const [rows, setRows]     = useState([]);
  const [counts, setCounts] = useState(null);
  const [tab, setTab]       = useState("ALL");
  const [search, setSearch] = useState("");
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
      if (d.counts.darkCases > 0) setPulse(true);
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
    window.addEventListener("jarvis:ricov-toggle", handler);
    return () => window.removeEventListener("jarvis:ricov-toggle", handler);
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
    const rep = r.rep;
    return [rep.title, rep.name, rep.source, rep.category, rep.summary]
      .some(v => String(v || "").toLowerCase().includes(s));
  });

  function assess() {
    buildRicovScript().then(script => {
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

  const clsColor = cls => cls === "SUPPORTING" ? GN : AMBER;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position:   "fixed",
          bottom:     8,
          left:       BTN_LEFT,
          zIndex:     137,
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
        title="Report × Investigation Coverage (RINV)"
      >
        ◈ RICOV
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position:   "fixed",
          top:        60,
          right:      20,
          width:      520,
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
              ◈ REPORT × INVESTIGATION COVERAGE
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
                { label: "REPORTS",    val: counts.reports,        col: CY },
                { label: "CASES",      val: counts.investigations,  col: CY },
                { label: "SUPPORTING", val: counts.supporting,      col: GN },
                { label: "UNLINKED",   val: counts.unlinked,        col: AMBER },
                { label: "DARK CASES", val: counts.darkCases,       col: RED, pulse },
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
              placeholder="filter reports…"
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
                No reports match current filter.
              </div>
            )}
            {filtered.map((r, i) => {
              const rep   = r.rep;
              const label = rep.title || rep.name || `Report #${i}`;
              const src   = rep.source || rep.category || rep.type || "—";
              const isExp = expanded === i;
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
                      background:   `${clsColor(r.cls)}22`,
                      border:       `1px solid ${clsColor(r.cls)}55`,
                      borderRadius: 3,
                      color:        clsColor(r.cls),
                      fontSize:     8,
                      padding:      "1px 5px",
                      minWidth:     68,
                      textAlign:    "center",
                    }}>{r.cls}</span>
                    <span style={{ color: "#fff", fontSize: 10, flex: 1 }} title={label}>
                      {label.length > 38 ? label.slice(0, 35) + "…" : label}
                    </span>
                    <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 9 }}>{src}</span>
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
                      {r.matches.length === 0 ? (
                        <div style={{ color: AMBER, fontSize: 9 }}>
                          No matching investigations — this report is unlinked intelligence.
                        </div>
                      ) : (
                        r.matches.slice(0, 5).map((m, mi) => (
                          <div key={mi} style={{ marginBottom: 4 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                              <span style={{ color: CY, fontSize: 9 }}>
                                {(m.inv.title || m.inv.name || "Investigation").slice(0, 40)}
                              </span>
                              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 9 }}>
                                {m.inv.status || "open"}
                              </span>
                            </div>
                            <div style={{
                              height:       4,
                              background:   "rgba(255,255,255,0.08)",
                              borderRadius: 2,
                              overflow:     "hidden",
                            }}>
                              <div style={{
                                height:     "100%",
                                width:      `${m.score}%`,
                                background: GN,
                                borderRadius: 2,
                                transition: "width 0.3s",
                              }} />
                            </div>
                            <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 8, marginTop: 1 }}>
                              match: {m.hits.slice(0, 4).join(", ")} ({m.score}%)
                            </div>
                          </div>
                        ))
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
