import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_058_280;
const Z_INDEX  = 268;
const POLL_MS  = 300_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const LTASORP_RE = /\b(ltasorp|live[\s-]intel[\s-]readiness|aip[\s-]intel[\s-]readiness|scenario[\s-]readiness[\s-]pulse|live[\s-]skill[\s-]scenario|operational[\s-]readiness[\s-]pulse)\b/i;
export function isLtasorpQuery(q = "") { return LTASORP_RE.test(q); }

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

function intelText(ev = {}) {
  return [ev.title, ev.summary, ev.description, ev.event_type, ev.category, ev.location]
    .filter(Boolean).join(" ");
}

function skillText(sk = {}) {
  return [sk.name, sk.description, sk.category, sk.tags?.join(" ")].filter(Boolean).join(" ");
}

function scenarioText(sc = {}) {
  return [sc.name, sc.title, sc.description, sc.scenario_type, sc.tags?.join(" ")]
    .filter(Boolean).join(" ");
}

const THRESHOLD = 0.08;

function classifyEvent(ev, skills, scenarios) {
  const kws = keywords(intelText(ev));
  const matchedSkills    = skills.filter(sk => scoreText(skillText(sk), kws) >= THRESHOLD);
  const matchedScenarios = scenarios.filter(sc => scoreText(scenarioText(sc), kws) >= THRESHOLD);
  const hasSkill    = matchedSkills.length > 0;
  const hasScenario = matchedScenarios.length > 0;
  const category =
    hasSkill && hasScenario ? "SKILL_AND_SCENARIO" :
    hasSkill                ? "SKILL_ONLY"         :
    hasScenario             ? "SCENARIO_ONLY"      :
                              "UNADDRESSED";
  return { ...ev, category, matchedSkills, matchedScenarios };
}

