/**
 * F70 — Contact × IntelProfile Cross-Reference (CIPR)
 *
 * Answers: "Which contacts already have intelligence profiles, and which
 *           are unknown to the intelligence system?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /entities/Contact      → known contacts / people
 *   GET /entities/IntelProfile → active intelligence profiles
 *
 * Each Contact's name/organization/email/tags is keyword-matched against
 * each IntelProfile's name/aliases/organization/role/tags to produce:
 *   PROFILED — at least one intel profile correlates to this contact
 *   UNKNOWN  — no intel profile covers this contact
 *
 * Stat tiles:  contacts / profiles / profiled / unknown
 * Amber badge: unknown count on button (gaps in intelligence coverage).
 * Expand row:  matched intel profiles with role badge + relevance score bar.
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ CIPR  at left:1740 bottom:18, zIndex:68.
 * Event:   jarvis:cipr-toggle
 * Voice:   "contact profile / intel contact / cipr / profiled contacts /
 *           contact intel match / who is profiled / contact intelligence match /
 *           contact cross reference / unknown contacts / intel coverage"
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

const BTN_LEFT   = 1740;
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

function scoreMatch(contact, profile) {
  const contactTokens = new Set([
    ...tokens(contact.name),
    ...tokens(contact.organization),
    ...tokens(contact.email),
    ...tokens(Array.isArray(contact.tags) ? contact.tags.join(" ") : contact.tags),
  ]);
  const profileSrc = [
    profile.name,
    profile.organization,
    profile.role,
    Array.isArray(profile.aliases) ? profile.aliases.join(" ") : profile.aliases,
    Array.isArray(profile.tags) ? profile.tags.join(" ") : profile.tags,
  ].join(" ");
  const profileTokens = tokens(profileSrc);
  return profileTokens.filter(t => contactTokens.has(t)).length;
}

// ─── fetch ───────────────────────────────────────────────────────────────────

async function fetchAll() {
  const base    = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [cr, pr] = await Promise.all([
    fetch(`${base}/entities/Contact`,      { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/entities/IntelProfile`, { headers }).then(r => r.json()).catch(() => []),
  ]);
  const contacts  = normArr(cr);
  const profiles  = normArr(pr);
  const correlated = contacts.map(c => {
    const matches = profiles
      .map(p => ({ profile: p, sc: scoreMatch(c, p) }))
      .filter(x => x.sc > 0)
      .sort((a, b) => b.sc - a.sc);
    return {
      contact: c,
      classification: matches.length > 0 ? "PROFILED" : "UNKNOWN",
      matches,
    };
  });
  return { correlated, contactCount: contacts.length, profileCount: profiles.length };
}

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isCiprQuery(q) {
  const t = q.toLowerCase();
  return (
    t.includes("contact profile") || t.includes("intel contact") ||
    t.includes("cipr") || t.includes("profiled contact") ||
    t.includes("contact intel match") || t.includes("who is profiled") ||
    t.includes("contact intelligence match") || t.includes("contact cross reference") ||
    t.includes("unknown contact") || t.includes("intel coverage contact") ||
    t.includes("contact profiling")
  );
}

export async function buildCiprScript() {
  try {
    const base    = apiBase();
    const headers = { Authorization: `Bearer ${API_KEY}` };
    const [cr, pr] = await Promise.all([
      fetch(`${base}/entities/Contact`,      { headers }).then(r => r.json()).catch(() => []),
      fetch(`${base}/entities/IntelProfile`, { headers }).then(r => r.json()).catch(() => []),
    ]);
    const contacts = normArr(cr);
    const profiles = normArr(pr);
    const profiled = contacts.filter(c => profiles.some(p => scoreMatch(c, p) > 0)).length;
    const unknown  = contacts.length - profiled;
    return (
      `Contact Intelligence Coverage: ${contacts.length} contacts, ${profiles.length} intel profiles. ` +
      `${profiled} contacts have matching intel profiles. ` +
      `${unknown} contacts are not covered by the intelligence system. ` +
      (unknown > 0
        ? `Top unknown contact: ${
            contacts.find(c => !profiles.some(p => scoreMatch(c, p) > 0))?.name || "unknown"
          }.`
        : "All contacts have intelligence coverage.")
    );
  } catch (e) {
    return `Contact intel cross-reference check failed: ${e.message}`;
  }
}

// ─── assess ──────────────────────────────────────────────────────────────────

async function runAssess(correlated, setText, speak) {
  const profiled = correlated.filter(c => c.classification === "PROFILED").length;
  const unknown  = correlated.filter(c => c.classification === "UNKNOWN").length;
  const topUnknown = correlated
    .filter(c => c.classification === "UNKNOWN")
    .slice(0, 2)
    .map(c => c.contact?.name || "?")
    .join(", ");
  const prompt =
    `You are JARVIS. In 2 sentences, brief the operator on Contact × IntelProfile coverage: ` +
    `${profiled} contacts have matching intelligence profiles, ${unknown} are unknown to the intel system. ` +
    `${unknown > 0 ? `Top unknown contacts: ${topUnknown}.` : "All contacts have intel coverage."} ` +
    `Conclude with the most urgent intelligence action required.`;
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

export default function ContactIntelProfileCrossRef() {
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
    window.addEventListener("jarvis:cipr-toggle", handler);
    return () => window.removeEventListener("jarvis:cipr-toggle", handler);
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
    const unknownCount =
      data?.correlated?.filter(c => c.classification === "UNKNOWN").length ?? 0;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Contact × IntelProfile Cross-Reference (CIPR)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
          background: "rgba(4,7,14,0.82)", border: `1px solid ${AMBER}44`,
          color: AMBER, fontFamily: MONO, fontSize: 10, letterSpacing: 1,
          padding: "3px 8px", borderRadius: 3, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 5,
        }}
      >
        ◈ CIPR
        {unknownCount > 0 && (
          <span style={{
            background: AMBER, color: "#000", borderRadius: 8,
            padding: "0 5px", fontSize: 9, fontWeight: 700,
          }}>{unknownCount}</span>
        )}
      </button>
    );
  }

  const { correlated = [], contactCount = 0, profileCount = 0 } = data || {};
  const profiled = correlated.filter(c => c.classification === "PROFILED").length;
  const unknown  = correlated.filter(c => c.classification === "UNKNOWN").length;

  const visible = correlated.filter(c => {
    if (filter === "PROFILED" && c.classification !== "PROFILED") return false;
    if (filter === "UNKNOWN"  && c.classification !== "UNKNOWN")  return false;
    if (search) {
      const q    = search.toLowerCase();
      const name = String(c.contact?.name         || "").toLowerCase();
      const org  = String(c.contact?.organization || "").toLowerCase();
      if (!name.includes(q) && !org.includes(q)) return false;
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
          ◈ CONTACT × INTEL PROFILE COVERAGE
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
          ["CONTACTS",  contactCount,  CY],
          ["PROFILES",  profileCount,  CY],
          ["PROFILED",  profiled,      GREEN],
          ["UNKNOWN",   unknown,       AMBER],
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
        {["ALL", "PROFILED", "UNKNOWN"].map(f => (
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
          const col     = c.classification === "PROFILED" ? GREEN : AMBER;
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
                  background: col, color: "#000", borderRadius: 3,
                  padding: "1px 6px", fontSize: 8, fontWeight: 700, flexShrink: 0,
                }}>
                  {c.classification}
                </span>
                <span style={{ color: CY, flex: 1, fontSize: 11 }}>
                  {contact.name || contact.id || "Unknown Contact"}
                </span>
                {contact.organization && (
                  <span style={{ color: MUTED, fontSize: 9 }}>
                    {contact.organization}
                  </span>
                )}
                <span style={{ color: MUTED, fontSize: 9 }}>
                  {c.matches.length} profile{c.matches.length !== 1 ? "s" : ""}
                </span>
                <span style={{ color: MUTED, fontSize: 9 }}>{isEx ? "▲" : "▼"}</span>
              </div>

              {isEx && (
                <div style={{
                  padding: "0 12px 8px 12px",
                  background: "rgba(255,255,255,0.02)",
                }}>
                  {contact.email && (
                    <div style={{ color: MUTED, fontSize: 9, marginBottom: 4 }}>
                      {contact.email}
                    </div>
                  )}
                  {c.matches.length === 0 ? (
                    <div style={{ color: AMBER, fontSize: 9 }}>
                      No intel profiles match this contact.
                    </div>
                  ) : (
                    c.matches.slice(0, 5).map((m, mi) => {
                      const profile = m.profile || {};
                      const maxSc   = c.matches[0]?.sc || 1;
                      const pct     = Math.round((m.sc / maxSc) * 100);
                      return (
                        <div key={mi} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {profile.role && (
                              <span style={{
                                background: `${CY}22`, color: CY,
                                borderRadius: 3, padding: "1px 5px", fontSize: 8, flexShrink: 0,
                              }}>
                                {profile.role}
                              </span>
                            )}
                            <span style={{ color: CY, fontSize: 10, flex: 1 }}>
                              {profile.name || profile.id || "Unknown Profile"}
                            </span>
                            <span style={{ color: MUTED, fontSize: 8 }}>{m.sc}pt</span>
                          </div>
                          <div style={{
                            height: 2, background: `${CY}22`,
                            borderRadius: 1, margin: "2px 0 0",
                          }}>
                            <div style={{
                              height: 2, width: `${pct}%`,
                              background: GREEN, borderRadius: 1,
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
        <span>CONTACT × INTEL — {visible.length}/{correlated.length} contacts</span>
        <span>auto-refresh 90s</span>
      </div>
    </div>
  );
}
