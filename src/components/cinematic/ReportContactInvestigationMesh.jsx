/**
 * F293 — Report × Contact × Investigation Grand Convergence (RCIG)
 *
 * Parallel-fetches /v1/reports + /entities/Contact + /v1/investigations,
 * then keyword-correlates each report against contacts AND open investigations
 * to classify:
 *   FULLY_LINKED   — report matches at least one contact AND one investigation
 *   CONTACT_ONLY   — matches a contact but no investigation
 *   INV_ONLY       — matches an investigation but no contact
 *   DARK           — matches neither (unowned, uncased report)
 *
 * Stat tiles:  reports / contacts / investigations / dark
 * Filter tabs: ALL | FULLY_LINKED | CONTACT_ONLY | INV_ONLY | DARK
 * Text search: across report title / type / topic.
 * Expand row → matched contacts + matched investigations with relevance bars.
 * Amber badge on dark count.
 * ▶ ASSESS: 2-sentence coverage brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ RCIG  at left:7320 bottom:18, zIndex:68.
 * Event:   jarvis:rcig-toggle
 * Voice:   "rcig" / "report contact investigation" / "report convergence"
 *          / "dark reports" / "unowned reports" / "uncased reports"
 *          / "report grand convergence" / "who owns the report"
 *          / "report without contact" / "report without investigation"
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

const BTN_LEFT   = 7320;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise ────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseReports(raw) {
  return normaliseArray(raw).map((r, i) => ({
    id:         String(r.id ?? r.report_id ?? i),
    title:      r.title ?? r.name ?? r.subject ?? `Report ${i + 1}`,
    type:       r.type ?? r.report_type ?? r.category ?? "",
    topic:      r.topic ?? r.tags ?? "",
    searchText: [r.title, r.name, r.type, r.topic, r.description, r.tags]
                  .filter(Boolean).join(" "),
    haystack:   [r.title, r.name, r.description, r.topic, r.type, r.tags, r.summary, r.body]
                  .filter(Boolean).join(" "),
  }));
}

function normaliseContacts(raw) {
  return normaliseArray(raw).map((c, i) => ({
    id:           String(c.id ?? c.contact_id ?? i),
    name:         c.name ?? c.full_name ?? c.display_name ?? `Contact ${i + 1}`,
    organization: c.organization ?? c.company ?? c.org ?? "",
    role:         c.role ?? c.title ?? c.position ?? "",
    haystack:     [c.name, c.full_name, c.email, c.organization, c.company,
                   c.role, c.title, c.description, c.tags]
                    .filter(Boolean).join(" "),
  }));
}

function normaliseInvestigations(raw) {
  return normaliseArray(raw).map((inv, i) => ({
    id:       String(inv.id ?? inv.investigation_id ?? i),
    title:    inv.title ?? inv.name ?? inv.subject ?? `Investigation ${i + 1}`,
    status:   inv.status ?? inv.state ?? "",
    haystack: [inv.title, inv.name, inv.description, inv.subject, inv.tags,
               inv.type, inv.notes]
                .filter(Boolean).join(" "),
  }));
}

// ─── keyword scoring ──────────────────────────────────────────────────────────

function buildKeywords(strings) {
  return strings
    .flatMap(s => String(s).toLowerCase().split(/[^a-z0-9]+/))
    .filter(t => t.length >= 3);
}

function scoreMatch(keywords, haystack) {
  const h = haystack.toLowerCase();
  return keywords.reduce((acc, kw) => acc + (h.includes(kw) ? 1 : 0), 0);
}

// ─── fetch ────────────────────────────────────────────────────────────────────

async function fetchAll() {
  const hdrs = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [rRep, rCon, rInv] = await Promise.allSettled([
    fetch(`${base}/v1/reports`,      { headers: hdrs }).then(r => r.ok ? r.json() : []),
    fetch(`${base}/entities/Contact`,       { headers: hdrs }).then(r => r.ok ? r.json() : []),
    fetch(`${base}/v1/investigations`, { headers: hdrs }).then(r => r.ok ? r.json() : []),
  ]);
  return {
    reports:        normaliseReports(rRep.status === "fulfilled" ? rRep.value : []),
    contacts:       normaliseContacts(rCon.status === "fulfilled" ? rCon.value : []),
    investigations: normaliseInvestigations(rInv.status === "fulfilled" ? rInv.value : []),
  };
}

// ─── classify ────────────────────────────────────────────────────────────────

function classify(reports, contacts, investigations) {
  return reports.map(rep => {
    const kw = buildKeywords([rep.haystack]);

    const matchedContacts = contacts
      .map(c => ({ ...c, score: scoreMatch(kw, c.haystack) }))
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    const matchedInvs = investigations
      .map(inv => ({ ...inv, score: scoreMatch(kw, inv.haystack) }))
      .filter(inv => inv.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    const hasContact = matchedContacts.length > 0;
    const hasInv     = matchedInvs.length > 0;

    let classification;
    if (hasContact && hasInv)  classification = "FULLY_LINKED";
    else if (hasContact)       classification = "CONTACT_ONLY";
    else if (hasInv)           classification = "INV_ONLY";
    else                       classification = "DARK";

    return { ...rep, classification, matchedContacts, matchedInvs };
  });
}

// ─── style helpers ────────────────────────────────────────────────────────────

function classColour(cls) {
  return { FULLY_LINKED: GREEN, CONTACT_ONLY: CY, INV_ONLY: AMBER, DARK: RED }[cls] ?? MUTED;
}

// ─── exported intent helpers ──────────────────────────────────────────────────

export function isRcigQuery(q) {
  const l = q.toLowerCase();
  return ["rcig", "report contact investigation", "report convergence",
    "dark reports", "unowned reports", "uncased reports",
    "report grand convergence", "who owns the report",
    "report without contact", "report without investigation",
  ].some(kw => l.includes(kw));
}

export async function buildRcigScript() {
  try {
    const { reports, contacts, investigations } = await fetchAll();
    const classified = classify(reports, contacts, investigations);
    const dark    = classified.filter(r => r.classification === "DARK").length;
    const full    = classified.filter(r => r.classification === "FULLY_LINKED").length;
    const conOnly = classified.filter(r => r.classification === "CONTACT_ONLY").length;
    const invOnly = classified.filter(r => r.classification === "INV_ONLY").length;
    return `Report × Contact × Investigation Convergence: ${reports.length} reports analysed ` +
      `against ${contacts.length} contacts and ${investigations.length} investigations. ` +
      `${full} fully linked (contact + case), ${conOnly} contact-only, ${invOnly} case-only, ` +
      `${dark} dark (no owner, no case). ` +
      (dark > 0 ? `${dark} reports have no contact or investigation link — recommend triage.` :
                  `All reports are covered by at least one contact or investigation.`);
  } catch {
    return "Report contact investigation data unavailable.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function ReportContactInvestigationMesh() {
  const [open, setOpen]                   = useState(false);
  const [loading, setLoading]             = useState(false);
  const [classified, setClassified]       = useState([]);
  const [contacts, setContacts]           = useState([]);
  const [investigations, setInvestigations] = useState([]);
  const [filter, setFilter]               = useState("ALL");
  const [search, setSearch]               = useState("");
  const [expanded, setExpanded]           = useState(null);
  const [assessing, setAssessing]         = useState(false);
  const [brief, setBrief]                 = useState("");
  const timerRef                          = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { reports, contacts: c, investigations: inv } = await fetchAll();
      const cls = classify(reports, c, inv);
      setClassified(cls);
      setContacts(c);
      setInvestigations(inv);
    } catch {/* silent */}
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(v => !v); };
    window.addEventListener("jarvis:rcig-toggle", handler);
    return () => window.removeEventListener("jarvis:rcig-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const dark    = classified.filter(r => r.classification === "DARK").length;
  const full    = classified.filter(r => r.classification === "FULLY_LINKED").length;
  const conOnly = classified.filter(r => r.classification === "CONTACT_ONLY").length;
  const invOnly = classified.filter(r => r.classification === "INV_ONLY").length;

  const visible = classified.filter(r => {
    if (filter !== "ALL" && r.classification !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.searchText.toLowerCase().includes(s);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true); setBrief("");
    const script = await buildRcigScript();
    setBrief(script);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
          background: "rgba(4,7,14,0.82)", border: `1px solid ${AMBER}`,
          color: AMBER, fontFamily: MONO, fontSize: 11, padding: "4px 9px",
          borderRadius: 4, cursor: "pointer", letterSpacing: 1,
        }}
        title="Report × Contact × Investigation Grand Convergence (RCIG)"
      >
        ◈ RCIG
        {dark > 0 && (
          <span style={{
            marginLeft: 5, background: AMBER, color: "#000",
            borderRadius: 8, fontSize: 10, padding: "1px 5px",
          }}>
            {dark}
          </span>
        )}
      </button>
    );
  }

  const TABS = ["ALL", "FULLY_LINKED", "CONTACT_ONLY", "INV_ONLY", "DARK"];

  return (
    <div style={{
      position: "fixed", top: 60, right: 12, width: 520, maxHeight: "calc(100vh - 80px)",
      overflowY: "auto", background: BG, border: `1px solid ${AMBER}`,
      borderRadius: 8, zIndex: 2000, fontFamily: MONO, color: CY,
      boxShadow: `0 0 24px ${AMBER}44`,
    }}>
      {/* header */}
      <div style={{ padding: "10px 14px 6px", borderBottom: `1px solid #1a2a3a` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: AMBER, fontSize: 12, letterSpacing: 1 }}>
            ◈ REPORT × CONTACT × INVESTIGATION CONVERGENCE
          </span>
          <button onClick={() => setOpen(false)}
            style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {[
            ["REPORTS", classified.length, CY],
            ["CONTACTS", contacts.length, GREEN],
            ["CASES", investigations.length, AMBER],
            ["FULLY LINKED", full, GREEN],
            ["CONTACT ONLY", conOnly, CY],
            ["INV ONLY", invOnly, AMBER],
            ["DARK", dark, RED],
          ].map(([label, val, clr]) => (
            <div key={label} style={{
              background: `${clr}11`, border: `1px solid ${clr}44`,
              borderRadius: 4, padding: "3px 8px", textAlign: "center",
            }}>
              <div style={{ color: clr, fontSize: 15, fontWeight: 700 }}>{val}</div>
              <div style={{ color: MUTED, fontSize: 9, letterSpacing: 1 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* filter tabs */}
        <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setFilter(t)}
              style={{
                background: filter === t ? `${AMBER}22` : "transparent",
                border: `1px solid ${filter === t ? AMBER : "#2a3a4a"}`,
                color: filter === t ? AMBER : MUTED,
                borderRadius: 3, padding: "2px 7px", fontSize: 10,
                cursor: "pointer", letterSpacing: 0.5,
              }}>
              {t}
            </button>
          ))}
        </div>

        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search reports…"
          style={{
            marginTop: 6, width: "100%", boxSizing: "border-box",
            background: "#0a1520", border: "1px solid #2a3a4a",
            color: CY, fontFamily: MONO, fontSize: 11, padding: "4px 8px",
            borderRadius: 3, outline: "none",
          }}
        />
      </div>

      {/* list */}
      <div style={{ padding: "6px 8px" }}>
        {loading && <div style={{ color: MUTED, fontSize: 11, padding: 8 }}>Loading…</div>}
        {!loading && visible.length === 0 && (
          <div style={{ color: MUTED, fontSize: 11, padding: 8 }}>No reports match filter.</div>
        )}
        {visible.map(rep => {
          const isExp = expanded === rep.id;
          const cls   = rep.classification;
          const clr   = classColour(cls);
          return (
            <div key={rep.id} style={{
              borderBottom: "1px solid #0f1f2f", padding: "6px 6px",
            }}>
              <div
                onClick={() => setExpanded(isExp ? null : rep.id)}
                style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
              >
                <span style={{ color: clr, fontSize: 10, minWidth: 100 }}>{cls}</span>
                <span style={{ color: CY, fontSize: 11, flex: 1 }}>{rep.title}</span>
                {rep.type && (
                  <span style={{
                    background: "#1a2a3a", color: MUTED, fontSize: 9,
                    borderRadius: 3, padding: "1px 5px",
                  }}>{rep.type}</span>
                )}
              </div>

              {isExp && (
                <div style={{ marginTop: 6, paddingLeft: 8 }}>
                  {/* matched contacts */}
                  {rep.matchedContacts.length > 0 && (
                    <div>
                      <div style={{ color: GREEN, fontSize: 10, marginBottom: 3 }}>
                        CONTACTS ({rep.matchedContacts.length})
                      </div>
                      {rep.matchedContacts.map(c => (
                        <div key={c.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: CY, fontSize: 10 }}>
                              {c.name}{c.role ? ` · ${c.role}` : ""}
                            </span>
                            <span style={{ color: MUTED, fontSize: 9 }}>
                              score: {c.score}
                            </span>
                          </div>
                          <div style={{
                            height: 3, background: "#1a2a3a", borderRadius: 2, marginTop: 2,
                          }}>
                            <div style={{
                              height: "100%", width: `${Math.min(100, c.score * 10)}%`,
                              background: GREEN, borderRadius: 2,
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* matched investigations */}
                  {rep.matchedInvs.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ color: AMBER, fontSize: 10, marginBottom: 3 }}>
                        INVESTIGATIONS ({rep.matchedInvs.length})
                      </div>
                      {rep.matchedInvs.map(inv => (
                        <div key={inv.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: CY, fontSize: 10 }}>{inv.title}</span>
                            <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                              {inv.status && (
                                <span style={{
                                  background: "#1a2a3a", color: MUTED, fontSize: 9,
                                  borderRadius: 3, padding: "1px 5px",
                                }}>{inv.status}</span>
                              )}
                              <span style={{ color: MUTED, fontSize: 9 }}>
                                score: {inv.score}
                              </span>
                            </span>
                          </div>
                          <div style={{
                            height: 3, background: "#1a2a3a", borderRadius: 2, marginTop: 2,
                          }}>
                            <div style={{
                              height: "100%", width: `${Math.min(100, inv.score * 10)}%`,
                              background: AMBER, borderRadius: 2,
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {rep.matchedContacts.length === 0 && rep.matchedInvs.length === 0 && (
                    <div style={{ color: RED, fontSize: 10 }}>No contacts or investigations linked.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* assess */}
      <div style={{ padding: "8px 14px", borderTop: "1px solid #1a2a3a" }}>
        <button
          onClick={assess} disabled={assessing}
          style={{
            background: assessing ? "#1a2a3a" : `${AMBER}22`,
            border: `1px solid ${AMBER}`, color: AMBER,
            fontFamily: MONO, fontSize: 11, padding: "4px 12px",
            borderRadius: 4, cursor: assessing ? "not-allowed" : "pointer",
          }}
        >
          {assessing ? "Assessing…" : "▶ ASSESS"}
        </button>
        {brief && (
          <div style={{
            marginTop: 8, color: CY, fontSize: 11,
            background: "#0a1520", borderRadius: 4,
            padding: "6px 8px", lineHeight: 1.5,
          }}>
            {brief}
          </div>
        )}
      </div>
    </div>
  );
}
