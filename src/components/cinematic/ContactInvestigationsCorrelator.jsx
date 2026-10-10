/**
 * F86 — Contact × Investigations Correlator (CINVTG)
 *
 * Answers: "Which contacts in the system are linked to open investigations,
 *           and which contacts are completely clear?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /entities/Contact     → contact roster (name/email/org/role/tags)
 *   GET /v1/investigations    → open investigation cases
 *
 * Each contact's name/email/organization/role/tags is keyword-matched against
 * each investigation's title/description/annotations/seeds to produce:
 *   IMPLICATED — at least one investigation correlates to this contact
 *   CLEAR      — no investigation links to this contact
 *
 * Stat tiles:  contacts / investigations / implicated / clear
 * Amber badge: implicated count on button.
 * Expand row:  matched investigations with relevance score bar.
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ CINVTG  at left:2640 bottom:18, zIndex:68.
 * Event:   jarvis:cinvtg-toggle
 * Voice:   "contact investigation / investigation contact / cinvtg / implicated contacts /
 *           who is under investigation / contact case / contacts in cases / contact intel case /
 *           contact probe / linked contacts"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3B6B";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 2640;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function normArr(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  return [];
}

function tokens(str) {
  return String(str || "").toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function contactText(c) {
  return [
    c.name, c.email, c.organization, c.org, c.role, c.title,
    Array.isArray(c.tags) ? c.tags.join(" ") : c.tags,
  ].join(" ");
}

function investigationText(inv) {
  const annotationText = Array.isArray(inv.annotations)
    ? inv.annotations.map(a => [a.actor, a.target, a.text].join(" ")).join(" ")
    : "";
  const seedText = Array.isArray(inv.seeds)
    ? inv.seeds.join(" ")
    : "";
  return [
    inv.title, inv.name, inv.description, inv.summary,
    annotationText, seedText,
  ].join(" ");
}

function scoreMatch(contact, inv) {
  const cTok = new Set(tokens(contactText(contact)));
  const iTok = tokens(investigationText(inv));
  return iTok.filter(t => cTok.has(t)).length;
}

// ─── fetch ───────────────────────────────────────────────────────────────────

async function fetchAll() {
  const base    = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [cr, ir] = await Promise.all([
    fetch(`${base}/entities/Contact`,  { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/v1/investigations`, { headers }).then(r => r.json()).catch(() => []),
  ]);
  const contacts      = normArr(cr);
  const investigations = normArr(ir);
  const correlated = contacts.map(contact => {
    const matches = investigations
      .map(inv => ({ inv, sc: scoreMatch(contact, inv) }))
      .filter(x => x.sc > 0)
      .sort((a, b) => b.sc - a.sc);
    return {
      contact,
      classification: matches.length > 0 ? "IMPLICATED" : "CLEAR",
      matches,
    };
  });
  return {
    correlated,
    contactCount: contacts.length,
    invCount: investigations.length,
  };
}

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isCinvtgQuery(q) {
  const t = q.toLowerCase();
  return (
    t.includes("contact investigation") || t.includes("investigation contact") ||
    t.includes("cinvtg") || t.includes("implicated contact") ||
    t.includes("who is under investigation") || t.includes("contact case") ||
    t.includes("contacts in case") || t.includes("contact intel case") ||
    t.includes("contact probe") || t.includes("linked contacts") ||
    t.includes("contact under investigation") || t.includes("contact investigation link")
  );
}

export async function buildCinvtgScript() {
  try {
    const base    = apiBase();
    const headers = { Authorization: `Bearer ${API_KEY}` };
    const [cr, ir] = await Promise.all([
      fetch(`${base}/entities/Contact`,  { headers }).then(r => r.json()).catch(() => []),
      fetch(`${base}/v1/investigations`, { headers }).then(r => r.json()).catch(() => []),
    ]);
    const contacts      = normArr(cr);
    const investigations = normArr(ir);
    const implicated = contacts.filter(c =>
      investigations.some(inv => scoreMatch(c, inv) > 0)
    ).length;
    const clear = contacts.length - implicated;
    const topImplicated = contacts
      .filter(c => investigations.some(inv => scoreMatch(c, inv) > 0))
      .slice(0, 2)
      .map(c => c.name || c.email || "?")
      .join(", ");
    return (
      `Contact × Investigation Correlator: ${contacts.length} contacts, ` +
      `${investigations.length} open investigations. ` +
      `${implicated} contacts are linked to active investigations` +
      (topImplicated ? ` (top: ${topImplicated})` : "") +
      `. ${clear} contacts are clear.`
    );
  } catch (e) {
    return `Contact investigation check failed: ${e.message}`;
  }
}

// ─── assess ──────────────────────────────────────────────────────────────────

async function runAssess(correlated, setText, speak) {
  const implicated = correlated.filter(c => c.classification === "IMPLICATED").length;
  const clear      = correlated.filter(c => c.classification === "CLEAR").length;
  const topLinked  = correlated
    .filter(c => c.classification === "IMPLICATED")
    .slice(0, 2)
    .map(c => c.contact?.name || c.contact?.email || "?")
    .join(", ");
  const prompt =
    `You are JARVIS. In 2 sentences, brief the operator on Contact × Investigation correlation: ` +
    `${implicated} contacts are linked to open investigations` +
    (topLinked ? ` (including ${topLinked})` : "") +
    `, ${clear} are clear. ` +
    `Conclude with the most urgent operational recommendation.`;
  const base    = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
  try {
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST", headers, body: JSON.stringify({ message: prompt }),
    });
    const j    = await r.json();
    const text = j.response || j.reply || j.message || JSON.stringify(j);
    setText(text);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    speak(text);
  } catch (e) {
    setText(`ASSESS error: ${e.message}`);
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function ContactInvestigationsCorrelator() {
  const [open, setOpen]             = useState(false);
  const [data, setData]             = useState(null);
  const [loading, setLoading]       = useState(false);
  const [err, setErr]               = useState(null);
  const [filter, setFilter]         = useState("ALL");
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [assessText, setAssessText] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const result = await fetchAll();
      setData(result);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener("jarvis:cinvtg-toggle", handler);
    return () => window.removeEventListener("jarvis:cinvtg-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const speak = useCallback((text) => {
    const base = apiBase();
    fetch(`${base}/v1/voice/tts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: localStorage.getItem("jarvis_voice") || "ash" }),
    }).then(r => r.blob()).then(b => {
      const url = URL.createObjectURL(b);
      new Audio(url).play().catch(() => {});
    }).catch(() => {});
  }, []);

  if (!open) {
    const implicatedCount =
      data?.correlated?.filter(c => c.classification === "IMPLICATED").length ?? 0;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Contact × Investigations Correlator (CINVTG)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
          background: "rgba(4,7,14,0.82)", border: `1px solid ${AMBER}44`,
          color: AMBER, fontFamily: MONO, fontSize: 10, letterSpacing: 1,
          padding: "3px 8px", borderRadius: 3, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 5,
        }}
      >
        ◈ CINVTG
        {implicatedCount > 0 && (
          <span style={{
            background: AMBER, color: "#000", borderRadius: 8,
            padding: "0 5px", fontSize: 9, fontWeight: 700,
          }}>{implicatedCount}</span>
        )}
      </button>
    );
  }

  const { correlated = [], contactCount = 0, invCount = 0 } = data || {};
  const implicated = correlated.filter(c => c.classification === "IMPLICATED").length;
  const clear      = correlated.filter(c => c.classification === "CLEAR").length;

  const visible = correlated.filter(c => {
    if (filter === "IMPLICATED" && c.classification !== "IMPLICATED") return false;
    if (filter === "CLEAR"      && c.classification !== "CLEAR")      return false;
    if (search) {
      const q    = search.toLowerCase();
      const name = String(c.contact?.name  || "").toLowerCase();
      const org  = String(c.contact?.organization || c.contact?.org || "").toLowerCase();
      const email = String(c.contact?.email || "").toLowerCase();
      if (!name.includes(q) && !org.includes(q) && !email.includes(q)) return false;
    }
    return true;
  });

  const TAB_STYLE = (active, col = AMBER) => ({
    background: active ? col : "transparent",
    color: active ? "#000" : MUTED,
    border: `1px solid ${active ? col : MUTED}44`,
    borderRadius: 3, padding: "2px 8px", fontSize: 9,
    fontFamily: MONO, cursor: "pointer", letterSpacing: 1,
  });

  return (
    <div style={{
      position: "fixed", right: 18, top: 60, width: 520, maxHeight: "80vh",
      background: BG, border: `1px solid ${AMBER}55`, borderRadius: 6,
      fontFamily: MONO, fontSize: 11, color: CY, zIndex: 160,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", borderBottom: `1px solid ${AMBER}33`,
        flexShrink: 0,
      }}>
        <span style={{ color: AMBER, fontWeight: 700, letterSpacing: 2 }}>
          ◈ CONTACT × INVESTIGATIONS
        </span>
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: MUTED,
          cursor: "pointer", fontSize: 14, lineHeight: 1,
        }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4,1fr)",
        gap: 6, padding: "8px 12px", flexShrink: 0,
      }}>
        {[
          ["CONTACTS",    contactCount, CY],
          ["CASES",       invCount,     CY],
          ["IMPLICATED",  implicated,   AMBER],
          ["CLEAR",       clear,        GREEN],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: "rgba(255,255,255,0.03)", border: `1px solid ${col}33`,
            borderRadius: 4, padding: "5px 8px", textAlign: "center",
          }}>
            <div style={{ color: col, fontSize: 13, fontWeight: 700 }}>{loading ? "…" : val}</div>
            <div style={{ color: MUTED, fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* filter tabs + search */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "0 12px 6px", flexShrink: 0, flexWrap: "wrap",
      }}>
        {["ALL", "IMPLICATED", "CLEAR"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={TAB_STYLE(filter === f)}>
            {f}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search contacts…"
          style={{
            background: "rgba(255,255,255,0.04)", border: `1px solid ${MUTED}44`,
            color: CY, fontFamily: MONO, fontSize: 10, borderRadius: 3,
            padding: "2px 8px", outline: "none", flex: 1, minWidth: 100,
          }}
        />
        <button
          onClick={async () => {
            if (assessing) return;
            setAssessing(true); setAssessText("");
            await runAssess(correlated, setAssessText, speak);
            setAssessing(false);
          }}
          style={TAB_STYLE(false, CY)}
        >
          {assessing ? "…" : "▶ ASSESS"}
        </button>
      </div>

      {assessText && (
        <div style={{
          margin: "0 12px 6px", padding: "6px 10px",
          background: "rgba(41,231,255,0.06)", border: `1px solid ${CY}33`,
          borderRadius: 4, color: CY, fontSize: 10, lineHeight: 1.5,
          flexShrink: 0,
        }}>
          {assessText}
        </div>
      )}

      {err && (
        <div style={{ margin: "0 12px 6px", color: RED, fontSize: 10, flexShrink: 0 }}>
          {err}
        </div>
      )}

      {/* list */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: MUTED, textAlign: "center", padding: 18, fontSize: 10 }}>
            No contacts match filter.
          </div>
        )}
        {visible.map((c, i) => {
          const contact = c.contact || {};
          const isEx    = expanded === i;
          const col     = c.classification === "IMPLICATED" ? AMBER : GREEN;
          return (
            <div key={i} style={{
              borderBottom: `1px solid ${CY}0D`,
              cursor: "pointer",
            }} onClick={() => setExpanded(isEx ? null : i)}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "7px 12px",
              }}>
                <span style={{
                  background: col + (c.classification === "IMPLICATED" ? "" : "33"),
                  color: c.classification === "IMPLICATED" ? "#000" : GREEN,
                  borderRadius: 3, padding: "1px 6px",
                  fontSize: 8, fontWeight: 700, flexShrink: 0,
                }}>
                  {c.classification}
                </span>
                <span style={{ color: CY, flex: 1, fontSize: 11 }}>
                  {contact.name || contact.email || contact.id || "Unknown Contact"}
                </span>
                {contact.organization || contact.org ? (
                  <span style={{
                    color: MUTED, fontSize: 9,
                    maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {contact.organization || contact.org}
                  </span>
                ) : null}
                <span style={{ color: MUTED, fontSize: 9 }}>
                  {c.matches.length} case{c.matches.length !== 1 ? "s" : ""}
                </span>
                <span style={{ color: MUTED, fontSize: 9 }}>{isEx ? "▲" : "▼"}</span>
              </div>

              {isEx && (
                <div style={{
                  padding: "0 12px 8px 12px",
                  background: "rgba(255,255,255,0.02)",
                }}>
                  {contact.role && (
                    <div style={{ color: MUTED, fontSize: 9, marginBottom: 4 }}>
                      Role: {contact.role}
                      {contact.email ? ` · ${contact.email}` : ""}
                    </div>
                  )}
                  {c.matches.length === 0 ? (
                    <div style={{ color: GREEN, fontSize: 9 }}>
                      No investigations linked to this contact.
                    </div>
                  ) : (
                    c.matches.slice(0, 5).map((m, mi) => {
                      const inv   = m.inv || {};
                      const maxSc = c.matches[0]?.sc || 1;
                      const pct   = Math.round((m.sc / maxSc) * 100);
                      return (
                        <div key={mi} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{
                              background: AMBER + "33", color: AMBER,
                              borderRadius: 3, padding: "1px 5px",
                              fontSize: 8, flexShrink: 0,
                            }}>
                              CASE
                            </span>
                            <span style={{ color: CY, fontSize: 10, flex: 1 }}>
                              {inv.title || inv.name || inv.id || "Untitled Investigation"}
                            </span>
                            <span style={{ color: MUTED, fontSize: 8 }}>{m.sc}pt</span>
                          </div>
                          <div style={{
                            height: 2, background: `${AMBER}22`,
                            borderRadius: 1, margin: "2px 0 0",
                          }}>
                            <div style={{
                              height: 2, width: `${pct}%`,
                              background: AMBER, borderRadius: 1,
                            }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{
        borderTop: `1px solid ${AMBER}22`, padding: "5px 12px",
        color: MUTED, fontSize: 9, letterSpacing: 1, flexShrink: 0,
        display: "flex", justifyContent: "space-between",
      }}>
        <span>CONTACT × CASES — {visible.length}/{correlated.length} contacts</span>
        <span>auto-refresh 90s</span>
      </div>
    </div>
  );
}
