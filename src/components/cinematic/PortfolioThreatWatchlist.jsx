/**
 * PortfolioThreatWatchlist — F112 (PTWLIST).
 *
 * Cross-references active high/critical risk signals against investments
 * (financial exposure) and contacts (personnel exposure) to build a
 * prioritized threat watchlist.
 *
 * Data sources:
 *   /entities/RiskSignal   → threat signals (all; focus on critical/high)
 *   /entities/Investment   → portfolio holdings
 *   /entities/Contact      → people / org contacts
 *
 * Classification per risk signal:
 *   FULLY_EXPOSED  — ≥1 investment match AND ≥1 contact match
 *   INVEST_ONLY    — investment match, no contact
 *   CONTACT_ONLY   — contact match, no investment
 *   UNCOVERED      — no financial or personnel link (blind spot)
 *
 * Visual:
 *   • Stat tiles: RISKS / INVESTMENTS / CONTACTS / FULLY EXPOSED / UNCOVERED
 *   • Filter tabs: ALL / FULLY_EXPOSED / INVEST_ONLY / CONTACT_ONLY / UNCOVERED
 *   • Expandable rows → amber investment bars + cyan contact bars
 *   • Red pulse on UNCOVERED count (critical/high with no exposure link)
 *   • ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 *
 * Toggle: ◈ PTWLIST  left:988000  bottom:8  zIndex:135
 * Event:  jarvis:ptwlist-toggle
 * Wired:  App.jsx + JarvisBrain.jsx (isPtwlistQuery / buildPtwlistScript)
 *
 * Voice: "ptwlist" / "portfolio threat" / "risk watchlist" / "threat watchlist" /
 *        "investment risk" / "exposed contacts" / "portfolio exposure" /
 *        "financial threat" / "contact risk"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const RED   = "#FF3D5A";
const MONO  = "'JetBrains Mono','Courier New',monospace";

const BTN_LEFT   = 988000;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function authHdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function normalise(raw) {
  if (Array.isArray(raw))               return raw;
  if (raw && Array.isArray(raw.items))  return raw.items;
  if (raw && Array.isArray(raw.data))   return raw.data;
  if (raw && Array.isArray(raw.results))return raw.results;
  if (raw && typeof raw === "object")   return Object.values(raw);
  return [];
}

function tokens(text) {
  if (!text) return [];
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(t => t.length > 2);
}

function overlap(tokA, tokB) {
  const setB = new Set(tokB);
  return tokA.filter(t => setB.has(t));
}

function pct(hits, total) {
  if (!total) return 0;
  return Math.round((hits / total) * 100);
}

function sevColor(sev) {
  return sev === "critical" ? RED : sev === "high" ? AMBER : CY;
}

async function loadData() {
  const base = apiBase();
  const hdr  = authHdr();

  const [risksRaw, investRaw, contactRaw] = await Promise.all([
    fetch(`${base}/entities/RiskSignal`,  { headers: hdr }).then(r => r.json()).catch(() => []),
    fetch(`${base}/entities/Investment`,  { headers: hdr }).then(r => r.json()).catch(() => []),
    fetch(`${base}/entities/Contact`,     { headers: hdr }).then(r => r.json()).catch(() => []),
  ]);

  const risks    = normalise(risksRaw);
  const invests  = normalise(investRaw);
  const contacts = normalise(contactRaw);

  const investToks = invests.map(inv => ({
    id:    inv.id || inv.symbol || String(Math.random()),
    label: inv.name || inv.symbol || inv.ticker || "Investment",
    toks:  tokens([inv.name, inv.symbol, inv.ticker, inv.sector, inv.type, inv.description].join(" ")),
  }));

  const contactToks = contacts.map(c => ({
    id:    c.id || String(Math.random()),
    label: c.name || c.display_name || c.email || "Contact",
    toks:  tokens([c.name, c.display_name, c.role, c.organisation, c.org, c.domain, c.tags].join(" ")),
  }));

  const rows = risks.map(r => {
    const sev = (r.severity || "").toLowerCase();
    const rToks = tokens([r.name, r.title, r.description, r.category, r.source, r.domain, r.tags].join(" "));

    const matchedInvests = investToks.map(inv => {
      const hits = overlap(rToks, inv.toks);
      return hits.length ? { ...inv, hits: hits.length, score: pct(hits.length, inv.toks.length || 1) } : null;
    }).filter(Boolean).sort((a, b) => b.hits - a.hits).slice(0, 6);

    const matchedContacts = contactToks.map(c => {
      const hits = overlap(rToks, c.toks);
      return hits.length ? { ...c, hits: hits.length, score: pct(hits.length, c.toks.length || 1) } : null;
    }).filter(Boolean).sort((a, b) => b.hits - a.hits).slice(0, 6);

    const hasInv  = matchedInvests.length > 0;
    const hasCnt  = matchedContacts.length > 0;
    const cls = hasInv && hasCnt ? "FULLY_EXPOSED"
              : hasInv            ? "INVEST_ONLY"
              : hasCnt            ? "CONTACT_ONLY"
              :                     "UNCOVERED";

    return {
      id:             r.id || r.name || String(Math.random()),
      label:          r.name || r.title || "Risk Signal",
      sev,
      cls,
      matchedInvests,
      matchedContacts,
    };
  });

  // Sort: critical first, then high, then by cls severity
  const clsOrder = { FULLY_EXPOSED: 0, INVEST_ONLY: 1, CONTACT_ONLY: 1, UNCOVERED: 2 };
  const sevOrder  = { critical: 0, high: 1, medium: 2, low: 3 };
  rows.sort((a, b) => {
    const sd = (sevOrder[a.sev] ?? 4) - (sevOrder[b.sev] ?? 4);
    if (sd !== 0) return sd;
    return (clsOrder[a.cls] ?? 3) - (clsOrder[b.cls] ?? 3);
  });

  const counts = {
    risks:         rows.length,
    investments:   invests.length,
    contacts:      contacts.length,
    fullyExposed:  rows.filter(r => r.cls === "FULLY_EXPOSED").length,
    investOnly:    rows.filter(r => r.cls === "INVEST_ONLY").length,
    contactOnly:   rows.filter(r => r.cls === "CONTACT_ONLY").length,
    uncovered:     rows.filter(r => r.cls === "UNCOVERED").length,
  };

  return { rows, counts };
}

// ── exported helpers for JarvisBrain ─────────────────────────────────────────

export function isPtwlistQuery(q) {
  const s = q.toLowerCase();
  return s.includes("ptwlist") || s.includes("portfolio threat") ||
    s.includes("risk watchlist") || s.includes("threat watchlist") ||
    s.includes("investment risk") || s.includes("exposed contacts") ||
    s.includes("portfolio exposure") || s.includes("financial threat") ||
    s.includes("contact risk");
}

export async function buildPtwlistScript() {
  try {
    const { counts } = await loadData();
    const uncovMsg = counts.uncovered > 0
      ? `${counts.uncovered} risk signal(s) have NO linked investment or contact exposure — these are portfolio and personnel blind spots requiring immediate review.`
      : "All active risk signals have at least one investment or contact link.";
    return (
      `Portfolio threat watchlist: ${counts.risks} active risk signals cross-referenced ` +
      `against ${counts.investments} investments and ${counts.contacts} contacts. ` +
      `Fully exposed (both investment and contact link): ${counts.fullyExposed}. ` +
      `Investment-only exposure: ${counts.investOnly}. ` +
      `Contact-only exposure: ${counts.contactOnly}. ` +
      `${uncovMsg}`
    );
  } catch {
    return "Portfolio threat watchlist data unavailable.";
  }
}

// ── colour helpers ────────────────────────────────────────────────────────────

function clsColor(cls) {
  return cls === "FULLY_EXPOSED"  ? RED
       : cls === "INVEST_ONLY"    ? AMBER
       : cls === "CONTACT_ONLY"   ? CY
       :                            "rgba(255,255,255,0.25)";
}

const TABS = ["ALL", "FULLY_EXPOSED", "INVEST_ONLY", "CONTACT_ONLY", "UNCOVERED"];

// ── component ─────────────────────────────────────────────────────────────────

export default function PortfolioThreatWatchlist() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [counts, setCounts]     = useState({ risks:0, investments:0, contacts:0, fullyExposed:0, investOnly:0, contactOnly:0, uncovered:0 });
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [filter, setFilter]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssess]  = useState(false);
  const [assessment, setAsmTxt] = useState("");
  const timer = useRef(null);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener("jarvis:ptwlist-toggle", handler);
    return () => window.removeEventListener("jarvis:ptwlist-toggle", handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadData();
      setRows(result.rows);
      setCounts(result.counts);
    } catch (e) {
      setError(e.message || "Load error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssess(true);
    setAsmTxt("");
    try {
      const script = await buildPtwlistScript();
      setAsmTxt(script);
      const base = apiBase();
      const chatRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHdr() },
        body: JSON.stringify({ message: script }),
      });
      if (chatRes.ok) {
        const d = await chatRes.json();
        const reply = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
        if (reply) {
          await fetch(`${base}/v1/voice/tts`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHdr() },
            body: JSON.stringify({ text: reply, voice: "onyx" }),
          });
          setAsmTxt(reply);
        }
      }
    } catch {
      setAsmTxt("Assessment failed.");
    } finally {
      setAssess(false);
    }
  }, []);

  const filtered = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.label.toLowerCase().includes(s) || r.sev.includes(s) || r.cls.toLowerCase().includes(s);
    }
    return true;
  });

  const uncovered = counts.uncovered;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 135,
          background: "rgba(0,0,0,0.75)", border: `1px solid ${uncovered > 0 ? RED : AMBER}`,
          color: uncovered > 0 ? RED : AMBER, fontFamily: MONO,
          fontSize: 10, padding: "3px 7px", cursor: "pointer", borderRadius: 4,
          animation: uncovered > 0 ? "jarvis-pulse 1.4s infinite" : "none",
        }}
      >
        ◈ PTWLIST{uncovered > 0 ? ` ×${uncovered}` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, right: 16, width: 680,
      maxHeight: "85vh", overflowY: "auto", zIndex: 5000,
      background: "rgba(0,4,12,0.97)", border: `1px solid ${AMBER}`,
      borderRadius: 10, fontFamily: MONO, color: CY,
      boxShadow: `0 0 40px rgba(245,166,35,0.25)`,
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", borderBottom: `1px solid rgba(245,166,35,0.3)` }}>
        <span style={{ fontSize: 12, color: AMBER, fontWeight: 700, letterSpacing: 2 }}>
          ◈ PORTFOLIO THREAT WATCHLIST  <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>risk × investments × contacts</span>
        </span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none",
          color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", flexWrap: "wrap" }}>
        {[
          ["RISKS",         counts.risks,       "#c87fff"],
          ["INVESTMENTS",   counts.investments,  AMBER],
          ["CONTACTS",      counts.contacts,     CY],
          ["FULLY EXPOSED", counts.fullyExposed, RED],
          ["UNCOVERED",     uncovered,           "rgba(255,255,255,0.35)"],
        ].map(([label, val, col]) => (
          <div key={label} style={{ flex: "1 1 100px", background: "rgba(0,0,0,0.5)",
            border: `1px solid ${col}33`, borderRadius: 6, padding: "6px 10px",
            animation: label === "UNCOVERED" && uncovered > 0 ? "jarvis-pulse 1.4s infinite" : "none" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: col }}>{val}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ padding: "0 14px 8px", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setFilter(t)}
            style={{ background: filter === t ? "rgba(41,231,255,0.15)" : "none",
              border: `1px solid ${filter === t ? CY : "rgba(255,255,255,0.2)"}`,
              color: filter === t ? CY : "rgba(255,255,255,0.5)",
              fontFamily: MONO, fontSize: 9, padding: "3px 8px", borderRadius: 4, cursor: "pointer" }}>
            {t}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="search…"
          style={{ marginLeft: "auto", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)",
            color: CY, fontFamily: MONO, fontSize: 10, padding: "3px 8px", borderRadius: 4, width: 130 }} />
        <button onClick={assess} disabled={assessing}
          style={{ background: "rgba(41,231,255,0.1)", border: `1px solid ${CY}`,
            color: CY, fontFamily: MONO, fontSize: 9, padding: "3px 9px", borderRadius: 4, cursor: "pointer" }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
      </div>

      {assessment && (
        <div style={{ margin: "0 14px 8px", padding: "8px 10px",
          background: "rgba(41,231,255,0.07)", border: `1px solid ${CY}33`,
          borderRadius: 6, fontSize: 10, color: "rgba(255,255,255,0.8)", lineHeight: 1.55 }}>
          {assessment}
        </div>
      )}

      {loading && <div style={{ padding: 14, fontSize: 10, color: AMBER }}>Loading watchlist…</div>}
      {error   && <div style={{ padding: 14, fontSize: 10, color: RED }}>⚠ {error}</div>}

      {/* rows */}
      <div style={{ padding: "0 14px 14px" }}>
        {filtered.length === 0 && !loading && (
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", padding: "10px 0" }}>No signals match filter.</div>
        )}
        {filtered.map(row => {
          const isExp = expanded === row.id;
          const col   = clsColor(row.cls);
          const sc    = sevColor(row.sev);
          return (
            <div key={row.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : row.id)}
                style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                  padding: "6px 10px", borderRadius: 6,
                  background: isExp ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.4)",
                  border: `1px solid ${col}55`,
                  animation: row.cls === "UNCOVERED" && (row.sev === "critical" || row.sev === "high") ? "jarvis-pulse 1.4s infinite" : "none" }}>
                <span style={{ fontSize: 9, color: sc, minWidth: 52, fontWeight: 700, textTransform: "uppercase" }}>{row.sev || "—"}</span>
                <span style={{ flex: 1, fontSize: 10, color: "rgba(255,255,255,0.85)", overflow: "hidden",
                  whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{row.label}</span>
                <span style={{ fontSize: 9, color: col, fontWeight: 700, minWidth: 92, textAlign: "right" }}>{row.cls}</span>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "8px 14px", background: "rgba(0,0,0,0.6)",
                  borderRadius: "0 0 6px 6px", border: `1px solid ${col}33`, borderTop: "none" }}>

                  {row.matchedInvests.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 9, color: AMBER, marginBottom: 4, letterSpacing: 1 }}>INVESTMENT EXPOSURE</div>
                      {row.matchedInvests.map(inv => (
                        <div key={inv.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.75)", overflow: "hidden",
                              whiteSpace: "nowrap", textOverflow: "ellipsis", maxWidth: "75%" }}>{inv.label}</span>
                            <span style={{ fontSize: 9, color: AMBER }}>{inv.score}%</span>
                          </div>
                          <div style={{ height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
                            <div style={{ height: "100%", width: `${inv.score}%`, background: AMBER,
                              borderRadius: 2, transition: "width 0.4s" }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {row.matchedContacts.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: CY, marginBottom: 4, letterSpacing: 1 }}>CONTACT EXPOSURE</div>
                      {row.matchedContacts.map(c => (
                        <div key={c.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.75)", overflow: "hidden",
                              whiteSpace: "nowrap", textOverflow: "ellipsis", maxWidth: "75%" }}>{c.label}</span>
                            <span style={{ fontSize: 9, color: CY }}>{c.score}%</span>
                          </div>
                          <div style={{ height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
                            <div style={{ height: "100%", width: `${c.score}%`, background: CY,
                              borderRadius: 2, transition: "width 0.4s" }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {row.matchedInvests.length === 0 && row.matchedContacts.length === 0 && (
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>No investment or contact match. Portfolio blind spot.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{ padding: "6px 14px 10px", borderTop: "1px solid rgba(255,255,255,0.07)",
        fontSize: 9, color: "rgba(255,255,255,0.3)" }}>
        {filtered.length}/{rows.length} risks · 90-s auto-refresh · /entities/RiskSignal × /entities/Investment × /entities/Contact
      </div>
    </div>
  );
}
