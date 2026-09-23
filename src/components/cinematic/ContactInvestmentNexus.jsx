/**
 * ContactInvestmentNexus — F628
 * "JARVIS, cntinv / contact investment / investment contact / contacts with investments /
 *  portfolio contact / who has investments / contact portfolio / contact holding"
 * Cross-references /entities/Contact against /entities/Investment.
 * PORTFOLIO-LINKED contacts (≥1 investment keyword-matches) vs UNLINKED (no investment backing).
 * Coverage % tile; ALL/PORTFOLIO-LINKED/UNLINKED filter tabs + search; click-to-expand matched holdings.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence portfolio-contact brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4444";
const DIM = "#8899AA";
const GLD = "#FFD700";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 99_360;
const Z_INDEX  = 174;

const CNTINV_RE =
  /\bcntinv\b|\bcontact.?invest\b|\binvest.?contact\b|\bcontacts?.with.?invest\b|\bportfolio.?contact\b|\bwho.?has.?invest\b|\bcontact.?portfolio\b|\bcontact.?holding\b|\bholding.?contact\b/i;

export function isCntinvQuery(text) {
  return CNTINV_RE.test(text || "");
}

function keywords(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function overlap(a, b) {
  const sa = new Set(keywords(a));
  return keywords(b).filter((w) => sa.has(w)).length;
}

function normaliseContacts(data) {
  if (!data) return [];
  const raw =
    data.contacts || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((c, i) => ({
    id:   c.id || `cnt-${i}`,
    name: c.name || c.full_name || c.title || `Contact ${i + 1}`,
    role: c.role || c.job_title || c.position || "",
    org:  c.org || c.organization || c.company || "",
    tags: c.tags || [],
  }));
}

function normaliseInvestments(data) {
  if (!data) return [];
  const raw =
    data.investments || data.holdings || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((inv, i) => ({
    id:     inv.id || `inv-${i}`,
    name:   inv.name || inv.title || inv.ticker || inv.symbol || `Holding ${i + 1}`,
    type:   (inv.type || inv.asset_class || inv.category || "equity").toUpperCase(),
    value:  inv.value || inv.amount || inv.market_value || 0,
    ticker: inv.ticker || inv.symbol || "",
    tags:   inv.tags || [],
  }));
}

function crossRef(contacts, investments) {
  return contacts.map((cnt) => {
    const haystack = `${cnt.name} ${cnt.role} ${cnt.org} ${(cnt.tags || []).join(" ")}`;
    const matches = investments
      .map((inv) => {
        const needle = `${inv.name} ${inv.ticker} ${(inv.tags || []).join(" ")}`;
        const hits = overlap(haystack, needle);
        return hits > 0 ? { ...inv, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits);
    return { ...cnt, linked: matches.length > 0, investments: matches };
  });
}

export async function buildCntinvScript() {
  try {
    const base = apiBase();
    const [cntRes, invRes] = await Promise.all([
      fetch(`${base}/entities/Contact`,    { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/entities/Investment`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const [cntData, invData] = await Promise.all([cntRes.json(), invRes.json()]);
    const contacts    = normaliseContacts(cntData);
    const investments = normaliseInvestments(invData);
    const rows        = crossRef(contacts, investments);
    const linked      = rows.filter((r) => r.linked).length;
    const unlinked    = rows.length - linked;
    const pct         = rows.length ? Math.round((linked / rows.length) * 100) : 0;
    if (!rows.length) return "No contacts found in the system, sir.";
    const topUnlinked = rows
      .filter((r) => !r.linked)
      .slice(0, 2)
      .map((r) => r.name)
      .join("; ");
    return (
      `${linked} of ${rows.length} contacts are portfolio-linked (${pct}% investment coverage). ` +
      (unlinked > 0
        ? `${unlinked} contact${unlinked !== 1 ? "s" : ""} have no matching investment holding — potential blind spots in portfolio relationship mapping: ${topUnlinked || "unknown"}.`
        : "All contacts have associated investment backing.")
    );
  } catch {
    return "Unable to reach contacts or investment endpoints, sir.";
  }
}

const TYPE_COLOR = {
  EQUITY:    GLD,
  BOND:      CY,
  CRYPTO:    AMB,
  CASH:      GRN,
  ETF:       "#B06EFF",
  REIT:      "#FB923C",
  COMMODITY: RED,
};

export default function ContactInvestmentNexus() {
  const [open,     setOpen]     = useState(false);
  const [rows,     setRows]     = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [tab,      setTab]      = useState("ALL");
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [brief,    setBrief]    = useState("");
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const [cntRes, invRes] = await Promise.all([
        fetch(`${base}/entities/Contact`,    { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/entities/Investment`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const [cntData, invData] = await Promise.all([cntRes.json(), invRes.json()]);
      setRows(crossRef(normaliseContacts(cntData), normaliseInvestments(invData)));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen((v) => !v); };
    window.addEventListener("jarvis:cntinv-toggle", handler);
    return () => window.removeEventListener("jarvis:cntinv-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const linked   = rows.filter((r) => r.linked).length;
  const unlinked = rows.length - linked;
  const pct      = rows.length ? Math.round((linked / rows.length) * 100) : 0;

  const visible = rows.filter((r) => {
    const matchTab =
      tab === "ALL" ? true :
      tab === "PORTFOLIO-LINKED" ? r.linked :
      !r.linked;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      r.name.toLowerCase().includes(q) ||
      r.role.toLowerCase().includes(q) ||
      r.org.toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  async function assess() {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const script = await buildCntinvScript();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Portfolio-contact coverage assessment: ${script}. Provide a concise 2-sentence strategic brief.` }),
      });
      const d = await r.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(text);
      if (text) {
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
      }
    } catch {
      setBrief("Unable to reach reasoning core, sir.");
    } finally {
      setAssessing(false);
    }
  }

  const tabStyle = (t) => ({
    background: tab === t ? `${GLD}22` : "transparent",
    border: `1px solid ${tab === t ? GLD : DIM}44`,
    borderRadius: 4,
    color: tab === t ? GLD : DIM,
    cursor: "pointer",
    fontSize: 9,
    letterSpacing: 1,
    padding: "3px 7px",
  });

  const badge = unlinked > 0 ? unlinked : null;

  return (
    <>
      {/* floating button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Contact × Investment Nexus (CNTINV)"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: Z_INDEX,
          background: open ? `${GLD}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${GLD}${open ? "99" : "44"}`,
          borderRadius: 5,
          color: GLD,
          cursor: "pointer",
          fontSize: 9,
          letterSpacing: 1,
          padding: "4px 8px",
          backdropFilter: "blur(6px)",
          whiteSpace: "nowrap",
        }}
      >
        ◈ CNTINV{badge ? <span style={{ marginLeft: 4, background: AMB, color: "#000", borderRadius: 3, padding: "0 4px", fontSize: 9 }}>{badge}</span> : null}
      </button>

      {/* panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            left: BTN_LEFT,
            bottom: 36,
            zIndex: Z_INDEX + 1,
            width: 340,
            maxHeight: "70vh",
            overflowY: "auto",
            background: "rgba(4,7,12,0.96)",
            border: `1px solid ${GLD}44`,
            borderRadius: 8,
            padding: "12px 14px",
            backdropFilter: "blur(14px)",
            boxShadow: `0 0 28px ${GLD}22`,
            fontFamily: "monospace",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ color: GLD, fontSize: 11, letterSpacing: 2, fontWeight: "bold" }}>CONTACT × INVESTMENT NEXUS</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
            {[
              { label: "CONTACTS",  value: rows.length, color: CY },
              { label: "LINKED",    value: linked,      color: GLD },
              { label: "UNLINKED",  value: unlinked,    color: unlinked > 0 ? AMB : GRN },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{ background: "rgba(0,0,0,0.4)", border: `1px solid ${color}33`, borderRadius: 6, padding: "6px 8px", textAlign: "center" }}
              >
                <div style={{ color, fontSize: 16, fontWeight: "bold" }}>{loading ? "…" : value}</div>
                <div style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* coverage bar */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>PORTFOLIO CONTACT COVERAGE</span>
              <span style={{ color: pct >= 70 ? GRN : pct >= 40 ? AMB : RED, fontSize: 10, fontWeight: "bold" }}>{pct}%</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct >= 70 ? GRN : pct >= 40 ? AMB : RED, borderRadius: 2, transition: "width 0.4s" }} />
            </div>
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
            {["ALL", "PORTFOLIO-LINKED", "UNLINKED"].map((t) => (
              <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>

          {/* search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search contacts…"
            style={{ width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.4)", border: `1px solid ${GLD}33`, borderRadius: 5, color: "#DCEBF5", padding: "5px 8px", fontSize: 11, marginBottom: 8, outline: "none" }}
          />

          {/* list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 12 }}>No contacts match.</div>
            )}
            {visible.map((cnt) => (
              <div
                key={cnt.id}
                style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${cnt.linked ? GLD : AMB}33`, borderRadius: 6, padding: "7px 9px", cursor: "pointer" }}
                onClick={() => setExpanded(expanded === cnt.id ? null : cnt.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ color: cnt.linked ? GLD : AMB, fontSize: 10 }}>{cnt.linked ? "●" : "○"}</span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>{cnt.name}</span>
                  {cnt.role && <span style={{ color: DIM, fontSize: 9 }}>{cnt.role.slice(0, 20)}</span>}
                  <span style={{ color: cnt.linked ? GLD : DIM, fontSize: 9 }}>
                    {cnt.linked ? `${cnt.investments.length} holding${cnt.investments.length !== 1 ? "s" : ""}` : "UNLINKED"}
                  </span>
                </div>
                {cnt.org && (
                  <div style={{ color: DIM, fontSize: 9, marginLeft: 16 }}>{cnt.org.slice(0, 40)}</div>
                )}

                {expanded === cnt.id && (
                  <div style={{ marginTop: 6, borderTop: `1px solid ${GLD}22`, paddingTop: 6 }}>
                    {cnt.linked ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {cnt.investments.map((inv) => (
                          <div key={inv.id} style={{ background: "rgba(255,215,0,0.04)", border: `1px solid ${GLD}33`, borderRadius: 4, padding: "5px 7px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ color: TYPE_COLOR[inv.type] || GLD, fontSize: 9, border: `1px solid ${(TYPE_COLOR[inv.type] || GLD)}44`, borderRadius: 3, padding: "1px 4px" }}>{inv.type}</span>
                              <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{inv.name}</span>
                              {inv.ticker && <span style={{ color: DIM, fontSize: 9 }}>{inv.ticker}</span>}
                              <span style={{ color: DIM, fontSize: 9 }}>hits: {inv.hits}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No investment holdings matched this contact — no portfolio relationship on file.</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* assess */}
          <div style={{ marginTop: 10, borderTop: `1px solid ${GLD}22`, paddingTop: 8 }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{ background: `${GLD}18`, border: `1px solid ${GLD}55`, borderRadius: 5, color: GLD, padding: "5px 12px", cursor: "pointer", fontSize: 10, letterSpacing: 1, width: "100%", opacity: assessing ? 0.6 : 1 }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, color: "#DCEBF5", fontSize: 10, lineHeight: 1.5, borderLeft: `2px solid ${GLD}`, paddingLeft: 8 }}>
                {brief}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
