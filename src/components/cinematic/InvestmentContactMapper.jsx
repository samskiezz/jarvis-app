/**
 * InvestmentContactMapper — F81.
 *
 * Parallel-fetches /entities/Investment + /entities/Contact.
 * Keyword-correlates each investment (name, type, sector, tags) against
 * contacts (role, department, organisation, tags) to surface which contacts
 * in the network are relevant to each investment — bridging wealth data with
 * the people who manage, advise, or influence it.
 *
 * Stat tiles: investments / contacts / linked investments / unlinked investments
 * Filter tabs: ALL / LINKED / UNLINKED
 * Investments sorted by linked-contact count (descending), then name.
 * Click ▶ ASSESS on a linked investment → /v1/jarvis/agent/chat AI 2-sentence
 *   relationship assessment + TTS via jarvis:speak-dossier.
 * 60s auto-refresh.
 *
 * Intent: "investment contact" / "contact investor" / "investment network" /
 *         "wealth contact" / "portfolio contact" / "invcon" / "who manages"
 *   → jarvis:invcon-toggle + TTS brief via buildInvContactScript()
 *
 * Toggle: ◈ INVCON at left:7148, zIndex 65. Amber badge shows linked-investment count.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3D5A";
const PU    = "#A78BFA";
const BTN_LEFT   = 7148;
const REFRESH_MS = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// Finance/wealth keywords that mark a contact as potentially investment-relevant
const FINANCE_KEYWORDS = [
  "finance", "financial", "invest", "fund", "portfolio", "wealth", "asset",
  "banking", "bank", "capital", "cfo", "treasurer", "analyst", "advisor",
  "adviser", "broker", "equity", "hedge", "trade", "trading", "market",
  "securities", "stock", "bond", "crypto", "currency", "venture", "private equity",
];

// ─── normalisers ─────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && Array.isArray(raw.entities)) return raw.entities;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

function normaliseInvestments(raw) {
  return normaliseArray(raw).map((inv) => ({
    id: inv.id || inv.investment_id || String(Math.random()),
    name: inv.name || inv.asset || inv.ticker || inv.symbol || inv.title || "Unnamed Investment",
    type: (inv.asset_class || inv.type || inv.category || inv.asset_type || "").toLowerCase(),
    sector: (inv.sector || inv.industry || inv.theme || "").toLowerCase(),
    ticker: inv.ticker || inv.symbol || "",
    status: (inv.status || "active").toLowerCase(),
    value: inv.current_value || inv.value || inv.amount || 0,
    tags: Array.isArray(inv.tags) ? inv.tags : inv.tags ? String(inv.tags).split(",") : [],
  }));
}

function normaliseContacts(raw) {
  return normaliseArray(raw).map((c) => ({
    id: c.id || c.contact_id || String(Math.random()),
    name: c.name || c.full_name || `${c.first_name || ""} ${c.last_name || ""}`.trim() || "Unknown",
    role: c.role || c.title || c.position || c.job_title || "",
    dept: c.department || c.organization || c.company || c.team || c.org || "",
    email: c.email || "",
    phone: c.phone || "",
    location: c.location || c.city || c.country || "",
    tags: Array.isArray(c.tags) ? c.tags : c.tags ? String(c.tags).split(",") : [],
  }));
}

// ─── correlation ──────────────────────────────────────────────────────────────

function kw(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function contactIsFinanceRelevant(contact) {
  const haystack = `${contact.role} ${contact.dept} ${contact.tags.join(" ")}`.toLowerCase();
  return FINANCE_KEYWORDS.some((k) => haystack.includes(k));
}

function matchContactsForInvestment(inv, contacts) {
  const invWords = [
    ...kw(inv.name),
    ...kw(inv.type),
    ...kw(inv.sector),
    ...kw(inv.ticker),
    ...inv.tags.flatMap(kw),
  ];

  return contacts.filter((c) => {
    // Finance-role contacts are relevant to any investment
    if (contactIsFinanceRelevant(c)) return true;
    // Direct keyword overlap: investment name/sector against contact role/dept/tags
    const cHaystack = `${c.role} ${c.dept} ${c.tags.join(" ")} ${c.name}`.toLowerCase();
    return invWords.some((w) => w.length > 3 && cHaystack.includes(w));
  });
}

function correlate(investments, contacts) {
  return investments.map((inv) => ({
    ...inv,
    matchedContacts: matchContactsForInvestment(inv, contacts),
  }));
}

// ─── exported intent helpers (consumed by JarvisBrain) ───────────────────────

const INVCON_RE =
  /invest.{0,15}contact|contact.{0,15}invest|investment\s+network|wealth\s+contact|portfolio\s+contact|who\s+manage|invcon\b|contact\s+investor/i;

export function isInvContactQuery(q) {
  return INVCON_RE.test(q || "");
}

export async function buildInvContactScript() {
  try {
    const [invRaw, conRaw] = await Promise.all([
      fetch(`${apiBase()}/entities/Investment`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
      fetch(`${apiBase()}/entities/Contact`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
    ]);
    const investments = normaliseInvestments(invRaw);
    const contacts    = normaliseContacts(conRaw);
    const correlated  = correlate(investments, contacts);
    const linked      = correlated.filter((inv) => inv.matchedContacts.length > 0);
    const topInv      = linked.sort((a, b) => b.matchedContacts.length - a.matchedContacts.length)[0];
    window.dispatchEvent(new CustomEvent("jarvis:invcon-toggle"));
    return `Investment-contact mapper online, sir. ${investments.length} investment${investments.length !== 1 ? "s" : ""} cross-referenced against ${contacts.length} contact${contacts.length !== 1 ? "s" : ""}. ${linked.length} investment${linked.length !== 1 ? "s have" : " has"} relevant contacts in the network${topInv ? `, led by "${topInv.name}" with ${topInv.matchedContacts.length} linked contact${topInv.matchedContacts.length !== 1 ? "s" : ""}` : ""}. Select an investment to request an AI relationship assessment.`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:invcon-toggle"));
    return "Investment-contact mapper is online, sir. Awaiting entity data to correlate the portfolio with your contact network.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function InvestmentContactMapper() {
  const [visible, setVisible]     = useState(false);
  const [investments, setInvests] = useState([]);
  const [contacts, setContacts]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState("LINKED");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [invRaw, conRaw] = await Promise.all([
        fetch(`${apiBase()}/entities/Investment`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
        fetch(`${apiBase()}/entities/Contact`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
      ]);
      setInvests(normaliseInvestments(invRaw));
      setContacts(normaliseContacts(conRaw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:invcon-toggle", onToggle);
    return () => window.removeEventListener("jarvis:invcon-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assessInvestment(inv) {
    setAssessing(inv.id);
    const contactNames = inv.matchedContacts
      .slice(0, 5)
      .map((c) => `${c.name}${c.role ? ` (${c.role})` : ""}`)
      .join(", ");
    const prompt = `As JARVIS, provide a 2-sentence assessment of the relationship between the investment "${inv.name}" (type: ${inv.type || "unknown"}, sector: ${inv.sector || "unknown"}) and the following contacts in the network: ${contactNames}. Focus on how these contacts may influence, advise, or manage this investment and the strategic implications.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Insufficient data to assess investment-contact relationships at this time, sir.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", {
          detail: { text: "Relationship assessment unavailable at this time, sir." },
        })
      );
    }
    setAssessing(null);
  }

  const correlated = correlate(investments, contacts);
  const linked     = correlated.filter((inv) => inv.matchedContacts.length > 0);
  const unlinked   = correlated.filter((inv) => inv.matchedContacts.length === 0);
  const badge      = linked.length;

  const displayed =
    tab === "ALL"      ? [...correlated].sort((a, b) => b.matchedContacts.length - a.matchedContacts.length)
    : tab === "LINKED"   ? [...linked].sort((a, b) => b.matchedContacts.length - a.matchedContacts.length)
    : [...unlinked].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Investment-Contact Mapper (F81)"
        style={{
          position: "fixed", bottom: 6, left: BTN_LEFT, zIndex: 65,
          background: visible ? `${AMBER}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? AMBER : AMBER}44`,
          color: visible ? AMBER : `${AMBER}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ INVCON
        {badge > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#000",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{badge}</span>
        )}
      </button>

      {visible && (
        <div style={{
          position: "fixed", bottom: 32, left: BTN_LEFT - 280, zIndex: 65,
          width: 580, maxHeight: "72vh", overflowY: "auto",
          background: "rgba(6,11,18,0.93)",
          border: `1px solid ${AMBER}44`,
          borderRadius: 10, padding: "14px 16px",
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${AMBER}18`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: AMBER, fontSize: 11, letterSpacing: 2 }}>◈ INVESTMENT-CONTACT MAPPER</span>
            <button
              onClick={fetchData}
              style={{
                marginLeft: "auto", background: "transparent",
                border: `1px solid ${AMBER}33`, borderRadius: 3,
                color: `${AMBER}88`, padding: "2px 6px", fontSize: 7,
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
              ["INVESTMENTS", investments.length, AMBER],
              ["CONTACTS",    contacts.length,    CY],
              ["LINKED",      linked.length,      GREEN],
              ["UNLINKED",    unlinked.length,    "#445566"],
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
                  background: tab === t ? `${AMBER}22` : "transparent",
                  border: `1px solid ${tab === t ? AMBER : "#1e3040"}`,
                  color: tab === t ? AMBER : "#445566",
                  borderRadius: 4, padding: "3px 10px",
                  fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                  letterSpacing: 1, cursor: "pointer",
                }}
              >{t}</button>
            ))}
          </div>

          {/* Investment rows */}
          {loading && displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              correlating investments with contact network…
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              {tab === "LINKED"
                ? "No investments have linked contacts yet."
                : "No investments in this filter."}
            </div>
          ) : (
            displayed.map((inv) => {
              const hasContacts = inv.matchedContacts.length > 0;
              const isOpen = expanded === inv.id;
              return (
                <div
                  key={inv.id}
                  style={{
                    background: hasContacts ? `${AMBER}06` : "rgba(255,255,255,0.015)",
                    border: `1px solid ${isOpen ? `${AMBER}44` : hasContacts ? `${AMBER}22` : "#1a2530"}`,
                    borderRadius: 6, padding: "8px 10px", marginBottom: 6,
                    cursor: "pointer",
                  }}
                  onClick={() => setExpanded(isOpen ? null : inv.id)}
                >
                  {/* Investment header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: hasContacts ? 4 : 0 }}>
                    {inv.ticker && (
                      <span style={{
                        fontSize: 7, color: AMBER, border: `1px solid ${AMBER}55`,
                        borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                        whiteSpace: "nowrap",
                      }}>{inv.ticker}</span>
                    )}
                    <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{inv.name}</span>
                    {inv.type && (
                      <span style={{ fontSize: 7, color: `${CY}88`, whiteSpace: "nowrap" }}>{inv.type}</span>
                    )}
                    <span style={{
                      fontSize: 7,
                      color: hasContacts ? GREEN : "#334455",
                      whiteSpace: "nowrap",
                    }}>
                      {hasContacts
                        ? `${inv.matchedContacts.length} contact${inv.matchedContacts.length !== 1 ? "s" : ""}`
                        : "no contacts"}
                    </span>
                  </div>

                  {/* Sector */}
                  {inv.sector && (
                    <div style={{ color: "#556677", fontSize: 8, lineHeight: 1.4, marginBottom: 4 }}>
                      {inv.sector}
                    </div>
                  )}

                  {/* Assess button */}
                  {hasContacts && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ flex: 1, display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {inv.matchedContacts.slice(0, 3).map((c) => (
                          <span key={c.id} style={{
                            fontSize: 7, color: PU, border: `1px solid ${PU}33`,
                            borderRadius: 2, padding: "1px 5px",
                          }}>{c.name}</span>
                        ))}
                        {inv.matchedContacts.length > 3 && (
                          <span style={{ fontSize: 7, color: "#445566" }}>
                            +{inv.matchedContacts.length - 3} more
                          </span>
                        )}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); assessInvestment(inv); }}
                        disabled={assessing === inv.id}
                        style={{
                          background: assessing === inv.id ? "#1a2530" : `${AMBER}18`,
                          color: assessing === inv.id ? "#445566" : AMBER,
                          border: `1px solid ${AMBER}44`,
                          borderRadius: 3, padding: "2px 8px",
                          fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                          letterSpacing: 1, cursor: assessing === inv.id ? "default" : "pointer",
                        }}
                      >{assessing === inv.id ? "…assessing" : "▶ ASSESS"}</button>
                    </div>
                  )}

                  {/* Expanded contact list */}
                  {isOpen && hasContacts && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${AMBER}18` }}>
                      <div style={{ color: "#445566", fontSize: 8, letterSpacing: 1, marginBottom: 6 }}>
                        RELEVANT CONTACTS
                      </div>
                      {inv.matchedContacts.map((c) => (
                        <div key={c.id} style={{
                          background: "rgba(255,255,255,0.02)",
                          border: "1px solid #1e3040",
                          borderRadius: 4, padding: "6px 8px", marginBottom: 4,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                            <span style={{
                              width: 22, height: 22, borderRadius: "50%",
                              background: `${PU}22`, border: `1px solid ${PU}44`,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 8, color: PU, flexShrink: 0,
                            }}>
                              {c.name.charAt(0).toUpperCase()}
                            </span>
                            <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{c.name}</span>
                            {c.email && (
                              <span style={{ fontSize: 7, color: "#334455" }}>{c.email}</span>
                            )}
                          </div>
                          {(c.role || c.dept) && (
                            <div style={{ color: "#6E8AA0", fontSize: 8, lineHeight: 1.4, paddingLeft: 28 }}>
                              {c.role}{c.role && c.dept ? " · " : ""}{c.dept}
                            </div>
                          )}
                          {c.tags.length > 0 && (
                            <div style={{ paddingLeft: 28, display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                              {c.tags.slice(0, 4).map((tag, ti) => (
                                <span key={ti} style={{
                                  fontSize: 7, color: CY, border: `1px solid ${CY}22`,
                                  borderRadius: 2, padding: "1px 4px",
                                }}>{tag}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {isOpen && !hasContacts && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #1a2530", color: "#334455", fontSize: 8 }}>
                      No contacts in the network appear relevant to this investment.
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div style={{ marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right" }}>
            /entities/Investment + /entities/Contact · 60s auto-refresh · click ▶ ASSESS for AI relationship analysis
          </div>
        </div>
      )}
    </>
  );
}
