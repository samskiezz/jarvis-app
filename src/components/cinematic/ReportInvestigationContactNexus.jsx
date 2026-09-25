/**
 * F98 — Report × Investigation × Contact Insight Coverage Nexus (RICCOV)
 * Parallel-fetches /v1/reports + /v1/investigations + /entities/Contact.
 * Keyword-correlates each report against investigations AND contacts to classify:
 *   FULLY_LINKED      (investigation + contact match) | INV_TRACKED   (investigation only)
 *   CONTACT_ASSIGNED  (contact only)                  | UNASSIGNED    (neither)
 * Amber badge on unassigned count. Stat tiles REPORTS/INVESTIGATIONS/CONTACTS/classifications.
 * Filter tabs ALL/FULLY_LINKED/INV_TRACKED/CONTACT_ASSIGNED/UNASSIGNED + text search.
 * Expand report → matched investigation cards (cyan) + contact cards (orange) with relevance bars.
 * ▶ ASSESS COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Voice trigger: "riccov/report investigation contact/unassigned reports/report coverage/insight coverage".
 * Event: jarvis:riccov-toggle | 90-s auto-refresh.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 997_800;
const Z_INDEX  = 160;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const RICCOV_RE = /\b(riccov|report\s+investigation\s+contact|unassigned\s+reports|report\s+coverage|insight\s+coverage|report\s+contact\s+coverage|investigation\s+contact\s+report|linked\s+report|report\s+assignment)\b/i;

const CY = "#00CFFF";
const AM = "#F59E0B";
const OR = "#F97316";
const GR = "#22C55E";
const RD = "#EF4444";
const PU = "#A78BFA";
const BG = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_LINKED:     GR,
  INV_TRACKED:      CY,
  CONTACT_ASSIGNED: OR,
  UNASSIGNED:       AM,
};

const TABS = ["ALL", "FULLY_LINKED", "INV_TRACKED", "CONTACT_ASSIGNED", "UNASSIGNED"];
const TAB_LABELS = {
  ALL:              "ALL",
  FULLY_LINKED:     "FULLY LINKED",
  INV_TRACKED:      "INV TRACKED",
  CONTACT_ASSIGNED: "CONTACT ONLY",
  UNASSIGNED:       "UNASSIGNED",
};

// ── exports for JarvisBrain ───────────────────────────────────────────────────

export function isRiccovQuery(text) {
  return RICCOV_RE.test(text || "");
}

// ── helpers ───────────────────────────────────────────────────────────────────

function norm(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function kwTokens(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function overlap(aStr, bStr) {
  const at = new Set(kwTokens(aStr));
  const bt = kwTokens(bStr);
  if (!at.size || !bt.length) return 0;
  return bt.filter(w => at.has(w)).length / Math.max(at.size, bt.length);
}

function scoreReportVsInv(report, inv) {
  const rStr = [report.title, report.description, report.type,
    (report.tags || []).join(" ")].join(" ");
  const iStr = [inv.title, inv.description,
    (inv.tags || []).join(" ")].join(" ");
  return overlap(rStr, iStr);
}

function scoreReportVsContact(report, contact) {
  const rStr = [report.title, report.description, report.type,
    (report.tags || []).join(" ")].join(" ");
  const cStr = [contact.name, contact.role, contact.org, contact.email,
    (contact.tags || []).join(" ")].join(" ");
  return overlap(rStr, cStr);
}

const THRESHOLD = 0.04;

async function fetchAll() {
  const base = apiBase();
  const headers = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
  const [repRaw, invRaw, conRaw] = await Promise.all([
    fetch(`${base}/v1/reports`, { headers }).then(r => r.json()).catch(() => ({})),
    fetch(`${base}/v1/investigations`, { headers }).then(r => r.json()).catch(() => ({})),
    fetch(`${base}/entities/Contact`, { headers }).then(r => r.json()).catch(() => ({})),
  ]);
  const reports  = norm(repRaw, ["reports", "data", "items", "results"]);
  const invs     = norm(invRaw, ["investigations", "data", "items", "results"]);
  const contacts = norm(conRaw, ["contacts", "data", "items", "results"]);

  const rows = reports.map(rep => {
    const matchedInvs = invs
      .map(inv => ({ ...inv, _rel: scoreReportVsInv(rep, inv) }))
      .filter(inv => inv._rel >= THRESHOLD)
      .sort((a, b) => b._rel - a._rel)
      .slice(0, 5);
    const matchedContacts = contacts
      .map(c => ({ ...c, _rel: scoreReportVsContact(rep, c) }))
      .filter(c => c._rel >= THRESHOLD)
      .sort((a, b) => b._rel - a._rel)
      .slice(0, 5);
    const hasInv = matchedInvs.length > 0;
    const hasCon = matchedContacts.length > 0;
    const _class =
      hasInv && hasCon ? "FULLY_LINKED" :
      hasInv            ? "INV_TRACKED" :
      hasCon            ? "CONTACT_ASSIGNED" :
                          "UNASSIGNED";
    return { ...rep, _class, _invs: matchedInvs, _contacts: matchedContacts };
  });

  return { rows, invs, contacts };
}

export async function buildRiccovScript() {
  const { rows, invs, contacts } = await fetchAll();
  const total    = rows.length;
  const linked   = rows.filter(r => r._class === "FULLY_LINKED").length;
  const invOnly  = rows.filter(r => r._class === "INV_TRACKED").length;
  const conOnly  = rows.filter(r => r._class === "CONTACT_ASSIGNED").length;
  const unassign = rows.filter(r => r._class === "UNASSIGNED").length;
  const pct = total ? Math.round((linked / total) * 100) : 0;
  return `Report investigation contact coverage nexus RICCOV report, sir. Of ${total} intelligence reports cross-referenced against ${invs.length} active investigations and ${contacts.length} contacts: ${linked} reports (${pct}%) are fully linked — they have both an active investigation and a responsible contact assigned. ${invOnly} are tracked by an investigation but lack a named contact, ${conOnly} are contact-assigned but lack a backing investigation, and ${unassign} reports remain completely unassigned. Immediate action: assign responsible contacts to the ${invOnly} investigation-tracked reports and open formal investigations for the ${conOnly} contact-only reports to close accountability gaps.`;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function ReportInvestigationContactNexus() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState(null);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [brief, setBrief]         = useState("");
  const [assessing, setAssessing] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { rows: r } = await fetchAll();
      setRows(r);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener("jarvis:riccov-toggle", handler);
    return () => window.removeEventListener("jarvis:riccov-toggle", handler);
  }, []);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true); setBrief("");
    try {
      const script = await buildRiccovScript();
      const base = apiBase();
      const headers = { "Content-Type": "application/json",
        ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers, body: JSON.stringify({ message: script }),
      });
      const data = await res.json().catch(() => ({}));
      const reply = data.response || data.message || data.reply || script;
      setBrief(reply);
      fetch(`${base}/v1/voice/tts`, {
        method: "POST", headers, body: JSON.stringify({ text: reply }),
      }).catch(() => {});
    } catch (e) {
      setBrief(String(e));
    } finally {
      setAssessing(false);
    }
  }, [assessing]);

  const filtered = rows.filter(r => {
    if (tab !== "ALL" && r._class !== tab) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (r.title || "").toLowerCase().includes(s) ||
           (r.description || "").toLowerCase().includes(s) ||
           (r.type || "").toLowerCase().includes(s);
  });

  const total    = rows.length;
  const linked   = rows.filter(r => r._class === "FULLY_LINKED").length;
  const invOnly  = rows.filter(r => r._class === "INV_TRACKED").length;
  const conOnly  = rows.filter(r => r._class === "CONTACT_ASSIGNED").length;
  const unassign = rows.filter(r => r._class === "UNASSIGNED").length;
  const pct = total ? Math.round((linked / total) * 100) : 0;

  const tile = (label, val, col) => (
    <div key={label} style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      background: `${col}12`, border: `1px solid ${col}33`,
      borderRadius: 6, padding: "4px 10px", minWidth: 60,
    }}>
      <span style={{ fontSize: 16, fontWeight: 700, color: col }}>{val}</span>
      <span style={{ fontSize: 8, color: "#6E8AA0", letterSpacing: 1, marginTop: 1 }}>{label}</span>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Report × Investigation × Contact Insight Coverage Nexus (RICCOV)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: open ? GR : "rgba(34,197,94,0.12)",
          border: `1px solid ${GR}66`, borderRadius: 6,
          color: GR, fontFamily: FONT, fontSize: 10, fontWeight: 700,
          padding: "4px 10px", cursor: "pointer", letterSpacing: 1,
          display: "flex", alignItems: "center", gap: 5,
        }}
      >
        ◈ RICCOV
        {unassign > 0 && (
          <span style={{
            background: AM, color: "#04060A", borderRadius: 4,
            padding: "0 5px", fontSize: 9, fontWeight: 700,
          }}>{unassign}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
          zIndex: Z_INDEX + 1, width: "min(860px,95vw)", maxHeight: "82vh",
          background: BG, border: `1px solid ${BORDER}`, borderRadius: 14,
          display: "flex", flexDirection: "column", fontFamily: FONT,
          boxShadow: `0 0 60px ${GR}22`,
        }}>
          {/* header */}
          <div style={{ padding: "14px 18px 10px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ color: GR, fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>◈ RICCOV</span>
              <span style={{ color: "#6E8AA0", fontSize: 11 }}>Report × Investigation × Contact Insight Coverage Nexus</span>
              <button onClick={() => setOpen(false)} style={{
                marginLeft: "auto", background: "none", border: "none", color: "#6E8AA0",
                cursor: "pointer", fontSize: 16,
              }}>✕</button>
            </div>

            {/* stat tiles */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              {tile("TOTAL",        total,    GR)}
              {tile("FULLY LINKED", linked,   GR)}
              {tile("INV TRACKED",  invOnly,  CY)}
              {tile("CONTACT ONLY", conOnly,  OR)}
              {tile("UNASSIGNED",   unassign, AM)}
            </div>

            {/* linked coverage bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 10, color: "#6E8AA0", minWidth: 120 }}>LINKED COVERAGE</span>
              <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%",
                  background: `linear-gradient(90deg,${GR},${CY})`, borderRadius: 3, transition: "width 0.6s" }} />
              </div>
              <span style={{ fontSize: 11, color: GR, minWidth: 36 }}>{pct}%</span>
            </div>

            {/* filter tabs */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {TABS.map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  fontSize: 9, padding: "3px 8px", borderRadius: 4, cursor: "pointer", fontFamily: FONT,
                  background: tab === t ? CLASS_COLOR[t] || GR : "rgba(255,255,255,0.04)",
                  color: tab === t ? "#04060A" : "#8FA8C0",
                  border: `1px solid ${tab === t ? CLASS_COLOR[t] || GR : "rgba(255,255,255,0.1)"}`,
                }}>
                  {TAB_LABELS[t]}
                </button>
              ))}
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="search reports…"
                style={{
                  marginLeft: "auto", fontSize: 10, padding: "3px 8px", borderRadius: 4,
                  background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`,
                  color: "#DCEBF5", fontFamily: FONT, outline: "none", width: 150,
                }}
              />
            </div>
          </div>

          {/* body */}
          <div style={{ overflowY: "auto", flex: 1, padding: "10px 18px 14px" }}>
            {loading && <div style={{ color: "#6E8AA0", fontSize: 11, padding: 12 }}>loading report coverage nexus data…</div>}
            {err     && <div style={{ color: RD, fontSize: 11, padding: 12 }}>{err}</div>}
            {!loading && !err && filtered.length === 0 && (
              <div style={{ color: "#6E8AA0", fontSize: 11, padding: 12 }}>no reports match this filter</div>
            )}
            {filtered.map((rep, i) => {
              const cc = CLASS_COLOR[rep._class] || GR;
              const isExp = expanded === i;
              return (
                <div key={i} style={{
                  marginBottom: 6, border: `1px solid ${cc}22`, borderRadius: 8,
                  background: "rgba(255,255,255,0.02)",
                }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: cc, flexShrink: 0,
                      boxShadow: `0 0 6px ${cc}` }} />
                    <span style={{ fontSize: 12, color: "#DCEBF5", flex: 1 }}>
                      {rep.title || rep.name || rep.id || `Report #${i + 1}`}
                    </span>
                    {rep.type && (
                      <span style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>{String(rep.type).toUpperCase()}</span>
                    )}
                    {rep.date && (
                      <span style={{ fontSize: 9, color: AM }}>{rep.date}</span>
                    )}
                    <span style={{ fontSize: 9, color: cc, letterSpacing: 1, padding: "2px 6px",
                      border: `1px solid ${cc}44`, borderRadius: 4 }}>{rep._class.replace(/_/g, " ")}</span>
                    <span style={{ fontSize: 10, color: "#6E8AA0" }}>{isExp ? "▲" : "▼"}</span>
                  </div>
                  {isExp && (
                    <div style={{ padding: "0 12px 12px" }}>
                      {rep.description && (
                        <div style={{ fontSize: 10, color: "#8FA8C0", marginBottom: 8 }}>{rep.description}</div>
                      )}
                      {/* matched investigations */}
                      {rep._invs.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 9, color: CY, letterSpacing: 1, marginBottom: 4 }}>▸ MATCHED INVESTIGATIONS</div>
                          {rep._invs.map((inv, j) => (
                            <div key={j} style={{ marginBottom: 4, padding: "5px 8px",
                              background: "rgba(0,207,255,0.07)", border: `1px solid ${CY}22`, borderRadius: 6 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                                {inv.status && (
                                  <span style={{ fontSize: 9, color: "#04060A", background: CY,
                                    padding: "1px 5px", borderRadius: 3, fontWeight: 700 }}>
                                    {String(inv.status).toUpperCase()}
                                  </span>
                                )}
                                <span style={{ fontSize: 11, color: "#DCEBF5" }}>{inv.title || inv.name || inv.id || "Investigation"}</span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 9, color: "#6E8AA0" }}>relevance</span>
                                <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                                  <div style={{ width: `${Math.min(100, Math.round(inv._rel * 100))}%`, height: "100%",
                                    background: CY, borderRadius: 2 }} />
                                </div>
                                <span style={{ fontSize: 9, color: CY }}>{Math.round(inv._rel * 100)}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* matched contacts */}
                      {rep._contacts.length > 0 && (
                        <div>
                          <div style={{ fontSize: 9, color: OR, letterSpacing: 1, marginBottom: 4 }}>▸ MATCHED CONTACTS</div>
                          {rep._contacts.map((c, k) => (
                            <div key={k} style={{ marginBottom: 4, padding: "5px 8px",
                              background: "rgba(249,115,22,0.07)", border: `1px solid ${OR}22`, borderRadius: 6 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                                {c.role && (
                                  <span style={{ fontSize: 9, color: "#04060A", background: OR,
                                    padding: "1px 5px", borderRadius: 3, fontWeight: 700 }}>
                                    {String(c.role).toUpperCase()}
                                  </span>
                                )}
                                <span style={{ fontSize: 11, color: "#DCEBF5" }}>{c.name || "Contact"}</span>
                                {c.org && <span style={{ fontSize: 9, color: "#8FA8C0" }}>{c.org}</span>}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 9, color: "#6E8AA0" }}>relevance</span>
                                <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                                  <div style={{ width: `${Math.min(100, Math.round(c._rel * 100))}%`, height: "100%",
                                    background: OR, borderRadius: 2 }} />
                                </div>
                                <span style={{ fontSize: 9, color: OR }}>{Math.round(c._rel * 100)}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {rep._invs.length === 0 && rep._contacts.length === 0 && (
                        <div style={{ fontSize: 10, color: AM, fontStyle: "italic" }}>
                          No investigation or contact correlations — report is unassigned.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* footer */}
          <div style={{ padding: "10px 18px", borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
            <button onClick={assess} disabled={assessing || loading} style={{
              background: assessing ? "rgba(34,197,94,0.1)" : GR, color: assessing ? GR : "#04060A",
              border: `1px solid ${GR}`, borderRadius: 6, padding: "6px 14px", fontSize: 11,
              cursor: assessing ? "not-allowed" : "pointer", fontFamily: FONT, letterSpacing: 1,
            }}>
              {assessing ? "assessing…" : "▶ ASSESS COVERAGE"}
            </button>
            {brief && (
              <div style={{
                marginTop: 8, fontSize: 11, color: "#DCEBF5", lineHeight: 1.5,
                background: "rgba(34,197,94,0.06)", borderRadius: 6, padding: "8px 12px",
                border: `1px solid ${GR}22`,
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
