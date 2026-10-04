/**
 * F78 – Intel Profile × Scenario × Investigation Intelligence Action Matrix (IPSIMTX)
 * Cross-correlates /entities/IntelProfile × /v1/scenario/list × /v1/investigations.
 * Classifies each intel profile:
 *   FULLY_ACTIVE  – matched by ≥1 scenario AND ≥1 investigation
 *   SCEN_ONLY     – scenario backing but no investigation
 *   INV_ONLY      – investigation backing but no scenario
 *   INACTIVE      – no scenario or investigation backing (intelligence dead weight)
 * INACTIVE rows pulse red.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const BTN_LEFT   = 959620;
const Z          = 660;
const REFRESH_MS = 90_000;

const CY   = "#29E7FF";
const GR   = "#00c878";
const AM   = "#F5A623";
const RD   = "#FF3B3B";
const DIM  = "#3a5060";
const MONO = "'JetBrains Mono', 'Courier New', monospace";
const SANS = "'Inter', system-ui, sans-serif";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
function authHdr() { return { Authorization: `Bearer ${API_KEY}` }; }

function kw(item) {
  return [
    item.name, item.title, item.description,
    item.subject, item.topic, item.category,
    item.type, item.kind, item.tags, item.source,
    item.summary, item.objective, item.notes,
    item.role, item.alias,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function overlap(a, b) {
  const wa = a.split(/\W+/).filter(w => w.length > 3);
  const wb = new Set(b.split(/\W+/).filter(w => w.length > 3));
  return wa.filter(w => wb.has(w)).length;
}

function classifyProfile(profile, scenarios, investigations) {
  const pk = kw(profile);
  const matchedScen = scenarios.filter(s => overlap(pk, kw(s)) >= 2);
  const matchedInv  = investigations.filter(i => overlap(pk, kw(i)) >= 2);

  const hasScen = matchedScen.length > 0;
  const hasInv  = matchedInv.length > 0;
  let cls;
  if (hasScen && hasInv)   cls = "FULLY_ACTIVE";
  else if (hasScen)        cls = "SCEN_ONLY";
  else if (hasInv)         cls = "INV_ONLY";
  else                     cls = "INACTIVE";

  return {
    id: profile.id || profile.name || Math.random().toString(36).slice(2),
    profile,
    cls,
    matchedScen: matchedScen.slice(0, 5).map(s => ({
      name:  s.name || s.title || s.description || "?",
      score: overlap(pk, kw(s)),
    })),
    matchedInv: matchedInv.slice(0, 5).map(i => ({
      name:  i.title || i.name || i.description || "?",
      score: overlap(pk, kw(i)),
    })),
  };
}

async function loadAll(base) {
  const [pr, sr, ir] = await Promise.allSettled([
    fetch(`${base}/entities/IntelProfile`,  { headers: authHdr() }),
    fetch(`${base}/v1/scenario/list`,        { headers: authHdr() }),
    fetch(`${base}/v1/investigations`,       { headers: authHdr() }),
  ]);
  const parse = async (r, key) => {
    if (r.status !== "fulfilled" || !r.value.ok) return [];
    const d = await r.value.json();
    return Array.isArray(d) ? d : d.data || d.items || d[key] || [];
  };
  const [profiles, scenarios, investigations] = await Promise.all([
    parse(pr, "profiles"),
    parse(sr, "scenarios"),
    parse(ir, "investigations"),
  ]);
  return { profiles, scenarios, investigations };
}

// ─── exported helpers for JarvisBrain ────────────────────────────────────────
export function isIpsimtxQuery(q) {
  return /\b(ipsimtx|intel\s+profile\s+action|inactive\s+intel|intel\s+scenario\s+investigation|profile\s+action\s+coverage|dead\s+intel|intel\s+profile\s+backing|intelligence\s+action|intel\s+dead\s+weight)\b/i.test(q);
}

export async function buildIpsimtxScript() {
  const base = apiBase();
  try {
    const { profiles, scenarios, investigations } = await loadAll(base);
    const rows     = profiles.map(p => classifyProfile(p, scenarios, investigations));
    const total    = rows.length;
    const fully    = rows.filter(r => r.cls === "FULLY_ACTIVE").length;
    const scenOnly = rows.filter(r => r.cls === "SCEN_ONLY").length;
    const invOnly  = rows.filter(r => r.cls === "INV_ONLY").length;
    const inactive = rows.filter(r => r.cls === "INACTIVE").length;
    return (
      `Intel Action Matrix: ${total} profiles — ${fully} fully active, ` +
      `${scenOnly} scenario-only, ${invOnly} investigation-only, ` +
      `${inactive} inactive (no scenario or investigation backing). ` +
      (inactive > 0
        ? `${inactive} intel profiles are dead weight — not driving any scenario or investigation.`
        : "All intel profiles are driving active scenarios or investigations.")
    );
  } catch {
    return "Intel Action Matrix: unable to load data.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────
export default function IntelProfileScenarioInvestigationMatrix() {
  const base = apiBase();

  const [rows, setRows]         = useState([]);
  const [scenCount, setScenCount] = useState(0);
  const [invCount, setInvCount] = useState(0);
  const [filter, setFilter]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [open, setOpen]         = useState(false);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { profiles, scenarios, investigations } = await loadAll(base);
      setScenCount(scenarios.length);
      setInvCount(investigations.length);
      setRows(profiles.map(p => classifyProfile(p, scenarios, investigations)));
    } catch {}
  }, [base]);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:ipsimtx-toggle", toggle);
    return () => window.removeEventListener("jarvis:ipsimtx-toggle", toggle);
  }, []);

  const assess = async () => {
    setAssessing(true);
    try {
      const script = await buildIpsimtxScript();
      const voice  = getActiveVoice?.() ?? "ash";
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ text: script, voice }),
      });
    } catch {}
    setAssessing(false);
  };

  const total    = rows.length;
  const fully    = rows.filter(r => r.cls === "FULLY_ACTIVE").length;
  const scenOnly = rows.filter(r => r.cls === "SCEN_ONLY").length;
  const invOnly  = rows.filter(r => r.cls === "INV_ONLY").length;
  const inactive = rows.filter(r => r.cls === "INACTIVE").length;

  const TABS = ["ALL", "FULLY_ACTIVE", "SCEN_ONLY", "INV_ONLY", "INACTIVE"];

  const visible = rows
    .filter(r => filter === "ALL" || r.cls === filter)
    .filter(r => {
      if (!search) return true;
      const t = (r.profile.name || r.profile.title || "").toLowerCase();
      return t.includes(search.toLowerCase());
    });

  function clsColor(c) {
    if (c === "FULLY_ACTIVE") return GR;
    if (c === "SCEN_ONLY")    return AM;
    if (c === "INV_ONLY")     return CY;
    return RD;
  }

  const panel = {
    position: "fixed", bottom: 70, left: "50%", transform: "translateX(-50%)",
    width: 740, maxHeight: "78vh", display: "flex", flexDirection: "column",
    background: "rgba(5,20,35,0.97)", border: "1px solid #1a3a5c",
    borderRadius: 12, zIndex: Z + 1, fontFamily: SANS, color: "#c8e0f0",
    boxShadow: "0 0 40px rgba(0,200,255,0.12)",
    overflowY: "auto",
  };

  const tile = (label, val, col) => (
    <div style={{ textAlign: "center", minWidth: 100 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: col, fontFamily: MONO }}>{val}</div>
      <div style={{ fontSize: 9, color: "#5a8fa8", marginTop: 2, letterSpacing: 1 }}>{label}</div>
    </div>
  );

  return (
    <>
      {/* trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Intel Profile × Scenario × Investigation Action Matrix"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z,
          background: open ? "rgba(245,166,35,0.25)" : "rgba(245,166,35,0.12)",
          border: `1px solid ${open ? AM : "rgba(245,166,35,0.35)"}`,
          borderRadius: 6, padding: "3px 8px", color: open ? AM : "#a07030",
          fontSize: 10, fontFamily: MONO, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        ◈ IPSIMTX
      </button>

      {open && (
        <div style={panel}>
          {/* header */}
          <div style={{
            padding: "14px 18px 10px", borderBottom: "1px solid #1a3a5c",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            position: "sticky", top: 0, background: "rgba(5,20,35,0.99)", zIndex: 2,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, color: AM }}>
              ◈ INTEL PROFILE ACTION MATRIX
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={assess} disabled={assessing} style={{
                background: assessing ? "rgba(0,200,120,0.1)" : "rgba(0,200,120,0.15)",
                border: "1px solid #00c878", borderRadius: 4, color: GR,
                fontSize: 10, padding: "3px 10px", cursor: "pointer", fontFamily: MONO,
              }}>
                {assessing ? "…" : "▶ ASSESS"}
              </button>
              <button onClick={() => setOpen(false)} style={{
                background: "none", border: "none", color: "#5a8fa8",
                fontSize: 16, cursor: "pointer", lineHeight: 1,
              }}>✕</button>
            </div>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 18, padding: "14px 18px", borderBottom: "1px solid #0a2535", justifyContent: "space-between" }}>
            {tile("PROFILES",       total,    CY)}
            {tile("SCENARIOS",      scenCount, AM)}
            {tile("INVESTIGATIONS", invCount,  GR)}
            {tile("FULLY ACTIVE",   fully,    "#00ff88")}
            <div style={{ textAlign: "center", minWidth: 100, position: "relative" }}>
              <div style={{
                fontSize: 22, fontWeight: 700, color: RD, fontFamily: MONO,
                animation: inactive > 0 ? "pulse-red 1.4s infinite" : "none",
              }}>{inactive}</div>
              <div style={{ fontSize: 9, color: "#5a8fa8", marginTop: 2, letterSpacing: 1 }}>INACTIVE</div>
            </div>
          </div>

          {/* filter tabs + search */}
          <div style={{ display: "flex", gap: 6, padding: "8px 18px", borderBottom: "1px solid #0a2535", alignItems: "center", flexWrap: "wrap" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setFilter(t)} style={{
                background: filter === t ? "rgba(245,166,35,0.15)" : "rgba(245,166,35,0.05)",
                border: `1px solid ${filter === t ? AM : "#1a3a5c"}`,
                borderRadius: 4, color: filter === t ? AM : "#5a8fa8",
                fontSize: 9, padding: "2px 8px", cursor: "pointer", fontFamily: MONO,
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search profile name…"
              style={{
                marginLeft: "auto", background: "rgba(245,166,35,0.06)",
                border: "1px solid #1a3a5c", borderRadius: 4, color: "#c8e0f0",
                fontSize: 10, padding: "3px 8px", fontFamily: SANS, outline: "none", width: 180,
              }}
            />
          </div>

          {/* rows */}
          <div style={{ padding: "8px 18px 18px" }}>
            {visible.length === 0 ? (
              <div style={{ color: DIM, fontSize: 11, padding: "20px 0", textAlign: "center" }}>
                {rows.length === 0 ? "Loading…" : "No matches."}
              </div>
            ) : visible.map(row => {
              const isExpanded = expanded === row.id;
              const color  = clsColor(row.cls);
              const name   = row.profile.name || row.profile.title || row.profile.id || "Profile";
              return (
                <div key={row.id} style={{ marginBottom: 4, borderRadius: 6, overflow: "hidden", border: "1px solid #0d2a40" }}>
                  <div
                    onClick={() => setExpanded(isExpanded ? null : row.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 12px", cursor: "pointer",
                      background: isExpanded ? "rgba(245,166,35,0.06)" : "transparent",
                    }}
                  >
                    <span style={{
                      fontSize: 9, fontFamily: MONO, color, minWidth: 120,
                      animation: row.cls === "INACTIVE" ? "pulse-red 1.4s infinite" : "none",
                    }}>{row.cls}</span>
                    <span style={{ fontSize: 11, flex: 1, color: "#c8e0f0" }}>{name}</span>
                    <span style={{ fontSize: 9, color: DIM }}>
                      {row.matchedScen.length}s / {row.matchedInv.length}i
                    </span>
                    <span style={{ color: DIM, fontSize: 11 }}>{isExpanded ? "▲" : "▼"}</span>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: "8px 16px 12px", background: "rgba(0,0,0,0.2)" }}>
                      {/* matched scenarios */}
                      {row.matchedScen.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 9, color: AM, marginBottom: 4, letterSpacing: 1 }}>SCENARIOS</div>
                          {row.matchedScen.map((sc, i) => (
                            <div key={i} style={{ marginBottom: 3 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                                <span style={{ fontSize: 10, color: "#c8e0f0" }}>{sc.name}</span>
                                <span style={{ fontSize: 9, color: AM, fontFamily: MONO }}>{sc.score}</span>
                              </div>
                              <div style={{ height: 3, background: "#0d2a40", borderRadius: 2 }}>
                                <div style={{ height: "100%", width: `${Math.min(100, sc.score * 20)}%`, background: AM, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* matched investigations */}
                      {row.matchedInv.length > 0 && (
                        <div>
                          <div style={{ fontSize: 9, color: GR, marginBottom: 4, letterSpacing: 1 }}>INVESTIGATIONS</div>
                          {row.matchedInv.map((inv, i) => (
                            <div key={i} style={{ marginBottom: 3 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                                <span style={{ fontSize: 10, color: "#c8e0f0" }}>{inv.name}</span>
                                <span style={{ fontSize: 9, color: GR, fontFamily: MONO }}>{inv.score}</span>
                              </div>
                              <div style={{ height: 3, background: "#0d2a40", borderRadius: 2 }}>
                                <div style={{ height: "100%", width: `${Math.min(100, inv.score * 20)}%`, background: GR, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {row.matchedScen.length === 0 && row.matchedInv.length === 0 && (
                        <div style={{ fontSize: 10, color: DIM }}>No matching scenarios or investigations — intelligence dead weight.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <style>{`
            @keyframes pulse-red {
              0%,100% { opacity:1; }
              50%      { opacity:0.35; }
            }
          `}</style>
        </div>
      )}
    </>
  );
}
