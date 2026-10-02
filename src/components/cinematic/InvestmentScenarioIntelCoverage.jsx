import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const AM = "#FFB300"; const CY = "#00E5FF"; const GN = "#4CAF50";
const OR = "#FF9800"; const RD = "#FF3D3D";
const DIM = "rgba(255,255,255,0.04)"; const BG = "rgba(6,10,18,0.94)";
const MN = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const REFRESH_MS = 90_000;
const BTN_LEFT   = 1097840;
const Z_IDX      = 676;

const TFSCOV_RE = /\b(tfscov|investment scenario|funded scenario|threat funded|investment intel|portfolio threat|scenario investment|intel investment|investment coverage|portfolio scenario|funded intel)\b/i;
export function isTfscovQuery(t) { return TFSCOV_RE.test(t || ""); }

function tokens(s) {
  return String(s || "").toLowerCase().split(/[\s,;:|\/\-_]+/).filter(w => w.length > 3);
}
function overlap(a, b) {
  const sa = new Set(tokens(a));
  let n = 0;
  for (const w of tokens(b)) if (sa.has(w)) n++;
  return n;
}

function normInvestments(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.investments) ? raw.investments
    : Array.isArray(raw?.results) ? raw.results
    : Array.isArray(raw?.data) ? raw.data
    : [];
  return arr.map(i => ({
    id: i.id || i._id || "",
    label: i.name || i.title || i.asset || i.label || String(i.id || ""),
    description: i.description || i.summary || i.notes || "",
    type: i.type || i.category || i.asset_class || "",
    value: i.value || i.amount || i.portfolio_value || "",
    tags: Array.isArray(i.tags) ? i.tags.join(" ") : String(i.tags || ""),
  }));
}

function normScenarios(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.scenarios) ? raw.scenarios
    : Array.isArray(raw?.results) ? raw.results
    : Array.isArray(raw?.data) ? raw.data
    : [];
  return arr.map(s => ({
    id: s.id || s._id || "",
    label: s.name || s.title || s.label || String(s.id || ""),
    description: s.description || s.summary || s.objective || "",
    type: s.type || s.category || "",
    tags: Array.isArray(s.tags) ? s.tags.join(" ") : String(s.tags || ""),
  }));
}

function normIntelProfiles(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.profiles) ? raw.profiles
    : Array.isArray(raw?.results) ? raw.results
    : Array.isArray(raw?.data) ? raw.data
    : [];
  return arr.map(p => ({
    id: p.id || p._id || "",
    label: p.name || p.alias || p.label || String(p.id || ""),
    org: p.org || p.organization || p.affiliation || "",
    role: p.role || p.position || p.type || "",
    description: p.description || p.summary || p.bio || "",
    tags: Array.isArray(p.tags) ? p.tags.join(" ") : String(p.tags || ""),
  }));
}

function classify(inv, scenarios, intelProfiles) {
  const hay = inv.label + " " + inv.description + " " + inv.type + " " + inv.tags;
  const hasScenario = scenarios.some(s => overlap(hay, s.label + " " + s.description + " " + s.tags) >= 1);
  const hasIntel    = intelProfiles.some(p => overlap(hay, p.label + " " + p.org + " " + p.role + " " + p.tags) >= 1);
  if (hasScenario && hasIntel) return "FULLY_TRACKED";
  if (hasScenario)             return "SCENARIO_ONLY";
  if (hasIntel)                return "PROFILED_ONLY";
  return "UNMONITORED";
}

function relevance(invHay, itemText) {
  return Math.min(100, overlap(invHay, itemText) * 20);
}

const clsColor = cls => ({
  FULLY_TRACKED:  GN,
  SCENARIO_ONLY:  CY,
  PROFILED_ONLY:  OR,
  UNMONITORED:    RD,
}[cls] || "#888");

const clsLabel = cls => ({
  FULLY_TRACKED:  "FULLY TRACKED",
  SCENARIO_ONLY:  "SCENARIO ONLY",
  PROFILED_ONLY:  "PROFILED ONLY",
  UNMONITORED:    "UNMONITORED",
}[cls] || cls);

