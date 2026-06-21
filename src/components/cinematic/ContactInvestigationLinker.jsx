/**
 * ContactInvestigationLinker — F72.
 *
 * Parallel-fetches /entities/Contact + /v1/investigations.
 * Keyword-correlates each contact (name/org/tags/role) against open/in-progress
 * investigation titles, descriptions, and subjects to surface which contacts
 * may be relevant to active cases.
 *
 * Stat tiles: contacts / cases / linked / unlinked cases
 * Filter tabs: ALL / LINKED / UNLINKED
 * Split panel: case list left, matched contacts right.
 * Click ▶ ASSESS on any case → /v1/jarvis/agent/chat AI 2-sentence
 *   contact-relevance assessment + TTS via jarvis:speak-dossier.
 * 5-min auto-refresh.
 *
 * Intent: "contact investigation" / "case contact" / "who is linked" /
 *         "contact linker" / "cinvl" / "contact case"
 *   → jarvis:contact-inv-toggle + TTS brief via buildContactInvScript()
 *
 * Toggle: ◈ CINVL at left:6212, zIndex 65.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED = "#FF3D5A";
const PURPLE = "#A78BFA";
const BTN_LEFT = 6212;
const REFRESH_MS = 5 * 60 * 1000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

function normaliseContacts(raw) {
  return normaliseArray(raw).map((c) => ({
    id: c.id || c.contact_id || String(Math.random()),
    name: c.name || c.full_name || c.display_name || "Unknown Contact",
    org: c.org || c.organisation || c.company || c.department || "",
    role: c.role || c.title || c.position || "",
    tags: [...(c.tags || []), ...(c.keywords || [])].map(String),
    email: c.email || "",
    location: c.location || c.city || c.country || "",
  }));
}

function normaliseInvestigations(raw) {
  return normaliseArray(raw).map((inv) => ({
    id: inv.id || inv.case_id || String(Math.random()),
    title: inv.title || inv.name || inv.case_name || "Unnamed Case",
    description: inv.description || inv.summary || inv.details || "",
    status: (inv.status || "open").toLowerCase(),
    priority: inv.priority || inv.severity || "",
    subject: inv.subject || inv.target || inv.person_of_interest || "",
    lead: inv.lead || inv.assigned_to || inv.investigator || "",
    date: inv.date || inv.created_at || inv.opened_at || "",
  }));
}

function keywords(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function contactMatchScore(contact, inv) {
  const invText = `${inv.title} ${inv.description} ${inv.subject} ${inv.lead}`.toLowerCase();
  const contactWords = [
    ...keywords(contact.name),
    ...keywords(contact.org),
    ...keywords(contact.role),
    ...contact.tags.flatMap(keywords),
  ];
  return contactWords.reduce((acc, w) => acc + (invText.includes(w) ? 1 : 0), 0);
}

function correlate(investigations, contacts) {
  return investigations.map((inv) => {
    const matched = contacts
      .map((c) => ({ ...c, _score: contactMatchScore(c, inv) }))
      .filter((c) => c._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 6);
    return { ...inv, matched };
  });
}

function statusColor(status) {
  if (status === "open") return RED;
  if (status === "in-progress" || status === "in_progress") return AMBER;
  if (status === "pending") return PURPLE;
  return "#445566";
}

function priorityColor(p) {
  const lp = String(p).toLowerCase();
  if (lp === "critical") return RED;
  if (lp === "high") return AMBER;
  if (lp === "medium") return CY;
  return "#445566";
}

// ─── exported intent helpers (consumed by JarvisBrain) ──────────────────────

const CINVL_RE =
  /contact.{0,15}invest|invest.{0,15}contact|case.{0,15}contact|contact.{0,15}case|who\s+is\s+link|contact\s+link|cinvl\b/i;

export function isContactInvQuery(q) {
  return CINVL_RE.test(q || "");
}

export async function buildContactInvScript() {
  try {
    const [contactRaw, invRaw] = await Promise.all([
      fetch(`${apiBase()}/entities/Contact`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
      fetch(`${apiBase()}/v1/investigations`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
    ]);
    const contacts = normaliseContacts(contactRaw);
    const investigations = normaliseInvestigations(invRaw);
    const correlated = correlate(investigations, contacts);
    const linked = correlated.filter((inv) => inv.matched.length > 0);
    const openLinked = linked.filter(
      (inv) => inv.status === "open" || inv.status === "in-progress" || inv.status === "in_progress"
    );
    return `Contact-investigation linker active, sir. ${contacts.length} contact${contacts.length !== 1 ? "s" : ""} cross-referenced against ${investigations.length} case${investigations.length !== 1 ? "s" : ""}. ${linked.length} case${linked.length !== 1 ? "s have" : " has"} potential contact linkages identified. ${openLinked.length} open or active case${openLinked.length !== 1 ? "s" : ""} show contact relevance. Select a case to assess contact involvement.`;
  } catch (_) {
    return "Contact-investigation linker is standing by, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function ContactInvestigationLinker() {
  const [visible, setVisible] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [investigations, setInvestigations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("LINKED");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [contactRaw, invRaw] = await Promise.all([
        fetch(`${apiBase()}/entities/Contact`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
        fetch(`${apiBase()}/v1/investigations`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
      ]);
      setContacts(normaliseContacts(contactRaw));
      setInvestigations(normaliseInvestigations(invRaw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:contact-inv-toggle", onToggle);
    return () => window.removeEventListener("jarvis:contact-inv-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assessCase(inv) {
    setAssessing(inv.id);
    const contactNames = inv.matched.map((c) => `${c.name}${c.org ? ` (${c.org})` : ""}`).join(", ");
    const prompt = `As JARVIS, provide a 2-sentence assessment of the relevance of these contacts to the investigation "${inv.title}": ${contactNames}. Focus on which contact is most operationally significant and why.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Insufficient data to determine contact relevance at this time, sir.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", {
          detail: { text: "Assessment unavailable at this time, sir." },
        })
      );
    }
    setAssessing(null);
  }

  const correlated = correlate(investigations, contacts);
  const linked = correlated.filter((inv) => inv.matched.length > 0);
  const unlinked = correlated.filter((inv) => inv.matched.length === 0);

  const displayed =
    tab === "ALL" ? correlated : tab === "LINKED" ? linked : unlinked;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Contact-Investigation Linker (F72)"
        style={{
          position: "fixed", bottom: 6, left: BTN_LEFT, zIndex: 65,
          background: visible ? `${CY}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? CY : CY}44`,
          color: visible ? CY : `${CY}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ CINVL
        {linked.length > 0 && (
          <span style={{
            marginLeft: 4, background: CY, color: "#04060A",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{linked.length}</span>
        )}
      </button>

      {visible && (
        <div style={{
          position: "fixed", bottom: 32, left: BTN_LEFT - 280, zIndex: 65,
          width: 560, maxHeight: "70vh", overflowY: "auto",
          background: "rgba(6,11,18,0.93)",
          border: `1px solid ${CY}44`,
          borderRadius: 10, padding: "14px 16px",
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${CY}18`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>◈ CONTACT-INVESTIGATION LINKER</span>
            <button
              onClick={fetchData}
              style={{
                marginLeft: "auto", background: "transparent",
                border: `1px solid ${CY}33`, borderRadius: 3,
                color: `${CY}88`, padding: "2px 6px", fontSize: 7,
                cursor: "pointer", letterSpacing: 1,
              }}
            >↻ REFRESH</button>
            <button
              onClick={() => setVisible(false)}
              style={{
                background: "transparent", border: "none",
                color: "#445566", cursor: "pointer", fontSize: 14, lineHeight: 1,
              }}
            >✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              ["CONTACTS", contacts.length, CY],
              ["CASES", investigations.length, PURPLE],
              ["LINKED", linked.length, GREEN],
              ["UNLINKED", unlinked.length, AMBER],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 5, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: "bold" }}>{loading ? "…" : val}</div>
                <div style={{ color: "#445566", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
            {["ALL", "LINKED", "UNLINKED"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "transparent",
                  border: `1px solid ${tab === t ? CY : "#1e3040"}`,
                  color: tab === t ? CY : "#445566",
                  borderRadius: 4, padding: "3px 10px",
                  fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                  letterSpacing: 1, cursor: "pointer",
                }}
              >{t}</button>
            ))}
          </div>

          {/* Case rows */}
          {loading && displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              cross-referencing contacts against cases…
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              {tab === "LINKED" ? "No contact-case linkages found." : "No cases in this filter."}
            </div>
          ) : (
            displayed.map((inv) => {
              const sc = statusColor(inv.status);
              const pc = priorityColor(inv.priority);
              const isOpen = expanded === inv.id;
              const hasMatches = inv.matched.length > 0;
              return (
                <div key={inv.id} style={{
                  background: "rgba(255,255,255,0.02)",
                  border: `1px solid ${isOpen ? `${CY}44` : "#1a2530"}`,
                  borderRadius: 6, padding: "8px 10px", marginBottom: 6,
                  cursor: "pointer",
                }} onClick={() => setExpanded(isOpen ? null : inv.id)}>
                  {/* Case header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 7, color: sc, border: `1px solid ${sc}55`,
                      borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                      whiteSpace: "nowrap", textTransform: "uppercase",
                    }}>{inv.status}</span>
                    {inv.priority && (
                      <span style={{
                        fontSize: 7, color: pc, border: `1px solid ${pc}44`,
                        borderRadius: 3, padding: "1px 5px", letterSpacing: 1, whiteSpace: "nowrap",
                      }}>{String(inv.priority).toUpperCase()}</span>
                    )}
                    <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{inv.title}</span>
                    <span style={{ fontSize: 7, color: hasMatches ? CY : "#334455", whiteSpace: "nowrap" }}>
                      {hasMatches ? `${inv.matched.length} contact${inv.matched.length !== 1 ? "s" : ""}` : "no contacts"}
                    </span>
                  </div>

                  {/* Description snippet */}
                  {inv.description && (
                    <div style={{ color: "#556677", fontSize: 8, lineHeight: 1.4, marginBottom: 4 }}>
                      {inv.description.slice(0, 120)}{inv.description.length > 120 ? "…" : ""}
                    </div>
                  )}

                  {/* Assess button */}
                  {hasMatches && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 7, color: "#334455", flex: 1 }}>
                        {inv.lead && `Lead: ${inv.lead}`}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); assessCase(inv); }}
                        disabled={assessing === inv.id}
                        style={{
                          background: assessing === inv.id ? "#1a2530" : `${CY}18`,
                          color: assessing === inv.id ? "#445566" : CY,
                          border: `1px solid ${CY}44`,
                          borderRadius: 3, padding: "2px 8px",
                          fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                          letterSpacing: 1, cursor: assessing === inv.id ? "default" : "pointer",
                        }}
                      >{assessing === inv.id ? "…assessing" : "▶ ASSESS"}</button>
                    </div>
                  )}

                  {/* Expanded contact list */}
                  {isOpen && hasMatches && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${CY}18` }}>
                      {inv.matched.map((contact) => (
                        <div key={contact.id} style={{
                          background: "rgba(255,255,255,0.02)",
                          border: "1px solid #1e3040",
                          borderRadius: 4, padding: "6px 8px", marginBottom: 4,
                          display: "flex", alignItems: "flex-start", gap: 8,
                        }}>
                          {/* Avatar */}
                          <div style={{
                            width: 24, height: 24, borderRadius: "50%",
                            background: `${CY}22`, border: `1px solid ${CY}44`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 8, color: CY, flexShrink: 0,
                            fontWeight: "bold",
                          }}>
                            {contact.name.charAt(0).toUpperCase()}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ color: "#a0b8cc", fontSize: 10 }}>{contact.name}</div>
                            {(contact.role || contact.org) && (
                              <div style={{ color: "#445566", fontSize: 8, marginTop: 1 }}>
                                {[contact.role, contact.org].filter(Boolean).join(" · ")}
                              </div>
                            )}
                            {contact.tags.length > 0 && (
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
                                {contact.tags.slice(0, 4).map((tag) => (
                                  <span key={tag} style={{
                                    fontSize: 7, color: PURPLE,
                                    border: "1px solid #A78BFA33", borderRadius: 2, padding: "1px 4px",
                                  }}>{tag}</span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize: 7, color: `${CY}66`, whiteSpace: "nowrap" }}>
                            score {contact._score}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {isOpen && !hasMatches && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #1a2530", color: "#334455", fontSize: 8 }}>
                      No contacts matched this case.
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div style={{ marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right" }}>
            /entities/Contact + /v1/investigations · 5-min auto-refresh · click ▶ ASSESS for AI contact-relevance assessment
          </div>
        </div>
      )}
    </>
  );
}
