/**
 * ContactScenarioCoverage — F79 (CSCO)
 *
 * Parallel-fetches /entities/Contact + /v1/scenario/list every 90 s.
 * Keyword-correlates each contact against the live scenario catalog.
 * Classification: ENGAGED (≥1 matching scenario) vs OFF_PLAN (0 scenarios).
 * Amber badge on off-plan count.
 *
 * Voice intents: "contact scenario / scenario contact / csco / engaged contacts /
 *                off-plan contacts / contact coverage / who is in scenarios /
 *                contact scenario coverage / scenario engagement"
 * Strip button: ◈ CSCO  left:2220 bottom:18 zIndex:68
 * Custom event: jarvis:csco-toggle
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const AMB = "#FFD700";
const GRN = "#00E5A0";
const POLL = 90_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
const hdrs = { Authorization: `Bearer ${API_KEY}` };

const CSCO_RE =
  /\b(contact.scenario|scenario.contact|csco|engaged.contact|off.plan.contact|contact.cover|who.is.in.scenario|contact.scenario.cover|scenario.engagement|contact.engage|which.contact.*scenario|scenario.contact.cover)\b/i;

export function isCscoQuery(t) { return CSCO_RE.test(t || ""); }

function tokenize(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function relevance(contact, scenario) {
  const a = tokenize([
    contact.name, contact.role, contact.organization,
    contact.description, (contact.tags || []).join(" "),
  ].join(" "));
  const b = tokenize([
    scenario.name, scenario.description, scenario.objective,
    scenario.type, (scenario.tags || []).join(" "),
  ].join(" "));
  const setB = new Set(b);
  const hits = a.filter(w => setB.has(w)).length;
  return hits / Math.max(a.length, 1);
}

async function fetchAll() {
  const base = apiBase();
  const [cr, sr] = await Promise.all([
    fetch(`${base}/entities/Contact`,      { headers: hdrs }),
    fetch(`${base}/v1/scenario/list`,      { headers: hdrs }),
  ]);
  const cd = cr.ok ? await cr.json() : {};
  const sd = sr.ok ? await sr.json() : {};

  const contacts = (Array.isArray(cd) ? cd : cd?.data || cd?.items || cd?.results || cd?.contacts || []).map(c => ({
    id:           c.id || c._id || String(Math.random()),
    name:         c.name || c.full_name || "Unknown Contact",
    role:         c.role || c.title || "",
    organization: c.organization || c.company || c.org || "",
    description:  c.description || c.bio || c.notes || "",
    tags:         c.tags || [],
  }));

  const scenarios = (Array.isArray(sd) ? sd : sd?.data || sd?.items || sd?.results || sd?.scenarios || []).map(s => ({
    id:          s.id || s._id || String(Math.random()),
    name:        s.name || s.title || "Unnamed Scenario",
    description: s.description || s.summary || "",
    objective:   s.objective || s.goal || "",
    type:        s.type || s.scenario_type || "",
    status:      s.status || s.state || "",
    tags:        s.tags || [],
  }));

  return { contacts, scenarios };
}

export async function buildCscoScript() {
  try {
    const { contacts, scenarios } = await fetchAll();
    if (!contacts.length) return "No contacts found for scenario coverage analysis, sir.";
    const offPlan = contacts.filter(c =>
      !scenarios.some(s => relevance(c, s) > 0.03)
    );
    const engaged = contacts.length - offPlan.length;
    return (
      `Contact × Scenario Coverage: ${contacts.length} contacts checked against ${scenarios.length} active scenarios. ` +
      `${engaged} ENGAGED (linked to at least one scenario), ${offPlan.length} OFF_PLAN (no scenario coverage). ` +
      (offPlan.length
        ? `Off-plan contacts include: ${offPlan.slice(0, 3).map(c => `"${c.name}"`).join(", ")}. ` +
          `Analyse the scenario engagement gap and recommend which contacts should be assigned to active scenarios in exactly 2 sentences.`
        : "All contacts are engaged with active scenarios. Excellent scenario coverage, sir.")
    );
  } catch {
    return "Unable to retrieve contact scenario coverage data at this time, sir.";
  }
}

export default function ContactScenarioCoverage() {
  const [open, setOpen]         = useState(false);
  const [contacts, setContacts] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [correlated, setCorrelated] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [filter, setFilter]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessed, setAssessed] = useState("");
  const [assessing, setAssessing] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { contacts: cs, scenarios: ss } = await fetchAll();
      setContacts(cs);
      setScenarios(ss);
      const cor = cs.map(c => {
        const matched = ss
          .map(s => ({ ...s, score: relevance(c, s) }))
          .filter(s => s.score > 0.03)
          .sort((a, b) => b.score - a.score);
        return { ...c, matched, status: matched.length ? "ENGAGED" : "OFF_PLAN" };
      });
      setCorrelated(cor);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => {
      setOpen(o => { if (!o) load(); return !o; });
    };
    window.addEventListener("jarvis:csco-toggle", toggle);
    return () => window.removeEventListener("jarvis:csco-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timer.current = setInterval(load, POLL);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = await buildCscoScript();
      setAssessed(script);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } finally {
      setAssessing(false);
    }
  }, []);

  const visible = correlated.filter(c => {
    if (filter === "ENGAGED"  && c.status !== "ENGAGED")  return false;
    if (filter === "OFF_PLAN" && c.status !== "OFF_PLAN") return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) &&
        !c.role.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const engaged  = correlated.filter(c => c.status === "ENGAGED").length;
  const offPlan  = correlated.filter(c => c.status === "OFF_PLAN").length;

  const PANEL = {
    position: "fixed", bottom: 58, left: 2220, zIndex: 69,
    width: 440, maxHeight: "70vh", display: "flex", flexDirection: "column",
    background: "linear-gradient(160deg,#06111B 80%,#0B1D2A)",
    border: `1px solid ${CY}44`, borderRadius: 10,
    boxShadow: `0 0 32px ${CY}22`, fontFamily: "'JetBrains Mono',monospace",
    overflow: "hidden",
  };

  return (
    <>
      {/* Strip button */}
      <button
        onClick={() => { setOpen(o => { if (!o) load(); return !o; }); }}
        style={{
          position: "fixed", left: 2220, bottom: 18, zIndex: 68,
          background: open ? `${CY}22` : "transparent",
          border: `1px solid ${CY}55`, borderRadius: 5,
          color: CY, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 1.5, padding: "3px 9px",
          cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
        }}
      >
        ◈ CSCO
        {offPlan > 0 && (
          <span style={{
            background: AMB, color: "#000", borderRadius: 3,
            fontSize: 8, padding: "0 4px", fontWeight: 700,
          }}>{offPlan}</span>
        )}
      </button>

      {open && (
        <div style={PANEL}>
          {/* Header */}
          <div style={{
            padding: "10px 14px 8px", borderBottom: `1px solid ${CY}22`,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontSize: 10, color: CY, letterSpacing: 2, fontWeight: 700 }}>
              CONTACT × SCENARIO COVERAGE
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#566878",
              fontSize: 12, cursor: "pointer",
            }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 6, padding: "8px 14px", borderBottom: `1px solid ${CY}18`,
          }}>
            {[
              { label: "CONTACTS",  val: correlated.length, col: CY },
              { label: "SCENARIOS", val: scenarios.length,  col: "#B485FF" },
              { label: "ENGAGED",   val: engaged,           col: GRN },
              { label: "OFF_PLAN",  val: offPlan,           col: AMB },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                background: `${col}0D`, border: `1px solid ${col}33`,
                borderRadius: 6, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ fontSize: 14, color: col, fontWeight: 700 }}>{val}</div>
                <div style={{ fontSize: 7, color: "#566878", letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{
            display: "flex", gap: 4, padding: "6px 14px", borderBottom: `1px solid ${CY}18`,
            flexWrap: "wrap",
          }}>
            {["ALL", "ENGAGED", "OFF_PLAN"].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                fontSize: 8, padding: "2px 8px", borderRadius: 3, letterSpacing: 1,
                border: `1px solid ${filter === f ? CY : "#2A3D4F"}`,
                background: filter === f ? `${CY}22` : "transparent",
                color: filter === f ? CY : "#566878", cursor: "pointer", fontFamily: "inherit",
              }}>{f}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                marginLeft: "auto", fontSize: 8, background: "#0B1D2A",
                border: `1px solid ${CY}33`, borderRadius: 3, color: CY,
                padding: "2px 7px", fontFamily: "inherit", outline: "none", width: 100,
              }}
            />
          </div>

          {/* Contact rows */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px" }}>
            {loading && !correlated.length && (
              <div style={{ color: AMB, fontSize: 9, textAlign: "center", padding: 20 }}>
                ◌ loading…
              </div>
            )}
            {visible.map(c => {
              const isExp = expanded === c.id;
              const col = c.status === "ENGAGED" ? GRN : AMB;
              return (
                <div key={c.id} style={{ borderBottom: `1px solid ${CY}11`, padding: "7px 0" }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : c.id)}
                    style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                  >
                    <span style={{
                      fontSize: 8, color: col, border: `1px solid ${col}55`,
                      borderRadius: 3, padding: "1px 5px", letterSpacing: 1, flexShrink: 0,
                      animation: c.status === "OFF_PLAN" ? "cscopulse 2s infinite" : "none",
                    }}>{c.status}</span>
                    <span style={{
                      flex: 1, color: "#DCEBF5", fontSize: 10, fontWeight: 600,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{c.name}</span>
                    {c.role && (
                      <span style={{
                        fontSize: 7, color: "#B485FF", border: "1px solid #B485FF44",
                        borderRadius: 3, padding: "1px 4px", flexShrink: 0,
                      }}>{c.role.toUpperCase()}</span>
                    )}
                    {c.organization && (
                      <span style={{ color: "#566878", fontSize: 8, flexShrink: 0 }}>
                        {c.organization}
                      </span>
                    )}
                    <span style={{ color: "#566878", fontSize: 10, flexShrink: 0 }}>
                      {isExp ? "▲" : "▼"}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 6, paddingLeft: 8 }}>
                      {c.description && (
                        <div style={{ color: "#8BAABB", fontSize: 8, marginBottom: 6, lineHeight: 1.5 }}>
                          {c.description.slice(0, 160)}{c.description.length > 160 ? "…" : ""}
                        </div>
                      )}
                      {c.matched.length === 0 ? (
                        <div style={{ color: AMB, fontSize: 8 }}>No matching scenarios found.</div>
                      ) : (
                        c.matched.slice(0, 5).map(s => (
                          <div key={s.id} style={{
                            background: `${GRN}08`, border: `1px solid ${GRN}22`,
                            borderRadius: 5, padding: "5px 8px", marginBottom: 5,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                              {s.type && (
                                <span style={{
                                  fontSize: 7, color: "#B485FF",
                                  border: "1px solid #B485FF44",
                                  borderRadius: 3, padding: "1px 4px", flexShrink: 0,
                                }}>{s.type.toUpperCase()}</span>
                              )}
                              {s.status && (
                                <span style={{
                                  fontSize: 7, color: CY,
                                  border: `1px solid ${CY}44`,
                                  borderRadius: 3, padding: "1px 4px", flexShrink: 0,
                                }}>{s.status.toUpperCase()}</span>
                              )}
                              <span style={{
                                flex: 1, color: "#DCEBF5", fontSize: 10, fontWeight: 600,
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              }}>{s.name}</span>
                              <span style={{ color: GRN, fontSize: 9, flexShrink: 0 }}>
                                {(s.score * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div style={{ height: 3, background: "#1A2530", borderRadius: 2 }}>
                              <div style={{
                                height: 3, borderRadius: 2,
                                width: `${Math.min(100, s.score * 100)}%`,
                                background: GRN, boxShadow: `0 0 6px ${GRN}`,
                              }} />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Assess footer */}
          <div style={{
            padding: "8px 14px", borderTop: `1px solid ${CY}18`,
            display: "flex", flexDirection: "column", gap: 6,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 8, color: "#566878" }}>
                Source: /entities/Contact + /v1/scenario/list
              </span>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ color: loading ? AMB : GRN, fontSize: 8 }}>
                  {loading ? "◌ syncing" : `${correlated.length} contacts · ${scenarios.length} scenarios`}
                </span>
                <button
                  onClick={assess}
                  disabled={assessing}
                  style={{
                    fontSize: 9, padding: "3px 9px", borderRadius: 4,
                    border: `1px solid ${CY}66`,
                    background: assessing ? `${CY}22` : "transparent",
                    color: assessing ? AMB : CY,
                    cursor: assessing ? "default" : "pointer",
                    fontFamily: "inherit", letterSpacing: 1,
                  }}>
                  {assessing ? "◌ ASSESSING…" : "▶ ASSESS"}
                </button>
              </div>
            </div>
            {assessed && (
              <div style={{
                fontSize: 10, color: "#DCEBF5", background: `${CY}0A`,
                border: `1px solid ${CY}33`, borderRadius: 6, padding: "8px 10px",
                maxHeight: 90, overflowY: "auto", lineHeight: 1.6,
              }}>{assessed}</div>
            )}
          </div>
        </div>
      )}
      <style>{`@keyframes cscopulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </>
  );
}
