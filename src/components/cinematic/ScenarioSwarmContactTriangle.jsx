/**
 * F105 — Scenario × SwarmJob × Contact
 *         Execution Triangle (SSCEXE)
 *
 * Parallel-fetches /v1/scenario/list + /entities/SwarmJob + /entities/Contact.
 * Keyword-correlates each scenario against swarm jobs AND contacts to classify:
 *   FULLY_EXECUTABLE  (swarm + contact match)
 *   SWARM_DEPLOYED    (swarm only)
 *   CONTACT_READY     (contact only)
 *   INCOMPLETE        (no operational match — execution gap)
 *
 * Amber badge on INCOMPLETE count.
 * Stat tiles SCENARIOS / SWARM JOBS / CONTACTS + all four class counts + EXEC%.
 * Filter tabs ALL/FULLY_EXECUTABLE/SWARM_DEPLOYED/CONTACT_READY/INCOMPLETE + text search.
 * Expand scenario → matched swarm job cards (cyan) + contact cards (orange)
 *   with relevance bars.
 * ▶ ASSESS EXECUTION → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Voice trigger: "sscexe/scenario execution/swarm contact/incomplete scenario/
 *   execution triangle/execution readiness triangle".
 * Event: jarvis:sscexe-toggle | 90-s auto-refresh.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_001_720;
const Z_INDEX  = 167;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const SSCEXE_RE = /\b(sscexe|scenario[\s-]execution|swarm[\s-]contact|incomplete[\s-]scenario|execution[\s-]triangle|execution[\s-]readiness[\s-]triangle|scenario[\s-]swarm[\s-]contact|scenario[\s-]deployment)\b/i;

const CY    = "#00CFFF";
const OR    = "#F97316";
const GR    = "#22C55E";
const AM    = "#F59E0B";
const RD    = "#EF4444";
const BG    = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT  = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_EXECUTABLE: GR,
  SWARM_DEPLOYED:   CY,
  CONTACT_READY:    OR,
  INCOMPLETE:       AM,
};

const TABS = ["ALL","FULLY_EXECUTABLE","SWARM_DEPLOYED","CONTACT_READY","INCOMPLETE"];

// ── exports for JarvisBrain ───────────────────────────────────────────────────

export function isSscexeQuery(text) {
  return SSCEXE_RE.test(text || "");
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

function scenarioKey(s) {
  return [s.name, s.title, s.description, s.id].filter(Boolean).join(" ");
}

function swarmKey(j) {
  return [j.name, j.description, j.type, j.status, j.id].filter(Boolean).join(" ");
}

function contactKey(c) {
  return [c.name, c.role, c.org, c.email, (c.tags || []).join(" ")].filter(Boolean).join(" ");
}

function classify(scenario, swarmJobs, contacts) {
  const sk = scenarioKey(scenario);
  const matchedSwarms   = swarmJobs.map(j  => ({ ...j,  _rel: overlap(sk, swarmKey(j))   })).filter(m => m._rel > 0);
  const matchedContacts = contacts.map(c   => ({ ...c,  _rel: overlap(sk, contactKey(c)) })).filter(m => m._rel > 0);
  const hasSwarm    = matchedSwarms.length   > 0;
  const hasContact  = matchedContacts.length > 0;
  let cls;
  if      (hasSwarm && hasContact) cls = "FULLY_EXECUTABLE";
  else if (hasSwarm)               cls = "SWARM_DEPLOYED";
  else if (hasContact)             cls = "CONTACT_READY";
  else                             cls = "INCOMPLETE";
  return { ...scenario, _class: cls, _swarms: matchedSwarms, _contacts: matchedContacts };
}

async function fetchAll() {
  const hdrs = { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" };
  const base = apiBase();
  const [scRaw, sjRaw, coRaw] = await Promise.all([
    fetch(`${base}/v1/scenario/list`, { headers: hdrs }).then(r => r.json()).catch(() => ({})),
    fetch(`${base}/entities/SwarmJob`, { headers: hdrs }).then(r => r.json()).catch(() => ({})),
    fetch(`${base}/entities/Contact`,  { headers: hdrs }).then(r => r.json()).catch(() => ({})),
  ]);
  const scenarios = norm(scRaw, ["scenarios","data","items","results"]);
  const swarmJobs = norm(sjRaw, ["swarm_jobs","swarmJobs","data","items","results"]);
  const contacts  = norm(coRaw, ["contacts","data","items","results"]);
  return { scenarios, swarmJobs, contacts };
}

export async function buildSscexeScript() {
  try {
    const { scenarios, swarmJobs, contacts } = await fetchAll();
    const classified = scenarios.map(s => classify(s, swarmJobs, contacts));
    const total         = classified.length;
    const fullyEx       = classified.filter(s => s._class === "FULLY_EXECUTABLE").length;
    const swarmDeployed = classified.filter(s => s._class === "SWARM_DEPLOYED").length;
    const contactReady  = classified.filter(s => s._class === "CONTACT_READY").length;
    const incomplete    = classified.filter(s => s._class === "INCOMPLETE").length;
    const execPct       = total ? Math.round(fullyEx / total * 100) : 0;
    return `SSCEXE Execution Triangle online, sir. Cross-referencing ${total} scenario${total !== 1 ? "s" : ""} against ${swarmJobs.length} swarm jobs and ${contacts.length} contacts. ${fullyEx} are fully executable with both swarm automation and contact assignment. ${swarmDeployed} are swarm-deployed only, ${contactReady} are contact-ready only, and ${incomplete} remain incomplete with no operational resource assigned — execution coverage stands at ${execPct}%.`;
  } catch {
    return "SSCEXE Execution Triangle online, sir. Cross-referencing scenarios against swarm jobs and contacts to surface execution gaps now.";
  }
}

// ── component ─────────────────────────────────────────────────────────────────

export default function ScenarioSwarmContactTriangle() {
  const [open,     setOpen]     = useState(false);
  const [rows,     setRows]     = useState([]);
  const [swarmCnt, setSwarmCnt] = useState(0);
  const [contCnt,  setContCnt]  = useState(0);
  const [loading,  setLoading]  = useState(false);
  const [tab,      setTab]      = useState("ALL");
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [brief,    setBrief]    = useState("");
  const [assessing,setAssessing]= useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { scenarios, swarmJobs, contacts } = await fetchAll();
      setSwarmCnt(swarmJobs.length);
      setContCnt(contacts.length);
      setRows(scenarios.map(s => classify(s, swarmJobs, contacts)));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener("jarvis:sscexe-toggle", h);
    return () => window.removeEventListener("jarvis:sscexe-toggle", h);
  }, []);

  const fullyEx       = rows.filter(r => r._class === "FULLY_EXECUTABLE").length;
  const swarmDeployed = rows.filter(r => r._class === "SWARM_DEPLOYED").length;
  const contactReady  = rows.filter(r => r._class === "CONTACT_READY").length;
  const incomplete    = rows.filter(r => r._class === "INCOMPLETE").length;
  const total         = rows.length;
  const execPct       = total ? Math.round(fullyEx / total * 100) : 0;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r._class !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.name || r.title || r.description || r.id || "").toLowerCase().includes(q);
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    try {
      const ctx = `SSCEXE: ${total} scenarios — ${fullyEx} FULLY_EXECUTABLE, ${swarmDeployed} SWARM_DEPLOYED, ${contactReady} CONTACT_READY, ${incomplete} INCOMPLETE. Swarm jobs: ${swarmCnt}. Contacts: ${contCnt}. Exec coverage: ${execPct}%.`;
      const base = apiBase();
      const hdrs = { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" };
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers: hdrs,
        body: JSON.stringify({ message: `In 2 sentences, assess this JARVIS Scenario-Swarm-Contact Execution Triangle: ${ctx} Identify the most critical execution gap and recommend immediate action.` }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.content || "";
      setBrief(text);
      if (text) {
        await fetch(`${base}/v1/voice/tts`, {
          method: "POST", headers: hdrs,
          body: JSON.stringify({ text, voice: "ash" }),
        }).then(async tr => {
          if (tr.ok) {
            const blob = await tr.blob();
            const url  = URL.createObjectURL(blob);
            new Audio(url).play();
          }
        }).catch(() => {});
      }
    } catch {}
    setAssessing(false);
  }

  const btnStyle = {
    position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
    background: incomplete > 0 ? "rgba(245,158,11,0.18)" : "rgba(0,207,255,0.12)",
    border: `1px solid ${incomplete > 0 ? AM : CY}55`,
    color: incomplete > 0 ? AM : CY,
    borderRadius: 6, padding: "3px 9px", fontSize: 10, fontFamily: FONT,
    cursor: "pointer", letterSpacing: 1, userSelect: "none",
    boxShadow: open ? `0 0 10px ${AM}55` : "none",
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(v => !v)}>
        ◈ SSCEXE
        {incomplete > 0 && (
          <span style={{
            marginLeft: 5, background: AM, color: "#000",
            borderRadius: 4, padding: "1px 5px", fontSize: 9, fontWeight: 700,
          }}>{incomplete}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 36, left: BTN_LEFT - 200, zIndex: Z_INDEX + 1,
          width: 560, maxHeight: "78vh",
          background: BG, border: `1px solid ${BORDER}`,
          borderRadius: 12, fontFamily: FONT, color: "#C8DFF0",
          display: "flex", flexDirection: "column",
          boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
          overflow: "hidden",
        }}>
          {/* header */}
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: CY, fontWeight: 700, letterSpacing: 1, fontSize: 11 }}>◈ SSCEXE</span>
            <span style={{ fontSize: 10, color: "#6E8AA0", flex: 1 }}>Scenario × Swarm × Contact Execution Triangle</span>
            <button onClick={assess} disabled={assessing} style={{
              background: "rgba(0,207,255,0.1)", border: `1px solid ${CY}44`, color: CY,
              borderRadius: 4, padding: "2px 8px", fontSize: 9, cursor: "pointer",
            }}>
              {assessing ? "ASSESSING…" : "▶ ASSESS EXECUTION"}
            </button>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 14, lineHeight: 1,
            }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 6, padding: "8px 14px", flexWrap: "wrap" }}>
            {[
              ["SCENARIOS",   total,         CY],
              ["SWARM JOBS",  swarmCnt,       CY],
              ["CONTACTS",    contCnt,        OR],
              ["FULLY EXEC.", fullyEx,        GR],
              ["SWARM ONLY",  swarmDeployed,  CY],
              ["CONTACT ONLY",contactReady,   OR],
              ["INCOMPLETE",  incomplete,     AM],
              ["EXEC %",      `${execPct}%`,  execPct > 60 ? GR : AM],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: "rgba(0,0,0,0.3)", border: `1px solid ${col}33`,
                borderRadius: 6, padding: "4px 8px", minWidth: 70, textAlign: "center",
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: col }}>{val}</div>
                <div style={{ fontSize: 8, color: "#6E8AA0", marginTop: 1, letterSpacing: 0.5 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* coverage bar */}
          <div style={{ padding: "0 14px 8px", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${execPct}%`, background: execPct > 60 ? GR : AM, borderRadius: 2, transition: "width 0.6s" }} />
            </div>
            <span style={{ fontSize: 9, color: "#6E8AA0" }}>execution coverage</span>
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "0 14px 8px", flexWrap: "wrap" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => { setTab(t); setExpanded(null); }} style={{
                background: tab === t ? `${CLASS_COLOR[t] || CY}22` : "rgba(0,0,0,0.3)",
                border: `1px solid ${tab === t ? (CLASS_COLOR[t] || CY) : "rgba(255,255,255,0.08)"}`,
                color: tab === t ? (CLASS_COLOR[t] || CY) : "#6E8AA0",
                borderRadius: 4, padding: "2px 7px", fontSize: 9, cursor: "pointer", letterSpacing: 0.5,
              }}>{t}</button>
            ))}
            <input
              value={search} onChange={e => { setSearch(e.target.value); setExpanded(null); }}
              placeholder="search scenarios…"
              style={{
                marginLeft: "auto", background: "rgba(0,0,0,0.4)", border: `1px solid ${BORDER}`,
                color: "#C8DFF0", borderRadius: 4, padding: "2px 8px", fontSize: 9, fontFamily: FONT, width: 140,
              }}
            />
          </div>

          {/* brief */}
          {brief && (
            <div style={{ margin: "0 14px 8px", padding: "8px 10px", background: "rgba(0,207,255,0.06)", borderRadius: 6, fontSize: 11, lineHeight: 1.5, color: "#C8DFF0" }}>
              {brief}
            </div>
          )}

          {/* list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "8px 12px" }}>
            {loading && <div style={{ color: "#6E8AA0", fontSize: 11, padding: 8 }}>loading…</div>}
            {!loading && visible.length === 0 && (
              <div style={{ color: "#6E8AA0", fontSize: 11, padding: 8 }}>No scenarios match the current filter.</div>
            )}
            {visible.map((scenario, i) => {
              const col   = CLASS_COLOR[scenario._class] || AM;
              const isExp = expanded === i;
              return (
                <div key={scenario.id || i} style={{
                  marginBottom: 6, border: `1px solid ${col}33`, borderRadius: 8,
                  background: scenario._class === "INCOMPLETE" ? "rgba(245,158,11,0.05)" : "rgba(0,0,0,0.25)",
                }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <span style={{ color: col, fontSize: 10, fontWeight: 700, minWidth: 90 }}>{scenario._class}</span>
                    <span style={{ fontWeight: 600, fontSize: 12, flex: 1 }}>{scenario.name || scenario.title || scenario.id || "Unknown Scenario"}</span>
                    <span style={{ fontSize: 10, color: CY, marginLeft: "auto" }}>
                      {scenario._swarms.length}S · {scenario._contacts.length}C
                    </span>
                    <span style={{ color: "#6E8AA0", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                  </div>
                  {isExp && (
                    <div style={{ padding: "0 12px 10px" }}>
                      {/* swarm jobs */}
                      {scenario._swarms.length > 0 && (
                        <>
                          <div style={{ fontSize: 10, color: CY, marginBottom: 4, letterSpacing: 1 }}>SWARM DEPLOYMENTS</div>
                          {scenario._swarms.map((j, ji) => (
                            <div key={ji} style={{
                              marginBottom: 4, padding: "6px 10px",
                              background: "rgba(0,207,255,0.06)", border: `1px solid ${CY}33`, borderRadius: 6,
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                <span style={{ fontSize: 11, fontWeight: 600 }}>{j.name || j.id || "SwarmJob"}</span>
                                {j.status && <span style={{ fontSize: 10, color: "#6E8AA0" }}>{j.status}</span>}
                                {j.type   && <span style={{ fontSize: 10, color: "#6E8AA0" }}>· {j.type}</span>}
                              </div>
                              <div style={{ height: 3, background: "rgba(0,207,255,0.2)", borderRadius: 2, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${Math.min(100, Math.round(j._rel * 100 * 4))}%`, background: CY, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                      {/* contacts */}
                      {scenario._contacts.length > 0 && (
                        <>
                          <div style={{ fontSize: 10, color: OR, marginBottom: 4, marginTop: 6, letterSpacing: 1 }}>ASSIGNED CONTACTS</div>
                          {scenario._contacts.map((c, ci) => (
                            <div key={ci} style={{
                              marginBottom: 4, padding: "6px 10px",
                              background: "rgba(249,115,22,0.06)", border: `1px solid ${OR}33`, borderRadius: 6,
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                <span style={{ fontSize: 11, fontWeight: 600 }}>{c.name || c.id || "Contact"}</span>
                                {c.role && <span style={{ fontSize: 10, color: "#6E8AA0" }}>{c.role}</span>}
                                {c.org  && <span style={{ fontSize: 10, color: "#6E8AA0" }}>· {c.org}</span>}
                              </div>
                              <div style={{ height: 3, background: "rgba(249,115,22,0.2)", borderRadius: 2, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${Math.min(100, Math.round(c._rel * 100 * 4))}%`, background: OR, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                      {scenario._swarms.length === 0 && scenario._contacts.length === 0 && (
                        <div style={{ color: AM, fontSize: 11, padding: "4px 0" }}>
                          ⚠ No swarm deployments or contact assignments found for this scenario.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes sscexe-pulse {
          0%,100% { opacity:1; transform:scale(1); }
          50% { opacity:0.6; transform:scale(1.15); }
        }
      `}</style>
    </>
  );
}
