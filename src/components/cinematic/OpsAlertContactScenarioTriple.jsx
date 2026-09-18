/**
 * F750 — Ops Alert × Contact × Scenario Triple Nexus (OACSTRI)
 * Endpoints: /v1/ops/alerts  ×  /entities/Contact  ×  /v1/scenario/list
 * Classification: FULLY_COVERED | CONTACT_ONLY | SCENARIO_ONLY | DARK
 *
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useState, useEffect, useCallback, useRef } from "react";

const CY  = "#29E7FF";
const AM  = "#FFB347";
const GN  = "#39FF14";
const RD  = "#FF4444";
const DIM = "#8899AA";

const BTN_LEFT = 916_060;
const POLL_MS  = 90_000;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const OACSTRI_RE =
  /\b(oacstri|ops\s+alert\s+contact\s+scenario|alert\s+contact\s+scenario|ops\s+triple|ops\s+alert\s+scenario\s+contact|alert\s+covered\s+contacts|scenario\s+ops\s+alert|contact\s+ops\s+scenario|unplanned\s+ops\s+contact|alert\s+coverage\s+triple)\b/i;

export function isOacstriQuery(t) {
  return OACSTRI_RE.test(t || "");
}

function apiBase() {
  return (
    (typeof window !== "undefined" && window.__JARVIS_API_BASE__) ||
    import.meta.env?.VITE_API_BASE ||
    ""
  );
}

function normaliseAlerts(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.alerts))  return raw.alerts;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.items))   return raw.items;
  return [];
}

function normaliseContacts(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw)
    ? raw
    : raw.contacts || raw.data || raw.items || [];
  return arr.filter(Boolean);
}

function normaliseScenarios(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.scenarios)) return raw.scenarios;
  if (raw && Array.isArray(raw.data))      return raw.data;
  if (raw && Array.isArray(raw.items))     return raw.items;
  return [];
}

function keywords(obj) {
  return [
    obj.name, obj.title, obj.description, obj.label,
    obj.type, obj.category, obj.kind, obj.summary,
    obj.tags, obj.role, obj.source, obj.target,
    obj.message, obj.subject, obj.topic, obj.org,
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

function buildNexus(alerts, contacts, scenarios) {
  return alerts.map(alert => {
    const aKw = keywords(alert);

    const bestContact = contacts.reduce(
      (best, c) => {
        const s = scoreMatch(aKw, keywords(c));
        return s > best.score ? { score: s, c } : best;
      },
      { score: 0, c: null },
    );

    const bestScenario = scenarios.reduce(
      (best, sc) => {
        const s = scoreMatch(aKw, keywords(sc));
        return s > best.score ? { score: s, sc } : best;
      },
      { score: 0, sc: null },
    );

    const hasContact  = bestContact.score  > 0;
    const hasScenario = bestScenario.score > 0;

    const status =
      hasContact && hasScenario ? "FULLY_COVERED"   :
      hasContact                ? "CONTACT_ONLY"    :
      hasScenario               ? "SCENARIO_ONLY"   :
                                  "DARK";

    return {
      alert,
      matchedContact  : hasContact  ? bestContact.c   : null,
      matchedScenario : hasScenario ? bestScenario.sc : null,
      contactScore    : bestContact.score,
      scenarioScore   : bestScenario.score,
      status,
    };
  });
}

async function fetchAll() {
  const base = apiBase();
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const [aRaw, cRaw, sRaw] = await Promise.all([
    fetch(`${base}/v1/ops/alerts`, { headers: hdr })
      .then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`${base}/entities/Contact`, { headers: hdr })
      .then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`${base}/v1/scenario/list`, { headers: hdr })
      .then(r => r.ok ? r.json() : []).catch(() => []),
  ]);
  return {
    alerts    : normaliseAlerts(aRaw),
    contacts  : normaliseContacts(cRaw),
    scenarios : normaliseScenarios(sRaw),
  };
}

export async function buildOacstriScript() {
  try {
    const { alerts, contacts, scenarios } = await fetchAll();
    if (!alerts.length) return "No ops alerts found for triple nexus analysis, sir.";
    const nexus   = buildNexus(alerts, contacts, scenarios);
    const fully   = nexus.filter(r => r.status === "FULLY_COVERED").length;
    const cntOnly = nexus.filter(r => r.status === "CONTACT_ONLY").length;
    const scnOnly = nexus.filter(r => r.status === "SCENARIO_ONLY").length;
    const dark    = nexus.filter(r => r.status === "DARK").length;
    const cov     = alerts.length
      ? Math.round((fully / alerts.length) * 100) : 0;
    const darkAlerts = nexus
      .filter(r => r.status === "DARK")
      .slice(0, 3)
      .map(r => r.alert.title || r.alert.name || r.alert.message || "Unnamed alert")
      .join("; ");
    return (
      `Ops Alert Contact Scenario Triple Nexus: ${alerts.length} ops alerts cross-referenced ` +
      `against ${contacts.length} contacts and ${scenarios.length} scenarios. ` +
      `${fully} fully covered (contact + scenario match). ` +
      `${cntOnly} contact only. ${scnOnly} scenario only. ` +
      `${dark} dark — no contact or scenario coverage${darkAlerts ? `: ${darkAlerts}` : ""}. ` +
      `Overall coverage: ${cov}%. Dark alerts represent unowned, unplanned operational gaps.`
    );
  } catch {
    return "Ops Alert Contact Scenario Triple Nexus data unavailable.";
  }
}

const STATUS_META = {
  FULLY_COVERED  : { label: "FULLY COVERED",  col: GN  },
  CONTACT_ONLY   : { label: "CONTACT ONLY",   col: CY  },
  SCENARIO_ONLY  : { label: "SCENARIO ONLY",  col: AM  },
  DARK           : { label: "DARK",           col: RD  },
};

export default function OpsAlertContactScenarioTriple() {
  const [open,    setOpen]    = useState(false);
  const [rows,    setRows]    = useState([]);
  const [counts,  setCounts]  = useState({
    FULLY_COVERED: 0, CONTACT_ONLY: 0, SCENARIO_ONLY: 0, DARK: 0,
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
      const { alerts, contacts, scenarios } = await fetchAll();
      const nexus = buildNexus(alerts, contacts, scenarios);
      setRows(nexus);
      setCounts({
        FULLY_COVERED  : nexus.filter(r => r.status === "FULLY_COVERED").length,
        CONTACT_ONLY   : nexus.filter(r => r.status === "CONTACT_ONLY").length,
        SCENARIO_ONLY  : nexus.filter(r => r.status === "SCENARIO_ONLY").length,
        DARK           : nexus.filter(r => r.status === "DARK").length,
      });
    } catch (e) {
      setErr(e.message || "Fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:oacstri-toggle", toggle);
    return () => window.removeEventListener("jarvis:oacstri-toggle", toggle);
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
    const a = r.alert;
    const label = (a.title || a.name || a.message || "").toLowerCase();
    return label.includes(sq);
  });

  const cov = rows.length
    ? Math.round((counts.FULLY_COVERED / rows.length) * 100) : 0;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position    : "fixed",
          bottom      : 8,
          left        : BTN_LEFT,
          zIndex      : 609,
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
        title="Ops Alert × Contact × Scenario Triple Nexus (F750)"
      >
        OACSTRI
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
            zIndex       : 609,
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
              OPS ALERT × CONTACT × SCENARIO — TRIPLE NEXUS
            </span>
            <span style={{ color: DIM, fontSize: 10, marginLeft: "auto" }}>F750</span>
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
              { label: "ALERTS",        val: rows.length,         col: CY },
              { label: "COVERAGE",      val: `${cov}%`,           col: GN },
              { label: "FULLY COVERED", val: counts.FULLY_COVERED, col: GN },
              { label: "DARK",          val: counts.DARK,          col: RD },
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
              placeholder="Search alerts…"
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
                No alerts{filter !== "ALL" ? ` matching filter: ${filter}` : ""}{sq ? ` for "${search}"` : ""}.
              </div>
            )}
            {visible.map((row, i) => {
              const a    = row.alert;
              const meta = STATUS_META[row.status];
              const name = a.title || a.name || a.message || `Alert #${i + 1}`;
              const sev  = a.severity || a.level || a.type || "";
              const cntLabel = row.matchedContact
                ? (row.matchedContact.name || row.matchedContact.email || "Contact")
                : null;
              const scnLabel = row.matchedScenario
                ? (row.matchedScenario.name || row.matchedScenario.title || "Scenario")
                : null;
              const cntRole  = row.matchedContact?.role  || row.matchedContact?.org   || "";
              const scnKind  = row.matchedScenario?.kind || row.matchedScenario?.category || "";
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
                    minWidth     : 148,
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
                      {sev && (
                        <span style={{ color: DIM, fontWeight: 400, marginLeft: 6, fontSize: 10 }}>
                          [{sev}]
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                      {cntLabel && (
                        <span style={{ color: CY, fontSize: 9, background: `${CY}12`, borderRadius: 3, padding: "1px 5px" }}>
                          CNT: {cntLabel}{cntRole ? ` [${cntRole}]` : ""} ×{row.contactScore}
                        </span>
                      )}
                      {scnLabel && (
                        <span style={{ color: AM, fontSize: 9, background: `${AM}12`, borderRadius: 3, padding: "1px 5px" }}>
                          SCN: {scnLabel}{scnKind ? ` [${scnKind}]` : ""} ×{row.scenarioScore}
                        </span>
                      )}
                      {!cntLabel && !scnLabel && (
                        <span style={{ color: RD, fontSize: 9, background: `${RD}12`, borderRadius: 3, padding: "1px 5px" }}>
                          NO CONTACT OR SCENARIO COVERAGE
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
            /v1/ops/alerts × /entities/Contact × /v1/scenario/list | poll {POLL_MS / 1000}s | F750
          </div>
        </div>
      )}
    </>
  );
}
