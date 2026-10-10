/**
 * F110 — Scenario × RiskSignal × Contact Rapid Response Plan (SCRRP)
 *
 * Parallel-fetches /v1/scenario/list + /entities/RiskSignal + /entities/Contact.
 * Keyword-correlates each active risk signal against scenario playbooks AND
 * assigned contacts to classify:
 *   RESPONSE_READY  (scenario + contact match)
 *   SCENARIO_ONLY   (playbook exists, no contact assigned)
 *   CONTACT_ONLY    (contact linked, no playbook)
 *   EXPOSED         (neither — no plan and no owner)
 *
 * Red pulse badge on EXPOSED count.
 * Stat tiles RISK SIGNALS / SCENARIOS / CONTACTS + all four class counts + READINESS%.
 * Filter tabs ALL/RESPONSE_READY/SCENARIO_ONLY/CONTACT_ONLY/EXPOSED + text search.
 * Expand signal → matched scenario cards (cyan) + contact cards (orange)
 *   with relevance bars.
 * ▶ ASSESS RESPONSE PLAN → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Voice trigger: "scrrp/scenario risk contact/rapid response plan/response ready/
 *   exposed risks/risk response coverage".
 * Event: jarvis:scrrp-toggle | 90-s auto-refresh.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_004_520;
const Z_INDEX  = 172;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const SCRRP_RE = /\b(scrrp|scenario[\s-]risk[\s-]contact|rapid[\s-]response[\s-]plan|response[\s-]ready|exposed[\s-]risks?|risk[\s-]response[\s-]coverage)\b/i;

const CY    = "#00CFFF";
const OR    = "#F97316";
const RD    = "#EF4444";
const GR    = "#22C55E";
const AM    = "#F59E0B";
const BG    = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT  = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  RESPONSE_READY:  GR,
  SCENARIO_ONLY:   CY,
  CONTACT_ONLY:    OR,
  EXPOSED:         RD,
};

const TABS = ["ALL","RESPONSE_READY","SCENARIO_ONLY","CONTACT_ONLY","EXPOSED"];

// ── exports for JarvisBrain ───────────────────────────────────────────────────

export function isScrrpQuery(text) {
  return SCRRP_RE.test(text || "");
}

// ── helpers ───────────────────────────────────────────────────────────────────

function norm(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function kwTokens(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function overlap(aStr, bStr) {
  const at = new Set(kwTokens(aStr));
  const bt = kwTokens(bStr);
  if (!at.size || !bt.length) return 0;
  return bt.filter(w => at.has(w)).length / Math.max(at.size, bt.length);
}

function signalKey(s) {
  return [s.title, s.description, s.category, s.type, s.tags, s.id].filter(Boolean).join(" ");
}

function scenarioKey(sc) {
  return [sc.name, sc.title, sc.description, sc.tags, sc.type, sc.id].filter(Boolean).join(" ");
}

function contactKey(c) {
  return [c.name, c.role, c.org, c.email, c.tags, c.id].filter(Boolean).join(" ");
}

async function fetchAll() {
  const base = apiBase();
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const [sigRes, scRes, ctRes] = await Promise.all([
    fetch(`${base}/entities/RiskSignal`, { headers }).then(r => r.ok ? r.json() : []),
    fetch(`${base}/v1/scenario/list`,    { headers }).then(r => r.ok ? r.json() : []),
    fetch(`${base}/entities/Contact`,    { headers }).then(r => r.ok ? r.json() : []),
  ]);
  const signals   = norm(sigRes, ["signals","data","items","results"]);
  const scenarios = norm(scRes,  ["scenarios","data","items","results"]);
  const contacts  = norm(ctRes,  ["contacts","data","items","results"]);
  return { signals, scenarios, contacts };
}

function classify(signals, scenarios, contacts) {
  return signals.map(s => {
    const sk = signalKey(s);
    const matchedScenarios = scenarios.filter(sc => overlap(sk, scenarioKey(sc)) > 0.08);
    const matchedContacts  = contacts.filter(c  => overlap(sk, contactKey(c))  > 0.08);
    const hasSC = matchedScenarios.length > 0;
    const hasCT = matchedContacts.length  > 0;
    const cls =
      hasSC && hasCT ? "RESPONSE_READY" :
      hasSC           ? "SCENARIO_ONLY"  :
      hasCT           ? "CONTACT_ONLY"   :
                        "EXPOSED";
    return {
      ...s,
      _class:     cls,
      _scenarios: matchedScenarios.map(sc => ({ ...sc, _rel: overlap(sk, scenarioKey(sc)) })),
      _contacts:  matchedContacts.map(c  => ({ ...c,  _rel: overlap(sk, contactKey(c))  })),
    };
  });
}

export async function buildScrrpScript() {
  const base    = apiBase();
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const { signals, scenarios, contacts } = await fetchAll();
  const rows    = classify(signals, scenarios, contacts);
  const total   = rows.length;
  const ready   = rows.filter(r => r._class === "RESPONSE_READY").length;
  const scOnly  = rows.filter(r => r._class === "SCENARIO_ONLY").length;
  const ctOnly  = rows.filter(r => r._class === "CONTACT_ONLY").length;
  const exposed = rows.filter(r => r._class === "EXPOSED").length;
  const rdPct   = total ? Math.round((ready / total) * 100) : 0;
  const ctx     = `Risk signals: ${total}. Scenarios: ${scenarios.length}. Contacts: ${contacts.length}. ` +
                  `Response-ready: ${ready}. Scenario-only: ${scOnly}. Contact-only: ${ctOnly}. Exposed: ${exposed}. Readiness: ${rdPct}%.`;
  const chat = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ message: `Assess rapid response plan coverage for active risk signals. Context: ${ctx}` }),
  }).then(r => r.ok ? r.json() : null);
  return chat?.response || chat?.message || chat?.content || chat?.reply ||
    `Rapid response readiness is at ${rdPct} percent, sir. ${exposed} risk signals remain fully exposed — no scenario playbook and no contact assigned — requiring immediate ownership assignment.`;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function ScenarioRiskContactResponse() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [counts,    setCounts]    = useState({ total:0, sc:0, ct:0, ready:0, scOnly:0, ctOnly:0, exposed:0 });
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState("");
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const timerRef  = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const { signals, scenarios, contacts } = await fetchAll();
      const classified = classify(signals, scenarios, contacts);
      setRows(classified);
      setCounts({
        total:   classified.length,
        sc:      scenarios.length,
        ct:      contacts.length,
        ready:   classified.filter(r => r._class === "RESPONSE_READY").length,
        scOnly:  classified.filter(r => r._class === "SCENARIO_ONLY").length,
        ctOnly:  classified.filter(r => r._class === "CONTACT_ONLY").length,
        exposed: classified.filter(r => r._class === "EXPOSED").length,
      });
    } catch(e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:scrrp-toggle", handler);
    return () => window.removeEventListener("jarvis:scrrp-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true); setBrief("");
    try {
      const script = await buildScrrpScript();
      setBrief(script);
      const base    = apiBase();
      const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ text: script }),
      }).then(async r => {
        if (!r.ok) return;
        const blob = await r.blob();
        const url  = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play();
        audio.onended = () => URL.revokeObjectURL(url);
      }).catch(() => {});
    } catch(e) {
      setBrief(String(e?.message || e));
    } finally {
      setAssessing(false);
    }
  }, []);

  if (!open) {
    const exposedBadge = counts.exposed > 0;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Rapid Response Plan Coverage (SCRRP)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${exposedBadge ? RD : BORDER}`,
          color: exposedBadge ? RD : CY, fontFamily: FONT, fontSize: 10, padding: "3px 7px",
          borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap",
          animation: exposedBadge ? "scrrp-pulse 1.8s ease-in-out infinite" : "none",
        }}
      >
        ◈ SCRRP{exposedBadge ? ` [${counts.exposed}]` : ""}
        <style>{`@keyframes scrrp-pulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0.4)}50%{box-shadow:0 0 0 4px rgba(239,68,68,0)}}`}</style>
      </button>
    );
  }

  const rdPct = counts.total ? Math.round((counts.ready / counts.total) * 100) : 0;

  const filtered = rows.filter(r => {
    if (tab !== "ALL" && r._class !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.title || r.description || r.id || "").toLowerCase().includes(q);
    }
    return true;
  });

  const tile = (label, value, color) => (
    <div style={{
      background: "rgba(255,255,255,0.04)", border: `1px solid ${color}33`,
      borderRadius: 6, padding: "6px 10px", textAlign: "center", minWidth: 80,
    }}>
      <div style={{ color, fontSize: 16, fontWeight: 700 }}>{value}</div>
      <div style={{ color: "#8892A4", fontSize: 9, marginTop: 2 }}>{label}</div>
    </div>
  );

  return (
    <div style={{
      position: "fixed", bottom: 44, left: BTN_LEFT - 200, zIndex: Z_INDEX,
      width: 640, maxHeight: "72vh", display: "flex", flexDirection: "column",
      background: BG, border: `1px solid ${BORDER}`, borderRadius: 10,
      fontFamily: FONT, fontSize: 11, color: "#C8D6E5", boxShadow: "0 8px 32px #000A",
      overflow: "hidden",
    }}>
      {/* header */}
      <div style={{ padding: "10px 14px 6px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: CY, fontWeight: 700, fontSize: 12 }}>
            ◈ SCRRP — Rapid Response Plan Coverage
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={load} disabled={loading}
              style={{ background: "none", border: `1px solid ${BORDER}`, color: CY,
                fontFamily: FONT, fontSize: 10, padding: "2px 7px", borderRadius: 4, cursor: "pointer" }}>
              {loading ? "…" : "↺"}
            </button>
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: `1px solid ${BORDER}`, color: "#8892A4",
                fontFamily: FONT, fontSize: 10, padding: "2px 7px", borderRadius: 4, cursor: "pointer" }}>
              ✕
            </button>
          </div>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {tile("RISK SIGNALS",    counts.total,   CY)}
          {tile("SCENARIOS",       counts.sc,      "#00CFFF")}
          {tile("CONTACTS",        counts.ct,      OR)}
          {tile("RESPONSE READY",  counts.ready,   GR)}
          {tile("SCENARIO ONLY",   counts.scOnly,  CY)}
          {tile("CONTACT ONLY",    counts.ctOnly,  OR)}
          {tile("EXPOSED",         counts.exposed, RD)}
          {tile("READINESS%",      `${rdPct}%`,    rdPct >= 70 ? GR : rdPct >= 40 ? AM : RD)}
        </div>

        {/* readiness bar */}
        <div style={{ marginTop: 8, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
          <div style={{ height: "100%", width: `${rdPct}%`, background: rdPct >= 70 ? GR : AM, borderRadius: 2, transition: "width 0.4s" }} />
        </div>

        {/* tabs */}
        <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                background: tab === t ? "rgba(0,207,255,0.12)" : "none",
                border: `1px solid ${tab === t ? CY : BORDER}`,
                color: tab === t ? CY : "#8892A4", fontFamily: FONT, fontSize: 9,
                padding: "2px 6px", borderRadius: 3, cursor: "pointer",
              }}>
              {t.replace(/_/g, " ")}
            </button>
          ))}
        </div>

        {/* search */}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search risk signals…"
          style={{
            marginTop: 7, width: "100%", boxSizing: "border-box",
            background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`,
            color: "#C8D6E5", fontFamily: FONT, fontSize: 10, padding: "4px 8px",
            borderRadius: 4, outline: "none",
          }}
        />
      </div>

      {/* list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 10px" }}>
        {err && <div style={{ color: RD, padding: 8 }}>Error: {err}</div>}
        {!err && filtered.length === 0 && !loading && (
          <div style={{ color: "#8892A4", textAlign: "center", padding: 16 }}>No signals match.</div>
        )}
        {filtered.map((row, i) => {
          const isExp    = expanded === i;
          const clsColor = CLASS_COLOR[row._class] || AM;
          const sevColor = row.severity === "CRITICAL" ? RD : row.severity === "HIGH" ? AM : "#8892A4";
          return (
            <div key={row.id || i} style={{
              marginBottom: 5, border: `1px solid ${clsColor}33`,
              borderRadius: 6, overflow: "hidden",
            }}>
              <div
                onClick={() => setExpanded(isExp ? null : i)}
                style={{
                  padding: "6px 10px", cursor: "pointer", display: "flex",
                  justifyContent: "space-between", alignItems: "center",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ color: "#EDF2F7", fontWeight: 600 }}>
                    {row.title || row.name || row.id || "Unknown Signal"}
                  </span>
                  {row.severity && (
                    <span style={{ color: sevColor, fontSize: 9, marginLeft: 6 }}>
                      [{row.severity}]
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                  <span style={{
                    background: `${clsColor}22`, border: `1px solid ${clsColor}55`,
                    color: clsColor, fontSize: 9, padding: "1px 5px", borderRadius: 3,
                  }}>
                    {row._class.replace(/_/g, " ")}
                  </span>
                  <span style={{ color: "#8892A4", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                </div>
              </div>

              {isExp && (
                <div style={{ padding: "8px 10px", background: "rgba(0,0,0,0.2)" }}>
                  {/* Scenarios */}
                  {row._scenarios.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: CY, fontSize: 9, marginBottom: 4 }}>
                        ◆ SCENARIOS ({row._scenarios.length})
                      </div>
                      {row._scenarios.sort((a,b) => b._rel - a._rel).slice(0,5).map((sc,j) => (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ color: "#C8D6E5", fontSize: 10 }}>
                              {sc.name || sc.title || sc.id}
                            </span>
                            <span style={{ color: CY, fontSize: 9 }}>
                              {Math.round(sc._rel * 100)}%
                            </span>
                          </div>
                          <div style={{ height: 2, background: "rgba(255,255,255,0.07)", borderRadius: 1 }}>
                            <div style={{
                              height: "100%", width: `${Math.round(sc._rel * 100)}%`,
                              background: CY, borderRadius: 1,
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Contacts */}
                  {row._contacts.length > 0 && (
                    <div>
                      <div style={{ color: OR, fontSize: 9, marginBottom: 4 }}>
                        ◇ CONTACTS ({row._contacts.length})
                      </div>
                      {row._contacts.sort((a,b) => b._rel - a._rel).slice(0,5).map((c,j) => (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ color: "#C8D6E5", fontSize: 10 }}>
                              {c.name || c.id}
                            </span>
                            <span style={{ color: OR, fontSize: 9 }}>
                              {Math.round(c._rel * 100)}%
                            </span>
                          </div>
                          <div style={{ height: 2, background: "rgba(255,255,255,0.07)", borderRadius: 1 }}>
                            <div style={{
                              height: "100%", width: `${Math.round(c._rel * 100)}%`,
                              background: OR, borderRadius: 1,
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {row._scenarios.length === 0 && row._contacts.length === 0 && (
                    <div style={{ color: RD, fontSize: 10 }}>
                      No scenario or contact match — risk is fully EXPOSED.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{ padding: "8px 10px", borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <button onClick={assess} disabled={assessing}
            style={{
              background: "rgba(0,207,255,0.08)", border: `1px solid ${CY}55`,
              color: CY, fontFamily: FONT, fontSize: 10, padding: "4px 12px",
              borderRadius: 4, cursor: assessing ? "not-allowed" : "pointer", flexShrink: 0,
            }}>
            {assessing ? "ASSESSING…" : "▶ ASSESS RESPONSE PLAN"}
          </button>
          {brief && (
            <div style={{
              color: "#C8D6E5", fontSize: 10, lineHeight: 1.5,
              background: "rgba(0,207,255,0.05)", border: `1px solid ${CY}22`,
              borderRadius: 4, padding: "4px 8px", flex: 1,
            }}>
              {brief}
            </div>
          )}
        </div>
        <div style={{ color: "#4A5568", fontSize: 9, marginTop: 6 }}>
          Auto-refresh 90 s · /v1/scenario/list × /entities/RiskSignal × /entities/Contact
        </div>
      </div>
    </div>
  );
}
