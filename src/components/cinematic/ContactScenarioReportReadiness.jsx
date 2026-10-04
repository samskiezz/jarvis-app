/**
 * F136 — Contact × Scenario × Report × Knowledge
 *         Personnel Readiness Index (CSRPRI)
 *
 * Parallel-fetches:
 *   /entities/Contact      → people / organisations
 *   /v1/scenario/list      → operational playbooks
 *   /v1/reports            → intelligence reports
 *   /knowledge/            → knowledge base articles
 *
 * Keyword-correlates each contact (name/role/org/tags) against
 * scenario playbooks AND intelligence reports AND KB articles to classify:
 *   FULLY_EQUIPPED  — matched a scenario + report + KB article
 *   DUAL_COVERED    — matched any two sources
 *   SINGLE_TRACKED  — matched exactly one source
 *   UNCOVERED       — no match in any dimension
 *
 * Amber badge on uncovered count.
 * ▶ ASSESS READINESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh.  jarvis:csrpri-toggle event.
 * Voice: "csrpri / contact readiness / personnel readiness index /
 *         contact equipped / uncovered contacts / personnel readiness".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_019_080;
const Z_INDEX  = 198;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const CSRPRI_RE =
  /\b(csrpri|contact[\s-]readiness|personnel[\s-]readiness[\s-]index|contact[\s-]equipped|uncovered[\s-]contacts|personnel[\s-]readiness)\b/i;

// ── colours ───────────────────────────────────────────────────────────────────
const CY     = "#00CFFF";
const AM     = "#F59E0B";
const GR     = "#22C55E";
const OR     = "#F97316";
const PU     = "#A855F7";
const TE     = "#14B8A6";
const DIM    = "#6E8AA0";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOUR = {
  FULLY_EQUIPPED: GR,
  DUAL_COVERED:   CY,
  SINGLE_TRACKED: AM,
  UNCOVERED:      OR,
};

// ── exports for JarvisBrain ───────────────────────────────────────────────────
export function isCsrpriQuery(text) {
  return CSRPRI_RE.test(text || "");
}

export async function buildCsrpriScript() {
  const base    = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [contacts, scenarios, reports, kb] = await Promise.all([
    fetch(`${base}/entities/Contact`,    { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/v1/scenario/list`,    { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/v1/reports`,          { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/knowledge/`,          { headers }).then(r => r.json()).catch(() => []),
  ]);

  const ctrs = Array.isArray(contacts) ? contacts : [];
  const scns = Array.isArray(scenarios) ? scenarios : (scenarios?.scenarios || scenarios?.items || []);
  const rpts = Array.isArray(reports)   ? reports   : (reports?.reports || reports?.items || []);
  const kbs  = Array.isArray(kb)        ? kb        : (kb?.articles || kb?.items || []);

  let fullyEquipped = 0;
  let dualCovered   = 0;
  let singleTracked = 0;
  let uncovered     = 0;

  ctrs.forEach(c => {
    const kws = extractKeywords(c, ["name","role","org","email","tags"]);
    const hS  = matchList(kws, scns, ["name","description","tags"]);
    const hR  = matchList(kws, rpts, ["title","description","tags","type"]);
    const hK  = matchList(kws, kbs,  ["title","content","tags","category"]);
    const cnt = (hS ? 1 : 0) + (hR ? 1 : 0) + (hK ? 1 : 0);
    if (cnt === 3)      fullyEquipped++;
    else if (cnt === 2) dualCovered++;
    else if (cnt === 1) singleTracked++;
    else                uncovered++;
  });

  const total    = ctrs.length;
  const covPct   = total ? Math.round(((fullyEquipped + dualCovered + singleTracked) / total) * 100) : 0;
  return `Sir, CSRPRI scanned ${total} personnel against ${scns.length} scenarios, ${rpts.length} reports, and ${kbs.length} KB articles. ${fullyEquipped} contacts are FULLY_EQUIPPED (all three sources), ${dualCovered} are DUAL_COVERED, ${singleTracked} are SINGLE_TRACKED, and ${uncovered} are UNCOVERED — an overall personnel readiness coverage of ${covPct}%. Priority action: brief the ${uncovered} uncovered contacts using available scenarios and intelligence to close the readiness gap.`;
}

// ── helpers ───────────────────────────────────────────────────────────────────
function extractKeywords(item, fields) {
  const txt = fields.map(f => {
    const v = item[f];
    return Array.isArray(v) ? v.join(" ") : (v || "");
  }).join(" ");
  return txt.toLowerCase().split(/[\s,./\-_@]+/).filter(w => w.length > 2);
}

function matchList(keywords, list, fields) {
  return list.some(item => {
    const haystack = fields.map(f => {
      const v = item[f];
      return Array.isArray(v) ? v.join(" ") : (v || "");
    }).join(" ").toLowerCase();
    return keywords.some(kw => haystack.includes(kw));
  });
}

function matchedItems(keywords, list, fields) {
  return list.filter(item => {
    const haystack = fields.map(f => {
      const v = item[f];
      return Array.isArray(v) ? v.join(" ") : (v || "");
    }).join(" ").toLowerCase();
    return keywords.some(kw => haystack.includes(kw));
  });
}

function relevancePct(keywords, item, fields) {
  const haystack = fields.map(f => {
    const v = item[f];
    return Array.isArray(v) ? v.join(" ") : (v || "");
  }).join(" ").toLowerCase();
  const hits = keywords.filter(kw => haystack.includes(kw)).length;
  return Math.min(100, Math.round((hits / Math.max(keywords.length, 1)) * 100) + 10);
}

// ── component ────────────────────────────────────────────────────────────────
export default function ContactScenarioReportReadiness() {
  const [open,      setOpen]      = useState(false);
  const [contacts,  setContacts]  = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [reports,   setReports]   = useState([]);
  const [kb,        setKb]        = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [brief,     setBrief]     = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const base    = apiBase();
    const headers = { Authorization: `Bearer ${API_KEY}` };
    try {
      const [ctrs, scns, rpts, kbs] = await Promise.all([
        fetch(`${base}/entities/Contact`,    { headers }).then(r => r.json()).catch(() => []),
        fetch(`${base}/v1/scenario/list`,    { headers }).then(r => r.json()).catch(() => []),
        fetch(`${base}/v1/reports`,          { headers }).then(r => r.json()).catch(() => []),
        fetch(`${base}/knowledge/`,          { headers }).then(r => r.json()).catch(() => []),
      ]);
      setContacts(Array.isArray(ctrs) ? ctrs : []);
      setScenarios(Array.isArray(scns) ? scns : (scns?.scenarios || scns?.items || []));
      setReports(Array.isArray(rpts) ? rpts : (rpts?.reports || rpts?.items || []));
      setKb(Array.isArray(kbs) ? kbs : (kbs?.articles || kbs?.items || []));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const h = () => setOpen(o => !o);
    window.addEventListener("jarvis:csrpri-toggle", h);
    return () => window.removeEventListener("jarvis:csrpri-toggle", h);
  }, []);

  // ── classify each contact ─────────────────────────────────────────────────
  const rows = contacts.map(c => {
    const kws = extractKeywords(c, ["name","role","org","email","tags"]);
    const mS  = matchedItems(kws, scenarios, ["name","description","tags"]);
    const mR  = matchedItems(kws, reports,   ["title","description","tags","type"]);
    const mK  = matchedItems(kws, kb,        ["title","content","tags","category"]);
    const cnt = (mS.length ? 1 : 0) + (mR.length ? 1 : 0) + (mK.length ? 1 : 0);
    let cls;
    if (cnt === 3)      cls = "FULLY_EQUIPPED";
    else if (cnt === 2) cls = "DUAL_COVERED";
    else if (cnt === 1) cls = "SINGLE_TRACKED";
    else                cls = "UNCOVERED";
    return { ...c, kws, mS, mR, mK, cls };
  });

  const counts = {
    FULLY_EQUIPPED: rows.filter(r => r.cls === "FULLY_EQUIPPED").length,
    DUAL_COVERED:   rows.filter(r => r.cls === "DUAL_COVERED").length,
    SINGLE_TRACKED: rows.filter(r => r.cls === "SINGLE_TRACKED").length,
    UNCOVERED:      rows.filter(r => r.cls === "UNCOVERED").length,
  };

  const covPct = contacts.length
    ? Math.round(((counts.FULLY_EQUIPPED + counts.DUAL_COVERED + counts.SINGLE_TRACKED) / contacts.length) * 100)
    : 0;

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.name || "").toLowerCase().includes(q) ||
             (r.role || "").toLowerCase().includes(q) ||
             r.cls.toLowerCase().includes(q);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setBrief("");
    try {
      const script = await buildCsrpriScript();
      setBrief(script);
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: script }),
      });
    } catch {
      setBrief("Assessment unavailable at this time.");
    } finally {
      setAssessing(false);
    }
  };

  // ── button (always rendered) ──────────────────────────────────────────────
  const btn = (
    <button
      onClick={() => setOpen(o => !o)}
      style={{
        position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
        background: counts.UNCOVERED > 0 ? `${AM}22` : `${CY}11`,
        border: `1px solid ${counts.UNCOVERED > 0 ? AM : CY}55`,
        borderRadius: 4, padding: "3px 8px",
        color: counts.UNCOVERED > 0 ? AM : CY,
        fontSize: 9, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap",
      }}
    >
      ◈ CSRPRI
      {counts.UNCOVERED > 0 && (
        <span style={{
          marginLeft: 4, background: AM, color: "#000",
          borderRadius: 8, padding: "1px 5px", fontSize: 8,
          animation: "pulse 1.5s infinite",
        }}>
          {counts.UNCOVERED}
        </span>
      )}
    </button>
  );

  if (!open) return btn;

  return (
    <>
      {btn}
      <div style={{
        position: "fixed", bottom: 32, left: BTN_LEFT - 640, zIndex: Z_INDEX + 1,
        width: 660, maxHeight: 560, background: BG,
        border: `1px solid ${BORDER}`, borderRadius: 8,
        fontFamily: FONT, display: "flex", flexDirection: "column",
        boxShadow: "0 0 24px rgba(0,207,255,0.10)",
      }}>
        {/* header */}
        <div style={{
          padding: "8px 14px", borderBottom: `1px solid ${BORDER}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ color: CY, fontSize: 11, letterSpacing: 1 }}>
            ◈ CONTACT PERSONNEL READINESS INDEX
          </span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {loading && <span style={{ color: DIM, fontSize: 9 }}>⟳</span>}
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 13 }}>✕</button>
          </div>
        </div>

        {/* stat tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4, padding: "6px 14px" }}>
          {[
            ["CONTACTS",        contacts.length,        CY],
            ["FULLY EQUIPPED",  counts.FULLY_EQUIPPED,  GR],
            ["DUAL COVERED",    counts.DUAL_COVERED,    CY],
            ["UNCOVERED",       counts.UNCOVERED,       OR],
          ].map(([lbl, val, col]) => (
            <div key={lbl} style={{
              background: `${col}11`, border: `1px solid ${col}33`,
              borderRadius: 4, padding: "5px 8px", textAlign: "center",
            }}>
              <div style={{ color: col, fontSize: 14, fontWeight: 700 }}>{val}</div>
              <div style={{ color: DIM, fontSize: 8, marginTop: 1 }}>{lbl}</div>
            </div>
          ))}
        </div>

        {/* secondary stat row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4, padding: "0 14px 4px" }}>
          {[
            ["SCENARIOS",      scenarios.length, TE],
            ["REPORTS",        reports.length,   PU],
            ["KB ARTICLES",    kb.length,        GR],
            ["SINGLE TRACKED", counts.SINGLE_TRACKED, AM],
          ].map(([lbl, val, col]) => (
            <div key={lbl} style={{
              background: `${col}09`, border: `1px solid ${col}22`,
              borderRadius: 4, padding: "4px 8px", textAlign: "center",
            }}>
              <div style={{ color: col, fontSize: 12, fontWeight: 700 }}>{val}</div>
              <div style={{ color: DIM, fontSize: 8, marginTop: 1 }}>{lbl}</div>
            </div>
          ))}
        </div>

        {/* coverage bar */}
        <div style={{ padding: "0 14px 4px" }}>
          <div style={{ fontSize: 9, color: DIM, marginBottom: 2 }}>
            READINESS COVERAGE &nbsp;
            <span style={{ color: covPct >= 70 ? GR : covPct >= 40 ? AM : OR }}>{covPct}%</span>
          </div>
          <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.08)" }}>
            <div style={{
              height: "100%", borderRadius: 2,
              width: `${covPct}%`,
              background: `linear-gradient(90deg, ${GR}, ${CY})`,
            }} />
          </div>
        </div>

        {/* filter tabs + search */}
        <div style={{ padding: "4px 14px", display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          {["ALL","FULLY_EQUIPPED","DUAL_COVERED","SINGLE_TRACKED","UNCOVERED"].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              background: filter === f ? `${CY}22` : "none",
              border: `1px solid ${filter === f ? CY : DIM}55`,
              borderRadius: 3, padding: "2px 8px",
              color: filter === f ? CY : DIM, fontSize: 9, cursor: "pointer", fontFamily: FONT,
            }}>{f.replace(/_/g," ")}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search…"
            style={{
              marginLeft: "auto", background: "rgba(0,207,255,0.05)",
              border: `1px solid ${BORDER}`, borderRadius: 3,
              color: CY, fontSize: 9, padding: "2px 8px", fontFamily: FONT, width: 110,
            }}
          />
        </div>

        {/* rows */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 14px" }}>
          {visible.length === 0 && (
            <div style={{ color: DIM, fontSize: 10, padding: 8 }}>No contacts match.</div>
          )}
          {visible.map((c, idx) => {
            const col   = CLASS_COLOUR[c.cls] || DIM;
            const isExp = expanded === idx;
            return (
              <div key={c.id || idx} style={{
                marginBottom: 4, borderRadius: 4,
                border: `1px solid ${col}33`,
                background: `${col}08`,
              }}>
                <div
                  onClick={() => setExpanded(isExp ? null : idx)}
                  style={{ padding: "5px 8px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                >
                  <span style={{ flex: 1, fontSize: 10, color: "#cce8ff" }}>{c.name || c.id || "Unknown"}</span>
                  {c.role && (
                    <span style={{ fontSize: 8, color: OR, border: `1px solid ${OR}44`, borderRadius: 2, padding: "0 4px" }}>{c.role}</span>
                  )}
                  <span style={{ fontSize: 9, color: col, border: `1px solid ${col}44`, borderRadius: 2, padding: "0 5px" }}>{c.cls.replace(/_/g," ")}</span>
                  <span style={{ color: DIM, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                </div>

                {isExp && (
                  <div style={{ padding: "6px 12px 8px", borderTop: `1px solid ${col}22` }}>
                    {/* matched scenarios */}
                    {c.mS.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 9, color: TE, marginBottom: 3, letterSpacing: 1 }}>SCENARIOS ({c.mS.length})</div>
                        {c.mS.map((s, i) => {
                          const pct = relevancePct(c.kws, s, ["name","description","tags"]);
                          return (
                            <div key={i} style={{ marginBottom: 4 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 10, color: "#cce8ff" }}>{s.name || s.id}</span>
                              </div>
                              <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.08)", marginTop: 2 }}>
                                <div style={{ height: "100%", width: `${pct}%`, background: TE }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* matched reports */}
                    {c.mR.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 9, color: PU, marginBottom: 3, letterSpacing: 1 }}>REPORTS ({c.mR.length})</div>
                        {c.mR.map((r, i) => {
                          const pct = relevancePct(c.kws, r, ["title","description","tags","type"]);
                          return (
                            <div key={i} style={{ marginBottom: 4 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 10, color: "#cce8ff" }}>{r.title || r.id}</span>
                                {r.type && <span style={{ fontSize: 8, color: PU, border: `1px solid ${PU}55`, borderRadius: 2, padding: "0 4px" }}>{r.type}</span>}
                              </div>
                              <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.08)", marginTop: 2 }}>
                                <div style={{ height: "100%", width: `${pct}%`, background: PU }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* matched KB */}
                    {c.mK.length > 0 && (
                      <div>
                        <div style={{ fontSize: 9, color: GR, marginBottom: 3, letterSpacing: 1 }}>KB ARTICLES ({c.mK.length})</div>
                        {c.mK.map((a, i) => {
                          const pct = relevancePct(c.kws, a, ["title","content","tags","category"]);
                          return (
                            <div key={i} style={{ marginBottom: 4 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 10, color: "#cce8ff" }}>{a.title || a.id}</span>
                              </div>
                              <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.08)", marginTop: 2 }}>
                                <div style={{ height: "100%", width: `${pct}%`, background: GR }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {c.mS.length === 0 && c.mR.length === 0 && c.mK.length === 0 && (
                      <div style={{ color: OR, fontSize: 10 }}>No scenario, report, or KB coverage found for this contact.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* assess button */}
        <div style={{ padding: "6px 14px 10px", borderTop: "1px solid rgba(234,179,8,0.18)" }}>
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              background: assessing ? "rgba(0,0,0,0.4)" : `${AM}22`,
              border: `1px solid ${AM}55`, borderRadius: 4, padding: "5px 14px",
              color: AM, fontSize: 10, cursor: assessing ? "not-allowed" : "pointer",
              fontFamily: FONT,
            }}
          >
            {assessing ? "⟳ ASSESSING…" : "▶ ASSESS READINESS"}
          </button>
          {brief && (
            <div style={{ marginTop: 6, fontSize: 10, color: "#cce8ff", lineHeight: 1.5, opacity: 0.9 }}>
              {brief}
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </>
  );
}
