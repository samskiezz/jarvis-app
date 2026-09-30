/**
 * F197 — Ops Event × Contact × Task Operational Attribution Matrix (OCTATM)
 *
 * Parallel-fetches /v1/ops/events + /entities/Contact + /entities/Task
 * and keyword-correlates each ops event against contacts AND tasks to classify:
 *
 *   FULLY_ATTRIBUTED — matched contact + task (event owned by a person and driven by a task)
 *   CONTACT_OWNED    — contact present, no task backing
 *   TASK_DRIVEN      — task present, no contact owner
 *   UNATTRIBUTED     — neither (accountability gap)
 *
 * Stat tiles: OPS EVENTS / CONTACTS / TASKS + four class counts + ATTRIBUTED%.
 * Amber badge on UNATTRIBUTED count.
 * Filter tabs ALL / FULLY_ATTRIBUTED / CONTACT_OWNED / TASK_DRIVEN / UNATTRIBUTED + text search.
 * Expand event → matched contact cards (teal) + task cards (cyan) with relevance bars.
 * ▶ ASSESS ATTRIBUTION → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:octatm-toggle event.
 *
 * Voice triggers:
 *   "octatm / ops event attribution / ops accountability / unattributed events /
 *    event contact task / ops event coverage / attribution matrix"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_052_680;
const Z_INDEX  = 258;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const OCTATM_RE = /\b(octatm|ops[\s-]event[\s-]attribution|ops[\s-]accountability|unattributed[\s-]events?|event[\s-]contact[\s-]task|ops[\s-]event[\s-]coverage|attribution[\s-]matrix)\b/i;

export function isOctatmQuery(q = "") { return OCTATM_RE.test(q); }

export async function buildOctatmScript() {
  const base = apiBase();
  const [evRes, coRes, tkRes] = await Promise.allSettled([
    fetch(`${base}/v1/ops/events`).then(r => r.json()),
    fetch(`${base}/entities/Contact`).then(r => r.json()),
    fetch(`${base}/entities/Task`).then(r => r.json()),
  ]);
  const events   = evRes.status === "fulfilled" ? (evRes.value?.items || evRes.value?.events   || evRes.value || []) : [];
  const contacts = coRes.status === "fulfilled" ? (coRes.value?.items || coRes.value?.contacts || coRes.value || []) : [];
  const tasks    = tkRes.status === "fulfilled" ? (tkRes.value?.items || tkRes.value?.tasks    || tkRes.value || []) : [];

  let fullyAttributed = 0, unattributed = 0;
  for (const ev of events) {
    const kws    = keywords(eventText(ev));
    const hasCo  = contacts.some(c => scoreText(contactText(c), kws) > 0);
    const hasTk  = tasks.some(t    => scoreText(taskText(t),    kws) > 0);
    if (hasCo && hasTk) fullyAttributed++;
    else if (!hasCo && !hasTk) unattributed++;
  }
  const total         = events.length;
  const attributedPct = total ? Math.round((fullyAttributed / total) * 100) : 0;
  return `OCTATM Operational Attribution Matrix online, sir. I have cross-referenced ${total} ops events against ${contacts.length} contacts and ${tasks.length} active tasks. ${fullyAttributed} events are fully attributed with both a responsible contact and a backing task, representing ${attributedPct}% attribution coverage. ${unattributed} events are completely unattributed — no owner and no task linkage. Recommend urgent attribution triage on those ${unattributed} unattributed events to close the accountability gap, sir.`;
}

const CY     = "#00CFFF";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const GR     = "#22C55E";
const TE     = "#2DD4BF";
const CW     = "#67E8F9";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_ATTRIBUTED: GR,
  CONTACT_OWNED:    TE,
  TASK_DRIVEN:      CW,
  UNATTRIBUTED:     AM,
};

const TABS = ["ALL", "FULLY_ATTRIBUTED", "CONTACT_OWNED", "TASK_DRIVEN", "UNATTRIBUTED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function eventText(e) {
  return [e.title, e.name, e.description, e.type, e.category, e.tags, e.source, e.status, e.severity, e.location].filter(Boolean).join(" ");
}
function contactText(c) {
  return [c.name, c.email, c.role, c.org, c.organization, c.department, c.tags, c.category, c.title].filter(Boolean).join(" ");
}
function taskText(t) {
  return [t.title, t.name, t.description, t.status, t.priority, t.type, t.tags, t.category, t.assignee, t.owner].filter(Boolean).join(" ");
}

function classify(event, contacts, tasks) {
  const kws = keywords(eventText(event));
  const matchedContacts = contacts
    .map(c => ({ ...c, _score: scoreText(contactText(c), kws) }))
    .filter(c => c._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const matchedTasks = tasks
    .map(t => ({ ...t, _score: scoreText(taskText(t), kws) }))
    .filter(t => t._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const hasCo = matchedContacts.length > 0;
  const hasTk = matchedTasks.length > 0;
  let cls;
  if (hasCo && hasTk)  cls = "FULLY_ATTRIBUTED";
  else if (hasCo)       cls = "CONTACT_OWNED";
  else if (hasTk)       cls = "TASK_DRIVEN";
  else                  cls = "UNATTRIBUTED";
  return { ...event, _cls: cls, _contacts: matchedContacts, _tasks: matchedTasks };
}

export default function OpsEventContactTaskMatrix() {
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [events, setEvents]         = useState([]);
  const [contacts, setContacts]     = useState([]);
  const [tasks, setTasks]           = useState([]);
  const [classified, setClassified] = useState([]);
  const [tab, setTab]               = useState("ALL");
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState(null);
  const [brief, setBrief]           = useState("");
  const [assessing, setAssessing]   = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = apiBase();
      const [evRes, coRes, tkRes] = await Promise.allSettled([
        fetch(`${base}/v1/ops/events`).then(r => r.json()),
        fetch(`${base}/entities/Contact`).then(r => r.json()),
        fetch(`${base}/entities/Task`).then(r => r.json()),
      ]);
      const ev = evRes.status === "fulfilled" ? (evRes.value?.items || evRes.value?.events   || evRes.value || []) : [];
      const co = coRes.status === "fulfilled" ? (coRes.value?.items || coRes.value?.contacts || coRes.value || []) : [];
      const tk = tkRes.status === "fulfilled" ? (tkRes.value?.items || tkRes.value?.tasks    || tkRes.value || []) : [];
      setEvents(ev);
      setContacts(co);
      setTasks(tk);
      setClassified(ev.map(e => classify(e, co, tk)));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:octatm-toggle", onToggle);
    return () => window.removeEventListener("jarvis:octatm-toggle", onToggle);
  }, []);

  const fullyAttributed = classified.filter(c => c._cls === "FULLY_ATTRIBUTED").length;
  const contactOwned    = classified.filter(c => c._cls === "CONTACT_OWNED").length;
  const taskDriven      = classified.filter(c => c._cls === "TASK_DRIVEN").length;
  const unattributed    = classified.filter(c => c._cls === "UNATTRIBUTED").length;
  const total           = classified.length;
  const attributedPct   = total ? Math.round((fullyAttributed / total) * 100) : 0;

  const visible = classified
    .filter(c => tab === "ALL" || c._cls === tab)
    .filter(c => !search || eventText(c).toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const ctx = `OCTATM: ${total} ops events — FULLY_ATTRIBUTED: ${fullyAttributed}, CONTACT_OWNED: ${contactOwned}, TASK_DRIVEN: ${taskDriven}, UNATTRIBUTED: ${unattributed} (${attributedPct}% attributed). Contacts: ${contacts.length}. Tasks: ${tasks.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `OCTATM operational attribution matrix assessment. Context: ${ctx}. Provide a 2-sentence operational brief identifying which unattributed events represent the highest accountability risk and recommend the most urgent contact or task assignments to close the attribution gap. Be concise and direct.` }),
      });
      const d = await r.json();
      const txt = (d.answer || "Attribution assessment unavailable.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(txt);
      const tts = await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: txt }),
      });
      if (tts.ok) {
        const blob = await tts.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play().catch(() => {});
      }
    } catch (e) {
      setBrief("Assessment unavailable: " + e.message);
    } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Ops Event × Contact × Task Operational Attribution Matrix (OCTATM)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 10, letterSpacing: 1,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${AM}55`,
          color: AM, padding: "3px 7px", borderRadius: 4, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {unattributed > 0 && (
          <span style={{ background: AM, color: "#000", borderRadius: 3, padding: "0 4px", marginRight: 4, fontSize: 9 }}>
            {unattributed}
          </span>
        )}
        ◈ OCTATM
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: Z_INDEX,
      background: BG, fontFamily: FONT, overflowY: "auto", padding: "18px 20px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ color: CY, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>◈ OCTATM</span>
        <span style={{ color: "#6E8AA0", fontSize: 10, flex: 1 }}>
          Ops Event × Contact × Task Operational Attribution Matrix
        </span>
        {loading && <span style={{ color: AM, fontSize: 10 }}>◌ loading…</span>}
        <button onClick={load} style={smallBtn(CY)} title="Refresh">↺</button>
        <button onClick={() => setOpen(false)} style={smallBtn(RD)}>✕</button>
      </div>

      {error && (
        <div style={{ color: RD, fontSize: 11, marginBottom: 10, padding: "6px 10px", border: `1px solid ${RD}44`, borderRadius: 4 }}>
          {error}
        </div>
      )}

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {[
          ["OPS EVENTS",        total,           CY],
          ["CONTACTS",          contacts.length, TE],
          ["TASKS",             tasks.length,    CW],
          ["FULLY ATTRIBUTED",  fullyAttributed, GR],
          ["CONTACT OWNED",     contactOwned,    TE],
          ["TASK DRIVEN",       taskDriven,      CW],
          ["UNATTRIBUTED",      unattributed,    AM],
          ["ATTRIBUTED%",       attributedPct + "%", GR],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: "rgba(0,207,255,0.04)", border: `1px solid ${col}33`,
            borderRadius: 5, padding: "5px 10px", minWidth: 80, textAlign: "center",
          }}>
            <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>OPERATIONAL ATTRIBUTION COVERAGE</div>
        <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", position: "relative", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${attributedPct}%`, background: GR, borderRadius: 3, transition: "width 0.4s" }} />
        </div>
        <div style={{ color: GR, fontSize: 9, marginTop: 2 }}>{attributedPct}% of ops events fully attributed with contact ownership + task backing</div>
      </div>

      {/* Assess button */}
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={assess} disabled={assessing} style={{
          fontFamily: FONT, fontSize: 10, letterSpacing: 1, cursor: assessing ? "not-allowed" : "pointer",
          background: assessing ? "rgba(0,207,255,0.1)" : "rgba(0,207,255,0.15)",
          border: `1px solid ${CY}66`, color: CY, padding: "4px 10px", borderRadius: 4,
        }}>
          {assessing ? "◌ assessing…" : "▶ ASSESS ATTRIBUTION"}
        </button>
      </div>
      {brief && (
        <div style={{ color: "#DCEBF5", fontSize: 12, lineHeight: 1.5, marginBottom: 12,
          padding: "8px 12px", background: "rgba(0,207,255,0.06)", borderRadius: 6,
          border: `1px solid ${CY}22` }}>
          {brief}
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            fontFamily: FONT, fontSize: 9, letterSpacing: 1, padding: "3px 8px", borderRadius: 4,
            cursor: "pointer",
            background: tab === t ? (CLASS_COLOR[t] || CY) : "rgba(0,207,255,0.06)",
            border: `1px solid ${tab === t ? (CLASS_COLOR[t] || CY) : "rgba(0,207,255,0.18)"}`,
            color: tab === t ? "#000" : (CLASS_COLOR[t] || CY),
          }}>
            {t.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="search events…"
        style={{
          fontFamily: FONT, fontSize: 11, width: "100%", maxWidth: 340, marginBottom: 12,
          background: "rgba(0,207,255,0.04)", border: `1px solid ${BORDER}`,
          color: "#DCEBF5", borderRadius: 4, padding: "5px 10px", outline: "none",
        }}
      />

      {/* Event list */}
      {visible.length === 0 && !loading && (
        <div style={{ color: "#6E8AA0", fontSize: 11 }}>No events match current filter.</div>
      )}
      {visible.map((ev, i) => {
        const col   = CLASS_COLOR[ev._cls];
        const isExp = expanded === i;
        const name  = ev.title || ev.name || `Ops Event ${i + 1}`;
        return (
          <div key={i} style={{
            marginBottom: 6, border: `1px solid ${col}33`, borderRadius: 6,
            background: "rgba(0,207,255,0.02)", overflow: "hidden",
          }}>
            <div
              onClick={() => setExpanded(isExp ? null : i)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer" }}
            >
              <span style={{ color: col, fontSize: 9, letterSpacing: 1, border: `1px solid ${col}55`,
                borderRadius: 3, padding: "1px 5px", minWidth: 130, textAlign: "center" }}>
                {ev._cls.replace(/_/g, " ")}
              </span>
              <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>{name}</span>
              {ev.type && (
                <span style={{ color: AM, fontSize: 9, border: `1px solid ${AM}44`, borderRadius: 2, padding: "0 4px" }}>
                  {ev.type}
                </span>
              )}
              {ev._contacts.length > 0 && (
                <span style={{ color: TE, fontSize: 9 }}>⊕ {ev._contacts.length} contact{ev._contacts.length !== 1 ? "s" : ""}</span>
              )}
              {ev._tasks.length > 0 && (
                <span style={{ color: CW, fontSize: 9 }}>⊕ {ev._tasks.length} task{ev._tasks.length !== 1 ? "s" : ""}</span>
              )}
              <span style={{ color: col, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
            </div>

            {isExp && (
              <div style={{ padding: "0 10px 10px 10px", borderTop: `1px solid ${col}22` }}>
                {ev.description && (
                  <div style={{ color: "#6E8AA0", fontSize: 10, marginTop: 6, marginBottom: 8 }}>
                    {String(ev.description).slice(0, 200)}
                  </div>
                )}

                {ev._contacts.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: TE, fontSize: 9, letterSpacing: 1, marginBottom: 5 }}>▸ MATCHED CONTACTS</div>
                    {ev._contacts.map((c, j) => {
                      const maxScore = Math.max(...ev._contacts.map(x => x._score), 1);
                      const bar = Math.round((c._score / maxScore) * 100);
                      return (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>
                              {c.name || c.email || "Contact"}
                            </span>
                            {c.role && (
                              <span style={{ color: TE, fontSize: 9, border: `1px solid ${TE}44`, borderRadius: 2, padding: "0 4px" }}>
                                {c.role}
                              </span>
                            )}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.05)", marginTop: 2 }}>
                            <div style={{ height: "100%", width: `${bar}%`, background: TE, borderRadius: 2, opacity: 0.7 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {ev._tasks.length > 0 && (
                  <div>
                    <div style={{ color: CW, fontSize: 9, letterSpacing: 1, marginBottom: 5 }}>▸ MATCHED TASKS</div>
                    {ev._tasks.map((t, k) => {
                      const maxScore = Math.max(...ev._tasks.map(x => x._score), 1);
                      const bar = Math.round((t._score / maxScore) * 100);
                      return (
                        <div key={k} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>
                              {t.title || t.name || "Task"}
                            </span>
                            {t.priority && (
                              <span style={{ color: CW, fontSize: 9, border: `1px solid ${CW}44`, borderRadius: 2, padding: "0 4px" }}>
                                {t.priority}
                              </span>
                            )}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.05)", marginTop: 2 }}>
                            <div style={{ height: "100%", width: `${bar}%`, background: CW, borderRadius: 2, opacity: 0.7 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {ev._contacts.length === 0 && ev._tasks.length === 0 && (
                  <div style={{ color: AM, fontSize: 10, marginTop: 6 }}>
                    ◌ No contact or task match — event completely unattributed
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function smallBtn(color) {
  return {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 10, cursor: "pointer",
    background: "transparent", border: `1px solid ${color}55`,
    color: color, padding: "2px 6px", borderRadius: 3,
  };
}
