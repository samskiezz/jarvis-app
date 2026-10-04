/**
 * AipSkillScenarioCoverage — F51 AIP skill × scenario coverage gap detector.
 *
 * Parallel-fetches /v1/aip/skill + /v1/scenario/list every 90 s.
 * Keyword-correlates each JARVIS AI skill (name/description/tags) against
 * every scenario (name/description/tags/params) to classify skills as:
 *   EXERCISED — at least one scenario explicitly exercises this skill
 *   UNUSED    — no scenario references this skill (coverage gap)
 *
 * Stat tiles: skills / scenarios / exercised / unused
 * Filter tabs: ALL / EXERCISED / UNUSED  +  text search
 * Expand skill row → matched scenario cards with relevance score
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence coverage brief + TTS
 *
 * Button:       ⬡ SKAS (left:960 bottom:18 zIndex:68)
 * Endpoints:    /v1/aip/skill  +  /v1/scenario/list
 *               (+ /v1/jarvis/agent/chat for ASSESS)
 * Voice trigger: "skill coverage" | "skill scenario" | "scenario skills" |
 *                "skas" | "aip skill coverage" | "which skills" |
 *                "unused skills" | "skill map" | "skill gap"
 * Event:        jarvis:skas-toggle
 * Refresh:      90 s auto-poll.
 *
 * Additive only — mounted via App.jsx; wired via JarvisBrain.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

const CY    = "#29E7FF";
const GRN   = "#00E5A0";
const AMB   = "#F59E0B";
const RED   = "#FF3B6B";
const DIM   = "#4A6070";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT = 960;
const POLL_MS  = 90_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = (typeof import.meta !== "undefined" && import.meta.env) || {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── data ────────────────────────────────────────────────────────────────────

async function fetchSkills() {
  const r = await fetch(`${apiBase()}/v1/aip/skill`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`aip/skill ${r.status}`);
  const d = await r.json();
  const list = Array.isArray(d) ? d : Array.isArray(d?.skills) ? d.skills : [];
  return list.map((s) => ({
    id:          String(s.id || s.skill_id || s.name || Math.random()),
    name:        String(s.name || s.skill_name || ""),
    description: String(s.description || s.desc || ""),
    tags:        Array.isArray(s.tags) ? s.tags.map(String) : [],
    category:    String(s.category || s.type || ""),
    status:      String(s.status || ""),
  }));
}

async function fetchScenarios() {
  const r = await fetch(`${apiBase()}/v1/scenario/list`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`scenario/list ${r.status}`);
  const d = await r.json();
  const list = Array.isArray(d) ? d : Array.isArray(d?.scenarios) ? d.scenarios : [];
  return list.map((s) => ({
    id:          String(s.id || s.scenario_id || Math.random()),
    name:        String(s.name || s.title || ""),
    description: String(s.description || s.desc || ""),
    tags:        Array.isArray(s.tags) ? s.tags.map(String) : [],
    params:      s.params ? JSON.stringify(s.params) : "",
  }));
}

function tokenise(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[\s\W]+/)
    .filter((t) => t.length > 2);
}

function correlate(skill, scenarios) {
  const skillTokens = new Set([
    ...tokenise(skill.name),
    ...tokenise(skill.description),
    ...skill.tags.flatMap(tokenise),
    ...tokenise(skill.category),
  ]);
  const matches = [];
  for (const sc of scenarios) {
    const scTokens = [
      ...tokenise(sc.name),
      ...tokenise(sc.description),
      ...sc.tags.flatMap(tokenise),
      ...tokenise(sc.params),
    ];
    let hits = 0;
    for (const t of scTokens) if (skillTokens.has(t)) hits++;
    if (hits > 0) {
      matches.push({ scenario: sc, score: hits });
    }
  }
  matches.sort((a, b) => b.score - a.score);
  return matches;
}

// ── voice helpers (exported) ─────────────────────────────────────────────────

const VOICE_RE =
  /\b(skill\s+coverage|skill\s+scenario|scenario\s+skill|skas|aip\s+skill\s+coverage|which\s+skills|unused\s+skill|skill\s+map|skill\s+gap)\b/i;

export function isSkasQuery(text) { return VOICE_RE.test(text || ""); }

export async function buildSkasScript() {
  try {
    const [skills, scenarios] = await Promise.all([fetchSkills(), fetchScenarios()]);
    const exercised = skills.filter((sk) => correlate(sk, scenarios).length > 0);
    const unused    = skills.filter((sk) => correlate(sk, scenarios).length === 0);
    const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `AIP skill coverage: ${skills.length} skills, ${scenarios.length} scenarios. ${exercised.length} exercised, ${unused.length} unused. Top unused: ${unused.slice(0,3).map((s)=>s.name).join(", ")||"none"}. Summarise the gap in two sentences.`,
      }),
    });
    if (!r.ok) throw new Error("chat " + r.status);
    const d = await r.json();
    return String(d?.response || d?.message || "Skill coverage analysis unavailable.");
  } catch {
    return "Skill coverage analysis unavailable at this time.";
  }
}

// ── component ────────────────────────────────────────────────────────────────

export default function AipSkillScenarioCoverage() {
  const [open, setOpen]         = useState(false);
  const [skills, setSkills]     = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState("");
  const [filter, setFilter]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const [sk, sc] = await Promise.all([fetchSkills(), fetchScenarios()]);
      setSkills(sk); setScenarios(sc);
    } catch (e) { setErr(String(e?.message || e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  useEffect(() => {
    const fn = (e) => {
      if (e.detail?.query && isSkasQuery(e.detail.query)) { setOpen(true); return; }
      setOpen((o) => !o);
    };
    window.addEventListener("jarvis:skas-toggle", fn);
    return () => window.removeEventListener("jarvis:skas-toggle", fn);
  }, []);

  const enriched = useMemo(() =>
    skills.map((sk) => {
      const matches = correlate(sk, scenarios);
      return { ...sk, matches, exercised: matches.length > 0 };
    }),
    [skills, scenarios]
  );

  const total      = enriched.length;
  const exercised  = enriched.filter((s) => s.exercised).length;
  const unused     = total - exercised;
  const scenCount  = scenarios.length;

  const visible = useMemo(() => {
    let list = enriched;
    if (filter === "EXERCISED") list = list.filter((s) => s.exercised);
    if (filter === "UNUSED")    list = list.filter((s) => !s.exercised);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return list;
  }, [enriched, filter, search]);

  const assess = useCallback(async () => {
    setAssessing(true); setAssessment("");
    const script = await buildSkasScript();
    setAssessment(script);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
  }, []);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
          background: "rgba(8,14,24,0.88)",
          border: `1px solid ${DIM}`,
          color: MUTED, fontFamily: MONO, fontSize: 10, padding: "3px 8px",
          borderRadius: 4, cursor: "pointer", letterSpacing: 1,
        }}
        title="AIP Skill × Scenario Coverage (Ctrl+Shift+K)"
      >
        ⬡ SKAS
      </button>
    );
  }

  const TILE = (label, value, col) => (
    <div style={{
      flex: 1, minWidth: 80,
      background: "rgba(255,255,255,0.03)",
      border: `1px solid ${DIM}`,
      borderRadius: 6, padding: "8px 10px", textAlign: "center",
    }}>
      <div style={{ fontFamily: MONO, fontSize: 18, color: col || CY, fontWeight: 700 }}>
        {value}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 9, color: MUTED, marginTop: 2, letterSpacing: 1 }}>
        {label}
      </div>
    </div>
  );

  return (
    <div style={{
      position: "fixed", left: BTN_LEFT - 340, bottom: 54, zIndex: 68,
      width: 480, maxHeight: "70vh",
      background: BG, border: `1px solid ${DIM}`,
      borderRadius: 10, display: "flex", flexDirection: "column",
      fontFamily: MONO, color: CY, boxShadow: `0 0 24px rgba(41,231,255,0.06)`,
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", borderBottom: `1px solid ${DIM}`,
      }}>
        <span style={{ fontSize: 11, letterSpacing: 2, color: CY }}>
          ⬡ AIP SKILL × SCENARIO COVERAGE
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              background: assessing ? "transparent" : "rgba(41,231,255,0.08)",
              border: `1px solid ${DIM}`,
              color: assessing ? MUTED : CY,
              fontFamily: MONO, fontSize: 9, padding: "2px 8px",
              borderRadius: 4, cursor: "pointer", letterSpacing: 1,
            }}
          >
            {assessing ? "..." : "▶ ASSESS"}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "transparent", border: "none",
              color: MUTED, cursor: "pointer", fontSize: 14, lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "10px 14px", flexShrink: 0 }}>
        {TILE("SKILLS", loading ? "…" : total, CY)}
        {TILE("SCENARIOS", loading ? "…" : scenCount, CY)}
        {TILE("EXERCISED", loading ? "…" : exercised, GRN)}
        {TILE("UNUSED", loading ? "…" : unused, unused > 0 ? AMB : GRN)}
      </div>

      {/* filter tabs + search */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "0 14px 8px", flexShrink: 0,
      }}>
        {["ALL","EXERCISED","UNUSED"].map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{
              background: filter === t ? "rgba(41,231,255,0.12)" : "transparent",
              border: `1px solid ${filter === t ? CY : DIM}`,
              color: filter === t ? CY : MUTED,
              fontFamily: MONO, fontSize: 9, padding: "2px 8px",
              borderRadius: 4, cursor: "pointer", letterSpacing: 1,
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            flex: 1, background: "rgba(255,255,255,0.04)",
            border: `1px solid ${DIM}`, color: CY,
            fontFamily: MONO, fontSize: 10, padding: "3px 8px",
            borderRadius: 4, outline: "none",
          }}
        />
      </div>

      {/* assessment */}
      {assessment && (
        <div style={{
          margin: "0 14px 8px",
          background: "rgba(41,231,255,0.06)",
          border: `1px solid ${DIM}`,
          borderRadius: 6, padding: "8px 10px",
          fontSize: 10, color: CY, lineHeight: 1.5, flexShrink: 0,
        }}>
          {assessment}
        </div>
      )}

      {/* error */}
      {err && (
        <div style={{
          margin: "0 14px 8px", padding: "6px 10px",
          background: "rgba(255,59,107,0.06)",
          border: `1px solid ${RED}`,
          borderRadius: 6, fontSize: 9, color: RED, flexShrink: 0,
        }}>
          {err}
        </div>
      )}

      {/* skill rows */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 14px" }}>
        {loading && !enriched.length && (
          <div style={{ color: MUTED, fontSize: 10, textAlign: "center", padding: 20 }}>
            loading…
          </div>
        )}
        {!loading && visible.length === 0 && (
          <div style={{ color: MUTED, fontSize: 10, textAlign: "center", padding: 20 }}>
            no skills match
          </div>
        )}
        {visible.map((sk) => {
          const isEx = sk.exercised;
          const isOpen = expanded === sk.id;
          return (
            <div
              key={sk.id}
              style={{
                background: "rgba(255,255,255,0.025)",
                border: `1px solid ${isEx ? DIM : AMB + "55"}`,
                borderRadius: 6, marginBottom: 6, overflow: "hidden",
              }}
            >
              <div
                onClick={() => setExpanded(isOpen ? null : sk.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", cursor: "pointer",
                }}
              >
                {/* status badge */}
                <span style={{
                  fontSize: 8, fontFamily: MONO, letterSpacing: 1,
                  padding: "1px 6px", borderRadius: 3,
                  background: isEx ? "rgba(0,229,160,0.12)" : "rgba(245,158,11,0.12)",
                  border: `1px solid ${isEx ? GRN : AMB}`,
                  color: isEx ? GRN : AMB,
                  flexShrink: 0,
                }}>
                  {isEx ? "EXERCISED" : "UNUSED"}
                </span>

                {/* name */}
                <span style={{ flex: 1, fontSize: 11, color: isEx ? CY : AMB, fontWeight: 600 }}>
                  {sk.name || sk.id}
                </span>

                {/* match count */}
                {isEx && (
                  <span style={{ fontSize: 9, color: MUTED }}>
                    {sk.matches.length} sc
                  </span>
                )}

                {/* category */}
                {sk.category && (
                  <span style={{ fontSize: 9, color: MUTED }}>{sk.category}</span>
                )}

                <span style={{ fontSize: 10, color: MUTED }}>{isOpen ? "▲" : "▼"}</span>
              </div>

              {/* description */}
              {!isOpen && sk.description && (
                <div style={{
                  padding: "0 10px 7px",
                  fontSize: 9, color: MUTED, lineHeight: 1.4,
                }}>
                  {sk.description.slice(0, 120)}{sk.description.length > 120 ? "…" : ""}
                </div>
              )}

              {/* expanded: matched scenarios */}
              {isOpen && (
                <div style={{ padding: "0 10px 10px" }}>
                  {sk.description && (
                    <div style={{ fontSize: 9, color: MUTED, marginBottom: 8, lineHeight: 1.5 }}>
                      {sk.description}
                    </div>
                  )}
                  {sk.tags.length > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                      {sk.tags.map((t, i) => (
                        <span
                          key={i}
                          style={{
                            fontSize: 8, padding: "1px 5px",
                            background: "rgba(41,231,255,0.06)",
                            border: `1px solid ${DIM}`,
                            borderRadius: 3, color: MUTED,
                          }}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {isEx ? (
                    <>
                      <div style={{ fontSize: 9, color: MUTED, marginBottom: 4, letterSpacing: 1 }}>
                        MATCHED SCENARIOS:
                      </div>
                      {sk.matches.map(({ scenario, score }, i) => (
                        <div
                          key={i}
                          style={{
                            background: "rgba(0,229,160,0.04)",
                            border: `1px solid ${DIM}`,
                            borderRadius: 4, padding: "5px 8px", marginBottom: 4,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ fontSize: 10, color: GRN }}>{scenario.name || scenario.id}</span>
                            <span style={{ fontSize: 8, color: MUTED }}>score {score}</span>
                          </div>
                          {scenario.description && (
                            <div style={{ fontSize: 8, color: MUTED }}>
                              {scenario.description.slice(0, 100)}{scenario.description.length > 100 ? "…" : ""}
                            </div>
                          )}
                          {/* proportional score bar */}
                          <div style={{
                            marginTop: 4, height: 2,
                            background: DIM, borderRadius: 1, overflow: "hidden",
                          }}>
                            <div style={{
                              height: "100%", borderRadius: 1,
                              width: `${Math.min(100, score * 12)}%`,
                              background: GRN,
                            }} />
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div style={{
                      padding: "8px 10px",
                      background: "rgba(245,158,11,0.04)",
                      border: `1px solid ${AMB}44`,
                      borderRadius: 4,
                      fontSize: 9, color: AMB,
                    }}>
                      No scenario exercises this skill — coverage gap detected.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{
        padding: "6px 14px",
        borderTop: `1px solid ${DIM}`,
        fontSize: 8, color: MUTED, flexShrink: 0,
        display: "flex", justifyContent: "space-between",
      }}>
        <span>auto-refresh 90 s · /v1/aip/skill + /v1/scenario/list</span>
        <span>{loading ? "refreshing…" : `${total} skills · ${scenCount} scenarios`}</span>
      </div>
    </div>
  );
}
