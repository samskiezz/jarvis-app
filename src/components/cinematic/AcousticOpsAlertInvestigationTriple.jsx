/**
 * F751 — Acoustic × Ops Alert × Investigation Triple Nexus (ACALINV)
 * Endpoints: /v1/acoustic/contacts  ×  /v1/ops/alerts  ×  /v1/investigations
 * Classification: FULLY_TRACKED | ALERTED_ONLY | INVESTIGATED_ONLY | DARK
 *
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useState, useEffect, useCallback, useRef } from "react";

const CY  = "#29E7FF";
const AM  = "#FFB347";
const GN  = "#39FF14";
const RD  = "#FF4444";
const DIM = "#8899AA";

const BTN_LEFT = 916_920;
const POLL_MS  = 90_000;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const ACALINV_RE =
  /\b(acalinv|acoustic\s+ops\s+alert|acoustic\s+alert\s+invest|acoustic\s+investigation|sensor\s+alert\s+case|acoustic\s+case\s+alert|sensor\s+investigation|acoustic\s+case\s+coverage|tracked\s+acoustic|dark\s+acoustic\s+contact|untracked\s+sensor|acoustic\s+triple)\b/i;

export function isAcalinvQuery(t) {
  return ACALINV_RE.test(t || "");
}

function apiBase() {
  return (
    (typeof window !== "undefined" && window.__JARVIS_API_BASE__) ||
    import.meta.env?.VITE_API_BASE ||
    ""
  );
}

function normaliseAcoustic(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.contacts)) return raw.contacts;
  if (raw && Array.isArray(raw.data))     return raw.data;
  if (raw && Array.isArray(raw.items))    return raw.items;
  return [];
}

function normaliseAlerts(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.alerts)) return raw.alerts;
  if (raw && Array.isArray(raw.data))   return raw.data;
  if (raw && Array.isArray(raw.items))  return raw.items;
  return [];
}

function normaliseInvestigations(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.investigations)) return raw.investigations;
  if (raw && Array.isArray(raw.data))           return raw.data;
  if (raw && Array.isArray(raw.items))          return raw.items;
  return [];
}

function keywords(obj) {
  return [
    obj.name, obj.title, obj.description, obj.label,
    obj.type, obj.category, obj.kind, obj.summary,
    obj.tags, obj.role, obj.source, obj.target,
    obj.message, obj.subject, obj.topic, obj.mmsi,
    obj.vessel_name, obj.call_sign,
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

function buildNexus(contacts, alerts, investigations) {
  return contacts.map(contact => {
    const cKw = keywords(contact);

    const bestAlert = alerts.reduce(
      (best, a) => {
        const s = scoreMatch(cKw, keywords(a));
        return s > best.score ? { score: s, a } : best;
      },
      { score: 0, a: null },
    );

    const bestInvestigation = investigations.reduce(
      (best, inv) => {
        const s = scoreMatch(cKw, keywords(inv));
        return s > best.score ? { score: s, inv } : best;
      },
      { score: 0, inv: null },
    );

    const hasAlert          = bestAlert.score          > 0;
    const hasInvestigation  = bestInvestigation.score  > 0;

    const status =
      hasAlert && hasInvestigation ? "FULLY_TRACKED"      :
      hasAlert                     ? "ALERTED_ONLY"       :
      hasInvestigation             ? "INVESTIGATED_ONLY"  :
                                     "DARK";

    return {
      contact,
      matchedAlert        : hasAlert         ? bestAlert.a         : null,
      matchedInvestigation: hasInvestigation ? bestInvestigation.inv : null,
      alertScore          : bestAlert.score,
      investigationScore  : bestInvestigation.score,
      status,
    };
  });
}

async function fetchAll() {
  const base = apiBase();
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const [acRaw, alRaw, invRaw] = await Promise.all([
    fetch(`${base}/v1/acoustic/contacts`, { headers: hdr })
      .then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`${base}/v1/ops/alerts`, { headers: hdr })
      .then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`${base}/v1/investigations`, { headers: hdr })
      .then(r => r.ok ? r.json() : []).catch(() => []),
  ]);
  return {
    contacts       : normaliseAcoustic(acRaw),
    alerts         : normaliseAlerts(alRaw),
    investigations : normaliseInvestigations(invRaw),
  };
}

export async function buildAcalinvScript() {
  try {
    const { contacts, alerts, investigations } = await fetchAll();
    if (!contacts.length) return "No acoustic contacts found for triple nexus analysis, sir.";
    const nexus        = buildNexus(contacts, alerts, investigations);
    const fully        = nexus.filter(r => r.status === "FULLY_TRACKED").length;
    const alertOnly    = nexus.filter(r => r.status === "ALERTED_ONLY").length;
    const invOnly      = nexus.filter(r => r.status === "INVESTIGATED_ONLY").length;
    const dark         = nexus.filter(r => r.status === "DARK").length;
    const cov          = contacts.length
      ? Math.round((fully / contacts.length) * 100) : 0;
    const darkNames    = nexus
      .filter(r => r.status === "DARK")
      .slice(0, 3)
      .map(r => r.contact.name || r.contact.vessel_name || r.contact.mmsi || "Unknown contact")
      .join("; ");
    return (
      `Acoustic Ops Alert Investigation Triple Nexus: ${contacts.length} acoustic contacts cross-referenced ` +
      `against ${alerts.length} ops alerts and ${investigations.length} investigations. ` +
      `${fully} fully tracked (alert + investigation match). ` +
      `${alertOnly} alerted only. ${invOnly} investigated only. ` +
      `${dark} dark — no alert or investigation coverage${darkNames ? `: ${darkNames}` : ""}. ` +
      `Overall coverage: ${cov}%. Dark contacts represent untracked operational sensor gaps.`
    );
  } catch {
    return "Acoustic Ops Alert Investigation Triple Nexus data unavailable.";
  }
}

const STATUS_META = {
  FULLY_TRACKED      : { label: "FULLY TRACKED",       col: GN  },
  ALERTED_ONLY       : { label: "ALERTED ONLY",        col: AM  },
  INVESTIGATED_ONLY  : { label: "INVESTIGATED ONLY",   col: CY  },
  DARK               : { label: "DARK",                col: RD  },
};

export default function AcousticOpsAlertInvestigationTriple() {
  const [open,    setOpen]    = useState(false);
  const [rows,    setRows]    = useState([]);
  const [counts,  setCounts]  = useState({
    FULLY_TRACKED: 0, ALERTED_ONLY: 0, INVESTIGATED_ONLY: 0, DARK: 0,
  });
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState(null);
  const [filter,  setFilter]  = useState("ALL");
  const [search,  setSearch]  = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { contacts, alerts, investigations } = await fetchAll();
      const nexus = buildNexus(contacts, alerts, investigations);
      setRows(nexus);
      setCounts({
        FULLY_TRACKED      : nexus.filter(r => r.status === "FULLY_TRACKED").length,
        ALERTED_ONLY       : nexus.filter(r => r.status === "ALERTED_ONLY").length,
        INVESTIGATED_ONLY  : nexus.filter(r => r.status === "INVESTIGATED_ONLY").length,
        DARK               : nexus.filter(r => r.status === "DARK").length,
      });
    } catch (e) {
      setErr(e.message || "Fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:acalinv-toggle", toggle);
    return () => window.removeEventListener("jarvis:acalinv-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const sq = search.toLowerCase();
  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.status !== filter) return false;
    if (!sq) return true;
    const c = r.contact;
    const label = (c.name || c.vessel_name || c.mmsi || "").toLowerCase();
    return label.includes(sq);
  });

  const cov = rows.length
    ? Math.round((counts.FULLY_TRACKED / rows.length) * 100) : 0;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position    : "fixed",
          bottom      : 8,
          left        : BTN_LEFT,
          zIndex      : 610,
          background  : open ? "rgba(41,231,255,0.14)" : "rgba(20,24,32,0.82)",
          border      : `1px solid ${open ? CY : DIM}`,
          color       : open ? CY : DIM,
          borderRadius: 6,
          padding     : "3px 10px",
          fontSize    : 11,
          cursor      : "pointer",
          fontFamily  : "monospace",
          letterSpacing: "0.05em",
          whiteSpace  : "nowrap",
        }}
        title="Acoustic × Ops Alert × Investigation Triple Nexus (F751)"
      >
        ACALINV
        {counts.DARK > 0 && (
          <span style={{
            marginLeft  : 5,
            background  : RD,
            color       : "#000",
            borderRadius: 3,
            padding     : "0 4px",
            fontSize    : 9,
            fontWeight  : 700,
          }}>
            {counts.DARK}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position     : "fixed",
            bottom       : 36,
            left         : BTN_LEFT,
            width        : 860,
            maxHeight    : 560,
            zIndex       : 610,
            background   : "rgba(10,13,20,0.97)",
            border       : `1px solid ${CY}`,
            borderRadius : 10,
            boxShadow    : `0 0 32px ${CY}44`,
            display      : "flex",
            flexDirection: "column",
            overflow     : "hidden",
            fontFamily   : "monospace",
          }}
        >
          {/* Header */}
          <div style={{
            padding     : "8px 14px 6px",
            borderBottom: `1px solid ${CY}44`,
            display     : "flex",
            alignItems  : "center",
            gap         : 10,
            flexShrink  : 0,
          }}>
            <span style={{ color: CY, fontWeight: 700, fontSize: 12, letterSpacing: "0.1em" }}>
              ACOUSTIC × OPS ALERT × INVESTIGATION — TRIPLE NEXUS
            </span>
            <span style={{ color: DIM, fontSize: 10, marginLeft: "auto" }}>F751</span>
            {loading && <span style={{ color: AM, fontSize: 10 }}>LOADING…</span>}
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
            >✕</button>
          </div>

          {/* Stat bar */}
          <div style={{
            display     : "flex",
            gap         : 8,
            padding     : "5px 14px",
            borderBottom: `1px solid ${CY}22`,
            flexShrink  : 0,
            flexWrap    : "wrap",
          }}>
            {[
              { label: "CONTACTS",      val: rows.length,           col: CY },
              { label: "COVERAGE",      val: `${cov}%`,             col: GN },
              { label: "FULLY TRACKED", val: counts.FULLY_TRACKED,  col: GN },
              { label: "DARK",          val: counts.DARK,           col: RD },
            ].map(tile => (
              <span key={tile.label} style={{
                background  : `${tile.col}11`,
                border      : `1px solid ${tile.col}44`,
                color       : tile.col,
                borderRadius: 4,
                padding     : "2px 10px",
                fontSize    : 10,
              }}>
                {tile.label}: <strong>{tile.val}</strong>
              </span>
            ))}

            {/* Filter tabs */}
            {Object.entries(STATUS_META).map(([k, m]) => (
              <button
                key={k}
                onClick={() => setFilter(f => f === k ? "ALL" : k)}
                style={{
                  background  : filter === k ? `${m.col}22` : "transparent",
                  border      : `1px solid ${filter === k ? m.col : DIM + "66"}`,
                  color       : filter === k ? m.col : DIM,
                  borderRadius: 4,
                  padding     : "2px 8px",
                  fontSize    : 10,
                  cursor      : "pointer",
                  fontFamily  : "monospace",
                }}
              >
                {m.label} ({counts[k]})
              </button>
            ))}
            <button
              onClick={() => setFilter("ALL")}
              style={{
                background  : filter === "ALL" ? `${CY}22` : "transparent",
                border      : `1px solid ${filter === "ALL" ? CY : DIM + "66"}`,
                color       : filter === "ALL" ? CY : DIM,
                borderRadius: 4,
                padding     : "2px 8px",
                fontSize    : 10,
                cursor      : "pointer",
                fontFamily  : "monospace",
              }}
            >
              ALL ({rows.length})
            </button>
            <button
              onClick={load}
              style={{
                marginLeft  : "auto",
                background  : "transparent",
                border      : `1px solid ${DIM}66`,
                color       : DIM,
                borderRadius: 4,
                padding     : "2px 8px",
                fontSize    : 10,
                cursor      : "pointer",
              }}
            >↺</button>
          </div>

          {/* Search */}
          <div style={{ padding: "4px 14px", borderBottom: `1px solid ${CY}11`, flexShrink: 0 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search acoustic contacts…"
              style={{
                width       : "100%",
                background  : "transparent",
                border      : `1px solid ${DIM}44`,
                color       : "#E0EAF2",
                borderRadius: 4,
                padding     : "3px 8px",
                fontSize    : 11,
                fontFamily  : "monospace",
                outline     : "none",
              }}
            />
          </div>

          {err && (
            <div style={{ padding: "6px 14px", color: RD, fontSize: 11 }}>
              ERROR: {err}
            </div>
          )}

          <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: DIM, fontSize: 11, padding: "12px 14px" }}>
                No contacts{filter !== "ALL" ? ` matching filter: ${filter}` : ""}{sq ? ` for "${search}"` : ""}.
              </div>
            )}
            {visible.map((row, i) => {
              const c    = row.contact;
              const meta = STATUS_META[row.status];
              const name = c.name || c.vessel_name || c.mmsi || `Contact #${i + 1}`;
              const kind = c.type || c.category || c.class || "";
              const alLabel  = row.matchedAlert
                ? (row.matchedAlert.title || row.matchedAlert.name || row.matchedAlert.message || "Alert")
                : null;
              const invLabel = row.matchedInvestigation
                ? (row.matchedInvestigation.title || row.matchedInvestigation.name || "Investigation")
                : null;
              const alSev    = row.matchedAlert?.severity || row.matchedAlert?.level || "";
              const invStatus = row.matchedInvestigation?.status || "";
              return (
                <div
                  key={i}
                  style={{
                    padding     : "6px 14px",
                    borderBottom: `1px solid ${CY}11`,
                    display     : "flex",
                    gap         : 10,
                    alignItems  : "flex-start",
                  }}
                >
                  <span style={{
                    minWidth     : 162,
                    fontSize     : 9,
                    color        : meta.col,
                    fontWeight   : 700,
                    letterSpacing: "0.06em",
                    paddingTop   : 1,
                  }}>
                    {meta.label}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "#E8EEF6", fontSize: 11, fontWeight: 600 }}>
                      {name}
                      {kind && (
                        <span style={{ color: DIM, fontWeight: 400, marginLeft: 6, fontSize: 10 }}>
                          [{kind}]
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                      {alLabel && (
                        <span style={{ color: AM, fontSize: 9, background: `${AM}12`, borderRadius: 3, padding: "1px 5px" }}>
                          ALERT: {alLabel}{alSev ? ` [${alSev}]` : ""} ×{row.alertScore}
                        </span>
                      )}
                      {invLabel && (
                        <span style={{ color: CY, fontSize: 9, background: `${CY}12`, borderRadius: 3, padding: "1px 5px" }}>
                          CASE: {invLabel}{invStatus ? ` [${invStatus}]` : ""} ×{row.investigationScore}
                        </span>
                      )}
                      {!alLabel && !invLabel && (
                        <span style={{ color: RD, fontSize: 9, background: `${RD}12`, borderRadius: 3, padding: "1px 5px" }}>
                          NO ALERT OR INVESTIGATION COVERAGE
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{
            padding   : "4px 14px",
            borderTop : `1px solid ${CY}22`,
            color     : DIM,
            fontSize  : 9,
            flexShrink: 0,
          }}>
            /v1/acoustic/contacts × /v1/ops/alerts × /v1/investigations | poll {POLL_MS / 1000}s | F751
          </div>
        </div>
      )}
    </>
  );
}
