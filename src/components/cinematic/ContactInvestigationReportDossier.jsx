/**
 * ContactInvestigationReportDossier — F35 (overnight build 2026-09-16).
 *
 * Cross-references /entities/Contact × /v1/investigations × /v1/reports
 * to classify each contact by mission documentation coverage:
 *
 *   FULLY_DOCUMENTED — contact matches ≥1 investigation AND ≥1 report
 *   INVESTIGATED     — investigation match, no report coverage
 *   REPORTED         — report match, no investigation coverage
 *   DARK             — no investigation or report coverage (personnel blind spot)
 *
 * Visual:
 *   • Stat tiles: CONTACTS / INVESTIGATIONS / REPORTS / FULLY DOC / DARK
 *   • Filter tabs: ALL / FULLY_DOCUMENTED / INVESTIGATED / REPORTED / DARK
 *   • Text search on name/email/company/title
 *   • Expand row → split pane: left=matched investigations, right=matched reports
 *   • Red pulse on DARK count when any exist
 *   • ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *
 * Toggle: ◈ CIRDOSS  left:992000  bottom:8  zIndex:140
 * Event:  jarvis:cirdoss-toggle
 * Wired:  App.jsx + JarvisBrain.jsx (isCirdossQuery / buildCirdossScript)
 *
 * Voice: "cirdoss" / "contact investigation" / "contact report" /
 *        "dark contact" / "mission dossier" / "personnel dossier" /
 *        "contact case" / "contact coverage" / "personnel coverage" /
 *        "dark personnel"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const RED   = "#FF3D5A";
const GN    = "#00E5A0";
const AMBER = "#F5A623";
const VIO   = "#B57BFF";
const MONO  = "'JetBrains Mono','Courier New',monospace";

const BTN_LEFT   = 992000;
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
  const [contactRaw, invRaw, repRaw] = await Promise.all([
    fetch(`${base}/entities/Contact`, { headers: authHdr() })
      .then(r => r.ok ? r.json() : []),
    fetch(`${base}/v1/investigations`, { headers: authHdr() })
      .then(r => r.ok ? r.json() : []),
    fetch(`${base}/v1/reports`, { headers: authHdr() })
      .then(r => r.ok ? r.json() : []),
  ]);

  const contacts      = normalise(contactRaw);
  const investigations = normalise(invRaw);
  const reports       = normalise(repRaw);

  const invToks = investigations.map(inv => ({
    inv,
    tok: tokens([
      inv.title, inv.name, inv.description, inv.subject,
      inv.summary, inv.status, inv.tags, inv.category,
    ].join(" ")),
  }));

  const repToks = reports.map(rep => ({
    rep,
    tok: tokens([
      rep.title, rep.name, rep.description, rep.summary,
      rep.category, rep.type, rep.tags,
    ].join(" ")),
  }));

  const rows = contacts.map(contact => {
    const cTok = tokens([
      contact.name, contact.email, contact.company, contact.title,
      contact.description, contact.role, contact.tags, contact.aliases,
    ].join(" "));

    const invMatches = invToks
      .map(({ inv, tok }) => {
        const hits = overlap(cTok, tok);
        return hits.length
          ? { inv, hits, score: pct(hits.length, Math.max(cTok.length, tok.length)) }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

    const repMatches = repToks
      .map(({ rep, tok }) => {
        const hits = overlap(cTok, tok);
        return hits.length
          ? { rep, hits, score: pct(hits.length, Math.max(cTok.length, tok.length)) }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

    const hasInv = invMatches.length > 0;
    const hasRep = repMatches.length > 0;

    let cls;
    if (hasInv && hasRep) cls = "FULLY_DOCUMENTED";
    else if (hasInv)      cls = "INVESTIGATED";
    else if (hasRep)      cls = "REPORTED";
    else                  cls = "DARK";

    return { contact, cls, invMatches, repMatches };
  });

  rows.sort((a, b) => {
    const order = { DARK: 0, INVESTIGATED: 1, REPORTED: 2, FULLY_DOCUMENTED: 3 };
    return order[a.cls] - order[b.cls];
  });

  const counts = {
    contacts:       rows.length,
    investigations: investigations.length,
    reports:        reports.length,
    fullyDoc:       rows.filter(r => r.cls === "FULLY_DOCUMENTED").length,
    investigated:   rows.filter(r => r.cls === "INVESTIGATED").length,
    reported:       rows.filter(r => r.cls === "REPORTED").length,
    dark:           rows.filter(r => r.cls === "DARK").length,
  };

  return { rows, counts };
}

// ── exported helpers for JarvisBrain ─────────────────────────────────────────

export function isCirdossQuery(q) {
  const s = String(q).toLowerCase();
  return (
    s.includes("cirdoss") ||
    s.includes("contact investigation") ||
    s.includes("contact report") ||
    s.includes("dark contact") ||
    s.includes("mission dossier") ||
    s.includes("personnel dossier") ||
    s.includes("contact case") ||
    s.includes("contact coverage") ||
    s.includes("personnel coverage") ||
    s.includes("dark personnel")
  );
}

export async function buildCirdossScript() {
  try {
    const { counts } = await loadData();
    const darkMsg =
      counts.dark > 0
        ? `${counts.dark} contact(s) have NO investigation or report coverage — personnel blind spots with zero intelligence documentation.`
        : "All contacts have at least one investigation or report link.";
    return (
      `Contact mission dossier coverage: ${counts.contacts} contacts cross-referenced ` +
      `against ${counts.investigations} investigations and ${counts.reports} reports. ` +
      `Fully documented: ${counts.fullyDoc}. ` +
      `Investigation-only: ${counts.investigated}. Report-only: ${counts.reported}. ` +
      `Dark (no coverage): ${counts.dark}. ` +
      darkMsg
    );
  } catch {
    return "Contact investigation report coverage data unavailable.";
  }
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "FULLY_DOCUMENTED", "INVESTIGATED", "REPORTED", "DARK"];

const CLS_COLOR = {
  FULLY_DOCUMENTED: GN,
  INVESTIGATED:     CY,
  REPORTED:         VIO,
  DARK:             RED,
};

export default function ContactInvestigationReportDossier() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
  const [counts, setCounts]   = useState(null);
  const [tab, setTab]         = useState("ALL");
  const [search, setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [pulse, setPulse]     = useState(false);
  const timerRef = useRef(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await loadData();
      setRows(d.rows);
      setCounts(d.counts);
      if (d.counts.dark > 0) setPulse(true);
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
    window.addEventListener("jarvis:cirdoss-toggle", handler);
    return () => window.removeEventListener("jarvis:cirdoss-toggle", handler);
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
    const c = r.contact;
    return [c.name, c.email, c.company, c.title, c.role]
      .some(v => String(v || "").toLowerCase().includes(s));
  });

  function assess() {
    buildCirdossScript().then(script => {
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
          zIndex:     140,
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
        title="Contact × Investigation × Report Mission Dossier (CIRDOSS)"
      >
        ◈ CIRDOSS
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position:      "fixed",
          top:           60,
          right:         20,
          width:         580,
          maxHeight:     "80vh",
          zIndex:        9200,
          background:    "rgba(3,5,9,0.97)",
          border:        `1px solid ${CY}33`,
          borderRadius:  8,
          overflow:      "hidden",
          display:       "flex",
          flexDirection: "column",
          fontFamily:    MONO,
          boxShadow:     "0 4px 32px rgba(0,0,0,0.7)",
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
              ◈ CONTACT × INVESTIGATION × REPORT DOSSIER
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={assess}  style={btnStyle(AMBER, 10)}>▶ ASSESS</button>
              <button onClick={fetch_}  style={btnStyle(CY, 10)}>↻</button>
              <button onClick={() => setOpen(false)} style={btnStyle(RED, 10)}>✕</button>
            </div>
          </div>

          {/* Stat tiles */}
          {counts && (
            <div style={{
              display:      "grid",
              gridTemplate: "1fr / repeat(5, 1fr)",
              gap:          6,
              padding:      "8px 14px",
              flexShrink:   0,
            }}>
              {[
                { label: "CONTACTS",        val: counts.contacts,       col: CY },
                { label: "INVESTIGATIONS",  val: counts.investigations, col: CY },
                { label: "REPORTS",         val: counts.reports,        col: CY },
                { label: "FULLY DOC",       val: counts.fullyDoc,       col: GN },
                { label: "DARK",            val: counts.dark,           col: RED, pulse },
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
              placeholder="filter contacts…"
              style={{
                width:      "100%",
                background: "rgba(255,255,255,0.05)",
                border:     `1px solid ${CY}33`,
                borderRadius: 3,
                color:      "#fff",
                fontFamily: MONO,
                fontSize:   10,
                padding:    "3px 8px",
                boxSizing:  "border-box",
                outline:    "none",
              }}
            />
          </div>

          {/* Contact rows */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 14px 12px" }}>
            {loading && <div style={{ color: CY, fontSize: 10, padding: "8px 0" }}>Loading…</div>}
            {error   && <div style={{ color: RED, fontSize: 10, padding: "8px 0" }}>{error}</div>}
            {!loading && !error && filtered.length === 0 && (
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, padding: "8px 0" }}>
                No contacts match current filter.
              </div>
            )}
            {filtered.map((r, i) => {
              const c     = r.contact;
              const label = c.name || c.email || `Contact #${i}`;
              const sub   = c.company || c.title || c.role || "—";
              const isExp = expanded === i;
              const col   = CLS_COLOR[r.cls] || CY;
              return (
                <div key={i} style={{
                  borderBottom:  "1px solid rgba(255,255,255,0.04)",
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
                      minWidth:     96,
                      textAlign:    "center",
                    }}>{r.cls}</span>
                    <span style={{ color: "#fff", fontSize: 10, flex: 1 }} title={label}>
                      {label.length > 30 ? label.slice(0, 27) + "…" : label}
                    </span>
                    <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 9 }}>
                      {sub.length > 22 ? sub.slice(0, 20) + "…" : sub}
                    </span>
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
                      display:      "flex",
                      gap:          12,
                    }}>
                      {/* Investigations pane */}
                      <div style={{ flex: 1 }}>
                        <div style={{ color: CY, fontSize: 9, marginBottom: 4 }}>INVESTIGATIONS</div>
                        {r.invMatches.length === 0 ? (
                          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9 }}>No matches</div>
                        ) : (
                          r.invMatches.slice(0, 4).map((m, mi) => (
                            <div key={mi} style={{ marginBottom: 5 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                                <span style={{ color: CY, fontSize: 9 }}>
                                  {(m.inv.title || m.inv.name || "Case").slice(0, 28)}
                                </span>
                                <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 8 }}>
                                  {m.inv.status || "—"}
                                </span>
                              </div>
                              <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${m.score}%`, background: CY, borderRadius: 2, transition: "width 0.3s" }} />
                              </div>
                              <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 8, marginTop: 1 }}>
                                {m.hits.slice(0, 4).join(", ")} ({m.score}%)
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Divider */}
                      <div style={{ width: 1, background: `${CY}22` }} />

                      {/* Reports pane */}
                      <div style={{ flex: 1 }}>
                        <div style={{ color: VIO, fontSize: 9, marginBottom: 4 }}>REPORTS</div>
                        {r.repMatches.length === 0 ? (
                          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9 }}>No matches</div>
                        ) : (
                          r.repMatches.slice(0, 4).map((m, mi) => (
                            <div key={mi} style={{ marginBottom: 5 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                                <span style={{ color: VIO, fontSize: 9 }}>
                                  {(m.rep.title || m.rep.name || "Report").slice(0, 28)}
                                </span>
                                <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 8 }}>
                                  {m.rep.type || m.rep.category || "—"}
                                </span>
                              </div>
                              <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${m.score}%`, background: VIO, borderRadius: 2, transition: "width 0.3s" }} />
                              </div>
                              <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 8, marginTop: 1 }}>
                                {m.hits.slice(0, 4).join(", ")} ({m.score}%)
                              </div>
                            </div>
                          ))
                        )}
                      </div>
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
