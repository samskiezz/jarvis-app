/**
 * F689 — Acoustic × Report × Investment Triple Nexus (ACRPINV)
 * Three-way cross-reference: /v1/acoustic/contacts × /v1/reports × /entities/Investment.
 * Each acoustic contact is classified:
 *   FULLY_DOCUMENTED — matches ≥1 report AND ≥1 investment (intelligence + financial trail)
 *   REPORT_ONLY      — report match but no investment link (documented, no portfolio tie)
 *   INVESTMENT_ONLY  — investment match but no report (financial link, undocumented)
 *   DARK             — neither report nor investment match (intelligence gap)
 * Coverage % tile = FULLY_DOCUMENTED / total contacts.
 * Tabs: ALL / FULLY_DOCUMENTED / REPORT_ONLY / INVESTMENT_ONLY / DARK + search.
 * Click-to-expand shows matched reports + matched investments per acoustic contact.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence financial intelligence brief + TTS.
 * 90-second auto-refresh. Event: jarvis:acrpinv-toggle.
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 143_220;
const Z_INDEX  = 225;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const ACRPINV_RE = /\b(acrpinv|acoustic\s+report\s+invest|acoustic\s+invest\s+report|acoustic\s+financial\s+report|invest\s+report\s+acoustic|report\s+invest\s+acoustic|acoustic\s+portfolio\s+report|sensor\s+financial\s+intel|acoustic\s+financial\s+nexus|acoustic\s+money\s+report|financial\s+acoustic\s+triple)\b/i;

// ── helpers ───────────────────────────────────────────────────────────────────

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3);
}

function overlap(a, b) {
  const setA = new Set(keywords(a));
  return keywords(b).filter(w => setA.has(w)).length;
}

function normaliseContacts(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.contacts)) return raw.contacts;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.data))     return raw.data;
  return [];
}

function normaliseReports(raw) {
  if (Array.isArray(raw))          return raw;
  if (Array.isArray(raw?.reports)) return raw.reports;
  if (Array.isArray(raw?.items))   return raw.items;
  if (Array.isArray(raw?.data))    return raw.data;
  return [];
}

function normaliseInvestments(raw) {
  if (Array.isArray(raw))               return raw;
  if (Array.isArray(raw?.investments))  return raw.investments;
  if (Array.isArray(raw?.items))        return raw.items;
  if (Array.isArray(raw?.data))         return raw.data;
  return [];
}

function contactText(c) {
  return [c.name, c.callsign, c.id, c.type, c.classification, c.vessel_type, c.description]
    .filter(Boolean).join(" ");
}

function reportText(r) {
  return [r.title, r.summary, r.author, r.tags, r.type, r.subject, r.content]
    .filter(Boolean).join(" ");
}

function investmentText(inv) {
  return [inv.name, inv.ticker, inv.description, inv.sector, inv.type, inv.asset_class, inv.tags]
    .filter(Boolean).join(" ");
}

function crossRef(acousticContacts, reports, investments) {
  return acousticContacts.map(c => {
    const ct = contactText(c);
    const matchedReports = reports
      .filter(r => overlap(ct, reportText(r)) > 0)
      .map(r => ({ ...r, hits: overlap(ct, reportText(r)) }));
    const matchedInvestments = investments
      .filter(inv => overlap(ct, investmentText(inv)) > 0)
      .map(inv => ({ ...inv, hits: overlap(ct, investmentText(inv)) }));
    const hasReport     = matchedReports.length > 0;
    const hasInvestment = matchedInvestments.length > 0;
    const coverage = hasReport && hasInvestment ? "FULLY_DOCUMENTED"
      : hasReport     ? "REPORT_ONLY"
      : hasInvestment ? "INVESTMENT_ONLY"
      : "DARK";
    return { ...c, _reports: matchedReports, _investments: matchedInvestments, _coverage: coverage };
  });
}

// ── JarvisBrain exports ───────────────────────────────────────────────────────

export function isAcrpinvQuery(text) {
  return ACRPINV_RE.test(text || "");
}

export async function buildAcrpinvScript() {
  const base    = apiBase();
  const headers = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  try {
    const [cr, rr, ir] = await Promise.all([
      fetch(`${base}/v1/acoustic/contacts`, { headers }).then(r => r.json()),
      fetch(`${base}/v1/reports`,           { headers }).then(r => r.json()),
      fetch(`${base}/entities/Investment`,  { headers }).then(r => r.json()),
    ]);
    const acousticContacts = normaliseContacts(cr);
    const reports          = normaliseReports(rr);
    const investments      = normaliseInvestments(ir);
    const enriched         = crossRef(acousticContacts, reports, investments);
    const fullyDocumented  = enriched.filter(c => c._coverage === "FULLY_DOCUMENTED");
    const dark             = enriched.filter(c => c._coverage === "DARK");
    const summary = `${acousticContacts.length} acoustic contacts cross-referenced with ${reports.length} reports and ${investments.length} investments. FULLY_DOCUMENTED: ${fullyDocumented.length}, DARK (intelligence gap): ${dark.length}.`;
    const resp = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: `JARVIS acoustic × report × investment triple nexus assessment. ${summary} Provide a 2-sentence financial intelligence brief covering documented versus undocumented contacts with investment exposure.`,
        system: "You are JARVIS. Be direct and tactical. 2 sentences maximum.",
      }),
    });
    const rd    = await resp.json();
    const brief = rd?.response ?? rd?.message ?? rd?.content ?? summary;
    return `ACRPINV ASSESSMENT: ${brief}`;
  } catch (e) {
    return `ACRPINV: data fetch error — ${e.message}`;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "FULLY_DOCUMENTED", "REPORT_ONLY", "INVESTMENT_ONLY", "DARK"];
const TAB_COLOR = {
  ALL: "#29E7FF",
  FULLY_DOCUMENTED: "#00e5a0",
  REPORT_ONLY:      "#29e7ff",
  INVESTMENT_ONLY:  "#ff8800",
  DARK:             "#ff4d6d",
};

export default function AcousticReportInvestmentTriple() {
  const [open, setOpen]         = useState(false);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState(null);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [ttsText, setTtsText]   = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const base    = apiBase();
  const headers = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [cr, rr, ir] = await Promise.all([
        fetch(`${base}/v1/acoustic/contacts`, { headers }).then(r => r.json()),
        fetch(`${base}/v1/reports`,           { headers }).then(r => r.json()),
        fetch(`${base}/entities/Investment`,  { headers }).then(r => r.json()),
      ]);
      const reports     = normaliseReports(rr);
      const investments = normaliseInvestments(ir);
      setContacts(crossRef(normaliseContacts(cr), reports, investments));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:acrpinv-toggle", onToggle);
    const onAsk = (e) => { if (isAcrpinvQuery(e.detail?.query)) setOpen(true); };
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:acrpinv-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    const script = await buildAcrpinvScript();
    setTtsText(script);
    try {
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST", headers,
        body: JSON.stringify({ text: script, voice: "onyx" }),
      });
    } catch (_) {}
    setAssessing(false);
  }, [base]);

  const filtered = contacts.filter(c => {
    if (tab !== "ALL" && c._coverage !== tab) return false;
    if (search.trim()) {
      const s = search.toLowerCase();
      return contactText(c).toLowerCase().includes(s);
    }
    return true;
  });

  const counts = {
    FULLY_DOCUMENTED: contacts.filter(c => c._coverage === "FULLY_DOCUMENTED").length,
    REPORT_ONLY:      contacts.filter(c => c._coverage === "REPORT_ONLY").length,
    INVESTMENT_ONLY:  contacts.filter(c => c._coverage === "INVESTMENT_ONLY").length,
    DARK:             contacts.filter(c => c._coverage === "DARK").length,
  };
  const coverage = contacts.length
    ? Math.round((counts.FULLY_DOCUMENTED / contacts.length) * 100)
    : 0;

  const CY   = "#29E7FF";
  const MONO = "'JetBrains Mono',monospace";

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Acoustic × Report × Investment Triple (ACRPINV)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: open ? "rgba(0,229,160,0.18)" : "rgba(0,4,10,0.82)",
          border: `1px solid ${open ? "#00e5a0" : CY + "55"}`,
          borderRadius: 6, color: open ? "#00e5a0" : CY,
          fontFamily: MONO, fontSize: 9, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
        }}
      >
        ◈ ACRPINV {counts.DARK > 0 && <span style={{ color: "#ff4d6d" }}>●</span>}
      </button>

      {open && (
        <div style={{
          position: "fixed", top: 40, right: 8, width: 480, maxHeight: "86vh",
          zIndex: Z_INDEX + 1,
          background: "rgba(4,10,20,0.97)",
          border: `1px solid ${CY}33`,
          borderRadius: 12, overflow: "hidden",
          boxShadow: "0 0 60px rgba(0,229,160,0.12)",
          fontFamily: MONO, display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
            background: "rgba(0,229,160,0.06)",
          }}>
            <span style={{ color: "#00e5a0", fontSize: 11, letterSpacing: 2 }}>
              ACOUSTIC × REPORT × INVESTMENT
            </span>
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "#4E6070", cursor: "pointer", fontSize: 14 }}>
              ✕
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 4, padding: "8px 10px" }}>
            {[
              ["CONTACTS",         contacts.length,          CY],
              ["FULLY DOCUMENTED", counts.FULLY_DOCUMENTED,  "#00e5a0"],
              ["REPORT ONLY",      counts.REPORT_ONLY,       "#29e7ff"],
              ["INVEST ONLY",      counts.INVESTMENT_ONLY,   "#ff8800"],
              ["COVERAGE",         coverage + "%",           coverage > 60 ? "#00e5a0" : "#ff4d6d"],
            ].map(([label, val, color]) => (
              <div key={label} style={{
                background: "rgba(0,0,0,0.4)", borderRadius: 6,
                padding: "6px 4px", textAlign: "center",
                border: `1px solid ${color}22`,
              }}>
                <div style={{ color, fontSize: 14, fontWeight: 700 }}>{val}</div>
                <div style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, padding: "0 10px 6px", flexWrap: "wrap" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${TAB_COLOR[t]}18` : "transparent",
                  border: `1px solid ${tab === t ? TAB_COLOR[t] : CY + "22"}`,
                  borderRadius: 4, color: tab === t ? TAB_COLOR[t] : "#4E6070",
                  fontFamily: MONO, fontSize: 8, letterSpacing: 1, padding: "3px 8px", cursor: "pointer",
                }}>
                {t.replace(/_/g, " ")}
                {t !== "ALL" && (
                  <span style={{ marginLeft: 4, opacity: 0.7 }}>
                    {counts[t] ?? contacts.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "0 10px 6px" }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search contacts…"
              style={{
                width: "100%", background: "rgba(41,231,255,0.05)",
                border: `1px solid ${CY}22`, borderRadius: 5,
                color: "#DCEBF5", fontFamily: MONO, fontSize: 10,
                padding: "5px 10px", outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          {/* Results */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 10px 10px" }}>
            {loading && (
              <div style={{ color: "#4E6070", fontSize: 10, textAlign: "center", padding: 20 }}>
                Loading…
              </div>
            )}
            {err && (
              <div style={{ color: "#ff4d6d", fontSize: 10, padding: 12 }}>Error: {err}</div>
            )}
            {!loading && !err && filtered.length === 0 && (
              <div style={{ color: "#4E6070", fontSize: 10, textAlign: "center", padding: 20 }}>
                No contacts match
              </div>
            )}
            {filtered.map((c, i) => {
              const isExp    = expanded === i;
              const covColor = TAB_COLOR[c._coverage] ?? CY;
              return (
                <div key={c.id ?? i}
                  onClick={() => setExpanded(isExp ? null : i)}
                  style={{
                    borderRadius: 6, margin: "3px 0", padding: "8px 10px",
                    background: isExp ? "rgba(0,229,160,0.07)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${isExp ? covColor + "55" : CY + "15"}`,
                    cursor: "pointer",
                  }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      fontSize: 8, letterSpacing: 1, padding: "1px 5px",
                      borderRadius: 3, background: covColor + "22", color: covColor,
                      flexShrink: 0,
                    }}>
                      {c._coverage.replace(/_/g, " ")}
                    </span>
                    <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.name ?? c.callsign ?? c.id ?? "Unknown"}
                    </span>
                    {c._reports.length > 0 && (
                      <span style={{ color: "#29e7ff", fontSize: 8 }}>📄{c._reports.length}</span>
                    )}
                    {c._investments.length > 0 && (
                      <span style={{ color: "#ff8800", fontSize: 8 }}>💹{c._investments.length}</span>
                    )}
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${CY}15` }}>
                      {/* Matched reports */}
                      {c._reports.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: "#29e7ff", fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>
                            MATCHED REPORTS ({c._reports.length})
                          </div>
                          {c._reports.slice(0, 5).map((r, ri) => (
                            <div key={ri} style={{ display: "flex", gap: 6, padding: "2px 0", alignItems: "center" }}>
                              <span style={{
                                color: "#2E4050", fontSize: 8, padding: "0 3px",
                                borderRadius: 2, background: "rgba(41,231,255,0.08)",
                              }}>
                                {(r.type ?? "RPT").toUpperCase().slice(0, 8)}
                              </span>
                              <span style={{ color: "#7A95AB", fontSize: 9, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                                {r.title ?? r.subject ?? r.id ?? "report"}
                              </span>
                              <span style={{ color: "#29e7ff", fontSize: 8 }}>{r.hits}↑</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Matched investments */}
                      {c._investments.length > 0 && (
                        <div>
                          <div style={{ color: "#ff8800", fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>
                            MATCHED INVESTMENTS ({c._investments.length})
                          </div>
                          {c._investments.slice(0, 4).map((inv, ii) => (
                            <div key={ii} style={{ display: "flex", gap: 6, padding: "2px 0", alignItems: "center" }}>
                              <span style={{ color: "#ff8800", fontSize: 8 }}>
                                {(inv.ticker ?? inv.type ?? inv.asset_class ?? "INV").toUpperCase().slice(0, 8)}
                              </span>
                              <span style={{ color: "#7A95AB", fontSize: 9, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                                {inv.name ?? inv.description ?? inv.id ?? "investment"}
                              </span>
                              <span style={{ color: "#ff8800", fontSize: 8 }}>{inv.hits}↑</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {c._reports.length === 0 && c._investments.length === 0 && (
                        <div style={{ color: "#ff4d6d", fontSize: 9 }}>No report or investment matches — intelligence gap.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          {ttsText && (
            <div style={{ padding: "6px 12px", borderTop: `1px solid ${CY}15`, color: "#4E6070", fontSize: 8, lineHeight: 1.5 }}>
              {ttsText}
            </div>
          )}
          <div style={{
            padding: "8px 12px", borderTop: `1px solid ${CY}15`,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ color: "#2E4050", fontSize: 8 }}>90 s auto-refresh · {contacts.length} contacts</span>
            <button onClick={assess} disabled={assessing}
              style={{
                background: assessing ? "rgba(0,229,160,0.05)" : "rgba(0,229,160,0.12)",
                border: "1px solid #00e5a055", borderRadius: 5,
                color: "#00e5a0", fontFamily: MONO, fontSize: 9,
                padding: "4px 12px", cursor: assessing ? "default" : "pointer",
              }}>
              {assessing ? "ASSESSING…" : "▶ ASSESS"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
