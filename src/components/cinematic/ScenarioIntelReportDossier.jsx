import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_060_520;
const Z_INDEX  = 272;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const MIDOSS_RE = /\b(midoss|mission[\s-]intel[\s-]dossier|scenario[\s-]intel[\s-]report|unbriefed[\s-]scenario|mission[\s-]dossier|intel[\s-]dossier|scenario[\s-]dossier|briefed[\s-]scenario)\b/i;
export function isMidossQuery(q = "") { return MIDOSS_RE.test(q); }

function keywords(text = "") {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3);
}

function scoreText(target = "", kws = []) {
  if (!kws.length || !target) return 0;
  const t = target.toLowerCase();
  return kws.reduce((n, k) => n + (t.includes(k) ? 1 : 0), 0) / kws.length;
}

function scenarioText(s = {}) {
  return [s.name, s.title, s.description, s.type, s.category, s.tags?.join(" ")].filter(Boolean).join(" ");
}
function profileText(p = {}) {
  return [p.name, p.aliases?.join(" "), p.organization, p.org, p.role, p.description, p.tags?.join(" ")].filter(Boolean).join(" ");
}
function reportText(r = {}) {
  return [r.title, r.name, r.description, r.type, r.author, r.tags?.join(" ")].filter(Boolean).join(" ");
}

const THRESHOLD = 0.08;

function classifyScenario(scenario, profiles, reports) {
  const kws             = keywords(scenarioText(scenario));
  const matchedProfiles = profiles.filter(p => scoreText(profileText(p), kws) >= THRESHOLD);
  const matchedReports  = reports.filter(r => scoreText(reportText(r), kws) >= THRESHOLD);
  const hasProfile      = matchedProfiles.length > 0;
  const hasReport       = matchedReports.length > 0;
  const category =
    hasProfile && hasReport ? "FULLY_BRIEFED"  :
    hasProfile              ? "PROFILE_ONLY"   :
    hasReport               ? "REPORT_ONLY"    :
                              "UNBRIEFED";
  return { ...scenario, category, matchedProfiles, matchedReports };
}

