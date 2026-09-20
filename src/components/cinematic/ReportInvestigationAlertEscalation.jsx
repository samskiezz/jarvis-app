/**
 * F77 – Report × Investigation × Ops Alert Escalation Nexus (RIOESCL)
 * Cross-correlates /v1/reports × /v1/investigations × /v1/ops/alerts.
 * Classifies each report:
 *   FULLY_ESCALATED – matched by ≥1 investigation AND ≥1 alert
 *   INVEST_ONLY     – investigation backing but no alert
 *   ALERT_ONLY      – alert match but no investigation
 *   UNESCALATED     – no investigation or alert backing (escalation blind spot)
 * UNESCALATED rows pulse red.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const BTN_LEFT   = 958760;
const Z          = 659;
const REFRESH_MS = 120_000;

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
    item.summary, item.rule, item.message,
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

function classifyReport(report, investigations, alerts) {
  const rk = kw(report);
  const matchedInv   = investigations.filter(i => overlap(rk, kw(i)) >= 2);
  const matchedAlert = alerts.filter(a => overlap(rk, kw(a)) >= 2);

  const hasInv   = matchedInv.length > 0;
  const hasAlert = matchedAlert.length > 0;
  let cls;
  if (hasInv && hasAlert) cls = "FULLY_ESCALATED";
  else if (hasInv)         cls = "INVEST_ONLY";
  else if (hasAlert)       cls = "ALERT_ONLY";
  else                     cls = "UNESCALATED";

  return {
    id: report.id || report.name || report.title || Math.random().toString(36).slice(2),
    report,
    cls,
    matchedInv:   matchedInv.slice(0, 5).map(i => ({
      name:  i.title || i.name || i.description || "?",
      score: overlap(rk, kw(i)),
    })),
    matchedAlert: matchedAlert.slice(0, 5).map(a => ({
      name:     a.message || a.name || a.title || a.rule || "?",
      severity: a.severity || a.level || "",
      score:    overlap(rk, kw(a)),
    })),
  };
}

async function loadAll(base) {
  const [rr, ir, ar] = await Promise.allSettled([
    fetch(`${base}/v1/reports`,       { headers: authHdr() }),
    fetch(`${base}/v1/investigations`,{ headers: authHdr() }),
    fetch(`${base}/v1/ops/alerts`,    { headers: authHdr() }),
  ]);
  const parse = async (r, key) => {
    if (r.status !== "fulfilled" || !r.value.ok) return [];
    const d = await r.value.json();
    return Array.isArray(d) ? d : d.data || d.items || d[key] || [];
  };
  const [reports, investigations, alerts] = await Promise.all([
    parse(rr, "reports"),
    parse(ir, "investigations"),
    parse(ar, "alerts"),
  ]);
  return { reports, investigations, alerts };
}

// ─── exported helpers for JarvisBrain ────────────────────────────────────────
export function isRioesclQuery(q) {
  return /\b(rioescl|report\s+escalation|investigation\s+escalation|unescalated\s+report|alert\s+escalation|report\s+alert|report\s+investigation\s+link|escalation\s+gap|report\s+escalat)\b/i.test(q);
}

export async function buildRioesclScript() {
  const base = apiBase();
  try {
    const { reports, investigations, alerts } = await loadAll(base);
    const rows = reports.map(r => classifyReport(r, investigations, alerts));
    const total      = rows.length;
    const fully      = rows.filter(r => r.cls === "FULLY_ESCALATED").length;
    const invOnly    = rows.filter(r => r.cls === "INVEST_ONLY").length;
    const alertOnly  = rows.filter(r => r.cls === "ALERT_ONLY").length;
    const unescalated= rows.filter(r => r.cls === "UNESCALATED").length;
    return (
      `Escalation Nexus: ${total} reports — ${fully} fully escalated, ` +
      `${invOnly} investigation-only, ${alertOnly} alert-only, ` +
      `${unescalated} unescalated (no investigation or alert backing). ` +
      (unescalated > 0 ? `${unescalated} reports are blind spots — not backed by any active investigation or alert.` : "All reports have escalation coverage.")
    );
  } catch {
    return "Escalation Nexus: unable to load data.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────
export default function ReportInvestigationAlertEscalation() {
  const base = apiBase();

  const [rows, setRows]         = useState([]);
  const [invCount, setInvCount] = useState(0);
  const [alertCount, setAlertCount] = useState(0);
  const [filter, setFilter]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [open, setOpen]         = useState(false);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { reports, investigations, alerts } = await loadAll(base);
      setInvCount(investigations.length);
      setAlertCount(alerts.length);
      setRows(reports.map(r => classifyReport(r, investigations, alerts)));
    } catch {}
  }, [base]);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:rioescl-toggle", toggle);
    return () => window.removeEventListener("jarvis:rioescl-toggle", toggle);
  }, []);

  const assess = async () => {
    setAssessing(true);
    try {
      const script = await buildRioesclScript();
      const voice  = getActiveVoice?.() ?? "ash";
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ text: script, voice }),
      });
    } catch {}
    setAssessing(false);
  };

  const total      = rows.length;
  const fully      = rows.filter(r => r.cls === "FULLY_ESCALATED").length;
  const invOnly    = rows.filter(r => r.cls === "INVEST_ONLY").length;
  const alertOnly  = rows.filter(r => r.cls === "ALERT_ONLY").length;
  const unescalated= rows.filter(r => r.cls === "UNESCALATED").length;

  const TABS = ["ALL","FULLY_ESCALATED","INVEST_ONLY","ALERT_ONLY","UNESCALATED"];

  const visible = rows
    .filter(r => filter === "ALL" || r.cls === filter)
    .filter(r => {
      if (!search) return true;
      const t = (r.report.title || r.report.name || "").toLowerCase();
      return t.includes(search.toLowerCase());
    });

  function clsColor(c) {
    if (c === "FULLY_ESCALATED") return GR;
    if (c === "INVEST_ONLY")     return AM;
    if (c === "ALERT_ONLY")      return CY;
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
        title="Report × Investigation × Alert Escalation Nexus"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z,
          background: open ? "rgba(255,100,50,0.25)" : "rgba(255,100,50,0.12)",
          border: `1px solid ${open ? RD : "rgba(255,100,50,0.35)"}`,
          borderRadius: 6, padding: "3px 8px", color: open ? RD : "#c05040",
          fontSize: 10, fontFamily: MONO, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        ◈ RIOESCL
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
              ◈ REPORT ESCALATION NEXUS
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
            {tile("REPORTS",          total,       CY)}
            {tile("INVESTIGATIONS",   invCount,    AM)}
            {tile("ALERTS",           alertCount,  "#ff8040")}
            {tile("FULLY ESCALATED",  fully,       GR)}
            <div style={{ textAlign: "center", minWidth: 100, position: "relative" }}>
              <div style={{
                fontSize: 22, fontWeight: 700, color: RD, fontFamily: MONO,
                animation: unescalated > 0 ? "pulse-red 1.4s infinite" : "none",
              }}>{unescalated}</div>
              <div style={{ fontSize: 9, color: "#5a8fa8", marginTop: 2, letterSpacing: 1 }}>UNESCALATED</div>
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
              placeholder="search report title…"
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
              const isOpen = expanded === row.id;
              const color  = clsColor(row.cls);
              const title  = row.report.title || row.report.name || row.report.id || "Report";
              return (
                <div key={row.id} style={{ marginBottom: 4, borderRadius: 6, overflow: "hidden", border: "1px solid #0d2a40" }}>
                  <div
                    onClick={() => setExpanded(isOpen ? null : row.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 12px", cursor: "pointer",
                      background: isOpen ? "rgba(41,231,255,0.06)" : "transparent",
                    }}
                  >
                    <span style={{
                      fontSize: 9, fontFamily: MONO, color, minWidth: 130,
                      animation: row.cls === "UNESCALATED" ? "pulse-red 1.4s infinite" : "none",
                    }}>{row.cls}</span>
                    <span style={{ fontSize: 11, flex: 1, color: "#c8e0f0" }}>{title}</span>
                    <span style={{ fontSize: 9, color: DIM }}>
                      {row.matchedInv.length}i / {row.matchedAlert.length}a
                    </span>
                    <span style={{ color: DIM, fontSize: 11 }}>{isOpen ? "▲" : "▼"}</span>
                  </div>
                  {isOpen && (
                    <div style={{ padding: "8px 16px 12px", background: "rgba(0,0,0,0.2)" }}>
                      {/* matched investigations */}
                      {row.matchedInv.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 9, color: AM, marginBottom: 4, letterSpacing: 1 }}>INVESTIGATIONS</div>
                          {row.matchedInv.map((inv, i) => (
                            <div key={i} style={{ marginBottom: 3 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                                <span style={{ fontSize: 10, color: "#c8e0f0" }}>{inv.name}</span>
                                <span style={{ fontSize: 9, color: AM, fontFamily: MONO }}>{inv.score}</span>
                              </div>
                              <div style={{ height: 3, background: "#0d2a40", borderRadius: 2 }}>
                                <div style={{ height: "100%", width: `${Math.min(100, inv.score * 20)}%`, background: AM, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* matched alerts */}
                      {row.matchedAlert.length > 0 && (
                        <div>
                          <div style={{ fontSize: 9, color: RD, marginBottom: 4, letterSpacing: 1 }}>OPS ALERTS</div>
                          {row.matchedAlert.map((al, i) => (
                            <div key={i} style={{ marginBottom: 3 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                                <span style={{ fontSize: 10, color: "#c8e0f0" }}>{al.name}</span>
                                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                  {al.severity && <span style={{ fontSize: 9, color: RD, fontFamily: MONO }}>{al.severity}</span>}
                                  <span style={{ fontSize: 9, color: RD, fontFamily: MONO }}>{al.score}</span>
                                </div>
                              </div>
                              <div style={{ height: 3, background: "#0d2a40", borderRadius: 2 }}>
                                <div style={{ height: "100%", width: `${Math.min(100, al.score * 20)}%`, background: RD, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {row.matchedInv.length === 0 && row.matchedAlert.length === 0 && (
                        <div style={{ fontSize: 10, color: DIM }}>No matching investigations or alerts — escalation blind spot.</div>
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