export async function buildTfscovScript() {
  const base = apiBase();
  const hdr = { Authorization: `Bearer ${API_KEY}` };
  const [invRaw, scRaw, ipRaw] = await Promise.all([
    fetch(`${base}/entities/Investment`,    { headers: hdr }).then(r => r.ok ? r.json() : []),
    fetch(`${base}/v1/scenario/list`,        { headers: hdr }).then(r => r.ok ? r.json() : []),
    fetch(`${base}/entities/IntelProfile`,   { headers: hdr }).then(r => r.ok ? r.json() : []),
  ]);
  const investments   = normInvestments(invRaw);
  const scenarios     = normScenarios(scRaw);
  const intelProfiles = normIntelProfiles(ipRaw);
  const counts = { FULLY_TRACKED: 0, SCENARIO_ONLY: 0, PROFILED_ONLY: 0, UNMONITORED: 0 };
  investments.forEach(i => counts[classify(i, scenarios, intelProfiles)]++);
  return `TFSCOV online, sir. ${investments.length} portfolio investments assessed for threat-funded scenario coverage. `
    + `${counts.FULLY_TRACKED} fully tracked (scenario + intel profile), ${counts.SCENARIO_ONLY} scenario-only, `
    + `${counts.PROFILED_ONLY} profiled-only, ${counts.UNMONITORED} unmonitored — coverage gaps detected. `
    + `${scenarios.length} scenarios and ${intelProfiles.length} intel profiles correlated.`;
}

