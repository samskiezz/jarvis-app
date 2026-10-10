/**
 * F699 — Acoustic × Ops Alerts × Intel Profile Triple Nexus (ACOAIP)
 * Three-way cross-reference:
 *   /v1/acoustic/contacts × /v1/ops/alerts × /entities/IntelProfile
 * Each acoustic contact is classified:
 *   FULLY_ATTRIBUTED — matches ≥1 ops alert AND ≥1 intel profile
 *   ALERTED_ONLY     — ops alert match but no intel profile link
 *   PROFILED_ONLY    — intel profile match but no ops alert link
 *   DARK             — no ops alert or intel profile match
 * Coverage % tile = FULLY_ATTRIBUTED / total contacts.
 * Tabs: ALL / FULLY_ATTRIBUTED / ALERTED_ONLY / PROFILED_ONLY / DARK + search.
 * Click-to-expand shows matched ops alerts + matched intel profiles per contact.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-second auto-refresh. Event: jarvis:acoaip-toggle.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 151_820;
const Z_INDEX  = 235;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const ACOAIP_RE = /\b(acoaip|acoustic\s+ops\s+alert\s+intel|acoustic\s+alert\s+profile|ops\s+alert\s+intel\s+acoustic|acoustic\s+threat\s+attribution|alert\s+intel\s+profile\s+acoustic|acoustic\s+ops\s+profile|sensor\s+ops\s+intel)\b/i;

export function isAcoaipQuery(q) { return ACOAIP_RE.test(q); }

const TIER_COLOR = {
  FULLY_ATTRIBUTED: "#ff2244",
  ALERTED_ONLY:     "#FFA500",
  PROFILED_ONLY:    "#29E7FF",
  DARK:             "#667788",
};

const SEVERITY_COLOR = {
  CRITICAL: "#ff2244",
  HIGH:     "#ff6600",
  MEDIUM:   "#ffcc00",
  LOW:      "#00e5a0",
  default:  "#667788",
};

const THREAT_COLOR = {
  CRITICAL: "#ff2244",
  HIGH:     "#ff6600",
  MEDIUM:   "#ffcc00",
  LOW:      "#00e5a0",
  UNKNOWN:  "#667788",
  default:  "#667788",
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

function normaliseAcoustic(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.contacts)) return raw.contacts;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.data))     return raw.data;
  return [];
}

function normaliseAlerts(raw) {
  if (Array.isArray(raw))          return raw;
  if (Array.isArray(raw?.alerts))  return raw.alerts;
  if (Array.isArray(raw?.items))   return raw.items;
  if (Array.isArray(raw?.data))    return raw.data;
  if (Array.isArray(raw?.results)) return raw.results;
  return [];
}

function normaliseProfiles(raw) {
  if (Array.isArray(raw))            return raw;
  if (Array.isArray(raw?.profiles))  return raw.profiles;
  if (Array.isArray(raw?.items))     return raw.items;
  if (Array.isArray(raw?.data))      return raw.data;
  if (Array.isArray(raw?.results))   return raw.results;
  return [];
}

function acousticText(c) {
  return [c.label, c.classification, c.name, c.callsign, c.id, c.type, c.description, c.source]
    .filter(Boolean).join(" ");
}

function crossRef(acoustic, alerts, profiles) {
  return acoustic.map(c => {
    const ct = acousticText(c);

    const matchedAlerts = alerts.filter(a => {
      const at = [a.title, a.description, a.message, a.type, a.source, a.name, a.tags]
        .filter(Boolean).join(" ");
      return overlap(ct, at) > 0;
    }).map(a => ({
      ...a,
      hits: overlap(ct, [a.title, a.description, a.message].filter(Boolean).join(" ")),
    }));

    const matchedProfiles = profiles.filter(p => {
      const pt = [p.name, p.description, p.actor, p.actorType, p.alias, p.source, p.tags]
        .filter(Boolean).join(" ");
      return overlap(ct, pt) > 0;
    }).map(p => ({
      ...p,
      hits: overlap(ct, [p.name, p.description, p.actor].filter(Boolean).join(" ")),
    }));

    const hasAlert   = matchedAlerts.length > 0;
    const hasProfile = matchedProfiles.length > 0;
    const tier =
      hasAlert && hasProfile ? "FULLY_ATTRIBUTED" :
      hasAlert               ? "ALERTED_ONLY"     :
      hasProfile             ? "PROFILED_ONLY"    :
                               "DARK";

    return { ...c, tier, matchedAlerts, matchedProfiles };
  });
}

// ── exported brain helpers ────────────────────────────────────────────────────

export async function buildAcoaipScript() {
  try {
    const base = apiBase();
    const [ar, alr, pr] = await Promise.all([
      fetch(`${base}/v1/acoustic/contacts`,    { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/v1/ops/alerts`,           { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/entities/IntelProfile`,   { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const acoustic = normaliseAcoustic(await ar.json());
    const alerts   = normaliseAlerts(await alr.json());
    const profiles = normaliseProfiles(await pr.json());
    const rows     = crossRef(acoustic, alerts, profiles);
    const attributed = rows.filter(r => r.tier === "FULLY_ATTRIBUTED").length;
    const alerted    = rows.filter(r => r.tier === "ALERTED_ONLY").length;
    const profiled   = rows.filter(r => r.tier === "PROFILED_ONLY").length;
    const dark       = rows.filter(r => r.tier === "DARK").length;
    const total      = rows.length;
    const pct        = total ? Math.round((attributed / total) * 100) : 0;

    const briefResp = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `JARVIS acoustic ops-intel triple attribution: ${total} acoustic contacts total. ${attributed} fully attributed (ops alert + intel profile match), ${alerted} alerted only (no intel profile), ${profiled} profiled only (no ops alert), ${dark} dark (no attribution). Give a 2-sentence threat-attribution assessment.`,
      }),
    });
    const brief = ((await briefResp.json()).answer || "").trim();
    return brief || `Acoustic ops-intel attribution: ${pct}% fully attributed. ${attributed} of ${total} contacts are both ops-alerted and intel-profiled, sir.`;
  } catch {
    return "Acoustic ops-alerts intel-profile triple nexus is temporarily unreachable, sir.";
  }
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "FULLY_ATTRIBUTED", "ALERTED_ONLY", "PROFILED_ONLY", "DARK"];
const TAB_LABEL = {
  ALL: "ALL", FULLY_ATTRIBUTED: "ATTRIBUTED", ALERTED_ONLY: "ALERTED",
  PROFILED_ONLY: "PROFILED", DARK: "DARK",
};

const CY  = "#29E7FF";
const DIM = "#8899AA";
const AMB = "#FFA500";
const RED = "#ff2244";

export default function AcousticOpsAlertsIntelTriple() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [loading,   setLoading]   = useState(false);
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const [ar, alr, pr] = await Promise.all([
        fetch(`${base}/v1/acoustic/contacts`,  { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/v1/ops/alerts`,         { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/entities/IntelProfile`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const acoustic = normaliseAcoustic(await ar.json());
      const alerts   = normaliseAlerts(await alr.json());
      const profiles = normaliseProfiles(await pr.json());
      setRows(crossRef(acoustic, alerts, profiles));
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const toggle = () => setOpen(o => { if (!o) load(); return !o; });
    window.addEventListener("jarvis:acoaip-toggle", toggle);
    return () => window.removeEventListener("jarvis:acoaip-toggle", toggle);
  }, [load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    try {
      const script = await buildAcoaipScript();
      setBrief(script);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch { /* silent */ }
    setAssessing(false);
  }, []);

  const attributed = rows.filter(r => r.tier === "FULLY_ATTRIBUTED").length;
  const alerted    = rows.filter(r => r.tier === "ALERTED_ONLY").length;
  const profiled   = rows.filter(r => r.tier === "PROFILED_ONLY").length;
  const dark       = rows.filter(r => r.tier === "DARK").length;
  const total      = rows.length;
  const pct        = total ? Math.round((attributed / total) * 100) : 0;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r.tier !== tab) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (r.label || r.classification || r.name || r.id || "").toLowerCase().includes(s);
  });

  return (
    <>
      {/* toggle button */}
      <button
        onClick={() => setOpen(o => { if (!o) load(); return !o; })}
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: Z_INDEX,
          background: open ? `${RED}28` : "#0a0e1a",
          border: `1px solid ${open ? RED : RED + "55"}`,
          borderRadius: 6,
          color: open ? RED : `${RED}cc`,
          padding: "3px 7px",
          cursor: "pointer",
          fontSize: 9,
          letterSpacing: 1,
          whiteSpace: "nowrap",
        }}
      >
        ◈ ACOAIP
        {attributed > 0 && (
          <span style={{
            marginLeft: 4,
            background: RED,
            color: "#fff",
            borderRadius: 8,
            padding: "0 4px",
            fontSize: 8,
          }}>
            {attributed}
          </span>
        )}
      </button>

      {/* panel */}
      {open && (
        <div style={{
          position: "fixed",
          bottom: 36,
          left: BTN_LEFT,
          width: 400,
          maxHeight: 520,
          overflowY: "auto",
          background: "#0a0e1aee",
          border: `1px solid ${RED}55`,
          borderRadius: 8,
          zIndex: Z_INDEX + 1,
          padding: 12,
          fontFamily: "monospace",
          backdropFilter: "blur(8px)",
        }}>
          {/* header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ color: RED, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              ◈ ACOUSTIC × OPS ALERTS × INTEL PROFILE
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
            >
              ×
            </button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, marginBottom: 10 }}>
            {[
              { label: "CONTACTS",   val: total,      col: CY },
              { label: "ATTRIBUTED", val: attributed, col: RED },
              { label: "ALERTED",    val: alerted,    col: AMB },
              { label: "PROFILED",   val: profiled,   col: CY },
              { label: "COV%",       val: `${pct}%`,  col: pct >= 60 ? RED : pct >= 30 ? AMB : "#00e5a0" },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                background: `${col}12`,
                border: `1px solid ${col}33`,
                borderRadius: 5,
                padding: "4px 2px",
                textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 13, fontWeight: 700 }}>{val}</div>
                <div style={{ color: DIM, fontSize: 7, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${TIER_COLOR[t] || CY}28` : "transparent",
                border: `1px solid ${tab === t ? (TIER_COLOR[t] || CY) : DIM + "44"}`,
                borderRadius: 4,
                color: tab === t ? (TIER_COLOR[t] || CY) : DIM,
                padding: "2px 6px",
                cursor: "pointer",
                fontSize: 8,
                letterSpacing: 1,
              }}>
                {TAB_LABEL[t]}
              </button>
            ))}
          </div>

          {/* search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search contacts…"
            style={{
              width: "100%",
              background: "#0d1422",
              border: `1px solid ${DIM}44`,
              borderRadius: 4,
              color: "#DCEBF5",
              padding: "4px 8px",
              fontSize: 9,
              marginBottom: 8,
              boxSizing: "border-box",
            }}
          />

          {/* list */}
          {loading && <div style={{ color: DIM, fontSize: 10, textAlign: "center" }}>Loading…</div>}
          {!loading && visible.map((r, i) => {
            const tc = TIER_COLOR[r.tier] || CY;
            const isExp = expanded === i;
            return (
              <div key={r.id || i} style={{
                borderBottom: `1px solid ${DIM}22`,
                paddingBottom: 6,
                marginBottom: 6,
              }}>
                <div
                  onClick={() => setExpanded(isExp ? null : i)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    cursor: "pointer",
                    padding: "3px 0",
                  }}
                >
                  <span style={{
                    fontSize: 8,
                    background: `${tc}22`,
                    border: `1px solid ${tc}55`,
                    color: tc,
                    borderRadius: 3,
                    padding: "1px 4px",
                    whiteSpace: "nowrap",
                  }}>
                    {r.tier.replace(/_/g, " ")}
                  </span>
                  <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.label || r.classification || r.name || r.id || `Contact ${i + 1}`}
                  </span>
                  <span style={{ color: DIM, fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
                </div>

                {isExp && (
                  <div style={{ paddingLeft: 10, marginTop: 4 }}>
                    {/* ops alert matches */}
                    <div style={{ color: DIM, fontSize: 8, marginBottom: 3, letterSpacing: 1 }}>
                      OPS ALERTS ({r.matchedAlerts.length})
                    </div>
                    {r.matchedAlerts.length > 0 ? r.matchedAlerts.map((a, j) => (
                      <div key={j} style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "2px 0",
                        borderBottom: `1px solid ${DIM}18`,
                      }}>
                        <span style={{
                          fontSize: 8,
                          background: `${SEVERITY_COLOR[a.severity] || SEVERITY_COLOR.default}22`,
                          border: `1px solid ${SEVERITY_COLOR[a.severity] || SEVERITY_COLOR.default}55`,
                          color: SEVERITY_COLOR[a.severity] || SEVERITY_COLOR.default,
                          borderRadius: 3,
                          padding: "1px 4px",
                          whiteSpace: "nowrap",
                        }}>
                          {a.severity || "N/A"}
                        </span>
                        <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>
                          {a.title || a.message || a.name || `Alert ${j + 1}`}
                        </span>
                        <span style={{ color: DIM, fontSize: 9 }}>hits: {a.hits}</span>
                      </div>
                    )) : (
                      <div style={{ color: DIM, fontSize: 9, marginBottom: 4 }}>No ops alert correlation.</div>
                    )}

                    {/* intel profile matches */}
                    <div style={{ color: DIM, fontSize: 8, marginTop: 6, marginBottom: 3, letterSpacing: 1 }}>
                      INTEL PROFILES ({r.matchedProfiles.length})
                    </div>
                    {r.matchedProfiles.length > 0 ? r.matchedProfiles.map((p, j) => (
                      <div key={j} style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "2px 0",
                        borderBottom: `1px solid ${DIM}18`,
                      }}>
                        <span style={{
                          fontSize: 8,
                          background: `${THREAT_COLOR[p.threatLevel] || THREAT_COLOR.default}22`,
                          border: `1px solid ${THREAT_COLOR[p.threatLevel] || THREAT_COLOR.default}55`,
                          color: THREAT_COLOR[p.threatLevel] || THREAT_COLOR.default,
                          borderRadius: 3,
                          padding: "1px 4px",
                          whiteSpace: "nowrap",
                        }}>
                          {p.threatLevel || p.threat_level || "?"}
                        </span>
                        <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>
                          {p.name || p.actor || `Profile ${j + 1}`}
                          {p.actorType && <span style={{ color: DIM, fontSize: 9 }}> · {p.actorType}</span>}
                        </span>
                        <span style={{ color: DIM, fontSize: 9 }}>hits: {p.hits}</span>
                      </div>
                    )) : (
                      <div style={{ color: DIM, fontSize: 9 }}>No intel profile correlation.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {!loading && visible.length === 0 && (
            <div style={{ color: DIM, textAlign: "center", padding: 16, fontSize: 10 }}>
              No contacts match current filter.
            </div>
          )}

          {/* assess */}
          <div style={{ marginTop: 10, borderTop: `1px solid ${RED}22`, paddingTop: 8 }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{
                background: `${RED}18`,
                border: `1px solid ${RED}55`,
                borderRadius: 5,
                color: RED,
                padding: "5px 12px",
                cursor: "pointer",
                fontSize: 10,
                letterSpacing: 1,
                width: "100%",
                opacity: assessing ? 0.6 : 1,
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{
                marginTop: 8,
                color: "#DCEBF5",
                fontSize: 10,
                lineHeight: 1.5,
                borderLeft: `2px solid ${RED}`,
                paddingLeft: 8,
              }}>
                {brief}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
