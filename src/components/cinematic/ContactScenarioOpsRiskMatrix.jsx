/**
 * F144 — Contact × Scenario × Ops Event × RiskSignal
 *         Personnel Threat Activation Matrix (CSOERM)
 *
 * Parallel-fetches /entities/Contact + /v1/scenario/list +
 *   /v1/ops/events + /entities/RiskSignal
 * Keyword-correlates each contact (name/role/org/tags) against
 * scenario playbooks AND ops events AND risk signals:
 *   FULLY_ACTIVATED — matched all three sources
 *   DUAL_ACTIVATED  — matched any two sources
 *   SINGLE_LINKED   — matched exactly one source
 *   PASSIVE         — no matches (personnel not engaged)
 *
 * Stat tiles: CONTACTS / SCENARIOS / OPS EVENTS / RISK SIGS +
 *             all four class counts + ACTIVE%.
 * Red pulse badge on fully-activated count.
 * Filter tabs ALL / FULLY_ACTIVATED / DUAL_ACTIVATED / SINGLE_LINKED / PASSIVE + text search.
 * Expand contact → matched scenario cards (green) + ops event cards (blue) +
 *                  risk signal cards (red, severity badge) with relevance bars.
 * ▶ ASSESS ACTIVATION → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:csoerm-toggle event.
 *
 * Voice triggers: "csoerm / contact activation / personnel activation /
 *                  activated contacts / scenario contact risk / contact threat activation".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_023_560;
const Z_INDEX  = 206;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const CSOERM_RE = /\b(csoerm|contact[\s-]activation|personnel[\s-]activation|activated[\s-]contacts?|scenario[\s-]contact[\s-]risk|contact[\s-]threat[\s-]activation)\b/i;

const CY     = "#00CFFF";
const GR     = "#22C55E";
const AM     = "#F59E0B";
const RE     = "#EF4444";
const OR     = "#F97316";
const BL     = "#3B82F6";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_ACTIVATED: RE,
  DUAL_ACTIVATED:  AM,
  SINGLE_LINKED:   CY,
  PASSIVE:         "#4B5563",
};
const TABS = ["ALL", "FULLY_ACTIVATED", "DUAL_ACTIVATED", "SINGLE_LINKED", "PASSIVE"];
const SEV_COLOR = { CRITICAL: RE, HIGH: OR, MEDIUM: AM, LOW: GR };

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function contactText(c) {
  return `${c.name || ""} ${c.role || ""} ${c.org || ""} ${c.email || ""} ${c.description || ""} ${(c.tags || []).join(" ")}`;
}
function scenarioText(s) {
  return `${s.name || s.title || ""} ${s.description || ""} ${(s.tags || []).join(" ")}`;
}
function opsText(e) {
  return `${e.title || e.name || ""} ${e.description || ""} ${e.type || ""} ${e.source || ""} ${(e.tags || []).join(" ")}`;
}
function riskText(r) {
  return `${r.title || r.name || ""} ${r.description || ""} ${r.type || ""} ${r.severity || ""} ${(r.tags || []).join(" ")}`;
}

function normaliseArray(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.items)) return raw.items;
  return [];
}

async function loadAll() {
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const [contactRes, scenRes, opsRes, riskRes] = await Promise.allSettled([
    fetch(`${apiBase}/entities/Contact`,  { headers }),
    fetch(`${apiBase}/v1/scenario/list`,  { headers }),
    fetch(`${apiBase}/v1/ops/events`,     { headers }),
    fetch(`${apiBase}/entities/RiskSignal`, { headers }),
  ]);
  const contacts  = normaliseArray(
    contactRes.status === "fulfilled" && contactRes.value.ok ? await contactRes.value.json() : [],
    ["contacts", "items"]
  );
  const scenarios = normaliseArray(
    scenRes.status === "fulfilled" && scenRes.value.ok ? await scenRes.value.json() : [],
    ["scenarios", "items"]
  );
  const opsEvents = normaliseArray(
    opsRes.status === "fulfilled" && opsRes.value.ok ? await opsRes.value.json() : [],
    ["events", "ops_events", "items"]
  );
  const riskSignals = normaliseArray(
    riskRes.status === "fulfilled" && riskRes.value.ok ? await riskRes.value.json() : [],
    ["signals", "risks", "items"]
  );
  return { contacts, scenarios, opsEvents, riskSignals };
}

function classify(contact, scenarios, opsEvents, riskSignals) {
  const kws            = keywords(contactText(contact));
  const matchedScenario = scenarios.filter(s => score(scenarioText(s), kws) > 0);
  const matchedOps      = opsEvents.filter(e => score(opsText(e), kws) > 0);
  const matchedRisk     = riskSignals.filter(r => score(riskText(r), kws) > 0);
  const hits = (matchedScenario.length > 0 ? 1 : 0)
             + (matchedOps.length > 0 ? 1 : 0)
             + (matchedRisk.length > 0 ? 1 : 0);
  let cls;
  if (hits === 3)      cls = "FULLY_ACTIVATED";
  else if (hits === 2) cls = "DUAL_ACTIVATED";
  else if (hits === 1) cls = "SINGLE_LINKED";
  else                 cls = "PASSIVE";
  return { ...contact, cls, matchedScenario, matchedOps, matchedRisk };
}

function RelevanceBar({ score: s, max, color }) {
  const pct = max > 0 ? Math.round((s / max) * 100) : 0;
  return (
    <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginTop: 3 }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.3s" }} />
    </div>
  );
}

export async function buildCsoermScript() {
  const { contacts, scenarios, opsEvents, riskSignals } = await loadAll();
  const rows       = contacts.map(c => classify(c, scenarios, opsEvents, riskSignals));
  const activated  = rows.filter(r => r.cls === "FULLY_ACTIVATED").length;
  const passive    = rows.filter(r => r.cls === "PASSIVE").length;
  const ctx = `Contacts: ${contacts.length}. Scenarios: ${scenarios.length}. Ops events: ${opsEvents.length}. Risk signals: ${riskSignals.length}. Fully activated: ${activated}. Passive: ${passive}.`;
  const res = await fetch(`${apiBase}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) },
    body: JSON.stringify({ message: `Personnel Threat Activation Matrix (CSOERM): ${ctx}. Write exactly 2 sentences assessing which contacts are fully activated across scenario, ops, and risk dimensions, and what the passive-personnel gap means for operational response readiness.` }),
  });
  const j = await res.json().catch(() => ({}));
  return j.response || j.message || j.content
    || `CSOERM online, sir. ${activated} contacts fully activated across scenario, ops, and risk dimensions — ${passive} personnel remain passive with no threat engagement.`;
}

export function isCsoermQuery(q) { return CSOERM_RE.test(q); }

export default function ContactScenarioOpsRiskMatrix() {
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [classified, setClassified] = useState([]);
  const [scenarios, setScenarios]   = useState([]);
  const [opsEvents, setOpsEvents]   = useState([]);
  const [riskSignals, setRiskSignals] = useState([]);
  const [tab, setTab]               = useState("ALL");
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState(null);
  const [brief, setBrief]           = useState("");
  const [assessing, setAssessing]   = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { contacts, scenarios: sc, opsEvents: oe, riskSignals: rs } = await loadAll();
      setScenarios(sc);
      setOpsEvents(oe);
      setRiskSignals(rs);
      setClassified(contacts.map(c => classify(c, sc, oe, rs)));
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener("jarvis:csoerm-toggle", toggle);
    return () => window.removeEventListener("jarvis:csoerm-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = await buildCsoermScript();
      setBrief(script);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch { setBrief("Assessment unavailable."); }
    finally { setAssessing(false); }
  }, []);

  const counts = {
    FULLY_ACTIVATED: classified.filter(r => r.cls === "FULLY_ACTIVATED").length,
    DUAL_ACTIVATED:  classified.filter(r => r.cls === "DUAL_ACTIVATED").length,
    SINGLE_LINKED:   classified.filter(r => r.cls === "SINGLE_LINKED").length,
    PASSIVE:         classified.filter(r => r.cls === "PASSIVE").length,
  };
  const total     = classified.length;
  const activePct = total > 0 ? Math.round(((counts.FULLY_ACTIVATED + counts.DUAL_ACTIVATED) / total) * 100) : 0;
  const fullyAct  = counts.FULLY_ACTIVATED;

  const filtered = classified.filter(r => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (!search) return true;
    return contactText(r).toLowerCase().includes(search.toLowerCase());
  });

  const maxScen = Math.max(1, ...filtered.map(r => r.matchedScenario.length));
  const maxOps  = Math.max(1, ...filtered.map(r => r.matchedOps.length));
  const maxRisk = Math.max(1, ...filtered.map(r => r.matchedRisk.length));

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => { setOpen(o => { if (!o) load(); return !o; }); }}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 9, padding: "3px 8px", borderRadius: 5,
          cursor: "pointer", whiteSpace: "nowrap",
          background: open ? `${CY}22` : "rgba(0,0,0,0.6)",
          color: open ? CY : "#5A7A9A",
          border: `1px solid ${open ? CY : "#1A2A3A"}`,
        }}
      >
        ◈ CSOERM
        {fullyAct > 0 && (
          <span style={{
            marginLeft: 4, background: RE, color: "#fff", borderRadius: 9,
            padding: "0px 5px", fontSize: 8, fontWeight: 700,
            animation: "pulse 1.4s infinite",
          }}>
            {fullyAct}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", left: BTN_LEFT, bottom: 32, zIndex: Z_INDEX + 1,
          width: 460, maxHeight: "72vh", overflowY: "auto",
          background: BG, border: `1px solid ${BORDER}`,
          borderRadius: 10, padding: 14, fontFamily: FONT,
          boxShadow: `0 0 24px ${CY}18`,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>
              ◈ CONTACT × SCENARIO × OPS × RISK ACTIVATION
            </span>
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "#5A7A9A", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {error && (
            <div style={{ color: RE, fontSize: 10, marginBottom: 8 }}>⚠ {error}</div>
          )}

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {[
              ["CONTACTS",    total,                  CY],
              ["SCENARIOS",   scenarios.length,       GR],
              ["OPS EVENTS",  opsEvents.length,       BL],
              ["RISK SIGS",   riskSignals.length,     RE],
              ["FULLY ACT.",  counts.FULLY_ACTIVATED, RE],
              ["DUAL ACT.",   counts.DUAL_ACTIVATED,  AM],
              ["SINGLE LNK.", counts.SINGLE_LINKED,   CY],
              ["PASSIVE",     counts.PASSIVE,         "#4B5563"],
              [`${activePct}% ACTIVE`, null,          "#7DD3FC"],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: "rgba(0,0,0,0.4)", border: `1px solid ${col}33`,
                borderRadius: 5, padding: "4px 8px", minWidth: 70,
              }}>
                <div style={{ color: col, fontSize: 14, fontWeight: 700 }}>{val ?? label}</div>
                {val !== null && <div style={{ color: "#5A7A9A", fontSize: 8 }}>{label}</div>}
              </div>
            ))}
          </div>

          {/* Coverage bar */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
              <span style={{ color: "#5A7A9A", fontSize: 9 }}>DUAL+ ACTIVATION COVERAGE</span>
              <span style={{ color: AM, fontSize: 9 }}>{activePct}%</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
              <div style={{ height: "100%", width: `${activePct}%`, background: `linear-gradient(90deg, ${RE}, ${AM})`, borderRadius: 2, transition: "width 0.5s" }} />
            </div>
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                fontFamily: FONT, fontSize: 8, padding: "2px 7px", borderRadius: 4, cursor: "pointer",
                background: tab === t ? `${CY}22` : "rgba(0,0,0,0.4)",
                color: tab === t ? CY : "#5A7A9A",
                border: `1px solid ${tab === t ? CY : "#1A2A3A"}`,
              }}>{t}</button>
            ))}
          </div>

          {/* Search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search contacts…"
            style={{
              width: "100%", boxSizing: "border-box", marginBottom: 8,
              background: "rgba(0,0,0,0.4)", border: `1px solid ${BORDER}`,
              borderRadius: 5, padding: "4px 8px", color: "#ccc",
              fontFamily: FONT, fontSize: 10,
            }}
          />

          {/* Loading */}
          {loading && <div style={{ color: CY, fontSize: 10, marginBottom: 6 }}>⟳ Loading…</div>}

          {/* Rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {filtered.map((row, i) => {
              const id    = row.id || row._id || i;
              const isExp = expanded === id;
              const col   = CLASS_COLOR[row.cls];
              return (
                <div key={id} style={{
                  background: "rgba(0,0,0,0.35)", border: `1px solid ${col}33`,
                  borderRadius: 6, padding: "6px 10px", cursor: "pointer",
                }} onClick={() => setExpanded(isExp ? null : id)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "#ccc", fontSize: 10 }}>
                      {row.name || row.email || `Contact ${i + 1}`}
                      {row.role && <span style={{ color: "#5A7A9A", marginLeft: 6, fontSize: 9 }}>{row.role}</span>}
                    </span>
                    <span style={{
                      background: `${col}22`, color: col, border: `1px solid ${col}55`,
                      borderRadius: 4, padding: "1px 6px", fontSize: 8, fontWeight: 700,
                    }}>{row.cls}</span>
                  </div>
                  {row.org && <div style={{ color: "#5A7A9A", fontSize: 9, marginTop: 2 }}>{row.org}</div>}

                  {isExp && (
                    <div style={{ marginTop: 8 }}>
                      {/* Matched scenarios */}
                      {row.matchedScenario.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: GR, fontSize: 9, marginBottom: 3 }}>▸ SCENARIOS ({row.matchedScenario.length})</div>
                          {row.matchedScenario.slice(0, 3).map((s, j) => {
                            const sc = score(scenarioText(s), keywords(contactText(row)));
                            return (
                              <div key={j} style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 4, padding: "3px 7px", marginBottom: 3 }}>
                                <div style={{ color: GR, fontSize: 9 }}>{s.name || s.title || "Scenario"}</div>
                                <RelevanceBar score={sc} max={maxScen} color={GR} />
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {/* Matched ops events */}
                      {row.matchedOps.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: BL, fontSize: 9, marginBottom: 3 }}>▸ OPS EVENTS ({row.matchedOps.length})</div>
                          {row.matchedOps.slice(0, 3).map((e, j) => {
                            const sc = score(opsText(e), keywords(contactText(row)));
                            return (
                              <div key={j} style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 4, padding: "3px 7px", marginBottom: 3 }}>
                                <div style={{ color: BL, fontSize: 9 }}>{e.title || e.name || "Event"}</div>
                                <RelevanceBar score={sc} max={maxOps} color={BL} />
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {/* Matched risk signals */}
                      {row.matchedRisk.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: RE, fontSize: 9, marginBottom: 3 }}>▸ RISK SIGNALS ({row.matchedRisk.length})</div>
                          {row.matchedRisk.slice(0, 3).map((r, j) => {
                            const sc   = score(riskText(r), keywords(contactText(row)));
                            const sev  = (r.severity || "").toUpperCase();
                            const sCol = SEV_COLOR[sev] || AM;
                            return (
                              <div key={j} style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 4, padding: "3px 7px", marginBottom: 3 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <span style={{ color: RE, fontSize: 9 }}>{r.title || r.name || "Risk"}</span>
                                  {sev && <span style={{ background: `${sCol}22`, color: sCol, border: `1px solid ${sCol}55`, borderRadius: 3, padding: "0px 4px", fontSize: 7 }}>{sev}</span>}
                                </div>
                                <RelevanceBar score={sc} max={maxRisk} color={RE} />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && !loading && (
              <div style={{ color: "#5A7A9A", fontSize: 10, textAlign: "center", padding: 12 }}>No contacts match.</div>
            )}
          </div>

          {/* Assess button */}
          <div style={{ marginTop: 10 }}>
            <button onClick={assess} disabled={assessing} style={{
              fontFamily: FONT, fontSize: 9, padding: "4px 12px", borderRadius: 5, cursor: "pointer",
              background: `${RE}22`, color: RE, border: `1px solid ${RE}55`,
              opacity: assessing ? 0.6 : 1,
            }}>
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS ACTIVATION"}
            </button>
          </div>

          {/* Brief */}
          {brief && (
            <div style={{ marginTop: 8, background: "rgba(0,0,0,0.3)", border: `1px solid ${BORDER}`, borderRadius: 6, padding: 8 }}>
              <div style={{ color: CY, fontSize: 9, marginBottom: 4 }}>◈ ACTIVATION ASSESSMENT</div>
              <div style={{ color: "#ccc", fontSize: 10, lineHeight: 1.5 }}>{brief}</div>
            </div>
          )}

          <div style={{ color: "#2A3A4A", fontSize: 8, textAlign: "right", marginTop: 8 }}>
            CSOERM · auto-refresh 90s · /entities/Contact × /v1/scenario/list × /v1/ops/events × /entities/RiskSignal
          </div>
        </div>
      )}
    </>
  );
}
