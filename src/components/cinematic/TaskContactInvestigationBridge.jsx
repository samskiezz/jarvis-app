/**
 * F71 – Task × Contact × Investigation Assignment Bridge (TCIASGN)
 * Cross-correlates /entities/Task × /entities/Contact × /v1/investigations.
 * Classifies each task:
 *   FULLY_ASSIGNED  – matched contact (assignee/owner) AND backing investigation
 *   CONTACT_ONLY    – matched contact, no investigation coverage
 *   INV_ONLY        – matched by investigation, no contact assigned
 *   UNASSIGNED      – no contact or investigation match (ownership gap — blind spot)
 * UNASSIGNED rows pulse red.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const BTN_LEFT   = 953600;
const Z          = 653;
const REFRESH_MS = 90_000;

const CY   = "#29E7FF";
const GR   = "#00c878";
const AM   = "#F5A623";
const RD   = "#FF3B3B";
const PU   = "#a855f7";
const DIM  = "#3a5060";
const MONO = "'JetBrains Mono', 'Courier New', monospace";
const SANS = "'Inter', system-ui, sans-serif";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
function authHdr() { return { Authorization: `Bearer ${API_KEY}` }; }

function kw(item) {
  return [
    item.name, item.title, item.description, item.assignee,
    item.owner, item.category, item.type, item.tags,
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

function classify(task, contacts, investigations) {
  const tk = kw(task);
  const matchedContacts = contacts.filter(c => {
    const ck = kw(c);
    if (task.assignee && (c.name || "").toLowerCase().includes(task.assignee.toLowerCase())) return true;
    if (task.owner && (c.name || "").toLowerCase().includes(task.owner.toLowerCase())) return true;
    return overlap(tk, ck) >= 2;
  });
  const matchedInvestigations = investigations.filter(inv => {
    const ik = kw(inv);
    return overlap(tk, ik) >= 2;
  });

  const hasContact = matchedContacts.length > 0;
  const hasInv     = matchedInvestigations.length > 0;
  let cls;
  if (hasContact && hasInv)  cls = "FULLY_ASSIGNED";
  else if (hasContact)       cls = "CONTACT_ONLY";
  else if (hasInv)           cls = "INV_ONLY";
  else                       cls = "UNASSIGNED";

  return {
    id: task.id || task.name || Math.random().toString(36).slice(2),
    task,
    cls,
    matchedContacts: matchedContacts.slice(0, 5).map(c => ({
      name: c.name || c.title || "?",
      role: c.role || c.type || "",
      score: overlap(tk, kw(c)),
    })),
    matchedInvestigations: matchedInvestigations.slice(0, 5).map(inv => ({
      title: inv.title || inv.name || "?",
      status: inv.status || "",
      score: overlap(tk, kw(inv)),
    })),
  };
}

async function loadAll(base) {
  const [tr, cr, ir] = await Promise.all([
    fetch(`${base}/entities/Task`,         { headers: authHdr() }),
    fetch(`${base}/entities/Contact`,      { headers: authHdr() }),
    fetch(`${base}/v1/investigations`,     { headers: authHdr() }),
  ]);
  const [td, cd, id_] = await Promise.all([
    tr.ok ? tr.json() : [],
    cr.ok ? cr.json() : [],
    ir.ok ? ir.json() : [],
  ]);
  const tasks         = Array.isArray(td) ? td : td.data || td.items || [];
  const contacts      = Array.isArray(cd) ? cd : cd.data || cd.items || [];
  const investigations = Array.isArray(id_) ? id_ : id_.data || id_.investigations || id_.items || [];
  return { tasks, contacts, investigations };
}

// ─── exported helpers for JarvisBrain ───────────────────────────────────────
export function isTciasgnQuery(q) {
  return /\b(tciasgn|task\s+assign|unassigned\s+tasks?|task\s+contact|task\s+ownership|task\s+investigation|task\s+backing|ownership\s+gap|task\s+bridge)\b/i.test(q);
}

export async function buildTciasgnScript() {
  try {
    const base = apiBase();
    const { tasks, contacts, investigations } = await loadAll(base);
    const rows = tasks.map(t => classify(t, contacts, investigations));
    const unassigned = rows.filter(r => r.cls === "UNASSIGNED").length;
    const fully      = rows.filter(r => r.cls === "FULLY_ASSIGNED").length;
    return `Task assignment bridge: ${tasks.length} tasks, ${contacts.length} contacts, ${investigations.length} investigations. Fully assigned: ${fully}. Unassigned (ownership gap): ${unassigned}. Recommend assigning contacts and linking investigations to unassigned tasks.`;
  } catch (_) {
    return "Task contact investigation bridge status unavailable.";
  }
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function TaskContactInvestigationBridge() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [aiText, setAiText]     = useState("");
  const timerRef                = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const base = apiBase();
      const { tasks, contacts, investigations } = await loadAll(base);
      setRows(tasks.map(t => classify(t, contacts, investigations)));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) { load(); timerRef.current = setInterval(load, REFRESH_MS); }
    else { clearInterval(timerRef.current); }
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:tciasgn-toggle", handler);
    return () => window.removeEventListener("jarvis:tciasgn-toggle", handler);
  }, []);

  const unassigned     = rows.filter(r => r.cls === "UNASSIGNED").length;
  const fully          = rows.filter(r => r.cls === "FULLY_ASSIGNED").length;
  const contactOnly    = rows.filter(r => r.cls === "CONTACT_ONLY").length;
  const invOnly        = rows.filter(r => r.cls === "INV_ONLY").length;

  const TABS = ["ALL", "FULLY_ASSIGNED", "CONTACT_ONLY", "INV_ONLY", "UNASSIGNED"];
  const visible = rows.filter(r => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (search) {
      const name = r.task.name || r.task.title || "";
      if (!name.toLowerCase().includes(search.toLowerCase())) return false;
    }
    return true;
  });

  async function assess() {
    if (assessing) return;
    setAssessing(true); setAiText("");
    try {
      const base   = apiBase();
      const script = await buildTciasgnScript();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ message: `Task assignment bridge analysis:\n${script}\n\nUnassigned tasks:\n${rows.filter(r => r.cls === "UNASSIGNED").slice(0, 8).map(r => `- ${r.task.name || r.task.title || "?"}: ${r.task.description || ""}`).join("\n")}\n\nProvide a concise 3-sentence ownership recommendation.` }),
      });
      if (r.ok) {
        const d = await r.json();
        const reply = (d.answer || d.response || d.message || script).slice(0, 600);
        setAiText(reply);
        const voice = (typeof getActiveVoice === "function" ? getActiveVoice() : null) || "ash";
        await fetch(`${base}/v1/voice/tts`, {
          method: "POST",
          headers: { ...authHdr(), "Content-Type": "application/json" },
          body: JSON.stringify({ text: script, voice }),
        });
      }
    } catch (_) {}
    setAssessing(false);
  }

  const CLS_COL = {
    FULLY_ASSIGNED: GR,
    CONTACT_ONLY:   CY,
    INV_ONLY:       AM,
    UNASSIGNED:     RD,
  };

  const btnPulse = unassigned > 0;

  return (
    <>
      {/* Fixed toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: Z,
          background: open ? `rgba(41,231,255,0.18)` : `rgba(5,12,20,0.82)`,
          border: `1px solid ${open ? CY : DIM}`,
          borderRadius: 6,
          color: open ? CY : DIM,
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: 1.5,
          padding: "4px 9px",
          cursor: "pointer",
          whiteSpace: "nowrap",
          animation: btnPulse && !open ? "tciasgn-pulse 2.4s ease-in-out infinite" : "none",
        }}
        title="Task × Contact × Investigation Assignment Bridge"
      >
        ◈ TCIASGN
      </button>

      <style>{`
        @keyframes tciasgn-pulse {
          0%,100% { border-color: ${DIM}; box-shadow: none; }
          50%      { border-color: ${RD}; box-shadow: 0 0 8px ${RD}66; }
        }
      `}</style>

      {/* Panel */}
      {open && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: Z + 100,
            background: "rgba(0,4,8,0.82)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: SANS,
          }}
          onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div style={{
            width: "min(960px,96vw)", maxHeight: "88vh",
            background: "rgba(5,12,20,0.97)", border: `1px solid ${CY}44`,
            borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden",
            boxShadow: `0 0 40px ${CY}18`,
          }}>
            {/* Header */}
            <div style={{ padding: "14px 18px 10px", borderBottom: `1px solid ${CY}22`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontFamily: MONO, color: CY, fontSize: 13, letterSpacing: 2 }}>
                ◈ TASK × CONTACT × INVESTIGATION BRIDGE (TCIASGN)
              </div>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>

            {/* Stat tiles */}
            <div style={{ display: "flex", gap: 8, padding: "10px 18px", borderBottom: `1px solid ${CY}12` }}>
              {[
                { label: "TASKS",          val: rows.length,    col: CY },
                { label: "FULLY ASSIGNED", val: fully,          col: GR },
                { label: "CONTACT ONLY",   val: contactOnly,    col: CY },
                { label: "INV ONLY",       val: invOnly,        col: AM },
                { label: "UNASSIGNED",     val: unassigned,     col: RD },
              ].map(s => (
                <div key={s.label} style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
                  <div style={{ color: s.col, fontFamily: MONO, fontSize: 18, fontWeight: 700 }}>{loading ? "…" : s.val}</div>
                  <div style={{ color: "#555", fontSize: 9, letterSpacing: 1.2, fontFamily: MONO, marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Controls */}
            <div style={{ padding: "8px 18px", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {TABS.map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  background: tab === t ? `${CY}22` : "transparent",
                  border: `1px solid ${tab === t ? CY : "#333"}`,
                  color: tab === t ? CY : "#666",
                  fontFamily: MONO, fontSize: 9, padding: "3px 8px",
                  borderRadius: 4, cursor: "pointer", letterSpacing: 0.8,
                }}>{t.replace("_", " ")}</button>
              ))}
              <input
                placeholder="search tasks…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  flex: 1, minWidth: 120, background: "rgba(255,255,255,0.05)",
                  border: "1px solid #333", color: "#ccc",
                  fontFamily: MONO, fontSize: 10, padding: "4px 8px",
                  borderRadius: 4, outline: "none",
                }}
              />
              <button onClick={load} style={{ background: "transparent", border: `1px solid #333`, color: "#555", fontFamily: MONO, fontSize: 9, padding: "3px 8px", borderRadius: 4, cursor: "pointer" }}>↺</button>
              <button
                onClick={assess}
                disabled={assessing || !rows.length}
                style={{
                  background: assessing ? `rgba(41,231,255,0.1)` : `rgba(41,231,255,0.15)`,
                  border: `1px solid ${CY}`, color: CY,
                  fontFamily: MONO, fontSize: 9, padding: "3px 8px",
                  borderRadius: 4, cursor: "pointer", letterSpacing: 1,
                  opacity: assessing ? 0.6 : 1,
                }}
              >{assessing ? "…" : "▶ ASSESS"}</button>
            </div>

            {/* Row list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "0 18px 14px" }}>
              {error && <div style={{ color: RD, fontFamily: MONO, fontSize: 10, padding: "8px 0" }}>ERROR: {error}</div>}
              {!loading && !error && visible.length === 0 && (
                <div style={{ color: GR, fontFamily: MONO, fontSize: 11, padding: "16px 0", textAlign: "center" }}>
                  ✓ No tasks match this filter.
                </div>
              )}
              {visible.map(row => {
                const name  = row.task.name || row.task.title || "Unnamed Task";
                const desc  = row.task.description || row.task.assignee || "";
                const col   = CLS_COL[row.cls] || CY;
                const isExp = expanded === row.id;
                const pulse = row.cls === "UNASSIGNED";
                return (
                  <div
                    key={row.id}
                    style={{
                      borderBottom: `1px solid rgba(255,255,255,0.06)`,
                      padding: "7px 0",
                      animation: pulse ? "tciasgn-pulse 2.4s ease-in-out infinite" : "none",
                    }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                      onClick={() => setExpanded(isExp ? null : row.id)}
                    >
                      <div style={{ flexShrink: 0, width: 110, fontFamily: MONO, fontSize: 9, color: col, letterSpacing: 0.8 }}>
                        {row.cls.replace("_", " ")}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: "#e0e0e0", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {name}
                        </div>
                        {desc && (
                          <div style={{ color: "#555", fontSize: 10, fontFamily: MONO, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {desc}
                          </div>
                        )}
                      </div>
                      <div style={{ color: "#444", fontSize: 10 }}>{isExp ? "▲" : "▼"}</div>
                    </div>

                    {/* Expanded detail */}
                    {isExp && (
                      <div style={{ paddingLeft: 118, paddingTop: 6 }}>
                        {row.matchedContacts.length > 0 && (
                          <div style={{ marginBottom: 6 }}>
                            <div style={{ color: "#555", fontFamily: MONO, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>CONTACTS</div>
                            {row.matchedContacts.map((c, i) => (
                              <div key={i} style={{ marginBottom: 4 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                                  <div style={{ color: CY, fontSize: 10, minWidth: 140, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                                  {c.role && <div style={{ color: "#555", fontSize: 9, fontFamily: MONO }}>{c.role}</div>}
                                </div>
                                <div style={{ height: 3, borderRadius: 2, background: "#1a2a3a", width: "60%" }}>
                                  <div style={{ height: 3, borderRadius: 2, background: CY, width: `${Math.min(100, c.score * 20)}%` }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {row.matchedInvestigations.length > 0 && (
                          <div>
                            <div style={{ color: "#555", fontFamily: MONO, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>INVESTIGATIONS</div>
                            {row.matchedInvestigations.map((inv, i) => (
                              <div key={i} style={{ marginBottom: 4 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                                  <div style={{ color: AM, fontSize: 10, minWidth: 140, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{inv.title}</div>
                                  {inv.status && <div style={{ color: "#555", fontSize: 9, fontFamily: MONO }}>{inv.status}</div>}
                                </div>
                                <div style={{ height: 3, borderRadius: 2, background: "#1a2a3a", width: "60%" }}>
                                  <div style={{ height: 3, borderRadius: 2, background: AM, width: `${Math.min(100, inv.score * 20)}%` }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {row.matchedContacts.length === 0 && row.matchedInvestigations.length === 0 && (
                          <div style={{ color: RD, fontFamily: MONO, fontSize: 9 }}>⚠ No contact or investigation match — ownership gap</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* AI text */}
            {aiText && (
              <div style={{ borderTop: `1px solid ${CY}22`, padding: "10px 18px", background: `${CY}08` }}>
                <div style={{ color: "#888", fontFamily: MONO, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>JARVIS ASSESSMENT</div>
                <div style={{ color: "#ccc", fontSize: 11, lineHeight: 1.6 }}>{aiText}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
