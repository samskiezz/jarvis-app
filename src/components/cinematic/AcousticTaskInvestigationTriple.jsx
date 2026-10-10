/**
 * F685 — Acoustic × Task × Investigation Triple Nexus (ACTKIINV)
 * Three-way cross-reference: /v1/acoustic/contacts × /entities/Task × /v1/investigations.
 * Each acoustic contact is classified:
 *   FULLY_OPERATIONAL — matches ≥1 task AND ≥1 investigation
 *   TASKED_ONLY       — task match but no investigation
 *   CASED_ONLY        — investigation match but no task
 *   UNTRACKED         — neither (intelligence blind spot)
 * Coverage % tile = FULLY_OPERATIONAL / total contacts.
 * Tabs: ALL / FULLY_OPERATIONAL / TASKED_ONLY / CASED_ONLY / UNTRACKED + search.
 * Click-to-expand shows matched tasks + matched investigations per contact.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence operational coverage brief + TTS.
 * 90-second auto-refresh. Event: jarvis:actkiinv-toggle.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 139_780;
const Z_INDEX  = 221;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const ACTKIINV_RE = /\b(actkiinv|acoustic\s+task\s+invest(?:igation)?|acoustic\s+triple\s+ops|task\s+invest(?:igation)?\s+acoustic|acoustic\s+operational\s+triple|sensor\s+task\s+case|acoustic\s+case\s+task|acoustic\s+fully\s+operational|actkii|sound\s+task\s+invest(?:igation)?|sensor\s+case\s+task)\b/i;

export function isActkiinvQuery(q) { return ACTKIINV_RE.test(q || ""); }

const STATUS_COLOR = {
  OPEN:      "#29E7FF",
  ACTIVE:    "#00e5a0",
  CLOSED:    "#666",
  ESCALATED: "#ff4444",
  IN_PROGRESS: "#ffaa00",
  BLOCKED:   "#ff4444",
  PENDING:   "#ff8800",
  DONE:      "#00e5a0",
};

const COV_COLOR = {
  FULLY_OPERATIONAL: { bg: "rgba(0,229,160,0.15)", text: "#00e5a0", border: "#00e5a066" },
  TASKED_ONLY:       { bg: "rgba(41,231,255,0.12)", text: "#29E7FF", border: "#29E7FF55" },
  CASED_ONLY:        { bg: "rgba(255,170,0,0.12)",  text: "#ffaa00", border: "#ffaa0055" },
  UNTRACKED:         { bg: "rgba(80,80,80,0.15)",   text: "#667",    border: "#44444466" },
};

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

function normaliseTasks(raw) {
  if (Array.isArray(raw))         return raw;
  if (Array.isArray(raw?.tasks))  return raw.tasks;
  if (Array.isArray(raw?.items))  return raw.items;
  if (Array.isArray(raw?.data))   return raw.data;
  return [];
}

function normaliseInvestigations(raw) {
  if (Array.isArray(raw))                   return raw;
  if (Array.isArray(raw?.investigations))   return raw.investigations;
  if (Array.isArray(raw?.cases))            return raw.cases;
  if (Array.isArray(raw?.items))            return raw.items;
  if (Array.isArray(raw?.data))             return raw.data;
  return [];
}

function contactText(c) {
  return [c.name, c.callsign, c.id, c.type, c.classification, c.vessel_type, c.description]
    .filter(Boolean).join(" ");
}

function crossRef(contacts, tasks, investigations) {
  return contacts.map(c => {
    const ct = contactText(c);
    const matchedTasks = tasks.filter(t => {
      const tt = [t.title, t.description, t.name, t.objective].filter(Boolean).join(" ");
      return overlap(ct, tt) > 0;
    }).map(t => ({
      ...t,
      hits: overlap(ct, [t.title, t.description, t.name].filter(Boolean).join(" ")),
    }));
    const matchedCases = investigations.filter(i => {
      const it = [i.title, i.summary, i.description, i.name, i.lead].filter(Boolean).join(" ");
      return overlap(ct, it) > 0;
    }).map(i => ({
      ...i,
      hits: overlap(ct, [i.title, i.summary, i.description].filter(Boolean).join(" ")),
    }));
    const hasTask = matchedTasks.length > 0;
    const hasCase = matchedCases.length > 0;
    const coverage =
      hasTask && hasCase ? "FULLY_OPERATIONAL" :
      hasTask            ? "TASKED_ONLY"       :
      hasCase            ? "CASED_ONLY"        :
                           "UNTRACKED";
    return { ...c, _tasks: matchedTasks, _cases: matchedCases, _coverage: coverage };
  });
}

async function fetchAll(base) {
  const hdrs = { Authorization: `Bearer ${API_KEY}` };
  const [cr, tr, ir] = await Promise.all([
    fetch(`${base}/v1/acoustic/contacts`,  { headers: hdrs }),
    fetch(`${base}/entities/Task`,         { headers: hdrs }),
    fetch(`${base}/v1/investigations`,     { headers: hdrs }),
  ]);
  const [cd, td, id_] = await Promise.all([cr.json(), tr.json(), ir.json()]);
  return {
    contacts:       normaliseContacts(cd),
    tasks:          normaliseTasks(td),
    investigations: normaliseInvestigations(id_),
  };
}

// ── exported script (used by JarvisBrain) ─────────────────────────────────────

export async function buildActkiinvScript() {
  try {
    const base = apiBase();
    const { contacts, tasks, investigations } = await fetchAll(base);
    const enriched = crossRef(contacts, tasks, investigations);
    const full = enriched.filter(c => c._coverage === "FULLY_OPERATIONAL").length;
    const untracked = enriched.filter(c => c._coverage === "UNTRACKED").length;
    const pct = enriched.length ? Math.round((full / enriched.length) * 100) : 0;
    return `Acoustic sensor sweep: ${enriched.length} contacts detected — ${full} fully operational (task+case matched, ${pct}% coverage), ${untracked} untracked with no task or investigation link. Recommend reviewing untracked contacts for operational follow-up.`;
  } catch {
    return "Acoustic task-investigation triple coverage unavailable — check /v1/acoustic/contacts, /entities/Task, and /v1/investigations.";
  }
}

// ── component ─────────────────────────────────────────────────────────────────

export default function AcousticTaskInvestigationTriple() {
  const [open, setOpen]     = useState(false);
  const [data, setData]     = useState([]);
  const [tab, setTab]       = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExp]  = useState(null);
  const [brief, setBrief]   = useState("");
  const [assessing, setAss] = useState(false);
  const [err, setErr]       = useState(null);
  const timerRef            = useRef(null);

  const load = useCallback(async () => {
    try {
      const base = apiBase();
      const { contacts, tasks, investigations } = await fetchAll(base);
      setData(crossRef(contacts, tasks, investigations));
      setErr(null);
    } catch (e) {
      setErr(e.message || "fetch error");
    }
  }, []);

  useEffect(() => {
    const handler = () => {
      setOpen(o => {
        if (!o) load();
        return !o;
      });
    };
    window.addEventListener("jarvis:actkiinv-toggle", handler);
    return () => window.removeEventListener("jarvis:actkiinv-toggle", handler);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAss(true);
    try {
      const base = apiBase();
      const script = await buildActkiinvScript();
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await res.json();
      const txt = (d.answer || d.response || script).slice(0, 300);
      setBrief(txt);
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: txt }),
      });
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAss(false);
    }
  }, [assessing]);

  const counts = {
    FULLY_OPERATIONAL: data.filter(c => c._coverage === "FULLY_OPERATIONAL").length,
    TASKED_ONLY:       data.filter(c => c._coverage === "TASKED_ONLY").length,
    CASED_ONLY:        data.filter(c => c._coverage === "CASED_ONLY").length,
    UNTRACKED:         data.filter(c => c._coverage === "UNTRACKED").length,
  };
  const pct = data.length ? Math.round((counts.FULLY_OPERATIONAL / data.length) * 100) : 0;

  const visible = data.filter(c => {
    if (tab !== "ALL" && c._coverage !== tab) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return contactText(c).toLowerCase().includes(q);
  });

  const badgeCount = counts.UNTRACKED;

  return (
    <>
      {/* toggle button */}
      <button
        onClick={() => { setOpen(o => !o); if (!open) load(); }}
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: Z_INDEX,
          background: open ? "rgba(0,229,160,0.18)" : "rgba(0,255,231,0.07)",
          border: `1px solid ${open ? "#00e5a0" : "#00ffe733"}`,
          color: open ? "#00e5a0" : "#29E7FF",
          borderRadius: 6,
          padding: "3px 10px",
          fontSize: 10,
          fontFamily: "monospace",
          letterSpacing: 1,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ◈ ACTKIINV
        {badgeCount > 0 && (
          <span style={{
            marginLeft: 5,
            background: "#667",
            color: "#fff",
            borderRadius: 8,
            padding: "0 5px",
            fontSize: 9,
          }}>
            {badgeCount}
          </span>
        )}
      </button>

      {/* panel */}
      {open && (
        <div style={{
          position: "fixed",
          right: 16,
          top: 60,
          width: 420,
          maxHeight: "80vh",
          background: "rgba(0,8,18,0.97)",
          border: "1px solid #00ffe733",
          borderRadius: 10,
          zIndex: 9000,
          display: "flex",
          flexDirection: "column",
          fontFamily: "monospace",
          boxShadow: "0 0 30px #00ffe718",
        }}>
          {/* header */}
          <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid #00ffe733", padding: "10px 14px" }}>
            <span style={{ flex: 1, color: "#00e5a0", fontSize: 12, letterSpacing: 1, fontWeight: 700 }}>
              ACOUSTIC × TASK × INVESTIGATION TRIPLE
            </span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#667", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 6, padding: "10px 14px" }}>
            {[
              { label: "CONTACTS", val: data.length, color: "#29E7FF" },
              { label: "FULL OPS",  val: counts.FULLY_OPERATIONAL, color: "#00e5a0" },
              { label: "TASKED",    val: counts.TASKED_ONLY,       color: "#29E7FF" },
              { label: "CASED",     val: counts.CASED_ONLY,        color: "#ffaa00" },
              { label: "COVERAGE",  val: `${pct}%`,                color: pct >= 50 ? "#00e5a0" : "#ff8800" },
            ].map(t => (
              <div key={t.label} style={{ background: "rgba(0,255,231,0.04)", border: "1px solid #00ffe722", borderRadius: 6, padding: "6px 4px", textAlign: "center" }}>
                <div style={{ color: t.color, fontSize: 14, fontWeight: 700 }}>{t.val}</div>
                <div style={{ color: "#667", fontSize: 8, marginTop: 2 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {err && (
            <div style={{ color: "#ff4444", fontSize: 11, padding: "0 14px 8px" }}>Error: {err}</div>
          )}

          {/* tabs + search */}
          <div style={{ display: "flex", gap: 4, padding: "0 14px 8px", alignItems: "center" }}>
            {["ALL", "FULLY_OPERATIONAL", "TASKED_ONLY", "CASED_ONLY", "UNTRACKED"].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? "rgba(0,229,160,0.18)" : "rgba(0,255,231,0.04)",
                  border: `1px solid ${tab === t ? "#00e5a066" : "#00ffe722"}`,
                  color: tab === t ? "#00e5a0" : "#667",
                  borderRadius: 4,
                  padding: "2px 7px",
                  fontSize: 9,
                  cursor: "pointer",
                  letterSpacing: 0.5,
                }}
              >
                {t.replace(/_/g, " ")}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search…"
              style={{ marginLeft: "auto", background: "rgba(0,255,231,0.06)", border: "1px solid #00ffe733", borderRadius: 4, padding: "2px 8px", color: "#c8f0ff", fontSize: 11, width: 90, outline: "none" }}
            />
          </div>

          {/* contact list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 8px" }}>
            {visible.length === 0 && (
              <div style={{ color: "#444", fontSize: 12, textAlign: "center", marginTop: 20 }}>No contacts</div>
            )}
            {visible.map((c, i) => {
              const id    = c.id || c.callsign || i;
              const label = c.name || c.callsign || c.id || `Contact ${i + 1}`;
              const isExp = expanded === id;
              const cc    = COV_COLOR[c._coverage] || COV_COLOR.UNTRACKED;
              return (
                <div key={id} style={{ marginBottom: 6, background: "rgba(0,255,231,0.03)", border: `1px solid ${cc.border}`, borderRadius: 6, overflow: "hidden" }}>
                  <div
                    onClick={() => setExp(isExp ? null : id)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer" }}
                  >
                    <span style={{ flex: 1, fontSize: 12, color: "#c8f0ff" }}>{label}</span>
                    {c.type && <span style={{ color: "#667", fontSize: 10 }}>{c.type}</span>}
                    <span style={{ background: cc.bg, color: cc.text, border: `1px solid ${cc.border}`, borderRadius: 4, padding: "1px 7px", fontSize: 9, letterSpacing: 0.5 }}>
                      {c._coverage.replace(/_/g, " ")}
                    </span>
                    <span style={{ color: "#00ffe744", fontSize: 11 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{ borderTop: "1px solid #00ffe711", padding: "8px 12px", background: "rgba(0,0,0,0.3)" }}>
                      {c.classification && <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Classification: {c.classification}</div>}
                      {c.description    && <div style={{ fontSize: 11, color: "#aaa", marginBottom: 6 }}>{c.description}</div>}

                      {/* Tasks */}
                      <div style={{ fontSize: 11, color: "#29E7FF", marginBottom: 4, fontWeight: 700 }}>
                        Matched Tasks ({c._tasks.length}):
                      </div>
                      {c._tasks.length === 0 ? (
                        <div style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>No task match.</div>
                      ) : c._tasks.slice(0, 3).map((t, ti) => (
                        <div key={t.id || ti} style={{ marginBottom: 4, padding: "3px 8px", background: "rgba(41,231,255,0.06)", border: "1px solid #29E7FF33", borderRadius: 4, fontSize: 11 }}>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            {t.status && (
                              <span style={{ background: `${STATUS_COLOR[t.status] || "#667"}22`, color: STATUS_COLOR[t.status] || "#667", border: `1px solid ${STATUS_COLOR[t.status] || "#667"}55`, borderRadius: 3, padding: "0 5px", fontSize: 9 }}>
                                {t.status}
                              </span>
                            )}
                            <span style={{ color: "#b8e0ff", flex: 1 }}>{t.title || t.name || t.id}</span>
                            <span style={{ color: "#888", fontSize: 10 }}>hits: {t.hits}</span>
                          </div>
                        </div>
                      ))}
                      {c._tasks.length > 3 && <div style={{ fontSize: 10, color: "#667", marginBottom: 4 }}>+{c._tasks.length - 3} more…</div>}

                      {/* Investigations */}
                      <div style={{ fontSize: 11, color: "#ffaa00", marginBottom: 4, fontWeight: 700, marginTop: 6 }}>
                        Matched Investigations ({c._cases.length}):
                      </div>
                      {c._cases.length === 0 ? (
                        <div style={{ fontSize: 11, color: "#555" }}>No investigation match.</div>
                      ) : c._cases.slice(0, 3).map((inv, ii) => (
                        <div key={inv.id || ii} style={{ marginBottom: 4, padding: "3px 8px", background: "rgba(255,170,0,0.06)", border: "1px solid #ffaa0033", borderRadius: 4, fontSize: 11 }}>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            {inv.status && (
                              <span style={{ background: `${STATUS_COLOR[inv.status] || "#667"}22`, color: STATUS_COLOR[inv.status] || "#667", border: `1px solid ${STATUS_COLOR[inv.status] || "#667"}55`, borderRadius: 3, padding: "0 5px", fontSize: 9 }}>
                                {inv.status}
                              </span>
                            )}
                            <span style={{ color: "#ffa855", flex: 1 }}>{inv.title || inv.name || inv.id}</span>
                            <span style={{ color: "#888", fontSize: 10 }}>hits: {inv.hits}</span>
                          </div>
                          {inv.summary && <div style={{ color: "#888", fontSize: 10, marginTop: 3 }}>{String(inv.summary).slice(0, 100)}{inv.summary.length > 100 ? "…" : ""}</div>}
                        </div>
                      ))}
                      {c._cases.length > 3 && <div style={{ fontSize: 10, color: "#667" }}>+{c._cases.length - 3} more…</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* assess */}
          <div style={{ borderTop: "1px solid #00ffe733", padding: "10px 14px" }}>
            {brief && (
              <div style={{ fontSize: 11, color: "#c8f0ff", background: "rgba(0,255,231,0.06)", border: "1px solid #00ffe733", borderRadius: 6, padding: "8px 10px", marginBottom: 8 }}>
                {brief}
              </div>
            )}
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                width: "100%",
                background: assessing ? "#001a2e" : "rgba(0,229,160,0.12)",
                border: "1px solid #00e5a0",
                color: "#00e5a0",
                borderRadius: 6,
                padding: "6px 0",
                fontSize: 12,
                cursor: assessing ? "default" : "pointer",
                fontFamily: "monospace",
                letterSpacing: 1,
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