export async function buildLtasorpScript() {
  const base = apiBase();
  const [intelRes, skillRes, scnRes] = await Promise.allSettled([
    fetch(`${base}/functions/getLiveIntel`,  { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${base}/v1/aip/skill`,            { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${base}/v1/scenario/list`,        { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
  ]);
  const rawIntel     = (intelRes.status    === "fulfilled" ? (intelRes.value?.events    || intelRes.value?.data    || []) : []);
  const rawSkills    = (skillRes.status    === "fulfilled" ? (skillRes.value?.skills    || skillRes.value?.data    || []) : []);
  const rawScenarios = (scnRes.status      === "fulfilled" ? (scnRes.value?.scenarios   || scnRes.value?.data      || []) : []);
  const events       = rawIntel.slice(0, 40).map(ev => classifyEvent(ev, rawSkills, rawScenarios));
  const covered      = events.filter(e => e.category !== "UNADDRESSED").length;
  const pct          = events.length ? Math.round((covered / events.length) * 100) : 0;
  const unaddressed  = events.filter(e => e.category === "UNADDRESSED").length;
  return `LTASORP Operational Readiness Pulse online, sir. Analysing ${events.length} live world events ` +
    `against ${rawSkills.length} AIP skills and ${rawScenarios.length} scenario playbooks. ` +
    `Overall readiness: ${pct}% covered. ${unaddressed} event${unaddressed === 1 ? "" : "s"} remain${unaddressed === 1 ? "s" : ""} unaddressed by any skill or scenario — ` +
    `immediate gap analysis recommended.`;
}

const CAT_LABEL = {
  SKILL_AND_SCENARIO: "SKILL + SCENARIO",
  SKILL_ONLY:         "SKILL ONLY",
  SCENARIO_ONLY:      "SCENARIO ONLY",
  UNADDRESSED:        "UNADDRESSED",
};
const CAT_COLOR = {
  SKILL_AND_SCENARIO: "#29E7FF",
  SKILL_ONLY:         "#6EE7B7",
  SCENARIO_ONLY:      "#FCD34D",
  UNADDRESSED:        "#F87171",
};
const TABS = ["ALL", "SKILL_AND_SCENARIO", "SKILL_ONLY", "SCENARIO_ONLY", "UNADDRESSED"];

export default function LiveIntelAipScenarioReadiness() {
  const [open, setOpen]         = useState(false);
  const [events, setEvents]     = useState([]);
  const [skills, setSkills]     = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]       = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const [ir, sr, scr] = await Promise.allSettled([
        fetch(`${base}/functions/getLiveIntel`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${base}/v1/aip/skill`,           { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${base}/v1/scenario/list`,       { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
      ]);
      const rawIntel     = ir.status  === "fulfilled" ? (ir.value?.events    || ir.value?.data    || []) : [];
      const rawSkills    = sr.status  === "fulfilled" ? (sr.value?.skills    || sr.value?.data    || []) : [];
      const rawScenarios = scr.status === "fulfilled" ? (scr.value?.scenarios || scr.value?.data  || []) : [];
      setSkills(rawSkills);
      setScenarios(rawScenarios);
      setEvents(rawIntel.slice(0, 80).map(ev => classifyEvent(ev, rawSkills, rawScenarios)));
    } catch {
      /* keep stale data */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener("jarvis:ltasorp-toggle", handler);
    return () => window.removeEventListener("jarvis:ltasorp-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const filtered = events.filter(ev => {
    const matchTab = tab === "ALL" || ev.category === tab;
    const q = search.toLowerCase();
    const matchSearch = !q || intelText(ev).toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  const counts = {
    ALL: events.length,
    SKILL_AND_SCENARIO: events.filter(e => e.category === "SKILL_AND_SCENARIO").length,
    SKILL_ONLY:         events.filter(e => e.category === "SKILL_ONLY").length,
    SCENARIO_ONLY:      events.filter(e => e.category === "SCENARIO_ONLY").length,
    UNADDRESSED:        events.filter(e => e.category === "UNADDRESSED").length,
  };
  const pct = events.length ? Math.round((events.filter(e => e.category !== "UNADDRESSED").length / events.length) * 100) : 0;

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message: `Analyse operational readiness pulse: ${events.length} live world events classified — ` +
            `${counts.SKILL_AND_SCENARIO} covered by both skill and scenario, ${counts.SKILL_ONLY} by skill only, ` +
            `${counts.SCENARIO_ONLY} by scenario only, ${counts.UNADDRESSED} unaddressed. ` +
            `Overall readiness: ${pct}%. ` +
            `Identify the top 3 most critical unaddressed events and recommend immediate playbook or skill gaps to close.`,
        }),
      });
      const d = await r.json();
      const text = (d.answer || "No assessment returned.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setBrief("Assessment unavailable — could not reach reasoning core.");
    } finally {
      setAssessing(false);
    }
  }

  const badge = counts.UNADDRESSED > 0 ? ` [${counts.UNADDRESSED}⚠]` : "";

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="LTASORP — Live Intel × AIP Skill × Scenario Operational Readiness Pulse"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: "rgba(0,20,30,0.85)", border: "1px solid rgba(41,231,255,0.35)",
          color: "#29E7FF", fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
          letterSpacing: 1, padding: "3px 7px", cursor: "pointer", borderRadius: 3,
          backdropFilter: "blur(6px)",
        }}
      >
        ◈ LTASORP{badge}
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="LTASORP Operational Readiness Pulse"
      style={{
        position: "fixed", bottom: 48, left: "50%", transform: "translateX(-50%)",
        width: 820, maxHeight: "78vh", zIndex: Z_INDEX,
        background: "rgba(0,12,22,0.97)", border: "1px solid rgba(41,231,255,0.4)",
        borderRadius: 6, display: "flex", flexDirection: "column",
        fontFamily: "'JetBrains Mono',monospace", color: "#C0F0FF",
        boxShadow: "0 0 40px rgba(41,231,255,0.12)", backdropFilter: "blur(14px)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid rgba(41,231,255,0.15)", flexShrink: 0 }}>
        <span style={{ fontSize: 11, letterSpacing: 2, color: "#29E7FF" }}>
          ◈ LTASORP — LIVE INTEL × AIP SKILL × SCENARIO READINESS PULSE
        </span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#F87171", cursor: "pointer", fontSize: 13, lineHeight: 1 }} aria-label="Close">✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 12px", flexShrink: 0, flexWrap: "wrap" }}>
        {[
          { label: "EVENTS", value: events.length, color: "#29E7FF" },
          { label: "READINESS", value: `${pct}%`, color: pct >= 70 ? "#6EE7B7" : pct >= 40 ? "#FCD34D" : "#F87171" },
          { label: "COVERED", value: counts.SKILL_AND_SCENARIO + counts.SKILL_ONLY + counts.SCENARIO_ONLY, color: "#6EE7B7" },
          { label: "GAPS", value: counts.UNADDRESSED, color: "#F87171" },
          { label: "SKILLS", value: skills.length, color: "#A78BFA" },
          { label: "SCENARIOS", value: scenarios.length, color: "#FCD34D" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: "rgba(41,231,255,0.06)", border: "1px solid rgba(41,231,255,0.15)", borderRadius: 4, padding: "4px 10px", minWidth: 70, textAlign: "center" }}>
            <div style={{ fontSize: 7, letterSpacing: 1, color: "#6B9BAF", marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 15, fontWeight: "bold", color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: "0 12px 8px", flexShrink: 0 }}>
        <div style={{ fontSize: 7, color: "#6B9BAF", letterSpacing: 1, marginBottom: 3 }}>READINESS COVERAGE</div>
        <div style={{ height: 6, background: "rgba(41,231,255,0.1)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: pct >= 70 ? "#6EE7B7" : pct >= 40 ? "#FCD34D" : "#F87171", borderRadius: 3, transition: "width 0.5s" }} />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 12px 6px", flexShrink: 0, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? "rgba(41,231,255,0.18)" : "rgba(41,231,255,0.05)",
            border: `1px solid ${tab === t ? "rgba(41,231,255,0.5)" : "rgba(41,231,255,0.15)"}`,
            color: tab === t ? "#29E7FF" : "#6B9BAF",
            fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: 1,
            padding: "3px 8px", borderRadius: 3, cursor: "pointer",
          }}>
            {t === "ALL" ? `ALL (${counts.ALL})` : `${CAT_LABEL[t]} (${counts[t]})`}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="SEARCH EVENTS…"
          style={{
            marginLeft: "auto", background: "rgba(41,231,255,0.06)", border: "1px solid rgba(41,231,255,0.2)",
            color: "#C0F0FF", fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
            padding: "3px 8px", borderRadius: 3, width: 160, outline: "none",
          }}
        />
      </div>

      {/* Event list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 12px" }}>
        {loading && !events.length && (
          <div style={{ textAlign: "center", padding: 24, color: "#6B9BAF", fontSize: 9 }}>◌ LOADING LIVE INTEL…</div>
        )}
        {filtered.map((ev, i) => {
          const id = ev.id || ev._id || `ev-${i}`;
          const isExp = expanded === id;
          const label = ev.title || ev.event_type || ev.category || `Event ${i + 1}`;
          return (
            <div key={id} style={{ borderBottom: "1px solid rgba(41,231,255,0.08)", paddingBottom: 6, marginBottom: 6 }}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setExpanded(isExp ? null : id)}
                onKeyDown={e => e.key === "Enter" && setExpanded(isExp ? null : id)}
                style={{ cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 8 }}
              >
                <span style={{ fontSize: 7, marginTop: 2, color: CAT_COLOR[ev.category] || "#29E7FF", letterSpacing: 1, whiteSpace: "nowrap", flexShrink: 0, border: `1px solid ${CAT_COLOR[ev.category] || "#29E7FF"}33`, padding: "1px 4px", borderRadius: 2 }}>
                  {CAT_LABEL[ev.category] || ev.category}
                </span>
                <span style={{ fontSize: 9, color: "#C0F0FF", flex: 1 }}>{label}</span>
                <span style={{ fontSize: 8, color: "#29E7FF", flexShrink: 0 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ marginTop: 6, paddingLeft: 8, fontSize: 8, color: "#8AA8B8", lineHeight: 1.6 }}>
                  {ev.description || ev.summary || ev.text || "No description available."}
                  {ev.matchedSkills?.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      <span style={{ color: "#6EE7B7" }}>SKILLS: </span>
                      {ev.matchedSkills.map(s => s.name || s.id).slice(0, 5).join(", ")}
                    </div>
                  )}
                  {ev.matchedScenarios?.length > 0 && (
                    <div style={{ marginTop: 2 }}>
                      <span style={{ color: "#FCD34D" }}>SCENARIOS: </span>
                      {ev.matchedScenarios.map(s => s.name || s.title || s.id).slice(0, 5).join(", ")}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 24, color: "#6B9BAF", fontSize: 9 }}>NO EVENTS MATCH CURRENT FILTER</div>
        )}
      </div>

      {/* AI Assess + brief */}
      <div style={{ borderTop: "1px solid rgba(41,231,255,0.15)", padding: "8px 12px", flexShrink: 0 }}>
        {brief && (
          <div style={{ marginBottom: 6, fontSize: 8, color: "#A0C8D8", lineHeight: 1.6, maxHeight: 80, overflowY: "auto", background: "rgba(41,231,255,0.05)", borderRadius: 4, padding: "4px 8px" }}>
            {brief}
          </div>
        )}
        <button
          onClick={assess}
          disabled={assessing || events.length === 0}
          style={{
            background: assessing ? "rgba(41,231,255,0.08)" : "rgba(41,231,255,0.14)",
            border: "1px solid rgba(41,231,255,0.4)", color: assessing ? "#6B9BAF" : "#29E7FF",
            fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: 1,
            padding: "5px 14px", borderRadius: 3, cursor: assessing ? "not-allowed" : "pointer",
          }}
        >
          {assessing ? "◌ ASSESSING…" : "⬡ AI ASSESS READINESS GAPS"}
        </button>
      </div>
    </div>
  );
}