export async function buildMidossScript() {
  const base = apiBase();
  const [sRes, pRes, rRes] = await Promise.allSettled([
    fetch(`${base}/v1/scenario/list`,      { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${base}/entities/IntelProfile`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${base}/v1/reports`,            { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
  ]);
  const rawScenarios = sRes.status === "fulfilled" ? (sRes.value?.items || sRes.value?.data || sRes.value || []) : [];
  const rawProfiles  = pRes.status === "fulfilled" ? (pRes.value?.items || pRes.value?.data || []) : [];
  const rawReports   = rRes.status === "fulfilled" ? (rRes.value?.items || rRes.value?.data || []) : [];
  const scenarios    = rawScenarios.map(s => classifyScenario(s, rawProfiles, rawReports));
  const unbriefed    = scenarios.filter(s => s.category === "UNBRIEFED").length;
  const fullyBriefed = scenarios.filter(s => s.category === "FULLY_BRIEFED").length;
  const pct          = scenarios.length ? Math.round((fullyBriefed / scenarios.length) * 100) : 0;
  return `MIDOSS Mission Intelligence Dossier online, sir. Cross-referencing ${scenarios.length} scenarios against ` +
    `${rawProfiles.length} intel profiles and ${rawReports.length} intelligence reports. ` +
    `Fully briefed: ${pct}%. ${unbriefed} scenario${unbriefed === 1 ? "" : "s"} unbriefed — ` +
    `no matching intel profile or intelligence report. Mission briefing gap review recommended.`;
}

const CAT_LABEL = {
  FULLY_BRIEFED: "FULLY BRIEFED",
  PROFILE_ONLY:  "PROFILE ONLY",
  REPORT_ONLY:   "REPORT ONLY",
  UNBRIEFED:     "UNBRIEFED",
};
const CAT_COLOR = {
  FULLY_BRIEFED: "#29E7FF",
  PROFILE_ONLY:  "#F59E0B",
  REPORT_ONLY:   "#A78BFA",
  UNBRIEFED:     "#6B7280",
};
const TABS = ["ALL", "FULLY_BRIEFED", "PROFILE_ONLY", "REPORT_ONLY", "UNBRIEFED"];

export default function ScenarioIntelReportDossier() {
  const [open, setOpen]           = useState(false);
  const [scenarios, setScenarios] = useState([]);
  const [profiles, setProfiles]   = useState([]);
  const [reports, setReports]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]         = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const [sR, pR, rR] = await Promise.allSettled([
        fetch(`${base}/v1/scenario/list`,      { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${base}/entities/IntelProfile`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${base}/v1/reports`,            { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
      ]);
      const rawScenarios = sR.status === "fulfilled" ? (sR.value?.items || sR.value?.data || sR.value || []) : [];
      const rawProfiles  = pR.status === "fulfilled" ? (pR.value?.items || pR.value?.data || []) : [];
      const rawReports   = rR.status === "fulfilled" ? (rR.value?.items || rR.value?.data || []) : [];
      setProfiles(rawProfiles);
      setReports(rawReports);
      setScenarios(rawScenarios.map(s => classifyScenario(s, rawProfiles, rawReports)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      load();
      timer.current = setInterval(load, POLL_MS);
    } else {
      clearInterval(timer.current);
    }
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener("jarvis:midoss-toggle", h);
    return () => window.removeEventListener("jarvis:midoss-toggle", h);
  }, []);

  const assess = useCallback(async () => {
    if (!scenarios.length) return;
    setAssessing(true);
    setBrief("");
    try {
      const base      = apiBase();
      const unbriefed = scenarios.filter(s => s.category === "UNBRIEFED").length;
      const briefed   = scenarios.filter(s => s.category === "FULLY_BRIEFED").length;
      const pct       = scenarios.length ? Math.round((briefed / scenarios.length) * 100) : 0;
      const ctx       = `MIDOSS: ${scenarios.length} scenarios, ${briefed} fully briefed (${pct}%), ${unbriefed} unbriefed with no intel profile or report match.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `In 2 sentences, assess mission intelligence briefing gaps: ${ctx}` }),
      });
      const d   = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(txt);
      if (txt) {
        await fetch(`${base}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text: txt }),
        });
      }
    } finally {
      setAssessing(false);
    }
  }, [scenarios]);

  const classified  = scenarios.reduce((acc, s) => { acc[s.category] = (acc[s.category] || 0) + 1; return acc; }, {});
  const unbriefed   = classified["UNBRIEFED"] || 0;
  const fullyBriefed = classified["FULLY_BRIEFED"] || 0;
  const total       = scenarios.length;
  const pct         = total ? Math.round((fullyBriefed / total) * 100) : 0;
  const barColor    = pct >= 70 ? "#29E7FF" : pct >= 40 ? "#FCD34D" : "#F87171";

  const filtered = scenarios.filter(s => {
    if (tab !== "ALL" && s.category !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (s.name || s.title || s.id || "").toLowerCase().includes(q) ||
             (s.description || "").toLowerCase().includes(q);
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: "rgba(15,25,40,0.85)", border: "1px solid rgba(41,231,255,0.35)",
          color: "#29E7FF", fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
          letterSpacing: 1, padding: "4px 10px", borderRadius: 3, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 5,
        }}
      >
        {unbriefed > 0 && (
          <span style={{ background: "#F59E0B", color: "#000", borderRadius: "50%", fontSize: 8, minWidth: 14, height: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>
            {unbriefed}
          </span>
        )}
        ◈ MIDOSS
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 52, left: BTN_LEFT - 280, zIndex: Z_INDEX,
      width: 640, maxHeight: "72vh", background: "rgba(8,18,30,0.97)",
      border: "1px solid rgba(41,231,255,0.3)", borderRadius: 6,
      display: "flex", flexDirection: "column", fontFamily: "'JetBrains Mono',monospace",
      boxShadow: "0 0 24px rgba(41,231,255,0.08)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid rgba(41,231,255,0.15)", flexShrink: 0 }}>
        <span style={{ color: "#29E7FF", fontSize: 9, letterSpacing: 2 }}>◈ MIDOSS — MISSION INTELLIGENCE DOSSIER</span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#6B9BAF", cursor: "pointer", fontSize: 11 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px", flexShrink: 0, flexWrap: "wrap" }}>
        {[
          { label: "SCENARIOS",      val: total,                             color: "#29E7FF" },
          { label: "INTEL PROFILES", val: profiles.length,                  color: "#F59E0B" },
          { label: "REPORTS",        val: reports.length,                   color: "#A78BFA" },
          { label: "FULLY BRIEFED",  val: fullyBriefed,                     color: "#29E7FF" },
          { label: "PROFILE ONLY",   val: classified["PROFILE_ONLY"] || 0,  color: "#F59E0B" },
          { label: "REPORT ONLY",    val: classified["REPORT_ONLY"]  || 0,  color: "#A78BFA" },
          { label: "UNBRIEFED",      val: unbriefed,                        color: "#F87171" },
          { label: "BRIEFED%",       val: `${pct}%`,                        color: barColor  },
        ].map(t => (
          <div key={t.label} style={{ background: "rgba(41,231,255,0.05)", border: "1px solid rgba(41,231,255,0.12)", borderRadius: 4, padding: "4px 8px", minWidth: 64 }}>
            <div style={{ fontSize: 7, color: "#6B9BAF", letterSpacing: 1 }}>{t.label}</div>
            <div style={{ fontSize: 13, color: t.color, fontWeight: 700 }}>{loading ? "…" : t.val}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {total > 0 && (
        <div style={{ margin: "0 12px 6px", height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, flexShrink: 0 }}>
          <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 2, transition: "width 0.5s" }} />
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: "flex", gap: 4, padding: "4px 12px", flexShrink: 0, overflowX: "auto" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? "rgba(41,231,255,0.18)" : "rgba(41,231,255,0.04)",
            border: `1px solid ${tab === t ? "rgba(41,231,255,0.5)" : "rgba(41,231,255,0.12)"}`,
            color: tab === t ? "#29E7FF" : "#6B9BAF", fontFamily: "'JetBrains Mono',monospace",
            fontSize: 8, padding: "3px 8px", borderRadius: 3, cursor: "pointer", whiteSpace: "nowrap",
          }}>
            {t === "ALL" ? `ALL (${total})` : `${CAT_LABEL[t]} (${classified[t] || 0})`}
          </button>
        ))}
      </div>
      <div style={{ padding: "4px 12px 6px", flexShrink: 0 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search scenarios…"
          style={{
            width: "100%", background: "rgba(41,231,255,0.05)", border: "1px solid rgba(41,231,255,0.15)",
            color: "#C4E4F0", fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
            padding: "4px 8px", borderRadius: 3, boxSizing: "border-box",
          }}
        />
      </div>

      {/* Scenario list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 8px" }}>
        {loading && !scenarios.length && (
          <div style={{ color: "#6B9BAF", fontSize: 9, textAlign: "center", padding: 20 }}>Loading…</div>
        )}
        {!loading && !filtered.length && (
          <div style={{ color: "#6B9BAF", fontSize: 9, textAlign: "center", padding: 20 }}>No scenarios found.</div>
        )}
        {filtered.map(s => {
          const id  = s.id || s.name || s.title;
          const isX = expanded === id;
          return (
            <div key={id} style={{ marginBottom: 6, background: "rgba(41,231,255,0.03)", border: "1px solid rgba(41,231,255,0.1)", borderRadius: 4, overflow: "hidden" }}>
              <div
                onClick={() => setExpanded(isX ? null : id)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", cursor: "pointer" }}
              >
                <span style={{ fontSize: 7, letterSpacing: 1, background: `${CAT_COLOR[s.category]}22`, color: CAT_COLOR[s.category], border: `1px solid ${CAT_COLOR[s.category]}55`, borderRadius: 3, padding: "2px 6px", whiteSpace: "nowrap" }}>
                  {CAT_LABEL[s.category]}
                </span>
                <span style={{ flex: 1, color: "#C4E4F0", fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.name || s.title || id}
                </span>
                <span style={{ color: "#6B9BAF", fontSize: 8 }}>{isX ? "▲" : "▼"}</span>
              </div>

              {isX && (
                <div style={{ padding: "6px 10px 8px", borderTop: "1px solid rgba(41,231,255,0.08)" }}>
                  {s.description && (
                    <div style={{ color: "#8BAFC0", fontSize: 8, marginBottom: 6, lineHeight: 1.5 }}>{s.description}</div>
                  )}

                  {/* Matched intel profiles */}
                  {s.matchedProfiles.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: "#F59E0B", fontSize: 7, letterSpacing: 1, marginBottom: 4 }}>MATCHED INTEL PROFILES ({s.matchedProfiles.length})</div>
                      {s.matchedProfiles.slice(0, 5).map((p, i) => {
                        const rel = Math.min(1, scoreText(profileText(p), keywords(scenarioText(s))) * 10);
                        return (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            <span style={{ fontSize: 7, background: "rgba(245,158,11,0.12)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 3, padding: "1px 5px", whiteSpace: "nowrap" }}>
                              {p.role || "ACTOR"}
                            </span>
                            <span style={{ flex: 1, color: "#C4E4F0", fontSize: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                            <div style={{ width: 48, height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
                              <div style={{ width: `${rel * 100}%`, height: "100%", background: "#F59E0B", borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Matched reports */}
                  {s.matchedReports.length > 0 && (
                    <div>
                      <div style={{ color: "#A78BFA", fontSize: 7, letterSpacing: 1, marginBottom: 4 }}>MATCHED REPORTS ({s.matchedReports.length})</div>
                      {s.matchedReports.slice(0, 5).map((r, i) => {
                        const rel = Math.min(1, scoreText(reportText(r), keywords(scenarioText(s))) * 10);
                        return (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            <span style={{ fontSize: 7, background: "rgba(167,139,250,0.12)", color: "#A78BFA", border: "1px solid rgba(167,139,250,0.3)", borderRadius: 3, padding: "1px 5px", whiteSpace: "nowrap" }}>
                              {r.type || "REPORT"}
                            </span>
                            <span style={{ flex: 1, color: "#C4E4F0", fontSize: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title || r.name}</span>
                            <div style={{ width: 48, height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
                              <div style={{ width: `${rel * 100}%`, height: "100%", background: "#A78BFA", borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {s.matchedProfiles.length === 0 && s.matchedReports.length === 0 && (
                    <div style={{ color: "#6B7280", fontSize: 8, fontStyle: "italic" }}>No matching intel profiles or reports found.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* AI assess + brief */}
      <div style={{ padding: "6px 12px 8px", borderTop: "1px solid rgba(41,231,255,0.1)", flexShrink: 0 }}>
        <button
          onClick={assess}
          disabled={assessing || !scenarios.length}
          style={{
            background: assessing ? "rgba(41,231,255,0.05)" : "rgba(41,231,255,0.12)",
            border: "1px solid rgba(41,231,255,0.3)", color: "#29E7FF",
            fontFamily: "'JetBrains Mono',monospace", fontSize: 8, padding: "4px 12px",
            borderRadius: 3, cursor: assessing ? "default" : "pointer",
          }}
        >
          {assessing ? "▶ ASSESSING…" : "▶ ASSESS MISSION BRIEFING"}
        </button>
        {brief && (
          <div style={{ marginTop: 6, color: "#A0C4D8", fontSize: 8, lineHeight: 1.6 }}>{brief}</div>
        )}
      </div>
    </div>
  );
}
