/**
 * ScenarioSkillReadiness — F69.
 *
 * Parallel-fetches /v1/scenario/list + /v1/aip/skill.
 * For each scenario, keyword-correlates its name/description/tags against
 * skill names and descriptions to compute a per-scenario readiness score
 * (average of matched skill scores; "UNKNOWN" when nothing correlates).
 * Surfaces the least-prepared scenarios first so the operator knows where
 * the skill gaps will bite hardest.
 *
 * Stat tiles: scenarios / skills / ready (≥70) / at-risk (<70).
 * Filter tabs: ALL / AT-RISK / READY / UNKNOWN.
 * Click ▶ ASSESS → /v1/jarvis/agent/chat AI 2-sentence recommendation
 *   + TTS via jarvis:speak-dossier.
 * 5-min auto-refresh.
 *
 * Intent: "readiness" / "scenario readiness" / "skill readiness" /
 *         "prepared" / "srdns"
 *   → jarvis:srdns-toggle + TTS brief via buildScenarioReadinessScript()
 *
 * Toggle: ◎ SRDNS at left:5900, zIndex 65.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const GREEN = "#00c878";
const AMBER = "#F5A623";
const RED = "#FF3D5A";
const DIM = "#334455";
const BTN_LEFT = 5900;
const REFRESH_MS = 5 * 60 * 1000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

function normaliseSkills(raw) {
  return normaliseArray(raw).map((s) => ({
    id: s.id || s.skill_id || s.name || "",
    name: s.name || s.skill_name || s.label || s.id || "",
    description: s.description || s.desc || "",
    score: Number(s.score ?? s.level ?? s.value ?? 0),
    tags: [
      ...(s.tags || []),
      ...(s.categories || []),
      ...(s.domains || []),
    ].map(String),
  }));
}

function normaliseScenarios(raw) {
  return normaliseArray(raw).map((s) => ({
    id: s.id || s.scenario_id || "",
    name: s.name || s.title || s.label || s.id || "Unnamed scenario",
    description: s.description || s.desc || s.summary || "",
    tags: [...(s.tags || []), ...(s.categories || [])].map(String),
    probability: s.probability ?? s.likelihood ?? null,
    impact: s.impact ?? s.severity ?? null,
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4);
}

function scenarioKeywords(sc) {
  return [
    ...keywords(sc.name),
    ...keywords(sc.description),
    ...sc.tags.flatMap(keywords),
  ];
}

function skillKeywords(sk) {
  return [
    ...keywords(sk.name),
    ...keywords(sk.description),
    ...sk.tags.flatMap(keywords),
  ];
}

function matchSkillsToScenario(sc, skills) {
  const scKw = new Set(scenarioKeywords(sc));
  return skills.filter((sk) => {
    const skKw = skillKeywords(sk);
    return skKw.some((kw) => scKw.has(kw));
  });
}

function readinessScore(matchedSkills) {
  if (!matchedSkills.length) return null;
  const avg = matchedSkills.reduce((s, sk) => s + sk.score, 0) / matchedSkills.length;
  return Math.round(avg);
}

function readinessLabel(sc) {
  if (sc.score === null) return "UNKNOWN";
  if (sc.score >= 70) return "READY";
  return "AT-RISK";
}

function readinessColor(label) {
  if (label === "READY") return GREEN;
  if (label === "AT-RISK") return RED;
  return DIM;
}

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isScenarioReadinessQuery(q) {
  return /readiness|scenario.readiness|skill.readiness|prepared|srdns\b|ready.for|execution.ready|scenario.prep/i.test(
    q || ""
  );
}

export async function buildScenarioReadinessScript() {
  try {
    const [sr, skr] = await Promise.all([
      fetch(`${apiBase()}/v1/scenario/list`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
      fetch(`${apiBase()}/v1/aip/skill`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    const scenarios = normaliseScenarios(sr.ok ? await sr.json() : []);
    const skills = normaliseSkills(skr.ok ? await skr.json() : []);
    const rows = scenarios.map((sc) => {
      const matched = matchSkillsToScenario(sc, skills);
      const score = readinessScore(matched);
      return { ...sc, score, matched };
    });
    const atRisk = rows.filter((r) => r.score !== null && r.score < 70);
    const ready = rows.filter((r) => r.score !== null && r.score >= 70);
    window.dispatchEvent(new CustomEvent("jarvis:srdns-toggle"));
    return `Scenario Skill Readiness open, sir. Assessed ${scenarios.length} scenario${scenarios.length !== 1 ? "s" : ""} against ${skills.length} skill${skills.length !== 1 ? "s" : ""}. ${ready.length} scenario${ready.length !== 1 ? "s are" : " is"} execution-ready, while ${atRisk.length} ${atRisk.length !== 1 ? "are" : "is"} at risk due to skill deficiencies. Click any scenario to receive an AI readiness assessment, sir.`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:srdns-toggle"));
    return "Opening Scenario Skill Readiness, sir.";
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function ScenarioSkillReadiness() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scenarios, setScenarios] = useState([]);
  const [skills, setSkills] = useState([]);
  const [tab, setTab] = useState("ALL");
  const [assessing, setAssessing] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sr, skr] = await Promise.all([
        fetch(`${apiBase()}/v1/scenario/list`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
        fetch(`${apiBase()}/v1/aip/skill`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
      ]);
      const rawScenarios = normaliseScenarios(sr.ok ? await sr.json() : []);
      const rawSkills = normaliseSkills(skr.ok ? await skr.json() : []);
      const rows = rawScenarios.map((sc) => {
        const matched = matchSkillsToScenario(sc, rawSkills);
        const score = readinessScore(matched);
        return { ...sc, score, matched };
      });
      rows.sort((a, b) => {
        if (a.score === null && b.score === null) return 0;
        if (a.score === null) return 1;
        if (b.score === null) return -1;
        return a.score - b.score;
      });
      setScenarios(rows);
      setSkills(rawSkills);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:srdns-toggle", onToggle);
    return () => window.removeEventListener("jarvis:srdns-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess(sc) {
    setAssessing(sc.id);
    try {
      const prompt = `Scenario "${sc.name}" readiness assessment: matched skill score average ${sc.score ?? "unknown"}. Matched skills: ${sc.matched.map((s) => s.name).join(", ") || "none"}. Provide a 2-sentence readiness recommendation.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      if (text) {
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
      }
    } catch {}
    setAssessing(null);
  }

  const atRisk = scenarios.filter((s) => s.score !== null && s.score < 70);
  const ready = scenarios.filter((s) => s.score !== null && s.score >= 70);
  const unknown = scenarios.filter((s) => s.score === null);

  const filtered =
    tab === "AT-RISK" ? atRisk :
    tab === "READY" ? ready :
    tab === "UNKNOWN" ? unknown :
    scenarios;

  return (
    <>
      {/* toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Scenario Skill Readiness (F69)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 65,
          background: open ? CY : "rgba(5,8,13,0.82)",
          color: open ? "#04060A" : CY,
          border: `1px solid ${CY}55`, borderRadius: 4,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, padding: "3px 7px", cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ◎ SRDNS
        {atRisk.length > 0 && (
          <span style={{
            marginLeft: 4, background: RED, color: "#fff",
            borderRadius: 3, padding: "0 4px", fontSize: 7,
          }}>
            {atRisk.length}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", top: 60, right: 18, zIndex: 65,
          width: "min(520px, 94vw)", maxHeight: "80vh",
          background: "rgba(4,10,20,0.94)",
          border: `1px solid ${CY}33`,
          borderTop: `2px solid ${CY}`,
          borderRadius: 10,
          boxShadow: `0 0 40px ${CY}18`,
          backdropFilter: "blur(12px)",
          display: "flex", flexDirection: "column",
          fontFamily: "'JetBrains Mono',monospace",
          overflow: "hidden",
        }}>
          {/* header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: CY, fontSize: 12 }}>◎</span>
              <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>SCENARIO SKILL READINESS</span>
            </div>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#556677",
              cursor: "pointer", fontSize: 14, padding: 0,
            }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 6, padding: "8px 14px" }}>
            {[
              { label: "SCENARIOS", val: scenarios.length, color: CY },
              { label: "SKILLS", val: skills.length, color: "#A78BFA" },
              { label: "READY", val: ready.length, color: GREEN },
              { label: "AT-RISK", val: atRisk.length, color: RED },
            ].map((t) => (
              <div key={t.label} style={{
                flex: 1, background: "rgba(255,255,255,0.03)",
                border: `1px solid ${t.color}22`, borderRadius: 5,
                padding: "5px 6px", textAlign: "center",
              }}>
                <div style={{ fontSize: 14, color: t.color, fontWeight: 700 }}>{loading ? "…" : t.val}</div>
                <div style={{ fontSize: 7, color: "#445566", letterSpacing: 1 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "0 14px 8px" }}>
            {["ALL", "AT-RISK", "READY", "UNKNOWN"].map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? CY : "transparent",
                color: tab === t ? "#04060A" : "#445566",
                border: `1px solid ${tab === t ? CY : "#223344"}`,
                borderRadius: 3, padding: "2px 7px",
                fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                letterSpacing: 1, cursor: "pointer",
              }}>
                {t}{t === "AT-RISK" && atRisk.length > 0 ? ` (${atRisk.length})` : ""}
              </button>
            ))}
            <button onClick={load} style={{
              marginLeft: "auto", background: "transparent",
              color: "#445566", border: "1px solid #223344",
              borderRadius: 3, padding: "2px 6px", fontSize: 8,
              fontFamily: "'JetBrains Mono',monospace", cursor: "pointer",
            }}>↻</button>
          </div>

          {/* scenario list */}
          <div style={{ overflowY: "auto", padding: "0 10px 10px" }}>
            {loading && !scenarios.length && (
              <div style={{ color: "#445566", fontSize: 10, padding: 20, textAlign: "center" }}>
                loading…
              </div>
            )}
            {!loading && !filtered.length && (
              <div style={{ color: "#445566", fontSize: 10, padding: 20, textAlign: "center" }}>
                no scenarios in this filter
              </div>
            )}
            {filtered.map((sc) => {
              const label = readinessLabel(sc);
              const color = readinessColor(label);
              return (
                <div key={sc.id} style={{
                  background: "rgba(255,255,255,0.025)",
                  border: `1px solid ${color}22`,
                  borderLeft: `3px solid ${color}`,
                  borderRadius: 5, padding: "8px 10px",
                  marginBottom: 6,
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: "#b0c8d8", fontSize: 11, marginBottom: 2 }}>{sc.name}</div>
                      {sc.description && (
                        <div style={{ color: "#445566", fontSize: 9, lineHeight: 1.4 }}>
                          {sc.description.slice(0, 120)}{sc.description.length > 120 ? "…" : ""}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{
                        fontSize: 10, color: color, letterSpacing: 1, fontWeight: 700,
                      }}>
                        {label}
                      </div>
                      {sc.score !== null && (
                        <div style={{ fontSize: 9, color: "#445566" }}>{sc.score}/100</div>
                      )}
                    </div>
                  </div>

                  {/* skill score bar */}
                  {sc.score !== null && (
                    <div style={{ marginBottom: 5 }}>
                      <div style={{ height: 3, background: "#1a2530", borderRadius: 2 }}>
                        <div style={{
                          height: 3, borderRadius: 2, background: color,
                          width: `${Math.min(100, sc.score)}%`,
                          transition: "width 0.4s ease",
                        }} />
                      </div>
                    </div>
                  )}

                  {/* matched skills chips */}
                  {sc.matched.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 5 }}>
                      {sc.matched.slice(0, 5).map((sk) => (
                        <span key={sk.id} style={{
                          fontSize: 7, background: "rgba(0,200,120,0.1)",
                          color: GREEN, border: `1px solid ${GREEN}33`,
                          borderRadius: 2, padding: "1px 5px",
                        }}>
                          {sk.name} {sk.score}
                        </span>
                      ))}
                      {sc.matched.length > 5 && (
                        <span style={{ fontSize: 7, color: "#445566" }}>+{sc.matched.length - 5} more</span>
                      )}
                    </div>
                  )}

                  <button
                    onClick={() => assess(sc)}
                    disabled={assessing === sc.id}
                    style={{
                      background: assessing === sc.id ? "#1a2530" : `${color}18`,
                      color: assessing === sc.id ? "#445566" : color,
                      border: `1px solid ${color}44`,
                      borderRadius: 3, padding: "3px 10px",
                      fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                      letterSpacing: 1, cursor: assessing === sc.id ? "default" : "pointer",
                    }}
                  >
                    {assessing === sc.id ? "…assessing" : "▶ ASSESS"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
