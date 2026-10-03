/**
 * InvestmentContactMap — F63
 * ◈ ICPIM button (left:982120, bottom:8, zIndex:131)
 * parallel-fetches /entities/Investment + /entities/Contact
 * keyword-correlates investment name/type/sector/description
 * against contact name/role/org/tags to classify
 * MANAGED (≥1 match) vs UNMANAGED (no backing contact — coverage gap)
 * amber badge on unmanaged count; filter tabs ALL/MANAGED/UNMANAGED
 * expand investment → matched contact cards with role badge + relevance bar
 * ▶ ASSESS COVERAGE → /v1/jarvis/agent/chat 2-sentence portfolio coverage brief + TTS
 * voice trigger: "icpim/investment contact/portfolio contact/managed investments/unmanaged portfolio/portfolio coverage"
 * jarvis:icpim-toggle event; 90-s auto-refresh
 */
import { useEffect, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const AM = "#F59E0B";
const GR = "#10B981";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const ICPIM_RE =
  /\bicpim\b|\binvest.+contact|\bcontact.+invest|\bportfolio.contact|\bmanaged.invest|\bunmanaged.portf|\bportfolio.cover|\bportfolio.manage|\bportfolio.intell/i;

export function isIcpimQuery(text) {
  return ICPIM_RE.test(text || "");
}

function tokenise(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

const STOP = new Set([
  "the", "and", "for", "are", "was", "were", "has", "have", "had",
  "not", "but", "with", "this", "that", "from", "will", "can",
  "its", "any", "all", "new", "our", "your", "their", "fund",
]);

function relevance(inv, contact) {
  const invTokens = new Set(
    tokenise(`${inv.name} ${inv.type || ""} ${inv.sector || ""} ${inv.description || ""}`)
      .filter((t) => !STOP.has(t))
  );
  const ctTokens = tokenise(
    `${contact.name || ""} ${contact.role || ""} ${contact.org || contact.organization || ""} ${(contact.tags || []).join(" ")}`
  ).filter((t) => !STOP.has(t));
  const hits = ctTokens.filter((t) => invTokens.has(t)).length;
  return Math.min(100, Math.round((hits / Math.max(invTokens.size, 1)) * 160));
}

function normaliseInvestments(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.data || raw?.items || raw?.investments || []);
  return arr.map((i) => ({
    id: i.id || i._id || Math.random().toString(36).slice(2),
    name: i.name || i.title || i.investment_name || "Unnamed Investment",
    type: i.type || i.investment_type || i.asset_class || "",
    sector: i.sector || i.industry || "",
    description: i.description || i.notes || "",
    value: i.value || i.amount || i.current_value || null,
    status: i.status || "active",
  }));
}

function normaliseContacts(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.data || raw?.items || raw?.contacts || []);
  return arr.map((c) => ({
    id: c.id || c._id || Math.random().toString(36).slice(2),
    name: c.name || c.full_name || c.contact_name || "Unknown Contact",
    role: c.role || c.title || c.position || "",
    org: c.org || c.organization || c.company || "",
    tags: Array.isArray(c.tags) ? c.tags : [],
  }));
}

export async function buildIcpimScript() {
  const base = apiBase();
  const hdr = { Authorization: `Bearer ${API_KEY}` };
  const [invRes, ctRes] = await Promise.all([
    fetch(`${base}/entities/Investment`, { headers: hdr }),
    fetch(`${base}/entities/Contact`, { headers: hdr }),
  ]);
  const invRaw = await invRes.json();
  const ctRaw = await ctRes.json();
  const investments = normaliseInvestments(invRaw);
  const contacts = normaliseContacts(ctRaw);

  const managed = investments.filter((inv) => contacts.some((c) => relevance(inv, c) > 0)).length;
  const unmanaged = investments.length - managed;

  const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      message:
        `JARVIS investment-contact portfolio intelligence map: ${investments.length} portfolio positions, ` +
        `${contacts.length} contacts on file, ${managed} investments have a matched contact relationship, ` +
        `${unmanaged} investments appear unmanaged — no contact correlation found (coverage gap). ` +
        `Give a 2-sentence portfolio coverage assessment — formal British butler tone, first person.`,
    }),
  });
  const d = await r.json();
  return (d.answer || "Portfolio contact coverage analysis complete, sir.").trim();
}

