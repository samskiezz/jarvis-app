/**
 * ThreatResponseMesh — F243.
 *
 * Parallel-fetches /entities/RiskSignal × /entities/Contact × /v1/scenario/list
 * and keyword-correlates each risk signal against known contacts AND response
 * scenarios to classify:
 *
 *   FULLY_COVERED  — risk signal has ≥1 matching contact AND ≥1 matching scenario
 *   CONTACT_ONLY   — contact exists but no response scenario
 *   SCENARIO_ONLY  — scenario exists but no owning contact
 *   UNCOVERED      — neither contact nor scenario (threat response gap)
 *
 * Stat tiles: RISK SIGNALS / CONTACTS / SCENARIOS / UNCOVERED
 * Red badge: UNCOVERED count on toggle button; uncovered rows pulse red.
 * Filter tabs: ALL | FULLY_COVERED | CONTACT_ONLY | SCENARIO_ONLY | UNCOVERED + text search.
 * Expand signal → matched contact cards (orange) + scenario cards (cyan) with relevance bars.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence threat response mesh brief + TTS.
 *
 * Toggle:  ◈ TRMESH at left:1092800, bottom:8, zIndex:667.
 * Event:   jarvis:trmesh-toggle
 * Voice:   "trmesh" / "threat response mesh" / "risk contact scenario" /
 *          "uncovered threats" / "threat coverage mesh" / "risk mesh" /
 *          "risk response coverage" / "signal response gap"
 * Refresh: 90s auto-refresh while open.
 * Additive only — mounted via App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const RD  = "#FF3D3D";
const CY  = "#00E5FF";
const OR  = "#FF8A00";
const AM  = "#FFB300";
const GN  = "#4CAF50";
const DIM = "rgba(255,255,255,0.04)";
const BG  = "rgba(6,10,18,0.94)";
const MN  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";
const REFRESH_MS = 90_000;
const BTN_LEFT   = 1092800;
const Z_IDX      = 667;

const TRMESH_RE =
  /\b(trmesh|threat[._\-\s]response[._\-\s]mesh|risk[._\-\s]contact[._\-\s]scenario|uncovered[._\-\s]threats?|threat[._\-\s]coverage[._\-\s]mesh|risk[._\-\s]mesh|risk[._\-\s]response[._\-\s]coverage|signal[._\-\s]response[._\-\s]gap)\b/i;

export function isTrmeshQuery(t) {
  return TRMESH_RE.test(t || "");
}

// ── normalisers ───────────────────────────────────────────────────────────────

function normSignals(raw) {
  if (!raw) return [];
  const arr = raw.items || raw.signals || raw.risks || raw.data || raw.results || (Array.isArray(raw) ? raw : []);
  return arr.map((v, i) => ({
    id:       v.id || String(i),
    name:     v.name || v.title || v.signal || `Signal ${i + 1}`,
    desc:     v.description || v.detail || v.summary || "",
    severity: v.severity || v.level || v.priority || "",
    type:     v.type || v.category || "",
  }));
}

function normContacts(raw) {
  if (!raw) return [];
  const arr = raw.items || raw.contacts || raw.people || raw.data || raw.results || (Array.isArray(raw) ? raw : []);
  return arr.map((c, i) => ({
    id:   c.id || String(i),
    name: c.name || c.full_name || c.display_name || `Contact ${i + 1}`,
    desc: c.role || c.title || c.organisation || c.org || c.email || "",
    role: c.role || c.title || "",
    org:  c.organisation || c.org || c.company || "",
    tags: (c.tags || []).join(" "),
  }));
}

function normScenarios(raw) {
  if (!raw) return [];
  const arr = raw.items || raw.scenarios || raw.data || raw.results || (Array.isArray(raw) ? raw : []);
  return arr.map((s, i) => ({
    id:   s.id || String(i),
    name: s.name || s.title || s.scenario || `Scenario ${i + 1}`,
    desc: s.description || s.summary || s.detail || "",
    type: s.type || s.category || "",
  }));
}

function tokens(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function relevanceScore(signal, other) {
  const sWords = new Set(tokens(`${signal.name} ${signal.desc} ${signal.type} ${signal.severity}`));
  const oWords = tokens(`${other.name} ${other.desc} ${other.role || ""} ${other.org || ""} ${other.tags || ""} ${other.type || ""}`);
  const hits = oWords.filter(w => sWords.has(w));
  return hits.length / Math.max(oWords.length, 1);
}

function classify(signals, contacts, scenarios) {
  return signals.map(sig => {
    const matchedContacts = contacts
      .map(c => ({ ...c, score: relevanceScore(sig, c) }))
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score);

    const matchedScenarios = scenarios
      .map(s => ({ ...s, score: relevanceScore(sig, s) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);

    let coverage;
    if (matchedContacts.length > 0 && matchedScenarios.length > 0) {
      coverage = "FULLY_COVERED";
    } else if (matchedContacts.length > 0) {
      coverage = "CONTACT_ONLY";
    } else if (matchedScenarios.length > 0) {
      coverage = "SCENARIO_ONLY";
    } else {
      coverage = "UNCOVERED";
    }

    return { ...sig, coverage, matchedContacts, matchedScenarios };
  });
}

// ── voice script ─────────────────────────────────────────────────────────────

export async function buildTrmeshScript() {
  const base = apiBase();
  const [sRaw, cRaw, scRaw] = await Promise.all([
    fetch(`${base}/entities/RiskSignal`,   { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${base}/entities/Contact`,      { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${base}/v1/scenario/list`,      { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
  ]);
  const signals   = normSignals(sRaw);
  const contacts  = normContacts(cRaw);
  const scenarios = normScenarios(scRaw);
  const rows      = classify(signals, contacts, scenarios);
  const uncovered = rows.filter(r => r.coverage === "UNCOVERED").length;
  const covered   = rows.filter(r => r.coverage === "FULLY_COVERED").length;
  return `Threat Response Mesh online, sir. Of ${signals.length} active risk signals cross-referenced against ${contacts.length} contacts and ${scenarios.length} response scenarios, ${covered} threats have full response coverage — but ${uncovered} signals have neither an assigned contact nor a response scenario, representing critical threat response gaps that require immediate attention.`;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function severityColour(s) {
  const lc = (s || "").toLowerCase();
  if (lc === "critical") return RD;
  if (lc === "high")     return OR;
  if (lc === "medium")   return AM;
  return GN;
}

function coverageColour(c) {
  if (c === "FULLY_COVERED")  return GN;
  if (c === "CONTACT_ONLY")   return OR;
  if (c === "SCENARIO_ONLY")  return CY;
  return RD;
}

// ── component ────────────────────────────────────────────────────────────────

export default function ThreatResponseMesh() {
  const [open,       setOpen]       = useState(false);
  const [rows,       setRows]       = useState([]);
  const [sigCount,   setSigCount]   = useState(0);
  const [conCount,   setConCount]   = useState(0);
  const [scnCount,   setScnCount]   = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [err,        setErr]        = useState(null);
  const [filter,     setFilter]     = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    if (loading) return;
    setLoading(true); setErr(null);
    try {
      const base = apiBase();
      const [sRaw, cRaw, scRaw] = await Promise.all([
        fetch(`${base}/entities/RiskSignal`,   { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${base}/entities/Contact`,      { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${base}/v1/scenario/list`,      { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
      ]);
      const signals   = normSignals(sRaw);
      const contacts  = normContacts(cRaw);
      const scenarios = normScenarios(scRaw);
      setSigCount(signals.length);
      setConCount(contacts.length);
      setScnCount(scenarios.length);
      setRows(classify(signals, contacts, scenarios));
    } catch (e) {
      setErr(e.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:trmesh-toggle", toggle);
    return () => window.removeEventListener("jarvis:trmesh-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timer.current); return; }
    load();
    timer.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const uncovered = rows.filter(r => r.coverage === "UNCOVERED").length;

  const FILTERS = ["ALL", "FULLY_COVERED", "CONTACT_ONLY", "SCENARIO_ONLY", "UNCOVERED"];

  const visible = rows
    .filter(r => filter === "ALL" || r.coverage === filter)
    .filter(r => !search || `${r.name} ${r.desc} ${r.severity}`.toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildTrmeshScript();
      const base   = apiBase();
      const voice  = getActiveVoice ? getActiveVoice() : "ash";
      const r = await fetch(`${base}/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: script, voice }),
      });
      if (r.ok) {
        const blob = await r.blob();
        const url  = URL.createObjectURL(blob);
        new Audio(url).play();
      }
    } catch { /* silent */ }
    setAssessing(false);
  }

  const btnStyle = {
    position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_IDX,
    background: uncovered > 0 ? "rgba(255,61,61,0.12)" : "rgba(0,229,255,0.07)",
    border: `1px solid ${uncovered > 0 ? RD : CY}44`,
    color: uncovered > 0 ? RD : CY,
    fontFamily: MN, fontSize: 9, letterSpacing: 1.5, padding: "4px 8px",
    cursor: "pointer", borderRadius: 3,
  };

  const panelStyle = {
    position: "fixed", bottom: 36, left: BTN_LEFT - 360, width: 600, maxHeight: "70vh",
    overflowY: "auto", background: BG, border: `1px solid ${RD}44`,
    borderRadius: 6, zIndex: Z_IDX + 1, fontFamily: MN, fontSize: 11,
    color: "rgba(255,255,255,0.85)", padding: 16,
  };

  if (!open) {
    return (
      <button style={btnStyle} onClick={() => setOpen(true)}>
        ◈ TRMESH{uncovered > 0 && (
          <span style={{
            marginLeft: 5, background: RD, color: "#000", borderRadius: 2,
            padding: "0 4px", fontSize: 8, fontWeight: 700,
          }}>{uncovered}</span>
        )}
      </button>
    );
  }

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(false)}>▼ TRMESH</button>
      <div style={panelStyle}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ color: RD, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>◎ THREAT RESPONSE MESH</span>
          <span style={{ marginLeft: "auto", color: "rgba(255,255,255,0.35)", fontSize: 9 }}>
            {loading ? "loading…" : `↻ 90s`}
          </span>
          <button onClick={load} disabled={loading}
            style={{ background: "none", border: `1px solid ${CY}44`, color: CY,
              fontFamily: MN, fontSize: 9, padding: "2px 7px", cursor: "pointer", borderRadius: 2 }}>
            ↺
          </button>
        </div>

        {err && <div style={{ color: RD, marginBottom: 8, fontSize: 10 }}>⚠ {err}</div>}

        {/* stat tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 12 }}>
          {[
            { label: "RISK SIGNALS", val: sigCount, col: RD },
            { label: "CONTACTS",     val: conCount, col: OR },
            { label: "SCENARIOS",    val: scnCount, col: CY },
            { label: "UNCOVERED",    val: uncovered, col: uncovered > 0 ? RD : GN },
          ].map(({ label, val, col }) => (
            <div key={label} style={{
              background: DIM, border: `1px solid ${col}33`, borderRadius: 4,
              padding: "6px 8px", textAlign: "center",
            }}>
              <div style={{ color: col, fontSize: 15, fontWeight: 700 }}>{val}</div>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 8, letterSpacing: 1 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* coverage bar */}
        {rows.length > 0 && (() => {
          const fc = rows.filter(r => r.coverage === "FULLY_COVERED").length;
          const pct = Math.round((fc / rows.length) * 100);
          return (
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9,
                color: "rgba(255,255,255,0.4)", marginBottom: 3 }}>
                <span>COVERAGE</span><span>{pct}%</span>
              </div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                <div style={{ height: "100%", width: `${pct}%`,
                  background: pct > 70 ? GN : pct > 40 ? AM : RD, borderRadius: 2,
                  transition: "width 0.5s" }} />
              </div>
            </div>
          );
        })()}

        {/* filter tabs */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                background: filter === f ? `${coverageColour(f === "ALL" ? "ALL" : f)}22` : "none",
                border: `1px solid ${filter === f ? coverageColour(f === "ALL" ? "ALL" : f) : "rgba(255,255,255,0.12)"}`,
                color: filter === f ? coverageColour(f === "ALL" ? "ALL" : f) : "rgba(255,255,255,0.4)",
                fontFamily: MN, fontSize: 8, padding: "2px 7px", cursor: "pointer", borderRadius: 2,
              }}>
              {f}{f !== "ALL" && ` (${rows.filter(r => r.coverage === f).length})`}
            </button>
          ))}
        </div>

        {/* search */}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search signals…"
          style={{
            width: "100%", boxSizing: "border-box", background: DIM, border: `1px solid rgba(255,255,255,0.1)`,
            color: "rgba(255,255,255,0.8)", fontFamily: MN, fontSize: 10, padding: "4px 8px",
            borderRadius: 3, marginBottom: 10, outline: "none",
          }}
        />

        {/* rows */}
        {visible.length === 0 && !loading && (
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, textAlign: "center", padding: 16 }}>
            No signals match current filter.
          </div>
        )}

        {visible.map(sig => {
          const col    = coverageColour(sig.coverage);
          const sevCol = severityColour(sig.severity);
          const isExp  = expanded === sig.id;
          const pulse  = sig.coverage === "UNCOVERED"
            ? { animation: "trmesh-pulse 2s ease-in-out infinite" } : {};

          return (
            <div key={sig.id} style={{
              background: DIM, border: `1px solid ${col}33`, borderRadius: 4,
              marginBottom: 5, overflow: "hidden", ...pulse,
            }}>
              <div
                onClick={() => setExpanded(isExp ? null : sig.id)}
                style={{ padding: "7px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
              >
                <span style={{ color: col, fontSize: 9, fontWeight: 700, minWidth: 90 }}>{sig.coverage}</span>
                <span style={{ flex: 1, color: "rgba(255,255,255,0.8)", fontSize: 10 }}>{sig.name}</span>
                {sig.severity && (
                  <span style={{
                    background: `${sevCol}22`, border: `1px solid ${sevCol}55`,
                    color: sevCol, fontSize: 8, padding: "1px 5px", borderRadius: 2,
                  }}>{sig.severity.toUpperCase()}</span>
                )}
                <span style={{ color: OR, fontSize: 9 }}>{sig.matchedContacts.length}c</span>
                <span style={{ color: CY, fontSize: 9 }}>{sig.matchedScenarios.length}s</span>
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ borderTop: `1px solid rgba(255,255,255,0.06)`, padding: "8px 10px" }}>
                  {sig.desc && (
                    <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 9, marginBottom: 8, fontStyle: "italic" }}>
                      {sig.desc.slice(0, 180)}{sig.desc.length > 180 ? "…" : ""}
                    </div>
                  )}

                  {/* contacts */}
                  {sig.matchedContacts.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: OR, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>ASSIGNED CONTACTS</div>
                      {sig.matchedContacts.slice(0, 4).map(c => (
                        <div key={c.id} style={{
                          background: `${OR}0A`, border: `1px solid ${OR}33`,
                          borderRadius: 3, padding: "4px 8px", marginBottom: 3,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                            <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 9, flex: 1 }}>{c.name}</span>
                            {c.role && (
                              <span style={{
                                background: `${OR}22`, border: `1px solid ${OR}44`,
                                color: OR, fontSize: 7, padding: "1px 4px", borderRadius: 2,
                              }}>{c.role}</span>
                            )}
                          </div>
                          <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                            <div style={{ height: "100%", width: `${Math.round(c.score * 100)}%`,
                              background: OR, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* scenarios */}
                  {sig.matchedScenarios.length > 0 && (
                    <div>
                      <div style={{ color: CY, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>RESPONSE SCENARIOS</div>
                      {sig.matchedScenarios.slice(0, 4).map(s => (
                        <div key={s.id} style={{
                          background: `${CY}0A`, border: `1px solid ${CY}33`,
                          borderRadius: 3, padding: "4px 8px", marginBottom: 3,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                            <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 9, flex: 1 }}>{s.name}</span>
                            {s.type && (
                              <span style={{
                                background: `${CY}22`, border: `1px solid ${CY}44`,
                                color: CY, fontSize: 7, padding: "1px 4px", borderRadius: 2,
                              }}>{s.type}</span>
                            )}
                          </div>
                          <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                            <div style={{ height: "100%", width: `${Math.round(s.score * 100)}%`,
                              background: CY, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {sig.matchedContacts.length === 0 && sig.matchedScenarios.length === 0 && (
                    <div style={{ color: RD, fontSize: 9, fontStyle: "italic" }}>
                      ⚠ No contacts or response scenarios found for this threat signal.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* assess */}
        <div style={{ marginTop: 12, borderTop: `1px solid rgba(255,255,255,0.06)`, paddingTop: 10 }}>
          <button onClick={assess} disabled={assessing || loading}
            style={{
              background: assessing ? `${RD}22` : "none",
              border: `1px solid ${RD}66`, color: RD,
              fontFamily: MN, fontSize: 9, letterSpacing: 1, padding: "5px 14px",
              cursor: assessing ? "default" : "pointer", borderRadius: 3,
            }}>
            {assessing ? "◍ assessing…" : "▶ ASSESS THREAT COVERAGE"}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes trmesh-pulse {
          0%, 100% { border-color: rgba(255,61,61,0.2); }
          50%       { border-color: rgba(255,61,61,0.6); }
        }
      `}</style>
    </>
  );
}
