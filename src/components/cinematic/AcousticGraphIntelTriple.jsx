/**
 * F687 — Acoustic × Graph Communities × Intel Profile Triple Nexus (ACGCIP)
 * Three-way cross-reference: /v1/acoustic/contacts × /v1/graph/communities × /entities/IntelProfile.
 * Each acoustic contact is classified:
 *   FULLY_IDENTIFIED — matches ≥1 community node AND ≥1 intel profile (known threat, network-placed)
 *   COMMUNITY_ONLY   — placed in a graph community but no intel profile (unattributed presence)
 *   PROFILED_ONLY    — intel profile match but no community node (off-network threat)
 *   DARK             — neither community nor intel profile (intelligence blind spot)
 * Coverage % tile = FULLY_IDENTIFIED / total contacts.
 * Tabs: ALL / FULLY_IDENTIFIED / COMMUNITY_ONLY / PROFILED_ONLY / DARK + search.
 * Click-to-expand shows matched community nodes + matched intel profiles per contact.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence threat-attribution brief + TTS.
 * 90-second auto-refresh. Event: jarvis:acgcip-toggle.
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 141_500;
const Z_INDEX  = 223;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const ACGCIP_RE = /\b(acgcip|acoustic\s+graph\s+intel|acoustic\s+graph\s+communit|acoustic\s+intel\s+graph|sensor\s+graph\s+intel|acoustic\s+communit.*intel|intel\s+profile.*communit.*acoustic|graph\s+identified\s+contact|acoustic\s+network\s+intel|sensor\s+communit.*profil|acoustic\s+threat\s+graph|acgraph\s+intel)\b/i;

const THREAT_COLOR = { critical: "#ff4d6d", high: "#ff8800", medium: "#ffcc00", low: "#29e7ff", info: "#a855f7" };

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

function normaliseProfiles(raw) {
  if (Array.isArray(raw))            return raw;
  if (Array.isArray(raw?.profiles))  return raw.profiles;
  if (Array.isArray(raw?.items))     return raw.items;
  if (Array.isArray(raw?.data))      return raw.data;
  return [];
}

// Extract flat list of community member nodes from /v1/graph/communities response
function normaliseCommunities(raw) {
  if (!raw) return [];
  const comms = raw.communities ?? raw;
  if (typeof comms !== "object") return [];
  const nodes = [];
  for (const [clusterId, members] of Object.entries(comms)) {
    if (!Array.isArray(members)) continue;
    for (const m of members) {
      nodes.push({ ...m, _clusterId: clusterId });
    }
  }
  return nodes;
}

function contactText(c) {
  return [c.name, c.callsign, c.id, c.type, c.classification, c.vessel_type, c.description]
    .filter(Boolean).join(" ");
}

function nodeText(n) {
  return [n.label, n.name, n.id, n.type, n.entity, n.description].filter(Boolean).join(" ");
}

function profileText(p) {
  return [p.name, p.actor_type, p.nationality, p.description, p.aliases, p.tags]
    .filter(Boolean).join(" ");
}

function crossRef(contacts, nodes, profiles) {
  return contacts.map(c => {
    const ct = contactText(c);
    const matchedNodes = nodes.filter(n => overlap(ct, nodeText(n)) > 0).map(n => ({
      ...n,
      hits: overlap(ct, nodeText(n)),
    }));
    const matchedProfiles = profiles.filter(p => overlap(ct, profileText(p)) > 0).map(p => ({
      ...p,
      hits: overlap(ct, profileText(p)),
    }));
    const hasCommunity = matchedNodes.length > 0;
    const hasProfile   = matchedProfiles.length > 0;
    const coverage = hasCommunity && hasProfile ? "FULLY_IDENTIFIED"
      : hasCommunity ? "COMMUNITY_ONLY"
      : hasProfile   ? "PROFILED_ONLY"
      : "DARK";
    return { ...c, _nodes: matchedNodes, _profiles: matchedProfiles, _coverage: coverage };
  });
}

// ── JarvisBrain exports ───────────────────────────────────────────────────────

export function isAcgcipQuery(text) {
  return ACGCIP_RE.test(text || "");
}

export async function buildAcgcipScript() {
  const base    = apiBase();
  const headers = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  try {
    const [cr, gr, ir] = await Promise.all([
      fetch(`${base}/v1/acoustic/contacts`,   { headers }).then(r => r.json()),
      fetch(`${base}/v1/graph/communities`,   { headers }).then(r => r.json()),
      fetch(`${base}/entities/IntelProfile`,  { headers }).then(r => r.json()),
    ]);
    const contacts = normaliseContacts(cr);
    const nodes    = normaliseCommunities(gr);
    const profiles = normaliseProfiles(ir);
    const enriched = crossRef(contacts, nodes, profiles);
    const fully    = enriched.filter(c => c._coverage === "FULLY_IDENTIFIED");
    const dark     = enriched.filter(c => c._coverage === "DARK");
    const summary  = `${contacts.length} acoustic contacts cross-referenced with ${nodes.length} graph community nodes and ${profiles.length} intel profiles. FULLY_IDENTIFIED: ${fully.length}, DARK (blind spot): ${dark.length}.`;
    const rr = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: `JARVIS acoustic × graph × intel triple nexus assessment. ${summary} Provide a 2-sentence threat-attribution brief covering network-placed versus profiled-only versus blind-spot contacts.`,
        system: "You are JARVIS. Be direct and tactical. 2 sentences maximum.",
      }),
    });
    const rd    = await rr.json();
    const brief = rd?.response ?? rd?.message ?? rd?.content ?? summary;
    return `ACGCIP ASSESSMENT: ${brief}`;
  } catch (e) {
    return `ACGCIP: data fetch error — ${e.message}`;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "FULLY_IDENTIFIED", "COMMUNITY_ONLY", "PROFILED_ONLY", "DARK"];
const TAB_COLOR = {
  ALL: "#29E7FF", FULLY_IDENTIFIED: "#00e5a0", COMMUNITY_ONLY: "#29e7ff",
  PROFILED_ONLY: "#ff8800", DARK: "#ff4d6d",
};

export default function AcousticGraphIntelTriple() {
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
      const [cr, gr, ir] = await Promise.all([
        fetch(`${base}/v1/acoustic/contacts`,   { headers }).then(r => r.json()),
        fetch(`${base}/v1/graph/communities`,   { headers }).then(r => r.json()),
        fetch(`${base}/entities/IntelProfile`,  { headers }).then(r => r.json()),
      ]);
      const nodes    = normaliseCommunities(gr);
      const profiles = normaliseProfiles(ir);
      setContacts(crossRef(normaliseContacts(cr), nodes, profiles));
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
    window.addEventListener("jarvis:acgcip-toggle", onToggle);
    const onAsk = (e) => { if (isAcgcipQuery(e.detail?.query)) setOpen(true); };
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:acgcip-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    const script = await buildAcgcipScript();
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
    FULLY_IDENTIFIED: contacts.filter(c => c._coverage === "FULLY_IDENTIFIED").length,
    COMMUNITY_ONLY:   contacts.filter(c => c._coverage === "COMMUNITY_ONLY").length,
    PROFILED_ONLY:    contacts.filter(c => c._coverage === "PROFILED_ONLY").length,
    DARK:             contacts.filter(c => c._coverage === "DARK").length,
  };
  const coverage = contacts.length ? Math.round((counts.FULLY_IDENTIFIED / contacts.length) * 100) : 0;

  const CY  = "#29E7FF";
  const MONO = "'JetBrains Mono',monospace";

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Acoustic × Graph × Intel Triple (ACGCIP)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: open ? "rgba(0,229,160,0.18)" : "rgba(0,4,10,0.82)",
          border: `1px solid ${open ? "#00e5a0" : CY + "55"}`,
          borderRadius: 6, color: open ? "#00e5a0" : CY,
          fontFamily: MONO, fontSize: 9, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
        }}
      >
        ◈ ACGCIP {counts.DARK > 0 && <span style={{ color: "#ff4d6d" }}>●</span>}
      </button>

      {open && (
        <div style={{
          position: "fixed", top: 40, right: 8, width: 480, maxHeight: "86vh",
          zIndex: Z_INDEX + 1,
          background: "rgba(4,10,20,0.97)",
          border: `1px solid ${CY}33`,
          borderRadius: 12, overflow: "hidden",
          boxShadow: `0 0 60px rgba(0,229,160,0.12)`,
          fontFamily: MONO, display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
            background: "rgba(0,229,160,0.06)",
          }}>
            <span style={{ color: "#00e5a0", fontSize: 11, letterSpacing: 2 }}>
              ACOUSTIC × GRAPH × INTEL
            </span>
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "#4E6070", cursor: "pointer", fontSize: 14 }}>
              ✕
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 4, padding: "8px 10px" }}>
            {[
              ["CONTACTS",   contacts.length, CY],
              ["IDENTIFIED", counts.FULLY_IDENTIFIED, "#00e5a0"],
              ["COMMUNITY",  counts.COMMUNITY_ONLY, "#29e7ff"],
              ["PROFILED",   counts.PROFILED_ONLY, "#ff8800"],
              ["COVERAGE",   coverage + "%", coverage > 60 ? "#00e5a0" : "#ff4d6d"],
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
                {t !== "ALL" && <span style={{ marginLeft: 4, opacity: 0.7 }}>
                  {counts[t] ?? contacts.length}
                </span>}
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
              const isExp = expanded === i;
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
                    {c._nodes.length > 0 && (
                      <span style={{ color: "#29e7ff", fontSize: 8 }}>⬡{c._nodes.length}</span>
                    )}
                    {c._profiles.length > 0 && (
                      <span style={{ color: "#ff8800", fontSize: 8 }}>⚠{c._profiles.length}</span>
                    )}
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${CY}15` }}>
                      {/* Community nodes */}
                      {c._nodes.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: "#29e7ff", fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>
                            GRAPH COMMUNITIES ({c._nodes.length})
                          </div>
                          {c._nodes.slice(0, 5).map((n, ni) => (
                            <div key={ni} style={{ display: "flex", gap: 6, padding: "2px 0", alignItems: "center" }}>
                              <span style={{ color: "#2E4050", fontSize: 8 }}>cluster:{n._clusterId}</span>
                              <span style={{ color: "#7A95AB", fontSize: 9, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                                {n.label ?? n.name ?? n.id ?? "node"}
                              </span>
                              <span style={{ color: "#29e7ff", fontSize: 8 }}>{n.hits}↑</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Intel profiles */}
                      {c._profiles.length > 0 && (
                        <div>
                          <div style={{ color: "#ff8800", fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>
                            INTEL PROFILES ({c._profiles.length})
                          </div>
                          {c._profiles.slice(0, 4).map((p, pi) => (
                            <div key={pi} style={{ display: "flex", gap: 6, padding: "2px 0", alignItems: "center" }}>
                              <span style={{
                                color: THREAT_COLOR[p.threat_level] ?? "#29e7ff",
                                fontSize: 8, letterSpacing: 0.5,
                              }}>
                                {(p.threat_level ?? "info").toUpperCase()}
                              </span>
                              <span style={{ color: "#7A95AB", fontSize: 9, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                                {p.name ?? p.actor_type ?? "profile"}
                              </span>
                              <span style={{ color: "#ff8800", fontSize: 8 }}>{p.hits}↑</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {c._nodes.length === 0 && c._profiles.length === 0 && (
                        <div style={{ color: "#ff4d6d", fontSize: 9 }}>No community or intel profile matches — intelligence blind spot.</div>
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