// ── component ────────────────────────────────────────────────────────────────

export default function InvestmentContactMap() {
  const [open, setOpen] = useState(false);
  const [investments, setInvestments] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [invRes, ctRes] = await Promise.all([
        fetch(`${base}/entities/Investment`, { headers: hdr }),
        fetch(`${base}/entities/Contact`, { headers: hdr }),
      ]);
      const invRaw = await invRes.json();
      const ctRaw = await ctRes.json();
      setInvestments(normaliseInvestments(invRaw));
      setContacts(normaliseContacts(ctRaw));
    } catch {
      /* silently ignore network failures */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const toggle = () => {
      setOpen((v) => {
        if (!v) load();
        return !v;
      });
    };
    window.addEventListener("jarvis:icpim-toggle", toggle);
    return () => window.removeEventListener("jarvis:icpim-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(load, 90_000);
    return () => clearInterval(t);
  }, [open]);

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const script = await buildIcpimScript();
      setBrief(script);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch {
      setBrief("Assessment unavailable, sir.");
    } finally {
      setAssessing(false);
    }
  }

  const enriched = investments.map((inv) => {
    const matches = contacts
      .map((c) => ({ ...c, score: relevance(inv, c) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...inv, managed: matches.length > 0, matches };
  });

  const managedCount = enriched.filter((i) => i.managed).length;
  const unmanagedCount = enriched.length - managedCount;

  const visible = enriched.filter((inv) => {
    if (tab === "MANAGED" && !inv.managed) return false;
    if (tab === "UNMANAGED" && inv.managed) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        inv.name.toLowerCase().includes(q) ||
        (inv.type || "").toLowerCase().includes(q) ||
        (inv.sector || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const btnStyle = {
    position: "fixed", left: 982120, bottom: 8, zIndex: 131,
    background: "#0a1628cc", border: `1px solid ${CY}55`, borderRadius: 4,
    color: CY, fontSize: 10, fontFamily: "monospace", padding: "3px 8px",
    cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
  };

  if (!open) {
    return (
      <button style={btnStyle} onClick={() => { setOpen(true); load(); }}>
        ◈ ICPIM
        {unmanagedCount > 0 && (
          <span style={{ background: AM, color: "#000", borderRadius: 8, padding: "0 5px", fontSize: 9 }}>
            {unmanagedCount}
          </span>
        )}
      </button>
    );
  }

  const panelStyle = {
    position: "fixed", bottom: 60, left: "50%", transform: "translateX(-50%)",
    width: 640, maxHeight: "75vh", overflow: "hidden",
    background: "#050d1bec", border: `1px solid ${CY}44`,
    borderRadius: 8, zIndex: 10001, display: "flex", flexDirection: "column",
    fontFamily: "monospace", color: CY,
  };

  const tabBtn = (label) => ({
    padding: "3px 10px", cursor: "pointer", fontSize: 10, borderRadius: 3,
    background: tab === label ? `${CY}22` : "transparent",
    border: tab === label ? `1px solid ${CY}66` : "1px solid transparent",
    color: CY,
  });

  return (
    <div style={panelStyle}>
      {/* header */}
      <div style={{ padding: "8px 12px", borderBottom: `1px solid ${CY}33`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, letterSpacing: 2 }}>◈ INVESTMENT × CONTACT PORTFOLIO MAP</span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, padding: "8px 12px", borderBottom: `1px solid ${CY}22` }}>
        {[
          ["INVESTMENTS", enriched.length, CY],
          ["CONTACTS", contacts.length, CY],
          ["MANAGED", managedCount, GR],
          ["UNMANAGED", unmanagedCount, unmanagedCount > 0 ? AM : GR],
        ].map(([label, val, col]) => (
          <div key={label} style={{ background: "#0a1628", border: `1px solid ${col}33`, borderRadius: 4, padding: "5px 8px", textAlign: "center" }}>
            <div style={{ color: col, fontSize: 14, fontWeight: "bold" }}>{val}</div>
            <div style={{ color: `${col}88`, fontSize: 8 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ display: "flex", gap: 6, padding: "6px 12px", borderBottom: `1px solid ${CY}22`, flexWrap: "wrap" }}>
        {["ALL", "MANAGED", "UNMANAGED"].map((t) => (
          <button key={t} style={tabBtn(t)} onClick={() => setTab(t)}>{t}</button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search investments…"
          style={{ marginLeft: "auto", background: "#0a1628", border: `1px solid ${CY}33`, color: CY, borderRadius: 3, padding: "2px 8px", fontSize: 10, width: 150 }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 12px" }}>
        {loading && <div style={{ color: `${CY}66`, fontSize: 10, padding: 8 }}>Loading…</div>}
        {!loading && visible.length === 0 && (
          <div style={{ color: `${CY}44`, fontSize: 10, padding: 8 }}>No investments match current filter.</div>
        )}
        {visible.map((inv) => (
          <div key={inv.id} style={{ marginBottom: 6, border: `1px solid ${inv.managed ? GR : AM}33`, borderRadius: 4, overflow: "hidden" }}>
            <div
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 8px", cursor: "pointer", background: expanded === inv.id ? `${CY}0d` : "transparent" }}
              onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
            >
              <div>
                <span style={{ fontSize: 10 }}>{inv.name}</span>
                {inv.type && <span style={{ color: `${CY}66`, fontSize: 9, marginLeft: 6 }}>{inv.type}</span>}
                {inv.sector && <span style={{ color: `${CY}44`, fontSize: 9, marginLeft: 4 }}>{inv.sector}</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  fontSize: 8, padding: "1px 6px", borderRadius: 8,
                  background: inv.managed ? `${GR}22` : `${AM}22`,
                  color: inv.managed ? GR : AM,
                  border: `1px solid ${inv.managed ? GR : AM}44`,
                }}>
                  {inv.managed ? "MANAGED" : "UNMANAGED"}
                </span>
                <span style={{ color: `${CY}55`, fontSize: 9 }}>{expanded === inv.id ? "▲" : "▼"}</span>
              </div>
            </div>
            {expanded === inv.id && (
              <div style={{ padding: "4px 8px 8px", borderTop: `1px solid ${CY}22` }}>
                {inv.description && <div style={{ color: `${CY}88`, fontSize: 9, marginBottom: 6 }}>{inv.description}</div>}
                {inv.matches.length === 0 ? (
                  <div style={{ color: `${AM}88`, fontSize: 9 }}>No matching contacts found — portfolio coverage gap.</div>
                ) : (
                  <div>
                    <div style={{ color: `${CY}66`, fontSize: 9, marginBottom: 4 }}>MATCHING CONTACTS</div>
                    {inv.matches.slice(0, 5).map((ct) => (
                      <div key={ct.id} style={{ marginBottom: 4, padding: "3px 6px", background: "#0a1628", borderRadius: 3, border: `1px solid ${CY}22` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                          <span style={{ fontSize: 9 }}>{ct.name}</span>
                          {ct.role && (
                            <span style={{ fontSize: 8, color: CY, border: `1px solid ${CY}44`, borderRadius: 3, padding: "0 4px" }}>
                              {ct.role}
                            </span>
                          )}
                        </div>
                        {ct.org && <div style={{ color: `${CY}66`, fontSize: 8, marginBottom: 2 }}>{ct.org}</div>}
                        <div style={{ height: 3, background: "#0a1628", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${ct.score}%`, background: `linear-gradient(90deg,${CY}88,${GR}88)` }} />
                        </div>
                        <div style={{ color: `${CY}44`, fontSize: 8, marginTop: 1 }}>relevance {ct.score}%</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* footer */}
      <div style={{ padding: "6px 12px", borderTop: `1px solid ${CY}22`, display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={assess}
          disabled={assessing}
          style={{ background: `${CY}18`, border: `1px solid ${CY}55`, color: CY, borderRadius: 3, padding: "3px 10px", cursor: "pointer", fontSize: 10 }}
        >
          {assessing ? "…" : "▶ ASSESS COVERAGE"}
        </button>
        {brief && <span style={{ color: `${CY}cc`, fontSize: 9, flex: 1 }}>{brief}</span>}
      </div>
    </div>
  );
}
