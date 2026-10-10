/**
 * F161 — Ops Events × Contact × Task Command Responsibility Map (OTCCM)
 *
 * Answers: "For each live operational event — which ones have both an assigned
 *           contact AND a running task (fully accountable), which have only one,
 *           and which are completely unresponded with no task or owner?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /v1/ops/events        → live operational events (name/description/type/status)
 *   GET /entities/Contact     → personnel directory  (name/role/org/email/tags)
 *   GET /entities/Task        → running missions      (name/description/status/priority)
 *
 * Classification per ops event (keyword correlation):
 *   FULLY_ACCOUNTABLE — contact + task (both matched)
 *   TASKED_ONLY       — task matched, no contact
 *   CONTACT_ASSIGNED  — contact matched, no task
 *   UNRESPONDED       — neither matched (accountability gap)
 *
 * Stat tiles: OPS EVENTS / CONTACTS / TASKS + four class counts + ACCOUNTABLE%
 * Red badge on UNRESPONDED count.
 * Accountability coverage bar.
 * ▶ ASSESS COVERAGE: 2-sentence AI brief via /v1/jarvis/agent/chat + TTS.
 *
 * Toggle:  ◈ OTCCM  at left:1032520, bottom:8, zIndex:222.
 * Event:   jarvis:otccm-toggle
 * Voice:   "otccm / ops contact task / unresponded events / command responsibility /
 *           ops accountability / event accountability"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const RED   = "#FF3B6B";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const TEAL  = "#00CFB4";
const ORANGE = "#F5820A";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 1032520;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const OTCCM_RE =
  /\b(otccm|ops contact task|unresponded events?|command responsibility|ops accountability|event accountability)\b/i;

// ─── helpers ─────────────────────────────────────────────────────────────────

function normArr(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    for (const k of [
      "items","results","data","records","events","contacts","tasks",
      "entries","list","ops",
    ]) {
      if (Array.isArray(raw[k])) return raw[k];
    }
    const vals = Object.values(raw);
    if (vals.length === 1 && Array.isArray(vals[0])) return vals[0];
  }
  return [];
}

function words(obj) {
  return Object.values(obj || {})
    .filter(v => typeof v === "string")
    .join(" ")
    .toLowerCase()
    .split(/\W+/)
    .filter(w => w.length > 3);
}

function overlap(a, b) {
  const wa = new Set(words(a));
  const wb = words(b);
  return wb.filter(w => wa.has(w)).length;
}

function classify(event, contacts, tasks) {
  const thr = 1;
  const matchedContacts = contacts
    .map(c => ({ item: c, score: overlap(event, c) }))
    .filter(x => x.score >= thr)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const matchedTasks = tasks
    .map(t => ({ item: t, score: overlap(event, t) }))
    .filter(x => x.score >= thr)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const hasContact = matchedContacts.length > 0;
  const hasTask    = matchedTasks.length > 0;
  let cls;
  if (hasContact && hasTask)       cls = "FULLY_ACCOUNTABLE";
  else if (hasTask && !hasContact) cls = "TASKED_ONLY";
  else if (hasContact && !hasTask) cls = "CONTACT_ASSIGNED";
  else                             cls = "UNRESPONDED";

  return { ...event, cls, matchedContacts, matchedTasks };
}

// ─── exported voice helpers ───────────────────────────────────────────────────

export function isOtccmQuery(q) {
  return OTCCM_RE.test(q || "");
}

export async function buildOtccmScript() {
  const base = apiBase();
  const hdr  = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
  const [evR, coR, tkR] = await Promise.all([
    fetch(`${base}/v1/ops/events`,    { headers: hdr }),
    fetch(`${base}/entities/Contact`, { headers: hdr }),
    fetch(`${base}/entities/Task`,    { headers: hdr }),
  ]);
  const [evD, coD, tkD] = await Promise.all([evR.json(), coR.json(), tkR.json()]);
  const events   = normArr(evD);
  const contacts = normArr(coD);
  const tasks    = normArr(tkD);
  const classified = events.map(ev => classify(ev, contacts, tasks));
  const unresponded = classified.filter(x => x.cls === "UNRESPONDED").length;
  const accountable = classified.filter(x => x.cls === "FULLY_ACCOUNTABLE").length;
  const pct = events.length ? Math.round((accountable / events.length) * 100) : 0;
  const prompt = `We have ${events.length} operational events, ${contacts.length} contacts, ${tasks.length} tasks. ` +
    `${accountable} events are fully accountable (contact + task), ${unresponded} are completely unresponded (no owner, no task). ` +
    `Accountability coverage: ${pct}%. In 2 sentences: prioritise which unresponded events need immediate assignment and why.`;
  const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST", headers: hdr,
    body: JSON.stringify({ message: prompt }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
    `OTCCM online. ${unresponded} operational events are unresponded — no assigned contact and no active task. Accountability coverage is ${pct}%.`;
}

// ─── component ────────────────────────────────────────────────────────────────

export default function OpsContactTaskMap() {
  const [open, setOpen]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [events, setEvents]       = useState([]);
  const [contactCount, setContactCount] = useState(0);
  const [taskCount, setTaskCount] = useState(0);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]         = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
      const [evR, coR, tkR] = await Promise.all([
        fetch(`${base}/v1/ops/events`,    { headers: hdr }),
        fetch(`${base}/entities/Contact`, { headers: hdr }),
        fetch(`${base}/entities/Task`,    { headers: hdr }),
      ]);
      const [evD, coD, tkD] = await Promise.all([evR.json(), coR.json(), tkR.json()]);
      const rawEvents   = normArr(evD);
      const rawContacts = normArr(coD);
      const rawTasks    = normArr(tkD);
      setContactCount(rawContacts.length);
      setTaskCount(rawTasks.length);
      setEvents(rawEvents.map(ev => classify(ev, rawContacts, rawTasks)));
    } catch {
      // keep previous state on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(prev => !prev);
    window.addEventListener("jarvis:otccm-toggle", handler);
    return () => window.removeEventListener("jarvis:otccm-toggle", handler);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    try {
      const script = await buildOtccmScript();
      setBrief(script);
      window.dispatchEvent(new CustomEvent("jarvis:speak", { detail: script }));
    } catch {
      setBrief("Unable to assess command responsibility at this time.");
    } finally {
      setAssessing(false);
    }
  }, []);

  const TABS = ["ALL", "FULLY_ACCOUNTABLE", "TASKED_ONLY", "CONTACT_ASSIGNED", "UNRESPONDED"];

  const filtered = events.filter(ev => {
    if (tab !== "ALL" && ev.cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return Object.values(ev).some(v => typeof v === "string" && v.toLowerCase().includes(q));
    }
    return true;
  });

  const counts = {
    FULLY_ACCOUNTABLE: events.filter(x => x.cls === "FULLY_ACCOUNTABLE").length,
    TASKED_ONLY:       events.filter(x => x.cls === "TASKED_ONLY").length,
    CONTACT_ASSIGNED:  events.filter(x => x.cls === "CONTACT_ASSIGNED").length,
    UNRESPONDED:       events.filter(x => x.cls === "UNRESPONDED").length,
  };
  const unrespondedCount = counts.UNRESPONDED;
  const accountablePct = events.length
    ? Math.round((counts.FULLY_ACCOUNTABLE / events.length) * 100)
    : 0;

  const clsColor = {
    FULLY_ACCOUNTABLE: GREEN,
    TASKED_ONLY:       TEAL,
    CONTACT_ASSIGNED:  ORANGE,
    UNRESPONDED:       RED,
  };
  const clsLabel = {
    FULLY_ACCOUNTABLE: "FULLY ACCOUNTABLE",
    TASKED_ONLY:       "TASKED ONLY",
    CONTACT_ASSIGNED:  "CONTACT ASSIGNED",
    UNRESPONDED:       "UNRESPONDED",
  };

  return (
    <>
      {/* toggle button */}
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 222,
          background: open ? `${RED}22` : "rgba(4,7,14,0.85)",
          border: `1px solid ${open ? RED : CY}44`,
          color: open ? RED : CY,
          fontFamily: MONO, fontSize: 9, letterSpacing: 1,
          padding: "4px 9px", borderRadius: 5, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ◈ OTCCM
        {unrespondedCount > 0 && (
          <span style={{
            marginLeft: 5, background: RED, color: "#fff",
            borderRadius: "50%", padding: "0 4px", fontSize: 8,
          }}>
            {unrespondedCount}
          </span>
        )}
      </button>

      {/* panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 44, left: BTN_LEFT - 560, zIndex: 9222,
          width: 620, maxHeight: "72vh",
          background: BG,
          border: `1px solid ${CY}33`,
          borderRadius: 10, padding: "16px 18px",
          fontFamily: MONO, color: "#C8DCE8",
          overflowY: "auto",
          boxShadow: `0 0 32px ${CY}18`,
        }}>
          {/* header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>◈ OTCCM</span>
              <span style={{ color: MUTED, fontSize: 10, marginLeft: 10 }}>
                Ops Events × Contact × Task Command Responsibility Map
              </span>
            </div>
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            {[
              { label: "OPS EVENTS", val: events.length, col: CY },
              { label: "CONTACTS",   val: contactCount,  col: ORANGE },
              { label: "TASKS",      val: taskCount,     col: TEAL },
              { label: "ACCOUNTABLE", val: counts.FULLY_ACCOUNTABLE, col: GREEN },
              { label: "TASKED ONLY", val: counts.TASKED_ONLY,      col: TEAL },
              { label: "CONTACT ONLY", val: counts.CONTACT_ASSIGNED, col: ORANGE },
              { label: "UNRESPONDED", val: counts.UNRESPONDED,       col: RED },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                background: "#080E18", border: `1px solid ${col}33`,
                borderRadius: 6, padding: "6px 10px", textAlign: "center", minWidth: 80,
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: MUTED, fontSize: 8, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* accountability coverage bar */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontSize: 9, color: MUTED, letterSpacing: 1 }}>ACCOUNTABILITY COVERAGE</span>
              <span style={{ fontSize: 10, color: accountablePct >= 60 ? GREEN : RED }}>{accountablePct}%</span>
            </div>
            <div style={{ height: 4, background: "#0A1828", borderRadius: 2 }}>
              <div style={{
                width: `${accountablePct}%`, height: "100%",
                background: accountablePct >= 60 ? GREEN : RED,
                borderRadius: 2,
              }} />
            </div>
          </div>

          {/* search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="search events…"
            style={{
              width: "100%", boxSizing: "border-box",
              background: "#080E18", border: `1px solid ${CY}22`,
              color: "#C8DCE8", fontFamily: MONO, fontSize: 10,
              padding: "5px 8px", borderRadius: 5, marginBottom: 8,
              outline: "none",
            }}
          />

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "transparent",
                  border: `1px solid ${tab === t ? CY : CY + "44"}`,
                  color: tab === t ? CY : MUTED,
                  fontFamily: MONO, fontSize: 8, letterSpacing: 1,
                  padding: "3px 8px", borderRadius: 4, cursor: "pointer",
                }}>
                {t === "ALL" ? "ALL" : clsLabel[t]}
                {t !== "ALL" && ` (${counts[t]})`}
              </button>
            ))}
          </div>

          {loading && (
            <div style={{ color: MUTED, fontSize: 10, textAlign: "center", padding: 16 }}>
              loading…
            </div>
          )}

          {/* event list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {filtered.map((ev, idx) => {
              const color = clsColor[ev.cls];
              const isExp = expanded === idx;
              const label = ev.name || ev.title || ev.type || ev.id || `Event ${idx + 1}`;
              const desc  = ev.description || ev.summary || ev.details || "";
              return (
                <div key={idx} style={{
                  background: "#080E18",
                  border: `1px solid ${color}33`,
                  borderRadius: 7, padding: "9px 12px",
                  cursor: "pointer",
                  animation: ev.cls === "UNRESPONDED" ? "otccm-pulse 2s infinite" : "none",
                }} onClick={() => setExpanded(isExp ? null : idx)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "#DCE8F0", fontSize: 11 }}>{label}</span>
                    <span style={{
                      color: color, fontSize: 8, letterSpacing: 1,
                      background: `${color}18`, border: `1px solid ${color}44`,
                      padding: "2px 6px", borderRadius: 3,
                    }}>{clsLabel[ev.cls]}</span>
                  </div>
                  {desc && (
                    <div style={{ color: MUTED, fontSize: 10, marginTop: 4, lineHeight: 1.4 }}>
                      {desc.slice(0, 90)}{desc.length > 90 ? "…" : ""}
                    </div>
                  )}

                  {/* expanded detail */}
                  {isExp && (
                    <div style={{ marginTop: 10 }}>
                      {ev.matchedContacts.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ color: ORANGE, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            ◆ CONTACTS ({ev.matchedContacts.length})
                          </div>
                          {ev.matchedContacts.map(({ item, score }, ci) => {
                            const name = item.name || item.full_name || item.id || `Contact ${ci + 1}`;
                            const role = item.role || item.title || "";
                            const pct  = Math.min(100, score * 20);
                            return (
                              <div key={ci} style={{
                                background: "#050A12",
                                border: `1px solid ${ORANGE}22`,
                                borderRadius: 5, padding: "5px 8px", marginBottom: 4,
                              }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <span style={{ color: ORANGE, fontSize: 10 }}>{name}</span>
                                  {role && <span style={{
                                    color: MUTED, fontSize: 8,
                                    background: `${ORANGE}18`, padding: "1px 5px", borderRadius: 3,
                                  }}>{role}</span>}
                                </div>
                                <div style={{ height: 2, background: "#0A1828", borderRadius: 1, marginTop: 4 }}>
                                  <div style={{ width: `${pct}%`, height: "100%", background: ORANGE, borderRadius: 1 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {ev.matchedTasks.length > 0 && (
                        <div>
                          <div style={{ color: TEAL, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            ◆ TASKS ({ev.matchedTasks.length})
                          </div>
                          {ev.matchedTasks.map(({ item, score }, ti) => {
                            const name   = item.name || item.title || item.id || `Task ${ti + 1}`;
                            const status = item.status || "";
                            const pct    = Math.min(100, score * 20);
                            return (
                              <div key={ti} style={{
                                background: "#050A12",
                                border: `1px solid ${TEAL}22`,
                                borderRadius: 5, padding: "5px 8px", marginBottom: 4,
                              }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <span style={{ color: TEAL, fontSize: 10 }}>{name}</span>
                                  {status && <span style={{
                                    color: MUTED, fontSize: 8,
                                    background: `${TEAL}18`, padding: "1px 5px", borderRadius: 3,
                                  }}>{status}</span>}
                                </div>
                                <div style={{ height: 2, background: "#0A1828", borderRadius: 1, marginTop: 4 }}>
                                  <div style={{ width: `${pct}%`, height: "100%", background: TEAL, borderRadius: 1 }} />
                                </div>
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
          </div>

          {filtered.length === 0 && !loading && (
            <div style={{ color: MUTED, fontSize: 11, textAlign: "center", padding: 24 }}>
              No events match current filter.
            </div>
          )}

          {/* assess button + brief */}
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={assess} disabled={assessing}
              style={{
                background: assessing ? "#0A1A28" : `${RED}22`,
                border: `1px solid ${RED}66`, color: RED,
                fontFamily: MONO, fontSize: 10, letterSpacing: 1,
                padding: "5px 14px", borderRadius: 5, cursor: assessing ? "default" : "pointer",
              }}>
              {assessing ? "assessing…" : "▶ ASSESS COVERAGE"}
            </button>
            {brief && (
              <div style={{
                flex: 1, fontSize: 11, color: "#DCEBF5", lineHeight: 1.5,
                background: "#080E18", border: `1px solid ${CY}22`,
                borderRadius: 5, padding: "6px 10px",
              }}>{brief}</div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes otccm-pulse {
          0%,100% { opacity:1; box-shadow:0 0 0 ${RED}; }
          50%      { opacity:0.6; box-shadow:0 0 8px ${RED}; }
        }
      `}</style>
    </>
  );
}
