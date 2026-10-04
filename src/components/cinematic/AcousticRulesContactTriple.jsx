/**
 * F688 — Acoustic × Rules × Contact Triple Nexus (ACRLCNT)
 * Three-way cross-reference: /v1/acoustic/contacts × /v1/rules × /entities/Contact.
 * Each acoustic contact is classified:
 *   FULLY_WATCHED  — matches ≥1 rule AND ≥1 contact directory entry (monitored and known)
 *   RULE_ONLY      — rule match but no contact directory entry (monitored, unregistered)
 *   CONTACT_ONLY   — contact directory match but no rule (registered, unwatched)
 *   DARK           — neither rule nor contact directory match (intelligence gap)
 * Coverage % tile = FULLY_WATCHED / total contacts.
 * Tabs: ALL / FULLY_WATCHED / RULE_ONLY / CONTACT_ONLY / DARK + search.
 * Click-to-expand shows matched rules + matched directory contacts per acoustic contact.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence monitoring brief + TTS.
 * 90-second auto-refresh. Event: jarvis:acrlcnt-toggle.
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 142_360;
const Z_INDEX  = 224;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const ACRLCNT_RE = /\b(acrlcnt|acoustic\s+rules?\s+contact|acoustic\s+contact\s+rules?|acoustic\s+monitored|sensor\s+contact\s+rule|rule\s+contact\s+acoustic|acoustic\s+watch|monitored\s+contact\s+nexus|acoustic\s+compliance\s+contact|rules?\s+nexus\s+acoustic)\b/i;

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

function normaliseRules(raw) {
  if (Array.isArray(raw))        return raw;
  if (Array.isArray(raw?.rules)) return raw.rules;
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw?.data))  return raw.data;
  return [];
}

function normaliseDirectory(raw) {
  if (Array.isArray(raw))            return raw;
  if (Array.isArray(raw?.contacts))  return raw.contacts;
  if (Array.isArray(raw?.items))     return raw.items;
  if (Array.isArray(raw?.data))      return raw.data;
  return [];
}

function contactText(c) {
  return [c.name, c.callsign, c.id, c.type, c.classification, c.vessel_type, c.description]
    .filter(Boolean).join(" ");
}

function ruleText(r) {
  return [r.name, r.description, r.condition, r.target, r.tags, r.entity_type]
    .filter(Boolean).join(" ");
}

function directoryText(d) {
  return [d.name, d.alias, d.email, d.role, d.organisation, d.description, d.tags]
    .filter(Boolean).join(" ");
}

function crossRef(acousticContacts, rules, directoryContacts) {
  return acousticContacts.map(c => {
    const ct = contactText(c);
    const matchedRules = rules.filter(r => overlap(ct, ruleText(r)) > 0).map(r => ({
      ...r,
      hits: overlap(ct, ruleText(r)),
    }));
    const matchedDirectory = directoryContacts.filter(d => overlap(ct, directoryText(d)) > 0).map(d => ({
      ...d,
      hits: overlap(ct, directoryText(d)),
    }));
    const hasRule      = matchedRules.length > 0;
    const hasDirectory = matchedDirectory.length > 0;
    const coverage = hasRule && hasDirectory ? "FULLY_WATCHED"
      : hasRule      ? "RULE_ONLY"
      : hasDirectory ? "CONTACT_ONLY"
      : "DARK";
    return { ...c, _rules: matchedRules, _directory: matchedDirectory, _coverage: coverage };
  });
}

// ── JarvisBrain exports ───────────────────────────────────────────────────────

export function isAcrlcntQuery(text) {
  return ACRLCNT_RE.test(text || "");
}

export async function buildAcrlcntScript() {
  const base    = apiBase();
  const headers = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  try {
    const [cr, rr, dr] = await Promise.all([
      fetch(`${base}/v1/acoustic/contacts`, { headers }).then(r => r.json()),
      fetch(`${base}/v1/rules`,             { headers }).then(r => r.json()),
      fetch(`${base}/entities/Contact`,     { headers }).then(r => r.json()),
    ]);
    const acousticContacts   = normaliseContacts(cr);
    const rules              = normaliseRules(rr);
    const directoryContacts  = normaliseDirectory(dr);
    const enriched      = crossRef(acousticContacts, rules, directoryContacts);
    const fullyWatched  = enriched.filter(c => c._coverage === "FULLY_WATCHED");
    const dark          = enriched.filter(c => c._coverage === "DARK");
    const summary = `${acousticContacts.length} acoustic contacts cross-referenced with ${rules.length} rules and ${directoryContacts.length} contact directory entries. FULLY_WATCHED: ${fullyWatched.length}, DARK (intelligence gap): ${dark.length}.`;
    const resp = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: `JARVIS acoustic × rules × contact triple nexus assessment. ${summary} Provide a 2-sentence monitoring coverage brief covering fully-watched versus unwatched versus unregistered contacts.`,
        system: "You are JARVIS. Be direct and tactical. 2 sentences maximum.",
      }),
    });
    const rd    = await resp.json();
    const brief = rd?.response ?? rd?.message ?? rd?.content ?? summary;
    return `ACRLCNT ASSESSMENT: ${brief}`;
  } catch (e) {
    return `ACRLCNT: data fetch error — ${e.message}`;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "FULLY_WATCHED", "RULE_ONLY", "CONTACT_ONLY", "DARK"];
const TAB_COLOR = {
  ALL: "#29E7FF", FULLY_WATCHED: "#00e5a0", RULE_ONLY: "#29e7ff",
  CONTACT_ONLY: "#ff8800", DARK: "#ff4d6d",
};

export default function AcousticRulesContactTriple() {
  const [open, setOpen]         = useState(false);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState(null);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [ttsText, setTtsText]   = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const base    = apiBase();
  const headers = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [cr, rr, dr] = await Promise.all([
        fetch(`${base}/v1/acoustic/contacts`, { headers }).then(r => r.json()),
        fetch(`${base}/v1/rules`,             { headers }).then(r => r.json()),
        fetch(`${base}/entities/Contact`,     { headers }).then(r => r.json()),
      ]);
      const rules             = normaliseRules(rr);
      const directoryContacts = normaliseDirectory(dr);
      setContacts(crossRef(normaliseContacts(cr), rules, directoryContacts));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:acrlcnt-toggle", onToggle);
    const onAsk = (e) => { if (isAcrlcntQuery(e.detail?.query)) setOpen(true); };
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:acrlcnt-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    const script = await buildAcrlcntScript();
    setTtsText(script);
    try {
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST", headers,
        body: JSON.stringify({ text: script, voice: "onyx" }),
      });
    } catch (_) {}
    setAssessing(false);
  }, [base]);

  const filtered = contacts.filter(c => {
    if (tab !== "ALL" && c._coverage !== tab) return false;
    if (search.trim()) {
      const s = search.toLowerCase();
      return contactText(c).toLowerCase().includes(s);
    }
    return true;
  });

  const counts = {
    FULLY_WATCHED: contacts.filter(c => c._coverage === "FULLY_WATCHED").length,
    RULE_ONLY:     contacts.filter(c => c._coverage === "RULE_ONLY").length,
    CONTACT_ONLY:  contacts.filter(c => c._coverage === "CONTACT_ONLY").length,
    DARK:          contacts.filter(c => c._coverage === "DARK").length,
  };
  const coverage = contacts.length ? Math.round((counts.FULLY_WATCHED / contacts.length) * 100) : 0;

  const CY   = "#29E7FF";
  const MONO = "'JetBrains Mono',monospace";

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Acoustic × Rules × Contact Triple (ACRLCNT)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: open ? "rgba(0,229,160,0.18)" : "rgba(0,4,10,0.82)",
          border: `1px solid ${open ? "#00e5a0" : CY + "55"}`,
          borderRadius: 6, color: open ? "#00e5a0" : CY,
          fontFamily: MONO, fontSize: 9, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
        }}
      >
        ◈ ACRLCNT {counts.DARK > 0 && <span style={{ color: "#ff4d6d" }}>●</span>}
      </button>

      {open && (
        <div style={{
          position: "fixed", top: 40, right: 8, width: 480, maxHeight: "86vh",
          zIndex: Z_INDEX + 1,
          background: "rgba(4,10,20,0.97)",
          border: `1px solid ${CY}33`,
          borderRadius: 12, overflow: "hidden",
          boxShadow: "0 0 60px rgba(0,229,160,0.12)",
          fontFamily: MONO, display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
            background: "rgba(0,229,160,0.06)",
          }}>
            <span style={{ color: "#00e5a0", fontSize: 11, letterSpacing: 2 }}>
              ACOUSTIC × RULES × CONTACT
            </span>
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "#4E6070", cursor: "pointer", fontSize: 14 }}>
              ✕
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 4, padding: "8px 10px" }}>
            {[
              ["CONTACTS",      contacts.length,        CY],
              ["FULLY WATCHED", counts.FULLY_WATCHED,   "#00e5a0"],
              ["RULE ONLY",     counts.RULE_ONLY,       "#29e7ff"],
              ["CONTACT ONLY",  counts.CONTACT_ONLY,    "#ff8800"],
              ["COVERAGE",      coverage + "%",         coverage > 60 ? "#00e5a0" : "#ff4d6d"],
            ].map(([label, val, color]) => (
              <div key={label} style={{
                background: "rgba(0,0,0,0.4)", borderRadius: 6,
                padding: "6px 4px", textAlign: "center",
                border: `1px solid ${color}22`,
              }}>
                <div style={{ color, fontSize: 14, fontWeight: 700 }}>{val}</div>
                <div style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, padding: "0 10px 6px", flexWrap: "wrap" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${TAB_COLOR[t]}18` : "transparent",
                  border: `1px solid ${tab === t ? TAB_COLOR[t] : CY + "22"}`,
                  borderRadius: 4, color: tab === t ? TAB_COLOR[t] : "#4E6070",
                  fontFamily: MONO, fontSize: 8, letterSpacing: 1, padding: "3px 8px", cursor: "pointer",
                }}>
                {t}
                {t !== "ALL" && (
                  <span style={{ marginLeft: 4, opacity: 0.7 }}>
                    {counts[t] ?? contacts.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "0 10px 6px" }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search contacts…"
              style={{
                width: "100%", background: "rgba(41,231,255,0.05)",
                border: `1px solid ${CY}22`, borderRadius: 5,
                color: "#DCEBF5", fontFamily: MONO, fontSize: 10,
                padding: "5px 10px", outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          {/* Results */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 10px 10px" }}>
            {loading && (
              <div style={{ color: "#4E6070", fontSize: 10, textAlign: "center", padding: 20 }}>
                Loading…
              </div>
            )}
            {err && (
              <div style={{ color: "#ff4d6d", fontSize: 10, padding: 12 }}>Error: {err}</div>
            )}
            {!loading && !err && filtered.length === 0 && (
              <div style={{ color: "#4E6070", fontSize: 10, textAlign: "center", padding: 20 }}>
                No contacts match
              </div>
            )}
            {filtered.map((c, i) => {
              const isExp   = expanded === i;
              const covColor = TAB_COLOR[c._coverage] ?? CY;
              return (
                <div key={c.id ?? i}
                  onClick={() => setExpanded(isExp ? null : i)}
                  style={{
                    borderRadius: 6, margin: "3px 0", padding: "8px 10px",
                    background: isExp ? "rgba(0,229,160,0.07)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${isExp ? covColor + "55" : CY + "15"}`,
                    cursor: "pointer",
                  }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      fontSize: 8, letterSpacing: 1, padding: "1px 5px",
                      borderRadius: 3, background: covColor + "22", color: covColor,
                      flexShrink: 0,
                    }}>
                      {c._coverage.replace(/_/g, " ")}
                    </span>
                    <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.name ?? c.callsign ?? c.id ?? "Unknown"}
                    </span>
                    {c._rules.length > 0 && (
                      <span style={{ color: "#29e7ff", fontSize: 8 }}>⚙{c._rules.length}</span>
                    )}
                    {c._directory.length > 0 && (
                      <span style={{ color: "#ff8800", fontSize: 8 }}>👤{c._directory.length}</span>
                    )}
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${CY}15` }}>
                      {/* Matched rules */}
                      {c._rules.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: "#29e7ff", fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>
                            MATCHED RULES ({c._rules.length})
                          </div>
                          {c._rules.slice(0, 5).map((r, ri) => (
                            <div key={ri} style={{ display: "flex", gap: 6, padding: "2px 0", alignItems: "center" }}>
                              <span style={{ color: "#2E4050", fontSize: 8 }}>rule</span>
                              <span style={{ color: "#7A95AB", fontSize: 9, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                                {r.name ?? r.description ?? r.id ?? "rule"}
                              </span>
                              <span style={{ color: "#29e7ff", fontSize: 8 }}>{r.hits}↑</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Directory contacts */}
                      {c._directory.length > 0 && (
                        <div>
                          <div style={{ color: "#ff8800", fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>
                            CONTACT DIRECTORY ({c._directory.length})
                          </div>
                          {c._directory.slice(0, 4).map((d, di) => (
                            <div key={di} style={{ display: "flex", gap: 6, padding: "2px 0", alignItems: "center" }}>
                              <span style={{ color: "#ff8800", fontSize: 8 }}>
                                {(d.role ?? d.organisation ?? "contact").toUpperCase().slice(0, 12)}
                              </span>
                              <span style={{ color: "#7A95AB", fontSize: 9, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                                {d.name ?? d.alias ?? d.email ?? "entry"}
                              </span>
                              <span style={{ color: "#ff8800", fontSize: 8 }}>{d.hits}↑</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {c._rules.length === 0 && c._directory.length === 0 && (
                        <div style={{ color: "#ff4d6d", fontSize: 9 }}>No rule or contact directory matches — intelligence gap.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          {ttsText && (
            <div style={{ padding: "6px 12px", borderTop: `1px solid ${CY}15`, color: "#4E6070", fontSize: 8, lineHeight: 1.5 }}>
              {ttsText}
            </div>
          )}
          <div style={{
            padding: "8px 12px", borderTop: `1px solid ${CY}15`,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ color: "#2E4050", fontSize: 8 }}>90 s auto-refresh · {contacts.length} contacts</span>
            <button onClick={assess} disabled={assessing}
              style={{
                background: assessing ? "rgba(0,229,160,0.05)" : "rgba(0,229,160,0.12)",
                border: "1px solid #00e5a055", borderRadius: 5,
                color: "#00e5a0", fontFamily: MONO, fontSize: 9,
                padding: "4px 12px", cursor: assessing ? "default" : "pointer",
              }}>
              {assessing ? "ASSESSING…" : "▶ ASSESS"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
