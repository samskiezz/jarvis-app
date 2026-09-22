/**
 * F741 — Investigation × Report × Contact Triple Nexus (INVRPTCNT)
 * Endpoints: /v1/investigations  ×  /v1/reports  ×  /entities/Contact
 * Classification: FULLY_DOCUMENTED | REPORT_ONLY | CONTACT_ONLY | DARK
 * Shows whether each investigation has a backing report AND an assigned contact.
 */
import { useState, useEffect, useCallback, useRef } from "react";

const CY  = "#29E7FF";
const AM  = "#FFB347";
const GN  = "#39FF14";
const RD  = "#FF4444";
const DIM = "#8899AA";

const BTN_LEFT = 909840;
const POLL_MS  = 90_000;

const INVRPTCNT_RE =
  /\b(invrptcnt|investigation\s*report\s*contact|case\s*report|contact\s*report|documented\s*investigation|unowned\s*investigation|case\s*documentation|investigation\s*contact\s*coverage|fully\s*documented\s*case|dark\s*investigation|investigation\s*coverage\s*triple|case\s*triple|investigation\s*triple\s*nexus)\b/i;

export function isInvrptcntQuery(t) {
  return INVRPTCNT_RE.test(t || "");
}

function apiBase() {
  return (
    (typeof window !== "undefined" && window.__JARVIS_API_BASE__) ||
    import.meta.env?.VITE_API_BASE ||
    ""
  );
}

function normaliseInvestigations(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw?.investigations) return raw.investigations;
  if (raw?.data)           return raw.data;
  if (raw?.items)          return raw.items;
  return [];
}

function normaliseReports(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw?.reports) return raw.reports;
  if (raw?.data)    return raw.data;
  if (raw?.items)   return raw.items;
  return [];
}

function normaliseContacts(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw?.contacts) return raw.contacts;
  if (raw?.data)     return raw.data;
  if (raw?.items)    return raw.items;
  return [];
}

