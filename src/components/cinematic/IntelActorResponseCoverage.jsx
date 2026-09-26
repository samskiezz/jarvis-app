/**
 * F104 — IntelProfile × Contact × Task
 *         Actor Response Coverage (ICTARC)
 *
 * Parallel-fetches /entities/IntelProfile + /entities/Contact + /entities/Task.
 * Keyword-correlates each threat actor profile against contacts AND tasks to classify:
 *   FULLY_RESPONDED   (contact + task match)
 *   CONTACT_ENGAGED   (contact only)
 *   TASK_ACTIVE       (task only)
 *   UNRESPONDED       (no operational match — response gap)
 *
 * Red pulse badge on UNRESPONDED count (highest-priority attention items).
 * Stat tiles ACTORS / CONTACTS / TASKS + all four class counts + RESPONSE%.
 * Filter tabs ALL/FULLY_RESPONDED/CONTACT_ENGAGED/TASK_ACTIVE/UNRESPONDED + text search.
 * Expand actor → matched contact cards (orange) + matched task cards (teal)
 *   with relevance bars.
 * ▶ ASSESS RESPONSE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Voice trigger: "ictarc/actor response/intel response/threat actor contact/
 *   unresponded actors/actor coverage/threat response coverage".
 * Event: jarvis:ictarc-toggle | 90-s auto-refresh.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_001_160;
const Z_INDEX  = 166;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const ICTARC_RE = /\b(ictarc|actor[\s-]response|intel[\s-]response|threat[\s-]actor[\s-]contact|unresponded[\s-]actor|actor[\s-]coverage|threat[\s-]response[\s-]coverage|actor[\s-]engagement|response[\s-]coverage)\b/i;

const CY    = "#00CFFF";
const OR    = "#F97316";
const TL    = "#14B8A6";
const AM    = "#F59E0B";
const RD    = "#EF4444";
const GR    = "#22C55E";
const BG    = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT  = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_RESPONDED:  GR,
  CONTACT_ENGAGED:  OR,
  TASK_ACTIVE:      TL,
  UNRESPONDED:      RD,
};

const TABS = ["ALL","FULLY_RESPONDED","CONTACT_ENGAGED","TASK_ACTIVE","UNRESPONDED"];

// ── exports for JarvisBrain ───────────────────────────────────────────────────

export function isIctarcQuery(text) {
  return ICTARC_RE.test(text || "");
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

function actorKey(a) {
  return [a.name, a.aliases, a.org, a.role, a.tags].join(" ");
}

function contactKey(c) {
  return [c.name, c.role, c.org, c.email, c.tags].join(" ");
}

function taskKey(t) {
  return [t.name, t.title, t.description, t.type, t.status, t.tags].join(" ");
}

function classify(contactMatches, taskMatches) {
  const hasC = contactMatches.length > 0;
  const hasT = taskMatches.length > 0;
  if (hasC && hasT) return "FULLY_RESPONDED";
  if (hasC) return "CONTACT_ENGAGED";
  if (hasT) return "TASK_ACTIVE";
  return "UNRESPONDED";
}

// ── build script for JarvisBrain voice handler ───────────────────────────────

export async function buildIctarcScript() {
  const base = apiBase();
  const h = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };

  const [apRaw, cRaw, tRaw] = await Promise.all([
    fetch(`${base}/entities/IntelProfile`, { headers: h }).then(r => r.json()).catch(() => []),
    fetch(`${base}/entities/Contact`,      { headers: h }).then(r => r.json()).catch(() => []),
    fetch(`${base}/entities/Task`,         { headers: h }).then(r => r.json()).catch(() => []),
  ]);

  const actors   = norm(apRaw, ["items","data","results","profiles"]);
  const contacts = norm(cRaw,  ["items","data","results","contacts"]);
  const tasks    = norm(tRaw,  ["items","data","results","tasks"]);

  let unresponded = 0;
  let fullyResponded = 0;
  for (const actor of actors) {
    const ak = actorKey(actor);
    const cm = contacts.filter(c => overlap(ak, contactKey(c)) > 0.06);
    const tm = tasks.filter(t => overlap(ak, taskKey(t)) > 0.06);
    const cls = classify(cm, tm);
    if (cls === "UNRESPONDED") unresponded++;
    if (cls === "FULLY_RESPONDED") fullyResponded++;
  }

  const pct = actors.length ? Math.round((fullyResponded / actors.length) * 100) : 0;
  const context = `JARVIS ICTARC analysis: ${actors.length} threat actor profiles cross-referenced against ${contacts.length} contacts and ${tasks.length} tasks. ${fullyResponded} fully responded, ${unresponded} unresponded. Response coverage: ${pct}%.`;

  const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ message: `${context} Provide a 2-sentence actor response coverage brief. Focus on unresponded threat actors.` }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
    `Actor Response Coverage ICTARC online, sir. ${unresponded} of ${actors.length} threat actors have no assigned contact or active task — recommend immediate response assignment for unresponded actors.`;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function IntelActorResponseCoverage() {
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows]       = useState([]);
  const [stats, setStats]     = useState({ actors: 0, contacts: 0, tasks: 0, fully: 0, contact: 0, task: 0, unresponded: 0 });
  const [tab, setTab]         = useState("ALL");
  const [search, setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]     = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const h = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };

      const [apRaw, cRaw, tRaw] = await Promise.all([
        fetch(`${base}/entities/IntelProfile`, { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/entities/Contact`,      { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/entities/Task`,         { headers: h }).then(r => r.json()).catch(() => []),
      ]);

      const actors   = norm(apRaw, ["items","data","results","profiles"]);
      const contacts = norm(cRaw,  ["items","data","results","contacts"]);
      const tasks    = norm(tRaw,  ["items","data","results","tasks"]);

      const enriched = actors.map(actor => {
        const ak = actorKey(actor);
        const cm = contacts
          .map(c => ({ ...c, _rel: overlap(ak, contactKey(c)) }))
          .filter(c => c._rel > 0.06)
          .sort((a, b) => b._rel - a._rel)
          .slice(0, 5);
        const tm = tasks
          .map(t => ({ ...t, _rel: overlap(ak, taskKey(t)) }))
          .filter(t => t._rel > 0.06)
          .sort((a, b) => b._rel - a._rel)
          .slice(0, 5);
        return { ...actor, _contacts: cm, _tasks: tm, _class: classify(cm, tm) };
      });

      const fully     = enriched.filter(a => a._class === "FULLY_RESPONDED").length;
      const contact   = enriched.filter(a => a._class === "CONTACT_ENGAGED").length;
      const task      = enriched.filter(a => a._class === "TASK_ACTIVE").length;
      const unres     = enriched.filter(a => a._class === "UNRESPONDED").length;

      setRows(enriched);
      setStats({ actors: actors.length, contacts: contacts.length, tasks: tasks.length, fully, contact, task, unresponded: unres });
    } catch {
      // leave stale data
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
    const toggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:ictarc-toggle", toggle);
    return () => window.removeEventListener("jarvis:ictarc-toggle", toggle);
  }, []);

  const visible = rows.filter(a => {
    if (tab !== "ALL" && a._class !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      if (![a.name, a.org, a.role].join(" ").toLowerCase().includes(s)) return false;
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const script = await buildIctarcScript();
      setBrief(script);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch {
      setBrief("Unable to reach agent core for assessment.");
    } finally {
      setAssessing(false);
    }
  }

  const pct = stats.actors ? Math.round((stats.fully / stats.actors) * 100) : 0;

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Actor Response Coverage (ICTARC)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: open ? CY : "rgba(6,11,22,0.82)",
          color: open ? "#04060A" : CY,
          border: `1px solid ${CY}55`, borderRadius: 6, padding: "4px 10px",
          fontFamily: FONT, fontSize: 11, letterSpacing: 1, cursor: "pointer",
          boxShadow: open ? `0 0 18px ${CY}88` : "none",
        }}
      >
        ◈ ICTARC
        {stats.unresponded > 0 && (
          <span style={{
            marginLeft: 6, background: RD, color: "#fff", borderRadius: 4,
            padding: "1px 5px", fontSize: 10,
            animation: "ictarc-pulse 1.4s ease-in-out infinite",
          }}>
            {stats.unresponded}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 18, top: 54, width: "min(740px,94vw)", maxHeight: "82vh",
          background: BG, border: `1px solid ${BORDER}`, borderRadius: 12,
          fontFamily: FONT, color: "#C8DFF0", zIndex: Z_INDEX + 1,
          display: "flex", flexDirection: "column", overflow: "hidden",
          boxShadow: `0 0 60px ${CY}18`,
        }}>
          {/* header */}
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ color: CY, fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>◈ ACTOR RESPONSE COVERAGE</span>
              <span style={{ marginLeft: "auto", fontSize: 10, color: "#6E8AA0" }}>ICTARC · IntelProfile × Contact × Task</span>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 16, padding: 0 }}>✕</button>
            </div>
            {/* stat tiles */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              {[
                ["ACTORS",    stats.actors,      CY],
                ["CONTACTS",  stats.contacts,    OR],
                ["TASKS",     stats.tasks,       TL],
                ["FULL RESP.",stats.fully,        GR],
                ["CONTACT",   stats.contact,     OR],
                ["TASK",      stats.task,        TL],
                ["UNRESPONDED",stats.unresponded, RD],
                [`${pct}% RESP.`, null,          CY],
              ].map(([label, val, col]) => (
                <div key={label} style={{
                  background: "rgba(0,0,0,0.3)", border: `1px solid ${col}33`,
                  borderRadius: 6, padding: "4px 10px", textAlign: "center",
                }}>
                  <div style={{ color: col, fontSize: 13, fontWeight: 700 }}>{val ?? label}</div>
                  {val !== null && <div style={{ color: "#6E8AA0", fontSize: 9 }}>{label}</div>}
                </div>
              ))}
            </div>
            {/* coverage bar */}
            <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden", marginBottom: 8 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg,${CY},${GR})`, borderRadius: 2, transition: "width 0.6s" }} />
            </div>
            {/* filter tabs */}
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
              {TABS.map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  background: tab === t ? CY : "rgba(0,207,255,0.06)",
                  color: tab === t ? "#04060A" : CY,
                  border: `1px solid ${CY}44`, borderRadius: 4,
                  padding: "3px 8px", fontSize: 10, cursor: "pointer", fontFamily: FONT,
                }}>
                  {t}
                </button>
              ))}
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="search actors…"
                style={{
                  marginLeft: "auto", background: "rgba(0,207,255,0.06)",
                  border: `1px solid ${CY}33`, borderRadius: 4,
                  padding: "3px 8px", fontSize: 10, color: CY,
                  fontFamily: FONT, outline: "none",
                }}
              />
            </div>
            {/* assess button */}
            <button onClick={assess} disabled={assessing} style={{
              background: assessing ? "rgba(0,207,255,0.1)" : `${CY}22`,
              border: `1px solid ${CY}55`, borderRadius: 5,
              color: CY, fontFamily: FONT, fontSize: 11, cursor: assessing ? "not-allowed" : "pointer",
              padding: "5px 14px",
            }}>
              {assessing ? "⟳ assessing…" : "▶ ASSESS RESPONSE"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, padding: "8px 10px", background: "rgba(0,207,255,0.06)", borderRadius: 6, fontSize: 11, lineHeight: 1.5, color: "#C8DFF0" }}>
                {brief}
              </div>
            )}
          </div>

          {/* list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "8px 12px" }}>
            {loading && <div style={{ color: "#6E8AA0", fontSize: 11, padding: 8 }}>loading…</div>}
            {!loading && visible.length === 0 && (
              <div style={{ color: "#6E8AA0", fontSize: 11, padding: 8 }}>No actors match the current filter.</div>
            )}
            {visible.map((actor, i) => {
              const col = CLASS_COLOR[actor._class] || AM;
              const isExp = expanded === i;
              return (
                <div key={actor.id || i} style={{
                  marginBottom: 6, border: `1px solid ${col}33`, borderRadius: 8,
                  background: actor._class === "UNRESPONDED" ? "rgba(239,68,68,0.06)" : "rgba(0,0,0,0.25)",
                }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <span style={{ color: col, fontSize: 10, fontWeight: 700, minWidth: 80 }}>{actor._class}</span>
                    <span style={{ fontWeight: 600, fontSize: 12, flex: 1 }}>{actor.name || actor.id || "Unknown Actor"}</span>
                    {actor.role && <span style={{ fontSize: 10, color: "#6E8AA0" }}>{actor.role}</span>}
                    {actor.org  && <span style={{ fontSize: 10, color: "#6E8AA0", marginLeft: 4 }}>· {actor.org}</span>}
                    <span style={{ fontSize: 10, color: col, marginLeft: "auto" }}>
                      {actor._contacts.length}C · {actor._tasks.length}T
                    </span>
                    <span style={{ color: "#6E8AA0", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                  </div>
                  {isExp && (
                    <div style={{ padding: "0 12px 10px" }}>
                      {/* contacts */}
                      {actor._contacts.length > 0 && (
                        <>
                          <div style={{ fontSize: 10, color: OR, marginBottom: 4, letterSpacing: 1 }}>ENGAGED CONTACTS</div>
                          {actor._contacts.map((c, ci) => (
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
                      {/* tasks */}
                      {actor._tasks.length > 0 && (
                        <>
                          <div style={{ fontSize: 10, color: TL, marginBottom: 4, marginTop: 6, letterSpacing: 1 }}>ACTIVE TASKS</div>
                          {actor._tasks.map((t, ti) => (
                            <div key={ti} style={{
                              marginBottom: 4, padding: "6px 10px",
                              background: "rgba(20,184,166,0.06)", border: `1px solid ${TL}33`, borderRadius: 6,
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                <span style={{ fontSize: 11, fontWeight: 600 }}>{t.name || t.title || t.id || "Task"}</span>
                                {t.status && <span style={{ fontSize: 10, color: "#6E8AA0" }}>{t.status}</span>}
                              </div>
                              <div style={{ height: 3, background: "rgba(20,184,166,0.2)", borderRadius: 2, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${Math.min(100, Math.round(t._rel * 100 * 4))}%`, background: TL, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                      {actor._contacts.length === 0 && actor._tasks.length === 0 && (
                        <div style={{ color: RD, fontSize: 11, padding: "4px 0" }}>
                          ⚠ No contact assignments or active tasks found for this threat actor.
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
        @keyframes ictarc-pulse {
          0%,100% { opacity:1; transform:scale(1); }
          50% { opacity:0.6; transform:scale(1.15); }
        }
      `}</style>
    </>
  );
}
