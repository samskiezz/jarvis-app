/**
 * ContactIntelNexus — F48 (overnight 2026-09-13)
 * Sources: /entities/Contact × /v1/investigations × /entities/RiskSignal
 * Keyword-correlates each contact against active investigations AND risk signals:
 *   FULLY_LINKED  (contact has both a matching investigation + risk signal)
 *   INV_ONLY      (matched an investigation but no risk signal)
 *   RISK_ONLY     (matched a risk signal but no investigation)
 *   UNLINKED      (no investigation or risk signal matches)
 * Stat tiles: contacts / fully linked / inv only / risk only / unlinked.
 * Filter tabs: ALL / FULLY_LINKED / INV_ONLY / RISK_ONLY / UNLINKED.
 * Text search on contact name/role/organisation.
 * Expand row → matched investigations (amber bars) + matched risk signals (red bars).
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * ◈ CIRNEX button (left:934680 bottom:8 zIndex:631).
 * Voice triggers: "cirnex" / "contact intelligence" / "contact investigation" /
 *                 "contact risk" / "linked contacts" / "unlinked contacts".
 * Toggle: jarvis:cirnex-toggle event.
 * 90-s auto-refresh.
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA040";
const RED = "#FF4D6D";
const PRP = "#A855F7";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CIRNEX_RE =
  /\bcirnex\b|contact.intel|contact.investigation|contact.risk|linked.contact|unlinked.contact|contact.nexus|contact.signal|contact.link/i;

// ── fetch helpers ─────────────────────────────────────────────────────────────

async function fetchContacts() {
  const r = await fetch(`${apiBase()}/entities/Contact`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.contacts) ? d.contacts
    : Array.isArray(d?.data)    ? d.data
    : Array.isArray(d?.results) ? d.results
    : [];
}

async function fetchInvestigations() {
  const r = await fetch(`${apiBase()}/v1/investigations`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.investigations) ? d.investigations
    : Array.isArray(d?.data)           ? d.data
    : Array.isArray(d?.results)        ? d.results
    : [];
}

async function fetchRiskSignals() {
  const r = await fetch(`${apiBase()}/entities/RiskSignal`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.riskSignals) ? d.riskSignals
    : Array.isArray(d?.data)        ? d.data
    : Array.isArray(d?.results)     ? d.results
    : [];
}

// ── keyword matching ──────────────────────────────────────────────────────────

function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function overlap(tokensA, tokensB) {
  const setB = new Set(tokensB);
  return tokensA.filter((t) => setB.has(t)).length;
}

function contactTokens(c) {
  return tokenize(
    [c.name, c.full_name, c.role, c.title, c.organisation, c.organization,
     c.company, c.tags?.join?.(" "), c.notes, c.description].join(" ")
  );
}

function invTokens(inv) {
  return tokenize(
    [inv.title, inv.name, inv.description, inv.subject, inv.type,
     inv.tags?.join?.(" "), inv.target].join(" ")
  );
}

function riskTokens(r) {
  return tokenize(
    [r.title, r.name, r.description, r.type, r.category,
     r.source, r.tags?.join?.(" "), r.entity].join(" ")
  );
}

function classifyContact(contact, investigations, riskSignals) {
  const cToks = contactTokens(contact);
  const matchedInv = investigations
    .map((inv) => ({ item: inv, score: overlap(cToks, invTokens(inv)) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const matchedRisk = riskSignals
    .map((r) => ({ item: r, score: overlap(cToks, riskTokens(r)) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const hasInv  = matchedInv.length > 0;
  const hasRisk = matchedRisk.length > 0;
  const status =
    hasInv && hasRisk ? "FULLY_LINKED"
    : hasInv          ? "INV_ONLY"
    : hasRisk         ? "RISK_ONLY"
    :                   "UNLINKED";

  return { contact, matchedInv, matchedRisk, status };
}

// ── exported voice helpers ────────────────────────────────────────────────────

export function isCirnexQuery(q) {
  return CIRNEX_RE.test(q || "");
}

export async function buildCirnexScript() {
  try {
    const [contacts, investigations, riskSignals] = await Promise.all([
      fetchContacts(), fetchInvestigations(), fetchRiskSignals(),
    ]);
    const rows = contacts.map((c) => classifyContact(c, investigations, riskSignals));
    const unlinked = rows.filter((r) => r.status === "UNLINKED").length;
    const fully    = rows.filter((r) => r.status === "FULLY_LINKED").length;
    return `Contact intelligence nexus: ${rows.length} contacts correlated against ` +
      `${investigations.length} investigations and ${riskSignals.length} risk signals. ` +
      `${fully} contacts are fully linked with both investigation and risk signal matches. ` +
      `${unlinked > 0
        ? `${unlinked} contacts remain unlinked — no matching investigation or risk signal found.`
        : "All contacts have at least one active intelligence link."}`;
  } catch {
    return "Unable to fetch contact intelligence nexus data at this time, sir.";
  }
}

// ── component ─────────────────────────────────────────────────────────────────

const FILTERS = ["ALL", "FULLY_LINKED", "INV_ONLY", "RISK_ONLY", "UNLINKED"];

const STATUS_COLOR = {
  FULLY_LINKED: GRN,
  INV_ONLY:     AMB,
  RISK_ONLY:    RED,
  UNLINKED:     PRP,
};

export default function ContactIntelNexus() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [filter, setFilter]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [contacts, investigations, riskSignals] = await Promise.all([
        fetchContacts(), fetchInvestigations(), fetchRiskSignals(),
      ]);
      setRows(contacts.map((c) => classifyContact(c, investigations, riskSignals)));
    } catch {
      /* silent — no fake data */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => {
      setOpen((v) => {
        if (!v) load();
        return !v;
      });
    };
    window.addEventListener("jarvis:cirnex-toggle", onToggle);
    return () => window.removeEventListener("jarvis:cirnex-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const unlinkedCount = rows.filter((r) => r.status === "UNLINKED").length;
  const fullyCount    = rows.filter((r) => r.status === "FULLY_LINKED").length;
  const invOnly       = rows.filter((r) => r.status === "INV_ONLY").length;
  const riskOnly      = rows.filter((r) => r.status === "RISK_ONLY").length;

  const visible = rows.filter((r) => {
    if (filter !== "ALL" && r.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const c = r.contact;
      return [c.name, c.full_name, c.role, c.title, c.organisation, c.organization, c.company]
        .some((f) => (f || "").toLowerCase().includes(q));
    }
    return true;
  });

  async function assess() {
    const script = await buildCirnexScript();
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
  }

  const tile = (label, val, col) => (
    <div style={{ flex: 1, background: "rgba(0,0,0,0.3)", borderRadius: 6,
      padding: "6px 8px", textAlign: "center", border: `1px solid ${col}33` }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: col }}>{val}</div>
      <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>{label}</div>
    </div>
  );

  const maxScore = (arr) => Math.max(...arr.map((x) => x.score), 1);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("jarvis:cirnex-toggle"))}
        style={{
          position: "fixed", left: 934680, bottom: 8, zIndex: 631,
          background: "rgba(5,8,13,0.75)", border: `1px solid ${unlinkedCount > 0 ? PRP : CY}55`,
          color: unlinkedCount > 0 ? PRP : CY, borderRadius: 6, padding: "3px 9px",
          fontSize: 10, letterSpacing: 1, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
          whiteSpace: "nowrap",
        }}
      >
        ◈ CIRNEX{unlinkedCount > 0 && (
          <span style={{ marginLeft: 4, background: PRP, color: "#fff",
            borderRadius: 8, padding: "1px 5px", fontSize: 9 }}>
            {unlinkedCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", top: "8vh", left: "50%", transform: "translateX(-50%)",
          zIndex: 10000, width: "min(780px,94vw)",
          background: "rgba(5,10,18,0.95)", border: `1px solid ${CY}44`,
          borderRadius: 14, padding: "18px 20px",
          backdropFilter: "blur(14px)", boxShadow: `0 0 60px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          maxHeight: "84vh", display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 13,
                textShadow: `0 0 12px ${CY}` }}>CONTACT INTEL NEXUS</span>
              <span style={{ marginLeft: 10, color: "#4A6070", fontSize: 10 }}>
                /entities/Contact × /v1/investigations × /entities/RiskSignal
              </span>
            </div>
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "#4A6070",
                cursor: "pointer", fontSize: 18, lineHeight: 1 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {tile("CONTACTS",     rows.length,  CY)}
            {tile("FULLY LINKED", fullyCount,   GRN)}
            {tile("INV ONLY",     invOnly,      AMB)}
            {tile("RISK ONLY",    riskOnly,     RED)}
            {tile("UNLINKED",     unlinkedCount, PRP)}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            {FILTERS.map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? `${STATUS_COLOR[f] || CY}22` : "transparent",
                  border: `1px solid ${filter === f ? (STATUS_COLOR[f] || CY) : "#2A3A4A"}`,
                  color: filter === f ? (STATUS_COLOR[f] || CY) : "#4A6070",
                  borderRadius: 6, padding: "3px 10px", fontSize: 10,
                  cursor: "pointer", letterSpacing: 1,
                }}>
                {f}
              </button>
            ))}
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="search contacts…"
              style={{
                marginLeft: "auto", background: "rgba(0,0,0,0.3)",
                border: `1px solid ${CY}44`, borderRadius: 6, color: "#DCEBF5",
                padding: "3px 10px", fontSize: 10, width: 160,
                fontFamily: "'JetBrains Mono',monospace",
              }}
            />
          </div>

          {/* Contact list */}
          <div style={{ overflowY: "auto", flex: 1, paddingRight: 4 }}>
            {loading && (
              <div style={{ textAlign: "center", color: "#4A6070", padding: 24, fontSize: 12 }}>
                loading…
              </div>
            )}
            {!loading && visible.length === 0 && (
              <div style={{ textAlign: "center", color: "#4A6070", padding: 24, fontSize: 12 }}>
                No contacts match
              </div>
            )}
            {visible.map((row, i) => {
              const c     = row.contact;
              const isExp = expanded === i;
              const col   = STATUS_COLOR[row.status] || CY;
              const name  = (c.name || c.full_name || "Contact").slice(0, 60);
              const role  = (c.role || c.title || "").slice(0, 40);
              const org   = (c.organisation || c.organization || c.company || "").slice(0, 30);
              return (
                <div key={i}
                  onClick={() => setExpanded(isExp ? null : i)}
                  style={{
                    marginBottom: 6, padding: "8px 10px",
                    background: isExp ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.2)",
                    border: `1px solid ${col}33`,
                    borderRadius: 8, cursor: "pointer",
                    borderLeft: row.status === "UNLINKED" ? `3px solid ${PRP}` : `3px solid ${col}66`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: "#DCEBF5", fontWeight: 600,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {name}
                      </div>
                      <div style={{ fontSize: 9, color: "#4A6070", marginTop: 2 }}>
                        {role && <span style={{ marginRight: 8 }}>{role}</span>}
                        {org  && <span style={{ color: "#6E8AA0" }}>{org}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 8, flexShrink: 0 }}>
                      <span style={{
                        fontSize: 9, letterSpacing: 1, color: col,
                        border: `1px solid ${col}66`, borderRadius: 4, padding: "2px 6px",
                      }}>{row.status}</span>
                      <span style={{ color: "#4A6070", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {/* Investigations */}
                      <div>
                        <div style={{ fontSize: 9, color: AMB, letterSpacing: 1, marginBottom: 6 }}>
                          MATCHED INVESTIGATIONS ({row.matchedInv.length})
                        </div>
                        {row.matchedInv.length === 0
                          ? <div style={{ fontSize: 9, color: "#4A6070" }}>no matching investigations</div>
                          : row.matchedInv.map((x, j) => {
                              const pct = Math.min(100, Math.round((x.score / maxScore(row.matchedInv)) * 100));
                              return (
                                <div key={j} style={{ marginBottom: 4 }}>
                                  <div style={{ fontSize: 9, color: "#DCEBF5", marginBottom: 2,
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {(x.item.title || x.item.name || x.item.subject || "Investigation").slice(0, 40)}
                                  </div>
                                  <div style={{ height: 4, background: "rgba(0,0,0,0.3)", borderRadius: 2 }}>
                                    <div style={{ height: "100%", width: `${pct}%`,
                                      background: AMB, borderRadius: 2 }} />
                                  </div>
                                </div>
                              );
                            })
                        }
                      </div>
                      {/* Risk Signals */}
                      <div>
                        <div style={{ fontSize: 9, color: RED, letterSpacing: 1, marginBottom: 6 }}>
                          MATCHED RISK SIGNALS ({row.matchedRisk.length})
                        </div>
                        {row.matchedRisk.length === 0
                          ? <div style={{ fontSize: 9, color: "#4A6070" }}>no matching risk signals</div>
                          : row.matchedRisk.map((x, j) => {
                              const pct = Math.min(100, Math.round((x.score / maxScore(row.matchedRisk)) * 100));
                              return (
                                <div key={j} style={{ marginBottom: 4 }}>
                                  <div style={{ fontSize: 9, color: "#DCEBF5", marginBottom: 2,
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {(x.item.title || x.item.name || x.item.type || "Risk Signal").slice(0, 40)}
                                  </div>
                                  <div style={{ height: 4, background: "rgba(0,0,0,0.3)", borderRadius: 2 }}>
                                    <div style={{ height: "100%", width: `${pct}%`,
                                      background: RED, borderRadius: 2 }} />
                                  </div>
                                </div>
                              );
                            })
                        }
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between",
            alignItems: "center", borderTop: `1px solid ${CY}22`, paddingTop: 10 }}>
            <span style={{ fontSize: 9, color: "#4A6070" }}>
              {visible.length} / {rows.length} contacts • auto-refresh 90 s
            </span>
            <button onClick={assess}
              style={{
                background: `${CY}18`, border: `1px solid ${CY}66`,
                color: CY, borderRadius: 6, padding: "4px 14px",
                fontSize: 10, cursor: "pointer", letterSpacing: 1,
                fontFamily: "'JetBrains Mono',monospace",
              }}>
              ▶ ASSESS
            </button>
          </div>
        </div>
      )}
    </>
  );
}
