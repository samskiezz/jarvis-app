/**
 * F756 — Investment × Contact × Ops Events Triple Nexus (INVCOETRI)
 * Endpoints: /entities/Investment  ×  /entities/Contact  ×  /v1/ops/events
 * Classification: FULLY_EXPOSED | CONTACT_ONLY | OPS_ONLY | DARK
 *
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useState, useEffect, useCallback, useRef } from "react";

const CY  = "#29E7FF";
const AM  = "#FFB347";
const GN  = "#39FF14";
const RD  = "#FF4444";
const DIM = "#8899AA";

const BTN_LEFT = 921_220;
const POLL_MS  = 90_000;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const INVCOETRI_RE =
  /\b(invcoetri|investment\s+contact\s+ops|portfolio\s+contact\s+ops|investment\s+ops\s+exposure|contact\s+investment\s+ops|portfolio\s+ops\s+contact|investment\s+operations\s+contact|exposed\s+investment|dark\s+investment\s+contact|investment\s+ops\s+nexus|portfolio\s+operations\s+exposure)\b/i;

export function isInvcoetriQuery(t) {
  return INVCOETRI_RE.test(t || "");
}

function apiBase() {
  return (
    (typeof window !== "undefined" && window.__JARVIS_API_BASE__) ||
    import.meta.env?.VITE_API_BASE ||
    ""
  );
}

function normaliseInvestments(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.investments)) return raw.investments;
  if (raw && Array.isArray(raw.data))        return raw.data;
  if (raw && Array.isArray(raw.items))       return raw.items;
  return [];
}

function normaliseContacts(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.contacts)) return raw.contacts;
  if (raw && Array.isArray(raw.data))     return raw.data;
  if (raw && Array.isArray(raw.items))    return raw.items;
  return [];
}

function normaliseEvents(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.events)) return raw.events;
  if (raw && Array.isArray(raw.data))   return raw.data;
  if (raw && Array.isArray(raw.items))  return raw.items;
  return [];
}

function keywords(obj) {
  return [
    obj.name, obj.title, obj.description, obj.label,
    obj.type, obj.category, obj.kind, obj.summary,
    obj.tags, obj.topic, obj.domain, obj.sector,
    obj.ticker, obj.company, obj.role, obj.organization,
    obj.message, obj.source, obj.target, obj.content,
  ]
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function scoreMatch(aKw, bKw) {
  if (!aKw || !bKw) return 0;
  return aKw.split(/\s+/).filter(w => w.length > 3 && bKw.includes(w)).length;
}

function buildNexus(investments, contacts, events) {
  return investments.map(inv => {
    const iKw = keywords(inv);

    const bestContact = contacts.reduce(
      (best, c) => {
        const s = scoreMatch(iKw, keywords(c));
        return s > best.score ? { score: s, c } : best;
      },
      { score: 0, c: null },
    );

    const bestEvent = events.reduce(
      (best, ev) => {
        const s = scoreMatch(iKw, keywords(ev));
        return s > best.score ? { score: s, ev } : best;
      },
      { score: 0, ev: null },
    );

    const hasContact = bestContact.score > 0;
    const hasEvent   = bestEvent.score   > 0;

    const classification =
      hasContact && hasEvent ? "FULLY_EXPOSED"
      : hasContact           ? "CONTACT_ONLY"
      : hasEvent             ? "OPS_ONLY"
      :                        "DARK";

    return {
      inv,
      classification,
      bestContact:  bestContact.c,
      contactScore: bestContact.score,
      bestEvent:    bestEvent.ev,
      eventScore:   bestEvent.score,
    };
  });
}

export async function buildInvcoetriScript() {
  const base = apiBase();
  try {
    const [invR, cntR, evR] = await Promise.all([
      fetch(`${base}/entities/Investment`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/entities/Contact`,    { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/v1/ops/events`,       { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const investments = normaliseInvestments(await invR.json());
    const contacts    = normaliseContacts(await cntR.json());
    const events      = normaliseEvents(await evR.json());
    const nexus       = buildNexus(investments, contacts, events);
    const exposed     = nexus.filter(r => r.classification === "FULLY_EXPOSED").length;
    const dark        = nexus.filter(r => r.classification === "DARK").length;
    const pct         = investments.length ? Math.round((exposed / investments.length) * 100) : 0;

    const brief = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `Investment × Contact × Ops Events nexus: ${investments.length} investments analysed. ${exposed} fully exposed (contact+ops event match), ${dark} dark (no contact or operational event link). Coverage ${pct}%. Summarise portfolio operational exposure in 2 sentences.`,
      }),
    });
    const bd = await brief.json();
    return (bd.answer || "").trim() ||
      `${investments.length} investments analysed. ${exposed} fully exposed with contact and operational event linkage, ${dark} dark — no contact or ops event context detected.`;
  } catch (e) {
    return `INVCOETRI fetch error: ${e.message}`;
  }
}

const TABS = ["ALL", "FULLY_EXPOSED", "CONTACT_ONLY", "OPS_ONLY", "DARK"];

const BADGE_COLOR = {
  FULLY_EXPOSED: GN,
  CONTACT_ONLY:  CY,
  OPS_ONLY:      AM,
  DARK:          RD,
};

export default function InvestmentContactOpsTriple() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [badgeDark, setBadgeDark] = useState(0);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const base = apiBase();
    try {
      const [invR, cntR, evR] = await Promise.all([
        fetch(`${base}/entities/Investment`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/entities/Contact`,    { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/v1/ops/events`,       { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const investments = normaliseInvestments(await invR.json());
      const contacts    = normaliseContacts(await cntR.json());
      const events      = normaliseEvents(await evR.json());
      const nexus       = buildNexus(investments, contacts, events);
      setRows(nexus);
      setBadgeDark(nexus.filter(r => r.classification === "DARK").length);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(v => {
      if (!v) load();
      return !v;
    });
    window.addEventListener("jarvis:invcoetri-toggle", onToggle);
    return () => window.removeEventListener("jarvis:invcoetri-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = rows.filter(r => {
    const matchTab  = tab === "ALL" || r.classification === tab;
    const matchSrch = !search ||
      keywords(r.inv).includes(search.toLowerCase()) ||
      (r.bestContact && keywords(r.bestContact).includes(search.toLowerCase())) ||
      (r.bestEvent   && keywords(r.bestEvent).includes(search.toLowerCase()));
    return matchTab && matchSrch;
  });

  const counts = {
    total:          rows.length,
    FULLY_EXPOSED:  rows.filter(r => r.classification === "FULLY_EXPOSED").length,
    CONTACT_ONLY:   rows.filter(r => r.classification === "CONTACT_ONLY").length,
    OPS_ONLY:       rows.filter(r => r.classification === "OPS_ONLY").length,
    DARK:           rows.filter(r => r.classification === "DARK").length,
  };
  const pct = counts.total ? Math.round((counts.FULLY_EXPOSED / counts.total) * 100) : 0;

  const panel = open ? (
    <div style={{
      position: "fixed", left: BTN_LEFT, bottom: 56, zIndex: 615,
      width: "min(680px,92vw)", maxHeight: "70vh",
      background: "rgba(6,11,19,0.93)", border: `1px solid ${CY}55`,
      borderRadius: 14, padding: "14px 16px",
      backdropFilter: "blur(12px)", boxShadow: `0 0 60px ${CY}18`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>
          ◈ INVCOETRI — INVESTMENT × CONTACT × OPS EVENTS
        </span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: DIM }}>
          {loading ? "loading…" : `${counts.total} investments · ${pct}% exposed`}
        </span>
        <button onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          ["INVESTMENTS",   counts.total,          CY],
          ["FULLY EXPOSED", counts.FULLY_EXPOSED,   GN],
          ["CONTACT ONLY",  counts.CONTACT_ONLY,    CY],
          ["OPS ONLY",      counts.OPS_ONLY,        AM],
          ["DARK",          counts.DARK,            RD],
          ["COVERAGE",      `${pct}%`,              pct >= 60 ? GN : pct >= 30 ? AM : RD],
        ].map(([lbl, val, col]) => (
          <div key={lbl} style={{
            background: "rgba(0,0,0,0.4)", border: `1px solid ${col}44`,
            borderRadius: 8, padding: "6px 12px", textAlign: "center", minWidth: 80,
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: col }}>{val}</div>
            <div style={{ fontSize: 9, color: DIM, letterSpacing: 1 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              background: tab === t ? `${CY}22` : "transparent",
              border: `1px solid ${tab === t ? CY : DIM + "55"}`,
              borderRadius: 6, padding: "3px 10px", cursor: "pointer",
              color: tab === t ? CY : DIM, fontSize: 10, letterSpacing: 1,
            }}>{t}</button>
        ))}
      </div>

      {/* search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search investments / contacts / ops events…"
        style={{
          background: "rgba(0,0,0,0.4)", border: `1px solid ${CY}33`,
          borderRadius: 8, padding: "6px 12px", color: "#DCEBF5",
          fontFamily: "inherit", fontSize: 11, outline: "none",
        }}
      />

      {/* rows */}
      <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        {visible.slice(0, 80).map((r, i) => {
          const isExp = expanded === i;
          const col   = BADGE_COLOR[r.classification];
          const name  = r.inv.name || r.inv.title || r.inv.ticker || r.inv.company || `Investment ${i + 1}`;
          return (
            <div key={i}
              onClick={() => setExpanded(isExp ? null : i)}
              style={{
                background: isExp ? "rgba(41,231,255,0.06)" : "rgba(0,0,0,0.3)",
                border: `1px solid ${col}33`,
                borderRadius: 8, padding: "7px 12px", cursor: "pointer",
                transition: "background 0.15s",
              }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "#DCEBF5", flex: 1 }}>{name}</span>
                {r.inv.sector && (
                  <span style={{
                    fontSize: 9, background: `${AM}22`, border: `1px solid ${AM}44`,
                    borderRadius: 4, padding: "1px 6px", color: AM,
                  }}>{r.inv.sector}</span>
                )}
                <span style={{
                  fontSize: 9, background: `${col}22`, border: `1px solid ${col}55`,
                  borderRadius: 4, padding: "1px 6px", color: col, letterSpacing: 1,
                }}>{r.classification}</span>
              </div>
              {isExp && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                  {r.bestContact ? (
                    <div style={{ fontSize: 10, color: CY }}>
                      <b style={{ color: CY }}>Contact:</b>{" "}
                      {r.bestContact.name || r.bestContact.title || "contact"}{" "}
                      <span style={{ color: DIM }}>
                        (role: {r.bestContact.role || r.bestContact.type || "—"}, hits: {r.contactScore})
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: DIM }}>No matching contact found.</div>
                  )}
                  {r.bestEvent ? (
                    <div style={{ fontSize: 10, color: AM }}>
                      <b style={{ color: AM }}>Ops Event:</b>{" "}
                      {r.bestEvent.title || r.bestEvent.message || r.bestEvent.name || "event"}{" "}
                      <span style={{ color: DIM }}>
                        (type: {r.bestEvent.type || r.bestEvent.kind || "—"}, hits: {r.eventScore})
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: DIM }}>No matching ops event found.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {visible.length === 0 && !loading && (
          <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>
            No investments match current filter.
          </div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      {panel}
      <button
        onClick={() => { setOpen(v => { if (!v) load(); return !v; }); }}
        title="Investment × Contact × Ops Events Triple Nexus (INVCOETRI)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 615,
          background: open ? `${CY}22` : "rgba(5,8,13,0.7)",
          border: `1px solid ${open ? CY : CY + "55"}`,
          borderRadius: 8, cursor: "pointer",
          color: open ? CY : CY + "AA",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 1, padding: "4px 8px",
          boxShadow: open ? `0 0 18px ${CY}44` : "none",
          backdropFilter: "blur(6px)",
          whiteSpace: "nowrap",
        }}>
        ◈ INVCOETRI
        {badgeDark > 0 && (
          <span style={{
            marginLeft: 4, background: RD, color: "#04060A",
            borderRadius: 4, fontSize: 8, padding: "1px 4px", fontWeight: 700,
          }}>{badgeDark}</span>
        )}
      </button>
    </>
  );
}
