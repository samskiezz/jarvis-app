/**
 * F177 — Contact × Investment Coverage (CONVIN)
 *
 * Parallel-fetches /entities/Contact + /entities/Investment, then
 * keyword-correlates each contact against investment positions to surface:
 *   MANAGED   — contact name/org appears in at least one investment record
 *   UNMANAGED — no investment linkage found (relationship not yet tied to assets)
 *
 * Stat tiles: contacts / investments / managed / unmanaged
 * Filter tabs: ALL | MANAGED | UNMANAGED
 * Text search across contact names / orgs.
 * Expand any contact → matched investments with asset class badge + relevance score.
 * Teal badge on unmanaged count.
 * ▶ ASSESS: 2-sentence contact-investment exposure brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ CONVIN  at bottom:8 left:60680, zIndex:118.
 * Event:   jarvis:convin-toggle
 * Voice:   "contact investment / investor contact / convin /
 *           unmanaged contacts / contact wealth / contact portfolio /
 *           investment contact / which contacts have investments"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const BTN_LEFT = 60680;
const POLL_MS  = 90_000;
const TEAL     = "#2DD4BF";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ───────────────────────────────────────────────────

const CONVIN_RE =
  /\b(contact\s+invest(ment|or)[s]?|investor\s+contact[s]?|convin|unmanaged\s+contact[s]?|contact\s+wealth|contact\s+portfolio|investment\s+contact[s]?|which\s+contact[s]?\s+(have|has|own[s]?|hold[s]?)\s+invest(ment|ments)?|contact\s+asset[s]?|linked\s+contact[s]?)\b/i;

export function isConvinQuery(q) { return CONVIN_RE.test(q); }

export async function buildConvinScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [ctRes, invRes] = await Promise.all([
      fetch(`${base}/entities/Contact`,    { headers: hdr }),
      fetch(`${base}/entities/Investment`, { headers: hdr }),
    ]);
    const contacts     = normaliseContacts(await ctRes.json());
    const investments  = normaliseInvestments(await invRes.json());

    const managed   = contacts.filter((c) => investments.some((i) => relevance(c, i) > 0)).length;
    const unmanaged = contacts.length - managed;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS contact × investment coverage analysis: ${contacts.length} contacts on record, ` +
          `${investments.length} investment positions tracked. ${managed} contacts have keyword ` +
          `linkage to at least one investment position; ${unmanaged} contacts show no investment ` +
          `coverage (relationship-to-asset mapping gap). Provide a 2-sentence ` +
          `contact-investment exposure brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Contact-investment coverage analysis complete, sir.").trim();
  } catch {
    return "Contact-investment coverage analysis unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseContacts(raw) {
  const arr = Array.isArray(raw)          ? raw
    : Array.isArray(raw?.contacts)        ? raw.contacts
    : Array.isArray(raw?.data)            ? raw.data
    : Array.isArray(raw?.results)         ? raw.results
    : Array.isArray(raw?.items)           ? raw.items
    : [];
  return arr.map((c, i) => ({
    id:           c.id           || c.contact_id   || String(i),
    name:         c.name         || c.full_name    || c.label      || `Contact ${i + 1}`,
    org:          c.org          || c.organisation || c.company    || c.organization || "",
    role:         c.role         || c.title        || c.position   || "",
    tags:         Array.isArray(c.tags) ? c.tags.join(" ") : (c.tags || ""),
    description:  (c.description || c.notes || c.bio || "").toString().slice(0, 300),
  }));
}

function normaliseInvestments(raw) {
  const arr = Array.isArray(raw)            ? raw
    : Array.isArray(raw?.investments)       ? raw.investments
    : Array.isArray(raw?.data)              ? raw.data
    : Array.isArray(raw?.results)           ? raw.results
    : Array.isArray(raw?.items)             ? raw.items
    : [];
  return arr.map((inv, i) => ({
    id:          inv.id           || inv.investment_id || String(i),
    name:        inv.name         || inv.title         || inv.label    || `Investment ${i + 1}`,
    assetClass:  inv.asset_class  || inv.type          || inv.kind     || inv.category || "",
    ticker:      inv.ticker       || inv.symbol        || "",
    tags:        Array.isArray(inv.tags) ? inv.tags.join(" ") : (inv.tags || ""),
    description: (inv.description || inv.notes || inv.summary || "").toString().slice(0, 300),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(contact, investment) {
  const cw = keywords(`${contact.name} ${contact.org} ${contact.role} ${contact.description} ${contact.tags}`);
  const iw = keywords(`${investment.name} ${investment.ticker} ${investment.description} ${investment.tags}`);
  return cw.filter((w) => iw.some((p) => p.includes(w) || w.includes(p))).length;
}

function buildLinked(contacts, investments) {
  return contacts.map((ct) => {
    const matched = investments
      .map((inv) => ({ ...inv, score: relevance(ct, inv) }))
      .filter((inv) => inv.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...ct, investments: matched, managed: matched.length > 0 };
  });
}

function assetColor(cls) {
  const lc = String(cls || "").toLowerCase();
  if (lc.includes("equity") || lc.includes("stock")) return "#60A5FA";
  if (lc.includes("crypto"))                           return "#A78BFA";
  if (lc.includes("bond") || lc.includes("fixed"))    return "#34D399";
  if (lc.includes("real") || lc.includes("property")) return "#FB923C";
  if (lc.includes("commodity"))                        return "#FBBF24";
  return "#94A3B8";
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "MANAGED", "UNMANAGED"];

export default function ContactInvestmentCoverage() {
  const [open,      setOpen]      = useState(false);
  const [contacts,  setContacts]  = useState([]);
  const [investments, setInvestments] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [ctRes, invRes] = await Promise.all([
        fetch(`${base}/entities/Contact`,    { headers: hdr }),
        fetch(`${base}/entities/Investment`, { headers: hdr }),
      ]);
      setContacts(normaliseContacts(await ctRes.json()));
      setInvestments(normaliseInvestments(await invRes.json()));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const onToggle = () => {
      setOpen((v) => {
        if (!v) load();
        return !v;
      });
    };
    window.addEventListener("jarvis:convin-toggle", onToggle);
    return () => window.removeEventListener("jarvis:convin-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    const text = await buildConvinScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const linked    = buildLinked(contacts, investments);
  const managed   = linked.filter((c) => c.managed).length;
  const unmanaged = linked.length - managed;

  const displayed = linked.filter((c) => {
    if (filter === "MANAGED"   && !c.managed) return false;
    if (filter === "UNMANAGED" && c.managed)  return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.org.toLowerCase().includes(q)  ||
      c.role.toLowerCase().includes(q)
    );
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Contact × Investment Coverage (CONVIN)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 118,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${TEAL}55`,
          color: TEAL, padding: "3px 10px", borderRadius: 6,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          cursor: "pointer", backdropFilter: "blur(6px)",
          letterSpacing: 1,
        }}
      >
        {unmanaged > 0
          ? <><span style={{ background: TEAL, color: "#04060A", borderRadius: 4, padding: "0 4px", marginRight: 4, fontWeight: 700 }}>{unmanaged}</span>◈ CONVIN</>
          : "◈ CONVIN"
        }
      </button>
    );
  }

  const TILE = { flex: "1 1 100px", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", textAlign: "center" };

  return (
    <div style={{
      position: "fixed", bottom: 52, left: BTN_LEFT - 360, zIndex: 118,
      width: 480, maxHeight: "72vh", display: "flex", flexDirection: "column",
      background: "rgba(6,10,16,0.95)", border: `1px solid ${TEAL}44`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: `0 0 40px ${TEAL}22`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${TEAL}33` }}>
        <span style={{ color: TEAL, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ CONVIN</span>
        <span style={{ color: "#6E8AA0", fontSize: 9, flex: 1 }}>CONTACT × INVESTMENT COVERAGE</span>
        {lastFetch && <span style={{ color: "#6E8AA0", fontSize: 8 }}>{lastFetch.toLocaleTimeString()}</span>}
        {loading && <span style={{ color: TEAL, fontSize: 9 }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{ marginLeft: 4, background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${TEAL}22` }}>
        {[
          { label: "CONTACTS",    value: linked.length,  col: "#60A5FA" },
          { label: "INVESTMENTS", value: investments.length, col: "#A78BFA" },
          { label: "MANAGED",     value: managed,        col: TEAL },
          { label: "UNMANAGED",   value: unmanaged,      col: "#F87171" },
        ].map(({ label, value, col }) => (
          <div key={label} style={TILE}>
            <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{value}</div>
            <div style={{ color: "#6E8AA0", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${TEAL}22`, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setFilter(t)} style={{
            background: filter === t ? `${TEAL}22` : "none",
            border: `1px solid ${filter === t ? TEAL : "#6E8AA0"}`,
            color: filter === t ? TEAL : "#6E8AA0",
            borderRadius: 5, padding: "2px 8px", fontSize: 9,
            cursor: "pointer", letterSpacing: 1,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="search contacts…"
          style={{
            flex: 1, minWidth: 100, background: "rgba(255,255,255,0.04)",
            border: "1px solid #6E8AA044", borderRadius: 5, padding: "2px 8px",
            color: "#DCEBF5", fontSize: 9, outline: "none",
          }}
        />
        <button onClick={assess} disabled={assessing} style={{
          background: "none", border: `1px solid ${TEAL}`,
          color: TEAL, borderRadius: 5, padding: "2px 8px",
          fontSize: 9, cursor: "pointer", letterSpacing: 1,
        }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
      </div>

      {/* contact list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
        {displayed.length === 0 && !loading && (
          <div style={{ color: "#6E8AA0", fontSize: 10, textAlign: "center", padding: 20 }}>
            No contacts match the current filter.
          </div>
        )}
        {displayed.map((ct) => {
          const isExp  = expanded === ct.id;
          const status = ct.managed ? "MANAGED" : "UNMANAGED";
          const col    = ct.managed ? TEAL : "#F87171";
          return (
            <div key={ct.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : ct.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 7, cursor: "pointer",
                  background: isExp ? `${TEAL}11` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${ct.managed ? TEAL + "44" : "#6E8AA022"}`,
                  transition: "background 0.2s",
                }}
              >
                <span style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: 1, padding: "1px 5px",
                  borderRadius: 4, background: `${col}22`, color: col,
                }}>
                  {status}
                </span>
                <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5" }}>{ct.name}</span>
                {ct.org  && <span style={{ fontSize: 8, color: "#6E8AA0" }}>{ct.org}</span>}
                {ct.managed && (
                  <span style={{ fontSize: 8, color: TEAL }}>{ct.investments.length} position{ct.investments.length !== 1 ? "s" : ""}</span>
                )}
                <span style={{ color: "#6E8AA0", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ margin: "4px 0 4px 12px", padding: "8px 10px", borderRadius: 7, background: "rgba(255,255,255,0.02)", border: `1px solid ${TEAL}22` }}>
                  {ct.role && (
                    <div style={{ fontSize: 9, color: "#6E8AA0", marginBottom: 6 }}>
                      {ct.role}{ct.description ? ` · ${ct.description.slice(0, 100)}` : ""}
                    </div>
                  )}
                  {ct.investments.length === 0 ? (
                    <div style={{ fontSize: 9, color: "#F87171" }}>No investment positions linked to this contact.</div>
                  ) : (
                    ct.investments.map((inv) => (
                      <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, padding: "4px 8px", borderRadius: 5, background: "rgba(255,255,255,0.03)" }}>
                        <span style={{
                          fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                          background: `${assetColor(inv.assetClass)}22`, color: assetColor(inv.assetClass),
                          letterSpacing: 1,
                        }}>
                          {String(inv.assetClass || "ASSET").toUpperCase().slice(0, 8)}
                        </span>
                        <span style={{ flex: 1, fontSize: 9, color: "#DCEBF5" }}>{inv.name}</span>
                        {inv.ticker && <span style={{ fontSize: 8, color: "#6E8AA0" }}>{inv.ticker}</span>}
                        <span style={{ fontSize: 8, color: TEAL }}>rel:{inv.score}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
