/**
 * F79 – Contact × Investment × RiskSignal Financial Exposure Nexus (CIFINEX)
 * Cross-correlates /entities/Contact × /entities/Investment × /entities/RiskSignal.
 * Classifies each contact by financial exposure monitoring status:
 *   FULLY_MONITORED – matched by ≥1 investment AND ≥1 risk signal
 *   INVEST_ONLY     – investment links but no risk-signal coverage
 *   RISK_ONLY       – risk signals but no investment links
 *   UNMONITORED     – no financial investment or risk signal backing
 * UNMONITORED rows pulse red.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const BTN_LEFT   = 960480;
const Z          = 661;
const REFRESH_MS = 90_000;

const CY   = "#29E7FF";
const GR   = "#00c878";
const AM   = "#F5A623";
const RD   = "#FF3B3B";
const DIM  = "#3a5060";
const MONO = "'JetBrains Mono', 'Courier New', monospace";
const SANS = "'Inter', system-ui, sans-serif";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
function authHdr() { return { Authorization: `Bearer ${API_KEY}` }; }

function kw(item) {
  return [
    item.name, item.title, item.description,
    item.subject, item.topic, item.category,
    item.type, item.kind, item.tags, item.source,
    item.summary, item.notes, item.role,
    item.alias, item.symbol, item.org,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function overlap(a, b) {
  const wa = a.split(/\W+/).filter(w => w.length > 3);
  const wb = new Set(b.split(/\W+/).filter(w => w.length > 3));
  return wa.filter(w => wb.has(w)).length;
}

function classifyContact(contact, investments, riskSignals) {
  const ck = kw(contact);
  const matchedInv  = investments.filter(i => overlap(ck, kw(i)) >= 2);
  const matchedRisk = riskSignals.filter(r => overlap(ck, kw(r)) >= 2);

  const hasInv  = matchedInv.length > 0;
  const hasRisk = matchedRisk.length > 0;
  let cls;
  if (hasInv && hasRisk) cls = "FULLY_MONITORED";
  else if (hasInv)       cls = "INVEST_ONLY";
  else if (hasRisk)      cls = "RISK_ONLY";
  else                   cls = "UNMONITORED";

  return {
    id: contact.id || contact.name || Math.random().toString(36).slice(2),
    contact,
    cls,
    matchedInv: matchedInv.slice(0, 5).map(i => ({
      name:  i.name || i.title || i.symbol || i.description || "?",
      score: overlap(ck, kw(i)),
    })),
    matchedRisk: matchedRisk.slice(0, 5).map(r => ({
      name:  r.name || r.title || r.description || "?",
      score: overlap(ck, kw(r)),
    })),
  };
}

async function loadAll(base) {
  const [cr, ir, rr] = await Promise.allSettled([
    fetch(`${base}/entities/Contact`,    { headers: authHdr() }),
    fetch(`${base}/entities/Investment`, { headers: authHdr() }),
    fetch(`${base}/entities/RiskSignal`, { headers: authHdr() }),
  ]);
  const parse = async (r, key) => {
    if (r.status !== "fulfilled" || !r.value.ok) return [];
    const d = await r.value.json();
    return Array.isArray(d) ? d : d.data || d.items || d[key] || [];
  };
  const [contacts, investments, riskSignals] = await Promise.all([
    parse(cr, "contacts"),
    parse(ir, "investments"),
    parse(rr, "risks"),
  ]);
  return { contacts, investments, riskSignals };
}

// ─── exported helpers for JarvisBrain ────────────────────────────────────────
export function isCifinexQuery(q) {
  return /\b(cifinex|contact\s+financial|financial\s+exposure|contact\s+investment|contact\s+risk\s+financial|financial\s+monitoring|investment\s+contact\s+risk|unmonitored\s+contact|contact\s+finance)\b/i.test(q);
}

export async function buildCifinexScript() {
  const base = apiBase();
  try {
    const { contacts, investments, riskSignals } = await loadAll(base);
    const rows        = contacts.map(c => classifyContact(c, investments, riskSignals));
    const total       = rows.length;
    const fully       = rows.filter(r => r.cls === "FULLY_MONITORED").length;
    const investOnly  = rows.filter(r => r.cls === "INVEST_ONLY").length;
    const riskOnly    = rows.filter(r => r.cls === "RISK_ONLY").length;
    const unmonitored = rows.filter(r => r.cls === "UNMONITORED").length;
    return (
      `Financial Exposure Nexus: ${total} contacts — ${fully} fully monitored, ` +
      `${investOnly} investment-only, ${riskOnly} risk-only, ` +
      `${unmonitored} unmonitored (no investment or risk signal backing). ` +
      (unmonitored > 0
        ? `${unmonitored} contacts have no financial exposure monitoring — potential blind spots.`
        : "All contacts have financial exposure coverage.")
    );
  } catch {
    return "Financial Exposure Nexus: unable to load data.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────
export default function ContactInvestmentRiskNexus() {
  const base = apiBase();

  const [rows, setRows]             = useState([]);
  const [invCount, setInvCount]     = useState(0);
  const [riskCount, setRiskCount]   = useState(0);
  const [filter, setFilter]         = useState("ALL");
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState(null);
  const [open, setOpen]             = useState(false);
  const [assessing, setAssessing]   = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { contacts, investments, riskSignals } = await loadAll(base);
      setInvCount(investments.length);
      setRiskCount(riskSignals.length);
      setRows(contacts.map(c => classifyContact(c, investments, riskSignals)));
    } catch {}
  }, [base]);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:cifinex-toggle", toggle);
    return () => window.removeEventListener("jarvis:cifinex-toggle", toggle);
  }, []);

  const assess = async () => {
    setAssessing(true);
    try {
      const script = await buildCifinexScript();
      const voice  = getActiveVoice?.() ?? "ash";
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ text: script, voice }),
      });
    } catch {}
    setAssessing(false);
  };

  const total       = rows.length;
  const fully       = rows.filter(r => r.cls === "FULLY_MONITORED").length;
  const investOnly  = rows.filter(r => r.cls === "INVEST_ONLY").length;
  const riskOnly    = rows.filter(r => r.cls === "RISK_ONLY").length;
  const unmonitored = rows.filter(r => r.cls === "UNMONITORED").length;

  const TABS = ["ALL", "FULLY_MONITORED", "INVEST_ONLY", "RISK_ONLY", "UNMONITORED"];

  const visible = rows
    .filter(r => filter === "ALL" || r.cls === filter)
    .filter(r => {
      if (!search) return true;
      const t = (r.contact.name || r.contact.title || "").toLowerCase();
      return t.includes(search.toLowerCase());
    });

  function clsColor(c) {
    if (c === "FULLY_MONITORED") return GR;
    if (c === "INVEST_ONLY")     return CY;
    if (c === "RISK_ONLY")       return AM;
    return RD;
  }

  const panel = {
    position: "fixed", bottom: 70, left: "50%", transform: "translateX(-50%)",
    width: 740, maxHeight: "78vh", display: "flex", flexDirection: "column",
    background: "rgba(5,20,35,0.97)", border: "1px solid #1a3a5c",
    borderRadius: 12, zIndex: Z + 1, fontFamily: SANS, color: "#c8e0f0",
    boxShadow: "0 0 40px rgba(0,200,255,0.12)",
    overflowY: "auto",
  };

  const tile = (label, val, col) => (
    <div style={{ textAlign: "center", minWidth: 100 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: col, fontFamily: MONO }}>{val}</div>
      <div style={{ fontSize: 9, color: "#5a8fa8", marginTop: 2, letterSpacing: 1 }}>{label}</div>
    </div>
  );

  return (
    <>
      {/* trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Contact × Investment × RiskSignal Financial Exposure Nexus"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z,
          background: open ? "rgba(41,231,255,0.2)" : "rgba(41,231,255,0.1)",
          border: `1px solid ${open ? CY : "rgba(41,231,255,0.3)"}`,
          borderRadius: 6, padding: "3px 8px", color: open ? CY : "#2a7090",
          fontSize: 10, fontFamily: MONO, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        ◈ CIFINEX
      </button>

      {open && (
        <div style={panel}>
          {/* header */}
          <div style={{
            padding: "14px 18px 10px", borderBottom: "1px solid #1a3a5c",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            position: "sticky", top: 0, background: "rgba(5,20,35,0.99)", zIndex: 2,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, color: CY }}>
              ◈ CONTACT FINANCIAL EXPOSURE NEXUS
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={assess} disabled={assessing} style={{
                background: assessing ? "rgba(0,200,120,0.1)" : "rgba(0,200,120,0.15)",
                border: "1px solid #00c878", borderRadius: 4, color: GR,
                fontSize: 10, padding: "3px 10px", cursor: "pointer", fontFamily: MONO,
              }}>
                {assessing ? "…" : "▶ ASSESS"}
              </button>
              <button onClick={() => setOpen(false)} style={{
                background: "none", border: "none", color: "#5a8fa8",
                fontSize: 16, cursor: "pointer", lineHeight: 1,
              }}>✕</button>
            </div>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 18, padding: "14px 18px", borderBottom: "1px solid #0a2535", justifyContent: "space-between" }}>
            {tile("CONTACTS",         total,    CY)}
            {tile("INVESTMENTS",      invCount,  GR)}
            {tile("RISK SIGNALS",     riskCount, AM)}
            {tile("FULLY MONITORED",  fully,    "#00ff88")}
            <div style={{ textAlign: "center", minWidth: 100, position: "relative" }}>
              <div style={{
                fontSize: 22, fontWeight: 700, color: RD, fontFamily: MONO,
                animation: unmonitored > 0 ? "pulse-red 1.4s infinite" : "none",
              }}>{unmonitored}</div>
              <div style={{ fontSize: 9, color: "#5a8fa8", marginTop: 2, letterSpacing: 1 }}>UNMONITORED</div>
            </div>
          </div>

          {/* filter tabs + search */}
          <div style={{ display: "flex", gap: 6, padding: "8px 18px", borderBottom: "1px solid #0a2535", alignItems: "center", flexWrap: "wrap" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setFilter(t)} style={{
                background: filter === t ? "rgba(41,231,255,0.15)" : "rgba(41,231,255,0.05)",
                border: `1px solid ${filter === t ? CY : "#1a3a5c"}`,
                borderRadius: 4, color: filter === t ? CY : "#5a8fa8",
                fontSize: 9, padding: "2px 8px", cursor: "pointer", fontFamily: MONO,
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search contact name…"
              style={{
                marginLeft: "auto", background: "rgba(41,231,255,0.06)",
                border: "1px solid #1a3a5c", borderRadius: 4, color: "#c8e0f0",
                fontSize: 10, padding: "3px 8px", fontFamily: SANS, outline: "none", width: 180,
              }}
            />
          </div>

          {/* rows */}
          <div style={{ padding: "8px 18px 18px" }}>
            {visible.length === 0 ? (
              <div style={{ color: DIM, fontSize: 11, padding: "20px 0", textAlign: "center" }}>
                {rows.length === 0 ? "Loading…" : "No matches."}
              </div>
            ) : visible.map(row => {
              const isExpanded = expanded === row.id;
              const color  = clsColor(row.cls);
              const name   = row.contact.name || row.contact.title || row.contact.id || "Contact";
              return (
                <div key={row.id} style={{ marginBottom: 4, borderRadius: 6, overflow: "hidden", border: "1px solid #0d2a40" }}>
                  <div
                    onClick={() => setExpanded(isExpanded ? null : row.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 12px", cursor: "pointer",
                      background: isExpanded ? "rgba(41,231,255,0.06)" : "transparent",
                    }}
                  >
                    <span style={{
                      fontSize: 9, fontFamily: MONO, color, minWidth: 140,
                      animation: row.cls === "UNMONITORED" ? "pulse-red 1.4s infinite" : "none",
                    }}>{row.cls}</span>
                    <span style={{ fontSize: 11, flex: 1, color: "#c8e0f0" }}>{name}</span>
                    <span style={{ fontSize: 9, color: DIM }}>
                      {row.matchedInv.length}i / {row.matchedRisk.length}r
                    </span>
                    <span style={{ color: DIM, fontSize: 11 }}>{isExpanded ? "▲" : "▼"}</span>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: "8px 16px 12px", background: "rgba(0,0,0,0.2)" }}>
                      {/* matched investments */}
                      {row.matchedInv.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 9, color: CY, marginBottom: 4, letterSpacing: 1 }}>INVESTMENTS</div>
                          {row.matchedInv.map((inv, i) => (
                            <div key={i} style={{ marginBottom: 3 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                                <span style={{ fontSize: 10, color: "#c8e0f0" }}>{inv.name}</span>
                                <span style={{ fontSize: 9, color: CY, fontFamily: MONO }}>{inv.score}</span>
                              </div>
                              <div style={{ height: 3, background: "#0d2a40", borderRadius: 2 }}>
                                <div style={{ height: "100%", width: `${Math.min(100, inv.score * 20)}%`, background: CY, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* matched risk signals */}
                      {row.matchedRisk.length > 0 && (
                        <div>
                          <div style={{ fontSize: 9, color: RD, marginBottom: 4, letterSpacing: 1 }}>RISK SIGNALS</div>
                          {row.matchedRisk.map((rs, i) => (
                            <div key={i} style={{ marginBottom: 3 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                                <span style={{ fontSize: 10, color: "#c8e0f0" }}>{rs.name}</span>
                                <span style={{ fontSize: 9, color: RD, fontFamily: MONO }}>{rs.score}</span>
                              </div>
                              <div style={{ height: 3, background: "#0d2a40", borderRadius: 2 }}>
                                <div style={{ height: "100%", width: `${Math.min(100, rs.score * 20)}%`, background: RD, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {row.matchedInv.length === 0 && row.matchedRisk.length === 0 && (
                        <div style={{ fontSize: 10, color: DIM }}>No matching investments or risk signals — contact has no financial exposure monitoring.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <style>{`
            @keyframes pulse-red {
              0%,100% { opacity:1; }
              50%      { opacity:0.35; }
            }
          `}</style>
        </div>
      )}
    </>
  );
}