export default function InvestmentScenarioIntelCoverage() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [investments, setInvestments] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [intelProfiles, setIntelProfiles] = useState([]);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [invRaw, scRaw, ipRaw] = await Promise.all([
        fetch(`${base}/entities/Investment`,  { headers: hdr }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/v1/scenario/list`,      { headers: hdr }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/entities/IntelProfile`, { headers: hdr }).then(r => r.ok ? r.json() : []),
      ]);
      setInvestments(normInvestments(invRaw));
      setScenarios(normScenarios(scRaw));
      setIntelProfiles(normIntelProfiles(ipRaw));
    } catch { /* stay stale */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(v => !v); };
    window.addEventListener("jarvis:tfscov-toggle", handler);
    return () => window.removeEventListener("jarvis:tfscov-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const classified = investments.map(i => ({ ...i, cls: classify(i, scenarios, intelProfiles) }));
  const unmonitoredCount = classified.filter(i => i.cls === "UNMONITORED").length;

  const tabs = ["ALL", "FULLY_TRACKED", "SCENARIO_ONLY", "PROFILED_ONLY", "UNMONITORED"];
  const filtered = classified
    .filter(i => tab === "ALL" || i.cls === tab)
    .filter(i => !search || i.label.toLowerCase().includes(search.toLowerCase()) || i.description.toLowerCase().includes(search.toLowerCase()));

  const counts = { FULLY_TRACKED: 0, SCENARIO_ONLY: 0, PROFILED_ONLY: 0, UNMONITORED: 0 };
  classified.forEach(i => counts[i.cls]++);

  const assess = async () => {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const hdr = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
      const ctx = `${classified.length} investments: ${counts.FULLY_TRACKED} fully tracked, ${counts.SCENARIO_ONLY} scenario-only, ${counts.PROFILED_ONLY} profiled-only, ${counts.UNMONITORED} unmonitored.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers: hdr,
        body: JSON.stringify({ message: `TFSCOV threat-funded scenario coverage assessment: ${ctx} Give a 2-sentence brief on portfolio threat monitoring gaps and recommended actions.` }),
      });
      const d = await r.json();
      const text = d.response || d.answer || d.message || d.result || "";
      setBrief(text);
      if (text) {
        const ttsR = await fetch(`${base}/v1/voice/tts`, {
          method: "POST", headers: hdr,
          body: JSON.stringify({ text, voice: getActiveVoice() }),
        });
        if (ttsR.ok) {
          const blob = await ttsR.blob();
          new Audio(URL.createObjectURL(blob)).play();
        }
      }
    } catch { setBrief("Assessment unavailable — backend unreachable."); }
    setAssessing(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_IDX,
          background: open ? `${AM}22` : "rgba(10,14,24,0.82)",
          border: `1px solid ${open ? AM : "#333"}`,
          borderRadius: 4, color: open ? AM : "#666",
          fontFamily: MN, fontSize: 9, fontWeight: 700,
          padding: "3px 8px", cursor: "pointer", letterSpacing: 1,
        }}
      >
        ◈ TFSCOV
        {unmonitoredCount > 0 && (
          <span style={{
            marginLeft: 5, background: RD, color: "#fff",
            borderRadius: 8, fontSize: 8, padding: "1px 5px", fontWeight: 900,
          }}>{unmonitoredCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 36, left: Math.min(BTN_LEFT, window.innerWidth - 480),
          width: 460, maxHeight: "72vh", overflowY: "auto",
          background: BG, border: `1px solid ${AM}55`, borderRadius: 8,
          zIndex: Z_IDX + 1, padding: 14, fontFamily: MN,
          boxShadow: `0 0 24px ${AM}22`,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ color: AM, fontWeight: 900, fontSize: 12, letterSpacing: 2 }}>TFSCOV — THREAT-FUNDED SCENARIO COVERAGE</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#555", fontSize: 14, cursor: "pointer" }}>✕</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 10 }}>
            {[
              ["INVESTMENTS", classified.length, "#888"],
              ["FULLY TRACKED", counts.FULLY_TRACKED, GN],
              ["PARTIAL", counts.SCENARIO_ONLY + counts.PROFILED_ONLY, CY],
              ["UNMONITORED", counts.UNMONITORED, RD],
            ].map(([label, val, color]) => (
              <div key={label} style={{ background: `${color}11`, border: `1px solid ${color}33`, borderRadius: 5, padding: "6px 4px", textAlign: "center" }}>
                <div style={{ color, fontWeight: 900, fontSize: 16 }}>{loading ? "…" : val}</div>
                <div style={{ color: "#666", fontSize: 8, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {classified.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ color: "#888", fontSize: 9 }}>COVERAGE</span>
                <span style={{ color: GN, fontSize: 9, fontWeight: 700 }}>{Math.round(counts.FULLY_TRACKED / classified.length * 100)}%</span>
              </div>
              <div style={{ background: "#111", borderRadius: 3, height: 4 }}>
                <div style={{ width: `${Math.round(counts.FULLY_TRACKED / classified.length * 100)}%`, height: "100%", background: GN, borderRadius: 3 }} />
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
            {tabs.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${AM}22` : "none",
                border: `1px solid ${tab === t ? AM : "#333"}`,
                color: tab === t ? AM : "#555",
                borderRadius: 3, fontSize: 8, padding: "2px 7px", cursor: "pointer", fontFamily: MN,
              }}>{t === "ALL" ? `ALL (${classified.length})` : `${clsLabel(t)} (${counts[t] || 0})`}</button>
            ))}
          </div>

          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search investments…"
            style={{
              width: "100%", background: "#0a0f18", border: "1px solid #222", borderRadius: 4,
              color: "#ccc", fontFamily: MN, fontSize: 11, padding: "5px 8px",
              marginBottom: 8, boxSizing: "border-box",
            }}
          />

          {loading && <div style={{ color: "#555", textAlign: "center", padding: 20, fontSize: 11 }}>Loading…</div>}

          {!loading && filtered.map(i => {
            const hay = i.label + " " + i.description + " " + i.type + " " + i.tags;
            const isExp = expanded === i.id;
            const matchedScenarios = scenarios.filter(s => overlap(hay, s.label + " " + s.description + " " + s.tags) >= 1);
            const matchedIntel     = intelProfiles.filter(p => overlap(hay, p.label + " " + p.org + " " + p.role + " " + p.tags) >= 1);
            return (
              <div key={i.id} style={{
                background: DIM, border: `1px solid ${clsColor(i.cls)}22`,
                borderRadius: 5, marginBottom: 6, padding: "7px 10px",
                animation: i.cls === "UNMONITORED" ? "tfscovPulse 2.4s ease-in-out infinite" : "none",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ color: "#fff", fontWeight: 700 }}>{i.label}</span>
                    {i.type  && <span style={{ color: "#888", marginLeft: 6, fontSize: 10 }}>{i.type}</span>}
                    {i.value && <span style={{ color: GN,    marginLeft: 6, fontSize: 10 }}>{i.value}</span>}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{
                      background: `${clsColor(i.cls)}22`, border: `1px solid ${clsColor(i.cls)}`,
                      color: clsColor(i.cls), borderRadius: 3, padding: "1px 5px", fontSize: 9, fontWeight: 700,
                    }}>{clsLabel(i.cls)}</span>
                    <button onClick={() => setExpanded(isExp ? null : i.id)} style={{
                      background: "none", border: `1px solid #333`, borderRadius: 3,
                      color: "#888", fontSize: 9, padding: "1px 5px", cursor: "pointer",
                    }}>{isExp ? "▲" : "▼"}</button>
                  </div>
                </div>

                {isExp && (
                  <div style={{ marginTop: 8 }}>
                    {matchedScenarios.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ color: CY, fontSize: 10, fontWeight: 700, marginBottom: 4 }}>MATCHED SCENARIOS ({matchedScenarios.length})</div>
                        {matchedScenarios.slice(0, 4).map(s => {
                          const rel = relevance(hay, s.label + " " + s.description + " " + s.tags);
                          return (
                            <div key={s.id} style={{ background: `${CY}0a`, border: `1px solid ${CY}22`, borderRadius: 3, padding: "4px 8px", marginBottom: 3 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ color: "#ccc", fontSize: 11 }}>{s.label}</span>
                                {s.type && <span style={{ background: `${CY}22`, color: CY, borderRadius: 2, padding: "0 4px", fontSize: 8 }}>{s.type}</span>}
                              </div>
                              <div style={{ marginTop: 3, background: "#111", borderRadius: 2, height: 3 }}>
                                <div style={{ width: `${rel}%`, height: "100%", background: CY, borderRadius: 2 }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {matchedIntel.length > 0 && (
                      <div>
                        <div style={{ color: OR, fontSize: 10, fontWeight: 700, marginBottom: 4 }}>MATCHED INTEL PROFILES ({matchedIntel.length})</div>
                        {matchedIntel.slice(0, 4).map(p => {
                          const rel = relevance(hay, p.label + " " + p.org + " " + p.role + " " + p.tags);
                          return (
                            <div key={p.id} style={{ background: `${OR}0a`, border: `1px solid ${OR}22`, borderRadius: 3, padding: "4px 8px", marginBottom: 3 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ color: "#ccc", fontSize: 11 }}>{p.label}</span>
                                {p.role && <span style={{ background: `${OR}22`, color: OR, borderRadius: 2, padding: "0 4px", fontSize: 8 }}>{p.role}</span>}
                              </div>
                              <div style={{ marginTop: 3, background: "#111", borderRadius: 2, height: 3 }}>
                                <div style={{ width: `${rel}%`, height: "100%", background: OR, borderRadius: 2 }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {matchedScenarios.length === 0 && matchedIntel.length === 0 && (
                      <div style={{ color: RD, fontSize: 10, padding: "4px 0" }}>No scenario or intel profile match — threat monitoring gap.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <button
            onClick={assess}
            disabled={assessing}
            style={{
              marginTop: 10, width: "100%", background: assessing ? "#111" : `${AM}22`,
              border: `1px solid ${AM}`, borderRadius: 4, color: AM,
              fontFamily: MN, fontSize: 11, fontWeight: 700, padding: "6px 0", cursor: assessing ? "default" : "pointer",
            }}
          >
            {assessing ? "ASSESSING…" : "▶ ASSESS THREAT-FUNDED COVERAGE"}
          </button>
          {brief && (
            <div style={{ marginTop: 8, background: `${AM}11`, border: `1px solid ${AM}33`, borderRadius: 4, padding: 8, color: "#ccc", fontSize: 11, lineHeight: 1.5 }}>
              {brief}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes tfscovPulse {
          0%,100% { border-color: ${RD}22; }
          50% { border-color: ${RD}88; box-shadow: 0 0 6px ${RD}44; }
        }
      `}</style>
    </>
  );
}
