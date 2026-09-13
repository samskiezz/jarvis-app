/**
 * F697 — Acoustic × Intel Profile × Scenario Triple Nexus (ACIPSCN)
 * Three-way cross-reference: /v1/acoustic/contacts × /entities/IntelProfile × /v1/scenario/list.
 * Each acoustic contact is classified:
 *   FULLY_PLANNED   — matches ≥1 intel profile AND ≥1 scenario
 *   INTEL_ONLY      — intel profile match but no scenario coverage
 *   SCENARIO_ONLY   — scenario match but no intel profile
 *   DARK            — neither (no intel or scenario coverage)
 * Coverage % tile = FULLY_PLANNED / total contacts.
 * Tabs: ALL / FULLY_PLANNED / INTEL_ONLY / SCENARIO_ONLY / DARK + search.
 * Click-to-expand shows matched intel profiles + matched scenarios per contact.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-second auto-refresh. Event: jarvis:acipscn-toggle.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 150_100;
const Z_INDEX  = 233;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const ACIPSCN_RE = /\b(acipscn|acoustic\s+intel\s+scenario|intel\s+scenario\s+acoustic|acoustic\s+profile\s+scenario|sensor\s+intel\s+plan|acoustic\s+threat\s+plan|contact\s+intel\s+scenario|acoustic\s+scenario\s+intel)\b/i;

export function isAcipscnQuery(q) { return ACIPSCN_RE.test(q); }

const THREAT_COLOR = {
  CRITICAL: "#ff2244",
  HIGH:     "#ff6600",
  MEDIUM:   "#ffcc00",
  LOW:      "#00e5a0",
  default:  "#667",
};
const KIND_COLOR = {
  military:    "#ff2244",
  economic:    "#00e5a0",
  intelligence:"#29E7FF",
  cyber:       "#aa88ff",
  default:     "#667",
};

// ── helpers ──────────────────────────────────────────────────────────────────

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3);
}

function overlap(a, b) {
  const setA = new Set(keywords(a));
  return keywords(b).filter(w => setA.has(w)).length;
}

function normaliseContacts(raw) {
  if (Array.isArray(raw))           return raw;
  if (Array.isArray(raw?.contacts)) return raw.contacts;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.data))     return raw.data;
  return [];
}

function normaliseProfiles(raw) {
  if (Array.isArray(raw))          return raw;
  if (Array.isArray(raw?.items))   return raw.items;
  if (Array.isArray(raw?.data))    return raw.data;
  if (Array.isArray(raw?.results)) return raw.results;
  return [];
}

function normaliseScenarios(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.scenarios))   return raw.scenarios;
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.data))        return raw.data;
  return [];
}

function contactText(c) {
  return [c.name, c.callsign, c.id, c.type, c.classification, c.vessel_type, c.description]
    .filter(Boolean).join(" ");
}

function crossRef(contacts, profiles, scenarios) {
  return contacts.map(c => {
    const ct = contactText(c);
    const matchedProfiles = profiles.filter(p => {
      const pt = [p.name, p.alias, p.actor_type, p.description, p.tags].filter(Boolean).join(" ");
      return overlap(ct, pt) > 0;
    }).map(p => ({
      ...p,
      hits: overlap(ct, [p.name, p.alias, p.description].filter(Boolean).join(" ")),
    }));
    const matchedScenarios = scenarios.filter(s => {
      const st = [s.name, s.title, s.description, s.kind, s.tags].filter(Boolean).join(" ");
      return overlap(ct, st) > 0;
    }).map(s => ({
      ...s,
      hits: overlap(ct, [s.name, s.title, s.description].filter(Boolean).join(" ")),
    }));
    const hasIntel    = matchedProfiles.length > 0;
    const hasScenario = matchedScenarios.length > 0;
    const tier =
      hasIntel && hasScenario ? "FULLY_PLANNED" :
      hasIntel                ? "INTEL_ONLY"    :
      hasScenario             ? "SCENARIO_ONLY" :
                                "DARK";
    return { ...c, tier, matchedProfiles, matchedScenarios };
  });
}

// ── exported brain helpers ────────────────────────────────────────────────────

export async function buildAcipscnScript() {
  try {
    const base = apiBase();
    const [cr, pr, sr] = await Promise.all([
      fetch(`${base}/v1/acoustic/contacts`,  { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/entities/IntelProfile`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/v1/scenario/list`,      { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const contacts  = normaliseContacts(await cr.json());
    const profiles  = normaliseProfiles(await pr.json());
    const scenarios = normaliseScenarios(await sr.json());
    const rows      = crossRef(contacts, profiles, scenarios);
    const fully     = rows.filter(r => r.tier === "FULLY_PLANNED").length;
    const intelOnly = rows.filter(r => r.tier === "INTEL_ONLY").length;
    const scnOnly   = rows.filter(r => r.tier === "SCENARIO_ONLY").length;
    const dark      = rows.filter(r => r.tier === "DARK").length;
    const total     = rows.length;
    const pct       = total ? Math.round((fully / total) * 100) : 0;

    const briefResp = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `JARVIS acoustic intel-scenario coverage: ${total} contacts total. ${fully} fully planned (intel + scenario), ${intelOnly} intel only, ${scnOnly} scenario only, ${dark} dark. Give a 2-sentence operational assessment of threat coverage gaps.`,
      }),
    });
    const brief = ((await briefResp.json()).answer || "").trim();
    return brief || `Acoustic intel-scenario coverage: ${pct}% fully planned. ${dark} contacts remain dark — no intel profile or response scenario.`;
  } catch {
    return "Acoustic intel-scenario nexus is temporarily unreachable, sir.";
  }
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "FULLY_PLANNED", "INTEL_ONLY", "SCENARIO_ONLY", "DARK"];
const TAB_LABEL = {
  ALL: "ALL", FULLY_PLANNED: "FULL", INTEL_ONLY: "INTEL", SCENARIO_ONLY: "SCENARIO", DARK: "DARK",
};
const TIER_COLOR = {
  FULLY_PLANNED: "#00e5a0",
  INTEL_ONLY:    "#29E7FF",
  SCENARIO_ONLY: "#aa88ff",
  DARK:          "#ff4444",
};

export default function AcousticIntelProfileScenarioTriple() {
  const [open,     setOpen]     = useState(false);
  const [rows,     setRows]     = useState([]);
  const [tab,      setTab]      = useState("ALL");
  const [search,   setSearch]   = useState("");
  const [loading,  setLoading]  = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [assessing,setAssessing]= useState(false);
  const [brief,    setBrief]    = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const [cr, pr, sr] = await Promise.all([
        fetch(`${base}/v1/acoustic/contacts`,  { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/entities/IntelProfile`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/v1/scenario/list`,      { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const contacts  = normaliseContacts(await cr.json());
      const profiles  = normaliseProfiles(await pr.json());
      const scenarios = normaliseScenarios(await sr.json());
      setRows(crossRef(contacts, profiles, scenarios));
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const toggle = () => setOpen(o => { if (!o) { load(); } return !o; });
    window.addEventListener("jarvis:acipscn-toggle", toggle);
    return () => window.removeEventListener("jarvis:acipscn-toggle", toggle);
  }, [load]);

  const fully     = rows.filter(r => r.tier === "FULLY_PLANNED").length;
  const intelOnly = rows.filter(r => r.tier === "INTEL_ONLY").length;
  const scnOnly   = rows.filter(r => r.tier === "SCENARIO_ONLY").length;
  const dark      = rows.filter(r => r.tier === "DARK").length;
  const total     = rows.length;
  const pct       = total ? Math.round((fully / total) * 100) : 0;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r.tier !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      const ct = contactText(r).toLowerCase();
      if (!ct.includes(s)) return false;
    }
    return true;
  });

  async function assess() {
    setAssessing(true); setBrief("");
    const text = await buildAcipscnScript();
    setBrief(text);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const CY = "#29E7FF";
  const BG = "rgba(5,8,13,0.96)";

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      title="Acoustic × Intel Profile × Scenario Triple (ACIPSCN)"
      style={{
        position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
        background: "rgba(5,8,13,0.82)", border: `1px solid ${CY}`,
        color: CY, borderRadius: 6, padding: "3px 9px", fontSize: 11,
        cursor: "pointer", letterSpacing: 1,
      }}
    >
      {dark > 0 && (
        <span style={{ background: "#ff4444", color: "#fff", borderRadius: 9, padding: "1px 5px", fontSize: 10, marginRight: 5 }}>
          {dark}
        </span>
      )}
      ◈ ACIPSCN
    </button>
  );

  return (
    <div style={{
      position: "fixed", left: BTN_LEFT - 360, bottom: 56, zIndex: Z_INDEX,
      width: 720, maxHeight: 540, background: BG, border: `1px solid ${CY}`,
      borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", gap: 10,
      boxShadow: `0 0 24px ${CY}33`, overflowY: "auto", fontFamily: "monospace",
    }}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: CY, fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
          ◈ ACIPSCN — Acoustic × Intel Profile × Scenario
        </span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#667", cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
        {[
          ["CONTACTS", total,     CY],
          ["FULLY PLANNED", fully, "#00e5a0"],
          ["INTEL ONLY", intelOnly,"#29E7FF"],
          ["SCENARIO ONLY", scnOnly,"#aa88ff"],
          ["COVERAGE", `${pct}%`, pct >= 60 ? "#00e5a0" : pct >= 30 ? "#ffcc00" : "#ff4444"],
        ].map(([label, val, color]) => (
          <div key={label} style={{ background: "rgba(41,231,255,0.06)", border: `1px solid ${color}33`, borderRadius: 8, padding: "8px 6px", textAlign: "center" }}>
            <div style={{ color, fontSize: 18, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#667", fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* assess */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? "#223" : "#0a1a22", border: `1px solid ${CY}`, color: CY,
          borderRadius: 6, padding: "4px 12px", fontSize: 11, cursor: "pointer",
        }}>
          {assessing ? "ASSESSING…" : "▶ ASSESS"}
        </button>
        {brief && <span style={{ color: "#aaa", fontSize: 11, flex: 1 }}>{brief}</span>}
      </div>

      {/* tabs + search */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? CY : "rgba(41,231,255,0.08)",
            color: tab === t ? "#04060A" : CY, border: `1px solid ${CY}44`,
            borderRadius: 5, padding: "2px 10px", fontSize: 11, cursor: "pointer",
          }}>
            {TAB_LABEL[t]}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="filter contacts…"
          style={{ flex: 1, minWidth: 120, background: "rgba(255,255,255,0.04)", border: `1px solid #334`, borderRadius: 5, color: "#ccc", padding: "3px 8px", fontSize: 11 }}
        />
      </div>

      {/* rows */}
      {loading && <div style={{ color: "#667", fontSize: 12 }}>Loading…</div>}
      <div style={{ overflowY: "auto", maxHeight: 300, display: "flex", flexDirection: "column", gap: 6 }}>
        {visible.map((r, i) => {
          const isExp = expanded === i;
          const tierColor = TIER_COLOR[r.tier] || "#667";
          return (
            <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${tierColor}33`, borderRadius: 7, padding: "7px 10px" }}>
              <div
                onClick={() => setExpanded(isExp ? null : i)}
                style={{ display: "flex", justifyContent: "space-between", cursor: "pointer", alignItems: "center" }}
              >
                <span style={{ color: "#ddd", fontSize: 12 }}>{r.name || r.callsign || r.id || "Contact"}</span>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ color: tierColor, fontSize: 10, border: `1px solid ${tierColor}55`, borderRadius: 4, padding: "1px 6px" }}>
                    {r.tier.replace("_", " ")}
                  </span>
                  <span style={{ color: "#667", fontSize: 11 }}>{isExp ? "▲" : "▼"}</span>
                </div>
              </div>
              {isExp && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  {/* intel profiles */}
                  {r.matchedProfiles.length > 0 && (
                    <div>
                      <div style={{ color: "#667", fontSize: 10, marginBottom: 4 }}>INTEL PROFILES ({r.matchedProfiles.length})</div>
                      {r.matchedProfiles.slice(0, 4).map((p, j) => (
                        <div key={j} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 3 }}>
                          <span style={{ color: THREAT_COLOR[p.threat_level] || THREAT_COLOR.default, fontSize: 10, border: `1px solid #334`, borderRadius: 3, padding: "1px 5px" }}>
                            {p.threat_level || "UNKNOWN"}
                          </span>
                          <span style={{ color: "#aaa", fontSize: 11 }}>{p.name || p.alias || "Profile"}</span>
                          <span style={{ color: "#667", fontSize: 10 }}>({p.hits} hits)</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* scenarios */}
                  {r.matchedScenarios.length > 0 && (
                    <div>
                      <div style={{ color: "#667", fontSize: 10, marginBottom: 4 }}>SCENARIOS ({r.matchedScenarios.length})</div>
                      {r.matchedScenarios.slice(0, 4).map((s, j) => (
                        <div key={j} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 3 }}>
                          <span style={{ color: KIND_COLOR[s.kind] || KIND_COLOR.default, fontSize: 10, border: `1px solid #334`, borderRadius: 3, padding: "1px 5px" }}>
                            {s.kind || "SCENARIO"}
                          </span>
                          <span style={{ color: "#aaa", fontSize: 11 }}>{s.name || s.title || "Scenario"}</span>
                          <span style={{ color: "#667", fontSize: 10 }}>({s.hits} hits)</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {r.matchedProfiles.length === 0 && r.matchedScenarios.length === 0 && (
                    <div style={{ color: "#ff4444", fontSize: 11 }}>No intelligence profile or scenario coverage.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {visible.length === 0 && !loading && (
          <div style={{ color: "#667", fontSize: 12 }}>No contacts match current filter.</div>
        )}
      </div>
    </div>
  );
}
