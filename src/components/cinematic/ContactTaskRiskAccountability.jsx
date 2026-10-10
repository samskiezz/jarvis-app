/**
 * F73 – Contact × Task × RiskSignal Accountability Matrix (CTRACCT)
 * Cross-correlates /entities/Contact × /entities/Task × /entities/RiskSignal.
 * Classifies each contact:
 *   FULLY_ACCOUNTABLE – has backing tasks AND related risk signals
 *   TASK_OWNER        – has tasks, no risk signals
 *   RISK_EXPOSED      – has risk signals, no tasks
 *   UNACCOUNTABLE     – no tasks or risk signals (accountability gap)
 * UNACCOUNTABLE rows pulse red.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const BTN_LEFT   = 955320;
const Z          = 655;
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
    item.name, item.title, item.description,
    item.type, item.kind, item.category,
    item.role, item.organisation, item.org,
    item.source, item.tags,
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

function classify(contact, tasks, riskSignals) {
  const ck = kw(contact);
  const matchedTasks = tasks.filter(t  => overlap(ck, kw(t))  >= 2);
  const matchedRisks = riskSignals.filter(rs => overlap(ck, kw(rs)) >= 2);

  const hasTask = matchedTasks.length > 0;
  const hasRisk = matchedRisks.length > 0;
  let cls;
  if (hasTask && hasRisk)  cls = "FULLY_ACCOUNTABLE";
  else if (hasTask)        cls = "TASK_OWNER";
  else if (hasRisk)        cls = "RISK_EXPOSED";
  else                     cls = "UNACCOUNTABLE";

  return {
    id: contact.id || contact.name || Math.random().toString(36).slice(2),
    contact,
    cls,
    matchedTasks: matchedTasks.slice(0, 5).map(t => ({
      name:   t.name || t.title || "?",
      status: t.status || "",
      score:  overlap(ck, kw(t)),
    })),
    matchedRisks: matchedRisks.slice(0, 5).map(rs => ({
      name:     rs.name || rs.title || "?",
      severity: rs.severity || rs.level || "",
      score:    overlap(ck, kw(rs)),
    })),
  };
}

async function loadAll(base) {
  const [cr, tr, rr] = await Promise.all([
    fetch(`${base}/entities/Contact`,    { headers: authHdr() }),
    fetch(`${base}/entities/Task`,       { headers: authHdr() }),
    fetch(`${base}/entities/RiskSignal`, { headers: authHdr() }),
  ]);
  const [cd, td, rd] = await Promise.all([
    cr.ok ? cr.json() : [],
    tr.ok ? tr.json() : [],
    rr.ok ? rr.json() : [],
  ]);
  const contacts    = Array.isArray(cd) ? cd : cd.data || cd.items || [];
  const tasks       = Array.isArray(td) ? td : td.data || td.items || [];
  const riskSignals = Array.isArray(rd) ? rd : rd.data || rd.items || [];
  return { contacts, tasks, riskSignals };
}

// ─── exported helpers for JarvisBrain ────────────────────────────────────────
export function isCtracctQuery(q) {
  return /\b(ctracct|contact\s+accountability|task\s+owner|risk\s+owner|unaccountable\s+contact|accountability\s+gap|contact\s+task\s+risk|contact\s+risk\s+task)\b/i.test(q);
}

export async function buildCtracctScript() {
  try {
    const base = apiBase();
    const { contacts, tasks, riskSignals } = await loadAll(base);
    const rows          = contacts.map(c => classify(c, tasks, riskSignals));
    const unaccountable = rows.filter(r => r.cls === "UNACCOUNTABLE").length;
    const fully         = rows.filter(r => r.cls === "FULLY_ACCOUNTABLE").length;
    return `Contact accountability matrix: ${contacts.length} contacts, ${tasks.length} tasks, ${riskSignals.length} risk signals. Fully accountable (task + risk): ${fully}. Unaccountable (no backing): ${unaccountable}. ${unaccountable > 0 ? `${unaccountable} contacts have no task or risk signal coverage — accountability gaps.` : "All contacts are accounted for."}`;
  } catch (_) {
    return "Contact accountability matrix status unavailable.";
  }
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function ContactTaskRiskAccountability() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [aiText, setAiText]       = useState("");
  const timerRef                  = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const base = apiBase();
      const { contacts, tasks, riskSignals } = await loadAll(base);
      setRows(contacts.map(c => classify(c, tasks, riskSignals)));
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
    window.addEventListener("jarvis:ctracct-toggle", handler);
    return () => window.removeEventListener("jarvis:ctracct-toggle", handler);
  }, []);

  const unaccountable = rows.filter(r => r.cls === "UNACCOUNTABLE").length;
  const fully         = rows.filter(r => r.cls === "FULLY_ACCOUNTABLE").length;
  const taskOwner     = rows.filter(r => r.cls === "TASK_OWNER").length;
  const riskExposed   = rows.filter(r => r.cls === "RISK_EXPOSED").length;

  const TABS = ["ALL", "FULLY_ACCOUNTABLE", "TASK_OWNER", "RISK_EXPOSED", "UNACCOUNTABLE"];
  const visible = rows.filter(r => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (search) {
      const name = r.contact.name || r.contact.title || "";
      if (!name.toLowerCase().includes(search.toLowerCase())) return false;
    }
    return true;
  });

  async function assess() {
    if (assessing) return;
    setAssessing(true); setAiText("");
    try {
      const base   = apiBase();
      const script = await buildCtracctScript();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Contact accountability analysis:\n${script}\n\nUnaccountable contacts:\n${rows.filter(r => r.cls === "UNACCOUNTABLE").slice(0, 6).map(r => `- ${r.contact.name || r.contact.title || "?"}: ${r.contact.role || r.contact.organisation || ""}`).join("\n")}\n\nProvide a concise 3-sentence recommendation on closing the accountability gaps.`,
        }),
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
    FULLY_ACCOUNTABLE: GR,
    TASK_OWNER:        CY,
    RISK_EXPOSED:      AM,
    UNACCOUNTABLE:     RD,
  };

  const btnPulse = unaccountable > 0;

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
          animation: btnPulse && !open ? "ctracct-pulse 2.4s ease-in-out infinite" : "none",
        }}
        title="Contact × Task × RiskSignal Accountability Matrix"
      >
        ◈ CTRACCT
      </button>

      <style>{`
        @keyframes ctracct-pulse {
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
                ◈ CONTACT × TASK × RISKSIGNAL ACCOUNTABILITY MATRIX (CTRACCT)
              </div>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>

            {/* Stat tiles */}
            <div style={{ display: "flex", gap: 8, padding: "10px 18px", borderBottom: `1px solid ${CY}12` }}>
              {[
                { label: "CONTACTS",          val: rows.length,    col: CY },
                { label: "FULLY ACCOUNTABLE", val: fully,          col: GR },
                { label: "TASK OWNER",        val: taskOwner,      col: CY },
                { label: "RISK EXPOSED",      val: riskExposed,    col: AM },
                { label: "UNACCOUNTABLE",     val: unaccountable,  col: RD },
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
                }}>{t.replace(/_/g, " ")}</button>
              ))}
              <input
                placeholder="search contacts…"
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
                  ✓ No contacts match this filter.
                </div>
              )}
              {visible.map(row => {
                const name  = row.contact.name || row.contact.title || "Unnamed Contact";
                const sub   = row.contact.role || row.contact.organisation || row.contact.org || "";
                const col   = CLS_COL[row.cls] || CY;
                const isExp = expanded === row.id;
                const pulse = row.cls === "UNACCOUNTABLE";
                return (
                  <div
                    key={row.id}
                    style={{
                      borderBottom: `1px solid rgba(255,255,255,0.06)`,
                      padding: "7px 0",
                      animation: pulse ? "ctracct-pulse 2.4s ease-in-out infinite" : "none",
                    }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                      onClick={() => setExpanded(isExp ? null : row.id)}
                    >
                      <div style={{ flexShrink: 0, width: 140, fontFamily: MONO, fontSize: 9, color: col, letterSpacing: 0.8 }}>
                        {row.cls.replace(/_/g, " ")}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: "#e0e0e0", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {name}
                        </div>
                        {sub && (
                          <div style={{ color: "#555", fontSize: 10, fontFamily: MONO, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {sub}
                          </div>
                        )}
                      </div>
                      <div style={{ color: "#444", fontSize: 10 }}>{isExp ? "▲" : "▼"}</div>
                    </div>

                    {/* Expanded detail */}
                    {isExp && (
                      <div style={{ paddingLeft: 148, paddingTop: 6 }}>
                        {row.matchedTasks.length > 0 && (
                          <div style={{ marginBottom: 6 }}>
                            <div style={{ color: "#555", fontFamily: MONO, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>TASKS</div>
                            {row.matchedTasks.map((t, i) => (
                              <div key={i} style={{ marginBottom: 4 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                                  <div style={{ color: CY, fontSize: 10, minWidth: 140, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
                                  {t.status && <div style={{ color: "#555", fontSize: 9, fontFamily: MONO }}>{t.status}</div>}
                                </div>
                                <div style={{ height: 3, borderRadius: 2, background: "#1a2a3a", width: "60%" }}>
                                  <div style={{ height: 3, borderRadius: 2, background: CY, width: `${Math.min(100, t.score * 20)}%` }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {row.matchedRisks.length > 0 && (
                          <div>
                            <div style={{ color: "#555", fontFamily: MONO, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>RISK SIGNALS</div>
                            {row.matchedRisks.map((rs, i) => (
                              <div key={i} style={{ marginBottom: 4 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                                  <div style={{ color: RD, fontSize: 10, minWidth: 140, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rs.name}</div>
                                  {rs.severity && <div style={{ color: "#555", fontSize: 9, fontFamily: MONO }}>{rs.severity}</div>}
                                </div>
                                <div style={{ height: 3, borderRadius: 2, background: "#1a2a3a", width: "60%" }}>
                                  <div style={{ height: 3, borderRadius: 2, background: RD, width: `${Math.min(100, rs.score * 20)}%` }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {row.matchedTasks.length === 0 && row.matchedRisks.length === 0 && (
                          <div style={{ color: RD, fontFamily: MONO, fontSize: 9 }}>⚠ No task or risk signal match — accountability gap</div>
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
