/**
 * OpsEventGapFinder — F31 (overnight build).
 *
 * Cross-references /v1/ops/events (all severities) against /v1/investigations
 * to surface ops events that have NO matching open investigation — operational
 * response gaps. The inverse of InvestigationOpsFrequency (which goes
 * investigation → events).
 *
 * Classification per ops event (keyword-token overlap):
 *   COVERED   — ≥1 open investigation keyword-matches this event
 *   UNCOVERED — no investigation match
 *
 * Visual:
 *   • Stat tiles: EVENTS / INVESTIGATIONS / COVERED / UNCOVERED / CRIT UNCOVERED
 *   • Filter tabs: ALL / COVERED / UNCOVERED
 *   • Text search on event name/service/source
 *   • Severity badge per row (CRITICAL/HIGH/MEDIUM/INFO)
 *   • Red pulse on UNCOVERED count when any critical events are uncovered
 *   • Expand event → matched investigation list (cyan score bars + status badge)
 *   • ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence ops gap brief + TTS
 *
 * Toggle: ◈ OEGAP  left:988860  bottom:8  zIndex:136
 * Event:  jarvis:oegap-toggle
 * Wired:  App.jsx + JarvisBrain.jsx (isOegapQuery / buildOegapScript)
 *
 * Voice: "oegap" / "ops gap" / "uninvestigated event" / "ops event gap" /
 *        "ops not investigated" / "investigation gap" / "event without case" /
 *        "ops coverage gap" / "uncovered event"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const RED   = "#FF3D5A";
const GN    = "#00E5A0";
const MONO  = "'JetBrains Mono','Courier New',monospace";

const BTN_LEFT   = 988860;
const REFRESH_MS = 45_000;
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

const SEV_ORDER = { critical: 0, high: 1, medium: 2, info: 3, low: 4 };
function sevRank(s) { return SEV_ORDER[String(s).toLowerCase()] ?? 5; }
function sevColor(s) {
  switch (String(s).toLowerCase()) {
    case "critical": return RED;
    case "high":     return AMBER;
    case "medium":   return CY;
    default:         return "rgba(255,255,255,0.45)";
  }
}

async function loadData() {
  const base = apiBase();
  const [evRaw, invRaw] = await Promise.all([
    fetch(`${base}/v1/ops/events`, { headers: authHdr() })
      .then(r => r.ok ? r.json() : []),
    fetch(`${base}/v1/investigations`, { headers: authHdr() })
      .then(r => r.ok ? r.json() : []),
  ]);

  const events        = normalise(evRaw);
  const investigations = normalise(invRaw);

  const invToks = investigations.map(inv => ({
    inv,
    tok: tokens([inv.title, inv.name, inv.description, inv.subject].join(" ")),
  }));

  const rows = events.map(ev => {
    const evTok = tokens([
      ev.name, ev.title, ev.message, ev.description,
      ev.service, ev.source, ev.type, ev.category,
    ].join(" "));

    const matches = invToks
      .map(({ inv, tok }) => {
        const hits = overlap(evTok, tok);
        return hits.length ? { inv, hits, score: pct(hits.length, Math.max(evTok.length, tok.length)) } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

    return {
      ev,
      sev: (ev.severity || ev.level || "info").toLowerCase(),
      cls: matches.length ? "COVERED" : "UNCOVERED",
      matches,
    };
  });

  rows.sort((a, b) => {
    if (a.cls !== b.cls) return a.cls === "UNCOVERED" ? -1 : 1;
    return sevRank(a.sev) - sevRank(b.sev);
  });

  const counts = {
    events:          rows.length,
    investigations:  investigations.length,
    covered:         rows.filter(r => r.cls === "COVERED").length,
    uncovered:       rows.filter(r => r.cls === "UNCOVERED").length,
    critUncovered:   rows.filter(r => r.cls === "UNCOVERED" && r.sev === "critical").length,
  };

  return { rows, counts };
}

// ── exported helpers for JarvisBrain ─────────────────────────────────────────

export function isOegapQuery(q) {
  const s = String(q).toLowerCase();
  return (
    s.includes("oegap") ||
    s.includes("ops gap") ||
    s.includes("uninvestigated event") ||
    s.includes("ops event gap") ||
    s.includes("ops not investigated") ||
    s.includes("investigation gap") ||
    s.includes("event without case") ||
    s.includes("ops coverage gap") ||
    s.includes("uncovered event")
  );
}

export async function buildOegapScript() {
  try {
    const { counts } = await loadData();
    const critMsg =
      counts.critUncovered > 0
        ? `${counts.critUncovered} CRITICAL event(s) have NO open investigation — immediate escalation required.`
        : "No critical events are currently uncovered.";
    return (
      `Ops event gap analysis: ${counts.events} ops events checked against ` +
      `${counts.investigations} open investigations. ` +
      `Covered (investigation linked): ${counts.covered}. ` +
      `Uncovered (no investigation): ${counts.uncovered}. ` +
      critMsg
    );
  } catch {
    return "Ops event gap data unavailable.";
  }
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "COVERED", "UNCOVERED"];

export default function OpsEventGapFinder() {
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
      if (d.counts.critUncovered > 0) setPulse(true);
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
    window.addEventListener("jarvis:oegap-toggle", handler);
    return () => window.removeEventListener("jarvis:oegap-toggle", handler);
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
    const ev = r.ev;
    return [ev.name, ev.title, ev.service, ev.source, ev.type, ev.message]
      .some(v => String(v || "").toLowerCase().includes(s));
  });

  function assess() {
    buildOegapScript().then(script => {
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

  const clsColor = cls => cls === "COVERED" ? GN : RED;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position:   "fixed",
          bottom:     8,
          left:       BTN_LEFT,
          zIndex:     136,
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
        title="Ops Event Gap Finder (OEGAP)"
      >
        ◈ OEGAP
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
              ◈ OPS EVENT GAP FINDER
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
                { label: "EVENTS",    val: counts.events,         col: CY },
                { label: "CASES",     val: counts.investigations,  col: CY },
                { label: "COVERED",   val: counts.covered,         col: GN },
                { label: "UNCOVERED", val: counts.uncovered,       col: RED, pulse: pulse },
                { label: "CRIT GAP",  val: counts.critUncovered,   col: RED },
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
              placeholder="filter events…"
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
                No events match current filter.
              </div>
            )}
            {filtered.map((r, i) => {
              const ev    = r.ev;
              const label = ev.name || ev.title || ev.message || `Event #${i}`;
              const svc   = ev.service || ev.source || ev.type || "—";
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
                      minWidth:     58,
                      textAlign:    "center",
                    }}>{r.cls}</span>
                    <span style={{
                      background:   `${sevColor(r.sev)}22`,
                      border:       `1px solid ${sevColor(r.sev)}55`,
                      borderRadius: 3,
                      color:        sevColor(r.sev),
                      fontSize:     8,
                      padding:      "1px 5px",
                      minWidth:     48,
                      textAlign:    "center",
                    }}>{r.sev.toUpperCase()}</span>
                    <span style={{ color: "#fff", fontSize: 10, flex: 1 }} title={label}>
                      {label.length > 38 ? label.slice(0, 35) + "…" : label}
                    </span>
                    <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 9 }}>{svc}</span>
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
                        <div style={{ color: RED, fontSize: 9 }}>
                          No matching investigations found — this event is an operational gap.
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
                                background: CY,
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
