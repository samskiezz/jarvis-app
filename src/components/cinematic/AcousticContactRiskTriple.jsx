/**
 * F698 — Acoustic × Directory Contact × Risk Signal Triple Nexus (ACTRSK)
 * Three-way cross-reference:
 *   /v1/acoustic/contacts × /entities/Contact × /entities/RiskSignal
 * Each acoustic contact is classified:
 *   FULLY_EXPOSED  — matches ≥1 directory contact AND ≥1 risk signal
 *   IDENTIFIED_ONLY — directory match but no risk signal link
 *   RISKY_ONLY      — risk signal match but not in contact directory
 *   CLEAR           — no directory or risk signal match
 * Coverage % tile = FULLY_EXPOSED / total contacts.
 * Tabs: ALL / FULLY_EXPOSED / IDENTIFIED_ONLY / RISKY_ONLY / CLEAR + search.
 * Click-to-expand shows matched directory contacts + matched risk signals per contact.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-second auto-refresh. Event: jarvis:actrsk-toggle.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 150_960;
const Z_INDEX  = 234;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const ACTRSK_RE = /\b(actrsk|acoustic\s+contact\s+risk|acoustic\s+directory\s+risk|acoustic\s+triple\s+risk|sensor\s+contact\s+risk|identified\s+risky|fully\s+exposed\s+contacts?|acoustic\s+contact\s+exposure|directory\s+risk\s+acoustic)\b/i;

export function isActrskQuery(q) { return ACTRSK_RE.test(q); }

const TIER_COLOR = {
  FULLY_EXPOSED:   "#ff2244",
  IDENTIFIED_ONLY: "#29E7FF",
  RISKY_ONLY:      "#FFA500",
  CLEAR:           "#00e5a0",
};

const SEVERITY_COLOR = {
  CRITICAL: "#ff2244",
  HIGH:     "#ff6600",
  MEDIUM:   "#ffcc00",
  LOW:      "#00e5a0",
  default:  "#667788",
};

// ── helpers ──────────────────────────────────────────────────────────────────

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

function normaliseContacts(raw) {
  if (Array.isArray(raw))          return raw;
  if (Array.isArray(raw?.items))   return raw.items;
  if (Array.isArray(raw?.data))    return raw.data;
  if (Array.isArray(raw?.results)) return raw.results;
  return [];
}

function normaliseSignals(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.signals))  return raw.signals;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.data))     return raw.data;
  return [];
}

function acousticText(c) {
  return [c.label, c.classification, c.name, c.callsign, c.id, c.type, c.description, c.source]
    .filter(Boolean).join(" ");
}

function crossRef(acoustic, contacts, signals) {
  return acoustic.map(c => {
    const ct = acousticText(c);

    const matchedContacts = contacts.filter(d => {
      const dt = [d.name, d.role, d.organisation, d.org, d.email, d.tags].filter(Boolean).join(" ");
      return overlap(ct, dt) > 0;
    }).map(d => ({
      ...d,
      hits: overlap(ct, [d.name, d.role, d.organisation].filter(Boolean).join(" ")),
    }));

    const matchedSignals = signals.filter(s => {
      const st = [s.title, s.description, s.source, s.tags].filter(Boolean).join(" ");
      return overlap(ct, st) > 0;
    }).map(s => ({
      ...s,
      hits: overlap(ct, [s.title, s.description].filter(Boolean).join(" ")),
    }));

    const hasContact = matchedContacts.length > 0;
    const hasRisk    = matchedSignals.length > 0;
    const tier =
      hasContact && hasRisk ? "FULLY_EXPOSED"   :
      hasContact            ? "IDENTIFIED_ONLY" :
      hasRisk               ? "RISKY_ONLY"      :
                              "CLEAR";

    return { ...c, tier, matchedContacts, matchedSignals };
  });
}

// ── exported brain helpers ────────────────────────────────────────────────────

export async function buildActrskScript() {
  try {
    const base = apiBase();
    const [ar, cr, sr] = await Promise.all([
      fetch(`${base}/v1/acoustic/contacts`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/entities/Contact`,     { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/entities/RiskSignal`,  { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const acoustic  = normaliseAcoustic(await ar.json());
    const contacts  = normaliseContacts(await cr.json());
    const signals   = normaliseSignals(await sr.json());
    const rows      = crossRef(acoustic, contacts, signals);
    const exposed   = rows.filter(r => r.tier === "FULLY_EXPOSED").length;
    const idOnly    = rows.filter(r => r.tier === "IDENTIFIED_ONLY").length;
    const riskOnly  = rows.filter(r => r.tier === "RISKY_ONLY").length;
    const clear     = rows.filter(r => r.tier === "CLEAR").length;
    const total     = rows.length;
    const pct       = total ? Math.round((exposed / total) * 100) : 0;

    const briefResp = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `JARVIS acoustic contact-risk triple coverage: ${total} acoustic contacts total. ${exposed} fully exposed (directory + risk signal), ${idOnly} identified only (directory, no signal), ${riskOnly} risky only (signal, not in directory), ${clear} clear. Give a 2-sentence threat-identification assessment.`,
      }),
    });
    const brief = ((await briefResp.json()).answer || "").trim();
    return brief || `Acoustic contact-risk coverage: ${pct}% fully exposed. ${exposed} acoustic contacts are both identified and risk-flagged, sir.`;
  } catch {
    return "Acoustic contact-risk triple nexus is temporarily unreachable, sir.";
  }
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "FULLY_EXPOSED", "IDENTIFIED_ONLY", "RISKY_ONLY", "CLEAR"];
const TAB_LABEL = {
  ALL: "ALL", FULLY_EXPOSED: "EXPOSED", IDENTIFIED_ONLY: "IDENT", RISKY_ONLY: "RISKY", CLEAR: "CLEAR",
};

const CY  = "#29E7FF";
const DIM = "#8899AA";
const AMB = "#FFA500";
const RED = "#ff2244";

export default function AcousticContactRiskTriple() {
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
      const [ar, cr, sr] = await Promise.all([
        fetch(`${base}/v1/acoustic/contacts`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/entities/Contact`,     { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/entities/RiskSignal`,  { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const acoustic = normaliseAcoustic(await ar.json());
      const contacts = normaliseContacts(await cr.json());
      const signals  = normaliseSignals(await sr.json());
      setRows(crossRef(acoustic, contacts, signals));
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
    window.addEventListener("jarvis:actrsk-toggle", toggle);
    return () => window.removeEventListener("jarvis:actrsk-toggle", toggle);
  }, [load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    try {
      const script = await buildActrskScript();
      setBrief(script);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch { /* silent */ }
    setAssessing(false);
  }, []);

  const exposed  = rows.filter(r => r.tier === "FULLY_EXPOSED").length;
  const idOnly   = rows.filter(r => r.tier === "IDENTIFIED_ONLY").length;
  const riskOnly = rows.filter(r => r.tier === "RISKY_ONLY").length;
  const clear    = rows.filter(r => r.tier === "CLEAR").length;
  const total    = rows.length;
  const pct      = total ? Math.round((exposed / total) * 100) : 0;

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
        ◈ ACTRSK
        {exposed > 0 && (
          <span style={{
            marginLeft: 4,
            background: RED,
            color: "#fff",
            borderRadius: 8,
            padding: "0 4px",
            fontSize: 8,
          }}>
            {exposed}
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
              ◈ ACOUSTIC × CONTACT × RISK TRIPLE
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
              { label: "CONTACTS", val: total,    col: CY },
              { label: "EXPOSED",  val: exposed,  col: RED },
              { label: "IDENT",    val: idOnly,   col: CY },
              { label: "RISKY",    val: riskOnly, col: AMB },
              { label: "COV%",     val: `${pct}%`, col: pct >= 60 ? RED : pct >= 30 ? AMB : "#00e5a0" },
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
                    {/* directory matches */}
                    <div style={{ color: DIM, fontSize: 8, marginBottom: 3, letterSpacing: 1 }}>
                      DIRECTORY CONTACTS ({r.matchedContacts.length})
                    </div>
                    {r.matchedContacts.length > 0 ? r.matchedContacts.map((d, j) => (
                      <div key={j} style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "2px 0",
                        borderBottom: `1px solid ${DIM}18`,
                      }}>
                        <span style={{ color: CY, fontSize: 10, flex: 1 }}>
                          {d.name || d.id || `Contact ${j + 1}`}
                          {d.role && <span style={{ color: DIM, fontSize: 9 }}> · {d.role}</span>}
                        </span>
                        <span style={{ color: DIM, fontSize: 9 }}>hits: {d.hits}</span>
                      </div>
                    )) : (
                      <div style={{ color: DIM, fontSize: 9, marginBottom: 4 }}>Not in directory.</div>
                    )}

                    {/* risk signal matches */}
                    <div style={{ color: DIM, fontSize: 8, marginTop: 6, marginBottom: 3, letterSpacing: 1 }}>
                      RISK SIGNALS ({r.matchedSignals.length})
                    </div>
                    {r.matchedSignals.length > 0 ? r.matchedSignals.map((s, j) => (
                      <div key={j} style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "2px 0",
                        borderBottom: `1px solid ${DIM}18`,
                      }}>
                        <span style={{
                          fontSize: 8,
                          background: `${SEVERITY_COLOR[s.severity] || SEVERITY_COLOR.default}22`,
                          border: `1px solid ${SEVERITY_COLOR[s.severity] || SEVERITY_COLOR.default}55`,
                          color: SEVERITY_COLOR[s.severity] || SEVERITY_COLOR.default,
                          borderRadius: 3,
                          padding: "1px 4px",
                        }}>
                          {s.severity || "N/A"}
                        </span>
                        <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{s.title}</span>
                        <span style={{ color: DIM, fontSize: 9 }}>hits: {s.hits}</span>
                      </div>
                    )) : (
                      <div style={{ color: DIM, fontSize: 9 }}>No risk signal correlation.</div>
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
