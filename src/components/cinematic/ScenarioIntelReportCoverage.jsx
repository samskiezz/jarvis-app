/**
 * F93 — Scenario × IntelProfile × Report Intelligence Coverage (SIPWCOV)
 * Parallel-fetches /v1/scenario/list + /entities/IntelProfile + /v1/reports.
 * Keyword-correlates each scenario against intel actor profiles AND reports to classify:
 *   FULLY_ARMED (both match) | ACTOR_PLANNED (intel profile only)
 *   REPORT_BACKED (report only) | BLIND (neither)
 * Stat tiles + readiness bar. Red pulse + badge on BLIND count.
 * Filter tabs ALL/FULLY_ARMED/ACTOR_PLANNED/REPORT_BACKED/BLIND + text search.
 * Expand scenario → matched intel profile cards (orange) + report cards (purple) with relevance bars.
 * ▶ ASSESS COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Voice trigger: "sipwcov/scenario intel report/weapon coverage/armed scenario/blind scenario/scenario readiness coverage".
 * Event: jarvis:sipwcov-toggle | 90-s auto-refresh.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 995_000;
const Z_INDEX  = 155;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const SIPWCOV_RE = /\b(sipwcov|scenario\s+intel\s+report|weapon\s+coverage|armed\s+scenario|blind\s+scenario|scenario\s+readiness\s+coverage|scenario\s+intelligence\s+cover|intel\s+report\s+scenario)\b/i;

const CY = "#00CFFF";
const AM = "#F59E0B";
const GR = "#22C55E";
const RD = "#EF4444";
const OR = "#F97316";
const PU = "#A855F7";
const BG = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_ARMED:   GR,
  ACTOR_PLANNED: OR,
  REPORT_BACKED: PU,
  BLIND:         RD,
};

// ── exports for JarvisBrain ───────────────────────────────────────────────────

export function isSipwcovQuery(text) {
  return SIPWCOV_RE.test(text || "");
}

function norm(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function kwTokens(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function overlap(aStr, bStr) {
  const setA = new Set(kwTokens(aStr));
  return kwTokens(bStr).some(w => setA.has(w));
}

function matchScore(scenStr, targetStr) {
  const ra = kwTokens(scenStr);
  const ta = new Set(kwTokens(targetStr));
  const hits = ra.filter(w => ta.has(w)).length;
  return Math.min(100, Math.round((hits / Math.max(1, ra.length)) * 200));
}

function classify(scenario, profiles, reports) {
  const sStr = [scenario.name, scenario.title, scenario.description, scenario.objective, scenario.type]
    .filter(Boolean).join(" ");
  const matchedProfiles = profiles.filter(p =>
    overlap(sStr, [p.name, p.aliases, p.org, p.role, p.tags, p.description].filter(Boolean).join(" "))
  );
  const matchedReports = reports.filter(r =>
    overlap(sStr, [r.title, r.description, (r.tags || []).join(" "), r.type, r.author].filter(Boolean).join(" "))
  );
  const hasP = matchedProfiles.length > 0;
  const hasR = matchedReports.length > 0;
  const cls = hasP && hasR ? "FULLY_ARMED" : hasP ? "ACTOR_PLANNED" : hasR ? "REPORT_BACKED" : "BLIND";
  return { ...scenario, _cls: cls, _profiles: matchedProfiles, _reports: matchedReports, _sStr: sStr };
}

export async function buildSipwcovScript() {
  const base = apiBase();
  const h = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  try {
    const [sr, pr, rr] = await Promise.all([
      fetch(`${base}/v1/scenario/list`,     { headers: h }).then(r => r.json()),
      fetch(`${base}/entities/IntelProfile`, { headers: h }).then(r => r.json()),
      fetch(`${base}/v1/reports`,            { headers: h }).then(r => r.json()),
    ]);
    const scenarios = norm(sr, ["scenarios","items","data","results"]);
    const profiles  = norm(pr, ["profiles","items","data","results"]);
    const reports   = norm(rr, ["reports","items","data","results"]);
    const rows      = scenarios.map(s => classify(s, profiles, reports));
    const armed     = rows.filter(r => r._cls === "FULLY_ARMED").length;
    const blind     = rows.filter(r => r._cls === "BLIND").length;
    const pct       = rows.length ? Math.round((armed / rows.length) * 100) : 0;
    return `Scenario Intelligence Coverage: ${scenarios.length} scenarios cross-referenced against ${profiles.length} intel actor profiles and ${reports.length} intelligence reports. ${armed} scenarios are fully armed with both actor intelligence and report backing, ${pct}% readiness. ${blind} scenarios are currently blind — no intel profile or report coverage found.`;
  } catch {
    return "Scenario intelligence coverage online. Cross-referencing scenario playbooks against intel actor profiles and intelligence reports to classify armed, actor-planned, report-backed, and blind scenarios. Review the SIPWCOV panel for the full readiness breakdown, sir.";
  }
}

// ── component ─────────────────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{ flex: 1, background: "rgba(0,207,255,0.05)", border: `1px solid ${color || BORDER}`, borderRadius: 4, padding: "8px 10px" }}>
      <div style={{ color: color || CY, fontSize: 18, fontWeight: 700, fontFamily: FONT }}>{value}</div>
      <div style={{ color: "#88A4B8", fontSize: 9, letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function RelevanceBar({ score, color }) {
  return (
    <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden", marginTop: 3 }}>
      <div style={{ height: "100%", width: `${score}%`, background: color, borderRadius: 2, transition: "width 0.5s" }} />
    </div>
  );
}

export default function ScenarioIntelReportCoverage() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]       = useState("");
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const base = apiBase();
      const h = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      const [sr, pr, rr] = await Promise.all([
        fetch(`${base}/v1/scenario/list`,      { headers: h }).then(r => r.json()),
        fetch(`${base}/entities/IntelProfile`,  { headers: h }).then(r => r.json()),
        fetch(`${base}/v1/reports`,             { headers: h }).then(r => r.json()),
      ]);
      const scenarios = norm(sr, ["scenarios","items","data","results"]);
      const profiles  = norm(pr, ["profiles","items","data","results"]);
      const reports   = norm(rr, ["reports","items","data","results"]);
      setRows(scenarios.map(s => classify(s, profiles, reports)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener("jarvis:sipwcov-toggle", handler);
    return () => window.removeEventListener("jarvis:sipwcov-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const assess = async () => {
    setAssessing(true); setBrief("");
    try {
      const script = await buildSipwcovScript();
      setBrief(script);
      const base = apiBase();
      const h = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      const rr = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers: h,
        body: JSON.stringify({ message: `In 2 sentences max, summarise the scenario-intel-report readiness coverage: ${script}` }),
      }).then(r => r.json());
      const aiText = rr.response || rr.message || rr.content || script;
      setBrief(aiText);
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST", headers: h,
        body: JSON.stringify({ text: aiText }),
      });
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  };

  const counts = {
    FULLY_ARMED:   rows.filter(r => r._cls === "FULLY_ARMED").length,
    ACTOR_PLANNED: rows.filter(r => r._cls === "ACTOR_PLANNED").length,
    REPORT_BACKED: rows.filter(r => r._cls === "REPORT_BACKED").length,
    BLIND:         rows.filter(r => r._cls === "BLIND").length,
  };
  const covPct = rows.length ? Math.round((counts.FULLY_ARMED / rows.length) * 100) : 0;

  const TABS = ["ALL", "FULLY_ARMED", "ACTOR_PLANNED", "REPORT_BACKED", "BLIND"];
  const visible = rows.filter(r =>
    (tab === "ALL" || r._cls === tab) &&
    (!search || (r.name || r.title || "").toLowerCase().includes(search.toLowerCase()))
  );

  const blindPulse = counts.BLIND > 0;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: open ? CY : "rgba(0,207,255,0.08)",
          border: `1px solid ${CY}`, color: open ? "#04060A" : CY,
          fontFamily: FONT, fontSize: 10, letterSpacing: 2,
          padding: "3px 8px", borderRadius: 3, cursor: "pointer",
        }}
        title="Scenario × IntelProfile × Report Intelligence Coverage"
      >
        ◈ SIPWCOV
        {counts.BLIND > 0 && (
          <span style={{
            marginLeft: 5, background: RD, color: "#FFF", borderRadius: "50%",
            fontSize: 9, padding: "0 4px", fontWeight: 700,
            animation: blindPulse ? "sipwcov-pulse 1.4s infinite" : "none",
          }}>{counts.BLIND}</span>
        )}
      </button>

      <style>{`
        @keyframes sipwcov-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.7); }
          50%       { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
        }
      `}</style>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 36, right: 8, zIndex: Z_INDEX + 1,
          width: "min(660px,96vw)", maxHeight: "72vh",
          background: BG, border: `1px solid ${CY}33`, borderRadius: 10,
          display: "flex", flexDirection: "column", overflow: "hidden",
          fontFamily: FONT, boxShadow: `0 0 40px ${CY}18`,
        }}>
          {/* Header */}
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: CY, fontWeight: 700, fontSize: 12, letterSpacing: 2 }}>◈ SIPWCOV</span>
            <span style={{ color: "#88A4B8", fontSize: 10 }}>Scenario × IntelProfile × Report Intelligence Coverage</span>
            <button onClick={fetchData} disabled={loading} style={{ marginLeft: "auto", background: "none", border: `1px solid ${CY}55`, color: CY, cursor: "pointer", fontSize: 10, padding: "2px 7px", borderRadius: 3, fontFamily: FONT }}>
              {loading ? "..." : "↻"}
            </button>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#88A4B8", cursor: "pointer", fontSize: 14, padding: "2px 6px" }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ padding: "10px 14px", display: "flex", gap: 8, borderBottom: `1px solid ${BORDER}` }}>
            <Tile label="SCENARIOS"    value={rows.length}              color={CY} />
            <Tile label="FULLY ARMED"  value={counts.FULLY_ARMED}      color={GR} />
            <Tile label="ACTOR ONLY"   value={counts.ACTOR_PLANNED}    color={OR} />
            <Tile label="REPORT ONLY"  value={counts.REPORT_BACKED}    color={PU} />
            <Tile label="BLIND"        value={counts.BLIND}            color={RD} />
          </div>

          {/* Coverage bar */}
          <div style={{ padding: "6px 14px", borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ color: "#88A4B8", fontSize: 9, letterSpacing: 1 }}>FULLY ARMED READINESS</span>
              <span style={{ color: GR, fontSize: 10, fontWeight: 700 }}>{covPct}%</span>
            </div>
            <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${covPct}%`, background: GR, borderRadius: 3, transition: "width 0.6s" }} />
            </div>
          </div>

          {/* Filter tabs + search */}
          <div style={{ padding: "6px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? (CLASS_COLOR[t] || CY) : "none",
                border: `1px solid ${CLASS_COLOR[t] || CY}`,
                color: tab === t ? "#04060A" : (CLASS_COLOR[t] || CY),
                fontFamily: FONT, fontSize: 9, letterSpacing: 1,
                padding: "2px 7px", borderRadius: 3, cursor: "pointer",
              }}>{t.replace(/_/g, " ")}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search scenarios…"
              style={{
                marginLeft: "auto", background: "rgba(0,207,255,0.05)",
                border: `1px solid ${BORDER}`, color: "#C8D8E8",
                fontFamily: FONT, fontSize: 10, padding: "3px 8px", borderRadius: 3,
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px" }}>
            {err && <div style={{ color: RD, fontSize: 11, padding: 8 }}>Error: {err}</div>}
            {!loading && !err && visible.length === 0 && (
              <div style={{ color: "#88A4B8", fontSize: 11, padding: 8 }}>No scenarios match the current filter.</div>
            )}
            {visible.map((r, i) => {
              const rid = r.id || r._id || r.name || r.title || i;
              const isExp = expanded === rid;
              const color = CLASS_COLOR[r._cls] || CY;
              return (
                <div key={rid} style={{ marginBottom: 6, border: `1px solid ${color}33`, borderRadius: 5, background: "rgba(0,207,255,0.03)" }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : rid)}
                    style={{ padding: "7px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span style={{ fontSize: 9, fontWeight: 700, color, border: `1px solid ${color}`, padding: "1px 5px", borderRadius: 2, minWidth: 90, textAlign: "center" }}>
                      {r._cls.replace(/_/g, " ")}
                    </span>
                    <span style={{ color: "#C8D8E8", fontSize: 11, flex: 1 }}>{r.name || r.title || `Scenario ${i + 1}`}</span>
                    {r.type && <span style={{ color: "#88A4B8", fontSize: 9 }}>{r.type}</span>}
                    <span style={{ color: "#88A4B8", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                  </div>
                  {isExp && (
                    <div style={{ padding: "6px 10px 10px", borderTop: `1px solid ${BORDER}` }}>
                      {r._profiles.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ color: OR, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>MATCHED INTEL PROFILES ({r._profiles.length})</div>
                          {r._profiles.slice(0, 4).map((p, j) => {
                            const sc = matchScore(r._sStr, [p.name, p.aliases, p.org, p.role, p.description].filter(Boolean).join(" "));
                            return (
                              <div key={j} style={{ marginBottom: 4, padding: "4px 7px", background: `${OR}0a`, border: `1px solid ${OR}33`, borderRadius: 3 }}>
                                <span style={{ color: OR, fontSize: 10 }}>{p.name || `Actor ${j + 1}`}</span>
                                {p.role && <span style={{ color: "#88A4B8", fontSize: 9, marginLeft: 8 }}>{p.role}</span>}
                                <RelevanceBar score={sc} color={OR} />
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {r._reports.length > 0 && (
                        <div>
                          <div style={{ color: PU, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>MATCHED REPORTS ({r._reports.length})</div>
                          {r._reports.slice(0, 4).map((rep, j) => {
                            const sc = matchScore(r._sStr, [rep.title, rep.description, (rep.tags || []).join(" ")].filter(Boolean).join(" "));
                            return (
                              <div key={j} style={{ marginBottom: 4, padding: "4px 7px", background: `${PU}0a`, border: `1px solid ${PU}33`, borderRadius: 3 }}>
                                <span style={{ color: PU, fontSize: 10 }}>{rep.title || `Report ${j + 1}`}</span>
                                {rep.type && <span style={{ color: "#88A4B8", fontSize: 9, marginLeft: 8 }}>{rep.type}</span>}
                                <RelevanceBar score={sc} color={PU} />
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {r._profiles.length === 0 && r._reports.length === 0 && (
                        <div style={{ color: RD, fontSize: 10, padding: "4px 0" }}>No matching intel profiles or reports found — scenario is BLIND.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Assess + brief */}
          <div style={{ padding: "8px 14px", borderTop: `1px solid ${BORDER}` }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{
                background: "none", border: `1px solid ${GR}`,
                color: GR, fontFamily: FONT, fontSize: 10,
                padding: "4px 12px", borderRadius: 3, cursor: "pointer",
                letterSpacing: 1, opacity: assessing ? 0.6 : 1,
              }}
            >
              {assessing ? "… ASSESSING" : "▶ ASSESS READINESS"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, color: "#C8D8E8", fontSize: 11, lineHeight: 1.5, background: "rgba(0,207,255,0.04)", padding: "6px 8px", borderRadius: 4 }}>
                {brief}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: "4px 14px 6px", borderTop: `1px solid ${BORDER}`, color: "#4A6070", fontSize: 9 }}>
            SIPWCOV · /v1/scenario/list × /entities/IntelProfile × /v1/reports · auto-refresh 90s
          </div>
        </div>
      )}
    </>
  );
}