function keywords(obj) {
  return [
    obj.title, obj.name, obj.subject, obj.description,
    obj.type, obj.category, obj.tags, obj.summary,
    obj.status, obj.source, obj.kind, obj.topic,
    obj.role, obj.organization,
  ]
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function bestMatch(invKw, collection) {
  let best = { score: 0, item: null };
  for (const item of collection) {
    const score = invKw
      .split(/\s+/)
      .filter(w => w.length > 3 && keywords(item).includes(w)).length;
    if (score > best.score) best = { score, item };
  }
  return best;
}

function buildNexus(investigations, reports, contacts) {
  return investigations.map(inv => {
    const iKw        = keywords(inv);
    const rptMatch   = bestMatch(iKw, reports);
    const cntMatch   = bestMatch(iKw, contacts);
    const hasReport  = rptMatch.score > 0;
    const hasContact = cntMatch.score > 0;
    const status =
      hasReport && hasContact ? "FULLY_DOCUMENTED" :
      hasReport               ? "REPORT_ONLY"      :
      hasContact              ? "CONTACT_ONLY"     :
                                "DARK";
    return {
      inv,
      matchedReport   : hasReport  ? rptMatch.item  : null,
      reportHits      : rptMatch.score,
      matchedContact  : hasContact ? cntMatch.item  : null,
      contactHits     : cntMatch.score,
      status,
    };
  });
}

async function fetchAll() {
  const base = apiBase();
  const [invRes, rptRes, cntRes] = await Promise.all([
    fetch(`${base}/v1/investigations`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`${base}/v1/reports`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`${base}/entities/Contact`).then(r => r.ok ? r.json() : []).catch(() => []),
  ]);
  return {
    investigations : normaliseInvestigations(invRes),
    reports        : normaliseReports(rptRes),
    contacts       : normaliseContacts(cntRes),
  };
}

export async function buildInvrptcntScript() {
  try {
    const { investigations, reports, contacts } = await fetchAll();
    const nexus = buildNexus(investigations, reports, contacts);
    const counts = {
      FULLY_DOCUMENTED : nexus.filter(r => r.status === "FULLY_DOCUMENTED").length,
      REPORT_ONLY      : nexus.filter(r => r.status === "REPORT_ONLY").length,
      CONTACT_ONLY     : nexus.filter(r => r.status === "CONTACT_ONLY").length,
      DARK             : nexus.filter(r => r.status === "DARK").length,
    };
    const dark = nexus
      .filter(r => r.status === "DARK")
      .slice(0, 3)
      .map(r => r.inv.title || r.inv.name || r.inv.subject || "Unnamed")
      .join("; ");
    return (
      `Investigation Documentation Triple: ${investigations.length} investigations cross-referenced against ` +
      `${reports.length} reports and ${contacts.length} contacts. ` +
      `${counts.FULLY_DOCUMENTED} fully documented (report + contact). ` +
      `${counts.REPORT_ONLY} report only (no assigned contact). ` +
      `${counts.CONTACT_ONLY} contact only (no backing report). ` +
      `${counts.DARK} dark with no coverage${dark ? `: ${dark}` : ""}. ` +
      `Dark investigations require immediate documentation and ownership assignment.`
    );
  } catch {
    return "Investigation Report Contact Triple data unavailable.";
  }
}

const STATUS_META = {
  FULLY_DOCUMENTED : { label: "FULLY DOCUMENTED", col: GN  },
  REPORT_ONLY      : { label: "REPORT ONLY",       col: CY  },
  CONTACT_ONLY     : { label: "CONTACT ONLY",       col: AM  },
  DARK             : { label: "DARK",               col: RD  },
};

export default function InvestigationReportContactTriple() {
  const [open,    setOpen]    = useState(false);
  const [rows,    setRows]    = useState([]);
  const [counts,  setCounts]  = useState({ FULLY_DOCUMENTED:0, REPORT_ONLY:0, CONTACT_ONLY:0, DARK:0 });
  const [totals,  setTotals]  = useState({ investigations:0, reports:0, contacts:0 });
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState(null);
  const [filter,  setFilter]  = useState("ALL");
  const [search,  setSearch]  = useState("");
  const [expanded, setExpanded] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { investigations, reports, contacts } = await fetchAll();
      const nexus = buildNexus(investigations, reports, contacts);
      setRows(nexus);
      setCounts({
        FULLY_DOCUMENTED : nexus.filter(r => r.status === "FULLY_DOCUMENTED").length,
        REPORT_ONLY      : nexus.filter(r => r.status === "REPORT_ONLY").length,
        CONTACT_ONLY     : nexus.filter(r => r.status === "CONTACT_ONLY").length,
        DARK             : nexus.filter(r => r.status === "DARK").length,
      });
      setTotals({ investigations: investigations.length, reports: reports.length, contacts: contacts.length });
    } catch (e) {
      setErr(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => { if (!o) load(); return !o; });
    window.addEventListener("jarvis:invrptcnt-toggle", toggle);
    return () => window.removeEventListener("jarvis:invrptcnt-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    const txt = await buildInvrptcntScript();
    if (txt) window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
  }, []);

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.status !== filter) return false;
    if (search) {
      const kw = search.toLowerCase();
      const invText = keywords(r.inv);
      return invText.includes(kw);
    }
    return true;
  });

  const darkCount = counts.DARK;

  const btnStyle = {
    position   : "fixed",
    left       : BTN_LEFT,
    bottom     : 8,
    zIndex     : 600,
    background : "rgba(0,0,0,0.75)",
    border     : `1px solid ${RD}`,
    color      : RD,
    padding    : "3px 8px",
    fontSize   : 10,
    cursor     : "pointer",
    borderRadius: 3,
    fontFamily : "monospace",
    whiteSpace : "nowrap",
  };

  const panelStyle = {
    position   : "fixed",
    left       : BTN_LEFT,
    bottom     : 36,
    width      : 560,
    maxHeight  : "72vh",
    zIndex     : 600,
    background : "rgba(5,10,20,0.97)",
    border     : `1px solid ${RD}`,
    borderRadius: 6,
    padding    : 14,
    overflowY  : "auto",
    fontFamily : "monospace",
    color      : "#CDD9E5",
    fontSize   : 11,
  };

  const tileStyle = (col) => ({
    flex: 1,
    minWidth: 80,
    background: "rgba(0,0,0,0.45)",
    border: `1px solid ${col}33`,
    borderRadius: 4,
    padding: "6px 10px",
    textAlign: "center",
  });

  return (
    <>
      <button style={btnStyle} onClick={() => { setOpen(o => { if (!o) load(); return !o; }); }}>
        ◈ INVRPTCNT
        {darkCount > 0 && (
          <span style={{ marginLeft: 4, background: RD, color: "#000", borderRadius: 9, padding: "0 5px", fontWeight: "bold" }}>
            {darkCount}
          </span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ color: RD, fontWeight: "bold", fontSize: 12 }}>
              ◈ INVESTIGATION × REPORT × CONTACT
            </span>
            <span style={{ color: DIM, cursor: "pointer" }} onClick={() => setOpen(false)}>✕</span>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            <div style={tileStyle(CY)}>
              <div style={{ color: CY, fontWeight: "bold", fontSize: 13 }}>{totals.investigations}</div>
              <div style={{ color: DIM, fontSize: 9 }}>INVESTIGATIONS</div>
            </div>
            <div style={tileStyle(GN)}>
              <div style={{ color: GN, fontWeight: "bold", fontSize: 13 }}>{counts.FULLY_DOCUMENTED}</div>
              <div style={{ color: DIM, fontSize: 9 }}>FULLY DOC</div>
            </div>
            <div style={tileStyle(CY)}>
              <div style={{ color: CY, fontWeight: "bold", fontSize: 13 }}>{counts.REPORT_ONLY}</div>
              <div style={{ color: DIM, fontSize: 9 }}>RPT ONLY</div>
            </div>
            <div style={tileStyle(AM)}>
              <div style={{ color: AM, fontWeight: "bold", fontSize: 13 }}>{counts.CONTACT_ONLY}</div>
              <div style={{ color: DIM, fontSize: 9 }}>CNT ONLY</div>
            </div>
            <div style={tileStyle(RD)}>
              <div style={{ color: RD, fontWeight: "bold", fontSize: 13 }}>{counts.DARK}</div>
              <div style={{ color: DIM, fontSize: 9 }}>DARK</div>
            </div>
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
            {["ALL", "FULLY_DOCUMENTED", "REPORT_ONLY", "CONTACT_ONLY", "DARK"].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? RD : "rgba(0,0,0,0.4)",
                  color: filter === f ? "#000" : DIM,
                  border: `1px solid ${filter === f ? RD : "#333"}`,
                  padding: "2px 7px", fontSize: 9, cursor: "pointer", borderRadius: 3,
                }}
              >
                {f === "ALL" ? "ALL" : STATUS_META[f]?.label || f}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search investigations…"
            style={{
              width: "100%", boxSizing: "border-box", marginBottom: 8,
              background: "rgba(0,0,0,0.5)", border: `1px solid #333`,
              color: "#CDD9E5", padding: "4px 8px", fontSize: 10, borderRadius: 3,
            }}
          />

          {/* ASSESS button */}
          <button
            onClick={assess}
            style={{
              marginBottom: 10, background: "rgba(255,68,68,0.15)",
              border: `1px solid ${RD}`, color: RD,
              padding: "4px 12px", fontSize: 10, cursor: "pointer", borderRadius: 3,
            }}
          >
            ▶ ASSESS
          </button>

          {loading && <div style={{ color: DIM }}>Loading…</div>}
          {err     && <div style={{ color: RD }}>Error: {err}</div>}

          {/* Rows */}
          {visible.map((r, i) => {
            const meta   = STATUS_META[r.status];
            const isOpen = expanded === i;
            const invTitle = r.inv.title || r.inv.name || r.inv.subject || `Investigation ${i+1}`;
            return (
              <div
                key={i}
                style={{
                  borderBottom: "1px solid #1A2233",
                  padding: "5px 0",
                  cursor: "pointer",
                }}
                onClick={() => setExpanded(isOpen ? null : i)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#CDD9E5", maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {invTitle}
                  </span>
                  <span style={{
                    background: `${meta.col}22`, color: meta.col,
                    border: `1px solid ${meta.col}55`,
                    padding: "1px 6px", borderRadius: 3, fontSize: 9, whiteSpace: "nowrap",
                  }}>
                    {meta.label}
                  </span>
                </div>

                {r.inv.status && (
                  <div style={{ color: DIM, fontSize: 9, marginTop: 2 }}>
                    status: {r.inv.status}
                  </div>
                )}

                {isOpen && (
                  <div style={{ marginTop: 6, paddingLeft: 10 }}>
                    {r.matchedReport && (
                      <div style={{ marginBottom: 4 }}>
                        <span style={{ color: CY, fontSize: 9 }}>
                          [REPORT] {r.matchedReport.title || r.matchedReport.name || "Untitled"}
                          {r.matchedReport.type && (
                            <span style={{ marginLeft: 5, background: `${CY}22`, color: CY, border: `1px solid ${CY}44`, borderRadius: 3, padding: "0 4px" }}>
                              {r.matchedReport.type}
                            </span>
                          )}
                          <span style={{ color: DIM, marginLeft: 5 }}>hits:{r.reportHits}</span>
                        </span>
                      </div>
                    )}
                    {!r.matchedReport && (
                      <div style={{ color: `${RD}99`, fontSize: 9, marginBottom: 4 }}>no matching report</div>
                    )}
                    {r.matchedContact && (
                      <div>
                        <span style={{ color: AM, fontSize: 9 }}>
                          [CONTACT] {r.matchedContact.name || "Unnamed"}
                          {r.matchedContact.role && (
                            <span style={{ marginLeft: 5, background: `${AM}22`, color: AM, border: `1px solid ${AM}44`, borderRadius: 3, padding: "0 4px" }}>
                              {r.matchedContact.role}
                            </span>
                          )}
                          <span style={{ color: DIM, marginLeft: 5 }}>hits:{r.contactHits}</span>
                        </span>
                      </div>
                    )}
                    {!r.matchedContact && (
                      <div style={{ color: `${AM}99`, fontSize: 9 }}>no matching contact</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {!loading && visible.length === 0 && (
            <div style={{ color: DIM, textAlign: "center", marginTop: 20 }}>No results</div>
          )}

          <div style={{ color: DIM, fontSize: 8, marginTop: 10, borderTop: "1px solid #1A2233", paddingTop: 6 }}>
            /v1/investigations × /v1/reports × /entities/Contact | poll {POLL_MS / 1000}s | F741
          </div>
        </div>
      )}
    </>
  );
}
