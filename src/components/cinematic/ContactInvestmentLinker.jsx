/**
 * ContactInvestmentLinker — F42.
 *
 * Cross-references contacts against portfolio investments to surface
 * which contacts are linked (by name, notes, sector, or ticker keyword)
 * to active investment positions.
 *
 * Endpoints used:
 *   /entities/Contact    — people / organisations directory
 *   /entities/Investment — portfolio investment positions
 *
 * Stat tiles: contacts / investments / linked / unlinked
 * Filter tabs: ALL / LINKED / UNLINKED
 * Panel: contact row → matched investment cards (ticker + value) or "NO MATCH"
 * ▶ ASSESS per contact → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *   via jarvis:speak-dossier.
 * 90 s auto-refresh.
 *
 * Intent: "contact investment" / "portfolio contacts" / "cil" /
 *         "who holds what" / "investment contacts" / "contact portfolio"
 *   → jarvis:cil-toggle + TTS brief via buildCilScript()
 *
 * Toggle: ◈ CIL at left:10680, bottom:8, zIndex:66.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const RED    = "#FF3D5A";
const BTN_LEFT   = 10680;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise helpers ────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseContacts(raw) {
  return normaliseArray(raw).map((c) => ({
    id:       c.id || c.contact_id || String(Math.random()),
    name:     c.name || c.full_name || c.display_name || "Unknown Contact",
    org:      c.organisation || c.organization || c.company || c.employer || "",
    sector:   c.sector || c.industry || c.domain || "",
    tags:     Array.isArray(c.tags) ? c.tags : [],
    notes:    c.notes || c.bio || c.description || "",
  }));
}

function normaliseInvestments(raw) {
  return normaliseArray(raw).map((inv) => ({
    id:     inv.id || inv.investment_id || String(Math.random()),
    name:   inv.name || inv.title || inv.asset_name || inv.company || "Unnamed Investment",
    ticker: inv.ticker || inv.symbol || inv.code || "",
    sector: inv.sector || inv.industry || inv.asset_class || "",
    value:  inv.value || inv.current_value || inv.amount || 0,
    notes:  inv.notes || inv.description || inv.thesis || "",
    status: (inv.status || "active").toLowerCase(),
  }));
}

function kwMatch(a = "", b = "") {
  const words = (str) =>
    str.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3);
  const aw = words(a);
  const bw = words(b);
  return aw.some((w) => bw.includes(w));
}

function linkContactsToInvestments(contacts, investments) {
  return contacts.map((c) => {
    const linked = investments.filter(
      (inv) =>
        kwMatch(c.name, inv.name) ||
        kwMatch(c.org, inv.name) ||
        kwMatch(c.sector, inv.sector) ||
        kwMatch(c.notes, inv.name) ||
        kwMatch(c.notes, inv.ticker) ||
        kwMatch(c.name, inv.notes) ||
        c.tags.some((tag) => kwMatch(tag, inv.name) || kwMatch(tag, inv.ticker))
    );
    return { ...c, investments: linked, linked: linked.length > 0 };
  });
}

// ─── exported helpers for JarvisBrain voice routing ──────────────────────────

export function isCilQuery(q = "") {
  const lq = q.toLowerCase();
  return (
    lq.includes("cil") ||
    lq.includes("contact investment") ||
    lq.includes("investment contact") ||
    lq.includes("portfolio contact") ||
    lq.includes("contact portfolio") ||
    lq.includes("who holds what") ||
    lq.includes("contact linker") ||
    lq.includes("contacts and investments")
  );
}

export async function buildCilScript() {
  const base = apiBase();
  const [cRaw, iRaw] = await Promise.all([
    fetch(`${base}/entities/Contact`).then((r) => r.json()).catch(() => []),
    fetch(`${base}/entities/Investment`).then((r) => r.json()).catch(() => []),
  ]);
  const contacts    = normaliseContacts(cRaw);
  const investments = normaliseInvestments(iRaw);
  const linked      = linkContactsToInvestments(contacts, investments);
  const numLinked   = linked.filter((c) => c.linked).length;
  const numUnlinked = linked.length - numLinked;
  if (!linked.length) return "No contact or investment data available, sir.";
  return `Contact-investment analysis complete, sir. ${linked.length} contacts reviewed against ${investments.length} portfolio positions. ${numLinked} contacts have direct investment linkages, ${numUnlinked} are unmatched. Review the CIL panel for the full cross-reference.`;
}

// ─── component ────────────────────────────────────────────────────────────────

export default function ContactInvestmentLinker() {
  const [open, setOpen]             = useState(false);
  const [contacts, setContacts]     = useState([]);
  const [investments, setInvs]      = useState([]);
  const [linked, setLinked]         = useState([]);
  const [filter, setFilter]         = useState("ALL");
  const [loading, setLoading]       = useState(false);
  const [err, setErr]               = useState(null);
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const base = apiBase();
      const [cRaw, iRaw] = await Promise.all([
        fetch(`${base}/entities/Contact`).then((r) => r.json()),
        fetch(`${base}/entities/Investment`).then((r) => r.json()),
      ]);
      const c = normaliseContacts(cRaw);
      const i = normaliseInvestments(iRaw);
      const l = linkContactsToInvestments(c, i);
      setContacts(c);
      setInvs(i);
      setLinked(l);
    } catch (e) {
      setErr(e.message || "Fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:cil-toggle", onToggle);
    return () => window.removeEventListener("jarvis:cil-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess(contact) {
    setAssessing(contact.id);
    try {
      const invNames = contact.investments.map((i) => i.name).join(", ") || "none";
      const prompt = `Contact: ${contact.name} (${contact.org || "independent"}). Linked investments: ${invNames}. In two sentences, summarise this contact's portfolio exposure and any notable linkages.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const script = (d.answer || "Assessment complete.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch {
      // silent
    } finally {
      setAssessing(null);
    }
  }

  const numLinked   = linked.filter((c) => c.linked).length;
  const numUnlinked = linked.length - numLinked;

  const visible = linked.filter((c) => {
    if (filter === "LINKED")   return c.linked;
    if (filter === "UNLINKED") return !c.linked;
    return true;
  });

  const TILE = { borderRadius: 6, padding: "6px 10px", minWidth: 70, textAlign: "center" };
  const TAB  = (active) => ({
    padding: "3px 10px", borderRadius: 4, fontSize: 11, cursor: "pointer", letterSpacing: 1,
    border: `1px solid ${active ? CY : "#1E3A4A"}`,
    background: active ? `${CY}22` : "transparent",
    color: active ? CY : "#6E8AA0",
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Contact × Investment Linker"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 66,
          padding: "3px 8px", fontSize: 10, letterSpacing: 1.5,
          border: `1px solid ${CY}88`, borderRadius: 4, cursor: "pointer",
          background: "rgba(5,8,13,0.7)", color: CY,
          fontFamily: "'JetBrains Mono',monospace",
        }}
      >
        ◈ CIL
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
      zIndex: 200, width: "min(680px,94vw)", maxHeight: "80vh",
      background: "rgba(6,10,18,0.97)", border: `1px solid ${CY}44`,
      borderRadius: 14, display: "flex", flexDirection: "column",
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
      boxShadow: `0 0 60px ${CY}18`, backdropFilter: "blur(12px)",
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
        borderBottom: `1px solid ${CY}22`,
      }}>
        <span style={{ color: CY, fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>
          ◈ CONTACT × INVESTMENT LINKER
        </span>
        {loading && <span style={{ fontSize: 10, color: "#6E8AA0", marginLeft: 4 }}>loading…</span>}
        <button
          onClick={load}
          title="Refresh"
          style={{ marginLeft: "auto", background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 14 }}
        >⟳</button>
        <button
          onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 16 }}
        >✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 16px", flexWrap: "wrap" }}>
        {[
          { label: "CONTACTS",    val: contacts.length,  col: CY },
          { label: "INVESTMENTS", val: investments.length, col: "#A78BFA" },
          { label: "LINKED",      val: numLinked,         col: GREEN },
          { label: "UNLINKED",    val: numUnlinked,       col: AMBER },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ ...TILE, background: `${col}11`, border: `1px solid ${col}44` }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: col }}>{val}</div>
            <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 6, padding: "0 16px 10px" }}>
        {["ALL", "LINKED", "UNLINKED"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={TAB(filter === f)}>{f}</button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#3A5060" }}>
          {REFRESH_MS / 1000}s refresh
        </span>
      </div>

      {/* error */}
      {err && (
        <div style={{ padding: "8px 16px", color: RED, fontSize: 11 }}>
          Error: {err}
        </div>
      )}

      {/* list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 16px 16px" }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: "#3A5060", fontSize: 12, padding: "20px 0", textAlign: "center" }}>
            No contacts in this filter.
          </div>
        )}
        {visible.map((c) => (
          <div key={c.id} style={{
            marginBottom: 8, borderRadius: 8,
            border: `1px solid ${c.linked ? `${GREEN}44` : `${AMBER}33`}`,
            background: c.linked ? `${GREEN}08` : `${AMBER}06`,
          }}>
            {/* contact header row */}
            <div
              onClick={() => setExpanded(expanded === c.id ? null : c.id)}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: "pointer",
              }}
            >
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 3,
                background: c.linked ? `${GREEN}22` : `${AMBER}22`,
                color: c.linked ? GREEN : AMBER,
              }}>
                {c.linked ? "LINKED" : "UNLINKED"}
              </span>
              <span style={{ fontSize: 12, color: "#DCEBF5", fontWeight: 600, flex: 1 }}>{c.name}</span>
              {c.org && <span style={{ fontSize: 10, color: "#6E8AA0" }}>{c.org}</span>}
              <span style={{ fontSize: 10, color: "#3A5060" }}>{expanded === c.id ? "▲" : "▼"}</span>
            </div>

            {/* expanded detail */}
            {expanded === c.id && (
              <div style={{ padding: "0 12px 10px", borderTop: `1px solid ${CY}11` }}>
                {c.investments.length === 0 ? (
                  <div style={{ color: AMBER, fontSize: 11, padding: "6px 0" }}>
                    NO MATCHED INVESTMENTS
                  </div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {c.investments.map((inv) => (
                      <div key={inv.id} style={{
                        padding: "4px 8px", borderRadius: 5, fontSize: 11,
                        border: `1px solid ${CY}33`, background: `${CY}0A`,
                      }}>
                        <span style={{ color: CY, fontWeight: 700 }}>
                          {inv.ticker || inv.name}
                        </span>
                        {inv.ticker && inv.ticker !== inv.name && (
                          <span style={{ color: "#6E8AA0", marginLeft: 4 }}>{inv.name}</span>
                        )}
                        {inv.value > 0 && (
                          <span style={{ color: GREEN, marginLeft: 6 }}>
                            ${typeof inv.value === "number" ? inv.value.toLocaleString() : inv.value}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => assess(c)}
                  disabled={assessing === c.id}
                  style={{
                    marginTop: 8, padding: "4px 10px", fontSize: 10, letterSpacing: 1,
                    border: `1px solid ${CY}66`, borderRadius: 4, cursor: "pointer",
                    background: assessing === c.id ? `${CY}22` : "transparent",
                    color: CY, fontFamily: "inherit",
                  }}
                >
                  {assessing === c.id ? "…" : "▶ ASSESS"}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
